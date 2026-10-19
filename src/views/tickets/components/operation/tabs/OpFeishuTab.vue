<script setup lang="ts">
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  SendOutlined, SyncOutlined, CheckCircleOutlined,
  ThunderboltOutlined, BellOutlined, CloseCircleOutlined, ReloadOutlined,
} from '@ant-design/icons-vue';
import { formatOpTime } from '@/views/tickets/utils/opTime';
import type { FeishuRecord, FeishuSyncState } from '@/mock/ticketDetail';
import {
  XIAOZHI_CONFIRM_ACTOR, XIAOZHI_CONFIRM_APP,
  XIAOZHI_DEMAND_FIELD_LABELS, XIAOZHI_ISSUE_FIELD_LABELS, XIAOZHI_RESULT_GROUP_TITLE,
  type XiaozhiConfirmState, type XiaozhiDemandResult, type XiaozhiIssueResult, type XiaozhiSolutionType,
} from '@/views/tickets/types/xiaozhi';

/** 二次激活原因枚举（对齐 PRD §7.4） */
const FEISHU_ACTIVATE_REASONS = [
  '用户反馈未解决',
  '处理结论不符预期',
  '修复未生效或问题复现',
  '影响范围扩大',
  '验收材料不足，需补充验证',
  '其他',
] as const;

const props = defineProps<{
  records: FeishuRecord[];
  syncState?: FeishuSyncState;
  /** 反馈名称（用工单标题） */
  feedbackName?: string;
  priority?: string;
  productName?: string;
  feedbackNo?: string;
  failReason?: string;
  createdAt?: string;
  /**
   * 本 Tab 对当前角色只读。「产研反馈」不在协同信息区 11 行里，矩阵在 #41 门控说明给的口径是
   * 「取值随行 56『同步飞书』」—— 该行 ② ③ ⑤ ⑨ 可用、⑥ 条件可用（暂按不可写）、① ④ ⑦ ⑧ 无。
   * 只读态下重新发起 / 催单 / 二次激活三个写入口不出，协同时间线照常可读。
   */
  readonly?: boolean;
  /** 办结回传的分叉：问题类 / 需求类（W8 暂行口径：分两组展示、有值才显示） */
  solutionType?: XiaozhiSolutionType;
  /** 办结回传 · 问题类字段 */
  issueResult?: XiaozhiIssueResult;
  /** 办结回传 · 需求类字段 */
  demandResult?: XiaozhiDemandResult;
  /**
   * 提报人确认状态（1130 一·补 B5）。只有小智单传它 —— 产研办结**不自动关单**，
   * 要等提报人在小智工单应用里确认是否解决，故这里只**显示**确认进度，
   * 🔴 **没有任何按钮**：确认在小智工单应用里做，确认未解决后的回传是**系统动作**。
   */
  confirmState?: XiaozhiConfirmState;
  /** 提报人确认时刻 */
  confirmAt?: string;
  /** 确认人（超时视为已解决时为「系统」） */
  confirmBy?: string;
  /** 已回传产研「未解决」的次数（一·补 B8：循环不封顶，但记次数） */
  rdReturnCount?: number;
  /**
   * 小智单模式（1130 D1）。三处用到它：
   * ① **时间线节点的标签用词** —— 小智链路复用了 `push` / `result` / `feedback` 三个记录档，
   *    但它们在小智单上的含义与消费者BG飞书单不同，照 `KIND_META` 的通用词渲染会写出
   *    「关单」这种与本单开 / 结对打的标签；
   * ② **信息块按 PRD §5.2 的六项渲染**（见 `xiaozhiMeta`）；
   * ③ **「二次激活」整枚不渲染**（一·补 B5：确认未解决由系统自动回传，不设坐席入口）。
   */
  xiaozhiMode?: boolean;
  /** 本单单号（PRD §5.2 信息块第二项，小智单必传） */
  ticketNo?: string;
  /** 产品模块（PRD §5.2 信息块第三项） */
  rdModule?: string;
  /** 接收人域账号（PRD §5.2 信息块第四项，由产品模块带出） */
  rdReceiver?: string;
  /** 产研优先级（PRD §5.2 信息块第五项，**四档**：普通 / 普通加急 / 紧急 / 重要） */
  rdPriority?: string;
}>();

