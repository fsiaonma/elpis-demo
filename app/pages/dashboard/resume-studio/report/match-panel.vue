<template>
  <section class="match-panel">
    <header class="match-panel__header">
      <h2 class="match-panel__title">岗位匹配</h2>
      <p class="match-panel__hint">Top 5 排行 · 选中岗位查看综合分与差距清单</p>
    </header>

    <p v-if="degradedReason" class="match-panel__degraded">{{ degradedReason }}</p>

    <div
      v-loading="loading"
      element-loading-background="rgba(255,255,255,0.92)"
      class="match-panel__body"
    >
      <div v-if="weightEntries.length" class="match-panel__weights">
        <h3 class="match-panel__sub-title">维度权重</h3>
        <div
          v-for="entry in weightEntries"
          :key="entry.key"
          class="match-panel__weight-row"
        >
          <span class="match-panel__weight-label">{{ entry.key }}</span>
          <el-slider
            v-model="entry.value"
            :min="0"
            :max="100"
            :step="1"
            :show-tooltip="true"
            @change="handleWeightChange"
          />
          <span class="match-panel__weight-value">{{ entry.value }}%</span>
        </div>
        <div class="match-panel__weight-actions">
          <el-button size="small" @click="resetWeights">恢复默认权重</el-button>
          <span class="match-panel__recompute-meta">
            本次重算：{{ recomputeMeta.modelCalls }} 次模型调用 · 耗时 {{ recomputeMeta.elapsedMs }} ms
          </span>
        </div>
      </div>

      <div class="match-panel__charts">
        <div class="match-panel__rank">
          <h3 class="match-panel__sub-title">Top 5 岗位排行</h3>
          <div ref="barRef" class="match-panel__bar"></div>
        </div>
        <div class="match-panel__gauge">
          <h3 class="match-panel__sub-title">综合分</h3>
          <p class="match-panel__selected">{{ selectedJobLabel }}</p>
          <div ref="gaugeRef" class="match-panel__gauge-chart"></div>
        </div>
      </div>

      <div class="match-panel__gaps">
        <h3 class="match-panel__sub-title">差距清单</h3>
        <el-table :data="gaps" stripe border>
          <el-table-column label="要求" min-width="220">
            <template #default="{ row }">
              {{ formatRequirement(row) }}
            </template>
          </el-table-column>
          <el-table-column prop="verdict" label="判定" width="120">
            <template #default="{ row }">
              <span :class="['match-panel__verdict', `match-panel__verdict--${row.verdict}`]">
                {{ verdictLabel(row.verdict) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="证据" min-width="260">
            <template #default="{ row }">
              {{ row.evidence?.trim() ? row.evidence : '简历里没找到相关内容' }}
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <el-drawer
      v-model="drawerVisible"
      :title="drawerJob?.title || '岗位明细'"
      direction="rtl"
      size="520px"
      class="match-panel__drawer"
    >
      <div v-if="drawerJob" class="match-panel__drawer-content">
        <p class="match-panel__drawer-meta">
          {{ drawerJob.company }}
          <span v-if="drawerJob.disqualified" class="match-panel__disqualified-tag">未过门槛</span>
        </p>
        <article
          v-for="item in drawerJob.items || []"
          :key="item.requirementId"
          class="match-panel__item-card"
        >
          <div class="match-panel__item-head">
            <strong>{{ formatRequirement(item) }}</strong>
            <span :class="['match-panel__verdict', `match-panel__verdict--${item.verdict}`]">
              {{ verdictLabel(item.verdict) }}
            </span>
          </div>
          <p class="match-panel__item-evidence">
            {{ item.evidence?.trim() ? item.evidence : '简历里没找到相关内容' }}
          </p>
          <p v-if="item.reason" class="match-panel__item-reason">理由：{{ item.reason }}</p>
          <p class="match-panel__item-meta">
            权重 {{ formatWeight(item.weight) }} · 贡献 {{ formatContribution(item.contribution) }}
          </p>
        </article>
      </div>
    </el-drawer>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts';
import $curl from '$elpisCommon/curl.js';

const props = defineProps({
  match: {
    type: Object,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  resumeId: {
    type: String,
    default: '',
  },
  degradedReason: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['update:match']);

const barRef = ref(null);
const gaugeRef = ref(null);
const drawerVisible = ref(false);
const drawerJob = ref(null);
const selectedJobId = ref('');
const weightEntries = ref([]);
const defaultWeights = ref({});
const recomputeMeta = ref({ modelCalls: 0, elapsedMs: 0 });

let barChart = null;
let gaugeChart = null;

const jobs = computed(() => (Array.isArray(props.match.jobs) ? props.match.jobs : []));

const topJobs = computed(() => {
  return [...jobs.value]
    .sort((left, right) => Number(right.total ?? 0) - Number(left.total ?? 0))
    .slice(0, 5);
});

const selectedJob = computed(() => {
  return jobs.value.find((job) => job.jobId === selectedJobId.value) || topJobs.value[0] || null;
});

const selectedJobLabel = computed(() => {
  if (!selectedJob.value) return '未选择岗位';
  const suffix = selectedJob.value.disqualified ? ' · 未过门槛' : '';
  return `${selectedJob.value.title} · ${selectedJob.value.company}${suffix}`;
});

const gaps = computed(() => {
  const list = selectedJob.value?.gaps || [];
  return [...list].sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0));
});

function formatRequirement(row) {
  if (row.text?.trim()) return row.text;
  return row.requirementId || '—';
}

function verdictLabel(verdict) {
  if (verdict === 'hit') return '命中';
  if (verdict === 'partial') return '部分命中';
  return '未命中';
}

function formatWeight(value) {
  return `${Math.round(Number(value ?? 0) * 100)}%`;
}

function formatContribution(value) {
  return Number(value ?? 0).toFixed(3);
}

function syncWeightsFromMatch() {
  const dimensionWeights =
    props.match?.weights?.dimensionWeights &&
    typeof props.match.weights.dimensionWeights === 'object'
      ? props.match.weights.dimensionWeights
      : {};
  defaultWeights.value = { ...dimensionWeights };
  weightEntries.value = Object.entries(dimensionWeights).map(([key, value]) => ({
    key,
    value: Math.round(Number(value) * 100),
  }));
}

async function handleWeightChange() {
  if (!props.resumeId) return;
  const dimensionWeights = weightEntries.value.reduce((map, entry) => {
    map[entry.key] = entry.value / 100;
    return map;
  }, {});

  const res = await $curl({
    method: 'post',
    url: `/api/resume/${props.resumeId}/match/recompute`,
    data: { dimensionWeights },
    errorMessage: '权重重算失败',
  });

  if (!res?.success || !res.data?.match) return;

  recomputeMeta.value = {
    modelCalls: res.data.modelCalls ?? 0,
    elapsedMs: res.data.elapsedMs ?? 0,
  };
  emit('update:match', res.data.match);
}

function resetWeights() {
  weightEntries.value = Object.entries(defaultWeights.value).map(([key, value]) => ({
    key,
    value: Math.round(Number(value) * 100),
  }));
  void handleWeightChange();
}

function renderBarChart() {
  if (!barRef.value) return;
  if (!barChart) barChart = echarts.init(barRef.value);

  const sortedJobs = [...topJobs.value].reverse();

  barChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 12, right: 24, top: 12, bottom: 12, containLabel: true },
    xAxis: { type: 'value', max: 100, splitLine: { lineStyle: { color: '#e5e7eb' } } },
    yAxis: {
      type: 'category',
      data: sortedJobs.map((job) => {
        const mark = job.disqualified ? ' ⚠' : '';
        return `${job.title} · ${job.company}${mark}`;
      }),
      axisLabel: { width: 240, overflow: 'break' },
    },
    series: [{
      type: 'bar',
      data: sortedJobs.map((job) => ({
        value: job.total,
        jobId: job.jobId,
        itemStyle: {
          color: job.disqualified
            ? '#fca5a5'
            : job.jobId === selectedJobId.value
              ? '#2563eb'
              : '#93c5fd',
        },
      })),
      barMaxWidth: 18,
      label: { show: true, position: 'right', formatter: '{c}' },
    }],
  });

  barChart.off('click');
  barChart.on('click', (params) => {
    const jobId = params.data?.jobId;
    if (!jobId) return;
    selectedJobId.value = jobId;
    const job = jobs.value.find((item) => item.jobId === jobId);
    if (job) {
      drawerJob.value = job;
      drawerVisible.value = true;
    }
    renderBarChart();
    renderGaugeChart();
  });
}

