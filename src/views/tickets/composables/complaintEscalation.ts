import { isFlashTicket } from '@/views/tickets/types/flash';
import { isRefundTicket } from '@/views/tickets/types/refund';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import { TICKETS } from '@/mock/tickets';
import type { Channel, CreateTicketPrefill, Priority, Ticket } from '@/views/tickets/types/ticket';
import { AFTERSALE_INBOUND_SOURCE, CUSTOM_PLATFORM_OPTION, normalizeTicketSource, type TicketSource } from '@/views/tickets/types/createTicket';

/**
 * 升级投诉 / 升级外投判定逻辑。
 *
 * **升阶两档**：`非投诉（咨询/商机/建议） → 投诉 → 外投`。
 * - 「外投」不是投诉分类，是**工单来源＝内投渠道或外投渠道**（两者同层）；
 * - 页头两枚按钮「升级投诉」「升级外投」，不满足即不展示。两枚都打开新建工单弹窗（预填原单），见 `buildEscalatePrefill`。
 */

/** 原单所处阶层 */
export type ComplaintTier = 'none' | 'complaint' | 'external';

/** 升级目标：升级投诉 / 升级外投（决定弹窗标题、来源选项、专属字段与原单落的状态） */
export type EscalateTarget = 'complaint' | 'external';

/** 升级动作种类：非投诉单 → 投诉 / 原单已是投诉（只能再升外投） */
export type EscalateKind = 'toComplaint' | 'onComplaint';

/** 一线不可外投 / 投诉单不可升级的提示（业务方 0730 定稿文案） */
const FRONTLINE_COMPLAINT_TIP = '当前投诉单，不可升级';
/**
 * 门禁①：售后转入的投诉单不可再升级（来源非内投渠道，不能升外投）；非诉的售后转入单放行（1025 6b）。
 * 二线悬停取《【830】升级投诉 PRD》§3.3 来源非外投那一行原文，一线仍取「当前投诉单，不可升级」（《【1025】》§8 #52）。
 */
const AFTERSALE_INBOUND_TIP = '当前来源不可升级外投；补投诉信息请用「新建补充」';
/**
 * 门禁③：冻结态不可升级（0801 拍板）。
 * 挂起在停表、待审核在等审批结果——此时升级会让 SLA 与审批双双失效（原单关了、审批还在跑）。
 * 「已转出」也是冻结态（基线 §2 该行「升级投诉」＝置灰），1025 起门禁②不再拦已关联售后（※26），
 * 故单列一道，提示与底栏冻结同文。
 */
const FROZEN_STATUS = /已挂起|申请(?:挂起|关闭|强结)中|业务动作审核中/;
const TRANSFERRED_OUT_TIP = '工单已转出至售后，等待售后处理结果';
/** 中止态：已取消是业务中止，不该再派生新单（基线该行整行 🔒） */
const VOID_STATUS = /已取消/;
const EXTERNAL_TERMINAL_TIP = '原单来源已是内投或外投渠道（投诉最高阶），不可再升级；如需补充请用「新建补充」';

export interface EscalateVerdict {
  tier: ComplaintTier;
  /** 原单阶层展示名 */
  tierLabel: string;
  /** 可做的升级动作；null = 不可升级 */
  kind: EscalateKind | null;
  /** 头部入口是否可点 */
  entryEnabled: boolean;
  /** 不可升级的原因（按钮不展示时不外露，供其他入口兜底提示） */
  entryTip?: string;
}

/** 基线 §1 终态子状态（十个），供自由文本 status 判定用 */
const TERMINATED_STATUSES: string[] = [
  '已结案', '已关闭', '已强结',
  '已升级投诉', '已升级外投',
  '已转咨询', '已转建议', '已转商机',
  '已取消', '直接结案',
];

/**
 * 原单是否已是终态——升级时跳过关闭步骤（PRD §4.3.1）。
 * 含转单三态与升阶两态：因派生新单而终止的状态（§5.6.3）。
 */
