import { computed } from 'vue';
import { defineStore } from 'pinia';
import { useNotifyLogStore } from '@/stores/notifyLog';
import { useRiskQueueStore, type RiskTagInput } from '@/stores/riskQueue';
import { useRiskReportStore, type ReportReason, type RiskCategory } from '@/stores/riskReports';
import {
  RISK_SUPERVISOR,
  REPORT_ASSESS_LIMIT_MIN,
  assigneeReceiver,
  asSentence,
  isOpenStatus,
  reasonLine,
  reporterReceiver,
  todayPrefix,
  useRiskClock,
  type AssessDecision,
  type ReportAssessment,
  type ReportVerify,
  type RiskPoolItem,
} from '@/stores/riskShared';

/**
 * **风险工单池**（《【930】风险报备 · 监控 · 管控 PRD》§5，第二轮拍板 N6）——
 * 两条线合并之后的那一个工作面。
 *
 * 【它为什么存在】风险侧的数据已按业务第三轮拍板拆成两条互不交汇的线：
 *   · **A 线**（`stores/riskQueue.ts`）自动识别 → 实时监控 → **打标** → 风险工单池；
 *   · **B 线**（`stores/riskReports.ts`）二线专员发起风险报备 → 报备池。
 * 但**页面还没拆**：风险监控页的「风险工单池」页签今天装的仍是两条线合一队
 * （N6：来源是条目的一个属性，不是另一批数据），分派 / 自取 / 评估三个动作两条线共用。
 * 本 store 就是那一层合并 —— 队列 computed、看板 B1~B4、以及分派 / 领取 / 评估三个动作。
 *
 * 🔴 **A 线那一半的取数已按漏斗收窄**：只收**打标为低 / 中 / 高**的条目（见 `items`）。
 * 还在实时监控待打标的、以及打标判无风险的，都**不在池里**。
 *
 * 【为什么单开一个模块而不是塞进任一条线】把合并逻辑放进 A 线，A 线就得 import B 线；
 * 放进 B 线则反过来。而工单页的读口（`stores/riskReports.ts` 的 `pendingOf` 等）
 * 本轮也仍要合并 A 线 —— 两边互相 import 就是一个循环依赖。
 * 独立一层之后依赖是单向的：`riskPool → {riskQueue, riskReports} → riskShared`。
 *
 * 🔴 **本模块是过渡层**。业务第三轮拍板要把两条线分成两个池（A 线留在风险监控页，
 * B 线的报备池挪去工单工作台页签）。那一批做完之后，本文件整个删掉，
 * 两个页面各读各的 store。本轮**只拆结构、不改行为**，故合并口径一字不动。
 *
 * ⚠️ **两个分母仍然不能相加**：命中记录数 与 池内条目数 是两回事（同一张单可以报三次），
 * 合并的是"要处理的队列"，不是"统计口径"。
 */

export type { RiskPoolItem };

