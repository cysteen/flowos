import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { CreateTicketPrefill, Channel, Priority } from '@/views/tickets/types/ticket';
import { PROBLEM_TREE, resolveComplaintNature } from '@/views/tickets/types/createTicket';

/**
 * 升级投诉（文档名「关联投诉」）判定逻辑 —— 《【815】关联投诉 PRD》§3 升级规则。
 *
 * **升阶只有两跳**（0730 定稿）：`非投诉（咨询/商机/建议） → 投诉 → 外投`。
 * - 「人员投诉 / 服务投诉 / 业务投诉」是**投诉性质**，由**投诉二类推导**（见 resolveComplaintNature），
 *   同层并列、不构成升阶——所以性质变化属于「改投诉分类」，不走升级投诉。
 * - 「外投」不是投诉分类，是**工单来源=外投渠道**；外投只能由**二线坐席**发起。
 */

/** 原单所处阶层 */
export type ComplaintTier = 'none' | 'complaint' | 'external';

/** 升级动作种类 */
export type EscalateKind =
  /** 非投诉 → 投诉：跨类型，需补整块投诉字段，走建单页 */
  | 'toComplaint'
  /** 投诉 → 外投：只补外投增量字段，弹窗内完成 */
  | 'toExternal';

/** 一线不可外投 / 投诉单不可升级的提示（业务方 0730 定稿文案） */
const FRONTLINE_COMPLAINT_TIP = '当前投诉单，不可升级';
const EXTERNAL_TERMINAL_TIP = '原单已是外投（投诉最高阶），不可再升级；如需补充请用「新建补充」';

export interface EscalateVerdict {
  tier: ComplaintTier;
  /** 原单阶层展示名 */
  tierLabel: string;
  /** 可做的升级动作；null = 不可升级 */
  kind: EscalateKind | null;
  /** 头部入口是否可点 */
  entryEnabled: boolean;
  /** 入口置灰时的悬浮说明 */
  entryTip?: string;
  /** 弹窗顶部判定文案 */
  headline: string;
}

/** 原单是否已是终态（已关闭/已取消/已归档/已结案）——升级时跳过关闭步骤（PRD §4.3.1） */
export function isTicketTerminated(status: string): boolean {
  return /已关闭|已取消|已归档|已结案/.test(status);
}

/**
 * 原单阶层判定。
 * 外投以「外投标记 / 工单来源=外投渠道」为准——投诉平台字段只驱动处理表单的外投分支字段，
 * 不单独决定阶层。
 */
export function resolveComplaintTier(detail: TicketDetailMeta): ComplaintTier {
  if (detail.type !== '投诉') return 'none';
  if (detail.isExternalAppeal || detail.source === '外投渠道' || detail.source === '外投') return 'external';
  return 'complaint';
}

/** 原单的投诉性质（由投诉二类推导；无分类时回落到已存的性质字段） */
export function complaintNatureOf(detail: TicketDetailMeta): string {
  return resolveComplaintNature(detail.complaint.cat2) || detail.complaint.complaintType || '';
}

/**
 * 发起人是不是一线坐席。
 * 一线**不能外投**，且**投诉单一律不可升级**（唯一去处是外投）。
 * 当前角色体系里没有一线角色（ROLES 里 agent-cs/agent-as 都是二线），
 * 故以「一线视角」标记作为判据；后续接入真实一线角色时在此处或上。
 */
function isFrontlineActor(detail: TicketDetailMeta): boolean {
  return !!detail.frontlineDemo;
}

/** 原单阶层展示名 */
export function complaintTierLabel(detail: TicketDetailMeta): string {
  const tier = resolveComplaintTier(detail);
  if (tier === 'none') return `${detail.type}（非投诉）`;
  if (tier === 'external') return '外投（外部投诉）';
  const nature = complaintNatureOf(detail);
  return nature ? `投诉 · ${nature}` : '投诉';
}

