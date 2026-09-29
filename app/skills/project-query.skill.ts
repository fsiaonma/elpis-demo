import type { SkillContext, SkillDefinition } from '@fsiaonma/elpis';
import { createRequire } from 'module';
import * as path from 'path';

const runtimeRequire = createRequire(__filename);
const { ProjectService } = runtimeRequire(
  path.resolve(process.cwd(), 'node_modules/@fsiaonma/elpis/dist/modules/project/project.service'),
) as {
  ProjectService: new (modelService: unknown) => {
    get: (projKey: string) => Record<string, unknown> | undefined;
  };
};
const { ModelService } = runtimeRequire(
  path.resolve(process.cwd(), 'node_modules/@fsiaonma/elpis/dist/modules/project/model.service'),
) as { ModelService: new () => unknown };

type ProjectQueryInput = {
  projKey: string;
};

type BriefProject = {
  modelKey?: string;
  key?: string;
  name?: string;
  desc?: string;
  homePage?: string;
};

const projectService = new ProjectService(new ModelService());

function toBriefProject(project: Record<string, unknown>): BriefProject {
  const { modelKey, key, name, desc, homePage } = project;
  return { modelKey, key, name, desc, homePage } as BriefProject;
}

const projectQuerySkill: SkillDefinition = {
  name: 'project-query',
  description: '按 projKey 查询项目配置，返回 ProjectService 真实 JSON（简短、给模型看）',
  inputSchema: {
    type: 'object',
    properties: {
      projKey: { type: 'string' },
    },
    required: ['projKey'],
  },
  async execute(input: unknown, ctx: SkillContext): Promise<unknown> {
    void ctx;
    const { projKey } = input as ProjectQueryInput;
    if (!projKey || typeof projKey !== 'string') {
      throw new Error('projKey 不能为空');
    }

    const project = projectService.get(projKey);
    if (!project) {
      throw new Error(`项目不存在: ${projKey}`);
    }

    return toBriefProject(project);
  },
};

export default projectQuerySkill;
