import type { AgentDefinition } from '@fsiaonma/elpis';

const agent: AgentDefinition = {
  name: 'resume-analyst',
  skills: [],
  tools: ['parse_resume'],
  model: 'qwen',
  promptFile: '../prompts/resume-studio-analyst.prompt.js',
};

export default agent;