const emit = defineEmits<{
  activate: [reason: string];
  retry: [];
  dunning: [];
}>();

const activateOpen = ref(false);
const activateReason = ref<string>(FEISHU_ACTIVATE_REASONS[0]);
const activateNote = ref('');
const noteRequired = computed(() => activateReason.value === '其他');
const reasonOptions = FEISHU_ACTIVATE_REASONS.map((r) => ({ value: r, label: r }));

const isFailed = computed(() => props.syncState === 'failed');

/**
 * 提报人确认进度（1130 一·补 B5 / B7 / B8 / B19）—— **纯展示，没有按钮**。
 *
 * ⚠️ 不要在这里补一枚「模拟确认」或「二次提交产研」：确认动作在**小智工单应用**里由提报人做（B6），
 * 确认未解决后的回传是**系统动作不是坐席动作**（B5），原型里这两种结果由种子数据体现。
 *
 * 🔴 **这句提示里不写具体天数** —— 超时天数（`XIAOZHI_CONFIRM_TIMEOUT_DAYS`）是**待业务确定的
 * 配置项**，把「超 3 天」打到界面上，等于把一个还没定的数当成已定的规格给人看；
 * 业务改了配置，界面这句就成了假的。履历是另一回事（记已发生的事，据实写当时的天数）。
 */
const confirmRow = computed<{ label: string; tone: 'wait' | 'done'; sub: string } | null>(() => {
  if (!props.confirmState) return null;
  if (props.confirmState === '未确认') {
    return {
      label: `待${XIAOZHI_CONFIRM_ACTOR}确认`,
      tone: 'wait',
      // 一·补 B28：小智工单全程无调研；B32：关单走「关闭工单」，终态是「已关闭」
      sub: `等待${XIAOZHI_CONFIRM_ACTOR}在${XIAOZHI_CONFIRM_APP}确认；超期未确认将视为已解决，自动关闭工单`,
    };
  }
  const who = props.confirmBy ? `${props.confirmBy} · ` : '';
  return {
    label: props.confirmState,
    tone: 'done',
    sub: `${who}${formatOpTime(props.confirmAt) || '—'}`,
  };
});

/**
 * 小智单的产研反馈单信息块 —— **照 PRD §5.2 的六项**，次序一致。
 *
 * 通用飞书单那一行（优先级 / 负责人 / 技术支持 / 创建 / 更新）保持原样不动。
 * 🔴 三处原先对不上 PRD：**本单单号 / 产品模块 / 接收人三项根本没渲染**；
 * 「优先级」取的是工单优先级（P1 / P2）而 PRD 要的是**产研四档**（普通 / 普通加急 / 紧急 / 重要）；
 * 还多一行写死的「技术支持 · 张三」—— 既是硬编码演示数据，又与 B10「本轮不做技术支持路径」相抵，
 * 故小智单这一支整行不渲染它。
 */
/** 定义在 `feedbackNo` / `updatedAt` 之后（见本文件下方），此处只留出处说明 */

/** 已回传产研「未解决」的次数（B8）：0 不显示 */
const returnTimes = computed(() => props.rdReturnCount ?? 0);

/** 办结回传字段：按问题类 / 需求类取一套，**有值才显示**（W8） */
const settleFields = computed<{ title: string; items: { label: string; text: string }[] } | null>(() => {
  if (!props.solutionType) return null;
  const items = props.solutionType === '问题'
    ? XIAOZHI_ISSUE_FIELD_LABELS
      .map(({ key, label }) => ({ label, text: (props.issueResult?.[key] ?? '').trim() }))
      .filter((x) => !!x.text)
    : XIAOZHI_DEMAND_FIELD_LABELS
      .map(({ key, label }) => ({ label, text: (props.demandResult?.[key] ?? '').trim() }))
      .filter((x) => !!x.text);
  if (!items.length) return null;
  return { title: XIAOZHI_RESULT_GROUP_TITLE[props.solutionType], items };
});

/** 卡片上展示的反馈单号 */
const feedbackNo = computed(
  () => props.feedbackNo
    || props.records.find((r) => r.kind === 'push')?.meta?.replace('反馈单号 ', '')
    || '—',
);

