import type { AgentDefinition } from '@fsiaonma/elpis';

// 这是队长本人：只会派人，不会自己读简历、判级或算分。先派谁、后派谁，写在旁边那份 prompt 里。
const agent: AgentDefinition = {
  name: 'studio-supervisor',
  skills: [],
  tools: ['invoke_agent'],
  model: 'qwen',
  promptFile: '../prompts/resume-studio-supervisor.prompt.js',
};

export default agent;
