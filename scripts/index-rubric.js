#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RUBRIC_DIR = path.resolve(process.cwd(), 'data/knowledge/rubric');
const EMBED_BATCH_SIZE = 10;

function mergeDeep(target, source) {
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      mergeDeep(targetValue, sourceValue);
      continue;
    }

    target[key] = sourceValue;
  }
  return target;
}

function loadConfig() {
  const configDir = path.resolve(__dirname, '../config');
  const merged = {};
  mergeDeep(merged, require(path.join(configDir, 'config.default.js')));
  const localPath = path.join(configDir, 'config.local.js');
  if (fs.existsSync(localPath)) {
    mergeDeep(merged, require(localPath));
  }
  return merged;
}

function parseArgs(argv) {
  const options = {
    chunker: 'level',
    compareQuery: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--chunker=')) {
      options.chunker = arg.slice('--chunker='.length);
    } else if (arg.startsWith('--compare=')) {
      options.compareQuery = arg.slice('--compare='.length);
    } else if (arg === '--compare' && argv[i + 1]) {
      i += 1;
      options.compareQuery = argv[i];
    }
  }

  return options;
}

function listRubricFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => path.join(dir, name));
}

function chunkBySize(text, docId, size, overlap) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized || size <= 0) {
    return [];
  }

  const step = Math.max(size - overlap, 1);
  const chunks = [];

  for (let start = 0; start < normalized.length; start += step) {
    const end = Math.min(start + size, normalized.length);
    const slice = normalized.slice(start, end).trim();
    if (!slice) {
      continue;
    }

    const index = String(chunks.length).padStart(3, '0');
    const chunkId = `${docId}#chunk_${index}`;
    chunks.push({
      id: chunkId,
      docId,
      text: slice,
      meta: { docId, chunkIndex: chunks.length },
    });

    if (end >= normalized.length) {
      break;
    }
  }

  return chunks;
}

function chunkDocuments(files, config, mode) {
  const allChunks = [];
  let docCount = 0;

  if (mode === 'size') {
    const size = config.ai?.rag?.chunk?.size ?? 500;
    const overlap = config.ai?.rag?.chunk?.overlap ?? 80;

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const docId = path.basename(filePath);
      const chunks = chunkBySize(content, docId, size, overlap);
      if (chunks.length === 0) {
        continue;
      }
      docCount += 1;
      allChunks.push(...chunks);
    }

    return { docCount, chunks: allChunks };
  }

  const { RubricLevelChunker } = require('../dist/rag/rubric-level.chunker');
  const chunker = new RubricLevelChunker();

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const docId = path.basename(filePath);
    const chunks = chunker.chunk(content, { docId, sourcePath: filePath });
    if (chunks.length === 0) {
      continue;
    }
    docCount += 1;
    allChunks.push(...chunks);
  }

  return { docCount, chunks: allChunks };
}

function resolveEmbeddingConfig(config) {
  const embedding = config.ai?.embedding;
  if (!embedding?.default) {
    throw new Error('ai.embedding.default is missing');
  }
  const modelName = embedding.default;
  const modelConfig = embedding.models?.[modelName];
  if (!modelConfig) {
    throw new Error(`ai.embedding.models.${modelName} is missing`);
  }
  if (!modelConfig.baseURL || !modelConfig.model) {
    throw new Error(`embedding model "${modelName}" requires baseURL and model`);
  }
  if (!modelConfig.apiKey) {
    throw new Error(`embedding model "${modelName}" apiKey is missing (set config.local.js)`);
  }

  return {
    baseURL: String(modelConfig.baseURL).replace(/\/$/, ''),
    model: modelConfig.model,
    apiKey: modelConfig.apiKey,
  };
}

async function embedTexts(texts, embeddingConfig) {
  const vectors = [];

  for (let offset = 0; offset < texts.length; offset += EMBED_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + EMBED_BATCH_SIZE);
    const response = await fetch(`${embeddingConfig.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${embeddingConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: embeddingConfig.model,
        input: batch,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`embeddings failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    const items = Array.isArray(data.data) ? data.data : [];
    items.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const item of items) {
      if (!Array.isArray(item.embedding)) {
        throw new Error('embeddings response missing embedding array');
      }
      vectors.push(item.embedding);
    }
  }

  if (vectors.length !== texts.length) {
    throw new Error(`expected ${texts.length} embeddings, got ${vectors.length}`);
  }

  return vectors;
}

