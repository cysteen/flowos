import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import {
  agoStamp,
  isOpenStatus,
  isVerifyMonitorSource,
  normalizeMonitorSource,
  readRiskCache,
  writeRiskCache,
  type MonitorSource,
  type ReportAssessment,
  type ReportStatus,
  type ReportVerify,
} from '@/stores/riskShared';

/**
 * **A 线 · 自动入池条目**（《【930】风险报备 · 监控 · 管控 PRD》§5）。
 *
 * 【这条线是什么】自动识别（预警词命中 / 投诉单 / 重要紧急 / VIP 客户）→ 实时监控 →
 * 核实打标 → 风险工单池。**全程没有"报备人"这个角色** —— 条目是系统捞进来的，
 * 不是谁报上来的。
 *
 * 【为什么与 `stores/riskReports.ts` 分家】两条线原先揉在同一个 `RiskReport` 模型里，
 * 于是 A 线的每一条都得带上 `reason: '其他'` / `by: '系统'` / `category: null` /
 * `attachments: []` 这一串**恒定占位**。占位字段最坏的地方不在冗余，在于它让人以为
 * 那里"可能有别的值"：读代码的人会去找"A 线的报备原因是怎么填的"，找一圈才发现根本没有。
 * 拆开之后这几个字段在本模块里由 `autoEntry()` 统一按常量补齐，种子数据一个字都不写。
 *
 * 🔴 **占位字段仍然存在于运行时对象上**，不能删：风险工单池那张表有「报备人 / 报备原因 /
 * 风险类型」三列，A 线的行要在这三格里显示「系统 / 其他 / —」。删掉字段那三格会变成空白，
 * 那是**行为变更**，不属于本轮结构拆分的范围。它们的类型被收窄成字面量常量
 * （`'其他'` / `'系统'` / `null`），类型本身即声明了"这里只可能是这一个值"。
 */

/**
 * A 线条目。字段分三组读：
 *   ① 身份与入池：`id` / `ticketNo` / `source` / `desc` / `at`
 *   ② 走到哪一步：`status` / `assignee` / `assessment`
 *   ③ 核实打标结论：`verify`（只有关键词那一路有）
 * 其余五个是**合并池渲染用的恒定占位**，见上方说明。
 */
export interface RiskQueueEntry {
  id: string;
  ticketNo: string;
  /** 监控来源。A 线是五类：实时监控 / 手动筛查 / 投诉单 / 重要紧急 / VIP客户 */
  source: MonitorSource;
  /** 分派给谁（客诉专员姓名）。空 ＝ 待分派 */
  assignee?: string;
  desc: string;
  /** 入池时刻。等待时长从这里起算，**不从任何"分派时刻"**（N5） */
  at: string;
  status: ReportStatus;
  assessment?: ReportAssessment;
  /**
   * 来源＝关键词那一路的结论（O16）。它要的是 915 的「成立 / 误报 + 定级」，
   * 不是评估的二选一，故**不占 `assessment`**：两个字段都存进 `assessment` 会让
   * 「今日决策」的分母混进一批答的根本不是"升不升"的条目。
   *
   * 🔴 **有 `verify` 不等于已出池**（方案 C，见 `recordVerify`）：
   * 核实**误报**的落「已评估」出池；核实**成立**的退回「待分派」继续走评估，
   * 那一刻它既有 `verify` 又还在队里。判"结没结"一律看 `status`，不要拿本字段当完结标志。
   *
   * 成立后 `verify` 一直留着，评估弹窗第一区块要读它——客诉专员得先知道
   * "监控为什么判它有风险"（成立 · 等级 · 命中原话 · 核实人 · 核实时刻），才谈得上升不升级。
   */
  verify?: ReportVerify;

  /* ---- 以下五个字段是合并池渲染用的恒定占位，A 线没有人来填 ---- */
  /** 恒为「其他」：池表「报备原因」列要有值 */
  reason: '其他';
  /** 恒为 null：池表「风险类型」列显示「—」 */
  category: null;
  /** 恒为空数组 */
  attachments: string[];
  /** 恒为「系统」：通知侧据此解析出"无人可通知"并跳过这一类收件人（O23） */
  by: '系统';
  byRole: '系统';
}

