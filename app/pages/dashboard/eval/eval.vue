<template>
  <div class="eval-page">
    <header class="eval-page__header">
      <h1 class="eval-page__title">Agent 回归</h1>
      <p class="eval-page__hint">
        回归在终端跑 —— npm run eval，本页看最近一次报告
      </p>
    </header>

    <div class="eval-page__toolbar">
      <button type="button" class="eval-page__btn eval-page__btn-secondary" @click="ingestFixtures">
        {{ ingesting ? '灌库中…' : '灌库' }}
      </button>
      <button type="button" class="eval-page__btn eval-page__btn-primary" @click="loadReport">
        {{ loading ? '刷新中…' : '刷新报告' }}
      </button>
    </div>

    <p v-if="ingestMessage" class="eval-page__ingest">{{ ingestMessage }}</p>

    <div v-if="report.ranAt" class="eval-page__meta">
      最近运行：<span class="eval-page__meta-value">{{ formatRanAt(report.ranAt) }}</span>
    </div>

    <div v-if="report.results.length > 0" class="eval-page__summary">
      汇总：<span class="eval-page__summary-value">{{ report.passCount }} pass / {{ report.failCount }} fail</span>
    </div>

    <el-table
      v-if="report.results.length > 0"
      class="eval-page__table"
      :data="report.results"
      stripe
      border
    >
      <el-table-column prop="id" label="Case ID" min-width="180">
        <template #default="{ row }">
          <span class="eval-page__id">{{ row.id }}</span>
        </template>
      </el-table-column>
      <el-table-column label="结果" width="120" align="center">
        <template #default="{ row }">
          <span :class="['eval-page__badge', row.pass ? 'eval-page__badge--pass' : 'eval-page__badge--fail']">
            {{ row.pass ? 'pass' : 'fail' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="reason" label="原因" min-width="260">
        <template #default="{ row }">
          <span class="eval-page__reason">{{ row.reason || '—' }}</span>
        </template>
      </el-table-column>
    </el-table>

    <div v-else class="eval-page__empty">
      暂无报告，请在终端执行 npm run eval
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import $curl from '$elpisCurl';

const loading = ref(false);
const ingesting = ref(false);
const ingestMessage = ref('');
const report = ref({
  suite: '',
  ranAt: null,
  results: [],
  passCount: 0,
  failCount: 0,
});

function formatRanAt(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

async function loadReport() {
  loading.value = true;

  const res = await $curl({
    method: 'get',
    url: '/api/eval/report',
    errorMessage: '读取报告失败',
  });

  loading.value = false;

  if (!res?.success) {
    return;
  }

  report.value = {
    suite: res.data?.suite ?? '',
    ranAt: res.data?.ranAt ?? null,
    results: Array.isArray(res.data?.results) ? res.data.results : [],
    passCount: Number(res.data?.passCount ?? 0),
    failCount: Number(res.data?.failCount ?? 0),
  };
}

async function ingestFixtures() {
  ingesting.value = true;
  ingestMessage.value = '';

  const res = await $curl({
    method: 'post',
    url: '/api/eval/ingest',
    errorMessage: '灌库失败',
  });

  ingesting.value = false;

  if (!res?.success) {
    return;
  }

  const ingested = res.data?.ingested ?? 0;
  const chunks = res.data?.chunks ?? 0;
  ingestMessage.value = `已灌库：ingested=${ingested}，chunks=${chunks}`;
  ElMessage.success('灌库完成');
}

onMounted(() => {
  void loadReport();
});
</script>

<style scoped>
.eval-page {
  box-sizing: border-box;
  min-height: 100%;
  padding: 20px 24px;
  background: #ffffff;
  color-scheme: light;
  color: #111827;
  --el-text-color-primary: #111827;
  --el-text-color-regular: #374151;
  --el-bg-color: #fff;
  --el-fill-color-lighter: #f3f4f6;
}

.eval-page__header {
  margin-bottom: 16px;
}

.eval-page__title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}

.eval-page__hint {
  margin: 0;
  font-size: 14px;
  color: #374151;
}

.eval-page__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.eval-page__btn {
  min-width: 96px;
  height: 36px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.eval-page__btn-secondary {
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
  font-weight: 500;
}

.eval-page__btn-primary {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
  font-weight: 500;
}

.eval-page__ingest {
  margin: 0 0 12px;
  font-size: 14px;
  color: #374151;
}

.eval-page__meta,
.eval-page__summary {
  margin-bottom: 12px;
  font-size: 14px;
  color: #374151;
}

.eval-page__meta-value,
.eval-page__summary-value {
  color: #111827;
  font-weight: 600;
}

.eval-page__table {
  --el-table-bg-color: #fff;
  --el-table-tr-bg-color: #fff;
  --el-table-header-bg-color: #f3f4f6;
  --el-table-text-color: #374151;
  --el-table-header-text-color: #111827;
  --el-fill-color-lighter: #f9fafb;
}

.eval-page :deep(.el-select__wrapper) {
  background: #fff !important;
  box-shadow: 0 0 0 1px #d1d5db inset !important;
}

.eval-page :deep(.el-select__selected-item) {
  color: #111827 !important;
  font-size: 14px;
  font-weight: 500;
}

.eval-page__table :deep(tr.el-table__row) {
  background: #fff !important;
}

.eval-page__table :deep(tr.el-table__row--striped) {
  background: #f9fafb !important;
}

.eval-page__table :deep(td.el-table__cell) {
  color: #374151 !important;
  background: inherit !important;
  font-size: 14px;
}

.eval-page__table :deep(th.el-table__cell) {
  background: #f3f4f6 !important;
  color: #111827 !important;
  font-weight: 600;
}

.eval-page__id {
  color: #111827 !important;
  font-weight: 500;
}

.eval-page__reason {
  color: #374151 !important;
}

.eval-page__badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.eval-page__badge--pass {
  background: #d1fae5;
  color: #065f46;
}

.eval-page__badge--fail {
  background: #fee2e2;
  color: #991b1b;
}

.eval-page__empty {
  padding: 24px;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  color: #374151;
  background: #f9fafb;
}
</style>
