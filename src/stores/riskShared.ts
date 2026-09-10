import { ref, type Ref } from 'vue';
import type { RiskLevel } from '@/config/risk';

/**
 * 风险两条线的**公共底座**（《【930】风险报备 · 监控 · 管控 PRD》）。
 *
 * 【为什么单开一个模块】风险侧现在是两条互不交汇的线：
 *   · **A 线**（`stores/riskQueue.ts`）自动识别 → 实时监控 → 打标 → 风险工单池；
 *   · **B 线**（`stores/riskReports.ts`）二线专员在非投诉单发起风险报备 → 报备池。
 * 两条线各有各的数据与动作，但**评估时限、评估决策、三态、等待时长口径、走字的钟**
 * 是同一套 —— 抄两份的下场是改口径时只改一处，两条线当场给出两个数，
 * 而「超时未评」「今日决策」恰恰是要并排看的指标。
 *
 * 🔴 本模块**只放两线共用的东西**：任何只有一条线用得上的常量 / 字段，都该待在那条线自己的
 * store 里。放进来会让"这是谁的东西"重新变糊，而这正是本轮拆分要消掉的那种糊。
 */

/**
 * 报备评估时限（分钟）。**不是 SLA**：不接 SLA 引擎、不走工作日历、不适用停表规则
 * （§9 规则 13）。这一个值同时供三处读：《【815】》的催办规则触发条件、
 * 风险评估页签「超时未评」卡的标红阈值（§9 规则 14），与两条线的超时判定。
 */
export const REPORT_ASSESS_LIMIT_MIN = 120;

/**
 * **评估决策二选一 ＝ 升级 / 不升级**（业务第三轮拍板）。
 *
 * 🔴 **旧词「接管」整个作废**。它同时背着三个互不相同的意思，谁读都得先猜是哪一个：
 *   ① 风险评估判定这条要转投诉单（本枚举答的就是这一件事）；
 *   ② 基线 ※27 的「工单管控」——把单子拿到客诉专员名下办；
 *   ③ 《【830】》里"原单被新单接管"的那条既有表述（接管横幅 / 已被新单接管）。
 * 三义共用一个词，界面上「接管」两个字既可能指派生新单、也可能指本单换人，
 * 而这两件事对原单的处理人来说结果完全相反。改叫「升级」之后，本枚举只答一件事：
 * **这条风险要不要走升投诉**；②仍叫「工单管控」，③是 830 的原话、**一字不动**。
 *
 * ⚠️ **「升级」在这里只指转投诉单**（走 830 第一跳派生），**不含升三线**——
 * 升三线是工单侧的技术升级，与风险侧升不升投诉是两条路。
 *
 * 【为什么顺序是「升级 / 不升级」】业务表述一贯先说升级：这一排在界面上是决策单选，
 * 把要动手的那一档摆在前面，读的人先看到"要不要升"，而不是先看到一个否定式。
 */
export const ASSESS_DECISIONS = ['升级', '不升级'] as const;
export type AssessDecision = (typeof ASSESS_DECISIONS)[number];

/**
 * 旧词归一。**只为读旧数据而存在**：B 线（`stores/riskReports.ts`）的种子与它自己那份
 * localStorage 里仍躺着 `decision: '接管'`，而那个文件本轮不解冻、缓存版本也升不了。
 * 不归一的话，池子里那一条会顶着一个已经作废的词渲染出来，
 * 「今日决策」两枚 chip 又数不到它——同一条记录在两处各说各话。
 *
 * 🔴 **它是读口不是写口**：新写入的决策一律取 `ASSESS_DECISIONS` 里的值，
 * 不要反过来把 '接管' 写进任何一条新记录。B 线解冻那一批把种子改掉后，本函数即可退役。
 */
const LEGACY_DECISION: Record<string, AssessDecision> = { 接管: '升级' };
export function normalizeDecision(decision: string): AssessDecision {
  return LEGACY_DECISION[decision] ?? (decision as AssessDecision);
}

/**
 * 三态（PRD §3.1，2026-09-09 第二轮拍板 N4）：**待分派 → 评估中 → 已评估**。
 * 「已撤回」不是第四态，是**待分派的终止分支**（分派之后不能再撤）。
 *
 * 【为什么加「评估中」】做了分派就必须有它：分派把活指给了某个人，
 * 这条记录从"谁都可以拿"变成"张三正在办"。少了这一态，队列上看不出
 * 哪些已经有人在盯——而这正是分派要解决的问题本身。
 *
 * 【连带的口径变化】看板「待评估总数」＝ **待分派 + 评估中**（§7 B1），
 * 不再等于单一状态的条数。
 *
 * 【为什么两线共用】A 线的自动入池条目与 B 线的报备单走的是同一条分派 → 评估的路，
 * 状态词一旦分家，「待评估总数」就没法把两线加在一起报。
 */
