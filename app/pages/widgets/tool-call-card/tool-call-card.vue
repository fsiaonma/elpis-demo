<template>
  <div class="tool-call-card">
    <div class="card-header">
      <span :class="['type-badge', stepTypeClass]">{{ typeLabel }}</span>
      <span class="tool-name">{{ stepName }}</span>
      <span v-if="sourceLabel" :class="['source-badge', `source-${sourceLabel}`]">
        {{ sourceLabel }}
      </span>
    </div>

    <div v-if="inputSummary" class="card-row">
      <span class="row-label">Input</span>
      <span class="row-value">{{ inputSummary }}</span>
    </div>

    <div v-if="outputSummary" class="card-row">
      <span class="row-label">Output</span>
      <span :class="['row-value', hasError ? 'row-error' : '']">{{ outputSummary }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  step: {
    type: Object,
    required: true,
  },
});

const MAX_SUMMARY_LENGTH = 160;

function summarize(value) {
  if (value === undefined || value === null) {
    return '';
  }

  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }

  if (text.length <= MAX_SUMMARY_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_SUMMARY_LENGTH)}…`;
}

const stepType = computed(() => props.step?.type || '');
const typeLabel = computed(() => String(stepType.value || 'step').toUpperCase());
const stepTypeClass = computed(() => {
  if (stepType.value === 'skill') {
    return 'type-skill';
  }
  if (stepType.value === 'tool') {
    return 'type-tool';
  }
  return 'type-default';
});

const stepName = computed(() => props.step?.name || 'unknown');

const sourceLabel = computed(() => {
  const source = props.step?.source;
  if (typeof source === 'string' && source.trim()) {
    return source.trim().toLowerCase();
  }

  if (stepType.value === 'skill') {
    return 'builtin';
  }

  return '';
});

const inputSummary = computed(() => summarize(props.step?.args));

const hasError = computed(() => Boolean(props.step?.error));

const outputSummary = computed(() => {
  if (hasError.value) {
    const error = props.step.error;
    if (typeof error === 'object' && error !== null) {
      return summarize(error.message || error);
    }
    return summarize(error);
  }

  return summarize(props.step?.result);
});
</script>

<style scoped>
.tool-call-card {
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #f3f4f6;
  padding: 10px 12px;
  color: #1f2937;
}

.card-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #111827;
}

.type-skill {
  background: #bfdbfe;
}

.type-tool {
  background: #fde68a;
}

.type-default {
  background: #e5e7eb;
}

.tool-name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.source-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #111827;
  background: #e5e7eb;
}

.source-mcp {
  background: #ddd6fe;
}

.source-builtin {
  background: #bbf7d0;
}

.card-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.row-label {
  flex-shrink: 0;
  min-width: 48px;
  font-weight: 600;
  color: #374151;
}

.row-value {
  flex: 1;
  color: #1f2937;
  word-break: break-word;
  white-space: pre-wrap;
}

.row-error {
  color: #b91c1c;
}
</style>
