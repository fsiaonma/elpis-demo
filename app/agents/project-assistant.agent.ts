import type { AgentDefinition } from '@fsiaonma/elpis';

const agent: AgentDefinition = {
  name: 'project-assistant',
  skills: ['project-query'],
  tools: ['service-invoke', 'list_directory', 'write_file', 'retrieve'],
  promptFile: '../prompts/project-assistant.prompt.js',
};

export default agent;
