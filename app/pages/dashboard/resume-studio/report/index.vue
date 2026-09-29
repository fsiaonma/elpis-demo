<template>
  <div class="report-page">
    <header class="report-page__header">
      <div class="report-page__info">
        <h1 class="report-page__title">分析报告</h1>
        <dl class="report-page__meta">
          <div class="report-page__meta-item">
            <dt>文件名</dt>
            <dd>{{ resumeMeta.fileName || '—' }}</dd>
          </div>
          <div class="report-page__meta-item">
            <dt>上传时间</dt>
            <dd>{{ resumeMeta.uploadedAt || '—' }}</dd>
          </div>
          <div class="report-page__meta-item">
            <dt>状态</dt>
            <dd>{{ statusLabel }}</dd>
          </div>
          <div v-if="analyzeMeta.cand_name" class="report-page__meta-item">
            <dt>姓名</dt>
            <dd>{{ analyzeMeta.cand_name }}</dd>
          </div>
          <div v-if="analyzeMeta.email" class="report-page__meta-item">
            <dt>邮箱</dt>
            <dd>{{ analyzeMeta.email }}</dd>
          </div>
          <div v-if="analyzeMeta.last_company" class="report-page__meta-item">
            <dt>最近公司</dt>
            <dd>{{ analyzeMeta.last_company }}</dd>
          </div>
          <div
            v-if="analyzeMeta.skill_count !== null && analyzeMeta.skill_count !== undefined"
            class="report-page__meta-item"
          >
            <dt>技能数</dt>
            <dd>{{ analyzeMeta.skill_count }}</dd>
          </div>
        </dl>
        <p v-if="analyzeMeta.error" class="report-page__error">{{ analyzeMeta.error }}</p>
      </div>

      <div class="report-page__actions">
        <el-button
          type="primary"
          :loading="isAnalyzing"
          :disabled="isAnalyzing || !resumeId"
          @click="runAnalyze"
        >
          {{ isAnalyzing ? '分析中' : '分析' }}
        </el-button>
      </div>
    </header>

    <section v-if="progressSteps.length" class="report-page__progress">
      <div class="report-page__progress-grid">
        <article class="report-page__progress-cell" :class="progressClass(resumeStep)">
          <h3>读简历</h3>
          <p>{{ stepStatusText(resumeStep) }}</p>
          <small>{{ formatDuration(resumeStep) }}</small>
        </article>

        <div
          class="report-page__progress-parallel"
          :class="{ 'report-page__progress-parallel--overlap': parallelHighlight }"
        >
          <article class="report-page__progress-cell" :class="progressClass(profileStep)">
            <h3>画像</h3>
            <p>{{ stepStatusText(profileStep) }}</p>
            <small>{{ formatDuration(profileStep) }}</small>
          </article>
          <span class="report-page__parallel-divider">‖</span>
          <article class="report-page__progress-cell" :class="progressClass(matchStep)">
            <h3>匹配</h3>
            <p>{{ stepStatusText(matchStep) }}</p>
            <small>{{ formatDuration(matchStep) }}</small>
          </article>
        </div>

        <article class="report-page__progress-cell" :class="progressClass(assembleStep)">
          <h3>汇总</h3>
          <p>{{ stepStatusText(assembleStep) }}</p>
          <small>{{ formatDuration(assembleStep) }}</small>
        </article>
      </div>
    </section>

    <section class="report-page__trace">
      <header class="report-page__trace-header">
        <h2>步骤明细</h2>
        <span v-if="analyzeRunId" class="report-page__trace-run">runId: {{ analyzeRunId }}</span>
      </header>
      <p v-if="analyzeMeta.error" class="report-page__trace-error">{{ analyzeMeta.error }}</p>
      <p v-if="!traceRows.length" class="report-page__trace-empty">
        点分析之后，这里按时间列出队长和每个 worker 的 step。
      </p>
      <ul v-else class="report-page__trace-list">
        <li
          v-for="(row, index) in traceRows"
          :key="`${row.type}-${row.name}-${index}`"
          class="report-page__trace-row"
          :class="traceRowClass(row)"
          :style="{ paddingLeft: `${12 + row.depth * 22}px` }"
        >
          <div class="report-page__trace-main">
            <span class="report-page__trace-tag">{{ row.type }}</span>
            <span class="report-page__trace-agent">{{ row.agent }}</span>
            <span v-if="row.name" class="report-page__trace-name">{{ row.name }}</span>
            <span v-if="row.status" class="report-page__trace-status">{{ row.status }}</span>
            <button
              v-if="row.detail"
              type="button"
              class="report-page__trace-toggle"
              @click="toggleTraceRow(index)"
            >
              {{ expandedTraceRows.has(index) ? '收起' : '展开' }}
            </button>
          </div>
          <pre
            v-if="row.detail && expandedTraceRows.has(index) && row.detailKind === 'json'"
            class="report-page__trace-detail report-page__trace-detail--json"
          >{{ row.detail }}</pre>
          <p
            v-else-if="row.detail && expandedTraceRows.has(index)"
            class="report-page__trace-detail"
          >
            {{ row.detail }}
          </p>
        </li>
      </ul>
    </section>

    <ProfilePanel
      class="report-page__section"
      :profile="profileData"
      :loading="profilePanelLoading"
      :degraded-reason="profileDegradedReason"
    />

    <MatchPanel
      class="report-page__section"
      :match="matchData"
      :loading="matchPanelLoading"
      :resume-id="resumeId"
      :degraded-reason="matchDegradedReason"
      @update:match="handleMatchUpdate"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import $curl from '$elpisCommon/curl.js';
