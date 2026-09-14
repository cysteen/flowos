<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
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
  EditOutlined,
} from '@ant-design/icons-vue';
import { useRiskReportAssess } from '@/composables/useRiskReportAssess';
import OpCollapsibleSection from '../OpCollapsibleSection.vue';
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import { riskLevelText } from '@/config/risk';
import type { TicketRiskVerification } from '@/stores/riskTags';
import type { RiskMonitorDraft } from '@/views/tickets/types/operationTabs';
import {
  RISK_FLAG_OPTIONS,
  RISK_LEVEL_SELECT_OPTIONS,
  type ProcessFormDraft,
  type RiskFlag,
  type RiskLevel,
} from '@/views/tickets/types/operation';
// 本单的报备读口在 B 线自己的 store 里；行类型取合并池的行（同一张单上还可能有
// A 线自动入池的条目，见 riskReports.ts 的 `reportsOf` 说明）。
import { useRiskReportStore } from '@/stores/riskReports';
import { NO_RISK_LOCKED_TIP, canTagNoRisk, useRiskQueueStore } from '@/stores/riskQueue';
import { poolStageStatusOf } from '@/stores/riskPool';
import {
  NO_RISK,
  RISK_TAG_RESULTS,
  isOpenStatus,
  isPooledStatus,
  type AssessDecision,
  type ReportAssessment,
  type RiskPoolItem,
  type RiskTagResult,
} from '@/stores/riskShared';
import OpActionModal from '../OpActionModal.vue';
import { useUserStore } from '@/stores/user';
import { useRiskCollabStore } from '@/stores/riskCollab';
import { resolveTicketTypeFor } from '@/views/tickets/composables/opActions';
import {
  adviceLabelOf,
  advicePlaceholderOf,
  decisionText,
  isEscalateDecision,
  poolStatusText,
} from '../OpRiskDecision';

const props = defineProps<{
  ticketNo: string;
  ticketTitle?: string;
  draft: RiskMonitorDraft;
  form: ProcessFormDraft;
  riskVerification?: TicketRiskVerification | null;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:form': [form: ProcessFormDraft];
}>();

const user = useUserStore();
const reportStore = useRiskReportStore();
const queue = useRiskQueueStore();
const collab = useRiskCollabStore();
const router = useRouter();
const {
  ASSESS_DECISIONS,
  assessOpen,
  assessDecision,
  assessAdvice,
  missAssessDecision,
  missAssessAdvice,
  // 选「升级」后的派生说明行与「本单另有」区：与报备池、底栏两个评估入口同源，本页不另写
  escalateHint,
  assessOthers,
  openAssess,
  confirmAssess,
  canAssessReport,
} = useRiskReportAssess();

/*
 * 决策文案与提示由本页自己给（`../OpRiskDecision`），不取 composable 里那三个：
 * 基线 v1.23 已把「接管」整体作废、定名「升级 / 不升级」，而 composable 与 store 侧的改名
 * 归风险那一路，两边不会同一次落地。工单页把"落到屏幕上的那个词"收在一处，
 * 谁先改都不会出现"按钮写升级、说明写接管"。
 */
const advicePlaceholder = computed(() => advicePlaceholderOf(assessDecision.value));

const expanded = ref({ report: true, assess: true, tag: true, collab: true, risk: true });
const riskLevelOptions = RISK_LEVEL_SELECT_OPTIONS;

/** 本单是不是投诉单。类型不在 props 里，走与操作页同一条取数链——本 Tab 的内容按它分岔 */
const isComplaintTicket = computed(() => resolveTicketTypeFor(props.ticketNo) === '投诉');

/**
 * 本单的**报备**条目（B 线）。
 *
 * 🔴 **不用 `reportStore.reportsOf` 的全量**：那个读口把 A 线自动进池的条目也并了进来
 * （见 `stores/riskReports.ts` 的说明）。A 线的条目在这张列表上会渲染成一条
 * 报备人「系统」、报备原因「其他」、状态写着「实时监控中」的灰点记录 —— 三格全是占位，
 * 读的人会以为有人报过一次却什么都没填。它们是**打标那条链**上的东西，
 * 归下面的「风险打标」块，不进报备记录。判据取 `source`，那是条目自带的身份标。
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

/** 当前承办人可在工单详情页提交评估结论 */
const canAssess = computed(
  () => !props.readonly
    && !!pending.value
    && canAssessReport(pending.value, user.name),
);

function tryAssessArrival() {
  if (!reportStore.consumeAssessArrival(props.ticketNo)) return;
  const p = pending.value;
  if (!p || !canAssessReport(p, user.name)) return;
  expanded.value.report = true;
  nextTick(() => openAssess(p));
}

watch(() => props.ticketNo, tryAssessArrival);
watch(pending, tryAssessArrival);
onMounted(tryAssessArrival);

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

function updateForm(partial: Partial<ProcessFormDraft>) {
  if (props.readonly) return;
  emit('update:form', { ...props.form, ...partial });
}

function onRiskFlagChange(flag: RiskFlag) {
  const needsDesc = flag === '有风险' || flag === '疑似风险';
  updateForm({
    riskFlag: flag,
    riskLevel: flag === '有风险' ? props.form.riskLevel : '',
    riskDescription: needsDesc ? props.form.riskDescription : '',
    riskDescriptionAttachments: needsDesc ? props.form.riskDescriptionAttachments : [],
  });
}

const missRiskLevel = computed(
  () => props.form.riskFlag === '有风险' && !props.form.riskLevel,
);
const missRiskDesc = computed(
  () =>
    (props.form.riskFlag === '疑似风险' || props.form.riskFlag === '有风险')
    && !props.form.riskDescription.trim(),
);

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
    return `风险监控核实：本单 ${v.hitCount} 条命中待核实；风险打标已判「${lv}」· ${t.by}（${t.byRole}）· ${t.at}`;
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

