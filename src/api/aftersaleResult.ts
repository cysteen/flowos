/**
 * 售后工单 · 回传处理结果（《【1025】客服售后互转 PRD》§4.2）
 *
 * 用在「售后升级投诉转入」的投诉单（③）上：客服侧把投诉处理结论回传给售后单。
 * 第一次回传使售后单解冻、回售后侧流程（解冻后状态由售后侧定）；第二次起只送达、不再解冻。
 *
 * 契约由售后侧提供，本模块只定义调用形态：
 *   POST {VITE_AFTERSALE_API}/aftersale/tickets/{no}/complaint-result
 *   入参：客服工单号、处理结论（枚举以售后侧为准）、处理说明、操作人、时间戳
 *   出参：成功时回带售后单当前状态；失败带原因，客服侧原样透出、可重试，不降级、不兜底。
 *
 * 未配置 VITE_AFTERSALE_API 时走本地实现，保证原型链路完整；接上后端后调用方无需改动。
 */

/** 处理结论取值（枚举以售后侧提供为准） */
export const AFTERSALE_RESULT_CONCLUSIONS = ['已解决', '部分解决', '未解决', '客户撤回投诉'] as const;

export interface SubmitAftersaleResultReq {
  /** 售后工单号（＝关联ID） */
  no: string;
  /** 发起回传的客服工单号 */
  ticketNo: string;
  conclusion: string;
  note: string;
  operator: string;
  at: string;
  /** 本次是否首次回传（首次回传使售后单解冻） */
  first: boolean;
}

export interface SubmitAftersaleResultRes {
  ok: boolean;
  /** 售后单当前状态（首次回传解冻后由售后侧返回）；失败时为空 */
  status?: string;
  /** 失败原因 */
  error?: string;
}

const BASE = import.meta.env.VITE_AFTERSALE_API as string | undefined;

export async function submitAftersaleResult(req: SubmitAftersaleResultReq): Promise<SubmitAftersaleResultRes> {
  if (!req.no) return { ok: false, error: '缺少售后工单号' };
  if (!req.ticketNo) return { ok: false, error: '缺少客服工单号' };

  if (!BASE) {
    // 本地实现：首次回传解冻，售后单回到「处理中」；补充回传只送达
    return { ok: true, status: req.first ? '处理中' : undefined };
  }

  try {
    const resp = await fetch(`${BASE}/aftersale/tickets/${encodeURIComponent(req.no)}/complaint-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!resp.ok) return { ok: false, error: `售后侧返回 ${resp.status}` };
    return (await resp.json()) as SubmitAftersaleResultRes;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '售后接口不可达' };
  }
}
