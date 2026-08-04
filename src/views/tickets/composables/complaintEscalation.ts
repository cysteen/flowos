import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { Channel, CreateTicketPrefill, Priority, Ticket } from '@/views/tickets/types/ticket';
import { AFTERSALE_INBOUND_SOURCE, CUSTOM_PLATFORM_OPTION, resolveComplaintNature } from '@/views/tickets/types/createTicket';

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

/**
 * 升级动作种类——判据是**是否跨工单类型**（0801 定稿，替代此前按"字段多少"划分）：
 * - 跨类型（非投诉 → 投诉）＝ 实质是建一张投诉单 → **走新建投诉单页面**，已知字段预填；
 * - 不跨类型（投诉单上再投诉）＝ 在同类型上补几个字段 → **走小弹窗**，落法由【工单来源】决定。
 */
export type EscalateKind =
  /** 非投诉 → 投诉：走建单页 */
  | 'toComplaint'
  /** 原单已是投诉：小弹窗，来源=外投渠道→建外投关联单，其余来源→落补充 */
  | 'onComplaint';

/** 一线不可外投 / 投诉单不可升级的提示（业务方 0730 定稿文案） */
const FRONTLINE_COMPLAINT_TIP = '当前投诉单，不可升级';
/** 门禁①：售后转入工单一律不可升级（0801 定：判据＝工单来源） */
const AFTERSALE_INBOUND_TIP = '售后转入工单，不支持升级投诉；如需受理投诉请新建投诉单';
/**
 * 门禁③：冻结态不可升级（0801 拍板）。
 * 挂起在停表、待审核在等审批结果——此时升级会让 SLA 与审批双双失效（原单关了、审批还在跑）。
 * 「已转出」也是冻结态，但它必然带活跃售后关联，已被门禁②拦下。
 */
const FROZEN_STATUS = /已挂起|待审核/;
/** 只读/中止态：已归档仅支持只读查询，已取消是业务中止，都不该再派生新单 */
const VOID_STATUS = /已归档|已取消/;
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

/**
 * 原单是否已是终态——升级时跳过关闭步骤（PRD §4.3.1）。
 * 含「已转单」：因派生新单而终止的状态（§5.6.3）。
 */