/** 按阶层 × 发起人角色算出可做的升级动作与入口可用性 */
export function buildEscalateVerdict(detail: TicketDetailMeta): EscalateVerdict {
  const tier = resolveComplaintTier(detail);
  const tierLabel = complaintTierLabel(detail);
  const frontline = isFrontlineActor(detail);

  // 外投：终态，谁都不能再升
  if (tier === 'external') {
    return {
      tier,
      tierLabel,
      kind: null,
      entryEnabled: false,
      entryTip: frontline ? FRONTLINE_COMPLAINT_TIP : EXTERNAL_TERMINAL_TIP,
      headline: '外投为投诉最高阶，不支持再升级，仅可补充信息。',
    };
  }

  // 投诉单：唯一去处是外投（二线专属）；性质变化属于改投诉分类，不走升级
  if (tier === 'complaint') {
    return {
      tier,
      tierLabel,
      kind: frontline ? null : 'toExternal',
      entryEnabled: !frontline,
      entryTip: frontline ? FRONTLINE_COMPLAINT_TIP : undefined,
      headline: '本单已是投诉单，可升级为「外投」——关闭原单、建外投新单并双向关联。'
        + '（如只是投诉性质变化，请在处理页改投诉分类，不走升级）',
    };
  }

  // 非投诉：升为投诉单，投诉性质由所选投诉分类推导
  return {
    tier,
    tierLabel,
    kind: 'toComplaint',
    entryEnabled: true,
    headline: `本单为「${detail.type}」（非投诉），可升级为投诉单——选投诉分类，投诉性质自动判定。`
      + (frontline ? '外投须由二线坐席发起，一线不可直接外投。' : ''),
  };
}

/** 投诉阶层阶梯（弹窗顶部）：当前所处阶段 + 可升级到的阶段一眼可见 */
export interface TierStep {
  key: ComplaintTier;
  label: string;
  /** passed 已越过 / current 当前所处 / target 可升级至 / blocked 不可升 */
  state: 'passed' | 'current' | 'target' | 'blocked';
}

const TIER_ORDER: ComplaintTier[] = ['none', 'complaint', 'external'];
const TIER_LABEL: Record<ComplaintTier, string> = {
  none: '非投诉',
  complaint: '投诉',
  external: '外投',
};

export function buildTierSteps(detail: TicketDetailMeta): TierStep[] {
  const verdict = buildEscalateVerdict(detail);
  const curIdx = TIER_ORDER.indexOf(verdict.tier);
  const targetTier: ComplaintTier | null =
    verdict.kind === 'toComplaint' ? 'complaint' : verdict.kind === 'toExternal' ? 'external' : null;

  return TIER_ORDER.map((key, idx) => {
    let state: TierStep['state'];
    if (idx < curIdx) state = 'passed';
    else if (idx === curIdx) state = 'current';
    else state = key === targetTier ? 'target' : 'blocked';
    return { key, label: TIER_LABEL[key], state };
  });
}

/** 信息同步预览行（PRD §5.1：原单 → 新单一次性同步，复用建单字段） */
export interface SyncFieldRow {
  label: string;
  value: string;
}

export function buildEscalateSyncFields(detail: TicketDetailMeta): SyncFieldRow[] {
  const phone = detail.customer.contacts.find((c) => c.type === 'phone')?.value ?? '';
  const rows: SyncFieldRow[] = [
    { label: '客户', value: [detail.customer.name, phone].filter(Boolean).join(' · ') },
    { label: '客户地区', value: [detail.customer.region, detail.customer.address].filter(Boolean).join(' ') },
    { label: '业务', value: [detail.businessType, detail.businessLine].filter(Boolean).join(' · ') },
    { label: '产品', value: [detail.product.name, detail.product.sn].filter(Boolean).join(' · ') },
    { label: '问题分类', value: detail.productIssue },
    { label: '优先级', value: detail.priority },
    { label: '客户诉求', value: detail.demand },
  ];
  // 投诉 → 外投：原单已有的投诉分类/性质一并带走，坐席只补外投增量字段
  const nature = complaintNatureOf(detail);
  if (detail.complaint.cat1 || nature) {
    rows.push({
      label: '投诉分类',
      value: [detail.complaint.cat1, detail.complaint.cat2].filter(Boolean).join(' / ')
        + (nature ? `（${nature}）` : ''),
    });
  }
  const latest = detail.latestHandling?.[0]?.text;
  if (latest) rows.push({ label: '处理摘要', value: latest });
  if (detail.attachments.length) {
    rows.push({ label: '附件', value: `${detail.attachments.length} 个（${detail.attachments.join('、')}）` });
  }
  return rows;
}

