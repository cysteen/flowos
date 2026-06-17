<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  SoundOutlined,
  RightOutlined,
  CloseOutlined,
  PlusOutlined,
  InboxOutlined,
  UnorderedListOutlined,
  BookOutlined,
  SwapOutlined,
  LineChartOutlined,
} from '@ant-design/icons-vue';
import { useUserStore } from '@/stores/user';
import CreateTicketModal from '@/views/tickets/components/CreateTicketModal.vue';
import {
  HOME_EFFICIENCY,
  HOME_KPIS,
  HOME_NOTICE,
  HOME_QUICK_LINKS,
  HOME_TODOS,
  HOME_TREND_DONE,
  HOME_TREND_FOLLOW,
  HOME_TREND_LABELS,
  HOME_TYPE_DIST,
} from '@/mock/homeOverview';

const router = useRouter();
const user = useUserStore();
const noticeVisible = ref(true);
const createOpen = ref(false);

const greeting = computed(() => {
  const h = new Date().getHours();
  const period = h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好';
  return `${period}，${user.name} 👋`;
});

const summaryText =
  '今天有 6 个待办工单、2 个 SLA 临期，建议优先跟进；本周你已解决 67 单，团队第 2。';

const quickIcons = {
  plus: PlusOutlined,
  inbox: InboxOutlined,
  list: UnorderedListOutlined,
  book: BookOutlined,
  repeat: SwapOutlined,
  chart: LineChartOutlined,
};

function trendPoints(values: number[]): string {
  const w = 400;
  const step = w / (values.length - 1);
  return values.map((y, i) => `${i * step},${y}`).join(' ');
}

function onKpiClick(label: string) {
  message.info(`跳转工单工作台 · 筛选「${label}」（占位）`);
  router.push('/tickets');
}

function onQuick(key: string) {
  const map: Record<string, () => void> = {
    create: () => { createOpen.value = true; },
    pool: () => router.push('/tickets'),
    mine: () => router.push('/tickets'),
    kb: () => message.info('打开知识库（占位）'),
    transfer: () => message.info('打开转派记录（占位）'),
    report: () => {
      if (['team-leader', 'tenant-admin', 'ops-admin', 'system-admin'].includes(user.roleKey)) {
        router.push('/tickets/list');
      } else {
        message.info('打开统计报表（占位）');
      }
    },
  };
  map[key]?.();
}

function onTodo(no: string) {
  message.info(`${no} → 工单操作页（Prompt 3 / PRD-03）`);
}
</script>