export type ReportOnlyStatus = '待分派' | '评估中' | '已评估' | '已撤回';

/**
 * **A 线独有的两个态**（业务第三轮拍板 · 漏斗）。B 线的报备单永远走不到这两个值上。
 *
 * 【为什么必须新增「实时监控中」】新口径下**打标是入池门槛**：自动识别捞进来的条目
 * 先落「实时监控」等人打标，打完低/中/高才进风险工单池。旧模型里条目一进来就是「待分派」，
 * 于是"还没有人判过它有没有风险"与"已经判了、等人来评估"共用同一个词 ——
 * 队列上分不出这两批，而它们要做的事完全不同（一个要打标、一个要分派）。
 *
 * 【为什么「已标记无风险」是独立终态而不是复用「已评估」】「已评估」的含义是
 * *评估二选一给出了结论（升级 / 不升级）*，它有 `assessment`；无风险的这一批
 * **压根没进过池、没有人评过**。挤进同一个词会让「已评估」清单里冒出一批没有评估结论的行，
 * 也会让 B3「今日已评估」把它们数进去。
 *
 * 🔴 **「已撤回」不在这里**：撤回是 B 线报备人收回自己报的那一条，A 线没有报备人。
 */
export type QueueOnlyStatus = '实时监控中' | '已标记无风险';

/** A 线条目的完整状态集。「已撤回」不属于本线，见 `QueueOnlyStatus` 说明 */
export type QueueStatus = QueueOnlyStatus | '待分派' | '评估中' | '已评估';

/**
 * **风险侧状态全集** ＝ B 线四态 + A 线独有两态。`PoolStatus` 是它的同义名，
 * 用在池行（`RiskPoolItem`）与跨线判据函数上。
 *
 * ⚠️ **`ReportStatus` 这个名字是拆分前留下的，它现在装的不止 B 线**。
 * 【为什么不把它收回成 B 线四态】`stores/riskReports.ts`（B 线，本轮不动）里有两处拿它
 * 当**跨线**参数类型：`isOverdue(r: { status: ReportStatus … })` 被工单页拿一个 `RiskPoolItem`
 * 直接喂进去，`historyOf` 也是在 `RiskPoolItem[]` 上按它判。收窄它会让那两处当场报错，
 * 而修法只能是改 B 线或改 .vue —— 两者本轮都不动。
 * 真正精确的两个类型是 `ReportOnlyStatus`（B 线四态）与 `QueueStatus`（A 线五态），
 * 各条线自己的模型该用那两个；下一批 B 线解冻时把 `RiskReport.status` 换成 `ReportOnlyStatus`，
 * 这个别名即可退役。
 */
export type ReportStatus = ReportOnlyStatus | QueueOnlyStatus;
export type PoolStatus = ReportStatus;

/**
 * **在队 ＝ 待分派 + 评估中**（N4）。这是"还没有结论"的全集，
 * 看板 B1、同单在队门控、「报备中」标记三处共用它，不各判各的。
 *
 * ⚠️ **「实时监控中」不算在队**：它还没进池，没有人在等评估结论 ——
 * 把它算进来，B1「待评估总数」会把一批根本还没打标的条目数进去，
 * 而 B2「超时未评」会立刻把这批标红（评估时限压根还没起算）。
 */
export function isOpenStatus(status: PoolStatus): boolean {
  return status === '待分派' || status === '评估中';
}

/**
 * **A 线条目是否已经打标进池**（漏斗的门槛判据）。
 *
 * 进池 ＝ 打标为低 / 中 / 高之后的那三态：待分派（等人领）→ 评估中（有人在办）→ 已评估（有结论）。
 * 反过来「实时监控中」（还没打标）与「已标记无风险」（打标判无风险）**都不在池里**。
 *
 * 🔴 **只对 A 线成立**：B 线的报备单不走打标这道门，它一提交就在自己的报备池里，
 * 「已撤回」也是池里的一条历史记录。不要拿本函数去筛 B 线。
 */
export function isPooledStatus(status: PoolStatus): boolean {
  return status === '待分派' || status === '评估中' || status === '已评估';
}

