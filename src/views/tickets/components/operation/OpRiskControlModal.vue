<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { SafetyCertificateOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import RiskAssessSheet from './RiskAssessSheet.vue';
// 选「升级」后那一段投诉专属建单要素（投诉一类 / 投诉二类）：与风险监控页、风险报备池
// 另外两处评估弹窗共用同一个组件
import EscalateComplaintFields from './EscalateComplaintFields.vue';
// 投诉支那三项（处理意见 / 建议事项 /「其他」的具体建议）：与风险工单池的协同处理弹窗共用同一份
import RiskCollabFields from './RiskCollabFields.vue';
// 风险等级段：**六处「风险管控」弹窗共用同一份呈现**（2026-09-29 裁决）。
// 非投诉支走真实例 `useRiskLevelFields`（落库 recordTagFor）；投诉支上半各有既有状态与落库路径，
// 用 `makeRiskLevelFieldsView` 包一层薄适配器交给同一个组件渲染。
import RiskLevelFields from './RiskLevelFields.vue';
import { useRiskReportAssess } from '@/composables/useRiskReportAssess';
import { makeRiskLevelFieldsView, useRiskLevelFields } from '@/composables/useRiskLevelFields';
import { useRiskCollabFields } from '@/composables/useRiskCollabFields';
import { useRiskPoolStore } from '@/stores/riskPool';
import { useRiskReportStore } from '@/stores/riskReports';
import { NO_RISK_LOCKED_TIP, canTagNoRisk, useRiskQueueStore } from '@/stores/riskQueue';
import { useUserStore } from '@/stores/user';
import { riskLevelText } from '@/config/risk';
import {
  NO_RISK,
  REPORT_SOURCE,
  isOpenStatus,
  isPoolLevel,
  isPooledStatus,
  type RiskPoolItem,
  type RiskTagResult,
} from '@/stores/riskShared';
import {
  adviceLabelOf,
  advicePlaceholderOf,
  decisionText,
} from './OpRiskDecision';
import { canTagRiskOnTicketPage } from '@/views/tickets/composables/opActionRegistry';

/**
 * **风险管控** —— 工单处理页**页头右上角**那一枚按钮点开的东西（「新建补充」旁）。
 *
 * 🔴 **一枚按钮 + 一个弹窗，内容按原单类型分岔**（基线 ※29 按原单类型分形态）：
 * - **非投诉单** → 第一区块（入池依据 / 报备信息）+「风险等级」段 +「评估结论」段
 *   （升级 / 不升级，选「升级」再接出投诉工单专属字段）。点开时若那条条目还没人领，
 *   **先自动领到自己名下**。等级段与**风险报备池**那一处同源：同一张报备单从哪个入口评，
 *   定级这件事都得做（2026-09-29 拍板）。
 * - **投诉单** → **按数据有无分两种形态**（2026-09-29 补裁决）：
 *   · 本单**有**池内条目 → 第一区块 + 上半「风险等级」段（标记 / 改判）+「协同处理」段；
 *   · 本单**没有**池内条目（尚未标记 / 已标成无风险）→ **只出上半「风险等级」段** ——
 *     第一区块没有 target 就不渲染，协同处理是对池内条目做的事、池外无从谈起。
 *     标成低 / 中 / 高之后条目进池，下次再打开就是完整形态，链路自洽、不需要补丁。
 *
 * 🔴 **上半是 2026-09-29 裁决搬过来的**：「风险报备」Tab 的「风险标记」块里原来有一枚
 * 「标记 / 重新标记」按钮与一个自持的弹窗，那一对已整块撤掉，标记改由页头这一枚承担。
 * 上半与风险监控页那个「风险管控」弹窗**同构**（四选一等级 · 标记备注），
 * 权限判据走共享的 `canTagRiskOnTicketPage`（原单类型 ∧ 标记权 ∧ 这张单推不推得出来源，
 * 与页头按钮的出现条件同一份），落库仍是 `riskQueue.recordTagFor` 那条唯一入口
 * —— **没有新判据、没有第二条落库路径**。
 * **非投诉单不出上半**：工单页不允许标记非投诉单（标记归风险监控页），口径一格未动。
 *
 * 两支的字段、校验、派生、落库、通知与履历**一律沿用原来那两个弹窗的规格**，
 * 本组件只做入口与组装：评估那一段走 `useRiskReportAssess` + `EscalateComplaintFields`，
 * 协同那一段走 `useRiskCollabFields` + `RiskCollabFields`（与风险工单池那个弹窗同一份）。
 *
 * 🔴 **它落在页头而不是底栏**：这是**非处理人**（客诉专员 / 管理员）的权限，
 * 底栏那一排是本单处理人的流转动作。底栏只剩「风险报备」那一种形态。
 *
 * 标题恒为「风险管控」，来源（实时监控 / 重点工单 / 二线报备）与单号写在**副标题**上 ——
 * 原「风险评估」「评估报备」「协同处理」三个弹窗标题在本页不再出现。
 */
const props = defineProps<{
  open: boolean;
  ticketNo: string;
  /** 原单类型。分岔的第一维，由工单页给（页头按钮的出现条件判的是同一个值） */
  ticketType: string;
}>();

const emit = defineEmits<{ 'update:open': [v: boolean] }>();

const user = useUserStore();
const pool = useRiskPoolStore();
const reportStore = useRiskReportStore();
const queue = useRiskQueueStore();

const isComplaint = computed(() => props.ticketType === '投诉');

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------------- 非投诉支：风险等级 + 评估结论 ---------------- */

/**
 * 非投诉支的**风险等级段**。它承载的是 B 线（二线报备）那条条目 ——
 * 同一张报备单在**风险报备池**里评估时要定级，从工单页页头评估时也要定，
 * 一件事两个入口一套规则（2026-09-29 拍板「页头这一支也出等级段，与报备池同源」）。
 *
 * 🔴 与**投诉支上半**不是同一段、也不会同时出现：投诉支走的是 `props.open`，
 * 从不经过 `openAssess`，本段所在的 `v-if="!isComplaint"` 分支也就渲染不到它。
 * 段内的取值域、必填规则（已有则预置可改、本来没有则必填）与落库（`recordTagFor`
 * 那条与标记同一的唯一入口）全在 `useRiskLevelFields` 里，本组件不另写一套。
 */
const assessLevel = useRiskLevelFields();

const {
  ASSESS_DECISIONS,
  assessOpen,
  assessTarget,
  assessDecision,
  assessAdvice,
  missAssessDecision,
  missAssessAdvice,
  assessOkText,
  escalateFields,
  showEscalateFields,
  openAssess,
  confirmAssess,
  canAssessReport,
} = useRiskReportAssess({ level: assessLevel });

/** 本单**未出结论**的那条条目（至多一条：同单在队至多一条，基线 ※29） */
const openItem = computed<RiskPoolItem | null>(
  () => reportStore.reportsOf(props.ticketNo).find((r) => isOpenStatus(r.status)) ?? null,
);

/**
 * 打开（非投诉支）：先把条目领到自己名下（已在自己名下的跳过这一步），再弹表单。
 *
 * 领取会往 `assessArrivalTicket` 写一笔（那是"领取后跳工单页自动弹评估"用的信号），
 * 这里**当场消费掉**——那张票此刻已经兑现（人就站在表单前面），留着它
 * 只会让 `tryAssessArrival` 再走一遍同样的路。
 */
watch(
  () => props.open,
  (v) => {
    if (!v) return;
    if (isComplaint.value) {
      // 上半灌回现行结论、下半每次从空开始（全空＝不协同）
      resetTag();
      collab.reset();
      return;
    }
    const t = openItem.value;
    if (!t) {
      message.warning('本单没有待评估的风险条目');
      emit('update:open', false);
      return;
    }
    // 存储值仍是「待分派」，界面写「待领取」（改名归风险 store 那一路，见 OpRiskDecision.ts）
    if (t.status === '待分派') {
      // 第三个实参是**领取那一刻的实际角色**，落在 `risk.report.claimed` 的正文落款上
      // （`riskPool.notifyClaimed`：不写死「客诉专员」，管理员兜底领取是常规路径）
      pool.claim(t.id, user.name || '当前用户', user.role.name);
      reportStore.consumeAssessArrival(props.ticketNo);
    }
    if (t.assignee !== (user.name || '当前用户')) {
      message.warning(`本条已由 ${t.assignee} 领取，请由领取人给出结论`);
      emit('update:open', false);
      return;
    }
    openAssess(t);
    // openAssess 有自己的拦截（条目不在「已领取」态时只弹提示不开窗）。它没开成时
    // 把外部开关收回来 —— 否则 `riskControlOpen` 卡在 true，再点按钮 props.open 没变化、
    // 本 watch 不再触发，那枚按钮就成了死按钮。
    if (!assessOpen.value) emit('update:open', false);
  },
);

/**
 * 从风险报备池 / 风险监控页**领取后跳到这张单**时自动把评估表单弹出来（《【930】》O18）。
 *
 * 信号是 `claim` 埋下的 `assessArrivalTicket`（`stores/riskPool.ts`），一次性票：
 * **消费掉就不再补第二次**，它是"这一跳"的连带，不是条目的属性；释放时由 `release` 撤票。
 * 判据与人点页头那条路一致 —— 只对**已在自己名下的在队条目**开（`canAssessReport`）；
 * 条目已被别人领走、或已被释放退回池里的，票照样烧掉但什么都不弹。
 *
 * 只对**非投诉支**成立：投诉单不做风险评估，池里那条走协同处理，没有"领取"这一步。
 */
function tryAssessArrival() {
  if (isComplaint.value) return;
  if (!reportStore.consumeAssessArrival(props.ticketNo)) return;
  const t = openItem.value;
  if (!t || !canAssessReport(t, user.name)) return;
  openAssess(t);
}

watch(() => props.ticketNo, tryAssessArrival);
watch(openItem, tryAssessArrival);
onMounted(tryAssessArrival);

/** 内部表单关掉时把外部 open 一并收回，两个开关不能各走各的（非投诉支） */
watch(assessOpen, (v) => {
  if (!v && props.open && !isComplaint.value) emit('update:open', false);
});

const adviceLabel = computed(() => adviceLabelOf(assessDecision.value));
const advicePlaceholder = computed(() => advicePlaceholderOf(assessDecision.value));

/* ---------------- 投诉支上半：风险等级（标记 / 改判） ---------------- */

/**
 * 本单的 A 线条目（一张单至多一条在池，《【930】》§3.1）。
 * 取法与「风险报备」Tab 的「风险标记」块逐字同源：优先取带结论那条，没有就取第一条。
 */
const tagEntry = computed(() => queue.entriesOf(props.ticketNo).find((e) => !!e.tag)
  ?? queue.entriesOf(props.ticketNo)[0]
  ?? null);
const tagRecord = computed(() => tagEntry.value?.tag ?? null);
/** 这张单推不推得出监控来源；推不出来就没得标记（原因由 store 给，与提交时兜底那一句同源） */
const tagBlockReason = computed(() => queue.tagBlockReasonOf(props.ticketNo));
/**
 * 上半出不出 ＝ 共享判据 `canTagRiskOnTicketPage`（原单类型 ∧ 标记权 ∧ 这张单推得出来源）。
 * **工单页三处共用那一份**：页头按钮的出现条件（`TicketOperationView.showRiskControl`
 * 的投诉支）、本段的显隐、「风险报备」Tab 空态那句的分岔。
 * 非投诉单在工单页不允许标记（标记归风险监控页），故上半只可能在投诉支出现。
 */
const canTag = computed(
  () => canTagRiskOnTicketPage(props.ticketType, user.roleKey, tagBlockReason.value),
);

const tagResult = ref<RiskTagResult | ''>('');
/**
 * 本次标记的**标记备注**。
 *
 * 🔴 **原来它旁边还有一格必填的「修正原因」，2026-09-29 裁决已取消**（两格用途重叠，
 * 改判时人得把同一件事写两遍）。**取消的是字段、不是约束**：原先"改判必须填修正原因"
 * 那道硬校验**迁到本格** —— **改判时标记备注必填**，首次标记仍可选。
 * 故本格在改判形态下**不预填上一次那条**，否则上一次的备注会自动满足这一次的必填。
 */
const tagNote = ref('');
const tagTried = ref(false);
/** 已有结论时这次就是**改判**，改判必须说清为什么（首次标记没有这一项） */
const isAmend = computed(() => !!tagRecord.value);
/**
 * 等级或标记备注动过没有。与风险监控页 `entryTagDirty` 同一口径 ——
 * 没动过还落一遍，标记记录里就多一条与上一条逐字相同的记录、条数还虚增。
 * 备注那一项判的是"**填了东西且与上一条不同**"：改判形态下它从空开始，
 * 若照旧直接比较，一打开就成了"动过"。
 */
const tagDirty = computed(() => {
  const cur = tagRecord.value;
  if (!cur) return !!tagResult.value;
  const note = tagNote.value.trim();
  return tagResult.value !== cur.result || (!!note && note !== cur.note);
});
/** 这一次上半落不落：首次标记必落；改判形态只在真动过时落 */
const tagRetag = computed(
  () => canTag.value && !!tagResult.value && (!isAmend.value || tagDirty.value),
);
const missTagResult = computed(() => tagTried.value && canTag.value && !tagResult.value);
/** 「为什么改」只在**真改判**时问得出口：没改判的那一路（只补协同）不要它 */
const missTagNote = computed(
  () => tagTried.value && tagRetag.value && isAmend.value && !tagNote.value.trim(),
);
/**
 * 已出结论的条目「无风险」一档置灰（《【930】》§5A.3 改判规则；store 侧 `recordTag` 同样拒绝）。
 * 判定走 `riskQueue.canTagNoRisk`，与风险监控页那两处修正弹窗同源；读条目上的现行状态。
 */
const tagNoRiskLocked = computed(() => !!tagEntry.value && !canTagNoRisk(tagEntry.value.status));

/**
 * 投诉支上半那一段交给**六处共用**的 `RiskLevelFields` 渲染
 * （2026-09-29 裁决「风险等级段收敛成一份共享件、一种呈现」）。
 *
 * 🔴 **只是把既有状态包一层给组件看**：本支的校验与落库仍走 `onComplaintOk`
 * 里那条既有路径，state、判据与写库一格未动。
 * · `visible` 给 `canTag`（**保留角色维那道门**：原单类型 ∧ 标记权 ∧ 这张单推得出来源），
 *   不换成共享件自己那个 `visible`，两者判据不同；
 * · `required`：本来没有等级才标必填（原先这一段连标签都没有、更没有星，
 *   `canSaveTag` 那一路的可提交性不受影响）。
 */
const tagLevelView = makeRiskLevelFieldsView({
  getLevel: () => tagResult.value,
  setLevel: (r) => { tagResult.value = r; },
  getNote: () => tagNote.value,
  setNote: (v) => { tagNote.value = v; },
  visible: canTag,
  isAmend,
  required: computed(() => canTag.value && !isAmend.value),
  missLevel: missTagResult,
  missNote: missTagNote,
  noRiskLocked: tagNoRiskLocked,
});

/**
 * 打开时把现行**等级**灌回来：改完才知道自己动了哪一项（与风险监控页 `openEntryTag` 同形）。
 * 备注**不灌**：改判形态下它承载"为什么改"，预填会让那道必填名存实亡。
 */
function resetTag() {
  tagResult.value = tagRecord.value?.result ?? '';
  tagNote.value = '';
  tagTried.value = false;
}

/* ---------------- 投诉支下半：协同处理（规格一格未动，字段与落库走共享件） ---------------- */

const collab = useRiskCollabFields();

/** 本单在**风险工单池**里的那条 A 线条目（一张单至多一条，《【930】》§3.1） */
const poolItem = computed<RiskPoolItem | null>(
  () => reportStore
    .reportsOf(props.ticketNo)
    .find((r) => r.source !== REPORT_SOURCE && isPooledStatus(r.status)) ?? null,
);

/**
 * 下半「协同处理」段出不出。**两道，缺一不可**：
 * ① **本单得有池内条目**（`poolItem`）—— 协同处理是对池内那条条目做的事
 *    （`submitTo` 到池里找它）。尚未标记 / 已标成无风险的单进不来这一支，
 *    此时弹窗只剩上半「风险等级」段，是**只标记**的形态（2026-09-29 补裁决）；
 * ② 上半出得来时还要跟着上半的取值走（与风险监控页 `showTagCollabFor` 同一口径）：
 *    判为「无风险」的条目会被撤出风险工单池，池外没有可协同的条目，那一段留着
 *    只会让人填完再收到一句"本单已不在风险工单池中"。
 *    上半出不来的角色（非客诉专员 / 这张单推不出来源）不受第二道约束 ——
 *    那一路这个弹窗就只是协同处理，与本轮之前逐字相同。
 */
const showCollab = computed(
  () => !!poolItem.value && (!canTag.value || isPoolLevel(tagResult.value as RiskTagResult)),
);

/**
 * ③ 段动过没有。**全空 ＝ 不处置**（与风险监控页那套同形）：只想改个等级的人
 * 不该被这一段拦在这儿。
 *
 * 判据取共享件那一份（`collab.filled`），本组件不再自己数一遍三个字段 ——
 * 2026-09-30「风险处理措施非必填」之后，"这一次有没有给出东西"成了这一段唯一的门，
 * 两处各判一遍迟早分叉。
 */
const collabFilled = computed(() => collab.filled.value);

/**
 * 投诉支提交。上半（标记 / 改判）与下半（协同处理）**各自可留空**，
 * 顺序与判据一律照风险监控页那个「风险管控」弹窗（`saveEntryTag`）：
 *   ① 上半出不来的角色：这一次只可能是协同，原样交给共享件 `submitTo`（含它自己的三道拦截）；
 *   ② 两半都没给东西才是"什么都没发生"，才拦；
 *   ③ 下半的校验（只剩「其他」那一项的条件必填）**整个跑在任何写入之前** ——
 *      人只是漏填了「其他」的具体建议，不该换来一条已经被改了等级的条目；
 *   ④ 落库先上半后下半：`submitTo` 要在池里找得到这条条目。
 */
function onComplaintOk() {
  if (!canTag.value) {
    if (collab.submitTo(props.ticketNo)) emit('update:open', false);
    return;
  }
  tagTried.value = true;
  const retag = tagRetag.value;
  const doCollab = showCollab.value && collabFilled.value;
  if (!retag && !doCollab) {
    if (!tagResult.value) { message.warning('请先选择风险等级'); return; }
    message.warning('风险标记没有变化，也没有填写协同处理内容');
    return;
  }
  // 「修正原因」已取消，那道约束迁到标记备注上：改判必填、首次可选
  if (retag && isAmend.value && !tagNote.value.trim()) {
    message.warning('请填写标记备注');
    return;
  }
  // 读条目上的现行状态：弹窗开着这段时间里别人可能已经给了结论
  if (retag && tagResult.value === NO_RISK && tagNoRiskLocked.value) {
    message.warning(NO_RISK_LOCKED_TIP);
    return;
  }
  if (doCollab && !collab.validate()) return;

  if (retag) {
    const res = queue.recordTagFor(props.ticketNo, {
      result: tagResult.value as RiskTagResult,
      note: tagNote.value.trim(),
      by: user.name || '当前用户',
      byRole: user.role.name || '客诉专员',
      at: nowStamp(),
    });
    if (!res.ok) {
      // 原因由 store 给：挡住它的可能是"不在两类自动识别范围内"，也可能是"这张单查不到"
      message.warning(res.reason ?? '本单无法在工单页标记');
      return;
    }
    const lv = tagResult.value === NO_RISK ? '无风险' : riskLevelText(tagResult.value as '高' | '中' | '低');
    message.success(`已标记为「${lv}」`);
  }
  // 协同那条成功 / 拦截提示由共享件 `submitTo` 自己发，本组件不复述
  if (doCollab && !collab.submitTo(props.ticketNo)) return;
  emit('update:open', false);
}

/* ---------------- 两支共用的壳：开关 / 副标题 / 主按钮 ---------------- */

/** 投诉支直接用外部 open；非投诉支由 `useRiskReportAssess` 的 `assessOpen` 管（先领取再弹） */
const modalOpen = computed(() => (isComplaint.value ? props.open : assessOpen.value));

function setOpen(v: boolean) {
  if (isComplaint.value) emit('update:open', v);
  else assessOpen.value = v;
}

/** 第一区块读的那条条目：投诉支＝池内 A 线条目，非投诉支＝正在评的那一条 */
const sheetTarget = computed<RiskPoolItem | null>(
  () => (isComplaint.value ? poolItem.value : assessTarget.value),
);

/**
 * 副标题 ＝ **来源 · 单号**（如「二线报备 · IFLYZX-…」/「实时监控 · IFLYZX-…」）。
 * 来源取条目自带的 `source`，不另造词；条目一时取不到就只写单号。
 */
const subtitle = computed(() => {
  const src = sheetTarget.value?.source;
  return src ? `${src} · ${props.ticketNo}` : props.ticketNo;
});

/**
 * 主按钮。非投诉支沿用评估那一套（升级 →「确认升级」，其余「提交结论」）。
 *
 * 投诉支按 **"含改判即保存修正"** 这条既有优先级（与风险监控页 `entryTagOkText` 一致）：
 * 上半出得来且这张单**已有结论**（即这一次是改判形态）→「保存修正」；
 * 其余（上半出不来 ＝ 只提交协同、或上半是首次标记）→「提交」。
 */
const okText = computed(() => {
  if (!isComplaint.value) return assessOkText.value;
  return canTag.value && isAmend.value ? '保存修正' : '提交';
});

function onOk() {
  if (isComplaint.value) onComplaintOk();
  else confirmAssess();
}
</script>

<template>
  <OpActionModal
    :open="modalOpen"
    title="风险管控"
    :subtitle="subtitle"
    :icon="SafetyCertificateOutlined"
    tone="primary"
    :width="600"
    :ok-text="okText"
    @update:open="setOpen($event)"
    @ok="onOk"
  >
    <div class="op-form risk-control-form">
      <!-- ① 第一区块（入池依据 / 报备信息 + 释放记录）：与风险监控页评估弹窗共用 RiskAssessSheet -->
      <RiskAssessSheet v-if="sheetTarget" :target="sheetTarget" />

      <!--
        ② 投诉单上半：风险等级（标记 / 改判）。**只对投诉单 + 标记权角色出**
        （`v-if` 管原单类型这一维，`canTag` 走共享件的 `visible`）。
        四选一：一个枚举答"这张单有没有风险、多大"——拆成"有没有风险 + 等级"两个字段会立刻
        长出"无风险却带着等级""有风险却没等级"两种非法组合，而这两种组合恰恰决定条目进不进池。
        已有结论时这次就是改判，**改判时「标记备注」必填**（原「修正原因」已并入），首次标记可选。

        🔴 **整段是六处共用的 `RiskLevelFields`**（2026-09-29 裁决）：呈现只此一份；
        本支的 state、校验与落库照旧走 `onComplaintOk` 那条既有路径（见 `tagLevelView`）。
      -->
      <RiskLevelFields v-if="isComplaint" :ctl="tagLevelView" />

      <!-- ③ 投诉单下半：协同处理段（处理意见 / 建议事项 /「其他」的具体建议） -->
      <RiskCollabFields v-if="isComplaint && showCollab" :ctl="collab" />

      <!--
        非投诉单（报备评估）这一支。段序与另外四处入口一致：① 第一区块 → ② 风险等级 → ③ 评估结论。

        🔴 判据写成 `!isComplaint` 而不是接在上面那个 `v-if` 后面的 `v-else`：协同段的出现条件
        还带着"本单有池内条目"这一道，投诉单在池外时它为假，`v-else` 会把评估结论段渲染到
        投诉单上 —— 那一段此时既提交不了（走的是 onComplaintOk）、也不该出现在投诉单上。
      -->
      <template v-if="!isComplaint">
        <!--
          ② 风险等级：报备条目定的等级**与标记同源** —— 写工单级等级、条目进风险工单池、
          计入左栏「全部有风险」三档。本来没有等级则必填，已有则预置现值、可改。
          与风险报备池那一处共用 RiskLevelFields，取值域与落库不在本组件里。
        -->
        <RiskLevelFields :ctl="assessLevel" />

        <!-- ③ 风险处理措施段（升级 / 不升级）。段名六处同名（2026-09-29 追加裁决） -->
        <section class="ticket-assess-block">
          <h4 class="ticket-assess-title">风险处理措施</h4>
          <div class="op-field ticket-assess-dec-field">
            <div class="op-field-h ticket-assess-dec-row">
              <div class="op-label req">评估决策</div>
              <a-radio-group v-model:value="assessDecision" class="ticket-assess-dec-inline">
                <!-- 值取 store 的枚举、字取界面词：改词与改枚举不是同一次改动，见 OpRiskDecision.ts -->
                <a-radio v-for="d in ASSESS_DECISIONS" :key="d" :value="d">{{ decisionText(d) }}</a-radio>
              </a-radio-group>
            </div>
            <div v-if="missAssessDecision" class="ticket-assess-err ticket-assess-foot">请先选择一个评估决策</div>
          </div>
          <!--
            结论正文那一格。选「升级」（且会派生新投诉单）时它并进下面那一段、改由段内的
            「升级说明」渲染，故本格只在**段不出**时出（写「反馈意见」，或投诉单那一支的
            「升级说明」）—— 两处渲染的是同一个格子（assessAdvice 代理 escalateFields.fields.advice）。
          -->
          <div v-if="!showEscalateFields" class="op-field">
            <div class="op-label req">{{ adviceLabel }}</div>
            <a-textarea
              v-model:value="assessAdvice"
              :rows="3"
              :placeholder="advicePlaceholder"
            />
            <div v-if="missAssessAdvice" class="ticket-assess-err">请填写{{ adviceLabel }}</div>
          </div>

          <!--
            投诉工单专属字段：选「升级」（且会派生新投诉单）时才出。
            投诉一类 / 二类 / 升级说明三项、均必填；切到「不升级」整段隐藏、已填值保留。
            🔴 它在**本段 `<section>` 之内**（六处一致，2026-09-30 裁决）：它填的是本段
            「升级」这一档的要素，摆到段外会读成与「风险处理措施」并列的另一段。
          -->
          <EscalateComplaintFields v-if="showEscalateFields" :ctl="escalateFields" />
        </section>
      </template>
    </div>
  </OpActionModal>
</template>

<style scoped>
.risk-control-form { gap: 10px !important; }
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
</style>
