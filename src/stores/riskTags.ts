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
  /**
   * 本次判定的风险等级。**null 有两种读法，看这条历史挂在谁身上**：
   *   · 挂在**命中**（key ＝ 命中 id）上 → 判为**误报**，误报没有等级，不是等级为低；
   *   · 挂在 **A 线条目**（key ＝ 条目 id）上 → 打标结论是**无风险**（业务第三轮拍板的第四档）。
   * 两者的判据不同，故各自的 `verdict` 取值也不同，见下。
   */
  level: RiskLevel | null;
  /**
   * 命中核实的判定（成立 / 误报），答的是"**这次命中准不准**"，喂的是词表准确率。
   *
   * 🔴 **仅命中打标有；A 线漏斗打标为空**（业务第三轮拍板）。漏斗打标答的是
   * "这条**有没有风险、多大**"（低 / 中 / 高 / 无风险），不判规则准不准 ——
   * 硬填一个 `误报` 会把"人判定没风险"计进词表误报率，把准确率这个数直接做坏。
   */
  verdict?: HitVerdict;
  note: string;
  by: string;
  /** 打标人当时的角色：姓名回答"是谁"，角色回答"他有多少分量" */
  byRole: string;
  at: string;
  /** 本次修正的理由。首次核实没有这一项 */
  amendReason?: string;
  /**
   * 仅 A 线条目的打标记录有：该条目由手动筛查并入监控（记录上显示「由手动筛查并入」）。
   * 来源仍是「实时监控」，这一格只留痕。
   */
  viaManualScan?: boolean;
  /** 仅 A 线条目的打标记录有：这条打标由命中核实产出（记录上显示「由命中核实」），见 `RiskTagRecord.viaHitVerify` */
  viaHitVerify?: boolean;
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
  /**
   * 工单级风险等级，取 `ticketGradeOf` 的**新口径**＝ max(已打标条目的等级, 已核实且成立的命中等级)。
   * ⚠️ 它比本对象其余几个数**宽**：上面三个计数只数命中记录（词表准确率的分母，915 §8），
   * 这一格还含 A 线的打标结论。故会出现"命中全部待核实、本单却已有高危等级"的行 ——
   * 那正是打标给的，不是命中给的。
   */
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

  /**
   * **A 线打标写进来的工单级等级**（《【930】》§6.1，2026-09-10 拍板）。
   * 两层 key ＝ 工单号 → 条目 id → 等级；打为「无风险」的条目不落在这里（那一档没有等级）。
   *
   * 【为什么要有这么一份，而不是让 `ticketGradeOf` 直接去读 A 线的条目】
   * A 线（`stores/riskQueue.ts`）**已经 import 了本 store**（打标历史走 `appendEntry`）。
   * 反过来再让本 store import 它，两个模块就成了一个环。故方向不变：
   * **打标那一侧往这里写**（`stores/riskQueue.ts` 的 `writeTicketGrade`），本 store 只读自己这一份。
   * 这也正是「打标 → 工单侧」那个此前缺失的写入口本身。
   *
   * 【为什么按条目 id 分格而不是直接存一个等级】改判要能生效：同一条目从「高」改判为「低」，
   * 那一格覆盖即可；若只存一个标量，"这张单当前有哪几条打标结论"就没地方记，
   * 多条目的单改判一条会把另一条的结论一并抹掉。取 max 在读的时候做。
   *
   * 【为什么纯内存】与打标历史（`entries`）同一个理由：它是由条目派生的投影，
   * 条目本身跟着 `stores/riskQueue.ts` 那份缓存走，刷新后由那一侧重新灌一遍（见 `writeTicketGrade`）。
   */
  const tagGrades = ref<Record<string, Record<string, RiskLevel>>>({});

  /**
   * 打标 → 工单侧的写入口。`level` 为 null（打为「无风险」）时把那一格**清掉**：
   * 「无风险」不是一档等级，留着旧值会让改判为无风险的条目仍在给工单级贡献一个等级。
   */
  function setTicketTagGrade(ticketNo: string, entryId: string, level: RiskLevel | null) {
    const cur = { ...(tagGrades.value[ticketNo] ?? {}) };
    if (level) cur[entryId] = level;
    else delete cur[entryId];
    tagGrades.value = { ...tagGrades.value, [ticketNo]: cur };
  }

  /** 本单**已打标条目**贡献的最高等级；一条都没打过标时为 null */
  function tagGradeOf(ticketNo: string): RiskLevel | null {
    let best: RiskLevel | null = null;
    for (const g of Object.values(tagGrades.value[ticketNo] ?? {})) {
      if (!best || GRADE_ORDER[g] < GRADE_ORDER[best]) best = g;
    }
    return best;
  }

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

  /**
   * 打标历史（时间正序）。**两种 key 共用这一套机制**：
   *   · 传 `RiskHit` → 命中的核实历史，数据源里带来的首次核实作为第 1 条并回；
   *   · 传**字符串** → 按 key 直接取追加历史。A 线条目的漏斗打标历史走这一路，
   *     key ＝ 条目 id（`stores/riskQueue.ts` 的 `recordTag`）。条目没有"数据源自带的首次核实"，
   *     故没有并回那一步。
   *
   * 【为什么不给 A 线另造一套】留痕这件事两边一模一样：追加不覆盖、正序、末条即现行值。
   * 抄第二份的下场是"修正历史要不要留在原地"这类口径改一处、另一处纹丝不动 ——
   * 而这正是本轮把打标做成可二次修改时最容易漏的地方。
   */
  function historyOf(h: RiskHit | string): RiskTagEntry[] {
    if (typeof h === 'string') return entries.value[h] ?? [];
    const seed = seedEntryOf(h);
    const appended = entries.value[h.id] ?? [];
    return seed ? [seed, ...appended] : appended;
  }

  /**
   * 当前生效的核实结果＝历史末条。等级、判定、准确率一律从这里取——
   * 准确率的分子分母都来自 verdict，取错版本整组数就失真，故只留这一个取值口。
   */
  function latestEntryOf(h: RiskHit | string): RiskTagEntry | undefined {
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

  /**
   * 追加一条打标记录（首次与二次修改同一个口，**追加不覆盖**）。
   * `hitId` 是命中 id 或 A 线条目 id —— 两套 key 装在同一个 record 里，见 `historyOf`。
   */
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
   * 工单级风险等级 ＝ **max(该单已打标条目的等级, 该单已核实且成立的命中等级)**
   * （2026-09-10 拍板。两维口径的真源：《【915】》§3.2 与 §9 规则 13a、《【930】》§5A.3，
   * 三处同一版；算法只写一份在《【915】》§8 指标 E1。打标结果落到工单侧哪几个字段见《【930】》§6.1。）
   *
   * 🔴 **分母本轮放宽了**：旧口径只数**风险词命中记录**，于是投诉单 P0·P1 与重要紧急单
   * 这两类来源哪怕被打成「高」，工单级等级仍是空的 —— 而这两类根本不产生命中记录，
   * 它们的等级除了打标之外没有第二个来源。放宽之后"打标为低/中/高回写工单级风险等级"
   * 这条口径对三类来源一视同仁，不再只有预警词那一路作数。
   *
   * ⚠️ **《【915】》§8 的词表准确率一个字都不动**：那边的分子分母都取命中记录的
   * `verdict`（成立 / 误报），走的是 `verdictOf` 与 `ticketVerificationOf` 的三个计数，
   * 与本函数不共用任何一条判据。放宽的只是"这张单有多危险"，不是"规则捞得准不准"。
   *
   * 【口径两维，须一起读、不得混成一句；另有并存的第三句，管的是留痕不是当前等级】
   *   · **① 跨条目 / 跨命中：取最高**。本单有几条结论就比几条，等级序 高 > 中 > 低。
   *     🔴 **这一维不是"不回退"的门控**：本函数每次调用都拿当时全部结论**全量重算**，
   *     不读任何历史值、不存上一次算出来的等级，故本单唯一那条高危被改判为低危之后，
   *     工单级等级**跟着降到低**。"取最高"说的是**同一时刻横向比几条**，
   *     **不是纵向"只升不降"**——照后者去实现一道不回退门控，就复现了本轮已在三册 PRD 里
   *     改掉四十余处的旧口径。（真有一道不回退门控，在**回传工单侧字段**那一步，
   *     《【915】》§7.5.2 步 4 / 6 与规则 31a：降下来的值不回传；那是回传的规格，不是本函数的。）
   *   · **② 同一条条目 / 命中内：以最新结论为准**。`tagGrades` 每个条目只占一格，
   *     改判**覆盖该格、可升可降**（见上面 `tagGrades` 的说明）；命中那一路同理，
   *     `latestEntryOf` 取历史末条。改判是**人做出的判断**、还必须填改判原因（硬必填）；
   *     把它挡住等于让"改判"永远改不动工单级等级，那条功能当场作废。改判为「无风险」
   *     **清空该格**（`setTicketTagGrade` 传 null 即 delete），那一档本就没有等级。
   *   · **③ 打标记录累积、不覆盖**——这一句管**历史留痕**，与上面两句并存、不得混写：
   *     改判 N 次就有 N + 1 条记录、首条不被抹去（`entries` 只 append，见 `appendEntry`）。
   *     "当前等级会降"与"记录不会少"同时成立，二者说的不是一件事。
   *
   * ⚠️ 界面上曾统一写作「取 max、只升不降」：后半句在两维上都不成立，读起来像是连改判也不降，
   * 与实现和业务本意都对不上（连改四次 无风险→低→高→中，界面写着只升不降、实际显示中危）。
   * 文案已按上面两维改；**改这里的口径必须回头改那几处文案**：`OpRiskMonitorTab.vue`
   * 打标区脚注、`RiskMonitorView.vue` 三处「工单级风险等级」的 title。
   * 【为什么误报与未核实不参与】误报的结论恰恰是"这里没有风险"；未核实的还没有人的判断。
   * 同理，打为「无风险」的条目不贡献等级（它在 `tagGrades` 里那一格已被清掉）。
   * 【为什么不落库】纯派生。落成字段就要维护它与命中记录、打标结论的一致性，每次改判都会改它。
   */
  function ticketGradeOf(ticketNo: string): RiskLevel | null {
    let best: RiskLevel | null = tagGradeOf(ticketNo);
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
      // 没有 verdict 的是 A 线漏斗打标（按条目 id 存），它不判"命中准不准"，
      // 本函数数的是命中核实的成立 / 误报，故不收。正常取不到——命中与条目两套 key 不相交
      if (!e.verdict) continue;
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
    tagGrades,
    setTicketTagGrade,
    tagGradeOf,
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