export const useRiskPoolStore = defineStore('riskPool', () => {
  const queue = useRiskQueueStore();
  const reportStore = useRiskReportStore();
  const notifyLog = useNotifyLogStore();
  const clock = useRiskClock();

  /**
   * 池内全部条目 ＝ B 线报备单 + A 线**打标进池**的条目。
   *
   * 🔴 **A 线这一半的口径本轮收窄了**（业务第三轮拍板 · 漏斗）：接的不再是 `queue.entries`
   * 那一整份，而是 `queue.pooledEntries` —— 只收打标为低 / 中 / 高的那批。
   * 还在「实时监控中」（没打标）与「已标记无风险」（打标判无风险）的两批**不进池**，
   * 它们在实时监控页签自己的两个视图里。
   *
   * 【为什么必须收窄】不收窄的话，池子装的是"系统怀疑有风险的"而不是"确实有风险的"，
   * 池内条数答的就是"规则今天捞了多少条"，而不是"当前有多少风险单"——
   * 而分派 / 评估这两个动作要处理的恰恰是后者。
   *
   * ⚠️ **B 线不收窄**：报备池是**独立终点、不回流**，报备单不走打标这道门，
   * 它一提交就在自己的池子里（含已撤回的那条历史）。
   *
   * 🔴 **接的是两条线的原对象，不是副本**：分派 / 评估直接改这些对象的 `status`，
   * 改动要落回各自 store 的数组里才会被持久化、才会让另一个页面跟着变。
   * 拷贝一份的话，页面上点完"分派"什么都不会发生，而且不会报错。
   */
  const items = computed<RiskPoolItem[]>(() => [...reportStore.reports, ...queue.pooledEntries]);

  /** 跨两条线按 id 找条目。号段两线唯一（见 `riskReports.ts` 的 `ID_SEQ_START`），不会撞 */
  function findById(id: string): RiskPoolItem | null {
    return reportStore.findById(id) ?? queue.findById(id);
  }

  /* ---------------- 队列与看板（§5.3 / §7） ---------------- */

  /**
   * **在队 ＝ 待分派 + 评估中**（N4）。这是"还没有结论"的全集，
   * 看板 B1、同单在队门控、「报备中」标记三处共用它，不各判各的。
   */
  function isOpen(r: { status: RiskPoolItem['status'] }) {
    return isOpenStatus(r.status);
  }

  /** 在队全集，按**等待时长降序**＝提交时刻正序（§5.3 元素 ④），等最久的在最上 */
  const openQueue = computed(() =>
    items.value.filter(isOpen).slice().sort((a, b) => a.at.localeCompare(b.at)),
  );
  /** 待分派：督导要分的就是这一批 */
  const unassignedQueue = computed(() => openQueue.value.filter((r) => r.status === '待分派'));
  /** 评估中：已有人认领、等结论 */
  const assigningQueue = computed(() => openQueue.value.filter((r) => r.status === '评估中'));

  /** **B1 待评估总数 ＝ 待分派 + 评估中**（§7，N4 改口径）。已撤回的不进任何一个数 */
  const openCount = computed(() => openQueue.value.length);

  /**
   * ⚠️ 兼容别名，指向同一个数。
   * 【为什么保留】旧名 `pendingQueue` / `pendingCount` 曾在两个页面里有调用点；
   * 直接改名会让漏改的地方**静默取到 undefined**（Pinia 不报错），
   * 那比留一个别名危险得多。新代码一律用 `openQueue` / `openCount`。
   */
  const pendingQueue = openQueue;
  const pendingCount = openCount;

  /** 等待时长与超时判定走两线共用的那根钟，见 `riskShared.ts` 的 `useRiskClock` */
  const waitedMinutes = clock.waitedMinutes;

  /** 是否超时未评：**在队**且等待时长 > 时限。不是 SLA，不走工作日历、不停表 */
  function isOverdue(r: { status: RiskPoolItem['status']; at: string }) {
    return isOpen(r) && clock.isOverdueAt(r.at);
  }

  /** B2 超时未评数（§7）。B1 ≥ B2 恒成立——超时的一定还在队里 */
  const overdueCount = computed(() => openQueue.value.filter(isOverdue).length);

  /**
   * **池内条目一律走评估**（业务第三轮拍板的连带）。
   *
   * 【为什么这一条从"按来源排除关键词那一路"改成了恒真】旧口径下五类来源合一队直接进池，
   * 其中关键词那一路要的是核实打标（成立 / 误报 + 定级）而不是评估二选一，
   * 故 B1~B4 把它排除在分母外，免得同一条命中在「监控数据」与「风险评估」两处各数一次。
   *
   * 新口径下**打标已经是进池的前置门槛**：能出现在池子里的，无论哪一类来源，
   * 都已经打过标、已经确认有风险，下一步只剩一个问题——**升不升级**。
   * 再按来源排除一批，等于让一批确实要评估的条目不进「风险评估」的分母，
   * 页头四卡会系统性报少。故判据消失，函数留着只为把这段理由钉在原地。
   *
   * ⚠️ 与实时监控那三个视图的区别仍在：三视图数的是**监控**（捞了多少、判了多少），
   * 本行数的是**评估**（升不升级答了多少）。两个分母仍然不能相加。
   */
  const goesToAssess = (_r: RiskPoolItem) => true;

  /** B1 待评估总数（四类来源）＝ 待分派 + 评估中 */
  const assessOpenCount = computed(() => openQueue.value.filter(goesToAssess).length);
  /** B1 的两个分项，界面上紧挨着 B1 摆，读得出 `待分派 + 评估中 ≡ B1` */
  const assessUnassignedCount = computed(() => unassignedQueue.value.filter(goesToAssess).length);
  const assessAssigningCount = computed(() => assigningQueue.value.filter(goesToAssess).length);
  /** B2 超时未评（四类来源） */
  const assessOverdueCount = computed(
    () => openQueue.value.filter((r) => goesToAssess(r) && isOverdue(r)).length,
  );

  /** 结论时刻：走评估的取评估时刻，走核实打标的取核实时刻。两路共用一根时间轴排序 */
  function concludedAt(r: RiskPoolItem) {
    return r.assessment?.at ?? r.verify?.at ?? '';
  }

  /**
   * 已评估清单，结论时刻倒序。
   *
   * 🔴 **漏斗改版之后这张表只剩 `assessment` 一路**：打标不再是"结掉一条条目"的方式，
   * 它只决定进不进池。打标为无风险的条目落「已标记无风险」——那是**实时监控自己的视图**，
   * 根本不在池里，故不会出现在这张表上。判据里的 `r.verify` 与 `concludedAt` 的 `verify` 分支
   * 因此成了死路，留着是因为条目上那份 `verify` 仍是过渡期页面在读的只读投影
   * （见 `riskQueue.ts` 的 `RiskQueueEntry.verify`），下一批页面改完一并删。
   */
  const assessedList = computed(() =>
    items.value
      .filter((r) => r.status === '已评估' && (r.assessment || r.verify))
      .slice()
      .sort((a, b) => concludedAt(b).localeCompare(concludedAt(a))),
  );

  /** B3 今日已评估数（§7）。按**评估时刻**落在今日算，不按提交时刻；分母同 B1，四类来源 */
  const assessedTodayCount = computed(
    () =>
      assessedList.value.filter(
        (r) => goesToAssess(r) && (r.assessment?.at ?? '').startsWith(todayPrefix()),
      ).length,
  );

  /**
   * B4 评估决策分布（§7）。窗口＝自然日，与 B3 同一批，
   * 故 `B3 = B4 两档之和` 这条恒等式天然成立。
   */
  const decisionCounts = computed(() => {
    const base: Record<AssessDecision, number> = { 不升级: 0, 接管: 0 };
    const today = todayPrefix();
    for (const r of assessedList.value) {
      if (!goesToAssess(r)) continue;
      if (!r.assessment || !r.assessment.at.startsWith(today)) continue;
      base[r.assessment.decision] += 1;
    }
    return base;
  });

  /* ---------------- 分派 / 领取 / 评估（两条线共用这三个动作） ---------------- */

  /**
   * 分派 / 自取共用的一条通知：**告诉新承办人"这活儿归你了"**。
   * 两个动作发同一条是有意的 —— 对承办人而言"督导指给我"与"我自己领的"
   * 结果完全一样（单子进了我名下、时限照走），分两条文案只是让他多读一遍。
   */
  function notifyAssigned(r: RiskPoolItem) {
    notifyLog.emit({
      ticketNo: r.ticketNo,
      event: 'risk.report.assigned',
      kind: 'risk',
      title: '风险报备待评估',
      receivers: [assigneeReceiver(r)],
      content: `${r.ticketNo} 的风险报备已由您承办，报备原因：${reasonLine(r)}；报备人：${r.by}（${r.byRole}）；提交时刻：${r.at}。请在提交后 ${REPORT_ASSESS_LIMIT_MIN} 分钟内给出评估结论（不升级 / 接管）。`,
    });
  }

  /**
   * 分派 / 改派（930 §5，O18）：把条目指给某个客诉专员，转「评估中」。
   * 批量对每个 id 调一次即可，不另写批量函数——批量与单条规则完全一样，
   * 分两套实现迟早只改一处。
   *
   * 🔴 **可改派**（O18 拍板）：已在「评估中」的也能重指给别人。
   * 【为什么允许】评估人请假 / 离职 / 手上堆太多，这活儿必须能挪；
   * 不允许改派的话唯一出路是"等它评完"，而它正卡在一个不在岗的人手上——
   * 而这条队列现在卡的是**投诉立项**（※8a），堵不起。
   * 【与「调剂」的分界】改派动的是**池内条目**（谁去评），调剂动的是**工单**（谁来办），
   * 两件事、两个词，不要混（基线 ※29）。
   *
   * **已评估 / 已撤回的不能再派** —— 活已经干完或作废了。
   */
  function assign(id: string, assignee: string) {
    const r = findById(id);
    if (!r || !isOpen(r)) return false;
    // 改派前先记住原承办人：赋值之后就取不到了
    const prev = r.assignee;
    r.status = '评估中';
    r.assignee = assignee;
    notifyAssigned(r);
    // 改派时另发一条给**原承办人**（业务 2026-09-09 拍板）：
    // 他手上的活被抽走了，不告诉他，他会一直以为这条还等着自己评。
    // 只在"确实换了人"时发 —— 重复指给同一个人不算改派。
    if (prev && prev !== assignee) {
      notifyLog.emit({
        ticketNo: r.ticketNo,
        event: 'risk.report.reassigned',
        kind: 'risk',
        title: '风险报备已改派',
        receivers: [`${prev}(客诉专员)`],
        content: `${r.ticketNo} 的风险报备已改派给 ${assignee}，无需您再评估。报备原因：${reasonLine(r)}。`,
      });
    }
    return true;
  }

  /**
   * 自取（O18）：客诉专员从待分派里自领一条，转「评估中」并落在自己名下。
   *
   * 【为什么要有它】只留"督导指派"这一条路时，**督导就是单点**——他不在岗，
   * 队列谁也动不了，而堵住的是投诉立项（※8a）。自取与指派**双轨**，
   * 与基线「领取 / 指派」是同一副骨架（※15）：领取＝自取无主的，指派＝派给指定的人。
   *
   * **只能自领待分派的**：已在别人名下的要换人走改派，不是自己伸手拿。
   */
  function claim(id: string, assignee: string) {
    const r = findById(id);
    if (!r || r.status !== '待分派') return false;
    r.status = '评估中';
    r.assignee = assignee;
    reportStore.assessArrivalTicket = r.ticketNo;
    // 领取的收件人是自己：留痕比"他自己知道"重要 —— 这条通知同时是
    // 「这单何时、被谁接走」的凭据，工单页的通知记录里查得到
    notifyAssigned(r);
    return true;
  }

  /**
   * 评估：一条条目最多一条评估记录，**提交即固化不可改**（§9 规则 22）。
   * **必须先分派**——没人认领的条目谈不上"谁给的结论"。
   */
  function assess(id: string, assessment: ReportAssessment) {
    const r = findById(id);
    if (!r || r.status !== '评估中') return;
    r.status = '已评估';
    r.assessment = assessment;
    /*
     * 结论发回**报备人** —— 他报上来之后就再没有别的出口知道结果：
     * 「不升级」时他要按反馈意见继续办这张单，「接管」时他要知道单子已经不归他了。
     *
     * A 线自动入池的条目报备人是「系统」，这一类解析为空（O23）：
     * 这时没有别的收件人类型，整条不发 —— 不是丢消息，是本来就没有人在等这个结论。
     */
    const takeOver = assessment.decision === '接管';
    const tail = takeOver
      ? `本单已由客诉专员接管，派生投诉工单 ${assessment.escalatedToNo ?? '待生成'}。接管说明：${asSentence(assessment.advice)}`
      : `反馈意见：${asSentence(assessment.advice)}`;
    notifyLog.emit({
      ticketNo: r.ticketNo,
      event: 'risk.report.assessed',
      kind: 'risk',
      title: takeOver ? '风险报备评估结论 · 接管' : '风险报备评估结论 · 不升级',
      receivers: [reporterReceiver(r)],
      content: `${r.ticketNo} 的风险报备已完成评估，结论：${assessment.decision}。${tail}评估人：${assessment.by}（${assessment.byRole}）· ${assessment.at}。`,
    });
  }

  /*
   * ⚠️ **`risk.report.overdue`（超时未评）本轮没有落点**，是缺口不是遗漏。
   *
   * 另外几个事件都挂在某个人的动作上（提交 / 分派 / 自取 / 评估 / 撤回），
   * 有函数就有埋点；**超时没有动作可挂** —— 它是钟走到了 `REPORT_ASSESS_LIMIT_MIN`
   * 自己触发的，触发条件是"时间过去了"，不是"谁做了什么"。
   *
   * 要发它必须有一个**定时扫描**（对齐《【815】》事件目录里 `source: 'timer'` 的定扫事件）：
   * 周期性扫在队条目、挑出 `isOverdue` 且尚未发过的，逐条发一次并记发送历史（免得每分钟重发）。
   * 前端 `setInterval` 顶多做个演示，真链路在服务端，本轮不做。
   *
   * 🔴 **不要为它伪造一个调用点**：挂在"打开风险监控页时补发"之类的地方，
   * 会让这条通知的发出时刻取决于**有没有人正好打开那个页面** ——
   * 而它要盯的恰恰是"没有人在看的时候单子在队里烂掉"。宁可缺，不可假。
   *
   * 它的收件人配的是「承办人 + 投诉督导」，而超时最常发生在**待分派**态
   * （压根没分派出去才拖到超时），承办人必然为空 —— 正是 O23 类型级那条规则
   * 要保住的场景：督导必须收得到。落地时直接用 `withdraw` 同样的写法。
   */

  /* ---------------- 转交给两条线自己的动作与读口 ---------------- */

  /** 二线报备提交（B 线）。同单在队门控由 `riskReports.canSubmitFor` 收，含 A 线条目 */
  function submit(input: {
    ticketNo: string;
    reason: ReportReason;
    category: RiskCategory | null;
    desc: string;
    attachments: string[];
    by: string;
    byRole: string;
    at: string;
  }) {
    return reportStore.submit(input);
  }

  /** 撤回（B 线） */
  function withdraw(id: string, reason: string) {
    reportStore.withdraw(id, reason);
  }

  /**
   * ⚠️ 旧入口，转 A 线的兼容适配器（成立/误报 → 低/中/高/无风险），见 `riskQueue.recordVerify`。
   * B 线来源恒为「二线报备」、不走打标，本就不在这条路上。
   */
  function recordVerify(ticketNo: string, verify: ReportVerify) {
    return queue.recordVerify(ticketNo, verify);
  }

  /* ---- A 线打标与三视图的转发口（新入口，页面层下一批改到这里来） ---- */

  /** 风险打标 · 状态机唯一入口。判据是低/中/高 还是 无风险，见 `riskQueue.recordTag` */
  function recordTag(entryId: string, input: RiskTagInput) {
    return queue.recordTag(entryId, input);
  }
  /** 按工单号打标（打标弹窗从命中侧点开，手上只有单号） */
  function recordTagFor(ticketNo: string, input: RiskTagInput) {
    return queue.recordTagFor(ticketNo, input);
  }
  /** 本条目的完整打标历史（含二次修改），时间正序 */
  function tagHistoryOf(entryId: string) {
    return queue.tagHistoryOf(entryId);
  }
  /** 实时监控 · 视图一：待打标 */
  const monitoringEntries = computed(() => queue.monitoringEntries);
  /** 实时监控 · 视图二：已入池（＝本池 A 线那一半） */
  const pooledEntries = computed(() => queue.pooledEntries);
  /** 实时监控 · 视图三：已标记无风险（不进池） */
  const noRiskEntries = computed(() => queue.noRiskEntries);

  function reportsOf(ticketNo: string) {
    return reportStore.reportsOf(ticketNo);
  }
  function pendingOf(ticketNo: string) {
    return reportStore.pendingOf(ticketNo);
  }
  function historyOf(ticketNo: string) {
    return reportStore.historyOf(ticketNo);
  }
  function canSubmitFor(ticketNo: string) {
    return reportStore.canSubmitFor(ticketNo);
  }
  function isReporting(ticketNo: string) {
    return reportStore.isReporting(ticketNo);
  }
  function assessmentNoteOf(ticketNo: string) {
    return reportStore.assessmentNoteOf(ticketNo);
  }
  function consumeAssessArrival(ticketNo: string) {
    return reportStore.consumeAssessArrival(ticketNo);
  }

  return {
    /**
     * ⚠️ 别名：池内全部条目。`reports` 这个名字是拆分前留下的
     * （「接管」派生新单号时要在两条线已用过的号里取最大值 +1，扫的就是这一份）。
     */
    reports: items,
    items,
    findById,
    openQueue,
    unassignedQueue,
    assigningQueue,
    openCount,
    overdueCount,
    pendingQueue,
    pendingCount,
    assessOpenCount,
    assessUnassignedCount,
    assessAssigningCount,
    assessOverdueCount,
    assessedList,
    assessedTodayCount,
    decisionCounts,
    waitedMinutes,
    isOverdue,
    assign,
    claim,
    assess,
    submit,
    withdraw,
    recordVerify,
    recordTag,
    recordTagFor,
    tagHistoryOf,
    monitoringEntries,
    pooledEntries,
    noRiskEntries,
    reportsOf,
    pendingOf,
    historyOf,
    canSubmitFor,
    isReporting,
    assessmentNoteOf,
    consumeAssessArrival,
  };
});
