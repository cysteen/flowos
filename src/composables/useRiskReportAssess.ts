import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import { useUserStore } from '@/stores/user';
// 评估是两条线共用的动作（A 线自动入池条目与 B 线报备单都要评），故走合并层 riskPool：
// 「升级」派生新单号时要在**两条线**已用过的号里取最大值 +1，只扫一条线会派出重号。
import { useRiskPoolStore } from '@/stores/riskPool';
import {
  ASSESS_DECISIONS,
  normalizeDecision,
  type AssessDecision,
  type RiskPoolItem,
} from '@/stores/riskShared';
import { useDerivedTicketStore } from '@/stores/derivedTickets';
import { isComplaintPoolTicket } from '@/stores/riskPool';
// 选「升级」时要补齐的投诉单专属建单要素（投诉一类 / 二类）：字段、级联与校验只此一份，三处评估弹窗共用
import {
  escalateComplaintOverrides,
  useEscalateComplaintFields,
  type EscalateComplaintPayload,
} from '@/composables/useEscalateComplaintFields';
import { useFlashStore } from '@/stores/flash';
import { mapUserRole } from '@/views/tickets/composables/opActions';
import { useRiskQueueStore } from '@/stores/riskQueue';
import type { RiskLevelFieldsCtl } from '@/composables/useRiskLevelFields';
import { TICKETS } from '@/mock/tickets';
import { isTicketClosed } from '@/views/tickets/types/ticket';

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isComplaintTicket(ticketNo: string) {
  return ticketNo.startsWith('IFLYTS-');
}

/**
 * 升级派生新投诉单的取号 —— **两个评估入口共用这一份**（工单页与风险监控页）。
 * 号段＝`IFLYTS-<今天>-`，序号取已用号的最大值 + 1；预置派生单占 00001（`SEED_RISK_ESCALATION`）。
 * 两处各写一份的话，取号规则一改就会分叉，同一天两个入口有可能发出同一个号。
 */
