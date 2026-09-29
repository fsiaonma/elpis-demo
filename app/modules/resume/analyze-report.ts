import { createRequire } from 'module';
import * as path from 'path';
import type { Step } from '@fsiaonma/elpis/nest';
import { readResume } from './analysis-session';

const localRequire = createRequire(__filename);

export type ProgressStepKey = 'resume' | 'profile' | 'match' | 'assemble';

export interface ProgressStep {
  key: ProgressStepKey;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  startedAt?: number;
  endedAt?: number;
}

export interface DegradedItem {
  key: string;
  reason: string;
}

export interface TraceRow {
  agent: string;
  type: string;
  name?: string;
  iteration: number;
  status?: string;
  detail?: string;
  detailKind: 'json' | 'text';
  depth: number;
  childRunId?: string;
}

const PROGRESS_LABELS: Record<ProgressStepKey, string> = {
  resume: '读简历',
  profile: '画像',
  match: '匹配',
  assemble: '汇总',
};

export function createInitialProgressSteps(startedAt: number): ProgressStep[] {
  return (['resume', 'profile', 'match', 'assemble'] as ProgressStepKey[]).map((key) => ({
    key,
    label: PROGRESS_LABELS[key],
    status: key === 'resume' ? 'running' : 'pending',
    startedAt: key === 'resume' ? startedAt : undefined,
  }));
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export function parseJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return value;
  const stripped = stripJsonFence(value);
  if (stripped === '') return null;
  try {
    return JSON.parse(stripped);
  } catch {
    return stripped;
  }
}

type DelegationLike = Step & {
  steps?: Step[];
  agent?: string;
  childRunId?: string;
  output?: unknown;
  status?: string;
};

function stepType(step: Step): string {
  return String((step as { type?: string }).type ?? '');
}

function isDelegationStep(step: Step): step is DelegationLike {
  return stepType(step) === 'delegation';
}

function delegationChildSteps(step: Step | undefined): Step[] {
  if (!step || !isDelegationStep(step)) return [];
  return Array.isArray(step.steps) ? step.steps : [];
}

function stepAgentName(step: Step): string {
  return typeof step.agent === 'string' ? step.agent : '';
}

function stepName(step: Step): string | undefined {
  if (typeof step.name === 'string' && step.name.trim()) return step.name;
  return undefined;
}

function stepStatus(step: Step): string | undefined {
  if (typeof step.status === 'string') return step.status;
  if (step.error) return 'failed';
  return undefined;
}

function pickStepDetail(step: Step): { detail?: string; detailKind: 'json' | 'text' } {
  const error = step.error as { message?: string } | string | undefined;
  if (error) {
    const message =
      typeof error === 'string'
        ? error
        : typeof error.message === 'string'
          ? error.message
          : JSON.stringify(error);
    return { detail: message.slice(0, 180), detailKind: 'text' };
  }

  const candidate = step.output ?? step.result ?? step.observation;
  if (candidate === undefined || candidate === null) {
    return { detailKind: 'text' };
  }

  const parsed = parseJsonValue(candidate);
  if (parsed && typeof parsed === 'object') {
    return {
      detail: JSON.stringify(parsed, null, 2),
      detailKind: 'json',
    };
  }

  const text = String(parsed ?? candidate).replace(/\s+/g, ' ').trim();
  return {
    detail: text.length > 180 ? `${text.slice(0, 179)}…` : text,
    detailKind: 'text',
  };
}