function stablePointId(recordId) {
  const hash = crypto.createHash('sha256').update(recordId).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

async function qdrantRequest(baseUrl, method, route, body) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${route}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qdrant ${method} ${route} failed (${response.status}): ${text}`);
  }

  return response;
}

async function recreateAndUpsert(baseUrl, collection, records) {
  if (records.length === 0) {
    throw new Error('no chunks to upsert');
  }

  try {
    await qdrantRequest(baseUrl, 'DELETE', `/collections/${encodeURIComponent(collection)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('404')) {
      throw error;
    }
  }

  const vectorSize = records[0].embedding.length;
  await qdrantRequest(baseUrl, 'PUT', `/collections/${encodeURIComponent(collection)}`, {
    vectors: {
      size: vectorSize,
      distance: 'Cosine',
    },
  });

  const points = records.map((record) => ({
    id: stablePointId(record.id),
    vector: record.embedding,
    payload: {
      id: record.id,
      docId: record.docId,
      text: record.text,
      meta: record.meta,
    },
  }));

  await qdrantRequest(
    baseUrl,
    'PUT',
    `/collections/${encodeURIComponent(collection)}/points?wait=true`,
    { points },
  );
}

async function qdrantSearch(baseUrl, collection, embedding, topK) {
  try {
    const response = await qdrantRequest(
      baseUrl,
      'POST',
      `/collections/${encodeURIComponent(collection)}/points/search`,
      {
        vector: embedding,
        limit: topK,
        with_payload: true,
      },
    );
    const data = await response.json();
    return data.result ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('404')) {
      return [];
    }
    throw error;
  }
}

function snippet(text, maxLen = 120) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return `${normalized.slice(0, maxLen)}…`;
}

async function runCompare(config, query) {
  const vector = config.ai?.store?.vector ?? {};
  const baseUrl = vector.url || 'http://127.0.0.1:6333';
  const collection = vector.collection || 'rubric';
  const compareCollection = vector.compareCollection || 'rubric_bysize';
  const topK = config.ai?.rag?.topK ?? 3;
  const embeddingConfig = resolveEmbeddingConfig(config);

  const [queryVector] = await embedTexts([query], embeddingConfig);
  const [primaryHits, compareHits] = await Promise.all([
    qdrantSearch(baseUrl, collection, queryVector, topK),
    qdrantSearch(baseUrl, compareCollection, queryVector, topK),
  ]);

  console.log(`\n查询: ${query}\n`);
  console.log(`=== collection: ${collection} (topK=${topK}) ===`);
  if (primaryHits.length === 0) {
    console.log('(无结果 — collection 不存在或未灌库)');
  }
  for (const [index, hit] of primaryHits.entries()) {
    const payload = hit.payload ?? {};
    console.log(
      `${index + 1}. docId=${payload.docId ?? '-'} score=${hit.score?.toFixed(4) ?? '-'}`,
    );
    console.log(`   ${snippet(payload.text)}`);
  }

  console.log(`\n=== compareCollection: ${compareCollection} (topK=${topK}) ===`);
  if (compareHits.length === 0) {
    console.log('(无结果 — collection 不存在或未灌库)');
  }
  for (const [index, hit] of compareHits.entries()) {
    const payload = hit.payload ?? {};
    console.log(
      `${index + 1}. docId=${payload.docId ?? '-'} score=${hit.score?.toFixed(4) ?? '-'}`,
    );
    console.log(`   ${snippet(payload.text)}`);
  }
  console.log('');
}

async function runIndex(config, mode) {
  if (!fs.existsSync(RUBRIC_DIR)) {
    throw new Error(`rubric directory not found: ${RUBRIC_DIR}`);
  }

  const files = listRubricFiles(RUBRIC_DIR);
  if (files.length === 0) {
    throw new Error(`no .md files in ${RUBRIC_DIR}`);
  }

  const { docCount, chunks } = chunkDocuments(files, config, mode);
  if (chunks.length === 0) {
    throw new Error('chunker produced zero chunks');
  }

  const embeddingConfig = resolveEmbeddingConfig(config);
  const embeddings = await embedTexts(
    chunks.map((chunk) => chunk.text),
    embeddingConfig,
  );

  const records = chunks.map((chunk, index) => ({
    id: chunk.id,
    docId: chunk.docId,
    text: chunk.text,
    meta: chunk.meta,
    embedding: embeddings[index],
  }));

  const vector = config.ai?.store?.vector ?? {};
  const baseUrl = vector.url || 'http://127.0.0.1:6333';
  const collection =
    mode === 'size'
      ? vector.compareCollection || 'rubric_bysize'
      : vector.collection || 'rubric';

  await recreateAndUpsert(baseUrl, collection, records);

  console.log(
    `indexed mode=${mode === 'size' ? 'size' : 'level'} collection=${collection} documents=${docCount} chunks=${chunks.length}`,
  );
}

async function main() {
  const config = loadConfig();
  const options = parseArgs(process.argv.slice(2));

  if (options.compareQuery) {
    await runCompare(config, options.compareQuery);
    return;
  }

  const mode = options.chunker === 'size' ? 'size' : 'level';
  await runIndex(config, mode);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
