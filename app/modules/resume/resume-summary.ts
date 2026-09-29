const MAX_PROJECT_FIELD = 200;
const MAX_HIGHLIGHTS = 3;
const MAX_HIGHLIGHT_LEN = 120;

function truncateText(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function trimHighlights(highlights: unknown): string[] {
  if (!Array.isArray(highlights)) return [];
  return highlights
    .map((item) => truncateText(item, MAX_HIGHLIGHT_LEN))
    .filter((item): item is string => Boolean(item))
    .slice(0, MAX_HIGHLIGHTS);
}

function trimProjects(projects: unknown): unknown[] {
  if (!Array.isArray(projects)) return [];
  return projects.map((project) => {
    if (!project || typeof project !== 'object') return project;
    const record = project as Record<string, unknown>;
    return {
      ...record,
      name: truncateText(record.name, MAX_PROJECT_FIELD),
      role: truncateText(record.role, MAX_PROJECT_FIELD),
      description: truncateText(record.description, MAX_PROJECT_FIELD),
      highlights: trimHighlights(record.highlights),
    };
  });
}

export function buildResumeSummary(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  const source = parsed as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  if (source.basic !== undefined) summary.basic = source.basic;
  if (source.education !== undefined) summary.education = source.education;
  if (source.experience !== undefined) summary.experience = source.experience;
  if (source.skills !== undefined) summary.skills = source.skills;
  if (source.projects !== undefined) summary.projects = trimProjects(source.projects);

  return summary;
}
