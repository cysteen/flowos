import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { wordOnlyRiskHitsOf, type HitVerdict, type RiskHit } from '@/mock/opsReport';
import type { RiskLevel } from '@/config/risk';
import type { RiskFlag } from '@/views/tickets/types/operation';

/**
 * 风险命中的核实结论 · 跨页共享。
 *
 * 【为什么必须提到 store 里】核实历史此前是 RiskMonitorView 组件内的一个 ref，
 * 组件一卸载就没了，工单页更是从头到尾看不见它——「监控打了标、工单页要知道」这件事
 * 在组件内的 ref 上无论如何写不出来。挪到 store 后两边读的是同一份数据，
 * 打标与工单页的回填就变成同一次状态变更的两个投影，不需要任何同步代码。
 *
 * 【局限】仍是**前端内存**：原型没有后端，浏览器整页刷新后本次打标结果归零，
 * 回到 mock 里预置的那几条核实记录。工作区内切页签、跳工单不受影响（SPA 不重载）。
 */

export interface RiskTagEntry {
  /** 本次判定的风险等级。判为**误报时为 null**——误报没有等级，不是等级为低 */
  level: RiskLevel | null;
  verdict: HitVerdict;
  note: string;
  by: string;
  /** 打标人当时的角色：姓名回答"是谁"，角色回答"他有多少分量" */
  byRole: string;
  at: string;
  /** 本次修正的理由。首次核实没有这一项 */
  amendReason?: string;
}

/** 等级由重到轻的序位，取 max 时比大小用 */
const GRADE_ORDER: Record<RiskLevel, number> = { 高: 0, 中: 1, 低: 2 };

/**
 * 一张工单在风险监控侧的现行结论。工单页要的就是这一个对象：
 * 等级用来回填、判定与打标人只用来展示，两者的去向不同，故一并给出而不合成一句文案。
 */
export interface TicketRiskVerification {
  ticketNo: string;
  /** 本单命中条数（含未核实的） */
  hitCount: number;
  confirmedCount: number;
  falseCount: number;
  pendingCount: number;
  /** 工单级风险等级 ＝ max(已核实且成立的命中等级)；无成立命中时为 null */
  grade: RiskLevel | null;
  /**
   * 由核实结论**推导**出的工单风险标记：
   * 有任一成立 → 有风险；只有待核实 → 疑似风险；全部误报 → null（不动工单的值）。
   * 命中判定（成立/误报）本身不回传——它判的是"规则这次命中得准不准"，
   * 写进工单会被读成"误报＝这单没风险"。
   */
  flag: RiskFlag | null;
  /** 最近一次核实（按打标时刻取），用于工单页的只读提示行；无人核实过时为 undefined */
  latest?: RiskTagEntry;
}

