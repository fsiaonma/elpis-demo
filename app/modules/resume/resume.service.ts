import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DatabaseProvider } from '@fsiaonma/elpis/nest';
import type { RunResult, Step } from '@fsiaonma/elpis/nest';
import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import { rememberResume, registerAnalyzeContext } from './analysis-session';
import {
  appendWorkerPayloadDegraded,
  buildDegradedList,
  createInitialProgressSteps,
  findDelegation,
  flattenSupervisorTrace,
  markAllWorkersFailed,
  markIncompleteStepsFailed,
  mergeSupervisorIncomingStep,
  resolveAnalyzeError,
  resolveMatchPayload,
  resolveParsedResume,
  resolveProfilePayload,
  resumeStepSucceeded,
  syncProgressSteps,
  type DegradedItem,
  type ProgressStep,
  type SyncProgressHints,
  type TraceRow,
} from './analyze-report';
import {
  resolveLangGraphOrchestratorServiceClass,
  resolveToolRegistryServiceClass,
} from './elpis-ai-bridge';
import {
  buildMatchRecomputeCache,
  recomputeMatchWithWeights,
  type MatchRecomputeCache,
} from './match-recompute';
import { materializeMatchFromSession } from '../../skills/match-rank.skill';

export type ResumeStatus = 'uploaded' | 'parsing' | 'parsed' | 'failed';

export interface UploadedResumeFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

export type AnalyzeStep = ProgressStep;

interface ParsedBasic {
  name: string;
  email: string;
  phone: string;
  location: string;
}

interface ParsedEducation {
  school?: string;
  degree?: string;
  major?: string;
  start?: string;
  end?: string;
}

interface ParsedExperience {
  company: string;
  title: string;
  start: string;
  end: string;
  highlights: string[];
}

interface ParsedResume {
  basic: ParsedBasic;
  education: ParsedEducation[];
  experience: ParsedExperience[];
  projects: unknown[];
  skills: string[];
  raw_text: string;
}

interface ResumeRow {
  id: string;
  file_name: string;
  file_path: string;
  uploaded_at: Date | string;
  status: ResumeStatus;
  parsed: unknown;
  cand_name: string | null;
  top_degree: string | null;
  last_company: string | null;
  skill_count: number | null;
}

interface JobRow {
  id: string;
  title: string;
  company: string;
  city: string;
  level: string;
  salary_range?: string | null;
}

interface AnalyzeRuntimeState {
  steps: ProgressStep[];
  error?: string;
  analyzeStartMs: number;
  runId?: string;
  trace?: TraceRow[];
  profile?: Record<string, unknown> | null;
  match?: Record<string, unknown> | null;
  profileResolvedAt?: number;
  matchResolvedAt?: number;
  degraded?: DegradedItem[];
  matchRecomputeCache?: MatchRecomputeCache;
}

interface SqlErrorLike {
  sqlMessage?: string;
  message?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt']);
const RESUME_STATUSES: ResumeStatus[] = [
  'uploaded',
  'parsing',
  'parsed',
  'failed',
];

const STATUS_LABELS: Record<ResumeStatus, string> = {
  uploaded: '已上传',
  parsing: '分析中',
  parsed: '已解析',
  failed: '失败',
};
const DEGREE_RANK: Record<string, number> = {
  博士: 5,
  硕士: 4,
  研究生: 4,
  本科: 3,
  学士: 3,
  大专: 2,
  专科: 2,
  高中: 1,
};

export function normalizeOriginalFilename(originalname: string): string {
  if (!originalname) {
    return 'unknown';
  }

  if (/[\u4e00-\u9fff]/.test(originalname)) {
    return originalname;
  }

  const decoded = Buffer.from(originalname, 'latin1').toString('utf8');
  if (/[\u4e00-\u9fff]/.test(decoded)) {
    return decoded;
  }

  return originalname;
}

function logAnalyze(resumeId: string, analyzeStartMs: number, message: string) {
  const elapsed = Date.now() - analyzeStartMs;
  console.log(`[analyze] resumeId=${resumeId} elapsed=${elapsed}ms ${message}`);
}

function formatDbError(error: unknown): string {
  const sqlError = error as SqlErrorLike;
  const raw =
    sqlError.sqlMessage ||
    (error instanceof Error
      ? error.message.split('\n')[0]
      : String(error).split('\n')[0]);
  return `写库失败：${raw}`;
}

function formatParseError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message.split('\n')[0]
      : String(error).split('\n')[0];
  return `解析失败：${raw}`;
}

