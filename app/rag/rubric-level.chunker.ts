export interface Chunk {
  id: string;
  docId: string;
  text: string;
  meta?: Record<string, unknown>;
}

const LEVEL_SECTION = /^【(L[1-5])】/;

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function parseDimension(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : null;
}

function resolveFileDocId(meta?: Record<string, unknown>): string {
  if (typeof meta?.docId === 'string' && meta.docId.trim() !== '') {
    return meta.docId.trim();
  }
  return 'document.md';
}

export class RubricLevelChunker {
  chunk(text: string, meta?: Record<string, unknown>): Chunk[] {
    const normalized = normalizeNewlines(text).trim();
    if (!normalized) {
      return [];
    }

    const dimension = parseDimension(normalized);
    if (!dimension) {
      return [];
    }

    const fileDocId = resolveFileDocId(meta);
    const afterTitle = normalized.replace(/^#\s+[^\n]+\n?/, '');
    const chunks: Chunk[] = [];

    const firstLevel = afterTitle.search(/^## 【L1】/m);
    if (firstLevel > 0) {
      const overviewBody = afterTitle.slice(0, firstLevel).trim();
      if (overviewBody) {
        const docId = `${fileDocId}#overview`;
        chunks.push({
          id: docId,
          docId,
          text: `${dimension} overview\n${overviewBody}`,
          meta: { dimension, level: 'overview' },
        });
      }
    }

    const sectionParts = afterTitle.split(/^## /m).filter((part) => part.trim() !== '');
    for (const part of sectionParts) {
      const levelMatch = part.match(LEVEL_SECTION);
      if (!levelMatch) {
        continue;
      }
      if (part.startsWith('常见误判')) {
        continue;
      }

      const level = levelMatch[1];
      const fullSection = `## ${part.trim()}`;
      const docId = `${fileDocId}#${level}`;

      chunks.push({
        id: docId,
        docId,
        text: `${dimension} 【${level}】\n${fullSection}`,
        meta: { dimension, level },
      });
    }

    return chunks;
  }
}
