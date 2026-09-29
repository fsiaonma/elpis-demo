<template>
  <div class="agent-chat">
    <div ref="messageListRef" class="message-list">
      <div
        v-for="message in messages"
        :key="message.id"
        class="message-block"
      >
        <div class="message-label">{{ message.role === 'user' ? '用户' : '助手' }}</div>
        <div :class="['message-bubble', message.role]">
          <template v-if="message.role === 'assistant'">
            <div v-if="message.steps.length > 0" class="steps-timeline">
              <template
                v-for="(step, index) in message.steps"
                :key="`${message.id}-step-${index}`"
              >
                <ToolCallCard
                  v-if="step.type === 'skill' || step.type === 'tool'"
                  :step="step"
                />
                <div
                  v-else
                  :class="['step-summary', `step-type-${step.type}`]"
                >
                  {{ inlineStepSummary(step) }}
                </div>
              </template>
            </div>

            <div v-if="message.loading && message.steps.length === 0" class="status-line">
              正在执行 Agent…
            </div>
          </template>

          <div v-if="message.content" class="message-content">{{ message.content }}</div>

          <div v-if="message.loading && message.content" class="status-line status-streaming">
            正在生成回答…
          </div>

          <div v-if="message.error" class="status-line status-error">
            {{ message.error }}
          </div>

          <div v-if="message.disconnected && !message.error" class="status-line status-error">
            流式连接中断，未收到完成事件
          </div>
        </div>
      </div>
    </div>

    <div class="composer">
      <textarea
        v-model="inputText"
        class="composer-input"
        rows="3"
        placeholder="输入问题，Enter 发送，Shift+Enter 换行"
        :disabled="streaming"
        @keydown="handleKeydown"
      ></textarea>
      <button
        type="button"
        class="composer-button"
        :disabled="streaming || !inputText.trim()"
        @click="sendMessage"
      >
        {{ streaming ? '执行中…' : '发送' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  consumeSseStream,
  postAgentStream,
  supplementSteps,
} from './sse-client.js';
import ToolCallCard from '../tool-call-card/tool-call-card.vue';

const props = defineProps({
  agentName: {
    type: String,
    default: 'project-assistant',
  },
  apiBase: {
    type: String,
    default: '/api/ai',
  },
  threadEnabled: {
    type: [Boolean, null],
    default: null,
  },
});

const emit = defineEmits(['run-complete']);

const messages = ref([]);
const inputText = ref('');
const streaming = ref(false);
const messageListRef = ref(null);
const threadId = ref(null);
const threadConfigReady = ref(false);

let abortController = null;
let messageSeq = 0;

function threadStorageKey() {
  return `elpis-agent-thread:${props.agentName}`;
}

function loadThreadId() {
  threadConfigReady.value = false;

  if (!props.threadEnabled) {
    threadId.value = null;
    threadConfigReady.value = true;
    return;
  }

  try {
    threadId.value = sessionStorage.getItem(threadStorageKey()) || null;
  } catch {
    threadId.value = null;
  }

  threadConfigReady.value = true;
}

function saveThreadId(id) {
  if (!props.threadEnabled || !id) {
    return;
  }

  try {
    sessionStorage.setItem(threadStorageKey(), id);
  } catch {
    // ignore storage failures
  }

  threadId.value = id;
}

function clearThreadId() {
  if (!props.threadEnabled) {
    return;
  }

  try {
    sessionStorage.removeItem(threadStorageKey());
  } catch {
    // ignore storage failures
  }

  threadId.value = null;
}

async function ensureThreadIdLoaded() {
  if (props.threadEnabled === null) {
    await new Promise((resolve) => {
      const stop = watch(
        () => props.threadEnabled,
        (value) => {
          if (value !== null) {
            stop();
            resolve();
          }
        },
        { immediate: true },
      );
    });
  }

  if (!threadConfigReady.value) {
    await new Promise((resolve) => {
      const stop = watch(
        threadConfigReady,
        (ready) => {
          if (ready) {
            stop();
            resolve();
          }
        },
        { immediate: true },
      );
    });
  }
}

watch(
  () => [props.threadEnabled, props.agentName],
  () => {
    loadThreadId();
  },
  { immediate: true },
);

function createId() {
  messageSeq += 1;
  return `msg-${messageSeq}`;
}

function scrollToBottom() {
  nextTick(() => {
    const container = messageListRef.value;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
}

function summarizeInline(value, maxLength = 96) {
  if (value === undefined || value === null) {
    return '';
  }

  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}…`;
}

function inlineStepSummary(step) {
  if (!step || typeof step !== 'object') {
    return '';
  }

  const iteration = step.iteration ?? '-';

  if (step.type === 'plan') {
    const action = step.action || {};
    if (action.type === 'final') {
      return `PLAN · 第 ${iteration} 轮 · final · ${summarizeInline(action.output)}`;
    }
    return `PLAN · 第 ${iteration} 轮 · ${action.type || 'action'} ${action.name || ''} · ${summarizeInline(action.args)}`.trim();
  }

  if (step.type === 'observe') {
    return `OBSERVE · 第 ${iteration} 轮 · ${summarizeInline(step.observation)}`;
  }

  if (step.type === 'final') {
    return `FINAL · 第 ${iteration} 轮 · ${summarizeInline(step.output)}`;
  }

  return `${String(step.type || 'STEP').toUpperCase()} · 第 ${iteration} 轮`;
}

function handleDonePayload(payload, assistantMessage) {
  if (!payload?.success) {
    assistantMessage.error = payload?.message || 'Agent 执行失败';
    return;
  }

  const result = payload.data || {};
  assistantMessage.runId = result.runId ?? assistantMessage.runId;
  assistantMessage.content = result.output ?? assistantMessage.content;
  assistantMessage.steps = supplementSteps(assistantMessage.steps, result.steps);

  if (props.threadEnabled && result.threadId) {
    saveThreadId(result.threadId);
  }

  emit('run-complete', {
    runId: assistantMessage.runId,
    steps: assistantMessage.steps,
  });
}

async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || streaming.value) {
    return;
  }

  inputText.value = '';

  messages.value.push({
    id: createId(),
    role: 'user',
    content: text,
  });

  const assistantMessage = reactive({
    id: createId(),
    role: 'assistant',
    content: '',
    steps: [],
    loading: true,
    error: null,
    disconnected: false,
    runId: null,
  });

  messages.value.push(assistantMessage);
  scrollToBottom();

  abortController = new AbortController();
  streaming.value = true;

  let gotDone = false;

  try {
    await ensureThreadIdLoaded();

    const response = await postAgentStream({
      apiBase: props.apiBase,
      agent: props.agentName,
      input: text,
      threadId: props.threadEnabled ? threadId.value : undefined,
      signal: abortController.signal,
    });

    await consumeSseStream(response, {
      onEvent(eventName, data) {
        if (eventName === 'delta') {
          const chunk = data?.content;
          if (typeof chunk === 'string' && chunk.length > 0) {
            assistantMessage.content += chunk;
            scrollToBottom();
          }
          return;
        }

        if (eventName === 'step') {
          assistantMessage.steps.push(data);
          scrollToBottom();
          return;
        }

        if (eventName === 'done') {
          gotDone = true;
          handleDonePayload(data, assistantMessage);
          scrollToBottom();
        }
      },
      onError(error) {
        assistantMessage.error = error.message || 'SSE 解析失败';
      },
    });

    if (!gotDone) {
      assistantMessage.disconnected = true;
      if (!assistantMessage.error) {
        assistantMessage.error = '流式连接中断，未收到完成事件';
      }
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return;
    }

    assistantMessage.error = error?.message || '请求失败';
  } finally {
    assistantMessage.loading = false;
    streaming.value = false;
    abortController = null;
    scrollToBottom();
  }
}

function handleKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function resetConversation(clearThread = true) {
  abortController?.abort();
  abortController = null;
  streaming.value = false;
  messages.value = [];
  inputText.value = '';

  if (clearThread) {
    clearThreadId();
  }
}

defineExpose({
  resetConversation,
});

onBeforeUnmount(() => {
  abortController?.abort();
});
</script>

<style scoped>
.agent-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #f9fafb;
  color: #1f2937;
}

.message-list {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}

.message-block + .message-block {
  margin-top: 16px;
}

.message-label {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

.message-bubble {
  border-radius: 12px;
  padding: 12px 14px;
  line-height: 1.6;
  word-break: break-word;
}

.message-bubble.user {
  background: #dbeafe;
  color: #111827;
}

.message-bubble.assistant {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  color: #1f2937;
}

.steps-timeline {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.step-summary {
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #f3f4f6;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: #1f2937;
  word-break: break-word;
}

.step-type-plan {
  border-color: #fcd34d;
  background: #fffbeb;
}

.step-type-observe {
  border-color: #c4b5fd;
  background: #f5f3ff;
}

.step-type-final {
  border-color: #86efac;
  background: #f0fdf4;
}

.message-content {
  font-size: 14px;
  color: #1f2937;
  white-space: pre-wrap;
}

.status-line {
  margin-top: 8px;
  font-size: 13px;
  color: #4b5563;
}

.status-streaming {
  color: #2563eb;
}

.status-error {
  color: #b91c1c;
}

.composer {
  display: flex;
  flex-shrink: 0;
  gap: 12px;
  padding: 12px 16px 16px;
  border-top: 1px solid #e5e7eb;
  background: #ffffff;
}

.composer-input {
  flex: 1;
  resize: none;
  min-height: 72px;
  max-height: 120px;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  color: #111827;
  background: #ffffff;
}

.composer-input::placeholder {
  color: #9ca3af;
}

.composer-input:disabled {
  background: #f3f4f6;
  color: #6b7280;
}

.composer-button {
  align-self: flex-end;
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

.composer-button:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}
</style>