function summarizeSteps(steps: Step[]): string {
  return steps
    .map((step) => {
      const name = typeof step.name === 'string' ? step.name : '';
      return name ? `${step.type}:${name}` : step.type;
    })
    .join(', ');
}

@Injectable()
export class ResumeService implements OnModuleInit {
  private readonly resumeRoot = path.resolve(process.cwd(), 'data/resumes');
  // 分析做到哪了，先记在内存里：进度、步骤、画像、匹配。页面隔一秒来问一次，问的就是这里。服务一重启，这份记录就没了。
  private readonly analyzeRuntime = new Map<string, AnalyzeRuntimeState>();

  constructor(
    private readonly databaseProvider: DatabaseProvider,
    private readonly moduleRef: ModuleRef,
  ) {}

  private get db() {
    return this.databaseProvider.db;
  }

  // 去框架里把「负责跑队长」的那个对象拿出来。真正开跑在后面的后台方法里。
  private getOrchestrator() {
    return this.moduleRef.get(resolveLangGraphOrchestratorServiceClass(), {
      strict: false,
    });
  }

  private getToolRegistry() {
    return this.moduleRef.get(resolveToolRegistryServiceClass(), {
      strict: false,
    });
  }

  async onModuleInit() {
    if (!fs.existsSync(this.resumeRoot)) {
      fs.mkdirSync(this.resumeRoot, { recursive: true });
    }
  }

  validateUpload(file?: UploadedResumeFile): string | null {
    if (!file) {
      return '请选择要上传的文件';
    }

    if (file.size > MAX_FILE_SIZE) {
      return '文件大小不能超过 10MB';
    }

    const fileName = normalizeOriginalFilename(file.originalname);
    const ext = path.extname(fileName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return '仅支持 pdf、docx、txt 格式';
    }

    return null;
  }

  async upload(file?: UploadedResumeFile) {
    const error = this.validateUpload(file);
    if (error) {
      throw new Error(error);
    }

    const db = this.db;
    if (!db || !file) {
      throw new Error('数据库未就绪');
    }

    const id = uuidv4();
    const fileName = normalizeOriginalFilename(file.originalname);
    const resumeDir = path.join(this.resumeRoot, id);
    const filePath = path.join(resumeDir, fileName);

    fs.mkdirSync(resumeDir, { recursive: true });
    fs.writeFileSync(filePath, file.buffer);

    const uploadedAt = moment().format('YYYY-MM-DD HH:mm:ss');
    await db('t_resume').insert({
      id,
      file_name: fileName,
      file_path: filePath,
      uploaded_at: uploadedAt,
      status: 'uploaded',
      parsed: null,
      cand_name: null,
      top_degree: null,
      last_company: null,
      skill_count: null,
    });

    return this.toResumeRecord({
      id,
      file_name: fileName,
      file_path: filePath,
      uploaded_at: uploadedAt,
      status: 'uploaded',
      parsed: null,
      cand_name: null,
      top_degree: null,
      last_company: null,
      skill_count: null,
    });
  }

