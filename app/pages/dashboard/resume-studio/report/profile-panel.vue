<template>
  <section class="profile-panel">
    <header class="profile-panel__header">
      <h2 class="profile-panel__title">能力画像</h2>
      <p class="profile-panel__hint">六维雷达 · 点击维度查看依据</p>
    </header>

    <p v-if="degradedReason" class="profile-panel__degraded">{{ degradedReason }}</p>

    <div
      v-loading="loading"
      element-loading-background="rgba(255,255,255,0.92)"
      class="profile-panel__body"
    >
      <div v-if="hasProfile" class="profile-panel__radar-wrap">
        <div ref="radarRef" class="profile-panel__radar"></div>
        <ul class="profile-panel__dimension-list">
          <li
            v-for="item in dimensions"
            :key="item.dimension"
            class="profile-panel__dimension-item"
          >
            <button type="button" class="profile-panel__dimension-btn" @click="openDrawer(item)">
              {{ item.dimension }} · {{ formatScore(item.score) }}
              <span class="profile-panel__dimension-link">查看依据</span>
            </button>
          </li>
        </ul>
      </div>
      <p v-else class="profile-panel__empty">暂无能力画像，请点击上方「分析」生成。</p>

      <div v-if="hasProfile" class="profile-panel__cards">
        <article class="profile-panel__card profile-panel__card--strength">
          <h3>优势</h3>
          <ul>
            <li v-for="(text, index) in strengths" :key="`s-${index}`">{{ text }}</li>
          </ul>
        </article>
        <article class="profile-panel__card profile-panel__card--weakness">
          <h3>劣势</h3>
          <ul>
            <li v-for="(text, index) in weaknesses" :key="`w-${index}`">{{ text }}</li>
          </ul>
        </article>
      </div>

      <div v-if="hasProfile" class="profile-panel__skills">
        <h3 class="profile-panel__skills-title">技能墙</h3>
        <div class="profile-panel__skill-tags">
          <span
            v-for="skill in skills"
            :key="skill.name"
            class="profile-panel__skill-tag"
          >
            {{ skill.name }}
            <em>{{ skill.count }}</em>
          </span>
        </div>
      </div>
    </div>

    <el-drawer
      v-model="drawerVisible"
      :title="activeDimension?.dimension || '维度依据'"
      direction="rtl"
      size="480px"
      class="profile-panel__drawer"
    >
      <section class="profile-panel__drawer-section">
        <h4>标准出处</h4>
        <p v-if="activeRubricDocId" class="profile-panel__drawer-ref">
          docId: {{ activeRubricDocId }}
        </p>
        <p class="profile-panel__drawer-text">{{ activeRubricText }}</p>
      </section>
      <section class="profile-panel__drawer-section">
        <h4>简历证据</h4>
        <p class="profile-panel__drawer-text">{{ activeDimension?.resumeRef || '—' }}</p>
      </section>
    </el-drawer>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts';
import { DIMENSION_NAMES } from '../mock/report.mock.js';

