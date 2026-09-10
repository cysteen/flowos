import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import { useUserStore } from '@/stores/user';
// 评估是两条线共用的动作（A 线自动入池条目与 B 线报备单都要评），故走合并层 riskPool：
// 「升级」派生新单号时要在**两条线**已用过的号里取最大值 +1，只扫一条线会派出重号。
import { useRiskPoolStore } from '@/stores/riskPool';
import {
  ASSESS_DECISIONS,
  type AssessDecision,
  type RiskPoolItem,
} from '@/stores/riskShared';
import { useDerivedTicketStore } from '@/stores/derivedTickets';
import { useRiskQueueStore } from '@/stores/riskQueue';

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isComplaintTicket(ticketNo: string) {
  return ticketNo.startsWith('IFLYTS-');
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
  if (ticketNo && isComplaintTicket(ticketNo)) {
    return '本单已是投诉单，提交后由你在工单上执行「工单管控」把本单转到自己名下，本单状态不变、不派生新单。此步不可撤销';
  }
  return '提交后原单落「已升级投诉」并派生一张投诉单，新单全量继承本单信息。此步不可撤销';
}

/**
 * 「升级」派生的**完整落地**，两个评估入口共用：
 *   ① 造出新投诉单（`derivedTickets`，同时把原单那一头记进升级台账）；
 *   ② 让新单按**来源②**（投诉类工单且 P0 / P1，自动纳入实时监控）回流「未标记 · 投诉单」。
 *
 * 【为什么②必须在】派生单是一张**在办的投诉单**，§5A.1 的三条判据它天然满足第二条。
 * 少了这一步，它就是一张谁也不再看的投诉单：不在实时监控里、也没人给它打标 ——
 * 而风险监控恰恰是为了不漏掉这一类单才存在的。
 *
 * 🔴 **不放宽入队判据**：`ensureEntryFor` 推不出来源（比如原单是 P2 / P3，新单继承下来
 * 够不着「P0 / P1」这一条）就**如实不入队**，不给兜底值。凭空造一条不该在的监控条目，
 * 会让「实时监控捞了多少」这个数从此答不了自己。
 */
export function deriveEscalatedComplaint(input: {
  fromNo: string;
  no: string;
  assignee: string;
  reason: string;
}) {
  const derived = useDerivedTicketStore().deriveComplaint(input);
  if (derived) useRiskQueueStore().ensureEntryFor(input.no);
  return derived;
}

/** 风险报备评估二选一（930 §5.4），监控页与工单详情页共用 */
export function useRiskReportAssess() {
  const user = useUserStore();
  const reportStore = useRiskPoolStore();

  const assessOpen = ref(false);
  const assessTarget = ref<RiskPoolItem | null>(null);
  const assessDecision = ref<AssessDecision | ''>('');
  const assessAdvice = ref('');
  const assessTried = ref(false);

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

  function nextEscalatedNo(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const prefix = `IFLYTS-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-`;
    const maxUsed = reportStore.reports.reduce((max, r) => {
      const no = r.assessment?.escalatedToNo;
      if (!no?.startsWith(prefix)) return max;
      const n = Number(no.slice(prefix.length));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `${prefix}${String(maxUsed + 1).padStart(5, '0')}`;
  }

  /**
   * 能不能由这个人评这一条。
   *
   * 🔴 **不再按监控来源设门**（2026-09-10 第三轮拍板）：旧口径下预警词那一路走的是
   * 「核实打标」、不走评估，故这里挡掉它；新口径把**打标提前成入池门槛**——
   * 打标为低/中/高才进池，进了池就是"已确认有风险、等人评"，来源是哪一类不再影响它要不要评。
   * 留着这道门会让手动筛查、投诉单、重要紧急三类打完标进池后，评估按钮永远出不来。
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
    assessAdvice.value = '';
    assessTried.value = false;
    assessOpen.value = true;
  }

  function confirmAssess() {
    assessTried.value = true;
    const target = assessTarget.value;
    if (!target || !assessValid.value || !assessDecision.value) return;

    const escalate = assessDecision.value === '升级';
    const derive = escalate && !isComplaintTicket(target.ticketNo);
    const escalatedToNo = derive ? nextEscalatedNo() : undefined;

    if (escalatedToNo) {
      deriveEscalatedComplaint({
        fromNo: target.ticketNo,
        no: escalatedToNo,
        assignee: user.name,
        reason: assessAdvice.value.trim(),
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
    escalateHint,
    openAssess,
    confirmAssess,
    canAssessReport,
  };
}