  // 点「分析」后先做准备工作：库里标成正在分析，内存里放一张空进度表，贴好「编号 ↔ 文件位置」的便签，再让队长到后台去跑。已经在分析的，不再开第二次。
  async startAnalyze(resumeId: string) {
    // 先确认数据库能用。用不了就停，后面查简历也没意义。
    const db = this.db;
    if (!db) {
      throw new Error('数据库未就绪');
    }

    // 按页面传来的编号把这一行简历找出来。后面要把文件位置交给队长，也要看它是不是已经在分析。
    const row = await db<ResumeRow>('t_resume').where({ id: resumeId }).first();
    if (!row) {
      throw new Error('简历不存在');
    }

    // 已经在分析了：这次点击不再另开一个队长，把手头已有的进度原样退给页面。
    if (row.status === 'parsing') {
      // 进度记在内存里，后台一边跑一边改同一份。
      const runtime = this.analyzeRuntime.get(resumeId);
      return {
        resumeId,
        status: 'parsing' as const,
        // 服务重启后内存是空的，也给页面四格空进度，别让它拿到空白。
        steps: runtime?.steps ?? createInitialProgressSteps(Date.now()),
      };
    }

    // 记住现在几点开始。后面进度条上的耗时，都从这一下算。
    const analyzeStartMs = Date.now();
    // 先在库里写成「正在分析」。列表和刷新后的报告页都靠这个认出还在跑。
    await db('t_resume').where({ id: resumeId }).update({ status: 'parsing' });

    // 给这次分析准备一张空表。页面一会儿来问进度，问的就是它。这时候画像和匹配都还没有，只有「读简历」算开始了。
    this.analyzeRuntime.set(resumeId, {
      steps: createInitialProgressSteps(analyzeStartMs),
      analyzeStartMs,
      trace: [],
      profile: null,
      match: null,
      degraded: [],
    });

    // 贴便签：编号是这个，文件在这个位置。读简历的工具只有路径，靠它找回编号。
    registerAnalyzeContext(resumeId, row.file_path);
    // 如果库里已经有上一轮解析好的简历，先按编号放进内存。新的解析还没出来时，画像和匹配也不至于两手空空。
    if (row.parsed !== null && row.parsed !== undefined) {
      try {
        // 库里有时给的是一段文字，有时直接是对象，两种都收成同一份简历。
        const parsed =
          typeof row.parsed === 'string'
            ? (JSON.parse(row.parsed) as ParsedResume)
            : (row.parsed as ParsedResume);
        if (parsed && typeof parsed === 'object') {
          rememberResume(resumeId, parsed);
        }
      } catch {
        // 上一份解析结果是坏的就当没有，等这次重新读文件。
      }
    }

    // 在服务端记一笔「请求到了，队长还没开跑」。这句话不返回给页面，也不写进错误列。
    logAnalyze(
      resumeId,
      analyzeStartMs,
      'POST received, status=parsing, studio-supervisor pending',
    );

    // 队长丢到后台跑，这里不等它。页面马上就能拿到「正在分析」，不用干等整份报告。
    void this.runSupervisorInBackground(resumeId, row.file_path, analyzeStartMs);

    return {
      resumeId,
      status: 'parsing' as const,
      steps: this.analyzeRuntime.get(resumeId)?.steps ?? [],
    };
  }

  // 页面隔一秒来问一次：库里看还在不在分析，内存里把已经做出来的进度、步骤、画像、匹配交出去。
  async getAnalyzeStatus(resumeId: string) {
    const db = this.db;
    if (!db) {
      throw new Error('数据库未就绪');
    }

    const row = await db<ResumeRow>('t_resume').where({ id: resumeId }).first();
    if (!row) {
      throw new Error('简历不存在');
    }

    const runtime = this.analyzeRuntime.get(resumeId);
    let steps = runtime?.steps ?? [];
    let error = runtime?.error;

    if (row.status === 'failed' && steps.length === 0) {
      steps = createInitialProgressSteps(Date.now()).map((step) =>
        step.key === 'resume'
          ? { ...step, status: 'failed' as const, endedAt: Date.now() }
          : { ...step, status: 'failed' as const, endedAt: Date.now() },
      );
    }

    const parsedRow =
      row.parsed !== null && row.parsed !== undefined
        ? typeof row.parsed === 'string'
          ? (JSON.parse(row.parsed) as ParsedResume)
          : (row.parsed as ParsedResume)
        : null;

    const response: Record<string, unknown> = {
      status: row.status,
      steps,
      trace: runtime?.trace ?? [],
      runId: runtime?.runId ?? '',
      profile: runtime?.profile ?? null,
      match: runtime?.match ?? null,
      degraded: runtime?.degraded ?? [],
      cand_name: row.cand_name ?? parsedRow?.basic?.name ?? '',
      email: parsedRow?.basic?.email ?? '',
      top_degree: row.top_degree ?? '',
      last_company: row.last_company ?? '',
      skill_count: row.skill_count ?? 0,
    };

    if (error) {
      response.error = error;
    }

    return response;
  }