<template>
  <div class="home-overview">
    <!-- ① 公告条 -->
    <div v-if="noticeVisible" class="notice-bar">
      <SoundOutlined class="notice-icon" />
      <span class="notice-tag">公告</span>
      <span class="notice-text">{{ HOME_NOTICE.text }}</span>
      <span class="notice-spacer" />
      <span class="notice-link" @click="message.info('打开公告列表（占位）')">
        查看全部 ({{ HOME_NOTICE.total }})
        <RightOutlined :style="{ fontSize: '12px' }" />
      </span>
      <CloseOutlined class="notice-close" @click="noticeVisible = false" />
    </div>

    <!-- ② 问候区 -->
    <div class="card greeting-card">
      <div class="greeting-text">
        <div class="greeting-title">{{ greeting }}</div>
        <div class="greeting-sub">{{ summaryText }}</div>
      </div>
      <button class="btn-primary" @click="createOpen = true">新建工单</button>
    </div>

    <!-- ③ 总览条 -->
    <div class="card kpi-strip">
      <template v-for="(kpi, idx) in HOME_KPIS" :key="kpi.key">
        <div v-if="idx > 0" class="kpi-divider" />
        <div class="kpi-cell" @click="onKpiClick(kpi.label)">
          <div class="kpi-label">{{ kpi.label }}</div>
          <div class="kpi-value-row">
            <span class="kpi-value" :style="{ color: kpi.valueColor }">{{ kpi.value }}</span>
            <span v-if="kpi.delta" class="kpi-delta" :style="{ color: kpi.deltaColor }">{{ kpi.delta }}</span>
            <span v-if="kpi.suffix" class="kpi-suffix">{{ kpi.suffix }}</span>
          </div>
        </div>
      </template>
    </div>

    <!-- ④ 分析区 -->
    <div class="analysis-row">
      <!-- 趋势折线 -->
      <div class="card analysis-card trend-card">
        <div class="card-head">
          <div>
            <div class="card-title">我的处理趋势（最近 30 天）</div>
            <div class="card-sub">我跟进的 vs 我完成的</div>
          </div>
          <div class="legend">
            <span class="legend-item"><i class="dot blue" />我跟进的</span>
            <span class="legend-item"><i class="dot green" />我完成的</span>
          </div>
        </div>
        <div class="chart-wrap">
          <svg viewBox="0 0 400 108" preserveAspectRatio="none" class="trend-svg">
            <line x1="0" y1="10" x2="400" y2="10" stroke="#F3F4F6" stroke-width="1" />
            <line x1="0" y1="55" x2="400" y2="55" stroke="#F3F4F6" stroke-width="1" />
            <line x1="0" y1="100" x2="400" y2="100" stroke="#F3F4F6" stroke-width="1" />
            <polyline
              fill="none"
              stroke="#1A6FFF"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              :points="trendPoints(HOME_TREND_FOLLOW)"
            />
            <polyline
              fill="none"
              stroke="#10B981"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              :points="trendPoints(HOME_TREND_DONE)"
            />
            <circle cx="388.5" cy="38" r="3.5" fill="#1A6FFF" />
            <circle cx="388.5" cy="52" r="3.5" fill="#10B981" />
          </svg>
        </div>
        <div class="chart-labels">
          <span v-for="lb in HOME_TREND_LABELS" :key="lb">{{ lb }}</span>
        </div>
      </div>

      <!-- 类型分布 -->
      <div class="card analysis-card type-card">
        <div class="card-title">我的工单类型分布</div>
        <div class="type-list">
          <div v-for="t in HOME_TYPE_DIST" :key="t.label" class="type-row">
            <span class="type-name">{{ t.label }}</span>
            <div class="type-bar-track">
              <div class="type-bar-fill" :style="{ width: `${t.pct}%`, background: t.color }" />
            </div>
            <span class="type-pct">{{ t.pct }}%</span>
          </div>
        </div>
      </div>

      <!-- 效率对比 -->
      <div class="card analysis-card eff-card">
        <div class="card-title">我的效率 · 较团队均值</div>
        <div v-for="(row, i) in HOME_EFFICIENCY" :key="row.label" class="eff-row" :class="{ last: i === HOME_EFFICIENCY.length - 1 }">
          <span class="eff-label">{{ row.label }}</span>
          <div class="eff-right">
            <span class="eff-value">{{ row.value }}</span>
            <span class="eff-badge" :class="row.badgeType">{{ row.badge }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ⑤ 底部行 -->
    <div class="bottom-row">
      <div class="card todo-card">
        <div class="card-head">
          <div class="todo-head-left">
            <span class="card-title">我的待办工单</span>
            <span class="todo-sort-tag">按 SLA 紧急度排序</span>
          </div>
          <span class="link-btn" @click="router.push('/tickets')">查看全部</span>
        </div>
        <div class="todo-list">
          <div v-for="t in HOME_TODOS" :key="t.no" class="todo-row">
            <div class="todo-left">
              <span class="prio-dot" :style="{ background: t.dot }" />
              <span class="todo-no">{{ t.no }}</span>
              <span class="todo-title">{{ t.title }}</span>
              <span class="type-tag" :style="{ color: t.typeColor, background: t.typeColor + '1F' }">{{ t.type }}</span>
              <span class="sla-tag" :style="{ color: t.slaColor, background: t.slaBg }">{{ t.sla }}</span>
            </div>
            <span class="link-btn" @click="onTodo(t.no)">处理</span>
          </div>
        </div>
      </div>

      <div class="card quick-card">
        <div class="card-title">快捷入口</div>
        <div class="quick-grid">
          <div
            v-for="q in HOME_QUICK_LINKS"
            :key="q.key"
            class="quick-tile"
            @click="onQuick(q.key)"
          >
            <div class="quick-icon" :style="{ background: q.color + '14' }">
              <component :is="quickIcons[q.icon]" :style="{ color: q.color, fontSize: '18px' }" />
            </div>
            <span class="quick-label">{{ q.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <CreateTicketModal v-model:open="createOpen" @created="message.success('工单已创建（占位）')" />
  </div>
</template>

<style scoped>
.home-overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  min-height: 100%;
  width: 100%;
  min-width: 0;
  background: #f9fafb;
}

.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}

/* 公告条 */
.notice-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
}
.notice-icon {
  font-size: 18px;
  color: #1a6fff;
  flex: none;
}
.notice-tag {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: #1a6fff;
  border-radius: 4px;
  padding: 2px 8px;
  flex: none;
}
.notice-text {
  font-size: 13px;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.notice-spacer {
  flex: 1;
  min-width: 8px;
}
.notice-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: #1a6fff;
  cursor: pointer;
  flex: none;
}
.notice-close {
  color: #9ca3af;
  font-size: 14px;
  cursor: pointer;
  flex: none;
}

