import * as fs from 'fs';
import * as path from 'path';
import type { SkillContext, SkillDefinition } from '@fsiaonma/elpis';
import { readResume, readTools } from '../modules/resume/analysis-session';

type ScoreDetail = {
  requirementId: string;
  verdict?: string;
  weight?: number;
  contribution?: number;
};

type ScoreMatchResult = {
  jobId?: string;
  total: number | null;
  disqualified: boolean;
  disqualifiedReason?: string | null;
  items?: ScoreDetail[];
  details?: ScoreDetail[];
};

type StoredRequirement = {
  id?: string;
  requirementId?: string;
  text?: string;
  threshold?: string;
  weight?: number;
};

type MatchItem = {
  requirementId: string;
  text: string;
  verdict: string;
  evidence: string;
  reason: string;
  weight: number;
  contribution: number;
};

type MatchGap = {
  requirementId: string;
  text: string;
  verdict: string;
  evidence: string;
  weight: number;
};

type RankedJob = {
  jobId: string;
  title: string;
  company: string;
  total: number;
  disqualified: boolean;
  gaps: MatchGap[];
  items: MatchItem[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function normalizeVerdict(value: string): string {
  return value.trim().toLowerCase();
}

function resolveRequirementText(
  requirementId: string,
  textMap: Map<string, string>,
): string {
  const text = textMap.get(requirementId)?.trim() ?? '';
  if (text) return text;
  return requirementId;
}

function loadDefaultWeights(): Record<string, unknown> {
  const filePath = path.resolve(
    process.cwd(),
    'mcp-servers/jd-store-java/src/main/resources/rules/weights.json',
  );
  const raw = fs.readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw) as Record<string, unknown>;
  return {
    dimensionWeights: json.dimensionWeights ?? {},
    defaultDimensionWeight: json.defaultDimensionWeight ?? 0.1,
    hardGates: json.hardGates ?? {},
    verdictCoefficients: json.verdictCoefficients ?? {},
  };
}

function buildJobMeta(resumeId: string): Map<string, { title: string; company: string }> {
  const map = new Map<string, { title: string; company: string }>();
  for (const record of readTools(resumeId, 'list_jobs')) {
    const jobs = Array.isArray(record) ? record : [];
    for (const item of jobs) {
      const row = asRecord(item);
      const jobId = String(row.jobId ?? '');
      if (!jobId) continue;
      map.set(jobId, {
        title: String(row.title ?? ''),
        company: String(row.company ?? ''),
      });
    }
  }
  for (const record of readTools(resumeId, 'get_job_requirements')) {
    const row = asRecord(record);
    const jobId = String(row.jobId ?? '');
    if (!jobId) continue;
    const existing = map.get(jobId) ?? { title: '', company: '' };
    map.set(jobId, {
      title: existing.title || String(row.title ?? ''),
      company: existing.company,
    });
  }
  return map;
}

function buildRequirementMaps(resumeId: string): {
  byJob: Map<string, StoredRequirement[]>;
  textById: Map<string, string>;
} {
  const byJob = new Map<string, StoredRequirement[]>();
  const textById = new Map<string, string>();

  for (const record of readTools(resumeId, 'get_job_requirements')) {
    const payload = asRecord(record);
    const jobId = String(payload.jobId ?? '');
    const requirements = Array.isArray(payload.requirements) ? payload.requirements : [];
    if (!jobId) continue;

    const rows = requirements.map((item) => asRecord(item) as StoredRequirement);
    byJob.set(jobId, rows);
    for (const req of rows) {
      const requirementId = String(req.id ?? req.requirementId ?? '');
      const text = String(req.text ?? req.threshold ?? '').trim();
      if (requirementId && text) {
        textById.set(requirementId, text);
      }
    }
  }

  return { byJob, textById };
}

function buildResumeCorpus(parsed: Record<string, unknown>): string {
  const chunks: string[] = [];
  for (const item of Array.isArray(parsed.experience) ? parsed.experience : []) {
    const row = asRecord(item);
    if (row.company) chunks.push(String(row.company));
    if (row.role) chunks.push(String(row.role));
    if (row.description) chunks.push(String(row.description));
    if (Array.isArray(row.highlights)) {
      chunks.push(...row.highlights.map((line) => String(line)));
    }
  }
  for (const project of Array.isArray(parsed.projects) ? parsed.projects : []) {
    const row = asRecord(project);
    if (row.name) chunks.push(String(row.name));
    if (row.description) chunks.push(String(row.description));
    if (Array.isArray(row.highlights)) {
      chunks.push(...row.highlights.map((line) => String(line)));
    }
  }
  if (Array.isArray(parsed.skills)) {
    chunks.push(...parsed.skills.map((skill) => String(skill)));
  }
  return chunks.join('\n');
}

function findEvidence(requirementText: string, corpus: string, verdict: string): string {
  if (verdict === 'miss') return '';
  const trimmed = requirementText.trim();
  if (!trimmed || !corpus) return '';

  const lines = corpus.split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.includes(trimmed.slice(0, Math.min(trimmed.length, 12)))) {
      return line.length > 120 ? `${line.slice(0, 119)}…` : line;
    }
  }

  const tokens = trimmed.match(/[a-z+#.\u4e00-\u9fff]{2,}/gi) ?? [];
  for (const token of tokens) {
    for (const line of lines) {
      if (line.toLowerCase().includes(token.toLowerCase())) {
        return line.length > 120 ? `${line.slice(0, 119)}…` : line;
      }
    }
  }

  return verdict === 'hit' ? trimmed.slice(0, 40) : '';
}

function scoreMatchDetails(scoring: ScoreMatchResult): ScoreDetail[] {
  if (Array.isArray(scoring.items)) return scoring.items;
  if (Array.isArray(scoring.details)) return scoring.details;
  return [];
}

type JobRankInput = {
  jobId: string;
  title: string;
  company: string;
  scoring: ScoreMatchResult;
  requirements: StoredRequirement[];
  textById: Map<string, string>;
  corpus: string;
};

function buildJobsFromSession(resumeId: string): JobRankInput[] {
  const parsed = readResume(resumeId);
  const corpus =
    parsed && typeof parsed === 'object' ? buildResumeCorpus(parsed as Record<string, unknown>) : '';
  const jobMeta = buildJobMeta(resumeId);
  const { byJob, textById } = buildRequirementMaps(resumeId);

  return readTools(resumeId, 'score_match').map((record) => {
    const scoring = asRecord(record) as ScoreMatchResult;
    const jobId = String(scoring.jobId ?? '');
    const meta = jobMeta.get(jobId);
    return {
      jobId,
      title: meta?.title ?? '',
      company: meta?.company ?? '',
      scoring,
      requirements: byJob.get(jobId) ?? [],
      textById,
      corpus,
    };
  });
}

function buildItems(job: JobRankInput): MatchItem[] {
  const scores = new Map<string, ScoreDetail>();
  for (const detail of scoreMatchDetails(job.scoring)) {
    if (detail.requirementId) scores.set(detail.requirementId, detail);
  }

  const requirementIds = new Set<string>([
    ...job.requirements.map((req) => String(req.id ?? req.requirementId ?? '')),
    ...scores.keys(),
  ]);

  const items: MatchItem[] = [];
  for (const requirementId of requirementIds) {
    if (!requirementId) continue;
    const score = scores.get(requirementId);
    const req = job.requirements.find(
      (item) => String(item.id ?? item.requirementId ?? '') === requirementId,
    );
    const rawText = String(req?.text ?? req?.threshold ?? '').trim();
    const text = rawText
      ? rawText
      : resolveRequirementText(requirementId, job.textById);
    const verdict = normalizeVerdict(String(score?.verdict ?? 'miss'));
    items.push({
      requirementId,
      text: text.trim() ? text : requirementId,
      verdict,
      evidence: findEvidence(text, job.corpus, verdict),
      reason: '',
      weight: Number(score?.weight ?? req?.weight ?? 0),
      contribution: Number(score?.contribution ?? 0),
    });
  }

  return items.sort((left, right) => left.requirementId.localeCompare(right.requirementId));
}

function buildGaps(items: MatchItem[]): MatchGap[] {
  return items
    .filter((item) => item.verdict !== 'hit')
    .sort(
      (left, right) =>
        right.weight - left.weight || left.requirementId.localeCompare(right.requirementId),
    )
    .slice(0, 5)
    .map((item) => ({
      requirementId: item.requirementId,
      text: item.text.trim() ? item.text : item.requirementId,
      verdict: item.verdict,
      evidence: item.evidence,
      weight: item.weight,
    }));
}

export function assembleMatchRank(resumeId: string) {
  const weights = loadDefaultWeights();
  const jobs = buildJobsFromSession(resumeId);

  const rankedJobs: RankedJob[] = jobs.map((job) => {
    const items = buildItems(job);
    return {
      jobId: job.jobId,
      title: job.title,
      company: job.company,
      total:
        job.scoring.total === null || job.scoring.total === undefined
          ? 0
          : Number(job.scoring.total),
      disqualified: Boolean(job.scoring.disqualified),
      gaps: buildGaps(items),
      items,
    };
  });

  rankedJobs.sort((left, right) => {
    if (left.disqualified !== right.disqualified) {
      return left.disqualified ? 1 : -1;
    }
    if (right.total !== left.total) {
      return right.total - left.total;
    }
    return left.jobId.localeCompare(right.jobId);
  });

  return {
    jobs: rankedJobs.slice(0, 10),
    weights,
  };
}

/** jobs 为空时由服务端用 session 再跑一次 match-rank */
export function materializeMatchFromSession(resumeId: string) {
  const scoreRecords = readTools(resumeId, 'score_match');
  if (scoreRecords.length === 0) {
    return null;
  }
  return assembleMatchRank(resumeId);
}

const matchRankSkill: SkillDefinition = {
  name: 'match-rank',
  description:
    '将 score_match 算分结果与岗位要求组装为 Top 10 排名与差距清单（确定性，不调用模型）',
  inputSchema: {
    type: 'object',
    properties: {
      resumeId: { type: 'string' },
    },
    required: ['resumeId'],
  },
  async execute(input: unknown, ctx: SkillContext): Promise<unknown> {
    void ctx;
    const payload = (input && typeof input === 'object' ? input : {}) as { resumeId?: string };
    const resumeId = payload.resumeId?.trim();
    if (!resumeId) {
      throw new Error('缺少 resumeId');
    }
    return assembleMatchRank(resumeId);
  },
};

export default matchRankSkill;
