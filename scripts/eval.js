#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { runAssertions } = require('@fsiaonma/elpis/nest');
const { buildSignHeaders } = require('./sign-headers');

const config = require('../config/config.default.js');
const evalConfig = config.ai?.eval ?? {};
const apiBase = (evalConfig.apiBase || 'http://localhost:8080/api/ai').replace(/\/$/, '');
const reportPath = path.resolve(process.cwd(), evalConfig.reportPath || './data/eval/report.json');
const casesGlob = evalConfig.casesGlob || 'dist/eval/*.cases.js';
const serverOrigin = apiBase.replace(/\/api\/ai$/, '');

function cookiesFromResponse(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie().map((item) => item.split(';')[0]).join('; ');
  }

  const raw = response.headers.get('set-cookie');
  if (!raw) {
    return '';
  }

  return raw.split(/,(?=\s*[^;,=\s]+=)/).map((item) => item.split(';')[0].trim()).join('; ');
}

async function signedFetch(url, { method = 'GET', body, cookie } = {}) {
  const headers = buildSignHeaders();
  if (cookie) {
    headers.Cookie = cookie;
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
  });

  let json;
  try {
    json = await response.json();
  } catch {
    json = { success: false, message: `HTTP ${response.status}` };
  }

  return { response, json };
}

async function login() {
  const username = process.env.EVAL_USERNAME;
  const password = process.env.EVAL_PASSWORD;

  if (!username || !password) {
    throw new Error('请设置环境变量 EVAL_USERNAME 与 EVAL_PASSWORD');
  }

  const { response, json } = await signedFetch(`${serverOrigin}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

  if (!json?.success) {
    throw new Error(json?.message || '登录失败');
  }

  return cookiesFromResponse(response);
}

async function ingestRag(cookie) {
  const { json } = await signedFetch(`${serverOrigin}/api/eval/ingest`, {
    method: 'POST',
    cookie,
  });

  if (!json?.success) {
    throw new Error(json?.message || 'rag ingest failed');
  }

  return json.data;
}

async function runAgent(cookie, agent, input, threadId) {
  const body = { agent, input };
  if (threadId) {
    body.threadId = threadId;
  }

  const { json } = await signedFetch(`${apiBase}/agent/run`, {
    method: 'POST',
    cookie,
    body: JSON.stringify(body),
  });

  if (!json?.success) {
    throw new Error(json?.message || 'agent run failed');
  }

  return json.data;
}

function resolveCaseFiles(pattern) {
  const normalized = pattern.replace(/\\/g, '/');
  const starIndex = normalized.indexOf('*');

  if (starIndex === -1) {
    const abs = path.resolve(process.cwd(), normalized);
    return fs.existsSync(abs) ? [abs] : [];
  }

  const prefix = normalized.slice(0, starIndex);
  const suffix = normalized.slice(starIndex + 1);
  const dir = path.resolve(process.cwd(), prefix);

  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .map((name) => path.join(dir, name));
}

function loadCases() {
  const files = resolveCaseFiles(casesGlob);
  const suites = [];

  for (const file of files) {
    const loaded = require(file);
    const suite = loaded.default ?? loaded;
    suites.push(suite);
  }

  return suites;
}

async function runCase(cookie, testCase) {
  if (Array.isArray(testCase.turns) && testCase.turns.length > 0) {
    let threadId;
    let lastResult;
    let lastAssert;

    for (let index = 0; index < testCase.turns.length; index += 1) {
      const turn = testCase.turns[index];
      lastResult = await runAgent(cookie, testCase.agent, turn.input, threadId);
      threadId = lastResult?.threadId || threadId;

      if (index === testCase.turns.length - 1 && turn.assert) {
        lastAssert = turn.assert;
      }
    }

    if (!lastAssert) {
      return { pass: true };
    }

    return runAssertions(lastResult, lastAssert);
  }

  const result = await runAgent(cookie, testCase.agent, testCase.input);
  return runAssertions(result, testCase.assert ?? {});
}

function ensureReportDir() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
}

async function main() {
  const suites = loadCases();

  if (suites.length === 0) {
    console.error(`未找到 case 文件：${casesGlob}`);
    process.exit(1);
  }

  const cookie = await login();
  const ingestResult = await ingestRag(cookie);
  console.log(`rag ingest: ingested=${ingestResult?.ingested ?? 0}, chunks=${ingestResult?.chunks ?? 0}`);

  const results = [];
  let passCount = 0;
  let failCount = 0;

  for (const suite of suites) {
    for (const testCase of suite.cases ?? []) {
      let outcome;

      try {
        outcome = await runCase(cookie, testCase);
      } catch (error) {
        outcome = {
          pass: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }

      const item = {
        id: testCase.id,
        pass: Boolean(outcome.pass),
        reason: outcome.reason,
      };
      results.push(item);

      if (item.pass) {
        passCount += 1;
        console.log(`PASS  ${item.id}`);
      } else {
        failCount += 1;
        console.log(`FAIL  ${item.id}${item.reason ? ` — ${item.reason}` : ''}`);
      }
    }
  }

  const report = {
    suite: suites.map((item) => item.name).filter(Boolean).join(', '),
    ranAt: new Date().toISOString(),
    results,
    passCount,
    failCount,
  };

  ensureReportDir();
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  console.log(`\n汇总：${passCount} pass / ${failCount} fail → ${reportPath}`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