export function isTicketTerminated(status: string): boolean {
  return /已关闭|已取消|已归档|已结案|已转单/.test(status);
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

/** 原单的投诉性质列表（各组二类分别推导后去重；多组时可能同时有业务/服务/人员） */
export function complaintNaturesOf(detail: TicketDetailMeta): string[] {
  return naturesOf(detail.complaint.categories ?? []);
}

/** 原单的主展示性质（取第一组；无分类时为空） */
export function complaintNatureOf(detail: TicketDetailMeta): string {
  return complaintNaturesOf(detail)[0] || '';
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
  const natures = complaintNaturesOf(detail);
  return natures.length ? `投诉 · ${natures.join(' / ')}` : '投诉';
}

/**
 * 门禁②：原单是否已有活跃关联 / 从属关系。
 * 关联位是 **1:1** ——已关联售后单、已关联其他客服单、或已在从属跟跑，都不可再升级，
 * 即**一张单只能升一次**（PRD §4.2.1）。
 */
function resolveLinkBlock(detail: TicketDetailMeta): string | null {
  if (detail.linkedAftersale) return '本单已关联售后单，关联位已占用，不可升级；如需补充请用「新建补充」';
  if (detail.linkedRecords?.some((r) => r.tag === '升级投诉')) {
    return '本单已升级过并关联投诉单（1:1），不可再次升级；如需补充请用「新建补充」';
  }
  if (detail.followingNo) return `本单正跟随 ${detail.followingNo} 流转，不可再发起升级；如需补充请用「新建补充」`;
  return null;
}

/** 按阶层 × 发起人角色算出可做的升级动作与入口可用性 */
export function buildEscalateVerdict(detail: TicketDetailMeta): EscalateVerdict {
  const tier = resolveComplaintTier(detail);
  const tierLabel = complaintTierLabel(detail);
  const frontline = isFrontlineActor(detail);

  // 门禁①：售后转入工单 → 一票否决（判据＝工单来源，0801 定）
  if (detail.source === AFTERSALE_INBOUND_SOURCE) {
    return {
      tier, tierLabel, kind: null, entryEnabled: false,
      entryTip: AFTERSALE_INBOUND_TIP, headline: AFTERSALE_INBOUND_TIP,
    };
  }

  // 门禁③：冻结态 / 只读态 → 不可升级（已关闭不在此列——0801 定为不限时间可升，关单步骤跳过）
  if (FROZEN_STATUS.test(detail.status)) {
    const tip = `工单${detail.status}，恢复后可升级`;
    return { tier, tierLabel, kind: null, entryEnabled: false, entryTip: tip, headline: tip };
  }
  if (VOID_STATUS.test(detail.status)) {
    const tip = `工单${detail.status}，不可升级`;
    return { tier, tierLabel, kind: null, entryEnabled: false, entryTip: tip, headline: tip };
  }

  // 门禁②：关联位已占用 → 一票否决，先于阶层与角色判定
  const linkBlock = resolveLinkBlock(detail);
  if (linkBlock) {
    return {
      tier,
      tierLabel,
      kind: null,
      entryEnabled: false,
      entryTip: linkBlock,
      headline: linkBlock,
    };
  }

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
      kind: frontline ? null : 'onComplaint',
      entryEnabled: !frontline,
      entryTip: frontline ? FRONTLINE_COMPLAINT_TIP : undefined,
      headline: '本单已是投诉单：选【工单来源】——外投渠道则关原单、建外投关联单；'
        + '其他来源落为「补充」写在原单上，不建新单。',
    };
  }

  // 非投诉：升为投诉单，投诉性质由所选投诉分类推导
  return {
    tier,
    tierLabel,
    kind: 'toComplaint',
    entryEnabled: true,
    headline: `本单为「${detail.type}」（非投诉），将新建投诉单，已知字段自动预填。`,
  };
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
  const cats = (detail.complaint.categories ?? []).filter((c) => c.cat1 && c.cat2);
  if (cats.length) {
    rows.push({
      label: '投诉分类',
      value: cats
        .map((c) => `${c.cat1} / ${c.cat2}（${resolveComplaintNature(c.cat2)}）`)
        .join('；'),
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

/** 一组投诉分类（一类+二类）。投诉分类**支持多选**：一次投诉可命中多个问题（0801） */
export interface ComplaintCategoryPick {
  cat1: string;
  cat2: string;
}

/**
 * 一组投诉平台 + 投诉编号。**平台与编号成对**——多个平台就有多个编号（0801）。
 * 平台选「其他」时用 customPlatform 手填名称。
 */
export interface ComplaintPlatformPick {
  platform: string;
  customPlatform?: string;
  /** 投诉编号（非必填，内投常无编号） */
  complaintNo: string;
}

/** 平台展示名（「其他」取手填值） */
export function platformDisplay(p: ComplaintPlatformPick): string {
  return p.platform === CUSTOM_PLATFORM_OPTION ? (p.customPlatform || '其他').trim() : p.platform;
}

/**
 * 分支 B · 原单已是投诉：小弹窗补录，**落法由【工单来源】决定**——
 * 外投渠道 → 建外投关联单（关原单 + 双向关联）；其余来源 → 落为「补充」写在原单上（不建新单、不关单）。
 */
export interface EscalateOnComplaintInput {
  kind: 'onComplaint';
  /** 工单来源（必填，决定落法与可选平台字典） */
  source: string;
  /** 投诉分类（多选，至少一组） */
  categories: ComplaintCategoryPick[];
  /** 投诉平台 + 编号（成对多组；仅内投/外投渠道有） */
  platforms: ComplaintPlatformPick[];
  /** 投诉问题描述（必填） */
  note: string;
}

export type EscalateInput = EscalateOnComplaintInput;

/** 落法：外投渠道→建外投关联单；其余来源→原单加补充 */
export type EscalateOutcome = 'external' | 'supplement';

export function resolveEscalateOutcome(input: EscalateOnComplaintInput): EscalateOutcome {
  return input.source === '外投渠道' ? 'external' : 'supplement';
}

/** 多组分类去重后的投诉性质（可能同时命中业务/服务/人员） */
export function naturesOf(categories: ComplaintCategoryPick[]): string[] {
  const set = new Set<string>();
  for (const c of categories) {
    const n = resolveComplaintNature(c.cat2);
    if (n) set.add(n);
  }
  return [...set];
}

/** 升级后新单的展示名（履历/关联卡片用） */
export function escalateTargetLabel(input: EscalateInput): string {
  return resolveEscalateOutcome(input) === 'external' ? '外投' : (naturesOf(input.categories)[0] || '投诉');
}

/** 分类/平台的文本化（写进新单描述与履历） */
export function summarizeEscalateInput(input: EscalateOnComplaintInput): string[] {
  const cats = input.categories
    .filter((c) => c.cat1 && c.cat2)
    .map((c) => `${c.cat1} / ${c.cat2}（${resolveComplaintNature(c.cat2)}）`);
  const plats = input.platforms
    .filter((p) => p.platform)
    .map((p) => `${platformDisplay(p)}${p.complaintNo ? `（编号 ${p.complaintNo}）` : ''}`);
  return [
    `工单来源：${input.source}`,
    cats.length ? `投诉分类：${cats.join('；')}` : '',
    plats.length ? `投诉平台：${plats.join('；')}` : '',
    `投诉问题描述：${input.note}`,
  ].filter(Boolean);
}

/**
 * 由原单 + 弹窗补录合成**外投关联新单**（分支 B · 来源=外投渠道）。
 * 非投诉→投诉（分支 A）不走这里——它走建单页，由建单表单产出新单。
 */
export function buildEscalatedTicket(
  detail: TicketDetailMeta,
  input: EscalateOnComplaintInput,
  opts: { operator: string; channel?: Channel; priority?: Priority; now?: Date },
): Ticket {
  const now = opts.now ?? new Date();
  const seq = String(now.getTime()).slice(-5);

  return {
    id: `esc-${now.getTime()}`,
    no: `LCMN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${seq}`,
    type: '投诉',
    channel: opts.channel ?? CHANNEL_MAP[detail.channel] ?? '电话',
    title: `外投·${detail.title}`,
    smartMarks: ['升级'],
    customer: detail.customer.name,
    vip: detail.customer.types.some((t) => t.includes('VIP')),
    product: detail.product.name,
    nodeStatus: '待受理',
    nodeStep: 1,
    nodeTotal: 5,
    priority: opts.priority ?? mapPriority(detail.priority),
    slaText: '00:15:00',
    slaSub: '距超时',
    slaState: 'soon',
    slaMinutes: 15,
    assignee: opts.operator || '张三',
    tab: 'mine',
    ticketSource: input.source,
    escalatedFromNo: detail.no,
    customerPhone: detail.customer.contacts.find((c) => c.type === 'phone')?.value,
    productCategory: detail.product.category,
    problemDesc: [
      `【升级投诉·原单 ${detail.no}】投诉 → 外投`,
      ...summarizeEscalateInput(input),
      '',
      `原客户诉求：${detail.demand}`,
    ].join('\n'),
    createdAt: formatStamp(now),
    updatedAt: formatStamp(now),
  };
}

/**
 * 分支 A · 非投诉 → 投诉：**走新建投诉单页面**，已知字段从原单预填（0801 定稿）。
 * 判据是「是否跨工单类型」——跨类型实质就是建一张投诉单，用建单页复用整套字段与校验。
 */
export function buildEscalatePrefill(detail: TicketDetailMeta): CreateTicketPrefill {
  const phone = detail.customer.contacts.find((c) => c.type === 'phone')?.value ?? '';
  const demandShort = detail.demand.length > 120 ? `${detail.demand.slice(0, 120)}…` : detail.demand;
  return {
    mode: 'escalate',
    parentNo: detail.no,
    parentTitle: detail.title,
    customerName: detail.customer.name,
    customerPhone: phone,
    vip: detail.customer.types.some((t) => t.includes('VIP')),
    product: detail.product.name,
    sn: detail.product.sn,
    channel: CHANNEL_MAP[detail.channel] ?? '在线客服',
    formTicketType: '投诉',
    priority: mapPriority(detail.priority),
    businessType: detail.businessType,
    businessLine: detail.businessLine,
    expectTime: detail.expectedResolve,
    desc: [
      `【升级投诉·原单 ${detail.no}】${detail.type}（非投诉） → 投诉`,
      '',
      `原客户诉求：${demandShort}`,
    ].join('\n'),
  };
}

function formatStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