/** 从时间线推断当前负责人 */
const cardOwner = computed(() => {
  const hit = [...props.records].reverse().find((r) =>
    r.side === '产研侧' && (r.kind === 'feedback' || r.kind === 'result' || r.kind === 'activate'),
  );
  if (!hit) return '—';
  return hit.who.replace(/（.*?）/, '') || hit.who;
});

/** 时间线人员展示：产研侧统一为「张三（技术支持）」 */
function displayWho(who: string) {
  return who
    .replace(/何霄煜（飞书·技术支持）/g, '张三（技术支持）')
    .replace(/何霄煜（技术支持）/g, '张三（技术支持）');
}

/** 处理人字段：标签=角色名，值为人员 */
const handler = { label: '技术支持', name: '张三' } as const;

/** 扭转记录按时间倒序（最新在上） */
const orderedRecords = computed(() => [...props.records].reverse());

/**
 * 产研反馈单状态枚举（PRD §7.2）：已建单 / 处理中 / 已反馈 / 已结案
 * 「已催单」不做主状态——催单是过程动作，记履历即可
 */
const statusMeta = computed(() => {
  if (props.syncState === 'failed') {
    return { label: '关联失败', tone: 'danger' as const };
  }
  /**
   * 🔴 小智单待校代确认期间，这枚胶囊**不能写「已结案」**（1130 一·补 B5）：
   * 产研那张反馈单确实结了，但**本单还开着**（「已升级产研」）。在这个系统里「结案」
   * 专指工单关闭，胶囊写「已结案」会和页头的「已升级产研」对打，让人以为单子已经关了。
   * 故这一档单独出「产研已办结」—— 说的是产研那边的事，不碰本单的开 / 结。
   */
  if (props.syncState === 'closed' && props.confirmState === '未确认') {
    return { label: '产研已办结', tone: 'feedback' as const };
  }
  if (props.syncState === 'closed') {
    return { label: '已结案', tone: 'done' as const };
  }
  const kinds = new Set(props.records.map((r) => r.kind));
  // 二次激活后回到处理中（已有 activate，且当前未结案）
  if (kinds.has('activate') && props.syncState === 'synced') {
    return { label: '处理中', tone: 'doing' as const };
  }
  if (props.syncState === 'feedback' || kinds.has('feedback')) {
    return { label: '已反馈', tone: 'feedback' as const };
  }
  if (kinds.has('push') || props.syncState === 'synced') {
    // 仅建关联、尚无预反馈 → 已建单
    return { label: '已建单', tone: 'created' as const };
  }
  return { label: '—', tone: 'created' as const };
});

/** 更新时间：取时间线最新一条；无记录则回落创建时间 */
const updatedAt = computed(() => {
  if (!props.records.length) return props.createdAt || '—';
  return orderedRecords.value[0]?.when || props.createdAt || '—';
});

const xiaozhiMeta = computed<{ label: string; value: string }[]>(() => [
  { label: '产研单号', value: feedbackNo.value },
  { label: '本单单号', value: props.ticketNo || '—' },
  { label: '产品模块', value: props.rdModule || '—' },
  { label: '接收人域账号', value: props.rdReceiver || '—' },
  { label: '产研优先级', value: props.rdPriority || '—' },
  { label: '更新时间', value: formatOpTime(updatedAt.value) },
]);

/** 已关联产研反馈（synced/feedback/closed）→ 催单、二次激活两按钮均常驻展示 */
const isAssociated = computed(() =>
  props.syncState === 'synced' || props.syncState === 'feedback' || props.syncState === 'closed',
);
/**
 * 催单：处理中 / 已反馈（未结案）可点；已结案置灰不可催。
 *
 * 待提报人确认那一段（`closed ∧ 未确认`）落在「已结案」那侧，故**催单置灰** —— 这是对的：
 * 产研已经把结果给出来了，球在提报人手上，催产研催不出任何东西。
 * PRD 未覆盖这一档，置灰理由写在这儿，悬停文案由 `dunningTip` 分档给。
 */