/** 步骤明细：不缩进的都算队长自己干的；缩进一层的，才是它派出去的读简历、画像、匹配。 */
export function flattenSupervisorTrace(supervisorSteps: Step[]): TraceRow[] {
  const rows: TraceRow[] = [];

  for (const step of supervisorSteps) {
    const { detail, detailKind } = pickStepDetail(step);
    const workerName = isDelegationStep(step) ? stepAgentName(step) : stepName(step);
    rows.push({
      agent: 'studio-supervisor',
      type: String(step.type),
      name: workerName || stepName(step),
      iteration: Number(step.iteration ?? 0),
      status: stepStatus(step),
      detail,
      detailKind,
      depth: 0,
      childRunId: isDelegationStep(step)
        ? typeof step.childRunId === 'string'
          ? step.childRunId
          : undefined
        : undefined,
    });

    if (isDelegationStep(step)) {
      const childAgent = stepAgentName(step) || 'worker';
      for (const child of delegationChildSteps(step)) {
        const childDetail = pickStepDetail(child);
        rows.push({
          agent: childAgent,
          type: String(child.type),
          name: stepName(child),
          iteration: Number(child.iteration ?? 0),
          status: stepStatus(child),
          detail: childDetail.detail,
          detailKind: childDetail.detailKind,
          depth: 1,
        });
      }
    }
  }

  return rows;
}

/** 同一个人可能被记了好几次（先进行中，后完成）。看进度时只认最后一次，别被前面那条「还在跑」骗了。 */
export function findDelegation(steps: Step[] | undefined, agentName: string): Step | undefined {
  if (!Array.isArray(steps)) return undefined;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (isDelegationStep(step) && stepAgentName(step) === agentName) {
      return step;
    }
  }
  return undefined;
}

function delegationFinalOutput(delegation: Step | undefined): unknown {
  if (!delegation) return null;
  if (delegation.output !== undefined && delegation.output !== null) {
    return parseJsonValue(delegation.output);
  }
  for (const child of delegationChildSteps(delegation)) {
    if (child.type === 'final' && child.output !== undefined) {
      return parseJsonValue(child.output);
    }
  }
  return null;
}

function foldChildStepIntoDelegation(steps: Step[], incoming: Step): Step[] | undefined {
  const parentRunId = (incoming as { parentRunId?: string }).parentRunId;
  const agent = stepAgentName(incoming);
  if (!parentRunId || !agent || isDelegationStep(incoming)) {
    return undefined;
  }

  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (!isDelegationStep(step) || stepAgentName(step) !== agent) continue;
    const child = { ...incoming };
    delete (child as { parentRunId?: string }).parentRunId;
    const next = [...steps];
    next[index] = {
      ...step,
      steps: [...delegationChildSteps(step), child],
    };
    return next;
  }

  return undefined;
}

/** 新到的一步如果是同一次派活的更新，就改原来那条，不要再叠一条。下属干的小事归到这次派活下面，别平铺在队长身上。 */
export function mergeSupervisorIncomingStep(steps: Step[], incoming: Step): Step[] {
  const folded = foldChildStepIntoDelegation(steps, incoming);
  if (folded) {
    return folded;
  }

  if (!isDelegationStep(incoming)) {
    return [...steps, incoming];
  }

  const agent = stepAgentName(incoming);
  const childRunId =
    typeof incoming.childRunId === 'string' ? incoming.childRunId : '';

  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (!isDelegationStep(step) || stepAgentName(step) !== agent) continue;

    const existingRunId =
      typeof step.childRunId === 'string' ? step.childRunId : '';
    if (childRunId && existingRunId && childRunId !== existingRunId) {
      continue;
    }

    const incomingChildren = delegationChildSteps(incoming);
    const mergedChildren =
      incomingChildren.length > 0 ? incomingChildren : delegationChildSteps(step);

    const next = [...steps];
    next[index] = {
      ...step,
      ...incoming,
      steps: mergedChildren,
    };
    return next;
  }

  return [...steps, incoming];
}

function findSkillStep(steps: Step[] | undefined, skillName: string): Step | undefined {
  if (!Array.isArray(steps)) return undefined;
  return steps.find((step) => step.type === 'skill' && step.name === skillName);
}

