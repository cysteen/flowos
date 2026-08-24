import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { Channel, CreateTicketPrefill, Priority, Ticket } from '@/views/tickets/types/ticket';
import { AFTERSALE_INBOUND_SOURCE, CUSTOM_PLATFORM_OPTION } from '@/views/tickets/types/createTicket';

/**
 * 升级投诉（文档名「关联投诉」）判定逻辑 —— 《【815】关联投诉 PRD》§3 升级规则。
 *
 * **升阶只有两跳**（0730 定稿）：`非投诉（咨询/商机/建议） → 投诉 → 外投`。
 * - 「外投」不是投诉分类，是**工单来源=外投渠道**；外投只能由**二线技术顾问**发起。
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
const FROZEN_STATUS = /已挂起|申请(?:挂起|关闭|强结)中|业务动作审核中/;
/** 中止态：已取消是业务中止，不该再派生新单（基线该行整行 🔒） */
const VOID_STATUS = /已取消/;
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
 * 含「已转单」与「已升级投诉」：因派生新单而终止的两个状态（§5.6.3）。
 */
export function isTicketTerminated(status: string): boolean {
  // 子状态名对齐《00-基线-工单状态与动作》§1：状态分组为「终态」的七个子状态是
  // 已升级投诉 / 已解决 / 已关闭 / 已强结 / 已转单 / 已取消 / 已结案。
  // 「已关闭」是其中的一个具体子状态（友好沟通后关闭），不再是"终态分类伞"。
  // 「已归档」系统里没有这个状态，不在正则内。
  // 入参是自由文本（detail.status），所以按正则匹配而不是查 BASELINE_STATUSES。
  return /已升级投诉|已解决|已关闭|已强结|已转单|已取消|已结案/.test(status);
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

/** 原单阶层展示名 */
export function complaintTierLabel(detail: TicketDetailMeta): string {
  const tier = resolveComplaintTier(detail);
  if (tier === 'none') return `${detail.type}（非投诉）`;
  if (tier === 'external') return '外投（外部投诉）';
  return '投诉';
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

/**
 * 发起人是不是一线坐席。
 * 一线**不能外投**，且**投诉单一律不可升级**（唯一去处是外投）。
 *
 * 判据是**发起人的角色**。此前读工单上的 `frontlineDemo` 假字段，
 * 于是"谁在升级"变成了"这张单是哪张"——带标记的单被当成一线发起（2026-08-19 修正）。
 */
function isFrontlineActor(roleKey: string): boolean {
  return roleKey === 'agent-l1';
}

/** 按阶层 × 发起人角色算出可做的升级动作与入口可用性 */
export function buildEscalateVerdict(detail: TicketDetailMeta, roleKey: string): EscalateVerdict {
  const tier = resolveComplaintTier(detail);
  const tierLabel = complaintTierLabel(detail);
  const frontline = isFrontlineActor(roleKey);

  // 门禁①：售后转入工单 → 一票否决（判据＝工单来源，0801 定）
  if (detail.source === AFTERSALE_INBOUND_SOURCE) {
    return {
      tier, tierLabel, kind: null, entryEnabled: false,
      entryTip: AFTERSALE_INBOUND_TIP, headline: AFTERSALE_INBOUND_TIP,
    };
  }

  // 门禁③：冻结态 / 只读态 → 不可升级（终态不在此列——0801 定为不限时间可升，关单步骤跳过）
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

  // 非投诉：升为投诉单
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
  // 投诉 → 外投：原单已有的投诉分类一并带走，坐席只补外投增量字段
  const cats = (detail.complaint.categories ?? []).filter((c) => c.cat1 && c.cat2);
  if (cats.length) {
    rows.push({
      label: '投诉分类',
      value: cats.map((c) => `${c.cat1} / ${c.cat2}`).join('；'),
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

/** 升级后新单的展示名（履历/关联卡片用） */
export function escalateTargetLabel(input: EscalateInput): string {
  return resolveEscalateOutcome(input) === 'external' ? '外投' : '投诉';
}

/** 分类/平台的文本化（写进新单描述与履历） */
export function summarizeEscalateInput(input: EscalateOnComplaintInput): string[] {
  const cats = input.categories
    .filter((c) => c.cat1 && c.cat2)
    .map((c) => `${c.cat1} / ${c.cat2}`);
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
    nodeStatus: '未认领',
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