const dunningEnabled = computed(() =>
  props.syncState === 'synced' || props.syncState === 'feedback',
);
const dunningTip = computed(() => {
  if (dunningEnabled.value) return '';
  if (props.confirmState === '未确认') return `产研已办结，待${XIAOZHI_CONFIRM_ACTOR}确认，无需催单`;
  return '已结案，无需催单';
});
/**
 * 本 Tab 里那枚「催单」出不出 —— 🔴 **小智单整枚不渲染**（1130 一·补 B36），不是置灰。
 *
 * 判据：这一枚催的是**产研**（点下去会往产研反馈时间线写一条「催单 · 请产研尽快跟进」），
 * 而小智单的催单**内容不同步产研**（一·补 B26）—— 留着就是摆一个催不到产研的「催产研」。
 * 催单本身**保留**：走页头右上角那一枚（与「新建补充」并排），口径未收窄。
 *
 * ⚠️ **只对小智单**：通用单那一枚照旧出、照旧可点、照旧往产研反馈时间线写 ——
 * 那是它该做的事，别为小智把通用单一起关了。
 * ⚠️ 门控走**工单维度**（`xiaozhiMode` 由 `isXiaozhiTicket(detail)` 给），不看登录角色。
 */
const showDunning = computed(() => !props.xiaozhiMode);

/**
 * 二次激活：仅已结案可点；未结案置灰。
 *
 * 🔴 **小智单上这一枚整枚不渲染**（1130 一·补 B5，PRD §5.2）—— 见模板里 `showActivate`。
 * 二次激活＝坐席手动重开产研单，而 B5 已把「确认未解决 → 回传产研」定成**系统动作**：
 * 留着它就等于在系统自动回传之外，又开了一个坐席手动重开的并行入口，
 * 两条路都能把单子推回产研，`rdReturnCount` 却只认系统那条。
 * （原先它在待确认段**还是可点的** —— `closed ∧ 未确认` 正好落在 `closed` 这档里。）
 */
const activateEnabled = computed(() => props.syncState === 'closed');
/** 「二次激活」出不出：小智单整枚不出 */
const showActivate = computed(() => !props.xiaozhiMode);

const KIND_META: Record<FeishuRecord['kind'], { icon: unknown; color: string; tag: string }> = {
  push: { icon: SendOutlined, color: '#2563eb', tag: '建关联' },
  fail: { icon: CloseCircleOutlined, color: '#dc2626', tag: '关联失败' },
  feedback: { icon: SyncOutlined, color: '#1a6fff', tag: '预反馈' },
  result: { icon: CheckCircleOutlined, color: '#10b981', tag: '关单' },
  activate: { icon: ThunderboltOutlined, color: '#f59e0b', tag: '二次激活' },
  dunning: { icon: BellOutlined, color: '#d97706', tag: '催单' },
};

/**
 * 时间线节点的标签用词。消费者BG飞书单照 `KIND_META` 原样出；
 * 小智单上这三个档的含义不同，按记录本身的身份改词（1130 一·补 B5 / B8 / T1）：
 * - `result`（产研办结）→ **不能写「关单」**，产研办结不关本单；
 * - `push` 里的「系统自动回传」→ 不是建关联，是校代确认未解决后系统打回去那一笔；
 * - `feedback` 里的驳回留痕 → 标出「产研驳回」，否则混在「预反馈」里看不出来（T1 信息不丢）。
 * 颜色一律沿用 `KIND_META`，只换文字。
 */
function tagOf(rec: FeishuRecord): string {
  const base = KIND_META[rec.kind].tag;
  if (!props.xiaozhiMode) return base;
  if (rec.kind === 'result') return '产研办结';
  if (rec.kind === 'push' && rec.title.includes('自动回传')) return '回传产研';
  if (rec.kind === 'feedback' && rec.title.includes('驳回')) return '产研驳回';
  return base;
}

function onActivate() {
  if (props.readonly || !activateEnabled.value) return;
  activateReason.value = FEISHU_ACTIVATE_REASONS[0];
  activateNote.value = '';
  activateOpen.value = true;
}

