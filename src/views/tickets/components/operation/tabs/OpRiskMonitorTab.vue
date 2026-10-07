<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  ContainerOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  CheckOutlined,
  PaperClipOutlined,
  RollbackOutlined,
  UserOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons-vue';
import OpCollapsibleSection from '../OpCollapsibleSection.vue';
import { riskLevelText } from '@/config/risk';
import type { RiskTagEntry, TicketRiskVerification } from '@/stores/riskTags';
import type { RiskMonitorDraft } from '@/views/tickets/types/operationTabs';
import type { ProcessFormDraft } from '@/views/tickets/types/operation';
// 本单的报备读口在 B 线自己的 store 里；行类型取合并池的行（同一张单上还可能有
// A 线自动入池的条目，见 riskReports.ts 的 `reportsOf` 说明）。
import { useRiskReportStore } from '@/stores/riskReports';
import { useRiskQueueStore } from '@/stores/riskQueue';
import { poolStageStatusOf } from '@/stores/riskPool';
import {
  isOpenStatus,
  isPooledStatus,
  type AssessDecision,
  type ReportAssessment,
  type RiskPoolItem,
} from '@/stores/riskShared';
import OpActionModal from '../OpActionModal.vue';
import { useUserStore } from '@/stores/user';
import { useRiskCollabStore } from '@/stores/riskCollab';
import { resolveTicketTypeFor } from '@/views/tickets/composables/opActions';
import { canTagRiskOnTicketPage } from '@/views/tickets/composables/opActionRegistry';
import {
  adviceLabelOf,
  decisionText,
  isEscalateDecision,
  poolStatusText,
} from '../OpRiskDecision';

const props = defineProps<{
  ticketNo: string;
  draft: RiskMonitorDraft;
  form: ProcessFormDraft;
  riskVerification?: TicketRiskVerification | null;
  readonly?: boolean;
  /** 底栏「风险报备」形态按钮出不出（工单页 `showRiskReport` 的报备形态）：空态里指向底栏的那句随它 */
  reportEntryVisible?: boolean;
}>();

const user = useUserStore();
const reportStore = useRiskReportStore();
const queue = useRiskQueueStore();
const collab = useRiskCollabStore();
const router = useRouter();

/*
 * 本 Tab 只承载"读"：报备与评估的结论文案走本页这一份（`../OpRiskDecision`）。
 * 基线 v1.23 已把「接管」整体作废、定名「升级 / 不升级」，而 store 侧的改名归风险那一路，
 * 两边不会同一次落地。工单页把"落到屏幕上的那个词"收在一处，
 * 谁先改都不会出现"按钮写升级、说明写接管"。
 */

const expanded = ref({ report: true, assess: true, collab: true, risk: true });

/** 本单是不是投诉单。类型不在 props 里，走与操作页同一条取数链——本 Tab 的内容按它分岔 */
const isComplaintTicket = computed(() => resolveTicketTypeFor(props.ticketNo) === '投诉');

/**
 * 本单的**报备**条目（B 线）。
 *
 * 🔴 **不用 `reportStore.reportsOf` 的全量**：那个读口把 A 线自动进池的条目也并了进来
 * （见 `stores/riskReports.ts` 的说明）。A 线的条目在这张列表上会渲染成一条
 * 报备人「系统」、报备原因「其他」、状态写着「实时监控中」的灰点记录 —— 三格全是占位，
 * 读的人会以为有人报过一次却什么都没填。它们是**打标那条链**上的东西，
 * 归「风险标记」块上半的打标那半，不进报备记录。判据取 `source`，那是条目自带的身份标。
 */
const reportItems = computed(
  () => reportStore.reportsOf(props.ticketNo).filter((r) => r.source === '二线报备'),
);
/** 在队的那一条（至多一条，基线 ※29） */
const pending = computed(() => reportItems.value.find((r) => isOpenStatus(r.status)) ?? null);
/** 历史条目：已评估 + 已撤回，时间倒序。在队那条单独占一块，不进这个列表 */
const history = computed(() => reportItems.value.filter((r) => !isOpenStatus(r.status)));
/**
 * 在队那条的**历次释放记录**，最近一次在前（《【930】》§5.5 ⑥，累积不覆盖）。
 * 只对在队那条取：已结论 / 已撤回的条目不再回池，它被退回过几次已经不影响任何人的下一步。
 */
const pendingReleases = computed(() => [...(pending.value?.releases ?? [])].reverse());

/**
 * 历史每条的展开态。**默认全折叠**，键是条目 id。
 * 切单即清空 —— 展开态是"这一次看这张单时翻开了哪几条"，不跨工单记忆。
 */
const openHistory = ref<Record<string, boolean>>({});
watch(() => props.ticketNo, () => { openHistory.value = {}; });
function toggleHistory(id: string) {
  openHistory.value = { ...openHistory.value, [id]: !openHistory.value[id] };
}

/**
 * 折叠态那一行的报备原因。有风险类型时接在原因后面 ——
 * 折叠态只有一行的位置，原因与类型是这条报备"讲的是什么事"的最小一对。
 */
function historyReasonText(r: RiskPoolItem) {
  return r.category ? `${r.reason} · ${r.category}` : r.reason;
}
// ---- 撤回（PRD §4.8）----
// 提交即固化、不提供编辑；填错了只能撤回后重报。**仅待领取态、仅本人**，
// 且撤回后**不删除**，转「已撤回」并留原因 —— 它是"这个人当时报过什么"的证据。
//
// 🔴 **被领取之后不给撤回按钮**：活已经落到某个客诉专员名下了，这时候抽走
// 等于让他白读一遍。store 的 withdraw() 也只认待领取那一态（存储值仍写「待分派」，
// 界面词见 OpRiskDecision.ts），两处口径必须一致——按钮还在、点了却什么都没发生，
// 比按钮消失更糟。被领取后要纠错走"评完再报一次"。
const withdrawOpen = ref(false);
const withdrawReason = ref('');
const withdrawTried = ref(false);
const missWithdrawReason = computed(() => withdrawTried.value && !withdrawReason.value.trim());
const canWithdraw = computed(
  () => !props.readonly
    && !!pending.value
    // 存储值仍是「待分派」，界面写「待领取」（改名归风险 store 那一路，见 OpRiskDecision.ts）
    && pending.value.status === '待分派'
    && pending.value.by === user.name,
);

/*
 * ⚠️ 本 Tab 上**没有评估入口**（2026-09-28 裁决）：在队卡那枚「评估」按钮与本 Tab 自持的
 * 「评估报备」弹窗已整块删除，工单页的评估只剩**页头「风险管控」**那一个弹窗
 * （`operation/OpRiskControlModal.vue`）。本 Tab 写权限给的是二线专员 / 二线班组长 / 管理员
 * （它承载「发起报备」），而评估权只在客诉专员手上 —— 那枚按钮对任何角色都不可达。
 * 「从报备池领取后跳工单页自动弹评估」这条路径随之搬到页头那个弹窗里（`consumeAssessArrival`）。
 */

function openWithdraw() {
  if (!canWithdraw.value) return;
  withdrawReason.value = '';
  withdrawTried.value = false;
  withdrawOpen.value = true;
}

