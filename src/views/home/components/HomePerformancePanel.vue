<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import dayjs, { type Dayjs } from 'dayjs';
import { RightOutlined, TrophyOutlined } from '@ant-design/icons-vue';
import { useUserStore } from '@/stores/user';
import MetricTipIcon from '@/components/MetricTipIcon.vue';
import {
  getHomePerformanceByRange,
  getHomePerformanceRankBoard,
  homePerfTip,
  HOME_PERF_RANGE_OPTS,
  HOME_PERF_TEAMS,
  type HomeMetricDrillKey,
  type HomePerformanceCard,
  type HomePerfRangeKey,
  type HomeRankBoard,
} from '@/mock/homeOverview';

const emit = defineEmits<{
  drill: [key: HomeMetricDrillKey];
}>();

const user = useUserStore();
const teamId = ref(HOME_PERF_TEAMS[0].value);
const rangeKey = ref<HomePerfRangeKey>('today');
const customRange = ref<[Dayjs, Dayjs] | null>(null);
const pickerOpen = ref(false);

const rankOpen = ref(false);
const activeBoard = ref<HomeRankBoard | null>(null);

const RANGE_LABEL: Record<Exclude<HomePerfRangeKey, 'custom'>, string> = {
  today: '今天',
  week: '本周',
  month: '本月',
};

const activeTeam = computed(
  () => HOME_PERF_TEAMS.find((t) => t.value === teamId.value) ?? HOME_PERF_TEAMS[0],
);

const teamOptions = HOME_PERF_TEAMS.map((t) => ({
  value: t.value,
  label: `${t.label}（${t.size}人）`,
}));

const cards = computed(() => getHomePerformanceByRange(rangeKey.value, teamId.value));

const rangeHint = computed(() => {
  if (rangeKey.value === 'custom' && customRange.value) {
    const [a, b] = customRange.value;
    return `${a.format('MM/DD')}–${b.format('MM/DD')}`;
  }
  return rangeKey.value === 'custom' ? '自定义' : RANGE_LABEL[rangeKey.value];
});

