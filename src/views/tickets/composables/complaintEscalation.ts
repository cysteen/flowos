import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { CreateTicketPrefill, Channel, Priority } from '@/views/tickets/types/ticket';
import { PROBLEM_TREE } from '@/views/tickets/types/createTicket';

/**
 * 升级投诉（文档名「关联投诉」）判定逻辑 —— 《【815】关联投诉 PRD》§3.2 升级规则矩阵。
 *
 * 投诉阶层（单向升阶）：非投诉（咨询/商机/建议）→ 人员投诉 / 业务投诉（同阶）→ 外投（终态）。
 * 同阶之间（人员 ↔ 业务）不升级、外投不再升级，两种情形都只允许「补充」。
 */

/** 原单所处阶层 */
export type ComplaintTier = 'none' | 'low' | 'external';

/** 可选的目标投诉类型 */
export type EscalateTarget = '人员投诉' | '业务投诉' | '外投';

export const ESCALATE_TARGETS: EscalateTarget[] = ['人员投诉', '业务投诉', '外投'];

/** 目标类型说明（弹窗候选卡片副标题） */
const TARGET_DESC: Record<EscalateTarget, string> = {
  人员投诉: '投诉对象为坐席/服务人员：服务态度、答复不当、承诺未兑现',
  业务投诉: '投诉对象为产品或业务：质量、功能、物流、费用、流程',
  外投: '客户已向外部平台（12315 / 消协 / 工信部等）投诉，最高阶且不可再升级',
};

/** 目标类型 → 新投诉单的「投诉分类」（建单表单 COMPLAINT_TYPE_OPTIONS） */
const TARGET_COMPLAINT_TYPE: Record<EscalateTarget, string> = {
  人员投诉: '服务投诉',
  业务投诉: '产品质量',
  外投: '服务投诉',
};

/** 命中即判为「人员投诉」倾向的问题/投诉分类关键词 */
const PERSON_COMPLAINT_HINT = /服务态度|态度|响应慢|推诿|答复|承诺|坐席|人员/;

export interface EscalateCandidate {
  target: EscalateTarget;
  /** 是否可选（false = 该目标只允许补充，不允许升级） */
  allowed: boolean;
  /** 据业务类型 / 问题分类推荐的起步目标 */
  recommended: boolean;
  desc: string;
  /** 不可选原因（allowed=false 时展示） */
  reason?: string;
}

export interface EscalateVerdict {
  tier: ComplaintTier;
  /** 原单阶层展示名：非投诉 / 人员投诉 / 业务投诉 / 外投 */
  tierLabel: string;
  /** upgrade=存在可升级目标；supplement=仅补充（外投终态） */
  branch: 'upgrade' | 'supplement';
  /** 头部入口是否可点 */
  entryEnabled: boolean;
  /** 入口置灰时的悬浮说明 */
  entryTip?: string;
  /** 弹窗顶部判定文案 */
  headline: string;
  candidates: EscalateCandidate[];
}

/** 原单是否已是终态（已关闭/已取消/已归档）——升级时跳过关闭步骤（PRD §4.3.1） */
export function isTicketTerminated(status: string): boolean {
  return /已关闭|已取消|已归档|已结案/.test(status);
}

/**
 * 原单阶层判定。
 * 外投以「外投标记 / 工单来源=外投渠道」为准——投诉平台字段只驱动处理表单的外投分支字段，
 * 不单独决定阶层（判定来源待与业务侧对齐，见 PRD §备注·待讨论 4/5）。
 */
export function resolveComplaintTier(detail: TicketDetailMeta): ComplaintTier {
  if (detail.type !== '投诉') return 'none';
  if (detail.isExternalAppeal || detail.source === '外投渠道' || detail.source === '外投') return 'external';
  return 'low';
}

/** 低阶投诉细分：投诉分类/标记偏服务人员 → 人员投诉，其余 → 业务投诉 */
export function resolveLowTierType(detail: TicketDetailMeta): EscalateTarget {
  const text = [detail.complaint.complaintType, ...(detail.complaint.tags ?? [])].join(' ');
  return PERSON_COMPLAINT_HINT.test(text) ? '人员投诉' : '业务投诉';
}

/** 非投诉原单的推荐起步目标：问题分类偏人员/服务 → 人员投诉，其余 → 业务投诉 */
function recommendTarget(detail: TicketDetailMeta): EscalateTarget {
  const text = [detail.productIssue, ...(detail.product.issueTags ?? []), detail.demand].join(' ');
  return PERSON_COMPLAINT_HINT.test(text) ? '人员投诉' : '业务投诉';
}

/** 原单阶层展示名 */
export function complaintTierLabel(detail: TicketDetailMeta): string {
  const tier = resolveComplaintTier(detail);
  if (tier === 'none') return `${detail.type}（非投诉）`;
  if (tier === 'external') return '外投（外部投诉）';
  return resolveLowTierType(detail);
}

