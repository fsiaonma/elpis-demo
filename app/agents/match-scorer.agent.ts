import type { AgentDefinition } from '@fsiaonma/elpis';

const agent: AgentDefinition = {
  name: 'match-scorer',
  skills: ['match-rank'],
  tools: [
    'normalize_skills',
    'list_jobs',
    'get_job_requirements',
    'recall_jobs',
    'score_match',
  ],
  model: 'qwen',
  promptFile: '../prompts/resume-studio-match.prompt.js',
};

export default agent;