/** 系统自动入队的条目：把五个恒定占位一次补齐，种子里不再逐条重复 */
function autoEntry(
  e: Omit<RiskQueueEntry, 'reason' | 'category' | 'attachments' | 'by' | 'byRole'>,
): RiskQueueEntry {
  return { ...e, reason: '其他', category: null, attachments: [], by: '系统', byRole: '系统' };
}

/**
 * 预置数据：五类监控来源各有样本。
 * ⚠️ 工单号一律取 `mock/tickets.ts` 里**真实存在**的单，且类型对得上 ——
 * 编一个号出来，队列上点单号落在空白页，这条样本要证明的东西当场被证伪。
 */
const SEED: RiskQueueEntry[] = [
  /*
   * 「关键词触发 · 待核实」样本。**必须有**：五类来源里只有它走**核实打标**那一套弹窗
   * （其余四类走评估，O16），少了它，"按来源分流"这条最关键的分支在页面上一次都跑不出来。
   *
   * ⚠️ 工单号有两条硬约束，缺一条这一行就点不出东西：
   *   ① 必须真实存在于 `mock/tickets.ts`，否则队列上点单号落在空白页；
   *   ② 它在命中表（`mock/opsReport.ts`）里的那条命中**必须还没核实**——本行的按钮是「核实」，
   *      点开的是 915 的打标弹窗；命中若已打过标，只会弹一句"已全部核实"，这条路演不出来。
   * `IFLYTS-20260731-00001` 曾写在这里，但它的命中 h5 是 `tagged: '高'`（已核实），正是②的反例。
   * 现取 h1『无线音乐播放跳过歌曲异常』：投诉单、真实存在、命中未核实。
   */
  autoEntry({
    id: 'rr-000',
    ticketNo: 'IFLYTS-20260610-00002',
    source: '实时监控',
    desc: '沟通记录命中风险词，已自动纳入监控范围（无须报备）。',
    at: agoStamp(65),
    status: '待分派',
  }),
  /*
   * 「关键词触发 · 核实成立后待评估」样本。**必须有这一条**：它是方案 C 的那半条链。
   *
   * rr-000 演示的是链的前半段（命中入池 → 待核实）；核实**成立**之后条目不出池、
   * 退回「待分派」继续走分派 / 自取 → 评估，与其余四类来源同构。少了这一条样本，
   * "成立的关键词条目也要走评估"只能靠现场打一次标才看得到，而打标要挑对命中、
   * 挑错就落到"已全部核实"的兜底提示上——评审时这条链多半跑不出来。
   *
   * 它同时钉住三处口径：① 行内按钮此时是「评估」而不是「核实」（判据是
   * `verify.verdict === '成立'`，不是来源）；② 它重新计进 B1「待评估总数」的在队集合；
   * ③ 它**不在**「已处理」视图里——那张表只收 `status === '已评估'`，成立的还没有结论。
   *
   * ⚠️ 工单号的两条硬约束与 rr-000 同源，但②那一条**恰好相反**：
   *   ① `IFLYTS-20260731-00001` 是 `ops-1`（投诉、P0、VIP、已超解决时限 96 小时），真实存在；
   *   ② 它在命中表里的那条命中 `h5`（风险词「起诉」、催补记录）**已经核实过**：
   *      `tagged: '高'` + `verdict: '成立'`，核实人郑监控（投诉督导）。
   *      rr-000 要的是未核实的命中，故这张单是那边的反例、却正是这边要的——
   *      本条的 `verify` 即照抄 h5 的这份结论，两处读出来是同一个判断。
   * 时刻只把绝对日期换成相对时刻（种子一律相对当前生成，见 `agoStamp`）：
   * 命中入池 110 分钟前、核实 95 分钟前，核实必在入池之后。
   */
  autoEntry({
    id: 'rr-010',
    ticketNo: 'IFLYTS-20260731-00001',
    source: '手动筛查',
    desc: '手动批量筛查命中风险词，已纳入监控范围（无须报备）。',
    // 110 分钟前：未过 120 分钟时限，故它在队却不标红——刚核实完就满屏红会盖掉真正超时的那几条
    at: agoStamp(110),
    status: '待分派',
    verify: {
      verdict: '成立',
      level: '高',
      note: '同一客户第二次命中高危词，已上报法务',
      by: '郑监控',
      byRole: '投诉督导',
      at: agoStamp(95),
    },
  }),
  /*
   * ⚠️ 本条曾写成 `IFLYZX-20260617-00001`（ZX＝咨询前缀、且全库不存在），
   * 既违反"全量投诉必须挂投诉单"，也点不进去。
   * 现改挂 t5『收到商品与描述不符，申请退货』，投诉单、真实存在，且与 rr-000 分开挂，
   * 避开"同单至多一条在队"。
   */
  autoEntry({
    id: 'rr-004',
    ticketNo: 'IFLYTS-20260610-00007',
    source: '投诉单',
    desc: '投诉类工单自动纳入监控范围（无须报备）。',
    at: agoStamp(20),
    status: '待分派',
  }),
  autoEntry({
    id: 'rr-005',
    ticketNo: 'IFLYZX-20260610-00005',
    source: 'VIP客户',
    desc: 'VIP 客户工单自动纳入监控范围（无须报备）。',
    at: agoStamp(240),
    status: '评估中',
    assignee: '吴投诉',
  }),
  /*
   * 「紧急重要」样本。**必须有这一条**：五类监控来源里只有它一条样本都没有，
   * 于是来源 chip 行第三枚恒为 0、按「监控来源」列筛选与排序时它永远是空的 ——
   * 「**五类合一个队列**」（N6 / N8）这条口径在页面上就少了五分之一的证据。
   *
   * 挑这张单是因为它自己就是「紧急重要」的判据本身：P0 + 已超解决时限 41 小时 +
   * 影响校端批量业务，不需要另讲一个故事来解释它为什么会被自动捞进来。
   */
  autoEntry({
    id: 'rr-008',
    ticketNo: 'IFLYZX-20260802-00002',
    source: '重要紧急',
    desc: 'P0 工单且已超解决时限，影响客户批量业务，自动纳入监控范围（无须报备）。',
    // 35 分钟前：未超时，与 B 线 rr-003 的超时态形成对照，两态在同一张表上同时可见
    at: agoStamp(35),
    status: '待分派',
  }),
  /*
   * 「投诉单上的接管」样本。**必须有这一条**：它是接管按原单类型分流的另一半（O20）。
   *
   * B 线的 rr-006 原单是**咨询单**（非投诉）：接管后原单落「已升级投诉」并**派生**一张投诉单。
   * 本条原单**本身就是投诉单**：接管走基线 ※27「**工单管控**」——把这张单拿到客诉专员名下，
   * **本单状态不变、不派生新单**，故 `escalatedToNo` 留空、队列「派生投诉单」列显示「—」。
   *
   * 🔴 **不要再给它填 `escalatedToNo`**：O17 原定的"投诉单走 830 第二跳（内投→外投）"已被 O20 推翻。
   * 第二跳只走内投→外投，来源＝热线 / IM / 小程序的投诉单入口本就置灰，客诉专员点不动；
   * 硬派生一张外投单等于在客户根本没有外投时造一张外投单，会把外投量与外投口径系统性抬高。
   */
  autoEntry({
    id: 'rr-009',
    ticketNo: 'IFLYTS-20260711-00001',
    source: '投诉单',
    desc: '投诉类工单自动纳入监控范围（无须报备）。客户维修超期未解决并已向监管平台反映。',
    at: agoStamp(190),
    status: '已评估',
    assignee: '吴投诉',
    assessment: {
      decision: '接管',
      advice: '客户已向监管平台正式登记，须限时答复并留存全过程记录。本单已是投诉单，由我执行「工单管控」接手，本单状态不变、不另开新单。',
      by: '吴投诉',
      byRole: '客诉专员',
      // 评估时刻落在今日：否则 B3「今日已评估」与 B4 决策分布数不到它
      at: agoStamp(160),
    },
  }),
];

