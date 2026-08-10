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

export interface ActivateAftersaleReq {
  /** 售后工单号（=关联ID） */
  no: string;
  /** 发起激活的客服工单号，供售后侧校验 1:1 关联 */
  ticketNo: string;
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

export async function activateAftersaleTicket(
  req: ActivateAftersaleReq,
): Promise<ActivateAftersaleRes> {
  if (!req.no) return { ok: false, error: '缺少售后工单号' };
  if (!req.ticketNo) return { ok: false, error: '缺少发起激活的客服工单号' };

  if (!BASE) {
    // 本地实现：与后端同样的入参校验，回传激活后状态
    return { ok: true, status: '待接单' };
  }

  try {
    const resp = await fetch(`${BASE}/aftersale/tickets/${encodeURIComponent(req.no)}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketNo: req.ticketNo, note: req.note ?? '' }),
    });
    if (!resp.ok) return { ok: false, error: `售后侧返回 ${resp.status}` };
    return (await resp.json()) as ActivateAftersaleRes;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '售后接口不可达' };
  }
}