import ProfilePanel from './profile-panel.vue';
import MatchPanel from './match-panel.vue';

const route = useRoute();

const emptyProfile = {
  dimensions: [],
  strengths: [],
  weaknesses: [],
  skills: [],
};

const emptyMatch = {
  jobs: [],
  weights: {},
};

const profileData = ref(structuredClone(emptyProfile));
const matchData = ref(structuredClone(emptyMatch));
const resumeMeta = ref({ fileName: '', uploadedAt: '', status: '' });
const analyzeMeta = ref({
  cand_name: null,
  email: null,
  last_company: null,
  skill_count: null,
  error: null,
});
const progressSteps = ref([]);
const traceRows = ref([]);
const analyzeRunId = ref('');
const analyzeStatus = ref('');
const degraded = ref([]);
const reportLoading = ref(false);
const analyzeTriggered = ref(false);
const expandedTraceRows = ref(new Set());
const pollTimer = ref(null);
const durationTick = ref(Date.now());
const durationTimer = ref(null);

const resumeId = computed(() => String(route.query.resumeId || ''));
const isAnalyzing = computed(() => analyzeStatus.value === 'parsing');

const statusLabel = computed(() => {
  const map = {
    uploaded: '已上传',
    parsing: '分析中',
    parsed: '已解析',
    failed: '失败',
  };
  return map[analyzeStatus.value] || analyzeStatus.value || resumeMeta.value.status || '—';
});

const resumeStep = computed(() => progressSteps.value.find((step) => step.key === 'resume'));
const profileStep = computed(() => progressSteps.value.find((step) => step.key === 'profile'));
const matchStep = computed(() => progressSteps.value.find((step) => step.key === 'match'));
const assembleStep = computed(() => progressSteps.value.find((step) => step.key === 'assemble'));

const parallelOverlap = computed(() => {
  const assemble = assembleStep.value;
  if (!assemble || assemble.status === 'done' || assemble.status === 'failed') {
    return false;
  }
  const middleStarted = (step) => step && step.status !== 'pending';
  return middleStarted(profileStep.value) || middleStarted(matchStep.value);
});

const parallelHighlight = computed(() => {
  if (assembleStep.value?.status === 'done' || assembleStep.value?.status === 'failed') {
    return false;
  }
  const profileActive =
    profileStep.value?.status === 'running' || profileStep.value?.status === 'done';
  const matchActive =
    matchStep.value?.status === 'running' || matchStep.value?.status === 'done';
  return profileActive || matchActive || parallelOverlap.value;
});

const profileDegradedReason = computed(() => {
  const item = degraded.value.find((row) => row.key === 'profile');
  return item?.reason || '';
});

const matchDegradedReason = computed(() => {
  const item = degraded.value.find((row) => row.key === 'match');
  return item?.reason || '';
});

function isTerminalAnalyzeStatus(status) {
  return status === 'parsed' || status === 'failed';
}

function stepBlocksPanelLoading(step) {
  if (!step) return false;
  return step.status === 'pending' || step.status === 'running';
}

const profilePanelLoading = computed(() => {
  if (profileData.value.dimensions?.length) return false;
  if (profileDegradedReason.value) return false;
  if (profileStep.value?.status === 'failed') return false;
  if (isTerminalAnalyzeStatus(analyzeStatus.value)) return false;
  if (profileStep.value?.status === 'done') return false;
  return (
    analyzeTriggered.value &&
    (analyzeStatus.value === 'parsing' || stepBlocksPanelLoading(profileStep.value))
  );
});

