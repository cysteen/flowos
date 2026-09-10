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

/** 评估决策二选一（业务文档）。原型按「不升级 / 接管」呈现 */
export const ASSESS_DECISIONS = ['不升级', '接管'] as const;
export type AssessDecision = (typeof ASSESS_DECISIONS)[number];

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
export type ReportStatus = '待分派' | '评估中' | '已评估' | '已撤回';

/**
 * **在队 ＝ 待分派 + 评估中**（N4）。这是"还没有结论"的全集，
 * 看板 B1、同单在队门控、「报备中」标记三处共用它，不各判各的。
 */
export function isOpenStatus(status: ReportStatus): boolean {
  return status === '待分派' || status === '评估中';
}

export interface ReportAssessment {
  decision: AssessDecision;
  /**
   * 不升级 → 反馈意见；接管 → 接管说明。两个决策各自的必填文本，
   * 用词不同故不能共用一个「备注」——反馈意见是给报备人的处理建议，
   * 接管说明是给新单承接人的交代。
   */
  advice: string;
  /**
   * 接管派生出的**新投诉单号**（仅决策＝「接管」时有值）。
   *
   * 【为什么这里存的是单号而不是风险等级】二选一之后**没有"确认有风险 + 定级"这一档**了，
   * 评估不再产出等级、也不再往工单的风险字段回传。接管产出的是**一张新单**——
   * 走的是《【830】》已有的第一跳派生（原单落终态「已升级投诉」、整页只读 + 接管横幅、
   * 新单全量继承），**不新增动作、不新增状态**（基线 ※29）。
   */
  escalatedToNo?: string;
  by: string;
  byRole: string;
  at: string;
}

/**
 * 监控来源（930 §5，业务文档「监控维度」）。**五类合一个队列**，列表按此列筛选排序。
 *
 * 【为什么放在共享层而不是 A 线里】这一列**横跨两条线**：前五类是 A 线的入池维度，
 * 「二线报备」是 B 线在合并池里的来源标签。风险工单池的来源 chip 那一排要把六个数并排摆出来，
 * 枚举跟着任一条线走，另一条线的那一枚就得再抄一份。
 *
 * ⚠️ **两个分母仍然不能相加**：命中记录数 与 报备单数 是两回事（同一张单可以报三次），
 * 合并的是"要处理的队列"，不是"统计口径"。
 *
 * 「系统自动判断（AI）」是业务文档自标的第六类、**规划中**，本轮不做，故不在枚举里。
 */
export const MONITOR_SOURCES = ['实时监控', '手动筛查', '投诉单', '重要紧急', 'VIP客户', '二线报备'] as const;
export type MonitorSource = (typeof MONITOR_SOURCES)[number];

/** 走 915 核实打标的一路（原「关键词触发」，拆为实时 + 手动筛查两个来源展示） */
export function isVerifyMonitorSource(source: MonitorSource): boolean {
  return source === '实时监控' || source === '手动筛查';
}

const LEGACY_MONITOR_SOURCE: Record<string, MonitorSource> = {
  关键词触发: '实时监控',
  全量投诉: '投诉单',
  紧急重要: '重要紧急',
};
export function normalizeMonitorSource(source: string): MonitorSource {
  return (LEGACY_MONITOR_SOURCE[source] ?? source) as MonitorSource;
}

/**
 * 「关键词触发」条目的核实结论。字段与 915 打标弹窗逐一对应。
 *
 * 【为什么在共享层】结论本身只挂 A 线条目（`stores/riskQueue.ts`），
 * 但风险工单池「已评估」那张表要同屏渲染两路结论（O16），行类型得同时装得下它。
 */
export interface ReportVerify {
  verdict: '成立' | '误报';
  /** 误报没有等级 */
  level: RiskLevel | null;
  note: string;
  by: string;
  byRole: string;
  at: string;
}

/**
 * **风险工单池的行**（930 §5，第二轮拍板 N6）—— 两条线在池子里合并之后的**共同形状**。
 *
 * 【为什么需要这么一个类型】风险工单池这张表装的是两条线的条目：A 线自动入池的五类来源
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
   * 分派给谁（客诉专员姓名）。空 ＝ 待分派。
   * 分派由投诉督导做，单条或批量（930 §5）。
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
  status: ReportStatus;
  assessment?: ReportAssessment;
  /** 核实打标结论。**只有 A 线的关键词那一路有**（O16） */
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

/** 写缓存。存的是**整份数据**而不是增量：量级只有几十条，整存整取比对账简单 */
export function writeRiskCache(key: string, version: number, payload: object): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...payload, v: version, savedAt: Date.now() }));
  } catch {
    /* 配额超限等忽略 */
  }
}
