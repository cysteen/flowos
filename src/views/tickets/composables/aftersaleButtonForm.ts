/**
 * 「关联售后」位（投诉单工单头）与「转售后」位（非诉单底栏）的**形态判定**——
 * 《【1025】客服售后互转 PRD》§5.1 九行表（0–8）的唯一实现，§5.4 售后状态三档与 hover 卡片底部提示同在此处。
 *
 * OpHeader（关联售后位）与 OpActionBar（转售后位）只认这里的返回值，不各自另判：
 * 自上而下逐条判定、命中即止；角色 / 工单类型 / 数据范围不满足时按钮不出现，由调用方先收，不进本表。
 */
import type { LinkedAftersale, TicketDetailMeta } from '@/mock/ticketDetail';
import { statusStyle } from '@/views/tickets/types/ticket';
import { AFTERSALE_INBOUND_SOURCE, normalizeTicketSource } from '@/views/tickets/types/createTicket';
import { NO_AFTERSALE_LINK_TIP, NO_AFTERSALE_TIP } from './opActionRegistry';
import { FLASH_GATE_TIPS } from './flashGate';

// 判据与 opActions 的 isAftersaleSettled 同源；此处不引 opActions，
// 免得 mock/tickets（种子经售后回传通道生成）→ aftersaleEvents → 本模块 → opActions → mock/tickets 成环
const AFTERSALE_SETTLED_STATUS = ['已完成', '已关闭', '已取消'];
function isAftersaleSettled(status: string): boolean {
  return AFTERSALE_SETTLED_STATUS.includes(status);
}

export type AftersaleRelation = 'escalated' | 'converted' | 'source';

/**
 * 关联记录的关系类型（口径定稿 6d）：取关联上记的值；未记时按所占位兜底
 * （来源位＝source；派生位按来源字段 + 工单类型推：投诉＝escalated、其余＝converted）。
 */
export function aftersaleRelationOf(
  la: Pick<LinkedAftersale, 'relation' | 'slot'>,
  d: { type: string; source?: string },
): AftersaleRelation {
  if (la.relation) return la.relation;
  if (la.slot === 'source') return 'source';
  if (la.slot === 'derived' || normalizeTicketSource(d.source) === AFTERSALE_INBOUND_SOURCE) {
    return d.type === '投诉' ? 'escalated' : 'converted';
  }
  return 'source';
}

/** 关系类型 → 所占关联位 */
export function slotOfRelation(r: AftersaleRelation): AftersaleSlot {
  return r === 'source' ? 'source' : 'derived';
}

/* ---------------- §5.4 售后状态三档 ---------------- */

/** 售后单因升级投诉冻结时，客服侧收到的售后状态值（映射表以售后侧为准） */
export const AFTERSALE_FROZEN_STATUS = '冻结';

export type AftersaleStatusTier = 'open' | 'frozen' | 'settled';

/** 售后状态 → 档：冻结 / 已结案（已完成 · 已关闭 · 已取消）/ 其余一律未结案 */
export function aftersaleStatusTier(status: string): AftersaleStatusTier {
  if (status === AFTERSALE_FROZEN_STATUS) return 'frozen';
  return isAftersaleSettled(status) ? 'settled' : 'open';
}

/** 档位配色：未结案＝蓝；冻结＝等待族，与「已挂起」同色；已结案＝灰 */
export function aftersaleTierStyle(tier: AftersaleStatusTier): { color: string; background: string } {
  if (tier === 'frozen') return statusStyle('已挂起');
  if (tier === 'settled') return { color: '#6b7280', background: '#f3f4f6' };
  return { color: '#1a6fff', background: '#1a6fff18' };
}

/** 售后单两个关联位的页面名称（§5.2） */
export const AFTERSALE_SLOT_LABEL = { source: '客服来源位', derived: '客服派生位' } as const;
export type AftersaleSlot = keyof typeof AFTERSALE_SLOT_LABEL;

export const AFTERSALE_FOOT_FROZEN = '因升级投诉冻结，等待客服回传处理结果';
export const AFTERSALE_FOOT_SETTLED = '已结案，如需继续处理请线下联系售后';
export const AFTERSALE_FOOT_URGE = '补充与催单请点开工单号，在售后系统中操作';

/* ---------------- §5.1 按钮形态 ---------------- */

export type AftersaleButtonPosition = 'link' | 'transfer';
/** 建单形态 / 回传形态 / 激活形态 */
export type AftersaleButtonShape = 'create' | 'returnResult' | 'activate';

export interface AftersaleButtonForm {
  /** 命中 §5.1 的第几行（0–8） */
  row: number;
  shape: AftersaleButtonShape;
  /** 按钮名 */
  label: string;
  /** 可点 */
  enabled: boolean;
  /** 置灰且不出卡片时的悬停提示 */
  tip?: string;
  /** 悬停出售后 hover 卡片（本单有活跃关联时） */
  card: boolean;
  /** 卡片底部提示；null ＝ 不出 */
  cardFoot: string | null;
}