export interface ReportAssessment {
  decision: AssessDecision;
  /**
   * 不升级 → 反馈意见；升级 → 升级说明。两个决策各自的必填文本，
   * 用词不同故不能共用一个「备注」——反馈意见是给报备人的处理建议，
   * 升级说明是给新单承接人的交代。
   */
  advice: string;
  /**
   * 升级派生出的**新投诉单号**（仅决策＝「升级」时有值）。
   *
   * 【为什么这里存的是单号而不是风险等级】二选一之后**没有"确认有风险 + 定级"这一档**了，
   * 评估不再产出等级、也不再往工单的风险字段回传。升级产出的是**一张新单**——
   * 走的是《【830】》已有的第一跳派生（原单落终态「已升级投诉」、整页只读 + 接管横幅、
   * 新单全量继承），**不新增动作、不新增状态**（基线 ※29）。
   *
   * ⚠️ 「接管横幅」是《【830】》对**原单被新单接管**的既有表述，与本轮作废的那个「接管」
   * 不是一回事（见 `ASSESS_DECISIONS`），故此处一字不改。
   */
  escalatedToNo?: string;
  by: string;
  byRole: string;
  at: string;
}

/**
 * **A 线的自动识别来源**（业务第三轮拍板 · 漏斗的入口）。**三类**：
 *   ① **预警词命中** —— 在界面上仍拆成「实时监控」与「手动筛查」两个展示值。
 *      它们是**同一路的两个入口**（一个由系统实时扫、一个由人拿条件去扫存量），
 *      命中之后走的是同一条链，故判据一律用 `isVerifyMonitorSource` 而不是逐个比字符串。
 *   ② **投诉单** —— 投诉类工单自动纳入监控。
 *   ③ **重要紧急** —— P0 / 已超解决时限一类的单自动纳入监控。
 *
 * 🔴 **「VIP客户」本轮砍掉**（业务明确不做）：它此前是第四类入口。旧缓存里可能还躺着
 * 来源为 VIP 的条目，靠 `isQueueSource` 在读缓存那一道拦掉，见 `stores/riskQueue.ts`。
 *
 * 🔴 **「二线报备」不在这里**：那是 B 线，不是实时监控的来源。两条线在类型上分家之后，
 * 「A 线有哪几个入口」这个问题只有一个地方回答得了它，不会再出现"枚举里有六项、
 * 实时监控只认其中四项"这种要靠读代码才知道的隐规则。
 *
 * 「系统自动判断（AI）」是业务文档自标的第六类、**规划中**，本轮不做，故不在枚举里。
 */
export const QUEUE_SOURCES = ['实时监控', '手动筛查', '投诉单', '重要紧急'] as const;
export type QueueSource = (typeof QUEUE_SOURCES)[number];

/** B 线在合并池里的来源标签，**恒一枚**。它不是 A 线的入口，故单独成一个类型 */
export const REPORT_SOURCE = '二线报备' as const;
export type ReportSource = typeof REPORT_SOURCE;

/**
 * 合并池那一列「监控来源」的取值全集 ＝ A 线三类（四个展示值）+ B 线一枚。
 *
 * ⚠️ **这是过渡层的口径**：风险工单池今天还把两条线装在一张表上，来源 chip 那一排要把
 * 五个数并排摆出来，故仍需要一个并集。下一批把两池拆开之后，A 线的页面只读 `QUEUE_SOURCES`，
 * B 线的报备池不再需要「来源」这一列，本常量随之删掉。
 *
 * ⚠️ **两个分母仍然不能相加**：命中记录数 与 报备单数 是两回事（同一张单可以报三次），
 * 合并的是"要处理的队列"，不是"统计口径"。
 */
export const MONITOR_SOURCES = [...QUEUE_SOURCES, REPORT_SOURCE] as const;
export type MonitorSource = (typeof MONITOR_SOURCES)[number];

/**
 * 预警词命中那一路（原「关键词触发」，拆为实时 + 手动筛查两个入口展示）。
 *
 * ⚠️ **它已经不再是"要不要打标"的判据**：新口径下 A 线**三类来源都要打标**才进池
 * （打标是入池门槛，见 `RiskTagRecord`）。本函数现在只回答"这条是不是预警词捞进来的"，
 * 用处是页面上要把命中原话摆出来 —— 另外两类没有原话可摆。
 */
export function isVerifyMonitorSource(source: MonitorSource): boolean {
  return source === '实时监控' || source === '手动筛查';
}

/** 旧缓存里的来源名。**VIP客户不在这里**：它是被砍掉的一类，不映射到任何新值，见 `isQueueSource` */
const LEGACY_MONITOR_SOURCE: Record<string, MonitorSource> = {
  关键词触发: '实时监控',
  全量投诉: '投诉单',
  紧急重要: '重要紧急',
};
export function normalizeMonitorSource(source: string): MonitorSource {
  return (LEGACY_MONITOR_SOURCE[source] ?? source) as MonitorSource;
}