async function runProfileAssemble(resumeId: string, judgments: unknown[]): Promise<Record<string, unknown>> {
  const resume = readResume(resumeId);
  const skillPath = path.resolve(process.cwd(), 'dist/skills/profile-assemble.skill.js');
  const skillModule = localRequire(skillPath) as {
    default: {
      execute(input: unknown, ctx: unknown): Promise<unknown>;
    };
  };
  const result = await skillModule.default.execute({ judgments, resume }, {});
  if (!result || typeof result !== 'object') {
    throw new Error('profile-assemble 返回无效结果');
  }
  return result as Record<string, unknown>;
}

async function profileFromWorkerRecord(
  record: { dimensions?: unknown; judgments?: unknown },
  resumeId: string,
): Promise<Record<string, unknown> | null> {
  if (Array.isArray(record.dimensions)) {
    return record as Record<string, unknown>;
  }
  if (Array.isArray(record.judgments)) {
    return runProfileAssemble(resumeId, record.judgments);
  }
  return null;
}

/** 从画像那次派活里把结果抠出来。对方如果只给了判级、没给分数，这里再帮它把六维分数算好。 */
export async function resolveProfilePayload(
  steps: Step[],
  resumeId: string,
): Promise<Record<string, unknown> | null> {
  const delegation = findDelegation(steps, 'profile-analyst');
  if (!delegation || delegation.status === 'failed' || delegation.error) return null;

  const output = parseJsonValue(delegation.output);
  if (output && typeof output === 'object') {
    const fromOutput = await profileFromWorkerRecord(
      output as { dimensions?: unknown; judgments?: unknown },
      resumeId,
    );
    if (fromOutput) return fromOutput;
  }

  for (const child of delegationChildSteps(delegation)) {
    if (child.type !== 'final' || child.output === undefined) continue;
    const finalParsed = parseJsonValue(child.output);
    if (!finalParsed || typeof finalParsed !== 'object') continue;
    const fromFinal = await profileFromWorkerRecord(
      finalParsed as { dimensions?: unknown; judgments?: unknown },
      resumeId,
    );
    if (fromFinal) return fromFinal;
  }

  const assembleStep = findSkillStep(delegationChildSteps(delegation), 'profile-assemble');
  if (assembleStep?.result) {
    const assembled = parseJsonValue(assembleStep.result);
    if (assembled && typeof assembled === 'object' && Array.isArray((assembled as { dimensions?: unknown }).dimensions)) {
      return assembled as Record<string, unknown>;
    }
  }

  return null;
}

export function resolveParsedResumeFromSteps(steps: Step[]): Record<string, unknown> | null {
  const delegation = findDelegation(steps, 'resume-analyst');
  if (!delegation) return null;

  const output = parseJsonValue(delegation.output);
  if (output && typeof output === 'object') {
    return output as Record<string, unknown>;
  }

  for (const child of delegationChildSteps(delegation)) {
    if (child.type === 'tool' && child.name === 'parse_resume' && child.result) {
      const parsed = parseJsonValue(child.result);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    }
  }

  return null;
}

/** 整份简历先去内存里找；没有的话，再去「读简历」那一步留下的结果里找。 */
export function resolveParsedResume(
  resumeId: string,
  steps: Step[],
): Record<string, unknown> | null {
  const sessionResume = readResume(resumeId);
  if (sessionResume && typeof sessionResume === 'object') {
    return sessionResume as Record<string, unknown>;
  }

  const delegation = findDelegation(steps, 'resume-analyst');
  if (!delegation) return null;

  for (const child of delegationChildSteps(delegation)) {
    if (child.type === 'tool' && child.name === 'parse_resume' && child.result) {
      const parsed = parseJsonValue(child.result);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    }
  }

  return null;
}