export interface AftersaleButtonCtx {
  position: AftersaleButtonPosition;
  /** 本单无处理人（工单池未认领）：按「未认领」置灰 */
  unclaimed?: boolean;
  /** 整页锁（被新单接管 / 只读角色）：给了即置灰并以此为悬停提示 */
  lockTip?: string;
}

type FormSubject = Pick<
  TicketDetailMeta,
  'type' | 'status' | 'source' | 'returnedFromAftersale' | 'linkedAftersale' | 'delegateInfo'
> & { product: { afterSaleEnabled: boolean } };

const REVIEW_STATUSES = ['申请挂起中', '申请关闭中', '申请强结中', '业务动作审核中'];

/** 第 0 行：工单状态落 §2.1 矩阵「置灰」列（已转出除外）时的悬停提示；不命中返回 null */
function statusGrayTip(d: FormSubject, ctx: AftersaleButtonCtx): string | null {
  if (d.status === '未认领' || ctx.unclaimed) return FLASH_GATE_TIPS.unclaimed;
  if (d.status === '调研中') return FLASH_GATE_TIPS.survey;
  if (REVIEW_STATUSES.includes(d.status)) return FLASH_GATE_TIPS.review;
  if (d.status === '已挂起') return FLASH_GATE_TIPS.suspended;
  if (d.status === '已委派' || d.delegateInfo) return FLASH_GATE_TIPS.delegated;
  return null;
}

/** hover 卡片底部提示（§5.4，取第一条命中） */
export function aftersaleCardFoot(la: Pick<LinkedAftersale, 'status'>, shape: AftersaleButtonShape): string | null {
  const tier = aftersaleStatusTier(la.status);
  if (tier === 'frozen') return AFTERSALE_FOOT_FROZEN;
  if (shape === 'returnResult' || shape === 'activate') return null;
  if (tier === 'settled') return AFTERSALE_FOOT_SETTLED;
  return AFTERSALE_FOOT_URGE;
}

export function resolveAftersaleButtonForm(d: FormSubject, ctx: AftersaleButtonCtx): AftersaleButtonForm {
  const baseLabel = ctx.position === 'link' ? '关联售后' : '转售后';
  const la = d.linkedAftersale;
  const gray = (row: number, tip: string): AftersaleButtonForm => ({
    row, shape: 'create', label: baseLabel, enabled: false, tip, card: false, cardFoot: null,
  });
  const withCard = (row: number, shape: AftersaleButtonShape, label: string, enabled: boolean): AftersaleButtonForm => ({
    row, shape, label, enabled, card: !!la, cardFoot: la ? aftersaleCardFoot(la, shape) : null,
    tip: la ? undefined : FLASH_GATE_TIPS.transferred,
  });

  if (ctx.lockTip) return gray(0, ctx.lockTip);
  // 0：状态置灰
  const stTip = statusGrayTip(d, ctx);
  if (stTip) return gray(0, stTip);

  // 1 / 2：按关联记录的**关系类型**判（口径定稿 6d），不看来源字段
  const relation = la ? aftersaleRelationOf(la, d) : null;
  // 1：③ 升级投诉转入 → 关联售后位回传形态
  if (ctx.position === 'link' && relation === 'escalated') {
    return withCard(1, 'returnResult', '回传处理结果', true);
  }
  // 2：④ 转咨询转入 → 激活形态：非诉单在转售后位；④ 咨询单升级投诉迁来的投诉单在关联售后位
  if (relation === 'converted' && ctx.position === (d.type === '投诉' ? 'link' : 'transfer')) {
    return withCard(2, 'activate', '激活售后单', true);
  }
  // 3：回流单（已被领取 / 指派）∧ 有活跃关联 → 激活形态
  if (ctx.position === 'transfer' && d.returnedFromAftersale && la) {
    return withCard(3, 'activate', '激活售后单', true);
  }
  // 4：产品无售后服务（只拦建单形态）
  if (!d.product.afterSaleEnabled) {
    return gray(4, ctx.position === 'link' ? NO_AFTERSALE_LINK_TIP : NO_AFTERSALE_TIP);
  }
  // 5 / 6：有活跃关联 · 未结案（含冻结）/ 已结案
  if (la) {
    return withCard(aftersaleStatusTier(la.status) === 'settled' ? 6 : 5, 'create', baseLabel, false);
  }
  // 7：本单在「已转出」
  if (d.status === '已转出') return withCard(7, 'create', baseLabel, false);
  // 8：无活跃关联 → 建单形态
  return { row: 8, shape: 'create', label: baseLabel, enabled: true, card: false, cardFoot: null };
}
