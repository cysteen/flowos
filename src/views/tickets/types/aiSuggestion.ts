import type { Ticket } from './ticket';

export type AiSuggestionKind = 'upgrade' | 'similar' | 'emotion';
export type AiSuggestionFilter = 'all' | AiSuggestionKind;

export interface AiSuggestion {
  id: string;
  ticketId: string;
  kind: AiSuggestionKind;
  reason: string;
  /** 相似方案：匹配的历史工单号 */
  matchedNo?: string;
  matchedSummary?: string;
}

export interface AiSuggestionSummary {
  upgrade: number;
  similar: number;
  emotion: number;
  total: number;
}

export const AI_KIND_META: Record<
  AiSuggestionKind,
  { label: string; action: string; color: string }
> = {
  upgrade: { label: '建议升级', action: '一键升级', color: '#EF4444' },
  similar: { label: '相似方案', action: '套用方案', color: '#1A6FFF' },
  emotion: { label: '情绪预警', action: '标记已跟进', color: '#F97316' },
};

export const AI_FILTER_CHIPS: { key: AiSuggestionFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'upgrade', label: '建议升级' },
  { key: 'similar', label: '相似方案' },
  { key: 'emotion', label: '情绪预警' },
];

/** 参与 AI 扫描的工单：我的未结在处理单 */
export function isAiSuggestionScope(t: Ticket): boolean {
  if (t.tab !== 'mine' || t.archived) return false;
  return (
    t.nodeStatus === '处理中·一线'
    || t.nodeStatus === '已升级·二线'
    || t.nodeStatus === '待受理'
  );
}
