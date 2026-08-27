<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import {
  SoundOutlined,
  RightOutlined,
  CloseOutlined,
  PlusOutlined,
  InboxOutlined,
  UnorderedListOutlined,
  BookOutlined,
  IdcardOutlined,
  LineChartOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons-vue';
import { useUserStore } from '@/stores/user';
import CreateTicketModal from '@/views/tickets/components/CreateTicketModal.vue';
import OpAiAssistant from '@/views/tickets/components/operation/OpAiAssistant.vue';
import OpStatDetailModal from '@/views/tickets/components/operation/OpStatDetailModal.vue';
import HomePerformancePanel from '@/views/home/components/HomePerformancePanel.vue';
import { queryCenterLocation } from '@/views/query/queryCenterRoute';

/** 个人门户通用知识推荐（无工单上下文） */
const HOME_AI_KNOWLEDGE = ['工单处理操作指引', '常见问题与话术库', 'SLA 与升级规则说明'];
// HOME_EFFICIENCY / HOME_TYPE_DIST 已随「效率对比卡」「类型分布卡」一并移除引用；
// mock 中的定义暂留，待确认无其它引用后再清理。
import {
  HOME_KPIS,
  getHomePerformanceByRange,
  HOME_NOTICE,
  HOME_NOTICES,
  HOME_METRIC_DRILLS,
  HOME_QUICK_LINKS,
  HOME_TODOS,
  HOME_SLA_COLOR,
  HOME_TREND_DONE,
  HOME_TREND_FOLLOW,
  HOME_TREND_LABELS,
  HOME_TREND_7D_DONE,
  HOME_TREND_7D_FOLLOW,
  HOME_TREND_7D_LABELS,
  HOME_TREND_RANGE_OPTS,
  type HomeMetricDrillKey,
  type HomeNotice,
  type HomeTrendRangeKey,
} from '@/mock/homeOverview';

/**
 * KPI「?」提示浮层样式（与规则引擎统计卡一致）
 * ⚠️ 外层必须一并放宽：antd 的 .ant-tooltip 默认 max-width 250px，
 * 只设 inner 的 maxWidth 不生效，三行文案会被挤成五六行。
 */
const kpiTipOverlayWrapStyle = { maxWidth: '340px' };
const kpiTipOverlayStyle = {
  maxWidth: '340px',
  color: '#713f12',
  fontSize: '12px',
  lineHeight: '1.6',
  padding: '10px 12px',
};

const router = useRouter();
const user = useUserStore();

/**
 * 本期（815）不支持的三块内容，统一用开关隐藏而非物理删除
 * —— 口径与实现都已完成并验证过，日后恢复只需置 true（PRD v1.8 §1.4③）。
 *
 * · 公告条与公告抽屉  → SHOW_NOTICE
 * · 门户内 AI 助手     → SHOW_AI_ASSISTANT（工单操作页内的助手不受影响）
 * · 我的处理趋势       → SHOW_TREND（见下方）
 */
const SHOW_NOTICE = false;
const SHOW_AI_ASSISTANT = false;

const noticeVisible = ref(SHOW_NOTICE);
const createOpen = ref(false);
const drillOpen = ref(false);
const activeDrillKey = ref<HomeMetricDrillKey | null>(null);
const activeDrillTable = computed(() =>
  activeDrillKey.value ? HOME_METRIC_DRILLS[activeDrillKey.value] : null,
);

/** 「我的处理趋势」区开关，理由同上；trend* 状态与 HOME_TREND_* mock 一并保留 */
const SHOW_TREND = false;

/** 趋势区时间：默认近 30 天；与效能区筛选互不影响 */
const trendRangeKey = ref<HomeTrendRangeKey>('30d');
/** 空值用 undefined 而非 null：a-range-picker 的 value 只接受 [Dayjs, Dayjs] | undefined */
const trendCustomRange = ref<[Dayjs, Dayjs] | undefined>(undefined);
const trendPickerOpen = ref(false);

const trendTitle = computed(() => {
  if (trendRangeKey.value === 'custom' && trendCustomRange.value) {
    const [a, b] = trendCustomRange.value;
    return `我的处理趋势（${a.format('MM/DD')}–${b.format('MM/DD')}）`;
  }
  return '我的处理趋势';
});

const trendSub = computed(() => {
  if (trendRangeKey.value === '7d') return '近 7 天 · 我跟进的 vs 我下送的';
  if (trendRangeKey.value === '30d') return '近 30 天 · 我跟进的 vs 我下送的';
  if (trendCustomRange.value) {
    const [a, b] = trendCustomRange.value;
    return `${a.format('MM/DD')}–${b.format('MM/DD')} · 我跟进的 vs 我下送的`;
  }
  return '自定义区间 · 我跟进的 vs 我下送的';
});

const trendSeries = computed(() => {
  if (trendRangeKey.value === '7d') {
    return {
      labels: HOME_TREND_7D_LABELS,
      follow: HOME_TREND_7D_FOLLOW,
      done: HOME_TREND_7D_DONE,
    };
  }
  // 自定义区间原型暂复用 30 天示意数据
  return {
    labels: HOME_TREND_LABELS,
    follow: HOME_TREND_FOLLOW,
    done: HOME_TREND_DONE,
  };
});

const trendEndDots = computed(() => {
  const follow = trendSeries.value.follow;
  const done = trendSeries.value.done;
  return {
    followY: follow[follow.length - 1] ?? 38,
    doneY: done[done.length - 1] ?? 52,
  };
});

watch(trendRangeKey, (key) => {
  if (key === 'custom') {
    if (!trendCustomRange.value) {
      trendCustomRange.value = [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')];
    }
    trendPickerOpen.value = true;
  } else {
    trendPickerOpen.value = false;
  }
});

/** 自定义趋势最长 90 天 */
function disabledTrendDate(current: Dayjs) {
  if (!current) return false;
  if (current.isAfter(dayjs().endOf('day'))) return true;
  const picked = trendCustomRange.value;
  if (picked?.[0] && !picked[1]) {
    const start = picked[0];
    const min = start.subtract(89, 'day');
    const max = start.add(89, 'day');
    return current.isBefore(min, 'day') || current.isAfter(max, 'day');
  }
  return false;
}

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
  return `${period}，${user.name}`;
});