/**
 * 归一化之后**还是不是一个合法的 A 线来源**。
 *
 * 【为什么要有它】「VIP客户」被砍掉之后，旧缓存里那些条目归一化完仍然是 `'VIP客户'` ——
 * 一个已经不在枚举里的字符串。让它读进来，来源筛选那一排会出现一个点不亮的幽灵值，
 * 而按来源分组的统计会多出一档没有 chip 的数。缓存版本号已经升过一道，
 * 本函数是第二道：**版本号拦的是格式，它拦的是值**。
 */
export function isQueueSource(source: string): source is QueueSource {
  return (QUEUE_SOURCES as readonly string[]).includes(source);
}

/* ---------------- 风险打标（A 线的入池门槛） ---------------- */

/**
 * **打标结论四档 ＝ 三档风险等级 + 无风险**（业务第三轮拍板）。
 *
 * 【为什么「无风险」要和等级摆在同一个枚举里】它们是**同一个问题的四个答案**：
 * "这条到底有没有风险、有多大"。分成两个字段（有无风险 + 等级）会立刻长出
 * "无风险却带着等级""有风险却没有等级"两种非法组合，而这两种组合恰恰决定条目进不进池。
 * 一个枚举把非法组合从类型上消掉。
 */
export const RISK_TAG_RESULTS = ['高', '中', '低', '无风险'] as const;
export type RiskTagResult = (typeof RISK_TAG_RESULTS)[number];

/** 无风险这一档的字面量，判据里少写一次裸字符串 */
export const NO_RISK: Extract<RiskTagResult, '无风险'> = '无风险';

/**
 * **这个打标结论进不进池**。漏斗的那道门就是这一行：低 / 中 / 高进，无风险不进。
 * 收成一个函数是因为它同时供三处读（状态机迁移、三视图口径、池子取数），
 * 各判各的话，改口径时改一处、另两处当场给出不同的池内条数。
 */
export function isPoolLevel(result: RiskTagResult): result is RiskLevel {
  return result !== NO_RISK;
}

/**
 * 条目上**现行**的打标结论（历史另存，见 `stores/riskTags.ts` 的 `appendEntry` / `historyOf`）。
 *
 * 【为什么条目上要留一份现行值而历史却在别处】两者的生命周期不同：
 * 现行值是**状态机的判据**，要跟着条目一起进 localStorage（换角色演示时不能丢）；
 * 历史是留痕，纯内存、刷新即回到种子（`riskTags.ts` 自陈的局限）。
 * 把历史也塞进条目会让每次改标都整份重写缓存，把留痕拖进持久化的一致性问题里。
 *
 * 🔴 **`result` 是唯一判据**：不要再从 `ReportVerify.verdict`（成立 / 误报）推"有没有风险"，
 * 那答的是"这次命中准不准"，是另一个问题，见 `ReportVerify` 上的说明。
 */
export interface RiskTagRecord {
  result: RiskTagResult;
  note: string;
  by: string;
  byRole: string;
  at: string;
  /** 本次修正的理由。**首次打标没有这一项**，二次修改必填 */
  amendReason?: string;
}

/**
 * ⚠️ **旧字段 · 已停止作为判据使用**（业务第三轮拍板）。
 *
 * 它是 915 命中核实的结论形状：`verdict` 答的是"**这次命中准不准**"（成立 / 误报），
 * 判的是词表规则的准确率。新口径的入池门槛答的是"**这条有没有风险、多大**"
 * （低 / 中 / 高 / 无风险，见 `RiskTagRecord`）—— 两者形态相近但问的不是同一件事：
 * 「误报」是规则捞错了，「无风险」是人看过之后判定没风险，把前者当后者用，
 * 词表准确率与风险分布两个数会互相污染。
 *
 * 【为什么留着不删】① 命中侧（`stores/riskTags.ts`）仍然要判成立 / 误报，那一套一字不改；
 * ② 池子里的条目此刻仍带一份**由 `RiskTagRecord` 派生的只读投影**，供过渡期的页面读
 * （见 `stores/riskQueue.ts` 的 `recordTag`）。下一批页面改完即删。
 */
export interface ReportVerify {
  /**
   * ⚠️ **可空**：`RiskTagEntry.verdict` 已随第三轮拍板收成可选（漏斗打标不判命中准不准），
   * 而命中侧把那份记录整条转成本形状传进 `recordVerify`。适配器把"没有 verdict"
   * 与"有等级"一并按等级处理，见 `stores/riskQueue.ts` 的 `recordVerify`。
   */
  verdict?: '成立' | '误报';
  /** 误报没有等级 */
  level: RiskLevel | null;
  note: string;
  by: string;
  byRole: string;
  at: string;
}

