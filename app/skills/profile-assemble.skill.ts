import type { SkillDefinition, SkillContext } from '@fsiaonma/elpis';

const DIMENSIONS = [
  '技术深度',
  '工程能力',
  '业务理解',
  '项目影响力',
  '协作沟通',
  '成长性',
] as const;

const LEVEL_RANGES: Record<string, { min: number; max: number }> = {
  L1: { min: 0, max: 40 },
  L2: { min: 41, max: 58 },
  L3: { min: 59, max: 72 },
  L4: { min: 73, max: 88 },
  L5: { min: 89, max: 100 },
};

const DEFAULT_FEATURE_COUNT = 4;
const MAX_HIT_FEATURES = 4;

type RubricRef = {
  docId?: string;
  text?: string;
};

type Judgment = {
  dimension?: string;
  level?: string | null;
  hitFeatures?: unknown;
  rubricRef?: RubricRef | string | null;
  resumeRef?: unknown;
};

type DimensionResult = {
  dimension: string;
  level: string | null;
  score: number;
  hitFeatures: string[];
  rubricRef: RubricRef | string | null;
  resumeRef: string;
};

function normalizeRubricRef(value: unknown): RubricRef | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const record = value as RubricRef;
    return {
      docId: typeof record.docId === 'string' ? record.docId : undefined,
      text: typeof record.text === 'string' ? record.text : undefined,
    };
  }
  return null;
}

function normalizeResumeRef(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join('；');
  }
  return '';
}

function normalizeHitFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function countBehaviorFeatures(rubricRef: RubricRef | string | null): number {
  const text =
    typeof rubricRef === 'string'
      ? rubricRef
      : typeof rubricRef?.text === 'string'
        ? rubricRef.text
        : '';
  if (!text) return 0;

  const lines = text.split('\n');
  let inFeatures = false;
  let count = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/行为特征/.test(trimmed)) {
      inFeatures = true;
      continue;
    }
    if (inFeatures && /^#{1,3}\s/.test(trimmed) && !/^[-*]/.test(trimmed)) {
      if (/行为特征/.test(trimmed)) continue;
      break;
    }
    if (inFeatures && /^[-*]\s+/.test(trimmed)) {
      count += 1;
    }
  }

  return count;
}

function resolveScoringLevel(rawLevel: unknown): string {
  const level = rawLevel === null || rawLevel === undefined ? '' : String(rawLevel);
  return LEVEL_RANGES[level] ? level : 'L2';
}

function scoreFromLevel(
  level: string,
  hitFeatures: string[],
  rubricRef: RubricRef | string | null,
): number {
  const range = LEVEL_RANGES[level] ?? LEVEL_RANGES.L2;
  const width = range.max - range.min;

  let totalFeatures = countBehaviorFeatures(rubricRef);
  if (totalFeatures <= 0) {
    totalFeatures = DEFAULT_FEATURE_COUNT;
  }

  const hitCount = Math.min(hitFeatures.length, MAX_HIT_FEATURES);
  return Math.round(range.min + (hitCount / totalFeatures) * width);
}

function buildSkillsWall(resume: unknown): Array<{ name: string; count: number }> {
  if (!resume || typeof resume !== 'object') return [];
  const skills = (resume as { skills?: unknown }).skills;
  if (!Array.isArray(skills)) return [];

  const counts = new Map<string, number>();
  for (const skill of skills) {
    const name = String(skill).trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

function pickStrengthsWeaknesses(dimensions: DimensionResult[]): {
  strengths: string[];
  weaknesses: string[];
} {
  const ranked = [...dimensions].sort((left, right) => right.score - left.score);

  return {
    strengths: ranked.slice(0, 2).map((item) => item.dimension),
    weaknesses: ranked.slice(-2).map((item) => item.dimension),
  };
}

const skill: SkillDefinition = {
  name: 'profile-assemble',
  description: 'Assemble profile dimensions, strengths, weaknesses, and skills wall deterministically.',
  inputSchema: {
    type: 'object',
    properties: {
      judgments: { type: 'array' },
      resume: { type: 'object' },
    },
    required: ['judgments', 'resume'],
  },
  async execute(input: unknown, ctx: SkillContext): Promise<unknown> {
    void ctx;

    const payload = (input && typeof input === 'object' ? input : {}) as {
      judgments?: Judgment[];
      resume?: unknown;
    };

    const judgmentMap = new Map<string, Judgment>();
    for (const item of payload.judgments ?? []) {
      if (item?.dimension) judgmentMap.set(item.dimension, item);
    }

    const dimensions: DimensionResult[] = DIMENSIONS.map((dimension) => {
      const judgment = judgmentMap.get(dimension);
      const hitFeatures = normalizeHitFeatures(judgment?.hitFeatures);
      const rubricRef = normalizeRubricRef(judgment?.rubricRef);
      const resumeRef = normalizeResumeRef(judgment?.resumeRef);

      const rawLevel = judgment?.level;
      const declaredLevel =
        rawLevel === null || rawLevel === undefined
          ? null
          : LEVEL_RANGES[String(rawLevel)]
            ? String(rawLevel)
            : null;
      const scoringLevel = resolveScoringLevel(rawLevel);
      const score = scoreFromLevel(scoringLevel, hitFeatures, rubricRef);

      return {
        dimension,
        level: declaredLevel ?? scoringLevel,
        score,
        hitFeatures,
        rubricRef,
        resumeRef,
      };
    });

    const { strengths, weaknesses } = pickStrengthsWeaknesses(dimensions);

    return {
      dimensions,
      strengths,
      weaknesses,
      skills: buildSkillsWall(payload.resume),
    };
  },
};

export default skill;
