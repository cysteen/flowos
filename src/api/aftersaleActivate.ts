/**
 * 售后工单 · 激活
 *
 * 用在「售后转入」的工单上：售后把单转回客服（AS_RETURNED）后，1:1 关联位仍占着同一张
 * 售后单。此时客服再点「转售后」，**不应该建第二张**——那会产生一张与原售后单无法建联的
 * 新单（同 D12 的理由）。正确动作是把原来那张重新激活，让售后侧继续接手。
 *
 * 契约由售后侧提供，本模块只定义调用形态：
 *   POST {VITE_AFTERSALE_API}/aftersale/tickets/{no}/activate
 *   职责：① 校验该售后单确实与本客服单 1:1 关联；② 校验其处于可激活状态
 *        （已转回客服 / 已关闭且在可重开窗口内）；③ 重开并回到售后工单池；
 *        ④ 回写状态给客服侧；⑤ 写一条售后侧流水。
 *
 * **能否激活由售后侧判**：状态口径在售后系统，客服侧照着一份副本预判只会两边不一致，
 * 所以入口不置灰、点了才知道，失败按 error 原样提示。
 *
 * 未配置 VITE_AFTERSALE_API 时走本地实现，保证原型链路完整；接上后端后调用方无需改动。
 */
import { TICKETS } from '@/mock/tickets';

export interface ActivateAftersaleReq {
  /** 售后工单号（=关联ID） */
  no: string;
  /** 发起激活的客服工单号，供售后侧校验 1:1 关联 */
  ticketNo: string;
  /** 关系类型：发起单占的是客服来源位（回流单）还是客服派生位（售后转入单）（《【1025】》§6） */
  slot?: 'source' | 'derived';
  /** 激活说明，写进售后侧流水 */
  note?: string;
}

export interface ActivateAftersaleRes {
  ok: boolean;
  /** 激活后的售后状态；失败时为空 */
  status?: string;
  /** 失败原因（如已被其他单占用、超出可重开窗口） */
  error?: string;
}

const BASE = import.meta.env.VITE_AFTERSALE_API as string | undefined;

/** 售后单关闭后的可重开窗口（天）——口径在售后侧，本地实现按此判 */
const REOPEN_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 本地实现的售后侧判定：按该售后单当前状态给结论。
 * 已取消 → 不支持重开；已关闭 / 已完成且超出可重开窗口 → 失败；其余重开回售后工单池「待接单」。
 */
function localActivate(no: string): ActivateAftersaleRes {
  const row = TICKETS.find((t) => t.aftersaleOriginNo === no) ?? TICKETS.find((t) => t.linkedAftersaleNo === no);
  const status = row?.aftersaleOriginNo === no ? row?.aftersaleOriginStatus : row?.linkedAftersaleStatus;
  const closedAt = row?.aftersaleOriginNo === no ? row?.aftersaleOriginClosedAt : undefined;
  if (status === '已取消') return { ok: false, error: '售后单已取消，不支持重开' };
  if ((status === '已关闭' || status === '已完成') && closedAt) {
    const closedMs = new Date(closedAt.replace(' ', 'T')).getTime();
    if (Date.now() - closedMs > REOPEN_WINDOW_DAYS * DAY_MS) {
      return { ok: false, error: `售后单已关闭超过 ${REOPEN_WINDOW_DAYS} 天，超出可重开窗口` };
    }
  }
  return { ok: true, status: '待接单' };
}

export async function activateAftersaleTicket(
  req: ActivateAftersaleReq,
): Promise<ActivateAftersaleRes> {
  if (!req.no) return { ok: false, error: '缺少售后工单号' };
  if (!req.ticketNo) return { ok: false, error: '缺少发起激活的客服工单号' };

  if (!BASE) return localActivate(req.no);

  try {
    const resp = await fetch(`${BASE}/aftersale/tickets/${encodeURIComponent(req.no)}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketNo: req.ticketNo, slot: req.slot, note: req.note ?? '' }),
    });
    if (!resp.ok) return { ok: false, error: `售后侧返回 ${resp.status}` };
    return (await resp.json()) as ActivateAftersaleRes;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '售后接口不可达' };
  }
}
