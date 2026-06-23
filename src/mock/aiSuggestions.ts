import type { Ticket } from '@/views/tickets/types/ticket';
import type { AiSuggestion, AiSuggestionKind } from '@/views/tickets/types/aiSuggestion';
import { isAiSuggestionScope } from '@/views/tickets/types/aiSuggestion';

const SIMILAR_MATCH: Record<string, { no: string; summary: string }> = {
  t4: { no: 'LCMN-20260520-42100', summary: '同产品 API 限流，调整配额后已解决' },
  t11: { no: 'LCMN-20260518-38902', summary: 'Webhook 丢包，重试策略修复后结单' },
};

const EMOTION_REASON: Record<string, string> = {
  t1: '对话情绪偏急，客户已表达不满，建议优先安抚并跟进',
  t5: '客户语气负面，涉及退货纠纷，建议优先致电沟通',
  t8: '客户投诉响应慢并多次催单，情绪偏激动，建议加急处理',
};

function upgradeReason(t: Ticket): string {
  if (t.slaState === 'overdue') {
    return `SLA 已超时（${t.slaText}），建议升级二线加急处理`;
  }
  if (t.slaState === 'soon') {
    return `SLA 临期（${t.slaText} ${t.slaSub}），建议升级避免超时`;
  }
  return '客户多次催单且优先级较高，建议升级二线协同处理';
}

function shouldSuggestUpgrade(t: Ticket): boolean {
  return t.smartMarks.includes('升级')
    || t.slaState === 'overdue'
    || (t.slaState === 'soon' && (t.priority === 'P0' || t.priority === 'P1'));
}

function pushSuggestion(
  list: AiSuggestion[],
  t: Ticket,
  kind: AiSuggestionKind,
  reason: string,
  extra?: Pick<AiSuggestion, 'matchedNo' | 'matchedSummary'>,
) {
  list.push({
    id: `${t.id}-${kind}`,
    ticketId: t.id,
    kind,
    reason,
    ...extra,
  });
}

/** 从工单 Mock 派生今日 AI 建议（PRD-02 §7②） */
export function buildAiSuggestions(tickets: Ticket[]): AiSuggestion[] {
  const list: AiSuggestion[] = [];

  for (const t of tickets) {
    if (!isAiSuggestionScope(t)) continue;

    if (shouldSuggestUpgrade(t)) {
      pushSuggestion(list, t, 'upgrade', upgradeReason(t));
    }
    if (t.smartMarks.includes('相似')) {
      const match = SIMILAR_MATCH[t.id];
      pushSuggestion(
        list,
        t,
        'similar',
        match
          ? `匹配历史工单 ${match.no}（${match.summary}）`
          : '发现可复用的历史解决方案，建议参考套用',
        match,
      );
    }
    if (t.smartMarks.includes('情绪')) {
      pushSuggestion(
        list,
        t,
        'emotion',
        EMOTION_REASON[t.id] ?? '对话情绪识别为负面倾向，建议优先跟进',
      );
    }
  }

  const rank: Record<AiSuggestionKind, number> = { upgrade: 0, similar: 1, emotion: 2 };
  list.sort((a, b) => {
    const g = rank[a.kind] - rank[b.kind];
    if (g !== 0) return g;
    return a.ticketId.localeCompare(b.ticketId);
  });

  return list;
}
