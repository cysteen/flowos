import { computed, nextTick, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import type { CreateTicketPrefill, Ticket } from '@/views/tickets/types/ticket';
import { makeTicketNo } from '@/constants/ticketNo';
import {
  type CreateTicketFormState,
  type CustomerInfo,
  BUSINESS_TYPES,
  CUSTOMER_SEARCH_LIMIT,
  MOCK_CUSTOMER,
  PROBLEM_TREE,
  PRODUCT_NAMES,
  buildAutoTitle,
  findCustomerById,
  upsertCustomer,
  mapChannelToSource,
  mapFormTypeToTicketType,
  normalizeComplaintType,
  normalizeTicketSource,
  searchCustomers,
  defaultCreateTicketFlashForm,
  defaultCreateTicketXiaozhiForm,
  type CreateTicketFlashField,
  type CreateTicketXiaozhiField,
} from '@/views/tickets/types/createTicket';
import type { Channel } from '@/views/tickets/types/ticket';
import { currentHandlerName } from '@/views/tickets/types/ticket';
import {
  useFlashStore,
  type FlashCreateEvaluation,
  type FlashCreateInput,
  type FlashEvaluationCreate,
  type FlashTicketBase,
} from '@/stores/flash';
import {
  FLASH_FIELD_LABELS,
  FLASH_TAG_L1,
  FLASH_TAG_L2,
  FLASH_TAG_L3S,
  FLASH_TICKET_TYPE,
  flashTicketTitle,
  type FlashActor,
  type FlashCreator,
} from '@/views/tickets/types/flash';
import {
  XIAOZHI_BUSINESS_TYPE, XIAOZHI_TICKET_SOURCE, XIAOZHI_TICKET_TYPE, XIAOZHI_TIP,
  xiaozhiTicketTitle,
} from '@/views/tickets/types/xiaozhi';
import {
  useXiaozhiStore,
  type XiaozhiActor, type XiaozhiCreateInput, type XiaozhiTicketBase,
} from '@/stores/xiaozhi';
import { findSchoolById } from '@/mock/schools';
import { useUserStore } from '@/stores/user';
import { useFlashConfigStore } from '@/stores/flashConfig';
import { mapUserRole } from '@/views/tickets/composables/opActions';

/** 「刷机信息」卡必填项：字段 → 展示名 + 提示动词（输入类「请填写」、选择类「请选择」，PRD §2.3 第 1 条） */
const FLASH_REQUIRED_FIELDS: { field: CreateTicketFlashField; label: string; verb: '请填写' | '请选择' }[] = [
  { field: 'sn', label: FLASH_FIELD_LABELS.sn, verb: '请填写' },
  { field: 'studentAccount', label: FLASH_FIELD_LABELS.studentAccount, verb: '请填写' },
  { field: 'studentName', label: FLASH_FIELD_LABELS.studentName, verb: '请填写' },
  { field: 'schoolId', label: FLASH_FIELD_LABELS.schoolName, verb: '请选择' },
  { field: 'reason', label: FLASH_FIELD_LABELS.reason, verb: '请选择' },
];

/** 刷机单提交拦截（显示在弹窗底栏上方）：机型不支持 / 同 SN 在途 / 在途查询不可用 */
export interface FlashSubmitBlock {
  code: 'A1' | 'A2' | 'busy';
  message: string;
  /** A2：在途单号 */
  inflightNo?: string;
}

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
    // 与默认工单类型「投诉」配套：双向联动下投诉只能 P0/P1，取其中较低的 P1
    priority: 'P1',
    description: '在线播放频繁跳歌，重启无效，影响使用，要求尽快解决。',
    descriptionAttachments: [],
    title: '',
    titleManual: false,
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
    flash: defaultCreateTicketFlashForm(),
    xiaozhi: defaultCreateTicketXiaozhiForm(),
  };
}