/** 按 PRD §3.2 矩阵算出入口可用性、三分支与目标候选 */
export function buildEscalateVerdict(detail: TicketDetailMeta): EscalateVerdict {
  const tier = resolveComplaintTier(detail);
  const tierLabel = complaintTierLabel(detail);

  // 外投：终态，禁止升级，仅补充
  if (tier === 'external') {
    return {
      tier,
      tierLabel,
      branch: 'supplement',
      entryEnabled: false,
      entryTip: '原单已是外投（投诉最高阶），不可再升级；如需补充请用「新建补充」',
      headline: '外投为投诉最高阶，不支持再升级，仅可补充信息。',
      candidates: ESCALATE_TARGETS.map((target) => ({
        target,
        allowed: false,
        recommended: false,
        desc: TARGET_DESC[target],
        reason: '外投为投诉终态，禁止升级',
      })),
    };
  }

  // 低阶投诉（人员/业务）：同阶不升，只能升外投
  if (tier === 'low') {
    return {
      tier,
      tierLabel,
      branch: 'upgrade',
      entryEnabled: true,
      headline: `本单为「${tierLabel}」，同阶（人员投诉 ↔ 业务投诉）不支持升级，仅可升级为「外投」。`,
      candidates: ESCALATE_TARGETS.map((target) => ({
        target,
        allowed: target === '外投',
        recommended: target === '外投',
        desc: TARGET_DESC[target],
        reason: target === '外投' ? undefined : '与原单同阶，仅可补充信息',
      })),
    };
  }

  // 非投诉（咨询/商机/建议）：三类目标均可升
  const rec = recommendTarget(detail);
  return {
    tier,
    tierLabel,
    branch: 'upgrade',
    entryEnabled: true,
    headline: `本单为「${detail.type}」（非投诉），可升级为 人员投诉 / 业务投诉 / 外投，请选择升级目标。`,
    candidates: ESCALATE_TARGETS.map((target) => ({
      target,
      allowed: true,
      recommended: target === rec,
      desc: TARGET_DESC[target],
    })),
  };
}

/** 投诉阶层阶梯（弹窗顶部）：当前所处阶段 + 可升级到的阶段一眼可见 */
export interface TierStep {
  key: ComplaintTier;
  label: string;
  sub: string;
  /** passed 已越过 / current 当前所处 / target 可升级至 / blocked 不可升（同阶或终态） */
  state: 'passed' | 'current' | 'target' | 'blocked';
}

const TIER_ORDER: ComplaintTier[] = ['none', 'low', 'external'];

export function buildTierSteps(detail: TicketDetailMeta): TierStep[] {
  const tier = resolveComplaintTier(detail);
  const curIdx = TIER_ORDER.indexOf(tier);
  const allowed = new Set(
    buildEscalateVerdict(detail).candidates.filter((c) => c.allowed).map((c) => c.target),
  );

  return TIER_ORDER.map((key, idx) => {
    let state: TierStep['state'];
    if (idx < curIdx) state = 'passed';
    else if (idx === curIdx) state = 'current';
    else if (key === 'external') state = allowed.has('外投') ? 'target' : 'blocked';
    else state = allowed.has('人员投诉') || allowed.has('业务投诉') ? 'target' : 'blocked';

    if (key === 'none') {
      return {
        key,
        label: '非投诉',
        sub: state === 'current' ? detail.type : '咨询 / 商机 / 建议',
        state,
      };
    }
    if (key === 'low') {
      return {
        key,
        label: '人员 / 业务投诉',
        sub: state === 'current' ? resolveLowTierType(detail) : '同阶不互升',
        state,
      };
    }
    return { key, label: '外投', sub: '外部投诉 · 终态', state };
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

export interface EscalateInput {
  target: EscalateTarget;
  /** 升级原因 / 补充说明（必填） */
  note: string;
  /** 目标=外投时的外部投诉平台 */
  platform?: string;
  /** 目标=外投时的外部投诉编号 */
  externalNo?: string;
}

/** 升级投诉 → 新投诉单建单预填（原单信息一次性同步，PRD §5.1） */
export function buildEscalatePrefill(
  detail: TicketDetailMeta,
  input: EscalateInput,
): CreateTicketPrefill {
  const phone = detail.customer.contacts.find((c) => c.type === 'phone')?.value ?? '';
  const problem = mapProblemPath(detail);
  const isExternal = input.target === '外投';
  const demandShort = detail.demand.length > 120 ? `${detail.demand.slice(0, 120)}…` : detail.demand;

  return {
    mode: 'escalate',
    parentNo: detail.no,
    parentTitle: detail.title,
    escalateTarget: input.target,
    customerName: detail.customer.name,
    customerPhone: phone,
    vip: detail.customer.types.some((t) => t.includes('VIP')),
    product: detail.product.name,
    sn: detail.product.sn,
    channel: CHANNEL_MAP[detail.channel] ?? '在线客服',
    formTicketType: '投诉',
    priority: mapPriority(detail.priority),
    complaintType: TARGET_COMPLAINT_TYPE[input.target],
    complaintPlatform: isExternal ? input.platform : undefined,
    complaintNo: isExternal ? input.externalNo : undefined,
    ticketSource: isExternal ? '外投渠道' : undefined,
    businessType: detail.businessType,
    businessLine: detail.businessLine,
    problemL1: problem.l1,
    problemL2: problem.l2,
    problemL3: problem.l3,
    expectTime: detail.expectedResolve,
    desc: [
      `【升级投诉·原单 ${detail.no}】`,
      `原单类型：${complaintTierLabel(detail)} → 目标：${input.target}`,
      `升级原因：${input.note}`,
      '',
      `原客户诉求：${demandShort}`,
    ].join('\n'),
  };
}