export function resolveMatchPayload(steps: Step[]): Record<string, unknown> | null {
  const delegation = findDelegation(steps, 'match-scorer');
  if (!delegation || delegation.status === 'failed' || delegation.error) return null;

  const output = parseJsonValue(delegation.output);
  if (output && typeof output === 'object' && Array.isArray((output as { jobs?: unknown }).jobs)) {
    return output as Record<string, unknown>;
  }

  const rankStep = findSkillStep(delegationChildSteps(delegation), 'match-rank');
  if (rankStep?.result) {
    const rankOutput = parseJsonValue(rankStep.result);
    if (
      rankOutput &&
      typeof rankOutput === 'object' &&
      Array.isArray((rankOutput as { jobs?: unknown }).jobs)
    ) {
      return rankOutput as Record<string, unknown>;
    }
  }

  for (const child of delegationChildSteps(delegation)) {
    if (child.type !== 'final' || child.output === undefined) continue;
    const finalParsed = parseJsonValue(child.output);
    if (
      finalParsed &&
      typeof finalParsed === 'object' &&
      Array.isArray((finalParsed as { jobs?: unknown }).jobs)
    ) {
      return finalParsed as Record<string, unknown>;
    }
  }

  return null;
}

export function appendWorkerPayloadDegraded(
  degraded: DegradedItem[],
  supervisorSteps: Step[],
  profile: Record<string, unknown> | null,
  match: Record<string, unknown> | null,
): DegradedItem[] {
  const next = [...degraded];
  const profileDel = findDelegation(supervisorSteps, 'profile-analyst');
  const matchDel = findDelegation(supervisorSteps, 'match-scorer');

  if (profileDel && isDelegationFinished(profileDel) && !profile) {
    next.push({
      key: 'profile',
      reason: delegationErrorReason(profileDel) || '画像 worker 未返回有效 judgments 或 dimensions',
    });
  }
  if (matchDel && isDelegationFinished(matchDel) && !match) {
    next.push({
      key: 'match',
      reason: delegationErrorReason(matchDel) || '匹配 worker 未完成 match-rank 或未返回 jobs',
    });
  }

  return dedupeDegraded(next);
}

export function parseSupervisorReport(output: string): {
  resumeId?: string;
  degraded: DegradedItem[];
} {
  const parsed = parseJsonValue(output);
  if (!parsed || typeof parsed !== 'object') return { degraded: [] };
  const record = parsed as { resumeId?: string; degraded?: unknown };
  const degraded = Array.isArray(record.degraded)
    ? record.degraded
        .filter((item): item is DegradedItem => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          key: String((item as DegradedItem).key ?? ''),
          reason: String((item as DegradedItem).reason ?? ''),
        }))
        .filter((item) => item.key && item.reason)
    : [];
  return {
    resumeId: typeof record.resumeId === 'string' ? record.resumeId : undefined,
    degraded,
  };
}

function delegationErrorReason(step: Step | undefined): string {
  if (!step?.error) return '';
  const error = step.error as { message?: string } | string;
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string') return error.message;
  return JSON.stringify(error);
}

function coalesceStartedAt(previous: number | undefined, incoming: number | undefined): number | undefined {
  if (incoming === undefined || !Number.isFinite(incoming)) {
    return previous;
  }
  if (previous === undefined || !Number.isFinite(previous)) {
    return incoming;
  }
  return Math.min(previous, incoming);
}

function markStep(
  steps: ProgressStep[],
  key: ProgressStepKey,
  status: ProgressStep['status'],
  timestamps?: { startedAt?: number; endedAt?: number },
): ProgressStep[] {
  return steps.map((step) => {
    if (step.key !== key) return step;
    const startedAt = coalesceStartedAt(step.startedAt, timestamps?.startedAt);
    let endedAt = step.endedAt;
    if (status === 'running' || status === 'pending') {
      endedAt = undefined;
    } else if (timestamps?.endedAt !== undefined) {
      endedAt = timestamps.endedAt;
    }
    return {
      ...step,
      status,
      startedAt,
      endedAt,
    };
  });
}

