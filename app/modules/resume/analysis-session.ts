type ToolResultEntry = {
  toolName: string;
  result: unknown;
  recordedAt: number;
};

type SessionEntry = {
  parsed?: unknown;
  tools: ToolResultEntry[];
};

const sessions = new Map<string, SessionEntry>();
const analyzeContextByPath = new Map<string, string>();
let latestResumeId: string | null = null;

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').trim();
}

export function extractResumeIdFromPath(filePath: string): string | null {
  const normalized = normalizePath(filePath);
  const match = normalized.match(/data\/resumes\/([^/]+)\//i);
  return match?.[1] ?? null;
}

export function registerAnalyzeContext(resumeId: string, filePath: string): void {
  const id = resumeId.trim();
  if (!id) return;
  latestResumeId = id;
  const normalized = normalizePath(filePath);
  if (normalized) {
    analyzeContextByPath.set(normalized, id);
  }
  const fromPath = extractResumeIdFromPath(filePath);
  if (fromPath) {
    analyzeContextByPath.set(`resume://${fromPath}`, id);
  }
}

export function resolveAnalyzeResumeId(filePath: string): string | null {
  const normalized = normalizePath(filePath);
  if (analyzeContextByPath.has(normalized)) {
    return analyzeContextByPath.get(normalized) ?? null;
  }
  return extractResumeIdFromPath(filePath);
}

function ensureSession(resumeId: string): SessionEntry {
  let entry = sessions.get(resumeId);
  if (!entry) {
    entry = { tools: [] };
    sessions.set(resumeId, entry);
  }
  return entry;
}

export function rememberResume(resumeId: string, parsed: unknown): void {
  const entry = ensureSession(resumeId);
  entry.parsed = parsed;
  latestResumeId = resumeId;
}

export function readResume(resumeId: string): unknown | null {
  return sessions.get(resumeId)?.parsed ?? null;
}

export function rememberTool(resumeId: string, toolName: string, result: unknown): void {
  const entry = ensureSession(resumeId);
  entry.tools.push({
    toolName,
    result,
    recordedAt: Date.now(),
  });
}

export function readTools(resumeId: string, toolName: string): unknown[] {
  const entry = sessions.get(resumeId);
  if (!entry) return [];
  return entry.tools.filter((item) => item.toolName === toolName).map((item) => item.result);
}

export function resolveResumeId(input: unknown): string {
  const args = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const provided = args.resumeId;
  if (typeof provided === 'string' && provided.trim()) {
    return provided.trim();
  }
  if (latestResumeId) {
    return latestResumeId;
  }
  if (sessions.size === 0) {
    throw new Error('缺少 resumeId');
  }
  const keys = [...sessions.keys()];
  return keys[keys.length - 1] ?? '';
}
