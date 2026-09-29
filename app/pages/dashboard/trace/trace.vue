<template>
  <div class="trace-page">
    <header class="page-header">
      <h1 class="page-title">Trace 回放</h1>
      <div class="search-bar">
        <input
          v-model="runIdInput"
          class="run-id-input"
          type="text"
          placeholder="输入 runId"
          @keydown.enter="fetchTrace"
        />
        <button
          type="button"
          class="search-button"
          :disabled="loading || !runIdInput.trim()"
          @click="fetchTrace"
        >
          {{ loading ? '查询中…' : '查询' }}
        </button>
      </div>
    </header>

    <div v-if="errorMessage" class="state-banner state-error">
      {{ errorMessage }}
    </div>

    <div v-else-if="loaded && steps.length === 0" class="state-banner state-empty">
      该 run 暂无 steps
    </div>

    <div v-else-if="traceMeta" class="trace-meta">
      <div class="meta-item">
        <span class="meta-label">Agent</span>
        <span class="meta-value">{{ traceMeta.agentName || '-' }}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Input</span>
        <span class="meta-value">{{ formatValue(traceMeta.input) }}</span>
      </div>
      <div v-if="traceMeta.output" class="meta-item">
        <span class="meta-label">Output</span>
        <span class="meta-value">{{ traceMeta.output }}</span>
      </div>
    </div>

    <div v-if="steps.length > 0" class="steps-list">
      <article
        v-for="(step, index) in steps"
        :key="`${step.type}-${index}`"
        class="step-card"
      >
        <div class="step-header">
          <span :class="['type-badge', `type-${step.type}`]">{{ step.type }}</span>
          <span v-if="step.name" class="step-name">{{ step.name }}</span>
          <span v-if="step.source" class="source-badge">{{ step.source }}</span>
          <span v-if="step.duration !== undefined && step.duration !== null" class="duration-badge">
            {{ step.duration }}ms
          </span>
        </div>

        <div v-if="step.input !== undefined && step.input !== null && step.input !== ''" class="step-row">
          <span class="row-label">input</span>
          <pre class="row-value">{{ formatValue(step.input) }}</pre>
        </div>

        <div v-if="step.output !== undefined && step.output !== null && step.output !== ''" class="step-row">
          <span class="row-label">output</span>
          <pre class="row-value">{{ formatValue(step.output) }}</pre>
        </div>
      </article>
    </div>

    <div v-else-if="!loading && !loaded && !errorMessage" class="state-banner state-empty">
      输入 runId 查询 Trace
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { buildSignedHeaders } from '../../widgets/agent-chat/sse-client.js';

const props = defineProps({
  apiBase: {
    type: String,
    default: '/api/ai',
  },
});

const route = useRoute();

const runIdInput = ref('');
const loading = ref(false);
const loaded = ref(false);
const errorMessage = ref('');
const traceMeta = ref(null);
const steps = ref([]);

function formatValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeStep(rawStep) {
  if (!rawStep || typeof rawStep !== 'object') {
    return {
      type: 'unknown',
      name: '',
      input: rawStep,
      output: '',
      source: '',
      duration: undefined,
    };
  }

  const type = rawStep.type || 'unknown';
  const action = rawStep.action || {};
  let name = rawStep.name || action.name || '';
  let input = rawStep.args ?? action.args ?? rawStep.input;
  let output = rawStep.result ?? rawStep.observation ?? rawStep.output ?? action.output;

  if (type === 'plan' && !name) {
    name = action.type || 'plan';
  }

  if (type === 'observe' && output === undefined) {
    output = rawStep.observation;
  }

  if (type === 'final' && output === undefined) {
    output = rawStep.output;
  }

  return {
    type,
    name,
    input,
    output,
    source: rawStep.source,
    duration: rawStep.duration,
  };
}

async function fetchTrace() {
  const runId = runIdInput.value.trim();
  if (!runId || loading.value) {
    return;
  }

  loading.value = true;
  loaded.value = false;
  errorMessage.value = '';
  traceMeta.value = null;
  steps.value = [];

  try {
    const base = props.apiBase.replace(/\/$/, '');
    const response = await fetch(`${base}/trace/${encodeURIComponent(runId)}`, {
      method: 'GET',
      headers: {
        ...buildSignedHeaders(),
        Accept: 'application/json',
      },
      credentials: 'include',
    });

    const payload = await response.json();

    if (!payload?.success) {
      if (payload?.code === 40401) {
        errorMessage.value = `未找到 Trace：${runId}`;
      } else {
        errorMessage.value = payload?.message || `查询失败（HTTP ${response.status}）`;
      }
      return;
    }

    const data = payload.data || {};
    traceMeta.value = {
      agentName: data.agentName,
      input: data.input,
      output: data.output,
    };
    steps.value = Array.isArray(data.steps) ? data.steps.map(normalizeStep) : [];
    loaded.value = true;
  } catch (error) {
    errorMessage.value = error?.message || '网络异常，请稍后重试';
  } finally {
    loading.value = false;
  }
}

function syncRunIdFromRoute() {
  const runId = route.query.runId;
  if (typeof runId === 'string' && runId.trim()) {
    runIdInput.value = runId.trim();
    fetchTrace();
  }
}

onMounted(() => {
  syncRunIdFromRoute();
});

watch(
  () => route.query.runId,
  (nextRunId, prevRunId) => {
    if (nextRunId !== prevRunId) {
      syncRunIdFromRoute();
    }
  },
);
</script>

<style scoped>
.trace-page {
  min-height: calc(100vh - 120px);
  padding: 20px 24px;
  background: #f9fafb;
  color: #1f2937;
}

.page-header {
  margin-bottom: 16px;
}

.page-title {
  margin: 0 0 12px;
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}

.search-bar {
  display: flex;
  gap: 12px;
}

.run-id-input {
  flex: 1;
  min-width: 240px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  color: #111827;
  background: #ffffff;
}

.search-button {
  min-width: 88px;
  height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.search-button:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

.state-banner {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
}

.state-empty {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #6b7280;
}

.state-error {
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.trace-meta {
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
}

.meta-item + .meta-item {
  margin-top: 8px;
}

.meta-label {
  display: inline-block;
  min-width: 56px;
  margin-right: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

.meta-value {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #ffffff;
  padding: 12px 14px;
}

.step-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #111827;
  background: #e5e7eb;
}

.type-plan {
  background: #fde68a;
}

.type-skill {
  background: #bfdbfe;
}

.type-tool {
  background: #fcd34d;
}

.type-observe {
  background: #ddd6fe;
}

.type-final {
  background: #bbf7d0;
}

.step-name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.source-badge,
.duration-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  background: #f3f4f6;
}

.step-row {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.row-label {
  flex-shrink: 0;
  min-width: 48px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

.row-value {
  flex: 1;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #1f2937;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
</style>
