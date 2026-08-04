import type { NotifyChannel } from '@/mock/notifyRules';

/**
 * 【815】通知规则 · 试发
 *
 * 试发要把渲染好的正文经**消息中心的同一条渠道链路真实发出去**，不是预览。
 * 理由：渲染正确 ≠ 发得出去。真实未送达的高发原因是
 *   ① i讯飞账号未映射 ② 短信模板未报备 ③ 邮件被判为垃圾邮件，
 * 这三样只看渲染结果一个也测不出来，必须真发一次才知道。
 *
 * 因此本模块只定义**契约**，投递仍归消息中心（与 PRD §1「本模块只做决策不做投递」一致）：
 * 后端应实现 POST {VITE_NOTIFY_API}/notify/rules/{ruleId}/test-send，职责为
 *   1. 校验调用人是否有该规则的配置权限；
 *   2. 频控（见下方 RATE_LIMIT_HINT）；
 *   3. 调消息中心对应渠道真实投递；
 *   4. 写一条试发流水（谁、何时、发给谁、结果），**不写入任何工单的通知记录**；
 *   5. 回传渠道消息号或错误原因。
 *
 * 未配置 VITE_NOTIFY_API 时走本地实现：做与后端一致的入参校验并回传结果，
 * 保证交互链路完整；接上后端后无需改动调用方。
 */

export interface TestSendReq {
  /** 被测规则 ID —— 后端据此取模板、校验权限、记流水 */
  ruleId: string;
  channel: NotifyChannel;
  /** 接收地址。**只能是测试人自己填的地址**，不得使用规则解析出的收件人 */
  to: string;
  /** 邮件主题；模板通道无此字段 */
  subject?: string;
  /** 已用测试数据渲染完毕的正文 */
  content: string;
  /** 模板通道（IM / 短信）使用的模板编码，短信侧需用它匹配已报备模板 */
  templateCode?: string;
}

export interface TestSendRes {
  ok: boolean;
  /** 渠道回传的消息号，用于去消息中心查投递状态 */
  messageId?: string;
  error?: string;
}

/** 建议的频控口径，供后端实现参考：短信有资费且受运营商风控，单独收紧 */
export const RATE_LIMIT_HINT = {
  默认: '同一人同一规则 1 分钟内至多 5 次',
  短信: '同一人 1 分钟内至多 2 次、同一手机号 1 天至多 20 条',
} as const;

const API_BASE = import.meta.env.VITE_NOTIFY_API as string | undefined;

const PHONE_RE = /^1[3-9]\d{9}$/;
const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 与后端一致的入参校验：地址格式不对就没必要占用渠道配额 */
export function validateAddr(channel: NotifyChannel, to: string): string | null {
  const v = to.trim();
  if (!v) return '接收地址不能为空';
  if (channel === '短信' && !PHONE_RE.test(v)) return '手机号格式不正确';
  if (channel === '邮件' && !MAIL_RE.test(v)) return '邮箱格式不正确';
  if (channel === 'IM' && v.length < 3) return 'i讯飞账号格式不正确';
  return null;
}

export async function sendTestMessage(req: TestSendReq): Promise<TestSendRes> {
  const bad = validateAddr(req.channel, req.to);
  if (bad) return { ok: false, error: bad };

  if (API_BASE) {
    const resp = await fetch(`${API_BASE}/notify/rules/${req.ruleId}/test-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!resp.ok) return { ok: false, error: `渠道返回 ${resp.status}：${await resp.text()}` };
    return (await resp.json()) as TestSendRes;
  }

  // 未接后端时：保持链路完整，回传与后端同构的结果
  await new Promise((r) => setTimeout(r, 700));
  const stamp = `${Date.now().toString(36).toUpperCase()}`;
  return { ok: true, messageId: `${req.channel}-${stamp}` };
}