  async recomputeMatch(
    resumeId: string,
    weightsInput?: Record<string, unknown>,
  ) {
    const runtime = this.analyzeRuntime.get(resumeId);
    const cache = runtime?.matchRecomputeCache;
    if (!cache || cache.jobs.length === 0) {
      throw new Error('暂无可重算的匹配结果，请先完成一次分析');
    }

    const scoreMatchTool = this.getToolRegistry().get('score_match');
    if (!scoreMatchTool) {
      throw new Error('score_match 工具未注册');
    }

    const toRecord = (value: unknown): Record<string, unknown> =>
      value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const baseWeights = toRecord(cache.weights.dimensionWeights);
    const incoming = toRecord(weightsInput?.dimensionWeights ?? weightsInput);
    const dimensionWeights: Record<string, number> = { ...baseWeights } as Record<
      string,
      number
    >;
    for (const [key, value] of Object.entries(incoming)) {
      const num = Number(value);
      if (Number.isFinite(num)) {
        dimensionWeights[key] = num;
      }
    }

    const startedAt = Date.now();
    const match = await recomputeMatchWithWeights(
      resumeId,
      cache,
      dimensionWeights,
      scoreMatchTool,
    );
    const elapsedMs = Date.now() - startedAt;

    if (runtime) {
      runtime.match = match as Record<string, unknown>;
      runtime.matchRecomputeCache = buildMatchRecomputeCache(
        resumeId,
        match as Record<string, unknown>,
      );
    }

    return {
      match,
      modelCalls: 0,
      elapsedMs,
    };
  }

  private buildSyncProgressHints(runtime: AnalyzeRuntimeState): SyncProgressHints {
    const profileDims = runtime.profile?.dimensions;
    const matchJobs = runtime.match?.jobs;
    return {
      profilePayloadReady: Array.isArray(profileDims) && profileDims.length > 0,
      matchPayloadReady: Array.isArray(matchJobs) && matchJobs.length > 0,
      profileResolvedAt: runtime.profileResolvedAt,
      matchResolvedAt: runtime.matchResolvedAt,
    };
  }

  // 队长还在跑的时候，先把已经出来的画像和匹配从步骤里抠出来，放进那张内存表。页面不用等全部结束才看见图。
  private async refreshAnalyzeArtifacts(
    runtime: AnalyzeRuntimeState,
    supervisorSteps: Step[],
    resumeId: string,
  ) {
    const profile = await resolveProfilePayload(supervisorSteps, resumeId);
    if (profile && Array.isArray(profile.dimensions) && profile.dimensions.length > 0) {
      runtime.profile = profile;
      if (!runtime.profileResolvedAt) {
        runtime.profileResolvedAt = Date.now();
      }
    }
    let match = resolveMatchPayload(supervisorSteps);
    if (!match || !Array.isArray(match.jobs) || match.jobs.length === 0) {
      const materialized = await materializeMatchFromSession(resumeId);
      if (materialized && typeof materialized === 'object') {
        match = materialized as Record<string, unknown>;
      }
    }
    if (match && Array.isArray(match.jobs) && match.jobs.length > 0) {
      runtime.match = match;
      if (!runtime.matchResolvedAt) {
        runtime.matchResolvedAt = Date.now();
      }
      runtime.matchRecomputeCache = buildMatchRecomputeCache(resumeId, match);
    }
  }

