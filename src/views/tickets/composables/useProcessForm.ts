import { computed, ref } from 'vue';
import type { ProcessFormDraft, SupplementChip, SectionKey } from '@/views/tickets/types/operation';
import { DEFAULT_PROCESS_DRAFT } from '@/mock/ticketDetail';

function countFilledSupplements(form: ProcessFormDraft): number {
  let n = 0;
  if (form.complaintCat1 && form.complaintNote) n += 1;
  if (form.riskHasRisk && form.riskDescription.trim()) n += 1;
  if (form.appointmentNeeded && form.appointmentStart) n += 1;
  if (!form.qualityIsStandard && form.qualityIssueReason.trim()) n += 1;
  return n;
}

export function useProcessForm() {
  const form = ref<ProcessFormDraft>({ ...DEFAULT_PROCESS_DRAFT });
  const activeChip = ref<SupplementChip>('complaint');
  const expandedSections = ref<Record<SectionKey, boolean>>({
    record: true,
    service: true,
    supplement: true,
    external: false,
    quality: true,
    suggest: true,
    lead: true,
  });

  const filledSupplementCount = computed(() => countFilledSupplements(form.value));

  function toggleSection(key: SectionKey) {
    expandedSections.value[key] = !expandedSections.value[key];
  }

  function selectChip(chip: SupplementChip) {
    activeChip.value = chip;
    expandedSections.value.supplement = true;
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
