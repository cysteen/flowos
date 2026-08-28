import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import type { CreateTicketPrefill, Ticket } from '@/views/tickets/types/ticket';
import { makeTicketNo } from '@/constants/ticketNo';
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
  normalizeComplaintType,
  normalizeTicketSource,
} from '@/views/tickets/types/createTicket';

function defaultForm(): CreateTicketFormState {
  return {
    businessType: '学习机',
    ticketType: '投诉',
    // 默认「正常流程」：多数单要进流程办理；直接结案是坐席当场答完才选的少数情形
    closureMode: '正常流程',
    ticketSource: '电话',
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
    complaintType: '投诉',
    complaintPlatforms: [{ platform: '', complaintNo: '' }],
    businessLine: '学习机业务线',
    priorFeedback: '是-400',
    serviceReview: '',
    complaintL1: '产品问题',
    complaintL2: '产品质量',
    complaintReceiveTime: '',
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
    complaintType: false,
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

  const showTypePart = computed(
    () => form.ticketType === '投诉' || form.ticketType === '建议',
  );
  const typePartSubtitle = computed(() => `「${form.ticketType}」工单专属字段`);
  const customerAddressRequired = computed(() => form.ticketType === '商机');
  /**
   * 投诉专属字段的**来源门控**（0803）：
   * 投诉平台 / 投诉编号 / 投诉类型 / 归属业务线 / 前期是否反馈 / 服务回溯
   * 仅当 **工单类型=投诉 且 工单来源=内投渠道 或 外投渠道** 时出现——
   * 热线、IM、小程序等来源的投诉单不涉及投诉渠道台账，这些字段不该占版面。
   * 投诉一类/二类不受门控（必填）；问题发生时间已上移至产品区（优先级右侧，非必填）。
   * 校验与显隐共用本判据，避免隐藏字段被判必填而卡住提交。
   */
  const showChannelComplaintFields = computed(
    () =>
      form.ticketType === '投诉' &&
      (form.ticketSource === '内投渠道' || form.ticketSource === '外投渠道'),
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
    form.ticketSource = (
      p.ticketSource
        ? normalizeTicketSource(p.ticketSource)
        : mapChannelToSource(p.channel)
    ) as CreateTicketFormState['ticketSource'];
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
    if (p.complaintType) form.complaintType = normalizeComplaintType(p.complaintType);
    // 预填的平台/编号落到第一组
    if (p.complaintPlatform || p.complaintNo) {
      form.complaintPlatforms = [{
        platform: p.complaintPlatform ?? '',
        complaintNo: p.complaintNo ?? '',
      }];
    }
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
    errors.problemTime = false;
    errors.complaintType =
      showChannelComplaintFields.value && !form.complaintType;

    const hasError = Object.values(errors).some(Boolean);
    if (hasError) {
      message.error(
        customerAddressRequired.value && errors.customerAddress
          ? '商机工单需填写客户省市区地址'
          : '请填写必填项',
      );
      return false;
    }
    return true;
  }

  /** 单号规则见 constants/ticketNo.ts —— 前缀跟着**建单时选的工单类型**走 */
  function genNo() {
    const n = Math.floor(1 + Math.random() * 99998);
    return makeTicketNo(form.ticketType, n, new Date(2026, 5, 18));
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
      // 结案方式建单时选定、此后不可改（基线 §1「结案方式」小节），故只在这里落一次
      closureMode: form.closureMode,
      nodeStatus: '未认领',
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
    showChannelComplaintFields,
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
