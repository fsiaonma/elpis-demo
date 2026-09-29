import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  readResume,
  readTools,
  rememberResume,
  rememberTool,
  resolveAnalyzeResumeId,
  resolveResumeId,
} from './analysis-session';
import {
  resolveToolRegistryClass,
  type ToolDefinition,
  type ToolRegistryService,
} from './elpis-ai-bridge';

type ParsedResume = {
  basic?: { name?: string | null };
  education?: Array<{ degree?: string | null }>;
  experience?: Array<{
    company?: string | null;
    role?: string | null;
    description?: string | null;
    highlights?: string[];
  }>;
  projects?: Array<{
    name?: string | null;
    role?: string | null;
    description?: string | null;
    highlights?: string[];
  }>;
  skills?: string[];
};

type JobSummary = {
  jobId: string;
  title: string;
  company: string;
};

type JobRequirement = {
  id?: string;
  requirementId?: string;
  text?: string;
  kind?: string;
  threshold?: string;
};

const WRAPPED_TOOL_NAMES = [
  'parse_resume',
  'list_jobs',
  'get_job_requirements',
  'recall_jobs',
  'score_match',
  'normalize_skills',
] as const;

function unwrapToolResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  const obj = result as { content?: Array<{ type?: string; text?: string }> };
  if (!Array.isArray(obj.content)) return result;
  const texts = obj.content
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text as string);
  if (texts.length === 1) {
    try {
      return JSON.parse(texts[0]);
    } catch {
      return texts[0];
    }
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function extractResumeIdFromFilePath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/data\/resumes\/([^/]+)\//);
  return match?.[1] ?? null;
}

function getParsedResume(resumeId: string): ParsedResume {
  const parsed = readResume(resumeId);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('简历摘要未就绪');
  }
  return parsed as ParsedResume;
}

function buildResumeCorpus(parsed: ParsedResume): string {
  const chunks: string[] = [];
  for (const item of parsed.experience ?? []) {
    if (item.company) chunks.push(String(item.company));
    if (item.role) chunks.push(String(item.role));
    if (item.description) chunks.push(String(item.description));
    chunks.push(...(item.highlights ?? []));
  }
  for (const project of parsed.projects ?? []) {
    if (project.name) chunks.push(String(project.name));
    if (project.role) chunks.push(String(project.role));
    if (project.description) chunks.push(String(project.description));
    chunks.push(...(project.highlights ?? []));
  }
  return chunks.join('\n');
}

function extractYearsFromText(text: string): number | null {
  const match = text.match(/(\d+)\s*年/);
  if (!match) return null;
  const years = Number(match[1]);
  return Number.isFinite(years) ? years : null;
}