  /**
   * 点「分析」之后，真正干活的是这个方法，而且它在后台跑，页面不用等它结束。
   * 它让队长去安排三件事：先读简历，再同时做画像和匹配，最后收尾。
   * 每走一步就把进度写进内存，页面隔一秒来问就能看到。全部结束后，再把姓名、学历、公司、技能数写回简历表。
   */
  private async runSupervisorInBackground(
    resumeId: string,
    filePath: string,
    analyzeStartMs: number,
  ) {
    // 写结果要用数据库。这时库没了，就没法收尾，直接停。前面的请求已经告诉页面「正在分析」了。
    const db = this.db;
    if (!db) {
      return;
    }

    // 取出 startAnalyze 刚放好的那张进度表。没有它，后面更新了也没处放，页面问进度会是空的。
    const runtime = this.analyzeRuntime.get(resumeId);
    if (!runtime) {
      return;
    }

    // 再贴一次便签：编号和文件位置。后台是另起的，怕前面那张便签还没被读简历的人看到。
    registerAnalyzeContext(resumeId, filePath);

    // 队长做到哪一步，先记在这份清单里。页面上的四格和步骤明细都从它算出来。
    const supervisorSteps: Step[] = [];
    // 这次跑完之后的单号，方便到步骤明细里对上是哪一次。
    let runId = '';
    // 队长最后说的那句话，一般是「编号 + 有没有哪一块没做成」。
    let output = '';

    try {
      // 服务端记一笔：队长要开跑了。这句话不给页面看。
      logAnalyze(resumeId, analyzeStartMs, 'background calling studio-supervisor');
      // 把框架里负责跑队长的那个人叫出来。
      const orchestrator = this.getOrchestrator();
      // 只告诉队长两件事：简历编号、文件在哪。整份简历正文不塞进去，免得它自己去评价、打分。
      const input = JSON.stringify({ resumeId, file_path: filePath });

      // 【核心】分析过程都在这个循环里：读简历、同时派画像和匹配、页面上的步骤一条条变长。
      // streamRun 每报一步就进来一次；生成器结束（最后一条 done 之后）循环才退出。退出表示队长这条图已经跑完，后面不再调模型。
      for await (const event of orchestrator.streamRun( // plan -> tool_calls -> invoke_agent -> execute -> observe
        'studio-supervisor',
        input,
      )) {
        // 「又走了一步」：读简历、派画像、派匹配，都会从这里进来。
        if (event.event === 'step' && event.data) {
          // 同一次派活会先报「进行中」再报「做完了」。合并成一条，别让进度条一直停在旧的「进行中」。
          const merged = mergeSupervisorIncomingStep(
            supervisorSteps,
            event.data as Step,
          );
          // 用合并后的清单换掉旧清单。
          supervisorSteps.length = 0;
          supervisorSteps.push(...merged);
          try {
            // 这一步如果已经能看出画像或匹配，先抠出来放进内存。一边做完就可以先给页面看，不用等另一边。
            await this.refreshAnalyzeArtifacts(runtime, supervisorSteps, resumeId);
          } catch (artifactError) {
            // 这一步还拼不出画像或匹配，就跳过，别把整次分析掐掉。
            logAnalyze(
              resumeId,
              analyzeStartMs,
              `refreshAnalyzeArtifacts skipped: ${
                artifactError instanceof Error ? artifactError.message : String(artifactError)
              }`,
            );
          }
          // 按清单改那四格：读简历、画像、匹配、汇总。画像绿了就先绿，匹配可以还在转。
          runtime.steps = syncProgressSteps(
            supervisorSteps,
            runtime.steps,
            analyzeStartMs,
            this.buildSyncProgressHints(runtime),
          );
          // 步骤明细也换上一版。不缩进的是队长，缩进的是它派出去的人。
          runtime.trace = flattenSupervisorTrace(supervisorSteps);
        }
        // 「收工了」：把单号、队长最后说的话，以及完整步骤留下来。
        if (event.event === 'done' && event.data) {
          const done = event.data as RunResult;
          runId = done.runId;
          output = String(done.output ?? '');
          // 收工时带了完整步骤，就用这份盖过边跑边记的那份，免得最后缺几步。
          if (Array.isArray(done.steps) && done.steps.length > 0) {
            supervisorSteps.length = 0;
            supervisorSteps.push(...done.steps);
          }
        }
      }

      // 【收尾 1】对齐进度。图已经停了，用最终 steps 再刷一次单号、步骤明细、画像、匹配和四格。
      // 单号交给页面，步骤明细标题旁边能看到这次是哪一单。
      runtime.runId = runId;
      // 收工后再整理一次步骤明细，和最后那份清单对齐。
      runtime.trace = flattenSupervisorTrace(supervisorSteps);
      // 再抠一次画像和匹配。有些结果要等收工才齐。
      await this.refreshAnalyzeArtifacts(runtime, supervisorSteps, resumeId);
      // 四格再算一遍，该绿的绿，该失败的失败。
      runtime.steps = syncProgressSteps(
        supervisorSteps,
        runtime.steps,
        analyzeStartMs,
        this.buildSyncProgressHints(runtime),
      );

      // 【收尾 2】判有没有派出去。简历读成了但画像和匹配都没派，这两格和汇总标失败，并整理 degraded。
      // 看队长有没有真的把画像、匹配派出去。只看最后一次，不看前面那条「还在跑」。
      const profileDel = findDelegation(supervisorSteps, 'profile-analyst');
      const matchDel = findDelegation(supervisorSteps, 'match-scorer');
      // 简历读成功了没有：看读简历那一步有没有带回编号。
      const resumeOk = resumeStepSucceeded(supervisorSteps);

      // 简历读完了，但画像和匹配都没派出去：这两格和汇总都标失败，别让它们一直转圈。
      if (resumeOk && !profileDel && !matchDel) {
        runtime.steps = markAllWorkersFailed(runtime.steps);
      }

      // 整理「哪一块没做成、为什么」。比如队长没去叫读简历的人。
      let degraded = buildDegradedList(supervisorSteps, output);

      // 【收尾 3】交给页面。从步骤里取出画像和匹配；人派出去了但结果是空的，补进 degraded。
      // 匹配有结果时留一份缓存，权重滑块重算时用这份，不再问模型。
      const profile = await resolveProfilePayload(supervisorSteps, resumeId);
      const match = resolveMatchPayload(supervisorSteps);
      runtime.profile = profile;
      runtime.match = match;
      // 人派出去了，但交回来是空的，也算这一块没做成，补进上面那份清单。
      degraded = appendWorkerPayloadDegraded(
        degraded,
        supervisorSteps,
        profile,
        match,
      );
      runtime.degraded = degraded;
      // 匹配有结果的话，留一份给后面的权重滑块。滑块再算分时不再问模型。
      if (match) {
        runtime.matchRecomputeCache = buildMatchRecomputeCache(
          resumeId,
          match,
        );
      }

      // 【收尾 4】写回简历表。读简历失败则这一行 status=failed；读出来了则写入 parsed 和姓名、学历、公司、技能数，status=parsed。
      // 整份简历：内存里有就用内存的，没有就从「读简历」那一步留下的结果里拿。
      const parsed = resolveParsedResume(resumeId, supervisorSteps) as ParsedResume | null;
      // 挑一句人话当错误说明。读简历失败，或队长读完却什么都没派，都会落在这里。
      const analyzeError = resolveAnalyzeError(supervisorSteps, output, degraded);
      runtime.error = analyzeError;

      // 简历这一步没做成，就整单失败。列表这一行还留着，只是状态变成失败。
      const resumeFailed = degraded.some((item) => item.key === 'resume');
      if (resumeFailed) {
        await db('t_resume').where({ id: resumeId }).update({ status: 'failed' });
        logAnalyze(resumeId, analyzeStartMs, `analyze failed: ${analyzeError ?? 'resume'}`);
        return;
      }

      // 简历读出来了：把姓名、最高学历、最近一家公司、技能个数写回已有的列，状态改成已解析。
      if (parsed) {
        const candName = parsed.basic?.name ?? '';
        // 几段教育经历里，取最高的那一档，比如博士高于本科。
        const topDegree = this.deriveTopDegree(parsed.education ?? []);
        // 工作经历的第一条，当成最近一家公司。
        const lastCompany = parsed.experience?.[0]?.company ?? '';
        const skillCount = Array.isArray(parsed.skills) ? parsed.skills.length : 0;

        await db('t_resume')
          .where({ id: resumeId })
          .update({
            status: 'parsed',
            // 整份简历存成一段文字，不要再套一层引号，也不要改列名。
            parsed: JSON.stringify(parsed),
            cand_name: candName || null,
            top_degree: topDegree || null,
            last_company: lastCompany || null,
            skill_count: skillCount,
          });
      } else {
        // 没拿到整份简历，但读简历那步也没判失败：只把状态改成已解析，四列留空。
        await db('t_resume').where({ id: resumeId }).update({ status: 'parsed' });
      }

      // 记一笔做完了，带上单号和走了哪些步，方便对着日志看。
      logAnalyze(
        resumeId,
        analyzeStartMs,
        `studio-supervisor done runId=${runId} steps=${summarizeSteps(supervisorSteps)}`,
      );
    } catch (error) {
      // 分两种失败：写数据库失败，和读简历、跑队长过程中的失败。页面上只留一句人话。
      const isDbError =
        typeof error === 'object' &&
        error !== null &&
        ('sqlMessage' in error ||
          /ER_|SQL/i.test(String((error as Error).message)));
      // 写库失败用数据库自己的那句说明；别的失败用错误的第一行。不把整段简历、整段 SQL、堆栈甩给页面。
      const message = isDbError
        ? formatDbError(error)
        : formatParseError(error);

      runtime.error = message;
      // 还没做完的那几格标成失败，进度条别一直停在「等待中」。
      runtime.steps = markIncompleteStepsFailed(runtime.steps);

      try {
        // 这一行简历留在列表里，状态改成失败。
        await db('t_resume').where({ id: resumeId }).update({ status: 'failed' });
        logAnalyze(
          resumeId,
          analyzeStartMs,
          isDbError ? `db write failed: ${message}` : `analyze failed: ${message}`,
        );
      } catch (dbError) {
        // 连「改成失败」都写不进去：页面上改成写库失败的那一句。
        runtime.error = formatDbError(dbError);
        logAnalyze(
          resumeId,
          analyzeStartMs,
          `db write failed: ${runtime.error}`,
        );
      }
    }
  }

