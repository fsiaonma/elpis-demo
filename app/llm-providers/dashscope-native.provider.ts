import type { LlmChatOptions, LlmMessage, LlmProvider } from '@fsiaonma/elpis';

type ProviderEntry = {
  baseURL?: string;
  model?: string;
  apiKey?: string;
};

const DEFAULT_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

/** DashScope 原生协议对照标本；本节不挂 models、不发起 HTTP。 */
export class DashScopeNativeProvider implements LlmProvider {
  private readonly baseURL: string;
  private readonly model: string;
  private readonly apiKey: string;

  constructor(entry: ProviderEntry) {
    this.baseURL = entry.baseURL || DEFAULT_URL;
    this.model = entry.model || 'qwen-plus';
    this.apiKey = entry.apiKey || '';
  }

  async chat(
    messages: LlmMessage[],
    options?: LlmChatOptions,
  ): Promise<LlmMessage> {
    void this.buildRequest(messages, options?.stream === true);
    throw new Error('DashScopeNativeProvider is a reference specimen only');
  }

  async *streamChat(
    messages: LlmMessage[],
    _options?: LlmChatOptions,
  ): AsyncGenerator<{ content: string }, LlmMessage> {
    void this.buildRequest(messages, true);
    throw new Error('DashScopeNativeProvider is a reference specimen only');
  }

  private buildRequest(messages: LlmMessage[], stream: boolean) {
    return {
      url: this.baseURL,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(stream ? { 'X-DashScope-SSE': 'enable' } : {}),
      },
      body: {
        model: this.model,
        input: { messages },
        parameters: {
          result_format: 'message',
          incremental_output: stream,
        },
      },
    };
  }
}
