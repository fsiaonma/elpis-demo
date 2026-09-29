import type { LlmChatOptions, LlmMessage, LlmProvider } from '@fsiaonma/elpis';

const LOCAL_REPLY = '[local] 内网自部署模型返回';

type ProviderEntry = {
  baseURL?: string;
  model?: string;
  apiKey?: string;
};

export class LocalProvider implements LlmProvider {
  constructor(_entry: ProviderEntry) {}

  async chat(
    _messages: LlmMessage[],
    _options?: LlmChatOptions,
  ): Promise<LlmMessage> {
    return {
      role: 'assistant',
      content: LOCAL_REPLY,
    };
  }

  async *streamChat(
    _messages: LlmMessage[],
    _options?: LlmChatOptions,
  ): AsyncGenerator<{ content: string }, LlmMessage> {
    for (const chunk of LOCAL_REPLY) {
      yield { content: chunk };
    }

    return {
      role: 'assistant',
      content: LOCAL_REPLY,
    };
  }
}