export function delegationProfileReady(delegation: Step | undefined): boolean {
  if (!delegation || delegation.status === 'failed' || delegation.error) return false;
  if (delegation.status === 'done') return true;

  const output = parseJsonValue(delegation.output);
  if (output && typeof output === 'object') {
    const record = output as { dimensions?: unknown; judgments?: unknown };
    if (Array.isArray(record.dimensions) || Array.isArray(record.judgments)) {
      return true;
    }
  }

  for (const child of delegationChildSteps(delegation)) {
    if (child.type === 'skill' && child.name === 'profile-assemble' && child.result) {
      return true;
    }
    if (child.type !== 'final' || child.output === undefined) continue;
    const finalParsed = parseJsonValue(child.output);
    if (!finalParsed || typeof finalParsed !== 'object') continue;
    const record = finalParsed as { dimensions?: unknown; judgments?: unknown };
    if (Array.isArray(record.dimensions) || Array.isArray(record.judgments)) {
      return true;
    }
  }

  return false;
}

export function delegationMatchReady(delegation: Step | undefined): boolean {
  if (!delegation || delegation.status === 'failed' || delegation.error) return false;
  if (delegation.status === 'done') return true;

  const output = parseJsonValue(delegation.output);
  if (
    output &&
    typeof output === 'object' &&
    Array.isArray((output as { jobs?: unknown }).jobs)
  ) {
    return true;
  }

  const rankStep = findSkillStep(delegationChildSteps(delegation), 'match-rank');
  if (rankStep?.result) {
    const rankOutput = parseJsonValue(rankStep.result);
    if (
      rankOutput &&
      typeof rankOutput === 'object' &&
      Array.isArray((rankOutput as { jobs?: unknown }).jobs)
    ) {
      return true;
    }
  }

  for (const child of delegationChildSteps(delegation)) {
    if (child.type !== 'final' || child.output === undefined) continue;
    const finalParsed = parseJsonValue(child.output);
    if (
      finalParsed &&
      typeof finalParsed === 'object' &&
      Array.isArray((finalParsed as { jobs?: unknown }).jobs)
    ) {
      return true;
    }
  }

  return false;
}

function isDelegationFinished(step: Step | undefined): boolean {
  if (!step) return false;
  if (step.status === 'done' || step.status === 'failed' || Boolean(step.error)) {
    return true;
  }
  const agent = stepAgentName(step);
  if (agent === 'profile-analyst') return delegationProfileReady(step);
  if (agent === 'match-scorer') return delegationMatchReady(step);
  return false;
}

export function resumeStepSucceeded(steps: Step[]): boolean {
  const resumeDel = findDelegation(steps, 'resume-analyst');
  if (!resumeDel || resumeDel.status === 'failed' || resumeDel.error) return false;
  const output = delegationFinalOutput(resumeDel);
  if (output && typeof output === 'object' && (output as { resumeId?: string }).resumeId) {
    return true;
  }
  return resumeDel.status === 'done';
}

export interface SyncProgressHints {
  /** runtime 已解析出 dimensions（流式时子 delegation 可能尚无 child steps） */
  profilePayloadReady?: boolean;
  matchPayloadReady?: boolean;
  profileResolvedAt?: number;
  matchResolvedAt?: number;
}

