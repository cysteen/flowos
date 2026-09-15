<script setup lang="ts">
import { computed, defineAsyncComponent, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { useWorkspaceTabsStore, resolveTicketTabTitle } from '@/stores/workspaceTabs';
import { useCtiStore, formatCallDuration } from '@/stores/cti';
import { useUserStore } from '@/stores/user';
import OpHeader from './components/operation/OpHeader.vue';
import OpOverviewBand from './components/operation/OpOverviewBand.vue';
import OpStatDetailModal from './components/operation/OpStatDetailModal.vue';
import OpSupplementModal from './components/operation/OpSupplementModal.vue';
import OpDunningModal from './components/operation/OpDunningModal.vue';
import OpCancelModal from './components/operation/OpCancelModal.vue';
import OpEscalateComplaintModal from './components/operation/OpEscalateComplaintModal.vue';
import OpSmsModal from './components/operation/OpSmsModal.vue';
import OpEmailModal from './components/operation/OpEmailModal.vue';
import TicketEventToastStack from './components/operation/TicketEventToastStack.vue';
import OpProcessTabs from './components/operation/OpProcessTabs.vue';
import OpSidePanel from './components/operation/OpSidePanel.vue';
import OpActionBar from './components/OpActionBar.vue';
// 建单弹窗仅在「转单/重开」时用，按需异步加载，不阻塞操作页首屏
const CreateTicketModal = defineAsyncComponent(() => import('./components/CreateTicketModal.vue'));
import { useTicketOperation } from './composables/useTicketOperation';
import { FEISHU_ESCALATE_CHANNEL, mapUserRole, pushEntry, isAftersaleSettled, isAftersaleInbound } from './composables/opActions';
import { useProcessForm } from './composables/useProcessForm';
import { useOperationTabs } from './composables/useOperationTabs';
import { useTicketLiveNotify } from './composables/useTicketLiveNotify';
import { formatTicketRecordWho, MOCK_FIRST_LINE_AGENTS } from './utils/ticketRecordWho';
import { mergeDraftIntoLatestHandling } from './utils/ticketOverview';
import { TICKETS } from '@/mock/tickets';
import { useRiskTagStore } from '@/stores/riskTags';
import { useRiskReportStore } from '@/stores/riskReports';
import { useRiskQueueStore } from '@/stores/riskQueue';
import { poolStageStatusOf } from '@/stores/riskPool';
import { REPORT_ASSESS_LIMIT_MIN, isOpenStatus, isPooledStatus } from '@/stores/riskShared';
import { POST_CLOSE_EDITABLE_FIELDS, RISK_FLAG_OPTIONS, isProcessTabVisible, tabWritableFor } from './types/operation';
import { poolStatusText } from './components/operation/OpRiskDecision';
import { useRiskCollabStore } from '@/stores/riskCollab';
import { useRiskHistoryStore, type RiskHistoryKind, type RiskHistoryRecord } from '@/stores/riskHistory';
import { useRiskPoolStore } from '@/stores/riskPool';
import { useDerivedTicketStore } from '@/stores/derivedTickets';
import { RISK_LEVELS, riskLevelText } from '@/config/risk';
import type { TlAction, TlRole } from './types/ticketDetail';
import { pullbackOnCsEvent, headerActionsByRole, handlerGroupOf, currentHandlerName, type TicketStatus } from './types/ticket';
import { buildChildTicketPrefill, buildReopenTicketPrefill } from './composables/childTicketPrefill';
import {
  buildEscalatePrefill, buildEscalateVerdict, buildEscalatedTicket, escalateTargetLabel,
  isTicketTerminated, resolveEscalateOutcome, summarizeEscalateInput, type EscalateInput,
} from './composables/complaintEscalation';
import { escalateComplaintBlockTip, resolveRiskActionForm } from './composables/opActionRegistry';
import { resolveSupersededBy, type TicketRelation } from './composables/ticketRelations';
import type { CreateTicketPrefill, Ticket } from './types/ticket';
import type { ProcessFormDraft, InsightAction, InsightModalKey } from './types/operation';
import type { ProcessTabKey } from './types/operation';
import { COMPLAINT_SUPPLEMENT_TYPE } from './types/operationTabs';
import type { OperationTabData } from './types/operationTabs';
import type { TicketLiveEventType, TicketLiveToast } from './types/ticketLiveNotify';

const route = useRoute();
const router = useRouter();
const {
  detail: d, timeline, opState, suspendInfo, draftSavedAt,
  dispatch, confirmWithdraw, addChildTicket, addReopenTicket, addEscalatedComplaint,
} = useTicketOperation();
const {
  form, activeChip, expandedSections, filledSupplementCount,
  toggleSection, selectChip,
} = useProcessForm(() => d.value.type);
const { tabData } = useOperationTabs(() => d.value.type, () => d.value.no);
const {
  toasts: liveToasts,
  push: pushLiveToast,
  dismiss: dismissLiveToast,
  dismissAll: dismissAllLiveToasts,
} = useTicketLiveNotify();

/** keep-alive 下仅当前激活的工单操作 Tab 展示实时通知 */
const pageActive = ref(false);

const ticketNo = computed(() => (route.params.ticketNo as string) || d.value.no);
const processTabsRef = ref<InstanceType<typeof OpProcessTabs> | null>(null);
const actionBarRef = ref<{ openEscalate: () => void; openAftersale: () => void } | null>(null);

const tabsStore = useWorkspaceTabsStore();
const cti = useCtiStore();
const user = useUserStore();

const overviewExpanded = ref(false);
const supplementModalOpen = ref(false);
const dunningModalOpen = ref(false);
const cancelModalOpen = ref(false);

// 联系客户：短信 / 邮件弹窗
const smsModalOpen = ref(false);
const smsPhone = ref('');
const emailModalOpen = ref(false);
const emailTo = ref('');
const notifyCtx = computed(() => ({
  no: ticketNo.value,
  name: d.value.customer.name || '',
  product: d.value.product.name || '',
  agent: user.name || '当前坐席',
}));

/** 工单操作页加载后，用标题同步 Tab（避免仅显示工单号） */
watch(
  [ticketNo, () => d.value.title, () => d.value.no],
  ([no, title, detailNo]) => {
    if (!no) return;
    tabsStore.updateTitle(`/tickets/${no}`, resolveTicketTabTitle(no, title, detailNo));
  },
  { immediate: true },
);

/** 风险监控页「领取」后带 tab=risk 跳转，直达风险监控 Tab */
watch(
  () => route.query.tab,
  (tab) => {
    if (tab === 'risk') processTabsRef.value?.switchTab('risk');
  },
  { immediate: true },
);

// ---- 风险监控核实结论 → 工单风险字段（回传） ----
//
// 🔴 **只有命中核实这一路**（915 §7.3）。风险报备的评估**不进这条链路** ——
// 2026-09-09 业务第二轮拍板（《【930】》N1）把评估决策改回二选一，v1.23 定名「不升级 / 升级」，
// 没有"确认有风险 + 定级"这一档了：「不升级」往工单一字不写，「升级」的产出是**一张新单**
// （走《【830】》已有的第一跳派生），不是往原单的风险字段里落值。
// 此前这里把两路结论合流成一份再统一写入，那份合流已随之整块拆掉。
//
// 【回传什么】只回传**工单级风险等级**与由核实结论**推导**出的「是否有风险」。
// 「命中判定（成立/误报）」**不回传**：它判的是"这条规则这次命中得准不准"，喂的是规则准确率；
// 写进工单会让坐席把「误报」读成"这单没风险"，而误报的真正结论是"规则捞错了"，
// 这单危不危险监控根本没说。
//
// 【写入优先级】工单侧优先，只填空。判"空"的口径是**坐席从没碰过这个字段**（`''`），
// 不是"界面上看着像无风险"——把明确选过的「无风险」也当成空，等于系统可以推翻坐席的判断；
// 反过来把没碰过的空当成已填，回传就永远写不进去，这个功能等于没做。
const riskTags = useRiskTagStore();
const riskReports = useRiskReportStore();
/** A 线（自动识别 → 实时监控 → 打标 → 风险工单池）。工单页要读它的打标结论与在池条目 */
const riskQueue = useRiskQueueStore();
/** 协同处理记录（工单头部的**建议标记**从它来），见 `stores/riskCollab.ts` */
const riskCollab = useRiskCollabStore();
/**
 * 第八类「风险结论」履历的**唯一记录源**，见 `stores/riskHistory.ts`。
 * 本页只**读它、投影成履历条目**；写入在四个产出点的 store 侧，本页一件也不落库。
 */
const riskHistory = useRiskHistoryStore();
/**
 * 两条线的合并层。**本页不调它的任何动作**（只读它的 `items`，见 `escalateAdviceOf`），
 * 实例化它还为触发一件事：它在初始化时把**种子里那批已有结论的条目**
 * 回填进第八类履历（`backfillSeedRiskHistory`）——
 * 否则打开一张种子高危单，页头挂着「风险打标 高危」而履历里一条也没有。
 */
const riskPool = useRiskPoolStore();
/**
 * 运行时派生出来的那批新投诉单。第 2 类「关联单」卡片要摆新单的标题与当前状态，
 * 而现场升级刚派生出来的单**不在 `TICKETS` 里**（那是静态样本），只能问它。
 */
const derivedTickets = useDerivedTicketStore();
const riskMonitorVerify = computed(() => riskTags.ticketVerificationOf(ticketNo.value));

/**
 * 五件 → 履历图标位（《【720】》§5.1）。**共用 `risk` 色条、图标各不相同** ——
 * 图例点开「风险结论」之后，靠它区分哪一条是报备、哪一条是打标。
 */
const RISK_TL_ACTION: Record<RiskHistoryKind, TlAction> = {
  report: 'riskReport',
  tag: 'riskTag',
  assess: 'riskAssess',
  collab: 'collab',
  grade: 'riskGrade',
};

/** 履历角色徽章的取值集（`TlRole`）。落款角色名对得上就原样用 */
const TL_ROLES: readonly TlRole[] = [
  '客户', '一线坐席', '二线专员', '技术支持', '二线班组长',
  '客诉专员', '投诉督导', '工单运营', '质检', '管理员', '系统',
];
/**
 * 记录里的落款角色名 → 履历角色徽章。
 *
 * 🔴 **不再写死成「客诉专员」**：此前协同处理那一条投影把角色硬编码成 `mapUserRole('complaint-handler')`，
 * 而两个池的兜底角色是**管理员**（基线 v1.24 ※29「客诉专员与管理员同权」）——
 * 管理员做的协同处理会在履历上顶着「客诉专员」的徽章，那是记错了人。
 * 对不上取值集时回落「系统」而不是猜一个角色：宁可说不清是谁，也不冒名。
 */
function toTlRole(byRole: string): TlRole {
  return (TL_ROLES as string[]).includes(byRole) ? (byRole as TlRole) : '系统';
}

/**
 * 两把刻度统一成"数越大越重"，**给防回退棘轮用**——
 * 915 §7.6「已写进去的等级不会被降回来」：命中被修正成误报、工单级掉档时，
 * 回传不能把工单上已经落定的高等级再降回去。两处各写一套比大小，
 * 迟早出现"这边算升级、那边算降级"，故只留这一把尺。
 * 空值（没有结论 / 坐席没碰过）恒为 -1，低于任何一档实值。
 */
function flagRank(f: ProcessFormDraft['riskFlag'] | null | undefined): number {
  return f ? RISK_FLAG_OPTIONS.indexOf(f) : -1;
}
/** RISK_LEVELS 由重到轻排，故取反后才是"越大越重" */
function levelRank(l: ProcessFormDraft['riskLevel'] | null | undefined): number {
  return l ? RISK_LEVELS.length - 1 - RISK_LEVELS.indexOf(l) : -1;
}

/**
 * 要写进工单的那一份结论 —— **只有命中核实一路**（915）。
 * 报备评估那一路已整块拆除（930 N1：二选一之后评估不再回传风险字段）。
 */
const riskConclusion = computed(() => {
  const verify = riskMonitorVerify.value;
  /*
   * 🔴 **等级单独取一次，不从 `verify` 里拿**（2026-09-10 收口）：`ticketVerificationOf`
   * 在**本单没有任何命中记录时返回 null** —— 那是它的本意（"没命中"不等于"没风险"，
   * 监控对这单没话可说）。但工单级等级的新口径含**打标结论**，而投诉单 P0·P1 与
   * 重要紧急单这两类根本不产生命中记录：走 `verify` 这条路，它们打了标也永远回写不进工单。
   * 故等级直接问 `ticketGradeOf`（它自己已经把两个来源取过 max 了）。
   */
  const grade = riskTags.ticketGradeOf(ticketNo.value);
  if (!verify && !grade) return null;
  /*
   * 没有命中结论、却已有打标等级时，「是否有风险」按**打标本身**推导为「有风险」。
   * 【为什么必须推】风险等级字段只在 riskFlag ＝「有风险」时才渲染、才允许写入
   * （见下方 patch.riskLevel 那一段）；不推的话等级有值也落不进去，⑥ 这条口径等于没做。
   * 【为什么这么推是对的】打标四选一里"低 / 中 / 高"三档的含义就是**人看过并判定有风险**，
   * 与 `ticketVerificationOf` 把"有任一成立命中"推成「有风险」是同一个道理。
   * 打为「无风险」的条目不贡献等级（`tagGrades` 那一格已清），故走不到这里。
   */
  return {
    ticketNo: ticketNo.value,
    flag: verify?.flag ?? (grade ? '有风险' as const : null),
    grade,
  };
});

/* ---------------- 底栏那一枚风险按钮：形态 × 出现条件（基线 ※29） ---------------- */

/**
 * 本单的**在队报备**（B 线）。
 *
 * 🔴 **不用 `riskReports.pendingOf`**：那个读口把 A 线（自动识别进池）的条目也算进来。
 * 本轮拆线之后，A 线的条目在这张页面上要另说一句话 —— 它不是谁报上来的，
 * 说成「风险报备待评估」既不实、也会把二线的报备入口白白锁上
 * （报备形态的出现条件是"本单无**在队报备**"，A 线条目不占这个名额）。
 * 判据取 `source` 而不是 `by === '系统'`：来源是条目自带的身份标，比落款稳。
 */
const riskReportPendingItem = computed(
  () => riskReports.reportsOf(ticketNo.value)
    .find((r) => r.source === '二线报备' && isOpenStatus(r.status)) ?? null,
);
/** 本单**未出结论**的风险条目（两条线合起来看）：评估形态的出现条件读它 */
const riskOpenItem = computed(
  () => riskReports.reportsOf(ticketNo.value).find((r) => isOpenStatus(r.status)) ?? null,
);
/** 本单在**风险工单池**里的那条 A 线条目（一张单至多一条，《【930】》§3.1） */
const riskPoolEntry = computed(
  () => riskQueue.entriesOf(ticketNo.value).find((e) => isPooledStatus(e.status)) ?? null,
);

/** 当前角色 × 本单类型落在哪一种形态；null ＝ 这个角色三种形态都不给 */
const riskActionForm = computed(() => resolveRiskActionForm(user.roleKey, d.value.type)?.form ?? null);

/**
 * 底栏那一枚按钮**出不出**。三种形态各有各的出现条件（基线 ※29）：
 * - **报备**：本单无在队报备 —— 有在队报备时按钮仍出，改为置灰 + 提示（见 riskReportPending）；
 * - **评估**：本单有未出结论的非投诉单条目，且**还没人领**或**就是我领的**
 *   （已被别人领走的由领取人给结论，不设改派 —— 「分派 / 改派」两个动作已取消）；
 * - **协同**：本单是投诉单且在风险工单池里，**不论该条目是否已结论**（§3.1 末行）。
 */
const showRiskReport = computed(() => {
  const form = riskActionForm.value;
  if (!form) return false;
  if (form === 'report') return true;
  if (form === 'collab') return !!riskPoolEntry.value;
  const item = riskOpenItem.value;
  if (!item) return false;
  // 「待分派」是 store 侧尚未改名的存储值，界面一律写「待领取」（见 OpRiskDecision.ts）
  return item.status === '待分派' || item.assignee === (user.name || '当前用户');
});

/**
 * 风险按钮的置灰条件。
 * ① **未认领**：报备形态与协同处理形态置灰（基线 §2，见 `ticketUnclaimed`）；
 * ② **本单已有在队报备**：只对报备形态成立 —— 评估与协同两形态的出现条件不成立时按钮直接不出
 * （上面那个 computed 已收），在这里返回 true 会让它们顶着一条说的是别的事的提示置灰在那儿。
 *
 * 🔴 **判据与 `riskReportPendingItem` 已经对齐**（2026-09-10 收口）：`riskReports.canSubmitFor`
 * 本轮收成只看 B 线，与这里那个 B 线专用的在队报备是同一批条目了。此前两者分家 ——
 * 按钮跟着合并口径的 store 走、横幅跟着 B 线走，于是一张挂着 A 线在池条目的单子
 * 会顶着「本单已有报备待评估」置灰，而 Tab 里一条报备都找不到。那道缝已经消掉。
 */
/**
 * 本单是否处于子状态「**未认领**」。
 * 基线 §2 状态 × 动作矩阵「未认领」行：「风险报备」「协同处理」两列均为 **置灰 ※29**
 * （※29：无处理人 —— 报备侧先领取再报；协同处理侧没有可承接建议的处理人，先领取或指派再协同）。
 * 「风险报备」列只管报备形态的逐状态取值，评估形态不受这一格约束。
 *
 * 取数：详情页现值（跨组调剂后落「未认领」）或工单库里的原始子状态（工单池里无人领的单）。
 */
const ticketUnclaimed = computed(() => {
  if (d.value.status === '未认领') return true;
  const row = TICKETS.find((x) => x.no === d.value.no);
  return !!row && row.nodeStatus === '未认领' && !row.assignee;
});
const riskUnclaimedBlocked = computed(
  () => (riskActionForm.value === 'report' || riskActionForm.value === 'collab') && ticketUnclaimed.value,
);

const riskReportPending = computed(
  () => riskUnclaimedBlocked.value
    || (riskActionForm.value === 'report' && !riskReports.canSubmitFor(ticketNo.value)),
);

/**
 * 置灰的**原因原文**，交给底栏呈现（底栏自己不写死，见 OpActionBar 的 `riskForbiddenTip`）。
 * 未认领先于在队报备判（《【930】》§4.4 置灰提示语）。
 * 在队报备分两态写：**待领取**＝还没人接，等的是队列；**已领取**＝活在某个客诉专员手上，该找的是这个人。
 * 一句笼统的「已有报备待评估」把这两件事说成一件，二线不知道该等还是该催、催谁。
 */
const riskForbiddenTip = computed(() => {
  if (riskUnclaimedBlocked.value) {
    return riskActionForm.value === 'collab'
      ? '本单尚未认领，领取或指派后可协同处理'
      : '本单尚未认领，领取后可发起报备';
  }
  const r = riskReportPendingItem.value;
  if (!r) return '';
  return r.status === '评估中'
    ? `本单报备已由 ${r.assignee || '客诉专员'} 领取，评估中，出结论后可再发起`
    : '本单已有报备待评估，出结论后可再发起';
});

/** 风险侧统一的时刻格式（`YYYY-MM-DD HH:mm`），四个风险 store 与履历记录共用这一把 */
function riskNowStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function onRiskReport(payload: {
  reason: string;
  category: string | null;
  desc: string;
  attachments: string[];
}) {
  const at = riskNowStamp();
  const created = riskReports.submit({
    ticketNo: ticketNo.value,
    reason: payload.reason as import('@/stores/riskReports').ReportReason,
    category: payload.category as import('@/stores/riskReports').RiskCategory | null,
    desc: payload.desc,
    attachments: payload.attachments,
    by: user.name || '当前用户',
    byRole: user.role.name || '二线专员',
    at,
  });
  if (!created) {
    // 走到这里只剩一种可能：本单已有一条**在队报备**（门控收成只看 B 线之后，
    // A 线的在池条目不再挡这条路）。提示与底栏置灰用同一句，两处不各说一套
    message.warning(riskForbiddenTip.value || '本单已有报备待评估，出结论后可再发起');
    return;
  }
  const limitText = REPORT_ASSESS_LIMIT_MIN % 60 === 0
    ? `${REPORT_ASSESS_LIMIT_MIN / 60} 小时`
    : `${REPORT_ASSESS_LIMIT_MIN} 分钟`;
  message.success(`已提交报备，客诉专员将在 ${limitText} 内给出结论`);
  processTabsRef.value?.switchTab('risk');
}

/**
 * 头部「报备中」横幅（基线 ※29 / 《【930】》§3.2）。
 *
 * 【为什么要有它】报备是**正交标记**、不落子状态：本单状态一格不动、SLA 不停钟、
 * 处理人照常处理。正因为工单本身"看不出任何变化"，不挂一条横幅的话，
 * 报备人切回这张单只会以为自己没报成功，于是重复报或直接打电话催。
 *
 * 【为什么按两态分开写】待领取＝**还没人接**，评估钟在空转；已领取＝活在某个客诉专员手上，
 * 该找的是这个人。一句笼统的「评估中」把这两件事说成一件，等待时长再长也不知道该找谁。
 *
 * 🔴 **只认 B 线的报备**（本轮改）：`riskReports.pendingOf` 把 A 线自动进池的条目也算在内，
 * 而 A 线的条目**不是谁报上来的**，挂一条写着「风险报备待评估」的横幅是在说一件没发生的事，
 * 也会让二线以为自己报过了。A 线的情况改由下面的「风险打标」条呈现，两件事各说各的。
 */
/**
 * 当前角色在这张单上**看不看得到「风险报备」Tab** —— 页头三条风险横幅的渲染门控。
 *
 * 🔴 **入口与正文必须同一个判据**（2026-09-11 D-23 / D-24）：三条横幅上的
 * 「查看报备 / 查看打标 / 查看协同记录」都是 `switchTab('risk')`，而 Tab 条上这一枚
 * 对**一线坐席**与**工单运营**根本不渲染（`TAB_ROLE_DENY.risk`，真源＝基线 §3.1
 * 「打标结果…**一线坐席仍不可见**」与「**工单运营不给** —— 它连风险词命中页都看不到」）。
 * 横幅此前只判 `user.role.frontline`（只挡住一线）或干脆不判角色（报备横幅），
 * 于是这两个角色能从页头把风险报备正文整块调出来：报备人、风险类型、场景描述全文、
 * 附件、打标备注全部可见。
 *
 * 判据不在这里另写一张角色表 —— 直接问 `isProcessTabVisible`，与 Tab 条同源；
 * 另写一张迟早与 `TAB_ROLE_DENY` 分家，那就是同一个洞换个地方再开一次。
 *
 * ⚠️ 这是**入口层**那一道；根上那一道在 `OpProcessTabs.switchTab`（拒绝切到不可见 Tab），
 * 两层都要 —— 只有入口层挡不住 `?tab=risk` 深链。
 */
const canViewRiskTab = computed(
  () => isProcessTabVisible('risk', d.value.type, user.roleKey),
);

const riskReportBanner = computed(() => {
  if (!canViewRiskTab.value) return null;
  const r = riskReportPendingItem.value;
  if (!r) return null;
  const mins = riskReports.waitedMinutes(r.at);
  const waited = mins >= 60 ? `${Math.floor(mins / 60)} 小时 ${mins % 60} 分钟` : `${mins} 分钟`;
  const head = r.status === '评估中'
    ? `风险报备已领取 · ${r.assignee || '客诉专员'} 评估中`
    : '风险报备待领取';
  return {
    text: `${head} · 已等待 ${waited}`,
    // 超时只改配色与后半句，不改前半句：等待时长是同一个事实，超没超时是它的一个判定
    overdue: riskReports.isOverdue(r),
  };
});

/**
 * 本单的**风险打标结论**（A 线，《【930】》§5A.3 / §6.1）。
 *
 * 【谁看得到】**二线处理人可见**；**一线坐席不可见** ——
 * 一线的工单列表、详情与通知里都不出现风险等级（§3.1，2026-09-10 拍板）。
 * 🔴 **打标不推送任何消息**（本轮不加通知）：这条横幅就是处理人知道自己单子被打了标的
 * 唯一方式，别再往这一步挂推送 —— 挂了就得有配得上它的通知规则，本轮没有。
 * 一线在本页走的是 `isFrontlineView` 那条分支，故这里显式判掉它，不靠 Tab 权限兜底：
 * 这一条挂在页头，不在任何 Tab 里，Tab 的黑名单管不到它。
 *
 * 【为什么连「无风险」也要显示】"有人看过、判定没风险"与"还没有人看过"是两件事，
 * 只显示有等级的那几档，处理人分不出自己这张单属于哪一种。
 */
const riskTagBanner = computed(() => {
  if (user.role.frontline) return null;
  // 🔴 工单运营也不给（基线 §3.1「工单运营不给 —— 它连风险词命中页都看不到」）。
  // 只判 frontline 时它照样能看到这条打标结论、并点「查看打标」把 Tab 正文调出来。
  if (!canViewRiskTab.value) return null;
  const entry = riskQueue.entriesOf(ticketNo.value).find((e) => !!e.tag);
  const tag = entry?.tag;
  if (!tag) return null;
  const level = tag.result === '无风险' ? '无风险' : riskLevelText(tag.result);
  return {
    level,
    /** 高危单要"喊"一声：它是《【930】》§6.5 里唯一带「去管控」引导的一档 */
    high: tag.result === '高',
    text: `风险打标 ${level} · ${tag.by}（${tag.byRole}）· ${tag.at}`,
    note: tag.note,
    /** 已进池的另说一句它在池里的位置，二线才知道这条后面还有人跟 */
    poolText: entry && isPooledStatus(entry.status) ? `风险工单池 · ${poolStatusText(poolStageStatusOf(entry))}` : '',
  };
});

/**
 * 工单上的「建议标记」（《【930】》§3.3）：历次协同处理勾选项的并集，人不直接摘。
 *
 * 【两道渲染门控】
 *   · **一线不可见**（基线 §3.1）：一线的工单列表、详情与通知里都不出现风险侧的标记；
 *   · 🔴 **工单进终态即不再渲染**（PRD §6.5 G3 写的唯一撤下时机，2026-09-11 补）。
 *     标记的语义是"**接下来要做的事**"，而终态单没有接下来 —— 挂着「转交专员 / 每日跟进」
 *     的已结案单，读的人分不出那是一件没做完的活还是一条历史留痕，
 *     而这条标记本身**没有回执动作**（G3），谁也摘不掉它。
 *
 * 🔴 **只改渲染门控，不动数据**：`riskCollab` 里那几条协同记录一条不删 ——
 * 建议事项是历次协同的痕迹，终态单的「风险报备」Tab 里协同记录块照常查得到，
 * 撤下的只是页头这条常驻横幅。
 */
const riskAdviceMarks = computed(() => {
  if (user.role.frontline) return [];
  // 🔴 与上面两条横幅同一道门控：看不到「风险报备」Tab 的角色不渲染这条 ——
  // 它上面的「查看协同记录」同样是通向该 Tab 正文的入口（基线 §3.1）。
  if (!canViewRiskTab.value) return [];
  if (isTicketTerminated(d.value.status)) return [];
  return riskCollab.marksOf(ticketNo.value);
});

/**
 * 「风险报备」Tab 上的状态圆点。三件事都往这一枚点上收 ——
 * 横幅只说"有这么回事"，圆点指的是**这件事在哪儿看**，点进去就是 Tab 里那几块。
 * 报备超时最急（红），其次是有在队报备或有新的协同建议（橙）。
 * 无在队报备时给空对象而不是 undefined：Tab 侧只认"有没有这个 key"，空对象即一个点都不出。
 */
const processTabDots = computed<Partial<Record<ProcessTabKey, 'warn' | 'danger'>>>(() => {
  const b = riskReportBanner.value;
  if (b) return { risk: b.overdue ? 'danger' : 'warn' };
  if (riskAdviceMarks.value.length) return { risk: 'warn' };
  return {};
});

/**
 * 第八类「风险结论」的**五件 → 工单处理履历**（《【720】》§3.2 / §4.4，《【930】》§6.3）。
 *
 * 【为什么是"投影"而不是提交时直接 push】五件里没有一件是"当前处理人自己做的"：
 * 报备是二线报的、打标与评估与协同是客诉专员做的，而要读这几条履历的往往是**另一个人**
 * —— 两端天然是两次登录。履历（`timeline`）是按工单现搭的**内存态**，换一次登录就回到种子；
 * 风险结论落在 `stores/riskHistory.ts` 那份持久化记录里，故让履历**从记录投影**，
 * 换谁登录、刷新几次都补得回来。
 *
 * 🔴 **这里只投影、不落库**。落库口全仓只有一个：`riskHistory.recordRiskHistory()`，
 * 由四个产出点（`riskQueue.recordTag` / `riskReports.submit` / `riskPool.assess` /
 * `riskPool.coordinate`）调用。此前这一段是"协同处理专用"的投影，于是第八类只收到了
 * **五件里的一件**，另外四件一条都没有 —— 文档说收五件、代码只收一件。
 * **不要在别处再写第二个 `category: 'risk'` 的 `pushEntry`**，散着写下次仍然会漏。
 *
 * 【幂等】按记录 id 认（`riskRecordId`），投影多少次结果都一样；
 * 不再按"数已有几条"补差额 —— 五类混排之后那个判据会数错。
 */
/**
 * 这一跳的**升级说明**（评估弹窗里那段自由文本）。
 *
 * 【为什么要绕去池里取】第八类的记录**故意不存自由文本**（《【720】》§4.4 第 3 条：
 * 升级说明留在评估记录里、不进风险结论正文）。但第 2 类「关联单」是另一类，
 * 《【830】》既有口径的那句话里带着「升级原因：…」（见 `useTicketOperation.addEscalatedComplaint`）——
 * 两类口径不同，故这里按单号 + 派生单号回池里认领那条评估记录，取它的 `advice`。
 * 认不到就整段省掉那半句，**不编一个理由**。
 */
function escalateAdviceOf(ticketNo_: string, derivedNo: string): string {
  return riskPool.items.find(
    (i) => i.ticketNo === ticketNo_ && i.assessment?.escalatedToNo === derivedNo,
  )?.assessment?.advice?.trim() ?? '';
}

/**
 * 「升级」派生新投诉单那一跳的**第 2 类「关联单」履历**。
 *
 * 🔴 **这一条此前只有注释、没有代码**：`riskPool.assess` 里写着「照《【830】》既有口径另落一条」，
 * 而全仓 `category: 'relate'` 的产出点只有 `useTicketOperation.addEscalatedComplaint` 一个 ——
 * 它挂在工单页底栏的「升级投诉」按钮上，**风险评估这条路根本走不到它**。
 * 于是现场评估判「升级」派生出的新单，第 8 类有可点跳的单号 chip、第 2 类一张卡都没有，
 * 《【720】》验收 T4「新投诉单号两处一致且都可点跳」在**现场产生的升级上只有一处存在**。
 * 种子单看不出来，是因为种子履历（`mock/ticketDetail.ts` 的 `er1` / `er2`）自带两张 relate 卡。
 *
 * 【为什么落在投影里而不是落在 `riskPool.assess` 里】履历（`timeline`）是**按工单现搭的内存态**，
 * 而评估最常发生在风险监控页 —— 那一刻原单的工单页可能根本没打开，`assess` 里 push 进去的
 * 那一条没有落点。第 8 类为此走的就是"落持久化记录 → 工单页投影"这条路，
 * 关联单这一条**同源投影**才能保证两处的单号必然是同一个值（都取 `r.derivedNo`），
 * 不会再出现一处有、一处没有。
 *
 * 【幂等】按 `${记录 id}-relate` 认，与第 8 类那一条各认各的，投影多少次结果都一样。
 */
function pushEscalationRelateEntry(r: RiskHistoryRecord, derivedNo: string) {
  // 新单可能是静态样本里的（种子那批已评估条目），也可能是本次会话现场派生的
  const t = TICKETS.find((x) => x.no === derivedNo) ?? derivedTickets.find(derivedNo);
  const advice = escalateAdviceOf(r.ticketNo, derivedNo);
  pushEntry(timeline.value, {
    category: 'relate',
    action: 'relate',
    who: r.by,
    role: toTlRole(r.byRole),
    // How 徽章与 830 那一处同词：读的人分不出"谁点的按钮"，也不该被要求分得出
    how: '升级投诉',
    when: r.at,
    what: `原单升级为投诉，已生成新投诉单并双向关联。${advice ? `升级原因：${advice}` : ''}`,
    riskRecordId: `${r.id}-relate`,
    relatedTicket: {
      no: derivedNo,
      // 派生单全量继承原单信息，故标题与原单同；解析不到时也只回落到原单标题，不编一个
      title: t?.title ?? d.value.title,
      type: '投诉',
      typeColor: '#EF4444',
      status: t?.nodeStatus ?? '未认领',
      statusColor: '#1A6FFF',
      builder: r.by,
      createdAt: r.at,
    },
  });
}

function syncRiskTimeline() {
  const seen = new Set(timeline.value.map((e) => e.riskRecordId).filter(Boolean));
  riskHistory.recordsOf(ticketNo.value).forEach((r) => {
    /*
     * 一条记录最多投影出两条履历：第 8 类那一条恒有，第 2 类「关联单」只在
     * **真派生了新单**时才有（见 `pushEscalationRelateEntry`）。两条**各认各的幂等键**，
     * 不共用一个 —— 共用的话，先有其一的历史缓存会把另一条永久挡在门外。
     */
    if (r.derivedNo && !seen.has(`${r.id}-relate`)) pushEscalationRelateEntry(r, r.derivedNo);
    if (seen.has(r.id)) return;
    pushEntry(timeline.value, {
      category: 'risk',
      action: RISK_TL_ACTION[r.kind],
      who: r.by,
      role: toTlRole(r.byRole),
      how: r.how,
      when: r.at,
      what: r.what,
      riskRecordId: r.id,
      /*
       * 《【720】》§5.1 的**四样 chip**，取值在落库时已由 `riskHistory.renderChips` 固化，
       * 这里只做改名搬运（`conclusion` → `riskConclusion` …）：`TimelineEntry` 是八类共用的
       * 一张扁平结构，风险这一类的字段必须带 `risk` 前缀才不会和别的类撞名。
       * 🔴 **不在这里算 chip 取值**：一算就成了"落库一份、投影再算一份"，两处必然分叉。
       */
      ...(r.conclusion ? { riskConclusion: r.conclusion } : {}),
      ...(r.gradeFrom && r.gradeTo ? { riskGradeFrom: r.gradeFrom, riskGradeTo: r.gradeTo } : {}),
      ...(r.advices?.length ? { riskAdvices: [...r.advices] } : {}),
      ...(r.derivedNo ? { riskDerivedNo: r.derivedNo } : {}),
    });
  });
}
watch(
  [ticketNo, () => riskHistory.countOf(ticketNo.value)],
  () => syncRiskTimeline(),
  { immediate: true },
);
/**
 * 回传上次写进表单的值。有它才分得清"这个『疑似风险』是坐席填的还是回传自己填的"——
 * 只认空串的话，回传第一次填完就再也改不了自己写的那个值：
 * 命中从「待核实」被核实成「成立」时，本该从疑似风险升到有风险，却被自己上一次的写入挡住。
 *
 * 【为什么记的是值而不是一个"我写过"的布尔标记】标记只答"这个字段被系统碰过没有"，
 * 答不了"现在躺在里面的还是不是我写的那个"：坐席把回传写的「疑似风险」改成「无风险」之后，
 * 标记仍然是真，系统就会理直气壮地再覆盖一次坐席的判断。值比较自带这条边界——
 * 坐席改成别的值即挡住，改回同一个值则系统仍可再写（915 §7.3.3 口径 3）。
 * 【局限】记忆随页签存活（前端内存态，页签关闭或整页刷新即丢），届时对自己上次写入的值
 * 也不再覆盖；落地时须把「上次回传值」随工单持久化。
 */
const riskWriteBack = ref<{ ticketNo: string; flag?: ProcessFormDraft['riskFlag']; level?: ProcessFormDraft['riskLevel'] }>({ ticketNo: '' });
watch(
  // 监听结论本身而不是只在挂载时跑一次：工作区里工单页与风险监控页是两个常驻页签，
  // 在监控页打完标再切回来，这一单的核实结论已经变了，只在挂载时读会停在旧结论上。
  riskConclusion,
  (v) => {
    // 步 1 · 有没有核实结论要写：没有 → 整条跳过
    if (!v) return;
    const f = form.value;
    // 工单号变了记忆整块重置——记忆是按单持有的，串单就成了拿另一张单的值做判据
    const mem = riskWriteBack.value.ticketNo === v.ticketNo ? riskWriteBack.value : { ticketNo: v.ticketNo };
    const patch: Partial<ProcessFormDraft> = {};
    // 步 2 · 工单侧优先：坐席没碰过（空串）才可写，坐席一改就撒手
    // 步 3 · 唯一例外：字段里躺着的正是回传上次写的那个值（值比较）→ 可以覆盖自己
    // 步 4 · 不回退（915 §7.6 棘轮）：只在结论比当前值更重时才落笔；等值是空转，更轻则一律不写
    //        （一条命中被修正成误报会让工单级掉档，掉了也不能把已经写进工单的等级降回去）
    if (v.flag && (f.riskFlag === '' || f.riskFlag === mem.flag) && flagRank(v.flag) > flagRank(f.riskFlag)) {
      patch.riskFlag = v.flag;
    }
    // 核实没推导出结论时 flag 为 null —— 保持工单原值不动，误报不是"这单没风险"
    const nextFlag = patch.riskFlag ?? f.riskFlag;
    // 等级只在「有风险」下才写：坐席已判成无风险 / 疑似风险时，等级字段在面板上根本不渲染，
    // 往里塞一个值就成了谁也看不见、谁也改不掉的脏数据。这时结论改走只读提示行呈现。
    if (
      v.grade && nextFlag === '有风险'
      && (!f.riskLevel || f.riskLevel === mem.level)
      && levelRank(v.grade) > levelRank(f.riskLevel)
    ) {
      patch.riskLevel = v.grade;
    }
    // 步 5 的只读提示行不在这里落笔：它是风险面板（补充处理 · 风险）上的一行只读文字，
    // 由面板自己按单从 store 取（riskTags.ticketVerificationOf），不进 form、不参与必填校验。
    // 写在这里就成了"表单里躺着一行不是字段的字"，它恰恰必须在被挡住时也照常显示。
    // ⚠️ 报备评估**没有**对应的第二行了：二选一之后评估不回传风险字段（930 N1），
    // 结论全文改在「风险监控」Tab · 评估结果区块呈现。
    riskWriteBack.value = {
      ticketNo: v.ticketNo,
      // 本次没写进去则沿用上一次的记忆：这一次被挡住，不代表上一次写的那个值也不是我写的
      flag: patch.riskFlag ?? mem.flag,
      level: patch.riskLevel ?? mem.level,
    };
    if (!Object.keys(patch).length) return;
    form.value = { ...f, ...patch };
  },
  { immediate: true },
);

const createOpen = ref(false);
const createPrefill = ref<CreateTicketPrefill | null>(null);

function onContact(type: 'call' | 'sms' | 'email', value: string) {
  if (type === 'sms') {
    smsPhone.value = value;
    smsModalOpen.value = true;
    return;
  }
  emailTo.value = value;
  emailModalOpen.value = true;
}

function onSmsSubmit(payload: { phone: string; templateName: string; content: string }) {
  tabData.value.contactRecords.unshift({
    id: `c-${Date.now()}`,
    kind: 'sms',
    title: '短信发送',
    emoji: '💬',
    operator: user.name || '当前坐席',
    when: formatNow(),
    metaPrefix: '发送人',
    summary: `接收号码: ${payload.phone} | 状态: 发送成功 | 模板: ${payload.templateName}`,
    smsContent: payload.content,
  });
  syncContactedAfterOutreach();
  processTabsRef.value?.switchTab('contact');
  message.success(`短信已发送至 ${payload.phone}`);
}

/** 电话挂断后写入联系记录并解锁关闭（PRD-915 补充与催单 §10.1：对客联系自动置已联系） */
watch(
  () => cti.callSession,
  (cur, prev) => {
    if (!prev || cur || prev.ticketId !== ticketNo.value) return;
    if (prev.status === 'dialing') return;
    const duration = prev.connectedAt
      ? formatCallDuration(Date.now() - prev.connectedAt)
      : '00:00';
    tabData.value.contactRecords.unshift({
      id: `c-${Date.now()}`,
      kind: 'call',
      title: '外呼联系',
      emoji: '📞',
      operator: user.name || '当前坐席',
      when: formatNow(),
      summary: `呼叫号码: ${prev.phone} | 状态: 接通 | 时长: ${duration}`,
    });
    syncContactedAfterOutreach();
    processTabsRef.value?.switchTab('contact');
  },
);

function onEmailSubmit(payload: { to: string; subject: string }) {
  tabData.value.contactRecords.unshift({
    id: `c-${Date.now()}`,
    kind: 'email',
    title: '邮件发送',
    emoji: '📧',
    operator: user.name || '当前坐席',
    when: formatNow(),
    metaPrefix: '发送人',
    summary: `收件邮箱: ${payload.to} | 状态: 发送成功 | 主题: ${payload.subject}`,
  });
  syncContactedAfterOutreach();
  processTabsRef.value?.switchTab('contact');
  message.success(`邮件「${payload.subject}」已发送至 ${payload.to}`);
}

// —— 顶部速览带：统计宫格双层下钻 ——
const statModalKey = ref<InsightModalKey | null>(null);
const statTable = computed(() =>
  statModalKey.value ? d.value.insightDetails[statModalKey.value] : null,
);
// 弹窗「查看完整记录」跳向的 Tab + 文案
const STAT_VIEW_ALL: Record<Exclude<InsightModalKey, 'contact'>, { tab: ProcessTabKey; label: string }> = {
  history: { tab: 'customerHistory', label: '在「客户历史工单」中查看全部' },
  complaint: { tab: 'customerHistory', label: '在「客户历史工单」中查看全部' },
  recent30: { tab: 'customerHistory', label: '在「客户历史工单」中查看全部' },
};
const statViewAllLabel = computed(() => {
  if (!statModalKey.value || statModalKey.value === 'contact') return '';
  return STAT_VIEW_ALL[statModalKey.value].label;
});
const statModalWidth = computed(() => (statModalKey.value === 'contact' ? 960 : 760));

function onOverviewSelect(action: InsightAction) {
  if (action.kind === 'modal') {
    statModalKey.value = action.modalKey;
  } else {
    processTabsRef.value?.switchTab(action.tab);
  }
}
function onStatViewAll() {
  // contact 无「查看完整记录」跳转，其余三类才有对应 Tab
  if (!statModalKey.value || statModalKey.value === 'contact') return;
  processTabsRef.value?.switchTab(STAT_VIEW_ALL[statModalKey.value].tab);
  statModalKey.value = null;
}
function onStatOpenTicket(no: string) {
  message.info(`打开工单 ${no}`);
}

function openChildCreate() {
  createPrefill.value = buildChildTicketPrefill(d.value);
  createOpen.value = true;
}

function openReopenCreate() {
  createPrefill.value = buildReopenTicketPrefill(d.value);
  createOpen.value = true;
}

/**
 * 被接管：本单已因升级而关闭，业务已转到新单。
 * 按 Zendesk 合并口径**整页锁只读**——底部操作栏不出、Tab 只读、头部动作禁用，
 * 只留横幅上的「打开新单」。不这么做，催单/补充/再投诉就可能落在这张作废的旧单上。
 */
const supersededBy = computed(() => resolveSupersededBy(d.value));
/**
 * 只读态（**整页冻结**）：一线视角 / **已转…**（业务转到新单）/ **只读角色**（工单运营）。
 * 注意**关闭类终态不在此列**——已结案 / 已关闭 / 已强结的单仍保留头部动作
 * （升级投诉 / 关联售后 / 新建补充；催单不给），
 * 补充/催单走 §5.2「建新单承接」。
 */
/**
 * **整页锁死**：已转咨询 / 已转建议 / 已转商机（业务已转到新单）/ 只读角色（工单运营）。
 *
 * ⚠️ **一线视角不在此列**（2026-08-18 修正）——它锁的是**底栏的二线流转动作**
 * （下送/升级/调剂/委派/挂起/关闭/强结），由 hideActionBar 单独管。
 * 头部那一排一线本来就有权限：**升级投诉**一线可升非投诉单、**取消工单**是一线专属、
 * **新建补充 / 催单**是一线主动作。之前把一线视角接进来，导致整排按钮
 * 在一线视角下全被置灰、提示还错成"本单已被新单接管"。
 */
const pageReadonly = computed(
  () => !!supersededBy.value || !!user.role.readonlyTickets,
);

/**
 * 一线视角：底栏不出、Tab 只读，但**头部的客户侧两枚照常可用** ——
 * 「新建补充」「催单」正是一线的主动作，跟着 pageReadonly 一起置灰是错的。
 *
 * 判据是**当前角色**，不是当前工单。此前读工单上的 `frontlineDemo` 字段，
 * 而 12 张 mock 单里 11 张带着它 —— 于是任何角色打开这些单都被当成一线，
 * 底栏整条不出、Tab 全只读，头部六枚也因走一线分支而四角色完全相同。
 */
const isFrontlineView = computed(() => !!user.role.frontline);

/**
 * 客户侧录入（新建补充 / 催单）什么时候被锁：
 * 只有**转单三态**（本单已作废、业务在新单上）与**只读角色**（工单运营）会锁。
 * 一线视角**不锁** —— 它锁的是流转，不是客户诉求录入。
 */
const customerEntryLocked = computed(
  () => !!supersededBy.value || !!user.role.readonlyTickets,
);

/**
 * 客户侧两枚的角色可见性（PRD-915 补充与催单 §4.1，基线 §4 ※21a）：
 * - 新建补充：**一线 + 二线**（二线自己也联系客户，客户在电话里补的东西他就地录入）
 * - 催单：**一线唯一**（登记的是"客户来催"这个进线事件；二线是处理人，不必自己给自己记）
 * - 新建补充：除工单运营 / 质检外都给（※21a 0826 放开）；催单：一线唯一
 */
const headerRoleGate = computed(() => headerActionsByRole(user.roleKey));
const canSupplement = computed(() => headerRoleGate.value.supplement);
const canDunning = computed(() => headerRoleGate.value.dunning);
const canEscalateComplaint = computed(() => headerRoleGate.value.escalateComplaint);
/**
 * 基线 ※8a：**非投诉单 → 投诉单**这一跳，二线专员 / 二线班组长不再自主发起，
 * 入口改为「风险报备」，由客诉专员评为「升级」时代为发起（「升级」只指转投诉单，※29）。
 * 有值 ＝ 该拦，值就是提示原文；null ＝ 放行（第二跳内投→外投、客诉专员 / 投诉督导 / 管理员均放行）。
 */
const escalateReportFirstTip = computed(
  () => escalateComplaintBlockTip(user.roleKey, d.value.type),
);
const canLinkAftersale = computed(() => headerRoleGate.value.linkAftersale);
const canCancelTicket = computed(() => headerRoleGate.value.cancelTicket);

/**
 * 底部流转操作栏隐藏：只读态，**或原单已是终态**——
 * 基线 §1 状态分组为「终态」的十个子状态（已结案 / 已关闭 / 已强结 / 已升级投诉 /
 * 已升级外投 / 已转咨询 / 已转建议 / 已转商机 / 已取消 / 直接结案）
 * 不该再出现 下送/升级/调剂/委派/挂起/关闭/强结。
 */
/**
 * 底栏（二线流转动作条）什么时候整条不出：
 * ① **一线视角** —— 下送/升级/调剂/委派/挂起/关闭/强结属二线权限，一线不该看到；
 * ② 整页锁死（转单三态 / 只读角色）；
 * ③ 原单已是终态 —— 已结案/已强结/已转咨询等不该再出现流转动作。
 * ⚠️ 一线视角在这里显式列出，**不要**再合回 pageReadonly —— 头部那排按钮一线有权限。
 */
/**
 * Tab 区（处理表单）只读：**一线视角**（F17：一线只看不填）+ 整页锁死。
 * 与头部按钮分开 —— 头部那排一线有权限、Tab 区里的写操作没有。
 */
/**
 * Tab 区的**整区**只读：只保留与角色无关的锁 —— 转单三态（本单作废、业务已在新单上）。
 *
 * 角色相关的只读**不在这里**判：一线视角与只读角色的差别已由 `tabWritableFor(tab, roleKey)`
 * 逐 Tab 按权限矩阵 #46–56 的「只读 vs 可用」落全。混在一起会压掉矩阵明确给出的两格：
 * ⑦ 工单运营虽整体只读，但矩阵写明「只读约束的是**工单内容**，打标不受此限」；
 * ① 一线坐席在「关联/补充/催单」Tab 上是「可用」（唯一写动作「已知晓」）。
 */
const tabsReadonly = computed(() => !!supersededBy.value);

/**
 * 结案后补充：终态（已转/已升级的被接管单整页已锁，按关联或子状态判，均不在此列）处理表单锁定；
 * 已取消以外的终态，**最后处理人所在组**且有「工单处理」写权限的成员仍可编辑商机编号、结案后备注，底栏只剩「保存」。
 * 不改状态、不重算 SLA、不触发调研，只记履历。
 */
const SUPERSEDED_STATUSES = ['已转咨询', '已转建议', '已转商机', '已升级投诉', '已升级外投'];
const postClose = computed(
  () => isTicketTerminated(d.value.status)
    && !supersededBy.value
    && !SUPERSEDED_STATUSES.includes(d.value.status),
);
const postCloseEditable = computed(() => {
  if (!postClose.value || d.value.status === '已取消') return false;
  if (!tabWritableFor('process', user.roleKey)) return false;
  const gid = handlerGroupOf(d.value.lastHandler)?.id;
  return !!gid && handlerGroupOf(currentHandlerName(user.roleKey, user.name))?.id === gid;
});

const hideActionBar = computed(
  () => isFrontlineView.value || pageReadonly.value
    || (isTicketTerminated(d.value.status) && !postCloseEditable.value),
);

/**
 * 单子是否正在**三线技术支持**手上 —— 底栏「退回」是三线专属动作，只在这时出现。
 *
 * 依据基线 §1（※14b）：升级两类目标各占一个子状态，产研态处理人仍是二线、不给「退回」，
 * 故判据就是子状态本身，不再读 escalateTarget 字段。
 */
const atTechSupport = computed(() => d.value.status === '已升级技术支持');

/** 关系跳转：售后单是外部系统走深链，客服单站内打开 */
function openRelation(rel: TicketRelation) {
  if (rel.href) { window.open(rel.href, '_blank'); return; }
  router.push(`/tickets/${rel.no}`);
}

// —— 升级投诉：判定弹窗 → 建投诉新单 → 关原单 + 双向关联（《【815】关联投诉 PRD》）——
const escalateModalOpen = ref(false);
const escalateInput = ref<EscalateInput | null>(null);

/**
 * 升级投诉入口分流（PRD §4.2，判据＝**是否跨工单类型**）：
 * - 非投诉 → 投诉：跨类型，实质是建一张投诉单 → **打开新建投诉单页面**，已知字段预填；
 * - 原单已是投诉：不跨类型 → **小弹窗**补录，落法由【工单来源】决定。
 */
function openEscalate() {
  if (buildEscalateVerdict(d.value, user.roleKey).kind === 'toComplaint') {
    createPrefill.value = buildEscalatePrefill(d.value);
    createOpen.value = true;
    return;
  }
  escalateModalOpen.value = true;
}

/** 分支 B 提交：外投渠道→建外投关联单并关原单；其余来源→落为补充写在原单上 */
function onEscalateSubmit(payload: EscalateInput) {
  escalateInput.value = payload;
  if (resolveEscalateOutcome(payload) === 'supplement') {
    finishEscalateAsSupplement(payload);
    return;
  }
  const src = TICKETS.find((t) => t.no === d.value.no);
  const ticket = buildEscalatedTicket(d.value, payload, {
    operator: user.name,
    channel: src?.channel,
    priority: src?.priority,
  });
  finishEscalate(ticket, escalateTargetLabel(payload));
}

/**
 * 落补充：原单加一条补充记录 + 写履历，**不建新单、不关单**。
 *
 * ⚠️ 2026-08-17 起「升级投诉」**不再兼做补充**——投诉信息补录统一走
 * 「新建补充 → 补充投诉信息」（PRD-915 补充与催单 §5.2），分类名「投诉补充」已作废。
 * 本函数仅为兼容尚未清理的旧调用保留；新链路不应再走到这里。
 */
function finishEscalateAsSupplement(payload: EscalateInput) {
  const content = summarizeEscalateInput(payload).join('\n');
  onIncomingTicketEvent('supplement', content, formatTicketRecordWho(user.name, user.roleKey), {
    supplementType: COMPLAINT_SUPPLEMENT_TYPE,
    notify: false,
  });
  escalateInput.value = null;
  processTabsRef.value?.switchTab('related');
  message.success('已作为补充信息写入原单，未产生新单');
}

/** 升级落库：登记关联单 + 写关联履历 + 关原单（两条分支共用） */
function finishEscalate(ticket: Ticket, targetLabel: string, processAfter?: boolean) {
  const note = escalateInput.value?.note ?? ticket.problemDesc ?? '';
  addEscalatedComplaint(ticket, targetLabel, note);
  syncEscalatedRelatedCard(ticket, targetLabel);
  dispatch({ type: '升级投诉', data: { target: targetLabel, newNo: ticket.no, note } });
  escalateInput.value = null;
  if (!processAfter) processTabsRef.value?.switchTab('related');
}

function onTicketCreated(ticket: Ticket, processAfter?: boolean) {
  if (createPrefill.value?.mode === 'child') addChildTicket(ticket);
  else if (createPrefill.value?.mode === 'reopen') addReopenTicket(ticket);
  // 分支 A：建单页提交即完成升级——关原单 + 双向关联 + 写履历
  else if (createPrefill.value?.mode === 'escalate') finishEscalate(ticket, '投诉', processAfter);
  if (processAfter) router.push(`/tickets/${ticket.no}`);
}

/** 升级生成的新投诉单同步进「关联单」列表（客服侧本系统单，可站内打开） */
function syncEscalatedRelatedCard(ticket: Ticket, target: string) {
  const cards = tabData.value.relatedTickets;
  if (cards.some((c) => c.no === ticket.no)) return;
  cards.unshift({
    no: ticket.no,
    title: ticket.title,
    status: '未认领',
    statusColor: '#1A6FFF',
    type: target,
    typeColor: '#EF4444',
    createdAt: nowFullText(),
    createdAtFull: nowFullText(),
    builder: user.name || '当前坐席',
    demand: d.value.demand,
    processRecords: [
      { who: user.name || '当前坐席', when: nowFullText(), content: `由原单 ${d.value.no} 升级投诉生成` },
    ],
  });
}

function nowFullText(): string {
  const dt = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

/** 升级到飞书项目入口：所有工单均开放（不再限消费者BG） */
const feishuEligible = computed(() => true);

/** 转售后上下文：投诉分流 + 客户/产品预填 + 已有关联售后单（有关联则封口，按是否结案给不同提示） */
const aftersaleContext = computed(() => ({
  isComplaint: d.value.type === '投诉',
  customerName: d.value.customer.name,
  customerPhone: d.value.customer.contacts.find((c) => c.type === 'phone')?.value ?? '',
  region: d.value.customer.region,
  address: d.value.customer.address,
  productCategory: d.value.product.category,
  productName: d.value.product.name,
  sn: d.value.product.sn,
  existing: d.value.linkedAftersale
    ? {
        no: d.value.linkedAftersale.no,
        title: d.value.linkedAftersale.title,
        serviceType: d.value.linkedAftersale.serviceType,
        status: d.value.linkedAftersale.status,
        settled: isAftersaleSettled(d.value.linkedAftersale.status),
      }
    : undefined,
}));

function isFeishuEscalate(payload: Record<string, unknown>): boolean {
  if (payload.type !== '升级') return false;
  const data = payload.data as { channel?: string } | undefined;
  return data?.channel === FEISHU_ESCALATE_CHANNEL;
}

// 工单处理 Tab 参与变更登记的字段（键 + 展示名）
const PROCESS_FIELDS: { key: keyof ProcessFormDraft; label: string }[] = [
  { key: 'problemCause', label: '问题原因' },
  { key: 'processResult', label: '处理结果' },
  { key: 'serviceType', label: '服务类型' },
  { key: 'serviceMethod', label: '服务方式' },
  { key: 'conclusion', label: '问题解决结论' },
  { key: 'serviceSolution', label: '解决方案' },
  { key: 'leadNo', label: '商机编号' },
  { key: 'closingNote', label: '结案后备注' },
];

/** 处理表单快照（含各字段值 + 附件数），作为变更 diff 的基线 */
function snapshotProcess(): Record<string, string> {
  const f = form.value;
  const snap: Record<string, string> = {};
  for (const { key } of PROCESS_FIELDS) snap[key] = String(f[key] ?? '').trim();
  snap.__att = String([...(f.processResultAttachments ?? []), ...(f.problemCauseAttachments ?? [])].length);
  return snap;
}

let processBaseline: Record<string, string> = snapshotProcess();
/**
 * 「风险等级」字段的**独立基线**（不并进 `processBaseline`）。
 *
 * 【为什么单开一份】① 它**不进 `PROCESS_FIELDS`** —— 那张表是「工单处理」类履历的字段级 diff，
 * 风险等级的去处是**第八类**，混进去会让同一次变更在两类里各记一遍；
 * ② `processBaseline` 只在**产出了处理登记时**才刷新（`if (log)`），而只改了风险等级、
 * 别的字段一字未动那一次拿不到 `log` —— 共用一份基线的话，此后每次保存都会重复落一条 ⑤。
 */
let riskLevelBaseline: ProcessFormDraft['riskLevel'] = form.value.riskLevel;
// 切工单/类型（表单重建）后重置基线
watch(ticketNo, () => {
  processBaseline = snapshotProcess();
  riskLevelBaseline = form.value.riskLevel;
});

/**
 * 第八类 ⑤「风险等级变更」的**第二个上游 —— 坐席在工单侧填写**（《【720】》§4.4 ⑤：
 * "核实结论回传，**或坐席在工单侧填写**"）。第一个上游（打标回传）落在
 * `stores/riskQueue.ts` 的 `recordTag` 里，两条上游写的是同一种行文、只是 `source` 不同。
 *
 * 三道门，缺一条就会记出假账：
 *   ① **值真的变了才写**（§6 采集 ⑤ 原话）—— 每次保存都写的话，这一类会被同一个值刷屏；
 *   ② **被「工单侧优先」写进去的那一格不算坐席填的** —— 命中核实的回传会往这个字段落笔
 *      （见 `riskWriteBack`），那一次的履历早已由打标那一侧以「核实结论回传」落过，
 *      在这里再记一条「坐席在工单侧填写」就是**把系统写的字记到人头上**；
 *   ③ **基线无论写不写都要推进** —— 否则被 ② 挡住的那次会在下一次保存时又被判成变更。
 */
function recordAgentRiskLevelChange() {
  const cur = form.value.riskLevel;
  const prev = riskLevelBaseline;
  riskLevelBaseline = cur;
  if (cur === prev) return;
  if (cur && cur === riskWriteBack.value.level) return;
  riskHistory.recordRiskHistory({
    kind: 'grade',
    ticketNo: ticketNo.value,
    by: user.name || '当前用户',
    byRole: user.role.name || '二线专员',
    at: riskNowStamp(),
    from: prev || null,
    to: cur || null,
    source: '坐席在工单侧填写',
  });
}

/** 保存并登记：对处理字段做前后 diff，产出「补充/修改」变更（无变更则不登记） */
function buildProcessLog() {
  const f = form.value;
  const changes: import('./types/ticketDetail').TimelineFieldChange[] = [];
  for (const { key, label } of PROCESS_FIELDS) {
    const before = (processBaseline[key] ?? '').trim();
    const after = String(f[key] ?? '').trim();
    if (before === after) continue;
    if (!after) {
      // 终态可编辑的两个字段清空也要留痕；其余字段沿用「清空不登记」
      if ((POST_CLOSE_EDITABLE_FIELDS as readonly string[]).includes(key)) {
        changes.push({ field: label, kind: '修改', from: before, to: '（已清空）' });
      }
      continue;
    }
    changes.push(before ? { field: label, kind: '修改', from: before, to: after } : { field: label, kind: '补充', to: after });
  }
  const attArr = [...(f.processResultAttachments ?? []), ...(f.problemCauseAttachments ?? [])];
  const attAdded = attArr.length - Number(processBaseline.__att ?? '0');
  if (attAdded > 0) changes.push({ field: '附件', kind: '补充', to: `新增 ${attAdded} 个（${attArr[attArr.length - 1]}）` });
  if (!changes.length) return undefined;
  const add = changes.filter((c) => c.kind === '补充').length;
  const mod = changes.filter((c) => c.kind === '修改').length;
  const seg: string[] = [];
  if (add) seg.push(`补充 ${add} 项`);
  if (mod) seg.push(`修改 ${mod} 项`);
  return {
    summary: `登记处理进展（${seg.join('，')}）`,
    attachment: attAdded > 0 ? attArr[attArr.length - 1] : undefined,
    changes,
  };
}

function onAction(payload: Record<string, unknown>) {
  if (payload.type === '保存草稿') {
    const log = buildProcessLog();
    if (log?.changes?.some((c) => c.field === '结案后备注')) {
      form.value = {
        ...form.value,
        closingNoteUpdatedBy: user.name || '当前坐席',
        closingNoteUpdatedAt: riskNowStamp(),
      };
    }
    if (postClose.value) {
      // 终态只有商机编号 / 结案后备注可改：每次提交单独记一条「结案后补充」
      if (!postCloseEditable.value) return;
      if (!log) {
        message.info('内容未变更，无需保存');
        return;
      }
      pushEntry(timeline.value, {
        category: 'handle', action: 'handle', who: user.name || '当前坐席', role: mapUserRole(user.roleKey),
        how: '结案后补充',
        what: `更新${[...new Set(log.changes.map((c) => c.field))].join('、')}`,
        changes: log.changes,
      });
      processBaseline = snapshotProcess();
      message.success('已保存，变更已记入处理履历');
      return;
    }
    dispatch({ type: '保存草稿', process: log });
    // 风险等级落第八类、不落「工单处理」的字段 diff，故与 log 分开走，见 `recordAgentRiskLevelChange`
    recordAgentRiskLevelChange();
    if (log) processBaseline = snapshotProcess(); // 登记后更新基线，下次 diff 以此为准
    return;
  }
  const toFeishu = isFeishuEscalate(payload);
  dispatch(payload);
  if (toFeishu) {
    processTabsRef.value?.switchTab('feishu');
  }
  if (payload.type === '转售后') syncAftersaleRelatedCard();
}

/**
 * 把 1:1 关联售后单同步进「关联单」列表（售后来源卡片，点击打开售后工单详情）。
 * 转售后后调用，工单本身就带关联单（如「已转出」态）时于载入后调用。
 * @param focus 是否切到关联单 Tab——转售后是动作反馈要切，载入时不抢用户视线
 */
function syncAftersaleRelatedCard(focus = true) {
  const la = d.value.linkedAftersale;
  if (!la) return;
  const cards = tabData.value.relatedTickets;
  const existed = cards.find((c) => c.no === la.no);
  const card = {
    no: la.no,
    title: `${la.serviceType} · ${d.value.product.name}`,
    status: la.status,
    statusColor: '#1a6fff',
    type: la.serviceType,
    typeColor: '#0EA5A4',
    createdAt: la.createdAt,
    createdAtFull: la.createdAt,
    builder: '售后系统',
    demand: d.value.demand,
    source: '售后' as const,
    externalLink: true,
  };
  if (existed) Object.assign(existed, card);
  else cards.unshift(card);
  syncAftersaleHistoryRow();
  if (focus) processTabsRef.value?.switchTab('related');
}

/**
 * 把 1:1 关联售后单同步进「客户历史工单」列表（D10）。
 * 售后单是该客户名下的一段独立服务处理，**独立成行计入总数、不去重**；
 * channel='售后' 即来源标记，现有筛选（处理中/已关闭/投诉）自动覆盖。
 */
function syncAftersaleHistoryRow() {
  const la = d.value.linkedAftersale;
  if (!la) return;
  const hist = tabData.value.customerHistory;
  if (hist.tickets.some((t) => t.no === la.no)) return;
  const processing = !isAftersaleSettled(la.status);
  hist.tickets.unshift({
    id: `h-${la.no}`,
    no: la.no,
    title: `${la.serviceType} · ${d.value.product.name}`,
    status: la.status,
    statusColor: processing ? '#1A6FFF' : '#10B981',
    type: la.serviceType,
    typeColor: '#0EA5A4',
    typeBgColor: '#0EA5A41F',
    channel: '售后',
    date: la.createdAt.slice(0, 10),
    summary: d.value.demand,
    isProcessing: processing,
    isClosed: !processing,
    isComplaint: false,
  });
  hist.totalCount += 1;
  if (processing) hist.processingCount += 1;
  else hist.closedCount += 1;
}

// 工单本身带关联售后单（「已转出」态）：载入即把售后单挂进关联单列表与客户历史，
// 否则坐席在冻结的底栏之外找不到那张在跑的售后单。
watch(
  () => d.value.linkedAftersale?.no,
  (no) => { if (no) syncAftersaleRelatedCard(false); },
  { immediate: true },
);

/** 产研反馈 Tab · 二次激活 */
function onFeishuActivate(reason: string) {
  dispatch({ type: '激活飞书', data: { reason } });
}

/** 产研反馈 Tab · 关联失败后重新发起升级 */
function onFeishuRetry() {
  actionBarRef.value?.openEscalate();
}

function toast(name: string) {
  message.info(`「${name}」`);
}

function formatNow() {
  const n = new Date();
  const hh = String(n.getHours()).padStart(2, '0');
  const mm = String(n.getMinutes()).padStart(2, '0');
  const ss = String(n.getSeconds()).padStart(2, '0');
  return `今天 ${hh}:${mm}:${ss}`;
}

function onIncomingTicketEvent(
  type: TicketLiveEventType,
  content: string,
  who: string,
  options?: { supplementType?: string; notify?: boolean },
) {
  const when = formatNow();
  const recordId = `${type === 'urge' ? 'd' : 's'}-${Date.now()}`;
  if (type === 'urge') {
    tabData.value.dunningRecords.unshift({
      id: recordId,
      who,
      when,
      content,
      read: false,
      contacted: false,
    });
    d.value.insight.dunningCount += 1;
  } else {
    tabData.value.supplementRecords.unshift({
      id: recordId,
      who,
      when,
      supplementType: options?.supplementType ?? '问题描述补充',
      content,
      read: false,
      contacted: false,
    });
    d.value.insight.supplementCount += 1;
  }

  // 两处都要落记录（PRD-915 补充与催单 §5.4 / §6.2、《【720】工单处理履历》§6）：
  // 「关联/补充/催单」Tab 记录（上面）**与**「处理履历」时间线条目（下面），缺一不可。
  pushEntry(timeline.value, {
    category: type === 'urge' ? 'dunning' : 'customer',
    action: type === 'urge' ? 'dunning' : 'supplement',
    who,
    role: mapUserRole(user.roleKey),
    how: type === 'urge' ? '客户催单' : '客户补充',
    when,
    what: content,
    ...(type === 'urge' ? { dunningTimes: d.value.insight.dunningCount } : {}),
  });

  if (options?.notify !== false && pageActive.value) {
    pushLiveToast(type, content, who, when, options?.supplementType, recordId);
  }
}

/** 标记催单/补充为已知晓，并同步统计宫格计数 */
function markRecordAcknowledged(rec: { read?: boolean }, isDunning: boolean) {
  if (rec.read) return;
  rec.read = true;
  const ins = d.value.insight;
  if (isDunning) ins.dunningReadCount = (ins.dunningReadCount ?? 0) + 1;
  else ins.supplementReadCount = (ins.supplementReadCount ?? 0) + 1;
}

/** 对客联系后自动置已联系，并连带已知晓（PRD §10.1） */
function syncContactedAfterOutreach() {
  let touchedDunning = false;
  let touchedSupplement = false;
  for (const rec of tabData.value.dunningRecords) {
    if (!rec.contacted) {
      rec.contacted = true;
      markRecordAcknowledged(rec, true);
      touchedDunning = true;
    }
  }
  for (const rec of tabData.value.supplementRecords) {
    if (!rec.contacted) {
      rec.contacted = true;
      markRecordAcknowledged(rec, false);
      touchedSupplement = true;
    }
  }
  // 操作页内的记录置了还不够 —— 列表行的标记也要同步，否则列表 Tag 永远停在「待回」强调态、
  // 「催补待回」永远不出列（PRD-915 补充与催单 §9.2 / §10.1）。
  const row = TICKETS.find((x) => x.no === d.value.no);
  if (row && (touchedDunning || touchedSupplement)) {
    row.contactedAfterUrge = true;
    if (touchedDunning) { row.dunningContacted = true; row.dunningUnread = false; }
    if (touchedSupplement) { row.supplementContacted = true; row.supplementUnread = false; }
  }
}

function onMarkRecordRead(id: string) {
  const dRec = tabData.value.dunningRecords.find((r) => r.id === id);
  const rec = dRec ?? tabData.value.supplementRecords.find((r) => r.id === id);
  if (!rec || rec.read) return;
  markRecordAcknowledged(rec, !!dRec);
  syncUnreadToListRow();
}

/**
 * 该侧记录全部已知晓时，把列表行的「未知晓」标记置掉 —— Tag 靠它转降噪灰。
 * 只影响 Tag：「催补待回」出列另认 contactedAfterUrge（§10.1）。
 */
function syncUnreadToListRow() {
  const row = TICKETS.find((x) => x.no === d.value.no);
  if (!row) return;
  if (tabData.value.dunningRecords.every((r) => r.read)) row.dunningUnread = false;
  if (tabData.value.supplementRecords.every((r) => r.read)) row.supplementUnread = false;
}

function onToastMarkRead(item: TicketLiveToast) {
  if (item.recordId) onMarkRecordRead(item.recordId);
  dismissLiveToast(item.id);
}

function onLiveToastClick() {
  processTabsRef.value?.switchTab('related');
}

/** 原型演示：刷新后每 5 秒推送 1 条，共 3 条后停止（联调前替代 WebSocket） */
const DEMO_MAX_COUNT = 3;
const DEMO_INTERVAL_MS = 5_000;
let incomingDemoInterval: ReturnType<typeof setInterval> | null = null;
let incomingDemoTimeout: ReturnType<typeof setTimeout> | null = null;
let demoFiredCount = 0;

const DEMO_INCOMING_EVENTS: Array<{
  type: TicketLiveEventType;
  content: string;
  supplementType?: string;
}> = [
  { type: 'supplement', content: '设备插电后指示灯不亮,疑似主板供电模块故障', supplementType: '问题描述补充' },
  { type: 'urge', content: '要求今日内安排上门处理' },
  { type: 'supplement', content: '客户补充：已尝试更换电源线，问题依旧', supplementType: '问题描述补充' },
];

function stopIncomingDemo() {
  if (incomingDemoInterval) {
    clearInterval(incomingDemoInterval);
    incomingDemoInterval = null;
  }
  if (incomingDemoTimeout) {
    clearTimeout(incomingDemoTimeout);
    incomingDemoTimeout = null;
  }
}

function fireDemoEvent() {
  const item = DEMO_INCOMING_EVENTS[demoFiredCount % DEMO_INCOMING_EVENTS.length];
  const who = MOCK_FIRST_LINE_AGENTS[demoFiredCount % MOCK_FIRST_LINE_AGENTS.length];
  onIncomingTicketEvent(item.type, item.content, who, {
    supplementType: item.supplementType,
  });
  demoFiredCount += 1;
  if (demoFiredCount >= DEMO_MAX_COUNT) {
    stopIncomingDemo();
  }
}

function startIncomingDemo() {
  stopIncomingDemo();
  if (demoFiredCount >= DEMO_MAX_COUNT) return;

  incomingDemoTimeout = setTimeout(() => {
    incomingDemoTimeout = null;
    if (!pageActive.value || demoFiredCount >= DEMO_MAX_COUNT) return;
    fireDemoEvent();
    if (demoFiredCount < DEMO_MAX_COUNT) {
      incomingDemoInterval = setInterval(() => {
        if (!pageActive.value) return;
        fireDemoEvent();
      }, DEMO_INTERVAL_MS);
    }
  }, DEMO_INTERVAL_MS);
}

function pauseLiveNotify() {
  pageActive.value = false;
  stopIncomingDemo();
  dismissAllLiveToasts();
}

function resumeLiveNotify() {
  pageActive.value = true;
  startIncomingDemo();
}

watch(ticketNo, () => {
  demoFiredCount = 0;
  if (pageActive.value) startIncomingDemo();
});

onActivated(() => {
  resumeLiveNotify();
});

onDeactivated(() => {
  pauseLiveNotify();
});

onBeforeUnmount(() => {
  pauseLiveNotify();
});

/**
 * 客户侧催补落单后的**共同副作用**（PRD-915 补充与催单 §7.2 拉回 + §9 计数标识）。
 * 新建补充与催单都走这里 —— 两者副作用一致，差别只在记录去向与文案。
 *
 * 做三件事：
 * 1. **拉回处理节点**：调研中→撤回本次下送 / 审核中4态→撤回本次申请 / 已挂起→解除挂起，
 *    都回「处理中」，并写一条履历说明原因（不写的话坐席看不出状态为什么自己变了）。
 *    两个已升级态 / 已委派 / 已转出**不拉回**。
 * 2. **置行内 Tag 与催补待回标记**：hasDunning / hasSupplement 供列表行标识；
 *    contactedAfterUrge 复位为 false —— 新的一次催补必须重新联系一次才算回应。
 * 3. **SLA 不动**：解决钟接着跑、不重置不回拨（反复催单不能刷新时效），故此处不碰 SLA。
 */
function applyCsEventSideEffects(kind: 'supplement' | 'urge') {
  // ① 拉回
  const pull = pullbackOnCsEvent(d.value.status as TicketStatus);
  if (pull) {
    const from = d.value.status;
    d.value.status = pull.to;
    pushEntry(timeline.value, {
      category: 'node',
      action: 'handle',
      who: '系统',
      role: '系统',
      how: pull.why,
      what: `${pull.why}：${from} → ${pull.to}。SLA 解决钟接着跑，不重置。`,
    });
  }
  // ② 行内 Tag + 催补待回：新的一次催补 → 复位为「未联系」
  const row = TICKETS.find((t) => t.no === d.value.no);
  if (row) {
    // 新的一次催补 → 该侧重新回到「待回」：hasXxx 置上、对应的"已联系"复位。
    // 只复位这一侧 —— 另一侧若早已联系过，不该被这次事件拖回待回态。
    if (kind === 'urge') {
      row.hasDunning = true;
      row.dunningContacted = false;
      row.dunningUnread = true;
    } else {
      row.hasSupplement = true;
      row.supplementContacted = false;
      row.supplementUnread = true;
    }
    row.contactedAfterUrge = false;
  }
}

function onSupplementSubmit(payload: {
  supplementType: string;
  content: string;
  attachments: string[];
  complaintCategories?: { cat1: string; cat2: string }[];
  complaintChannels?: { platform: string; complaintNo: string; complaintContent: string }[];
}) {
  onIncomingTicketEvent('supplement', payload.content, formatTicketRecordWho(user.name, user.roleKey), {
    supplementType: payload.supplementType,
    notify: false,
  });
  const record = tabData.value.supplementRecords[0];
  if (record && payload.attachments.length) {
    record.attachments = payload.attachments;
  }

  // 「补充投诉信息」的两项补录：投诉分类只追加一组，投诉渠道记录逐条追加。
  // 都是**只追加、不覆盖**——原有记录一条不动（PRD-915 补充与催单 §5.3）。
  if (payload.complaintCategories?.length) {
    d.value.complaint.categories = [
      ...d.value.complaint.categories,
      ...payload.complaintCategories,
    ];
  }
  if (payload.complaintChannels?.length) {
    d.value.complaint.platforms = [
      ...d.value.complaint.platforms,
      ...payload.complaintChannels.map((c) => ({
        platform: c.platform,
        complaintNo: c.complaintNo,
        complaintContent: c.complaintContent,
        fromSupplement: true,
      })),
    ];
  }

  applyCsEventSideEffects('supplement');
  processTabsRef.value?.switchTab('related');
  message.success(
    payload.complaintChannels?.length
      ? `补充信息已提交，已追加 ${payload.complaintChannels.length} 条投诉渠道记录`
      : '补充信息已提交',
  );
}

function onDunningSubmit(payload: { content: string; attachments: string[] }) {
  const who = formatTicketRecordWho(user.name, user.roleKey);
  onIncomingTicketEvent('urge', payload.content, who, { notify: false });
  const record = tabData.value.dunningRecords[0];
  if (record && payload.attachments.length) {
    record.attachments = payload.attachments;
  }
  // 已关联产研反馈：与「关联/补充/催单」同步写一条到产研反馈时间线
  const sync = d.value.feishuSync;
  if (sync && sync !== 'none' && sync !== 'failed') {
    const when = record?.when ?? formatNow();
    d.value.feishuRecords = [
      ...(d.value.feishuRecords ?? []),
      {
        id: `fs-dunning-${Date.now()}`,
        kind: 'dunning',
        title: '催单 · 请产研尽快跟进',
        content: payload.content || '坐席发起催单',
        who,
        side: '客服工单',
        when,
        meta: '催单',
      },
    ];
  }
  processTabsRef.value?.switchTab('related');
  applyCsEventSideEffects('urge');
  message.success('催单信息已提交');
}

function formatCancelReason(reason: string, remark: string) {
  return remark ? `${reason}：${remark}` : reason;
}

function onCancelSubmit(payload: { reason: string; remark: string }) {
  dispatch({ type: '取消工单', reason: formatCancelReason(payload.reason, payload.remark) });
}

/**
 * 原单已终态（含升级投诉后的关闭）时，补充/催单不能直接落在原单上——
 * 按《【815】关联投诉 PRD》§5.2：基于原单建新单（新单号）+ 新单关联原单，再在新单上补充/催单。
 * @returns true = 已接管本次点击（走建新单），调用方不再打开原单弹窗
 */
function confirmCarryOnNewTicket(kind: '补充' | '催单'): boolean {
  if (!isTicketTerminated(d.value.status)) return false;
  // 因**升级**而关闭 → 业务在新单上，引导过去，不再建第三张单（Zendesk 合并口径）
  if (supersededBy.value) {
    const target = supersededBy.value;
    Modal.confirm({
      title: `本单已升级为 ${target.no}`,
      content: `${kind}信息应落在新单上，避免落到已作废的旧单。是否前往新单？`,
      okText: '前往新单',
      cancelText: '取消',
      onOk: () => openRelation(target),
    });
    return true;
  }
  Modal.confirm({
    title: `原单已${d.value.status}，无法直接${kind}`,
    content: `将基于原单 ${d.value.no} 新建工单（新单号）并关联原单，${kind}信息落在新单上。是否继续？`,
    okText: '基于原单建新单',
    cancelText: '取消',
    onOk: () => openReopenCreate(),
  });
  return true;
}

function onHeaderAction(name: string) {
  switch (name) {
    case '升级投诉': // 非投诉→建单页；投诉单→小弹窗（《【815】关联投诉 PRD》§4.2）
      // 基线 ※8a：二线第一跳的自主发起权已收回，改走风险报备。
      // 拦在这里而不是把按钮藏掉——藏掉只会让坐席以为入口没了，不知道该改走哪条路。
      if (escalateReportFirstTip.value) {
        message.warning(escalateReportFirstTip.value);
        // 本单给了「风险报备」入口时顺手带到那个 Tab，少一次自己找
        if (showRiskReport.value) processTabsRef.value?.switchTab('risk');
        return;
      }
      openEscalate();
      break;
    case '关联售后': // 投诉工单：打开售后建单弹窗
      actionBarRef.value?.openAftersale();
      break;
    case '新建补充':
      if (confirmCarryOnNewTicket('补充')) return;
      supplementModalOpen.value = true;
      break;
    case '催单':
      if (confirmCarryOnNewTicket('催单')) return;
      dunningModalOpen.value = true;
      break;
    case '取消工单':
      cancelModalOpen.value = true;
      break;
    default:
      toast(name);
  }
}

function updateForm(next: ProcessFormDraft) {
  form.value = next;
}

function updateTabData(next: OperationTabData) {
  tabData.value = next;
}

/** 处理表单 / 技术支持「处理结果」→ 速览带「最新处理」及时回写 */
function syncLatestHandlingFromDrafts() {
  d.value.latestHandling = mergeDraftIntoLatestHandling(d.value.latestHandling, {
    processResult: form.value.processResult,
    techProcessResult: tabData.value.techDraft.processResult,
    processWho: user.name || '当前坐席',
    processRole: mapUserRole(user.roleKey),
    techWho: '技术支持',
  });
  // 同步列表行预览文案
  const listTicket = TICKETS.find((t) => t.no === d.value.no);
  if (listTicket) {
    listTicket.latestHandling = d.value.latestHandling[0]?.text ?? '';
  }
}

watch(
  [
    () => form.value.processResult,
    () => tabData.value.techDraft.processResult,
    () => d.value.no,
  ],
  () => syncLatestHandlingFromDrafts(),
  { immediate: true },
);
</script>

<template>
  <div class="op-page">
    <OpHeader
      :detail="d"
      :ticket-no="ticketNo"
      :readonly="pageReadonly"
      :can-supplement="canSupplement"
      :can-dunning="canDunning"
      :can-escalate-complaint="canEscalateComplaint"
      :can-link-aftersale="canLinkAftersale"
      :can-cancel-ticket="canCancelTicket"
      :customer-entry-locked="customerEntryLocked"
      :superseded-by="supersededBy"
      @action="onHeaderAction"
      @open-relation="openRelation"
      @open-superseded="supersededBy && openRelation(supersededBy)"
    />

    <!--
      「报备中」横幅：报备不落子状态（※29），工单本身看不出任何变化，
      故必须在头部把"报上去了、还没有结论"这件事明说，否则会被当成没报成功而重复报。
      点「查看报备」直达「风险监控」Tab，横幅上不重复展示报备正文。

      【为什么是一行细文本而不是色块】提示重心已移到「风险报备」Tab 上的状态圆点——
      那里才是这件事的去处。横幅退为一行辅助信息：只交代"报上去了、等了多久"，
      不再用整条橙底抢走页面的第一注意力（它并不比工单本身的处理更急）。
      「评估期间本单照常处理，SLA 不停表」是一次性的口径说明，看第二遍就是噪音，
      收进 title 里 —— 需要时 hover 可得，口径不丢。
    -->
    <div
      v-if="riskReportBanner"
      class="risk-report-banner"
      :class="{ overdue: riskReportBanner.overdue }"
      title="评估期间本单照常处理，SLA 不停表"
    >
      <span class="rrb-dot" aria-hidden="true"></span>
      <span class="rrb-text">{{ riskReportBanner.text }}</span>
      <span v-if="riskReportBanner.overdue" class="rrb-overdue">已超处置时限</span>
      <button type="button" class="rrb-link" @click="processTabsRef?.switchTab('risk')">
        查看报备
      </button>
    </div>

    <!--
      风险打标结论条（《【930】》§5A.3「可见性」）：**二线处理人可见**，一线不可见。
      与上面那条报备横幅是两件事，故各占一行 —— 报备答"我报上去的那条评没评"，
      这一条答"监控侧把这张单判成了几档"，同一张单可能只有其中一件、也可能两件都有。
      处置备注挂在 title 里：它是打标人写给处理人的话，需要时 hover 可得，不占页头两行。
    -->
    <div
      v-if="riskTagBanner"
      class="risk-report-banner risk-tag-banner"
      :class="{ high: riskTagBanner.high }"
      :title="riskTagBanner.note"
    >
      <span class="rrb-dot" aria-hidden="true"></span>
      <span class="rrb-text">{{ riskTagBanner.text }}</span>
      <span v-if="riskTagBanner.poolText" class="rrb-pool">{{ riskTagBanner.poolText }}</span>
      <button type="button" class="rrb-link" @click="processTabsRef?.switchTab('risk')">
        查看打标
      </button>
    </div>

    <!--
      建议标记（《【930】》§3.3）：协同处理挂上来的正交标记，装历次勾选的建议事项。
      **状态不变、处理人不变**，它不是子状态、不进动作矩阵判据 —— 摆在页头是因为
      这几项恰恰是"接下来要处理人做的事"，收在 Tab 里等于让人自己去翻。人不直接摘，
      工单进终态时随页头一起消失。
    -->
    <div v-if="riskAdviceMarks.length" class="risk-report-banner risk-advice-banner">
      <span class="rrb-text">协同建议</span>
      <span v-for="a in riskAdviceMarks" :key="a" class="rrb-advice">{{ a }}</span>
      <button type="button" class="rrb-link" @click="processTabsRef?.switchTab('risk')">
        查看协同记录
      </button>
    </div>

    <!-- 顶部通栏速览带：客户诉求 | 客户全景宫格 | 最新处理（关注信息一屏） -->
    <div class="op-overview-wrap" :class="{ elevated: overviewExpanded }">
      <OpOverviewBand :detail="d" @select="onOverviewSelect" @expand-change="overviewExpanded = $event">
        <template #live-notify>
          <TicketEventToastStack
            v-if="pageActive"
            embedded
            :items="liveToasts"
            @dismiss="dismissLiveToast"
            @click="onLiveToastClick"
            @mark-read="onToastMarkRead"
          />
        </template>
      </OpOverviewBand>
    </div>

    <div class="op-body">
      <div class="op-main">
        <OpProcessTabs
          ref="processTabsRef"
          :detail="d"
          :ticket-no="ticketNo"
          :tab-data="tabData"
          :form="form"
          :risk-verification="riskMonitorVerify"
          :timeline="timeline"
          :expanded-sections="expandedSections"
          :active-chip="activeChip"
          :filled-supplement-count="filledSupplementCount"
          :tab-dots="processTabDots"
          :readonly="tabsReadonly"
          :post-close="postClose"
          :post-close-editable="postCloseEditable"          @toggle-section="toggleSection"
          @select-chip="selectChip"
          @update:form="updateForm"
          @update:tab-data="updateTabData"
          @open-child-create="openChildCreate"
          @open-reopen-create="openReopenCreate"
          @mark-read="onMarkRecordRead"
          @feishu-activate="onFeishuActivate"
          @feishu-retry="onFeishuRetry"
          @dunning="dunningModalOpen = true"
        />
      </div>

      <OpSidePanel
        :detail="d"
        :ticket-id="ticketNo"
        @contact="onContact"
        @action="toast"
      />
    </div>

    <!--
      一线视角演示单：隐藏底部流转操作栏（下送/升级/调剂/委派/挂起/关闭/强结属二线权限）。
      组件本身仍挂载——头部「关联售后」等动作复用它内部的弹窗。
    -->
    <OpActionBar
      ref="actionBarRef"
      :hide-bar="hideActionBar"
      :save-only="postCloseEditable"
      :ticket-no="ticketNo"
      :ticket-title="d.title"
      :ticket-type="d.type"
      :closure-mode="d.closureMode"
      :after-sale-enabled="d.product.afterSaleEnabled"
      :op-state="opState"
      :suspend-info="suspendInfo"
      :draft-saved-at="draftSavedAt"
      :return-count="d.returnCount ?? 0"
      :feishu-eligible="feishuEligible"
      :feishu-sync="d.feishuSync"
      :aftersale-context="aftersaleContext"
      :aftersale-inbound="isAftersaleInbound(d)"
      :service-type="form.serviceType"
      :service-method="form.serviceMethod"
      :problem-cause="form.problemCause"
      :process-result="form.processResult"
      :delegate-targets="d.delegateInfo?.targets"
      :at-tech-support="atTechSupport"
      :show-risk-report="showRiskReport"
      :risk-report-pending="riskReportPending"
      :risk-forbidden-tip="riskForbiddenTip"
      @action="onAction"
      @cancel="cancelModalOpen = true"
      @withdraw="confirmWithdraw"
      @transfer-ticket="openChildCreate"
      @risk-report="onRiskReport"
    />

    <CreateTicketModal
      v-model:open="createOpen"
      :prefill="createPrefill"
      @created="onTicketCreated"
    />

    <OpStatDetailModal
      :open="statModalKey !== null"
      :table="statTable"
      :width="statModalWidth"
      :view-all-label="statViewAllLabel"
      @update:open="(v) => { if (!v) statModalKey = null; }"
      @open-ticket="onStatOpenTicket"
      @view-all="onStatViewAll"
    />

    <OpSupplementModal
      v-model:open="supplementModalOpen"
      :ticket-type="d.type"
      :complaint-type="d.complaint.complaintType"
      :ticket-source="d.source"
      :existing-platforms="d.complaint.platforms"
      :existing-categories="d.complaint.categories"
      :is-external-appeal="d.isExternalAppeal"
      @submit="onSupplementSubmit"
    />

    <OpDunningModal
      v-model:open="dunningModalOpen"
      @submit="onDunningSubmit"
    />

    <OpCancelModal
      v-model:open="cancelModalOpen"
      @submit="onCancelSubmit"
    />

    <OpEscalateComplaintModal
      v-model:open="escalateModalOpen"
      :detail="d"
      @submit="onEscalateSubmit"
    />

    <OpSmsModal
      v-model:open="smsModalOpen"
      :phone="smsPhone"
      :ctx="notifyCtx"
      @submit="onSmsSubmit"
    />

    <OpEmailModal
      v-model:open="emailModalOpen"
      :email="emailTo"
      :ctx="notifyCtx"
      @submit="onEmailSubmit"
    />

  </div>
</template>

<style scoped>
/* 填满外壳滚动容器，头部 + 速览带常驻，主体区独立滚动 → 关注信息一屏 */
.op-page {
  --op-block-gap: 12px;
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  background: #f9fafb;
}
.op-overview-wrap {
  flex: none;
  padding: 10px 20px 0;
  position: relative;
  z-index: 1;
}
/*
  报备中横幅：一行细文本，不是色块 —— 无底色、无边框、无圆角，只用一枚 6px 圆点带状态色
  （橙＝在队等结论，红＝已超处置时限），与「风险报备」Tab 上的圆点同一套色。
  高度压到 22px 上下，让位给下方的速览带：那里才是坐席处理这张单要看的东西。
*/
.risk-report-banner {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 6px 20px 0;
  padding: 2px 12px;
  font-size: 12px;
}
.rrb-dot {
  width: 6px; height: 6px; border-radius: 50%; flex: none;
  background: #f97316;
}
.risk-report-banner.overdue .rrb-dot { background: #dc2626; }
.rrb-text { font-weight: 600; color: #4b5563; }
/* 超时是唯一需要"喊"一声的态：主文案转红，配合右侧红标签 */
.risk-report-banner.overdue .rrb-text { color: #b91c1c; }
.rrb-overdue {
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 600;
  color: #b91c1c;
  background: #fee2e2;
  border-radius: 4px;
}
.rrb-link {
  margin-left: auto;
  padding: 0;
  font-size: 12px;
  font-family: inherit;
  color: #1a6fff;
  background: none;
  border: none;
  cursor: pointer;
}
.rrb-link:hover { text-decoration: underline; }
/* 打标条：与报备条同一副骨架，只换点色 —— 蓝＝已有结论（不催人），高危转红 */
.risk-tag-banner .rrb-dot { background: #2563eb; }
.risk-tag-banner.high .rrb-dot { background: #dc2626; }
.risk-tag-banner.high .rrb-text { color: #b91c1c; }
.rrb-pool { font-size: 11px; color: #9ca3af; }
/* 建议标记：一排小标，不带点 —— 它不是"等结论"的状态，是"要去做"的清单 */
.risk-advice-banner .rrb-text { color: #9a3412; }
.rrb-advice {
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #9a3412;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 999px;
}
.op-overview-wrap.elevated { z-index: 50; }
.op-body {
  display: flex;
  gap: var(--op-block-gap);
  padding: 10px 20px 12px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}
.op-main {
  flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column;
}
</style>