function judgeRequirement(
  requirement: JobRequirement,
  skills: string[],
  corpus: string,
): 'hit' | 'miss' {
  const reqText = String(requirement.text ?? '').trim();
  const threshold = String(requirement.threshold ?? '').trim();
  const haystack = `${corpus}\n${skills.join('\n')}`.toLowerCase();

  if (threshold && haystack.includes(threshold.toLowerCase())) {
    return 'hit';
  }

  const requiredYears = extractYearsFromText(reqText);
  if (requiredYears !== null) {
    const corpusYears = extractYearsFromText(corpus);
    if (corpusYears !== null && corpusYears >= requiredYears) {
      return 'hit';
    }
  }

  const tokens = reqText.match(/[a-z+#.\u4e00-\u9fff]{2,}/gi) ?? [];
  for (const token of tokens) {
    const lowered = token.toLowerCase();
    if (skills.some((skill) => skill.toLowerCase().includes(lowered))) {
      return 'hit';
    }
    if (haystack.includes(lowered)) {
      return 'hit';
    }
  }

  return 'miss';
}

function latestListJobs(resumeId: string): JobSummary[] {
  const records = readTools(resumeId, 'list_jobs');
  const latest = records[records.length - 1];
  if (!latest) return [];
  if (Array.isArray(latest)) {
    return latest.map((item) => {
      const record = asRecord(item);
      return {
        jobId: String(record.jobId ?? ''),
        title: String(record.title ?? ''),
        company: String(record.company ?? ''),
      };
    });
  }
  return [];
}

function requirementsByJobId(resumeId: string): Map<string, JobRequirement[]> {
  const map = new Map<string, JobRequirement[]>();
  for (const record of readTools(resumeId, 'get_job_requirements')) {
    const payload = asRecord(record);
    const jobId = String(payload.jobId ?? '');
    const requirements = Array.isArray(payload.requirements) ? payload.requirements : [];
    if (!jobId) continue;
    map.set(
      jobId,
      requirements.map((item) => asRecord(item) as JobRequirement),
    );
  }
  return map;
}

const MAX_JOB_REQUIREMENT_FETCHES = 5;

function hasRecall(resumeId: string): boolean {
  return readTools(resumeId, 'recall_jobs').length > 0;
}

function fetchedJobIds(resumeId: string): Set<string> {
  const ids = new Set<string>();
  for (const record of readTools(resumeId, 'get_job_requirements')) {
    const jobId = String(asRecord(record).jobId ?? '').trim();
    if (jobId) ids.add(jobId);
  }
  return ids;
}

function jobsWithRequirements(resumeId: string): Array<{
  jobId: string;
  requirements: JobRequirement[];
}> {
  const requirementMap = requirementsByJobId(resumeId);
  return [...requirementMap.entries()]
    .filter(([, requirements]) => requirements.length > 0)
    .map(([jobId, requirements]) => ({ jobId, requirements }));
}

function buildRecallJobsInput(resumeId: string, parsed: ParsedResume) {
  const jobs = latestListJobs(resumeId);
  const requirementMap = requirementsByJobId(resumeId);
  const eligible = jobs.filter((job) => (requirementMap.get(job.jobId) ?? []).length > 0);
  return {
    resumeSkills: (parsed.skills ?? []).slice(0, 30),
    jobs: eligible.map((job) => ({
      jobId: job.jobId,
      title: job.title,
      requirements: (requirementMap.get(job.jobId) ?? []).map((req) => ({
        id: String(req.id ?? req.requirementId ?? ''),
        text: String(req.text ?? req.threshold ?? ''),
        kind: String(req.kind ?? 'soft'),
      })),
    })),
    topK: 20,
  };
}

function trimRecallForModel(recallOutput: Record<string, unknown>) {
  const results = Array.isArray(recallOutput.results) ? recallOutput.results : [];
  const jobIds = results
    .map((item) => String(asRecord(item).jobId ?? '').trim())
    .filter(Boolean);
  const scanned =
    typeof recallOutput.scanned === 'number'
      ? recallOutput.scanned
      : Number(recallOutput.scanned ?? eligibleScannedCount(results));
  return {
    scanned: Number.isFinite(scanned) ? scanned : jobIds.length,
    jobIds,
  };
}

function eligibleScannedCount(results: unknown[]): number {
  return results.filter((item) => String(asRecord(item).jobId ?? '').trim()).length;
}

function jobsForScoring(resumeId: string): Array<{
  jobId: string;
  requirements: JobRequirement[];
}> {
  const requirementMap = requirementsByJobId(resumeId);
  const fallback = jobsWithRequirements(resumeId).slice(0, MAX_JOB_REQUIREMENT_FETCHES);

  const recallRecords = readTools(resumeId, 'recall_jobs');
  const latestRecall = asRecord(recallRecords[recallRecords.length - 1]);
  const results = Array.isArray(latestRecall.results) ? latestRecall.results : [];

  if (results.length > 0) {
    const recalled = results
      .map((item) => {
        const jobId = String(asRecord(item).jobId ?? '').trim();
        return {
          jobId,
          requirements: requirementMap.get(jobId) ?? [],
        };
      })
      .filter((item) => item.jobId && item.requirements.length > 0);
    if (recalled.length > 0) {
      return recalled;
    }
  }

  return fallback;
}

@Injectable()
export class ResumeSessionToolsService implements OnApplicationBootstrap {
  constructor(private readonly moduleRef: ModuleRef) {}

  onApplicationBootstrap(): void {
    const registry = this.moduleRef.get(resolveToolRegistryClass(), {
      strict: false,
    }) as ToolRegistryService;

    for (const toolName of WRAPPED_TOOL_NAMES) {
      const original = registry.get(toolName);
      if (!original) continue;
      registry.register(this.wrapTool(toolName, original));
    }
  }

  private wrapTool(name: string, original: ToolDefinition): ToolDefinition {
    return {
      name: original.name,
      description: original.description,
      inputSchema: original.inputSchema,
      source: original.source,
      execute: async (input: unknown) =>
        this.executeWrapped(name, original.execute.bind(original), input),
    };
  }

  private async executeWrapped(
    name: string,
    originalExecute: (input: unknown) => Promise<unknown>,
    input: unknown,
  ): Promise<unknown> {
    switch (name) {
      case 'parse_resume':
        return this.wrapParseResume(originalExecute, input);
      case 'list_jobs':
        return this.wrapListJobs(originalExecute, input);
      case 'get_job_requirements':
        return this.wrapGetJobRequirements(originalExecute, input);
      case 'recall_jobs':
        return this.wrapRecallJobs(originalExecute, input);
      case 'score_match':
        return this.wrapScoreMatch(originalExecute, input);
      case 'normalize_skills':
        return this.wrapNormalizeSkills(originalExecute, input);
      default:
        return originalExecute(input);
    }
  }

  private async wrapParseResume(
    originalExecute: (input: unknown) => Promise<unknown>,
    input: unknown,
  ): Promise<unknown> {
    const args = asRecord(input);
    const filePath = String(args.file_path ?? '');
    const raw = await originalExecute(input);
    const parsed = unwrapToolResult(raw);
    const resumeId =
      resolveAnalyzeResumeId(filePath) ?? extractResumeIdFromFilePath(filePath);
    if (resumeId && parsed && typeof parsed === 'object') {
      rememberResume(resumeId, parsed);
    }
    const name =
      parsed && typeof parsed === 'object'
        ? String((parsed as ParsedResume).basic?.name ?? '').trim() || null
        : null;
    return { resumeId, name };
  }

  private async wrapListJobs(
    originalExecute: (input: unknown) => Promise<unknown>,
    input: unknown,
  ): Promise<unknown> {
    const resumeId = resolveResumeId(input);
    const raw = await originalExecute({ keyword: '', limit: 20 });
    const full = unwrapToolResult(raw);
    rememberTool(resumeId, 'list_jobs', full);

    const jobs = Array.isArray(full) ? full : [];
    return jobs.slice(0, 20).map((item) => {
      const record = asRecord(item);
      return {
        jobId: String(record.jobId ?? ''),
        title: String(record.title ?? ''),
        company: String(record.company ?? ''),
      };
    });
  }

  private async wrapGetJobRequirements(
    originalExecute: (input: unknown) => Promise<unknown>,
    input: unknown,
  ): Promise<unknown> {
    const args = asRecord(input);
    const resumeId = resolveResumeId(input);
    const jobId = String(args.jobId ?? '').trim();

    if (hasRecall(resumeId)) {
      throw new Error('recall_jobs 已执行，禁止再次 get_job_requirements');
    }
    if (!jobId) {
      throw new Error('jobId is required');
    }
    if (fetchedJobIds(resumeId).has(jobId)) {
      throw new Error(`jobId ${jobId} 已取过要求，禁止重复调用`);
    }
    if (readTools(resumeId, 'get_job_requirements').length >= MAX_JOB_REQUIREMENT_FETCHES) {
      throw new Error('get_job_requirements 已达 5 次上限');
    }

    const raw = await originalExecute({ jobId });
    const full = asRecord(unwrapToolResult(raw));
    rememberTool(resumeId, 'get_job_requirements', full);

    const requirements = Array.isArray(full.requirements) ? full.requirements : [];
    return {
      jobId: String(full.jobId ?? jobId),
      requirementCount: requirements.length,
    };
  }

  private async wrapRecallJobs(
    originalExecute: (input: unknown) => Promise<unknown>,
    input: unknown,
  ): Promise<unknown> {
    const resumeId = resolveResumeId(input);
    const parsed = getParsedResume(resumeId);
    const recallInput = buildRecallJobsInput(resumeId, parsed);
    const raw = await originalExecute(recallInput);
    const full = asRecord(unwrapToolResult(raw));
    rememberTool(resumeId, 'recall_jobs', full);
    return trimRecallForModel(full);
  }

  private async wrapScoreMatch(
    originalExecute: (input: unknown) => Promise<unknown>,
    input: unknown,
  ): Promise<unknown> {
    const resumeId = resolveResumeId(input);
    const parsed = getParsedResume(resumeId);
    const skills = (parsed.skills ?? []).slice(0, 30);
    const corpus = buildResumeCorpus(parsed);
    const jobs = jobsForScoring(resumeId);
    let count = 0;

    for (const job of jobs) {
      const verdicts = job.requirements.map((req) => ({
        requirementId: String(req.id ?? req.requirementId ?? ''),
        verdict: judgeRequirement(req, skills, corpus),
      }));
      const raw = await originalExecute({ jobId: job.jobId, verdicts });
      const payload = asRecord(unwrapToolResult(raw));
      rememberTool(resumeId, 'score_match', {
        ...payload,
        jobId: String(payload.jobId ?? job.jobId),
      });
      count += 1;
    }

    return { ok: true, count };
  }

  private async wrapNormalizeSkills(
    originalExecute: (input: unknown) => Promise<unknown>,
    input: unknown,
  ): Promise<unknown> {
    const resumeId = resolveResumeId(input);
    const parsed = getParsedResume(resumeId);
    const skills = (parsed.skills ?? []).slice(0, 30);
    const raw = await originalExecute({ skills });
    const full = unwrapToolResult(raw);
    rememberTool(resumeId, 'normalize_skills', full);
    return full;
  }
}