/* 问候 */
.greeting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  gap: 16px;
}
.greeting-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}
.greeting-sub {
  margin-top: 4px;
  font-size: 13px;
  color: #6b7280;
}
.btn-primary {
  flex: none;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: #1a6fff;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  cursor: pointer;
}
.btn-primary:hover {
  background: #0f4fcc;
}

/* KPI 总览 */
.kpi-strip {
  display: flex;
  align-items: center;
  padding: 14px 8px;
}
.kpi-divider {
  width: 1px;
  height: 30px;
  background: #e5e7eb;
  flex: none;
}
.kpi-cell {
  flex: 1;
  min-width: 0;
  padding: 0 16px;
  cursor: pointer;
}
.kpi-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}
.kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.kpi-value {
  font-size: 21px;
  font-weight: 700;
  line-height: 1;
}
.kpi-delta {
  font-size: 11px;
  font-weight: 600;
}
.kpi-suffix {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
}

/* 分析区 */
.analysis-row {
  display: grid;
  grid-template-columns: 1fr 330px 300px;
  gap: 16px;
  min-height: 217px;
}
.analysis-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.card-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.card-sub {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}
.legend {
  display: flex;
  gap: 14px;
  flex: none;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #6b7280;
}
.dot {
  display: inline-block;
  width: 14px;
  height: 3px;
  border-radius: 2px;
}
.dot.blue {
  background: #1a6fff;
}
.dot.green {
  background: #10b981;
}
.chart-wrap {
  flex: 1;
  min-height: 108px;
}
.trend-svg {
  width: 100%;
  height: 108px;
  display: block;
}
.chart-labels {
  display: flex;
  justify-content: space-between;
  padding: 0 4px;
  font-size: 11px;
  color: #9ca3af;
  margin-top: 4px;
}

.type-list {
  display: flex;
  flex-direction: column;
  gap: 11px;
  margin-top: 11px;
  flex: 1;
}
.type-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.type-name {
  width: 28px;
  flex: none;
  font-size: 12px;
  color: #6b7280;
}
.type-bar-track {
  flex: 1;
  height: 8px;
  background: #f3f4f6;
  border-radius: 4px;
  overflow: hidden;
}
.type-bar-fill {
  height: 100%;
  border-radius: 4px;
}
.type-pct {
  width: 32px;
  flex: none;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

.eff-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 0;
  border-bottom: 1px solid #f3f4f6;
}
.eff-row.last {
  border-bottom: none;
}
.eff-label {
  font-size: 13px;
  color: #6b7280;
}
.eff-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.eff-value {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.eff-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
}
.eff-badge.good {
  color: #059669;
  background: #ecfdf5;
}
.eff-badge.neutral {
  color: #6b7280;
  background: #f3f4f6;
}

/* 底部行 */
.bottom-row {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 16px;
  min-height: 300px;
}
.todo-card,
.quick-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.todo-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.todo-sort-tag {
  font-size: 11px;
  font-weight: 600;
  color: #7c3aed;
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 4px;
  padding: 2px 8px;
}
.link-btn {
  font-size: 13px;
  color: #1a6fff;
  cursor: pointer;
  flex: none;
}
.todo-list {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
}
.todo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 4px;
  border-bottom: 1px solid #f3f4f6;
}
.todo-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.prio-dot {
  width: 8px;
  height: 8px;
  border-radius: 4px;
  flex: none;
}
.todo-no {
  font-size: 13px;
  font-weight: 600;
  color: #1a6fff;
  flex: none;
}
.todo-title {
  font-size: 13px;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.type-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  flex: none;
}
.sla-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  flex: none;
  min-width: 84px;
  text-align: center;
}

.quick-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: repeat(3, 1fr);
  gap: 10px;
  margin-top: 12px;
  flex: 1;
}
.quick-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #f9fafb;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  cursor: pointer;
  padding: 8px;
}
.quick-tile:hover {
  border-color: #d1d5db;
}
.quick-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.quick-label {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
}

@media (max-width: 1200px) {
  .analysis-row {
    grid-template-columns: 1fr;
  }
  .bottom-row {
    grid-template-columns: 1fr;
  }
}
</style>