const matchPanelLoading = computed(() => {
  if (matchData.value.jobs?.length) return false;
  if (matchDegradedReason.value) return false;
  if (matchStep.value?.status === 'failed') return false;
  if (isTerminalAnalyzeStatus(analyzeStatus.value)) return false;
  if (matchStep.value?.status === 'done') return false;
  return (
    analyzeTriggered.value &&
    (analyzeStatus.value === 'parsing' || stepBlocksPanelLoading(matchStep.value))
  );
});

function progressClass(step) {
  if (!step) return '';
  return `report-page__progress-cell--${step.status}`;
}

function stepStatusText(step) {
  if (!step) return '等待中';
  const map = {
    pending: '等待中',
    running: '进行中',
    done: '已完成',
    failed: '失败',
  };
  return map[step.status] || step.status;
}

function formatDuration(step) {
  if (!step?.startedAt) return '—';
  const end =
    step.endedAt ??
    (step.status === 'running' ? durationTick.value : step.startedAt);
  const ms = Math.max(end - step.startedAt, 0);
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function startDurationTick() {
  stopDurationTick();
  durationTimer.value = window.setInterval(() => {
    durationTick.value = Date.now();
  }, 200);
}

function stopDurationTick() {
  if (durationTimer.value) {
    window.clearInterval(durationTimer.value);
    durationTimer.value = null;
  }
}

function traceRowClass(row) {
  const classes = [`report-page__trace-row--${row.type}`];
  if (row.depth > 0) classes.push('report-page__trace-row--child');
  if (row.status === 'failed') classes.push('report-page__trace-row--failed');
  return classes;
}

function toggleTraceRow(index) {
  const next = new Set(expandedTraceRows.value);
  if (next.has(index)) {
    next.delete(index);
  } else {
    next.add(index);
  }
  expandedTraceRows.value = next;
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object') return structuredClone(emptyProfile);
  return {
    dimensions: Array.isArray(profile.dimensions) ? profile.dimensions : [],
    strengths: Array.isArray(profile.strengths) ? profile.strengths : [],
    weaknesses: Array.isArray(profile.weaknesses) ? profile.weaknesses : [],
    skills: Array.isArray(profile.skills) ? profile.skills : [],
  };
}

function normalizeMatch(match) {
  if (!match || typeof match !== 'object') return structuredClone(emptyMatch);
  return {
    jobs: Array.isArray(match.jobs) ? match.jobs : [],
    weights: match.weights && typeof match.weights === 'object' ? match.weights : {},
  };
}

function updateReportLoading(data) {
  if (!analyzeTriggered.value) return;

  if (data?.profile?.dimensions?.length && data?.match?.jobs?.length) {
    reportLoading.value = false;
    return;
  }
  if (data?.status === 'failed' || progressSteps.value.some((step) => step.status === 'failed')) {
    reportLoading.value = false;
    return;
  }
  if (data?.status === 'parsed') {
    reportLoading.value = false;
    return;
  }
  const assemble = progressSteps.value.find((step) => step.key === 'assemble');
  if (assemble?.status === 'done' || assemble?.status === 'failed') {
    reportLoading.value = false;
    return;
  }
  if (data?.status === 'parsing') {
    reportLoading.value = true;
  }
}

function applyAnalyzePayload(data) {
  analyzeStatus.value = data?.status || '';
  progressSteps.value = Array.isArray(data?.steps) ? data.steps : [];
  traceRows.value = Array.isArray(data?.trace) ? data.trace : [];
  analyzeRunId.value = data?.runId || '';
  degraded.value = Array.isArray(data?.degraded) ? data.degraded : [];
  analyzeMeta.value = {
    cand_name: data?.cand_name ?? null,
    email: data?.email ?? null,
    last_company: data?.last_company ?? null,
    skill_count: data?.skill_count ?? null,
    error: data?.error ?? null,
  };
  if (data?.profile) profileData.value = normalizeProfile(data.profile);
  if (data?.match) matchData.value = normalizeMatch(data.match);
  updateReportLoading(data);
}

function shouldKeepPolling(data) {
  return data?.status === 'parsing';
}

async function loadResumeMeta() {
  if (!resumeId.value) return;

  const res = await $curl({
    method: 'get',
    url: '/api/resume',
    query: { id: resumeId.value },
    errorMessage: '加载简历失败',
  });

  if (res?.success && res.data) {
    resumeMeta.value = {
      fileName: res.data.fileName || '',
      uploadedAt: res.data.uploadedAt || '',
      status: res.data.status || '',
    };
    analyzeStatus.value = res.data.status || '';
  }
}

async function pollAnalyzeStatus() {
  if (!resumeId.value) return;

  const res = await $curl({
    method: 'get',
    url: `/api/resume/${resumeId.value}/analyze`,
    errorMessage: false,
  });

  if (!res?.success || !res.data) return;

  applyAnalyzePayload(res.data);

  if (!shouldKeepPolling(res.data)) {
    stopPolling();
    stopDurationTick();
    if (res.data.status === 'parsed') {
      await loadResumeMeta();
    }
  } else {
    startDurationTick();
  }
}

function startPolling() {
  stopPolling();
  pollTimer.value = window.setInterval(() => {
    void pollAnalyzeStatus();
  }, 1000);
}

function stopPolling() {
  if (pollTimer.value) {
    window.clearInterval(pollTimer.value);
    pollTimer.value = null;
  }
}

async function runAnalyze() {
  if (!resumeId.value || isAnalyzing.value) return;

  const res = await $curl({
    method: 'post',
    url: `/api/resume/${resumeId.value}/analyze`,
    errorMessage: '启动分析失败',
  });

  if (!res?.success) return;

  analyzeTriggered.value = true;
  reportLoading.value = true;
  analyzeStatus.value = res.data?.status || 'parsing';
  progressSteps.value = Array.isArray(res.data?.steps) ? res.data.steps : [];
  traceRows.value = [];
  expandedTraceRows.value = new Set();
  analyzeMeta.value.error = null;
  startDurationTick();
  startPolling();
  await pollAnalyzeStatus();
}

function handleMatchUpdate(match) {
  matchData.value = normalizeMatch(match);
}

onMounted(async () => {
  await loadResumeMeta();
  await pollAnalyzeStatus();
  if (analyzeStatus.value === 'parsing') {
    analyzeTriggered.value = true;
    reportLoading.value = true;
    startDurationTick();
    startPolling();
  }
});

onBeforeUnmount(() => {
  stopPolling();
  stopDurationTick();
});
</script>

<style scoped>
.report-page {
  min-height: 100%;
  padding: 24px;
  background: #f3f4f6;
}

.report-page__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding: 20px 24px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
}