function confirmWithdraw() {
  withdrawTried.value = true;
  const target = pending.value;
  if (!target || !withdrawReason.value.trim()) return;
  reportStore.withdraw(target.id, withdrawReason.value.trim());
  withdrawOpen.value = false;
  message.success('已撤回本次报备，可重新发起');
}

/*
 * ⚠️ **「风险标记」块的下半（处理人自述：是否有风险 / 风险等级 / 风险描述）整组已删**
 * （2026-09-29 裁决）：那三个字段与「发起风险报备」这条正路讲的是同一件事，
 * 且非处理人在这里看到的是一组发灰的空字段。
 *
 * 🔴 **字段本身没删**：它们仍属 `ProcessFormDraft`，控件在「工单处理」Tab 的
 * 补充处理 · 风险 chip 面板里（`OpSupplementChipPanels.vue`）——那是处理表单的一部分、
 * 基线有规定，删完块内这一份之后，chip 面板就是这三个字段的**唯一入口**。
 * 随之一并清掉的还有本 Tab 的 `selfReportWritable`、写出口（`updateForm` / `update:form`）、
 * 两条必填校验与 `isPrimaryHandler` 透传 —— 它们只为这半块而存在。
 *
 * `form` 这个 prop **保留**：下方 `riskMonitorDiff` 还要拿它与命中核实结论比对（915 §7.3）。
 */

/*
 * ⚠️ 这里曾有一行只读的「风险评估结论：高危 · 吴投诉（客诉专员）· …」（riskAssessLine）。
 * **已整条删除**（2026-09-09 业务第二轮拍板，《【930】》N1）：评估决策改回二选一
 * 二选一「不升级 / 升级」之后没有"确认有风险 + 定级"这一档，评估**不再回传工单风险字段** ——
 * 没有"被坐席已填的值挡住"这回事了，也就没有必须另外亮一行的理由。
 * 结论本身在本 Tab 的「评估结果」区块里全文可见，比一行摘要说得全。
 *
 * 下面三个 riskMonitor* 是**命中核实**那一路（915），与本次反转无关，一字不动。
 */

const riskMonitorLine = computed(() => {
  const v = props.riskVerification;
  if (!v) return '';
  if (!v.latest) {
    /*
     * 🔴 **不能一句「尚无核实结论」了事**：命中核实与风险打标是两条线（前者判"这次命中准不准"，
     * 后者判"这张单有没有风险、多大"），打完标之后命中确实仍是待核实 —— 但这张单**已经有结论了**。
     * 原文案只说了前半句，于是打完标的单在同一屏上一边写着「尚无核实结论」、
     * 一边紧挨着「风险打标 中危」。两条线各说各的那一半，读的人只会以为其中一处坏了。
     */
    const t = tagRecord.value;
    if (!t) return `风险监控核实：本单 ${v.hitCount} 条命中待核实，尚无核实结论`;
    const lv = t.result === '无风险' ? '无风险' : riskLevelText(t.result);
    return `风险监控核实：本单 ${v.hitCount} 条命中待核实；风险等级已判「${lv}」· ${t.by}（${t.byRole}）· ${t.at}`;
  }
  const e = v.latest;
  return `风险监控核实：${riskLevelText(v.grade)} · ${e.verdict} · ${e.by}（${e.byRole}）· ${e.at}`;
});

const riskMonitorBreakdown = computed(() => {
  const v = props.riskVerification;
  if (!v || v.hitCount <= 1 || !v.latest) return '';
  const parts: string[] = [];
  if (v.confirmedCount) parts.push(`成立 ${v.confirmedCount}`);
  if (v.falseCount) parts.push(`误报 ${v.falseCount}`);
  if (v.pendingCount) parts.push(`待核实 ${v.pendingCount}`);
  return `本单 ${v.hitCount} 条命中：${parts.join(' · ')}`;
});

const riskMonitorDiff = computed(() => {
  const v = props.riskVerification;
  if (!v) return '';
  const parts: string[] = [];
  if (v.flag && props.form.riskFlag && props.form.riskFlag !== v.flag) {
    parts.push(`「是否有风险」本页为「${props.form.riskFlag}」，监控结论为「${v.flag}」`);
  }
  if (v.grade && props.form.riskLevel && props.form.riskLevel !== v.grade) {
    parts.push(`「风险等级」本页为「${riskLevelText(props.form.riskLevel)}」，监控工单级为「${riskLevelText(v.grade)}」`);
  }
  if (!parts.length) return '';
  return `${parts.join('；')}。本页取值以坐席填写为准，监控结论不覆盖。`;
});

/**
 * 本 Tab 的**唯一**时刻格式：**全格式 `YYYY-MM-DD HH:mm`**（2026-09-29 裁决）。
 *
 * 🔴 原来这里是 `formatShortAt`，把年份掐掉只出 `MM-DD HH:mm`，于是同一屏上两套并存 ——
 * 在队卡 / 历史条 / 协同条是短格式，「风险标记」块的标记时间是全格式。
 * 风险这条链动辄跨月跨年（报备等评估、条目在池里挂着、改判隔很久才发生），
 * 掐掉年份之后"去年那条"和"今年这条"长得一模一样，排序与追溯都读不出来。
 *
 * 取值本身就是 `YYYY-MM-DD HH:mm`（各 store 的 `nowStamp` 同一把），本函数只做归一：
 * 带秒 / 带 T 的也切回到分钟，认不出来的原样返回、不臆造。
 */