/**
 * 问候提要（PRD §4.3）
 *
 * ⚠️ 硬性约束：提要里的每一个数字**必须从指标区同一数据源派生**，不得独立写死。
 * 原实现写死「2 个临期 / 67 单 / 团队第 2」，而概览卡是 1、效能区本周是 62 单 / 第 4，
 * 自相矛盾，违反 P2「同一个数字在全系统只有一个值」。改为 computed 后物理上无法再漂移。
 *
 * 「已完成」→「已下送」：按 G4.2，坐席产生不了「已解决」，其动作是下送。
 */
const kpiValue = (key: string) => HOME_KPIS.find((k) => k.key === key)?.value ?? '—';

const weekEfficiency = computed(
  () => getHomePerformanceByRange('week').find((c) => c.key === 'efficiency'),
);
const weekForward = computed(
  () => weekEfficiency.value?.metrics.find((m) => m.label.includes('下送量'))?.value ?? '—',
);

const summaryParts = computed(() => {
  const rank = weekEfficiency.value?.rank ?? 0;
  const total = weekEfficiency.value?.teamSize ?? 0;
  /** 前三名才说「继续保持」，否则这句话读起来是反讽 */
  const tail = rank > 0 && rank <= 3 ? '。继续保持！' : '。再往前一步！';
  return [
    { text: '今天有 ', tone: 'plain' as const },
    { text: `${kpiValue('todo')} 个待办`, tone: 'risk' as const },
    { text: '、', tone: 'plain' as const },
    { text: `${kpiValue('soon')} 个 SLA 临期`, tone: 'risk' as const },
    { text: '，建议优先跟进；本周你已下送 ', tone: 'plain' as const },
    { text: weekForward.value, tone: 'gain' as const },
    { text: '，效率', tone: 'plain' as const },
    { text: `组内第 ${rank}/${total}`, tone: 'gain' as const },
    { text: tail, tone: 'plain' as const },
  ];
});

