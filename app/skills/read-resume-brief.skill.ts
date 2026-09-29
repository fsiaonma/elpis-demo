import type { SkillContext, SkillDefinition } from '@fsiaonma/elpis';
import { readResume, resolveResumeId } from '../modules/resume/analysis-session';

type ParsedResume = {
  basic?: { name?: string | null };
  education?: Array<{ degree?: string | null }>;
  experience?: Array<{ company?: string | null; highlights?: string[] }>;
  projects?: Array<{ highlights?: string[] }>;
  skills?: string[];
};

function truncateText(value: unknown, maxLen: number): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function buildBrief(parsed: ParsedResume) {
  const companies = (parsed.experience ?? [])
    .map((item) => String(item.company ?? '').trim())
    .filter(Boolean)
    .slice(0, 6);

  const skills = (parsed.skills ?? []).slice(0, 30);

  const evidence: string[] = [];
  for (const item of parsed.experience ?? []) {
    for (const line of item.highlights ?? []) {
      if (evidence.length >= 8) break;
      const text = truncateText(line, 60);
      if (text) evidence.push(text);
    }
    if (evidence.length >= 8) break;
  }
  for (const project of parsed.projects ?? []) {
    for (const line of project.highlights ?? []) {
      if (evidence.length >= 8) break;
      const text = truncateText(line, 60);
      if (text) evidence.push(text);
    }
    if (evidence.length >= 8) break;
  }

  return {
    name: String(parsed.basic?.name ?? '').trim() || null,
    degree: String(parsed.education?.[0]?.degree ?? '').trim() || null,
    companies,
    skills,
    evidence,
  };
}

const readResumeBriefSkill: SkillDefinition = {
  name: 'read_resume_brief',
  description: '从会话表读取已解析简历的短摘要（姓名、学历、公司、技能、证据），零模型调用。',
  inputSchema: {
    type: 'object',
    properties: {
      resumeId: { type: 'string' },
    },
    required: ['resumeId'],
  },
  async execute(input: unknown, ctx: SkillContext): Promise<unknown> {
    void ctx;
    const resumeId = resolveResumeId(input);
    const parsed = readResume(resumeId);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('简历摘要未就绪');
    }
    return buildBrief(parsed as ParsedResume);
  },
};

export default readResumeBriefSkill;