export function isTicketTerminated(status: string): boolean {
  // 依据基线 §1：状态分组为「终态」的**十个**子状态是
  // 已结案 / 已关闭 / 已强结 / 已升级投诉 / 已升级外投 /
  // 已转咨询 / 已转建议 / 已转商机 / 已取消 / 直接结案。
  // 「已关闭」是其中的一个具体子状态，不再是"终态分类伞"。
  // 「已归档」系统里没有这个状态，不在集合内。
  // 入参是自由文本（detail.status），故先按字面量集合判，命中不了再按落库子状态表判。
  return TERMINATED_STATUSES.includes(status);
}

/**
 * 原单阶层判定。
 * 外投阶层＝来源为内投渠道或外投渠道（或外投标记）——投诉平台字段只驱动处理表单的外投分支字段，
 * 不单独决定阶层。
 */
export function resolveComplaintTier(detail: TicketDetailMeta): ComplaintTier {
  if (detail.type !== '投诉') return 'none';
  const source = normalizeTicketSource(detail.source);
  if (detail.isExternalAppeal || source === '外投渠道' || source === '内投渠道') return 'external';
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
 * 已关联其他客服单、或已在从属跟跑，都不可再升级，即**一张单只能升一次**（PRD §4.2.1）。
 * **已关联售后单不拦**（基线 ※26，0818 拍板，1025 落地）：售后来源位关联随升级迁到新投诉单，
 * 见 useTicketOperation 的 `migrateAftersaleLinkOnEscalate`。
 */
function resolveLinkBlock(detail: TicketDetailMeta): string | null {
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

  // 门禁①：售后转入的**投诉单**（③）不可再升级——来源非内投渠道，不能升外投。
  // 售后转入的非诉单（④）放行（1025 口径定稿 6b，推翻 0801「售后转入一律不可升级」）：
  // 升级时客服派生位关联随单迁到新投诉单，见 migrateAftersaleLink。
  if (normalizeTicketSource(detail.source) === AFTERSALE_INBOUND_SOURCE && tier !== 'none') {
    const tip = frontline ? FRONTLINE_COMPLAINT_TIP : AFTERSALE_INBOUND_TIP;
    return {
      tier, tierLabel, kind: null, entryEnabled: false,
      entryTip: tip,
    };
  }

  // 门禁③：冻结态 / 只读态 → 不可升级（终态不在此列——0801 定为不限时间可升，关单步骤跳过）
  if (FROZEN_STATUS.test(detail.status)) {
    const tip = `工单${detail.status}，恢复后可升级`;
    return { tier, tierLabel, kind: null, entryEnabled: false, entryTip: tip };
  }
  if (detail.status === '已转出') {
    return {
      tier, tierLabel, kind: null, entryEnabled: false,
      entryTip: TRANSFERRED_OUT_TIP,
    };
  }
  if (VOID_STATUS.test(detail.status)) {
    const tip = `工单${detail.status}，不可升级`;
    return { tier, tierLabel, kind: null, entryEnabled: false, entryTip: tip };
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
    };
  }

  // 非投诉：升为投诉单
  return {
    tier,
    tierLabel,
    kind: 'toComplaint',
    entryEnabled: true,
  };
}

/**
 * 页头两枚升级按钮展示哪几枚（不满足即不展示，不置灰）：
 * - 非投诉单：升级投诉 + 升级外投；一线坐席选不到内投 / 外投渠道，只出升级投诉；
 * - 投诉单（来源电话 / IM / 小程序）：只出升级外投（一线不出，见判定）；
 * - 其余（外投阶层、冻结态、已取消、已转出、已升级过等）：都不出。
 */
export function resolveEscalateButtons(detail: TicketDetailMeta, roleKey: string): { complaint: boolean; external: boolean } {
  const verdict = buildEscalateVerdict(detail, roleKey);
  if (!verdict.entryEnabled) return { complaint: false, external: false };
  if (verdict.kind === 'toComplaint') return { complaint: true, external: !isFrontlineActor(roleKey) };
  return { complaint: false, external: verdict.kind === 'onComplaint' };
}

const CHANNEL_MAP: Record<string, Channel> = {
  在线客服: '在线客服',
  电话: '电话',
  '400热线': '电话',
  邮件: '邮件',
  小程序: '小程序',
  APP: 'APP',
};

