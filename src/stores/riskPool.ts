import { computed } from 'vue';
import { defineStore } from 'pinia';
import { useNotifyLogStore } from '@/stores/notifyLog';
import { useRiskCollabStore, type RiskAdviceItem } from '@/stores/riskCollab';
import { useRiskHistoryStore } from '@/stores/riskHistory';
import { useRiskQueueStore, type RiskTagInput } from '@/stores/riskQueue';
import { useRiskReportStore, type ReportReason, type RiskCategory } from '@/stores/riskReports';
import { useDerivedTicketStore } from '@/stores/derivedTickets';
import { TICKETS } from '@/mock/tickets';
import { resolveTicketGroupNames } from '@/views/tickets/types/ticket';
import {
  REPORT_ASSESS_LIMIT_MIN,
  REPORT_SOURCE,
  asSentence,
  isOpenStatus,
  isPoolLevel,
  isPooledStatus,
  normalizeDecision,
  reasonLine,
  reporterReceiver,
  todayPrefix,
  useRiskClock,
  type AssessDecision,
  type ReportAssessment,
  type ReportVerify,
  type RiskPoolItem,
  type RiskReleaseRecord,
} from '@/stores/riskShared';

/**
 * **风险工单池**（《【930】风险报备 · 监控 · 管控 PRD》§5，第二轮拍板 N6）——
 * 两条线合并之后的那一个工作面。
 *
 * 【它为什么存在】风险侧的数据已按业务第三轮拍板拆成两条互不交汇的线：
 *   · **A 线**（`stores/riskQueue.ts`）自动识别 → 实时监控 → **打标** → 风险工单池；
 *   · **B 线**（`stores/riskReports.ts`）二线专员发起风险报备 → 报备池。
 * 但**页面还没拆**：风险监控页的「风险工单池」页签今天装的仍是两条线合一队
 * （N6：来源是条目的一个属性，不是另一批数据），领取 / 评估两个动作两条线共用。
 * 本 store 就是那一层合并 —— 队列 computed、看板 B1~B4、以及领取 / 评估这两个动作。
 *
 * 🔴 **没有分派 / 改派 / 批量分派**（业务第三轮拍板整套取消，见 `claim`）：池里只有「领取」。
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

/**
 * 一次**释放**要填的东西 ＝ 那条留痕本身（释放人 · 角色 · 时刻 · 原因，§5.5 ⑥）+ 一枚门控开关。
 *
 * 【为什么入参就是留痕】释放**没有第二个产物**：状态回退是它的效果，留痕是它留下的全部东西。
 * 再造一个 Input 形状去映射一遍，只会多一处可以写歪的地方。
 */
export interface RiskReleaseInput extends RiskReleaseRecord {
  /**
   * **管理员兜底**（§5.5 ②）：置 true 时可释放**任意**已领取条目，不再校验承办人本人。
   * 缺省 false ＝ 只能释放自己承办的那一条。
   *
   * 🔴 **它不是"跳过校验"的后门**：角色判据在页面层（`canReleaseAnyRiskReport`），
   * 与 `claim` 把角色门控留在页面层同形 —— store 认得出人名，认不出角色。
   */
  anyAssignee?: boolean;
}

/** 一次协同处理要填的东西。`otherAdvice` 只在勾了「其他」时有（条件必填，由调用方收校验） */
export interface CoordinateInput {
  opinion: string;
  advices: RiskAdviceItem[];
  otherAdvice?: string;
  by: string;
  byRole: string;
  at: string;
}

/**
 * A 线结论通知的收件人：**本单当前处理人**；工单无处理人（未认领）时落**归属组**（基线 ※19）。
 * 取数与工单处理页同源：静态工单库 → 运行时派生单。两者都解析不到时返回空串（O23 类型级跳过）。
 */
