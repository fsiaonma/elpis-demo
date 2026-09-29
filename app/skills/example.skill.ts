import type { SkillDefinition, SkillContext } from '@fsiaonma/elpis';

const skill: SkillDefinition = {
  name: 'example',
  description: 'Example skill placeholder',
  inputSchema: {},
  async execute(input: unknown, ctx: SkillContext): Promise<unknown> {
    void input;
    void ctx;
    return null;
  },
};

export default skill;
