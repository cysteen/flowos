import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useNotifyLogStore } from '@/stores/notifyLog';
import { useRiskQueueStore } from '@/stores/riskQueue';
import {
  RISK_SUPERVISOR,
  REPORT_ASSESS_LIMIT_MIN,
  agoStamp,
  asSentence,
  assigneeReceiver,
  isOpenStatus,
  reasonLine,
  readRiskCache,
  useRiskClock,
  writeRiskCache,
  type ReportAssessment,
  type ReportStatus,
  type RiskPoolItem,
} from '@/stores/riskShared';

/**
 * **B 线 · 风险报备单**（《【930】风险报备 · 监控 · 管控 PRD》§4）。
 *
 * 【这条线是什么】二线专员在**非投诉单**（咨询 / 建议 / 商机，基线 ※29）上发起风险报备 →
 * 报备池 → 投诉督导分派 / 客诉专员自取 → 评估二选一（不升级 / 接管）→ 终点。
 * 与 A 线（`stores/riskQueue.ts` 的自动入池）**互不交汇**：报备不回流 A 线。
 *
 * 【为什么在 store 里】报备单有两个消费方，且看的必须是同一份：
 * 发起端在工单操作页「风险报备」Tab（本单的全部报备与结论，§4.3），
 * 评估端在风险监控页「风险工单池」页签（全中心待评估队列，§5.2）。
 * 组件内的 ref 写不出"这边报了、那边队列里立刻出现"。
 *
 * 【边界】本 store **只管报备单自身**：模型、提交、撤回，以及供工单页读的那几个口。
 * 真正往 ProcessFormDraft 的 riskFlag / riskLevel 里写的那一步不在这里 ——
 * 写入优先级要看工单表单当前值，那是工单操作页才有的上下文（930 §6.1 / 915 §7.3）。
 *
 * ⚠️ **本轮只拆结构、不改行为**：下方几个工单页读口（`pendingOf` / `reportsOf` /
 * `canSubmitFor` …）**仍然把 A 线在同一张单上的条目一并算进来**。原因见各函数上的说明——
 * 拆分前它们读的是一份合流数组，把 A 线摘掉会让工单页少掉横幅、放开门控，
 * 那是行为变更，归下一批「两池分家」做。
 */

/**
 * 报备原因（PRD §4.4）。取「风险场景」时风险类型才必填。
 *
 * 🔴 **只有三项**：业务原文的下拉还有「建单错误」与「已有投诉」，**两项已删**（O11）——
 * 评估结论是二选一「不升级 / 接管」，它答不了"这单类型建错了"和"这单跟哪张投诉单是一回事"。
 * 留着就是两个**没有闭环的入口**：报上来，评估侧只能判"不升级"，而单子的类型还是错的。
 * 建单错误由二线自改或找班组长；已有投诉关联由二线在客户全景页自行判断。
 */
