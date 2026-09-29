import type { LlmChatOptions, LlmMessage, LlmProvider } from '@fsiaonma/elpis';

const MOCK_REPLY = '[mock] Mock provider offline reply';

type ProviderEntry = {
  baseURL?: string;
  model?: string;
  apiKey?: string;
};

export class MockProvider implements LlmProvider {
  constructor(_entry: ProviderEntry) {}

  async chat(
    _messages: LlmMessage[],
    _options?: LlmChatOptions,
  ): Promise<LlmMessage> {
    return {
      role: 'assistant',
      content: MOCK_REPLY,
    };
  }
}