/**
 * **一次协同处理的结论**（基线 ※29 / 《【930】》§5C）—— 客诉专员对池内**投诉单**给的意见。
 *
 * 【为什么它不是 `ReportAssessment`】评估答的是"升不升级"（二选一 + 一段说明），
 * 协同答的是"这单接下来怎么办"（一段评估意见 + 多选建议事项），**没有决策那一格**。
 * 硬塞进 `ReportAssessment` 就得给它编一个 `decision`，而那个值会当场进 B4「今日决策」的分布 ——
 * 协同处理压根没有升不升级这回事，凭空多出来的一格会把决策分布做坏。
 *
 * 🔴 **条目上只留最近一次**：历次协同的全量在 `stores/riskCollab.ts`（同一张单可协同多次）。
 * 条目上这一份回答的是池行自己的两个问题——"这条什么时候出的结论""谁给的"，
 * 不复制历史；要看历次意见去协同记录块。
 */
export interface RiskCoordination {
  /** 评估意见（必填） */
  opinion: string;
  /**
   * 建议事项（多选）。
   * 🔴 类型放宽成 `string[]` 的理由同 `RiskPoolItem.reason` / `category`：枚举
   * （`RISK_ADVICE_ITEMS`）只对协同这一件事成立，它住在 `stores/riskCollab.ts`。
   * 把它提到共享层，等于宣称两条线的池行都有建议事项这一维，而 B 线根本没有协同这个动作。
   */
  advices: string[];
  /** 勾了「其他」时的具体建议 */
  otherAdvice?: string;
  by: string;
  byRole: string;
  at: string;
}

/**
 * **风险工单池的行**（930 §5，第二轮拍板 N6）—— 两条线在池子里合并之后的**共同形状**。
 *
 * 【为什么需要这么一个类型】风险工单池这张表装的是两条线的条目：A 线**打标进池**的条目
 * （`stores/riskQueue.ts` 的 `RiskQueueEntry`）与 B 线的报备单（`stores/riskReports.ts`
 * 的 `RiskReport`）。表头有「报备人 / 报备原因 / 风险类型」这几列，A 线的条目在这几格里
 * 显示的是**恒定占位**（系统 / 其他 / —），不是真数据 —— 但列在那儿，行就得答得上。
 * 故两条线的模型都**结构上满足**本接口，池子直接把两个数组接起来即可，
 * 不必逐条复制成第三种对象（复制会让分派 / 评估改到副本上，改完页面纹丝不动）。
 *
 * 🔴 `reason` / `category` 在这里放宽成 `string` 是**有意的**：报备原因与风险类型的枚举
 * 只对 B 线成立（见 `stores/riskReports.ts` 的 `REPORT_REASONS` / `RISK_CATEGORIES`），
 * 把枚举提到共享层等于宣称 A 线也有这几档可选，而 A 线**根本没有人来填这两个字段**。
 */
export interface RiskPoolItem {
  id: string;
  ticketNo: string;
  /** 监控来源。A 线是入池维度，B 线恒为「二线报备」 */
  source: MonitorSource;
  /**
   * 承办人（客诉专员姓名）。空 ＝ 还没有人领。
   * 🔴 **只由「领取」写入**：分派 / 改派 / 批量分派整套已取消（业务第三轮拍板），
   * 池里谁有空谁领，见 `stores/riskPool.ts` 的 `claim`。
   */
  assignee?: string;
  /** 报备原因。**A 线恒为「其他」的占位**，不是真数据 */
  reason: string;
  /** 风险类型。仅 B 线 reason ＝「风险场景」时有值（§9 规则 10）；**A 线恒 null** */
  category: string | null;
  desc: string;
  /** **A 线恒为空数组**：没有人来传附件 */
  attachments: string[];
  /** **A 线恒为「系统」**，通知侧据此解析为"无人可通知"（O23） */
  by: string;
  byRole: string;
  /** 提交 / 入池时刻。等待时长从这里起算，**不从任何"分派时刻"**（N5） */
  at: string;
  /**
   * **并集类型**（见 `PoolStatus`）：B 线四态 + A 线独有的「实时监控中 / 已标记无风险」。
   * ⚠️ 池子里**看不到**那两个 A 线独有值 —— 带着它们的条目按定义就没进池
   * （`stores/riskPool.ts` 的取数只收 `isPooledStatus`）。类型装得下它们，
   * 是因为工单页的读口（`riskReports.reportsOf`）要把本单**全部** A 线条目列出来。
   */
  status: PoolStatus;
  assessment?: ReportAssessment;
  /**
   * 最近一次**协同处理**的结论（**A 线的投诉单才有**）。B 线恒为空——报备只走评估。
   *
   * 【它与 `assessment` 互斥】同一张单只可能走其中一条：非投诉单走评估（升级 / 不升级），
   * 投诉单走协同（评估意见 + 建议事项），按原单类型分岔（基线 ※29）。
   * 故「已评估」这一态下，两个字段必有且只有一个有值。
   */
  coordination?: RiskCoordination;
  /**
   * 风险打标结论（**A 线才有**）。它是这条条目进池的凭据 —— 池里的每一条 A 线条目
   * 都必然有一个低 / 中 / 高的 `tag`，没有 `tag` 的还在实时监控里。B 线恒为空。
   */
  tag?: RiskTagRecord;
  /** ⚠️ 旧字段，由 `tag` 派生的只读投影，见 `ReportVerify` 上的说明。下一批页面改完即删 */
  verify?: ReportVerify;
  /** 仅 status ＝「已撤回」时有值。**只有 B 线会撤回** */
  withdrawReason?: string;
}