function currentHandlerReceiver(ticketNo: string): string {
  const t = TICKETS.find((x) => x.no === ticketNo) ?? useDerivedTicketStore().find(ticketNo);
  if (!t) return '';
  if (t.assignee) return `${t.assignee}(处理人)`;
  const group = resolveTicketGroupNames(t)[0];
  return group ? `${group}(归属组)` : '';
}

export const useRiskPoolStore = defineStore('riskPool', () => {
  const queue = useRiskQueueStore();
  const reportStore = useRiskReportStore();
  const collabStore = useRiskCollabStore();
  const notifyLog = useNotifyLogStore();
  /**
   * 第八类履历（风险结论）的唯一落库口，见 `stores/riskHistory.ts`。
   * 本合并层出「评估结论」与「协同处理」两件 —— 这两个动作**两条线共用**，
   * 而且各有两个页面入口（风险监控页 / 工单处理页底栏那一枚按钮），
   * 写在这里就等于两个入口自动同口径，不会再出现"一个入口有履历、另一个没有"。
   */
  const history = useRiskHistoryStore();
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
  /**
   * 待领取：还没有人认领的那一批。
   * ⚠️ 落库值仍是「待分派」——它是分派时代留下的词，分派已取消但状态枚举没跟着改
   * （`ReportStatus` 是两条线共用的，B 线本轮不解冻）。**界面一律写「待领取」**，
   * 那才是这一档现在的含义：谁有空谁领。
   */
  const unassignedQueue = computed(() => openQueue.value.filter((r) => r.status === '待分派'));
  /** 评估中：已有人领走、等结论 */
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

  /**
   * 结论时刻：走评估的取评估时刻，走协同的取协同时刻，走核实打标的取核实时刻。
   * 三路共用一根时间轴排序 —— 已评估清单是按"什么时候出的结论"倒序，
   * 协同处理同样是一次结论，不能因为它没有 `assessment` 就掉到列表末尾。
   */
  function concludedAt(r: RiskPoolItem) {
    return r.assessment?.at ?? r.coordination?.at ?? r.verify?.at ?? '';
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
      .filter((r) => r.status === '已评估' && (r.assessment || r.coordination || r.verify))
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
    const base: Record<AssessDecision, number> = { 升级: 0, 不升级: 0 };
    const today = todayPrefix();
    for (const r of assessedList.value) {
      if (!goesToAssess(r)) continue;
      if (!r.assessment || !r.assessment.at.startsWith(today)) continue;
      // 归一化之后再落格：B 线的种子与它自己那份缓存里仍有旧词「接管」，
      // 直接拿它当 key 会写出一个枚举外的第五格，两枚 chip 一枚也数不到它（见 `normalizeDecision`）
      base[normalizeDecision(r.assessment.decision)] += 1;
    }
    return base;
  });

  /* ---------------- 领取 / 评估（两条线共用这两个动作） ---------------- */

  /**
   * 领取之后发给**报备人**的一条：**告诉他"有人接走了、在办了"**，同时留一份
   * 「这单何时、被谁接走」的凭据（工单页的通知记录里查得到）。
   *
   * 🔴 **收件人不是承办人自己**（2026-09-11 改）：领取是他**自己刚点下去的动作**，
   * 屏幕上已经有一句 message、条目也立刻落到他名下 —— 再发一封告诉他"这活儿归你了"，
   * 是在通知一个人他自己刚做过的事。真正在等消息的是**报备人**：他报上去之后
   * 到出结论之前是一段空悬，"有没有人接"是这段里他唯一想知道的事。
   * A 线自动入池的条目报备人是「系统」，这一类解析为空（O23），整条不发 ——
   * 不是丢消息，是本来就没有人在等这条。
   *
   * 🔴 **事件码 `risk.report.claimed`，不是已废的 `risk.report.assigned`**：
   * 分派 / 改派 / 批量分派整套已取消（业务第三轮拍板），两个池子都只留「领取」，
   * `assigned` 这个码指的是一个不再存在的动作。
   * 【为什么取消分派】指派这条路让**督导变成队列的单点**——他不在岗，谁也动不了，
   * 而这条队列卡的是投诉立项（基线 ※8a）。改成"谁有空谁领"之后，
   * 队列的吞吐不再取决于某一个人在不在。
   * 【连带】`risk.report.reassigned`（已改派）这个事件随之没有落点——没有改派动作了。
   *
   * 🔴 **落款角色取领取那一刻的实际角色 `byRole`，不写死「客诉专员」**（2026-09-11 改）：
   * 领取权 ＝ 客诉专员 **+ 三个管理员 scope**（`canClaimRiskReport` / 监控页的
   * `REPORT_CLAIM_ROLES`），管理员兜底领取是**常规路径**（基线 v1.24 ※29、缺口 G6 已结案），
   * 写死的话这封通知会当着报备人的面把管理员称作客诉专员 ——
   * 而报备人正是据此判断"这条现在归谁办、该找谁问"。
   *
   * ⚠️ **锚点：凡是角色名的字面量，一律照常量 / 实参的实际取值写，同源须同改。**
   * 这是本仓第 8 处同一种错法（前七处都在权限提示里，各自已加同样的锚点注释），
   * 区别只在这一处落在**通知正文**里 —— 正文不像提示语那样点一下就看得见，
   * 它发出去就进了通知记录，错的落款会一直留在凭据上。
   *
   * ⚠️ **只改正文取值，不新增通知事件**（§6.2 / §9 规则 34：本册不新增任何通知事件）。
   */
  function notifyClaimed(r: RiskPoolItem, byRole: string) {
    notifyLog.emit({
      ticketNo: r.ticketNo,
      event: 'risk.report.claimed',
      kind: 'risk',
      title: '风险报备已领取',
      receivers: [reporterReceiver(r)],
      content: `${r.ticketNo} 的风险报备已由 ${r.assignee || '承办人'}（${byRole}）领取，正在评估中。报备原因：${reasonLine(r)}；提交时刻：${r.at}。处置时限 ${REPORT_ASSESS_LIMIT_MIN} 分钟（自报备提交时刻起算），出结论后会再通知你。`,
    });
  }

  /**
   * **领取**（业务第三轮拍板后池内唯一的认领动作）：客诉专员从待领取里自领一条，
   * 转「评估中」并落在自己名下。
   *
   * **只能领还没人认领的那一批**：已在别人名下的不给伸手拿——那不是"领取"，
   * 那是把别人手上正在办的活抽走，而分派 / 改派整套本轮已经取消。
   *
   * 🔴 **`assigneeRole` 是领取那一刻操作人的实际角色**，只有一个用处：通知正文的落款
   * （见 `notifyClaimed`）。**不落在条目上** —— 模型里没有"承办人角色"这一格，
   * 补一格就等于多一份会过期的副本（人换角色后条目上那一格仍是旧的）。
   * 与 `release` 把 `byRole` 记进释放留痕不同：那是**历史事件**的落款，本就该冻住。
   */
  function claim(id: string, assignee: string, assigneeRole: string) {
    const r = findById(id);
    if (!r || r.status !== '待分派') return false;
    r.status = '评估中';
    r.assignee = assignee;
    reportStore.assessArrivalTicket = r.ticketNo;
    // 收件人是**报备人**（不是承办人自己），理由见 notifyClaimed
    notifyClaimed(r, assigneeRole);
    return true;
  }

  /**
   * **释放**（《【930】》PRD v3.5 §5.5 新立，两个池同一套口径 / §5B.4「逐条同 §5.5」）——
   * 承办人把**已领取**的条目退回「待领取」，由任何有资格的人重新领。与 `claim` 互为逆动作。
   *
   * 🔴 **释放不是换人**（§5.5 ①）：它**不指定接手人**，只是把条目放回池子。
   * 「领取后不能换人」这条因此收窄为"不能把条目直接指给另一个人"——
   * 分派 / 改派 / 批量分派仍整套不做（§9 规则 9）。
   *
   * 【发生什么 · §5.5 ⑤ ⑥】
   *   ① 状态回「待领取」（**落库值仍写 `'待分派'`**，界面映射不变，见 `unassignedQueue` 的说明）；
   *   ② 承办人清空 —— 这一格正是"谁在办"的唯一判据，不清的话条目回到待领取却还挂着人名；
   *   ③ 条目上**累积**一条释放记录（释放人 · 角色 · 时刻 · 原因），**不覆盖**前几次。
   *
   * 【不发生什么 · §5.5 ⑤ ⑦ ⑧ ⑩】
   *   · **等待时长不归零、不重新计时**：本函数**一个字都不碰 `at`** —— 钟从进池 / 提交时刻起算
   *     （§9 规则 26），已超时的行释放后仍标红。这不是疏漏，是这一条口径本身：
   *     领了又退也是这条队列在拖，钟不该因为换了个人就重置。
   *   · **不落《【720】》第八类履历**：释放与领取同属**队列内部事件**，工单一格没动
   *     （§6.3 / §9 规则 32：第八类收报备提交 / 打标 / 评估结论 / 协同处理 / 风险等级变更**五件**，
   *     明确不含「条目被领取」「条目被释放」）。🔴 **不要顺手补 `history.recordRiskHistory`。**
   *   · **本轮不发任何通知**：本册不新增通知事件（§6.2、§9 规则 34）。收件人口径已
   *     **预先写定并与 `risk.report.claimed` 对称**——**B 线＝报备人、A 线＝不发**
   *     （A 线的 `by` 恒为「系统」，`reporterReceiver` 解析为空，本来就没有人在等这条）。
   *     将来若为释放立事件，按此收件人执行、无须再议；🔴 在那之前**不要为它造事件码**。
   *   · 不改工单子状态、不改处理人、不改风险等级、不改「报备中」标记（那是纯派生的，
   *     见 `riskReports.isReporting`：条目回到「待领取」仍在队，标记照旧挂着）。
   *   · **不进任何指标的分子**：B1 / A1 的口径含待领取与已领取两态，释放前后总数不变，
   *     只有 A1a / A1b（B1a / B1b）两个分项此消彼长（§7 / §9 规则 4a）。
   *
   * 【B 线的连带 · §5.5 ⑨】条目退回「待领取」之后，报备人的「撤回」入口**随之恢复** ——
   * 这一条**不用写代码**：`OpRiskMonitorTab.canWithdraw` 判的是"待分派 + 本人"，
   * 状态一回去它自己就亮了。本注释只为说明那是设计而不是巧合。
   *
   * 【谁能释放 · §5.5 ②】该条的**承办人本人**；**管理员**为兜底，可释放任意已领取条目。
   * 本函数只认得出"是不是本人"（`input.by` 对 `r.assignee`），认不出角色 ——
   * 管理员那一路由调用方置 `anyAssignee`，与 `claim` 把角色门控留在页面层同形。
   * **投诉督导不出这个动作**（`canClaimRiskReport` 已把它挡在外面）。
   */
  function release(id: string, input: RiskReleaseInput): boolean {
    const r = findById(id);
    // 🔴 **仅「已领取」态**（§5.5 ③）：已结论、已撤回、待领取三态都没有可退的东西
    if (!r || r.status !== '评估中') return false;
    // 释放原因必填（§5.5 ④）。空白与全空格在这里也收一道 —— 弹窗那道校验拦的是人，
    // 这一道拦的是"别处绕过表单直接调进来"，两道都要，与 `submit` 收 `category` 同形
    const reason = input.reason.trim();
    if (!reason) return false;
    // 管理员兜底之外，只有承办人本人能退自己领的那条
    if (!input.anyAssignee && r.assignee !== input.by) return false;

    r.status = '待分派';
    /*
     * 承办人清空。⚠️ §5.5 ⑤ 还要求"**领取时刻**清空"——模型上**没有这一格**：
     * `claim` 从不记录领取时刻（等待时长按 §9 规则 26 从进池 / 提交时刻起算，
     * 领取时刻在口径上无处可用）。故这一句在本原型里**无对应字段可清**，
     * 不是漏做。哪天补上领取时刻，记得在这里一并清掉。
     */
    r.assignee = undefined;
    // 🔴 **累积不覆盖**（§5.5 ⑥）：同一条被领取释放 N 次就有 N 条记录
    r.releases = [...(r.releases ?? []), {
      by: input.by,
      byRole: input.byRole,
      at: input.at,
      reason,
    }];
    /*
     * 撤掉 `claim` 埋下的那张"进工单页就弹评估弹窗"的票（它是领取的连带，不是条目的属性）。
     * 不撤的话，释放完再点开这张单，工单页仍会试着为一条**已经不在任何人名下**的条目开弹窗
     * ——那一步会被 `canAssessReport` 拦住、什么也不会发生，但那是靠下游兜住的，
     * 票本身此刻已经失效。**谁埋谁撤**，与 `claim` 那一行对称。
     */
    if (reportStore.assessArrivalTicket === r.ticketNo) {
      reportStore.assessArrivalTicket = null;
    }
    return true;
  }

  /**
   * 评估：一条条目最多一条评估记录，**提交即固化不可改**（§9 规则 22）。
   * **必须先有人领**——没人认领的条目谈不上"谁给的结论"。
   */
  function assess(id: string, assessment: ReportAssessment) {
    const r = findById(id);
    if (!r || r.status !== '评估中') return;
    r.status = '已评估';
    r.assessment = assessment;
    /*
     * 落《【720】》第八类履历 ②「评估结论」（《【930】》§6.3）：
     * 「〈评估人〉 完成风险评估 · 〈升级 / 不升级〉」，结论＝升级时另带**派生出的新投诉单号**。
     *
     * ⚠️ 单号只在**真派生了新单**那一路有：投诉单那一路的「升级」走基线 ※27「工单管控」、
     * 本单状态不变、不派生新单（O20），`escalatedToNo` 恒空，履历行也就不带单号。
     * 🔴 升级投诉那一跳**自身**的履历（第 2 类「关联单」）照《【830】》既有口径另落一条，
     * 两条并存（《【720】》§4.4「不记入本类的情形」①）。
     *
     * ⚠️ **那一条也不在本函数里落，但它现在真的有落点了**：
     * `TicketOperationView.pushEscalationRelateEntry` 把它与第 8 类那一条**同源投影**出来，
     * 两处的单号都取本记录的 `derivedNo`，故必然一致（《【720】》验收 T4）。
     * 【为什么不在这里 push】履历是按工单现搭的**内存态**，而评估最常发生在风险监控页 ——
     * 那一刻原单的工单页往往没打开，在这里 push 进去的那一条没有落点。
     * 🔴 这段注释此前只写了"另落一条"却没有任何落点，第 2 类因此**一条都没有**过；
     * 种子履历自带的两张 relate 卡把这个洞盖了很久。改这一段前先确认落点还在。
     */
    history.recordRiskHistory({
      kind: 'assess',
      ticketNo: r.ticketNo,
      by: assessment.by,
      byRole: assessment.byRole,
      at: assessment.at,
      decision: normalizeDecision(assessment.decision),
      advice: assessment.advice,
      ...(assessment.escalatedToNo ? { escalatedToNo: assessment.escalatedToNo } : {}),
    });
    /*
     * `risk.report.assessed` 的收件人按条目所属的线取（《【930】》§6.2 / §9 规则 31）：
     *   · **B 线 → 报备人**；
     *   · **A 线 → 本单当前处理人**（A 线没有报备人），无处理人时落**归属组**（基线 ※19）。
     * 🔴 A 线不能再走 `reporterReceiver`：它的 `by` 恒为「系统」、解析为空，整条通知会被丢掉。
     * 这是报备五个既有事件之一，不是新增事件。
     */
    const isBLine = r.source === REPORT_SOURCE;
    const decision = normalizeDecision(assessment.decision);
    const escalate = decision === '升级';
    const tail = escalate
      ? `本单已升级为投诉工单 ${assessment.escalatedToNo ?? '待生成'}，由 ${assessment.by}（${assessment.byRole}）承接。升级说明：${asSentence(assessment.advice)}`
      : `反馈意见：${asSentence(assessment.advice)}`;
    const subject = isBLine ? '风险报备' : '风险条目';
    notifyLog.emit({
      ticketNo: r.ticketNo,
      event: 'risk.report.assessed',
      kind: 'risk',
      title: `${subject}评估结论 · ${decision}`,
      receivers: [isBLine ? reporterReceiver(r) : currentHandlerReceiver(r.ticketNo)],
      content: `${r.ticketNo} 的${subject}已完成评估，结论：${decision}。${tail}评估人：${assessment.by}（${assessment.byRole}）· ${assessment.at}。`,
    });
  }

  /**
   * **协同处理**（基线 ※29 / 《【930】》§5C）—— 池内**投诉单**这一路的结论动作，
   * 与非投诉单那一路的 `assess` 并列。
   *
   * 【为什么不复用 `assess`】`ReportAssessment` 只装得下「决策 + 一段说明」，
   * 而协同要装的是「评估意见 + 多选建议事项」，且**没有决策那一格**（投诉单已经是投诉单了，
   * 不存在升不升级这个问题）。硬塞进去就得给它编一个 decision，那个值会当场进
   * B4「今日决策」的分布 —— 凭空多出来的一格会把决策分布做坏。故另开一个动作、另开一个字段。
   *
   * 【发生什么】
   *   ① 往 `stores/riskCollab.ts` 追加一条记录（历次全留，工单页的协同记录块读它）；
   *   ② 条目上写下**最近一次**协同结论（池行要答"这条什么时候出的结论"）；
   *   ③ **首次协同把条目转「已结论」**（存储值「已评估」，界面词见 `OpRiskDecision.ts`）。
   *
   * 🔴 **只有第一次转状态**：协同不是一次性动作，同一张投诉单可以协同多次
   * （§5C：每次各落一条履历）。但"这条还没有结论"只成立到第一次协同为止 ——
   * 不转的话它会一直躺在待处理视图里，B1「待评估总数」与「超时未评」把一批
   * 已经给过意见的条目继续数着、继续标红，而池内条数正是"当前有多少风险单没人处置"这个数本身。
   * 第二次之后条目已经在「已评估」，本函数只追加记录、不再动状态。
   *
   * 【为什么顺手补 `assignee`】「已结论」的行要答得上"谁给的结论"。协同不必先领取
   * （投诉单那一路没有领取这一步，按钮直接出在工单页底栏），没人认领时承办人一栏会是空的。
   * 已经有人认领的**不覆盖**——那是别人手上的活，协同的人不该把它记到自己名下。
   *
   * 🔴 **工单状态、处理人、风险等级一格不动**（§5C.3「不发生的」），本函数不碰工单侧。
   * 🔴 **本轮不发通知**：`risk.coordinated` 本轮不做，见 `stores/riskCollab.ts` 文件头。
   */
  function coordinate(id: string, input: CoordinateInput): boolean {
    const r = findById(id);
    // 只有进了池的条目谈得上协同：还在实时监控（没打标）与已标记无风险的都不在池里
    if (!r || !isPooledStatus(r.status)) return false;

    collabStore.record({
      ticketNo: r.ticketNo,
      opinion: input.opinion,
      advices: [...input.advices],
      ...(input.otherAdvice ? { otherAdvice: input.otherAdvice } : {}),
      by: input.by,
      byRole: input.byRole,
      at: input.at,
    });
    r.coordination = {
      opinion: input.opinion,
      advices: [...input.advices],
      ...(input.otherAdvice ? { otherAdvice: input.otherAdvice } : {}),
      by: input.by,
      byRole: input.byRole,
      at: input.at,
    };
    /*
     * 落《【720】》第八类履历 ③「协同处理」（《【930】》§6.3）：
     * 「〈客诉专员〉 提交协同处理 · 〈建议事项，逗号分隔〉」，正文摘要挂**评估意见全文**
     * （§4.4「不搬正文」的唯一例外 —— 评估意见本身就是协同处理的结论）。
     *
     * 🔴 **每次协同各落一条**（§5C.1 次数行）：同一张投诉单可多次协同，第二次之后
     * 条目已在「已评估」、状态不再变，但履历必须继续增长。
     * 🔴 **本轮不发通知**：两个副作用 ＝ 落履历 + 挂建议标记（§5C.3 / 附录 A R65a），
     * 工单「通知记录」Tab 连提两次仍应为零新增。
     */
    history.recordRiskHistory({
      kind: 'collab',
      ticketNo: r.ticketNo,
      by: input.by,
      byRole: input.byRole,
      at: input.at,
      advices: [...input.advices],
      ...(input.otherAdvice ? { otherAdvice: input.otherAdvice } : {}),
      opinion: input.opinion,
    });
    if (isOpen(r)) {
      r.status = '已评估';
      if (!r.assignee) r.assignee = input.by;
    }
    return true;
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

  /* ---------------- 种子结论回填第八类履历 ---------------- */

  /**
   * **把预置数据里那批"已经有结论"的条目补进第八类履历**。
   *
   * 【为什么需要它】`recordRiskHistory` 挂在四个动作上，而种子里那 12 条已打标条目、
   * 4 条已出评估结论 / 协同结论的条目、以及 B 线那几条已提交的报备，**从来没走过那四个动作**
   * —— 它们是数据源直接给的。不回填的话，评审时随手点开一张种子高危单，
   * 页头挂着「风险打标 高危 · 郑监控」，履历第八类却是「暂无」，看上去就是这条链又断了。
   *
   * 🔴 **id 固定、重复调用是无操作**（见 `riskHistory.backfill`）：本函数会被
   * 每一次履历投影调到，且刷新后缓存里已经有那批记录，靠固定 id 认。
   *
   * ⚠️ **只回填得出结论的那几件，不造第五件的假账**：种子条目的「风险等级变更」按
   * "从未定级 → 本条目打标等级"落一条 —— 种子里一张单至多一条 A 线条目，故它就是工单级等级。
   * 真出现一单多条目时这一条会偏，但那只可能由**现场打标**产生，而现场打标走的是
   * `recordTag` 里那段按 `ticketGradeOf` 前后比对的正路，不经过本函数。
   */
  function backfillSeedRiskHistory() {
    for (const r of reportStore.reports) {
      history.backfill({
        kind: 'report',
        ticketNo: r.ticketNo,
        by: r.by,
        byRole: r.byRole,
        at: r.at,
        reason: r.reason,
        category: r.category,
      }, `seed-report-${r.id}`);
      if (r.assessment) {
        history.backfill({
          kind: 'assess',
          ticketNo: r.ticketNo,
          by: r.assessment.by,
          byRole: r.assessment.byRole,
          at: r.assessment.at,
          decision: normalizeDecision(r.assessment.decision),
          advice: r.assessment.advice,
          ...(r.assessment.escalatedToNo ? { escalatedToNo: r.assessment.escalatedToNo } : {}),
        }, `seed-assess-${r.id}`);
      }
    }
    for (const e of queue.entries) {
      if (e.tag) {
        history.backfill({
          kind: 'tag',
          ticketNo: e.ticketNo,
          by: e.tag.by,
          byRole: e.tag.byRole,
          at: e.tag.at,
          result: e.tag.result,
          note: e.tag.note,
        }, `seed-tag-${e.id}`);
        if (isPoolLevel(e.tag.result)) {
          history.backfill({
            kind: 'grade',
            ticketNo: e.ticketNo,
            by: e.tag.by,
            byRole: e.tag.byRole,
            at: e.tag.at,
            from: null,
            to: e.tag.result,
            source: '核实结论回传',
          }, `seed-grade-${e.id}`);
        }
      }
      if (e.assessment) {
        history.backfill({
          kind: 'assess',
          ticketNo: e.ticketNo,
          by: e.assessment.by,
          byRole: e.assessment.byRole,
          at: e.assessment.at,
          decision: normalizeDecision(e.assessment.decision),
          advice: e.assessment.advice,
          ...(e.assessment.escalatedToNo ? { escalatedToNo: e.assessment.escalatedToNo } : {}),
        }, `seed-assess-${e.id}`);
      }
      if (e.coordination) {
        history.backfill({
          kind: 'collab',
          ticketNo: e.ticketNo,
          by: e.coordination.by,
          byRole: e.coordination.byRole,
          at: e.coordination.at,
          advices: [...e.coordination.advices],
          ...(e.coordination.otherAdvice ? { otherAdvice: e.coordination.otherAdvice } : {}),
          opinion: e.coordination.opinion,
        }, `seed-collab-${e.id}`);
      }
    }
  }

  /* ---------------- 转交给两条线自己的动作与读口 ---------------- */

  /**
   * 二线报备提交（B 线）。同单在队门控由 `riskReports.canSubmitFor` 收，
   * **只看 B 线**——A 线进池的条目不是报备，不占"同单至多一条在队"的名额（※29）。
   */
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
  /**
   * 按 id 取 **A 线条目本体**（不是池行）。
   * 【为什么不复用上面的 `findById`】那一个返回的是两条线的并集形状 `RiskPoolItem`，
   * 上面**没有 `tag`** 的完整类型信息（`tag` 在并集里是可选字段，B 线恒空）。
   * 打标弹窗要读现行结论、要判首次还是二次修改，拿到的必须是 A 线自己的模型；
   * 池行喂进去的话，B 线的报备单也能被送进一个它根本不走的打标流程。
   */
  function queueEntryOf(entryId: string) {
    return queue.findById(entryId);
  }
  /**
   * 按工单号打标（打标弹窗从命中侧 / 工单页点开，手上只有单号）。
   * 本单没进过实时监控时会**按三类判据现补一条条目**，见 `riskQueue.ensureEntryFor`。
   */
  function recordTagFor(ticketNo: string, input: RiskTagInput) {
    return queue.recordTagFor(ticketNo, input);
  }
  /** 拿到一条可打标的条目（没有就按三类判据现补），见 `riskQueue.ensureEntryFor` */
  function ensureEntryFor(ticketNo: string) {
    return queue.ensureEntryFor(ticketNo);
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

  /*
   * 🔴 **开屏灌一遍，且**只在本 store 初始化时灌这一次**。
   *
   * 【为什么不放在工单页的履历投影里】投影跑在"记录条数变了"的 watcher 上，
   * 回填又会往里加记录 —— 回填放进去就是让一个 watcher 改自己监听的东西。
   * 靠去重能收敛，但那是拿去重当刹车用；放在 store 初始化里，回填与投影
   * 一个只写、一个只读，先后关系是确定的。
   *
   * 两个页面都要它：风险监控页与工单处理页都读本 store（评估 / 协同 / 打标转发口都在这里），
   * 故任一页打开时这一遍必然跑过。
   */
  backfillSeedRiskHistory();

  return {
    /**
     * ⚠️ 别名：池内全部条目。`reports` 这个名字是拆分前留下的
     * （「升级」派生新单号时要在两条线已用过的号里取最大值 +1，扫的就是这一份）。
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
    claim,
    release,
    assess,
    coordinate,
    backfillSeedRiskHistory,
    submit,
    withdraw,
    recordVerify,
    recordTag,
    recordTagFor,
    ensureEntryFor,
    queueEntryOf,
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
