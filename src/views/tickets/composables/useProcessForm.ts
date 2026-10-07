import { computed, ref, watch } from 'vue';
import type { ProcessFormDraft, SupplementChip, SectionKey } from '@/views/tickets/types/operation';
import { DEFAULT_PROCESS_DRAFT } from '@/mock/ticketDetail';
import { TYPE_SAMPLES } from '@/mock/ticketTypeSamples';
import { TICKETS } from '@/mock/tickets';
import { isAftersaleChainTicket } from './aftersaleEvents';
import { isComplaintCategoryComplete } from '@/views/tickets/types/createTicket';

function complaintCategoryFilled(f: ProcessFormDraft): boolean {
  return isComplaintCategoryComplete(f);
}

/**
 * 按工单类型构建 Tab① 处理表单预填（投诉用 base，咨询/商机/建议用类型样例覆盖）。
 * 客服⇄售后链路上的单（1025）：问题原因 / 处理结果不预填样例文字，否则会回写进本单的「最新处理」。
 */
function buildDraft(type: string, ticketNo?: string): ProcessFormDraft {
  const draft: ProcessFormDraft = {
    ...DEFAULT_PROCESS_DRAFT,
    qualityIsStandard: true,
    qualityIssueCat1: '',
    qualityIssueCat2: '',
    ...(TYPE_SAMPLES[type]?.processDraft ?? {}),
  };
  const row = ticketNo ? TICKETS.find((x) => x.no === ticketNo) : undefined;
  if (!isAftersaleChainTicket(row)) return draft;
  return {
    ...draft, problemCause: '', processResult: '', problemCauseAttachments: [], processResultAttachments: [],
  };
}

// 预约已迁出为独立 Tab，不再计入「补充处理」已填项
function countFilledSupplements(form: ProcessFormDraft): number {
  let n = 0;
  if (form.complaintMark && complaintCategoryFilled(form) && form.complaintNote) n += 1;
  if (
    form.platformFollowups.length > 0
    && form.complaintChannelReply.trim()
    && form.complaintChannelReconcile
  ) n += 1;
  // riskFlag 为空 ＝ 坐席还没碰过这个字段，不计入已填。
  // 明确选了「无风险」才算填过——两者在界面上都不展开下级字段，但一个是判断、一个是没判断。
  if (form.riskFlag === '有风险') {
    if (form.riskLevel && form.riskDescription.trim()) n += 1;
  } else if (form.riskFlag === '疑似风险') {
    if (form.riskDescription.trim()) n += 1;
  } else if (form.riskFlag) {
    n += 1;
  }
  if (form.qualityIsStandard || (form.qualityIssueCat1 && form.qualityIssueCat2)) n += 1;
  return n;
}

export function useProcessForm(getType: () => string, getNo?: () => string) {
  const form = ref<ProcessFormDraft>(buildDraft(getType(), getNo?.()));
  const activeChip = ref<SupplementChip>('complaint');

  watch([getType, () => getNo?.() ?? ''], ([type, no]) => {
    form.value = buildDraft(type, no || undefined);
  });
  const expandedSections = ref<Record<SectionKey, boolean>>({
    record: true,
    service: true,
    supplement: true,
    external: false,
    quality: true,
    suggest: true,
    lead: true,
    appointment: true,
    closingNote: true,
  });

  const filledSupplementCount = computed(() => countFilledSupplements(form.value));

  function toggleSection(key: SectionKey) {
    expandedSections.value[key] = !expandedSections.value[key];
  }

  function selectChip(chip: SupplementChip) {
    activeChip.value = chip;
    expandedSections.value.supplement = true;
    if (
      chip === 'quality'
      && !form.value.qualityIssueCat1
      && !form.value.qualityIssueCat2
    ) {
      form.value = {
        ...form.value,
        qualityIsStandard: true,
        qualityIssueCat1: '',
        qualityIssueCat2: '',
      };
    }
  }

  return {
    form,
    activeChip,
    expandedSections,
    filledSupplementCount,
    toggleSection,
    selectChip,
  };
}
