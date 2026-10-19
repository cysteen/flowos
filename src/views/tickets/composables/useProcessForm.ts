import { computed, ref, watch } from 'vue';
import type { ProcessFormDraft, SupplementChip, SectionKey } from '@/views/tickets/types/operation';
import { DEFAULT_PROCESS_DRAFT } from '@/mock/ticketDetail';
import { TYPE_SAMPLES } from '@/mock/ticketTypeSamples';
import { SEED_CLAIMED_TICKET_NOS, TICKETS } from '@/mock/tickets';
import { isAftersaleChainTicket } from './aftersaleEvents';
import { isComplaintCategoryComplete } from '@/views/tickets/types/createTicket';
import { isFlashTicket } from '@/views/tickets/types/flash';

function complaintCategoryFilled(f: ProcessFormDraft): boolean {
  return isComplaintCategoryComplete(f);
}

/** 空白表单：本单没有保存过的值时一律为空（已保存的值由处理页按履历回放） */
const BLANK_PROCESS_DRAFT: ProcessFormDraft = {
  ...DEFAULT_PROCESS_DRAFT,
  problemCause: '',
  processResult: '',
  problemCauseAttachments: [],
  processResultAttachments: [],
  serviceMethod: '',
  serviceType: '',
  conclusion: '',
  serviceSolution: '',
  concessionPlan: '',
  complaintCat1: '',
  complaintCat2: '',
  complaintCat3: '',
  complainedRole: [],
  complaintMark: '',
  backendPush: '',
  complaintNote: '',
  complaintNoteAttachments: [],
  platformFollowups: [],
  complaintChannelReply: '',
  complaintChannelReconcile: '',
  riskFlag: '',
  riskLevel: '',
  riskDescription: '',
  riskDescriptionAttachments: [],
  appointmentNeeded: false,
  appointmentRecords: [],
  suggestAccepted: false,
  leadCategory: '',
  leadNo: '',
  closingNote: '',
  closingNoteAttachments: [],
};

/**
 * 按工单类型构建 Tab① 处理表单初值。
 * - 种子样例单（已有人认领）：投诉用 base，咨询 / 商机 / 建议用类型样例覆盖，与样例履历一致；
 * - 新建 / 关联建出的单、未认领单、刷机单、客服⇄售后链路上的单：空白，只显示本单保存过的值。
 */
function buildDraft(type: string, ticketNo?: string): ProcessFormDraft {
  const row = ticketNo ? TICKETS.find((x) => x.no === ticketNo) : undefined;
  const blank = !!row && (
    isFlashTicket(row)
    || isAftersaleChainTicket(row)
    || !SEED_CLAIMED_TICKET_NOS.has(ticketNo!)
  );
  if (blank) return structuredClone(BLANK_PROCESS_DRAFT);
  return {
    ...DEFAULT_PROCESS_DRAFT,
    ...(TYPE_SAMPLES[type]?.processDraft ?? {}),
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
