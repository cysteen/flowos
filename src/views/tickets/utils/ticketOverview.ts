import type { LatestHandlingItem } from '@/views/tickets/types/operation';
import type { Ticket } from '@/views/tickets/types/ticket';

/** 列表与处理页速览带共用：产品&问题一行文案 */
export function ticketProductIssue(t: Ticket): string {
  const parts = [t.productCategory, t.product].filter(Boolean);
  return parts.length ? parts.join('-') : t.product;
}

function formatOverviewWhen(updatedAt?: string): string {
  if (!updatedAt) return '最近';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (updatedAt.startsWith(ymd)) {
    const hm = updatedAt.slice(11, 16);
    return hm ? `今天 ${hm}` : '今天';
  }
  return updatedAt.slice(5, 16);
}

/** 当前时刻标签（运行态回写「最新处理」用） */
export function formatHandlingNow(): string {
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `今天 ${hm}`;
}

/** 列表「最新」与处理页「最新处理」首条对齐 */
export function ticketLatestHandlingItems(t: Ticket): LatestHandlingItem[] {
  const text = t.latestHandling?.trim();
  if (!text) return [];
  return [{
    who: t.assignee ?? '处理人',
    role: '一线坐席',
    when: formatOverviewWhen(t.updatedAt),
    text,
  }];
}

export function ticketLatestHandlingPreview(t: Ticket): LatestHandlingItem | null {
  const items = ticketLatestHandlingItems(t);
  return items[0] ?? null;
}

export interface DraftHandlingInput {
  processResult?: string;
  techProcessResult?: string;
  processWho: string;
  processRole: string;
  techWho?: string;
}

/**
 * 将处理表单 / 技术支持「处理结果」回写到「最新处理」。
 * - source=process|tech 的条目按来源 upsert（有则更新，无则置顶）
 * - 历史记录（无 source）保留在其后
 * - 清空对应草稿文本时移除该来源条目
 */
export function mergeDraftIntoLatestHandling(
  existing: LatestHandlingItem[],
  input: DraftHandlingInput,
): LatestHandlingItem[] {
  const history = existing.filter((h) => h.source !== 'process' && h.source !== 'tech');
  const when = formatHandlingNow();
  const drafts: LatestHandlingItem[] = [];

  const processText = input.processResult?.trim();
  if (processText) {
    drafts.push({
      who: input.processWho,
      role: input.processRole,
      when,
      text: processText,
      source: 'process',
    });
  }

  const techText = input.techProcessResult?.trim();
  if (techText) {
    drafts.push({
      who: input.techWho ?? '技术支持',
      role: '技术支持',
      when,
      text: techText,
      source: 'tech',
    });
  }

  // 去掉与当前处理结果正文完全相同的历史条，避免双写重复
  const draftTexts = new Set(drafts.map((d) => d.text));
  const dedupedHistory = history.filter((h) => !draftTexts.has(h.text.trim()));

  return [...drafts, ...dedupedHistory];
}
