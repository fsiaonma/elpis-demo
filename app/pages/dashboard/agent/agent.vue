<template>
  <div class="agent-page">
    <header class="page-header">
      <h1 class="page-title">项目助手</h1>
      <div v-if="lastRunId" class="run-meta">
        <span class="run-label">runId</span>
        <code class="run-id">{{ lastRunId }}</code>
        <button type="button" class="meta-button" @click="copyRunId">
          {{ copied ? '已复制' : '复制' }}
        </button>
        <button type="button" class="meta-button meta-button-primary" @click="goTrace">
          去 Trace 回放
        </button>
      </div>
    </header>

    <div class="page-body">
      <AgentChat
        :agent-name="resolvedAgentName"
        :api-base="resolvedApiBase"
        :thread-enabled="threadEnabled"
        @run-complete="handleRunComplete"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMenuStore } from '$elpisStore/menu.js';
import { buildSignedHeaders } from '../../widgets/agent-chat/sse-client.js';
import AgentChat from '../../widgets/agent-chat/agent-chat.vue';

const props = defineProps({
  agentName: {
    type: String,
    default: 'project-assistant',
  },
  apiBase: {
    type: String,
    default: '/api/ai',
  },
});

const route = useRoute();
const router = useRouter();
const menuStore = useMenuStore();

const resolvedAgentName = ref(props.agentName);
const resolvedApiBase = ref(props.apiBase);
const threadEnabled = ref(null);

const lastRunId = ref('');
const copied = ref(false);

function applyMenuAgentConfig() {
  const menuItem = menuStore.findMenuItem({
    key: 'key',
    value: route.query.key,
  });

  if (!menuItem && menuStore.menuList.length === 0) {
    return;
  }

  const config = menuItem?.agentConfig || {};
  resolvedAgentName.value = config.agentName || props.agentName;
  resolvedApiBase.value = config.apiBase || props.apiBase;
}

async function loadThreadConfig() {
  threadEnabled.value = null;

  try {
    const base = resolvedApiBase.value.replace(/\/$/, '');
    const response = await fetch(`${base}/agent/config`, {
      method: 'GET',
      headers: buildSignedHeaders(),
      credentials: 'include',
    });
    const payload = await response.json();
    threadEnabled.value = payload?.success
      ? Boolean(payload.data?.threadEnabled)
      : false;
  } catch {
    threadEnabled.value = false;
  }
}

async function applyAgentConfig() {
  applyMenuAgentConfig();
  await loadThreadConfig();
}

watch(
  [() => route.query.key, () => menuStore.menuList],
  () => {
    void applyAgentConfig();
  },
  { deep: true },
);

onMounted(() => {
  void applyAgentConfig();
});

function handleRunComplete(payload) {
  if (payload?.runId) {
    lastRunId.value = payload.runId;
    copied.value = false;
  }
}

async function copyRunId() {
  if (!lastRunId.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(lastRunId.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

function goTrace() {
  if (!lastRunId.value) {
    return;
  }

  router.push({
    path: '/view/dashboard/trace',
    query: {
      proj_key: route.query.proj_key,
      key: 'agent-trace',
      runId: lastRunId.value,
    },
  });
}
</script>

<style scoped>
.agent-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: 20px 24px;
  overflow: hidden;
  background: #f9fafb;
  color: #1f2937;
}

.page-header {
  flex-shrink: 0;
  margin-bottom: 16px;
}

.page-title {
  margin: 0 0 12px;
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}

.run-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #eff6ff;
}

.run-label {
  font-size: 12px;
  font-weight: 600;
  color: #1d4ed8;
}

.run-id {
  padding: 2px 8px;
  border-radius: 4px;
  background: #ffffff;
  color: #111827;
  font-size: 13px;
  word-break: break-all;
}

.meta-button {
  min-width: 72px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  color: #374151;
  font-size: 13px;
  cursor: pointer;
}

.meta-button-primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.page-body {
  flex: 1 1 0;
  min-height: 0;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  background: #ffffff;
}
</style>
