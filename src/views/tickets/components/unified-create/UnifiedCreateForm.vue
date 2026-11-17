<script setup lang="ts">
import { computed, nextTick, provide, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { useRouter } from 'vue-router';
import {
  CheckCircleOutlined, CloseOutlined, FileAddOutlined, SaveOutlined, WarningOutlined,
} from '@ant-design/icons-vue';
import type { CreateTicketPrefill, Priority, Ticket } from '@/views/tickets/types/ticket';
import { isTicketClosed } from '@/views/tickets/types/ticket';
import type { CreateFormTicketType } from '@/views/tickets/types/createTicket';
import {
  BUSINESS_TYPES,
  CREATE_TICKET_TYPES,
    PRIORITY_OPTIONS,
  PRODUCT_CATEGORIES,
  complaintPlatformsBySource,
  ticketSourceOptionsForRole,
} from '@/views/tickets/types/createTicket';
import { CREATE_COMPLAINT_L2_MAP } from '@/views/tickets/types/complaintCreateCategory';
import { useCreateTicketForm } from '@/views/tickets/composables/useCreateTicketForm';
import type { AftersaleContext } from '@/views/tickets/composables/opActions';
import { useCreateWorkItemsStore } from '@/stores/createWorkItems';
import { copy, workInput, workPath, CREATE_WORK_LABELS, type CreateWorkItem } from '../../types/createWork';
import { submitWorkTicket, validateWorkSource } from '../../composables/createWorkSubmission';
import { creationReceipt } from '@/stores/creationLedger';
import { confirmWorkClose } from '../../composables/createWorkGuard';
import { XIAOZHI_TIP } from '@/views/tickets/types/xiaozhi';
import OpTextareaAttach from '@/views/tickets/components/operation/shared/OpTextareaAttach.vue';
import WorkAftersaleModal from './WorkAftersaleModal.vue';
import { TICKETS } from '@/mock/tickets';
import { useProblemTagsStore } from '@/stores/problemTags';
import { useUserStore } from '@/stores/user';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';
import CreateTicketPartCard from '../create-ticket/CreateTicketPartCard.vue';
import FormSelect from '../create-ticket/FormSelect.vue';
import FlashInfoPart from '../create-ticket/FlashInfoPart.vue';
import RefundInfoPart from '../create-ticket/RefundInfoPart.vue';
import XiaozhiInfoPart from '../create-ticket/XiaozhiInfoPart.vue';
import UnifiedComplaintPart from './UnifiedComplaintPart.vue';
import ExternalEscalationPart from './ExternalEscalationPart.vue';
import { runSpecialCreation, resumeSpecialResult } from '../../composables/specialWorkCreation';
import { specialIntent } from '@/stores/creationLedger';
import { CREATE_COMPLAINT_L2_MAP as EXTERNAL_CATEGORIES, inferCreateComplaintNatures } from '../../types/complaintCreateCategory';
import UnifiedCustomerPart from './UnifiedCustomerPart.vue';

const props = defineProps<{ item: CreateWorkItem }>();
const item = props.item;
const works = useCreateWorkItemsStore();
const restoring = ref(true);
const simplifiedExternal = item.context.action === 'escalateExternal';
const isContinuation = item.context.action === 'reopen';
const fixedComplaint = ['escalateComplaint', 'escalateExternal', 'linkComplaint'].includes(item.context.action);

const router = useRouter();
const tabs = useWorkspaceTabsStore();
const userStore = useUserStore();
const problemTags = useProblemTagsStore();

const prefill: CreateTicketPrefill | null = item.context.prefill ?? (item.context.scene === 'xiaozhi' ? { xiaozhiScene: true } : null);
const ctx = useCreateTicketForm(() => isContinuation ? { ...prefill, noFlashScene: true } : prefill, { twoLevelProblem: true, preserveSourceFields: !!item.context.source });
const {
  form,
  errors,
  submitting,
  problemL1Options,
  productProblemTree,
  productNameOptions,
  showTypePart,
  hidesDeviceSn,
  isFlashType,
  isRefundType,
  isXiaozhiType,
  flashErrors,
  flashBlock,
  refundErrors,
  xiaozhiErrors,
  onTitleInput,
  onProductNameChange,
  validate,
  buildTicket,
  submitFlash,
  submitRefund,
  submitXiaozhi,
  applyPrefill,
  applyDraft,
  applyXiaozhiFrontlineDefault,
} = ctx;

provide('create-ticket-select-popup-class', 'uc-select-dropdown');

if (prefill) {
  applyPrefill(prefill);
  void nextTick(() => applyXiaozhiFrontlineDefault(true));
}

/* ---------------- 问题分类：支持逐级选择，也支持从任一级直接反带完整路径 ---------------- */

// 同步执行：要赶在表单内部「分类回落首项」的监听之前把下级清掉
watch(() => form.productName, () => { if (!restoring.value) form.problemL1 = ''; }, { flush: 'sync' });
watch(() => form.problemL1, () => { if (!restoring.value) form.problemL2 = ''; }, { flush: 'sync' });
watch(() => form.problemL2, () => { if (!restoring.value) form.problemL3 = ''; }, { flush: 'sync' });

const PROBLEM_PATH_SEPARATOR = '\u001f';
type ProblemPathOption = { value: string; label: string; l1: string; l2: string; l3?: string; disabled?: boolean };

function problemPathValue(...parts: string[]) {
  return parts.join(PROBLEM_PATH_SEPARATOR);
}

const allL2Paths = computed<ProblemPathOption[]>(() => Object.entries(productProblemTree.value).flatMap(([l1, l2Map]) =>
  Object.keys(l2Map).map((l2) => ({ value: problemPathValue(l1, l2), label: l2, l1, l2 })),
));
const l2PathOptions = computed(() => {
  const rows = form.problemL1 ? allL2Paths.value.filter((row) => row.l1 === form.problemL1) : allL2Paths.value;
  const options = rows.map((row) => ({ ...row, label: form.problemL1 ? row.l2 : `${row.l1} / ${row.l2}` }));
  const value = problemPathValue(form.problemL1, form.problemL2);
  return form.problemL1 && form.problemL2 && !options.some((row) => row.value === value)
    ? [{ value, label: form.problemL2, l1: form.problemL1, l2: form.problemL2, disabled: true }, ...options] : options;
});
const allL3Paths = computed<ProblemPathOption[]>(() => Object.entries(productProblemTree.value).flatMap(([l1, l2Map]) =>
  Object.entries(l2Map).flatMap(([l2, l3s]) => l3s.filter(Boolean).map((l3) => ({
    value: problemPathValue(l1, l2, l3), label: l3, l1, l2, l3,
  }))),
));
const l3PathOptions = computed(() => {
  const rows = allL3Paths.value.filter((row) => {
    if (form.problemL1 && row.l1 !== form.problemL1) return false;
    if (form.problemL2 && row.l2 !== form.problemL2) return false;
    return true;
  });
  const options = rows.map((row) => ({
    ...row,
    label: form.problemL1 && form.problemL2
      ? row.l3!
      : form.problemL1 ? `${row.l2} / ${row.l3}` : `${row.l1} / ${row.l2} / ${row.l3}`,
  }));
  const value = problemPathValue(form.problemL1, form.problemL2, form.problemL3);
  return form.problemL1 && form.problemL2 && form.problemL3 && !options.some((row) => row.value === value)
    ? [{ value, label: form.problemL3, l1: form.problemL1, l2: form.problemL2, l3: form.problemL3, disabled: true }, ...options] : options;
});

const problemL2Path = computed<string | undefined>({
  get: () => form.problemL1 && form.problemL2 ? problemPathValue(form.problemL1, form.problemL2) : undefined,
  set: (value) => {
    const row = allL2Paths.value.find((item) => item.value === value);
    if (!row) { form.problemL2 = ''; return; }
    form.problemL1 = row.l1;
    form.problemL2 = row.l2;
  },
});
const problemL3Path = computed<string | undefined>({
  get: () => form.problemL1 && form.problemL2 && form.problemL3
    ? problemPathValue(form.problemL1, form.problemL2, form.problemL3)
    : undefined,
  set: (value) => {
    const row = allL3Paths.value.find((item) => item.value === value);
    if (!row) { form.problemL3 = ''; return; }
    form.problemL1 = row.l1;
    form.problemL2 = row.l2;
    form.problemL3 = row.l3 ?? '';
  },
});

const exactL3Options = computed(() => form.problemL1 && form.problemL2
  ? (productProblemTree.value[form.problemL1]?.[form.problemL2] ?? []).filter(Boolean)
  : []);
/** 选到二级后，该路径有没有三级（无线音乐类分类只到二级） */
const hasL3 = computed(() => exactL3Options.value.length > 0);

/** 售后：选到末级，且本产品这条分类的专属类型为售后 */
const isAftersaleType = computed(() => {
  if (item.context.action === 'aftersale') return true;
  if (fixedComplaint || form.ticketType === '投诉' || isXiaozhiType.value || !form.problemL1 || !form.problemL2) return false;
  if (hasL3.value && !form.problemL3) return false;
  return problemTags.enabledRows.some((r) => r.exclusive === '售后'
    && r.productName === form.productName
    && r.tagL1 === form.problemL1 && r.tagL2 === form.problemL2 && r.tagL3 === form.problemL3);
});

/* ---------------- 切回通用：恢复命中前的工单类型、业务类型与优先级 ---------------- */

let beforeHit: {
  ticketType: typeof form.ticketType;
  businessType: typeof form.businessType;
  priority: typeof form.priority;
} | null = null;
// 同步执行：要赶在表单内部把类型强改为咨询之前记下原值
watch(
  () => isFlashType.value || isRefundType.value,
  (hit) => {
    if (hit) {
      beforeHit = { ticketType: form.ticketType, businessType: form.businessType, priority: form.priority };
    } else if (beforeHit) {
      if (form.ticketType !== '投诉') form.ticketType = beforeHit.ticketType;
      form.businessType = beforeHit.businessType;
      // 命中前没选优先级：保留命中期间选的值。类型与优先级是命中前的同一组取值，联动上本就合法
      if (beforeHit.priority && form.ticketType !== '投诉') form.priority = beforeHit.priority;
      beforeHit = null;
    }
  },
  { flush: 'sync' },
);

/* ---------------- 优先级、工单类型、来源（与建单弹窗同一规则） ---------------- */

const HIGH_PRIORITIES: Priority[] = ['P0', 'P1'];
const LOW_PRIORITIES: Priority[] = ['P2', 'P3'];

function prioritiesFor(type: CreateFormTicketType | ''): Priority[] | null {
  if (!type || type === '投诉') return null;
  return LOW_PRIORITIES;
}
function typesFor(priority: Priority | ''): CreateFormTicketType[] {
  if (!priority) return [...CREATE_TICKET_TYPES];
  return HIGH_PRIORITIES.includes(priority) ? ['投诉'] : [...CREATE_TICKET_TYPES];
}
const ticketTypeOptions = computed(() => (fixedComplaint ? ['投诉'] : item.context.action === 'transfer' ? ['咨询', '建议', '商机'] : typesFor(form.priority)).map((v) => ({ value: v, label: v })));
const priorityOptions = computed(() => {
  const allowed = prioritiesFor(form.ticketType);
  return PRIORITY_OPTIONS.filter((p) => !allowed || allowed.includes(p.value))
    .map((p) => ({ value: p.value, label: p.label }));
});
watch(
  () => form.priority,
  () => {
    if (!form.priority || !form.ticketType) return;
    if (restoring.value || fixedComplaint) return;
    const types: CreateFormTicketType[] = item.context.action === 'transfer' ? ['咨询', '建议', '商机'] : typesFor(form.priority);
    if (!types.includes(form.ticketType)) { form.priority = ''; message.info('请为当前工单类型重新选择优先级'); }
  },
);
watch(
  () => form.ticketType,
  () => {
    if (!form.priority || !form.ticketType) return;
    const allowed = prioritiesFor(form.ticketType);
    if (allowed && !allowed.includes(form.priority)) {
      form.priority = '';
      message.info('当前优先级与所选类型冲突，请重新选择优先级');
    }
  },
);
const ticketSourceOptions = computed(() => simplifiedExternal ? [{ value: '外投渠道', label: '外投渠道' }] : ticketSourceOptionsForRole(userStore.roleKey, form.ticketSource));
const lockBusinessAndType = computed(() => isFlashType.value || isXiaozhiType.value || isRefundType.value);
const lockTicketType = computed(() => lockBusinessAndType.value || fixedComplaint);

// 投诉卡切走时不挂载，这两条联动放在表单这一层常驻
watch(
  () => form.ticketSource,
  () => {
    const allowed = complaintPlatformsBySource(form.ticketSource);
    if (form.complaintPlatforms.some((r) => r.platform && !allowed.includes(r.platform))) {
      form.complaintPlatforms = [{ platform: '', complaintNo: '' }];
    }
  },
);
watch(
  () => form.complaintL1,
  () => {
    const opts = CREATE_COMPLAINT_L2_MAP[form.complaintL1] ?? [];
    if (!opts.includes(form.complaintL2)) form.complaintL2 = form.complaintL2 ? (opts[0] ?? '') : '';
  },
);

/* ---------------- 底栏提示 ---------------- */

const createPrimaryLabel = computed(() => (isXiaozhiType.value && form.xiaozhi.escalateTpd ? '创建并流转TPD' : '创建'));

function ticketHref(no: string): string {
  return router.resolve(`/tickets/${no}`).href;
}
const duplicateTickets = computed<Ticket[]>(() => {
  const phone = (form.customer?.phone ?? '').replace(/\s/g, '');
  if (!phone || !form.productName) return [];
  return TICKETS.filter((t) => t.no !== item.context.source?.no && (t.customerPhone ?? '').replace(/\s/g, '') === phone
    && t.product === form.productName
    && !t.archived
    && !isTicketClosed(t.nodeStatus));
});

/* ---------------- 售后独立工作面 ---------------- */
const aftersaleContext = computed<AftersaleContext>(() => {
  const source = item.context.source;
  return {
    isComplaint: source ? source.type === '投诉' : true,
    customerName: form.customer?.name || source?.customer.name || '',
    customerPhone: form.customer?.phone || source?.customer.contacts.find((c) => c.type === 'phone')?.value || '',
    region: form.customer?.region || source?.customer.region || '',
    address: form.customer?.address || source?.customer.address || '',
    productCategory: form.productCategory || source?.product.category || '',
    productName: form.productName || source?.product.name || '',
    sn: form.deviceSn || source?.product.sn || '', fault: form.description || source?.demand || '',
    faultAttachments: form.descriptionAttachments.length ? [...form.descriptionAttachments] : [...(source?.demandAttachments ?? [])],
  };
});
const saleSignature = computed(() => JSON.stringify([form.productCategory, form.productName, form.problemL1, form.problemL2, form.problemL3]));
let openingSale = false;
async function continueAftersale() {
  if (openingSale) return;
  openingSale = true;
  try {
    validateWorkSource(item, true);
    const next = copy(aftersaleContext.value) as unknown as Record<string, unknown>;
    const previous = item.aftersalePrefill;
    if (item.resultNo) { item.aftersaleOpen = true; return; }
    if (item.aftersaleForm && previous) {
      const changed = ['customerName', 'customerPhone', 'address', 'productCategory', 'productName', 'sn', 'fault', 'faultAttachments'].filter((key) => JSON.stringify(next[key]) !== JSON.stringify(previous[key]));
      const oldRegion = String(previous.region || '').split('/').map((v) => v.trim());
      const regionConflict = next.region !== previous.region && ['province', 'city', 'district'].some((key, i) => String(item.aftersaleForm?.[key] || '') !== (oldRegion[i] || ''));
      const conflict = regionConflict || changed.some((key) => JSON.stringify(item.aftersaleForm?.[key] ?? '') !== JSON.stringify(previous[key] ?? ''));
      if (conflict && !await new Promise<boolean>((resolve) => Modal.confirm({ title: '更新售后公共信息', content: '客户或产品信息已变化，售后表单中对应字段也有手动修改。是否按当前统一建单页更新这些字段？专业办理内容将保留。', okText: '确认更新', cancelText: '返回核对', onOk: () => resolve(true), onCancel: () => resolve(false) }))) { item.error = '公共信息尚未确认，请核对当前客户及产品后继续。'; return; }
      for (const key of ['customerName', 'customerPhone', 'address', 'productCategory', 'productName', 'sn', 'fault', 'faultAttachments']) {
        if (JSON.stringify(next[key]) !== JSON.stringify(previous[key])) item.aftersaleForm[key] = copy(next[key] ?? '');
      }
      if (next.region !== previous.region) {
        const parts = String(next.region || '').split('/').map((value) => value.trim());
        [item.aftersaleForm.province, item.aftersaleForm.city, item.aftersaleForm.district] = [parts[0] || '', parts[1] || '', parts[2] || ''];
      }
    }
    item.aftersalePrefill = next; item.surface = 'aftersale'; item.modalHost = 'unified';
    item.aftersaleDismissed = saleSignature.value; item.aftersaleOpen = true;
  }
  catch (e) { item.error = e instanceof Error ? e.message : '当前不可创建售后工单'; }
  finally { openingSale = false; }
}
let resolvingSaleExit = false;
let stableForm = copy(form);
async function restoreBranch(snapshot: typeof stableForm) {
  restoring.value = true;
  applyDraft(snapshot as unknown as Record<string, unknown>);
  await nextTick();
  item.form = copy(form) as unknown as Record<string, unknown>;
  restoring.value = false;
}
watch([isAftersaleType, saleSignature], async ([hit, signature], [wasHit]) => {
  if (restoring.value || resolvingSaleExit) return;
  if (wasHit && !hit) {
    resolvingSaleExit = true;
    const desired = copy(form);
    // Freeze the complete previous branch while asking: save/continue operate on the same identity.
    await restoreBranch(stableForm);
    item.surface = 'aftersale';
    const receipt = creationReceipt(item.id);
    const pending = !!item.resultNo || receipt?.kind === 'aftersale' && receipt.phase === 'created';
    const accepted = pending ? false : !item.aftersaleForm || await confirmWorkClose(item);
    if (accepted) { item.surface = 'ticket'; await restoreBranch(desired); }
    else if (pending) item.error = '售后单已生成，请完成本事项核对，不能切换为客服新建。';
    stableForm = copy(form);
    resolvingSaleExit = false;
    return;
  }
  if (hit && item.aftersaleDismissed !== signature) void continueAftersale();
});
watch(form, () => { if (!restoring.value && !resolvingSaleExit) stableForm = copy(form); }, { deep: true, flush: 'post' });
async function saleCompleted(no: string) {
  works.complete(item, no);
  await leaveTo('/aftersale');
}

/* ---------------- 提交 ---------------- */

const root = ref<HTMLElement | null>(null);
const ERROR_SELECTOR = [
  '.fi-error', '.ri-error', '.xz-error', '.as-err', '.customer-empty.error', '.cust-phone-error',
  '.flash-block-tip', '.ant-select-status-error', '.ant-input-status-error', '.desc-attach.has-error',
].join(', ');
function scrollToFirstError() {
  requestAnimationFrame(() => {
    root.value?.querySelector(ERROR_SELECTOR)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

/** 先落到目标页再关页签：当前页签已不是激活页，关闭时不会再跳到相邻页签 */
async function leaveTo(path: string) {
  await router.push(path);
  await nextTick();
  await tabs.close(workPath(item.id));
}
function onCancel() { void tabs.close(workPath(item.id)); }
function onDraft() {
  if (resolvingSaleExit) return;
  if (!works.save(item)) return;
  message.success('草稿已保存');
  void tabs.close(workPath(item.id));
}
function validateExternal() {
  const rows = form.externalComplaintCategories ?? [];
  errors.complaintL1 = !rows.length || rows.some((row) => !row.cat1);
  errors.complaintL2 = !rows.length || rows.some((row) => !EXTERNAL_CATEGORIES[row.cat1]?.includes(row.cat2));
  errors.description = !form.description.trim();
  errors.complaintPlatform = !form.complaintPlatforms.length || form.complaintPlatforms.some((p) => !complaintPlatformsBySource('外投渠道').includes(p.platform) || p.platform === '其他' && !p.customPlatform?.trim());
  return !errors.complaintL1 && !errors.complaintL2 && !errors.description && !errors.complaintPlatform;
}
function onCreate(processAfter = false) {
  if (resolvingSaleExit) return;
  if (item.surface === 'aftersale' || creationReceipt(item.id)?.kind === 'aftersale') { void continueAftersale(); return; }
  if (item.status === 'submitting' || item.status === 'complete') return;
  const prior = creationReceipt(item.id);
  if (prior && prior.phase !== 'created') { works.complete(item, prior.no); void leaveTo(`/tickets/${prior.no}`); return; }

  submitting.value = true; item.error = undefined;
  try {
    const resumed = resumeSpecialResult(item);
    if (resumed) {
      const result = submitWorkTicket(item, resumed, processAfter, true);
      works.complete(item, result.no); message.success(`已核对并完成工单 ${result.no}`); void leaveTo(`/tickets/${result.no}`); return;
    }
    if (item.status === 'unknown') item.status = 'editing';
    validateWorkSource(item);
    if (fixedComplaint && form.ticketType !== '投诉') throw new Error('本事项的新工单类型固定为投诉。');
    if (item.context.action === 'transfer' && !['咨询', '建议', '商机'].includes(form.ticketType)) throw new Error('转单仅支持咨询、建议、商机。');
    const validPath = problemTags.enabledRows.some((row) => row.productName === form.productName && row.tagL1 === form.problemL1 && row.tagL2 === form.problemL2 && (row.tagL3 || '') === form.problemL3);
    if (!simplifiedExternal && !isContinuation && !validPath) throw new Error('当前问题分类已停用或与产品不匹配，请重新选择。');
    if (isContinuation) {
      if (!form.continuationSupplement?.trim()) throw new Error('请填写本次补充内容。');
    } else if (simplifiedExternal ? !validateExternal() : !validate()) return scrollToFirstError();
    item.status = 'submitting';
    let ticket: Ticket;
    let dispatched = false;
    if (isXiaozhiType.value) {
      const result = runSpecialCreation(item, submitXiaozhi); if (!result) { item.status = 'editing'; return scrollToFirstError(); }
      if (result.degraded) message.warning(XIAOZHI_TIP.rdPlatformDownOnCreate);
      ticket = result.ticket; dispatched = true;
    } else if (isFlashType.value) {
      const result = runSpecialCreation(item, submitFlash); if (!result) { item.status = 'editing'; return scrollToFirstError(); }
      ticket = result.ticket; dispatched = true;
    } else if (isRefundType.value) {
      const result = runSpecialCreation(item, submitRefund); if (!result) { item.status = 'editing'; return scrollToFirstError(); }
      ticket = result.ticket; dispatched = true;
    } else {
      ticket = buildTicket();
      if (simplifiedExternal) {
        const source = validateWorkSource(item)!;
        Object.assign(ticket, {
          customer: source.row.customer, customerPhone: source.row.customerPhone,
          customerRegion: source.row.customerRegion, customerAddress: source.row.customerAddress,
          product: source.row.product, productCategory: source.row.productCategory, sn: source.row.sn,
          businessType: source.row.businessType, businessLine: source.row.businessLine, productLine: source.row.productLine,
          priority: source.row.priority, problemL1: source.row.problemL1, problemL2: source.row.problemL2, problemL3: source.row.problemL3,
          externalComplaintCategories: copy(form.externalComplaintCategories ?? []), complaintL1: form.externalComplaintCategories?.[0]?.cat1, complaintL2: form.externalComplaintCategories?.[0]?.cat2,
          ticketSource: '外投渠道', type: '投诉', title: `外投·${source.row.title}`,
          problemDesc: `【升级投诉·原单 ${source.row.no}】投诉 → 外投\n工单来源：外投渠道\n投诉分类：${form.externalComplaintCategories?.map((row) => `${row.cat1} / ${row.cat2}`).join('；')}（${inferCreateComplaintNatures(form.externalComplaintCategories ?? []).join('、')}）\n投诉平台：${form.complaintPlatforms.map((p) => `${p.customPlatform || p.platform} ${p.complaintNo}`).join('；')}\n${form.description.trim()}\n原客户诉求：${source.detail.demand}`,
        });
      }
    }
    const result = submitWorkTicket(item, ticket, processAfter, dispatched);
    works.complete(item, result.no);
    if (item.error) { message.warning(item.error); return; }
    message.success(`${CREATE_WORK_LABELS[item.context.action]}完成，工单 ${result.no}`);
    void leaveTo(`/tickets/${result.no}`);
  } catch (e) {
    item.status = creationReceipt(item.id) || specialIntent(item.id) || item.resultNo ? 'unknown' : 'editing';
    item.error = e instanceof Error ? e.message : '提交失败，已保留输入，请重试。';
  } finally { submitting.value = false; }
}

const savedForm = item.form ? copy(item.form) : null;
if (savedForm) applyDraft(savedForm);
if (fixedComplaint) form.ticketType = '投诉';
if (isContinuation) { form.title = item.context.source?.title ?? ''; form.titleManual = true; }
if (simplifiedExternal) form.ticketSource = '外投渠道';
void nextTick(() => {
  item.form = copy(form) as unknown as Record<string, unknown>;
  if (item.context.action === 'transfer' && (form.priority === 'P0' || form.priority === 'P1')) form.priority = '';
  if (!item.savedInput) item.savedInput = workInput(item);
  stableForm = copy(form);
  restoring.value = false;
  if (item.context.action === 'aftersale') item.aftersaleOpen = true;
  else if (isAftersaleType.value && !item.aftersaleDismissed) continueAftersale();
});
watch(form, () => { if (!restoring.value) item.form = copy(form) as unknown as Record<string, unknown>; }, { deep: true, flush: 'sync' });

</script>

<template>
  <div ref="root" class="uc-page">
    <header class="uc-header">
      <button type="button" class="uc-back" @click="onCancel">‹ 返回</button>
      <div class="uc-heading-line">
        <a-input
          v-model:value="form.title"
          class="uc-title-input"
          :status="errors.title ? 'error' : ''"
          :placeholder="item.context.scene === 'xiaozhi' ? '小智工单登记' : '统一建单'"
          :readonly="isContinuation || simplifiedExternal"
          aria-label="工单标题"
          @input="onTitleInput"
        />
        <div class="uc-heading-meta">
          <span aria-hidden="true">|</span>
          <span>建单人 {{ userStore.name }}</span>
          <span aria-hidden="true">|</span>
          <span class="muted">{{ CREATE_WORK_LABELS[item.context.action] }}</span>
        </div>
      </div>
    </header>
    <a-alert v-if="item.status === 'complete' && item.resultNo" type="success" :message="`工单 ${item.resultNo} 已创建`">
      <template #action><a-button type="link" @click="leaveTo(`/tickets/${item.resultNo}`)">打开工单</a-button></template>
    </a-alert>
    <a-alert v-if="item.error || works.storageError" :message="item.error || works.storageError" type="error" show-icon />
    <div v-if="item.context.source" style="padding:12px 24px;background:#fff7e6">
      {{ CREATE_WORK_LABELS[item.context.action] }} · 原工单 <a :href="ticketHref(item.context.source.no)" target="_blank">{{ item.context.source.no }}</a> · {{ item.context.source.title }}
    </div>
    <div v-if="item.context.action !== 'aftersale'" class="uc-body">
      <!-- ① 客户与代报人 -->
      <UnifiedCustomerPart v-if="!simplifiedExternal && !isContinuation" :ctx="ctx" />
      <CreateTicketPartCard v-else title="原单信息">
        {{ item.context.source?.customer.name }} · {{ item.context.source?.product.name }} · {{ item.context.source?.priority }}
        <span v-if="simplifiedExternal">新单来源：外投渠道</span>
      </CreateTicketPartCard>

      <!-- ② 工单基础（含问题描述与附件） -->
      <CreateTicketPartCard v-if="isContinuation" title="本次补充">
        <p>客户、产品、类型、来源、问题分类、优先级与归属组继承原单；承接单进入原组工单池。</p>
        <p>{{ item.context.source?.demand }}</p>
        <OpTextareaAttach v-model="form.continuationSupplement" v-model:attachments="form.continuationAttachments" placeholder="填写本次补充内容" />
      </CreateTicketPartCard>
      <CreateTicketPartCard v-else title="工单基础">
        <template v-if="!simplifiedExternal">
        <a-checkbox v-if="!fixedComplaint && item.context.action !== 'transfer' && !isXiaozhiType" :checked="form.ticketType === '投诉'" @change="form.ticketType = $event.target.checked ? '投诉' : '咨询'">本次诉求包含投诉</a-checkbox>
        <div class="row-3">
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>业务类型</label>
            <FormSelect
              v-model:value="form.businessType"
              class="inline-control field-control"
              :disabled="lockBusinessAndType"
              :status="errors.businessType ? 'error' : ''"
              :options="[...new Set([...(form.businessType ? [form.businessType] : []), ...BUSINESS_TYPES])].map((v) => ({ value: v, label: v }))"
            />
          </div>
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>产品分类</label>
            <FormSelect
              v-model:value="form.productCategory"
              class="inline-control field-control"
              :status="errors.productCategory ? 'error' : ''"
              :options="[...new Set([...(form.productCategory ? [form.productCategory] : []), ...PRODUCT_CATEGORIES])].map((v) => ({ value: v, label: v }))"
            />
          </div>
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>产品名称</label>
            <FormSelect
              :key="form.productCategory"
              v-model:value="form.productName"
              class="inline-control field-control"
              :status="errors.productName ? 'error' : ''"
              :disabled="!productNameOptions.length"
              :placeholder="productNameOptions.length ? '请选择' : '请先选分类'"
              :options="productNameOptions.map((v) => ({ value: v, label: v }))"
              @change="onProductNameChange"
            />
          </div>
        </div>

        <div class="row-3">
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>问题一类</label>
            <FormSelect
              v-model:value="form.problemL1"
              class="inline-control field-control"
              :disabled="!form.productName"
              :status="errors.problemL1 ? 'error' : ''"
              :placeholder="form.productName ? '请选择' : '请先选产品'"
              :options="problemL1Options.map((v) => ({ value: v, label: v }))"
            />
          </div>
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>问题二类</label>
            <FormSelect
              v-model:value="problemL2Path"
              class="inline-control field-control"
              :disabled="!form.productName || !l2PathOptions.length"
              :status="errors.problemL2 ? 'error' : ''"
              :placeholder="form.problemL1 ? '请选择' : '可直接选择二级'"
              :options="l2PathOptions.map(({ value, label, disabled }) => ({ value, label, disabled }))"
            />
          </div>
          <div class="inline-field">
            <label class="inline-label xl"><span v-if="hasL3 || !form.problemL2" class="req">*</span>问题三类</label>
            <FormSelect
              v-model:value="problemL3Path"
              class="inline-control field-control"
              :disabled="!form.productName || !l3PathOptions.length"
              :status="errors.problemL3 ? 'error' : ''"
              :placeholder="form.problemL2 ? '请选择' : '可直接选择三级'"
              :options="l3PathOptions.map(({ value, label, disabled }) => ({ value, label, disabled }))"
            />
          </div>
        </div>

        <div class="row-3">
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>优先级</label>
            <FormSelect
              v-model:value="form.priority"
              class="inline-control field-control"
              allow-clear
              :status="errors.priority ? 'error' : ''"
              :options="priorityOptions"
            />
          </div>
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>工单类型</label>
            <FormSelect
              v-model:value="form.ticketType"
              class="inline-control field-control"
              allow-clear
              :disabled="lockTicketType"
              :status="errors.ticketType ? 'error' : ''"
              :options="ticketTypeOptions"
            />
          </div>
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>工单来源</label>
            <FormSelect
              v-model:value="form.ticketSource"
              class="inline-control field-control"
              :disabled="isXiaozhiType || simplifiedExternal"
              :options="ticketSourceOptions"
            />
          </div>
        </div>
        </template>
        <div class="detail-body">
          <div v-if="!simplifiedExternal && !isFlashType && !hidesDeviceSn" class="inline-field sn-field">
            <label class="inline-label xl">设备SN</label>
            <a-input
              v-model:value="form.deviceSn"
              class="inline-control field-control"
              placeholder="请输入设备SN"
            />
          </div>
          <div class="inline-field desc-field">
            <label class="inline-label xl"><span class="req">*</span>问题描述</label>
            <div class="inline-control field-control desc-attach" :class="{ 'has-error': errors.description }">
              <OpTextareaAttach
                v-model="form.description"
                v-model:attachments="form.descriptionAttachments"
                :min-input-height="60"
                :placeholder="isXiaozhiType ? '请描述问题与诉求，可上传截图或文档' : '请描述客户反馈的问题与诉求'"
              />
            </div>
          </div>
        </div>
      </CreateTicketPartCard>

      <a-alert v-if="isAftersaleType" type="info" message="已选择售后分类，请在售后建单弹窗中继续填写。" />
      <template v-else-if="!isContinuation">
        <ExternalEscalationPart v-if="simplifiedExternal" :ctx="ctx" />
        <UnifiedComplaintPart v-else-if="showTypePart" :ctx="ctx" :standard-upgrade="item.context.action === 'escalateComplaint'" />
        <FlashInfoPart v-if="isFlashType" v-model:info="form.flash" :errors="flashErrors" :customer-region="form.customer?.region" />
        <XiaozhiInfoPart v-if="isXiaozhiType" v-model:info="form.xiaozhi" :errors="xiaozhiErrors" />
        <RefundInfoPart v-if="isRefundType" v-model:info="form.refund" :errors="refundErrors" :customer-region="form.customer?.region" />
      </template>

    </div>

    <div class="uc-footer-wrap">
      <div v-if="isFlashType && flashBlock" class="flash-block-tip" role="alert">
        <template v-if="flashBlock.code === 'A2' && flashBlock.inflightNo">
          该设备已有在途刷机单
          <a
            class="flash-block-link"
            :href="ticketHref(flashBlock.inflightNo)"
            target="_blank"
            rel="noopener"
          >{{ flashBlock.inflightNo }}</a>，请勿重复提交
        </template>
        <template v-else>{{ flashBlock.message }}</template>
      </div>
      <div class="uc-footer">
        <div v-if="!isFlashType && !isXiaozhiType && !isAftersaleType && duplicateTickets.length" class="footer-hint">
          <WarningOutlined :style="{ color: '#F59E0B', fontSize: '13px' }" />
          <span>
            检测到疑似重复工单 {{ duplicateTickets.length }} 张：<template v-for="(t, i) in duplicateTickets.slice(0, 3)" :key="t.no"
            ><template v-if="i">、</template><a
              class="flash-block-link"
              :href="ticketHref(t.no)"
              target="_blank"
              rel="noopener"
            >{{ t.no }}</a></template><template v-if="duplicateTickets.length > 3"> 等</template>，请确认
          </span>
        </div>
        <div class="footer-btns">
          <button type="button" class="uc-action" @click="onCancel">
            <CloseOutlined />
            <span>取消</span>
          </button>
          <template v-if="isAftersaleType">
            <button type="button" class="uc-action is-process" @click="continueAftersale">
              <CheckCircleOutlined />
              <span>继续创建售后工单</span>
            </button>
          </template>
          <template v-else>
            <button type="button" class="uc-action" @click="onDraft">
              <SaveOutlined />
              <span>存草稿</span>
            </button>
            <button type="button" class="uc-action is-create" :disabled="submitting" @click="onCreate(false)">
              <FileAddOutlined />
              <span>{{ item.status === 'unknown' ? '核对本次结果' : item.status === 'complete' ? '已完成' : item.context.action === 'create' ? createPrimaryLabel : CREATE_WORK_LABELS[item.context.action] }}</span>
            </button>
            <button
              v-if="!isXiaozhiType && !isRefundType && !simplifiedExternal && !isContinuation"
              type="button"
              class="uc-action is-process"
              :disabled="submitting"
              @click="onCreate(true)"
            >
              <CheckCircleOutlined />
              <span>创建并处理</span>
            </button>
          </template>
        </div>
      </div>
    </div>
    <WorkAftersaleModal v-if="item.aftersaleOpen && item.modalHost !== 'workspace'" :item="item" :context="aftersaleContext" @completed="saleCompleted" />
  </div>
</template>

<style src="./unified-create.css"></style>