function renderGaugeChart() {
  if (!gaugeRef.value) return;
  if (!gaugeChart) gaugeChart = echarts.init(gaugeRef.value);

  const score = selectedJob.value?.total ?? 0;
  gaugeChart.setOption({
    series: [{
      type: 'gauge',
      min: 0,
      max: 100,
      progress: { show: true, width: 14 },
      axisLine: { lineStyle: { width: 14 } },
      axisTick: { show: false },
      splitLine: { length: 8, lineStyle: { width: 2, color: '#999' } },
      axisLabel: { distance: 18, color: '#64748b', fontSize: 11 },
      anchor: { show: true, size: 12, itemStyle: { borderWidth: 2 } },
      pointer: { length: '58%', width: 5 },
      detail: { valueAnimation: true, fontSize: 28, offsetCenter: [0, '72%'], formatter: '{value}' },
      data: [{ value: score, name: '综合分' }],
    }],
  });
}

function handleResize() {
  barChart?.resize();
  gaugeChart?.resize();
}

watch(
  () => [props.match, props.loading],
  async () => {
    syncWeightsFromMatch();
    if (!selectedJobId.value && topJobs.value[0]?.jobId) {
      selectedJobId.value = topJobs.value[0].jobId;
    }
    if (props.loading) return;
    await nextTick();
    renderBarChart();
    renderGaugeChart();
  },
  { deep: true, immediate: true },
);