function confirmActivate() {
  if (!activateReason.value) {
    message.warning('请选择激活原因');
    return Promise.reject();
  }
  if (noteRequired.value && !activateNote.value.trim()) {
    message.warning('选择「其他」时请填写补充说明');
    return Promise.reject();
  }
  const text = activateNote.value.trim()
    ? `${activateReason.value}：${activateNote.value.trim()}`
    : activateReason.value;
  activateOpen.value = false;
  emit('activate', text);
  return Promise.resolve();
}

function onRetry() {
  if (props.readonly) return;
  emit('retry');
}

function onDunning() {
  if (props.readonly || !dunningEnabled.value) return;
  emit('dunning');
}
</script>

<template>
  <div class="fs-tab">
    <!-- 关联失败：失败横幅 -->
    <div v-if="isFailed" class="fs-fail-banner">
      <div class="fs-fail-main">
        <CloseCircleOutlined class="fs-fail-icon" />
        <div>
          <div class="fs-fail-title">转产研反馈失败 · 尚未关联反馈单</div>
          <div class="fs-fail-sub">{{ failReason || '未能拿到反馈单号，可重新发起升级' }}</div>
        </div>
      </div>
      <button v-if="!readonly" type="button" class="fs-retry" @click="onRetry">
        <ReloadOutlined />
        重新发起
      </button>
    </div>

    <!-- 产研反馈单：主体信息 + 状态反馈 -->
    <section v-if="!isFailed" class="fs-sheet" aria-label="产研反馈单主体信息">
      <header class="fs-sheet-head">
        <div class="fs-sheet-brand">
          <h3 class="fs-sheet-title">{{ feedbackName || '客户反馈单' }}</h3>
          <div class="fs-sheet-idrow">
            <span class="fs-sheet-no">{{ feedbackNo }}</span>
            <span v-if="productName" class="fs-sheet-dot">·</span>
            <span v-if="productName" class="fs-sheet-product">{{ productName }}</span>
          </div>
        </div>
        <div v-if="isAssociated && !readonly" class="fs-sheet-actions">
          <!-- 「催单」在小智单上整枚不渲染（1130 一·补 B36），不是置灰；页头那两枚催补照旧 -->
          <button
            v-if="showDunning"
            type="button"
            class="action-btn"
            :disabled="!dunningEnabled"
            :title="dunningTip"
            @click="onDunning"
          >催单</button>
          <!-- 「二次激活」在小智单上整枚不渲染（1130 一·补 B5 / PRD §5.2），不是置灰 -->
          <button
            v-if="showActivate"
            type="button"
            class="action-btn"
            :disabled="!activateEnabled"
            :title="activateEnabled ? '' : '产研反馈结案后方可二次激活'"
            @click="onActivate"
          >二次激活</button>
          <span class="fs-status" :class="`tone-${statusMeta.tone}`">{{ statusMeta.label }}</span>
        </div>
        <div v-else class="fs-sheet-actions">
          <span class="fs-status" :class="`tone-${statusMeta.tone}`">{{ statusMeta.label }}</span>
        </div>
      </header>

      <!--
        信息块分两套渲染：
        · 小智单照 PRD §5.2 的**六项**（产研单号 / 本单单号 / 产品模块 / 接收人域账号 /
          产研优先级 / 更新时间），「产研优先级」是产研四档、不是工单 P1 / P2；
        · 通用飞书单保持原样（优先级 / 负责人 / 技术支持 / 创建 / 更新），一字未动。
      -->
      <div v-if="xiaozhiMode" class="fs-sheet-meta">
        <template v-for="(m, i) in xiaozhiMeta" :key="m.label">
          <span v-if="i" class="fs-meta-sep" aria-hidden="true" />
          <span class="fs-meta-pair">
            <span class="fs-meta-label">{{ m.label }}</span>
            <span class="fs-meta-value">{{ m.value }}</span>
          </span>
        </template>
      </div>
      <div v-else class="fs-sheet-meta">
        <span class="fs-meta-pair">
          <span class="fs-meta-label">优先级</span>
          <em class="fs-prio">{{ priority || '—' }}</em>
        </span>
        <span class="fs-meta-sep" aria-hidden="true" />
        <span class="fs-meta-pair">
          <span class="fs-meta-label">负责人</span>
          <span class="fs-meta-value">{{ cardOwner }}</span>
        </span>
        <span class="fs-meta-sep" aria-hidden="true" />
        <span class="fs-meta-pair">
          <span class="fs-meta-label">{{ handler.label }}</span>
          <span class="fs-meta-value">{{ handler.name }}</span>
        </span>
        <span class="fs-meta-sep" aria-hidden="true" />
        <span class="fs-meta-pair">
          <span class="fs-meta-label">创建</span>
          <span class="fs-meta-value">{{ formatOpTime(createdAt) }}</span>
        </span>
        <span class="fs-meta-sep" aria-hidden="true" />
        <span class="fs-meta-pair">
          <span class="fs-meta-label">更新</span>
          <span class="fs-meta-value">{{ formatOpTime(updatedAt) }}</span>
        </span>
      </div>

      <!-- 办结回传字段：问题类 / 需求类各一套，有值才显示（1130 W8） -->
      <div v-if="settleFields" class="fs-settle">
        <div class="fs-settle-title">{{ settleFields.title }}</div>
        <dl class="fs-settle-list">
          <template v-for="item in settleFields.items" :key="item.label">
            <dt class="fs-settle-label">{{ item.label }}</dt>
            <dd class="fs-settle-text">{{ item.text }}</dd>
          </template>
        </dl>
      </div>

      <!--
        校代确认进度（1130 一·补 B5 / B7 / B8）：产研办结后本单**不自动关单**，等校代确认。
        纯展示，**无按钮** —— 确认在小智工单应用里做，确认未解决后的回传是系统动作。
      -->
      <div v-if="confirmRow || returnTimes" class="fs-confirm">
        <template v-if="confirmRow">
          <span class="fs-confirm-pill" :class="`tone-${confirmRow.tone}`">{{ confirmRow.label }}</span>
          <span class="fs-confirm-sub">{{ confirmRow.sub }}</span>
        </template>
        <!-- 词序照 PRD L420「已回传产研 〈N〉 次」 -->
        <span v-if="returnTimes" class="fs-confirm-times">已回传产研 {{ returnTimes }} 次</span>
      </div>
    </section>

    <div v-if="!records.length" class="fs-empty">暂无产研反馈协同记录</div>

    <!-- 协同时间线 -->
    <div v-else class="fs-timeline">
      <div v-for="rec in orderedRecords" :key="rec.id" class="fs-item">
        <div class="fs-item-rail">
          <span class="fs-item-dot" :style="{ background: KIND_META[rec.kind].color }">
            <component :is="KIND_META[rec.kind].icon" />
          </span>
          <span class="fs-item-line" />
        </div>
        <div class="fs-item-body">
          <div class="fs-item-head">
            <span
              class="fs-item-tag"
              :style="{ color: KIND_META[rec.kind].color, background: `${KIND_META[rec.kind].color}14` }"
            >
              {{ tagOf(rec) }}
            </span>
            <span class="fs-item-title">{{ rec.title }}</span>
            <span class="fs-item-side" :class="{ downstream: rec.side === '产研侧' }">{{ rec.side }}</span>
          </div>
          <div class="fs-item-content">{{ rec.content }}</div>
          <!-- 预反馈 / 关单节点内联「问题原因 / 处理结果」——用户最关注的要点 -->
          <div v-if="rec.cause || rec.result" class="fs-item-fields">
            <div v-if="rec.cause" class="fs-field">
              <span class="fs-field-label label-cause">问题原因</span>
              <span class="fs-field-text">{{ rec.cause }}</span>
            </div>
            <div v-if="rec.result" class="fs-field">
              <span class="fs-field-label label-result">处理结果</span>
              <span class="fs-field-text">{{ rec.result }}</span>
            </div>
          </div>
          <div class="fs-item-meta">
            <span>{{ displayWho(rec.who) }}</span>
            <span v-if="rec.meta" class="fs-item-metabadge">{{ rec.meta }}</span>
            <span class="fs-item-when">{{ formatOpTime(rec.when) }}</span>
          </div>
        </div>
      </div>
    </div>

    <a-modal
      v-model:open="activateOpen"
      title="二次激活产研反馈单"
      ok-text="确认激活"
      cancel-text="取消"
      :width="480"
      destroy-on-close
      @ok="confirmActivate"
    >
      <p class="act-tip">产研反馈已结案后，若客户问题仍未解决，可重开反馈单交产研继续处理。</p>
      <div class="act-field">
        <div class="act-label"><span class="req">*</span>激活原因</div>
        <a-select
          v-model:value="activateReason"
          style="width: 100%"
          :options="reasonOptions"
          placeholder="请选择激活原因"
        />
      </div>
      <div class="act-field">
        <div class="act-label">
          <span v-if="noteRequired" class="req">*</span>补充说明
          <span v-if="!noteRequired" class="act-optional">（选填）</span>
        </div>
        <a-textarea
          v-model:value="activateNote"
          :rows="3"
          :placeholder="noteRequired ? '请说明具体原因（必填）' : '可补充客户原话、复现要点等'"
        />
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.fs-tab { display: flex; flex-direction: column; gap: 14px; }