watch(rangeKey, (key) => {
  if (key === 'custom') {
    if (!customRange.value) {
      customRange.value = [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')];
    }
    pickerOpen.value = true;
  } else {
    pickerOpen.value = false;
  }
});

/** 自定义区间最长 31 天 */
function disabledPerfDate(current: Dayjs) {
  if (!current) return false;
  if (current.isAfter(dayjs().endOf('day'))) return true;
  const picked = customRange.value;
  if (picked?.[0] && !picked[1]) {
    const start = picked[0];
    const min = start.subtract(30, 'day');
    const max = start.add(30, 'day');
    return current.isBefore(min, 'day') || current.isAfter(max, 'day');
  }
  return false;
}

function openRankBoard(card: HomePerformanceCard) {
  activeBoard.value = getHomePerformanceRankBoard(card, activeTeam.value.label, user.name);
  rankOpen.value = true;
}

function onDrill(card: HomePerformanceCard, e: Event) {
  e.stopPropagation();
  if (card.drill) emit('drill', card.drill);
}
</script>

<template>
  <section class="performance-section">
    <div class="section-head">
      <div class="section-head-main">
        <!--
          「效能」而非「绩效」：本区定位是自我管理 + 查漏补缺，不是考核。
        -->
        <div class="section-title">我的效能</div>
      </div>

      <div class="section-filters">
        <div class="filter-item">
          <span class="filter-label">班组</span>
          <a-select
            v-model:value="teamId"
            size="small"
            :options="teamOptions"
            class="team-select"
            :dropdown-match-select-width="false"
          />
        </div>
        <div class="filter-divider" />
        <div class="filter-item">
          <span class="filter-label">时间</span>
          <a-segmented
            v-model:value="rangeKey"
            size="small"
            :options="HOME_PERF_RANGE_OPTS"
          />
          <a-range-picker
            v-if="rangeKey === 'custom'"
            v-model:value="customRange"
            v-model:open="pickerOpen"
            size="small"
            :allow-clear="false"
            :disabled-date="disabledPerfDate"
            format="MM-DD"
            class="range-picker"
          />
        </div>
      </div>
    </div>

    <div class="performance-grid">
      <article
        v-for="card in cards"
        :key="card.key"
        class="performance-card clickable"
        :class="[`accent-${card.key}`, { 'is-top': card.rank <= 3 }]"
        @click="openRankBoard(card)"
      >
        <header class="metric-head">
          <span class="metric-title">{{ card.title }}</span>
          <span class="rank-badge" :class="{ top: card.rank <= 3 }">
            <TrophyOutlined v-if="card.rank <= 3" />
            {{ card.rankLabel || '组内' }} 第 {{ card.rank }}
            <span class="rank-size">/ {{ card.teamSize }}</span>
          </span>
        </header>

        <div class="metric-list">
          <div v-for="metric in card.metrics" :key="metric.label" class="metric-row">
            <span class="metric-label">
              {{ metric.label }}
              <MetricTipIcon v-if="homePerfTip(metric.label)" :tip="homePerfTip(metric.label)!" />
            </span>
            <span class="metric-value" :class="metric.tone || 'neutral'">{{ metric.value }}</span>
          </div>
        </div>

        <footer v-if="card.drill" class="metric-foot">
          <span class="drill-link" @click="onDrill(card, $event)">
            {{ card.drillLabel || '查看明细' }} <RightOutlined />
          </span>
        </footer>
      </article>
    </div>

    <a-modal
      v-model:open="rankOpen"
      :title="activeBoard ? `${activeBoard.title} · 组内排名` : '组内排名'"
      :footer="null"
      :width="560"
      destroy-on-close
    >
      <div v-if="activeBoard" class="rank-modal">
        <div class="rank-summary">
          <span class="rs-label">我的排名</span>
          <span class="rs-value">
            第 <b>{{ activeBoard.myRank }}</b><span class="rs-total">/{{ activeBoard.teamSize }}</span>
          </span>
          <span class="rs-sep" />
          <span class="rs-meta">
            {{ activeBoard.teamLabel }} · {{ rangeHint }} · {{ activeBoard.metricLabel }}
          </span>
        </div>

        <div class="rank-table-wrap">
          <table class="rank-table">
            <thead>
              <tr>
                <th class="col-rank">排名</th>
                <th class="col-name">姓名</th>
                <th class="col-val">{{ activeBoard.metricLabel }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in activeBoard.rows"
                :key="`${row.rank}-${row.name}`"
                :class="{ me: row.isMe }"
              >
                <td class="col-rank">
                  <span class="rk" :class="{ top: row.rank <= 3 }">{{ row.rank }}</span>
                </td>
                <td class="col-name">
                  {{ row.name }}
                  <span v-if="row.isMe" class="me-tag">我</span>
                </td>
                <td class="col-val">{{ row.value }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </a-modal>
  </section>
</template>

<style scoped>
.performance-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  min-width: 0;
  padding: 18px;
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.section-head-main {
  min-width: 0;
}
.section-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

/* 与今日概览「实时」徽标、趋势区工具条同语汇：浅底筛选条 */
.section-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 12px;
  padding: 6px 10px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}
.filter-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.filter-label {
  flex: none;
  font-size: 12px;
  font-weight: 500;
  color: #9ca3af;
  line-height: 1;
}
.filter-divider {
  width: 1px;
  height: 16px;
  background: #e2e8f0;
  flex: none;
}
.team-select {
  width: 148px;
}
.team-select :deep(.ant-select-selector) {
  border-radius: 8px !important;
  border-color: #e5e7eb !important;
  background: #fff !important;
  height: 28px !important;
  padding-inline: 10px !important;
  align-items: center;
}
.team-select :deep(.ant-select-selection-item),
.team-select :deep(.ant-select-selection-placeholder) {
  font-size: 12px !important;
  font-weight: 500 !important;
  color: #374151 !important;
  line-height: 26px !important;
}
.team-select :deep(.ant-select-arrow) {
  font-size: 10px;
  color: #9ca3af;
}
.section-filters :deep(.ant-segmented) {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 2px;
}
.section-filters :deep(.ant-segmented-item-label) {
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  line-height: 22px;
  min-height: 22px;
  padding: 0 10px;
}
.section-filters :deep(.ant-segmented-item-selected .ant-segmented-item-label) {
  color: #1a6fff;
  font-weight: 600;
}
.section-filters :deep(.ant-segmented-item-selected) {
  box-shadow: 0 1px 2px rgba(26, 111, 255, 0.12);
}
.range-picker {
  width: 168px;
}
.range-picker :deep(.ant-picker) {
  border-radius: 8px;
  height: 28px;
}
.range-picker :deep(.ant-picker-input > input) {
  font-size: 12px;
  color: #374151;
  font-weight: 500;
}

.performance-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  min-width: 0;
}
.performance-card {
  position: relative;
  min-width: 0;
  min-height: 146px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.performance-card::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: #94a3b8;
}
.performance-card.accent-efficiency::before {
  background: linear-gradient(90deg, #1a6fff, #60a5fa);
}
.performance-card.accent-sla::before {
  background: linear-gradient(90deg, #0d9488, #5eead4);
}
.performance-card.accent-quality::before {
  background: linear-gradient(90deg, #059669, #34d399);
}
.performance-card.accent-reach::before {
  background: linear-gradient(90deg, #2563eb, #93c5fd);
}
.performance-card.is-top {
  background: linear-gradient(180deg, #fffbeb 0%, #fff 42%);
  border-color: #fde68a;
}
.performance-card.clickable {
  cursor: pointer;
}
.performance-card.clickable:hover {
  border-color: #93c5fd;
  box-shadow: 0 4px 14px rgba(26, 111, 255, 0.1);
  transform: translateY(-1px);
}
.metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.metric-title {
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  color: #374151;
}
.rank-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 4px;
}
.rank-badge.top {
  color: #b45309;
  background: linear-gradient(180deg, #fef3c7 0%, #fde68a 100%);
  border: 1px solid #fcd34d;
  box-shadow: 0 1px 3px rgba(180, 83, 9, 0.15);
}
.rank-size {
  color: inherit;
  opacity: 0.65;
  font-weight: 500;
}
.metric-list {
  flex: 1;
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.metric-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.metric-label {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #6b7280;
}
.metric-value {
  flex: none;
  font-size: 14px;
  font-weight: 700;
  color: #374151;
}
.metric-value.primary { color: #1a6fff; }
.metric-value.success { color: #059669; }
.metric-value.warning { color: #d97706; }
.metric-value.danger { color: #dc2626; }
.metric-foot {
  margin-top: 10px;
  padding-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid #f3f4f6;
  font-size: 10px;
  color: #9ca3af;
}
.drill-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #1a6fff;
  font-weight: 600;
}
.drill-link:hover {
  text-decoration: underline;
}

/* 组内排名弹窗 */
.rank-modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rank-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
}
.rs-label {
  font-size: 12px;
  font-weight: 500;
  color: #9ca3af;
}
.rs-value {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.rs-value b {
  color: #1a6fff;
  font-size: 16px;
  font-weight: 700;
  margin: 0 1px;
}
.rs-total {
  font-size: 12px;
  font-weight: 500;
  color: #9ca3af;
}
.rs-sep {
  width: 1px;
  height: 12px;
  background: #e5e7eb;
  flex: none;
}
.rs-meta {
  min-width: 0;
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rank-table-wrap {
  max-height: 420px;
  overflow: auto;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}
.rank-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 13px;
}
.rank-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
  color: #9ca3af;
  font-weight: 600;
  font-size: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid #eef2f7;
  line-height: 1.3;
}
.rank-table td {
  padding: 9px 12px;
  border-bottom: 1px solid #f3f4f6;
  color: #374151;
  vertical-align: middle;
  line-height: 1.3;
}
.rank-table tr:last-child td {
  border-bottom: none;
}
.rank-table tr.me {
  background: #eff6ff;
}
.rank-table tr.me td {
  color: #1e3a8a;
  font-weight: 600;
}
.col-rank {
  width: 64px;
  text-align: center;
}
.col-name {
  width: auto;
  text-align: left;
}
.col-val {
  width: 132px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  white-space: nowrap;
}
.rk {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: #f3f4f6;
  color: #6b7280;
  font-weight: 700;
  font-size: 12px;
}
.rk.top {
  background: linear-gradient(180deg, #fef3c7 0%, #fde68a 100%);
  color: #b45309;
}
.me-tag {
  margin-left: 6px;
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #1a6fff;
  background: #dbeafe;
  vertical-align: middle;
}

@media (max-width: 720px) {
  .performance-grid { grid-template-columns: 1fr; }
  .filter-divider { display: none; }
}
</style>