/** 四格进度：先读简历，再让画像和匹配并排做，最后才汇总。一边做完就可以先变绿，汇总要等两边都结束、队长也收尾了。 */
export function syncProgressSteps(
  supervisorSteps: Step[],
  progressSteps: ProgressStep[],
  analyzeStartMs: number,
  hints?: SyncProgressHints,
): ProgressStep[] {
  let next = progressSteps.length > 0 ? [...progressSteps] : createInitialProgressSteps(analyzeStartMs);

  const resumeDel = findDelegation(supervisorSteps, 'resume-analyst');
  const profileDel = findDelegation(supervisorSteps, 'profile-analyst');
  const matchDel = findDelegation(supervisorSteps, 'match-scorer');
  const hasSupervisorFinal = supervisorSteps.some((step) => step.type === 'final');

  if (resumeDel) {
    if (resumeDel.status === 'failed' || resumeDel.error) {
      next = markStep(next, 'resume', 'failed', {
        startedAt: resumeDel.startedAt as number | undefined,
        endedAt: (resumeDel.endedAt as number | undefined) ?? Date.now(),
      });
    } else if (resumeStepSucceeded(supervisorSteps)) {
      next = markStep(next, 'resume', 'done', {
        startedAt: resumeDel.startedAt as number | undefined,
        endedAt: (resumeDel.endedAt as number | undefined) ?? Date.now(),
      });
    } else {
      next = markStep(next, 'resume', 'running', {
        startedAt: (resumeDel.startedAt as number | undefined) ?? analyzeStartMs,
      });
    }
  }

  if (resumeStepSucceeded(supervisorSteps)) {
    for (const key of ['profile', 'match'] as ProgressStepKey[]) {
      const delegation = key === 'profile' ? profileDel : matchDel;
      if (!delegation) continue;
      if (delegation.status === 'failed' || delegation.error) {
        next = markStep(next, key, 'failed', {
          startedAt: delegation.startedAt as number | undefined,
          endedAt: (delegation.endedAt as number | undefined) ?? Date.now(),
        });
      } else if (
        delegation.status === 'done' ||
        (key === 'profile' &&
          (delegationProfileReady(delegation) || hints?.profilePayloadReady)) ||
        (key === 'match' &&
          (delegationMatchReady(delegation) || hints?.matchPayloadReady))
      ) {
        const hintEndedAt =
          key === 'profile' ? hints?.profileResolvedAt : hints?.matchResolvedAt;
        const existingEnded = next.find((step) => step.key === key)?.endedAt;
        const candidates = [existingEnded, hintEndedAt, delegation.endedAt as number | undefined]
          .filter((value): value is number => typeof value === 'number' && value > 0);
        next = markStep(next, key, 'done', {
          startedAt: delegation.startedAt as number | undefined,
          endedAt: candidates.length > 0 ? Math.min(...candidates) : Date.now(),
        });
      } else {
        next = markStep(next, key, 'running', {
          startedAt: (delegation.startedAt as number | undefined) ?? Date.now(),
        });
      }
    }
  }

  if (profileDel || matchDel) {
    const profileProgress = next.find((step) => step.key === 'profile');
    const matchProgress = next.find((step) => step.key === 'match');
    const profileFinished =
      profileProgress?.status === 'done' ||
      profileProgress?.status === 'failed' ||
      isDelegationFinished(profileDel);
    const matchFinished =
      matchProgress?.status === 'done' ||
      matchProgress?.status === 'failed' ||
      isDelegationFinished(matchDel);
    const workerStarts = [profileDel?.startedAt, matchDel?.startedAt]
      .map((value) => (typeof value === 'number' ? value : undefined))
      .filter((value): value is number => value !== undefined);
    const workerEnds = [
      profileProgress?.endedAt ?? profileDel?.endedAt ?? hints?.profileResolvedAt,
      matchProgress?.endedAt ?? matchDel?.endedAt ?? hints?.matchResolvedAt,
    ]
      .map((value) => (typeof value === 'number' ? value : undefined))
      .filter((value): value is number => value !== undefined);

    if (profileFinished && matchFinished) {
      const assembleStarted =
        workerStarts.length > 0
          ? Math.min(...workerStarts)
          : next.find((step) => step.key === 'assemble')?.startedAt ?? Date.now();
      const assembleEnded =
        workerEnds.length > 0 ? Math.max(...workerEnds) : Date.now();

      if (hasSupervisorFinal) {
        const finalStep = supervisorSteps.find((step) => step.type === 'final');
        const finalOutput = String(finalStep?.output ?? '').trim();
        const assembleFailed =
          resumeStepSucceeded(supervisorSteps) &&
          !profileDel &&
          !matchDel &&
          (!finalOutput || finalOutput === '模型返回空内容');
        next = markStep(next, 'assemble', assembleFailed ? 'failed' : 'done', {
          startedAt: assembleStarted,
          endedAt: assembleEnded,
        });
      } else {
        next = markStep(next, 'assemble', 'running', {
          startedAt: assembleStarted,
        });
      }
    }
  }

  return next;
}