  private deriveTopDegree(education: ParsedEducation[]): string {
    let top = '';
    let rank = 0;

    for (const item of education) {
      const degree = item.degree ?? '';
      for (const [label, value] of Object.entries(DEGREE_RANK)) {
        if (degree.includes(label) && value > rank) {
          rank = value;
          top = label;
        }
      }
    }

    return top;
  }

  async getResume(id: string) {
    const db = this.db;
    if (!db) {
      return null;
    }

    const row = await db<ResumeRow>('t_resume').where({ id }).first();
    return row ? this.toResumeRecord(row) : null;
  }

  async getResumeList({
    keyword,
    fileName,
    status,
    page,
    size,
  }: {
    keyword?: string;
    fileName?: string;
    status?: string;
    page: number;
    size: number;
  }) {
    const db = this.db;
    if (!db) {
      return { list: [], total: 0, page, size };
    }

    const searchKeyword = keyword || fileName;

    const applyFilters = <T extends { andWhere: (...args: unknown[]) => T }>(
      query: T,
    ) => {
      if (searchKeyword) {
        query = query.andWhere('file_name', 'like', `%${searchKeyword}%`);
      }
      if (status && RESUME_STATUSES.includes(status as ResumeStatus)) {
        query = query.andWhere('status', status);
      }
      return query;
    };

    const countRow = await applyFilters(
      db('t_resume').count<{ count: number | string }>('id as count'),
    ).first();
    const total = Number(countRow?.count ?? 0);

    const offset = (page - 1) * size;
    const rows = await applyFilters(db<ResumeRow>('t_resume').select('*'))
      .orderBy('uploaded_at', 'desc')
      .limit(size)
      .offset(offset);

    return {
      list: rows.map((row) => this.toResumeRecord(row)),
      total,
      page,
      size,
    };
  }