const quickIcons = {
  plus: PlusOutlined,
  inbox: InboxOutlined,
  list: UnorderedListOutlined,
  book: BookOutlined,
  idcard: IdcardOutlined,
  chart: LineChartOutlined,
};

function trendPoints(values: number[]): string {
  const w = 400;
  const step = w / (values.length - 1);
  return values.map((y, i) => `${i * step},${y}`).join(' ');
}

/** A7「当日通话」不可点：电话记录不带工单号，下钻不到工单（PRD §5.3 / §5.4） */
const NON_DRILLABLE_KPIS = new Set(['call-duration']);
function isKpiDrillable(kpi: { key: string }) {
  return !NON_DRILLABLE_KPIS.has(kpi.key);
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
    customer: () => router.push(queryCenterLocation('customer')),
    report: () => {
      // 有班组看板 / 大盘视角的角色直接落查询中心；其余角色维持原提示（基线 §3.1 他人效能列）
      if (['team-leader', 'complaint-supervisor', 'ops-monitor', 'tenant-admin', 'ops-admin', 'system-admin'].includes(user.roleKey)) {
        router.push(queryCenterLocation('tickets'));
      } else {
        message.info('打开统计报表');
      }
    },
  };
  map[key]?.();
}

function onTodo(no: string) {
  router.push({ name: 'ticket-operation', params: { ticketNo: no } });
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

    <!-- ② 问候区：今日情绪入口 -->
    <div class="greeting-card">
      <div class="greeting-text">
        <div class="greeting-title">{{ greeting }} <span class="greeting-wave" aria-hidden="true">👋</span></div>
        <div class="greeting-sub">
          <template v-for="(p, i) in summaryParts" :key="i">
            <span v-if="p.tone === 'plain'">{{ p.text }}</span>
            <span v-else class="summary-chip" :class="p.tone">{{ p.text }}</span>
          </template>
        </div>
      </div>
      <button class="btn-primary" @click="createOpen = true">新建工单</button>
    </div>

    <!--
      ③ 今日概览：只放**数量**（R1b）。与下方「我的效能」（只放率值）成对。
      本区为此刻存量快照，不加时间筛选器（待处理/临期等无「本周待处理」自然语义）。
    -->
    <section class="overview-section">
      <div class="section-head">
        <div>
          <div class="section-title">今日概览</div>
          <div class="section-sub">此刻快照 · 先清掉临期与超时 · 点卡片查看对应工单</div>
        </div>
        <span class="snapshot-badge">实时</span>
      </div>
      <div class="kpi-strip">
        <div
          v-for="kpi in HOME_KPIS"
          :key="kpi.key"
          class="kpi-card"
          :class="[
            `tone-${kpi.tone}`,
            { 'tone-overdue': kpi.key === 'overdue', 'is-static': !isKpiDrillable(kpi) },
          ]"
          :style="{ '--kpi-accent': kpi.valueColor }"
          @click="isKpiDrillable(kpi) && onKpiClick(kpi.label)"
        >
          <div class="kpi-body">
            <div class="kpi-label">
              <span class="kpi-label-text">{{ kpi.label }}</span>
              <a-tooltip
                placement="top"
                :mouse-enter-delay="0.1"
                color="#fffbeb"
                :overlay-style="kpiTipOverlayWrapStyle"
                :overlay-inner-style="kpiTipOverlayStyle"
              >
                <template #title>
                  <!-- 一句话：这个数是什么 -->
                  <p class="kt-define">{{ kpi.tip.define }}</p>
                </template>
                <QuestionCircleOutlined class="kpi-tip-ic" @click.stop />
              </a-tooltip>
            </div>
            <div class="kpi-value-row">
              <span class="kpi-value" :style="{ color: kpi.valueColor }">{{ kpi.value }}</span>
              <span v-if="kpi.delta" class="kpi-delta" :style="{ color: kpi.deltaColor }">{{ kpi.delta }}</span>
              <span v-if="kpi.suffix" class="kpi-suffix">{{ kpi.suffix }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ④ 我的效能：区头自带今天/本周/本月/自定义 -->
    <HomePerformancePanel @drill="openMetricDrill" />

    <!--
      ⑤ 趋势区「我的处理趋势」—— 2026-08-04 移出本期范围（PRD v1.7 删除该章）。
      整块隐藏而非物理删除：口径与实现均已完成，日后若恢复只需把 SHOW_TREND 置 true。
      相关 mock（HOME_TREND_*）与样式（.analysis-row / .trend-*）一并保留。
    -->
    <div v-if="SHOW_TREND" class="analysis-row">
      <div class="card analysis-card trend-card">
        <div class="card-head">
          <div class="trend-head-main">
            <div class="card-title">{{ trendTitle }}</div>
            <!-- 口径修正：坐席产生不了「已解决」，其动作是「下送」→ 进调研中 -->
            <div class="card-sub">{{ trendSub }}</div>
          </div>
          <div class="trend-filters">
            <div class="filter-item">
              <span class="filter-label">时间</span>
              <a-segmented
                v-model:value="trendRangeKey"
                size="small"
                :options="HOME_TREND_RANGE_OPTS"
              />
              <a-range-picker
                v-if="trendRangeKey === 'custom'"
                v-model:value="trendCustomRange"
                v-model:open="trendPickerOpen"
                size="small"
                :allow-clear="false"
                :disabled-date="disabledTrendDate"
                format="MM-DD"
                class="trend-range-picker"
              />
            </div>
            <div class="filter-divider" />
            <div class="legend">
              <span class="legend-item"><i class="dot blue" />我跟进的</span>
              <span class="legend-item"><i class="dot green" />我下送的</span>
            </div>
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
              :points="trendPoints(trendSeries.follow)"
            />
            <polyline
              fill="none"
              stroke="#10B981"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              :points="trendPoints(trendSeries.done)"
            />
            <circle cx="388.5" :cy="trendEndDots.followY" r="3.5" fill="#1A6FFF" />
            <circle cx="388.5" :cy="trendEndDots.doneY" r="3.5" fill="#10B981" />
          </svg>
        </div>
        <div class="chart-labels">
          <span v-for="lb in trendSeries.labels" :key="lb">{{ lb }}</span>
        </div>
      </div>
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
          <div
            v-for="t in HOME_TODOS"
            :key="t.no"
            class="todo-row"
            role="link"
            tabindex="0"
            @click="onTodo(t.no)"
            @keydown.enter.prevent="onTodo(t.no)"
          >
            <div class="todo-left">
              <span class="prio-dot" :style="{ background: t.dot }" />
              <span class="todo-no">{{ t.no }}</span>
              <span class="todo-title">{{ t.title }}</span>
              <span class="type-tag" :style="{ color: t.typeColor, background: t.typeColor + '1F' }">{{ t.type }}</span>
              <!--
                SLA 摘要对齐 OpSlaBar：首响未关 → 展首响钟；首响已关 → 展整单解决钟。
                文案：剩 / 超 / 已达标 / 未达标；色：正常绿 / 临期橙 / 超时红。
              -->
              <span
                class="sla-chip"
                :class="`vis-${t.slaVis}`"
                :style="{ color: HOME_SLA_COLOR[t.slaVis], background: HOME_SLA_COLOR[t.slaVis] + '1F' }"
                :title="t.slaKind === 'first' ? '首响钟（未首响，最急）' : '整单解决钟（已首响）'"
              >
                <span class="sla-kind">{{ t.slaKind === 'first' ? '首响' : '整单' }}</span>
                <span class="sla-remain">{{ t.slaText }}</span>
              </span>
            </div>
            <span class="link-btn">处理</span>
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

    <!-- 公告列表抽屉：随公告条一并隐藏（SHOW_NOTICE） -->
    <a-drawer
      v-if="SHOW_NOTICE"
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

    <!-- 门户内 AI 助手：815 不支持，整块隐藏（工单操作页内的助手不受影响） -->
    <OpAiAssistant v-if="SHOW_AI_ASSISTANT" scope="global" :knowledge="HOME_AI_KNOWLEDGE" />
  </div>
</template>

<style scoped>
.home-overview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px;
  min-height: 100%;
  width: 100%;
  min-width: 0;
  /* 密度 token：见《iFLY-FlowOS-设计风格规范》§4.9 */
  /* 微氛围：顶部浅蓝晕，避免整页死灰白 */
  background:
    radial-gradient(ellipse 80% 40% at 0% 0%, rgba(26, 111, 255, 0.08), transparent 55%),
    radial-gradient(ellipse 60% 30% at 100% 8%, rgba(16, 185, 129, 0.05), transparent 50%),
    #f3f6fb;
}