function selectedText(v: unknown): string {
  return v == null ? '' : String(v);
}

function onRiskLevelChange(v: unknown) {
  updateForm({ riskLevel: selectedText(v) as RiskLevel | '' });
}

function formatShortAt(at: string) {
  const m = at.match(/(\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : at;
}

/**
 * 等待时长与头部横幅同源：都取 store 的 `waitedMinutes`（内含 60s 心跳）。
 * 本地各算各的会让同一条报备在横幅与本页显示成两个数。
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
  return `${a.by}（${a.byRole}）${formatShortAt(a.at)}`;
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

const reportSectionBadge = computed(() => {
  // 角标跟着卡片上的状态标走，两处写同一个词
  if (pending.value) return poolStatusText(pending.value.status);
  if (history.value.length) return String(history.value.length);
  return undefined;
});

const reportSectionBadgeVariant = computed(() =>
  pending.value ? 'warn' as const : 'count' as const,
);

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
 * **为什么另开一块，而不是复用下面的「风险标记」区**（2026-09-10 核对后的取舍）。
 *
 * 两块看着都在说"这单有没有风险、多大"，但它们是两套东西，合在一起会当场出三处矛盾：
 *
 * | | 风险标记区（下方） | 风险打标（本块） |
 * |---|---|---|
 * | 存哪 | `ProcessFormDraft.riskFlag / riskLevel / riskDescription`，随「保存」落工单 | `stores/riskQueue.ts` 的条目，**提交即生效**，不等保存 |
 * | 谁填 | **处理人自述**（二线在办这张单时填的判断） | **打标人**（客诉专员 / 投诉督导），带打标人、角色、时刻、打标备注与改判历史 |
 * | 取值 | 是否有风险三档 + 风险等级两个字段 | **四选一**：低 / 中 / 高 / 无风险（一个枚举，非法组合从类型上就没有） |
 * | 作用 | 工单字段，供统计与回传比对（915 §7.3「工单侧优先」） | **进不进风险工单池的那道门**（《【930】》§5A.3） |
 * | 权限 | 二线在**非投诉单**上可写 | **非投诉单的处理人一律不能打**；投诉单由客诉专员在本页打 |
 *
 * 尤其是最后一行：合成一块之后，同一个控件对二线在非投诉单上要可写、对同一批人在
 * 打标这件事上又必须只读 —— 一个控件答不了两个权限。故**新开一块**，
 * 打标结论以只读形式回到风险标记区（那里本来就有一行只读的命中核实结论作邻居）。
 */

/** 本单的 A 线条目（自动识别进来的，一张单至多一条在池，§3.1） */
const tagEntry = computed(() => queue.entriesOf(props.ticketNo).find((e) => !!e.tag)
  ?? queue.entriesOf(props.ticketNo)[0]
  ?? null);
const tagRecord = computed(() => tagEntry.value?.tag ?? null);
/** 打标历史（含改判），时间正序。改判独立成条、不覆盖首次那条 */
const tagHistory = computed(() => (tagEntry.value ? queue.tagHistoryOf(tagEntry.value.id) : []));

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
 * 点不动打标，等于这条口径在那批单上从来没生效过。条目由 store 在打标时按三类判据现补，
 * 见 `riskQueue.ensureEntryFor`。
 *
 * 【但仍然要在点之前把话说清】推不出来源的单（如 P3 投诉单）**不给按钮**，
 * 原地写明原因（`tagBlockReason`）—— 让人填完弹窗才收到一句失败，比按钮不出现糟得多。
 * 判据取 store 的纯函数，与提交时兜底那一句同源，两处不会说出两个理由。
 */
const tagBlockReason = computed(() => queue.tagBlockReasonOf(props.ticketNo));
const canTag = computed(
  () => isComplaintTicket.value && user.roleKey === 'complaint-handler' && !tagBlockReason.value,
);

const tagResults = RISK_TAG_RESULTS;
const tagOpen = ref(false);
const tagResult = ref<RiskTagResult | ''>('');
const tagNote = ref('');
const tagAmendReason = ref('');
const tagTried = ref(false);
/** 已有结论时这次就是**改判**，改判必须说清为什么（首次打标没有这一项） */
const isAmend = computed(() => !!tagRecord.value);
const missTagResult = computed(() => tagTried.value && !tagResult.value);
/*
 * 🔴 **打标备注是可选的，本页不再校验它**（2026-09-11 裁决，三入口统一为可选）。
 * 监控页的单条打标与批量打标本来就没有这道校验，只有本页要求必填 ——
 * 同一个动作在两个入口一个能提交、一个卡住，看着像本页坏了。
 * 打标已经有必填的四选一等级，那才是这次动作的结论；高频动作不该再加一道自由文本门槛。
 * ⚠️ **真正需要理由的是改判**：那里有独立的必填「修正原因」（`missTagAmend`），一格不动。
 */
const missTagAmend = computed(() => tagTried.value && isAmend.value && !tagAmendReason.value.trim());
/**
 * 本单条目已出结论：弹窗里「无风险」一档置灰（《【930】》§5A.3 改判规则；store 侧 `recordTag` 同样拒绝）。
 * 判定走 `riskQueue.canTagNoRisk`，与风险监控页修正弹窗同源；读条目上的现行状态。
 */
const tagNoRiskLocked = computed(() => !!tagEntry.value && !canTagNoRisk(tagEntry.value.status));

function openTag() {
  if (!canTag.value) return;
  tagResult.value = tagRecord.value?.result ?? '';
  tagNote.value = '';
  tagAmendReason.value = '';
  tagTried.value = false;
  tagOpen.value = true;
}

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 提交打标。落 store 走 `recordTagFor`（按单号找条目，状态机的唯一入口；
 * 本单没进过实时监控时由它按三类判据现补一条，见 `riskQueue.ensureEntryFor`）。
 * 打为低 / 中 / 高时 store 同时**回写工单级风险等级**（§6.1）：
 * 工单级 ＝ 该单**各条结论取最高**；同一条**改判以最新结论为准**（改判要填理由，那就是一次人的降级判断）。
 *
 * 🔴 **本轮不发通知**（2026-09-10 业务口径变更）：《【930】》§5A.3 定的 `risk.tagged`
 * 「打标结果通知当前处理人」**本轮不做** —— 现有消息体系要先整体重新梳理，期间不加新事件。
 * 于是「打标结果二线处理人可见且通知」这条口径**只落了"可见"那一半**：
 * 可见 ＝ 页头的打标条 + 本块的只读回显；触达 ＝ 无，处理人得自己打开这张单才看得到。
 * **一线仍不可见**：本 Tab 对一线整个不渲染，页头那条也判掉了一线。
 */
function confirmTag() {
  tagTried.value = true;
  // 备注可选（见 missTagAmend 上方那段）：只拦等级与改判理由这两项真必填的
  if (!tagResult.value) return;
  if (isAmend.value && !tagAmendReason.value.trim()) return;
  if (tagResult.value === NO_RISK && tagNoRiskLocked.value) { message.warning(NO_RISK_LOCKED_TIP); return; }

  const at = nowStamp();
  const res = queue.recordTagFor(props.ticketNo, {
    result: tagResult.value,
    note: tagNote.value.trim(),
    by: user.name || '当前用户',
    byRole: user.role.name || '客诉专员',
    at,
    ...(isAmend.value ? { amendReason: tagAmendReason.value.trim() } : {}),
  });
  if (!res.ok) {
    // 原因由 store 给：挡住它的可能是"不在三类自动识别范围内"，也可能是"这张单查不到"，
    // 两者要人做的事完全不同，不能一律说"本单没有实时监控条目"
    message.warning(res.reason ?? '本单无法在工单页打标');
    return;
  }

  const levelText = tagResult.value === NO_RISK ? '无风险' : riskLevelText(tagResult.value);
  tagOpen.value = false;
  message.success(`已标记为「${levelText}」`);
}

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
      投诉单在本 Tab 上看到的是「风险打标」与「协同记录」两块（《【930】》§3.3 / §5A.3）。
    -->
    <OpCollapsibleSection
      v-if="!isComplaintTicket"
      title="风险报备"
      :icon="ContainerOutlined"
      :badge="reportSectionBadge"
      :badge-variant="reportSectionBadgeVariant"
      :expanded="expanded.report"
      @toggle="expanded.report = !expanded.report"
    >
      <!-- 在队报备：卡片主体 + 元信息，发起入口在底栏弹窗 -->
      <section v-if="pending" class="rr-sheet rr-sheet-pending" aria-label="当前在队报备">
        <header class="rr-sheet-head">
          <div class="rr-sheet-brand">
            <div class="rr-sheet-title-row">
              <span
                class="rr-pill"
                :class="pending.status === '评估中' ? 'rr-pill-doing' : 'rr-pill-pending'"
              >
                <ClockCircleOutlined />
                {{ pendingStateText }}
              </span>
              <span class="rr-sheet-time">提交于 {{ formatShortAt(pending.at) }}</span>
              <span class="rr-sheet-wait">已等待 {{ waitedText(pending.at) }}</span>
            </div>
            <div class="rr-sheet-meta">
              <span class="rr-meta-pair">
                <UserOutlined class="rr-meta-icon" />
                <span class="rr-meta-label">报备人</span>
                <span class="rr-meta-value">{{ pending.by }}</span>
              </span>
              <span class="rr-meta-sep" aria-hidden="true" />
              <span class="rr-meta-pair">
                <span class="rr-meta-label">原因</span>
                <span class="rr-meta-value">{{ pending.reason }}</span>
              </span>
              <template v-if="pending.category">
                <span class="rr-meta-sep" aria-hidden="true" />
                <span class="rr-meta-pair">
                  <span class="rr-meta-label">风险类型</span>
                  <span class="rr-meta-value rr-meta-warn">{{ pending.category }}</span>
                </span>
              </template>
            </div>
          </div>
          <button v-if="canAssess" type="button" class="rr-assess" @click="openAssess(pending)">
            评估
          </button>
          <button v-else-if="canWithdraw" type="button" class="rr-withdraw" @click="openWithdraw">
            撤回
          </button>
          <!-- 按钮消失得给个理由：不写这一句，报备人只会以为撤回入口自己丢了 -->
          <span v-else-if="pending.status === '评估中'" class="rr-withdraw-locked">
            已被领取评估，不可撤回
          </span>
        </header>

        <div class="rr-sheet-body">
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
                <span class="rr-release-at">{{ formatShortAt(rel.at) }}</span>
              </div>
              <div class="rr-release-reason">{{ rel.reason }}</div>
            </div>
          </div>
          <!--
            报备不落子状态、SLA 不停钟（基线 ※29）。工单本身看不出任何变化，
            这句是它在可见区的**唯一**落点：头部那行只挂 hover title，
            两处都不写的话，处理人会以为报备期间单子冻住了、停下来等结论。
          -->
          <p class="rr-sla-note">评估期间本单照常处理，SLA 不停表</p>
        </div>
      </section>

      <div v-if="!pending && !history.length" class="rr-empty">
        <ContainerOutlined class="rr-empty-icon" />
        <p class="rr-empty-title">暂无风险报备</p>
        <p class="rr-empty-hint">请点击底部「风险报备」发起</p>
      </div>

      <!-- 历史报备：时间线样式，与在队卡片同屏可见 -->
      <div v-if="history.length" class="rr-history" :class="{ 'has-pending': pending }">
        <h4 class="rr-history-head">报备记录<span class="rr-history-count">{{ history.length }}</span></h4>
        <div class="rr-timeline">
          <article v-for="h in history" :key="h.id" class="rr-item">
            <div class="rr-rail" aria-hidden="true">
              <span
                class="rr-dot"
                :class="h.status === '已评估' ? 'dot-done' : 'dot-gray'"
              />
              <span class="rr-line" />
            </div>
            <div class="rr-item-body">
              <header class="rr-item-head">
                <span class="rr-item-time">{{ formatShortAt(h.at) }}</span>
                <span class="rr-item-who">{{ h.by }}</span>
                <span class="rr-tag-reason">{{ h.reason }}</span>
                <span v-if="h.category" class="rr-tag-cat">{{ h.category }}</span>
                <span
                  class="rr-pill rr-pill-sm"
                  :class="h.status === '已撤回' ? 'rr-pill-gray' : 'rr-pill-done'"
                >
                  {{ poolStatusText(h.status) }}
                </span>
              </header>
              <p class="rr-item-desc">{{ h.desc }}</p>
              <div v-if="h.attachments.length" class="rr-item-files">
                <PaperClipOutlined />
                <span>{{ h.attachments.join('、') }}</span>
              </div>
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

    <!--
      评估结论：领取后自动打开，或在队卡片点「评估」。
      本弹窗的目标恒为 B 线在队报备（`pending` 只取 source＝二线报备），标题取「评估报备」。
    -->
    <OpActionModal
      v-if="!isComplaintTicket"
      :open="assessOpen"
      title="评估报备"
      :icon="EditOutlined"
      tone="primary"
      :width="520"
      ok-text="提交结论"
      @update:open="assessOpen = $event"
      @ok="confirmAssess"
    >
      <div class="op-form ticket-assess-form">
        <!-- 「本单另有」固定区块（§5.4 ⑦），取数见 riskOthersOf -->
        <section class="ticket-assess-others" aria-label="本单另有">
          <div class="ticket-assess-others-head">本单另有</div>
          <div v-for="row in assessOthers" :key="row.label" class="ticket-assess-others-row">
            <span class="ticket-assess-others-k">{{ row.label }}</span>
            <span class="ticket-assess-others-v">{{ row.text }}</span>
          </div>
        </section>
        <section class="ticket-assess-block">
          <h4 class="ticket-assess-title">评估结论</h4>
          <div class="op-field ticket-assess-dec-field">
            <div class="op-field-h ticket-assess-dec-row">
              <div class="op-label req">评估决策</div>
              <!-- 值取 store 的枚举、字取界面词（※29 定名「升级 / 不升级」），见 OpRiskDecision.ts -->
              <a-radio-group v-model:value="assessDecision" class="ticket-assess-dec-inline">
                <a-radio v-for="d in ASSESS_DECISIONS" :key="d" :value="d">{{ decisionText(d) }}</a-radio>
              </a-radio-group>
            </div>
            <div v-if="missAssessDecision" class="ticket-assess-err ticket-assess-foot">请先选择一个评估决策</div>
            <!-- 选「升级」后的派生说明行（escalateHintOf，三个评估入口同一句） -->
            <div
              v-else-if="isEscalateDecision(assessDecision)"
              class="ticket-assess-hint ticket-assess-foot"
            >{{ escalateHint }}</div>
          </div>
          <div class="op-field">
            <div class="op-label req">{{ adviceLabel(assessDecision) }}</div>
            <a-textarea
              v-model:value="assessAdvice"
              :rows="3"
              :placeholder="advicePlaceholder"
            />
            <div v-if="missAssessAdvice" class="ticket-assess-err">请填写{{ adviceLabel(assessDecision) }}</div>
          </div>
        </section>
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
          结论二选一，**没有风险等级这一档**（N1）——原先并排的等级标已删。
          「升级」的实际产出是一张新投诉单，故头部直接把去向摆出来。
        -->
        <header class="ra-head">
          <span
            class="ra-decision"
            :class="`tone-${decisionTone(latestAssessed.assessment.decision)}`"
          >
            {{ decisionText(latestAssessed.assessment.decision) }}
          </span>
          <!-- 有单号才敢说"已派生"：指不出是哪一张的时候，这句话等于没说 -->
          <span v-if="escalatedNo" class="ra-derive">已派生投诉工单</span>
        </header>

        <dl class="ra-kv">
          <div class="ra-kv-row">
            <dt>评估人</dt>
            <dd>{{ formatAssessor(latestAssessed.assessment) }}</dd>
          </div>
          <div class="ra-kv-row">
            <dt>评估时间</dt>
            <dd>{{ latestAssessed.assessment.at }}</dd>
          </div>
          <div class="ra-kv-row">
            <dt>评估决策</dt>
            <dd>{{ decisionText(latestAssessed.assessment.decision) }}</dd>
          </div>
          <div v-if="escalatedNo" class="ra-kv-row">
            <dt>新投诉单</dt>
            <dd>
              <a
                class="ra-link"
                href="javascript:void(0)"
                @click="openEscalatedTicket(escalatedNo)"
              >{{ escalatedNo }}</a>
            </dd>
          </div>
          <div class="ra-kv-row ra-kv-block">
            <dt>{{ adviceLabel(latestAssessed.assessment.decision) }}</dt>
            <dd class="ra-advice">{{ latestAssessed.assessment.advice }}</dd>
          </div>
        </dl>

        <!-- 两个决策的后续走向完全不同，必须写清楚，否则「不升级」看着像"什么都没发生" -->
        <p class="ra-foot">
          <template v-if="isEscalateDecision(latestAssessed.assessment.decision)">
            本单已由客诉专员升级为投诉工单，原单落「已升级投诉」；后续处理在新单上进行。
          </template>
          <template v-else>
            本单不升级，仍由原处理人按反馈意见继续处理；如后续仍未闭环，可再次发起风险报备。
          </template>
        </p>
      </section>

      <div v-else class="ra-empty">
        尚无评估结论
      </div>
    </OpCollapsibleSection>

    <!--
      风险打标（《【930】》§5A.3）。**读的人是处理人**：等级、打标人、打标时刻三项缺一不可
      —— 少了打标人与时刻，这条结论就成了一句没有出处的判断，处理人无从追问。
      打标备注**可选**（三入口统一，见 script 的 missTagAmend 上方），没填时整行不出，
      不留一格空 dd 让人以为是漏加载。
      写的入口只对投诉单 + 客诉专员出（§3.1），非投诉单在这里恒为只读回显。
    -->
    <OpCollapsibleSection
      title="风险打标"
      :icon="WarningOutlined"
      :badge="tagRecord ? (tagRecord.result === '无风险' ? '无风险' : `${tagRecord.result}危`) : undefined"
      :badge-variant="tagRecord && tagRecord.result !== '无风险' ? 'warn' : 'hint'"
      :expanded="expanded.tag"
      @toggle="expanded.tag = !expanded.tag"
    >
      <section v-if="tagRecord" class="rt-sheet">
        <header class="rt-head">
          <span
            class="rt-level"
            :class="tagRecord.result === '无风险' ? 'tone-none' : `tone-${tagRecord.result}`"
          >
            {{ tagRecord.result === '无风险' ? '无风险' : riskLevelText(tagRecord.result) }}
          </span>
          <span v-if="tagEntry && isPooledStatus(tagEntry.status)" class="rt-pool">
            风险工单池 · {{ poolStatusText(poolStageStatusOf(tagEntry)) }}
          </span>
          <span v-else-if="tagRecord.result === '无风险'" class="rt-pool">不进池</span>
          <!-- 并入痕迹记在打标记录上，不进来源（§5A.1 ④），写法与风险监控页修正弹窗一致 -->
          <span v-if="tagRecord.viaManualScan" class="rt-pool">由手动筛查并入</span>
          <!-- 打标是即时生效的动作，不随「保存」走，故按钮不受 Tab 的表单只读约束，见 script -->
          <a-config-provider v-if="canTag" :component-disabled="false">
            <button type="button" class="rt-btn" @click="openTag">
              {{ isAmend ? '重新打标' : '打标' }}
            </button>
          </a-config-provider>
        </header>
        <dl class="rt-kv">
          <div class="rt-kv-row">
            <dt>打标人</dt>
            <dd>{{ tagRecord.by }}（{{ tagRecord.byRole }}）</dd>
          </div>
          <div class="rt-kv-row">
            <dt>打标时刻</dt>
            <dd>{{ tagRecord.at }}</dd>
          </div>
          <div v-if="tagRecord.note" class="rt-kv-row rt-kv-block">
            <dt>打标备注</dt>
            <dd class="rt-note">{{ tagRecord.note }}</dd>
          </div>
          <!--
            🔴 **界面词一律「修正原因」**，与风险监控页那两处（打标弹窗 · 条目打标弹窗）同名。
            此前本页写「改判理由」、监控页写「修正原因」，同一个字段两个名字。
            取「修正」而不是「改判」：**人点下去的按钮写的就是「修正 / 重新打标」**，
            字段跟着动作走才连得上；「改判」是 PRD 的口径词，不上界面。
          -->
          <div v-if="tagRecord.amendReason" class="rt-kv-row rt-kv-block">
            <dt>修正原因</dt>
            <dd class="rt-note">{{ tagRecord.amendReason }}</dd>
          </div>
        </dl>
        <!-- 改判独立成条、不覆盖首次那条：两条并排才读得出"从中危改成高危"这条爬坡 -->
        <div v-if="tagHistory.length > 1" class="rt-history">
          <span class="rt-history-head">打标历史</span>
          <span v-for="(h, i) in tagHistory" :key="i" class="rt-history-item">
            {{ h.level ? riskLevelText(h.level) : '无风险' }} · {{ h.by }} · {{ formatShortAt(h.at) }}
          </span>
        </div>
        <!--
          ⚠️ 这里曾有一句「本单在池内待处置期间不另收风险报备，出结论后可再发起」。
          **已删**（2026-09-10 收口）：报备的门控收成只看 B 线之后，A 线条目在不在池
          与二线能不能发起报备**再无关系** —— 那句话现在是错的，留着会让二线以为
          按钮点不动，而它其实是亮的。
        -->
        <p class="rt-foot">
          打标结论不改工单状态与处理人；改判独立留一条历史、不覆盖首次那条。
          打为低 / 中 / 高时同时回写工单级风险等级：多条结论取最高，同一条改判以最新结论为准。
        </p>
      </section>

      <div v-else class="rt-empty">
        <template v-if="canTag">
          <p class="rt-empty-title">本单尚未打标</p>
          <a-config-provider :component-disabled="false">
            <button type="button" class="rt-btn" @click="openTag">打标</button>
          </a-config-provider>
        </template>
        <template v-else>
          <p class="rt-empty-title">本单尚未打标</p>
          <!--
            说清"为什么这里没有按钮"：不写这一句，看的人只会以为入口坏了或自己权限少了。
            两种挡法要分开写：**有打标权但这张单进不了监控**（投诉单 + 客诉专员，
            却推不出三类来源）与**这个角色本来就没有打标入口**（非投诉单 / 非客诉专员），
            合成一句会让客诉专员以为自己被降权了。
          -->
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
          <p v-else class="rt-empty-hint">非投诉单的风险等级由客诉专员 / 投诉督导在风险监控页打标产出，处理人没有打标入口；命中规则只给出词表预设等级，供排队与打标预置参考，人不确认不成立</p>
        </template>
      </div>
    </OpCollapsibleSection>

    <!-- 打标弹窗：四选一（必填）+ 打标备注（可选）；已有结论时这次是改判，必须说清为什么 -->
    <OpActionModal
      v-model:open="tagOpen"
      title="风险打标"
      :icon="WarningOutlined"
      tone="warn"
      :width="460"
      ok-text="提交打标"
      @ok="confirmTag"
    >
      <a-config-provider :component-disabled="false">
        <div class="op-form">
          <p class="rt-modal-sub">
            工单 {{ ticketNo }}<template v-if="ticketTitle"> · {{ ticketTitle }}</template>
          </p>
          <div class="op-field">
            <div class="op-label req">风险等级</div>
            <a-radio-group v-model:value="tagResult" class="rt-radio-row">
              <a-radio
                v-for="r in tagResults"
                :key="r"
                :value="r"
                :disabled="r === NO_RISK && tagNoRiskLocked"
                :title="r === NO_RISK && tagNoRiskLocked ? NO_RISK_LOCKED_TIP : undefined"
              >
                {{ r === '无风险' ? '无风险' : riskLevelText(r) }}
              </a-radio>
            </a-radio-group>
            <p v-if="missTagResult" class="field-err">请选择风险等级</p>
            <p class="rt-modal-tip">
              <template v-if="tagNoRiskLocked">{{ NO_RISK_LOCKED_TIP }}。</template>
              标为 低 / 中 / 高 即进风险工单池等客诉专员处置；标为「无风险」不进池。
            </p>
          </div>
          <div class="op-field">
            <div class="op-label">打标备注</div>
            <a-textarea
              v-model:value="tagNote"
              :rows="3"
              placeholder="判断依据与后续动作（可选）"
            />
          </div>
          <div v-if="isAmend" class="op-field">
            <!-- 界面词与监控页两处打标弹窗统一为「修正原因」，理由见上方只读那一格的注释 -->
            <div class="op-label req">修正原因</div>
            <a-textarea
              v-model:value="tagAmendReason"
              :rows="2"
              :status="missTagAmend ? 'error' : undefined"
              placeholder="上一次判的是什么、这次为什么改…"
            />
            <p v-if="missTagAmend" class="field-err">请填写修正原因</p>
          </div>
        </div>
      </a-config-provider>
    </OpActionModal>

    <!--
      协同记录（《【930】》§3.3 界面落点之一）。**只在投诉单上出现** ——
      协同处理的类型集是「投」，非投诉单那一路走报备与评估。
      发起入口在底部操作条那一枚按钮（协同处理形态），本块只回看。
    -->
    <OpCollapsibleSection
      v-if="isComplaintTicket"
      title="协同记录"
      :icon="CheckCircleOutlined"
      :badge="collabSectionBadge"
      badge-variant="count"
      :expanded="expanded.collab"
      @toggle="expanded.collab = !expanded.collab"
    >
      <div v-if="collabRecords.length" class="rc-list">
        <article v-for="c in collabRecords" :key="c.id" class="rc-item">
          <header class="rc-item-head">
            <span class="rc-item-time">{{ formatShortAt(c.at) }}</span>
            <span class="rc-item-who">{{ c.by }}（{{ c.byRole }}）</span>
            <span
              v-for="a in c.advices"
              :key="a"
              class="rc-advice-tag"
            >{{ a === '其他' && c.otherAdvice ? `其他 · ${c.otherAdvice}` : a }}</span>
          </header>
          <p class="rc-item-opinion">{{ c.opinion }}</p>
        </article>
        <p class="rc-foot">协同处理不改工单状态与处理人；建议事项挂在工单上，由当前处理人执行。</p>
      </div>
      <div v-else class="ra-empty">
        尚无协同记录，可在底部操作条点「协同处理」发起
      </div>
    </OpCollapsibleSection>

    <OpCollapsibleSection
      title="风险标记"
      :icon="WarningOutlined"
      body-variant="risk"
      :expanded="expanded.risk"
      @toggle="expanded.risk = !expanded.risk"
    >
      <div class="chip-panel panel-neutral">
        <div class="field inline-row risk-row">
          <label>是否有风险</label>
          <a-radio-group
            :value="form.riskFlag || undefined"
            class="radio-row"
            @update:value="(v: RiskFlag) => onRiskFlagChange(v)"
          >
            <a-radio v-for="opt in RISK_FLAG_OPTIONS" :key="opt" :value="opt">{{ opt }}</a-radio>
          </a-radio-group>
          <template v-if="form.riskFlag === '有风险'">
            <label class="field-label-sm risk-level-label"><span class="req">*</span>风险等级</label>
            <FormSelect
              class="risk-level-select"
              :class="{ 'ctrl-missing': missRiskLevel }"
              :value="form.riskLevel || undefined"
              :options="riskLevelOptions"
              placeholder="请选择或搜索"
              @update:value="onRiskLevelChange"
            />
          </template>
        </div>
        <p v-if="missRiskLevel" class="field-err">请选择风险等级</p>
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
          本区的三个字段是**处理人自述**，随「保存」落工单；上方「风险打标」块是**打标人**
          给的结论，提交即生效、决定这张单进不进风险工单池。两者不是同一件事，
          不写这一句，两块摆在一屏上会被当成同一个字段的两个入口。
        -->
        <p v-if="tagRecord" class="risk-flag-note">
          本区是处理人自述，与上方「风险打标」是两件事：打标由客诉专员 / 投诉督导给出，本区取值不覆盖它。
        </p>
        <div
          v-if="form.riskFlag === '疑似风险' || form.riskFlag === '有风险'"
          class="field"
          :class="{ 'is-missing': missRiskDesc }"
        >
          <label><span class="req">*</span>风险描述</label>
          <a-textarea
            :value="form.riskDescription"
            :rows="3"
            :status="missRiskDesc ? 'error' : undefined"
            placeholder="描述风险点、影响范围与建议处置…（必填）"
            @update:value="(v: string) => updateForm({ riskDescription: v ?? '' })"
          />
          <p v-if="missRiskDesc" class="field-err">请填写风险描述</p>
        </div>
      </div>
    </OpCollapsibleSection>
  </div>
</template>

<style scoped>
.risk-tab { display: flex; flex-direction: column; gap: 12px; width: 100%; }

/* ---- 风险报备：在队卡片 ---- */
.rr-sheet {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}
.rr-sheet-pending {
  border-color: #fed7aa;
  box-shadow: 0 1px 3px rgba(234, 88, 12, 0.06);
}
.rr-sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: linear-gradient(180deg, #fff7ed 0%, #fff 100%);
  border-bottom: 1px solid #ffedd5;
}
.rr-sheet-brand { min-width: 0; flex: 1; }
.rr-sheet-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
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
.rr-sheet-time { font-size: 13px; font-weight: 600; color: #9a3412; }
.rr-sheet-wait { font-size: 12px; color: #ea580c; }
.rr-sheet-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 0;
  margin-top: 8px;
}
.rr-meta-pair {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.rr-meta-icon { color: #9ca3af; font-size: 12px; }
.rr-meta-label { color: #9ca3af; }
.rr-meta-value { color: #374151; font-weight: 600; }
.rr-meta-warn { color: #c2410c; }
.rr-meta-sep {
  width: 1px;
  height: 12px;
  margin: 0 10px;
  background: #e5e7eb;
  flex: none;
}
.rr-assess {
  flex: none;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #93c5fd;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.rr-assess:hover { background: #dbeafe; border-color: #60a5fa; }
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
.rr-sheet-body { padding: 12px 14px 14px; }
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
/* SLA 口径行：是背景信息不是要读的内容，压到最轻，不与场景描述抢 */
.rr-sla-note {
  margin: 8px 0 0;
  font-size: 11px;
  color: #9ca3af;
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

/* ---- 历史时间线 ---- */
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
.rr-timeline { display: flex; flex-direction: column; gap: 0; }
.rr-item { display: flex; gap: 10px; }
.rr-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 16px;
  flex: none;
  padding-top: 4px;
}
.rr-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.rr-dot.dot-done { background: #10b981; box-shadow: 0 0 0 3px #d1fae5; }
.rr-dot.dot-gray { background: #d1d5db; box-shadow: 0 0 0 3px #f3f4f6; }
.rr-line {
  flex: 1;
  width: 1px;
  min-height: 12px;
  margin: 4px 0;
  background: #e5e7eb;
}
.rr-item:last-child .rr-line { display: none; }
.rr-item-body {
  flex: 1;
  min-width: 0;
  padding-bottom: 14px;
}
.rr-item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.rr-item-time { font-size: 12px; font-weight: 700; color: #111827; }
.rr-item-who { font-size: 12px; color: #6b7280; }
.rr-tag-reason,
.rr-tag-cat {
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 4px;
}
.rr-tag-reason { color: #475569; background: #f1f5f9; border: 1px solid #e2e8f0; }
.rr-tag-cat { color: #c2410c; background: #fff7ed; border: 1px solid #fed7aa; }
.rr-item-desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #4b5563;
}
.rr-item-files {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: #94a3b8;
}
.rr-item-files :deep(.anticon) { font-size: 11px; }
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
.ra-sheet {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}
.ra-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  border-bottom: 1px solid #f1f5f9;
}
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
/* 「升级」的去向标：沿用等级标原来的位置与配色，说的是"派生了新单"而不是"多危险" */
.ra-derive {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #c2410c;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 4px;
}
.ra-kv {
  margin: 0;
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ra-kv-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px 12px;
  align-items: start;
}
.ra-kv-row dt {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
  font-weight: 500;
  line-height: 1.6;
}
.ra-kv-row dd {
  margin: 0;
  font-size: 12px;
  color: #111827;
  font-weight: 500;
  line-height: 1.6;
  word-break: break-word;
}
.ra-kv-block { grid-template-columns: 1fr; gap: 4px; }
.ra-kv-block dt { color: #374151; font-weight: 600; }
.ra-advice {
  padding: 8px 10px;
  background: #f8fafc;
  border-left: 2px solid #cbd5e1;
  border-radius: 0 4px 4px 0;
  font-weight: 400 !important;
  color: #374151 !important;
}
.ra-link { color: #1a6fff !important; font-family: ui-monospace, monospace; }
.ra-link:hover { text-decoration: underline; }
.ra-foot {
  margin: 0;
  padding: 8px 14px 12px;
  font-size: 11px;
  line-height: 1.6;
  color: #6b7280;
  border-top: 1px dashed #f1f5f9;
}
/* ---- 风险打标（A 线结论的只读回显 + 打标入口） ---- */
.rt-sheet {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}
.rt-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  border-bottom: 1px solid #f1f5f9;
}
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
.rt-btn {
  margin-left: auto;
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
.rt-btn:hover { background: #fff1e6; border-color: #fb923c; }
.rt-kv {
  margin: 0;
  padding: 12px 14px 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rt-kv-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px 12px;
  align-items: start;
}
.rt-kv-row dt {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
  font-weight: 500;
  line-height: 1.6;
}
.rt-kv-row dd {
  margin: 0;
  font-size: 12px;
  color: #111827;
  font-weight: 500;
  line-height: 1.6;
  word-break: break-word;
}
.rt-kv-block { grid-template-columns: 1fr; gap: 4px; }
.rt-kv-block dt { color: #374151; font-weight: 600; }
.rt-note {
  padding: 8px 10px;
  background: #f8fafc;
  border-left: 2px solid #cbd5e1;
  border-radius: 0 4px 4px 0;
  font-weight: 400 !important;
  color: #374151 !important;
}
.rt-history {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 0 14px 8px;
}
.rt-history-head { font-size: 11px; font-weight: 600; color: #6b7280; }
.rt-history-item {
  padding: 1px 8px;
  font-size: 11px;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
}
.rt-foot {
  margin: 0;
  padding: 8px 14px 12px;
  font-size: 11px;
  line-height: 1.6;
  color: #6b7280;
  border-top: 1px dashed #f1f5f9;
}
.rt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 14px;
  text-align: center;
  background: #fafafa;
  border: 1px dashed #e5e7eb;
  border-radius: 8px;
}
.rt-empty-title { margin: 0; font-size: 13px; font-weight: 600; color: #6b7280; }
.rt-empty-hint { margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5; }
.rt-empty .rt-btn { margin-left: 0; }
.rt-modal-sub { margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5; }
.rt-modal-tip { margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.5; }
.rt-radio-row { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; }

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
.rc-item-time { font-size: 12px; font-weight: 700; color: #111827; }
.rc-item-who { font-size: 12px; color: #6b7280; }
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

/* 两块摆在一屏上时的分界说明，压到最轻，不与字段抢 */
.risk-flag-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #9ca3af;
}

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

.form-select { flex: 1; min-width: 0; }
.form-select :deep(.ant-select-selector) {
  min-height: 32px !important;
  height: 32px !important;
  padding: 0 8px !important;
  border-radius: 6px !important;
  border-color: #e5e7eb !important;
  background: #fff !important;
  box-shadow: none !important;
  font-size: 12px;
}
.form-select :deep(.ant-select-selection-item),
.form-select :deep(.ant-select-selection-placeholder) {
  line-height: 30px !important;
  font-size: 12px;
}
.form-select :deep(.ant-select-selection-placeholder) { color: #9ca3af; }
.form-select :deep(.ant-select-arrow) { color: #9ca3af; font-size: 10px; }
.form-select:hover :deep(.ant-select-selector),
.form-select.ant-select-focused :deep(.ant-select-selector) {
  border-color: #e5e7eb !important;
  box-shadow: none !important;
}

.chip-panel { display: flex; flex-direction: column; gap: 12px; }
.panel-neutral {
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px;
}
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 12px; font-weight: 600; color: #374151; }
.field-label-sm { font-size: 11px; font-weight: 500; color: #6b7280; }
.inline-row { flex-direction: row; align-items: center; gap: 12px; }
.radio-row { display: flex; gap: 14px; font-size: 12px; }
.chip-panel :deep(.ant-radio-wrapper) { white-space: nowrap; }
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
.field.is-missing label { color: #b91c1c; }
.ctrl-missing :deep(.ant-select-selector) {
  border-color: #fca5a5 !important;
}
.risk-row {
  flex-wrap: wrap;
  align-items: center;
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
.risk-level-label {
  margin-left: 4px;
  flex: none;
  white-space: nowrap;
}
.risk-level-select {
  width: 140px;
  flex: none;
}
.risk-level-select :deep(.ant-select-selector) {
  height: 28px;
  min-height: 28px;
  font-size: 12px;
}
.risk-level-select :deep(.ant-select-selection-item),
.risk-level-select :deep(.ant-select-selection-placeholder) {
  font-size: 12px;
  line-height: 26px;
}

/* ---- 评估结论弹窗（领取后自动打开） ---- */
.ticket-assess-form { gap: 12px !important; }
.ticket-assess-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}
.ticket-assess-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.ticket-assess-dec-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin: 0;
}
.ticket-assess-dec-row > .op-label {
  flex: none;
  width: 72px;
  text-align: right;
  white-space: nowrap;
}
.ticket-assess-dec-inline {
  display: inline-flex !important;
  flex: 1;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ticket-assess-dec-inline :deep(.ant-radio-wrapper) {
  margin: 0 !important;
  padding: 6px 12px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  line-height: 1.45;
  font-size: 12px;
  white-space: nowrap;
  align-items: center;
}
.ticket-assess-dec-inline :deep(.ant-radio-wrapper-checked) {
  border-color: #1a6fff;
  background: #eff6ff;
}
.ticket-assess-dec-inline :deep(.ant-radio) { margin-top: 0; top: 0; }
.ticket-assess-foot { margin-left: calc(72px + 10px); margin-top: 4px; }
.ticket-assess-err {
  margin-top: 4px;
  font-size: 11px;
  color: #ef4444;
  line-height: 1.4;
}
/* 派生说明行：与底栏评估弹窗的 .ticket-assess-hint 同一套 token（讲后果不是报错，取中性灰） */
.ticket-assess-hint {
  margin-top: 4px;
  font-size: 11px;
  color: #6b7280;
  line-height: 1.5;
}
/* 「本单另有」区：三个评估入口同一副版式 */
.ticket-assess-others {
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.ticket-assess-others-head {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}
.ticket-assess-others-row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.6;
}
.ticket-assess-others-k {
  flex: none;
  width: 72px;
  color: #9ca3af;
}
.ticket-assess-others-v {
  flex: 1;
  min-width: 0;
  color: #374151;
  word-break: break-word;
}
</style>