  async deleteResume(id: string) {
    const db = this.db;
    if (!db) {
      throw new Error('数据库未就绪');
    }

    const row = await db<ResumeRow>('t_resume').where({ id }).first();
    if (!row) {
      throw new Error('简历不存在');
    }

    await db('t_resume').where({ id }).delete();
    this.analyzeRuntime.delete(id);

    const resumeDir = path.join(this.resumeRoot, id);
    if (fs.existsSync(resumeDir)) {
      fs.rmSync(resumeDir, { recursive: true, force: true });
    }

    return { id };
  }

  async getJobList({
    title,
    company,
    city,
    level,
    page,
    size,
  }: {
    title?: string;
    company?: string;
    city?: string;
    level?: string;
    page: number;
    size: number;
  }) {
    const db = this.db;
    if (!db) {
      throw new Error('数据库未就绪');
    }

    const applyFilters = this.buildJobFilterModifier({ title, company, city, level });
    const offset = (page - 1) * size;

    const rows = await db('t_job')
      .select('id', 'title', 'company', 'city', 'level', 'salary_range')
      .modify(applyFilters)
      .orderBy('created_at', 'desc')
      .limit(size)
      .offset(offset);

    const countRow = await db('t_job')
      .count('id as count')
      .modify(applyFilters)
      .first();

    const total = Number((countRow as { count?: string | number } | undefined)?.count ?? 0);

    return {
      list: rows as JobRow[],
      total,
      page,
      size,
    };
  }