/* ---------------- 走字的钟（两线共用一根） ---------------- */

export interface RiskClock {
  nowTick: Ref<number>;
  waitedMinutes(at: string): number;
  isOverdueAt(at: string): boolean;
}

let sharedClock: RiskClock | null = null;

/**
 * 走字的"当前时刻"。等待时长 / 超时判定 / 超时计数**一律读它**，不直接读 `Date.now()`。
 *
 * 【为什么要有它】`Date.now()` 不是响应式的：屏幕上的「已等待 47 分钟」只在
 * 切页签或别的数据变动触发重渲染时才更新，人盯着队列看，数字十几分钟不动，
 * 看着就像功能坏了 —— 而「超时未评」正是本册的核心口径之一（§7 B2）。
 *
 * 【为什么是 60 秒】等待时长的**展示粒度就是分钟**：更密（如 1s）改的是同一个数字，
 * 白白重算整张队列；更疏（如 5min）会出现"已经过了一分钟、屏上还是旧数"的空窗，
 * 反倒坐实了"是不是卡住了"的怀疑。刻度多久跳一次，钟就多久走一格。
 *
 * 🔴 **两条线必须共用同一根钟，不能各建一个 interval**：两个定时器的相位天生错开，
 * 同一条报备在工单页横幅与队列表里会在几十秒的窗口里显示成两个分钟数，
 * 而「已等待多久」是催办与超时判定的唯一依据。故这里做成模块级单例：
 * 第一次被用到时建一次、此后共用。
 *
 * 【为什么建了不清】它与应用同生命周期。store 不是组件、没有卸载时机；
 * 应用没了它自然一起没了。
 */
export function useRiskClock(): RiskClock {
  if (sharedClock) return sharedClock;
  const nowTick = ref(Date.now());
  setInterval(() => {
    nowTick.value = Date.now();
  }, 60_000);

  /**
   * 等待时长（分钟）＝ 当前时刻 − **提交 / 入池时刻**。
   * 🔴 **不从分派时刻起算**（N5，第二轮拍板里唯一没变的一条）：
   * 对报备人而言"我等了多久"与内部何时分派无关；**分派慢的压力应当落在督导身上**，
   * 从分派起算等于把这段空悬时间从账上抹掉。
   *
   * ⚠️ **方案 C 的连带**：关键词条目核实成立后退回队列，等待时长**仍从入池那一刻起算**，
   * 不从打标时刻。若那条命中在池子里已经躺过 2 小时才被核实，它一退回来就是超时态。
   * 这是 N5 的直接推论而不是缺陷：核实慢也是这条队列在拖，钟不该因为换了个环节就重置。
   */
  function waitedMinutes(at: string): number {
    const t = new Date(at.replace(/-/g, '/')).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.max(0, Math.floor((nowTick.value - t) / 60000));
  }

  /** 单看时刻的超时判定。**在不在队由调用方另判**——出了队的不叫超时未评 */
  function isOverdueAt(at: string): boolean {
    return waitedMinutes(at) > REPORT_ASSESS_LIMIT_MIN;
  }

  sharedClock = { nowTick, waitedMinutes, isOverdueAt };
  return sharedClock;
}

/* ---------------- 时刻工具 ---------------- */

/**
 * 预置数据的时刻一律**相对当前时间**生成，不写死日期。
 *
 * 【为什么】写死的话，① 换一天打开，「今日已评估」与「已评估默认只看今日」这两个
 * 按自然日切的口径就恒为 0，看不到已评估的样子；② 更糟的是写死的时刻可能**晚于当前**，
 * 等待时长被 `Math.max(0, …)` 夹成"已等待 0 分钟"，看着像功能坏了。
 * 相对生成后，任何一天打开都是同一副样子。
 */