export function nextEscalatedNoOf(reports: Array<{ assessment?: { escalatedToNo?: string } }>): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const prefix = `IFLYTS-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-`;
  const maxUsed = reports.reduce((max, r) => {
    const no = r.assessment?.escalatedToNo;
    if (!no?.startsWith(prefix)) return max;
    const n = Number(no.slice(prefix.length));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxUsed + 1).padStart(5, '0')}`;
}

/**
 * 选「升级」后要摆出来的那一行分流提示 —— **两个评估入口的唯一文案来源**。
 *
 * 🔴 **这是 O20「按原单类型分流」在界面上的唯一可见区分**，缺了客诉专员就不知道
 * 自己点下去是**派生一张新投诉单**还是**把本单拿到自己名下**——两者对原单的后果完全相反。
 *
 * ⚠️ 它曾在一次跨文件改造里被整条带走，补回来之后又发现**风险监控页那个入口从来没接上**
 * （工单页接了、监控页没接，同一个动作两处说法不一样）。故本轮把文案从 computed 里
 * **提成这个纯函数**：两处都调它，谁也没法只改一半、也没法只在一处把它删掉。
 * 判据（按原单类型分流）与文案绑在同一个函数里，改一次两个入口一起变。
 */
export function escalateHintOf(ticketNo: string | undefined): string {
  /*
   * ⚠️ **按《【930】》§5.2「投诉单不做风险评估」，投诉单不入评估工作面，这一支正常走不到**
   * （风险工单池的投诉单行现在给的是「协同处理」，工单页页头「风险管控」在投诉单上也开协同那一段）。
   *
   * 🔴 **不要因为"走不到"就顺手删掉它** —— 这一整行的历史就是被删过两次：
   * 一次跨文件改造整条带走、一次只在两个入口里补了一处。留着它当**兜底分支**，
   * 万一哪条新入口漏了分流、把投诉单送进了评估弹窗，人至少读得到"点下去会发生什么"，
   * 而不是看到一句写着"派生一张新投诉单"的假话。
   */
  if (ticketNo && isComplaintTicket(ticketNo)) {
    return '本单已是投诉单，提交后由你在工单上执行「工单管控」把本单转到自己名下，本单状态不变、不派生新单。此步不可撤销';
  }
  return '提交后原单落「已升级投诉」并派生一张投诉单，新单全量继承本单信息。此步不可撤销';
}

/**
 * 选「升级」后要不要出「投诉工单专属字段」（投诉一类 / 二类）那一段 —— **三处评估弹窗的唯一判据**。
 *
 * 只在**会派生一张新投诉单**时出：原单已是投诉单的那一支不派生新单（`escalateHintOf` 里
 * 那句兜底文案写的就是「本单状态不变、不派生新单」），没有新单可填，摆出一段建单要素
 * 等于让人白填一遍、还跟同屏的那句提示自相矛盾。
 *
 * 判据取 `isComplaintPoolTicket`（原单类型，查不到时按 `IFLYTS-` 号段兜底），
 * 与池的领取 / 释放门控、风险监控页的派生分流同一把。
 */
export function showEscalateComplaintFields(
  decision: AssessDecision | '',
  ticketNo?: string,
): boolean {
  if (decision !== '升级' || !ticketNo) return false;
  return !isComplaintPoolTicket(ticketNo);
}

/* ---------------- 提交前重查（《【930】》§5.6 校验末两条 / §9 规则 29） ---------------- */

/** 条目已被报备人撤回：整个提交拦下 */
export const ASSESS_WITHDRAWN_TIP = '本条报备已被报备人撤回';
/** 原单已进终态：只拦「升级」，「不升级」照常可交 */
export const ASSESS_TICKET_ENDED_TIP = '本单已结束，无法升级';

/**
 * 原单是否已进终态（基线 §1 的十个终态子状态）。
 *
 * 取数与工单处理页 `useTicketOperation.loadDetail` 同一条链：静态工单库 → 运行时派生单，
 * 叠上本次会话的升级台账（`derivedTickets.escalatedToNoOf`）与停表单（列表 SLA 摘要为「—」）。
 * 三处评估弹窗（风险监控页评估处置工作面 / 风险报备池 / 工单页页头「风险管控」）都调它，判据只此一份。
 */
export function isRiskTicketEnded(ticketNo: string): boolean {
  const derived = useDerivedTicketStore();
  if (derived.escalatedToNoOf(ticketNo)) return true;
  const t = TICKETS.find((x) => x.no === ticketNo) ?? derived.find(ticketNo);
  if (!t) return false;
  if (t.escalatedToNo) return true;
  if (t.slaText === '—') return true;
  return isTicketClosed(t.nodeStatus);
}

/**
 * 提交结论前**按 id 回 store 重取条目**再判一次，返回拦截提示；可以提交时返回空串。
 *
 * 弹窗打开到点「提交结论」之间，条目可能已被承办人释放、被报备人撤回、或原单已结束 ——
 * 弹窗手上那份 `assessTarget` 是打开那一刻的引用，判据必须读 store 里的现值。
 */
export function assessSubmitBlockOf(
  id: string,
  decision: AssessDecision | '',
  assigneeName: string,
): { tip: string; closeModal: boolean } {
  const r = useRiskPoolStore().findById(id);
  if (!r) return { tip: '该条目已不在风险池中，请刷新后再看', closeModal: true };
  if (r.status === '已撤回') return { tip: ASSESS_WITHDRAWN_TIP, closeModal: true };
  if (r.status !== '评估中' || r.assignee !== assigneeName) {
    return {
      tip: r.status === '已评估'
        ? '本条已有评估结论，不可重复提交'
        : '本条已不在你名下的「已领取」态，请刷新后再看',
      closeModal: true,
    };
  }
  if (decision && normalizeDecision(decision) === '升级' && isRiskTicketEnded(r.ticketNo)) {
    return { tip: ASSESS_TICKET_ENDED_TIP, closeModal: false };
  }
  return { tip: '', closeModal: false };
}

/**
 * **打标即结论**那一路的提交前重查 —— 与 `assessSubmitBlockOf` 同一套判据，
 * 只有"条目此刻该处在哪一态"这一条不同。
 *
 * 【为什么不能直接用 `assessSubmitBlockOf`】那一份要的是「已领取 · 且在本人名下」：
 * 打标弹窗里给结论的人**没有领过这条**（打标这一下条目才刚进池，甚至还没进），
 * 拿那一份来判会把每一次提交都拦成"本条已不在你名下的「已领取」态"。
 *
 * 【判据】① 条目还在不在（撤回的整次拦下）；② **已被他人出结论 → 整次拦下**
 * （一条条目只出一次结论，§9 规则 22）；③ 原单已进终态 → **只拦「升级」**，
 * 提示与另两处评估入口同一句 `ASSESS_TICKET_ENDED_TIP`。
 *
 * ⚠️ 本函数**不判「实时监控中」**：核实打标那一路提交时条目可能还没打标进池，
 * 打标与结论是同一次提交里的两步，进池那一步紧接着就会跑。
 */
export function tagAssessSubmitBlockOf(
  entryId: string,
  decision: AssessDecision | '',
  ticketNo: string,
): { tip: string; closeModal: boolean } {
  const r = useRiskPoolStore().findById(entryId);
  if (!r) return { tip: '该条目已不在风险池中，请刷新后再看', closeModal: true };
  if (r.status === '已撤回') return { tip: ASSESS_WITHDRAWN_TIP, closeModal: true };
  if (r.status === '已评估') return { tip: '本条已有评估结论，不可重复提交', closeModal: true };
  if (decision && normalizeDecision(decision) === '升级' && isRiskTicketEnded(ticketNo)) {
    return { tip: ASSESS_TICKET_ENDED_TIP, closeModal: false };
  }
  return { tip: '', closeModal: false };
}

/**
 * 「升级」派生的**完整落地**，两个评估入口共用：
 *   ① 造出新投诉单（`derivedTickets`，同时把原单那一头记进升级台账）；
 *   ② 让新单按**来源②**（在办投诉类工单，自动纳入实时监控）回流「未标记 · 重点工单」。
 *
 * 【为什么②必须在】派生单是一张**在办的投诉单**，来源②的判据它天然满足。
 * 少了这一步，它就是一张谁也不再看的投诉单：不在实时监控里、也没人给它打标 ——
 * 而风险监控恰恰是为了不漏掉这一类单才存在的。
 *
 * 🔴 **来源②的投诉那一支不看优先级**（2026-09-11 收窄修正）：此前 `autoSourceFor` 在②上多判了一道
 * 「优先级 ∈ P0 / P1」，与界面侧 `effectiveSourceOf`（只判类型＝投诉）对不上，于是
 * **原单是 P2 / P3 时派生出的新投诉单入不了队**：左栏「重点工单」四个子档明明列着 P2 / P3，
 * 这批单却回流不回去，派生完就没了下文。现在两处判据同源，这一支不再有洞。
 * 仍然**不给兜底值**：推不出来源就如实不入队，凭空造条目会让「实时监控捞了多少」答不了自己。
 */
export function deriveEscalatedComplaint(input: {
  fromNo: string;
  no: string;
  assignee: string;
  reason: string;
  /**
   * 评估弹窗里补齐的投诉单专属建单要素（投诉一类 / 二类）。新单是一张投诉单，这两项是建单要素
   * 而不是继承项——原单（咨询 / 建议 / 商机 / 刷机）身上本来就没有，不补就永远是空的。
   */
  complaint?: EscalateComplaintPayload;
}) {
  const { complaint, ...base } = input;
  const derived = useDerivedTicketStore().deriveComplaint(
    base,
    undefined,
    complaint ? escalateComplaintOverrides(complaint) : undefined,
  );
  if (!derived) return derived;
  useRiskQueueStore().ensureEntryFor(input.no);
  // ③ 刷机原单（930）的状态真源是工单行：终态要写回去，否则页头仍是「待响应」、底栏仍可操作，
  //    刷新更是原样回滚。老工单四类的原单侧仍由升级台账 `escalations` 承载，不走这一支。
  const origin = TICKETS.find((t) => t.no === input.fromNo);
  if (origin?.type === '刷机') {
    const user = useUserStore();
    useFlashStore().markEscalatedComplaint(
      input.fromNo,
      input.no,
      { name: input.assignee || user.name, role: mapUserRole(user.roleKey) },
      input.reason,
    );
  }
  return derived;
}

/**
 * 风险报备评估二选一（930 §5.4），监控页与工单详情页共用。
 *
 * `opts.level` ＝「风险管控」弹窗统一后补进来的**风险等级段**（`useRiskLevelFields` 的实例）。
 * 传了它，`openAssess` 会顺手把段重置到这张单上、`confirmAssess` 会在落评估结论**之前**
 * 先校验并落这一段（走 `recordTagFor` 那条与标记同一的入口）。
 * 🔴 **不传就整段不存在**。三处接本 composable 的入口一律传：风险监控页评估处置工作面、
 * 风险报备池、工单处理页页头「风险管控」的**非投诉支**（2026-09-29 拍板"页头这一支也出
 * 等级段，与报备池同源"：同一张报备单从哪个入口评，定级这件事都得做）。
 * 页头那个弹窗的**投诉支**另有一份自持的风险等级段，但它走 `props.open`、从不经过
 * `openAssess`，两段不会同时出现。
 */
export function useRiskReportAssess(opts?: { level?: RiskLevelFieldsCtl }) {
  const user = useUserStore();
  const reportStore = useRiskPoolStore();

  const assessOpen = ref(false);
  const assessTarget = ref<RiskPoolItem | null>(null);
  const assessDecision = ref<AssessDecision | ''>('');
  const assessTried = ref(false);

  /**
   * 「投诉工单专属字段」段落（投诉一类 / 二类 / 升级说明三项）。字段与校验走共享
   * composable，组件是共享的 `EscalateComplaintFields.vue` —— 风险报备池与工单页页头
   * 「风险管控」两处都由本 composable 这一份状态接上，两处不各造一份；
   * 风险监控页那个弹窗自持一份状态、调的是同一对 composable + 组件。
   *
   * 切到「不升级」段落隐藏但**状态留在这里不清**，切回来原样还在；
   * 提交「不升级」时 `payload()` 根本不会被调到，两项分类一律不落库。
   */
  const escalateFields = useEscalateComplaintFields();
  const showEscalateFields = computed(() =>
    showEscalateComplaintFields(assessDecision.value, assessTarget.value?.ticketNo),
  );

  /**
   * 结论正文那一格。值存在 `escalateFields.fields.advice` 上，本 ref 只是个读写代理：
   * 选「升级」时这一格由段内的「升级说明」渲染，其余情形由宿主弹窗自己那格「反馈意见」渲染，
   * 两处写的是同一个格子 —— 切换决策不丢字，提交路径照常从 `assessAdvice` 取值。
   */
  const assessAdvice = computed({
    get: () => escalateFields.fields.advice,
    set: (v: string) => { escalateFields.fields.advice = v; },
  });

  const missAssessDecision = computed(() => assessTried.value && !assessDecision.value);
  const missAssessAdvice = computed(() => assessTried.value && !assessAdvice.value.trim());
  const assessValid = computed(() => !!assessDecision.value && !!assessAdvice.value.trim());

  const assessAdviceLabel = computed(() =>
    assessDecision.value === '升级' ? '升级说明' : '反馈意见',
  );
  const assessAdvicePlaceholder = computed(() => {
    switch (assessDecision.value) {
      case '不升级': return '写清为什么不必升级、原单建议怎么处理…';
      case '升级': return '写清升级理由与后续处置安排…';
      default: return '请先选择评估决策';
    }
  });

  /**
   * 选「升级」后出现的分流提示行。文案与判据都在 `escalateHintOf`（本文件顶部导出），
   * **风险监控页那个评估弹窗调的是同一个函数** —— 两处说法不会再分叉。
   * 它只在选中「升级」时出现：常驻的话，选「不升级」也跟着显示，那时它是句噪音。
   */
  const escalateHint = computed(() => escalateHintOf(assessTarget.value?.ticketNo));

  /** 弹窗主按钮：决策＝升级 →「确认升级」，未选或「不升级」→「提交结论」（三处评估弹窗一致） */
  const assessOkText = computed(() => (assessDecision.value === '升级' ? '确认升级' : '提交结论'));

  function nextEscalatedNo(): string {
    return nextEscalatedNoOf(reportStore.reports);
  }

  /**
   * 能不能由这个人评这一条。
   *
   * 🔴 **不再按监控来源设门**（2026-09-10 第三轮拍板）：旧口径下预警词那一路走的是
   * 「核实打标」、不走评估，故这里挡掉它；新口径把**打标提前成入池门槛**——
   * 打标为低/中/高才进池，进了池就是"已确认有风险、等人评"，来源是哪一类不再影响它要不要评。
   * 留着这道门会让「重点工单」那一路打完标进池后，评估按钮永远出不来。
   */
  function canAssessReport(r: RiskPoolItem, assigneeName: string) {
    return r.status === '评估中' && r.assignee === assigneeName;
  }

  function openAssess(r: RiskPoolItem) {
    if (r.status !== '评估中') {
      message.warning('该条目还没有人领取，请先领取再评估');
      return;
    }
    assessTarget.value = r;
    assessDecision.value = '';
    assessTried.value = false;
    // 结论正文（升级说明 / 反馈意见）与投诉一类 / 二类同在 escalateFields，reset 一次清完
    escalateFields.reset();
    // 风险等级段：把现行等级灌回这张单（没有就留空并转必填），见 useRiskLevelFields.reset
    opts?.level?.reset(r.ticketNo);
    assessOpen.value = true;
  }

  function confirmAssess() {
    assessTried.value = true;
    const target = assessTarget.value;
    if (!target) return;
    /*
     * 会派生新投诉单 → 段内三项（投诉一类 / 二类 / 升级说明）的必填校验**先跑**，
     * 缺项的红字才落得到字段下方。放在 `assessValid` 之后的话，升级说明空着会在那一句
     * 直接 return，而它此时正藏在段内，屏幕上一句红字都不会出。
     */
    const escalateFieldsOk = !showEscalateFields.value || escalateFields.validate();
    /*
     * 风险等级段的校验**与上面那几项同批跑**（不短路），缺项的红字才能一屏全出：
     * 先 return 的话，人补完决策再点一次才看到等级那道红字。
     */
    const levelOk = opts?.level ? opts.level.validate() : true;
    if (!assessValid.value || !assessDecision.value || !escalateFieldsOk || !levelOk) return;

    // 提交前重查（§5.6）：条目现值 + 原单终态，拦下时不落任何东西
    const block = assessSubmitBlockOf(target.id, assessDecision.value, user.name || '当前用户');
    if (block.tip) {
      message.warning(block.tip);
      if (block.closeModal) assessOpen.value = false;
      return;
    }

    /*
     * 风险等级先落、评估结论后落（与页头「风险管控」那一支"先上半后下半"同序）。
     * 🔴 被 store 挡下就整次中止：等级没写进去还接着落评估结论，得到的是一条
     * "有结论、没等级"的条目 —— 它在左栏三个轴上一档都归不进去。
     */
    if (opts?.level && !opts.level.submit()) return;

    const escalate = assessDecision.value === '升级';
    const derive = escalate && !isComplaintTicket(target.ticketNo);
    const escalatedToNo = derive ? nextEscalatedNo() : undefined;

    if (escalatedToNo) {
      deriveEscalatedComplaint({
        fromNo: target.ticketNo,
        no: escalatedToNo,
        assignee: user.name,
        reason: assessAdvice.value.trim(),
        complaint: escalateFields.payload(),
      });
    }

    reportStore.assess(target.id, {
      decision: assessDecision.value,
      advice: assessAdvice.value.trim(),
      ...(escalatedToNo ? { escalatedToNo } : {}),
      by: user.name,
      byRole: user.role.name,
      at: nowStamp(),
    });

    assessOpen.value = false;
    if (escalatedToNo) {
      message.success(`已升级，已派生投诉单 ${escalatedToNo}`);
    } else if (escalate) {
      // 基线 ※29：结论这条语义上的「接管 / 接手」整体作废，只说这个动作实际做了什么
      message.success(`已升级 ${target.ticketNo}，请在工单上执行「工单管控」把本单转到自己名下`);
    } else {
      message.success('已提交结论：不升级');
    }
  }

  return {
    ASSESS_DECISIONS,
    assessOpen,
    assessTarget,
    assessDecision,
    assessAdvice,
    missAssessDecision,
    missAssessAdvice,
    assessAdviceLabel,
    assessAdvicePlaceholder,
    assessOkText,
    escalateHint,
    escalateFields,
    showEscalateFields,
    openAssess,
    confirmAssess,
    canAssessReport,
  };
}