export const useRiskTagStore = defineStore('riskTags', () => {
  /** 每条命中的核实历史，按时间正序；key ＝ 命中 id。数据源里带来的首次核实不在这里，见 seedEntryOf */
  const entries = ref<Record<string, RiskTagEntry[]>>({});
  /**
   * 手动筛查确认并入的命中。与实时命中同属一份清单，故也放这里——
   * 留在组件内的话，工单页算工单级等级时会漏掉筛查并入的那几条，两边算出两个等级。
   */
  const adoptedHits = ref<RiskHit[]>([]);

  /** 全量命中 ＝ 词表实时命中 + 已并入的筛查命中。范围恒为全中心，与风险监控页一致 */
  const allHits = computed<RiskHit[]>(() => {
    const live = wordOnlyRiskHitsOf('all');
    if (!adoptedHits.value.length) return live;
    return [...live, ...adoptedHits.value];
  });

  /**
   * 数据源里带来的首次核实，作为历史的第 1 条并回展示，否则修正记录会从半截开始。
   * 判据是 verdict 而不是 tagged：误报本来就不该带等级，用等级当"判过没有"的判据，
   * 会把已核实为误报的记录整批漏掉。
   */
  function seedEntryOf(h: RiskHit): RiskTagEntry | undefined {
    if (!h.verdict) return undefined;
    return {
      level: h.verdict === '误报' ? null : (h.tagged ?? h.level),
      verdict: h.verdict,
      note: h.taggedNote ?? '',
      by: h.taggedBy ?? '—',
      byRole: h.taggedByRole ?? '—',
      at: h.taggedAt ?? '—',
    };
  }

  function historyOf(h: RiskHit): RiskTagEntry[] {
    const seed = seedEntryOf(h);
    const appended = entries.value[h.id] ?? [];
    return seed ? [seed, ...appended] : appended;
  }

  /**
   * 当前生效的核实结果＝历史末条。等级、判定、准确率一律从这里取——
   * 准确率的分子分母都来自 verdict，取错版本整组数就失真，故只留这一个取值口。
   */
  function latestEntryOf(h: RiskHit): RiskTagEntry | undefined {
    const list = historyOf(h);
    return list.length ? list[list.length - 1] : undefined;
  }

  function verdictOf(h: RiskHit): HitVerdict | undefined {
    return latestEntryOf(h)?.verdict;
  }

  /** 这条判过没有。等级可以为空（误报），判定不会，故"判过没有"只认它 */
  function isJudged(h: RiskHit): boolean {
    return !!latestEntryOf(h);
  }

  /** 追加一条核实记录（首次核实与修正同一个口，追加不覆盖） */
  function appendEntry(hitId: string, entry: RiskTagEntry) {
    entries.value = {
      ...entries.value,
      [hitId]: [...(entries.value[hitId] ?? []), entry],
    };
  }

  /** 批量打标：与单条同一套留痕，一次性写完再触发一次更新 */
  function appendEntries(list: { hitId: string; entry: RiskTagEntry }[]) {
    const next = { ...entries.value };
    list.forEach(({ hitId, entry }) => {
      next[hitId] = [...(next[hitId] ?? []), entry];
    });
    entries.value = next;
  }

  function adoptHits(hits: RiskHit[]) {
    adoptedHits.value = [...adoptedHits.value, ...hits];
  }

  /** 某张工单的全部命中，按命中时刻正序——爬坡是一条时间线，倒着读读不出先后 */
  function hitsOfTicket(ticketNo: string): RiskHit[] {
    return allHits.value
      .filter((h) => h.ticketNo === ticketNo)
      .sort((a, b) => a.when.localeCompare(b.when));
  }

  /**
   * 工单级风险等级 ＝ max(该单已核实且判定为「成立」的命中等级)（PRD §4.9 / 规则 13a）。
   *
   * 【为什么取 max 而不是最新一条】后到的低等级命中不该在没有任何人做出降级判断的情况下
   * 把这张单变回低危——等级降下来了，风险没有降。取 max 即棘轮。
   * 【为什么误报与未核实不参与】误报的结论恰恰是"这里没有风险"；未核实的还没有人的判断。
   * 【为什么不落库】纯派生。落成字段就要维护它与命中记录的一致性，每次核实、每次修正都会改它。
   */
  function ticketGradeOf(ticketNo: string): RiskLevel | null {
    let best: RiskLevel | null = null;
    for (const h of hitsOfTicket(ticketNo)) {
      if (verdictOf(h) !== '成立') continue;
      const g = latestEntryOf(h)?.level;
      if (!g) continue;
      if (!best || GRADE_ORDER[g] < GRADE_ORDER[best]) best = g;
    }
    return best;
  }

  /**
   * 工单页要的那一份结论。**该单没有任何命中记录时返回 null**——
   * 没命中就不是"没风险"，是这套监控没话可说，工单页不该为此多出一行提示。
   */
  function ticketVerificationOf(ticketNo: string): TicketRiskVerification | null {
    const hits = hitsOfTicket(ticketNo);
    if (!hits.length) return null;
    let confirmedCount = 0;
    let falseCount = 0;
    let latest: RiskTagEntry | undefined;
    for (const h of hits) {
      const e = latestEntryOf(h);
      if (!e) continue;
      if (e.verdict === '成立') confirmedCount += 1;
      else falseCount += 1;
      // 「最近一次核实」按打标时刻取，不按命中顺序：提示行要说的是"监控最后一次怎么判的"
      if (!latest || e.at.localeCompare(latest.at) > 0) latest = e;
    }
    const pendingCount = hits.length - confirmedCount - falseCount;
    // 全部误报时 flag 为 null：误报是规则问题不是风险，不该把工单标成「无风险」——
    // 那是坐席才有资格下的结论。
    const flag: RiskFlag | null = confirmedCount > 0
      ? '有风险'
      : (pendingCount > 0 ? '疑似风险' : null);
    return {
      ticketNo,
      hitCount: hits.length,
      confirmedCount,
      falseCount,
      pendingCount,
      grade: ticketGradeOf(ticketNo),
      flag,
      latest,
    };
  }

  return {
    entries,
    adoptedHits,
    allHits,
    seedEntryOf,
    historyOf,
    latestEntryOf,
    verdictOf,
    isJudged,
    appendEntry,
    appendEntries,
    adoptHits,
    hitsOfTicket,
    ticketGradeOf,
    ticketVerificationOf,
  };
});