.fs-fail-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 12px 14px;
}
.fs-fail-main { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.fs-fail-icon { color: #dc2626; font-size: 20px; margin-top: 2px; flex: none; }
.fs-fail-title { font-size: 14px; font-weight: 700; color: #991b1b; }
.fs-fail-sub { font-size: 12px; color: #b91c1c; margin-top: 2px; line-height: 1.5; }
.fs-retry {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  padding: 7px 14px; font-size: 13px; font-weight: 600; font-family: inherit;
  color: #fff; background: #dc2626; border: none; border-radius: 7px; cursor: pointer;
}
.fs-retry:hover { background: #b91c1c; }

/* 校代确认进度条（1130 一·补 B5 / B8）：与办结字段组同一块底，纯展示无按钮 */
.fs-confirm {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px;
  padding: 10px 16px 12px; border-top: 1px solid #f1f5f9;
}
.fs-confirm-pill {
  flex: none; font-size: 12px; font-weight: 700; border-radius: 999px; padding: 3px 10px;
}
.fs-confirm-pill.tone-wait { color: #b45309; background: #fef3c7; }
.fs-confirm-pill.tone-done { color: #047857; background: #d1fae5; }
.fs-confirm-sub { font-size: 12px; color: #64748b; line-height: 1.5; }
.fs-confirm-times {
  flex: none; margin-left: auto; padding: 2px 8px; border-radius: 9px;
  font-size: 11px; font-weight: 600; color: #0f766e; background: #ccfbf1;
}

/* 办结回传字段组（1130 W8）：问题类 / 需求类各一套，有值才显示 */
.fs-settle {
  padding: 10px 16px 12px;
  border-top: 1px solid #f1f5f9;
}
.fs-settle-title { font-size: 12px; font-weight: 700; color: #0f766e; margin-bottom: 6px; }
.fs-settle-list {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 10px;
  margin: 0;
}
.fs-settle-label { font-size: 12px; color: #6b7280; }
.fs-settle-text { font-size: 12px; color: #111827; margin: 0; line-height: 1.6; }

/* 主体信息板：反馈单身份 + 状态反馈 */
.fs-sheet {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}
.fs-sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px 12px;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  border-bottom: 1px solid #f1f5f9;
}
.fs-sheet-brand { min-width: 0; flex: 1; }
.fs-sheet-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.4;
  word-break: break-word;
}
.fs-sheet-idrow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
}
.fs-sheet-no {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
  color: #475569;
}
.fs-sheet-dot { color: #cbd5e1; }
.fs-sheet-product { color: #64748b; }

.fs-sheet-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex: none;
}
.fs-status {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  border-radius: 999px;
  padding: 4px 10px;
  white-space: nowrap;
}
/* 状态色对齐 PRD §7.2 胶囊色表 */
.fs-status.tone-created { color: #1d4ed8; background: #dbeafe; }   /* 已建单 · 蓝 */
.fs-status.tone-doing { color: #0369a1; background: #e0f2fe; }     /* 处理中 · 青 */
.fs-status.tone-feedback { color: #0f766e; background: #ccfbf1; }  /* 已反馈 · 青绿 */
.fs-status.tone-done { color: #047857; background: #d1fae5; }      /* 已结案 · 绿 */
.fs-status.tone-danger { color: #b91c1c; background: #fee2e2; }    /* 关联失败 · 红 */

/* 对齐工单头「催单」对齐键按钮（OpHeader.action-btn） */
.action-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  color: #1a6fff;
  background: #fff;
  border: 1.5px solid #93c5fd;
  border-radius: 6px;
  cursor: pointer;
  flex: none;
  font-family: inherit;
  white-space: nowrap;
  appearance: none;
  box-shadow: 0 1px 2px rgba(26, 111, 255, 0.1);
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.action-btn:hover:not(:disabled) {
  background: #eff6ff;
  border-color: #1a6fff;
  box-shadow: 0 2px 8px rgba(26, 111, 255, 0.18);
}
.action-btn:disabled {
  color: #b6bcc6;
  background: #f5f6f8;
  border-color: #e5e7eb;
  box-shadow: none;
  cursor: not-allowed;
}

.fs-sheet-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 0;
  padding: 6px 16px;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
}
.fs-meta-pair {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 1.2;
  padding: 2px 0;
}
.fs-meta-label {
  color: #94a3b8;
  font-weight: 500;
  flex: none;
}
.fs-meta-value {
  color: #334155;
  font-weight: 600;
}
.fs-meta-sep {
  width: 1px;
  height: 12px;
  background: #e2e8f0;
  margin: 0 12px;
  flex: none;
}
.fs-prio {
  font-style: normal;
  color: #c2410c;
  background: #fff7ed;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 720px) {
  .fs-sheet-head { flex-direction: column; }
  .fs-sheet-actions { align-items: flex-start; flex-direction: row; flex-wrap: wrap; }
  .fs-meta-sep { margin: 0 8px; }
}

/* 时间线节点内联「问题原因 / 处理结果」——轻量，不另起卡片 */
.fs-item-fields {
  margin-top: 6px; display: flex; flex-direction: column; gap: 6px;
}
.fs-field { display: flex; gap: 8px; align-items: flex-start; }
.fs-field-label {
  flex: none; font-size: 11px; font-weight: 700; border-radius: 4px;
  padding: 1px 7px; line-height: 18px;
}
.label-cause { color: #b45309; background: #fef3c7; }
.label-result { color: #047857; background: #d1fae5; }
.fs-field-text { font-size: 13px; color: #334155; line-height: 1.6; }

.fs-empty {
  padding: 28px 16px; text-align: center; font-size: 13px; color: #94a3b8;
  background: #f8fafc; border-radius: 8px; border: 1px dashed #e2e8f0;
}

.fs-timeline { display: flex; flex-direction: column; }
.fs-item { display: flex; gap: 12px; }
.fs-item-rail { display: flex; flex-direction: column; align-items: center; flex: none; }
.fs-item-dot {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 50%; color: #fff; font-size: 14px; flex: none;
}
.fs-item-line { flex: 1; width: 2px; background: #e5e7eb; margin: 4px 0; min-height: 8px; }
.fs-item:last-child .fs-item-line { display: none; }
.fs-item-body { flex: 1; min-width: 0; padding-bottom: 16px; }
.fs-item-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fs-item-tag { font-size: 11px; font-weight: 700; border-radius: 4px; padding: 1px 7px; flex: none; }
.fs-item-title { font-size: 13px; font-weight: 600; color: #111827; }
.fs-item-side {
  font-size: 11px; color: #6b7280; background: #f3f4f6; border-radius: 4px; padding: 1px 6px; flex: none;
}
.fs-item-side.downstream { color: #1d4ed8; background: #eff6ff; }
.fs-item-content { font-size: 13px; color: #374151; line-height: 1.6; margin-top: 5px; }
.fs-item-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; color: #9ca3af; margin-top: 6px; }
.fs-item-metabadge { color: #1d4ed8; background: #eff6ff; border-radius: 4px; padding: 1px 6px; }
.fs-item-when { margin-left: auto; flex: none; font-variant-numeric: tabular-nums; }

.act-tip { margin: 0 0 14px; font-size: 13px; color: #64748b; line-height: 1.55; }
.act-field { margin-bottom: 12px; }
.act-label { font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; }
.act-label .req { color: #ef4444; margin-right: 2px; }
.act-optional { font-weight: 400; color: #94a3b8; font-size: 12px; }
</style>
