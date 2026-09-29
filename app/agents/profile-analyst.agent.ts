import type { AgentDefinition } from '@fsiaonma/elpis';

const agent: AgentDefinition = {
  name: 'profile-analyst',
  skills: ['read_resume_brief'],
  tools: ['retrieve'],
  model: 'qwen',
  promptFile: '../prompts/resume-studio-profile.prompt.js',
};

export default agent;
