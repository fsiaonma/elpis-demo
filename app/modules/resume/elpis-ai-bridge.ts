import { createRequire } from 'module';
import { dirname, join } from 'path';
import type { AgentStreamEvent, RunResult } from '@fsiaonma/elpis/nest';

const nestEntry = require.resolve('@fsiaonma/elpis/nest');
const elpisRoot = dirname(nestEntry);
const elpisRequire = createRequire(nestEntry);

function loadElpis<T>(relativeDistPath: string): T {
  return elpisRequire(join(elpisRoot, relativeDistPath)) as T;
}

export type LangGraphOrchestratorService = {
  run(agentName: string, input: unknown, threadId?: string): Promise<RunResult>;
  streamRun(
    agentName: string,
    input: unknown,
    threadId?: string,
  ): AsyncGenerator<AgentStreamEvent>;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  source?: 'builtin' | 'mcp';
  execute(input: unknown): Promise<unknown>;
};

export type ToolRegistryService = {
  get(name: string): ToolDefinition | undefined;
  register(tool: ToolDefinition): void;
};

export function resolveLangGraphOrchestratorServiceClass(): new (
  ...args: unknown[]
) => LangGraphOrchestratorService {
  const mod = loadElpis<{
    LangGraphOrchestratorService: new (...args: unknown[]) => LangGraphOrchestratorService;
  }>('dist/ai/runtime/langgraph/langgraph-orchestrator.service.js');
  return mod.LangGraphOrchestratorService;
}

export function resolveToolRegistryServiceClass(): new (
  ...args: unknown[]
) => ToolRegistryService {
  const mod = loadElpis<{
    ToolRegistryService: new (...args: unknown[]) => ToolRegistryService;
  }>('dist/ai/tool/tool-registry.service.js');
  return mod.ToolRegistryService;
}

/** @deprecated use resolveToolRegistryServiceClass */
export const resolveToolRegistryClass = resolveToolRegistryServiceClass;