  private buildJobFilterModifier(filters: {
    title?: string;
    company?: string;
    city?: string;
    level?: string;
  }) {
    return (query: { where: (...args: unknown[]) => unknown }) => {
      if (filters.title && filters.title.trim() !== '') {
        query.where('title', 'like', `%${filters.title.trim()}%`);
      }
      if (filters.company && filters.company.trim() !== '') {
        query.where('company', 'like', `%${filters.company.trim()}%`);
      }
      if (filters.city && filters.city.trim() !== '') {
        query.where('city', 'like', `%${filters.city.trim()}%`);
      }
      if (filters.level && filters.level.trim() !== '') {
        query.where('level', 'like', `%${filters.level.trim()}%`);
      }
    };
  }

  private toResumeRecord(row: ResumeRow) {
    let parsed: unknown;
    if (row.parsed !== null && row.parsed !== undefined) {
      parsed =
        typeof row.parsed === 'string' ? JSON.parse(row.parsed) : row.parsed;
    }

    return {
      id: row.id,
      fileName: row.file_name,
      uploadedAt: moment(row.uploaded_at).format('YYYY-MM-DD HH:mm:ss'),
      status: STATUS_LABELS[row.status] ?? row.status,
      cand_name: row.cand_name ?? null,
      top_degree: row.top_degree ?? null,
      last_company: row.last_company ?? null,
      skill_count: row.skill_count ?? null,
      ...(parsed !== undefined ? { parsed } : {}),
    };
  }

  get(id: string) {
    return this.getResume(id);
  }

  getList(params: {
    fileName?: string;
    status?: string;
    page: number;
    size: number;
  }) {
    return this.getResumeList(params);
  }

  remove(id: string) {
    return this.deleteResume(id);
  }
}
