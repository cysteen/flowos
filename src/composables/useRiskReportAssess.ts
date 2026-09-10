import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import { useUserStore } from '@/stores/user';
// 评估是两条线共用的动作（A 线自动入池条目与 B 线报备单都要评），故走合并层 riskPool：
// 「接管」派生新单号时要在**两条线**已用过的号里取最大值 +1，只扫一条线会派出重号。
import { useRiskPoolStore } from '@/stores/riskPool';
import {
  ASSESS_DECISIONS,
  type AssessDecision,
  type RiskPoolItem,
} from '@/stores/riskShared';
import { useDerivedTicketStore } from '@/stores/derivedTickets';

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isComplaintTicket(ticketNo: string) {
  return ticketNo.startsWith('IFLYTS-');
}

/** 风险报备评估二选一（930 §5.4），监控页与工单详情页共用 */
export function useRiskReportAssess() {
  const user = useUserStore();
  const reportStore = useRiskPoolStore();
  const derivedTickets = useDerivedTicketStore();

  const assessOpen = ref(false);
  const assessTarget = ref<RiskPoolItem | null>(null);
  const assessDecision = ref<AssessDecision | ''>('');
  const assessAdvice = ref('');
  const assessTried = ref(false);

  const missAssessDecision = computed(() => assessTried.value && !assessDecision.value);
  const missAssessAdvice = computed(() => assessTried.value && !assessAdvice.value.trim());
  const assessValid = computed(() => !!assessDecision.value && !!assessAdvice.value.trim());

  const assessAdviceLabel = computed(() =>
    assessDecision.value === '接管' ? '接管说明' : '反馈意见',
  );
  const assessAdvicePlaceholder = computed(() => {
    switch (assessDecision.value) {
      case '不升级': return '写清为什么不必升级、原单建议怎么处理…';
      case '接管': return '写清接管理由与后续处置安排…';
      default: return '请先选择评估决策';
    }
  });

  const takeoverHint = computed(() => {
    const no = assessTarget.value?.ticketNo;
    if (no && isComplaintTicket(no)) {
      return '本单已是投诉单，提交后由你在工单上执行「工单管控」接手，本单状态不变、不派生新单。此步不可撤销';
    }
    return '提交后原单落「已升级投诉」并派生一张投诉单，新单全量继承本单信息。此步不可撤销';
  });

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
      message.warning('该条目还没有分派，请先分派给客诉专员再评估');
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

    const takeover = assessDecision.value === '接管';
    const derive = takeover && !isComplaintTicket(target.ticketNo);
    const escalatedToNo = derive ? nextEscalatedNo() : undefined;

    if (escalatedToNo) {
      derivedTickets.deriveComplaint({
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
      message.success(`已接管，已派生投诉单 ${escalatedToNo}`);
    } else if (takeover) {
      message.success(`已接管 ${target.ticketNo}，请在工单上执行「工单管控」接手`);
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
    takeoverHint,
    openAssess,
    confirmAssess,
    canAssessReport,
  };
}