export function useCreateTicketForm(prefill: () => CreateTicketPrefill | null | undefined) {
  const form = reactive<CreateTicketFormState>(defaultForm());
  const snVerified = ref(true);
  const assignAdopted = ref(false);
  const submitting = ref(false);
  const customerModalOpen = ref(false);
  const editingCustomer = ref(false);
  /** 客户搜索下拉 */
  const customerSearchOpen = ref(false);
  const customerSearchHits = ref<CustomerInfo[]>([]);
  const customerSearchTooMany = ref(false);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * 预填批量赋值期间置位：产品分类与业务分类两个联动 watcher 直接跳过。
   *
   * 两个 watcher 是给**坐席手动改**准备的——改分类要连带换产品名、按客户标识重取档案。
   * 预填是整批灌值，灌完就是最终值，联动一跑反而把刚填进去的产品名换成分类首项、
   * 把客户卡换回档案库里的默认客户（搜索框却还是原单客户，一页两说）。
   */
  let applyingPrefill = false;

  const errors = reactive({
    businessType: false,
    ticketType: false,
    priority: false,
    customer: false,
    productCategory: false,
    productName: false,
    deviceSn: false,
    problemL1: false,
    problemL2: false,
    problemL3: false,
    description: false,
    title: false,
    problemTime: false,
    complaintType: false,
  });

  const flashConfig = useFlashConfigStore();
  /**
   * 问题分类按产品维护（1014）：刷机分类（售后 → 服务申请 → 自助刷机 / 刷原生系统）
   * 只对挂了刷机类问题分类的产品出现（后台「问题分类」里本产品至少一条「是否刷机」开启，10-19 C1）；其余分类各产品共用。
   * 读刷机配置的响应式状态，后台开关一改，建单下拉随即联动。
   */
  const productProblemTree = computed<Record<string, Record<string, string[]>>>(() => {
    const product = form.productName ?? '';
    const tree: Record<string, Record<string, string[]>> = {};
    for (const [l1, l2Map] of Object.entries(PROBLEM_TREE)) {
      const l2Out: Record<string, string[]> = {};
      for (const [l2, l3s] of Object.entries(l2Map)) {
        const kept = l3s.filter((l3) => {
          const isFlashPath = l1 === FLASH_TAG_L1 && l2 === FLASH_TAG_L2
            && (FLASH_TAG_L3S as readonly string[]).includes(l3);
          return !isFlashPath || flashConfig.isSupportedModel(product);
        });
        if (kept.length) l2Out[l2] = kept;
      }
      if (Object.keys(l2Out).length) tree[l1] = l2Out;
    }
    return tree;
  });
  const problemL1Options = computed(() => Object.keys(productProblemTree.value));
  const problemL2Options = computed(() =>
    form.problemL1 ? Object.keys(productProblemTree.value[form.problemL1] ?? {}) : [],
  );
  const problemL3Options = computed(() =>
    form.problemL1 && form.problemL2
      ? (productProblemTree.value[form.problemL1]?.[form.problemL2] ?? [])
      : [],
  );

  /**
   * 换产品（或后台开关改了）后，已选的一 / 二 / 三级不在新选项里即回落：
   * 一级不在 → 回默认一级及其首项；二级不在 → 本一级首项；三级不在 → 本二级首项。
   * 空值（预填显式清空、由坐席补选）不回落。
   */
  function fallbackProblem() {
    const tree = productProblemTree.value;
    // 只回落「问题分类里有、但本产品下没有」的选中值；落不到问题分类上的预填值原样保留
    const full = PROBLEM_TREE[form.problemL1];
    if (!form.problemL1 || !full) return;
    if (!tree[form.problemL1]) {
      const def = defaultForm();
      const l1 = tree[def.problemL1] ? def.problemL1 : (Object.keys(tree)[0] ?? '');
      const l2 = Object.keys(tree[l1] ?? {})[0] ?? '';
      form.problemL1 = l1;
      form.problemL2 = l2;
      form.problemL3 = tree[l1]?.[l2]?.[0] ?? '';
      return;
    }
    const l2Map = tree[form.problemL1];
    if (form.problemL2 && full[form.problemL2] && !l2Map[form.problemL2]) {
      form.problemL2 = Object.keys(l2Map)[0] ?? '';
      form.problemL3 = l2Map[form.problemL2]?.[0] ?? '';
      return;
    }
    const l3s = l2Map[form.problemL2] ?? [];
    if (form.problemL3 && full[form.problemL2]?.includes(form.problemL3) && !l3s.includes(form.problemL3)) {
      form.problemL3 = l3s[0] ?? '';
    }
  }
  watch(productProblemTree, fallbackProblem);
  const productNameOptions = computed(
    () => PRODUCT_NAMES[form.productCategory] ?? [],
  );

  const showTypePart = computed(
    () => form.ticketType === '投诉' || form.ticketType === '建议',
  );
  const typePartSubtitle = computed(() => `「${form.ticketType}」工单专属字段`);
  /**
   * 投诉专属字段的**来源门控**（0803）：
   * 投诉平台 / 投诉编号 / 投诉类型 / 归属业务线 / 前期是否反馈 / 服务回溯 / 投诉接收时间
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

  /* ---------------- 刷机单（930 教育刷机单 PRD §2.3 / §2.4；1013 A1–A4） ---------------- */

  /**
   * 刷机单识别（10-19 C1）：只看所选问题分类「是否刷机」开启（问题分类按产品维护）。
   * 命中即切到刷机接单表单：类型专属区块换成「刷机信息」卡，工单类型固定咨询、业务分类固定教育。
   */
  /** 入口固定了工单类型（升级投诉 / 刷机单关联投诉）：不做刷机单识别（预填 `noFlashScene`） */
  const flashSceneOff = ref(false);
  const isFlashType = computed(() => !flashSceneOff.value && flashConfig.isFlashScene(
    form.productName, form.problemL1, form.problemL2, form.problemL3,
  ));
  /** 「刷机信息」卡字段下方的必填提示 */
  const flashErrors = reactive<Record<CreateTicketFlashField, string>>({
    sn: '', studentAccount: '', studentName: '', schoolId: '', reason: '',
  });
  /** 客户信息区手机号字段下方的必填提示 */
  const flashPhoneError = ref('');
  /** 弹窗底栏上方的行内拦截提示 */
  const flashBlock = ref<FlashSubmitBlock | null>(null);

  function clearFlashErrors() {
    (Object.keys(flashErrors) as CreateTicketFlashField[]).forEach((k) => { flashErrors[k] = ''; });
    flashPhoneError.value = '';
    flashBlock.value = null;
  }

  /** 坐席代建的建单入口：一线坐席记「一线代建」，其余代建角色记「二线代建」 */
  function flashCreator(): FlashCreator {
    return useUserStore().roleKey === 'agent-l1' ? '一线代建' : '二线代建';
  }

  /** 建单人：取当前登录人在工单数据源里的处理人名，与「本人建的单」判定同一把（`currentHandlerName`） */
  function flashActor(): FlashActor {
    const user = useUserStore();
    return { name: currentHandlerName(user.roleKey, user.name), role: mapUserRole(user.roleKey) };
  }

  function flashInput(): FlashCreateInput {
    const f = form.flash;
    return {
      // 产品两级取「产品问题」卡的产品分类 + 产品名称；问题分类取所选三级（1013 A4 / A5）
      productModel: form.productName ?? '',
      productCategory: form.productCategory,
      problemL1: form.problemL1,
      problemL2: form.problemL2,
      problemL3: form.problemL3,
      sn: f.sn ?? '',
      studentAccount: f.studentAccount ?? '',
      studentName: f.studentName ?? '',
      schoolId: f.schoolId ?? '',
      schoolName: f.schoolId ? findSchoolById(f.schoolId)?.name : undefined,
      reason: f.reason ?? '',
      romVersion: (f.romVersion ?? '').trim(),
      mdmVersion: (f.mdmVersion ?? '').trim(),
      snPhotos: [...(f.snPhotos ?? [])],
      // 联系手机号取客户信息区的客户手机号（PRD §2.4）
      contactPhone: form.customer?.phone ?? '',
    };
  }

  function flashBase(): FlashTicketBase {
    const channel: Channel = form.ticketSource === 'IM'
      ? '在线客服'
      : form.ticketSource === '客户服务小程序' ? '小程序' : '电话';
    return {
      customer: form.customer?.name ?? '',
      customerPhone: form.customer?.phone,
      vip: form.customer?.vip ?? false,
      channel,
      ticketSource: form.ticketSource,
      priority: form.priority,
      // 刷机单不出「工单标题」卡，标题由刷机服务按「刷机 · 产品名称 · 问题分类第三级 · 工单来源」生成（PRD §2.4）
      title: undefined,
      // 坐席代建的问题描述与附件取表单（PRD §2.4，用户 10-19 定）；用户提报才由系统生成
      problemDesc: form.description.trim(),
      problemDescAttachments: [...form.descriptionAttachments],
    };
  }

  /**
   * 刷机单提交校验（M46 顺序：必填 → 机型不支持 → 同 SN 在途 / 在途查询不可用）。
   * 判定全部交给 `useFlashStore().evaluateCreate`；本函数只把结果落到提示位置：
   * 必填 → 字段下方；其余拦截 → 弹窗底栏上方。通过返回建单分流结果，拦截返回 null。
   */
  function validateFlash(): FlashEvaluationCreate | null {
    clearErrors();
    clearFlashErrors();
    errors.customer = !form.customer;
    // 问题描述必填（坐席代建，同普通咨询单）：与刷机信息必填一起提示，先于其余拦截
    errors.description = !form.description.trim();
    const evaluation: FlashCreateEvaluation = useFlashStore().evaluateCreate(flashInput(), flashCreator());
    if (evaluation.kind === 'create') return errors.description ? null : evaluation;
    if (evaluation.code === 'required' || errors.description) {
      const missing = new Set(evaluation.missing ?? []);
      FLASH_REQUIRED_FIELDS.forEach(({ field, label, verb }) => {
        if (missing.has(label)) flashErrors[field] = `${verb}${label}`;
      });
      // 未绑定客户时由客户信息区的空态承载报错，不再叠加手机号提示
      if (form.customer && missing.has(FLASH_FIELD_LABELS.contactPhone)) {
        flashPhoneError.value = `请填写${FLASH_FIELD_LABELS.contactPhone}`;
      }
      return null;
    }
    flashBlock.value = { code: evaluation.code, message: evaluation.message, inflightNo: evaluation.inflightNo };
    return null;
  }

  /** 校验通过后建刷机单（走刷机服务 `createFlashTicket`，不走 `buildTicket`） */
  function submitFlash(): { ticket: Ticket; evaluation: FlashEvaluationCreate } | null {
    if (!validateFlash()) return null;
    const { evaluation, ticket } = useFlashStore().createFlashTicket(flashInput(), flashBase(), flashCreator(), flashActor());
    if (evaluation.kind === 'blocked' || !ticket) {
      if (evaluation.kind === 'blocked' && evaluation.code !== 'required') {
        flashBlock.value = { code: evaluation.code, message: evaluation.message, inflightNo: evaluation.inflightNo };
      }
      return null;
    }
    return { ticket, evaluation };
  }

  // 改动刷机信息：底栏拦截提示随之失效；已补上的字段收起必填提示
  watch(
    () => form.flash,
    (f) => {
      flashBlock.value = null;
      if (!f) return;
      (Object.keys(flashErrors) as CreateTicketFlashField[]).forEach((k) => {
        if (flashErrors[k] && String(f[k] ?? '').trim()) flashErrors[k] = '';
      });
    },
    { deep: true },
  );

  watch(
    () => form.customer?.phone,
    (phone) => { if (phone?.trim()) flashPhoneError.value = ''; },
  );

  // 取消命中（换了产品或问题分类）即切回普通咨询表单，刷机信息卡已填的值清空（1013 B6）
  watch(isFlashType, (on) => {
    if (!on) {
      form.flash = defaultCreateTicketFlashForm();
      clearFlashErrors();
    }
    syncTitle();
  });

  // 刷机单：工单类型固定咨询（1013 A1）、业务分类固定「教育」（PRD §2.4），两个控件锁定，与落库一致（预填 / 草稿恢复同样收口）
  watch(
    () => [isFlashType.value, form.ticketType, form.businessType] as const,
    ([on, t, b]) => {
      if (!on) return;
      if (t !== FLASH_TICKET_TYPE) form.ticketType = FLASH_TICKET_TYPE;
      if (b !== '教育') form.businessType = '教育';
    },
    { immediate: true },
  );

  /* ---------------- 小智工单（1130 小智工单 D1 / D3 / D5 / D24 / D27） ---------------- */

  /**
   * 小智单识别（D1 / D3）：**由入口置位**（预填 `xiaozhiScene`），不按产品 / 问题分类识别。
   * D2「按技能组判身份」是容联云 / UAP 侧的事（W7），工单系统侧只落结果 ——
   * 入口「新建小智工单」只对小智坐席渲染（`XIAOZHI_CREATE_ROLES`）。
   */
  const isXiaozhiType = computed(() => prefill()?.xiaozhiScene === true);

  /**
   * 「小智工单信息」卡字段下方的必填提示。
   * 只剩产品模块一项 —— 问题类别已并回通用问题分类（一·补 B15）、一线人员域账号已改选填
   * （一·补 B29），两者都不参与必填提示。
   */
  const xiaozhiErrors = reactive<Record<CreateTicketXiaozhiField, string>>({
    rdModule: '',
  });

  function clearXiaozhiErrors() {
    (Object.keys(xiaozhiErrors) as CreateTicketXiaozhiField[]).forEach((k) => { xiaozhiErrors[k] = ''; });
  }

  /**
   * 一线人员域账号预填 —— 🔴 **取本单所选客户（校代 / 渠道商）已登记的讯飞域账号**（一·补 B29）。
   *
   * 不是建单坐席的域账号：这一格是提报人登录小智工单应用做「是否解决」确认的凭据（B6），
   * 落成建单人就等于把确认权交给了客服自己。
   * **客户没登记域账号时留空**，不回落到任何人，由建单人手工录入或改（本字段选填）。
   *
   * `force`：打开小智建单弹窗 / 换客户时置 true，与所选客户重新对齐；
   * 非 force 时只补空值，不覆盖建单人已经手工改过的内容。
   */
  function applyXiaozhiFrontlineDefault(force = false) {
    if (!isXiaozhiType.value) return;
    const acc = (form.customer?.domainAccount ?? '').trim();
    if (force) form.xiaozhi.frontlineAccount = acc;
    else if (acc && !form.xiaozhi.frontlineAccount.trim()) form.xiaozhi.frontlineAccount = acc;
  }

  /** 换客户即重新按新客户的域账号对齐（没登记的客户 → 清空，不留上一位客户的账号） */
  watch(
    () => form.customer?.id ?? '',
    () => { applyXiaozhiFrontlineDefault(true); },
  );

  // 改动小智信息：已补上的字段收起必填提示
  watch(
    () => form.xiaozhi,
    (f) => {
      if (!f) return;
      (Object.keys(xiaozhiErrors) as CreateTicketXiaozhiField[]).forEach((k) => {
        if (xiaozhiErrors[k] && String(f[k] ?? '').trim()) xiaozhiErrors[k] = '';
      });
    },
    { deep: true },
  );

  /**
   * 小智单：工单类型锁「咨询」（D1）、业务分类锁「教育」（D4）、**工单来源锁 IM**（D24）。
   * 三个控件置灰，与落库一致（预填 / 草稿恢复同样收口）。
   */
  watch(
    () => [isXiaozhiType.value, form.ticketType, form.businessType, form.ticketSource] as const,
    ([on, t, b, s]) => {
      if (!on) return;
      if (t !== XIAOZHI_TICKET_TYPE) form.ticketType = XIAOZHI_TICKET_TYPE;
      if (b !== XIAOZHI_BUSINESS_TYPE) form.businessType = XIAOZHI_BUSINESS_TYPE;
      if (s !== XIAOZHI_TICKET_SOURCE) form.ticketSource = XIAOZHI_TICKET_SOURCE;
    },
    { immediate: true },
  );

  function xiaozhiInput(): XiaozhiCreateInput {
    const f = form.xiaozhi;
    return {
      rdModule: f.rdModule ?? '',
      rdPriority: f.rdPriority,
      frontlineAccount: f.frontlineAccount ?? '',
      /** 与通用咨询单同源：问题描述区上传的附件；流转产研时一并带入 rd.attachments */
      attachments: [...form.descriptionAttachments],
    };
  }

  function xiaozhiBase(): XiaozhiTicketBase {
    return {
      customer: form.customer?.name ?? '',
      customerPhone: form.customer?.phone,
      vip: form.customer?.vip ?? false,
      priority: form.priority,
      title: form.title,
      problemDesc: form.description,
      productCategory: form.productCategory,
      productName: form.productName,
      deviceSn: form.deviceSn,
      problemL1: form.problemL1,
      problemL2: form.problemL2,
      problemL3: form.problemL3,
      problemDescAttachments: [...form.descriptionAttachments],
    };
  }

  /**
   * 小智单提交（D5 / PRD §2）。出口只有一枚「创建」，走哪条路看「升级 TPD」勾选框（一·补 B27）：
   * - 未勾 → 落工单池，由小智团队领单处理结案；
   * - 勾上 → 落池留记录后由系统自动流转推产研（D6）。
   *
   * 🔴 **勾选状态只从表单读这一处**，不由调用方另传一个 `escalate` 参数 ——
   * 两处各存一份状态，勾了却走了落池那条路就是必然会出现的错。
   *
   * 返回 `null` ＝ 被拦住（必填缺项或产品模块没配接收人），提示落在字段下方；
   * 返回工单 ＝ 建成了，`escalated` 说明走的是哪条路、`degraded` 说明「建成但没流转成」
   * （产研平台不可用），由弹窗换成 `rdPlatformDownOnCreate` 那句，不能照「已流转产研」报喜。
   */
  function submitXiaozhi(): { ticket: Ticket; degraded: boolean; escalated: boolean } | null {
    const escalate = form.xiaozhi.escalateTpd === true;
    clearErrors();
    clearXiaozhiErrors();
    // 通用咨询单那套校验照跑（D27），小智专属字段另加一道
    if (!validate()) return null;
    const store = useXiaozhiStore();
    const result = store.createXiaozhiTicket(xiaozhiInput(), xiaozhiBase(), xiaozhiActor(), escalate);
    if (result.kind === 'blocked') {
      if (result.missing.includes('rdModule')) {
        xiaozhiErrors.rdModule = XIAOZHI_TIP.rdModuleRequired;
      }
      // 没配产研接收人：接收人是产品模块带出来的，故提示也落在产品模块那一栏下方
      if (result.reason === 'receiverMissing') {
        xiaozhiErrors.rdModule = XIAOZHI_TIP.rdReceiverMissing;
      }
      return null;
    }
    return { ticket: result.ticket, degraded: !!result.degraded, escalated: escalate };
  }

  /** 建单人：与「本人建的单」判定同一把（`currentHandlerName`） */
  function xiaozhiActor(): XiaozhiActor {
    const user = useUserStore();
    return { name: currentHandlerName(user.roleKey, user.name), role: mapUserRole(user.roleKey) };
  }

  function syncTitle() {
    if (form.titleManual) return;
    // 刷机单标题强制前缀「刷机」（1013 A3）
    form.title = isFlashType.value
      ? flashTicketTitle(form.productName, form.problemL3, form.ticketSource)
      : isXiaozhiType.value
        ? xiaozhiTicketTitle(form.productName, form.problemL3, form.ticketSource)
        : buildAutoTitle(form.productName, form.problemL3, form.ticketSource);
  }

  function reset() {
    Object.assign(form, defaultForm());
    flashSceneOff.value = false;
    syncTitle();
    snVerified.value = true;
    assignAdopted.value = false;
    customerModalOpen.value = false;
    editingCustomer.value = false;
    clearErrors();
    clearFlashErrors();
  }

  function clearErrors() {
    Object.keys(errors).forEach((k) => {
      (errors as Record<string, boolean>)[k] = false;
    });
  }

  function applyPrefill(p: CreateTicketPrefill) {
    applyingPrefill = true;
    try {
      fillPrefill(p);
    } finally {
      // watcher 回调在本轮 flush 里跑，复位要排在它们之后；异常路径同样复位，
      // 否则守卫留在 true，坐席之后手动改分类将不再联动
      void nextTick(() => { applyingPrefill = false; });
    }
  }

  function fillPrefill(p: CreateTicketPrefill) {
    reset();
    // 小智入口同样固定了工单类型（咨询 + 小智标识，D1）：不再做刷机单识别，两套表单不打架
    flashSceneOff.value = !!p.noFlashScene || !!p.xiaozhiScene;
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
      // 原单带来了客户档案字段（标识 / 地区 / 地址 / 客户类型）时按原单客户成卡，
      // 只带名字手机号的旧场景仍沿用档案库默认客户的其余字段
      const fromOrigin = !!(p.customerId || p.customerRegion || p.customerAddress || p.customerTypes);
      form.customer = fromOrigin
        ? {
          id: p.customerId ?? MOCK_CUSTOMER.id,
          name: p.customerName,
          phone: p.customerPhone ?? '',
          vip: p.vip ?? false,
          customerType: p.customerTypes?.[0] ?? '',
          customerTypes: p.customerTypes ? [...p.customerTypes] : undefined,
          contacts: p.customerPhone ? [{ type: '来电号码', value: p.customerPhone }] : [],
          gender: '',
          region: p.customerRegion ?? '',
          address: p.customerAddress ?? '',
        }
        : {
          ...MOCK_CUSTOMER,
          name: p.customerName,
          phone: p.customerPhone ?? MOCK_CUSTOMER.phone,
          vip: p.vip ?? false,
        };
    } else {
      form.customer = null;
    }
    // 产品分类先落、产品名后落：分类是产品名下拉的取值域，反过来会被分类联动重置
    if (p.productCategory && PRODUCT_NAMES[p.productCategory]) form.productCategory = p.productCategory;
    form.productName = p.product ?? form.productName;
    form.deviceSn = p.sn ?? '';
    form.description = p.desc ?? '';
    form.priority = p.priority ?? 'P1';
    // 升级投诉等场景：原单信息一次性同步（只覆盖有值项，其余留默认由坐席补全）
    if (p.businessType && (BUSINESS_TYPES as string[]).includes(p.businessType)) {
      form.businessType = p.businessType as CreateTicketFormState['businessType'];
    }
    if (p.businessLine) form.businessLine = p.businessLine;
    // 传空串＝清空三级分类（原单问题落不到问题树上时由坐席显式选，三项仍必填）
    if (p.problemL1 !== undefined) {
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
    if (p.xiaozhiScene) applyXiaozhiFrontlineDefault(true);
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
    const tree = productProblemTree.value;
    const l2 = Object.keys(tree[form.problemL1] ?? {})[0] ?? '';
    form.problemL2 = l2;
    form.problemL3 = tree[form.problemL1]?.[l2]?.[0] ?? '';
    syncTitle();
  }

  function onProblemL2Change() {
    form.problemL3 = productProblemTree.value[form.problemL1]?.[form.problemL2]?.[0] ?? '';
    syncTitle();
  }

  /** 立即检索（回车触发）；输入过程走 300ms 防抖的 onCustomerQueryInput */
  function searchCustomer() {
    const q = form.customerQuery.trim();
    if (q.length < 2) {
      customerSearchOpen.value = false;
      customerSearchHits.value = [];
      customerSearchTooMany.value = false;
      return;
    }
    const all = searchCustomers(q);
    customerSearchTooMany.value = all.length > CUSTOMER_SEARCH_LIMIT;
    customerSearchHits.value = all.slice(0, CUSTOMER_SEARCH_LIMIT);
    customerSearchOpen.value = true;
  }

  function onCustomerQueryInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(searchCustomer, 300);
  }

  function closeCustomerSearch() {
    customerSearchOpen.value = false;
  }

  /** 选中下拉里的客户 → 绑定并回填客户卡 */
  function selectCustomer(c: CustomerInfo) {
    form.customer = { ...c };
    form.customerQuery = `${c.name} · ${c.phone}`;
    customerSearchOpen.value = false;
    errors.customer = false;
  }

  /** 「更换」：解除客户绑定回到搜索态，已填写的工单字段保留 */
  function clearCustomer() {
    form.customer = null;
    form.customerQuery = '';
    customerSearchOpen.value = false;
    customerSearchHits.value = [];
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
    // 写回容联云档案，下次搜索即可命中
    upsertCustomer(customer);
    form.customer = customer;
    form.customerQuery = `${customer.name} · ${customer.phone}`;
    customerModalOpen.value = false;
    message.success(editingCustomer.value ? '客户信息已更新' : '客户已创建');
  }

  function validate(): boolean {
    clearErrors();
    errors.businessType = !form.businessType;
    errors.ticketType = !form.ticketType;
    // 两个字段可清空（联动死锁的出口，见 CreateTicketModal），故必填校验放在这里兜
    errors.priority = !form.priority;
    errors.customer = !form.customer;
    errors.productCategory = !form.productCategory;
    errors.productName = !form.productName;
    errors.deviceSn = false;
    errors.problemL1 = !form.problemL1;
    errors.problemL2 = !form.problemL2;
    errors.problemL3 = !form.problemL3;
    errors.description = !form.description.trim();
    errors.title = !form.title.trim();
    errors.problemTime = false;
    errors.complaintType =
      showChannelComplaintFields.value && !form.complaintType;

    const hasError = Object.values(errors).some(Boolean);
    if (hasError) {
      message.error('请填写必填项');
      return false;
    }

    /*
     * 紧急 / 重要的必然是投诉（见《【紧急需求】建单优先级与工单类型联动-需求说明》）。
     * **单向**——投诉单四档优先级都合法，只拦"非投诉 + P0/P1"。
     *
     * 表单联动已把这个组合挡在前面，本条是兜底：真正要防的是**不走本表单的入口**
     * ——接口建单、批量导入、容联云建单，那些地方绕不过服务端校验，只做前端联动等于没防。
     */
    const RULED = ['建议', '商机', '咨询'];
    if (
      RULED.includes(form.ticketType)
      && (form.priority === 'P0' || form.priority === 'P1')
    ) {
      message.error('紧急 / 重要仅适用于投诉工单。请将工单类型改为投诉，或将优先级调为普通加急 / 普通。');
      errors.ticketType = true;
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
      problemDesc: form.description.trim(),
      problemDescAttachments: [...form.descriptionAttachments],
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
    () => [form.productName, form.problemL3, form.ticketSource] as const,
    () => syncTitle(),
  );

  watch(
    () => form.productCategory,
    () => {
      if (applyingPrefill) return;
      onProductCategoryChange();
    },
  );

  /**
   * 业务分类变更 —— **不清空已绑定客户**。
   *
   * 分类变的是"这张单归哪条业务线"，不是客户换了人；客户标识全局唯一，
   * 让坐席重搜一遍搜到的还是同一条，纯属多做一遍。改分类多半是纠错
   * （一开始选错业务线），清空绑定等于惩罚纠错。
   *
   * 正确做法：**按客户标识在新分类下重取档案**，让字段口径与完整度按新分类重判——
   * 教育缺学校会自动出「信息不完整」提示条，非教育则不再展示学校三项。
   * 只有**该客户在新分类下取不到**（不存在或无权访问）才解除绑定。
   */
  watch(
    () => form.businessType,
    () => {
      if (applyingPrefill) return;
      if (!form.customer) return;
      const latest = findCustomerById(form.customer.id);
      if (!latest) {
        clearCustomer();
        message.warning('该客户在当前业务分类下不可用，请重新选择客户');
        return;
      }
      form.customer = { ...latest };
    },
  );


  return {
    form,
    snVerified,
    assignAdopted,
    submitting,
    customerModalOpen,
    editingCustomer,
    customerSearchOpen,
    customerSearchHits,
    customerSearchTooMany,
    errors,
    problemL1Options,
    problemL2Options,
    problemL3Options,
    productNameOptions,
    showTypePart,
    typePartSubtitle,
    showChannelComplaintFields,
    reset,
    applyPrefill,
    onTitleInput,
    onProductCategoryChange,
    onProductNameChange,
    onProblemL1Change,
    onProblemL2Change,
    searchCustomer,
    onCustomerQueryInput,
    closeCustomerSearch,
    selectCustomer,
    clearCustomer,
    openCreateCustomer,
    openEditCustomer,
    saveCustomer,
    validate,
    buildTicket,
    syncTitle,
    // 刷机单
    isFlashType,
    flashErrors,
    flashPhoneError,
    flashBlock,
    validateFlash,
    submitFlash,
    // 小智单（1130）
    isXiaozhiType,
    xiaozhiErrors,
    submitXiaozhi,
    applyXiaozhiFrontlineDefault,
  };
}
