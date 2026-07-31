import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import type { CreateTicketPrefill, Ticket } from '@/views/tickets/types/ticket';
import {
  type CreateTicketFormState,
  type CustomerInfo,
  BUSINESS_TYPES,
  MOCK_CUSTOMER,
  PROBLEM_TREE,
  PRODUCT_NAMES,
  buildAutoTitle,
  mapChannelToSource,
  mapFormTypeToTicketType,
  resolveComplaintNature,
} from '@/views/tickets/types/createTicket';

function defaultForm(): CreateTicketFormState {
  return {
    businessType: '翻录',
    ticketType: '投诉',
    ticketSource: '热线电话',
    customerQuery: '',
    customer: { ...MOCK_CUSTOMER },
    showReporter: false,
    reporter: { name: '', phone: '', relation: '家属' },
    productCategory: '智能硬件',
    productName: '学习机 T20',
    deviceSn: '',
    problemL1: '功能异常',
    problemL2: '播放问题',
    problemL3: '在线播放',
    priority: 'P0',
    description: '在线播放频繁跳歌，重启无效，影响使用，要求尽快解决。',
    resolveTimeRemark: '',
    title: '',
    titleManual: false,
    expectTime: '今日 18:00',
    complaintType: '服务投诉',
    complaintPlatform: '市场监管12315平台',
    businessLine: '学习机业务线',
    complaintNo: '',
    priorFeedback: '是-400',
    serviceReview: '需要回溯',
    complaintL1: '产品质量投诉',
    complaintL2: '产品质量故障',
    problemTime: '',
    suggestL1: '产品体验',
    suggestL2: '功能建议',
  };
}