export function agoStamp(minutesAgo: number): string {
  const d = new Date(Date.now() - minutesAgo * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 今天（自然日 00:00 起）。字符串前缀比对，避免再造一次时区换算 */
export function todayPrefix(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * `todayStamp()` 允许回溯的最大跨度（分钟）。**种子里传给 `todayStamp` 的分钟数不得超过它** ——
 * 超过的那几条会被下面的兜底一起夹到零点上，全批的先后就在那一档糊成一团。
 * 现值 360（6 小时）覆盖本册两条线里最早的一条（A 线 `rq-s16` 的进队 330 分钟）。
 */
export const TODAY_SPAN_MIN = 360;

/**
 * 种子里"**今天之内**"的相对时刻 —— `agoStamp()` 的不跨零点版本。
 *
 * 【为什么必须有它】`agoStamp()` 只保证"不写死日期"，**不保证落在今天**：
 * 种子里的评估时刻是「170 分钟前」，凌晨 00:18 打开页面时它落在**昨天 21:28**。
 * 于是页头「今日已结论 / 今日打标」以及「已结论·仅今日」这一整排按自然日切的口径
 * **在每天 00:00–06:00 这段里全部归零** —— 与写死日历日是同一个病，只是每天只发作几小时，
 * 于是更难查：白天怎么看都是对的。
 *
 * 【怎么修的】整批**按同一个系数压进"今天已过的这一段"**，这与 `mock/opsReport.ts` 的
 * `anchorHitDates()`（整批同量平移）是同一个思路的两种形态：
 *   · 系数 `factor = min(1, 今天已过的分钟 / TODAY_SPAN_MIN)` 对**全批相同**，
 *     故任意两条的先后与相对间隔全部保持原样，只是整条时间轴被等比压短；
 *   · `factor` 在**今天已过满 6 小时之后恒为 1**，此时 `todayStamp ≡ agoStamp`，
 *     一字不差 —— 本函数只在凌晨那几个小时里起作用，白天的演示形态完全不变。
 *
 * 🔴 **不要拿它生成"进队时刻"里那几条要演示超时的**：等待时长与超时判定按真实分钟数算
 * （`useRiskClock`），压过之后凌晨那几条就不再超时，「超时未评」当场掉档。
 * 进队时刻用 `agoStamp`、结论 / 打标时刻用 `todayStamp`，两者各管各的口径，见 A 线种子。
 */
export function todayStamp(minutesAgo: number, span = TODAY_SPAN_MIN): string {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const elapsed = (Date.now() - midnight.getTime()) / 60000;
  const factor = Math.min(1, elapsed / span);
  // 兜底夹一道：`minutesAgo` 万一超过 span，等比之后仍可能越过零点
  return agoStamp(Math.min(minutesAgo * factor, elapsed));
}

/* ---------------- 通知收件人 / 文案的公共解析（O22 / O23） ---------------- */

/**
 * 投诉督导。**按角色而不是按人**：分派职责挂在岗位上，谁在岗谁收，
 * 不能写死某个人名 —— 他休假那天这条队列就没人管了。
 */
export const RISK_SUPERVISOR = '投诉督导';

/**
 * 承办人 ＝ 条目当前的评估人。**未分派时解析为空**，由 O23 的类型级规则跳过这一类。
 * 这不是异常，是待分派态的常态。
 */
export function assigneeReceiver(r: { assignee?: string }): string {
  return r.assignee ? `${r.assignee}(客诉专员)` : '';
}

/**
 * 报备人。A 线自动入池的条目 `by` 恒为「系统」——**没有人可通知**，解析为空、
 * 这一类跳过，而不是给一个叫「系统」的收件人发一封没人看的信。
 */
export function reporterReceiver(r: { by: string; byRole: string }): string {
  return r.byRole === '系统' || r.by === '系统' ? '' : `${r.by}(${r.byRole})`;
}

/** 报备原因一行，通知正文里用来交代"为什么报"，省得收件人先点进单子才知道是什么事 */
export function reasonLine(r: { reason: string; category: string | null }): string {
  return r.category ? `${r.reason} · ${r.category}` : r.reason;
}

/**
 * 把人填的自由文本（撤回原因 / 反馈意见）接进正文时补一个句号。
 * 填的人有的带句号有的不带，不收这一道，正文里会出现「原因：已恢复 该条报备…」这种粘连句。
 */
export function asSentence(text: string): string {
  const t = text.trim();
  if (!t) return '';
  return /[。！？.!?]$/.test(t) ? t : `${t}。`;
}

/* ---------------- localStorage（两线各存各的，机制共用一套） ---------------- */

/**
 * 🔴 **缓存有保质期**：种子的提交时刻由 `agoStamp()` 按"打开页面那一刻"倒推生成，
 * 落进 localStorage 之后就固化成绝对时刻。隔一夜再打开，这批种子的等待时长
 * 会累积成十几个小时，**整队全部判超时**——满屏红，超时未评的数等于在队总数，
 * 这个指标就再也演示不出"有的超时、有的没超"的差别了。
 * 因此超过保质期直接丢弃缓存回到种子；保质期内（同一场演示）照常续用。
 *
 * ⚠️ 与 `stores/notifyLog.ts` / `stores/derivedTickets.ts` 的保质期**必须一致**：
 * 那两处的每条记录都是某条报备 / 某次评估的产物，条目回到种子、产物却留着的话，
 * 工单页会挂着一批指向已不存在的条目的通知与派生单。
 */
export const RISK_STALE_MS = 12 * 60 * 60 * 1000;

/**
 * 读缓存。**版本对不上一律丢弃**：本轮把原先一份合流的 `flowos-risk-reports`
 * 拆成了两条线各一份，旧格式那份里同时躺着两条线的条目 ——
 * 不按版本拦一道，B 线会把 A 线的条目一并读进自己的数组，
 * 而 A 线自己的种子照常生成，同一条目在池子里出现两遍。
 */
export function readRiskCache<T extends object>(key: string, version: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as T & { v?: number; savedAt?: number };
    const fresh = saved?.v === version
      && typeof saved.savedAt === 'number'
      && Date.now() - saved.savedAt < RISK_STALE_MS;
    if (fresh) return saved;
    // 过期或来自旧版本：清掉，免得下次又读到同一份陈数据
    localStorage.removeItem(key);
    return null;
  } catch {
    /* 解析失败就用种子，不让一份坏缓存把页面打空 */
    return null;
  }
}

/**
 * 一批时刻里**最新的那一个**。空串（没有值）一律当最早处理，不参与比较。
 * 时刻格式统一为 `YYYY-MM-DD HH:mm`，故字典序即时间序。
 */
export function newestStampOf(stamps: (string | undefined)[]): string {
  return stamps.reduce<string>((max, s) => (s && s > max ? s : max), '');
}

/**
 * 读缓存 · **隔夜即作废**版。除版本与保质期外，再拦两道：
 *
 *   ① `seedDay` —— 这份数据里的时刻是**哪一天生成**的（写入方自己记，见下方两条线的 store）。
 *   ② `newestOf(saved)` —— 缓存里**最新的一条**落不落在今天。
 *
 * 【为什么非加不可】种子的时刻由 `agoStamp` / `todayStamp` 按"打开页面那一刻"倒推，
 * 一落进 localStorage 就固化成绝对时刻。隔一夜再打开，整份数据全部落到昨天，
 * 「今日新增 / 今日打标 / 今日已结论」与「已结论·仅今日」当场归零 ——
 * **与写死日历日是同一个病，只是晚一天发作**。原有的 12 小时保质期拦不住它：
 * 昨晚 22:00 演示、今早 09:00 再开，只过了 11 小时，缓存判"新鲜"照常续用。
 *
 * 【为什么两道判据都要】
 *   · 只判 `seedDay` 漏一种：跨零点的那一次写入会把昨天生成的数据标成今天
 *     （23:58 打开、00:03 动了一下 → 写进去的 `seedDay` 若取写入时刻就成了今天）。
 *     故 `seedDay` 由 store 记住"本份数据生成于哪一天"并原样带下去，**不随写入时刻走**；
 *     这一道之外再看一眼数据本身，是双保险。
 *   · 只判"最新一条是不是今天"漏另一种：两条线的 `at` 都可能整批落在昨天
 *     （凌晨打开时进队时刻本就该在昨天），故 `newestOf` 由调用方决定取哪些字段 ——
 *     取的是**保证落在今天的那一类**（`todayStamp` 生成的打标 / 结论时刻）。
 *
 * 判不过就整份丢弃、回到种子重建，而不是留着一份读数全为 0 的旧快照。
 */
export function readDailyRiskCache<T extends object>(
  key: string,
  version: number,
  newestOf: (saved: T) => string,
): (T & { seedDay?: string }) | null {
  const saved = readRiskCache<T & { seedDay?: string }>(key, version);
  if (!saved) return null;
  const today = todayPrefix();
  if (saved.seedDay === today && newestOf(saved).startsWith(today)) return saved;
  try { localStorage.removeItem(key); } catch { /* ignore */ }
  return null;
}

/** 写缓存。存的是**整份数据**而不是增量：量级只有几十条，整存整取比对账简单 */
export function writeRiskCache(key: string, version: number, payload: object): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...payload, v: version, savedAt: Date.now() }));
  } catch {
    /* 配额超限等忽略 */
  }
}
