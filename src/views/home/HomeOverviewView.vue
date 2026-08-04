<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
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
  FileTextOutlined,
  SyncOutlined,
  PauseCircleOutlined,
  SendOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  PhoneOutlined,
} from '@ant-design/icons-vue';
import { useUserStore } from '@/stores/user';
import CreateTicketModal from '@/views/tickets/components/CreateTicketModal.vue';
import OpAiAssistant from '@/views/tickets/components/operation/OpAiAssistant.vue';
import OpStatDetailModal from '@/views/tickets/components/operation/OpStatDetailModal.vue';
import HomePerformancePanel from '@/views/home/components/HomePerformancePanel.vue';

/** 个人门户通用知识推荐（无工单上下文） */
const HOME_AI_KNOWLEDGE = ['工单处理操作指引', '常见问题与话术库', 'SLA 与升级规则说明'];
// HOME_EFFICIENCY / HOME_TYPE_DIST 已随「效率对比卡」「类型分布卡」一并移除引用；
// mock 中的定义暂留，待确认无其它引用后再清理。
import {
  HOME_KPIS,
  HOME_NOTICE,
  HOME_NOTICES,
  HOME_METRIC_DRILLS,
  HOME_PERFORMANCE,
  HOME_QUICK_LINKS,
  HOME_TODOS,
  HOME_TREND_DONE,
  HOME_TREND_FOLLOW,
  HOME_TREND_LABELS,
  type HomeKpi,
  type HomeMetricDrillKey,
  type HomeNotice,
} from '@/mock/homeOverview';

const KPI_ICON_MAP: Record<HomeKpi['icon'], Component> = {
  file: FileTextOutlined,
  sync: SyncOutlined,
  pause: PauseCircleOutlined,
  send: SendOutlined,
  clock: ClockCircleOutlined,
  alert: ExclamationCircleOutlined,
  phone: PhoneOutlined,
};

function kpiIcon(name: HomeKpi['icon']) {
  return KPI_ICON_MAP[name];
}

const router = useRouter();
const user = useUserStore();
/** 本期不覆盖公告能力，默认隐藏 */
const noticeVisible = ref(false);
const createOpen = ref(false);
const drillOpen = ref(false);
const activeDrillKey = ref<HomeMetricDrillKey | null>(null);
const activeDrillTable = computed(() =>
  activeDrillKey.value ? HOME_METRIC_DRILLS[activeDrillKey.value] : null,
);

// 公告列表抽屉
const noticeListOpen = ref(false);
const activeNotice = ref<HomeNotice | null>(null);
// 颜色=是否需要注意：系统维护影响工作（维护窗口/停派单）→ 橙提醒；
// 运营通知/制度更新为信息性 → 中性灰。类型靠文字区分。
const noticeTagColor: Record<HomeNotice['tag'], string> = {
  系统维护: 'orange',
  运营通知: 'default',
  制度更新: 'default',
};
function openNotice(n: HomeNotice) {
  activeNotice.value = n;
}

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
  router.push({ path: '/tickets', query: { filter: label } });
}

function onQuick(key: string) {
  const map: Record<string, () => void> = {
    create: () => { createOpen.value = true; },
    pool: () => router.push('/tickets'),
    mine: () => router.push('/tickets'),
    kb: () => message.info('打开知识库'),
    transfer: () => message.info('打开转派记录'),
    report: () => {
      if (['team-leader', 'tenant-admin', 'ops-admin', 'system-admin'].includes(user.roleKey)) {
        router.push('/tickets/list');
      } else {
        message.info('打开统计报表');
      }
    },
  };
  map[key]?.();
}

function onTodo(no: string) {
  router.push(`/tickets/${no}`);
}

function openMetricDrill(key: HomeMetricDrillKey) {
  activeDrillKey.value = key;
  drillOpen.value = true;
}

