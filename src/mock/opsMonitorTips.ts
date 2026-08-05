/**
 * 运营监控大盘 · 指标口径提示
 * 内容对齐《【915】运营监控大盘 PRD》各口径表的「提示文案」列。
 */
import type { KpiTip } from '@/mock/homeOverview';

export type { KpiTip };

/**
 * key = 指标 key / 列 key
 *
 * 写作约定（2026-08-05 业务定，与个人门户、班组看板一致）：
 * · **只有一句话**，口语、不超过 20 字、不用术语
 * · 纯文本渲染，**不要写 Markdown**，星号会原样显示
 * · 不写计入/排除边界、不写易混提醒、不写更新频率与下钻去向
 *   —— 写得越细越容易被质疑，边界一旦挂在界面上就成了对外承诺
 * · 完整口径以 PRD 为准，此处不承担完备性
 */
export const OPS_METRIC_TIPS: Record<string, KpiTip> = {
  /* ── 工单流量（§4） ── */
  inbound: { define: '今天新进入本范围的单' },
  forward: { define: '今天推给下一环节的单' },
  backlog: { define: '已经超解决时效、还没处理完的单' },
  io: { define: '今天进得比出得多还是少' },
  longestWait: { define: '超时最久的那单等了多久' },
  workingStock: { define: '此刻手上还没走完的全部单' },

  /* ── 时效分层（§5） ── */
  soon: { define: '还没超时、但快到点的单' },
  overdueLe24: { define: '刚超时不久的单' },
  overdueLe72: { define: '超时一到三天的单' },
  overdueGt72: { define: '超时超过三天的单' },

  /* ── 风险词命中（§6） ── */
  riskHits: { define: '客户说了敏感话、被词表命中的条数' },
  riskUntagged: { define: '高危命中里还没人核实的条数' },

  /* ── 流量走势（§7） ── */
  trendInbound: { define: '每个时间点进来多少单' },
  trendForward: { define: '每个时间点推走多少单' },
  trendStock: { define: '每个时间点手上还有多少单' },
  trendPeak: { define: '哪个时段进得最多、最少' },
};

export function opsTip(key: string): KpiTip | undefined {
  return OPS_METRIC_TIPS[key];
}