.report-page__title {
  margin: 0 0 12px;
  font-size: 22px;
  color: #111827;
}

.report-page__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 24px;
  margin: 0;
}

.report-page__meta-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.report-page__meta-item dt {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
}

.report-page__meta-item dd {
  margin: 0;
  font-size: 14px;
  color: #111827;
}

.report-page__error {
  margin: 12px 0 0;
  color: #dc2626;
  font-size: 14px;
}

.report-page__actions {
  flex-shrink: 0;
}

.report-page__progress {
  margin: 16px 0;
  padding: 16px 24px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
}

.report-page__progress-grid {
  display: grid;
  grid-template-columns: 1fr 1.4fr 1fr;
  gap: 16px;
  align-items: stretch;
}

.report-page__progress-parallel {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: stretch;
}

.report-page__progress-parallel--overlap {
  box-shadow: inset 0 0 0 2px #bfdbfe;
  border-radius: 10px;
  padding: 8px;
  background: #eff6ff;
}

.report-page__parallel-divider {
  display: flex;
  align-items: center;
  color: #2563eb;
  font-size: 18px;
  font-weight: 700;
}

.report-page__progress-cell {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px 16px;
  background: #f9fafb;
}

.report-page__progress-cell h3 {
  margin: 0 0 6px;
  font-size: 15px;
  color: #111827;
}

.report-page__progress-cell p {
  margin: 0;
  font-size: 13px;
  color: #475569;
}

.report-page__progress-cell small {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
}

.report-page__progress-cell--running {
  border-color: #93c5fd;
  background: #eff6ff;
}

.report-page__progress-cell--done {
  border-color: #86efac;
  background: #ecfdf5;
}

.report-page__progress-cell--failed {
  border-color: #fca5a5;
  background: #fef2f2;
}

.report-page__trace {
  margin: 16px 0;
  padding: 16px 24px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  min-height: 240px;
}

.report-page__trace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.report-page__trace-header h2 {
  margin: 0;
  font-size: 16px;
  color: #111827;
}