export function buildDegradedList(
  supervisorSteps: Step[],
  supervisorOutput: string,
): DegradedItem[] {
  const report = parseSupervisorReport(supervisorOutput);
  const degraded = [...report.degraded];

  const resumeDel = findDelegation(supervisorSteps, 'resume-analyst');
  const profileDel = findDelegation(supervisorSteps, 'profile-analyst');
  const matchDel = findDelegation(supervisorSteps, 'match-scorer');

  if (!resumeDel) {
    degraded.push({
      key: 'resume',
      reason: '队长未通过 invoke_agent 调用 resume-analyst',
    });
    return dedupeDegraded(degraded);
  }

  if (resumeDel.status === 'failed' || resumeDel.error) {
    degraded.push({
      key: 'resume',
      reason: delegationErrorReason(resumeDel) || 'resume-analyst 执行失败',
    });
    return dedupeDegraded(degraded);
  }

  if (!resumeStepSucceeded(supervisorSteps)) {
    degraded.push({
      key: 'resume',
      reason: delegationErrorReason(resumeDel) || 'resume-analyst 未返回 resumeId',
    });
    return dedupeDegraded(degraded);
  }

  const trimmedOutput = stripJsonFence(supervisorOutput);
  if (
    resumeStepSucceeded(supervisorSteps) &&
    !profileDel &&
    !matchDel &&
    (!trimmedOutput || trimmedOutput === '模型返回空内容')
  ) {
    degraded.push({
      key: 'resume',
      reason: '队长在读完简历后返回空内容，没有调用画像和匹配',
    });
  }

  if (!profileDel && !matchDel && resumeStepSucceeded(supervisorSteps)) {
    if (!degraded.some((item) => item.key === 'resume')) {
      degraded.push({
        key: 'resume',
        reason: '队长在读完简历后返回空内容，没有调用画像和匹配',
      });
    }
  }

  return dedupeDegraded(degraded);
}

function dedupeDegraded(items: DegradedItem[]): DegradedItem[] {
  const map = new Map<string, DegradedItem>();
  for (const item of items) {
    if (item.key && item.reason) map.set(item.key, item);
  }
  return [...map.values()];
}

export function resolveAnalyzeError(
  supervisorSteps: Step[],
  supervisorOutput: string,
  degraded: DegradedItem[],
): string | undefined {
  const resumeItem = degraded.find((item) => item.key === 'resume');
  if (resumeItem?.reason) return resumeItem.reason;

  const invokeError = supervisorSteps.find(
    (step) =>
      step.type === 'tool' &&
      step.name === 'invoke_agent' &&
      (step.status === 'failed' || step.error),
  );
  if (invokeError) return delegationErrorReason(invokeError);

  if (stripJsonFence(supervisorOutput) === '模型返回空内容') {
    return '队长在读完简历后返回空内容，没有调用画像和匹配';
  }

  return undefined;
}

export function markAllWorkersFailed(progressSteps: ProgressStep[]): ProgressStep[] {
  return progressSteps.map((step) =>
    step.key === 'resume'
      ? step
      : {
          ...step,
          status: 'failed',
          endedAt: step.endedAt ?? Date.now(),
        },
  );
}

export function markIncompleteStepsFailed(progressSteps: ProgressStep[]): ProgressStep[] {
  const now = Date.now();
  return progressSteps.map((step) =>
    step.status === 'done' || step.status === 'failed'
      ? step
      : {
          ...step,
          status: 'failed',
          endedAt: now,
        },
  );
}