export const REPORT_REASONS = ['客户要求升级', '风险场景', '其他'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * 风险类型（PRD §4.5）。**只存在报备单上** —— 不写工单、不进风险等级体系、
 * 不出现在风险监控的任何筛选与统计维度里（§9 规则 9）。它答的是"哪一路风险"，
 * 与答"这张单有多危险"的风险等级是两件事。
 */
export const RISK_CATEGORIES = ['舆情风险', '监管风险', '群体性风险', '其他'] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

/**
 * 报备单。与 A 线条目（`RiskQueueEntry`）的差别就是这条线**有人**：
 * `reason` / `category` / `desc` / `attachments` / `by` / `byRole` 是报备人填的，
 * `withdrawReason` 是报备人撤回时填的。A 线那几个字段是恒定占位，不是真数据。
 */
export interface RiskReport {
  id: string;
  ticketNo: string;
  /**
   * 本条在合并池里的来源标签，**恒为「二线报备」**。
   * 【为什么留着】风险工单池的「监控来源」列要显示它、来源 chip 那一排要数它（N6）。
   * 下一批把两池拆开之后，B 线自己的页签不再需要这一列，届时可删。
   */
  source: '二线报备';
  /**
   * 分派给谁（客诉专员姓名）。空 ＝ 待分派。
   * 分派由投诉督导做，单条或批量（930 §5）。
   */
  assignee?: string;
  reason: ReportReason;
  /** 仅 reason ＝「风险场景」时有值（§9 规则 10） */
  category: RiskCategory | null;
  desc: string;
  attachments: string[];
  by: string;
  byRole: string;
  /** 提交时刻。等待时长从这里起算，**不从任何"分派时刻"**（N5） */
  at: string;
  status: ReportStatus;
  assessment?: ReportAssessment;
  /** 仅 status ＝「已撤回」时有值 */
  withdrawReason?: string;
}

/** 二线报备：来源恒为「二线报备」，种子里不再逐条重复 */
function reported(e: Omit<RiskReport, 'source'>): RiskReport {
  return { ...e, source: '二线报备' };
}

/*
 * ⚠️ **已删除 `TicketRiskAssessment` 及 `ticketAssessmentOf` / `ticketAssessmentNoteOf`**
 * （2026-09-09 第二轮拍板 N1 的连带）。
 *
 * 它们是"评估结论按 915 §7.3 回传工单风险字段"那条链路的取值口。二选一之后
 * **没有「确认有风险 + 定级」这一档了** —— 评估不再产出风险等级，那条回传链路失去前提：
 * - 「不升级」→ 工单**一字不写**；
 * - 「接管」→ 产出的是**一张新单**（走 830 已有的第一跳派生），不是往原单写字段。
 *
 * 保留一个空壳读口只会让调用方以为还有结论可回传。要看接管去向，读
 * `ReportAssessment.escalatedToNo`。
 */

/** 预置数据：挂在几张**非投诉单**上 —— 风险报备只在咨询 / 建议 / 商机（§1.2a） */
const SEED: RiskReport[] = [
  reported({
    id: 'rr-001',
    ticketNo: 'IFLYZX-20260610-00004',
    reason: '风险场景',
    category: '监管风险',
    desc: '客户在第三通来电中反复提到"这事你们不给说法我就去有关部门反映"，情绪较激动，且提到已经拍了照片。本单是咨询单，暂未升级为投诉，拿不准要不要提前介入。',
    attachments: ['第三通通话录音片段.mp3'],
    by: '林晓东',
    byRole: '二线专员',
    // 45 分钟前：未超时，演示「待分派」这一态
    at: agoStamp(45),
    status: '待分派',
  }),
  reported({
    id: 'rr-002',
    ticketNo: 'IFLYZX-20260610-00005',
    reason: '客户要求升级',
    category: null,
    desc: '客户明确说"叫你们领导来跟我讲"，当时判断是情绪话，先做了安抚。',
    attachments: [],
    by: '林晓东',
    byRole: '二线专员',
    at: agoStamp(90),
    status: '已评估',
    assignee: '李文萍',
    assessment: {
      decision: '不升级',
      advice: '客户情绪可安抚，当前咨询单处理路径足够；建议当日内回电明确处理节点并在处理记录留痕。',
      by: '李文萍',
      byRole: '客诉专员',
      // 评估时刻落在今日：否则「今日已评估」与「已评估默认只看今日」两处恒为 0
      at: agoStamp(50),
    },
  }),
  reported({
    id: 'rr-003',
    ticketNo: 'IFLYZX-20260610-00009',
    reason: '风险场景',
    category: '群体性风险',
    desc: '同一小区已有三位客户就同一批次设备反馈同类故障，客户之间互相认识并提到"要一起去反映"。',
    attachments: [],
    by: '周敏',
    byRole: '二线专员',
    // 3 小时前：已过 2 小时时限，演示「超时未评」的标红与计数
    at: agoStamp(180),
    status: '待分派',
  }),
  /*
   * 「已撤回」样本。**必须有这一条**：撤回的口径是「**不删除**，记录仍在、状态记『已撤回』
   * 并留下原因」（§4.8）。SEED 里没有它时，这条口径只能靠"现场报一条再撤一条"才看得到——
   * 而撤回恰恰是**报错了要纠错**的唯一出口，评审时最容易被追问"撤了之后那条去哪了"。
   *
   * 它同时钉住两条派生口径：① 已撤回**不进任何一个看板数**（B1 只数待分派 + 评估中）；
   * ② 它不占"同单在队至多一条"的名额 —— 这张单**现在还能再报一次**。
   *
   * 挂在**商机单**上是有意的：前面三条二线报备全在咨询单上，看着像"报备只能在咨询单发起"。
   * 基线 ※29 的类型集是**咨询 / 建议 / 商机**三类，这条把"商机单同样可报"摆出来。
   */
  reported({
    id: 'rr-007',
    ticketNo: 'IFLYSJ-20260610-00006',
    reason: '风险场景',
    category: '舆情风险',
    desc: '客户为教育行业重点客户，接口限流卡住开学季批量导入，通话中提到会把这事在行业交流群里说一说。判断有对外扩散的可能，先报备。',
    attachments: [],
    by: '林晓东',
    byRole: '二线专员',
    // 撤回前等了 2.5 小时。已撤回不进 B1/B2，故这个时长不会把「超时未评」算大
    at: agoStamp(150),
    status: '已撤回',
    withdrawReason: '开放平台已临时提额并当场恢复导入，客户明确表示不再对外说明；风险已解除，本条报备由报备人撤回。',
  }),
  /*
   * 「接管」样本。**必须有这一条**：SEED 里若只有「不升级」，接管那条分支
   * （派生新单号、原单落终态、Tab 上的「已派生投诉工单」标）在页面上一次都跑不出来，
   * 要看只能自己去评一条 —— 而演示与走查恰恰最需要它一开屏就在。
   *
   * ⚠️ 本条原来的两个号**都是编的**：`IFLYZX-20260610-00006`（全库不存在）与
   * `IFLYTS-20260909-00007`（全库不存在）。于是"派生投诉单"那一列点进去落空，
   * 恰恰把这条样本最该证明的东西证伪了。
   *
   * 现改挂 mock 里**现成的第一跳成对样本**：
   * 原单 `IFLYZX-20260707-00001`（咨询）→ 派生 `IFLYTS-20260709-00001`（t40，投诉，
   * 其 `escalatedFromNo` 正指回原单）。两个号都真实存在、且互相指得回去，
   * 点「派生投诉单」能落到一张真单上。
   *
   * 这条演示的是 **O17 的第一跳**：非投诉单接管 → 原单落「已升级投诉」。
   * 第二跳（投诉单接管 → 工单管控）由 A 线的 rr-009 演示，两条对照着看。
   */
  reported({
    id: 'rr-006',
    ticketNo: 'IFLYZX-20260707-00001',
    reason: '客户要求升级',
    category: null,
    desc: '客户连续两日致电，明确要求"给个说法否则去平台曝光"，并已在社交平台发帖。二线判断已超出常规咨询处理范围。',
    attachments: ['客户发帖截图.png'],
    by: '周敏',
    byRole: '二线专员',
    at: agoStamp(300),
    status: '已评估',
    assignee: '吴投诉',
    assessment: {
      decision: '接管',
      advice: '客户已在公开平台发声，具备外投与舆情双重风险，转投诉流程由客诉专员跟进；原单沟通记录与附件已随新单继承。',
      escalatedToNo: 'IFLYTS-20260709-00001',
      by: '吴投诉',
      byRole: '客诉专员',
      at: agoStamp(280),
    },
  }),
];

/**
 * 新报备单的自增起点。
 *
 * 🔴 **取 11 而不是本线种子条数（5）**：拆分前两条线共用一个 `rr-###` 号段、
 * 共 11 条种子，故拆分前第一条新报备拿到的是 `rr-012`。按本线条数起算会派出 `rr-006`，
 * 而 `rr-006` / `rr-008` / `rr-009` 都已被占用（前者本线、后两者 A 线）——
 * 两条线的条目会在合并池里撞 id，`v-for` 的 key 与"按 id 找条目"当场出错。
 * 号段跨两线保持唯一，这一个常量就是那条约束的落点。
 */
const ID_SEQ_START = 11;

/** 本线的缓存键与格式版本。**版本必须是 2**：v1 那份里同时躺着两条线的条目，见 `readRiskCache` */
const LS_KEY = 'flowos-risk-reports';
const LS_VERSION = 2;

export const useRiskReportStore = defineStore('riskReports', () => {
  const reports = ref<RiskReport[]>(SEED.map((r) => ({ ...r })));
  /** 自增序号只用来造 id，不参与任何业务判断 */
  const seq = ref(ID_SEQ_START);
  /** 领取后跳转工单页时，由工单侧消费并打开评估弹窗。写入方是合并层的 `claim`（930 §5，O18） */
  const assessArrivalTicket = ref<string | null>(null);

  /**
   * 落 localStorage（保质期机制见 `riskShared.ts` 的 `readRiskCache`）。
   *
   * 本模块的闭环**天然跨角色**：二线专员报、投诉督导分派、客诉专员评、结论再回到二线看。
   * 演示时这四步要换四次登录，纯内存态下每换一次前面做的全部归零——报完切过去队列是空的，
   * 评完切回来结论不在。持久化之后这条链才走得完。
   */
  const cached = readRiskCache<{ reports: RiskReport[]; seq: number }>(LS_KEY, LS_VERSION);
  if (cached && Array.isArray(cached.reports) && cached.reports.length) {
    reports.value = cached.reports;
    seq.value = typeof cached.seq === 'number' ? cached.seq : ID_SEQ_START;
  }
  watch(
    [reports, seq],
    () => writeRiskCache(LS_KEY, LS_VERSION, { reports: reports.value, seq: seq.value }),
    { deep: true },
  );

  /** 报备五个事件的通知落点（O22）。工单页「通知记录」Tab 从这里读运行时那批 */
  const notifyLog = useNotifyLogStore();
  /** A 线。工单页的几个读口要把它在同一张单上的条目一并算进来，见下方各函数说明 */
  const queue = useRiskQueueStore();
  const clock = useRiskClock();

  function findById(id: string) {
    return reports.value.find((r) => r.id === id) ?? null;
  }

  /* ---------------- 工单页读口（本轮仍含 A 线条目，见文件头说明） ---------------- */

  /**
   * 本单的全部条目（含已撤回），时间倒序 —— 工单页「报备记录」与评估弹窗「本单另有」用。
   *
   * ⚠️ **合了 A 线**：同一张单上既可能有报备单，也可能有自动入池条目
   * （种子里 `IFLYZX-20260610-00005` 就是两者都有）。拆分前它们在同一个数组里，
   * 工单页把两类一并列出来；本轮只拆结构，故这里照旧合并。
   */
  function reportsOf(ticketNo: string): RiskPoolItem[] {
    return [...reports.value, ...queue.entriesOf(ticketNo)]
      .filter((r) => r.ticketNo === ticketNo)
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  /**
   * 本单当前那条待评估的条目。
   *
   * 🔴 **在队的至多一条，历史条数不限**（PRD §9 规则 12 / D7）：拦的是"两条同时在队"，
   * 不是"这张单一辈子只能报一次"。评估完 / 撤回后照常可以再报，次数不限 ——
   * 这是纠错的唯一路径（评估结论不可改，§9 规则 22），也是"按建议处理后仍未闭环"
   * 这个场景（§2.3 V1）的出口。返回单个对象而不是数组，类型本身就把"不会有两条"写死。
   *
   * ⚠️ **合了 A 线**：工单页的「报备中」横幅与 Tab 圆点读的就是它。A 线条目摘掉的话，
   * 挂着一条在队 VIP 条目的单子会突然不再显示横幅、并放开"再报一次"的门控 —— 行为变更。
   */
  function pendingOf(ticketNo: string): RiskPoolItem | null {
    return reports.value.find((r) => r.ticketNo === ticketNo && isOpenStatus(r.status))
      ?? queue.openEntryOf(ticketNo);
  }

  /** 本单是否还能发起报备：只看在队（待分派 / 评估中），不看历史 */
  function canSubmitFor(ticketNo: string) {
    return !pendingOf(ticketNo);
  }

  /**
   * 本单的历史条目（已评估 + 已撤回），时间倒序。
   * **不含在队那条** —— 它在界面上单独占一块（在队提示条 + 只读卡），进列表会重复。
   */
  function historyOf(ticketNo: string): RiskPoolItem[] {
    return reportsOf(ticketNo).filter((r) => !isOpenStatus(r.status));
  }

  /**
   * 工单的「报备中」标记（§3.2）。**纯派生、不落库**：有没有这个标记，
   * 完全等于"本单有没有一条**在队**的条目"，人不直接操作它。
   * 【为什么含「评估中」】对报备人而言"报上去了、还没有结论"是同一件事，
   * 内部分派到谁与他无关；只认「待分派」的话，一分派横幅就没了，看着像结论已经出来了。
   */
  function isReporting(ticketNo: string) {
    return !!pendingOf(ticketNo);
  }

  /** 最新已评估结论的可读一行（工单页只读回显；二选一后无风险等级，展示决策 + 评估人 + 时刻） */
  function assessmentNoteOf(ticketNo: string): string {
    const latest = reportsOf(ticketNo).find((r) => r.status === '已评估' && r.assessment);
    if (!latest?.assessment) return '';
    const a = latest.assessment;
    if (a.decision === '接管' && a.escalatedToNo) {
      return `风险评估：接管 → ${a.escalatedToNo} · ${a.by}（${a.byRole}）· ${a.at}`;
    }
    return `风险评估：${a.decision} · ${a.by}（${a.byRole}）· ${a.at}`;
  }

  /** 等待时长与超时判定走两线共用的那根钟，见 `riskShared.ts` 的 `useRiskClock` */
  const waitedMinutes = clock.waitedMinutes;

  /** 是否超时未评：**在队**且等待时长 > 时限。不是 SLA，不走工作日历、不停表 */
  function isOverdue(r: { status: ReportStatus; at: string }) {
    return isOpenStatus(r.status) && clock.isOverdueAt(r.at);
  }

  /* ---------------- 动作 ---------------- */

  /** 二线报备提交，落「待分派」。A 线自动入池的条目不走这里 */
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
    if (!canSubmitFor(input.ticketNo)) return null;
    seq.value += 1;
    const report: RiskReport = {
      id: `rr-${String(seq.value).padStart(3, '0')}`,
      source: '二线报备',
      status: '待分派',
      ...input,
      // 风险类型只在「风险场景」下成立：原因切走时前端已清空，这里再收一道，
      // 免得别处调用绕过表单直接塞进来一个不该有的值
      category: input.reason === '风险场景' ? input.category : null,
    };
    reports.value.push(report);
    // 报上来第一时间要惊动的是**投诉督导**：待分派这一段的责任人是他（分派归他做），
    // 而这条队列卡的是投诉立项，静悄悄躺在队列里等人主动来看是不行的。
    notifyLog.emit({
      ticketNo: report.ticketNo,
      event: 'risk.report.submitted',
      kind: 'risk',
      title: '风险报备待分派',
      receivers: [RISK_SUPERVISOR],
      content: `${report.ticketNo} 新增一条风险报备，报备原因：${reasonLine(report)}；报备人：${report.by}（${report.byRole}）。请及时分派客诉专员评估，评估时限 ${REPORT_ASSESS_LIMIT_MIN} 分钟（自报备提交时刻起算）。`,
    });
    return report;
  }

  /**
   * 撤回：**仅待分派、仅本人**（调用方判"本人"）。**不删除**，转「已撤回」并留原因（§4.8）。
   * 【为什么分派后不能撤】活已经指给人了，这时候抽走等于让评估人白读一遍；
   * 分派之后要纠错，走"评完再报一次"。
   *
   * 🔴 **只认 B 线的 id**：撤回是"报备人收回自己报的那一条"，A 线的条目没有报备人，
   * 界面上也拿不到撤回按钮（判据含 `by === 当前用户`，而 A 线的 `by` 恒为「系统」）。
   */
  function withdraw(id: string, reason: string) {
    const r = findById(id);
    if (!r || r.status !== '待分派') return;
    r.status = '已撤回';
    r.withdrawReason = reason;
    /*
     * 收件人配的是「投诉督导 + 承办人」两类，而**撤回只能发生在待分派态**，
     * 那一刻 `assignee` **必然为空** —— 这正是 O23 类型级判据的现场：
     * 按规则级（一类解析不到就整条不发）这条会被静默丢掉，督导那边队列里
     * 少了一条却不知道去哪了。这里让「承办人」这一类落空、督导照收。
     *
     * 「承办人」这一类仍然要配上：分派后能否撤回是可能变的口径，
     * 现在把它删掉，将来放开时又得回头补一遍收件人配置。
     */
    notifyLog.emit({
      ticketNo: r.ticketNo,
      event: 'risk.report.withdrawn',
      kind: 'risk',
      title: '风险报备已撤回',
      receivers: [RISK_SUPERVISOR, assigneeReceiver(r)],
      content: `${r.ticketNo} 的风险报备已由 ${r.by}（${r.byRole}）撤回，撤回原因：${asSentence(reason)}该条报备记录保留、不再进入待评估队列；如风险再现，本单可重新发起报备。`,
    });
  }

  /** 工单详情页打开后消费一次，触发评估弹窗 */
  function consumeAssessArrival(ticketNo: string) {
    if (assessArrivalTicket.value !== ticketNo) return false;
    assessArrivalTicket.value = null;
    return true;
  }

  return {
    reports,
    assessArrivalTicket,
    findById,
    reportsOf,
    pendingOf,
    canSubmitFor,
    historyOf,
    isReporting,
    assessmentNoteOf,
    waitedMinutes,
    isOverdue,
    submit,
    withdraw,
    consumeAssessArrival,
  };
});