onMounted(() => window.addEventListener('resize', handleResize));
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  barChart?.dispose();
  gaugeChart?.dispose();
  barChart = null;
  gaugeChart = null;
});
</script>

<style scoped>
.match-panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px 24px;
}
.match-panel__header { margin-bottom: 16px; }
.match-panel__title { margin: 0; font-size: 18px; color: #111827; }
.match-panel__hint { margin: 6px 0 0; font-size: 13px; color: #6b7280; }
.match-panel__degraded {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #c2410c;
  font-size: 13px;
}
.match-panel__body { min-height: 320px; }
.match-panel__weights {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
}
.match-panel__weight-row {
  display: grid;
  grid-template-columns: 96px 1fr 56px;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
}
.match-panel__weight-label { font-size: 13px; color: #374151; }
.match-panel__weight-value { font-size: 12px; color: #64748b; text-align: right; }
.match-panel__weight-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.match-panel__recompute-meta { font-size: 12px; color: #64748b; }
.match-panel__charts {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr);
  gap: 20px;
}
.match-panel__sub-title { margin: 0 0 10px; font-size: 15px; color: #111827; }
.match-panel__bar { width: 100%; height: 280px; }
.match-panel__gauge {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  background: #f9fafb;
}
.match-panel__selected { margin: 0 0 8px; font-size: 13px; color: #475569; }
.match-panel__gauge-chart { width: 100%; height: 280px; }
.match-panel__gaps { margin-top: 20px; }
.match-panel__verdict {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}
.match-panel__verdict--hit { background: #dcfce7; color: #166534; }
.match-panel__verdict--partial { background: #fef3c7; color: #92400e; }
.match-panel__verdict--miss { background: #fee2e2; color: #991b1b; }
.match-panel__drawer-content { background: #fff; color: #111827; }
.match-panel__drawer-meta { margin: 0 0 16px; color: #374151; line-height: 1.6; }
.match-panel__disqualified-tag {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fee2e2;
  color: #991b1b;
  font-size: 12px;
}
.match-panel__item-card {
  padding: 12px 0;
  border-bottom: 1px solid #e5e7eb;
}
.match-panel__item-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
.match-panel__item-evidence,
.match-panel__item-reason,
.match-panel__item-meta {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: #111827;
}
.match-panel__item-meta { color: #64748b; font-size: 12px; }
</style>

<style>
.match-panel__drawer .el-drawer__body {
  background: #fff;
  color: #111827;
}
</style>