/**
 * 卡片视觉基线（2026-08-03 调整，2026-08-06 与 §4.9 对齐）
 * 参考页实测：圆角 12 / 边框 0.8px #E5E6EB / 阴影 0 1px 4px rgba(0,0,0,.06)
 * 原为 圆角 10 / 1px #E5E7EB / 无阴影 —— 全靠边框分层，观感偏平硬。
 * ⚠️ 与 §4.4 通用卡片「圆角 6/8」不一致，属工作台看板分支（§4.9）。
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
  gap: 8px;
  padding: 8px 12px;
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

/* 问候：情绪锚点 */
.greeting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  gap: 12px;
  border-radius: 14px;
  border: 1px solid rgba(26, 111, 255, 0.18);
  background:
    linear-gradient(135deg, #eff6ff 0%, #f8fbff 48%, #ecfdf5 100%);
  box-shadow: 0 4px 16px rgba(26, 111, 255, 0.08);
}
.greeting-title {
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.greeting-wave {
  display: inline-block;
  transform-origin: 70% 70%;
  animation: wave-hi 1.6s ease-in-out 1;
}
@keyframes wave-hi {
  0%, 100% { transform: rotate(0deg); }
  20% { transform: rotate(14deg); }
  40% { transform: rotate(-8deg); }
  60% { transform: rotate(10deg); }
  80% { transform: rotate(-4deg); }
}
.greeting-sub {
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.55;
}
.summary-chip {
  display: inline;
  font-weight: 700;
  padding: 1px 0;
}
.summary-chip.risk {
  color: #c2410c;
}
.summary-chip.gain {
  color: #047857;
}
.btn-primary {
  flex: none;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(180deg, #3b82f6 0%, #1a6fff 100%);
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(26, 111, 255, 0.28);
  transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
}
.btn-primary:hover {
  filter: brightness(1.04);
  box-shadow: 0 6px 16px rgba(26, 111, 255, 0.34);
  transform: translateY(-1px);
}

/* 「今日概览」：7 项数量快照，默认单行等宽；避免过早折成 3 列导致 3+3+1 残缺行 */
.overview-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.overview-section .section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.overview-section .section-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.overview-section .section-sub {
  margin-top: 2px;
  font-size: 11px;
  color: #9ca3af;
}
.snapshot-badge {
  flex: none;
  font-size: 11px;
  font-weight: 700;
  color: #1a6fff;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  padding: 3px 10px;
  line-height: 1.2;
}

.kpi-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}
.kpi-card {
  position: relative;
  min-height: 58px;
  padding: 8px 8px 8px 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.kpi-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--kpi-accent, #94a3b8);
  border-radius: 12px 0 0 12px;
}
.kpi-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.07);
  transform: translateY(-1px);
}
/* 不可下钻的卡（当日通话）：不变手型、不做抬起，避免误导可点 */
.kpi-card.is-static { cursor: default; }
.kpi-card.is-static:hover {
  border-color: #e5e7eb;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transform: none;
}