const CHANNEL_MAP: Record<string, Channel> = {
  在线客服: '在线客服',
  电话: '电话',
  '400热线': '电话',
  邮件: '邮件',
  小程序: '小程序',
  APP: 'APP',
};

function mapPriority(p: string): Priority {
  if (p === 'P0' || p === 'P1' || p === 'P2' || p === 'P3') return p;
  return 'P1';
}

/** 原单问题分类 → 建单表单三级问题（只取能落在现有问题树上的层级，落不上则留空由坐席选） */
function mapProblemPath(detail: TicketDetailMeta): { l1?: string; l2?: string; l3?: string } {
  const [l1, l2, l3] = detail.product.issueTags ?? [];
  if (!l1 || !PROBLEM_TREE[l1]) return {};
  const branch = PROBLEM_TREE[l1];
  if (!l2 || !branch[l2]) return { l1 };
  if (!l3 || !branch[l2].includes(l3)) return { l1, l2 };
  return { l1, l2, l3 };
}

/** 非投诉 → 投诉：坐席在弹窗里选投诉分类，性质由二类推导 */
export interface EscalateToComplaintInput {
  kind: 'toComplaint';
  /** 投诉一类 */
  cat1: string;
  /** 投诉二类 */
  cat2: string;
  /** 由 cat2 推导的投诉性质（业务/服务/人员投诉） */
  nature: string;
  /** 升级原因（必填） */
  note: string;
}

/** 投诉 → 外投：只补外投增量字段（0730 定稿清单） */
export interface EscalateToExternalInput {
  kind: 'toExternal';
  /** 投诉平台（必填） */
  platform: string;
  /** 投诉编号（必填，外部平台工单号） */
  complaintNo: string;
  /** 前期反馈 */
  priorFeedback: string;
  /** 服务回溯 */
  serviceReview: string;
  /** 升级原因（必填） */
  note: string;
}

export type EscalateInput = EscalateToComplaintInput | EscalateToExternalInput;

/** 升级后新单的展示名（履历/消息/建单页标题用） */
export function escalateTargetLabel(input: EscalateInput): string {
  return input.kind === 'toExternal' ? '外投' : input.nature || '投诉';
}

/**
 * 非投诉 → 投诉：新投诉单建单预填。
 * 跨类型升级要补的投诉专属字段多（投诉分类/编号/前期反馈/服务回溯/问题发生时间…），
 * 故带着预填跳建单页，由坐席在完整表单里补齐（PRD §4.3.1）。
 */
export function buildEscalatePrefill(
  detail: TicketDetailMeta,
  input: EscalateToComplaintInput,
): CreateTicketPrefill {
  const phone = detail.customer.contacts.find((c) => c.type === 'phone')?.value ?? '';
  const problem = mapProblemPath(detail);
  const demandShort = detail.demand.length > 120 ? `${detail.demand.slice(0, 120)}…` : detail.demand;

  return {
    mode: 'escalate',
    parentNo: detail.no,
    parentTitle: detail.title,
    escalateTarget: input.nature,
    customerName: detail.customer.name,
    customerPhone: phone,
    vip: detail.customer.types.some((t) => t.includes('VIP')),
    product: detail.product.name,
    sn: detail.product.sn,
    channel: CHANNEL_MAP[detail.channel] ?? '在线客服',
    formTicketType: '投诉',
    priority: mapPriority(detail.priority),
    complaintType: input.nature,
    complaintL1: input.cat1,
    complaintL2: input.cat2,
    businessType: detail.businessType,
    businessLine: detail.businessLine,
    problemL1: problem.l1,
    problemL2: problem.l2,
    problemL3: problem.l3,
    expectTime: detail.expectedResolve,
    desc: [
      `【升级投诉·原单 ${detail.no}】`,
      `原单类型：${detail.type}（非投诉） → 投诉（${input.nature}）`,
      `投诉分类：${input.cat1} / ${input.cat2}`,
      `升级原因：${input.note}`,
      '',
      `原客户诉求：${demandShort}`,
    ].join('\n'),
  };
}