/** 原单优先级带入建单预填；读不到时留空由坐席选（与新建工单默认值同一规则，D2） */
function prefillPriority(p: string): Priority | undefined {
  if (p === 'P0' || p === 'P1' || p === 'P2' || p === 'P3') return p;
  return undefined;
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

/** 详情页的空值写作「—」；预填只带真正有内容的值 */
function realValue(v: string | undefined): string | undefined {
  const s = (v ?? '').trim();
  return s && s !== '—' ? s : undefined;
}

/**
 * 刷机单「关联投诉」新建投诉单的**增量预填**（1013 A21 / B5）：老工单四类不走这一支，预填内容一字不变。
 *
 * - 客户档案：标识 / 地区 / 地址 / 客户类型随原单带入，客户卡与搜索框同一个人；
 *   标识按联系手机号合成——刷机单的客户来自工单行而非客户档案库，没有档案 id 可带。
 * - 产品分类：与产品名成对带入，否则产品名留在原分类的取值域外。
 * - 问题三级分类：投诉单的问题分类由坐席选择，**预填为空且保持必填**（1013 B5）。
 */
function flashPrefillPart(detail: TicketDetailMeta, phone: string): Partial<CreateTicketPrefill> {
  // 个册退费单「关联投诉」与刷机单同一套预填（1120 第 6 章）
  if (!isFlashTicket(detail) && !isRefundTicket(detail)) return {};
  const digits = phone.replace(/\D/g, '');
  return {
    customerId: `cust-${digits || detail.no}`,
    customerRegion: realValue(detail.customer.region),
    customerAddress: realValue(detail.customer.address),
    customerTypes: detail.customer.types.filter(Boolean),
    productCategory: detail.product.category,
    problemL1: '',
    problemL2: '',
    problemL3: '',
  };
}

/** 升级投诉弹窗的工单来源选项 */
export const ESCALATE_COMPLAINT_SOURCES: TicketSource[] = ['电话', 'IM', '客户服务小程序', '售后系统'];
/** 升级外投弹窗的工单来源选项（默认内投渠道） */
export const ESCALATE_EXTERNAL_SOURCES: TicketSource[] = ['内投渠道', '外投渠道'];

/**
 * 升级投诉 / 升级外投的预填：两枚按钮同一套壳，已知字段取原单。
 * 问题分类取工单行三级，行上没有时取原单「工单信息」卡上那组问题标签，仍缺才留空。
 * 投诉分类只在原单是投诉单时带入；不在建单投诉分类字典里的由 `fillPrefill` 置空。
 */
export function buildEscalatePrefill(detail: TicketDetailMeta, target: EscalateTarget = 'complaint'): CreateTicketPrefill {
  const phone = detail.customer.contacts.find((c) => c.type === 'phone')?.value ?? '';
  const row = TICKETS.find((t) => t.no === detail.no);
  const originSource = normalizeTicketSource(detail.source) as TicketSource;
  const tags = detail.product.issueTags ?? [];
  const isComplaintOrigin = detail.type === '投诉';
  return {
    mode: 'escalate',
    escalateTarget: target,
    parentNo: detail.no,
    parentTitle: detail.title,
    title: detail.title,
    customerName: detail.customer.name,
    customerPhone: phone,
    customerRegion: realValue(detail.customer.region),
    customerAddress: realValue(detail.customer.address),
    customerTypes: detail.customer.types.filter(Boolean),
    vip: detail.customer.types.some((t) => t.includes('VIP')),
    product: detail.product.name,
    productCategory: realValue(row?.productCategory) ?? realValue(detail.product.category),
    sn: realValue(detail.product.sn),
    channel: CHANNEL_MAP[detail.channel] ?? '在线客服',
    formTicketType: '投诉',
    noFlashScene: true,
    priority: prefillPriority(detail.priority),
    businessType: realValue(detail.businessType),
    ticketSource: target === 'external'
      ? '内投渠道'
      : (ESCALATE_COMPLAINT_SOURCES.includes(originSource) ? originSource : '电话'),
    problemL1: realValue(row?.problemL1) ?? tags[0] ?? '',
    problemL2: realValue(row?.problemL2) ?? tags[1] ?? '',
    problemL3: realValue(row?.problemL3) ?? tags[2] ?? '',
    desc: detail.demand.slice(0, 2000),
    ...(isComplaintOrigin ? {
      complaintL1: realValue(row?.complaintL1) ?? realValue(detail.createComplaintL1),
      complaintL2: realValue(row?.complaintL2) ?? realValue(detail.createComplaintL2),
    } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* 刷机单「关联投诉」（1013 A21 / B5）                                   */
/* ------------------------------------------------------------------ */

/** 刷机单页头那一枚的文案 */
export const FLASH_LINK_COMPLAINT_LABEL = '关联投诉';

/**
 * 刷机单「关联投诉」门控（B5）：弱关联，不受自动刷机中、调研中等状态影响；
 * **只在终态（已结案 / 已关闭 / 已强结 / 已取消）置灰**。返回 null ＝ 可用。
 */
export const FLASH_LINK_COMPLAINT_ENDED_TIP = '工单已结束，不能关联投诉';
export function flashLinkComplaintBlockTip(status: string): string | null {
  return isTicketTerminated(status) ? FLASH_LINK_COMPLAINT_ENDED_TIP : null;
}

/**
 * 刷机单「关联投诉」的建单预填（B5）：新建一张投诉单，预填客户信息与产品（产品分类 + 产品名称），
 * 问题分类留空由坐席选。不走「升级投诉」那一支 —— 建单页不出「升级自原单」，提交后原单状态不变。
 */
export function buildFlashLinkComplaintPrefill(detail: TicketDetailMeta): CreateTicketPrefill {
  const phone = detail.customer.contacts.find((c) => c.type === 'phone')?.value ?? '';
  const originSource = TICKETS.find((t) => t.no === detail.no)?.ticketSource;
  return {
    ...flashPrefillPart(detail, phone),
    mode: 'normal',
    // 来源刷机单：建单页的疑似重复提示据此排除本单（不出「升级自原单」条，那只给子单 / 重开 / 升级三种模式）
    parentNo: detail.no,
    customerName: detail.customer.name,
    customerPhone: phone,
    vip: detail.customer.types.some((t) => t.includes('VIP')),
    product: detail.product.name,
    // 无 SN 的单（个册退费单）详情页记「—」，不带进建单页
    sn: realValue(detail.product.sn),
    channel: CHANNEL_MAP[detail.channel] ?? '在线客服',
    // 工单来源照原单（如「客户服务小程序」），不由渠道反推（N-06）
    ...(originSource ? { ticketSource: normalizeTicketSource(originSource) as CreateTicketPrefill['ticketSource'] } : {}),
    formTicketType: '投诉',
    noFlashScene: true,
    priority: prefillPriority(detail.priority),
    businessType: detail.businessType,
    businessLine: detail.businessLine,
    desc: `关联刷机单 ${detail.no}`,
  };
}

/**
 * 风险评估结论「关联投诉」（1013 A22）由系统新建的投诉单：客户与产品取刷机单，刷机字段组不带过去；
 * 处理人＝评估人。与原单只做弱关联（不写升级链），原单照常流转。
 */
export function buildFlashLinkedComplaint(
  origin: Ticket,
  input: { no: string; assignee: string; reason: string; now?: Date },
  overrides?: Partial<Ticket>,
): Ticket {
  const now = input.now ?? new Date();
  const stamp = formatStamp(now);
  return {
    id: `link-${input.no}`,
    no: input.no,
    type: '投诉',
    complaintType: '投诉',
    channel: origin.channel,
    ticketSource: origin.ticketSource,
    title: ['投诉', origin.product].filter(Boolean).join(' · '),
    smartMarks: [],
    customer: origin.customer,
    customerPhone: origin.customerPhone,
    vip: origin.vip,
    product: origin.product,
    productCategory: origin.productCategory,
    sn: origin.sn,
    businessType: origin.businessType,
    problemL1: '',
    problemL2: '',
    problemL3: '',
    nodeStatus: '处理中',
    nodeStep: 1,
    nodeTotal: 5,
    priority: origin.priority,
    slaText: '04:00:00',
    slaSub: '距超时',
    slaState: 'ok',
    slaMinutes: 240,
    assignee: input.assignee,
    tab: 'mine',
    responded: false,
    problemDesc: [`关联刷机单 ${origin.no}`, input.reason.trim()].filter(Boolean).join('\n'),
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

function formatStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