/* 「?」口径提示：只有一句话 —— 这个数是什么 */
.kt-define {
  margin: 0;
  font-size: 12px;
  color: #713f12;
  line-height: 1.5;
}
.kpi-card.tone-risk {
  background: linear-gradient(180deg, #fffaf5 0%, #fff 70%);
}
.kpi-card.tone-gain {
  background: linear-gradient(180deg, #f0fdf4 0%, #fff 70%);
}
.kpi-card.tone-overdue {
  border-color: #fecaca;
  background: linear-gradient(180deg, #fef2f2 0%, #fff 72%);
}
.kpi-card.tone-overdue::before {
  width: 4px;
}
.kpi-card.tone-gain .kpi-value {
  font-size: 22px;
}
.kpi-card.tone-risk .kpi-value,
.kpi-card.tone-overdue .kpi-value {
  font-weight: 800;
}
.kpi-body {
  min-width: 0;
}
.kpi-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 4px;
  min-width: 0;
}
.kpi-label-text {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kpi-tip-ic {
  flex-shrink: 0;
  color: #9ca3af;
  font-size: 12px;
  cursor: help;
  opacity: 0.7;
  transition: opacity 0.15s, color 0.15s;
}
.kpi-tip-ic:hover {
  color: #1a6fff;
  opacity: 1;
}
.kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.kpi-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
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
/* 工作台内容区常 <1280：原先在此折成 3 列会变成 3+3+1 残行。窄屏再折。 */
@media (max-width: 960px) {
  .kpi-strip {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .kpi-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 分析区 */
/* 删掉类型分布卡与效率对比卡后，趋势卡独占整行——30 天折线拉宽才读得出走势 */
.analysis-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
.analysis-card {
  padding: 10px 12px 8px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: 14px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.card-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.card-sub {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}
.trend-head-main {
  min-width: 0;
}
.legend {
  display: flex;
  gap: 10px;
  flex: none;
}
/* 与效能区筛选条同语汇，避免控件被图例挤没 */
.trend-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 12px;
  padding: 6px 10px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  flex: none;
}
.trend-filters .filter-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.trend-filters .filter-label {
  flex: none;
  font-size: 12px;
  font-weight: 500;
  color: #9ca3af;
  line-height: 1;
}
.trend-filters .filter-divider {
  width: 1px;
  height: 16px;
  background: #e2e8f0;
  flex: none;
}
.trend-filters :deep(.ant-segmented) {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 2px;
}
.trend-filters :deep(.ant-segmented-item-label) {
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  line-height: 22px;
  min-height: 22px;
  padding: 0 10px;
}
.trend-filters :deep(.ant-segmented-item-selected .ant-segmented-item-label) {
  color: #1a6fff;
  font-weight: 600;
}
.trend-filters :deep(.ant-segmented-item-selected) {
  box-shadow: 0 1px 2px rgba(26, 111, 255, 0.12);
}
.trend-range-picker {
  width: 168px;
}
.trend-range-picker :deep(.ant-picker) {
  height: 28px;
  border-radius: 8px;
}
.trend-range-picker :deep(.ant-picker-input > input) {
  font-size: 12px;
  color: #374151;
  font-weight: 500;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #6b7280;
}
.dot {
  display: inline-block;
  width: 10px;
  height: 2px;
  border-radius: 2px;
}
.dot.blue {
  background: #1a6fff;
}
.dot.green {
  background: #10b981;
}
.chart-wrap {
  flex: none;
  height: 120px;
}
.trend-svg {
  width: 100%;
  height: 120px;
  display: block;
}
.chart-labels {
  display: flex;
  justify-content: space-between;
  padding: 0 4px;
  font-size: 10px;
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
  grid-template-columns: 1fr minmax(220px, 280px);
  gap: 12px;
}
.todo-card,
.quick-card {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: 14px;
}
.todo-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.todo-sort-tag {
  font-size: 11px;
  font-weight: 600;
  color: #1a6fff;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
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
  gap: 10px;
  padding: 8px 6px;
  margin: 0 -4px;
  border-bottom: 1px solid #f3f4f6;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.todo-row:hover {
  background: #f8fbff;
}
.todo-row:hover .link-btn {
  color: #0f4fcc;
}
.todo-row:focus-visible {
  outline: 2px solid rgba(26, 111, 255, 0.35);
  outline-offset: 1px;
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
/* 对齐 OpSlaBar：种别 + 剩/超/终态文案 */
.sla-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  flex: none;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}
.sla-kind {
  font-weight: 600;
  opacity: 0.85;
}
.sla-remain {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.quick-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: repeat(3, 1fr);
  gap: 8px;
  margin-top: 8px;
  flex: 1;
}
.quick-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 8px;
  cursor: pointer;
  padding: 6px;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
.quick-tile:hover {
  border-color: #bfdbfe;
  background: #f8fbff;
  box-shadow: 0 2px 8px rgba(26, 111, 255, 0.08);
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