/** 本线的缓存键与格式版本。版本对不上一律丢弃，见 `readRiskCache` */
const LS_KEY = 'flowos-risk-queue';
const LS_VERSION = 1;

export const useRiskQueueStore = defineStore('riskQueue', () => {
  const entries = ref<RiskQueueEntry[]>(SEED.map((e) => ({ ...e })));

  /**
   * 落 localStorage（保质期机制见 `riskShared.ts` 的 `readRiskCache`）。
   *
   * 本模块的闭环**天然跨角色**：监控自动入池、投诉督导核实 / 分派、客诉专员评。
   * 演示时这几步要换几次登录，纯内存态下每换一次前面做的全部归零。
   */
  const cached = readRiskCache<{ entries: RiskQueueEntry[] }>(LS_KEY, LS_VERSION);
  if (cached && Array.isArray(cached.entries) && cached.entries.length) {
    entries.value = cached.entries.map((e) => ({
      ...e,
      source: normalizeMonitorSource(e.source),
    }));
  }
  watch(
    entries,
    () => writeRiskCache(LS_KEY, LS_VERSION, { entries: entries.value }),
    { deep: true },
  );

  function findById(id: string) {
    return entries.value.find((e) => e.id === id) ?? null;
  }

  /** 本单的全部 A 线条目（不排序，排序归合并层） */
  function entriesOf(ticketNo: string) {
    return entries.value.filter((e) => e.ticketNo === ticketNo);
  }

  /** 本单当前在队的那条 A 线条目（至多一条） */
  function openEntryOf(ticketNo: string) {
    return entries.value.find((e) => e.ticketNo === ticketNo && isOpenStatus(e.status)) ?? null;
  }

  /**
   * 核实打标回写（O16 / PRD §5.2「两处状态同步」）。
   *
   * 来源＝关键词那一路的条目在「实时监控」被打标之后，队列这一侧必须跟着动：
   * 两个页签装的是**同一条命中**，一边判完了另一边一动不动，
   * 督导看到的就是一条永远评不完的条目，而它其实已经有人判过了。
   *
   * 🔴 **按核实结论分流，不是一律出池**（方案 C）：
   * - **误报** → 落「已评估」出池。结论就是"这里没有风险"，没有下一步可走。
   * - **成立** → **不出池**，退回「待分派」继续走分派 / 自取 → 评估（不升级 / 接管），
   *   与其余四类来源同构。
   *
   * 【为什么成立不能就此出池】原先成立也一律落「已评估」，于是关键词命中的单
   * **哪怕核实成立为高危也永远走不到评估**：唯一出口是 915 打标弹窗里那个
   * 只在高危档才出现的「去管控」按钮——成立为**中危**的单确认有风险却没有下一步。
   * 这是条断链，核实答完"这次命中准不准"之后，"升不升级"没有人答。
   *
   * 【为什么退回待分派而不是留在评估中】核实与评估是两个人的两件事。
   * 打标的可能是投诉督导（本就有打标权），把条目留在他名下等于替他把活派给了自己；
   * 退回待分派，督导照常分派、客诉专员照常自取，与另外四类走同一条路。
   * 承办人一并清掉——「待分派」的定义就是还没有人认领，留着旧名字会让待分派列表里
   * 冒出一条已经有主的条目。
   *
   * 结论一律落 `verify` 不落 `assessment`：它答的是"这次命中准不准"，不是"升不升级"。
   * 成立退回后 `verify` 留着不清，评估弹窗第一区块要读它。
   *
   * 🔴 **只在 A 线里找**：B 线的报备单来源恒为「二线报备」，本就不满足
   * `isVerifyMonitorSource`，拆分前后取到的是同一条。
   */
  function recordVerify(ticketNo: string, verify: ReportVerify): boolean {
    const e = entries.value.find(
      (x) => x.ticketNo === ticketNo && isVerifyMonitorSource(x.source) && isOpenStatus(x.status),
    );
    if (!e) return false;
    e.verify = verify;
    if (verify.verdict === '成立') {
      e.status = '待分派';
      delete e.assignee;
    } else {
      e.status = '已评估';
    }
    return true;
  }

  return { entries, findById, entriesOf, openEntryOf, recordVerify };
});
