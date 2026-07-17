import { computed, ref, watch } from 'vue';
import type { ProcessFormDraft, SupplementChip, SectionKey } from '@/views/tickets/types/operation';
import { DEFAULT_PROCESS_DRAFT } from '@/mock/ticketDetail';
import { TYPE_SAMPLES } from '@/mock/ticketTypeSamples';

/** 按工单类型构建 Tab① 处理表单预填（投诉用 base，咨询/商机/建议用类型样例覆盖）。 */
function buildDraft(type: string): ProcessFormDraft {
  return {
    ...DEFAULT_PROCESS_DRAFT,
    qualityIsStandard: true,
    qualityIssueCat1: '',
    qualityIssueCat2: '',
    ...(TYPE_SAMPLES[type]?.processDraft ?? {}),
  };
}

// 预约已迁出为独立 Tab，不再计入「补充处理」已填项
function countFilledSupplements(form: ProcessFormDraft): number {
  let n = 0;
  if (form.complaintMark && form.complaintCat1 && form.complaintNote) n += 1;
  if (form.riskFlag === '有风险' ? !!form.riskLevel : !!form.riskFlag) n += 1;
  if (!form.qualityIsStandard && form.qualityIssueCat1 && form.qualityIssueCat2) n += 1;
  return n;
}

export function useProcessForm(getType: () => string) {
  const form = ref<ProcessFormDraft>(buildDraft(getType()));
  const activeChip = ref<SupplementChip>('complaint');

  watch(getType, (type) => {
    form.value = buildDraft(type);
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