export function useCreateTicketForm(prefill: () => CreateTicketPrefill | null | undefined) {
  const form = reactive<CreateTicketFormState>(defaultForm());
  const snVerified = ref(true);
  const assignAdopted = ref(false);
  const submitting = ref(false);
  const customerModalOpen = ref(false);
  const editingCustomer = ref(false);

  const errors = reactive({
    businessType: false,
    ticketType: false,
    customer: false,
    productCategory: false,
    productName: false,
    deviceSn: false,
    problemL1: false,
    problemL2: false,
    problemL3: false,
    description: false,
    title: false,
    customerAddress: false,
    problemTime: false,
  });

  const problemL1Options = computed(() => Object.keys(PROBLEM_TREE));
  const problemL2Options = computed(() =>
    form.problemL1 ? Object.keys(PROBLEM_TREE[form.problemL1] ?? {}) : [],
  );
  const problemL3Options = computed(() =>
    form.problemL1 && form.problemL2
      ? (PROBLEM_TREE[form.problemL1]?.[form.problemL2] ?? [])
      : [],
  );
  const productNameOptions = computed(
    () => PRODUCT_NAMES[form.productCategory] ?? [],
  );

  const showTypePart = computed(() => form.ticketType !== '商机');
  const typePartSubtitle = computed(() => `「${form.ticketType}」工单专属字段`);
  const customerAddressRequired = computed(() => form.ticketType === '商机');
  const problemTimeRequired = computed(
    () => form.ticketType === '投诉' || form.ticketType === '咨询',
  );

  function syncTitle() {
    if (form.titleManual) return;
    form.title = buildAutoTitle(form.productName, form.problemL3, form.ticketSource);
  }

  function reset() {
    Object.assign(form, defaultForm());
    syncTitle();
    snVerified.value = true;
    assignAdopted.value = false;
    customerModalOpen.value = false;
    editingCustomer.value = false;
    clearErrors();
  }

  function clearErrors() {
    Object.keys(errors).forEach((k) => {
      (errors as Record<string, boolean>)[k] = false;
    });
  }

  function applyPrefill(p: CreateTicketPrefill) {
    reset();
    form.ticketType = p.formTicketType ?? (p.mode === 'child' ? '咨询' : '投诉');
    form.ticketSource = p.ticketSource ?? mapChannelToSource(p.channel);
    form.customerQuery = p.customerName
      ? `${p.customerName}${p.customerPhone ? ` · ${p.customerPhone}` : ''}`
      : '';
    if (p.customerName) {
      form.customer = {
        ...MOCK_CUSTOMER,
        name: p.customerName,
        phone: p.customerPhone ?? MOCK_CUSTOMER.phone,
        vip: p.vip ?? false,
      };
    } else {
      form.customer = null;
    }
    form.productName = p.product ?? form.productName;
    form.deviceSn = p.sn ?? '';
    form.description = p.desc ?? '';
    form.priority = p.priority ?? 'P1';
    form.expectTime = p.expectTime ?? '今日 18:00';
    // 升级投诉等场景：原单信息一次性同步（只覆盖有值项，其余留默认由坐席补全）
    if (p.businessType && (BUSINESS_TYPES as string[]).includes(p.businessType)) {
      form.businessType = p.businessType as CreateTicketFormState['businessType'];
    }
    if (p.businessLine) form.businessLine = p.businessLine;
    if (p.problemL1) {
      form.problemL1 = p.problemL1;
      form.problemL2 = p.problemL2 ?? Object.keys(PROBLEM_TREE[p.problemL1] ?? {})[0] ?? '';
      form.problemL3 = p.problemL3 ?? PROBLEM_TREE[p.problemL1]?.[form.problemL2]?.[0] ?? '';
    }
    if (p.complaintL1) form.complaintL1 = p.complaintL1;
    if (p.complaintL2) form.complaintL2 = p.complaintL2;
    // 投诉性质由二类推导，预填的性质只作兜底
    form.complaintType = resolveComplaintNature(form.complaintL2) || p.complaintType || form.complaintType;
    if (p.complaintPlatform) form.complaintPlatform = p.complaintPlatform;
    if (p.complaintNo) form.complaintNo = p.complaintNo;
  }

  function onTitleInput() {
    form.titleManual = true;
  }

  function onProductCategoryChange() {
    const names = PRODUCT_NAMES[form.productCategory] ?? [];
    form.productName = names[0] ?? '';
    syncTitle();
  }

  function onProductNameChange() {
    syncTitle();
  }

  function onProblemL1Change() {
    const l2 = Object.keys(PROBLEM_TREE[form.problemL1] ?? {})[0] ?? '';
    form.problemL2 = l2;
    form.problemL3 = PROBLEM_TREE[form.problemL1]?.[l2]?.[0] ?? '';
    syncTitle();
  }

  function onProblemL2Change() {
    form.problemL3 = PROBLEM_TREE[form.problemL1]?.[form.problemL2]?.[0] ?? '';
    syncTitle();
  }

  function searchCustomer() {
    if (!form.customerQuery.trim()) return;
    form.customer = {
      ...MOCK_CUSTOMER,
      name: '李测试',
      phone: form.customerQuery.replace(/\s/g, ''),
    };
    message.success('已匹配客户（Mock）');
  }

  function clearCustomer() {
    form.customer = null;
    form.customerQuery = '';
  }

  function openCreateCustomer() {
    editingCustomer.value = false;
    customerModalOpen.value = true;
  }

  function openEditCustomer() {
    editingCustomer.value = true;
    customerModalOpen.value = true;
  }

  function saveCustomer(customer: CustomerInfo) {
    form.customer = customer;
    form.customerQuery = `${customer.name} · ${customer.phone}`;
    customerModalOpen.value = false;
    message.success(editingCustomer.value ? '客户信息已更新' : '客户已创建');
  }

  function validate(): boolean {
    clearErrors();
    errors.businessType = !form.businessType;
    errors.ticketType = !form.ticketType;
    errors.customer = !form.customer;
    errors.productCategory = !form.productCategory;
    errors.productName = !form.productName;
    errors.deviceSn = false;
    errors.problemL1 = !form.problemL1;
    errors.problemL2 = !form.problemL2;
    errors.problemL3 = !form.problemL3;
    errors.description = !form.description.trim();
    errors.title = !form.title.trim();
    errors.customerAddress =
      customerAddressRequired.value &&
      (!form.customer?.region?.trim() || !form.customer?.address?.trim());
    errors.problemTime =
      problemTimeRequired.value && !form.problemTime.trim();

    const hasError = Object.values(errors).some(Boolean);
    if (hasError) {
      message.error(
        customerAddressRequired.value && errors.customerAddress
          ? '商机工单需填写客户省市区地址'
          : problemTimeRequired.value && errors.problemTime
            ? '请填写问题发生时间'
            : '请填写必填项',
      );
      return false;
    }
    return true;
  }

  function genNo() {
    const n = Math.floor(10000 + Math.random() * 89999);
    return `LCMN-20260618-${n}`;
  }

  function buildTicket(): Ticket {
    const name = form.customer?.name ?? '未知客户';
    return {
      id: 'new-' + Date.now(),
      no: genNo(),
      type: mapFormTypeToTicketType(form.ticketType),
      channel: '电话',
      title: form.title.trim(),
      smartMarks: form.ticketType === '投诉' ? ['升级'] : [],
      customer: name,
      vip: form.customer?.vip ?? false,
      product: form.productName,
      nodeStatus: '待受理',
      nodeStep: 1,
      nodeTotal: 5,
      priority: form.priority,
      slaText: form.priority === 'P0' ? '00:15:00' : '08:00:00',
      slaSub: '距超时',
      slaState: form.priority === 'P0' ? 'soon' : 'ok',
      slaMinutes: form.priority === 'P0' ? 15 : 480,
      assignee: assignAdopted.value ? '王坐席' : '张三',
      tab: 'mine',
    };
  }

  watch(
    () => form.ticketType,
    () => {
      if (form.ticketType === '商机' && form.customer && !form.customer.region) {
        form.customer.region = '';
        form.customer.address = '';
      }
    },
  );

  watch(
    () => [form.productName, form.problemL3, form.ticketSource] as const,
    () => syncTitle(),
  );

  watch(
    () => form.productCategory,
    () => onProductCategoryChange(),
  );

  // 投诉性质 = 投诉二类推导（0730 口径）：坐席只选分类，性质只读跟随
  watch(
    () => form.complaintL2,
    () => { form.complaintType = resolveComplaintNature(form.complaintL2); },
    { immediate: true },
  );

  return {
    form,
    snVerified,
    assignAdopted,
    submitting,
    customerModalOpen,
    editingCustomer,
    errors,
    problemL1Options,
    problemL2Options,
    problemL3Options,
    productNameOptions,
    showTypePart,
    typePartSubtitle,
    customerAddressRequired,
    reset,
    applyPrefill,
    onTitleInput,
    onProductCategoryChange,
    onProductNameChange,
    onProblemL1Change,
    onProblemL2Change,
    searchCustomer,
    clearCustomer,
    openCreateCustomer,
    openEditCustomer,
    saveCustomer,
    validate,
    buildTicket,
    syncTitle,
  };
}