function formatAt(at: string) {
  const m = at.match(/(\d{4}-\d{2}-\d{2})[\sT]+(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : at;
}

/**
 * 等待时长整条走 store 的 `waitedMinutes`（内含 60s 心跳），风险监控页那份也是同一把。
 * 本地各算各的会让同一条报备在两处显示成两个数。
 *
 * 🔴 本页在队只读卡上的这个数是"报备等了多久"在工单页的**唯一**落点
 * （页头那条报备提示行已删，见 TicketOperationView 的 `processTabDots`），别再挪。
 */
function waitedText(at: string) {
  const mins = reportStore.waitedMinutes(at);
  return mins >= 60 ? `${Math.floor(mins / 60)} 小时 ${mins % 60} 分钟` : `${mins} 分钟`;
}

/**
 * 记录行的结论摘要。**只有决策**（二选一）——原先还并了一个风险等级，
 * 二选一之后评估不再定级（N1），那一段没有取值来源了。
 * 「升级」额外带上派生的新投诉单号：这条记录的实际去向就在那张单上，
 * 只写「升级」两个字，读的人还得再翻一次「评估结果」才知道去了哪。
 */
function assessmentSummary(r: RiskPoolItem) {
  const a = r.assessment;
  if (!a) return '';
  const text = decisionText(a.decision);
  if (isEscalateDecision(a.decision) && a.escalatedToNo) return `${text} → ${a.escalatedToNo}`;
  return text;
}

/**
 * 记录列表里的结论行**只给一行摘要**：谁、什么时候评的。
 *
 * 【为什么不带反馈意见 / 升级说明】完整结论（决策 / 评估人 / 评估时间 / 意见全文 / 升级去向）
 * 由下方「评估结果」区块承担（业务拍板 2026-09-09）。两处都写全文的话，
 * 同一条结论在一屏上出现两遍 —— 报备多轮之后两块内容还会分叉，
 * 读的人不知道该信哪个。这里只答"这条评过没有、谁评的"，详情往下看。
 */
function assessmentDetail(r: RiskPoolItem) {
  const a = r.assessment;
  if (!a) return '';
  return `${a.by}（${a.byRole}）${formatAt(a.at)}`;
}

/**
 * 在队那条的状态标。**分「待领取 / 已领取」两态显示**——
 * 都笼统写「待评估」的话，报备人看不出"还没人接"与"李文萍正在看"的差别；
 * 催起来也不知道该催谁。
 */
const pendingStateText = computed(() => {
  const p = pending.value;
  if (!p) return '';
  if (p.status === '评估中') return p.assignee ? `已领取 · ${p.assignee}` : '已领取';
  return '待领取';
});

/**
 * 块头角标**只给条数**：有在队写「1 条在队 · 历史 N」，无在队写「历史 N」，两者皆无时不出角标。
 * 状态词归卡内那一枚状态标，角标不再重复它 —— 同一个词在块头、在队卡、历史行上出现三遍，
 * 读的人会以为是三件不同的事。在队恒至多一条（基线 ※29），故写死「1 条在队」。
 */
const reportSectionBadge = computed(() => {
  const parts: string[] = [];
  if (pending.value) parts.push('1 条在队');
  if (history.value.length) parts.push(`历史 ${history.value.length}`);
  return parts.length ? parts.join(' · ') : undefined;
});

/** 本单最近一次已评估的报备（按评估时刻倒序） */
const latestAssessed = computed(() =>
  reportStore.reportsOf(props.ticketNo).find((r) => r.status === '已评估' && r.assessment) ?? null,
);

/** 仅有结论时出角标；进行中状态在上面的报备卡片展示 */
const assessSectionBadge = computed(() =>
  latestAssessed.value ? poolStatusText(latestAssessed.value.status) : undefined,
);

/**
 * 「升级」派生出的新投诉单号。**只有升级那一档才有值** —— 二选一之后评估的产出
 * 要么是一句反馈意见（不升级），要么是一张新投诉单（升级），没有第三种。
 */
const escalatedNo = computed(() => {
  const a = latestAssessed.value?.assessment;
  return a && isEscalateDecision(a.decision) ? (a.escalatedToNo ?? '') : '';
});

const adviceLabel = adviceLabelOf;

function decisionTone(decision: AssessDecision) {
  return isEscalateDecision(decision) ? 'danger' : 'ok';
}

function formatAssessor(a: ReportAssessment) {
  return a.byRole ? `${a.by}（${a.byRole}）` : a.by;
}

/**
 * 「升级」派生的新投诉单：站内打开。
 * 【为什么必须可点】升级走的是《【830】》已有的第一跳派生——原单落终态、整页只读，
 * 接下来的事全在新单上。只把单号当文字印出来，报备人还得自己去列表里搜一遍。
 */
function openEscalatedTicket(no: string) {
  router.push(`/tickets/${no}`);
}

/* ==================== 风险打标（A 线的入池门槛） ==================== */

/**
 * **打标已并入下方「风险标记」一块**（2026-09-20 业务拍板，推翻 2026-09-10「另开一块」那次取舍）。
 * 并块的理由是：两块并排时同一屏上两处都写着"这单有没有风险、多大"，
 * 读的人第一眼分不出该看哪个。
 *
 * **2026-09-29 裁决之后「风险标记」块只剩打标那一路**，自上而下是：
 *   ① **打标结论**（只读）：等级 · 标记人（角色）· 标记时间一行；风险备注另起一行；
 *      命中核实结论照旧只读回显；尚无结论时出缺省文案。
 *   ② **标记记录**：默认折叠，折叠态「标记记录 N 次」+ 最新一条，展开出全部；
 *      每条 ＝ 等级 · 标记人 · 时刻 · 当次风险备注（没填的不占位）。
 *
 * **无下半、无按钮**：删掉的是原来的③细分隔线与④处理人自述三字段（见上方那段），
 * 以及原来摆在②那一行右端的「标记 / 重新标记」按钮与它的弹窗（见下方那段）。
 *
 * 🔴 打标那一路与工单风险字段**互不覆盖**这条没变：
 * 打标存 `stores/riskQueue.ts` 的条目、提交即生效、四选一（低/中/高/无风险）、
 * 是**进不进风险工单池的那道门**（《【930】》§5A.3）；
 * `ProcessFormDraft.riskFlag / riskLevel / riskDescription` 是工单字段、随「保存」落库，
 * 控件在「工单处理」Tab 的补充处理 · 风险 chip 面板里。
 */

/** 本单的 A 线条目（自动识别进来的，一张单至多一条在池，§3.1） */
const tagEntry = computed(() => queue.entriesOf(props.ticketNo).find((e) => !!e.tag)
  ?? queue.entriesOf(props.ticketNo)[0]
  ?? null);
const tagRecord = computed(() => tagEntry.value?.tag ?? null);
/** 标记历史（含改判），时间正序。改判独立成条、不覆盖首次那条 */
const tagHistory = computed(() => (tagEntry.value ? queue.tagHistoryOf(tagEntry.value.id) : []));

/**
 * 标记记录的展开态。**默认折叠**，与历史报备条同一个做法：
 * 折叠态只给「标记记录 N 次」+ **最新一条**，展开才出全部。
 * 改判多轮之后横排全展开会把上半的现行结论挤下去，而回看历史多半只关心最近一次。
 * 切单即收起 —— 展开态是"这一次看这张单时翻开了它"，不跨工单记忆。
 */
const tagRecordsOpen = ref(false);
watch(() => props.ticketNo, () => { tagRecordsOpen.value = false; });
/**
 * 折叠态摆的那一条。`tagHistory` 是**时间正序**（顺序口径不动），故"最新"在**末位**。
 */
const latestTagRecord = computed(() => tagHistory.value[tagHistory.value.length - 1] ?? null);
/**
 * 一条标记记录的行文：**等级 · 标记人 · 时刻 · 本次备注**。折叠态与展开态共用这一份。
 *
 * 🔴 **备注必须带上**（2026-09-29 裁决）：「修正原因」那一格取消之后，改判那几条的
 * "为什么改"就写在**当次的风险备注**里 —— 记录列表只报等级与人，那条爬坡还是读不出因果。
 * 备注是可选的（首次标记不强制），**没填的不占位**，不补「—」。
 *
 * 🔴 **取备注要回退一次 `amendReason`**：旧缓存里的历史记录是在「修正原因」还是独立字段的
 * 年代写下的 —— 文本落在 `amendReason` 上、`note` 是空的，只取 `note` 会让那几条一律显示不出因由。
 * `amendReason` 已停写（`024cfdd2`），这里回退取它**只为让旧记录还能显示出当时写的那句话**；
 * 新记录一律只写 `note`，**不要**因为这个回退就把 `amendReason` 重新变成写入口。
 */
function tagRecordText(h: RiskTagEntry) {
  const head = `${h.level ? riskLevelText(h.level) : '无风险'} · ${h.by} · ${formatAt(h.at)}`;
  const note = (h.note || h.amendReason || '').trim();
  return note ? `${head} · ${note}` : head;
}

/**
 * 谁能在这一页打标（§3.1，2026-09-10 拍板）：
 * **投诉单** —— 客诉专员在工单处理页自行打标；
 * **非投诉单** —— 处理人一律不能打，只由客诉专员 / 投诉督导在风险监控页打。
 * 判据里的角色只有一个，因为本页只可能站着处理侧或客诉专员：投诉督导的打标入口在风险监控页。
 *
 * 🔴 **这一行原来还写着"或靠命中规则自动打"—— 系统里没有这回事**（930 v3.4 §9 规则 13）：
 * 打标状态机全仓只有 `riskQueue.recordTag` 一个入口，`by` / `byRole` 必填，
 * 全部调用方都是人点出来的保存动作，没有任何定时器 / 监听器 / 规则引擎回调。
 * 规则产出的只是**词表预设等级**（`RiskHit.level`），供排队展示与打标弹窗预置，
 * `ticketGradeOf` 根本不吃它 —— 人不确认，这张单一个等级都不会有。
 * 【为什么要把注释也改掉】"自动打标"这句话此前正是靠散在几处注释里活下来的，
 * 于是每一轮都有人照着它去找那条不存在的自动链路，或默认"没人打也会有结果"。
 *
 * 🔴 **不再要求"本单已有实时监控条目"**（2026-09-10 收口）：一张 P0 投诉单按 §5A.1
 * 本来就该被自动捞进监控，而条目只在风险监控页那一侧生成 —— 没进过监控的单在这里
 * 点不动打标，等于这条口径在那批单上从来没生效过。条目由 store 在打标时按两类判据现补，
 * 见 `riskQueue.ensureEntryFor`。
 *
 * 【但仍然要在点之前把话说清】推不出来源的单（如已结案的单）**不给按钮**，
 * 原地写明原因（`tagBlockReason`）—— 让人填完弹窗才收到一句失败，比按钮不出现糟得多。
 * 判据取 store 的纯函数，与提交时兜底那一句同源，两处不会说出两个理由。
 *
 * 🔴 **判据本身已抽成共享的 `canTagRiskOnTicketPage`**（2026-09-29）：页头按钮的出现条件、
 * 页头弹窗上半的显隐、本块空态那句的分岔读的是同一份，三处不会再各写一遍同一个表达式。
 */
const tagBlockReason = computed(() => queue.tagBlockReasonOf(props.ticketNo));
const canTag = computed(
  () => canTagRiskOnTicketPage(
    resolveTicketTypeFor(props.ticketNo),
    user.roleKey,
    tagBlockReason.value,
  ),
);

/*
 * ⚠️ **块内那枚「标记 / 重新标记」按钮与它的弹窗已整块撤掉**（2026-09-29 裁决）：
 * 标记改由**页头「风险管控」**承担 —— 那个弹窗在投诉单上补出了"上半 风险等级
 * （可标记 / 改判，改判填风险备注）"，与风险监控页那个弹窗同构
 * （`operation/OpRiskControlModal.vue`）。
 *
 * 判据与落库**一条都没有新造**：权限仍是本文件这把 `canTag` 的同一口径（原单类型 + 标记权），
 * 落库仍走 `riskQueue.recordTagFor` 那条唯一入口，随之搬走的还有四选一等级、
 * 「无风险」置灰（`canTagNoRisk`）、改判必填风险备注这几条规格
 * （原来那格独立的「修正原因」已并进风险备注，2026-09-29）。
 *
 * 本文件留着 `canTag` 只剩一个用处：空态里那句"为什么这里没有标记入口"要按它分岔。
 */

/* ==================== 协同记录（《【930】》§3.3） ==================== */

/** 本单历次协同处理，时间倒序。同一张投诉单可多次协同，每次各一条 */
const collabRecords = computed(() => collab.recordsOf(props.ticketNo));
const collabSectionBadge = computed(() =>
  collabRecords.value.length ? String(collabRecords.value.length) : undefined,
);

</script>

<template>
  <div class="risk-tab">
    <!--
      报备与评估两块**只在非投诉单上出现**（基线 ※29 类型集 ＝ 咨 建 商）：
      报备的价值在这张单还没变成投诉之前；已经是投诉单的，"升不升级成投诉单"是个不成立的问题。
      投诉单在本 Tab 上看到的是「风险标记」与「协同记录」两块（《【930】》§3.3 / §5A.3）——
      打标结论在「风险标记」块的上半（2026-09-20 并块）。
    -->
    <OpCollapsibleSection
      v-if="!isComplaintTicket"
      title="风险报备"
      :icon="ContainerOutlined"
      :badge="reportSectionBadge"
      badge-variant="count"
      :expanded="expanded.report"
      @toggle="expanded.report = !expanded.report"
    >
      <!--
        在队报备。**与历史每条同一套卡**（`rr-card`）：在队那条高亮（实边框 + 主色底纹），
        历史弱化（灰边浅底）。两者用两种完全不同的骨架时，读的人分不出它们是同一种东西的两个阶段。
        发起入口在底栏弹窗，本卡只读 + 报备人自己的「撤回」。
      -->
      <article v-if="pending" class="rr-card rr-card-live" aria-label="当前在队报备">
        <!-- 第一行：状态 · 提交于 · 已等待，右端是报备人自己的「撤回」 -->
        <div class="rr-card-top">
          <div class="rr-card-top-main">
            <span
              class="rr-pill"
              :class="pending.status === '评估中' ? 'rr-pill-doing' : 'rr-pill-pending'"
            >
              <ClockCircleOutlined />
              {{ pendingStateText }}
            </span>
            <span class="rr-card-time">提交于 {{ formatAt(pending.at) }}</span>
            <span class="rr-card-wait">已等待 {{ waitedText(pending.at) }}</span>
          </div>
          <button v-if="canWithdraw" type="button" class="rr-withdraw" @click="openWithdraw">
            撤回
          </button>
          <!-- 按钮消失得给个理由：不写这一句，报备人只会以为撤回入口自己丢了 -->
          <span v-else-if="pending.status === '评估中'" class="rr-withdraw-locked">
            已被领取评估，不可撤回
          </span>
        </div>

        <!-- 第二行：报备人 ｜ 原因 ｜ 风险类型。三格恒出，没取值的写「—」 -->
        <div class="rr-card-fields">
          <span class="rr-field">
            <UserOutlined class="rr-field-icon" />
            <span class="rr-field-k">报备人</span>
            <span class="rr-field-v">{{ pending.by || '—' }}</span>
          </span>
          <span class="rr-field-sep" aria-hidden="true" />
          <span class="rr-field">
            <span class="rr-field-k">原因</span>
            <span class="rr-field-v">{{ pending.reason || '—' }}</span>
          </span>
          <span class="rr-field-sep" aria-hidden="true" />
          <span class="rr-field">
            <span class="rr-field-k">风险类型</span>
            <span class="rr-field-v" :class="{ 'rr-field-warn': pending.category }">
              {{ pending.category || '—' }}
            </span>
          </span>
        </div>

        <div class="rr-card-body">
          <blockquote class="rr-quote">{{ pending.desc }}</blockquote>
          <ul v-if="pending.attachments.length" class="rr-files">
            <li v-for="f in pending.attachments" :key="f" class="rr-file">
              <PaperClipOutlined />
              <span>{{ f }}</span>
            </li>
          </ul>
          <!--
            释放记录（《【930】》§5.5 ⑥ 点名的三个落点之一：**在队只读卡**）。
            **没被释放过整段不出**。
            🔴 **报备人必须看得到这一段**：条目被领走又退回来之后，这张卡会从
            「已领取 · 李文萍」跳回「待领取」——不摆出释放记录，报备人只会看到
            承办人凭空消失，既不知道有没有人看过，也不知道为什么退回来。
            历次全列、最近一次在前（累积不覆盖）。
          -->
          <div v-if="pendingReleases.length" class="rr-releases">
            <div class="rr-releases-head">
              <RollbackOutlined />
              释放记录（{{ pendingReleases.length }} 次）
            </div>
            <div v-for="(rel, i) in pendingReleases" :key="i" class="rr-release">
              <div class="rr-release-head">
                <span class="rr-release-who">{{ rel.by }}（{{ rel.byRole }}）</span>
                <span class="rr-release-at">{{ formatAt(rel.at) }}</span>
              </div>
              <div class="rr-release-reason">{{ rel.reason }}</div>
            </div>
          </div>
          <!--
            ⚠️ 这里曾有一行「评估期间本单照常处理，SLA 不停表」，**已删**（2026-09-28 裁决）。
            报备不落子状态、SLA 不停钟（基线 ※29）是**规则**，规则写在 PRD，页面不写：
            卡上没有任何冻结迹象，本身就是这条规则在界面上的表达。
          -->
        </div>
      </article>

      <div v-if="!pending && !history.length" class="rr-empty">
        <ContainerOutlined class="rr-empty-icon" />
        <p class="rr-empty-title">暂无风险报备</p>
        <p v-if="reportEntryVisible" class="rr-empty-hint">请点击底部「风险报备」发起</p>
      </div>

      <!--
        历史报备：与在队同一套卡（`rr-card`，`rr-card-past` 弱化），**每条默认折叠**。
        折叠态一行给的是"这条讲的是什么事、结局如何"——时刻 · 报备人 · 原因（带风险类型）· 状态标；
        描述全文、附件、评估结论 / 撤回原因在展开后出。
        报备多轮之后全展开会把在队那条挤出屏幕，而回看历史多半只找其中一条。
      -->
      <div v-if="history.length" class="rr-history" :class="{ 'has-pending': pending }">
        <h4 class="rr-history-head">报备记录<span class="rr-history-count">{{ history.length }}</span></h4>
        <div class="rr-cards">
          <article
            v-for="h in history"
            :key="h.id"
            class="rr-card rr-card-past"
            :class="{ 'is-open': openHistory[h.id] }"
          >
            <button
              type="button"
              class="rr-card-sum"
              :aria-expanded="!!openHistory[h.id]"
              @click="toggleHistory(h.id)"
            >
              <component
                :is="openHistory[h.id] ? DownOutlined : RightOutlined"
                class="rr-sum-caret"
              />
              <span class="rr-card-time">{{ formatAt(h.at) }}</span>
              <span class="rr-sum-who">{{ h.by }}</span>
              <span class="rr-sum-reason">{{ historyReasonText(h) }}</span>
              <span
                class="rr-pill rr-pill-sm rr-sum-pill"
                :class="h.status === '已撤回' ? 'rr-pill-gray' : 'rr-pill-done'"
              >
                {{ poolStatusText(h.status) }}
              </span>
            </button>
            <div v-if="openHistory[h.id]" class="rr-card-body">
              <blockquote class="rr-quote rr-quote-past">{{ h.desc }}</blockquote>
              <ul v-if="h.attachments.length" class="rr-files">
                <li v-for="f in h.attachments" :key="f" class="rr-file">
                  <PaperClipOutlined />
                  <span>{{ f }}</span>
                </li>
              </ul>
              <div v-if="h.status === '已评估'" class="rr-eval">
                <CheckOutlined class="rr-eval-icon" />
                <div class="rr-eval-body">
                  <span class="rr-eval-sum">{{ assessmentSummary(h) }}</span>
                  <span class="rr-eval-detail">{{ assessmentDetail(h) }}</span>
                </div>
              </div>
              <p v-else-if="h.withdrawReason" class="rr-withdraw-note">
                撤回原因：{{ h.withdrawReason }}
              </p>
            </div>
          </article>
        </div>
      </div>
    </OpCollapsibleSection>

    <!-- 撤回：必须填原因，撤回后记录仍在（转「已撤回」），不删除 -->
    <OpActionModal
      v-model:open="withdrawOpen"
      title="撤回风险报备"
      :icon="ContainerOutlined"
      tone="warn"
      :width="440"
      ok-text="确认撤回"
      ok-tone="danger"
      @ok="confirmWithdraw"
    >
      <div class="stack-field">
        <label class="lbl"><span class="req">*</span>撤回原因</label>
        <a-textarea
          v-model:value="withdrawReason"
          :rows="3"
          :status="missWithdrawReason ? 'error' : undefined"
          placeholder="说明为什么撤回这条报备…"
        />
        <p v-if="missWithdrawReason" class="field-err">请填写撤回原因</p>
        <!-- 撤回是破坏性动作，"记录不删除"是下决心前必须知道的后果，故留一句 -->
        <p class="report-tip">撤回后保留记录，可重新发起。</p>
      </div>
    </OpActionModal>

    <OpCollapsibleSection
      v-if="!isComplaintTicket"
      title="评估结果"
      :icon="CheckCircleOutlined"
      :badge="assessSectionBadge"
      badge-variant="hint"
      :expanded="expanded.assess"
      @toggle="expanded.assess = !expanded.assess"
    >
      <section
        v-if="latestAssessed?.assessment"
        class="ra-sheet"
        aria-label="评估记录"
      >
        <!--
          **一行 meta + 一行意见**，照本 Tab「风险标记」块上半那套排法
          （`rk-tag-line` / `rk-tag-note`）：结论标在行首、评估人与时刻紧随、去向标收尾。
          原来是渐变抬头带 + `dl` 竖排五行 —— 评估人 / 时刻 / 决策 / 新单号全是短值，
          一项一行把整块撑到 280px 上下、右侧一路留白，而同一个 Tab 上讲同一类事的
          「风险标记」块就是横排的：两种排法并存会让人以为它们是两种东西。

          结论二选一，**没有风险等级这一档**（N1）。行首那枚结论标就是「评估决策」那一格的值，
          不再另起一行复述同一个词。
        -->
        <div class="ra-line">
          <span
            class="ra-decision"
            :class="`tone-${decisionTone(latestAssessed.assessment.decision)}`"
          >{{ decisionText(latestAssessed.assessment.decision) }}</span>
          <span class="ra-who">{{ formatAssessor(latestAssessed.assessment) }}</span>
          <span class="ra-at">{{ formatAt(latestAssessed.assessment.at) }}</span>
          <!-- 有单号才敢说"已派生"：指不出是哪一张的时候，这句话等于没说 -->
          <span v-if="escalatedNo" class="ra-derive">
            已派生投诉工单
            <a
              class="ra-link"
              href="javascript:void(0)"
              @click="openEscalatedTicket(escalatedNo)"
            >{{ escalatedNo }}</a>
          </span>
        </div>
        <p class="ra-advice">
          <span class="ra-advice-label">{{ adviceLabel(latestAssessed.assessment.decision) }}</span>{{ latestAssessed.assessment.advice }}
        </p>
      </section>

      <div v-else class="ra-empty">
        尚无评估结论
      </div>
    </OpCollapsibleSection>

    <!--
      「风险标记」（2026-09-20 并块：原「风险打标」块整块并入，Tab 上不再有两块讲同一件事；
      2026-09-29 裁决删掉了下半的处理人自述三字段，那一组的控件只留在「工单处理」Tab 的
      补充处理 · 风险 chip 面板里）。
      本块 ＝ 打标那一路（《【930】》§5A.3）：**读的人是处理人**，等级、标记人、标记时间三项缺一不可
      —— 少了标记人与时刻，这条结论就成了一句没有出处的判断，处理人无从追问。
      风险备注**可选**（三入口统一），没填时整行不出。
      **全块只读、块内没有按钮**：标记入口在页头「风险管控」（投诉单 + 标记权角色，判据 `canTag`，
      §3.1），非投诉单在工单页恒为只读回显。
    -->
    <OpCollapsibleSection
      title="风险标记"
      :icon="WarningOutlined"
      :badge="tagRecord ? (tagRecord.result === '无风险' ? '无风险' : `${tagRecord.result}危`) : undefined"
      :badge-variant="tagRecord && tagRecord.result !== '无风险' ? 'warn' : 'hint'"
      body-variant="risk"
      :expanded="expanded.risk"
      @toggle="expanded.risk = !expanded.risk"
    >
      <div class="chip-panel panel-neutral">
        <!-- ===== 标记结论（只读回显）+ 命中核实结论 + 折叠的标记记录，全块无按钮 ===== -->
        <section class="rk-tag" aria-label="风险等级结论">
          <template v-if="tagRecord">
            <div class="rk-tag-line">
              <span
                class="rt-level"
                :class="tagRecord.result === '无风险' ? 'tone-none' : `tone-${tagRecord.result}`"
              >
                {{ tagRecord.result === '无风险' ? '无风险' : riskLevelText(tagRecord.result) }}
              </span>
              <span class="rk-tag-who">{{ tagRecord.by }}（{{ tagRecord.byRole }}）</span>
              <span class="rk-tag-at">{{ formatAt(tagRecord.at) }}</span>
              <span v-if="tagEntry && isPooledStatus(tagEntry.status)" class="rt-pool">
                风险工单池 · {{ poolStatusText(poolStageStatusOf(tagEntry)) }}
              </span>
              <span v-else-if="tagRecord.result === '无风险'" class="rt-pool">不进池</span>
              <!-- 并入痕迹记在标记记录上，不进来源（§5A.1 ④），写法与风险监控页修正弹窗一致 -->
              <span v-if="tagRecord.viaManualScan" class="rt-pool">由手动筛查并入</span>
              <span v-if="tagRecord.viaHitVerify" class="rt-pool">由命中核实</span>
            </div>
            <!--
              风险备注。**改判那几条的"为什么改"也在这里** ——
              原来这下面还有一行「修正原因」，2026-09-29 裁决把那一格并进了风险备注
              （两格用途重叠，改判时人得把同一件事写两遍）：字段 `amendReason` 仍在类型上留着，
              但**不再写入也不再回显**，免得为这一次改动去动持久化。
            -->
            <p v-if="tagRecord.note" class="rk-tag-note">
              <span class="rk-tag-note-label">风险备注</span>{{ tagRecord.note }}
            </p>
          </template>

          <div v-else class="rt-empty">
            <p class="rt-empty-title">本单尚未标记</p>
            <!--
              说清"为什么这里没有入口"：不写这一句，看的人只会以为入口坏了或自己权限少了。
              两种挡法要分开写：**有标记权但这张单进不了监控**（投诉单 + 客诉专员，
              却推不出两类来源）与**这个角色本来就没有标记入口**（非投诉单 / 非客诉专员），
              合成一句会让客诉专员以为自己被降权了。有标记权且这张单标得动时不出任何一句 ——
              那时入口在**页头「风险管控」**，块里本来就不该再指路。
            -->
            <template v-if="!canTag">
              <p v-if="isComplaintTicket && user.roleKey === 'complaint-handler'" class="rt-empty-hint">
                {{ tagBlockReason }}
              </p>
              <!--
                🔴 这一句原来写的是「由命中规则自动打标」—— 系统里**没有这回事**：打标只有
                `riskQueue.recordTag` 一个入口、`by` / `byRole` 必填，全部调用方都是人点出来的保存动作，
                没有任何定时器 / 监听器 / 规则引擎回调。规则产出的只是**词表预设等级**（`RiskHit.level`），
                用于排队展示与打标弹窗预置，`ticketGradeOf` 根本不吃它。
                旧口径留在界面上会让人以为"等着系统自动打就行"，故按 930 v3.4 §9 规则 13 改成人工产出。
              -->
              <p v-else class="rt-empty-hint">非投诉单的风险等级由客诉专员 / 投诉督导在风险监控页标记产出，处理人没有标记入口；命中规则只给出词表预设等级，供排队与标记预置参考，人不确认不成立</p>
            </template>
          </div>

          <!--
            风险词命中的**核实结论**：只读回显，不进 form、不参与必填校验。
            （报备评估那一行已删——二选一之后评估不回传风险字段，见 script 内说明。）
          -->
          <div v-if="riskMonitorLine" class="risk-monitor-note">
            <p class="rm-line">{{ riskMonitorLine }}</p>
            <p v-if="riskMonitorBreakdown" class="rm-sub">{{ riskMonitorBreakdown }}</p>
            <p v-if="riskMonitorDiff" class="rm-diff">{{ riskMonitorDiff }}</p>
          </div>

          <!--
            标记记录。改判独立成条、不覆盖首次那条：两条并排才读得出"从中危改成高危"这条爬坡。
            **默认折叠**：折叠态「标记记录 N 次」+ 最新一条，展开出全部（顺序仍是时间正序，一条一行）。
            每条带**当次的风险备注**——改判的"为什么改"就在那里（「修正原因」已并入备注）。
            这一行**不再有按钮** —— 标记改由页头「风险管控」承担（见 script 内那段）。
          -->
          <div v-if="tagHistory.length > 1" class="rt-history">
            <button
              type="button"
              class="rt-history-sum"
              :aria-expanded="tagRecordsOpen"
              @click="tagRecordsOpen = !tagRecordsOpen"
            >
              <component
                :is="tagRecordsOpen ? DownOutlined : RightOutlined"
                class="rt-history-caret"
              />
              <span class="rt-history-head">标记记录 {{ tagHistory.length }} 次</span>
              <span v-if="!tagRecordsOpen && latestTagRecord" class="rt-history-item">
                {{ tagRecordText(latestTagRecord) }}
              </span>
            </button>
            <div v-if="tagRecordsOpen" class="rt-history-list">
              <span v-for="(h, i) in tagHistory" :key="i" class="rt-history-item">
                {{ tagRecordText(h) }}
              </span>
            </div>
          </div>
        </section>
      </div>
    </OpCollapsibleSection>

    <!--
      风险处理建议（《【930】》§3.3 界面落点之一，块名原为「协同记录」）。**只在投诉单上出现**
      —— 协同处理的类型集是「投」，非投诉单那一路走报备与评估。
      发起入口在页头「风险管控」（协同处理形态），本块只回看。
    -->
    <OpCollapsibleSection
      v-if="isComplaintTicket"
      title="风险处理建议"
      :icon="CheckCircleOutlined"
      :badge="collabSectionBadge"
      badge-variant="count"
      :expanded="expanded.collab"
      @toggle="expanded.collab = !expanded.collab"
    >
      <div v-if="collabRecords.length" class="rc-list">
        <article v-for="c in collabRecords" :key="c.id" class="rc-item">
          <!--
            时刻**顶到右端**（`margin-left:auto`），与本 Tab 历史报备条那一行的状态标同一个做法：
            一列时刻落在同一个 x 上，扫一眼就能挑出想找的那一条；左端留给"谁 + 建议了什么"。
          -->
          <header class="rc-item-head">
            <span class="rc-item-who">{{ c.by }}（{{ c.byRole }}）</span>
            <span
              v-for="a in c.advices"
              :key="a"
              class="rc-advice-tag"
            >{{ a === '其他' && c.otherAdvice ? `其他 · ${c.otherAdvice}` : a }}</span>
            <span class="rc-item-time">{{ formatAt(c.at) }}</span>
          </header>
          <p class="rc-item-opinion">{{ c.opinion }}</p>
        </article>
        <p class="rc-foot">风险处理建议不改工单状态与处理人；建议事项挂在工单上，由当前处理人执行。</p>
      </div>
      <div v-else class="ra-empty">
        尚无风险处理建议，请点击页头「风险管控」发起
      </div>
    </OpCollapsibleSection>

  </div>
</template>

<style scoped>
.risk-tab { display: flex; flex-direction: column; gap: 12px; width: 100%; }

/*
 * ---- 风险报备：卡片（在队与历史共用一套骨架）----
 * 在队 `.rr-card-live`：白底、橙实边、浅阴影；历史 `.rr-card-past`：灰边、浅灰底、不投影。
 * 差别只在边框与底色两项，骨架 / 圆角 / 内距全同 —— 它们是同一种东西的两个阶段。
 */
.rr-card {
  border-radius: 10px;
  overflow: hidden;
}
.rr-card-live {
  /* 顶部一层很浅的暖色渐隐，替掉原先那条头/体硬分割线：高亮靠色温，不靠再切一刀 */
  background: linear-gradient(180deg, #fff7ed 0%, #fff 72px);
  border: 1px solid #fed7aa;
  box-shadow: 0 1px 3px rgba(234, 88, 12, 0.06);
}
.rr-card-past {
  background: #fafafa;
  border: 1px solid #ebedf0;
}
.rr-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 0;
}
.rr-card-top-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.rr-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 999px;
  white-space: nowrap;
}
.rr-pill-pending { color: #c2410c; background: #ffedd5; }
/* 评估中：已有人接手，用中性蓝与"还没人接"的橙区分开 */
.rr-pill-doing { color: #1d4ed8; background: #dbeafe; }
.rr-pill-pending :deep(.anticon),
.rr-pill-doing :deep(.anticon) { font-size: 12px; }
.rr-pill-done { color: #047857; background: #d1fae5; }
.rr-pill-gray { color: #6b7280; background: #f3f4f6; }
.rr-pill-sm { font-size: 10px; padding: 2px 8px; font-weight: 600; }
/* 时刻在两种卡上是同一个角色（"这条什么时候的事"），故共用一个类 */
.rr-card-time {
  font-size: 12px;
  font-weight: 600;
  color: #111827;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.rr-card-live .rr-card-time { font-size: 13px; color: #9a3412; }
.rr-card-wait { font-size: 12px; color: #ea580c; white-space: nowrap; }

/* 第二行的字段组：标签灰、取值深，竖线分格；没取值的那格写「—」，仍占位 */
.rr-card-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 0;
  padding: 8px 12px 0;
}
.rr-field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  min-width: 0;
}
.rr-field-icon { color: #9ca3af; font-size: 12px; }
.rr-field-k { color: #9ca3af; }
.rr-field-v { color: #374151; font-weight: 600; word-break: break-word; }
.rr-field-warn { color: #c2410c; }
.rr-field-sep {
  width: 1px;
  height: 12px;
  margin: 0 10px;
  background: #e5e7eb;
  flex: none;
}
.rr-withdraw {
  flex: none;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  color: #9a3412;
  background: #fff;
  border: 1px solid #fdba74;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.rr-withdraw:hover { background: #fff1e6; border-color: #fb923c; }
.rr-withdraw-locked {
  flex: none;
  padding: 6px 0;
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
}
.rr-card-body { padding: 10px 12px 12px; }
.rr-quote {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.65;
  color: #1f2937;
  background: #f8fafc;
  border-left: 3px solid #fdba74;
  border-radius: 0 6px 6px 0;
}
/* 历史那条已成定局，引文的强调边跟着弱化，底色也让开卡片本身的浅灰 */
.rr-quote-past {
  font-size: 12px;
  color: #4b5563;
  background: #fff;
  border-left-color: #d1d5db;
}
.rr-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.rr-file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11px;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
}
.rr-file :deep(.anticon) { color: #94a3b8; font-size: 11px; }

/*
 * 释放记录（§5.5 ⑥）。**灰蓝、不用红**：它说的是"被人退回来过"，不是告警 ——
 * 这张卡上的红已经归超时那一档，两件事共用一个颜色会让超时失去分量。
 */
.rr-releases {
  margin-top: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}
.rr-releases-head {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}
.rr-releases-head :deep(.anticon) { font-size: 11px; }
.rr-release {
  margin-top: 6px;
}
/*
 * 分隔线只给**第二条起**。⚠️ 不能写 `:first-of-type` —— 上面那行标题也是 div，
 * 它才是容器里的第一个 div，规则会落空、第一条记录照样顶着一条线。
 */
.rr-release + .rr-release {
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
}
.rr-release-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.rr-release-who { font-size: 11px; font-weight: 600; color: #374151; }
.rr-release-at { font-size: 11px; color: #9ca3af; font-variant-numeric: tabular-nums; }
.rr-release-reason {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.55;
  color: #4b5563;
  word-break: break-word;
}

/* ---- 空态 ---- */
.rr-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 16px;
  text-align: center;
  background: #fafafa;
  border: 1px dashed #e5e7eb;
  border-radius: 10px;
}
.rr-empty-icon { font-size: 28px; color: #d1d5db; margin-bottom: 8px; }
.rr-empty-title { margin: 0; font-size: 13px; font-weight: 600; color: #6b7280; }
.rr-empty-hint { margin: 4px 0 0; font-size: 12px; color: #9ca3af; }

/* ---- 历史报备（同一套卡，每条可折叠）---- */
.rr-history { margin-top: 4px; }
.rr-history.has-pending {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #e5e7eb;
}
.rr-history-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.rr-history-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 700;
  color: #1a6fff;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
}
.rr-cards { display: flex; flex-direction: column; gap: 8px; }
/*
 * 折叠态整行可点（按钮而非 div：键盘也要能翻开）。整行做成一条基线对齐的横排，
 * 状态标靠 margin-left:auto 顶到右端 —— 一列状态在同一个 x 上，扫一眼就能挑出想找的那条。
 */
.rr-card-sum {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-family: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.rr-card-sum:hover { background: #f3f4f6; }
.rr-card.is-open .rr-card-sum { border-bottom: 1px dashed #e5e7eb; }
.rr-sum-caret { color: #9ca3af; font-size: 10px; flex: none; }
.rr-sum-who { font-size: 12px; color: #6b7280; white-space: nowrap; }
.rr-sum-reason {
  font-size: 12px;
  color: #4b5563;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.rr-sum-pill { margin-left: auto; flex: none; }
.rr-card-past .rr-card-body { padding-top: 10px; }
.rr-eval {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 10px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 6px;
}
.rr-eval-icon { color: #059669; font-size: 13px; margin-top: 2px; flex: none; }
.rr-eval-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rr-eval-sum { font-size: 12px; font-weight: 700; color: #047857; }
.rr-eval-detail { font-size: 11px; line-height: 1.5; color: #4b5563; }
.rr-withdraw-note {
  margin: 8px 0 0;
  padding: 6px 8px;
  font-size: 11px;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 4px;
}

/* 辅助说明而非独立信息块，故走小字灰色，不做底色/边框 */
.report-tip {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #9ca3af;
}

/* ---- 评估结果（仅有结论时展示，进行中状态在上方报备卡片） ---- */
/*
 * 评估结果：**骨架与「风险标记」上半（`.rk-tag`）同一套** —— 一行 meta（结论标 · 人 · 时刻 ·
 * 去向标）+ 一行左竖线的意见块。两块在同一个 Tab 上讲的是同一类事（谁、什么时候、
 * 下了什么结论，外加一段说明），骨架各写一套就成了两种视觉语言。
 */
.ra-sheet {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}
.ra-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.ra-who { font-size: 12px; font-weight: 600; color: #111827; }
.ra-at { font-size: 12px; color: #6b7280; }
.ra-decision {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 999px;
}
.ra-decision.tone-danger { color: #b91c1c; background: #fee2e2; }
.ra-decision.tone-ok { color: #047857; background: #d1fae5; }
.ra-decision.tone-warn { color: #b45309; background: #fef3c7; }
.ra-decision.tone-info { color: #1d4ed8; background: #dbeafe; }
/* 「升级」的去向标：沿用等级标原来的位置与配色，说的是"派生了新单"而不是"多危险"。新单号内联在标里 */
.ra-derive {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #c2410c;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 4px;
}
/* 意见块：与「风险标记」的 `rk-tag-note` 逐格同形（同一套左竖线、字号与内距） */
.ra-advice {
  margin: 0;
  padding: 6px 10px;
  font-size: 11px;
  line-height: 1.6;
  color: #374151;
  background: #f8fafc;
  border-left: 2px solid #cbd5e1;
  border-radius: 0 4px 4px 0;
  word-break: break-word;
}
.ra-advice-label {
  margin-right: 6px;
  font-weight: 600;
  color: #6b7280;
}
.ra-link { color: #1a6fff !important; font-family: ui-monospace, monospace; }
.ra-link:hover { text-decoration: underline; }
/* ---- 「风险标记」上半：打标结论的只读回显 + 打标入口（并块后与下半共用一个面板） ---- */
.rk-tag {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rk-tag-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.rk-tag-who { font-size: 12px; font-weight: 600; color: #111827; }
.rk-tag-at { font-size: 12px; color: #6b7280; }
.rt-level {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 999px;
}
.rt-level.tone-高 { color: #b91c1c; background: #fee2e2; }
.rt-level.tone-中 { color: #b45309; background: #fef3c7; }
.rt-level.tone-低 { color: #4b5563; background: #f3f4f6; }
.rt-level.tone-none { color: #047857; background: #d1fae5; }
.rt-pool { font-size: 11px; color: #9ca3af; }
.rk-tag-note {
  margin: 0;
  padding: 6px 10px;
  font-size: 11px;
  line-height: 1.6;
  color: #374151;
  background: #fff;
  border-left: 2px solid #cbd5e1;
  border-radius: 0 4px 4px 0;
  word-break: break-word;
}
.rk-tag-note-label {
  margin-right: 6px;
  font-weight: 600;
  color: #6b7280;
}
/* 标记记录：折叠态一行（摘要行整行可点，键盘也要能翻开），展开后横排全部 */
.rt-history {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}
.rt-history-sum {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0;
  font-family: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.rt-history-caret { color: #9ca3af; font-size: 10px; flex: none; }
.rt-history-sum .rt-history-item {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
/*
 * 展开态**一条一行**：每条带上了当次备注之后行长参差，横排会拼成一堵读不动的墙。
 * 竖排还顺带把"第几次"的先后立了起来（时间正序，自上而下就是这条爬坡）。
 */
.rt-history-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding-left: 16px;
}
.rt-history-head { font-size: 11px; font-weight: 600; color: #6b7280; white-space: nowrap; }
/*
 * 带上备注之后它装的是一句话而不是一个标，故圆角收成 6px、允许换行 ——
 * 一枚被撑到两行的胶囊比方角的框更难读。
 */
.rt-history-item {
  max-width: 100%;
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1.6;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  word-break: break-word;
}
.rt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px;
  text-align: center;
  background: #fff;
  border: 1px dashed #e5e7eb;
  border-radius: 8px;
}
.rt-empty-title { margin: 0; font-size: 13px; font-weight: 600; color: #6b7280; }
.rt-empty-hint { margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5; }
/* ---- 协同记录 ---- */
.rc-list { display: flex; flex-direction: column; gap: 10px; }
.rc-item {
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.rc-item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
/* 时刻靠右：与历史报备条的 `.rr-sum-pill` 同一个做法，末位元素靠 auto 顶到行尾 */
.rc-item-time {
  margin-left: auto;
  flex: none;
  font-size: 12px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.rc-item-who { font-size: 12px; font-weight: 600; color: #374151; }
.rc-advice-tag {
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 600;
  color: #9a3412;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 999px;
}
.rc-item-opinion {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.65;
  color: #374151;
  white-space: pre-wrap;
}
.rc-foot { margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.5; }

.ra-empty {
  padding: 20px 14px;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
  background: #fafafa;
  border: 1px dashed #e5e7eb;
  border-radius: 8px;
}

.inline-field {
  display: flex; align-items: center; gap: 8px; width: 100%;
}
.stack-field { display: flex; flex-direction: column; gap: 6px; }

.lbl {
  flex: none; font-size: 12px; font-weight: 600; color: #374151;
}
.lbl-72 { width: 72px; }

.chip-panel { display: flex; flex-direction: column; gap: 12px; }
.panel-neutral {
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px;
}
.req {
  color: #ef4444;
  margin-right: 2px;
  font-weight: 600;
}
.field-err {
  margin: 0;
  font-size: 11px;
  color: #ef4444;
  line-height: 1.3;
}
.risk-monitor-note {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-left: 2px solid #cbd5e1;
  background: #f1f5f9;
  border-radius: 0 4px 4px 0;
}
.risk-monitor-note p { margin: 0; line-height: 1.5; }
.rm-line { font-size: 11px; color: #475569; font-weight: 600; }
.rm-sub { font-size: 11px; color: #64748b; }
.rm-diff { font-size: 11px; color: #b45309; }
</style>