.report-page__trace-run {
  font-size: 12px;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.report-page__trace-list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 420px;
  overflow-y: auto;
}

.report-page__trace-row {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}

.report-page__trace-row + .report-page__trace-row {
  margin-top: 8px;
}

.report-page__trace-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.report-page__trace-summary:disabled {
  cursor: default;
}

.report-page__trace-indent {
  flex-shrink: 0;
}

.report-page__trace-type {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.report-page__trace-agent,
.report-page__trace-name,
.report-page__trace-status {
  font-size: 13px;
  color: #374151;
}

.report-page__trace-toggle {
  margin-left: auto;
  font-size: 12px;
  color: #2563eb;
}

.report-page__trace-detail {
  padding: 0 12px 12px;
}

.report-page__trace-json {
  margin: 0;
  padding: 12px;
  border-radius: 8px;
  background: #111827;
  color: #f9fafb;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: visible;
}

.report-page__trace-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #374151;
}

.report-page__trace-row--plan .report-page__trace-type {
  background: #dbeafe;
  color: #1d4ed8;
}

.report-page__trace-row--tool .report-page__trace-type {
  background: #dcfce7;
  color: #166534;
}

.report-page__trace-row--skill .report-page__trace-type {
  background: #f3e8ff;
  color: #7e22ce;
}

.report-page__trace-row--observe .report-page__trace-type,
.report-page__trace-row--observation .report-page__trace-type {
  background: #ffedd5;
  color: #c2410c;
}

.report-page__trace-row--delegation .report-page__trace-type {
  background: #e0e7ff;
  color: #4338ca;
}

.report-page__trace-row--final .report-page__trace-type {
  background: #cffafe;
  color: #0e7490;
}

.report-page__trace-row--failed {
  border-color: #fca5a5;
  background: #fef2f2;
}

.report-page__trace-row--child {
  margin-left: 16px;
}

.report-page__trace {
  margin: 16px 0;
  padding: 16px 24px;
  min-height: 240px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
}

.report-page__trace-header h2 {
  margin: 0 0 12px;
  font-size: 16px;
  color: #111827;
}

.report-page__trace-error {
  margin: 0 0 12px;
  color: #dc2626;
  font-size: 14px;
}

.report-page__trace-empty {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}

.report-page__trace-list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 420px;
  overflow: auto;
}

.report-page__trace-row {
  border-left: 4px solid #cbd5e1;
  margin-bottom: 8px;
  padding: 8px 12px 8px 8px;
  background: #f8fafc;
  border-radius: 0 8px 8px 0;
}

.report-page__trace-row--failed {
  background: #fef2f2;
  border-left-color: #ef4444;
}

.report-page__trace-row--plan { border-left-color: #3b82f6; }
.report-page__trace-row--tool { border-left-color: #22c55e; }
.report-page__trace-row--skill { border-left-color: #a855f7; }
.report-page__trace-row--observe { border-left-color: #f97316; }
.report-page__trace-row--delegation { border-left-color: #6366f1; }
.report-page__trace-row--final { border-left-color: #06b6d4; }

.report-page__trace-main {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.report-page__trace-tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: #fff;
  background: #64748b;
}

.report-page__trace-row--plan .report-page__trace-tag { background: #3b82f6; }
.report-page__trace-row--tool .report-page__trace-tag { background: #22c55e; }
.report-page__trace-row--skill .report-page__trace-tag { background: #a855f7; }
.report-page__trace-row--observe .report-page__trace-tag { background: #f97316; }
.report-page__trace-row--delegation .report-page__trace-tag { background: #6366f1; }
.report-page__trace-row--final .report-page__trace-tag { background: #06b6d4; }

.report-page__trace-agent,
.report-page__trace-name,
.report-page__trace-status {
  color: #334155;
}

.report-page__trace-toggle {
  margin-left: auto;
  border: none;
  background: transparent;
  color: #2563eb;
  cursor: pointer;
  font-size: 12px;
}

.report-page__trace-detail {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: #111827;
  white-space: pre-wrap;
}

.report-page__trace-detail--json {
  margin-top: 8px;
  padding: 12px;
  background: #f8fafc;
  border-left: 4px solid #2563eb;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  overflow: visible;
  white-space: pre-wrap;
}

.report-page__section + .report-page__section {
  margin-top: 16px;
}

@media (max-width: 960px) {
  .report-page__progress-grid {
    grid-template-columns: 1fr;
  }
}
</style>