const props = defineProps({
  profile: {
    type: Object,
    default: null,
  },
  degradedReason: {
    type: String,
    default: '',
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

const radarRef = ref(null);
const drawerVisible = ref(false);
const activeDimension = ref(null);

let chartInstance = null;

const dimensions = computed(() => props.profile?.dimensions ?? []);
const strengths = computed(() => props.profile?.strengths ?? []);
const weaknesses = computed(() => props.profile?.weaknesses ?? []);
const skills = computed(() => props.profile?.skills ?? []);
const hasProfile = computed(() => dimensions.value.length > 0);

const activeRubricDocId = computed(() => {
  const refValue = activeDimension.value?.rubricRef;
  if (!refValue || typeof refValue === 'string') return '';
  return refValue.docId || '';
});

const activeRubricText = computed(() => {
  const refValue = activeDimension.value?.rubricRef;
  if (!refValue) return '—';
  if (typeof refValue === 'string') return refValue;
  return refValue.text || '—';
});

function formatScore(score) {
  if (score === null || score === undefined) {
    return '证据不足';
  }
  return `${score} 分`;
}

function getScoreMap() {
  return dimensions.value.reduce((map, item) => {
    map[item.dimension] = item.score;
    return map;
  }, {});
}

function renderChart() {
  if (!radarRef.value || !hasProfile.value) {
    return;
  }

  if (!chartInstance) {
    chartInstance = echarts.init(radarRef.value);
  }

  const scoreMap = getScoreMap();

  chartInstance.setOption({
    tooltip: {
      trigger: 'item',
      formatter(params) {
        const values = params?.value ?? [];
        return DIMENSION_NAMES.map((name, index) => {
          const score = values[index];
          const label = score === null || score === undefined ? '证据不足' : `${score} 分`;
          return `${name}: ${label}`;
        }).join('<br/>');
      },
    },
    radar: {
      triggerEvent: true,
      indicator: DIMENSION_NAMES.map((name) => ({
        name,
        max: 100,
      })),
      radius: '62%',
    },
    series: [{
      type: 'radar',
      data: [{
        value: DIMENSION_NAMES.map((name) => {
          const score = scoreMap[name];
          return score === null || score === undefined ? null : score;
        }),
        name: '能力得分',
        areaStyle: {
          color: 'rgba(59, 130, 246, 0.25)',
        },
        lineStyle: {
          color: '#2563eb',
        },
        itemStyle: {
          color: '#2563eb',
        },
      }],
    }],
  });

  chartInstance.off('click');
  chartInstance.on('click', (params) => {
    const dimensionName = typeof params.name === 'string' ? params.name : '';
    if (!DIMENSION_NAMES.includes(dimensionName)) {
      return;
    }

    const dimension = dimensions.value.find((item) => item.dimension === dimensionName);
    if (dimension) {
      openDrawer(dimension);
    }
  });
}

function openDrawer(dimension) {
  activeDimension.value = dimension;
  drawerVisible.value = true;
}

function handleResize() {
  chartInstance?.resize();
}

watch(
  () => [props.profile, props.loading],
  async () => {
    if (props.loading) {
      return;
    }

    await nextTick();
    renderChart();
  },
  { deep: true, immediate: true },
);

onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  chartInstance?.dispose();
  chartInstance = null;
});
</script>

<style scoped>
.profile-panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px 24px;
}

.profile-panel__header {
  margin-bottom: 16px;
}

.profile-panel__title {
  margin: 0;
  font-size: 18px;
  color: #111827;
}

.profile-panel__hint {
  margin: 6px 0 0;
  font-size: 13px;
  color: #6b7280;
}

.profile-panel__degraded {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #c2410c;
  font-size: 13px;
}

.profile-panel__body {
  min-height: 320px;
}

.profile-panel__empty {
  margin: 0;
  padding: 48px 0;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
}

.profile-panel__radar-wrap {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(220px, 320px);
  gap: 16px;
  align-items: center;
}

.profile-panel__radar {
  width: 100%;
  height: 360px;
}

.profile-panel__dimension-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.profile-panel__dimension-item + .profile-panel__dimension-item {
  margin-top: 8px;
}

.profile-panel__dimension-btn {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  padding: 10px 12px;
  text-align: left;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
}

.profile-panel__dimension-btn:hover {
  border-color: #93c5fd;
  background: #eff6ff;
}

.profile-panel__dimension-link {
  margin-left: 8px;
  color: #2563eb;
  font-size: 12px;
}

.profile-panel__cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.profile-panel__card {
  border-radius: 10px;
  padding: 16px;
}

.profile-panel__card h3 {
  margin: 0 0 10px;
  font-size: 15px;
}

.profile-panel__card ul {
  margin: 0;
  padding-left: 18px;
  color: #374151;
  font-size: 14px;
  line-height: 1.6;
}

.profile-panel__card--strength {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
}

.profile-panel__card--strength h3 {
  color: #047857;
}

.profile-panel__card--weakness {
  background: #fff7ed;
  border: 1px solid #fed7aa;
}

.profile-panel__card--weakness h3 {
  color: #c2410c;
}

.profile-panel__skills {
  margin-top: 20px;
}

.profile-panel__skills-title {
  margin: 0 0 12px;
  font-size: 15px;
  color: #111827;
}

.profile-panel__skill-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.profile-panel__skill-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  font-size: 13px;
}

.profile-panel__skill-tag em {
  font-style: normal;
  font-size: 12px;
  color: #64748b;
}
</style>

<style>
.profile-panel__drawer .el-drawer__body {
  background: #fff;
  color: #111827;
}

.profile-panel__drawer-section {
  background: #fff;
  color: #111827;
}

.profile-panel__drawer-section + .profile-panel__drawer-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.profile-panel__drawer-section h4 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #111827;
  background: #fff;
}

.profile-panel__drawer-ref {
  margin: 0 0 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #374151;
  background: #fff;
}

.profile-panel__drawer-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #111827;
  background: #fff;
  white-space: pre-wrap;
}
</style>
