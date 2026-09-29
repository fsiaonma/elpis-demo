import { createRequire } from 'module';
import * as path from 'path';
import { readTools } from './analysis-session';

const localRequire = createRequire(__filename);

type MatchVerdict = {
  requirementId: string;
  verdict: string;
};

type CachedMatchJob = {
  jobId: string;
  title: string;
  company: string;
  verdicts: MatchVerdict[];
};

export type MatchRecomputeCache = {
  weights: Record<string, unknown>;
  jobs: CachedMatchJob[];
};

type ScoreMatchTool = {
  execute(input: unknown): Promise<unknown>;
};

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

async function runMatchRankSkill(input: unknown): Promise<Record<string, unknown>> {
  const skillPath = path.resolve(process.cwd(), 'dist/skills/match-rank.skill.js');
  const skillModule = localRequire(skillPath) as {
    default: {
      execute(input: unknown, ctx: unknown): Promise<unknown>;
    };
  };
  const result = await skillModule.default.execute(input, {});
  if (!result || typeof result !== 'object') {
    throw new Error('match-rank 返回无效结果');
  }
  return result as Record<string, unknown>;
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

export function buildMatchRecomputeCache(
  resumeId: string,
  match: Record<string, unknown>,
): MatchRecomputeCache {
  const jobs = Array.isArray(match.jobs) ? match.jobs : [];
  const meta = buildJobMeta(resumeId);

  const cachedJobs = jobs.map((job) => {
    const record = asRecord(job);
    const jobId = String(record.jobId ?? '');
    const items = Array.isArray(record.items) ? record.items : [];
    return {
      jobId,
      title: String(record.title ?? meta.get(jobId)?.title ?? ''),
      company: String(record.company ?? meta.get(jobId)?.company ?? ''),
      verdicts: items.map((item) => {
        const row = asRecord(item);
        return {
          requirementId: String(row.requirementId ?? ''),
          verdict: String(row.verdict ?? 'miss'),
        };
      }),
    };
  });

  return {
    weights: (match.weights as Record<string, unknown>) ?? {},
    jobs: cachedJobs,
  };
}

export async function recomputeMatchWithWeights(
  resumeId: string,
  cache: MatchRecomputeCache,
  dimensionWeights: Record<string, number>,
  scoreMatchTool: ScoreMatchTool,
) {
  const jobs = await Promise.all(
    cache.jobs.map(async (job) => {
      const raw = await scoreMatchTool.execute({
        resumeId,
        jobId: job.jobId,
        verdicts: job.verdicts,
        dimensionWeights,
      });
      const scoring = unwrapToolResult(raw) as Record<string, unknown>;
      return {
        jobId: job.jobId,
        title: job.title,
        company: job.company,
        verdicts: job.verdicts,
        scoring,
      };
    }),
  );

  const weights = {
    ...cache.weights,
    dimensionWeights,
  };

  return runMatchRankSkill({ jobs, weights });
}