function openDrillTicket(no: string) {
  drillOpen.value = false;
  router.push({ name: 'ticket-operation', params: { ticketNo: no } });
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
      <span class="notice-link" @click="noticeListOpen = true">
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

    <!--
      ③ 今日概览：只放**数量**（R1b）。与下方「我的效能」（只放率值）成对，
      读者一眼能分清「上面是量、下面是率」。区标题是这层语义的显性化。
    -->
    <section class="overview-section">
      <div class="section-head">
        <div>
          <div class="section-title">今日概览</div>
          <div class="section-sub">当日数量口径 · 点卡片查看对应工单</div>
        </div>
      </div>
      <div class="kpi-strip">
        <div
          v-for="kpi in HOME_KPIS"
          :key="kpi.key"
          class="kpi-card"
          @click="onKpiClick(kpi.label)"
        >
        <div class="kpi-body">
          <div class="kpi-label">{{ kpi.label }}</div>
          <div class="kpi-value-row">
            <span class="kpi-value" :style="{ color: kpi.valueColor }">{{ kpi.value }}</span>
            <span v-if="kpi.delta" class="kpi-delta" :style="{ color: kpi.deltaColor }">{{ kpi.delta }}</span>
            <span v-if="kpi.suffix" class="kpi-suffix">{{ kpi.suffix }}</span>
          </div>
        </div>
          <div class="kpi-icon" :style="{ background: kpi.iconBg, color: kpi.valueColor }">
            <component :is="kpiIcon(kpi.icon)" />
          </div>
        </div>
      </div>
    </section>

    <!-- ④ 我的效能：4 组指标族（每卡恒 3 行）+ 组内位置 + 明细下钻 -->
    <HomePerformancePanel :cards="HOME_PERFORMANCE" @drill="openMetricDrill" />

    <!--
      ⑤ 趋势区
      原「分析区」有三张卡，已删两张：
        · 「我的效率·较团队均值」—— 4 项里 3 项与「我的效能」区是同一个数（平均解决时长/
          一次解决率/满意度），纯重复；余下「平均首响」需求模块3 未要求（只要求响应及时率）。
        · 「我的工单类型分布」—— 需求模块3 七项中无此项，是 01 老页面遗留；改造方案已定
          并入绩效表维度 Tab「按工单类型」。
      保留趋势卡并独占整行：30 天折线拉宽后才读得出走势。
    -->
    <div class="analysis-row">
      <div class="card analysis-card trend-card">
        <div class="card-head">
          <div>
            <div class="card-title">我的处理趋势（最近 30 天）</div>
            <!-- 口径修正：坐席产生不了「已解决」，其动作是「下送」→ 进调研中 -->
            <div class="card-sub">我跟进的 vs 我下送的</div>
          </div>
          <div class="legend">
            <span class="legend-item"><i class="dot blue" />我跟进的</span>
            <span class="legend-item"><i class="dot green" />我下送的</span>
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

      <!-- 「我的工单类型分布」「我的效率·较团队均值」已删，理由见上方注释 -->
    </div>

    <!-- ⑥ 底部行 -->
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

    <CreateTicketModal v-model:open="createOpen" @created="message.success('工单已创建')" />

    <OpStatDetailModal
      v-model:open="drillOpen"
      :table="activeDrillTable"
      :width="920"
      @open-ticket="openDrillTicket"
    />

    <!-- 公告列表抽屉 -->
    <a-drawer
      v-model:open="noticeListOpen"
      title="系统公告"
      placement="right"
      :width="480"
      @close="activeNotice = null"
    >
      <!-- 详情视图 -->
      <div v-if="activeNotice" class="notice-detail">
        <a-button type="link" class="notice-back" @click="activeNotice = null">
          ‹ 返回列表
        </a-button>
        <div class="nd-head">
          <a-tag :color="noticeTagColor[activeNotice.tag]">{{ activeNotice.tag }}</a-tag>
          <h3 class="nd-title">{{ activeNotice.title }}</h3>
        </div>
        <div class="nd-meta">
          <span>{{ activeNotice.publisher }}</span>
          <span>·</span>
          <span>{{ activeNotice.publishAt }}</span>
          <span>·</span>
          <span>范围：{{ activeNotice.scope }}</span>
        </div>
        <p class="nd-body">{{ activeNotice.content }}</p>
      </div>

      <!-- 列表视图 -->
      <div v-else class="notice-list">
        <div
          v-for="n in HOME_NOTICES"
          :key="n.id"
          class="notice-item"
          @click="openNotice(n)"
        >
          <div class="ni-top">
            <a-tag :color="noticeTagColor[n.tag]">{{ n.tag }}</a-tag>
            <span v-if="n.top" class="ni-top-flag">置顶</span>
            <span class="ni-date">{{ n.publishAt }}</span>
          </div>
          <div class="ni-title">{{ n.title }}</div>
          <div class="ni-summary">{{ n.content }}</div>
          <div class="ni-foot">{{ n.publisher }} · {{ n.scope }}</div>
        </div>
      </div>
    </a-drawer>

    <!-- 个人门户通用 AI 助手（悬浮 Copilot，无工单上下文） -->
    <OpAiAssistant scope="global" :knowledge="HOME_AI_KNOWLEDGE" />
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

/**
 * 卡片视觉基线（2026-08-03 调整）
 * 参考页实测：圆角 12 / 边框 0.8px #E5E6EB / 阴影 0 1px 4px rgba(0,0,0,.06)
 * 原为 圆角 10 / 1px #E5E7EB / 无阴影 —— 全靠边框分层，观感偏平硬。
 * ⚠️ 与《iFLY-FlowOS-设计风格规范》§4.4「圆角 6/8、阴影可选」不一致，
 *    属本页有意分支，待规范 v3 统一后回收。
 */
.card {
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

/* 公告条 */
.notice-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #eff6ff;
  border: 0.8px solid #bfdbfe;
  border-radius: 12px;
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

/* KPI 总览：独立色卡（参考截图） */
/* 「今日概览」区：与「我的效能」同为「大卡套小卡」两层结构，形成量/率对仗 */
.overview-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.overview-section .section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.overview-section .section-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.overview-section .section-sub {
  margin-top: 2px;
  font-size: 11px;
  color: #9ca3af;
}

.kpi-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 12px;
}
.kpi-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 84px;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.kpi-card:hover {
  border-color: #d1d5db;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}
.kpi-body {
  min-width: 0;
  flex: 1;
}
.kpi-label {
  font-size: 13px;
  color: #9ca3af;
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.kpi-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
}
.kpi-delta {
  font-size: 12px;
  font-weight: 600;
}
.kpi-suffix {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
}
.kpi-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
@media (max-width: 1280px) {
  .kpi-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 720px) {
  .kpi-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 分析区 */
/* 删掉类型分布卡与效率对比卡后，趋势卡独占整行——30 天折线拉宽才读得出走势 */
.analysis-row {
  display: grid;
  grid-template-columns: 1fr;
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

/* 公告列表抽屉 */
.notice-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.notice-item {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.notice-item:hover {
  border-color: #93c5fd;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.12);
}
.ni-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.ni-top-flag {
  font-size: 12px;
  color: #f97316;
  font-weight: 600;
}
.ni-date {
  margin-left: auto;
  font-size: 12px;
  color: #9ca3af;
}
.ni-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
}
.ni-summary {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ni-foot {
  margin-top: 8px;
  font-size: 12px;
  color: #9ca3af;
}

.notice-detail .notice-back {
  padding: 0;
  margin-bottom: 8px;
}
.nd-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}
.nd-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  line-height: 1.4;
}
.nd-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 16px;
}
.nd-body {
  font-size: 14px;
  color: #374151;
  line-height: 1.8;
  white-space: pre-wrap;
}
</style>
