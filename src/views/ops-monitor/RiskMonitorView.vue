<script setup lang="ts">
// 风险监控 —— 从《【915】运营监控大盘》模块四拆出独立立项（D7a）
//
// 【本页现在的主线：漏斗】（业务第三轮拍板）
//   ① 识别 —— 三类自动识别（预警词命中 / 投诉单 / 重要紧急）产生**监控条目**
//   ② 打标 —— 对条目四选一：高 / 中 / 低 / 无风险。**打标是入池门槛**
//   ③ 分流 —— 低/中/高 进风险工单池等评估；无风险落「已标记无风险」，不进池
//   ④ 评估 —— 池内条目二选一：升级 / 不升级（升级只指转投诉单，不含升三线）
//   ⑤ 下游 —— 高危给「去管控」入口（基线 ※27，人点、系统不自动管控）
//
// 【命中记录这一层还在，但退到台账】风险词命中是**证据**不是工作项：一张单可以被三条词命中，
// 而人要判的始终是"这张单有没有风险"。故日常工作面是条目（实时监控页签），
// 命中记录留在「命中台账」页签供事后点查与核实，词表准确率仍由那里回填。
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DatePicker, message } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import { ReloadOutlined, ArrowRightOutlined, RightOutlined, SearchOutlined, SettingOutlined, HistoryOutlined, CheckOutlined, UnorderedListOutlined, DownOutlined, TagOutlined, TagsOutlined, EditOutlined, SaveOutlined, FilterOutlined, UserOutlined, PaperClipOutlined, RollbackOutlined } from '@ant-design/icons-vue';
import MetricTipIcon from '@/components/MetricTipIcon.vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
// 协同处理弹窗与工单页底栏那一枚**共用同一个组件**：投诉单在池里与在工单上做的是同一件事，
// 抄第二份的下场是两个入口的必填项、副作用与履历行文各走各的（本项目在「派生说明行」上刚栽过）
import OpRiskCollabModal from '@/views/tickets/components/operation/OpRiskCollabModal.vue';
import AppPagination from '@/components/AppPagination.vue';
import { opsTip } from '@/mock/opsMonitorTips';
import { useUserStore } from '@/stores/user';
// 核实历史与筛查并入的命中都放在 store 里：工单处理页要读同一份结论（打标回传），
// 组件内的 ref 只在本页活着，跨页就断了。
import { useRiskTagStore, type RiskTagEntry } from '@/stores/riskTags';
// 风险工单池（《【930】》§5）。队列条目与风险词命中记录**分母不同、两处不可相加**（§7 撞名），
// 故各走各的 store，本页只是把两块工作面并在一屏。
// 池是两条线（A 线自动入池 / B 线二线报备）合并后的那一个工作面，故读的是合并层 riskPool；
// 枚举与时限等两线共用的口径在 riskShared，两条线各自的模型在各自的 store 里。
import { useRiskPoolStore, type RiskPoolItem } from '@/stores/riskPool';
import { useRiskQueueStore, type RiskQueueEntry } from '@/stores/riskQueue';
import {
  ASSESS_DECISIONS,
  MONITOR_SOURCES,
  NO_RISK,
  QUEUE_SOURCES,
  REPORT_SOURCE,
  RISK_TAG_RESULTS,
  isPoolLevel,
  isVerifyMonitorSource,
  normalizeDecision,
  todayStamp,
  REPORT_ASSESS_LIMIT_MIN,
  type AssessDecision,
  type MonitorSource,
  type RiskReleaseRecord,
  type RiskTagResult,
} from '@/stores/riskShared';
import { useDerivedTicketStore } from '@/stores/derivedTickets';
// 评估弹窗的两处口径与工单页那个入口**共用同一份实现**：
// `escalateHintOf` 是「升级」那行分流提示的唯一文案来源，`deriveEscalatedComplaint` 是派生的完整落地。
// 本页此前各写各的，于是提示行在这里从来就没出现过（工单页有、监控页没有）。
import { deriveEscalatedComplaint, escalateHintOf } from '@/composables/useRiskReportAssess';
import { RISK_TAG_ROLES, RISK_WORD_MAINTAIN_ROLES } from '@/config/roles';
import { RISK_LEVELS, riskLevelText } from '@/config/risk';
import { TICKETS } from '@/mock/tickets';
// 优先级的界面词取工单侧那一份**单一真源**：建单页下拉、班组看板都从那里取，
// 本文件再抄一份，改天业务把「普通加急」改个说法，这一列就会静默地留在旧词上。
// `canReleaseAnyRiskReport` 是**管理员兜底释放**那一路的唯一判据，与 B 线报备池共用同一份 ——
// 两个池的释放口径 PRD 明写「逐条同 §5.5」（§5B.4），各写一份就会各放各的权
import { canReleaseAnyRiskReport, PRIORITY_LABEL, STATUS_GROUP, ticketStatusDisplayName, resolveTicketGroupNames, type Priority, type Ticket } from '@/views/tickets/types/ticket';
// 🔴 清单表直接复用工作台那张富列表，不在本页另画一张长得像的：
// 「投诉单」「重要紧急」两路的行**就是工单**，人在这一档要判的也正是工单本身
// （摘要 / SLA / 状态 / 产品）。原先那两列（监控来源 ＝ 档名的复述、场景描述 ＝ 一句写死的套话）
// 对判断没有任何信息量，停在这一档根本判不了，只能一条条点进工单。
import TicketRichList from '@/views/tickets/components/TicketRichList.vue';
// SLA 那两行与"此刻是否超时"的口径取工作台那一份**单一真源**（已提到 utils 共用）——
// 本页再抄一份的话，同一张单在两个页面会给出不同的 SLA 说法
import { isSlaBreachedNow, slaFirstLine, slaResolveLine } from '@/views/tickets/utils/ticketListCells';
import { getOpsScopeSelectGroups, type OpsScope } from '@/mock/opsMonitor';
import {
  RISK_LEVEL_STYLE,
  RISK_WORDS,
  DISPOSAL_BY_GRADE,
  wordOnlyRiskHitsOf,
  runManualScan,
  SCANNABLE_TICKETS,
  SCAN_FIELDS,
  SCAN_NODE_STATUS_OPTIONS,
  SCAN_TICKET_TYPES,
  SCAN_BUSINESS_TYPES,
  SCAN_PRODUCT_CATEGORIES,
  defaultScanCriteria,
  type RiskHit,
  type RiskWord,
  type RiskLevel,
  type HitVerdict,
  type ScanCriteria,
  type ScanResultRow,
} from '@/mock/opsReport';
import { PRODUCT_NAMES } from '@/views/tickets/types/createTicket';

const RangePicker = DatePicker.RangePicker;

const route = useRoute();
const router = useRouter();
const user = useUserStore();
const riskTags = useRiskTagStore();

// ---- 监控范围：固定全中心，页内不提供范围切换（筛查条内可另选班组） ----
//
// 【清单的两层选择】视图（看哪一批）× 视图内条件（这批里筛哪些），两层各归其位。
// 先选批（页签），再筛条件（chip / 查询条）——本页四个页签、每个页签内部各自的 chip 行，
// 从上到下就是这两层。
//
// 【为什么只有一个状态变量】这里一度并存两个：上方 KPI 卡驱动的「域」与清单卡头驱动的「页签」，
// 两者只做了部分同步。后果是页签标签与清单内容当场对不上——标签写着一个数、表里躺着另一批。
// **一块屏上同一件事只能有一个真源**，两套状态机不管同步得多勤，都会在某条路径上分叉；
// 故合并成 listView 这一个。本文件后面每一处"chip 上的数字取过筛后的行数"都是这条的推论。
/**
 * 四个页签，**三个分母**：
 *   · `realtime` 实时监控 —— **监控条目**（A 线）。本轮从"命中维度"改成"条目维度"，见 `QueueView`；
 *   · `scan`     手动筛查 —— 风险词命中记录（拿条件去扫存量，产出待并入的新命中）；
 *   · `judged`   命中台账 —— 风险词命中记录（事后点查 + 核实打标，词表准确率由它回填）；
 *   · `report`   风险工单池 —— **池行**（A 线打标进池的条目 + B 线报备单，N6 合一队）。
 *
 * 🔴 **三个分母两两不可相加**：一张单可以被三条词命中、也可以既有条目又有报备。
 * 每一处并排摆出的数字都在 title 里写明自己的分母，界面上不做互校、不相减。
 *
 * 【为什么变量名仍叫 report】改名要动本文件几十处引用，而并行还有别的路在改别的文件；
 * 名字与页签标题的偏差在这条注释里说清即可，静默漏改一处取到 undefined 的代价大得多。
 */
type ListView = 'realtime' | 'scan' | 'judged' | 'report';
/** 清单唯一的视图状态：页签与可点 KPI 卡全读写它 */
const listView = ref<ListView>('realtime');

/**
 * **实时监控页签的三视图**（业务第三轮拍板 · 漏斗）。装的是 A 线**条目**，不是命中记录。
 *
 * 🔴 **本轮从"命中维度"改成"条目维度"**。旧口径下这个页签切的是「待核实 / 已核实」的
 * **风险词命中**，可人要判的从来不是"这条词捞得准不准"，而是"**这张单有没有风险**"——
 * 一张单被三条词命中就要判三次，三次还可能判出三个不同的等级，池子里那一条到底算几级
 * 就没人答得上来。改成条目维度之后，一条条目一个结论，漏斗的三段在页签里一一对应：
 *
 * ```
 *   待打标（monitoring）──低/中/高──▶ 已入池（pooled）──▶ 风险工单池页签接着往下走
 *                       └─无风险────▶ 已标记无风险（noRisk）
 * ```
 *
 * 🔴 **「已标记无风险」不是回收站**：它是投诉督导核查**漏标误判**的唯一容器 ——
 * 判错的那一条不会再出现在任何待办里，不给它一个看得见的去处，
 * "有没有人把该管的判成了没风险"这个问题在整个系统里没有一处答得了。
 * 故这一视图给「修正」入口、且默认与另两个视图平级摆在同一排，不折叠、不藏。
 */
type QueueView = 'monitoring' | 'pooled' | 'noRisk';
const queueView = ref<QueueView>('monitoring');

/**
 * 「未标记」这一段**两级展开**。
 *
 * ```
 *   实时监控   ▾ 高风险 / 中风险 / 低风险      ← 按**词表预设的识别风险等级**
 *   投诉单     ▾ P0 / P1 / P2 / P3           ← 按**工单优先级**
 *   重要紧急   ▾ P0 / P1                     ← 同上，这一路本就只有这两级
 * ```
 *
 * 🔴 **三路是同一维（监控来源）的三个值，两两互斥**。互斥这件事不是巧合而是要求：
 * 一条行只能算进一路，否则「实时监控 + 投诉单 + 重要紧急 ＝ 页签上那个数」这条恒等式当场失守，
 * 而这一列的全部说服力就在于"点开的数加起来对得上"。归属由 `effectiveSourceOf` 一处判定。
 *
 * 🔴 **第二级的维度按各自的性质走，不强求统一**：命中那一路人排队看的是"机器觉得这句话多重"，
 * 工单那两路看的是"这张单本身多急"。硬拉成同一把尺，两边都会得到一列读不出业务含义的数。
 *
 * 【为什么没有一档"合计"】原先三路上面还压着一档「全部待判」装三路之和。删掉了：
 * 那个数现在由**页签**承担，档位与页签各摆一遍就是同一个数写两处；
 * 删掉之后这一段只剩两级缩进，与「已标记」段的层级语法齐平。
 *
 * 【为什么另开状态而不是塞进 `queueView`】`queueView` 分的是**打没打标**
 * （未标记 / 已入池 / 无风险），是链上的段；切片分的是**同一段里看哪一路**，是段内的维度。
 */
type UntaggedSlice = 'kw' | 'complaint' | 'urgent';
/** 默认停在第一路「实时监控」—— 三路里只有它带命中原话，是唯一能就地判完的一路 */
const untaggedSlice = ref<UntaggedSlice>('kw');
/** 切片内的第二级收窄；空串 ＝ 不限子档（＝ 点的是切面行本身） */
const untaggedSub = ref<string>('');
/**
 * 三个切面各自展开着没有。**默认全展开**：业务给的原始格式就是把子档一并列出来的，
 * 而且子档为 0 也照常显示（见 `untaggedSubItems`）——结构稳定比省几行重要，
 * 档位时有时无，人会以为筛选坏了。
 */
const untaggedOpen = ref<Record<UntaggedSlice, boolean>>({
  kw: true,
  complaint: true,
  urgent: true,
});

/**
 * 「已入池」这一档再按**现行打标等级**分档：高 / 中 / 低，`all` ＝ 全部有风险，
 * `tagger` ＝ 同一批条目**换按标记人看**。
 *
 * 🔴 **「全部有风险」不含「无风险」**。无风险是漏斗的另一个出口（`queueView === 'noRisk'`），
 * 把它并进来等于把已经排除掉的那一批重新算成风险，左栏那一列的合计当场答错
 * "现在到底有多少条确实有风险"——而那正是这一列存在的理由。
 * 判档读的是条目的现行 `tag.result`，**与池内状态无关**：池内三态是它进池之后的事，
 * 一条评估中的高危条目仍然是高危。
 *
 * 【为什么 `tagger` 跟等级挤在同一个 ref 里】左栏「已标记」组里这几档是**互斥单选**：
 * 选中「按标记人」的同时不可能又选中「高危」。互斥的选项分存两个状态，
 * 两边就都能声称自己被选中，`railKey` 还得再编一条"谁赢"的规则 —— 而那条规则一旦
 * 与页头 KPI 卡的写法不一致，选中态与表里的数据当场分家（本文件反复踩过的坑）。
 * `tagger` 不是第四个等级，它与 `all` 是**同一批行**，只是右侧多出一行标记人单选。
 */
const tagLevelFilter = ref<RiskLevel | 'all' | 'tagger' | 'stage'>('all');

/**
 * 标记人单选（只在「按标记人」这一档作数）。`all` ＝ 不按人收窄。
 *
 * 🔴 **分母与「全部有风险」同一个**：只数打标为高 / 中 / 低的条目，**不含无风险**。
 * 把无风险也数进来，这一行会变成"谁判得多"，而督导要的是"谁名下压着多少条有风险的"。
 * 无风险那一批要看谁判的，去「无风险」那一档逐条看修正记录 —— 那是核查漏标的场子，
 * 与这里的工作量分布不是同一个问题。
 */
const taggerFilter = ref<string>('all');
/**
 * 左栏「按标记人」展开着没有。**它只管展开、不管选中**：展开的是"有哪些人"这份清单，
 * 选中的是"看谁的"（`taggerFilter`）。合成一个变量的话，选了某个人再想看全部就只能先收起来。
 */
const taggerExpanded = ref(false);
/**
 * 池内处置阶段单选（只在「按处置阶段」这一档作数）。`all` ＝ 不按阶段收窄。
 *
 * 🔴 **判据取 `queueStatusText(e)`**，也就是这张表「池内状态」那一列显示的那个词 ——
 * 左栏分档与表里那一格是同一个映射（`POOL_STATE_TEXT`），三档因此**不重不漏**，
 * 且左栏写的词与表里那一格逐字一致。各写各的判据是本文件反复踩过的坑。
 */
const poolStageFilter = ref<string>('all');
/** 三个阶段的界面词，**次序即时间序**（待领取 → 已领取 → 已结论），不按数量重排 */
const POOL_STAGE_KEYS = ['待领取', '已领取', '已结论'] as const;
/**
 * 左栏「按处置阶段」展开着没有。与 `taggerExpanded` 一样只管展开、不管选中
 * （选中的是 `poolStageFilter`）。**默认展开**：这三档是值班每天真要点的地方，
 * 而「按标记人」是督导偶尔查工作量才展开的一份名单，两者默认态本就不同。
 */
const poolAxisExpanded = ref(true);

/**
 * 工作组筛选（单选，横跨左栏每一档）。
 *
 * 🔴 **组不是条目自己的字段**：条目与池行上都只有工单号，组名由 `groupNameOf` 反查工单库，
 * 与页头「各处理组」那一行、工单列表「分组名称」列同一个口径，本页不另造一套分组。
 * 查不到工单的落「未归组」并照常成一档——吞掉的话各组之和会小于左栏的总数，
 * 而人正是照这一行决定"先盯哪一组"，被吞掉的那几条就再也没人管。
 */
const groupFilter = ref<string>('all');
/**
 * 当前等级分档的人话说法；`all` / `tagger` 两档为空串（那两档装的是全部三个等级，
 * 说不出"某一级"），空态与收窄标据此判断要不要出这一句。
 */
const tagLevelText = computed(() => (
  tagLevelFilter.value === 'all' || tagLevelFilter.value === 'tagger' || tagLevelFilter.value === 'stage'
    ? ''
    : riskLevelText(tagLevelFilter.value)
));
function inGroup<T extends { ticketNo: string }>(rows: T[]): T[] {
  if (groupFilter.value === 'all') return rows;
  return rows.filter((r) => groupNameOf(r.ticketNo) === groupFilter.value);
}

// ==== 风险工单池（《【930】》§5，2026-09-09 第二轮拍板 N4 / N6 / N7 / O13 / O14）====
//
// 【为什么叫「风险工单池」】本页曾有两处顶着同一个旧名——页签这一个，与页头卡区
// 中间那块——**同名不同物**：那块的分母是在办工单，这里的分母是队列条目。
// 同屏两个同名的数天生不等，人只会当成同一个数看错。业务拍板把名拆开：
// 那块改叫「工单存量」，本页签叫「风险工单池」，"池"点明它装的是一批待认领 / 待评估的
// **条目**，不是一批工单。
//
// 沿用 O13 的口径：915 §1.1 的风险定义**一字不动**（已经是投诉的叫事实、不叫风险）。
// 可这个池子里躺着投诉单、重要紧急这类压根不满足"有概率演变为投诉"的条目——
// 池名说的是"风险侧要盯的一池单"，比 §1.1 那个风险定义宽。
// 两个词各管各的，才不会在同一册里打架。
//
// 🔴 **O14 那条"同一条在两个页签各出现一次"的已知代价，本轮随漏斗消失了**：
// 打标成了入池门槛之后，一条条目在同一时刻只可能落在**一个**视图里——
// 还没打标的在实时监控·待打标，打完低/中/高的在实时监控·已入池（＝风险工单池里那一半），
// 判无风险的在实时监控·已标记无风险。两个页签看的是同一条链的前后两段，不再是同一条的两份副本。
const reportStore = useRiskPoolStore();
/**
 * A 线队列本体。只用于两件补条目的事：按三类判据补齐监控条目（`syncAutoEntries`），
 * 与手动筛查「并入清单」时补条目（`adoptScanTickets`）。其余取数一律走合并层 `reportStore`。
 */
const riskQueue = useRiskQueueStore();
/** 「升级」派生的新投诉单落这里，工单页解析时兜在静态数据源之后 */
const derivedTickets = useDerivedTicketStore();

/*
 * ==== 工单存量（页头第二块）====
 *
 * 🔴 **它的分母是「工单」，另外两块都不是**，三块并排最容易被读成一路数：
 *   · 监控数据 ＝ **监控条目**（A 线，含每日新增与打标漏斗三段）
 *   · 工单存量 ＝ 工单系统里的**在办工单**          ← 本块
 *   · 评估处置 ＝ **风险工单池**里的**池行**（A 线打标进池的条目 + B 线报备单）
 * 还有一处同屏撞名要盯住：页签「风险工单池」的角标数的是**池行**，
 * 本块「工单存量」数的是**工单**——两者同屏并列，但不是一回事，不可相加、不互校。
 * 「等级分布」尤其要盯：本块的高/中/低是**工单级风险等级**
 * （＝该单**已打标条目**与**已核实且成立的命中**跨条目取最高、同一条以最新结论为准派生），
 * 与左栏打标漏斗里的等级**不是一个口径**——那边一条条目一个等级、数的是**条目**；
 * 这边把一张单上的已打标条目与已核实成立的命中并起来取最高、数的是**工单**。
 * 两个数天生不等，界面上不相减、不互校，各自 title 写明分母。
 *
 * 【为什么取在办、不取全库】这三个数对应的正是 §5.1 里三类**自动入队**的监控来源，
 * 而终态单不入队。把已结案的投诉单也数进来，这一行就成了一个没法据以行动的历史总量。
 */
const isLiveTicket = (t: Ticket) => STATUS_GROUP[t.nodeStatus] !== '终态';

/** 所有投诉类工单（在办）。对应监控来源「全量投诉」 */
const complaintTicketCount = computed(
  () => TICKETS.filter((t) => isLiveTicket(t) && t.type === '投诉').length,
);

/**
 * 优先级为紧急 / 重要的工单（在办）。对应监控来源「紧急重要」。
 * 取值口径来自 `types/ticket.ts` 的业务标签（0803 业务确认）：**P0 ＝ 紧急、P1 ＝ 重要**。
 */
const urgentTicketCount = computed(
  () => TICKETS.filter((t) => isLiveTicket(t) && (t.priority === 'P0' || t.priority === 'P1')).length,
);

/**
 * 风险工单等级分布（《【930】》§5.3.1 / §7.3 T3）：按**工单级风险等级**
 * （＝该单**已打标条目**与**已核实且成立的命中**取最高，2026-09-10 第三轮口径）
 * 把**在办工单**分到高 / 中 / 低三档，给条数与占比。
 *
 * 🔴 **遍历的起点是"工单"，不是"命中记录"**。这一条踩过一次，值得写死在这里：
 * 旧实现先遍历 `allHits`、再对每个工单号问 `ticketGradeOf`，于是
 * **打标进池、但本单一条命中记录都没有的工单整批数不到**（实测漏 10 张）——
 * 而 `ticketGradeOf` 的口径本来就是两维的（`tagGrades` ∪ 已核实成立的命中），
 * 投诉单 P0·P1 与重要紧急这两路根本不产生命中记录，它们的等级只有打标这一个来源。
 * 以命中表为起点等于把"这张单算不算进分母"挂在"它有没有命中记录"上：
 * 往命中表里补几条数据，这个分布就跟着变，而它本该只随打标与核实结论变。
 * 故起点 ＝ **已打标条目所在的单 ∪ 有命中记录的单**，去重后逐单问 `ticketGradeOf`
 * ——两个来源缺一不可，取空的（误报 / 未核实 / 打为无风险 / 未打标）自然不进分母。
 *
 * 🔴 **在办判定分两路取**（§7.3「T3 分母的两个来源」③）：该工单号能在**工单库**里解析到
 * → **按工单库的状态判，进终态的剔除**；解析不到 → **按监控语料自身携带的在办标记判**
 * （`SCAN_TICKET_STATUS_BY_NO`）。故这个分母覆盖的是「**工单库中的在办单 ∪ 监控语料中标记为在办的单**」。
 *
 * 🔴 **"解析不到的不吞" ≠ "解析不到的照计"**（同表 ④，验收点 **R58j⒠**）：
 * 剔除的判据是「**查到了、且它进了终态**」**或**「**查不到、但语料自己把它标成了终态**」，
 * **两边都没说它是终态**才计入。两头都不能省——
 * ⒜ 把查不到的整批当终态丢掉，分母会**静默缩水**，且缩水量随语料而变；
 * ⒝ 反过来见 `t` 为空就直接照计，语料里那几张**自带「终态」的单**（它们在工单库里查不到）
 * 只要哪天被打上等级，就会有一张**终态单被计进"在办"分母**——这一步谁也看不见，
 * 数字却已经错了。`isLiveTicket` 只吃 `Ticket`，语料那一路只有子状态，故落到 `STATUS_GROUP` 上判。
 */
const ticketGradeDist = computed(() => {
  const buckets: Record<RiskLevel, number> = { 高: 0, 中: 0, 低: 0 };
  const seen = new Set<string>();
  const take = (ticketNo: string) => {
    if (seen.has(ticketNo)) return;
    seen.add(ticketNo);
    const t = TICKET_BY_NO.get(ticketNo) ?? derivedTickets.find(ticketNo);
    // 路一：工单库解析得到 → 以工单库状态为准；路二：解析不到 → 以语料自带的状态为准。
    // 两边都没判成终态才计入（语料里也没这张单时，无人说它是终态，照计）。
    const corpusStatus = SCAN_TICKET_STATUS_BY_NO.get(ticketNo);
    const terminal = t ? !isLiveTicket(t) : !!corpusStatus && STATUS_GROUP[corpusStatus] === '终态';
    if (terminal) return;
    const g = riskTags.ticketGradeOf(ticketNo);
    if (g) buckets[g] += 1;
  };
  // 来源一：已打标条目（`tagGrades` 的一级 key 就是工单号，无命中记录的那批只在这里）
  Object.keys(riskTags.tagGrades).forEach(take);
  // 来源二：有命中记录的单（已核实成立的命中那一路）
  allHits.value.forEach((h) => take(h.ticketNo));
  const total = buckets.高 + buckets.中 + buckets.低;
  /*
   * 🔴 **占比取整走最大余数法**（§7.3 T3 的舍入规则，`高 + 中 + 低 ＝ 100%` 的实现口径）：
   * ① 各档 `条数 ÷ 分母 × 100` **向下取整**，各自记下小数余数；
   * ② 与 100 的差额（0~2）按余数**从大到小**依次每档 +1；余数相同时按 **高 → 中 → 低** 补。
   * 【为什么不能用 Math.round】四舍五入不保证和为 100：9 / 7 / 7（分母 23）
   * 精确值 39.13 / 30.43 / 30.43，round 后 39 + 30 + 30 ＝ **99%**，
   * 而这一行的 title 上明写着"占比之和为 100%"——那句话会当场变成假的。
   */
  const rows = RISK_LEVELS.map((lv, idx) => {
    const exact = total ? (buckets[lv] / total) * 100 : 0;
    const floor = Math.floor(exact);
    return { level: lv, count: buckets[lv], pct: floor, rem: exact - floor, idx };
  });
  let gap = total ? 100 - rows.reduce((s, r) => s + r.pct, 0) : 0;
  // 余数相同时按 高 → 中 → 低：`idx` 这一维不靠 sort 的稳定性，显式写出来
  for (const r of [...rows].sort((a, b) => b.rem - a.rem || a.idx - b.idx)) {
    if (gap <= 0) break;
    r.pct += 1;
    gap -= 1;
  }
  return {
    total,
    rows: rows.map(({ level, count, pct }) => ({ level, count, pct })),
  };
});
/**
 * 视图内三态（N4）：待领取 / 评估中 / 已评估。
 *
 * ⚠️ `unassigned` 这个键与落库值「待分派」都是**分派时代留下的词**。分派 / 改派 /
 * 批量分派整套已随第三轮拍板取消，这一档现在的含义就是"**还没人领**"，故界面一律写
 * 「待领取」。键与落库值不动：`ReportStatus` 是两条线共用的，B 线本轮不解冻，
 * 为了换个词把跨线的状态枚举改掉，代价远大于在这里说清楚。
 *
 * **不做成三个页签**：它们是同一批池行的三个阶段，属**视图内条件**而非另一批数据；
 * 摆成页签还会与旁边的「命中台账」（命中，另一个分母）挨着被读串 —— 与本文件开头
 * 「先选批（页签），再筛条件」的分层是同一条规矩。
 */
/**
 * 🔴 **多出来的 `all` ＝ 左栏「按处置阶段」那一行本身**（不限阶段）。
 * 它与「按标记人」那一行是同一种东西：**分类的表头也可选，选中即"这一维不收窄"**。
 * 没有它的话，「按处置阶段 4」那一行点下去只能落到某一个阶段上，
 * 而那一档的数是 2 —— 行上写着 4、表里躺着 2，正是本文件反复踩过的坑。
 */
type ReportView = 'all' | 'unassigned' | 'assigning' | 'assessed';
const reportView = ref<ReportView>('unassigned');
/** 池行走到哪一步。取 store 的 `status`，不靠"有没有承办人"倒推 */
function poolStageOf(r: RiskPoolItem): '待领取' | '已领取' | '已结论' {
  if (r.status === '待分派') return '待领取';
  if (r.status === '评估中') return '已领取';
  return '已结论';
}

/**
 * 监控来源筛选（N6：来源是池行的一个属性、不是另一批数据）。
 *
 * 【为什么跨三态保留】来源是条目的固有属性，不随阶段变。切态时清掉它，
 * 人在「待领取 · 投诉单」筛完切到「评估中」会看到全部来源，只会以为筛选失灵。
 * 反过来超时/决策那两个收窄是**阶段专属**的，切态时必须摘掉，见 setReportView。
 */
const sourceFilter = ref<MonitorSource | 'all'>('all');
/** 来源排序：默认不排（队列默认按等待时长），点表头在正序/倒序/不排之间轮转 */
const sourceSort = ref<'none' | 'asc' | 'desc'>('none');
/** 排序序位取枚举的声明次序，不按字面量排——中文按码点排出来的次序读不出任何业务含义 */
const SOURCE_ORDER = new Map<MonitorSource, number>(MONITOR_SOURCES.map((s, i) => [s, i]));
/** 待领取/评估中视图内的收窄：只看超时未评的（由「超时未评」卡下钻置上）。**横跨两个在队态** */
const onlyOverdue = ref(false);
/**
 * 「协同处理」——投诉单那一路的收口方式，**与升级 / 不升级并列的第三种结论**。
 * 🔴 它不是 `AssessDecision`（那个枚举归 store，只装评估二选一），
 * 故本页自己给它一个字面量，与那两枚摆在同一排上读。
 * 不摆出来的话，「今日已结论」与下面几枚决策之和会差一条，而那一条谁也找不出来在哪。
 */
const COORD_DECISION = '协同' as const;
type DecisionKey = AssessDecision | typeof COORD_DECISION;
/** 三枚决策：升级 / 不升级 来自 store 的枚举，协同是本页并列的第三种收口 */
const DECISION_KEYS = computed<DecisionKey[]>(() => [...ASSESS_DECISIONS, COORD_DECISION]);
/** 已评估视图内的收窄：只看某一个结论（由「今日决策」三枚按钮下钻置上） */
const decisionFilter = ref<DecisionKey | 'all'>('all');
/** 时限文案取参数、不写死：它与《【815】》催办规则读同一个值（§9 规则 14） */
const assessLimitText = computed(() =>
  REPORT_ASSESS_LIMIT_MIN % 60 === 0
    ? `${REPORT_ASSESS_LIMIT_MIN / 60} 小时`
    : `${REPORT_ASSESS_LIMIT_MIN} 分钟`,
);

/**
 * 来源排序。**同来源内仍按 tie 给的次序**——队列的默认口径是等待时长
 * （§5.3 元素 ④，等最久的在最上）；按来源排一次就把它整个丢掉的话，
 * 等了三天的那条会沉到某一组的中间，再也没人看得见。故来源只做分组，不做重排。
 */
function sortBySource(rows: RiskPoolItem[], tie: (a: RiskPoolItem, b: RiskPoolItem) => number) {
  if (sourceSort.value === 'none') return rows;
  const dir = sourceSort.value === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const d = ((SOURCE_ORDER.get(a.source) ?? 0) - (SOURCE_ORDER.get(b.source) ?? 0)) * dir;
    return d !== 0 ? d : tie(a, b);
  });
}
function cycleSourceSort() {
  sourceSort.value = sourceSort.value === 'none' ? 'asc' : sourceSort.value === 'asc' ? 'desc' : 'none';
}

function bySource(rows: RiskPoolItem[]) {
  return sourceFilter.value === 'all' ? rows : rows.filter((r) => r.source === sourceFilter.value);
}

/**
 * **本页的池行只数 A 线**（业务拍板 · 两条线各有各的家）。
 *
 * 【为什么要收窄】风险监控页这条漏斗从头到尾讲的是 A 线：自动识别 → 打标 → 入池 → 处置。
 * B 线（二线报备）不走打标这道门，它有自己的工作面 —— 工单工作台的「风险报备池」页签。
 * 两条线混在同一个分母里，左栏读下来就是「已标记 4 → 待处置 8」，
 * 像是同一批数据的两个阶段，而实际上那 8 条里有一半从来没经过上面那 4 条所在的那道门。
 *
 * 🔴 **收窄之后三个数会变小，这是对的**：少掉的那几条不是丢了，是回它自己的池子里去了。
 */
function isALine<T extends { source: MonitorSource }>(r: T): boolean {
  return r.source !== REPORT_SOURCE;
}

/** 在队某一态的底表：只过超时这一个条件，**不含来源**（来源 chip 的数字要靠它算） */
function openBase(v: 'unassigned' | 'assigning') {
  const all = v === 'unassigned' ? reportStore.unassignedQueue : reportStore.assigningQueue;
  const rows = all.filter(isALine);
  return onlyOverdue.value ? rows.filter((r) => reportStore.isOverdue(r)) : rows;
}

/** 待领取：还没人领的那一批，客诉专员在这里自领 */
const reportUnassignedRows = computed(
  () => sortBySource(bySource(inGroup(openBase('unassigned'))), (a, b) => a.at.localeCompare(b.at)),
);
/** 已领取：已被人领走、等结论 */
const reportAssigningRows = computed(
  () => sortBySource(bySource(inGroup(openBase('assigning'))), (a, b) => a.at.localeCompare(b.at)),
);

/**
 * 已评估视图**默认只看今日**（业务拍板 2026-09-09）。
 *
 * 【为什么必须限今日】上方「评估决策」两枚卡按 **自然日** 算（PRD §7 B4 窗口＝自然日，
 * 且 `B3 = B4 两档之和` 这条恒等式靠它成立）。若列表给全量，点「升级 1」下钻，
 * 卡是今日数、表是全量表，**同一块屏上两个数对不上** —— 与本文件开头那条
 * 「标签写着一个数、表里躺着另一批」是同一个坑。要看历史，把这个开关关掉。
 */
const assessedTodayOnly = ref(true);
function todayPrefix() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 一条已处理条目的**结论时刻 / 结论人**。
 *
 * 🔴 **三种收口方式各写各的字段**：走评估的落 `assessment`（升级 / 不升级）、
 * 走协同处理的落 `coordination`（投诉单那一路，评估意见 + 建议事项）、
 * 走核实打标的落 `verify`。只读 `assessment` 的话，**协同过的条目会整条从"仅今日"里被筛掉**，
 * 关掉开关才出现、且评估人与时刻两格显示「—」——那正是这张表最该说清的两件事。
 */
function concludedAtOf(r: RiskPoolItem) {
  return r.assessment?.at ?? r.coordination?.at ?? r.verify?.at ?? '';
}
function concludedByOf(r: RiskPoolItem) {
  return r.assessment?.by ?? r.coordination?.by ?? r.verify?.by ?? '';
}
function concludedByRoleOf(r: RiskPoolItem) {
  return r.assessment?.byRole ?? r.coordination?.byRole ?? r.verify?.byRole ?? '';
}

/** 已评估底表：今日开关 + 决策两个条件，**不含来源**（同上，来源 chip 的数字要靠它算） */
const assessedBase = computed(() => {
  let rows = reportStore.assessedList.filter(isALine);
  if (assessedTodayOnly.value) {
    const today = todayPrefix();
    rows = rows.filter((r) => concludedAtOf(r).startsWith(today));
  }
  if (decisionFilter.value === COORD_DECISION) {
    // 协同处理这一档判的是有没有 `coordination`，不是 `assessment` 的某个取值
    rows = rows.filter((r) => !!r.coordination);
  } else if (decisionFilter.value !== 'all') {
    // 归一化后再比：B 线的种子与它自己那份缓存里仍有旧词「接管」，
    // 直接比字面量的话，那一条在「升级」筛选下会凭空消失（见 riskShared.normalizeDecision）
    rows = rows.filter(
      (r) => r.assessment && normalizeDecision(r.assessment.decision) === decisionFilter.value,
    );
  }
  return rows;
});

/** 已评估列表：评估时刻倒序；今日开关、决策与来源筛选都是视图内条件 */
const reportAssessedRows = computed(
  // 已评估这批的默认次序是**评估时刻倒序**，与在队两态的"提交时刻正序"不是一回事，
  // 故 tie 单独给一份：套用队列那份会让刚评完的一条排到列表末尾去。
  () => sortBySource(
    bySource(inGroup(assessedBase.value)),
    (a, b) => concludedAtOf(b).localeCompare(concludedAtOf(a)),
  ),
);

/* ---- 页头右栏「评估处置」四卡：与左栏「待处置」同一个分母，一并收窄到 A 线 ---- */
//
// 🔴 **不收窄的话这一屏当场自相矛盾**：卡上写「待评估总数 8」、左栏写「待领取 3 · 已领取 2」，
// 点卡片落到的还是同一张表。同屏同一件事只能有一个数，这是本文件反复踩过的那个坑。
// 口径与 store 那几个 count 逐条对齐，差别只在多一道 `isALine`。
const alineUnassignedCount = computed(() => reportStore.unassignedQueue.filter(isALine).length);
const alineAssigningCount = computed(() => reportStore.assigningQueue.filter(isALine).length);
const alineOpenCount = computed(() => alineUnassignedCount.value + alineAssigningCount.value);
const alineOverdueCount = computed(
  () => [...reportStore.unassignedQueue, ...reportStore.assigningQueue]
    .filter((r) => isALine(r) && reportStore.isOverdue(r)).length,
);
const alineAssessedList = computed(() => reportStore.assessedList.filter(isALine));
/**
 * 今日**已结论**的池行数。
 *
 * 🔴 **口径是"下过任何一种收口结论"**，不是"走过评估"：只读 `assessment` 的话，
 * 走协同处理收口的那几条整条不算数 —— 卡上写「今日已评估 3」而左栏「已结论」是 4，
 * 同一块屏上两个数对不上，而差的那一条谁也找不出来在哪。改名「今日已结论」之后
 * 口径必须跟着扩，只改名不改口径比原来更难查（标题说结论、数字只数评估）。
 * 时刻取 `concludedAtOf`：评估 / 协同 / 核实各写各的字段，那个函数是三者的唯一入口。
 */
const alineConcludedTodayCount = computed(
  () => alineAssessedList.value.filter(
    (r) => concludedAtOf(r).startsWith(todayPrefix()) && decisionKindOf(r),
  ).length,
);
/**
 * 这一条是**哪一种收口**；null ＝ 只补过打标、还没给出结论。
 * 🔴 上面那个数与下面三枚**共用这一个判据**，恒等式因此是构造出来的、不是碰巧对上的：
 * 换两条独立的判断去数，迟早出现"卡上 4、三枚加起来 3"，而差的那一条谁也找不出来。
 *
 * 🔴 **只补过打标、还没给结论的池行（只有 `verify`、没有 `assessment` / `coordination`）
 * 返回 null —— 它既不计入「今日已结论」，也不计入下面那三枚结论 chip。这是有意为之，不是漏了一种。**
 *
 * 【为什么】`verify` 是打标反向派生出来的只读投影（见 `stores/riskQueue.ts` 与 `needsVerify`），
 * 它答的是"这条**成不成立**"，不是"这条**怎么收口**"。一条补完打标就停在那儿的行，
 * 还等着人给升级 / 不升级 / 协同 —— 把它算成一种收口，等于说这条已经处理完了。
 *
 * 【为什么两处共用这一个判据】「今日已结论」（`alineConcludedTodayCount`）与三枚 chip
 * （`alineDecisionCounts`）都拿 `decisionKindOf(r)` 非 null 当入选条件，于是
 * **「今日已结论」≡ 升级 + 不升级 + 协同 由构造成立**，不是靠事后对账对出来的。
 * 若哪天想把 verify-only 也数进「今日已结论」，改这一个函数不够——那会让卡上的数
 * 比三枚之和多出那几条，而多出的那一条谁也找不出来在哪；要动就得同时给它一枚自己的 chip。
 *
 * ⚠️ 漏斗改版之后 verify-only 在今天的数据上是**死路**（打标只决定进不进池、不再结掉条目，
 * 见 `stores/riskPool.ts` 的 `assessedList`）。真在数据上构造出来一条（旧缓存、或将来某条
 * 新入口只写了 `verify`），它会**落进「已结论」那张表**——`assessedBase` 按 `concludedAtOf`
 * 判，而那个函数兜到了 `verify.at`：表里看得见、两个数里不算数，是两件事，别当成不一致去"修"。
 */
function decisionKindOf(r: RiskPoolItem): DecisionKey | null {
  if (r.assessment) return normalizeDecision(r.assessment.decision);
  if (r.coordination) return COORD_DECISION;
  return null;
}
/** 今日三种收口各多少条。**三枚之和 ≡ 今日已结论** */
const alineDecisionCounts = computed(() => {
  const base: Record<DecisionKey, number> = { 升级: 0, 不升级: 0, [COORD_DECISION]: 0 };
  const today = todayPrefix();
  for (const r of alineAssessedList.value) {
    if (!concludedAtOf(r).startsWith(today)) continue;
    const k = decisionKindOf(r);
    if (k) base[k] += 1;
  }
  return base;
});

/**
 * 工作组 chip 那一排的底表 ＝ 当前态在**除工作组之外**的全部条件下的行。
 * 摘出工作组的道理与下面摘出来源的完全一样，见 `reportSourceBase`。
 */
const reportGroupBase = computed(() => {
  if (reportView.value === 'all') {
    // 第三段接不接，判据与 `reportAllRows` 完全一样（开着「超时未评」时整段不接）——
    // 两处必须同进同退：只改一处的话，表里躺着 3 行、下面「全部工作组 7 / 全部来源 7」，
    // 那两排 chip 当场变成同屏的第二个数
    return [
      ...openBase('unassigned'),
      ...openBase('assigning'),
      ...(onlyOverdue.value ? [] : assessedBase.value),
    ];
  }
  return reportView.value === 'assessed' ? assessedBase.value : openBase(reportView.value);
});

/**
 * 来源 chip 那一排的底表 ＝ 当前态在**除来源之外**的全部条件下的行。
 * 【为什么要把来源摘出去】让来源筛选影响自己那一排的数字，选中「投诉单」之后
 * 其余几枚全变 0，人再也看不出该切到哪一枚——筛选器把自己筛没了。
 * 工作组不摘：它是**另一层**筛选，选了组之后来源那一排本就该只数这个组里的条目。
 */
const reportSourceBase = computed(() => inGroup(reportGroupBase.value));
function sourceCountInView(s: MonitorSource) {
  return reportSourceBase.value.filter((r) => r.source === s).length;
}

/**
 * 「按处置阶段」不限阶段时的那一张表 ＝ 三段**按时间序首尾相接**，不重排。
 * 🔴 顺序即时间序（待领取 → 已领取 → 已结论），这是这一维与另两维（等级 / 标记人）
 * 唯一不同的地方：另两维的取值之间没有先后，这一维有。混排成一坨会把它抹掉。
 *
 * 🔴 **开着「超时未评」时第三段整段不接**：超时未评的判据是"**在队**且钟走过了时限"
 * （见 store 的 `isOverdue`），已结论的行按定义一条都不满足它。照接的话，从页头
 * 「超时未评 3」点进来会看到 3 条超时 + 今日已结论的那几条，卡上写 3、表里躺着七八行 ——
 * 正是本文件反复踩过的那个坑。摘掉之后行数 ≡ 卡上的数 ≡ 左栏那一行的数，三处同一个口径。
 * （在队两段各自的 `openBase` 已经过了同一个 `onlyOverdue`，这里只管第三段。）
 */
const reportAllRows = computed(() => [
  ...reportUnassignedRows.value,
  ...reportAssigningRows.value,
  ...(onlyOverdue.value ? [] : reportAssessedRows.value),
]);

//
// 🔴 **原先这里有一对 `poolStageTotal` / `poolStageCounts`**，给左栏「按处置阶段」那四行供数。
// 整对删掉了：那一轴已经改回与另两个轴同源（`pooledEntries`，见 `pooledStageCount`）。
// 【为什么必须搬走】它们数的是 `reportAllRows` —— **B 线那张池行表的行**（`RiskPoolItem`），
// 而另两个轴数的是**监控条目**（`RiskQueueEntry`）。两批对象描述的是同一批单，
// 但字段不同，于是：
//   ① 列跟着不同 —— 那张表摆的是报备人 / 报备原因 / 风险类型，而这三格对 A 线
//      **恒为「系统」/「其他」占位 / null**（见 `stores/riskShared.ts` 上的字段注释），
//      三个轴里有一个摆着三列假数据；
//   ② 合计随日期漂 —— 「已结论」那一份带着「仅今日」的默认收窄，跨天之后
//      这一轴从 12 掉到 8，而另两个轴纹丝不动。同屏三个本该恒等的数，有一个每天自己变。
// 「已标记」段三个轴是**同一批条目的三种看法**，同源才谈得上"数天然相等"。
//
const reportRows = computed(() => {
  if (reportView.value === 'all') return reportAllRows.value;
  if (reportView.value === 'unassigned') return reportUnassignedRows.value;
  if (reportView.value === 'assigning') return reportAssigningRows.value;
  return reportAssessedRows.value;
});

/**
 * 切视图内三态：把**阶段专属**的收窄条件摘掉，来源筛选保留（它是条目属性，跨阶段成立）。
 * 「超时未评」横跨待领取与评估中，故在这两态之间互切时不摘；进已评估才摘。
 */
function setReportView(v: ReportView) {
  if (v === reportView.value) return;
  const wasAssessed = reportView.value === 'assessed';
  reportView.value = v;
  // 不限阶段这一档跨越三段，两个阶段专属的收窄默认都摘掉：
  // 留着的话，「按处置阶段」那一行写着 4、表里却只躺着超时的那 1 条。
  // ⚠️ 摘的是**默认**，不是"这一档不许有超时收窄"：页头「超时未评」那张卡正是落到
  // 这一档 + 超时收窄上的，它在调用完本函数之后自己把 `onlyOverdue` 补回 true
  // （彼时左栏那一行的数与表里的行数一起收到 3，仍然相等）。见那枚卡上的注释。
  if (v === 'all') {
    onlyOverdue.value = false;
    decisionFilter.value = 'all';
    return;
  }
  if (v === 'assessed') onlyOverdue.value = false;
  else if (wasAssessed) decisionFilter.value = 'all';
}

/**
 * 风险工单池自己的翻页状态，**不与命中清单的 hitPageCurrent 共用**。
 * 两张表的行数各走各的（命中记录 vs 报备单），共用一个页码时
 * 「在命中清单翻到第 3 页 → 切到风险工单池」会看到一张空表，人只会以为池子清空了。
 */
const reportPageCurrent = ref(1);
const reportPageSize = ref(10);

const pagedReportRows = computed(() => {
  const start = (reportPageCurrent.value - 1) * reportPageSize.value;
  return reportRows.value.slice(start, start + reportPageSize.value);
});

function setReportPage(page: number, size: number) {
  reportPageCurrent.value = page;
  reportPageSize.value = size;
}

// 任一视图内条件变了，底表就换了一批，页码必须回到第一页——
// 否则「第 3 页 → 摘掉超时收窄」会停在一张恰好没有行的页上。
watch([reportView, onlyOverdue, decisionFilter, assessedTodayOnly, sourceFilter, sourceSort, groupFilter], () => {
  reportPageCurrent.value = 1;
});

/**
 * 等待时长的口径文案：分钟 → 小时 → 天，逐级换单位。
 * 全程写分钟的话，「1937 分钟」要人心算才知道是一天多，队列排序看的就是这一列。
 */
function waitedText(at: string) {
  const m = reportStore.waitedMinutes(at);
  if (m < 60) return `${m} 分钟`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} 小时`;
  return `${Math.floor(m / (60 * 24))} 天`;
}

// ---- 评估弹窗（§5.4）----
const assessOpen = ref(false);
const assessTarget = ref<RiskPoolItem | null>(null);
const assessDecision = ref<AssessDecision | ''>('');
const assessAdvice = ref('');
const assessTried = ref(false);

const missAssessDecision = computed(() => assessTried.value && !assessDecision.value);
const missAssessAdvice = computed(() => assessTried.value && !assessAdvice.value.trim());
const assessValid = computed(() => !!assessDecision.value && !!assessAdvice.value.trim());

/** 二选一决策各自必填文本的标签 */
const assessAdviceLabel = computed(() =>
  assessDecision.value === '升级' ? '升级说明' : '反馈意见',
);
const assessAdvicePlaceholder = computed(() => {
  switch (assessDecision.value) {
    case '不升级': return '告知报备人为什么不升级、可以怎么继续处理…';
    case '升级': return '写清升级理由与后续处置安排…';
    default: return '';
  }
});

/**
 * 选「升级」后那一行分流提示（O20）。
 *
 * ⚠️ **本页此前根本没有这一行** —— 文案与判据都在 `composables/useRiskReportAssess.ts`，
 * 工单页的 `OpRiskAssessModal` 接了它，本页那个弹窗从来没接上：同一个动作，
 * 在工单页告诉你"会派生一张新单、不可撤销"，在监控页什么都不说。
 * 现在两处都走 `escalateHintOf`，谁也没法只改一半。
 */
const escalateHint = computed(() => escalateHintOf(assessTarget.value?.ticketNo));

function openAssess(r: RiskPoolItem) {
  // 没人领过的条目谈不上"谁给的结论"（store 的 assess 也会拦），
  // 但拦在这里才说得出为什么——按钮本就只对「评估中」渲染，这道是兜底。
  if (r.status !== '评估中') { message.warning('该条目还没有人领取，请先领取再评估'); return; }
  assessTarget.value = r;
  assessDecision.value = '';
  assessAdvice.value = '';
  assessTried.value = false;
  assessOpen.value = true;
}

/**
 * 这一行是不是**预警词命中**捞进来的。
 * 用处只剩一个：把命中原话摆出来（另两类来源没有原话可摆）。
 * 🔴 **它已经不再决定这一行下一步做什么** —— 三类来源都要打标才进池，见 `needsVerify`。
 */
function isKeywordRow(r: RiskPoolItem) {
  return isVerifyMonitorSource(r.source);
}

/**
 * 这一行下一步该做什么。**判据是有没有 `tag`，不是来源、也不是 `verify.verdict`**。
 *
 * 【为什么换判据】漏斗改版之后**打标已经是进池的前置门槛**：能出现在池子里的 A 线条目
 * 必然带着一个低/中/高的 `tag`，B 线的报备单不走打标这道门。故本函数在今天的数据上
 * **恒为 false**，池内一律出「评估」按钮。留着它不删，是因为"进了池还没打标"这件事
 * 在数据上仍然构造得出来（旧缓存、或将来某条新入口漏了打标那一步），
 * 那时这一行要能自己说出"缺的是打标"，而不是把人送进一个填不出结论的评估弹窗。
 *
 * 旧判据 `verify.verdict === '成立'` 已作废：`verify` 是由 `tag` 反向派生的只读投影
 * （见 `stores/riskQueue.ts`），拿投影当判据等于绕一圈再问同一个问题。
 */
function needsVerify(r: RiskPoolItem) {
  return isKeywordRow(r) && !r.tag;
}

/**
 * 池内那条罕见的"没打标却进了池"如何收场：把它送回**条目打标弹窗**四选一。
 * 🔴 送回的是条目的打标，**不是命中核实** —— 入池门槛问的是"这张单有没有风险、多大"，
 * 而命中核实问的是"这次命中准不准"，后者答不了前者（见 `riskShared.ReportVerify`）。
 */
function openTagForReport(r: RiskPoolItem) {
  const entry = reportStore.queueEntryOf(r.id);
  if (!entry) {
    message.warning(`${r.ticketNo} 这一条不是自动识别的监控条目，不走风险打标`);
    return;
  }
  openEntryTag(rowOfEntry(entry));
}

/** 池行的处理动作：有 tag 的走评估，没有的先补打标 */
function handleReportRow(r: RiskPoolItem) {
  if (needsVerify(r)) openTagForReport(r);
  else openAssess(r);
}

// ---- 领取（池内唯一的认领动作）----
//
// 🔴 **分派 / 改派 / 批量分派三个动作整套取消**（业务第三轮拍板），本页因此少了一个弹窗、
// 一个批量菜单项与一列勾选框。
// 【为什么取消】① 指派让**投诉督导变成队列的单点**——他不在岗，这条队列谁也动不了，
// 而它卡的是投诉立项（基线 ※8a）；② 督导本轮已去权，只看数据、不出动作，
// 留一个只有他点得动的动作等于把队列锁在一个不再管这件事的人手上。
// 改成"谁有空谁领"之后，吞吐不再取决于某一个人在不在。
// 【与工单工作台「风险报备池」同一副骨架】那一页（RiskReportPoolPanel）也只有领取，
// 两个池子的动作集必须一致——同一条报备在两处能做的事不一样，人只会以为其中一处坏了。

/**
 * 领取权 ＝ **客诉专员**（评估这活儿本来就归他）+ 管理员兜底。
 *
 * 🔴 **投诉督导不在其中**：他在池子里**可见但不出动作**（本轮去权）。
 * 【为什么仍让他看见】他要看的是"队列有没有堆起来、有没有超时未评"——那是督导的活；
 * 而"这一条谁去评"已经不再经他手。看得见、点不动，正是这条口径在界面上的样子。
 */
const REPORT_CLAIM_ROLES: string[] = [
  'complaint-handler', 'system-admin', 'ops-admin', 'tenant-admin',
];
const canClaim = computed(() => REPORT_CLAIM_ROLES.includes(user.roleKey));

/** 领取一条：转「评估中」并落在自己名下，随后跳转工单详情做评估 */
function doClaim(r: RiskPoolItem) {
  // 文案按 `REPORT_CLAIM_ROLES` 的实际取值写：客诉专员 + 三个管理员 scope。
  // 写成"只有客诉专员"与上面那份角色表、与 `openCollab` 的「归客诉专员与管理员」都对不上——
  // 管理员点得动却被告知自己没权限，三处同源表述必须同时改。
  if (!canClaim.value) { message.warning('领取风险工单池的单归客诉专员与管理员'); return; }
  // 第三个实参是**领取那一刻的实际角色**，落在 `risk.report.claimed` 的正文落款上
  // （`riskPool.notifyClaimed`：不写死「客诉专员」——`REPORT_CLAIM_ROLES` 含三个管理员 scope）
  if (!reportStore.claim(r.id, user.name, user.role.name)) {
    // 唯一会落空的情形：别人刚刚把它领走了，本页还没重算
    message.warning('这一条刚被别人领走了，请刷新后再看');
    return;
  }
  message.success(`已领取 ${r.ticketNo}，正在打开工单详情…`);
  router.push({ path: `/tickets/${r.ticketNo}`, query: { tab: 'risk' } });
}

/**
 * 这一条能不能由**当前登录的人**给结论。
 * 【为什么按人而不只按角色】评估结论是提交即固化的（§9 规则 22），
 * 落款写的是承办人的名字；不是承办人却能点开提交，等于替别人签了字。
 * 督导看得见这一列，但这里恒为 false ——「可见但不出动作」就是靠它落地的。
 */
function canAssessRow(r: RiskPoolItem) {
  return canClaim.value && r.status === '评估中' && r.assignee === user.name;
}

/* ---- 释放：把**已领取**的条目退回池子（《【930】》PRD §5.4 元素 ⑩a / §5.5 / §5B.4）---- */

/**
 * **管理员兜底**（§5.5 ②）：可释放**任意**已领取条目，不限于自己承办的那一条。
 *
 * 🔴 **与 B 线报备池共用 `canReleaseAnyRiskReport` 这一份判据**（§5B.4「逐条同 §5.5」）——
 * 本页另写一份角色数组的话，同一个管理员在两个池上能不能释放会各说各的。
 *
 * ⚠️ **它不是 `canClaim` 的超集**：客诉专员只能退**自己领的**那一条，
 * 故这一枚只含三个管理员 scope（见 `views/tickets/types/ticket.ts` 的 `REPORT_POOL_ADMIN_ROLES`）。
 */
const canReleaseAny = computed(() => canReleaseAnyRiskReport(user.roleKey));

/**
 * 这一行出不出「释放」。**三道判据、缺一不可**（§5.5 ② ③）：
 *   ① **角色**：`canClaim`（客诉专员 + 三个管理员 scope）—— 投诉督导本轮已去权，
 *      两个池都只读，这一列对他恒为「—」（§5.4 元素 ⑪）；
 *   ② **状态**：仅「已领取」（落库值「评估中」）—— 待领取没有可退的东西、
 *      已结论不可回退（§9 规则 23：这条回边是四态里唯一的一条）；
 *   ③ **人**：承办人**本人**；管理员另可释放任意条目（②的兜底那一路）。
 *
 * 🔴 **这三道只是行上的可见性，不是最终门控**：store 侧 `riskPool.release` 各自再收一遍
 * （状态 / 原因非空 / 承办人本人），那一道拦的是"绕过表单直接调进来"。两道都要。
 */
function canReleaseRow(r: RiskPoolItem) {
  if (!canClaim.value) return false;
  if (r.status !== '评估中') return false;
  return r.assignee === user.name || canReleaseAny.value;
}

const releaseOpen = ref(false);
const releaseTarget = ref<RiskPoolItem | null>(null);
const releaseReason = ref('');
const releaseTried = ref(false);
/** 空白与全空格一律拦下（§5.5 ④），提示语按 PRD 原话写「请填写释放原因」 */
const missReleaseReason = computed(() => releaseTried.value && !releaseReason.value.trim());

/**
 * 「释放」——把已领取的条目**退回池子**（§5.5）。
 *
 * 🔴 **点开只填「释放原因」这一项**（§5.5 ④）：不选接手人、不改等级、不写结论 ——
 * 释放**不是换人**（§5.5 ①），弹窗里多摆任何一格都会让人以为自己正在把活指给谁。
 * 🔴 **照 B 线报备池那个释放弹窗做**（`RiskReportPoolPanel` 的 `rrp-release`）：
 * 同一个动作在两个池上是同一套版式与同一句提示文案，另造一版就是同一条口径两个样子。
 */
function openRelease(r: RiskPoolItem) {
  releaseTarget.value = r;
  releaseReason.value = '';
  releaseTried.value = false;
  releaseOpen.value = true;
}

function confirmRelease() {
  releaseTried.value = true;
  const target = releaseTarget.value;
  const reason = releaseReason.value.trim();
  if (!target || !reason) return;
  /*
   * 🔴 **走合并层的 `release`，不在本页自己改 store 里那个原对象**（与 `doClaim` 对称）：
   * 状态回「待领取」、承办人清空、条目上**累积**一条释放记录（释放人 · 角色 · 时刻 · 原因）、
   * 并撤掉 `claim` 埋下的那张"进工单页自动弹评估"的票 —— 四件事绑在 store 一处。
   * 就地改 `r.status` 只做得到其中一件，另外三件会静默地不发生。
   * 🔴 **本轮不发通知、不落 720 第八类履历**（§5.5 ⑦ ⑧ / §9 规则 32），两条都在 store 侧写死。
   */
  const ok = reportStore.release(target.id, {
    by: user.name,
    byRole: user.role.name,
    at: nowStamp(),
    reason,
    // 管理员兜底可释放任意已领取条目；客诉专员恒 false，store 侧照旧校验承办人本人
    anyAssignee: canReleaseAny.value,
  });
  if (!ok) {
    /*
     * 走到这里只有两种可能：条目已经不在「已领取」态（别人给了结论 / 已被释放过），
     * 或它不在本人名下而本人又不是管理员。**不写"不在你名下"一句了事** ——
     * 管理员释放的本来就是别人名下的条目（§5.5 ②），那句话对他恒为假。
     */
    message.warning('该条目已不在「已领取」态，或不在你名下，请刷新后再看');
    releaseOpen.value = false;
    return;
  }
  releaseOpen.value = false;
  message.success(`已释放 ${target.ticketNo}，退回风险工单池等人重新领取`);
}

/**
 * 历次释放记录，**最近一次在前**。没有被释放过时为空数组（§5.5 ⑥ 的留痕在这里读）。
 * 入参取**结构**而不是 `RiskPoolItem`：与 B 线报备池那一份同形，两处读的是同一格。
 */
function releasesOf(r: { releases?: RiskReleaseRecord[] }) {
  return [...(r.releases ?? [])].reverse();
}

/* ---- 协同处理：**投诉单那一路的工作面**（《【930】》§5.2 / §5C，基线 ※29）---- */

/**
 * 🔴 **池行按原单类型分工作面**：非投诉单 → 风险评估（升级 / 不升级）；
 * 投诉单 → **协同处理**（评估意见 + 建议事项）。
 *
 * 【为什么必须分】"升不升级成投诉单"对一张已经是投诉单的单**是个不成立的问题**——
 * PRD 在四处重复写死了这条（§2 摘要表 / §5.2 两处「投诉单不做风险评估」/ §9 池内分工作面），
 * 而本页此前对两类一律出「评估」，等于把投诉单送进一个它答不了的弹窗。
 *
 * 【为什么不要求先「领取」】协同不改工单、不占承办人这一格（`coordinate` 只在首次时
 * 顺手补 `assignee`），投诉单那一路本来就没有领取这一步 —— 工单页底栏那一枚
 * 「协同处理」按钮的出现条件也只是"本单是投诉单且在池里"，两处判据保持一致。
 *
 * 【为什么已结论的行也照给】同一张投诉单**可多次协同**（§5C.1 次数行），
 * 条目转「已结论」只表示它不再回待处理队列，不表示这张单不能再给意见。
 */
const collabOpen = ref(false);
const collabTarget = ref<RiskPoolItem | null>(null);
function openCollab(r: RiskPoolItem) {
  if (!canClaim.value) {
    message.warning('协同处理归客诉专员与管理员');
    return;
  }
  collabTarget.value = r;
  collabOpen.value = true;
}

/**
 * 待评估的这一条**来自哪条线**。判据取条目自带的身份标 `source`（B 线恒为「二线报备」），
 * 不看有没有 `tag` —— 那答的是"打没打标"，罕见的"进了池却没打标"会被误判成 B 线。
 *
 * 🔴 弹窗第一区块**按它分两种**（PRD §5.3.2）：
 * · A 线（风险工单池里的条目）→「**入池依据**」：风险等级 / 打标人 / 打标时刻 /
 *   打标备注 / 命中原话。这一组就是它被送来评估的全部理由。
 * · B 线（二线报备单）→「**报备信息**」：报备人 / 报备原因 / 风险类型 / 场景描述 / 附件。
 *
 * 【为什么必须分】两条线此前共用一张「报备信息」卡，A 线条目在「报备人」「原因」两格里
 * 显示的是 `riskQueue.autoEntry()` 补的**恒定占位**（系统（系统） / 其他）——A 线全程
 * 没有"报备人"这个角色，条目是系统捞进来的。占位摆在评估人面前，读起来像"有人报过一次
 * 却什么都没填"；而真正的入池理由（打标那一组）反倒缩在卡体里的一个子块。
 */
const assessTargetFromPool = computed(
  () => !!assessTarget.value && assessTarget.value.source !== REPORT_SOURCE,
);

/** 「本单另有」——风险词命中那一半。报备只挂非投诉单、命中多在投诉单，一期常为 0 */
const assessTargetHits = computed(() => {
  const no = assessTarget.value?.ticketNo;
  return no ? riskTags.ticketVerificationOf(no) : null;
});
/** 「本单另有」——历史报备那一半（已评估 + 已撤回，不含当前这条） */
const assessTargetHistory = computed(() => {
  const no = assessTarget.value?.ticketNo;
  return no ? reportStore.historyOf(no) : [];
});

/**
 * 打标进池的这一条，它凭什么被判有风险 —— 取本单最近的一条**风险词命中原话**。
 *
 * 【为什么要把原话捞出来】条目的 `desc` 只有一句"沟通记录命中风险词，已自动纳入实时监控"，
 * 说不出客户到底讲了什么。客诉专员要决定升不升级，得先看见那句话本身；
 * 只给「高危」这个结论，他等于在替别人的判断背书。
 *
 * 🔴 **不再要求命中"已核实成立"**：打标已经改成对**条目**四选一，命中的成立/误报
 * 不再是入池判据（见 `riskShared.ReportVerify`）。仍按成立筛的话，一条刚打完高危、
 * 但底下那几条命中还没人单独核实的条目，弹窗里这一块会整块消失——
 * 而它恰恰是这条条目被送来评估的全部理由。
 * 多条时取**命中时刻最近**的那条：弹窗里只摆得下一句，摆最新的那句。
 */
const assessTargetVerifiedHit = computed(() => {
  const t = assessTarget.value;
  if (!t?.tag || !isKeywordRow(t)) return null;
  const hits = riskTags.hitsOfTicket(t.ticketNo).slice().sort((a, b) => a.when.localeCompare(b.when));
  return hits.length ? hits[hits.length - 1] : null;
});

/** 原型：附件名为占位，点击触发浏览器下载 */
function downloadReportAttachment(name: string) {
  const blob = new Blob([`（原型演示）${name}\n`], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 「升级」派生出的新投诉单号（N2）。
 *
 * 走的是《【830】》已有的第一跳派生——原单落终态「已升级投诉」、整页只读 + 接管横幅、
 * 新单全量继承，**不新增动作、不新增状态**（基线 ※29）。故这里只负责给出新单的单号，
 * 原单那一路由 830 的既有链路走，本页一个字段都不往工单上写。
 *
 * 【为什么序号现算而不另存计数器】计数器与数据分家之后，撤回一条或整页刷新，
 * 就会再派发一次已经用过的单号；从现有数据里数一遍，序号永远跟着数据走。
 *
 * 🔴 **取已用号里的最大值 +1，不是数条数 +1**。数条数只有在号段从 1 起连续时才对：
 * 预置数据里已经存在 `IFLYTS-20260909-00007` 这一条，数条数会派出 00002，
 * 再来一条又是 00002 —— 两张单同号，而单号恰恰是这条链路上唯一的追溯凭据。
 */
function nextEscalatedNo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const prefix = `IFLYTS-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-`;
  const maxUsed = reportStore.reports.reduce((max, r) => {
    const no = r.assessment?.escalatedToNo;
    if (!no?.startsWith(prefix)) return max;
    const n = Number(no.slice(prefix.length));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxUsed + 1).padStart(5, '0')}`;
}

/**
 * 「升级」按**原单类型**分流（O20）：
 * - **非投诉单** → 走《【830】》第一跳派生，产出一张新投诉单；
 * - **投诉单** → 走基线 ※27「工单管控」，把这张单拿到客诉专员名下，**本单状态不变、不派生新单**。
 *
 * 投诉单那一路之所以不能派生：第二跳（内投→外投）的入口对来源＝热线 / IM / 小程序的
 * 投诉单本就置灰，点不动；硬派生还会撞业务原文自己的「一单到底」与「不重复建单」。
 */
function isComplaintTicket(ticketNo: string) {
  return ticketNo.startsWith('IFLYTS-');
}

function confirmAssess() {
  assessTried.value = true;
  const target = assessTarget.value;
  if (!target || !assessValid.value || !assessDecision.value) return;

  const escalate = assessDecision.value === '升级';
  const derive = escalate && !isComplaintTicket(target.ticketNo);
  const escalatedToNo = derive ? nextEscalatedNo() : undefined;

  /*
   * 派生要**真的造出一张单**，不能只发一个号：队列与工单页都能点这个号，
   * 只发号的话点开落的是静默回退的演示单——看到的是另一个客户的另一张投诉，
   * 而 PRD 写的是「新单全量继承本单信息」。
   */
  if (escalatedToNo) {
    // 造新单 + 记原单升级台账 + 让新单按来源② 回流「未标记 · 投诉单」，
    // 三件事绑在 `deriveEscalatedComplaint` 一处，与工单页那个评估入口共用
    deriveEscalatedComplaint({
      fromNo: target.ticketNo,
      no: escalatedToNo,
      assignee: user.name,
      reason: assessAdvice.value.trim(),
    });
  }

  reportStore.assess(target.id, {
    decision: assessDecision.value,
    advice: assessAdvice.value.trim(),
    // 只有派生这一路有新单号；不派生时不写这个字段，
    // 否则列表那格会渲染出一个点不开的空单号
    ...(escalatedToNo ? { escalatedToNo } : {}),
    by: user.name,
    byRole: user.role.name,
    at: nowStamp(),
  });

  assessOpen.value = false;
  if (escalatedToNo) {
    message.success(`已升级，已派生投诉单 ${escalatedToNo}`);
  } else if (escalate) {
    // 基线 ※29：结论这条语义上的「接管 / 接手」整体作废，只说这个动作实际做了什么
    message.success(`已升级 ${target.ticketNo}，请在工单上执行「工单管控」把本单转到自己名下`);
  } else {
    message.success('已提交结论：不升级');
  }
}
/** 命中台账才需要查询条：只有这批记录会被事后点查 */
const inLedger = computed(() => listView.value === 'judged');
const scope = computed<OpsScope>(() => 'all');
const scopeSelectGroups = getOpsScopeSelectGroups();
function filterScopeOption(input: string, option: { label?: string }) {
  const q = input.trim().toLowerCase();
  if (!q) return true;
  return (option.label ?? '').toLowerCase().includes(q);
}
function scopeTagPlaceholder(omittedValues: unknown[]) { return `+${omittedValues.length} 组`; }
function compactTagPlaceholder(omittedValues: unknown[]) { return `已选 ${omittedValues.length}`; }

// ---- 扫库记录（实时监控 + 手动筛查） ----
type ScanRunKind = 'realtime' | 'manual';
type ScanRunStatus = 'success' | 'failed' | 'abnormal';

interface ScanRun {
  id: string;
  /** 实时监控 · 手动筛查 */
  kind: ScanRunKind;
  /** 触发人：系统 或 坐席姓名 */
  triggerBy: string;
  startedAt: string;
  endedAt: string;
  status: ScanRunStatus;
  errorMessage?: string;
  /** 历史扫库记录里曾记下的筛选器名（本页已改为实时筛选，新执行不再写） */
  filterName?: string;
  /** 手动筛查：完整条件摘要；实时监控：扫描范围说明 */
  criteriaText?: string;
  /** 手动筛查 · 成功 */
  total?: number;
  fresh?: number;
  adopted?: number;
  highAdopted?: number;
  /** 实时监控 · 成功 */
  hitCount?: number;
  openCount?: number;
}

const SCAN_RUN_LS_KEY = 'flowos-risk-scan-runs';
/** 种子版本：变更 buildDefaultScanRuns() 时递增，强制刷新演示数据 */
const SCAN_RUN_SEED_VERSION = 4;
const SCAN_RUN_VERSION_KEY = 'flowos-risk-scan-runs-v';

/**
 * 扫库记录的时刻**按"距现在多久"生成**，不写死日历日。
 *
 * 🔴 **页头「扫描批次 / 命中记录」是按自然日切的流量指标**：种子若写死在某个过去的日子，
 * 这两个数就恒为 0，而旁边的「今日新增」走的是相对当下的条目时刻——一屏之内出现
 * 「今日新增 12 · 扫描批次 0 · 命中记录 0」，读起来像"今天没扫过却凭空多了 12 条"。
 * 命中那一路已在 `mock/opsReport.ts` 用整体平移解决（见 `anchorHitDates`），
 * 扫库这一路条数少、且只本页用，直接按偏移生成更直白。
 *
 * 【为什么今天那几条用"距现在多少分钟"而不是固定钟点】固定钟点（如今天 14:30）在
 * 早上打开页面时会落在**未来**，出现"下次执行已经执行过了"。按分钟回推则任何时候打开都成立。
 *
 * 🔴 **凡是被"按自然日切"的指标数到的那几条，一律不要用本函数，改用 `todayStamp`。**
 * 本函数只保证"不写死日期"，**不保证落在今天**：「240 分钟前」在凌晨 00:26 就落到昨天。
 * 页头「扫描批次」正是栽在这上面 —— 每天 00:00–06:00 归零，白天怎么看都是对的。
 * 现在只剩**手动筛查那三条**还用它：没有任何按自然日切的指标数手动筛查，
 * 它们凌晨落到昨天只影响扫库记录抽屉里的分日归组，不会让哪个数字掉档。
 * ⚠️ run-seed-14 的 400 分钟**超过 `TODAY_SPAN_MIN`（360）**，本来也换不过去 ——
 * 换了会被夹到零点上、与另两条的先后糊成一团。
 */
function scanStamp(minutesAgo: number): string {
  const d = new Date(Date.now() - minutesAgo * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
/** 第 n 天前的某个钟点（n ≥ 1 时不会落到未来，故可以写死钟点） */
function scanStampDaysAgo(days: number, hhmmss: string): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${hhmmss}`;
}

/**
 * 扫库记录演示样例 —— 覆盖实时监控 / 手动筛查 × 成功 / 失败 / 异常，
 * 以及「无新增」「有新增未并入」「有新增已并入」等结果口径。
 */
function buildDefaultScanRuns(): ScanRun[] {
  return [
    // —— 实时监控 · 今天三轮（页头「扫描批次」数的就是这三条） ——
    // 🔴 **这三条必须走 `todayStamp`，不能走 `scanStamp`**：页头「扫描批次」按自然日切，
    // 而 `scanStamp` 只保证"不写死日期"、**不保证落在今天** —— 「240 分钟前」在凌晨 00:26
    // 就落到昨天，三条全出今天的窗，卡上当场显示「扫描批次 0」。
    // 实测：00:26 时是 0，把时钟推到 14:29 立刻变回 3 —— 每天只在 00:00–06:00 发作，
    // 白天怎么看都是对的，故极难查。`todayStamp` 是 `agoStamp` 的不跨零点版本，
    // 整批按同一系数压进"今天已过的那一段"（先后与相对间隔不变），
    // 且今天已过满 6 小时后与 `agoStamp` 一字不差 —— 白天的演示形态零变化。
    // ⚠️ 传进去的分钟数**不得超过 `TODAY_SPAN_MIN`（360）**，超过的会被夹到零点上、先后糊成一团。
    { id: 'run-seed-01', kind: 'realtime', triggerBy: '系统', startedAt: todayStamp(35), endedAt: todayStamp(34), status: 'success', hitCount: 19, openCount: 15 },
    { id: 'run-seed-02', kind: 'realtime', triggerBy: '王坐席', startedAt: todayStamp(105), endedAt: todayStamp(104), status: 'success', hitCount: 19, openCount: 15 },
    { id: 'run-seed-03', kind: 'realtime', triggerBy: '系统', startedAt: todayStamp(240), endedAt: todayStamp(239), status: 'success', hitCount: 17, openCount: 12 },
    // —— 实时监控 · 前几天 ——
    { id: 'run-seed-04', kind: 'realtime', triggerBy: '系统', startedAt: scanStampDaysAgo(1, '14:00:00'), endedAt: scanStampDaysAgo(1, '14:00:06'), status: 'abnormal', errorMessage: '部分班组数据延迟，结果可能不完整', hitCount: 12, openCount: 8 },
    { id: 'run-seed-05', kind: 'realtime', triggerBy: '系统', startedAt: scanStampDaysAgo(1, '08:00:00'), endedAt: scanStampDaysAgo(1, '08:00:02'), status: 'failed', errorMessage: '实时扫描中断，请检查词表与连接' },
    { id: 'run-seed-06', kind: 'realtime', triggerBy: '系统', startedAt: scanStampDaysAgo(2, '18:00:00'), endedAt: scanStampDaysAgo(2, '18:00:05'), status: 'success', hitCount: 14, openCount: 9 },
    // —— 手动筛查 · 成功 ——
    { id: 'run-seed-07', kind: 'manual', triggerBy: '郑监控', startedAt: scanStamp(170), endedAt: scanStamp(168), status: 'success', filterName: '高危词专项', total: 47, fresh: 3, adopted: 2, highAdopted: 2 },
    { id: 'run-seed-08', kind: 'manual', triggerBy: '李文萍', startedAt: scanStamp(320), endedAt: scanStamp(316), status: 'success', total: 128, fresh: 0, adopted: 0 },
    { id: 'run-seed-09', kind: 'manual', triggerBy: '秦督导', startedAt: scanStampDaysAgo(1, '13:28:41'), endedAt: scanStampDaysAgo(1, '13:29:06'), status: 'success', total: 2, fresh: 0, adopted: 0 },
    { id: 'run-seed-10', kind: 'manual', triggerBy: '孙坐席', startedAt: scanStampDaysAgo(1, '16:20:44'), endedAt: scanStampDaysAgo(1, '16:24:01'), status: 'success', total: 86, fresh: 5, adopted: 4, highAdopted: 1 },
    { id: 'run-seed-11', kind: 'manual', triggerBy: '郑监控', startedAt: scanStampDaysAgo(1, '10:15:22'), endedAt: scanStampDaysAgo(1, '10:18:55'), status: 'success', filterName: '教育产线近30天', total: 203, fresh: 7, adopted: 6, highAdopted: 2 },
    { id: 'run-seed-12', kind: 'manual', triggerBy: '周坐席', startedAt: scanStampDaysAgo(2, '15:33:08'), endedAt: scanStampDaysAgo(2, '15:35:41'), status: 'success', total: 56, fresh: 3, adopted: 0 },
    { id: 'run-seed-13', kind: 'manual', triggerBy: '秦督导', startedAt: scanStampDaysAgo(2, '09:12:18'), endedAt: scanStampDaysAgo(2, '09:14:52'), status: 'success', filterName: '受理一组在办', total: 34, fresh: 2, adopted: 2, highAdopted: 1 },
    // —— 手动筛查 · 失败 ——
    { id: 'run-seed-14', kind: 'manual', triggerBy: '郑监控', startedAt: scanStamp(400), endedAt: scanStamp(400), status: 'failed', errorMessage: '词表服务超时，请稍后重试' },
    { id: 'run-seed-15', kind: 'manual', triggerBy: '秦督导', startedAt: scanStampDaysAgo(3, '17:05:33'), endedAt: scanStampDaysAgo(3, '17:05:34'), status: 'failed', errorMessage: '筛查执行失败，请稍后重试' },
  ];
}

function nowStamp(withSeconds = false): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return withSeconds ? `${base}:${p(d.getSeconds())}` : base;
}

function normalizeScanRun(raw: Record<string, unknown>): ScanRun {
  if (raw.kind === 'realtime' || raw.kind === 'manual') {
    // 已是新结构，原样放行。Record<string, unknown> 与 ScanRun 在 TS 看来没有重叠，
    // 这里的窄化依据是运行时的 kind 判断，故须经 unknown 中转。
    return raw as unknown as ScanRun;
  }
  const at = String(raw.at ?? nowStamp());
  return {
    id: String(raw.id ?? `run-${Date.now()}`),
    kind: 'manual',
    triggerBy: String(raw.by ?? '—'),
    startedAt: at,
    endedAt: at,
    status: 'success',
    filterName: raw.filterName as string | undefined,
    criteriaText: String(raw.criteriaText ?? ''),
    total: Number(raw.total ?? 0),
    fresh: Number(raw.fresh ?? 0),
    adopted: Number(raw.adopted ?? 0),
    highAdopted: Number(raw.highAdopted ?? 0),
  };
}

function loadScanRuns(): ScanRun[] {
  try {
    const ver = localStorage.getItem(SCAN_RUN_VERSION_KEY);
    if (Number(ver) !== SCAN_RUN_SEED_VERSION) {
      localStorage.setItem(SCAN_RUN_VERSION_KEY, String(SCAN_RUN_SEED_VERSION));
      localStorage.removeItem(SCAN_RUN_LS_KEY);
    }
    const raw = localStorage.getItem(SCAN_RUN_LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p) && p.length) {
        const runs = p.map((r) => normalizeScanRun(r as Record<string, unknown>));
        // 🔴 隔夜即作废：种子是按"距现在多久"生成的，缓存下来第二天再打开就全部落到昨天，
        // 页头「扫描批次」又回到 0 —— 与写死日历日是同一个病，只是晚一天发作。
        // 判据取"最新一条是不是今天"，而不是缓存写入时刻：人当天多次进出页面不该被清掉。
        const newest = runs.reduce((max, r) => (r.startedAt > max ? r.startedAt : max), '');
        if (newest.startsWith(todayPrefix())) return runs;
        localStorage.removeItem(SCAN_RUN_LS_KEY);
      }
    }
  } catch { /* ignore */ }
  return buildDefaultScanRuns();
}

const scanRuns = ref<ScanRun[]>(loadScanRuns());
const pendingManualRunId = ref<string | null>(null);
/**
 * 扫库记录按开始时刻倒序。数组本身只按写入顺序追加，种子里 8/26 那条排在 8/4 之后——
 * 直接取首条会把一条旧执行当成"上次执行"，这个时刻是人判断"数据新不新"的唯一依据，不能错。
 */
const scanRunsDesc = computed(
  () => [...scanRuns.value].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
);
const lastRefresh = computed(() => scanRunsDesc.value[0]?.endedAt ?? '—');

function persistScanRuns() {
  try { localStorage.setItem(SCAN_RUN_LS_KEY, JSON.stringify(scanRuns.value.slice(0, 50))); } catch { /* ignore */ }
}

function appendScanRun(run: ScanRun) {
  scanRuns.value = [run, ...scanRuns.value].slice(0, 50);
  persistScanRuns();
}

const runsOpen = ref(false);

const SCAN_KIND_LABEL: Record<ScanRunKind, string> = { realtime: '实时监控', manual: '手动筛查' };
const SCAN_STATUS_LABEL: Record<ScanRunStatus, string> = { success: '成功', failed: '失败', abnormal: '异常' };

function scanRunResultText(r: ScanRun): string {
  const filterTag = r.filterName ? `${r.filterName} · ` : '';
  if (r.status === 'failed') return r.errorMessage ?? '执行失败';
  if (r.status === 'abnormal') {
    const hint = r.errorMessage ?? '执行异常';
    if (r.kind === 'realtime' && r.hitCount != null) {
      return `${hint}（发现 ${r.hitCount} · 待核实 ${r.openCount ?? 0}）`;
    }
    return hint;
  }
  if (r.kind === 'realtime') {
    return `${filterTag}发现 ${r.hitCount ?? 0} · 待核实 ${r.openCount ?? 0}`;
  }
  const parts = [`扫出 ${r.total ?? 0}`, `新命中 ${r.fresh ?? 0}`];
  if (r.adopted) parts.push(`并入 ${r.adopted}${r.highAdopted ? `（高危 ${r.highAdopted}）` : ''}`);
  else if (r.fresh) parts.push('未并入');
  else parts.push('无新增风险');
  return filterTag + parts.join(' · ');
}

// ---- 手动批量筛查 ----
// 选范围 + 选词 → 对存量工单跑一遍 → 结果**就在同一张命中清单里**呈现 → 人确认后并入。
//
// 【为什么不用侧边抽屉】抽屉把结果放进另一张表，与命中清单割裂——同一批数据两套表头、
// 两套操作。改为沿用工作台的 query-filters 就地筛选条：条件在清单上方展开，
// 结果直接渲染进清单本体，列与交互完全一致。
//
// 【为什么仍保留"确认并入"】筛查是对存量的一次性扫描，「孩子」那类词一扫上百条，
// 直接入库会把待核实队列淹没且不可逆。故结果先以「待并入」态呈现在清单里，勾选后才落。
const scanBarOpen = computed(() => listView.value === 'scan');
const scanning = ref(false);
const scanResult = ref<ScanResultRow[] | null>(null);
/** 结果里勾选要入库的行；重复项默认不勾 */
const scanPicked = ref<Set<string>>(new Set());
/**
 * 已确认入库的筛查命中，与实时命中并入同一份清单。
 * 放 store 而不是本组件：工单页算工单级等级时要看的是同一份清单，
 * 留在组件里的话筛查并入的那几条对工单页不存在，两边会算出两个等级。
 */
const scanAdopted = computed(() => riskTags.adoptedHits);
/** 清单当前是不是在展示筛查结果 */
const inScanResult = computed(() => scanResult.value !== null);

function today(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const scanForm = ref<ScanCriteria>(defaultScanCriteria({ to: today() }));

const scanProductNameOptions = computed(() => {
  const cats = scanForm.value.productCategories;
  if (!cats.length) {
    return [...new Set(Object.values(PRODUCT_NAMES).flat())];
  }
  return [...new Set(cats.flatMap((c) => PRODUCT_NAMES[c] ?? []))];
});

watch(
  () => scanForm.value.productCategories,
  (cats) => {
    const allowed = cats.length
      ? [...new Set(cats.flatMap((c) => PRODUCT_NAMES[c] ?? []))]
      : [...new Set(Object.values(PRODUCT_NAMES).flat())];
    scanForm.value.productNames = scanForm.value.productNames.filter((n) => allowed.includes(n));
  },
);

function buildScanPresetRange(days: number): [Dayjs, Dayjs] {
  const end = dayjs().startOf('day');
  const start = end.subtract(days - 1, 'day');
  return [start, end];
}

const scanRangePresets = computed(() => [
  { label: '最近一周', value: buildScanPresetRange(7) },
  { label: '最近一个月', value: buildScanPresetRange(30) },
  { label: '最近三个月', value: buildScanPresetRange(90) },
]);

const scanDateRange = computed((): [Dayjs, Dayjs] | undefined => {
  const { from, to } = scanForm.value;
  if (!from || !to) return undefined;
  return [dayjs(from), dayjs(to)];
});

function onScanDateRangeChange(
  dates: [Dayjs, Dayjs] | [string, string] | null,
  dateStrings: [string, string],
) {
  if (!dates?.[0] || !dates?.[1]) {
    scanForm.value.from = '';
    scanForm.value.to = '';
    return;
  }
  scanForm.value.from = dateStrings[0] || dayjs(dates[0]).format('YYYY-MM-DD');
  scanForm.value.to = dateStrings[1] || dayjs(dates[1]).format('YYYY-MM-DD');
}


/**
 * 切页签。页签、KPI 卡、页头每一处可点的数字**全部走这里**，
 * 保证"换一批数据"这件事只有一套语义：
 *   ① 进命中台账时把查询条复位到默认 30 天窗口，视图内互切则保留已填条件；
 *   ② 离开手动筛查时把**筛查结果态**清掉，见下；
 *   ③ 单工单焦点与条目勾选都不跨页签留存，见下。
 */
function setListView(v: ListView) {
  if (v === 'judged' && listView.value !== 'judged') resetLedgerFilter();
  // 离开手动筛查即退出筛查结果态。
  // scanResult 是清单数据源的最高优先级分支（filteredRows 首行就判 inScanResult），
  // 留着它的话，切到实时监控后表里躺的还是那批**尚未并入**的筛查行、
  // 头上还挂着「结果尚未并入，勾选后确认」的横幅——页签写着实时监控，内容却是另一批数据，
  // 而且刷新前一直如此。这与"两套状态机分叉"是同一类错，只是这次分叉在数据源上。
  //
  // 🔴 清的只是**尚未并入**的预览态。已点过「并入清单」的那些命中在 riskTags store 里，
  // 它们已经是清单的一部分（scanAdopted），与筛查结果态是两回事，一条都不动。
  if (v !== 'scan' && listView.value === 'scan') exitScanResult();
  // 单工单焦点跨视图取数，切视图时若留着它，页签写着一个数而表里躺着别的一批
  clearTicketFocus();
  // 条目勾选同理：离开实时监控再回来，「批量操作」上还挂着一个数，人不知道那几条是哪几条
  if (v !== 'realtime' && listView.value === 'realtime') clearBulk();
  listView.value = v;
  if (v === 'scan') applyScanLive();
}

function applyScanLive() {
  if (!scanForm.value.from || !scanForm.value.to) {
    scanResult.value = [];
    scanPicked.value = new Set();
    return;
  }
  const rows = runManualScan(scanForm.value, {
    words: localWords.value,
    adopted: scanAdopted.value,
  });
  scanResult.value = rows;
  scanPicked.value = new Set(rows.filter((r) => !r.duplicated).map((r) => r.hit.id));
}

let scanLiveTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  [scanForm, listView],
  () => {
    if (listView.value !== 'scan' || scanning.value) return;
    if (scanLiveTimer) clearTimeout(scanLiveTimer);
    scanLiveTimer = setTimeout(applyScanLive, 180);
  },
  { deep: true },
);

function doScan() {
  /*
   * 建单时间区间不允许无界（PRD §8.3.1 / §9 规则 42）。
   *
   * 【为什么单挑这一个维度拦】其余八维留空的含义是"不限"，扫出来无非多几条；
   * 时间留空却是**对全库做一次扫描**——而这个功能的产出是"新命中"，
   * 「孩子」那类通用词一扫上百条，一次失手就把待核实队列淹没，且并入之后收不回来。
   *
   * 【为什么日期控件已经不给清除、这里还要再拦一道】去掉清除按钮只挡住了鼠标那一条路：
   * 条件还会被套用筛选器、被重置逻辑、被将来任何一处新入口整体灌进来。
   * 守卫必须落在"执行"这个唯一出口上，而不是落在某一个控件上。
   */
  if (!scanForm.value.from || !scanForm.value.to) {
    message.warning('请先选定建单时间区间的起止日期，筛查不支持不限时间');
    return;
  }
  scanning.value = true;
  const t0 = Date.now();
  const startedAt = nowStamp(true);
  try {
    applyScanLive();
    const rows = scanResult.value ?? [];
    const runId = `run-${Date.now()}`;
    pendingManualRunId.value = runId;
    // 模拟扫描耗时，避免开始/结束时刻完全相同
    const elapsed = Math.max(800, Date.now() - t0);
    const endedAt = dayjs(t0 + elapsed).format('YYYY-MM-DD HH:mm:ss');
    appendScanRun({
      id: runId,
      kind: 'manual',
      triggerBy: user.current.name,
      startedAt,
      endedAt,
      status: 'success',
      // 套用了哪个筛选器要记下来：事后翻扫库记录，「按什么扫的」靠它才答得出，
      // 手工调过条件的执行则不记名（appliedFilterName 在条件被改动的那一刻就清掉了）。
      filterName: appliedFilterName.value ?? undefined,
      criteriaText: scanSummary.value,
      total: rows.length,
      fresh: rows.filter((r) => !r.duplicated).length,
      adopted: 0,
      highAdopted: 0,
    });
  } catch {
    appendScanRun({
      id: `run-${Date.now()}`,
      kind: 'manual',
      triggerBy: user.current.name,
      startedAt,
      endedAt: dayjs(t0 + Math.max(500, Date.now() - t0)).format('YYYY-MM-DD HH:mm:ss'),
      status: 'failed',
      errorMessage: '筛查执行失败，请稍后重试',
      criteriaText: scanSummary.value,
    });
    message.error('筛查执行失败');
  } finally {
    scanning.value = false;
  }
}

function toggleScanPick(id: string) {
  const s = new Set(scanPicked.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  scanPicked.value = s;
}

/** 已在清单中的行 id——这些在结果里置灰、不可勾，避免同一条记两遍 */
const scanDupIds = computed(
  () => new Set((scanResult.value ?? []).filter((r) => r.duplicated).map((r) => r.hit.id)),
);
const scanFreshCount = computed(() => (scanResult.value ?? []).filter((r) => !r.duplicated).length);
const scanDupCount = computed(() => (scanResult.value ?? []).filter((r) => r.duplicated).length);
const scanAllPicked = computed(() => {
  const list = (scanResult.value ?? []).filter((r) => !r.duplicated);
  return list.length > 0 && list.every((r) => scanPicked.value.has(r.hit.id));
});
function toggleScanPickAll() {
  const list = (scanResult.value ?? []).filter((r) => !r.duplicated);
  scanPicked.value = scanAllPicked.value ? new Set() : new Set(list.map((r) => r.hit.id));
}

function adoptScan() {
  const picked = (scanResult.value ?? []).filter((r) => scanPicked.value.has(r.hit.id));
  if (!picked.length) { message.warning('请先勾选要并入清单的命中'); return; }
  const known = new Set(scanAdopted.value.map((h) => h.id));
  const fresh = picked.map((r) => r.hit).filter((h) => !known.has(h.id));
  // 先补条目、再并命中：补条目时记下「并入时刻 ＝ 进监控时刻」与「由手动筛查并入」（§5A.1 ④）；
  // 顺序反过来的话，并命中触发的自动补齐会先按命中时刻补一条不带并入痕迹的条目
  riskQueue.adoptScanTickets([...new Set(fresh.map((h) => h.ticketNo))], nowStamp());
  riskTags.adoptHits(fresh);
  // 回填到本次任务记录：结果陈述靠它
  const runId = pendingManualRunId.value;
  if (runId) {
    scanRuns.value = scanRuns.value.map((r) => (
      r.id === runId
        ? {
            ...r,
            adopted: (r.adopted ?? 0) + fresh.length,
            highAdopted: (r.highAdopted ?? 0) + fresh.filter((h) => h.level === '高').length,
          }
        : r
    ));
    persistScanRuns();
  }
  // 陈述实际入库条数而不是勾选条数：两者不等时（勾的已经在清单里）报勾选数就是句假话，
  // 人会以为这批已经进队列了，回头在待核实里找不到又说不清哪儿丢的。
  if (!fresh.length) {
    message.info('所勾选的命中都已在清单中，本次没有新增');
  } else {
    message.success(`已并入 ${fresh.length} 条命中，可按等级处置`);
  }
  exitScanResult();
}

/** 退出筛查结果态，清单回到常规命中 */
function exitScanResult() {
  scanResult.value = null;
  scanPicked.value = new Set();
  pendingManualRunId.value = null;
}

function resetScanForm() {
  scanForm.value = defaultScanCriteria({ to: today() });
  // 重置的是条件本身，套用关系跟着一起断：条件都换回默认了还挂着筛选器名，
  // 这次执行会被记到那个筛选器名下，事后照名字复现不出同一批结果。
  appliedFilterName.value = null;
}

/** 条件摘要（人话）——扫完看到数字得知道是按什么扫的，筛选器 chip 的悬停说明也用它 */
function criteriaSummaryOf(f: ScanCriteria): string {
  const parts: string[] = [];
  parts.push(f.groupIds.length ? `${f.groupIds.length} 个班组` : '全中心');
  parts.push(`${f.from} 至 ${f.to}`);
  parts.push(f.wordIds.length ? `${f.wordIds.length} 条词` : '全部启用中的词');
  parts.push(f.matchScopes.length ? f.matchScopes.join('/') : '按词表范围');
  parts.push(f.nodeStatuses.length
    ? (f.nodeStatuses.length <= 3 ? f.nodeStatuses.join('/') : `${f.nodeStatuses.length} 个子状态`)
    : '不限状态');
  if (f.ticketTypes.length) parts.push(f.ticketTypes.join('/'));
  if (f.businessTypes.length) parts.push(f.businessTypes.join('/'));
  if (f.productCategories.length) parts.push(f.productCategories.join('/'));
  if (f.productNames.length) parts.push(f.productNames.join('/'));
  return parts.join(' · ');
}
const scanSummary = computed(() => criteriaSummaryOf(scanForm.value));

// ---- 已保存筛选器（PRD §6.3.4） ----
// 专项排查的常态是「每周照同样的条件跑一遍」。九个维度每次重填，慢是其次——
// 漏勾的那一项不会报错，只会让这周扫出的条数与上周对不上，而人还以为是数据变了。
// 条件存得下来，这次与上次才是同一把尺子。
//
// 【为什么点 chip 就直接执行，不是"先套用再点开始"】拆成两步，人每周都要多点一次；
// 而套用与执行之间本来就没有需要再确认的东西——要改条件的人根本不会去点 chip。
//
// 【为什么同名覆盖而不是追加】筛选器是靠名字被认出来的。允许两条「教育线安全事故专项」，
// 下次点的人无从判断哪条是调过的那一条，结果是两条都不敢用，等于一条都没存。
//
// 【为什么与工作台的「保存筛选器」各存各的】两者绑的条件结构完全不同——工作台绑工单查询条件，
// 这里绑九个筛查维度。共用一份存储，套过来的条件在对面一项也对不上。
interface SavedScanFilter {
  id: string;
  name: string;
  criteria: ScanCriteria;
}

function cloneCriteria(c: ScanCriteria): ScanCriteria {
  // 数组逐个复制：直接引用的话，存下来之后人再动一下多选框，
  // 已保存的那条会跟着一起变——存的东西会被后来的操作偷偷改写，这是最难查的一类错。
  return {
    ...c,
    groupIds: [...c.groupIds],
    wordIds: [...c.wordIds],
    matchScopes: [...c.matchScopes],
    nodeStatuses: [...c.nodeStatuses],
    ticketTypes: [...c.ticketTypes],
    businessTypes: [...c.businessTypes],
    productCategories: [...c.productCategories],
    productNames: [...c.productNames],
  };
}

/** 两套条件是不是同一把尺子。多选项比较前先排序：勾选先后不改变条件本身 */
function sameCriteria(a: ScanCriteria, b: ScanCriteria): boolean {
  const key = (c: ScanCriteria) => JSON.stringify([
    c.from, c.to,
    [...c.groupIds].sort(), [...c.wordIds].sort(), [...c.matchScopes].sort(),
    [...c.nodeStatuses].sort(), [...c.ticketTypes].sort(), [...c.businessTypes].sort(),
    [...c.productCategories].sort(), [...c.productNames].sort(),
  ]);
  return key(a) === key(b);
}

/**
 * 起手就有的两条专项条件——扫库记录里「高危词专项」「教育产线近30天」两次执行正是按它们跑的。
 * 记录里记着名字、条件却找不回来，那两次扫描就复现不了，而「按什么扫的」正是记录存在的理由。
 */
function seedSavedFilters(): SavedScanFilter[] {
  return [
    {
      id: 'sf-high-words',
      name: '高危词专项',
      criteria: defaultScanCriteria({ to: today(), wordIds: ['w1', 'w3', 'w4'] }),
    },
    {
      id: 'sf-edu-30d',
      name: '教育产线近30天',
      criteria: defaultScanCriteria({ from: today(-29), to: today(), groupIds: ['edu'] }),
    },
  ];
}

const savedFilters = ref<SavedScanFilter[]>(seedSavedFilters());
/** 当前条件是套用哪条筛选器来的。扫库记录的「所用规则」记的就是它，手工调过即为空 */
const appliedFilterName = ref<string | null>(null);

// 条件一旦被人改动，套用关系当场作废。留着名字的话，本次执行会被记到那个筛选器名下，
// 而它扫的其实是另一套条件——事后照名字复现，出来的是第三批结果。
watch(scanForm, () => {
  const name = appliedFilterName.value;
  if (!name) return;
  const f = savedFilters.value.find((x) => x.name === name);
  if (!f || !sameCriteria(f.criteria, scanForm.value)) appliedFilterName.value = null;
}, { deep: true });

const filterSaveOpen = ref(false);
const filterNameDraft = ref('');
/** 命名与已有的撞上时先说清「会覆盖」，别让人保存完才发现旧的没了 */
const filterNameTaken = computed(() => {
  const name = filterNameDraft.value.trim();
  return !!name && savedFilters.value.some((f) => f.name === name);
});

function openSaveFilter() {
  // 存一条起止为空的条件，等于把一次全库扫描做成一键可复发的按钮——比手工失手更危险
  if (!scanForm.value.from || !scanForm.value.to) {
    message.warning('请先选定建单时间区间的起止日期，再保存筛选器');
    return;
  }
  filterNameDraft.value = appliedFilterName.value ?? '';
  filterSaveOpen.value = true;
}

function confirmSaveFilter() {
  const name = filterNameDraft.value.trim();
  if (!name) { message.warning('请为这条筛选器命名'); return; }
  if (!scanForm.value.from || !scanForm.value.to) {
    message.warning('请先选定建单时间区间的起止日期，再保存筛选器');
    return;
  }
  const criteria = cloneCriteria(scanForm.value);
  const idx = savedFilters.value.findIndex((f) => f.name === name);
  if (idx >= 0) {
    // 覆盖保留原 id：chip 的位置不动，人下次还在原地找得到它
    const next = [...savedFilters.value];
    next[idx] = { ...next[idx], criteria };
    savedFilters.value = next;
    message.success(`已用当前条件覆盖筛选器「${name}」`);
  } else {
    savedFilters.value = [...savedFilters.value, { id: `sf-${Date.now()}`, name, criteria }];
    message.success(`已保存筛选器「${name}」，点它即按此条件筛查`);
  }
  appliedFilterName.value = name;
  filterSaveOpen.value = false;
}

/** 套用即执行：条件整套灌回表单，随即跑一次 */
function applySavedFilter(f: SavedScanFilter) {
  if (scanning.value) return;
  scanForm.value = cloneCriteria(f.criteria);
  // 先落名字再执行：doScan 要拿它记进扫库记录
  appliedFilterName.value = f.name;
  doScan();
}

/**
 * 删除。PRD 只写了「chip 上直接删」，但它是必需的：存了删不掉，chip 行会越积越长，
 * 常用的那两条被埋在一堆一次性条件里，等于把这个功能自己用废。
 */
function removeSavedFilter(f: SavedScanFilter) {
  savedFilters.value = savedFilters.value.filter((x) => x.id !== f.id);
  if (appliedFilterName.value === f.name) appliedFilterName.value = null;
  message.success(`已删除筛选器「${f.name}」`);
}

// ---- 命中列表 ----
const allHits = computed(() => {
  const live = wordOnlyRiskHitsOf(scope.value);
  if (!scanAdopted.value.length) return live;
  return [...live, ...scanAdopted.value].sort((a, b) => b.when.localeCompare(a.when));
});
const rows = computed(() => allHits.value);
/** 这条是不是手动筛查并进来的——列表上标一下，来源要可追 */
function isFromScan(h: RiskHit): boolean {
  return h.id.startsWith('scan-');
}

// ---- 命中原文片段：取窗与高亮 ----
// 【为什么要取窗】`excerpt` 存的是**命中字段的全文**——手动筛查那条路径尤其明显，
// 一整段沟通记录原样进来。整段直出有两个后果：表格行被撑爆，且复核的人得在一大段里
// 自己找命中词在哪，而他点开这一行要看的恰恰就是那一句。
//
// 【为什么截在渲染层而不截数据层】数据层留全文，截过的原文是收不回来的：
// 悬停看全文、将来的"展开原文"都要靠它。取窗是纯函数、无副作用，重算的代价远小于丢原文。
//
// 【为什么锚在 matchedWord 而不是 word】`word` 是规则主词，实际命中的可能是它的同义词，
// 主词根本不在原文里（「曝光」命中的是「媒体」）——拿主词去定位一无所获，还会走进兜底分支。
/** 命中词前后各取的字数：两侧合计 80 字上下，够读出一句话的语气，又不至于撑爆表格行 */
const EXCERPT_CONTEXT = 40;
/** 命中词在原文里找不到时的兜底长度：只取开头，不假装知道命中在哪 */
const EXCERPT_FALLBACK = 80;

interface ExcerptWindow {
  /** 命中词之前的上文 */
  before: string;
  /** 命中词本身。兜底分支为空串，此时整段不高亮 */
  hit: string;
  /** 命中词之后的下文 */
  after: string;
  /**
   * 该侧被截断了没有。**只有被截的一侧才加省略号**——
   * 两侧一律加的话，人会以为一句完整的短句前后还有没显示出来的内容。
   */
  headTruncated: boolean;
  tailTruncated: boolean;
}

/**
 * 取窗结果按「命中词 + 全文」缓存。
 * 模板里 before / hit / after / 两个截断标记各读一次，一行就是五次调用；
 * 缓存让这五次拿到同一个对象，也免得同一份文本被反复切五遍。
 */
const excerptWindowCache = new Map<string, ExcerptWindow>();

/** 以命中词为中心切一段可读的上下文，供命中清单与打标弹窗共用（三处一份口径） */
function excerptWindow(h: RiskHit): ExcerptWindow {
  const text = h.excerpt ?? '';
  const term = h.matchedWord ?? '';
  const key = `${term}\u0000${text}`;
  const cached = excerptWindowCache.get(key);
  if (cached) return cached;
  // 命中词出现多次时以**第一次**为中心：客户把话说重是从第一次开始的，
  // 后几次是重复，从第一次起读才读得出这句话是怎么起来的。
  const at = term ? text.indexOf(term) : -1;
  let win: ExcerptWindow;
  if (at < 0) {
    // 兜底：matchedWord 与原文对不上（两者不同源，数据可能不一致）。
    // 此时不猜位置、不报错、更不留空白——照直给开头一段，人至少还看得到原文。
    win = {
      before: text.slice(0, EXCERPT_FALLBACK),
      hit: '',
      after: '',
      headTruncated: false,
      tailTruncated: text.length > EXCERPT_FALLBACK,
    };
  } else {
    // 原文不足窗口长度就取到头/尾为止，不补白：省略号只表示"这一侧还有没显示的内容"
    const start = Math.max(0, at - EXCERPT_CONTEXT);
    const end = Math.min(text.length, at + term.length + EXCERPT_CONTEXT);
    win = {
      before: text.slice(start, at),
      hit: text.slice(at, at + term.length),
      after: text.slice(at + term.length, end),
      headTruncated: start > 0,
      tailTruncated: end < text.length,
    };
  }
  excerptWindowCache.set(key, win);
  return win;
}

const GRADE_ORDER: Record<RiskLevel, number> = { 高: 0, 中: 1, 低: 2 };

// ---- 同单互见（PRD §6.7 / 规则 26b） ----
// 一行还是一条命中，**不按工单合并**：一条规则一条证据，各自独立核实、各自回填准确率。
// 合并成一行会让其中一条永远拿不到结论，那条规则的准确率就永远算不出来。
//
// 🔴 但不合并 ≠ 互不相干。客户从「退一赔三」升级到「12315」是**措辞在爬坡**，
// 比一个客户单次说 12315 严重得多——而这个判断只有把两条摆在一起才做得出来。
// 核实第二条的人若看不到第一条判成了什么，他手上的信息就只有孤零零一句威胁，
// 于是把一次升级当成一次寻常抱怨。故行内标「本单另有 N 条」、打标弹窗顶部列同单结论。
const hitsByTicket = computed(() => {
  const m = new Map<string, RiskHit[]>();
  rows.value.forEach((h) => {
    const list = m.get(h.ticketNo);
    if (list) list.push(h);
    else m.set(h.ticketNo, [h]);
  });
  // 同单内按命中时刻正序：爬坡是一条时间线，倒着读读不出"先说了什么、后说了什么"
  m.forEach((list) => list.sort((a, b) => a.when.localeCompare(b.when)));
  return m;
});
function ticketHitsOf(no: string): RiskHit[] {
  return hitsByTicket.value.get(no) ?? [];
}
/** 同一张单上除本条外的其它命中，供打标弹窗对照 */
function siblingsOf(h: RiskHit): RiskHit[] {
  return ticketHitsOf(h.ticketNo).filter((x) => x.id !== h.id);
}
function siblingCountOf(h: RiskHit): number {
  return Math.max(0, ticketHitsOf(h.ticketNo).length - 1);
}

/**
 * 工单级风险等级 ＝ **两维口径，须一起读、不得混成一句**
 * （《【915】风险监控 PRD》v0.9 §3.2 / §9 规则 13a、《【930】风险报备 · 监控 · 管控 PRD》v3.4 §5A.3）：
 *   · **跨条目 / 跨命中取最高** ＝ max(该单已打标条目的等级, 该单已核实且成立的命中的等级)。
 *     误报的、未核实的、打为「无风险」的、尚未打标的**都不参与**；一条都不参与时取**空**。
 *   · **同一条条目 / 命中内以最新结论为准**：一条只占一格，改判**覆盖该格、可升可降**、须填原因；
 *     改判为「无风险」**清空该格**。
 * ⚠️ 第三句并存、管的是另一件事：**打标记录累积、不覆盖**（改判 N 次就有 N + 1 条记录）。
 * 这几条口径与实现，连同"纯派生不落库"，都在 useRiskTagStore.ticketGradeOf，注释也在那里。
 *
 * 【为什么挪去 store】工单处理页要展示同一个等级（打标回传）。同一个口径写两遍，
 * 迟早会在某一次改动里只改一处，于是同一张单在两个页面上是两个等级。
 */
function ticketGradeOf(ticketNo: string): RiskLevel | null {
  return riskTags.ticketGradeOf(ticketNo);
}
/**
 * 行内要不要提示工单级等级。**只在工单级严格高于本条自己的等级时提示**——
 * 同级时再写一遍"本单当前 X 危"，说的是同一件事，属纯噪音。
 * 误报行没有等级：它自己不代表风险，但本单可能已被别的证据定成高危，这时更该提示。
 */
function ticketGradeHint(h: RiskHit): RiskLevel | null {
  const tg = ticketGradeOf(h.ticketNo);
  if (!tg) return null;
  const own = gradeOf(h);
  if (!own) return tg;
  return GRADE_ORDER[tg] < GRADE_ORDER[own] ? tg : null;
}

/**
 * 只看某一张单的全部命中。
 * 【为什么它必须跨视图】同单两条命中常常一条已核实、一条还在待核——
 * 这正是要对照的场合。焦点态若仍受视图约束，人点开「本单另有 N 条」只会看到其中一半，
 * 而他想看的恰恰是另一半。故焦点一旦落下，视图与视图内条件全部让位。
 */
const ticketFocus = ref<string | null>(null);
function focusTicket(no: string) {
  ticketFocus.value = ticketFocus.value === no ? null : no;
}
function clearTicketFocus() {
  ticketFocus.value = null;
}

// ---- 命中台账查询 ----
// 台账（全部风险词命中记录）最主要的用法是**事后点查**：客户几个月后捅到 12315，
// 要当场答出"当时发现了吗、谁核实的、判成什么"。只能翻不能查，等于答不出来。
//
// 🔴 **本轮底表从"已核实的"放宽成"全部命中"**，页签也随之从「已核实」改名「命中台账」。
// 【为什么必须放宽】日常工作面已经改成条目漏斗（实时监控页签），命中不再是待办；
// 底表若仍只收已核实的，**待核实的命中在整页里就没有任何入口** ——
// 没人能再核实它们，词表准确率（本页唯一的规则改进回路）会永久停在当前这个数上。
// 放宽之后「待核实」降为查询条里的一个取值，与成立 / 误报同层，行内动作照旧给「核实打标」。
//
// 【与手动筛查的区别】手动筛查是拿条件去扫**存量工单**产生新命中（发现），
// 这里是在**已有命中记录**里回溯（查证）。两者形态像、目标反，故各自独立一套条件，不复用。
interface LedgerFilter {
  /** 工单号或客户名，模糊匹配任一 */
  keyword: string;
  /**
   * 核实结果。它与 level 同层——都是在这批命中里再收窄，
   * 故摆在查询条第一位，而不是像早先那样单独占一个域。
   * `'open'` ＝ 还没有人核实过的那一批，见本段上方说明。
   */
  verdict: 'all' | 'open' | HitVerdict;
  level: 'all' | RiskLevel;
  from: string;
  to: string;
  groupIds: string[];
  /** 按规则主词，与统计口径一致 */
  words: string[];
  taggers: string[];
}
/**
 * 默认窗口：台账是只增不减的永久记录，**不能默认全量**——点查一开始就淹在历史里。
 *
 * 🔴 **从 30 天放宽到 90 天**。原因不是"30 天太短"这种口味问题，而是本轮改名之后
 * 页签角标取的是**命中总数**：命中记录的时刻分布若整段落在窗口外，
 * 屏幕上就会出现「命中台账 22」配一张 0 行的表 —— 正是本文件从头反对的那种
 * "标签写着一个数、表里躺着另一批"。角标与默认窗口必须能对得上，
 * 90 天既盖得住现有记录，又仍然是个有边界的窗口（要看更早的把它改宽，空态里写着怎么改）。
 */
const LEDGER_WINDOW_DAYS = 90;
function defaultLedgerFilter(): LedgerFilter {
  return {
    keyword: '',
    verdict: 'all',
    level: 'all',
    from: today(-(LEDGER_WINDOW_DAYS - 1)),
    to: today(),
    groupIds: [],
    words: [],
    taggers: [],
  };
}
const ledgerFilter = ref<LedgerFilter>(defaultLedgerFilter());

const ledgerDateRange = computed((): [Dayjs, Dayjs] | undefined => {
  const { from, to } = ledgerFilter.value;
  if (!from || !to) return undefined;
  return [dayjs(from), dayjs(to)];
});
const ledgerRangePresets = computed(() => [
  { label: '近 30 天', value: buildScanPresetRange(30) },
  { label: '近 90 天', value: buildScanPresetRange(LEDGER_WINDOW_DAYS) },
  { label: '近一年', value: buildScanPresetRange(365) },
]);
function onLedgerRangeChange(
  dates: [Dayjs, Dayjs] | [string, string] | null,
  dateStrings: [string, string],
) {
  if (!dates?.[0] || !dates?.[1]) {
    ledgerFilter.value.from = '';
    ledgerFilter.value.to = '';
    return;
  }
  ledgerFilter.value.from = dateStrings[0] || dayjs(dates[0]).format('YYYY-MM-DD');
  ledgerFilter.value.to = dateStrings[1] || dayjs(dates[1]).format('YYYY-MM-DD');
}

/**
 * 命中台账的全部记录（未过筛选）——既是查询底表，也是下拉项的取值来源。
 * 🔴 **含待核实、成立、误报三类**：三者是查询条里的一个筛选项，不各占一个视图，
 * 见本节开头「为什么必须放宽」。
 */
const ledgerBase = computed(() => (listView.value === 'judged' ? rows.value : []));

/** 下拉项一律从台账记录本身派生：只列真出现过的值，选了必有结果 */
function uniqOptions(pairs: Array<[string, string]>) {
  const seen = new Map<string, string>();
  pairs.forEach(([value, label]) => { if (value && !seen.has(value)) seen.set(value, label); });
  return [...seen].map(([value, label]) => ({ value, label }));
}
const ledgerGroupOptions = computed(() =>
  uniqOptions(ledgerBase.value.map((h) => [h.groupId, h.groupName])),
);
const ledgerWordOptions = computed(() =>
  uniqOptions(ledgerBase.value.map((h) => [h.word, h.word])),
);
const ledgerTaggerOptions = computed(() =>
  uniqOptions(ledgerBase.value.map((h) => {
    const by = traceOf(h)?.by ?? '';
    return [by, by] as [string, string];
  })),
);

function applyLedgerFilter(list: RiskHit[]): RiskHit[] {
  const f = ledgerFilter.value;
  const kw = f.keyword.trim().toLowerCase();
  return list.filter((h) => {
    // 'open' ＝ 还没人核实过的：`verdictOf` 此时是 undefined，故不能与另两档共用一条比较
    if (f.verdict === 'open' && verdictOf(h)) return false;
    if (f.verdict !== 'all' && f.verdict !== 'open' && verdictOf(h) !== f.verdict) return false;
    if (kw && !h.ticketNo.toLowerCase().includes(kw) && !h.customer.toLowerCase().includes(kw)) return false;
    // 误报没有等级（gradeOf 返回 null），故选定任一具体等级时它一律不匹配。
    // 让它落进某一档等于承认"误报也是风险，只是低一点"，与准确率的口径直接打架。
    if (f.level !== 'all' && gradeOf(h) !== f.level) return false;
    // 时间锚在**命中时刻**而非打标时刻：点查问的是"当时有没有发现"
    const day = h.when.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (f.groupIds.length && !f.groupIds.includes(h.groupId)) return false;
    if (f.words.length && !f.words.includes(h.word)) return false;
    if (f.taggers.length && !f.taggers.includes(traceOf(h)?.by ?? '')) return false;
    return true;
  });
}

/** 当前时间窗口的人话说法——空态必须把它讲出来，否则"没查到"会被当成"当时没发现" */
const ledgerRangeText = computed(() => {
  const f = ledgerFilter.value;
  if (!f.from && !f.to) return '不限时间';
  const base = `${f.from || '不限'} 至 ${f.to || '不限'}`;
  if (!f.from || !f.to) return base;
  const span = dayjs(f.to).diff(dayjs(f.from), 'day') + 1;
  return f.to === today() ? `${base}（近 ${span} 天）` : base;
});

const ledgerFilterDirty = computed(() => {
  const f = ledgerFilter.value;
  const d = defaultLedgerFilter();
  return !!f.keyword.trim() || f.verdict !== 'all' || f.level !== 'all' || f.from !== d.from || f.to !== d.to
    || !!f.groupIds.length || !!f.words.length || !!f.taggers.length;
});

function resetLedgerFilter() {
  ledgerFilter.value = defaultLedgerFilter();
}

function applyLedgerQuery() {
  hitPageCurrent.value = 1;
}

/**
 * 命中清单的数据源。它只服务**两个页签**：手动筛查（结果态）与命中台账。
 * 🔴 实时监控页签已改成条目维度，走的是 `queueRows`，与本 computed 无关
 * （「未标记 · 实时监控」那一路的召回清单按工单组分页、组内命中取 `kwHitsOf`，同样不读它）——
 * 两批数据分母不同（命中记录 vs 监控条目），共用一个数据源必然在某处把两者读串。
 *
 * 筛查结果与台账**共用同一张表**：列、排序、判定依据的呈现完全一致，只是筛查态多一列勾选。
 */
const filteredRows = computed(() => {
  if (inScanResult.value) {
    return (scanResult.value ?? []).map((r) => r.hit)
      .sort((a, b) => {
        const d = gradeRank(a) - gradeRank(b);
        return d !== 0 ? d : b.when.localeCompare(a.when);
      });
  }
  if (ticketFocus.value) {
    // 焦点态按命中时刻正序：这一屏读的是"这张单上先后发生了什么"，倒序会把爬坡读反
    return rows.value
      .filter((h) => h.ticketNo === ticketFocus.value)
      .sort((a, b) => a.when.localeCompare(b.when));
  }
  // 台账：待核实 / 成立 / 误报三类都在，核实结果与等级等条件只在查询条里收窄
  const list = inLedger.value ? applyLedgerFilter(ledgerBase.value) : [];
  return [...list].sort((a, b) => {
    const ra = gradeRank(a);
    const rb = gradeRank(b);
    if (ra !== rb) return ra - rb;
    if (gradeOf(a) === '高') {
      const ua = isJudged(a) ? 1 : 0;
      const ub = isJudged(b) ? 1 : 0;
      if (ua !== ub) return ua - ub;
    }
    // 同级同状态时按命中时刻倒序：不给末位判据，排序就取决于数组的写入顺序，
    // 同一份数据两次进来可能给出两个次序，翻页时行会跳。
    return b.when.localeCompare(a.when);
  });
});

const hitPageCurrent = ref(1);
/** 与分页器的可选每页条数保持一致：给一个下拉里根本选不回来的值，人一改就回不去了 */
const hitPageSize = ref(10);

const pagedRows = computed(() => {
  const start = (hitPageCurrent.value - 1) * hitPageSize.value;
  return filteredRows.value.slice(start, start + hitPageSize.value);
});

function setHitPage(page: number, size: number) {
  hitPageCurrent.value = page;
  hitPageSize.value = size;
}

watch([listView, ledgerFilter, scanResult, inScanResult, scope, ticketFocus], () => {
  hitPageCurrent.value = 1;
}, { deep: true });

/**
 * 列表展示等级。已核实的取核实结果，否则取词表预设。
 * 判为**误报的返回 null**：误报是"规则捞错了"，不是"风险很低"——
 * 回落到词表预设去冒充一个等级，界面上就会同时挂着「高风险」与「误报」两个互相打架的标签。
 */
function gradeOf(h: RiskHit): RiskLevel | null {
  const e = latestEntryOf(h);
  return e ? e.level : h.level;
}

/** 排序用的等级序位：没有等级的（误报）排在同批末尾，它不该混进风险的轻重排队里 */
function gradeRank(h: RiskHit): number {
  const g = gradeOf(h);
  return g ? GRADE_ORDER[g] : 3;
}

/** 词表预设等级（打标前参考值） */
function presetGradeOf(h: RiskHit): RiskLevel {
  return h.level;
}

const GRADES: RiskLevel[] = ['高', '中', '低'];

// ---- 命中的三种状态 ----
// 核实 ≠ 处置。打标做的是**核实**：判断这条命中是不是真风险、定个级。
// 早先把「打标即出队」实现成「进已处置」，于是误报和真风险混在一个池子里，
// 「已处置」这个词也名不副实——里面躺着的其实是"已核实的"。按状态三分理清：
//   ① 待核实  ——系统命中，还没人判
//   ② 确认是风险——核实成立，三级都算，风险监控到此交棒，处置在工单侧
//   ③ 误报    ——核实不成立，是规则问题不是风险，**不进风险统计**
// 注意这三种是**数据状态**，不等于页签：三者同在「命中台账」这一批，
// 在查询条里靠核实结果这个筛选项区分；把它们各摆一个视图，正是早先层级错位的由来。
//
// 「判过没有」一律看 isJudged，不看有没有等级：误报是判过的，但它没有等级，
// 用 gradeOf 当判据会让所有误报重新掉回待核实里。

/**
 * 命中台账的记录总数 —— 右上角「命中台账」入口角标。
 * 🔴 台账顶部原先那条统计条（命中 / 待核实 / 已核实 / 确认是风险 / 误报 / 规则准确率）已删：
 * 这组数在看板上有展示，本页不再重复摆一遍。
 */
const ledgerTotal = computed(() => rows.value.length);

// ---- 打标（核实）与修正 ----
// 打标即「已核实」，它本身就是确认动作，不另设复核角色、不加审批。
// 但核实结果**必须可改**：判错了却改不了，台账里就永久躺着一条错的定论，
// 而台账正是事后被追问时唯一能拿出来的东西。故同一个弹窗既用于首次核实，也用于修正。
//
// 留痕从「只存最后一次」改为**可追加的修正历史**：只留最新值答不出
// "改过没有、从什么改成什么、为什么改"，复盘时链条是断的。
// 第 1 条＝首次核实，之后每次修正各追加一条；末条即当前生效值。
// 核实历史（首次核实 + 逐条修正）的结构、取值口径与写入都在 useRiskTagStore 里，
// 本页只做转发：工单处理页要读同一份结论，两边各存一份就会各说各话。
type TagEntry = RiskTagEntry;
// 拦截提示与只读占位的文案按 `RISK_TAG_ROLES` 的**实际取值**写：
// 客诉专员 + 投诉督导 + 三个管理员 scope（前台合并称「管理员」，基线 §3.1）。
// 写成"只有客诉专员与投诉督导"会漏掉管理员——它是兜底角色（基线 §7 #27 明确
// 「按"唯一"写的实现（如 `RISK_TAG_ROLES` 一类）须跟着放宽」）。
// 本页此类表述共五处（三条 warning + 两个 title），改一处必须五处同改。
const canRiskTag = computed(() => RISK_TAG_ROLES.includes(user.roleKey));

function seedEntryOf(h: RiskHit): TagEntry | undefined {
  return riskTags.seedEntryOf(h);
}
function historyOf(h: RiskHit): TagEntry[] {
  return riskTags.historyOf(h);
}
function latestEntryOf(h: RiskHit): TagEntry | undefined {
  return riskTags.latestEntryOf(h);
}

const tagOpen = ref(false);
const tagTarget = ref<RiskHit | null>(null);
const tagLevel = ref<RiskLevel>('高');
const tagVerdict = ref<HitVerdict | undefined>(undefined);
const tagNote = ref('');
/** 本次修正的理由。修正必填——只记改前改后而不记为什么，复盘时链条仍是断的 */
const tagReason = ref('');
/** 已核实过的再打开就是修正：标题、按钮文案与必填项都随之不同 */
const tagAmend = ref(false);
const tagHistory = computed(() => (tagTarget.value ? historyOf(tagTarget.value) : []));
const tagCurrent = computed(() => (tagTarget.value ? latestEntryOf(tagTarget.value) : undefined));
/**
 * 同单的其它命中及其结论——弹窗里位置最靠前的一块，排在「本次命中」这个必填项之上。
 * 【为什么必须靠前】它不是佐证，是**做这次判断的前提**：本条是不是一次升级、
 * 客户是第几次加码，答案全在别的命中里。摆到底部与修正记录并列，等于让人先下结论再看依据。
 */
const tagSiblings = computed(() => (tagTarget.value ? siblingsOf(tagTarget.value) : []));
/** 本单当前风险等级——同一块区域一并给出，人不必自己把几条等级在心里取一次 max */
const tagTicketGrade = computed(
  () => (tagTarget.value ? ticketGradeOf(tagTarget.value.ticketNo) : null),
);
/**
 * 本次真正会落库的等级。误报一律落 null——等级单选还留着上一次的选中态，
 * 拿它当"改动了"的依据的话，把成立改判成误报后再点一次某个等级，
 * 界面会认为又变了一次，历史里就多出一条什么都没改的修正。
 */
const tagLevelToSave = computed<RiskLevel | null>(
  () => (tagVerdict.value === '误报' ? null : tagLevel.value),
);
/** 值没变就不该追加一条空修正，否则历史会被无意义的记录稀释 */
const tagDirty = computed(() => {
  const cur = tagCurrent.value;
  if (!cur) return true;
  return tagVerdict.value !== cur.verdict
    || tagLevelToSave.value !== cur.level
    || tagNote.value.trim() !== cur.note;
});
const canSaveTag = computed(() => {
  if (!canRiskTag.value || !tagVerdict.value) return false;
  if (tagAmend.value) return tagDirty.value && !!tagReason.value.trim();
  return true;
});

function openTag(h: RiskHit) {
  if (!canRiskTag.value) { message.warning('只有客诉专员、投诉督导与管理员可以打标'); return; }
  tagTarget.value = h;
  const cur = latestEntryOf(h);
  tagAmend.value = !!cur;
  tagLevel.value = cur?.level ?? h.level;
  tagVerdict.value = cur?.verdict;
  tagNote.value = cur?.note ?? '';
  tagReason.value = '';
  tagOpen.value = true;
}
function saveTag() {
  const target = tagTarget.value;
  if (!target) return;
  if (!canRiskTag.value) { message.warning('无打标权限'); return; }
  if (!tagVerdict.value) { message.warning('请先判定本次命中是否成立'); return; }
  if (tagAmend.value && !tagDirty.value) { message.warning('核实结果没有变化，无需修正'); return; }
  if (tagAmend.value && !tagReason.value.trim()) { message.warning('请填写修正原因'); return; }
  const entry: TagEntry = {
    level: tagLevelToSave.value,
    verdict: tagVerdict.value,
    note: tagNote.value.trim(),
    by: user.current.name,
    byRole: user.role.name,
    at: nowStamp(),
    ...(tagAmend.value ? { amendReason: tagReason.value.trim() } : {}),
  };
  // 追加而不覆盖
  riskTags.appendEntry(target.id, entry);
  /*
   * 🔴 **不再回写监控条目**（业务第三轮拍板）。旧实现在这里调 `recordVerify`，
   * 把命中的「成立 / 误报 + 等级」翻译成条目的打标结论，顺手改掉条目状态。
   *
   * 【为什么必须断开】两者答的不是同一个问题：命中核实答"**这次命中准不准**"（词表的准确率），
   * 条目打标答"**这张单有没有风险、多大**"（入池门槛）。一张单被三条词命中时，
   * 让每一条核实都去改一次条目状态，那条条目会被来回搬进搬出池子，
   * 而每次搬动的依据只是其中一条证据准不准 —— 池子里到底该不该有它，从此没人答得清。
   *
   * 断开之后：命中核实只回填词表准确率，条目进不进池**只由条目自己的四选一打标决定**
   * （`openEntryTag` / `saveEntryTag` → `riskPool.recordTag`）。
   */
  message.success(
    tagAmend.value
      ? `已修正 ${target.ticketNo} 的核实结果为「${entry.verdict}」，本次修正已留痕`
      : entry.verdict === '误报'
        ? '已记为误报，本条不计入风险，只回填词表准确率'
        : `已核实 ${target.ticketNo} 的这条命中为「成立 · ${levelText(tagLevel.value)}」；该单进不进风险工单池，仍以「实时监控」里的风险打标为准`,
  );
  tagOpen.value = false;
}
/** 等级的人话说法：误报没有等级，说清"无等级"而不是留空，否则读不出这次改的是什么 */
const levelText = riskLevelText;
/** 两次核实之间实际改了什么——修正记录要能直接读出"从 X 改成 Y" */
function entryDiffText(prev: TagEntry, next: TagEntry): string {
  const parts: string[] = [];
  if (prev.verdict !== next.verdict) parts.push(`判定 ${prev.verdict} → ${next.verdict}`);
  if (prev.level !== next.level) parts.push(`等级 ${levelText(prev.level)} → ${levelText(next.level)}`);
  if (prev.note !== next.note) parts.push(next.note ? '处置备注已更新' : '处置备注已清空');
  return parts.join(' · ');
}
/** 这条判过没有。等级可以为空（误报），判定不会，故"判过没有"只认它 */
function isJudged(h: RiskHit): boolean {
  return !!latestEntryOf(h);
}
/** 现行核实结果里的等级；误报为 null，未核实为 undefined */
function tagOf(h: RiskHit): RiskLevel | null | undefined {
  return latestEntryOf(h)?.level;
}

/** 实时监控扫库：系统定时或人工刷新触发，只读不写 */
function runRealtimeScan(triggerBy = '系统') {
  const t0 = Date.now();
  const startedAt = nowStamp(true);
  const criteriaText = '全中心 · 全部启用词 · 实时增量扫描';
  const endedAt = () => dayjs(t0 + Math.max(600, Date.now() - t0)).format('YYYY-MM-DD HH:mm:ss');
  try {
    const hits = wordOnlyRiskHitsOf(scope.value);
    const open = hits.filter((h) => !isJudged(h)).length;
    appendScanRun({
      id: `run-rt-${Date.now()}`,
      kind: 'realtime',
      triggerBy,
      startedAt,
      endedAt: endedAt(),
      status: 'success',
      criteriaText,
      hitCount: hits.length,
      openCount: open,
    });
  } catch {
    appendScanRun({
      id: `run-rt-${Date.now()}`,
      kind: 'realtime',
      triggerBy,
      startedAt,
      endedAt: endedAt(),
      status: 'failed',
      errorMessage: '实时扫描中断，请检查词表与连接',
      criteriaText,
    });
  }
}

function refresh() {
  runRealtimeScan(user.current.name);
}

onMounted(() => {
  if (!scanRuns.value.length) runRealtimeScan('系统');
});

function verdictOf(h: RiskHit): HitVerdict | undefined {
  return latestEntryOf(h)?.verdict;
}
function traceOf(h: RiskHit): { by: string; byRole: string; at: string; note: string } | undefined {
  const e = latestEntryOf(h);
  return e ? { by: e.by, byRole: e.byRole, at: e.at, note: e.note } : undefined;
}
/** 处置列徽标的悬停说明：现行核实结果的来源；改过就把次数标出来，指向修正记录 */
function tagTraceTitle(h: RiskHit): string | undefined {
  const t = traceOf(h);
  if (!t) return undefined;
  // 角色与姓名同行给出：光看姓名答不出"这条判定有多少分量"
  const lines = [`打标人：${t.by}（${t.byRole}）`, `打标时刻：${t.at}`];
  if (t.note) lines.push(`处置备注：${t.note}`);
  const amended = historyOf(h).length - 1;
  if (amended > 0) lines.push(`已修正 ${amended} 次，明细见「修正」`);
  return lines.join('\n');
}

/* ==================== 实时监控 · 三视图（条目维度） ==================== */

/** 三视图各自的行。取数**全部走 store 的三个 computed**，本页不另筛一遍——
 *  各筛各的话，chip 上的数字与表里的行数迟早对不上（本文件反复踩过的那个坑）。 */
/* ---- 「待标记」三片：切面的取数与各自的默认排序 ---- */

/**
 * 清单的**视图行**，三个视图共用一个形状。
 *
 * 🔴 **表里只有一类行：监控条目**（《【930】》§5A.2）。在办、没人下过结论、满足三类判据的单
 * 由 store 补齐条目（`riskQueue.syncAutoEntries`），来源与进监控时刻照实写，不再有"无条目的行"。
 */
interface QueueRow {
  /** ＝ 条目 id */
  id: string;
  ticketNo: string;
  entry: RiskQueueEntry;
  source: RiskQueueEntry['source'];
  desc: string;
  /** 进入实时监控的时刻 */
  at: string;
  status: RiskQueueEntry['status'];
  tag?: RiskQueueEntry['tag'];
  assignee?: string;
}

function rowOfEntry(e: RiskQueueEntry): QueueRow {
  return {
    id: e.id,
    ticketNo: e.ticketNo,
    entry: e,
    source: e.source,
    desc: e.desc,
    at: e.at,
    status: e.status,
    tag: e.tag,
    assignee: e.assignee,
  };
}
/**
 * 「未标记」的**全集 ＝「全部待判」**（未过工作组筛选）＝ **监控队列里还没打标、且工单在办的条目**。
 *
 * 在办、没人下过结论、满足三类判据（实时监控 / 投诉单 / 重要紧急）的单，store 已按判据补齐条目
 * （`riskQueue.syncAutoEntries`，本页挂 watch 随命中与核实结论重跑），故全集只取条目这一处。
 * 三路按条目来源两两互斥，`实时监控 + 投诉单 + 重要紧急 ≡ 全部待判` 是**恒等号**。
 *
 * 🔴 **在办口径**（§5A.2 / R50a）：工单进终态即从「未标记」段消失。条目对应的单在工单库与派生库里
 * 都查不到时照实留着（`fallbackTicketOf` 顶一张最小工单），不吞 —— 那是数据异常，不是终态。
 *
 * 🔴 **覆盖率由「手动筛查」兜底**：三路规则都没捞到的单，靠人拿条件去扫存量捞出来，
 * 勾选并入后补一条来源「实时监控」的条目回到这一档（`riskQueue.adoptScanTickets`）。
 */
const untaggedUniverse = computed<QueueRow[]>(() => reportStore.monitoringEntries
  .map(rowOfEntry)
  .filter((r) => {
    const t = ticketOfRow(r);
    return !t || isLiveTicket(t);
  }));
/*
 * 命中清单（并入的筛查命中）、命中核实结论与打标回写的工单级等级一变，按三类判据重补一遍条目：
 * 例如一条命中由「成立」改判为「误报」后工单级等级清空，这张单应当回到「未标记」。
 * store 开屏已补过一遍，这里只接会话内的变化；补的动作在 store 里，本页不另造条目。
 */
watch(
  [() => riskTags.allHits, () => riskTags.entries, () => riskTags.tagGrades],
  () => { riskQueue.syncAutoEntries(); },
  { immediate: true },
);

/**
 * 这一行**算哪一路监控来源的** ＝ 条目自己的 `source`，一个字不改。三片互斥就靠它一处判定。
 * 它是当初真的从哪个入口进来的，现场按工单属性重推一遍等于把历史改写成"按今天的规则本该从哪儿进来"。
 */
function effectiveSourceOf(r: QueueRow): '实时监控' | '投诉单' | '重要紧急' {
  return r.source;
}

/**
 * 这张单**同时还满足哪几路来源**（不含它已经被归到的那一路）。
 *
 * 【为什么需要它】归属是**唯一**的（`effectiveSourceOf`，命中 > 投诉 > 重要紧急），
 * 否则「三路之和 ＝ 未标记页签数」当场不成立。可"唯一归属"只是**计数口径**，
 * 不代表这张单只有一个身份：一张既命中预警词、又是投诉单的单，被算进「实时监控」之后，
 * "它同时也是投诉单"这条对判风险有用的事实就没地方说了 ——
 * 而《【930】》§5A.1 与附录 A R50b 要的正是**来源多值并列**。
 *
 * 🔴 **它只管显示，一格都不改归属**：本函数的返回值不参与 `untaggedSliceRows` 的任何筛选，
 * 三路之和、每档角标 ＝ 表行数 两条不变量与它无关。
 *
 * 🔴 **判据与 `effectiveSourceOf` 逐条同源**，不另立一套：那边先读条目自带的 `source`
 * （历史事实），再按工单属性推。两边分家的话，会出现"归到 A 路、却标着兼 A"这种自相矛盾。
 *
 * 【互斥关系】「投诉单」与「重要紧急」按**工单类型**天然互斥（一张单不可能既是投诉又非投诉），
 * 故实际能出现的多路只有「实时监控 ＋ 其中之一」。多于一个时并列，不折叠。
 */
function allSourcesOf(r: QueueRow): Array<'实时监控' | '投诉单' | '重要紧急'> {
  const out: Array<'实时监控' | '投诉单' | '重要紧急'> = [];
  // ① 预警词那一路：条目本就从这条路进来的，或者这张单在命中台账里有记录
  if (r.source === '实时监控' || riskTags.hitsOfTicket(r.ticketNo).length) {
    out.push('实时监控');
  }
  // ② 工单属性那两路。派生单落在 derivedTickets 里，两处都查（与 `ticketOfRow` 同）
  const t = TICKET_BY_NO.get(r.ticketNo) ?? derivedTickets.find(r.ticketNo) ?? null;
  if (t && isLiveTicket(t)) {
    if (t.type === '投诉') out.push('投诉单');
    else if (t.priority === 'P0' || t.priority === 'P1') out.push('重要紧急');
  }
  // ③ 条目自带的来源若上面两支都没推出来，仍算一路：它是这条条目**当初真的从哪儿进来的**，
  //    工单属性事后变了（改类型、降优先级）不该把这段历史抹掉
  if ((r.source === '投诉单' || r.source === '重要紧急') && !out.includes(r.source)) out.push(r.source);
  return out;
}

/** 「兼：」要列的那几路 ＝ 全部来源减去当前归属的那一路。单路行返回空数组、界面上什么都不显示 */
function alsoSourcesOf(r: QueueRow): string[] {
  const eff = effectiveSourceOf(r);
  return allSourcesOf(r).filter((s) => s !== eff);
}

/** 「兼：」那枚 chip 的悬停说明。两句话：本行按什么次序只算一档、「兼」列的是什么 */
function alsoSourceTitle(r: QueueRow): string {
  return `本行按监控条目的来源只算进一档（现算「${effectiveSourceOf(r)}」），`
    + `三路两两互斥、之和恒等于「未标记」页签上那个数。\n`
    + `「兼」列出的是它同时满足的其余来源：${alsoSourcesOf(r).join('、')} —— 只作提示，不改归属、不计入任何一档。`;
}

/** 切片 ↔ 监控来源字面量。三片就是这一维的三个值，故映射一处写死、别处只引用它 */
const SLICE_SOURCE: Record<UntaggedSlice, NonNullable<QueueRow['source']>> = {
  kw: '实时监控',
  complaint: '投诉单',
  urgent: '重要紧急',
};

/**
 * 「未标记」的某一路（未过工作组筛选、未过子档）。
 * 三路**同出一个全集**（`untaggedUniverse`），故"三路之和 ＝ 页签上那个数"
 * 是构造出来的、不是碰巧成立的：换三条独立的查询去取，各自的"未标记"判据迟早分叉。
 */
function untaggedSliceRows(slice: UntaggedSlice): QueueRow[] {
  const src = SLICE_SOURCE[slice];
  return untaggedUniverse.value.filter((r) => effectiveSourceOf(r) === src);
}

/* ---- 「未标记」这一段的筛选条 ---- */
//
// 【为什么这一段要有筛选、却不要统计头】命中统计（待核实 / 已核实 / 确认是风险 / 误报 /
// 规则准确率）讲的是**词表质量**，属于命中核实那条规则改进回路（数在看板上展示，本页不摆）。摆在日常打标的工作面前，
// 等于把"规则准不准"塞给一个正在判"这张单有没有风险"的人 —— 两个问题、两个分母。
// 这一段要的只是**在当前这一路里把范围收窄**，故只补一条筛选条。
//
// 🔴 **字段随当前这一路而变**：只有「实时监控」那一路带命中证据（原话、风险词），
// 另两路的行就是工单，没有原话也没有词可筛。
// 🔴 「实时监控」那一路的条件**作用在命中上**（行 ＝ 一条召回），一组里命中全被筛掉的工单整组不出现。
//
// 🔴 **不重复左栏与工作组 chip 已经承担的收窄**（加进去就是同一件事两个入口）：
//   · 等级 / 优先级 —— 左栏子档已经在做；
//   · 班组 —— 清单上方那行「工作组」chip 已经在做；
//   · 打标人 —— 这一段按定义全是没打过标的单，恒空。
//   · 核实结果**保留**（只在「实时监控」那一路）：它是**命中**的核实结论，不是工单的打标结论 ——
//     一张未打标的单上，个别命中可能已在命中台账里被判过成立 / 误报。
interface UntaggedFilter {
  keyword: string;
  /** 只有「实时监控」这一路用得到：命中的规则主词（与命中台账同一口径，取 `RiskHit.word`） */
  words: string[];
  /** 只有「实时监控」这一路用得到：命中时间区间 */
  from: string;
  to: string;
  /** 只有「实时监控」这一路用得到：命中的核实结果，取值与命中台账那一格一致 */
  verdict: 'all' | 'open' | HitVerdict;
  /* ---- 以下三维只有「投诉单」「重要紧急」两路用得到：那两路的行就是工单 ---- */
  /** 产品（多选，从这一路真出现过的产品派生） */
  products: string[];
  /** 当前状态（多选，取工单列表那一列的展示名，与表里那一格逐字同源） */
  statuses: string[];
  /** SLA：`all` 不限 / `over` 已超时 / `ok` 未超时。判据取工作台那一份 `isSlaBreachedNow` */
  sla: 'all' | 'over' | 'ok';
}
/**
 * 默认**不设时间窗**。与命中台账那条相反：台账是只增不减的永久记录，不给默认窗口一开始就淹在
 * 历史里；而这一段装的是**此刻的存量**（还没人下结论的单），本来就没有多少历史深度，
 * 给一个默认窗口反而会让左栏角标与表行数在人什么都没筛的时候就对不上。
 */
function defaultUntaggedFilter(): UntaggedFilter {
  return { keyword: '', words: [], from: '', to: '', verdict: 'all', products: [], statuses: [], sla: 'all' };
}
const untaggedFilter = ref<UntaggedFilter>(defaultUntaggedFilter());

const untaggedDateRange = computed((): [Dayjs, Dayjs] | undefined => {
  const { from, to } = untaggedFilter.value;
  if (!from || !to) return undefined;
  return [dayjs(from), dayjs(to)];
});
function onUntaggedRangeChange(
  dates: [Dayjs, Dayjs] | [string, string] | null,
  dateStrings: [string, string],
) {
  if (!dates?.[0] || !dates?.[1]) {
    untaggedFilter.value.from = '';
    untaggedFilter.value.to = '';
    return;
  }
  untaggedFilter.value.from = dateStrings[0] || dayjs(dates[0]).format('YYYY-MM-DD');
  untaggedFilter.value.to = dateStrings[1] || dayjs(dates[1]).format('YYYY-MM-DD');
}

/**
 * 「风险词」下拉的取值：**从这一路真出现过的词派生**，与台账那几个下拉同一条规矩
 * （`uniqOptions` 的说明）—— 选了必有结果。
 * 🔴 底表取**未过本条筛选**的整片：拿过滤后的行去派生，选中一个词之后下拉里就只剩它自己，
 * 人再也换不回别的词。
 */
const untaggedWordOptions = computed(() => {
  const seen: string[] = [];
  for (const r of untaggedSliceRows('kw')) {
    for (const h of rowHits(r)) if (!seen.includes(h.word)) seen.push(h.word);
  }
  return seen.map((w) => ({ value: w, label: w }));
});

/**
 * 「产品」「当前状态」两个下拉的取值：同上，**从当前这一路真出现过的值派生**，选了必有结果。
 * 状态取 `ticketStatusDisplayName` —— 与表里那一格显示的是同一个词，
 * 各写各的话会出现"下拉里选的词，表里一个都找不到"。
 */
function untaggedTicketOptions(pick: (t: Ticket) => string) {
  const seen: string[] = [];
  for (const r of untaggedSliceRows(untaggedSlice.value)) {
    const t = ticketOfRow(r);
    const v = t ? pick(t) : '';
    if (v && !seen.includes(v)) seen.push(v);
  }
  return seen.map((v) => ({ value: v, label: v }));
}
const untaggedProductOptions = computed(() => untaggedTicketOptions((t) => t.product));
const untaggedStatusOptions = computed(() => untaggedTicketOptions((t) => ticketStatusDisplayName(t)));

/**
 * 这一行对应的**工单**；null ＝ 工单库与派生库里都查不到。
 *
 * 🔴 **两处都要查**：静态样本 `TICKETS` 之外，「升级」派生出来的新投诉单落在
 * `derivedTickets` 里（那个 store 存的就是完整 `Ticket`），只查前者会让那批行整批解析不出来。
 * 🔴 **返回 null 的行不许被丢掉**：清单的行数必须恒等于左栏角标，少一行就是这一列的
 * 第一条不变量破了。故 `untaggedTicketRows` 对 null 的处理是"照实留在行集里、
 * 用行自己已知的信息补齐一张最小工单"，而不是 filter 掉，见那一段。
 */
function ticketOfRow(r: QueueRow): Ticket | null {
  return TICKET_BY_NO.get(r.ticketNo) ?? derivedTickets.find(r.ticketNo) ?? null;
}

/**
 * 把筛选条件套到某一路的行上。**字段按路分两套**，因为两路的行根本不是一种东西：
 *   · 实时监控 —— 行是**命中**（一条召回一行），故筛 关键词 / 风险词 / 命中时间 / 核实结果，见 `kwHitsOf`；
 *   · 投诉单 / 重要紧急 —— 行**就是工单**，故筛 产品 / 当前状态 / SLA 是否超时。
 *
 * 🔴 「进监控时间」这一维**已删**：实测「投诉单」11 条里只有 2 条有进监控时刻
 * （其余是「未纳入监控」、`at` 为 null），一设区间就只剩那 2 条 ——
 * 一个筛完必然只剩两条的字段，摆在那里只会让人以为筛坏了。
 */
/** 「实时监控」那一路的筛选条件动过没有（四个字段全部作用在命中上） */
function kwHitFilterOn(): boolean {
  const f = untaggedFilter.value;
  return !!f.keyword.trim() || !!f.words.length || !!f.from || !!f.to || f.verdict !== 'all';
}
/**
 * 这张单上**过了筛选的命中**，按命中时刻倒序 —— 召回清单里这一组的那几行。
 * 🔴 组数（角标 / 工作组 chip / 分页）与行数（「N 条命中」）都从它派生，不另筛一遍。
 * 关键词对工单级字段（单号 / 标题）命中时，本组全部命中都算匹配。
 */
function kwHitsOf(r: QueueRow): RiskHit[] {
  const hits = rowHits(r).slice().sort((a, b) => b.when.localeCompare(a.when));
  if (!kwHitFilterOn()) return hits;
  const f = untaggedFilter.value;
  const kw = f.keyword.trim().toLowerCase();
  const ticketHit = !!kw && [r.ticketNo, rowTitleOf(r)].some((s) => s.toLowerCase().includes(kw));
  return hits.filter((h) => {
    if (kw && !ticketHit
      && ![h.excerpt ?? '', h.customer ?? ''].some((s) => s.toLowerCase().includes(kw))) return false;
    if (f.words.length && !f.words.includes(h.word)) return false;
    // 时间锚在**命中时刻**：召回问的是"什么时候被发现"
    const day = h.when.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    // 'open' ＝ 还没人核实过的：`verdictOf` 此时是 undefined，与命中台账同一条判法
    if (f.verdict === 'open' && verdictOf(h)) return false;
    if (f.verdict !== 'all' && f.verdict !== 'open' && verdictOf(h) !== f.verdict) return false;
    return true;
  });
}

function applyUntaggedFilter(list: QueueRow[], slice: UntaggedSlice): QueueRow[] {
  // 「实时监控」：条件作用在命中上，**一组里命中全被筛掉的工单整组不出现**
  if (slice === 'kw') {
    if (!kwHitFilterOn()) return list;
    return list.filter((r) => kwHitsOf(r).length > 0);
  }
  const f = untaggedFilter.value;
  const kw = f.keyword.trim().toLowerCase();
  const { products, statuses, sla } = f;
  if (!kw && !products.length && !statuses.length && sla === 'all') return list;
  return list.filter((r) => {
    if (kw && ![r.ticketNo, rowTitleOf(r)].some((s) => s.toLowerCase().includes(kw))) return false;
    if (products.length || statuses.length || sla !== 'all') {
      const t = ticketOfRow(r);
      // 🔴 查不到工单的行，在这三维上**一律放行**而不是筛掉：它不是"不匹配"，
      // 是"这一维答不上来"。筛掉的话，人按产品收窄一次就再也看不到这批数据异常的行了。
      if (t) {
        if (products.length && !products.includes(t.product)) return false;
        if (statuses.length && !statuses.includes(ticketStatusDisplayName(t))) return false;
        if (sla !== 'all' && isSlaBreachedNow(t) !== (sla === 'over')) return false;
      }
    }
    return true;
  });
}

const untaggedFilterDirty = computed(() => {
  const f = untaggedFilter.value;
  return !!f.keyword.trim() || !!f.words.length || !!f.from || !!f.to || f.verdict !== 'all'
    || !!f.products.length || !!f.statuses.length || f.sla !== 'all';
});

function resetUntaggedFilter() {
  untaggedFilter.value = defaultUntaggedFilter();
}

/** 与台账那条查询条一致：条件是**实时生效**的，这枚按钮只把页码收回第一页 */
function applyUntaggedQuery() {
  queuePageCurrent.value = 1;
}

/**
 * 这一行落在**当前切片的哪个子档**里；null ＝ 这一路推不出子档。
 *   · 实时监控 —— 词表预设的识别风险等级（取本单命中里最重的一条）；
 *   · 投诉单 / 重要紧急 —— 工单优先级。
 * 🔴 返回 null 的行**照旧留在父切面里**，只是不进任何一个子档，故会让
 * 「Σ子档 ＝ 父切面」少掉几条。少掉就是少掉，不往哪个档里硬塞 ——
 * 塞进去的那一条会让人照着一个假分档去派活。
 */
function untaggedSubOf(r: QueueRow, slice: UntaggedSlice): string | null {
  if (slice === 'kw') return presetLevelOf(r.ticketNo);
  if (slice === 'complaint' || slice === 'urgent') {
    // 🔴 **两处都要查**（与 `ticketOf` / `groupNameOf` 同一条规矩）：升级派生的新投诉单
    // 落在 `derivedTickets` 里，只问静态工单库会让它进得了父切面、却掉不进任何一个子档 ——
    // 「Σ子档 ＝ 父切面」当场少一条，而这一条明明查得到自己的优先级。
    return ticketOfRow(r)?.priority ?? null;
  }
  return null;
}

/** 某一片下的子档清单（**为 0 也照常列出**，档位时有时无会被读成筛选坏了） */
const UNTAGGED_SUB_KEYS: Record<UntaggedSlice, string[]> = {
  kw: [...RISK_LEVELS],
  complaint: ['P0', 'P1', 'P2', 'P3'],
  // 这一路的判据本就是 P0 / P1，列出 P2 / P3 等于摆两个永远为 0 的档
  urgent: ['P0', 'P1'],
};
/** 子档的界面词。等级取 `riskLevelText`，优先级取工单侧的 `PRIORITY_LABEL` —— 两处都是单一真源 */
function untaggedSubLabel(slice: UntaggedSlice, key: string): string {
  if (slice === 'kw') return `${key}风险`;
  return `${key}（${PRIORITY_LABEL[key as Priority]}）`;
}

/**
 * 工单优先级的次序。**只是排序用的刻度，不是新口径**：`P0 → P3` 与工单侧
 * `slaUrgencyCompare` 里那一份同序，那一份没有导出、也不该为了排一列条目把 SLA 那套整个拖进来。
 * 🔴 **工单库里查不到的排最后而不是当成 P3**：查不到是"不知道多急"，不是"不急"，
 * 混进 P3 里会让它悄悄插在真 P3 前面，而这一批恰恰是最需要被人看见的异常数据。
 */
const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const RANK_UNKNOWN = 9;
function priorityRankOf(ticketNo: string): number {
  // 两处都要查，同 `untaggedSubOf`：派生单查得到自己的优先级，不该被当成"不知道多急"排到最后
  const t = TICKET_BY_NO.get(ticketNo) ?? derivedTickets.find(ticketNo);
  if (!t) return RANK_UNKNOWN;
  return PRIORITY_RANK[t.priority] ?? RANK_UNKNOWN;
}

/**
 * 这条条目上**词表预设的识别风险等级**（取本单全部命中里最重的一条）。
 *
 * 【为什么是"取最重"】一张单可以被三条词命中、三条词各有各的预设等级，而人排队要的是
 * "先看哪一张单"——按最轻的那条排，一张同时命中高危词的单会沉到底下去。
 * 🔴 它是**词表带出来的机器建议值**（`RiskHit.level`），不是打标结论：待标记这一批
 * 按定义还没有人给结论，这一列排的就是"机器认为多重"。
 * 没有命中记录的（投诉单 / 重要紧急那两路本就不产生命中）排最后，不吞。
 */
const PRESET_LEVEL_RANK: Record<RiskLevel, number> = { 高: 0, 中: 1, 低: 2 };
/** 本单命中里**最重**的那一条的预设等级；null ＝ 这张单没有命中记录 */
function presetLevelOf(ticketNo: string): RiskLevel | null {
  let best: RiskLevel | null = null;
  for (const h of riskTags.hitsOfTicket(ticketNo)) {
    if (!best || PRESET_LEVEL_RANK[h.level] < PRESET_LEVEL_RANK[best]) best = h.level;
  }
  return best;
}
function presetLevelRankOf(ticketNo: string): number {
  const lv = presetLevelOf(ticketNo);
  return lv ? PRESET_LEVEL_RANK[lv] : RANK_UNKNOWN;
}

/**
 * 「待标记」当前这一片的行，**已按这一片自己的默认序排好**：
 *   · 预警词命中 —— 按**词表预设的识别风险等级**降序（高 → 中 → 低）；
 *   · 重要紧急 / 全部待判 —— 按**工单优先级**降序（P0 → P3）。
 *
 * 【为什么两片不共用一把尺】预警词那一路的排队依据是"机器觉得这句话多重"，
 * 而重要紧急与全量看的是"这张单本身多急"——同分时一律早进先出（`at` 升序），
 * 免得同一批数据两次进来给出两个次序。
 */
const untaggedRows = computed<QueueRow[]>(() => {
  const slice = untaggedSlice.value;
  const sub = untaggedSub.value;
  const rankOf = slice === 'kw' ? presetLevelRankOf : priorityRankOf;
  // 🔴 筛选条在这里生效**一处**：`groupChips` 与左栏当前这一路的角标都从这条链上取数，
  // 各筛各的就会出现"标签写着一个数、表里躺着另一批"——本文件反复踩过的那个坑。
  const base = applyUntaggedFilter(untaggedSliceRows(slice), slice);
  const rows = sub
    ? base.filter((r) => untaggedSubOf(r, slice) === sub)
    : base;
  return rows.slice().sort((a, b) => (
    rankOf(a.ticketNo) - rankOf(b.ticketNo)
    || a.at.localeCompare(b.at)
  ));
});

/* ---- 「投诉单」「重要紧急」两路：直接用工作台那张富列表 ---- */
//
// 【为什么这两路换表】它们的行**就是工单**，人在这一档要判的也正是工单本身。
// 原先那两列对判断零信息量：「监控来源」整列等于左栏档名的复述（停在「投诉单」那一档，
// 整列都写着「投诉单」），「场景描述」是一句写死的套话。于是这一档没法就地判，
// 只能一条条点进工单——与「实时监控」那一路当初的毛病一模一样，只是那边靠命中原话解决了。
//
// 🔴 **不另画一张长得像工作台的表**：摘要 / SLA 两行 / 状态徽章 / 优先级点 这几格的
// 呈现规则各有分支（光 SLA 就有五条），抄一份迟早与工作台分叉，同一张单在两个页面
// 说法不一。故给 `TicketRichList` 开了三个可选扩展位（`rowActionsFn` / `extraColumns` /
// `selectable`），本页当调用方用，一格都不重画。
/** 当前是不是停在「投诉单」「重要紧急」那两路（含它们的子档） */
const ticketListView = computed(() => (
  listView.value === 'realtime'
  && queueView.value === 'monitoring'
  && untaggedSlice.value !== 'kw'
));

/**
 * 传给富列表的那批工单。**逐行对应 `pagedQueueRows`，一行不多一行不少** ——
 * 富列表里的行数必须恒等于左栏角标与工作组 chip，这是这一页的第一条不变量。
 *
 * 🔴 **查不到工单的行不丢，补一张最小工单顶上**：`ticketOfRow` 返回 null 时，
 * 用这一行**自己确实带着的**东西（工单号、条目里的描述）拼一张出来，其余字段留空。
 * 丢掉那一行的话，左栏写着 11、表里躺着 10，而少的那一条谁也找不出来在哪 ——
 * 那正是本文件反复警告的坑。补出来的行看得见、点得开、也照样能打标。
 * 【它在今天的数据上是死路】三路入选时已经过了一道工单存在性判据
 * （`effectiveSourceOf` 那一支），派生单也在 `derivedTickets` 里查得到。留着是为了
 * 不变量不依赖"碰巧成立"：哪天某条入口漏了那道判据，界面上会多出一张空信息的行，
 * 而不是静默少一行。
 */
const FALLBACK_TICKET_HINT = '工单库与派生库里都查不到这张单 —— 数据异常，不是空数据';
function fallbackTicketOf(r: QueueRow): Ticket {
  return {
    ...({} as Ticket),
    id: `rq-${r.id}`,
    no: r.ticketNo,
    title: r.desc || r.ticketNo,
    customer: '—',
    product: '—',
    problemDesc: FALLBACK_TICKET_HINT,
  } as Ticket;
}
const pagedTicketRows = computed<Ticket[]>(
  () => pagedQueueRows.value.map((r) => ticketOfRow(r) ?? fallbackTicketOf(r)),
);

/**
 * 富列表按**工单 id** 收发勾选，而本页的批量打标按**队列行 id**（`QueueRow.id`）记选中。
 * 两边靠工单号搭桥，不另存第二份选中态 —— 存两份必然分叉，
 * "批量打标对一批看不见的行动手"就是这么来的。
 */
const rowByTicketNo = computed(() => new Map(queueRows.value.map((r) => [r.ticketNo, r])));
const selectedTicketIds = computed(() => {
  const s = new Set<string>();
  for (const t of pagedTicketRows.value) {
    const r = rowByTicketNo.value.get(t.no);
    if (r && bulkPicked.value.has(r.id)) s.add(t.id);
  }
  return s;
});
function toggleTicketPick(ticketId: string) {
  const t = pagedTicketRows.value.find((x) => x.id === ticketId);
  const r = t && rowByTicketNo.value.get(t.no);
  if (r) toggleBulkPick(r.id);
}
/** 这一行的「等待时长」——队列属性，工作台没有这一列，故走富列表的附加列扩展位 */
const TICKET_LIST_EXTRA_COLS = [{ key: 'waited', label: '等待时长', width: 72 }];
/**
 * 本页那张富列表的列宽。**必须自带一套**：工作台那一屏宽 1290+，它的默认列宽合计 1370，
 * 而本页左边还压着一列漏斗导航，清单区只剩 1045 —— 照默认摆下来横向溢出 325px，
 * 而"横着拖才能看全的表，等于每一行都要动两次手"（与「实时监控」那一路收窄列宽同一条理由）。
 * 🔴 走 `columnWidths` 这个 prop 而不是去改工作台的默认值：那份默认是全局 localStorage，
 * 改了会把工作台的列一起改窄。传了它的实例同时也不出拖拽把手 —— 在这里拖窄一列
 * 会写回那份全局记忆，工作台跟着变。
 * 合计 ＝ 16 + 200 + 168 + 100 + 46 + 76 + 96 + 88 + 88 + 72 + 88 ＝ 1038，放得下。
 */
const TICKET_LIST_COL_WIDTHS: Record<string, number> = {
  title: 200,
  summary: 168,
  sla: 100,
  priority: 46,
  customer: 76,
  product: 96,
  node: 88,
  flowNode: 88,
  action: 88,
};
function rowOfTicketNo(no: string): QueueRow | undefined {
  return rowByTicketNo.value.get(no);
}
/** 富列表的行内动作：这一段只有「核实打标」一枚，权限不足时不给按钮 */
function untaggedRowActions() {
  return canRiskTag.value ? [{ label: '核实打标', primary: true }] : [];
}
function onTicketRowAction(label: string, t: Ticket) {
  const r = rowOfTicketNo(t.no);
  if (label === '核实打标' && r) openEntryTag(r);
}

/* ---- 「实时监控」这一路 · 召回清单 ---- */
//
// 🔴 **行 ＝ 命中记录（一条召回一行）**，列与命中台账一致：等级 · 风险词 · 工单 · 命中内容 ·
// 客户 / 班组 · 时间 · 处置。只列**尚未打标的工单**上的命中；已打标的单上的命中在「已标记」段与命中台账里。
// 🔴 **计数单位仍是工单**：左栏角标、工作组 chip、分页都按**工单组**数，
// 故 `实时监控 + 投诉单 + 重要紧急 ＝ 未标记页签数` 不变；命中条数只在分页处与单数并写。
// 同一张单的命中相邻成组：组序沿用 `untaggedRows`（词表预设等级最重的在前），组内按命中时刻倒序，
// 分页按组切，一组不被拆到两页。
// 「处置」列的「核实打标」打的是**这张单的条目**（`openEntryTag`），不是改某条命中的核实结论 ——
// 故它随工单格跨整组合并，一组只出一枚。
/** 当前是不是停在「实时监控」那一路（含它的三个子档） */
const kwEvidenceView = computed(() => (
  listView.value === 'realtime'
  && queueView.value === 'monitoring'
  && untaggedSlice.value === 'kw'
));
/** 当前页的工单组，每组带着它过了筛选的命中。没有命中的组（数据异常）照实留一行，不吞 */
const kwPageGroups = computed(() => (
  kwEvidenceView.value
    ? pagedQueueRows.value.map((r) => ({ row: r, hits: kwHitsOf(r) }))
    : []
));
/** 当前这一档（已过筛选 / 子档 / 工作组）全部工单组上的命中条数 ——「N 单 · M 条命中」里的 M */
const kwHitTotal = computed(() => (
  kwEvidenceView.value
    ? queueRows.value.reduce((n, r) => n + kwHitsOf(r).length, 0)
    : 0
));
/**
 * 这一行的全部命中，**按词表预设等级从重到轻**排（同级早的在前）。
 * 次序与这一路的排队依据、子档分档依据同源（`PRESET_LEVEL_RANK`）——
 * 换一把尺的话，「等级」列显示的那条会与子档把它分进去的那一档对不上。
 */
function rowHits(r: QueueRow): RiskHit[] {
  return riskTags.hitsOfTicket(r.ticketNo).slice().sort((a, b) => (
    PRESET_LEVEL_RANK[a.level] - PRESET_LEVEL_RANK[b.level] || a.when.localeCompare(b.when)
  ));
}
/** 最重的那条命中；null ＝ 这张单没有命中（这一路里不该出现，出现了就照实显示「—」） */
function rowTopHit(r: QueueRow): RiskHit | null {
  return rowHits(r)[0] ?? null;
}

/* ---- 「已标记」段（已入池 / 无风险）的证据列 ---- */
//
// 【为什么这一段也要换列】它原先摆的是「监控来源」+「场景描述」，两列都答不了
// "这条**凭什么**被判成这个等级"：
//   · 监控来源只有三个值，且都是上游入口的复述；
//   · 场景描述是一句写死的套话（「投诉类工单自动纳入实时监控」），一个字的判据都没有。
// 于是复核一条打标结论——这一段唯一的活——只能一条条点进工单。
//
// 🔴 **两类行的证据不是一种东西，故这两列按行分岔**：
//   · 预警词捞进来的行**有命中记录** —— 摆 命中词 + 原话摘录（与「实时监控」那一路同一套聚合，
//     `rowWords` / `rowTopHit`，不另写一份）；
//   · 投诉单 / 重要紧急那两路**本就不产生命中** —— 摆工单自己的信息（问题描述）。
//   给后者硬凑一个空的「风险词」格并不诚实：它不是"没查到词"，是"这一路根本不靠词进来"。
// 客户 / 产品 与 SLA 两列对**两类行都成立**，故不分岔、恒取工单。
/** 当前是不是停在「已标记」段（已入池 / 无风险）那张表上 */
const taggedEvidenceView = computed(() => (
  listView.value === 'realtime' && queueView.value !== 'monitoring'
));
/** 这一行有没有命中记录 —— 上面那两列按它分岔 */
function rowHasHits(r: QueueRow): boolean {
  return rowHits(r).length > 0;
}
/**
 * 这一行的「摘要」：取工单的**问题描述**，不取条目里那句套话。
 * 查不到工单时退回条目描述 —— 那是这一行仅有的信息，比空着强。
 */
function rowSummaryOf(r: QueueRow): string {
  const t = ticketOfRow(r);
  return t?.problemDesc || t?.title || r.desc || '—';
}
/** 这一行的产品；查不到工单写「—」而不是留空 */
function rowProductOf(r: QueueRow): string {
  return ticketOfRow(r)?.product || '—';
}
/**
 * 这一行的 SLA 两行。**取工作台那一份单一真源**（`slaResolveLine` / `slaFirstLine`）——
 * 本页自己判一遍的话，同一张单在两个页面会给出不同的说法（光那两行的分支就有五条）。
 * 查不到工单时返回空数组，格子里写「—」。
 */
function rowSlaLines(r: QueueRow): { text: string; color: string }[] {
  const t = ticketOfRow(r);
  if (!t) return [];
  return [
    { ...slaResolveLine(t), text: `解决：${slaResolveLine(t).text}` },
    { ...slaFirstLine(t), text: `首响：${slaFirstLine(t).text}` },
  ];
}
/**
 * 这一行命中的**全部**风险词（去重、保序）。
 * 🔴 只显示第一条就完事的话，人会按一条不具代表性的词去定级 ——
 * "一单多命中"恰恰是这一路最需要被看见的形态。
 */
function rowWords(r: QueueRow): string[] {
  const out: string[] = [];
  for (const h of rowHits(r)) {
    const w = h.matchedWord || h.word;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}
/** 词多的时候只并排前两枚，其余折成「+N」，全部词挂在悬停上 */
const ROW_WORD_VISIBLE = 2;
/**
 * 这一行的工单标题。**取工单库的真标题**，不取条目里那句写死的套话 ——
 * 「投诉单」「重要紧急」两路的「场景描述」同样走它，那两路本就没有命中原话可摆。
 */
function rowTitleOf(r: QueueRow): string {
  return TICKET_BY_NO.get(r.ticketNo)?.title || r.desc;
}
/** 这一行的客户：优先取命中记录（它带着这一格），没有命中就退回工单 */
function rowCustomerOf(r: QueueRow): string {
  return rowTopHit(r)?.customer || TICKET_BY_NO.get(r.ticketNo)?.customer || '—';
}

/* ---- 「按标记人」：打标人这一维 ---- */

/**
 * 这条条目是谁打的标。**打标人是条目自己的字段**（`tag.by`），不像工作组要反查工单库。
 * 🔴 空值不吞：条目能进池就必然打过标，打标人为空是数据自身的异常，
 * 落一档「未署名」摆出来 —— 吞掉的话各人之和会小于「全部有风险」，
 * 而督导正是照这一行看"谁名下压着多少条"。
 */
const UNSIGNED_TAGGER = '未署名';
function taggerOf(e: RiskQueueEntry): string {
  return e.tag?.by || UNSIGNED_TAGGER;
}

/**
 * 左栏「按标记人」展开出来的那几行。底表是**已过工作组**的池内条目 ——
 * 每一行的数字就是点进去表里的行数，且**各行之和 ≡「按标记人」≡「全部有风险」**
 * （只数高 / 中 / 低，不含无风险）。条数多的排前面，同数按姓名排。
 *
 * 🔴 **不随选中的人收窄**：这几行本身就是选择器，选中一个人之后其余几行全变 0，
 * 人再也看不出该切到谁。
 */
const taggerChips = computed(() => {
  const base = inGroup(reportStore.pooledEntries);
  const m = new Map<string, number>();
  base.forEach((e) => {
    const who = taggerOf(e);
    m.set(who, (m.get(who) ?? 0) + 1);
  });
  return {
    total: base.length,
    rows: [...m].map(([tagger, count]) => ({ tagger, count }))
      .sort((a, b) => b.count - a.count || a.tagger.localeCompare(b.tagger)),
  };
});

/**
 * 左栏选中的那一档，**未过工作组筛选**。工作组 chip 那一排的数字要靠它算 ——
 * 让工作组筛选影响自己那一排的数字，选中一个组之后其余几枚全变 0，
 * 人再也看不出该切到哪一组（与 `reportSourceBase` 是同一条道理）。
 */
const queueBase = computed<QueueRow[]>(() => {
  if (queueView.value === 'monitoring') return untaggedRows.value;
  if (queueView.value === 'noRisk') return reportStore.noRiskEntries.map(rowOfEntry);
  const pooled = reportStore.pooledEntries;
  // 🔴 **三个轴同出 `pooledEntries` 这一份行集**：按风险等级 / 按标记人 / 按处置阶段
  // 是同一批条目的三种看法，差别只在各自多一层收窄。
  // 三个轴各取各的数据源（上一版「按处置阶段」取的是 B 线那张池行表）必然分叉：
  // 行对象不同 → 列跟着不同 → 总数还会随各自的默认收窄漂，而三者本该恒等。
  const picked = tagLevelFilter.value === 'tagger'
    ? (taggerFilter.value === 'all'
      ? pooled
      : pooled.filter((e) => taggerOf(e) === taggerFilter.value))
    : tagLevelFilter.value === 'stage'
      ? (poolStageFilter.value === 'all'
        ? pooled
        : pooled.filter((e) => poolStageTextOf(e.status) === poolStageFilter.value))
      : (tagLevelFilter.value === 'all'
        ? pooled
        : pooled.filter((e) => e.tag?.result === tagLevelFilter.value));
  return picked.map(rowOfEntry);
});
const queueRows = computed<QueueRow[]>(() => inGroup(queueBase.value));

const queuePageCurrent = ref(1);
const queuePageSize = ref(10);
const pagedQueueRows = computed(() => {
  const start = (queuePageCurrent.value - 1) * queuePageSize.value;
  return queueRows.value.slice(start, start + queuePageSize.value);
});
function setQueuePage(page: number, size: number) {
  queuePageCurrent.value = page;
  queuePageSize.value = size;
}

/**
 * 切三视图。**勾选不能跨视图残留**：在待打标里勾了三条再切到已入池，
 * 批量打标会对一批看不见的行动手（而那一批已经有结论了）。
 * 页码同理回到第一页——底表换了一批，停在第 3 页多半是一张空表。
 */
function setQueueView(v: QueueView) {
  if (v === queueView.value) return;
  queueView.value = v;
  clearBulk();
  queuePageCurrent.value = 1;
}

// 等级分档、标记人与工作组换了，底表就换了一批，页码必须回到第一页 ——
// 否则「第 3 页 → 切到中风险」会停在一张恰好没有行的页上。
watch([tagLevelFilter, taggerFilter, poolStageFilter, groupFilter], () => {
  queuePageCurrent.value = 1;
});

/**
 * 换「待标记」的切片：与 `setQueueView` 同一套善后 —— 勾选不能跨片残留
 * （在「预警词命中」里勾了三条切到「重要紧急」，批量打标会对一批看不见的行动手），
 * 页码同理回到第一页。
 * 🔴 这一段不能并进上面那个 watch：那个只管页码，而切片必须连勾选一起清。
 */
watch([untaggedSlice, untaggedSub], () => {
  clearBulk();
  queuePageCurrent.value = 1;
});

/**
 * 换**路**（或整个离开「未标记」这一段）时把筛选条清空。
 *
 * 🔴 **只在换路时清，换子档时不清**：清的理由是"三路的字段本来就不一样"——
 * 实时监控那一路有风险词、有原话，另两路一个都没有，留着上一路的条件只会让人以为筛坏了。
 * 而同一路的三个子档共用同一套字段，切子档就清掉的话，
 * 人在「实时监控」按词筛完点进「高风险」会看到全部，同样会以为筛选失灵；
 * 更要命的是子档角标此时按筛选算，点进去却清空筛选 —— 角标与表行数当场对不上，
 * 而"点哪一档，角标 ＝ 表行数"是这一列的第一条不变量。
 */
watch([untaggedSlice, queueView, listView], () => {
  resetUntaggedFilter();
});

/** 这条条目上的**现行打标结论**；空 ＝ 还在待打标 */
function tagResultOf(e: RiskQueueEntry): RiskTagResult | undefined {
  return e.tag?.result;
}
/**
 * 条目在池子里走到哪一步了 —— **界面词，与左栏「待处置」那三档逐字一致**。
 *
 * 落库值是「待分派 / 评估中 / 已评估」：`待分派` 是分派时代留下的词（分派整套已取消，
 * 这一档现在的含义就是"还没人领"）；`已评估` 收的其实是两路结论（评估 与 协同处理），
 * 而协同处理不产出评估决策，故界面词取更准的「已结论」（与工单侧 OpRiskDecision 同一个词）。
 * 🔴 同一个状态在左栏写一个词、在表里写另一个词，是这张页面最容易读串的一处，故收成这一个映射。
 * 待打标 / 已标记无风险两态不在池里，直接读状态本身。
 */
const POOL_STATE_TEXT: Record<string, string> = {
  待分派: '待领取',
  评估中: '已领取',
  已评估: '已结论',
};
function queueStatusText(e: QueueRow): string {
  return poolStageTextOf(e.status);
}
/**
 * 落库状态 → 池内阶段的界面词。**左栏「按处置阶段」那三档与表里「池内状态」那一格共用它**，
 * 故档名与格子里的词逐字一致、分档也不可能与显示分叉 —— 两处各写一份映射，
 * 迟早出现"左栏写已领取、表里写评估中"。null ＝ 不在池里（待打标 / 已标记无风险）。
 */
function poolStageTextOf(status: RiskQueueEntry['status'] | null): string {
  if (!status) return '—';
  return POOL_STATE_TEXT[status] ?? status;
}
/** 这一行有没有超时（只有在队的池行才谈得上超时，判据在 store） */
function rowOverdue(r: QueueRow): boolean {
  return reportStore.isOverdue({ status: r.status, at: r.at });
}
/** 等待时长：自进入实时监控起算 */
function rowWaitedText(r: QueueRow): string {
  return waitedText(r.at);
}

/* ---- 条目批量打标：**只在待打标视图**（业务口径） ---- */
// 【为什么另两个视图不给批量】它们装的都是**已经有结论**的条目，对这两批做的唯一一件事是
// 「修正」——而修正必须逐条写清"为什么改"（`amendReason` 必填）。
// 批量改判等于绕过那道必填门，一次给一批条目追加一条没有理由的改判，
// 而「已标记无风险」这一视图存在的全部意义恰恰是**核查漏标误判**，它最不该被一键刷过去。
const bulkPicked = ref<Set<string>>(new Set());
function toggleBulkPick(id: string) {
  const s = new Set(bulkPicked.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  bulkPicked.value = s;
}
const bulkAllPicked = computed(
  () => pagedQueueRows.value.length > 0 && pagedQueueRows.value.every((e) => bulkPicked.value.has(e.id)),
);
function toggleBulkAll() {
  const next = new Set(bulkPicked.value);
  if (bulkAllPicked.value) pagedQueueRows.value.forEach((e) => next.delete(e.id));
  else pagedQueueRows.value.forEach((e) => next.add(e.id));
  bulkPicked.value = next;
}
function clearBulk() { bulkPicked.value = new Set(); }

const bulkCount = computed(() => bulkPicked.value.size);
const showQueueSelection = computed(
  () => listView.value === 'realtime' && queueView.value === 'monitoring' && canRiskTag.value,
);
const batchMenuOpen = ref(false);

function pickBatchAction(action: 'tag' | 'clear') {
  if (action === 'tag') {
    if (!bulkCount.value) return;
    batchMenuOpen.value = false;
    openBulk();
    return;
  }
  if (bulkCount.value) clearBulk();
  batchMenuOpen.value = false;
}

const bulkOpen = ref(false);
/** 批量的结论与单条**同一个四选一**，不给"保持预设"这种只有批量才有的第五档 */
const bulkResult = ref<RiskTagResult | ''>('');
const bulkNote = ref('');
const canSaveBulk = computed(() => canRiskTag.value && !!bulkResult.value);
const bulkTargets = computed(
  () => untaggedRows.value.filter((r) => bulkPicked.value.has(r.id)),
);
/** 选中项的来源分布：一批里混着投诉单与预警词命中时，同一个结论未必都合适 */
const bulkSourceMix = computed(() => {
  const m = new Map<string, number>();
  bulkTargets.value.forEach((r) => {
    const k = effectiveSourceOf(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return [...m].map(([s, n]) => `${s} ${n}`).join(' · ');
});

function openBulk() {
  if (!canRiskTag.value) { message.warning('只有客诉专员、投诉督导与管理员可以打标'); return; }
  bulkResult.value = '';
  bulkNote.value = '';
  bulkOpen.value = true;
}
function saveBulk() {
  if (!bulkResult.value) { message.warning('请先给这批条目定一个打标结论'); return; }
  const result = bulkResult.value;
  const at = nowStamp();
  const targets = bulkTargets.value;
  // 与单条走**同一个入口**（recordTag），状态迁移与留痕都在 store 里那一处，
  // 批量另写一套的话，"低/中/高进池、无风险不进池"这条门槛迟早只改一处
  const done = targets.filter((r) => reportStore.recordTag(r.entry.id, {
    result,
    note: bulkNote.value.trim(),
    by: user.current.name,
    byRole: user.role.name,
    at,
  })).length;
  if (done < targets.length) {
    message.warning(`有 ${targets.length - done} 条监控条目已不存在，未打标 —— 请刷新后再看`);
  }
  message.success(
    isPoolLevel(result)
      ? `已对 ${done} 条打标「${riskLevelText(result)}」，已进风险工单池等待领取`
      : `已将 ${done} 条标记为无风险，不进池；可在「已标记无风险」视图里复核`,
  );
  bulkOpen.value = false;
  clearBulk();
}

/* ---- 单条风险打标：四选一（高 / 中 / 低 / 无风险） ---- */
//
// 🔴 **它与「核实打标」不是一回事**，两个弹窗各答各的问题：
//   · 本弹窗（条目）—— "**这张单有没有风险、多大**"。四选一，低/中/高进池、无风险不进池。
//   · 命中打标弹窗（`openTag`）—— "**这次命中准不准**"。成立/误报 + 定级，只回填词表准确率。
// 旧实现让后者顺手改前者的状态，于是一张单被三条词命中就会被搬进搬出池子三次，
// 而每次搬动的依据只是其中一条证据准不准。两者断开之后，入池只由本弹窗决定。
const entryTagOpen = ref(false);
const entryTagTarget = ref<QueueRow | null>(null);
const entryTagResult = ref<RiskTagResult | ''>('');
const entryTagNote = ref('');
/** 二次修改的理由。**首次打标没有这一项，改标必填**——只记改前改后而不记为什么，复盘时链条仍是断的 */
const entryTagReason = ref('');
/** 已经打过标的再打开就是修改：标题、按钮文案与必填项都随之不同 */
const entryTagAmend = computed(() => !!entryTagTarget.value?.tag);
/** 完整打标历史（含二次修改），时间正序。走 store 的 `tagHistoryOf`，与命中核实同一套留痕机制 */
const entryTagHistory = computed(
  () => (entryTagTarget.value ? reportStore.tagHistoryOf(entryTagTarget.value.id) : []),
);
/** 值没变就不该追加一条空修改，否则历史会被无意义的记录稀释 */
const entryTagDirty = computed(() => {
  const cur = entryTagTarget.value?.tag;
  if (!cur) return true;
  return entryTagResult.value !== cur.result || entryTagNote.value.trim() !== cur.note;
});
const canSaveEntryTag = computed(() => {
  if (!canRiskTag.value || !entryTagResult.value) return false;
  if (entryTagAmend.value) return entryTagDirty.value && !!entryTagReason.value.trim();
  return true;
});
/**
 * 打标时摆出来的**证据**：本单的风险词命中原话。
 * 另两类来源（投诉单 / 重要紧急）没有原话可摆，整块 v-if 掉、不留空标题。
 * 只取最近三条：这一屏是给人下判断的，不是把全部证据读完；要读全的点单号进工单。
 */
const entryTagHits = computed(() => {
  const t = entryTagTarget.value;
  if (!t) return [];
  return riskTags.hitsOfTicket(t.ticketNo)
    .slice()
    .sort((a, b) => b.when.localeCompare(a.when))
    .slice(0, 3);
});

function openEntryTag(e: QueueRow) {
  if (!canRiskTag.value) { message.warning('只有客诉专员、投诉督导与管理员可以打标'); return; }
  entryTagTarget.value = e;
  // 修改态先把现行结论灌回来：改完才知道自己动了哪一项
  entryTagResult.value = e.tag?.result ?? '';
  entryTagNote.value = e.tag?.note ?? '';
  entryTagReason.value = '';
  entryTagOpen.value = true;
}

function saveEntryTag() {
  const target = entryTagTarget.value;
  if (!target) return;
  if (!canRiskTag.value) { message.warning('无打标权限'); return; }
  if (!entryTagResult.value) { message.warning('请先给出打标结论'); return; }
  const amend = entryTagAmend.value;
  if (amend && !entryTagDirty.value) { message.warning('打标结论没有变化，无需修改'); return; }
  if (amend && !entryTagReason.value.trim()) { message.warning('请填写修正原因'); return; }
  const prev = target.tag?.result;
  const result = entryTagResult.value;
  const ok = reportStore.recordTag(target.entry.id, {
    result,
    note: entryTagNote.value.trim(),
    by: user.current.name,
    byRole: user.role.name,
    at: nowStamp(),
    ...(amend ? { amendReason: entryTagReason.value.trim() } : {}),
  });
  if (!ok) { message.warning('这条监控条目已不存在，请刷新后再看'); return; }
  entryTagOpen.value = false;
  /*
   * 提示必须把**去向**说出来，不能只说"保存成功"：打标的人做完这一步会以为事儿结了，
   * 而低/中/高的那一批其实刚进池、还等着有人领了给评估结论。
   * 评估中 / 已评估的条目改标**不改变它在池子里的位置**（见 store 的 `recordTag`），
   * 这一支要单独说清，否则人会以为自己刚把一条别人正在办的活拽走了。
   */
  const stuck = target.status === '评估中' || target.status === '已评估';
  message.success(
    stuck
      ? `已把 ${target.ticketNo} 的风险等级改为「${result}」；该条已在评估中或已有结论，位置不变`
      : isPoolLevel(result)
        ? amend
          ? `已把 ${target.ticketNo} 的打标由「${prev}」改为「${riskLevelText(result)}」，已在风险工单池`
          : `已对 ${target.ticketNo} 打标「${riskLevelText(result)}」，已进风险工单池等待领取`
        : amend
          ? `已把 ${target.ticketNo} 改判为无风险，已撤出风险工单池`
          : `已将 ${target.ticketNo} 标记为无风险，不进池；可在「已标记无风险」视图里复核`,
  );
}

// ---- 监控雷达 ----
// 「全面监控」是这个岗位的状态，不是一个数字。雷达把三件事一屏说清：
//   ① 一直在扫（扫描扇持续转）② 覆盖多大（全中心）③ 扫到了什么（光点＝命中，按等级着色）
// 光点坐标用**命中 id 派生的确定性哈希**，不用 Math.random——
// 随机会让每次刷新光点乱跳，看着像数据在变，其实没变。
function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
// 判为误报的不上雷达：雷达画的是"扫到了什么风险"，误报的结论恰恰是"这里没有风险"，
// 让它继续亮着，等于把已经排除掉的东西留在屏幕上继续吓人。
const radarBlips = computed(() =>
  rows.value.filter((h) => gradeOf(h) !== null).slice(0, 14).map((h) => {
    const n = hashOf(h.id);
    const g = gradeOf(h)!;
    const ring = g === '高' ? 0.3 : g === '中' ? 0.58 : 0.84;
    const angle = (n % 360) * (Math.PI / 180);
    const r = ring + ((n >> 9) % 12) / 100;
    return {
      id: h.id,
      x: 50 + Math.cos(angle) * r * 46,
      y: 50 + Math.sin(angle) * r * 46,
      color: RISK_LEVEL_STYLE[g].color,
      grade: g,
      title: `${g}危 · ${h.title}`,
    };
  }),
);

const untaggedHigh = computed(() =>
  allHits.value.filter((h) => !isJudged(h) && presetGradeOf(h) === '高'),
);

/* ==================== 页头大盘 · 督导要的四组数 ==================== */
//
// 业务给的四组：**每日报备量 / 各处理组标记情况 / 未标记的工单分布 / 被标记为无风险的工单**。
// 四组全部落在**监控条目**这个分母上，故整块并进页头左栏「监控数据」，
// 不另起第四块卡区——四块并排会把每块压到读不出数字的宽度，而三块的骨架现成。
//
// 🔴 每一个数都从现有 store 现算，**不预置任何写死的统计数字**：写死的数会在打完一次标之后
// 与列表当场对不上，而这一屏的全部用处就是让督导据以判断"今天该盯哪一批"。

/** 今天（自然日）进风险侧的条目 —— **每日报备量**。A 线自动识别与 B 线二线报备分开报：
 *  两者的来路完全不同（一个是系统捞的、一个是人报的），合成一个数就看不出今天是谁在动。 */
const dailyIntake = computed(() => {
  const today = todayPrefix();
  const auto = reportStore.items.filter(
    (r) => r.source !== '二线报备' && r.at.startsWith(today),
  ).length;
  const reported = reportStore.items.filter(
    (r) => r.source === '二线报备' && r.at.startsWith(today),
  ).length;
  // A 线还在实时监控（没进池）的条目不在 `items` 里，要单独并进来——
  // 「今天进来了多少」问的是入口，不是"今天有多少进了池"
  const monitoring = reportStore.monitoringEntries.filter((e) => e.at.startsWith(today)).length;
  const noRisk = reportStore.noRiskEntries.filter((e) => e.at.startsWith(today)).length;
  return { auto: auto + monitoring + noRisk, reported, total: auto + monitoring + noRisk + reported };
});

/*
 * 🔴 **页头这一块只讲"扫描本身"，与左栏零重叠**。
 *
 * 【为什么改】左栏漏斗已经把 待打标 / 已入池 / 已标记无风险 三个数完整摆在一列里了，
 * 页头再摆一遍就是**同屏重复**——两处摆同一个数，人只会去找它们为什么不一样。
 * 而"今天扫了几轮、扫出多少条命中、判掉了多少"这三件事左栏一个都答不了：
 * 左栏答的是**存量**（现在还堆着多少），这一块答的是**流量**（今天动了多少）。
 * 两者摆在同一屏上互相补足，才是这块卡区该有的用处。
 *
 * 【原「未打标分布」那一行删掉】它按监控来源给待打标条目分档，分母恒等于左栏的「全部待判」，
 * 是重复里最重的一处。「各处理组」那一行留着——组这一维左栏没有。
 */

/** 今日跑过的**实时扫描批次**。手动筛查是人发起的旁路，不算"系统今天跑了几轮" */
const scanRunsToday = computed(() => {
  const today = todayPrefix();
  return scanRuns.value.filter((r) => r.kind === 'realtime' && r.startedAt.startsWith(today));
});
/** 今日产生的**命中记录**条数（证据这一层的流量，与条目不是一个分母） */
const hitsToday = computed(() => {
  const today = todayPrefix();
  return allHits.value.filter((h) => h.when.startsWith(today)).length;
});
/** 今日**下过结论**的条目数：含判为无风险的那一批（判无风险同样是一次结论，不能不算工作量） */
const taggedToday = computed(() => {
  const today = todayPrefix();
  const hit = (e: RiskQueueEntry) => !!e.tag?.at.startsWith(today);
  return reportStore.pooledEntries.filter(hit).length + reportStore.noRiskEntries.filter(hit).length;
});

/**
 * **各处理组标记情况** —— 按工单所属处理组，看这一组的条目打没打标。
 *
 * 🔴 **组是从工单join 过来的，不是条目自己的字段**：监控条目上只有工单号。
 * 故这里按 `mock/tickets.ts` 反查，取 `resolveTicketGroupNames` 的第一个名字
 * （工单列表「分组名称」列用的就是它，两处同一个口径，不另造一套分组）。
 * 查不到的落「未归组」——**不吞掉**：吞掉的话各组之和会小于总数，
 * 督导照这一行决定先盯哪一组时，被吞的那几条永远没人管。
 */
const TICKET_BY_NO = new Map(TICKETS.map((t) => [t.no, t]));
/**
 * 🔴 **另一个"工单宇宙"的状态索引**（《【930】》§6.5 缺口 **G11**）：监控语料里有一批单的
 * 单号在**工单库里根本不存在**，它们的状态只有**语料自己写的那一个**。`SCANNABLE_TICKETS`
 * 的 `nodeStatus` 就是这一份：语料条目命中工单库时取工单库的状态，命中不了时由语料自带的
 * 「在办 / 终态」落成子状态（见 `mock/opsReport.ts` 的 `enrichScannableTicket`）。
 * 故本表**只在工单库解析不到时**当作状态来源用，解析得到时一律以工单库为准，两边不打架。
 */
const SCAN_TICKET_STATUS_BY_NO = new Map(SCANNABLE_TICKETS.map((t) => [t.ticketNo, t.nodeStatus]));
function groupNameOf(ticketNo: string): string {
  // 🔴 **两处都要查**，与 `ticketOf` 同一条规矩：升级派生出来的新投诉单落在 `derivedTickets` 里，
  // 只问静态工单库会把它整条判成「未归组」——它明明继承了原单的分组名。
  const t = TICKET_BY_NO.get(ticketNo) ?? derivedTickets.find(ticketNo);
  if (!t) return '未归组';
  return resolveTicketGroupNames(t)[0] ?? '未归组';
}
const groupTagStats = computed(() => {
  const m = new Map<string, { group: string; untagged: number; tagged: number; noRisk: number }>();
  const bump = (ticketNo: string, key: 'untagged' | 'tagged' | 'noRisk') => {
    const group = groupNameOf(ticketNo);
    const row = m.get(group) ?? { group, untagged: 0, tagged: 0, noRisk: 0 };
    row[key] += 1;
    m.set(group, row);
  };
  reportStore.monitoringEntries.forEach((e) => bump(e.ticketNo, 'untagged'));
  reportStore.pooledEntries.forEach((e) => bump(e.ticketNo, 'tagged'));
  reportStore.noRiskEntries.forEach((e) => bump(e.ticketNo, 'noRisk'));
  // 未打标多的排前面：这一行是给督导找"谁那边堆着没人判"用的
  return [...m.values()].sort((a, b) => b.untagged - a.untagged || b.tagged - a.tagged);
});

/* ==================== 左栏漏斗导航（本页的主导航） ==================== */
//
// 【为什么从四枚平铺页签改成一列纵向】原先的「实时监控 ｜ 手动筛查 ｜ 命中台账 ｜ 风险工单池」
// 是四枚并排的页签，而平铺页签这个形状**天生表达"四个平行的清单"**——
// 可这四者根本不平行：实时监控是上游、风险工单池是它的下游，手动筛查是往上游补货的手段，
// 命中台账则是词表准确率的旁路，压根不在这条链上。业务看完的原话是"看不懂这个漏斗和链路"，
// 症结就在这里：形状说的是并列，数据说的是流向，人只能信形状。
//
// 改成一列纵向之后，从上到下就是链路本身：
//
// ```
//   未标记 · 全部待判 ── 打标 ──▶ 已标记 · 高 / 中 / 低（＝全部有风险）── 入池 ──▶ 待领取 / 已领取 / 已结论
//                                  └─ 无风险 ─▶ 不进池，留在「无风险」里供核查漏标
// ```
//
// 上游、下游、分档、汇总全在一屏一列里。
//
// 【本轮：链路只有两段，第三段是同一批的第三个轴】原先把「待处置」当成链路的第三段，
// 与「未标记 / 已标记」并排做成三枚页签。**这是错的**：待处置三档
// （待领取 + 已领取 + 已结论）与「已标记 · 全部有风险」是**同一批条目**——
// 打标为高 / 中 / 低即入池，一条不多一条不少。摆成第三段之后页签上就多出一个数，
// 读起来像"又掉了几条"，而那几条是无风险、本就不进池：一段**不存在的流失**被画了出来。
//
// 故「待处置」搬进「已标记」，与「按标记人」并列成第三个轴：
// 同一批已标记条目，一个按**风险等级**看、一个按**标记人**看、一个按**处置阶段**看。
// 三者总数恒等，落在同一竖列上下对齐。链路真实只有两段：还没下结论 → 已下结论。
//
// 🔴 **两段的数不构成递减、不可相减**：未标记是**此刻的存量**、已标记是**历史累计**，
// 两批不相交、也没有父子关系。跑上三个月已标记必然远大于未标记，那是正常状态。
// 页签之间那枚「▸」表达的是工作流方向，不是数量关系。
//
// 🔴 **手动筛查与命中台账不在这一列里**：它们不是链上的一段。前者是"往「全部待判」里补货、给三路规则兜底"的动作、
// 后者是命中记录（另一个分母）的旁路台账，两者都退成右上角的次级入口。
// 摆回这一列会重新犯"把不平行的东西摆成平行"这个错。
//
// 【三组九档 → 三组十二档】业务补充口径之后，前两组各自长出了自己的维度：
//   · 「未标记」拆三路 —— 实时监控 / 投诉单 / 重要紧急（见 `UntaggedSlice`）；
//   · 「已标记」在等级之外多一个**按标记人**看的切面（老系统里那张「监控人员 · 数量」表）。
// 🔴 两组新增的那几档都是**同一批条目的切面，不是新的来源类别**：
//   前者之和恒等于「全部待判」、后者与「全部有风险」是同一批行，故都摆在各自汇总项的近旁，
//   且在组标题的悬停里写明"不可相加"——摆成并列而不说清楚，人第一反应就是把数加起来。
/**
 * 左栏每一行的键。**它同时是路由的目的地和选中态的判据**，故格式要能表达两级：
 * `untagged:<切片>` 是切面行本身，`untagged:<切片>:<子档>` 是它下面那一档。
 */
type RailKey =
  | `untagged:${UntaggedSlice}` | `untagged:${UntaggedSlice}:${string}`
  | 'level:高' | 'level:中' | 'level:低' | 'level:all' | 'level:tagger' | 'noRisk'
  // `stage:all` ＝「按处置阶段」那一行本身（不限阶段），与 `level:all`、`level:tagger` 同为"分类表头"
  | 'stage:all' | `stage:${string}`
  | `tagger:${string}`;

interface RailItem {
  key: RailKey;
  label: string;
  count: number;
  /**
   * 这一档的**全量**（未过「未标记」那条筛选）。只有**被筛的那一路**才给它，
   * 给了就渲染成「筛后 / 全量」两段式，如「2 / 11」。
   *
   * 【为什么要有它】筛选只收窄当前这一路，页签数却是三路全量，于是开着筛选时
   * `三路之和 ＝ 页签数` 这条恒等式在屏幕上会变成 `7 + 2 + 10 ≠ 28`。
   * 两条路都不好走：只让角标跟着变，屏幕上就真有一处数字打架，全靠悬停解释；
   * 让页签也跟着变，`28 → 19` 又会被读成"另外两路少了 9 条"。
   * 两段式把**分母摆回屏幕上**：斜杠后那个数就是这一路的全量，
   * `7 + 11 + 10 ＝ 28` 肉眼可验；斜杠前那个数仍然 ＝ 表里的行数（铁律一）。
   *
   * 🔴 **只给被筛的那一路**：未被筛的路与子档保持单个数，否则满屏斜杠，
   * 人反而看不出到底哪一路被收窄了。
   */
  countTotal?: number;
  /**
   * **缩进层级 ＝ 这一行与上一行的关系**，是这一列唯一的视觉语法：
   *   · `0` 不缩进 + 字重加粗 —— 本阶段的全量，或与它**并列的另一种分类**
   *         （「已标记」段的三个分类：全部有风险 / 按标记人 / 按处置阶段）；
   *   · `1` 缩进一级 + 常规字重 —— 上面那个分类的**取值行**（换个角度看同一批，不是下一步）；
   *   · `2` 缩进两级 + 更小字号 —— 取值行里再展开的一层（现在只剩「未标记」段的子档用得到）。
   * 🔴 没有这条语法的话，「预警词命中」与「已领取」在一列里长得一模一样，
   * 而前者是"同一批的一部分"、后者是"某个分类下的一个取值"，人只能信形状。
   */
  depth: 0 | 1 | 2;
  /** 数字标红：这一档堆着没人管就是要被看见的 */
  bad?: boolean;
  /** 可展开（「按标记人」「按处置阶段」两个分类）：给一个方向箭头，别让人以为它和「高危」是一类 */
  expandable?: boolean;
  expanded?: boolean;
  /**
   * 上方补一条细分隔线。**与 `depth` 分开是因为两者不重合**：
   * 「无风险」与「全部有风险」同为 depth 0，却要隔开——它是漏斗的**漏出口**、走到这儿止步，
   * 与"下一段"读起来必须不一样。
   */
  sep?: boolean;
  title: string;
}
/**
 * 漏斗的两段。**它是顶部页签的键**（原先是左栏的组标题）。
 *
 * 【为什么从"一列三组"改成"顶部页签 + 侧栏只渲染一段"】三组摊在一列里
 * 最长会摞到 24 行（未标记 14 + 已标记 6 + 待处置 3 + 三个组名），
 * 侧栏比右边那张表还高，人得上下扫两轮才找得到自己要的档。
 *
 * 【为什么是两枚而不是三枚】这条链真实只有两段：**还没下结论 → 已下结论**。
 * 「待处置」不是第三段，它与「按标记人」一样是**同一批已标记条目的另一个轴**
 * （见上面那段说明），故折进「已标记」的侧栏，不占页签。
 *
 * 🔴 **两枚上的数分属两批，不相减、不互校**：左边是**此刻还没打标的存量**、
 * 右边是**历史累计打过标的**，两批不相交、也没有父子关系。系统跑上三个月，
 * 已标记必然远大于未标记 —— 那是正常状态，不是漏损、更不是异常。
 * 故这里**不存在也不要去写** `未标记 ≥ 已标记` 这类断言：它是个必然会被违反的假不变式。
 * 中间那枚「▸」表达的是**工作流方向**（未标记 —打标→ 已标记），不是数量递减。
 * 真正成立的恒等式全在段内（三路之和 ＝ 全部待判；三个轴的总数相等），验收核那几条。
 */
type FunnelStage = 'untagged' | 'tagged';

interface RailGroup {
  stage: FunnelStage;
  title: string;
  /** 阶段的悬停说明：这一段在链路上是什么、分母是什么。原先挂在组标题上，组标题删了之后挂到页签上 */
  title2: string;
  /**
   * 页签上的**阶段总数**。🔴 它不是 `items[0].count`：
   * 「已标记」这一段的总数是**全部有风险 + 无风险**——无风险也是这一阶段下过的结论，
   * 漏掉它，页签上的数就比这一段真判过的少一截，而侧栏里明明还摆着那一档。
   */
  total: number;
  /** 切到这一段时侧栏落在哪一档。切页签不保留上一段的选中态，一律回默认档 */
  defaultKey: RailKey;
  items: RailItem[];
}

/** 池内某一等级的条目数（已过工作组筛选）。判档读现行 `tag.result`，与池内状态无关 */
function pooledLevelCount(lv: RiskLevel) {
  return inGroup(reportStore.pooledEntries.filter((e) => e.tag?.result === lv)).length;
}

/**
 * 池内某一处置阶段的条目数（已过工作组筛选）。
 *
 * 🔴 **底表与另两个轴逐字同源**（`pooledEntries`），判档读的是表里「池内状态」那一格
 * 显示的同一个词（`queueStatusText`）。故：
 *   · `待领取 + 已领取 + 已结论 ≡ 全部有风险 ≡ 按标记人`，三个轴恒等 —— 由构造成立；
 *   · **合计不随日期漂**。上一版这一轴接在 B 线那张池行表上，「已结论」带着「仅今日」
 *     这个默认收窄，跨了一天之后合计从 12 掉到 8，而另两个轴纹丝不动 ——
 *     同屏三个本该相等的数，有一个每天自己变。
 */
function pooledStageCount(stage: string) {
  return inGroup(reportStore.pooledEntries.filter((e) => poolStageTextOf(e.status) === stage)).length;
}

/**
 * 「未标记」某一路**连同它展开出来的子档**的那几行。
 *
 * 🔴 **父行的数字取整片的行数，不取 Σ子档**：两者可能差几条（推不出子档的行，
 * 见 `untaggedSubOf`），而父行的数字必须等于点进去表里的行数——那是这一列的第一条不变量。
 * 差额如实留着，比让父行显示一个"子档凑出来的漂亮总数"要好：后者会让人以为每一条都归了档。
 * 🔴 **子档为 0 也照常列出**：档位时有时无，人会以为筛选坏了。
 */
function untaggedSliceItems(
  slice: UntaggedSlice,
  label: string,
  title: string,
): RailItem[] {
  // 🔴 筛选条只收窄**当前这一路**：它的字段是按这一路配的（另两路根本没有风险词、没有原话），
  // 拿去套别的路等于用一把量不了的尺子去量。故另两路的角标不跟着变。
  // 🔴 被筛的那一路改摆**「筛后 / 全量」两段式**（见 `RailItem.countTotal`）：
  // 分母留在屏幕上，`7 + 11 + 10 ＝ 28` 肉眼可验，同时斜杠前那个数仍 ＝ 表里的行数。
  const raw = inGroup(untaggedSliceRows(slice));
  const filtered = slice === untaggedSlice.value && untaggedFilterDirty.value;
  const rows = filtered ? inGroup(applyUntaggedFilter(untaggedSliceRows(slice), slice)) : raw;
  const open = untaggedOpen.value[slice];
  const subCount = (k: string, list: QueueRow[]) => list.filter((r) => untaggedSubOf(r, slice) === k).length;
  const head: RailItem = {
    key: `untagged:${slice}` as RailKey,
    label,
    count: rows.length,
    countTotal: filtered ? raw.length : undefined,
    // 🔴 **d0**：三路提到与「已标记」段那三个分类同一层之后，这一段也只剩两级缩进。
    // 🔴 与「已标记」那三个 d0 **算法相反**：那边三个轴是同一批的三种看法、数天然相等、
    // 不可相加；这边三路两两互斥、可以相加，之和 ＝ 页签上那个数。
    // 同一套缩进语法承载相反的算法，故两边的 title 各写一句把算法钉死。
    depth: 0,
    expandable: true,
    expanded: open,
    title: `${title}。点它展开／收起下面的子档；行本身也可选 ＝ 这一路不限子档。`
      + '🔴 三路（实时监控 / 投诉单 / 重要紧急）两两互斥，**之和 ＝ 页签上那个数**',
  };
  if (!open) return [head];
  return [
    head,
    ...UNTAGGED_SUB_KEYS[slice].map((k) => ({
      key: `untagged:${slice}:${k}` as RailKey,
      label: untaggedSubLabel(slice, k),
      count: subCount(k, rows),
      // 子档同理只在被筛的这一路给两段式；另两路的子档保持单个数，免得满屏斜杠
      countTotal: filtered ? subCount(k, raw) : undefined,
      depth: 1 as const,
      title: `「${label}」里${untaggedSubLabel(slice, k)}的那一档`,
    })),
  ];
}

const railGroups = computed<RailGroup[]>(() => {
  // 页签上那个数 ＝ 三路之和。三路同出 `untaggedUniverse`、两两互斥，故这里直接取全集的条数，
  // 不去把三路加一遍：加出来的与它恒等，多写一处就多一处会分叉的口径
  const untaggedAll = inGroup(untaggedUniverse.value).length;
  const pooledAll = inGroup(reportStore.pooledEntries).length;
  const noRiskAll = inGroup(reportStore.noRiskEntries).length;
  return [
    {
      stage: 'untagged',
      total: untaggedAll,
      defaultKey: 'untagged:kw',
      title: '未标记',
      title2: '三路自动识别（实时监控 / 投诉单 / 重要紧急）捞到、还没有人给过结论的工单'
        + ' —— **此刻的存量**。分母是**工单**不是条目。'
        + '🔴 三路两两互斥，**三路之和 ＝ 这个数**（恒等号，不是约等）。'
        + '🔴 **它不是"整本工单库里没人标过的单"**：未标记是每张单与生俱来的默认态，'
        + '那样数出来的是全部在办单、永远清不零，真该判的那批反而被淹没。'
        + '🔴 这个数与「已标记」那个数**分属两批、不相减也不互校**：那边是历史累计打过标的，'
        + '跑久了必然比这边大，那是正常状态、不是漏损。'
        // 开着筛选时被筛的那一路显示「筛后 / 全量」，斜杠后那个数仍进这个恒等式 ——
        // 数字自己把话说清楚了，这里不再补一句文字解释
        + '🔴 开着清单上那条筛选时，被筛的那一路摆成「筛后 / 全量」，**斜杠后那三个数之和仍 ＝ 这个数**',
      items: [
        ...untaggedSliceItems('kw', '实时监控',
          '预警词捞进来的那一路。下面按**词表预设的识别风险等级**分档 —— 机器认为最重的排最前，人从上往下判。'
          + '表里是**尚未打标的工单上的命中**（待处理的召回，一条命中一行、同单成组）；角标数的是**工单**，不是命中条数。'
          + '全部召回历史（含已打标工单上的）在右上角「命中台账」'),
        ...untaggedSliceItems('complaint', '投诉单',
          '在办的投诉类工单那一路。下面按**工单优先级**分档'),
        ...untaggedSliceItems('urgent', '重要紧急',
          '在办 · P0 / P1 的**非投诉单**那一路。下面按**工单优先级**分档，这一路本就只有 P0 / P1 两档'),
      ],
    },
    {
      stage: 'tagged',
      // 🔴 **全部有风险 + 无风险**，不是「全部有风险」：无风险也是这一阶段下过的结论，
      // 页签数的是"这一段判过多少"，漏掉漏出口那一批，页签上的数就对不上侧栏那两档之和
      total: pooledAll + noRiskAll,
      defaultKey: 'level:all',
      title: '已标记',
      title2: '打过标的条目 —— **历史累计**，不是此刻的存量。高 / 中 / 低进风险工单池，无风险不进池。'
        + '🔴 这个数与「未标记」那个数分属两批、不相减也不互校：它比那边大是正常状态。'
        + '这一段摆三种并列的分类：按风险等级（全部有风险）、按标记人、按处置阶段 —— 同一批条目三个角度。'
        + '页签上的数 ＝ 全部有风险 + 无风险（两者都是这一段下过的结论）。'
        + '🔴 高 + 中 + 低 ≡ 全部有风险 ≡ 按标记人 ≡ 按处置阶段 ≡ 各自取值行之和，五处是同一批行',
      items: [
        {
          key: 'level:all' as RailKey,
          label: '全部有风险',
          count: pooledAll,
          depth: 0,
          title: '按风险等级看这一段：高危 + 中危 + 低危 的合计，不含无风险'
            + '（无风险是这条链的漏出口，算进来等于把已经排除掉的那批重新当成风险）。'
            + '🔴 与「按标记人」「按处置阶段」是**同一批条目的三种看法，数天然相等、不可相加**',
        },
        ...RISK_LEVELS.map((lv) => ({
          key: `level:${lv}` as RailKey,
          label: riskLevelText(lv),
          count: pooledLevelCount(lv),
          bad: lv === '高' && pooledLevelCount(lv) > 0,
          depth: 1 as const,
          title: `打标为${riskLevelText(lv)}、已进风险工单池的条目`,
        })),
        {
          key: 'level:tagger' as RailKey,
          label: '按标记人',
          // 🔴 恒等于「全部有风险」，**不随选中的人收窄**：它是"换一维看同一批"，
          // 而不是"看得更少了"。收窄发生在展开出来的人员行上，那几行的数字才是表里的行数。
          count: pooledAll,
          // 🔴 **d0，与「全部有风险」平级**：它不是「全部有风险」的第四档，
          // 而是同一批已标记条目的**另一种分类方式**（一种按风险等级看、一种按标记人看）。
          // 挂在 d1 上跟高/中/低并排时，读起来就成了"按标记人"是一个等级，那是错的。
          // 两个分类的总数因此落在同一竖列上、上下对得齐 —— "这是同一批的两种看法"一眼可见。
          depth: 0,
          expandable: true,
          expanded: taggerExpanded.value,
          title: '与「全部有风险」并列的**另一种分类**：同一批已标记条目换成按标记人看。'
            + '点它展开／收起下面的标记人清单；分母与「全部有风险」同一个，只数高 / 中 / 低，不含无风险。'
            + '🔴 与另两个轴是**同一批条目的不同看法，数天然相等、不可相加**',
        },
        ...(taggerExpanded.value
          ? taggerChips.value.rows.map((t) => ({
            key: `tagger:${t.tagger}` as RailKey,
            label: t.tagger,
            count: t.count,
            // 与高 / 中 / 低同一层：它们各自是所属分类下的取值行
            depth: 1 as const,
            title: t.tagger === UNSIGNED_TAGGER
              ? '条目上没有留下打标人 —— 不吞掉，否则各人之和会小于「全部有风险」'
              : `只看「${t.tagger}」已标记的风险工单`,
          }))
          : []),
        /*
          第三个轴：**按处置阶段**（原来那枚「待处置」页签搬进来）。
          🔴 它与「按标记人」是同一种东西 —— 同一批已标记条目换个轴看，不是漏斗的下一段：
          待领取 + 已领取 + 已结论 与「全部有风险」是同一批，打标为高/中/低即入池，一条不多一条不少。
          🔴 与另两个轴唯一的不同：它的三个取值是**真时间序**（待领取 → 已领取 → 已结论），
          另两个轴的取值之间没有先后。故这三行的排列顺序本身带信息，不按数量重排。
        */
        {
          key: 'stage:all' as RailKey,
          label: '按处置阶段',
          // 🔴 恒等于「全部有风险」，与「按标记人」同一条道理：它是"换一维看同一批"，
          // 不是"看得更少了"。收窄发生在展开出来的三个阶段行上。
          count: pooledAll,
          // 🔴 原「待处置」组标题旁的旁注「仅监控入池」**没有做成行尾可见的 note**：
          // 左栏收窄到 196px 之后，「按处置阶段」＋ 箭头 ＋ 数字已占满一行，
          // 再挂 5 个字会把档名挤到省略号 —— 而档名是这个选择器的唯一标识，
          // 截断比把旁注收进悬停更贵。故原话整句搬进下面的 title，一个字没减。
          depth: 0,
          expandable: true,
          expanded: poolAxisExpanded.value,
          title: '与「全部有风险」并列的**第三种分类**：同一批已标记条目换成按池内处置阶段看，'
            + '三个取值是真时间序（待领取 → 已领取 → 已结论）。点它展开／收起下面三档；行本身也可选 ＝ 不限阶段。'
            + '🔴 与另两个轴是**同一批条目的不同看法，数天然相等、不可相加**，且列也逐字相同 ——'
            + '三个轴同一张表、同一批行对象。'
            + '仅监控入池 —— 🔴 只数 A 线（打标进池的条目）：二线报备有自己的家 ——'
            + ' 工单工作台的「风险报备池」。'
            + '要领取 / 评估这一批，走页头「评估处置」那一块 —— 那是动作的工作面，这一列是看法',
        },
        ...(poolAxisExpanded.value
          ? POOL_STAGE_KEYS.map((s) => ({
            key: `stage:${s}` as RailKey,
            label: s,
            // 🔴 三档与父档同源（都从 `pooledEntries` 数），故 Σ三档 ≡ 父档恒成立，
            // 且**不随日期漂** —— 见 `pooledStageCount`
            count: pooledStageCount(s),
            bad: s === '待领取' && alineOverdueCount.value > 0,
            depth: 1 as const,
            title: s === '待领取'
              ? '还没有人领的池行 —— 谁有空谁领，池里没有分派'
              : s === '已领取'
                ? '已被客诉专员领走、还没有结论的池行'
                : '已经收口的池行：走评估的给了升级 / 不升级，走协同处理的给了意见与建议。'
                  + '🔴 **是累计、不是当日**：这一档不带任何时间收窄，故三档之和恒等于另两个轴',
          }))
          : []),
        {
          key: 'noRisk' as RailKey,
          label: NO_RISK,
          count: noRiskAll,
          depth: 0,
          sep: true,
          title: '打标判为无风险、不进池的条目 —— 漏斗的漏出口，走到这儿止步。'
            + '它不是回收站：核查漏标误判除了从这里翻出来改，没有第二条路',
        },
      ],
    },
  ];
});

/**
 * 左栏当前选中的那一档。**它是派生值不是第二个状态**：真源仍是
 * `listView` / `queueView` / `tagLevelFilter` / `reportView` 那几个，
 * 页头 KPI 卡改的也是它们。左栏另存一份的话，"从卡片点进来"与"从左栏点进来"
 * 会走出两条不同步的路，选中态与表里的数据当场分家。
 *
 * 手动筛查 / 命中台账两个旁路入口不在漏斗上，故返回 null —— 那时左栏**一档都不选中**，
 * 这不是缺陷：人此刻看的确实不是链上的任何一段，硬点亮一档才是假话。
 */
const railKey = computed<RailKey | null>(() => {
  if (listView.value === 'realtime') {
    if (queueView.value === 'monitoring') {
      // 选了子档就点亮子档那一行本身，不点亮它的父行 —— 左栏每一行的数字要等于表里的行数
      return (untaggedSub.value
        ? `untagged:${untaggedSlice.value}:${untaggedSub.value}`
        : `untagged:${untaggedSlice.value}`) as RailKey;
    }
    if (queueView.value === 'noRisk') return 'noRisk';
    if (tagLevelFilter.value === 'tagger') {
      // 选了某个人就点亮那一行本身，不点亮它的父行：左栏每一档的数字要等于表里的行数，
      // 而收窄之后表里躺的是那个人名下的几条
      return taggerFilter.value === 'all' ? 'level:tagger' : (`tagger:${taggerFilter.value}` as RailKey);
    }
    if (tagLevelFilter.value === 'stage') {
      return poolStageFilter.value === 'all' ? 'stage:all' : (`stage:${poolStageFilter.value}` as RailKey);
    }
    return tagLevelFilter.value === 'all' ? 'level:all' : (`level:${tagLevelFilter.value}` as RailKey);
  }
  // 🔴 **「评估处置」工作面不点亮左栏任何一档**（`listView === 'report'`）。
  // 它与手动筛查 / 命中台账同一类：**动作的工作面，不是漏斗的一档**——
  // 领取 / 评估 / 协同都在那儿，进出走页头「评估处置」那一块。
  // 上一版它借「按处置阶段」那几档当选中态，于是同一组键指着两张不同的表
  // （左栏点进去是条目表、页头卡点进去是池行表），行数与列都对不上 ——
  // 那正是"两套状态机分叉"。硬点亮一档才是假话，不点亮不是缺陷。
  return null;
});

/** 点左栏：把真源那几个状态一次写齐，页面上每一个通往漏斗某一段的入口都走这里 */
function setRail(key: RailKey) {
  if (key.startsWith('untagged:')) {
    setListView('realtime');
    setQueueView('monitoring');
    tagLevelFilter.value = 'all';
    const [slice, sub] = key.slice('untagged:'.length).split(':');
    // 点切面行本身 ＝ 这一路不限子档，同时展开／收起它的下级；
    // 已经停在这一行上时再点一次就收起来（与「按标记人」同一套手势）
    if (!sub) {
      const s = slice as UntaggedSlice;
      untaggedOpen.value = {
        ...untaggedOpen.value,
        [s]: !(railKey.value === key && untaggedOpen.value[s]),
      };
    }
    untaggedSlice.value = slice as UntaggedSlice;
    untaggedSub.value = sub ?? '';
    return;
  }
  if (key === 'noRisk') {
    setListView('realtime');
    setQueueView('noRisk');
    tagLevelFilter.value = 'all';
    return;
  }
  if (key.startsWith('tagger:')) {
    setListView('realtime');
    setQueueView('pooled');
    tagLevelFilter.value = 'tagger';
    taggerFilter.value = key.slice('tagger:'.length);
    return;
  }
  if (key.startsWith('level:')) {
    setListView('realtime');
    setQueueView('pooled');
    // 「按标记人」这一档自己也可选（＝不限定人），点它同时展开／收起下级；
    // 已经停在它上面时再点一次就收起来——这一列里它是唯一一个有下级的入口
    if (key === 'level:tagger') {
      taggerExpanded.value = !(railKey.value === 'level:tagger' && taggerExpanded.value);
      taggerFilter.value = 'all';
    }
    tagLevelFilter.value = key.slice('level:'.length) as RiskLevel | 'all' | 'tagger';
    return;
  }
  // 「按处置阶段」：与「按标记人」逐条同构 —— 同一批池内条目换一维看，
  // 走的是同一张表（`queueView === 'pooled'`），不是 B 线那张池行表。
  setListView('realtime');
  setQueueView('pooled');
  // 这一行自己也可选（＝不限阶段），点它同时展开／收起下级；
  // 已经停在它上面时再点一次就收起来 —— 与「按标记人」同一套手势
  if (key === 'stage:all') {
    poolAxisExpanded.value = !(railKey.value === 'stage:all' && poolAxisExpanded.value);
  }
  tagLevelFilter.value = 'stage';
  poolStageFilter.value = key === 'stage:all' ? 'all' : key.slice('stage:'.length);
}

/**
 * 离开「按标记人」就把标记人选择放掉。
 *
 * 【为什么它与工作组的处理不同】工作组横跨每一档不清空，因为组是工单的固有属性，
 * 在哪一档都答得上、且每一档都摆着那一行 chip 让人看得见自己筛过。
 * 标记人这一行**只在这一档出现**：带着它切走，人在别处看不到任何"已按谁收窄"的痕迹，
 * 回来时又莫名其妙只剩几条。故这一维随档进随档出。
 *
 * 🔴 挂在 `railKey` 上而不是 `setRail` 里：页头 KPI 卡是直接写 `setQueueView` 的另一条入口，
 * 只在 `setRail` 里清的话，从卡片切走的那条路会漏掉这一步。
 */
watch(railKey, (k) => {
  if (!(k === 'level:tagger' || k?.startsWith('tagger:'))) taggerFilter.value = 'all';
  // 处置阶段同理随档进随档出：它也只在这一档出现，带着它切走同样看不见任何"已收窄"的痕迹
  if (!k?.startsWith('stage:')) poolStageFilter.value = 'all';
});

/**
 * 当前停在漏斗的哪一段。**与 `railKey` 一样是派生值，真源仍是 `listView` / `queueView`**——
 * 🔴 顶部页签另存一个 ref 的话，页头那几枚 KPI 卡（它们直接写 `setQueueView` / `setReportView`）
 * 点下去会切了侧栏却不切页签：页签写着「待标记」，侧栏和表里躺的却是池行。
 * 本文件已经为"两套状态机分叉"付过两次账，这里不再开第二个真源。
 */
const stageOfView = computed<FunnelStage | null>(() => {
  // 池行（listView='report'）也属「已标记」：「按处置阶段」是这一段的第三个轴，不是第三段
  if (listView.value === 'report') return 'tagged';
  if (listView.value === 'realtime') return queueView.value === 'monitoring' ? 'untagged' : 'tagged';
  // 手动筛查 / 命中台账是旁路，不在漏斗的任何一段上
  return null;
});
/**
 * 旁路视图（手动筛查 / 命中台账）下页签停在哪一枚。
 * 那两个入口不属于任何一段，但侧栏总得渲染一段出来 —— 沿用离开漏斗前的那一段，
 * 从旁路点回侧栏时人回到自己原来待的地方，而不是被弹回「待标记」。
 */
const lastStage = ref<FunnelStage>('untagged');
watch(stageOfView, (s) => { if (s) lastStage.value = s; }, { immediate: true });
const funnelStage = computed<FunnelStage>(() => stageOfView.value ?? lastStage.value);

/** 侧栏只渲染当前这一段自己的档 —— 三段拆开之后，最长的一段也只有十几行 */
const currentRailGroup = computed<RailGroup>(() => {
  const gs = railGroups.value;
  return gs.find((g) => g.stage === funnelStage.value) ?? (gs[0] as RailGroup);
});

/**
 * 点顶部页签 ＝ 换一段，侧栏落到该段的**默认档**。
 * 🔴 不保留上一段的选中态：三段的档位互不相干，"记住上次停在高危"这种贴心
 * 会让人切过来时看见一张不是这一段全量的表，而页签上写的却是整段的总数。
 */
function setStage(stage: FunnelStage) {
  // 🔴 `railKey` 也要判：停在「评估处置」工作面时左栏一档都不选中（见 `railKey`），
  // 只判段的话，点这一段的页签会因为"已经在这一段了"而早退，人被卡在工作面上回不去左栏。
  if (stage === funnelStage.value && stageOfView.value && railKey.value) return;
  const g = railGroups.value.find((x) => x.stage === stage);
  if (!g) return;
  setRail(g.defaultKey);
}

/**
 * 工作组 chip 那一排：底表是**当前档在除工作组之外的全部条件下的行**，
 * 故选中某一组之后其余几枚的数字不变，人还看得出该切到哪一组。
 * 条数多的排前面；同数按组名排，免得同一份数据两次进来给出两个次序。
 */
const groupChips = computed(() => {
  const base: { ticketNo: string }[] = listView.value === 'report'
    ? reportGroupBase.value
    : queueBase.value;
  const m = new Map<string, number>();
  base.forEach((r) => {
    const g = groupNameOf(r.ticketNo);
    m.set(g, (m.get(g) ?? 0) + 1);
  });
  return {
    total: base.length,
    rows: [...m].map(([group, count]) => ({ group, count }))
      .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group)),
  };
});

/** 左栏这一列只在漏斗的两个视图上作数；旁路的两个入口自带各自的筛选条，不套工作组 */
const showGroupFilter = computed(() => listView.value === 'realtime' || listView.value === 'report');

//
// 🔴 **原先这里有一个 `currentRail`**，用来在清单正上方复述"当前是哪一段的哪一档"
// 外加一行口径说明。整个删掉了：阶段名已在顶部页签、档名已在左栏且带选中态，
// 右侧再复述一遍是同一个信息说第三遍；那行说明则是本项目明令禁止的"多行介绍文案"
// （而且 `item.title` 里带着给悬停写的 `**` 星号，直接渲染出来是一串没解析的 markdown）。
// 口径没丢：它本来就是左栏每一档按钮 `title` 的原文，悬停仍在。
//
/**
 * 「去管控」：只跳到工单、把入口送到人眼前，**不代替人做管控**。
 * 基线 ※27——分级决定"该找谁"，不代表系统自动指派；管控会把工单从原处理人
 * 名下拿走（在办量、解决率分母、超时数全变），这个代价必须由人承担判断。
 *
 * 【入口按工单级判，不按单条命中判】（《【915】》§7.2 的出现条件 + §9 规则 13a 的取值口径）
 * 管控管的是**工单**，不是某一条证据。
 * 一张单只要有一条条目被打为高危、或有一条命中被核实为成立·高危，该单每一行都该有这个入口——
 * 否则人正停在那条中危命中上，明明该管控却看不到路，还得先猜到"别处还有一条"。
 */
function goControl(h: RiskHit) {
  router.push(`/tickets/${h.ticketNo}`);
}
function openTicket(no: string) { router.push(`/tickets/${no}`); }

// ---- 风险词管理（维护权归投诉督导与管理员；客诉专员只打标、词表只读，基线 §3.1） ----
const riskWordsOpen = ref(false);
const canMaintainWords = computed(() => RISK_WORD_MAINTAIN_ROLES.includes(user.roleKey));
/** 原型本地词表：可新建，刷新后回 mock 初始值 */
const localWords = ref<RiskWord[]>([...RISK_WORDS]);
const enabledWords = computed(() => localWords.value.filter((w) => w.enabled));
const enabledWordCount = computed(() => enabledWords.value.length);
/**
 * 手动筛查的风险词下拉只列启用中的。停用是维护人给这条规则下的判决——
 * 把停用词摆进选项里（哪怕标着「停用」），等于邀请人把当初停用它的理由重演一遍：
 * 「孩子」一选就是上百条噪音，而筛查结果是要并入待核实队列的。
 */
const scanWordOptions = computed(
  () => enabledWords.value.map((w) => ({ value: w.id, label: w.word })),
);

const wordFormOpen = ref(false);
const wordForm = ref({
  word: '',
  synonyms: [] as string[],
  level: '中' as RiskLevel,
  scopes: ['问题描述', '沟通记录'] as string[],
  enabled: false,
});
const SCOPE_OPTIONS = SCAN_FIELDS;
/** 同义词输入框的暂存值：确认后才进 wordForm.synonyms，避免半截词被保存 */
const synonymDraft = ref('');

// ---- 词表编辑（PRD §4.11 · 备注 13a） ----
// 新建与编辑复用同一个表单，只在两处分叉：标题，以及主词能不能改。
//
// 🔴 可改的只有**同义词 / 匹配范围 / 分级**三项。
// 主词不在其中——它是统计口径与历史命中的归属键（命中记录只存主词、判重键按主词反查规则，
// 见 runManualScan），改了它，那批历史命中在台账里当场失去归属，判重也对不上号。
// 纠正主词的唯一路径是停用旧规则、另建一条。
//
// 启用/停用同样不在这个表单里：它与"规则内容"不是一回事，走词表列表末列那枚按钮，
// 两处都能改一个字段，人改完不知道自己动的是哪一处。
/** 正在编辑的词条 id；null ＝ 新建 */
const editingWordId = ref<string | null>(null);
const editingWord = computed(
  () => localWords.value.find((w) => w.id === editingWordId.value) ?? null,
);
const isWordEditing = computed(() => !!editingWord.value);

/**
 * 编辑保存时的字段 diff，用于「没改动则拦截」校验。
 */
type WordFieldChange = { field: string; from: string; to: string };

/**
 * 逐字段比对，产出变更条目。
 * 数组一律按**规范顺序**拼串再比：勾选先后不改变条件本身，
 * 按勾选顺序比会把"先点沟通记录再点标题"记成一次改动，而它什么都没改。
 */
function diffWord(
  prev: RiskWord,
  next: Pick<RiskWord, 'synonyms' | 'level' | 'scopes'>,
): WordFieldChange[] {
  const changes: WordFieldChange[] = [];
  const synPrev = prev.synonyms.join(' / ');
  const synNext = next.synonyms.join(' / ');
  if (synPrev !== synNext) changes.push({ field: '同义词', from: synPrev || '无', to: synNext || '无' });
  if (prev.level !== next.level) changes.push({ field: '分级', from: `${prev.level}危`, to: `${next.level}危` });
  const scopePrev = SCAN_FIELDS.filter((f) => prev.scopes.includes(f)).join(' / ');
  const scopeNext = SCAN_FIELDS.filter((f) => next.scopes.includes(f)).join(' / ');
  if (scopePrev !== scopeNext) changes.push({ field: '匹配范围', from: scopePrev, to: scopeNext });
  return changes;
}

function addSynonym() {
  const raw = synonymDraft.value.trim();
  if (!raw) return;
  // 粘贴一串同义词是常见输入方式，按常见分隔符一次拆开
  const items = raw.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
  for (const s of items) {
    if (s === wordForm.value.word.trim()) { message.warning(`「${s}」已是主词`); continue; }
    if (wordForm.value.synonyms.includes(s)) { message.warning(`「${s}」已在同义词中`); continue; }
    wordForm.value.synonyms.push(s);
  }
  synonymDraft.value = '';
}
function removeSynonym(i: number) {
  wordForm.value.synonyms.splice(i, 1);
}

function openWordForm() {
  editingWordId.value = null;
  wordForm.value = {
    word: '',
    synonyms: [],
    level: '中',
    scopes: ['问题描述', '沟通记录'],
    enabled: false,
  };
  synonymDraft.value = '';
  wordFormOpen.value = true;
}

/** 编辑既有词条：整条灌回表单，主词只读 */
function openWordEdit(w: RiskWord) {
  if (!canMaintainWords.value) { message.warning('只有投诉督导与管理员可以维护词表'); return; }
  editingWordId.value = w.id;
  wordForm.value = {
    word: w.word,
    // 逐个复制而不是直接引用：直接引用的话，人在弹窗里加删同义词会当场写进词表，
    // 点「取消」也收不回来——改动必须等到保存那一刻才落。
    synonyms: [...w.synonyms],
    level: w.level,
    scopes: [...w.scopes],
    enabled: w.enabled,
  };
  synonymDraft.value = '';
  wordFormOpen.value = true;
}

function saveWordEdit(prev: RiskWord) {
  const next = {
    synonyms: wordForm.value.synonyms.filter((s) => s !== prev.word),
    level: wordForm.value.level,
    scopes: [...wordForm.value.scopes],
  };
  const changes = diffWord(prev, next);
  // 什么都没改就不落一条空留痕：留痕是用来读"改成什么样了"的，
  // 掺进一批没有改动的记录，真正那次改动就被埋在里面了。
  if (!changes.length) { message.warning('同义词、匹配范围与分级都没有改动，无需保存'); return; }
  localWords.value = localWords.value.map((item) => (
    // 🔴 主词一律取原值，不取表单。表单那一格虽已置灰，但"界面挡住了"不等于"数据改不了"——
    // 守卫要落在写入这唯一的出口上，而不是落在某一个控件上。
    item.id === prev.id ? { ...item, ...next, word: prev.word, updatedAt: nowStamp() } : item
  ));
  message.success(
    `已保存「${prev.word}」的修改（${changes.map((c) => c.field).join(' / ')}）；`
    + '只对后续的实时识别与手动筛查生效，历史命中一条不动',
  );
  wordFormOpen.value = false;
}

function saveWord() {
  const word = wordForm.value.word.trim();
  if (!word) { message.warning('请填写主词'); return; }
  if (!wordForm.value.scopes.length) { message.warning('请至少选一个匹配范围'); return; }
  const editing = editingWord.value;
  if (editing) { saveWordEdit(editing); return; }
  localWords.value = [
    ...localWords.value,
    {
      id: `w-${Date.now()}`,
      word,
      synonyms: wordForm.value.synonyms.filter((s) => s !== word),
      level: wordForm.value.level,
      speakerLimit: '不限',
      scopes: [...wordForm.value.scopes],
      receivers: [],
      enabled: wordForm.value.enabled,
      hits7d: 0,
      hits7dRaw: 0, // 与 hits7d 同口径；当前无法区分发话角色
      judged7d: 0,
      valid7d: 0,
      updatedAt: nowStamp(),
    },
  ];
  message.success(wordForm.value.enabled ? `已新建并启用「${word}」` : `已新建「${word}」（停用中，启用后才参与自动识别与手动筛查）`);
  wordFormOpen.value = false;
}
function toggleWordEnabled(w: RiskWord) {
  if (!canMaintainWords.value) return;
  localWords.value = localWords.value.map((item) =>
    item.id === w.id ? { ...item, enabled: !item.enabled, updatedAt: nowStamp() } : item,
  );
  // 刚停用的词若还留在筛查条件里，下拉已经不列它、条件却还带着它，
  // 于是筛出来的结果与人看到的条件对不上。停用即从条件里摘掉。
  if (w.enabled) {
    scanForm.value.wordIds = scanForm.value.wordIds.filter((id) => id !== w.id);
  }
  message.success(w.enabled ? `已停用「${w.word}」` : `已启用「${w.word}」`);
}
</script>

<template>
  <div class="risk-monitor">
    <!--
      三层信息各归其位，不再挤在一条横带里：
      ① 页面标识条（本页是什么 + 随手要用的工具）
      ② 监控成效卡（这个岗位发现了什么、判准了没有——价值陈述，独立成卡才有分量）
      ③ 筛选条（操作区，随清单走，见下方命中清单卡）
    -->
    <!-- ① 页面标识：与个人门户 / 班组看板 / 工单监控同款 greeting-card -->
    <div class="greeting-card" :class="{ urgent: untaggedHigh.length > 0 }">
      <div class="greeting-lead">
        <!-- 雷达讲的是"覆盖与在扫"，属页面身份而非指标，故与标题同列 -->
        <div class="radar" :class="{ alert: untaggedHigh.length > 0 }">
          <div class="radar-face">
            <i class="radar-ring r1" /><i class="radar-ring r2" /><i class="radar-ring r3" />
            <i class="radar-cross v" /><i class="radar-cross h" />
            <i class="radar-sweep" />
            <i class="radar-hub" aria-hidden="true" />
            <i
              v-for="b in radarBlips" :key="b.id" class="radar-blip"
              :style="{ left: b.x + '%', top: b.y + '%', background: b.color, boxShadow: `0 0 6px ${b.color}` }"
              :title="b.title"
            />
          </div>
        </div>
        <div class="greeting-text">
          <div class="greeting-title">风险监控</div>
          <div class="greeting-sub">全中心 · 风险词实时命中 → 人工核实定级 → 成立后转交工单侧处置</div>
        </div>
      </div>
      <div class="greeting-aside">
        <div class="section-filters head-tools">
          <!--
            上次执行时刻＝最近一次扫库的结果，扫库记录是它的历史，
            两者是同一条信息的"此刻"与"过往"，合成一个控件而不是并排两个。
          -->
          <button
            type="button"
            class="run-entry"
            :disabled="!scanRuns.length"
            :title="scanRuns.length ? '查看扫库记录（实时监控与手动筛查）' : '尚未有过扫库执行'"
            @click="runsOpen = true"
          >
            <span class="monitor-last-run-k">上次执行</span>
            <span class="monitor-clock">{{ lastRefresh }}</span>
            <span class="run-entry-meta"><HistoryOutlined />扫库记录 {{ scanRuns.length }}</span>
          </button>
          <button type="button" class="monitor-refresh" title="刷新" @click="refresh"><ReloadOutlined /></button>
          <button type="button" class="word-entry" @click="riskWordsOpen = true">
            <SettingOutlined />
            <span class="word-entry-label">{{ canMaintainWords ? '风险词管理' : '查看风险词' }}</span>
            <span class="word-entry-meta">{{ enabledWordCount }} 启用</span>
          </button>
        </div>
      </div>
    </div>

    <!--
      ② 页头大盘：三栏 —— 左监控条目（打标漏斗）、中工单存量、右评估处置。
      三个分母（条目 / 工单 / 池行）两两不可相加，每个数的 title 各自写明自己数的是什么。
    -->
    <section class="overview-section effect-section">
      <div class="effect-split">
        <!--
          左栏 ＝ 监控数据。**它只讲扫描本身，与左栏漏斗零重叠**：
          待打标 / 已入池 / 已标记无风险 三个存量数已经完整摆在下方那一列漏斗里了，
          页头再摆一遍就是同屏重复 —— 两处摆同一个数，人只会去找它们为什么不一样。
          这一块答的是**今天动了多少**（流量）：扫了几轮、扫出多少条命中、判掉了多少。
          「各处理组」那一行留着 —— 组这一维漏斗那一列没有。
        -->
        <div class="effect-pane effect-pane--monitor">
          <h2
            class="pane-title"
            title="今天这套监控跑了些什么 · 四个数全按自然日算，与下方漏斗那一列的存量不是一个口径"
          >监控数据</h2>
          <div class="dash-grid dash-grid-4">
            <div
              class="dm-cell dm-static"
              :title="`今日进入风险侧的条目：自动识别 ${dailyIntake.auto} 条 · 二线报备 ${dailyIntake.reported} 条`"
            >
              <span class="dm-k">今日新增</span>
              <span class="dm-val">
                <span class="dm-v">{{ dailyIntake.total }}</span>
                <span class="dm-h">自动 {{ dailyIntake.auto }} · 报备 {{ dailyIntake.reported }}</span>
              </span>
            </div>
            <div
              class="dm-cell dm-static"
              title="今日跑过的实时扫描轮次 —— 手动筛查是人发起的旁路，不计在内。点右上角「扫库记录」看每一轮扫了什么"
            >
              <span class="dm-k">扫描批次</span>
              <span class="dm-val"><span class="dm-v">{{ scanRunsToday.length }}</span></span>
            </div>
            <div
              class="dm-cell dm-static"
              title="今日产生的风险词命中记录条数。🔴 分母是**命中**不是条目：一张单可以被三条词命中，两个数不可相加"
            >
              <span class="dm-k">命中记录</span>
              <span class="dm-val"><span class="dm-v">{{ hitsToday }}</span></span>
            </div>
            <div
              class="dm-cell dm-static"
              title="今日下过结论的条目数，含判为无风险的那一批 —— 判无风险同样是一次结论，不算进来就看不出今天判了多少活"
            >
              <span class="dm-k">今日打标</span>
              <span class="dm-val"><span class="dm-v">{{ taggedToday }}</span></span>
            </div>
          </div>
          <!--
            各处理组标记情况。组名由**工单号反查工单库**得到，与工单列表「分组名称」列同一个口径。
            ⚠️ 查不到工单的落「未归组」并照常列出，**不吞掉**：吞掉的话各组之和会小于总数，
            督导照这一行分配注意力时，被吞的那几条永远没人认领。
          -->
          <div class="dash-links">
            <span
              class="dash-links-k"
              title="按工单所属处理组看条目打没打标：待打标 / 已入池 / 无风险。组名由工单号反查工单库，与工单列表「分组名称」同一口径"
            >各处理组</span>
            <span
              v-for="g in groupTagStats"
              :key="g.group"
              class="dl-item dl-static"
              :title="`${g.group}：待打标 ${g.untagged} · 已入池 ${g.tagged} · 无风险 ${g.noRisk}`"
            >
              {{ g.group }}<b>{{ g.untagged }}</b>
              <small>已判 {{ g.tagged + g.noRisk }}</small>
            </span>
            <span v-if="!groupTagStats.length" class="dl-empty">当前没有监控条目</span>
          </div>
        </div>

        <!--
          中栏 ＝ 工单存量。分母是**工单**，另外两栏一个是监控条目、一个是池行，
          三栏并排最容易被读成一路数，故每个数各自 title 写明分母，且**整栏不可点**：
          点出去必然落在另一个分母的清单上，数对不上比不能点更糟。
        -->
        <div class="effect-pane effect-pane--ticket">
          <h2
            class="pane-title"
            title="工单系统里需要风险侧盯的存量 · 分母是在办工单，与左栏监控条目、右栏池行均不可相加"
          >工单存量</h2>
          <div class="dash-grid dash-grid-2">
            <div class="dm-cell dm-static" title="在办的投诉类工单 · 对应监控来源「投诉单」">
              <span class="dm-k">投诉工单</span>
              <span class="dm-val"><span class="dm-v">{{ complaintTicketCount }}</span></span>
            </div>
            <div
              class="dm-cell dm-static"
              title="在办且优先级为 P0 紧急 / P1 重要的工单 · 对应监控来源「重要紧急」"
            >
              <span class="dm-k">紧急 / 重要</span>
              <span class="dm-val"><span class="dm-v">{{ urgentTicketCount }}</span></span>
            </div>
          </div>
          <div class="dash-links">
            <span
              class="dash-links-k"
              :title="`共 ${ticketGradeDist.total} 张在办工单有工单级风险等级（该单已打标条目与已核实成立的命中取最高；打为无风险的、未打标的、误报与未核实的都不进分母）；占比按最大余数法取整，之和恒为 100%。此处数的是工单，与左栏「确认是风险」的高中低数的是命中，两组数天生不等`"
            >风险等级</span>
            <span
              v-for="r in ticketGradeDist.rows"
              :key="r.level"
              class="dl-item dl-static"
              :style="{ color: RISK_LEVEL_STYLE[r.level].color }"
            >
              {{ riskLevelText(r.level) }}<b>{{ r.count }}</b>
              <small v-if="ticketGradeDist.total">{{ r.pct }}%</small>
            </span>
            <!--
              空态文案以《【930】》§5.3.1 为准：分母是"按 §5A.3 算得出工单级风险等级的单"，
              不是"已核实成立的单"——后者把打标那一路（无命中记录的两类来源）说没了，
              与上面的取数口径对不上。
            -->
            <span v-if="!ticketGradeDist.total" class="dl-empty">暂无已打标进池的工单</span>
          </div>
        </div>

        <!--
          右栏 ＝ 评估处置。装的是**风险工单池里的池行**：A 线打标进池的条目 + B 线的二线报备。
          🔴 本轮**不再按来源排除任何一路**：打标已经是进池的前置门槛，能进池的都已经确认有风险，
          下一步只剩"升不升级"一个问题。旧口径把「关键词触发」那一路排除在分母外，
          在漏斗模型下会让一批确实要评估的条目不进分母，这一栏系统性报少。

          🔴 **块名由「风险评估」改成「评估处置」（只改块名，块内几枚 KPI 的文案与口径一个字没动）**。
          【为什么改】「风险评估」这个词已经背了三个意思：工单底栏的**动作**形态、非投诉单的**结论流程**、
          以及这里的**页头卡块名**。同一个词指三样东西，说"去看风险评估"没人知道说的是哪一处。
          更硬的一条：它与「风险报备池」页签上那三枚（待评估总数 / 超时未评 / 今日已评估）**同屏撞名**，
          两处只靠"分居两个页面"区分——一旦有人截图或转述，就分不出说的是哪一块的数。
          故这一块改叫「评估处置」：它讲的本就是池行**从进池到收口**这一段处置，与底栏那个动作脱钩。
        -->
        <div class="effect-pane effect-pane--report">
          <h2
            class="pane-title"
            title="风险工单池里的池行 · 打标进池的监控条目 + 二线报备，全部走评估二选一（升级 / 不升级）"
          >评估处置</h2>
          <div class="dash-grid dash-grid-3">
            <!--
              B1 待评估总数 ＝ **待领取 + 评估中**（N4 改口径，不再等于单一状态的条数）。
              🔴 点它落在「待领取」，表里的行数会**少于卡上的数**——这不是本文件开头那条
              「标签写着一个数、表里躺着另一批」：紧挨着的三枚 chip 就是它的分解，
              待领取 + 评估中 恒等于这个数，两者摆在同一屏上，读得出来。
              🔴 **点亮条件只认「待领取」「已领取」这两档**，不是 `reportView !== 'assessed'`：
              「按处置阶段 · 不限阶段」那一档**含已结论**，而这枚卡的口径是待领取 + 已领取、
              不含已结论 —— 在不限阶段上点亮，等于说"这个数就是当前这张表的分母"，而分母根本不同。
              `!onlyOverdue` 同样要留：开着超时收窄时看到的是这两档里超时的那几条，不是它们的全集
              （那一路归隔壁「超时未评」卡点亮）。
            -->
            <button
              type="button"
              class="dm-cell"
              :class="{
                on: listView === 'report'
                  && (reportView === 'unassigned' || reportView === 'assigning')
                  && !onlyOverdue,
                hot: alineOverdueCount > 0,
              }"
              title="待领取 + 已领取 · 池内还没有结论的全集"
              @click="setListView('report'); setReportView('unassigned'); onlyOverdue = false"
            >
              <span class="dm-k">待评估总数</span>
              <span class="dm-val">
                <span class="dm-v">{{ alineOpenCount }}</span>
                <span class="dm-h">
                  待领取 {{ alineUnassignedCount }} · 已领取 {{ alineAssigningCount }}
                </span>
              </span>
            </button>
            <!--
              B2 超时未评 · 下钻落到「按处置阶段 · 不限阶段」＋「超时未评」这个收窄。
              🔴 **不能落在「待领取」**：超时这件事横跨待领取与已领取两态，而超时的那几条
              完全可能一条都不在待领取里（领了没结论照样在走钟）。落单一档时，卡上写着 3、
              点进去是一张空表 —— 人只会以为这个数算错了，而不会想到"它们在隔壁那一档"。
              故去向取 `all`（不限阶段），三段一起看，那几条一条不落地出现在同一张表里。
              ⚠️ 两句调用**有先后**：`setReportView('all')` 自己会把两个阶段专属的收窄摘掉
              （见 setReportView，那是给左栏点击用的），故 `onlyOverdue = true` 必须写在它后面补上。
              顺序颠倒的话点下去就是"不限阶段的全表"，收窄当场丢掉。
            -->
            <button
              type="button"
              class="dm-cell"
              :class="{
                on: listView === 'report' && reportView !== 'assessed' && onlyOverdue,
                hot: alineOverdueCount > 0,
              }"
              :title="`超过 ${assessLimitText} 仍无结论 · 从进池时刻起算、不从领取时刻 · 不是 SLA`"
              @click="setListView('report'); setReportView('all'); onlyOverdue = true"
            >
              <span class="dm-k">超时未评</span>
              <span class="dm-val"><span class="dm-v">{{ alineOverdueCount }}</span></span>
            </button>
            <button
              type="button"
              class="dm-cell"
              :class="{ on: listView === 'report' && reportView === 'assessed' && decisionFilter === 'all' }"
              title="今日下过收口结论的池行 —— 升级 + 不升级 + 协同处理。三种收口都算，只数评估那两种会漏掉投诉单那一路"
              @click="setListView('report'); setReportView('assessed'); decisionFilter = 'all'"
            >
              <span class="dm-k">今日已结论</span>
              <span class="dm-val"><span class="dm-v">{{ alineConcludedTodayCount }}</span></span>
            </button>
          </div>
          <!--
            收口**三选一**：升级 / 不升级 / 协同。前两枚来自 store 的 ASSESS_DECISIONS
            （旧词「接管」整个作废，它同时背着三个意思；「升级」只指**转投诉单**，不含升三线）；
            🔴 第三枚「协同」是**投诉单那一路的收口方式**，不进那个枚举，由本页并上去 ——
            少这一枚的话，上面「今日已结论」与这一排之和会差一条，而那一条谁也找不出来在哪。
          -->
          <div class="dash-links">
            <span
              class="dash-links-k"
              title="今日三种收口各多少条 · 三枚之和 ≡ 上面的「今日已结论」"
            >今日结论</span>
            <button
              v-for="d in DECISION_KEYS"
              :key="d"
              type="button"
              class="dl-item"
              :class="{
                on: listView === 'report' && reportView === 'assessed' && decisionFilter === d,
                danger: d === '升级' && alineDecisionCounts[d] > 0,
              }"
              :title="d === '协同'
                ? '投诉单不做风险评估，走协同处理：给意见与建议，不改状态、不改处理人'
                : `评估结论「${d}」`"
              @click="setListView('report'); setReportView('assessed'); decisionFilter = d"
            >
              {{ d }}<b>{{ alineDecisionCounts[d] }}</b>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!--
      统一工作面：**左栏（阶段切换器 + 当前段的档）+ 右侧清单**。
      左栏是本页的主导航（上游 → 下游 → 分档 → 汇总，见 script 里 RailKey 那段的说明），
      右上角两枚次级入口是不在链上的两件事（手动筛查 / 命中台账）。
    -->
    <section class="overview-section work-panel">
      <div class="funnel-layout">
        <!--
          左栏 ＝ **阶段切换器 + 当前这一段自己的档**。
          每一档右侧的数字**就是点进去表里的行数**（已过当前工作组筛选）——
          标签写着一个数、表里躺着另一批，正是本文件反复踩过的坑。
          🔴 **段内先全量、后取值**：不缩进 ＝ 本段的全量或与它并列的另一种分类，
          缩进一级 ＝ 上面那个分类的取值行，缩进两级 ＝ 取值行里再展开的一层。
          这条语法两段一致，人扫一眼就分得清"这是同一批的另一个轴"还是"这是这个轴的一个取值"。
        -->
        <nav class="funnel-rail" :aria-label="`风险漏斗 · ${currentRailGroup.title}`">
          <!--
            阶段切换器：**一枚分段控件坐在档位正上方**，两段等分占满左栏。
            🔴 原先它是横贯整个工作面的一条通栏页签，为两枚按钮吃掉一整行高度、
            把右侧的表整个往下压；搬进左栏之后那一条高度全部还给了清单。
            🔴 **中间那枚「▸」表达的是工作流方向**（未标记 —打标→ 已标记），
            **不是数量递减**：左边是此刻未打标的存量、右边是历史累计打过标的，
            两批不相交，已标记大于未标记是正常状态。两个数不相减、不互校。
            🔴 **选中态必须与下面 `.fr-item` 的选中态分层**：它是上位开关（切阶段），
            下面是档位（切档）。两处长成一样的蓝块时，一列里上下两个蓝块，
            人分不清哪个管哪个；故这里走**白底 + 阴影浮起**的分段样式，
            下面那层才是蓝底 + 左侧主色标。
          -->
          <div class="fr-seg" role="tablist" aria-label="风险漏斗阶段">
            <template v-for="(g, gi) in railGroups" :key="g.stage">
              <span v-if="gi" class="fr-seg-arrow" aria-hidden="true">▸</span>
              <button
                type="button"
                role="tab"
                class="fr-seg-btn"
                :class="{ on: funnelStage === g.stage }"
                :aria-selected="funnelStage === g.stage"
                :title="g.title2"
                @click="setStage(g.stage)"
              >
                <span class="fr-seg-label">{{ g.title }}</span>
                <span class="fr-seg-num">{{ g.total }}</span>
              </button>
            </template>
          </div>
          <div class="fr-group">
            <template v-for="it in currentRailGroup.items" :key="it.key">
              <div v-if="it.sep" class="fr-sep" />
              <button
                type="button"
                class="fr-item"
                :class="[`d${it.depth}`, { on: railKey === it.key }]"
                :title="it.title"
                @click="setRail(it.key)"
              >
                <span class="fr-label">{{ it.label }}</span>
                <span v-if="it.expandable" class="fr-caret">{{ it.expanded ? '▾' : '▸' }}</span>
                <!--
                  「筛后 / 全量」两段式，只出在被筛的那一路上（见 RailItem.countTotal）。
                  🔴 前一个数恒 ＝ 表里的行数（铁律一），后一个数是这一路的全量 ——
                  分母留在屏幕上，`7 + 11 + 10 ＝ 页签数` 才仍然肉眼可验。
                -->
                <span class="fr-num" :class="{ bad: it.bad }">
                  {{ it.count }}<template v-if="it.countTotal != null"><span class="fr-num-den">/ {{ it.countTotal }}</span></template>
                </span>
              </button>
            </template>
          </div>
        </nav>

        <div class="funnel-main">
          <!--
            🔴 **表头不再复述"我是哪一档"**：阶段名在顶部页签上、档名在左栏且是选中态，
            右侧再写一遍「待标记 · 实时监控」是同一个信息说第三遍；
            那行多行口径说明也随之删掉 —— 它已经逐句挂在左栏每一档按钮的悬停上，
            旁路两枚入口的分母说明则挂在它们自己的按钮上。这一行现在只剩动作。
          -->
          <div class="funnel-main-head">
            <div class="section-head-actions">
              <a-dropdown
                v-if="showQueueSelection"
                v-model:open="batchMenuOpen"
                trigger="click"
                placement="bottomRight"
              >
                <div
                  class="row-btn scan-entry hit-batch-btn"
                  :class="{ active: bulkCount > 0 }"
                >
                  <UnorderedListOutlined :style="{ fontSize: '12px' }" />
                  <span>批量操作</span>
                  <span v-if="bulkCount > 0" class="hit-batch-badge">{{ bulkCount }}</span>
                  <DownOutlined :style="{ color: '#9CA3AF', fontSize: '10px' }" />
                </div>
                <template #overlay>
                  <a-menu class="batch-menu">
                    <a-menu-item :disabled="bulkCount <= 0" @click="pickBatchAction('tag')">
                      批量打标
                    </a-menu-item>
                    <a-menu-item :disabled="bulkCount <= 0" @click="pickBatchAction('clear')">
                      取消选择
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
              <!--
                🔴 **风险工单池那一枚「批量操作」已删**：它下面只有「批量分派」一个动作，
                而分派 / 改派 / 批量分派整套已随第三轮拍板取消。留一个只剩「取消选择」的下拉，
                等于在屏幕上留一个点开什么也做不了的入口。
              -->
              <!--
                手动筛查退成**动作按钮**：它不是一份平行的清单，而是"往待标记里补货"的手段。
                点开的仍是原来那套九维筛查条件面板，能力一格没动。
              -->
              <button
                type="button"
                class="row-btn scan-entry"
                :class="{ active: listView === 'scan' }"
                title="旁路 · **三路自动识别的兜底**：实时监控 / 投诉单 / 重要紧急 都没捞到的单，靠它拿条件去扫存量捞出来；扫出的命中勾选并入清单后，由自动识别把它带进「未标记」。它不是链上的一段，是往上游补货的手段"
                @click="setListView('scan')"
              >
                <SearchOutlined :style="{ fontSize: '12px' }" />
                <span>手动筛查</span>
                <span v-if="inScanResult" class="hit-batch-badge">{{ scanResult!.length }}</span>
              </button>
              <!--
                命中台账退成**次级入口**：它的分母是风险词命中记录，是词表准确率的旁路，
                不在主链上。🔴 只挪入口，内容与能力一个字没动。
              -->
              <button
                type="button"
                class="row-btn scan-entry"
                :class="{ active: listView === 'judged' }"
                title="旁路 · 风险词命中记录的台账：待核实 / 成立 / 误报三类都在，供事后点查与核实，词表准确率由它回填。分母是**全部命中记录**（含已打标工单上的，不是工单、也不是监控条目），与左栏条目不可相加；左栏「实时监控」只列其中尚未打标工单上的那部分"
                @click="setListView('judged')"
              >
                <TagsOutlined :style="{ fontSize: '12px' }" />
                <span>命中台账</span>
                <span class="hit-batch-badge">{{ ledgerTotal }}</span>
              </button>
            </div>
          </div>

          <!--
            工作组筛选（单选）。它是**另一层**：左栏选的是"链上哪一段"，这一行选的是
            "这一段里哪一个组的活"。故摆成单独一行、且横跨左栏每一档不清空 ——
            组是工单的固有属性，不随条目走到哪一段而变；切档就清掉的话，
            人在「全部待判 · 投诉风险组」筛完切到「高危」会看到全部组，只会以为筛选失灵。
            🔴 各枚的数字取的是**除工作组之外**的全部条件下的行数（见 groupChips），
            故选中一组之后其余几枚不归零，人还看得出该切到哪一组。
          -->
          <div v-if="showGroupFilter" class="section-filters grade-filters report-source-filters">
            <span class="rf-k">工作组</span>
            <button
              type="button"
              class="gf-chip"
              :class="{ active: groupFilter === 'all' }"
              title="不按工作组收窄"
              @click="groupFilter = 'all'"
            >
              全部工作组<span class="gf-num">{{ groupChips.total }}</span>
            </button>
            <button
              v-for="g in groupChips.rows"
              :key="g.group"
              type="button"
              class="gf-chip"
              :class="{ active: groupFilter === g.group }"
              :title="g.group === '未归组' ? '工单库里查不到所属组的条目 —— 不吞掉，否则各组之和会小于左栏的总数' : `只看「${g.group}」的条目`"
              @click="groupFilter = g.group"
            >
              {{ g.group }}<span class="gf-num">{{ g.count }}</span>
            </button>
          </div>

          <!--
            🔴 **原来那行标记人 chip 已删**：标记人清单现在就在左栏「按标记人」下面展开着。
            同一个选择器在两处并存就是同屏重复，人还得先猜哪一处才是当前生效的那个。
          -->

      <!--
        「未标记」筛选条。**复用命中台账那条查询条的类名与排版**（ledger-bar / list-toolbar /
        tb-fields / fi / tb-actions），一行新样式都不写 —— 这一段的外观已经定过，不该为多一条筛选另起一套。
        🔴 **只补筛选、不摆统计头**：命中统计（待核实 / 已核实 / 确认是风险 / 误报 / 规则准确率）
        讲的是词表质量，数在看板上展示；摆在日常打标的工作面前，
        等于把"规则准不准"塞给一个正在判"这张单有没有风险"的人。
        🔴 字段按路而变、且**不重复左栏子档与工作组 chip 已经承担的收窄**，见 `UntaggedFilter`。
      -->
      <div
        v-if="listView === 'realtime' && queueView === 'monitoring'"
        class="ledger-bar"
        @keyup.enter="applyUntaggedQuery"
      >
        <div class="list-toolbar">
          <div class="tb-fields">
            <div class="fi">
              <span class="fl">关键词</span>
              <div class="tb-search">
                <SearchOutlined class="tb-search-ic" />
                <input
                  v-model="untaggedFilter.keyword"
                  class="tb-search-input"
                  type="text"
                  :placeholder="untaggedSlice === 'kw' ? '工单号 / 标题 / 客户 / 命中原话' : '工单号 / 标题'"
                >
              </div>
            </div>
            <!--
              风险词 / 命中时间 / 核实结果只有「实时监控」这一路有：另两路的行是工单，压根不产生命中。
              控件与命中台账那条逐一同形（风险词取规则主词、核实结果四档同值）。
            -->
            <template v-if="untaggedSlice === 'kw'">
              <div class="fi">
                <span class="fl">风险词</span>
                <a-select
                  v-model:value="untaggedFilter.words" mode="multiple" allow-clear
                  size="small" class="tb-ctl"
                  :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                  :options="untaggedWordOptions"
                />
              </div>
              <div class="fi">
                <span class="fl">命中时间</span>
                <RangePicker
                  :value="untaggedDateRange"
                  :presets="scanRangePresets"
                  allow-clear
                  size="small"
                  format="YYYY-MM-DD"
                  :placeholder="['开始日期', '结束日期']"
                  class="tb-range"
                  @change="onUntaggedRangeChange"
                />
              </div>
              <div class="fi">
                <span class="fl">核实结果</span>
                <a-select
                  v-model:value="untaggedFilter.verdict"
                  size="small" class="tb-ctl"
                  :dropdown-match-select-width="false"
                  :options="[
                    { value: 'all', label: '全部' },
                    { value: 'open', label: '待核实' },
                    { value: '成立', label: '确认是风险' },
                    { value: '误报', label: '误报' },
                  ]"
                />
              </div>
            </template>
            <!--
              另两路的行就是工单，故筛的是工单自己的维度。
              🔴 「进监控时间」已删：实测 11 条里只有 2 条有进监控时刻，一设区间就只剩那 2 条。
            -->
            <template v-else>
              <div class="fi">
                <span class="fl">产品</span>
                <a-select
                  v-model:value="untaggedFilter.products" mode="multiple" allow-clear show-search
                  size="small" class="tb-ctl"
                  :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                  :options="untaggedProductOptions"
                />
              </div>
              <div class="fi">
                <span class="fl">当前状态</span>
                <a-select
                  v-model:value="untaggedFilter.statuses" mode="multiple" allow-clear
                  size="small" class="tb-ctl"
                  :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                  :options="untaggedStatusOptions"
                />
              </div>
              <div class="fi">
                <span class="fl">SLA</span>
                <a-select
                  v-model:value="untaggedFilter.sla"
                  size="small" class="tb-ctl"
                  :dropdown-match-select-width="false"
                  :options="[
                    { value: 'all', label: '不限' },
                    { value: 'over', label: '已超时' },
                    { value: 'ok', label: '未超时' },
                  ]"
                />
              </div>
            </template>
          </div>
          <div class="tb-actions">
            <button type="button" class="scan-go" @click="applyUntaggedQuery">
              <SearchOutlined />查询
            </button>
            <!-- 重置只清本条筛选：左栏选中档与工作组 chip 是另外两层，不归它管 -->
            <button type="button" class="tb-btn" :disabled="!untaggedFilterDirty" @click="resetUntaggedFilter">
              <ReloadOutlined /><span>重置</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 实时监控 · 空态：把当前视图讲出来，否则"这里没东西"会被读成"系统没在扫" -->
      <div v-if="listView === 'realtime' && !queueRows.length" class="ob-empty">
        <!-- 收窄条件必须在空态里复述，否则"筛空了"会被读成"没有了" -->
        <template v-if="groupFilter !== 'all'">「{{ groupFilter }}」在这一档下没有条目 —— 点「全部工作组」看全部</template>
        <template v-else-if="taggerFilter !== 'all'">「{{ taggerFilter }}」名下没有已标记的风险工单 —— 点左栏「按标记人」看全部</template>
        <template v-else-if="poolStageFilter !== 'all'">当前没有处在「{{ poolStageFilter }}」的池内条目 —— 点左栏「按处置阶段」看全部</template>
        <template v-else-if="untaggedFilterDirty">当前筛选条件下没有工单 —— 点「重置」看这一路的全部</template>
        <template v-else-if="queueView === 'monitoring' && untaggedSub">这一档下没有未标记的工单 —— 点上一级看这一路的全部</template>
        <template v-else-if="queueView === 'monitoring'">这一路没有待判的工单 —— 换一路看，或用右上角「手动筛查」去存量里捞</template>
        <template v-else-if="queueView === 'noRisk'">当前没有被判为无风险的条目</template>
        <template v-else-if="tagLevelText">当前没有打标为{{ tagLevelText }}的条目</template>
        <template v-else>当前没有已入池的条目 —— 打标为低 / 中 / 高的条目会落在这里</template>
      </div>

      <!--
        「投诉单」「重要紧急」两路 · **工作台那张富列表**（见 `ticketListView`）。
        这两路的行就是工单，故摆的是工单自己的信息：工单/标题 · 工单摘要 · SLA 时效 ·
        优先级 · 客户 · 产品 · 当前状态 / 节点，外加本页自己的「等待时长」与「核实打标」。
        🔴 **去掉了「监控来源」**：停在「投诉单」那一档，整列都写着「投诉单」——
        它是左栏档名的复述，占着一列却答不了任何问题。
        🔴 **去掉了「上一个节点」**：这一档要判的是"这张单现在什么样"，不是它怎么走过来的。
        🔴 行数、分页、勾选全部仍走本页那一套（`pagedQueueRows` / `bulkPicked`），
        富列表只负责渲染 —— 它自带的那套无分页全量渲染与本页左栏角标的口径对不上。
      -->
      <div v-if="listView === 'realtime' && ticketListView && queueRows.length" class="tk-list-wrap">
        <TicketRichList
          :rows="pagedTicketRows"
          variant="query"
          :selectable="showQueueSelection"
          :selected-ids="selectedTicketIds"
          :all-page-selected="bulkAllPicked"
          :column-order="['summary', 'sla', 'priority', 'customer', 'product', 'node', 'flowNode']"
          :column-widths="TICKET_LIST_COL_WIDTHS"
          :extra-columns="TICKET_LIST_EXTRA_COLS"
          :row-actions-fn="untaggedRowActions"
          @toggle="toggleTicketPick"
          @toggle-all="toggleBulkAll"
          @action="onTicketRowAction"
          @click-no="openTicket($event.no)"
          @open="openTicket($event.no)"
        >
          <!--
            等待时长：**队列属性**（自进监控时刻起算），工作台没有这一列，故走附加列扩展位。
          -->
          <!--
            多路来源的行内小标「兼：X」。与上面那张条目表**共用同一个判据**
            （`alsoSourcesOf`），两张表不会一处标、一处不标 —— 本文件族刚在
            「派生说明行」与「尚无核实结论」上连栽两次同源表述只改一处的跟头。
            单路行 `alsoSourcesOf` 返回空数组，v-for 不渲染，行一格不变。
          -->
          <template #title-extra="{ ticket }">
            <template v-if="rowOfTicketNo(ticket.no)">
              <span
                v-for="s in alsoSourcesOf(rowOfTicketNo(ticket.no)!)"
                :key="`also-${ticket.no}-${s}`"
                class="src-tag also-src"
                :title="alsoSourceTitle(rowOfTicketNo(ticket.no)!)"
              >兼：{{ s }}</span>
            </template>
          </template>
          <template #cell-waited="{ ticket }">
            <span
              class="rr-waited"
              :class="{ over: rowOfTicketNo(ticket.no) && rowOverdue(rowOfTicketNo(ticket.no)!) }"
              title="自进入实时监控起算。打标越慢，它进池时离处置时限就越近"
            >{{ rowOfTicketNo(ticket.no) ? rowWaitedText(rowOfTicketNo(ticket.no)!) : '—' }}</span>
          </template>
        </TicketRichList>

        <div class="pager">
          <div class="pager-left">
            <span class="pager-total">共 {{ queueRows.length }} 条</span>
            <span v-if="showQueueSelection && bulkCount > 0" class="pager-selected">已选 {{ bulkCount }} 项</span>
          </div>
          <AppPagination
            :total="queueRows.length"
            :current="queuePageCurrent"
            :page-size="queuePageSize"
            :show-total="false"
            @change="setQueuePage"
          />
        </div>
      </div>

      <!--
        实时监控 · 召回清单（见 script 里「召回清单」那段）。
        🔴 行 ＝ 命中，列与命中台账那张表一致；同一张单的命中相邻成组，
        勾选 / 工单 / 处置三格跨整组合并（它们都是**工单级**的：勾的是单、打标打的是单的条目）。
        🔴 分页按工单组切（`pagedQueueRows`），「N 单 · M 条命中」两个数分别取 `queueRows` 与 `kwHitTotal`。
      -->
      <div v-if="listView === 'realtime' && kwEvidenceView && queueRows.length" class="hit-table-wrap">
        <table class="hit-table">
          <thead>
            <tr>
              <th v-if="showQueueSelection" style="width: 36px">
                <div class="hit-cb" :class="{ checked: bulkAllPicked }" @click="toggleBulkAll">
                  <CheckOutlined v-if="bulkAllPicked" :style="{ color: '#fff', fontSize: '10px' }" />
                </div>
              </th>
              <th style="width: 52px">等级</th>
              <th style="width: 120px">风险词</th>
              <th style="width: 190px">工单</th>
              <th>命中内容</th>
              <th style="width: 118px">客户 / 班组</th>
              <th style="width: 60px">时间</th>
              <th style="width: 88px">处置</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="g in kwPageGroups" :key="g.row.id">
              <!-- 没有命中记录的组（数据异常）照实留一行，不吞：左栏角标数的是工单，少一组就对不上 -->
              <tr v-if="!g.hits.length">
                <td v-if="showQueueSelection">
                  <div class="hit-cb" :class="{ checked: bulkPicked.has(g.row.id) }" @click.stop="toggleBulkPick(g.row.id)">
                    <CheckOutlined v-if="bulkPicked.has(g.row.id)" :style="{ color: '#fff', fontSize: '10px' }" />
                  </div>
                </td>
                <td><span class="hit-sub">—</span></td>
                <td><span class="hit-sub">—</span></td>
                <td>
                  <button type="button" class="rt-no" @click="openTicket(g.row.ticketNo)">{{ g.row.ticketNo }}</button>
                  <div class="hit-title">{{ rowTitleOf(g.row) }}</div>
                </td>
                <td class="hit-excerpt"><span class="hit-sub">本单暂无命中记录</span></td>
                <td>{{ rowCustomerOf(g.row) }}<div class="hit-sub">{{ groupNameOf(g.row.ticketNo) }}</div></td>
                <td class="hit-when">—</td>
                <td>
                  <button
                    v-if="canRiskTag"
                    type="button" class="row-btn row-btn-tag"
                    title="判定这张单有没有风险、多大：高 / 中 / 低进风险工单池，无风险不进池"
                    @click="openEntryTag(g.row)"
                  >核实打标</button>
                  <span v-else class="hit-sub" title="打标归客诉专员、投诉督导与管理员">—</span>
                </td>
              </tr>
              <tr v-for="(h, hi) in g.hits" :key="`${g.row.id}-${h.id}`">
                <td v-if="showQueueSelection && hi === 0" :rowspan="g.hits.length">
                  <div class="hit-cb" :class="{ checked: bulkPicked.has(g.row.id) }" @click.stop="toggleBulkPick(g.row.id)">
                    <CheckOutlined v-if="bulkPicked.has(g.row.id)" :style="{ color: '#fff', fontSize: '10px' }" />
                  </div>
                </td>
                <td>
                  <!-- 与命中台账同一格：已核实的取核实等级，误报没有等级 -->
                  <span
                    v-if="gradeOf(h)"
                    class="grade-pill"
                    :style="{ color: RISK_LEVEL_STYLE[gradeOf(h)!].color, background: RISK_LEVEL_STYLE[gradeOf(h)!].bg }"
                  >{{ gradeOf(h) }}</span>
                  <span v-else class="hit-sub" title="判为误报的命中不带风险等级">—</span>
                </td>
                <td>
                  <div class="track-word">「{{ h.word }}」</div>
                  <div v-if="h.matchedWord && h.matchedWord !== h.word" class="track-word-sub">命中「{{ h.matchedWord }}」</div>
                  <div class="track-word-sub">词表预设 {{ presetGradeOf(h) }}危</div>
                  <!-- 命中已在台账里被核实过才出：这是**命中**的核实结论，不是这张单的打标结论 -->
                  <span
                    v-if="verdictOf(h)"
                    class="verdict-chip"
                    :class="verdictOf(h) === '误报' ? 'vc-fp' : 'vc-ok'"
                    :title="tagTraceTitle(h)"
                  >命中{{ verdictOf(h) }}</span>
                </td>
                <td v-if="hi === 0" :rowspan="g.hits.length">
                  <button type="button" class="rt-no" @click="openTicket(g.row.ticketNo)">{{ g.row.ticketNo }}</button>
                  <div class="hit-title">{{ rowTitleOf(g.row) }}</div>
                  <!-- 多路命中才标「兼：X」，判据与另两路富列表同一个 `alsoSourcesOf` -->
                  <span
                    v-for="s in alsoSourcesOf(g.row)"
                    :key="`also-${g.row.id}-${s}`"
                    class="src-tag also-src"
                    :title="alsoSourceTitle(g.row)"
                  >兼：{{ s }}</span>
                  <div v-if="g.hits.length > 1" class="hit-sub">本单 {{ g.hits.length }} 条命中</div>
                </td>
                <td class="hit-excerpt" :title="h.excerpt">
                  <span class="hit-pos">{{ h.position }}</span>
                  <span class="excerpt-quote">「<template v-if="excerptWindow(h).headTruncated">…</template>{{ excerptWindow(h).before }}<mark v-if="excerptWindow(h).hit" class="excerpt-hit">{{ excerptWindow(h).hit }}</mark>{{ excerptWindow(h).after }}<template v-if="excerptWindow(h).tailTruncated">…</template>」</span>
                </td>
                <td>{{ h.customer }}<div class="hit-sub">{{ h.groupName }} · {{ h.assignee }}</div></td>
                <!-- 这一档不设时间窗、跨天常见，故日期与时刻都给 -->
                <td class="hit-when">{{ h.when.slice(5, 10) }}<div>{{ h.when.slice(11, 16) }}</div></td>
                <td v-if="hi === 0" :rowspan="g.hits.length">
                  <button
                    v-if="canRiskTag"
                    type="button" class="row-btn row-btn-tag"
                    title="判定这张单有没有风险、多大：高 / 中 / 低进风险工单池，无风险不进池。打的是这张单的条目，不改任何一条命中的核实结论"
                    @click="openEntryTag(g.row)"
                  >核实打标</button>
                  <span v-else class="hit-sub" title="打标归客诉专员、投诉督导与管理员">—</span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <div class="pager">
          <div class="pager-left">
            <span class="pager-total">共 {{ queueRows.length }} 单 · {{ kwHitTotal }} 条命中</span>
            <span v-if="showQueueSelection && bulkCount > 0" class="pager-selected">已选 {{ bulkCount }} 单</span>
          </div>
          <AppPagination
            :total="queueRows.length"
            :current="queuePageCurrent"
            :page-size="queuePageSize"
            :show-total="false"
            @change="setQueuePage"
          />
        </div>
      </div>

      <!--
        已标记段 · 条目表（已入池三轴 / 无风险共用）。
        🔴 「未标记」三路都不走这张表：「实时监控」走上面的召回清单，「投诉单」「重要紧急」走富列表。
      -->
      <div v-if="listView === 'realtime' && queueView !== 'monitoring' && queueRows.length" class="hit-table-wrap report-table-wrap">
        <table class="hit-table report-table">
          <thead>
            <tr>
              <th style="width: 152px">工单</th>
              <!--
                🔴 「监控来源」「场景描述」两列**已删**，换成下面这四列，见 `taggedEvidenceView`。
                列宽合计 1014px（152+88+156+90+104+72+80+96+72+104），加内边距正好占满 1044 的清单区 ——
                与「实时监控」那一路收窄列宽同一条理由：横着拖才能看全的表，每一行都要动两次手。
                ⚠️ **按有纵向滚动条时的可用宽算**（1044，不是 1058）：行少到不出滚动条时会多出 14px，
                照那个宽度定列，行一多就溢出，而"行少的时候不溢出"恰恰是最容易漏测的一种。
                ⚠️ **SLA 那一格要 104**：最长的一种是「解决：超 88:40」，给 88 会把末位数字切掉半个
                （实测显示成「超 88:4(」）—— 一个被切掉的时间数字比不显示更糟。
              -->
              <th v-if="taggedEvidenceView" style="width: 88px">风险词</th>
              <th v-if="taggedEvidenceView" style="width: 156px">证据 / 摘要</th>
              <th v-if="taggedEvidenceView" style="width: 90px">客户 / 产品</th>
              <th v-if="taggedEvidenceView" style="width: 104px">SLA</th>
              <th style="width: 72px">打标结论</th>
              <th :style="taggedEvidenceView ? 'width: 80px' : 'width: 104px'">打标人</th>
              <th :style="taggedEvidenceView ? 'width: 96px' : 'width: 128px'">打标时刻</th>
              <th v-if="queueView === 'pooled'" style="width: 72px">池内状态</th>
              <th style="width: 128px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in pagedQueueRows" :key="e.id">
              <td>
                <button type="button" class="rt-no" @click="openTicket(e.ticketNo)">{{ e.ticketNo }}</button>
                <!--
                  🔴 **多路命中才标「兼：X」，单路行什么都不显示**（《【930】》§5A.1 / 附录 A R50b
                  要求来源多值并列；而归属仍是唯一的，见 `allSourcesOf` 的说明）。
                  【为什么不加回整列】九成的行是单路，那一列在它们身上就是左栏档名的复述；
                  为一成的行让每一行都多占一列，是拿全表的可读性换一个偶发的信息。
                  故做成**跟着行走**的弱化 chip：有才出、没有就不占位。
                -->
                <span
                  v-for="s in alsoSourcesOf(e)"
                  :key="`also-${e.id}-${s}`"
                  class="src-tag also-src"
                  :title="alsoSourceTitle(e)"
                >兼：{{ s }}</span>
              </td>
              <!--
                风险词：**只有带命中记录的行有**。投诉单 / 重要紧急那两路本就不靠词进来，
                给它们凑一个空格并不诚实 —— 那不是"没查到词"，是"这一路根本不产生命中"，
                故写「不适用」而不是「—」。呈现与「实时监控」那一路同一套（前两枚 + 折叠）。
              -->
              <td v-if="taggedEvidenceView">
                <template v-if="rowHasHits(e)">
                  <span
                    v-for="w in rowWords(e).slice(0, ROW_WORD_VISIBLE)"
                    :key="w"
                    class="src-tag kw"
                  >{{ w }}</span>
                  <span
                    v-if="rowWords(e).length > ROW_WORD_VISIBLE"
                    class="kw-more"
                    :title="rowWords(e).join('、')"
                  >+{{ rowWords(e).length - ROW_WORD_VISIBLE }}</span>
                </template>
                <span v-else class="hit-sub" title="这一路不靠预警词进来（投诉单 / 重要紧急按工单属性自动识别），故没有命中词">不适用</span>
              </td>
              <!--
                证据 / 摘要：**两类行摆的不是一种东西**——
                有命中的摆原话摘录（复核打标结论要看的就是这句话），
                没命中的摆工单的问题描述。全文一律挂 title，这一屏是用来复核的、不是读完再判。
              -->
              <td v-if="taggedEvidenceView" class="rr-desc">
                <template v-if="rowHasHits(e)">
                  <div :title="rowTopHit(e)!.excerpt">{{ rowTopHit(e)!.excerpt }}</div>
                  <span
                    v-if="rowHits(e).length > 1"
                    class="kw-more"
                    :title="rowHits(e).map((h) => `【${riskLevelText(h.level)}·${h.matchedWord || h.word}】${h.excerpt}`).join('\n')"
                  >+{{ rowHits(e).length - 1 }} 条命中</span>
                </template>
                <span v-else :title="rowSummaryOf(e)">{{ rowSummaryOf(e) }}</span>
              </td>
              <td v-if="taggedEvidenceView" class="rr-desc">
                {{ rowCustomerOf(e) }}<div class="hit-sub" :title="rowProductOf(e)">{{ rowProductOf(e) }}</div>
              </td>
              <!-- SLA 两行取工作台那一份单一真源（见 rowSlaLines），本页不另判一遍 -->
              <td v-if="taggedEvidenceView">
                <template v-if="rowSlaLines(e).length">
                  <div
                    v-for="l in rowSlaLines(e)"
                    :key="l.text"
                    class="sla-line"
                    :style="{ color: l.color }"
                  >{{ l.text }}</div>
                </template>
                <span v-else class="hit-sub">—</span>
              </td>
              <td>
                <!-- 无风险不是一档风险等级，故不套等级配色；套上去等于给已排除的东西重新贴风险标 -->
                <span
                  v-if="e.tag && isPoolLevel(e.tag.result)"
                  class="grade-pill"
                  :style="{ color: RISK_LEVEL_STYLE[e.tag.result].color, background: RISK_LEVEL_STYLE[e.tag.result].bg }"
                >{{ riskLevelText(e.tag.result) }}</span>
                <span v-else-if="e.tag" class="state-chip" :title="e.tag.note">{{ e.tag.result }}</span>
                <span v-else class="hit-sub">—</span>
              </td>
              <td>
                {{ e.tag?.by ?? '—' }}<div v-if="e.tag" class="hit-sub">{{ e.tag.byRole }}</div>
              </td>
              <td class="hit-when">{{ e.tag?.at ?? '—' }}</td>
              <td v-if="queueView === 'pooled'">
                <span class="state-chip" :title="e.assignee ? `承办人 ${e.assignee}` : '还没有人领'">{{ queueStatusText(e) }}</span>
              </td>
              <td>
                  <!--
                    去管控只对**高危**出（基线 ※27）：管控会把工单从原处理人名下拿走，
                    在办量、解决率分母、超时数全变，这个代价不该由一条低危条目触发。
                  -->
                  <button
                    v-if="queueView === 'pooled' && e.tag?.result === '高'"
                    type="button" class="row-btn row-btn-primary"
                    :title="`本条打标为高危，转交${DISPOSAL_BY_GRADE['高'].who}`"
                    @click="openTicket(e.ticketNo)"
                  >去管控<ArrowRightOutlined /></button>
                  <!--
                    修正：判错的那一条不改就永远错着。「已标记无风险」这一视图存在的
                    全部意义就是它 —— 漏标误判除了从这里翻出来改，没有第二条路。
                  -->
                  <button
                    v-if="canRiskTag"
                    type="button" class="row-btn row-btn-amend"
                    :title="queueView === 'noRisk' ? '重新判定这条是否真的无风险；改判为低 / 中 / 高会补进风险工单池' : '重新判定风险等级；改判为无风险会把它撤出风险工单池'"
                    @click="openEntryTag(e)"
                  >修正</button>
                  <span v-if="!canRiskTag" class="hit-sub" title="打标与修正归客诉专员、投诉督导与管理员">—</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="pager">
          <div class="pager-left">
            <span class="pager-total">共 {{ queueRows.length }} 条</span>
          </div>
          <AppPagination
            :total="queueRows.length"
            :current="queuePageCurrent"
            :page-size="queuePageSize"
            :show-total="false"
            @change="setQueuePage"
          />
        </div>
      </div>

      <!--
        风险工单池 · 下钻收窄标。
        🔴 **三态切换已挪到左栏那一列**（待领取 / 已领取 / 已结论）：三态是这条链
        最后一段的三个阶段，本就该与上游几档摆在同一列里读，摆在这里等于把链路截成两半。
        这一行留下的全是**收窄条件**——它们是"我现在只看其中一部分"，与"换一段来看"不是一件事。
      -->
      <div
        v-if="listView === 'report' && (onlyOverdue || sourceFilter !== 'all'
          || (reportView === 'assessed' && (assessedTodayOnly || decisionFilter !== 'all'))
          || (reportView === 'all' && !onlyOverdue && assessedTodayOnly))"
        class="section-filters grade-filters report-filters"
      >
        <!--
          下钻收窄标：从上方 KPI 卡点进来的条件必须在清单旁边有一个**看得见、摘得掉**的落点。
          没有它，人从「超时未评 2」点进来只看到 2 行，会当成队列只剩 2 条。
          🔴 超时横跨待领取与已领取两态，故这里给的是**两态之和**，与左栏那两档上分开的条数
          相加恒等——不是同一个数写了两遍。
          🔴 数取 `alineOverdueCount`、**不取 store 的 `overdueCount`**：后者两条线一起数，
          而本页从头到尾只数 A 线（见 `isALine`）。拿它的话，页头卡写 3、这枚标写 4、表里躺着 3 行，
          同一块屏上两个数——差的那一条是回自己家（工单工作台「风险报备池」）的二线报备。
        -->
        <span v-if="reportView !== 'assessed' && onlyOverdue" class="nc-chip bad">
          超时未评 {{ alineOverdueCount }}
          <button type="button" class="nc-del" title="看全部在队条目" @click="onlyOverdue = false">×</button>
        </span>
        <span v-if="sourceFilter !== 'all'" class="nc-chip">
          来源：{{ sourceFilter }}
          <button type="button" class="nc-del" title="看全部监控来源" @click="sourceFilter = 'all'">×</button>
        </span>
        <span v-if="reportView === 'assessed' && decisionFilter !== 'all'" class="nc-chip">
          结论：{{ decisionFilter }}
          <button type="button" class="nc-del" title="看全部结论（升级 / 不升级 / 协同）" @click="decisionFilter = 'all'">×</button>
        </span>
        <!--
          「仅今日」默认就开着，故它也得摆出来——不摆的话，翻不到昨天的记录会被读成"昨天没人评估"。
          摘掉它＝看全部历史，此时上方两枚决策卡（自然日口径）与表里的行数不再相等，是有意为之。
          🔴 不限阶段那一档也要摆：它把「已结论」整段并了进来，这个默认收窄照样在起作用，
          不说的话，左栏「按处置阶段」那一行的数与"池里到底有多少条"会被读成同一件事。
          🔴 但不限阶段**同时开着「超时未评」**时不摆：那一刻「已结论」整段根本不在表里
          （见 reportAllRows），再摆一枚"已结论仅今日"就是在说一个当前不起作用的条件，
          摘掉它表里也一行不多——摆着只会让人以为摘了能多看到几条。
        -->
        <span
          v-if="(reportView === 'assessed' || (reportView === 'all' && !onlyOverdue)) && assessedTodayOnly"
          class="nc-chip"
        >
          已结论仅今日
          <button type="button" class="nc-del" title="看全部历史评估记录" @click="assessedTodayOnly = false">×</button>
        </span>
      </div>

      <!--
        监控来源筛选（N6）。单独占一行而不与三态 chip 挤在一排：
        两者是**不同的两层**——三态是这批池行走到哪一步，来源是它从哪儿进的池，
        混成一排会让人以为"待领取"和"投诉单"是可以二选一的同级选项。
      -->
      <div v-if="listView === 'report'" class="section-filters grade-filters report-source-filters">
        <span class="rf-k">监控来源</span>
        <button
          type="button"
          class="gf-chip"
          :class="{ active: sourceFilter === 'all' }"
          @click="sourceFilter = 'all'"
        >
          全部来源<span class="gf-num">{{ reportSourceBase.length }}</span>
        </button>
        <button
          v-for="s in QUEUE_SOURCES"
          :key="s"
          type="button"
          class="gf-chip"
          :class="{ active: sourceFilter === s }"
          @click="sourceFilter = s"
        >
          {{ s }}<span class="gf-num">{{ sourceCountInView(s) }}</span>
        </button>
      </div>

      <!-- 风险工单池 · 空态：把当前收窄条件讲出来，否则"筛空了"会被读成"没有了" -->
      <div v-if="listView === 'report' && !reportRows.length" class="ob-empty">
        <!-- 收窄条件必须在空态里复述，否则"筛空了"会被读成"没有了"；工作组排在最前，它是最外一层 -->
        <template v-if="groupFilter !== 'all'">「{{ groupFilter }}」在这一档下没有池行 —— 点「全部工作组」看全部</template>
        <template v-else-if="reportView === 'all'">
          {{
            onlyOverdue
              ? `当前没有超过 ${assessLimitText} 仍无结论的在队条目`
              : sourceFilter !== 'all'
                ? `「${sourceFilter}」当前没有进池的条目`
                : '当前没有进池的条目 —— 打标为高 / 中 / 低才进池'
          }}
        </template>
        <template v-else-if="reportView !== 'assessed'">
          {{
            onlyOverdue
              ? `当前没有超时未评的${reportView === 'unassigned' ? '待领取' : '已领取'}条目`
              : sourceFilter !== 'all'
                ? `「${sourceFilter}」当前没有${reportView === 'unassigned' ? '待领取' : '已领取'}的条目`
                : reportView === 'unassigned' ? '暂无待领取条目' : '暂无已领取条目'
          }}
        </template>
        <template v-else-if="assessedTodayOnly">
          {{ decisionFilter === 'all' ? '今日尚无收口记录' : `今日尚无「${decisionFilter}」的收口记录` }}
        </template>
        <template v-else>没有符合当前条件的评估记录</template>
      </div>

      <!--
        风险工单池队列表。在队两态（待领取 / 评估中）共用一张表：它们的列几乎相同，
        分成两张表迟早只改一处；差异只有承办人一列，就地 v-if 掉。
        🔴 **没有勾选列**：批量只服务于批量分派，而分派整套已取消。
      -->
      <div v-if="listView === 'report' && reportRows.length" class="hit-table-wrap report-table-wrap">
        <table v-if="reportView !== 'assessed'" class="hit-table report-table">
          <thead>
            <tr>
              <th style="width: 190px">工单号</th>
              <!-- 来源列可点排序：多类来源合一队之后，"先把同一类过一遍"是最常见的翻法 -->
              <th
                style="width: 100px"
                class="th-sortable"
                :class="{ on: sourceSort !== 'none' }"
                :title="sourceSort === 'none' ? '点击按监控来源分组（同来源内仍按等待时长）' : sourceSort === 'asc' ? '点击倒序' : '点击恢复按等待时长排'"
                @click="cycleSourceSort"
              >监控来源<span class="th-sort-mark">{{ sourceSort === 'asc' ? '↑' : sourceSort === 'desc' ? '↓' : '↕' }}</span></th>
              <th style="width: 104px">报备人</th>
              <th style="width: 92px">报备原因</th>
              <th style="width: 92px">风险类型</th>
              <th>场景描述</th>
              <!--
                不限阶段这一档三段混在一张表里，**必须给一列写明每行走到哪一步**：
                否则「领取」与「评估」两个按钮在同一列里交替出现，人看不出凭什么这行能领、那行只能评。
              -->
              <th v-if="reportView === 'all'" style="width: 68px">处置阶段</th>
              <th
                v-if="reportView === 'assigning' || reportView === 'all'"
                :style="reportView === 'all' ? 'width: 80px' : 'width: 92px'"
              >承办人</th>
              <th style="width: 128px">提交时刻</th>
              <th style="width: 84px">等待时长</th>
              <!--
                已领取行现在是**两枚按钮**（处置 +「释放」，§5.4 元素 ⑥ ⑩a），
                88px 装不下「协同处理」+「释放」，故放宽；多出来的宽度从「场景描述」那一列让。
              -->
              <th style="width: 136px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in pagedReportRows" :key="r.id">
              <td>
                <button type="button" class="rt-no" @click="openTicket(r.ticketNo)">{{ r.ticketNo }}</button>
              </td>
              <td><span class="src-tag" :class="{ kw: isKeywordRow(r) }">{{ r.source }}</span></td>
              <td>{{ r.by }}<div class="hit-sub">{{ r.byRole }}</div></td>
              <td>{{ r.reason }}</td>
              <!-- 风险类型只在「风险场景」这一档有值，其余档位空着就是正确结果，不回填任何默认值 -->
              <td>{{ r.category ?? '—' }}</td>
              <!-- 单行截断，全文挂 title：队列是用来挑下一条办的，不是在这里读完再判 -->
              <td class="rr-desc" :title="r.desc">{{ r.desc }}</td>
              <td v-if="reportView === 'all'"><span class="src-tag">{{ poolStageOf(r) }}</span></td>
              <td v-if="reportView === 'assigning' || reportView === 'all'">{{ r.assignee ?? '—' }}</td>
              <td class="hit-when">{{ r.at }}</td>
              <!--
                🔴 超时**只标这一格，整行不变色**：队列长起来后满屏红底，
                反而看不出到底哪几条超了——红色只有稀缺时才是警报。
                等待时长恒从**进池 / 提交时刻**起算、不从领取时刻（N5）：
                没人领的那段空悬时间不能从账上抹掉。
              -->
              <td
                class="hit-when rr-waited"
                :class="{ over: reportStore.isOverdue(r) }"
                :title="reportStore.isOverdue(r) ? `已超过 ${assessLimitText}评估时限（自提交时刻起算）` : `评估时限 ${assessLimitText}，自提交时刻起算`"
              >{{ waitedText(r.at) }}</td>
              <td>
                <!--
                  待领取 · **只有「领取」这一个动作**（分派 / 改派 / 批量分派整套已取消）。
                  投诉督导在这一列**看得见、点不动**：他本轮已去权，只看数据。
                -->
                <!--
                  🔴 **按行自己走到哪一步判，不按当前是哪一档判**：不限阶段那一档里
                  三段混在一张表上，照 `reportView` 判的话，已结论的行也会长出一枚「评估」按钮。
                -->
                <!--
                  🔴 **先按原单类型分工作面，再按走到哪一步分动作**（《【930】》§2 摘要表 ·
                  §5.2 两处「投诉单不做风险评估」· §9 池内分工作面 —— 同一条口径 PRD 写死了四处）：
                  **投诉单 → 协同处理**，**非投诉单 → 风险评估**。
                  此前两类一律出「评估」，投诉单点开是升级 / 不升级弹窗 ——
                  而"升不升级成投诉单"对一张已经是投诉单的单根本不成立。
                  协同不必先领取、已结论也可再协同（§5C.1 次数行），故它不进下面那三档分支。
                -->
                <!--
                  🔴 **「释放」摆在处置按钮右边，两类工作面都有**（§5.4 元素 ⑥ ⑩a：
                  已领取行 ＝ 处置按钮 +「释放」）：投诉单那一路的处置按钮是「协同处理」，
                  非投诉单那一路是「评估」，但**退回池子这件事与原单类型无关** ——
                  只与"这条在不在人手上"有关。判据统一走 `canReleaseRow`（三道：角色 / 状态 / 人）。
                -->
                <template v-if="isComplaintTicket(r.ticketNo)">
                  <button
                    v-if="canClaim"
                    type="button" class="row-btn row-btn-tag"
                    title="投诉单不做风险评估，走协同处理：给评估意见 + 建议事项；工单状态与处理人均不变"
                    @click="openCollab(r)"
                  >协同处理</button>
                  <button
                    v-if="canReleaseRow(r)"
                    type="button" class="row-btn row-btn-amend"
                    title="把这一条退回「待领取」，由客诉专员或管理员重新领取；须填释放原因，等待时长不重新计时"
                    @click="openRelease(r)"
                  >释放</button>
                  <span
                    v-if="!canClaim"
                    class="hit-sub"
                    title="协同处理归客诉专员与管理员；本视角只读"
                  >—</span>
                </template>
                <template v-else-if="poolStageOf(r) === '已结论'">
                  <span
                    class="hit-sub"
                    title="评估结论提交即固化，不可修改；如需纠正请由报备人再报一次"
                  >—</span>
                </template>
                <template v-else-if="poolStageOf(r) === '待领取'">
                  <button
                    v-if="canClaim"
                    type="button" class="row-btn row-btn-tag"
                    title="领取这一条，转「已领取」并打开工单详情做评估"
                    @click="doClaim(r)"
                  >领取</button>
                  <span
                    v-else
                    class="hit-sub"
                    title="领取与评估归客诉专员与管理员；本视角只读"
                  >—</span>
                </template>
                <!--
                  评估中：给结论的只能是**这一条的承办人本人**（结论提交即固化，落款写的是他的名字）。
                  🔴 罕见的"进了池却没打标"那一条走的是补打标，判据是有没有 `tag`、不是来源，
                  见 `needsVerify` —— 漏斗下它恒为 false，池内一律出「评估」。
                -->
                <template v-else>
                  <button
                    v-if="canAssessRow(r) || needsVerify(r)"
                    type="button" class="row-btn row-btn-tag"
                    :title="needsVerify(r) ? '这一条还没有风险打标，先补一个结论' : '给出评估结论：升级 / 不升级'"
                    @click="handleReportRow(r)"
                  >{{ needsVerify(r) ? '补打标' : '评估' }}</button>
                  <!--
                    🔴 **管理员在这一格只出「释放」、不出「评估」**（与 B 线报备池同形）：
                    结论要由**承办的那个人**给（`canAssessRow` 判的就是 `assignee === 本人`），
                    管理员越过他直接评，等于替一个已经在读材料的人签了字；
                    但承办人休假 / 离岗时那一条不能锁死在池子里，故释放这一路给他兜底。
                  -->
                  <button
                    v-if="canReleaseRow(r)"
                    type="button" class="row-btn row-btn-amend"
                    title="把这一条退回「待领取」，由客诉专员或管理员重新领取；须填释放原因，等待时长不重新计时"
                    @click="openRelease(r)"
                  >释放</button>
                  <!--
                    🔴 **操作列恒在、无动作时写「—」**（§5.4 元素 ⑨）。这里不能再用 v-else ——
                    同一格现在可能出两枚按钮，占位只在**两枚都不出**时才该出现。
                  -->
                  <span
                    v-if="!canAssessRow(r) && !needsVerify(r) && !canReleaseRow(r)"
                    class="hit-sub"
                    :title="`承办人 ${r.assignee ?? '—'} · 结论由承办人本人给出`"
                  >—</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>

        <table v-else class="hit-table report-table">
          <thead>
            <tr>
              <th style="width: 190px">工单号</th>
              <th
                style="width: 100px"
                class="th-sortable"
                :class="{ on: sourceSort !== 'none' }"
                :title="sourceSort === 'none' ? '点击按监控来源分组（同来源内仍按评估时刻倒序）' : sourceSort === 'asc' ? '点击倒序' : '点击恢复按评估时刻排'"
                @click="cycleSourceSort"
              >监控来源<span class="th-sort-mark">{{ sourceSort === 'asc' ? '↑' : sourceSort === 'desc' ? '↓' : '↕' }}</span></th>
              <th style="width: 104px">报备人</th>
              <th style="width: 92px">报备原因</th>
              <th style="width: 104px">评估人</th>
              <th style="width: 128px">评估时刻</th>
              <th style="width: 92px">评估决策</th>
              <!-- 158px 是量出来的：再宽 18px 这张九列表就会挤出横向滚动条 -->
              <th style="width: 158px">派生投诉单</th>
              <th style="width: 76px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in pagedReportRows" :key="r.id">
              <td>
                <button type="button" class="rt-no" @click="openTicket(r.ticketNo)">{{ r.ticketNo }}</button>
              </td>
              <td><span class="src-tag" :class="{ kw: isKeywordRow(r) }">{{ r.source }}</span></td>
              <td>{{ r.by }}<div class="hit-sub">{{ r.byRole }}</div></td>
              <td>{{ r.reason }}</td>
              <!--
                🔴 **两种收口方式共用这三格**：非投诉单走评估（`assessment`，升级 / 不升级）、
                投诉单走协同处理（`coordination`，评估意见 + 建议事项）。
                只读 `assessment` 的话，协同过的条目这三格全是「—」——而"谁在什么时候收的口"
                恰恰是这张表存在的理由。
              -->
              <td>
                {{ concludedByOf(r) || '—' }}
                <div v-if="concludedByRoleOf(r)" class="hit-sub">{{ concludedByRoleOf(r) }}</div>
              </td>
              <td class="hit-when">{{ concludedAtOf(r) || '—' }}</td>
              <td>
                <!-- 旧词「接管」归一成「升级」再显示：B 线的种子里仍有旧值，见 normalizeDecision -->
                <span
                  v-if="r.assessment"
                  class="rr-dec"
                  :class="{ risk: normalizeDecision(r.assessment.decision) === '升级' }"
                >
                  {{ normalizeDecision(r.assessment.decision) }}
                </span>
                <span
                  v-else-if="r.coordination"
                  class="rr-dec"
                  title="投诉单不做风险评估，走协同处理：给意见与建议，不改状态、不改处理人"
                >协同处理</span>
                <span v-else class="hit-sub">—</span>
              </td>
              <td>
                <!--
                  升级按原单类型分流（O20）：非投诉单派生一张新投诉单，落在本列；
                  投诉单走基线 ※27「工单管控」，本单状态不变、不派生新单，本列写「工单管控」而不是「—」。
                  「不升级」两种都没有，才是「—」。
                -->
                <button
                  v-if="r.assessment?.escalatedToNo"
                  type="button" class="rt-no"
                  :title="`升级派生的投诉单 ${r.assessment.escalatedToNo}`"
                  @click="openTicket(r.assessment.escalatedToNo)"
                >{{ r.assessment.escalatedToNo }}</button>
                <span
                  v-else-if="r.assessment && normalizeDecision(r.assessment.decision) === '升级'"
                  class="src-tag"
                  title="原单已是投诉单，升级走基线 ※27「工单管控」：本单状态不变、不派生新单"
                >工单管控</span>
                <span v-else class="hit-sub" title="「不升级」不派生新单">—</span>
              </td>
              <!--
                🔴 已评估行**没有任何操作**：评估结论提交即固化、不可修改（§9 规则 22）。
                这里既不给「修正」也不给「重评」——要纠错走的是"再报一次"那条路，不是改旧结论。
                沿用本页命中清单里"这一格没有可做的事"的写法（—），空白单元格会被当成渲染缺漏。
              -->
              <td><span class="hit-sub" title="评估结论提交即固化，不可修改；如需纠正请由报备人再报一次">—</span></td>
            </tr>
          </tbody>
        </table>

        <div class="pager">
          <div class="pager-left">
            <span class="pager-total">共 {{ reportRows.length }} 条</span>
          </div>
          <AppPagination
            :total="reportRows.length"
            :current="reportPageCurrent"
            :page-size="reportPageSize"
            :show-total="false"
            @change="setReportPage"
          />
        </div>
      </div>

      <!-- 台账查询条：七维全部展开，右侧动作对齐手动筛查（查询 + 重置） -->
      <div v-if="listView === 'judged' && !ticketFocus" class="ledger-bar" @keyup.enter="applyLedgerQuery">
        <div class="list-toolbar">
          <div class="tb-fields">
            <div class="fi">
              <span class="fl">核实结果</span>
              <!-- 「待核实」与另两档同层：底表已含未核实的命中，核实打标就从这一档进 -->
              <a-select
                v-model:value="ledgerFilter.verdict"
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false"
                :options="[
                  { value: 'all', label: '全部' },
                  { value: 'open', label: '待核实' },
                  { value: '成立', label: '确认是风险' },
                  { value: '误报', label: '误报' },
                ]"
              />
            </div>
            <div class="fi">
              <span class="fl">关键词</span>
              <div class="tb-search">
                <SearchOutlined class="tb-search-ic" />
                <input
                  v-model="ledgerFilter.keyword"
                  class="tb-search-input"
                  type="text"
                  placeholder="工单号 / 客户名"
                >
              </div>
            </div>
            <div class="fi">
              <span class="fl">等级</span>
              <a-select
                v-model:value="ledgerFilter.level"
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false"
                :options="[{ value: 'all', label: '全部' }, ...GRADES.map((g) => ({ value: g, label: `${g}危` }))]"
              />
            </div>
            <div class="fi">
              <span class="fl">命中时间</span>
              <RangePicker
                :value="ledgerDateRange"
                :presets="ledgerRangePresets"
                allow-clear
                size="small"
                format="YYYY-MM-DD"
                :placeholder="['开始日期', '结束日期']"
                class="tb-range"
                @change="onLedgerRangeChange"
              />
            </div>
            <div class="fi">
              <span class="fl">班组</span>
              <a-select
                v-model:value="ledgerFilter.groupIds" mode="multiple" show-search allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="全中心" :max-tag-count="1"
                :options="ledgerGroupOptions" :filter-option="filterScopeOption"
                :max-tag-placeholder="scopeTagPlaceholder"
              />
            </div>
            <div class="fi">
              <span class="fl">风险词</span>
              <a-select
                v-model:value="ledgerFilter.words" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                :options="ledgerWordOptions"
              />
            </div>
            <div class="fi">
              <span class="fl">打标人</span>
              <a-select
                v-model:value="ledgerFilter.taggers" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                :options="ledgerTaggerOptions"
              />
            </div>
          </div>
          <div class="tb-actions">
            <button type="button" class="scan-go" @click="applyLedgerQuery">
              <SearchOutlined />查询
            </button>
            <button type="button" class="tb-btn" :disabled="!ledgerFilterDirty" @click="resetLedgerFilter">
              <ReloadOutlined /><span>重置</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 筛选条：九维（班组 / 风险词 / 建单时间 / 工单状态 / 匹配范围 / 工单类型 / 业务类型 / 产品分类 / 产品名称） -->
      <div v-if="listView === 'scan'" class="scan-bar" @keyup.enter="doScan">
        <div class="list-toolbar">
          <div class="tb-fields">
            <div class="fi">
              <span class="fl">班组</span>
              <a-select
                v-model:value="scanForm.groupIds" mode="multiple" show-search allow-clear
                size="small" class="tb-ctl"
                :options="scopeSelectGroups" :filter-option="filterScopeOption"
                :dropdown-match-select-width="false" placeholder="全中心" :max-tag-count="1"
                :max-tag-placeholder="scopeTagPlaceholder"
              />
            </div>
            <div class="fi">
              <span class="fl">风险词</span>
              <a-select
                v-model:value="scanForm.wordIds" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="全部启用中的词" :max-tag-count="1"
                :options="scanWordOptions"
              />
            </div>
            <div class="fi fi-date">
              <span class="fl">建单时间</span>
              <!--
                不给清除按钮：时间区间清空即"对全库扫一遍"，而扫库的产出是待并入的新命中，
                一次范围失手就把待核实队列淹没且不可逆。这一维只允许换区间，不允许没有区间。
              -->
              <RangePicker
                :value="scanDateRange"
                :presets="scanRangePresets"
                :allow-clear="false"
                size="small"
                format="YYYY-MM-DD"
                :placeholder="['开始日期', '结束日期']"
                class="tb-range"
                @change="onScanDateRangeChange"
              />
            </div>
            <div class="fi">
              <span class="fl">工单状态</span>
              <a-select
                v-model:value="scanForm.nodeStatuses" mode="multiple" show-search allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="0"
                :max-tag-placeholder="compactTagPlaceholder"
                :options="SCAN_NODE_STATUS_OPTIONS"
              />
            </div>
            <div class="fi">
              <span class="fl">匹配范围</span>
              <a-select
                v-model:value="scanForm.matchScopes" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="按词表范围" :max-tag-count="1"
                :options="SCAN_FIELDS.map((f) => ({ value: f, label: f }))"
              />
            </div>
            <div class="fi">
              <span class="fl">工单类型</span>
              <a-select
                v-model:value="scanForm.ticketTypes" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                :options="SCAN_TICKET_TYPES.map((t) => ({ value: t, label: t }))"
              />
            </div>
            <div class="fi">
              <span class="fl">业务类型</span>
              <a-select
                v-model:value="scanForm.businessTypes" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                :options="SCAN_BUSINESS_TYPES.map((t) => ({ value: t, label: t }))"
              />
            </div>
            <div class="fi">
              <span class="fl">产品分类</span>
              <a-select
                v-model:value="scanForm.productCategories" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                :options="SCAN_PRODUCT_CATEGORIES.map((t) => ({ value: t, label: t }))"
              />
            </div>
            <div class="fi">
              <span class="fl">产品名称</span>
              <a-select
                v-model:value="scanForm.productNames" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                :options="scanProductNameOptions.map((t) => ({ value: t, label: t }))"
              />
            </div>
          </div>
          <div class="tb-actions">
            <button type="button" class="scan-go" :disabled="scanning" @click="doScan">
              <SearchOutlined />{{ scanning ? '查询中…' : '查询' }}
            </button>
            <button type="button" class="tb-btn" @click="resetScanForm">
              <ReloadOutlined /><span>重置</span>
            </button>
            <button
              type="button"
              class="tb-btn"
              title="把当前九个维度的取值整套存下来，下次点一下即按它筛查；同名覆盖"
              @click="openSaveFilter"
            >
              <SaveOutlined /><span>保存筛选器</span>
            </button>
          </div>
        </div>
        <!--
          已保存筛选器：一枚 chip ＝ 一整套筛查条件，点即套用并立刻执行。
          【为什么与等级 chip 长得不一样】两者的动作根本不同——等级 chip 是在同一批数据里收窄，
          这里一点就换掉九个维度并重跑一次。形态相同会让人以为点错了也就是筛一下。
        -->
        <div v-if="savedFilters.length" class="saved-filters">
          <span class="sf-label">已保存筛选器</span>
          <span
            v-for="f in savedFilters"
            :key="f.id"
            class="sf-chip"
            :class="{ on: appliedFilterName === f.name }"
          >
            <button
              type="button"
              class="sf-apply"
              :disabled="scanning"
              :title="`点击立即按此条件筛查 —— ${criteriaSummaryOf(f.criteria)}`"
              @click="applySavedFilter(f)"
            >
              <FilterOutlined class="sf-ic" />{{ f.name }}
            </button>
            <button
              type="button"
              class="sf-del"
              :title="`删除筛选器「${f.name}」`"
              @click.stop="removeSavedFilter(f)"
            >×</button>
          </span>
          <span class="sf-hint">点一枚即按该条件重跑一次</span>
        </div>
      </div>

      <!-- 筛查结果条：结果就在下面这张清单里，这里只给统计与并入动作 -->
      <div v-if="inScanResult" class="scan-banner">
        <div class="sb-stat">
          扫出 <b>{{ scanResult!.length }}</b> 条
          <span class="sr-fresh">新命中 {{ scanFreshCount }}</span>
          <span v-if="scanDupCount" class="sr-dup">已在清单 {{ scanDupCount }}</span>
          <span class="sb-hint">结果尚未并入，勾选后确认</span>
        </div>
        <div class="sb-actions">
          <label class="sb-all">
            <a-checkbox :checked="scanAllPicked" @change="toggleScanPickAll" />全选新命中
          </label>
          <span class="sb-picked">已选 {{ scanPicked.size }}</span>
          <button type="button" class="row-btn row-btn-solid" :disabled="!scanPicked.size" @click="adoptScan">
            并入清单
          </button>
          <button type="button" class="link-btn" @click="exitScanResult">退出筛查</button>
        </div>
      </div>

      <!--
        单工单焦点条：焦点跨视图取数，页签与等级 chip 此刻都不作数，
        故必须有一条明说"现在只看这一张单"的横幅，并把退出的路摆在同一处。
        没有它，人会以为清单被筛空了，反复点页签也回不来。
      -->
      <div v-if="ticketFocus && !inScanResult" class="focus-banner">
        <div class="fb-stat">
          只看 <b>{{ ticketFocus }}</b> 的 {{ filteredRows.length }} 条命中
          <span class="fb-hint">按命中时刻正序，含已核实的</span>
          <span v-if="ticketGradeOf(ticketFocus!)" class="fb-grade">
            本单当前
            <span
              class="grade-pill-inline"
              :style="{ color: RISK_LEVEL_STYLE[ticketGradeOf(ticketFocus!)!].color, background: RISK_LEVEL_STYLE[ticketGradeOf(ticketFocus!)!].bg }"
            >{{ ticketGradeOf(ticketFocus!) }}危</span>
          </span>
          <span v-else class="fb-grade muted">本单尚无已打标的条目，也没有已核实成立的命中</span>
        </div>
        <button type="button" class="fb-exit" @click="clearTicketFocus">
          退出<span class="fb-x">×</span>
        </button>
      </div>

      <!--
        命中清单只服务**手动筛查（结果态）与命中台账**两个页签。
        实时监控走的是上面那张条目表、风险工单池走池表，两者都不读 filteredRows ——
        分母不同的数据共用一张表，迟早在某一列上把两者读串。
      -->
      <div v-if="(inLedger || inScanResult) && !filteredRows.length" class="ob-empty">
        <template v-if="inScanResult">该条件下没有扫到命中，可放宽时间区间或匹配范围</template>
        <!--
          台账空态必须把当前时间窗口讲出来。默认只看近 30 天，
          不说清楚的话，查三个月前的记录会被读成"当时没发现"——这是默认窗口唯一的风险。
        -->
        <template v-else>
          当前只看 {{ ledgerRangeText }}，未找到匹配记录——扩大命中时间范围试试
        </template>
      </div>


      <div v-if="(inLedger || inScanResult) && filteredRows.length" class="hit-table-wrap">
      <table class="hit-table">
        <thead>
          <tr>
            <th v-if="inScanResult" style="width: 36px"></th>
            <th style="width: 52px">等级</th>
            <th style="width: 120px">风险词</th>
            <th style="width: 200px">工单</th>
            <th>命中内容</th>
            <th style="width: 118px">客户 / 班组</th>
            <th style="width: 52px">时间</th>
            <th style="width: 148px">{{ inScanResult ? '状态' : '处置' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="h in pagedRows" :key="h.id"
            :class="{
              untagged: !inScanResult && !isJudged(h) && presetGradeOf(h) === '高',
              'scan-dup': inScanResult && scanDupIds.has(h.id),
            }"
          >
            <td v-if="inScanResult">
              <a-checkbox
                :checked="scanPicked.has(h.id)"
                :disabled="scanDupIds.has(h.id)"
                @change="toggleScanPick(h.id)"
              />
            </td>
            <td>
              <!-- 误报没有等级，这一格就空着（—）；回落到词表预设去补一个，等于给已排除的东西重新贴上风险标 -->
              <span
                v-if="gradeOf(h)"
                class="grade-pill"
                :style="{ color: RISK_LEVEL_STYLE[gradeOf(h)!].color, background: RISK_LEVEL_STYLE[gradeOf(h)!].bg }"
              >{{ gradeOf(h) }}</span>
              <span v-else class="hit-sub" title="判为误报的命中不带风险等级">—</span>
            </td>
            <td>
              <div class="track-word">「{{ h.word }}」</div>
              <!-- 命中的是同义词时必须标出来，否则复核的人在原文里找不到主词 -->
              <div v-if="h.matchedWord && h.matchedWord !== h.word" class="track-word-sub">命中「{{ h.matchedWord }}」</div>
              <div class="track-word-sub">词表预设 {{ presetGradeOf(h) }}危</div>
            </td>
            <td>
              <button type="button" class="rt-no" @click="openTicket(h.ticketNo)">{{ h.ticketNo }}</button>
              <div class="hit-title">{{ h.title }}</div>
              <div v-if="isFromScan(h)" class="hit-flag flag-scan">来自手动筛查</div>
              <!--
                工单级的两条事实都落在工单列：同一列里读"这张单是什么、这张单现在几级、
                这张单还有几条证据"，比把它们散到等级列与处置列更连贯。
              -->
              <div v-if="!inScanResult" class="ticket-facts">
                <button
                  v-if="siblingCountOf(h) > 0"
                  type="button"
                  class="hit-flag flag-sib"
                  :class="{ on: ticketFocus === h.ticketNo }"
                  title="同一张单被多条规则先后命中，点开对照着看"
                  @click="focusTicket(h.ticketNo)"
                >本单另有 {{ siblingCountOf(h) }} 条</button>
                <!-- 只在工单级严格高于本条时出现：同级时重复展示是噪音 -->
                <div
                  v-if="ticketGradeHint(h)"
                  class="ticket-grade-note"
                  :style="{ color: RISK_LEVEL_STYLE[ticketGradeHint(h)!].color }"
                  title="工单级风险等级 ＝ 该单已打标条目与已核实成立的命中取最高；同一条改判以最新结论为准"
                >本单当前 <b>{{ ticketGradeHint(h) }}</b> 危</div>
              </div>
            </td>
            <!-- 原文全文挂在 title 上：取窗只是为了读得快，要核对整段时鼠标一停就有 -->
            <td class="hit-excerpt" :title="h.excerpt">
              <span class="hit-pos">{{ h.position }}</span>
              <span class="excerpt-quote">「<template v-if="excerptWindow(h).headTruncated">…</template>{{ excerptWindow(h).before }}<mark v-if="excerptWindow(h).hit" class="excerpt-hit">{{ excerptWindow(h).hit }}</mark>{{ excerptWindow(h).after }}<template v-if="excerptWindow(h).tailTruncated">…</template>」</span>
            </td>
            <td>{{ h.customer }}<div class="hit-sub">{{ h.groupName }} · {{ h.assignee }}</div></td>
            <td class="hit-when">{{ h.when.slice(11) }}</td>
            <td>
              <!-- 筛查态：这一列说明"这条会不会进清单"，处置动作等并入后再给 -->
              <template v-if="inScanResult">
                <span v-if="scanDupIds.has(h.id)" class="state-chip">已在清单</span>
                <span v-else-if="scanPicked.has(h.id)" class="state-chip sc-will">并入后待核实</span>
                <span v-else class="state-chip sc-skip">不并入</span>
              </template>
              <!--
                「去管控」按**工单级**判（《【915】》§7.2 + §9 规则 13a），故它在已核实与待核实两支里都出现：
                管控管的是工单，本条自己判成什么、判没判过都不改变"这张单已经是高危"这件事。
              -->
              <div v-else class="cell-done">
                <template v-if="isJudged(h)">
                  <!-- 误报只出判定标，不出风险标：两个标同时挂着，读的人不知道该信哪一个 -->
                  <span
                    v-if="tagOf(h)"
                    class="tag-done"
                    :style="{ color: RISK_LEVEL_STYLE[tagOf(h)!].color, background: RISK_LEVEL_STYLE[tagOf(h)!].bg }"
                    :title="tagTraceTitle(h)"
                  >{{ levelText(tagOf(h) ?? null) }}</span>
                  <span
                    v-if="verdictOf(h)"
                    class="verdict-chip"
                    :class="verdictOf(h) === '误报' ? 'vc-fp' : 'vc-ok'"
                    :title="tagTraceTitle(h)"
                  >{{ verdictOf(h) }}</span>
                  <button
                    v-if="ticketGradeOf(h.ticketNo) === '高'"
                    type="button" class="row-btn row-btn-primary"
                    :title="`本单工单级风险等级为高，转交${DISPOSAL_BY_GRADE['高'].who}`"
                    @click="goControl(h)"
                  >去管控<ArrowRightOutlined /></button>
                  <!--
                    修正入口：绝大多数已核实的记录不需要再动，故用次按钮排在动作末位，
                    但它必须存在——台账里翻出一条判错的，正是要改的时候。
                  -->
                  <button
                    v-if="canRiskTag"
                    type="button" class="row-btn row-btn-amend"
                    :title="historyOf(h).length > 1 ? `已修正 ${historyOf(h).length - 1} 次，可继续修正` : '重新核实并修正本条结果'"
                    @click="openTag(h)"
                  >修正</button>
                </template>
                <template v-else>
                  <button
                    v-if="ticketGradeOf(h.ticketNo) === '高'"
                    type="button" class="row-btn row-btn-primary"
                    :title="`本单已有条目或命中被定为高危，转交${DISPOSAL_BY_GRADE['高'].who}；本条仍需单独核实`"
                    @click="goControl(h)"
                  >去管控<ArrowRightOutlined /></button>
                  <button v-if="canRiskTag" type="button" class="row-btn row-btn-tag" @click="openTag(h)">核实打标</button>
                  <span v-else-if="ticketGradeOf(h.ticketNo) !== '高'" class="hit-sub">—</span>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="pager">
        <div class="pager-left">
          <span class="pager-total">共 {{ filteredRows.length }} 条</span>
        </div>
        <AppPagination
          :total="filteredRows.length"
          :current="hitPageCurrent"
          :page-size="hitPageSize"
          :show-total="false"
          @change="setHitPage"
        />
      </div>
      </div>
        </div><!-- /.funnel-main -->
      </div><!-- /.funnel-layout -->
    </section>

    <!-- 风险词维护抽屉 -->
    <a-drawer v-model:open="riskWordsOpen" title="风险词管理" width="720" placement="right">
      <div v-if="canMaintainWords" class="drawer-toolbar">
        <button type="button" class="row-btn row-btn-primary" @click="openWordForm">新建风险词</button>
      </div>
      <p class="drawer-note top">
        一条规则＝<b>一个主词 + N 个同义词</b>，命中任一即算命中，同一工单的同一段原文只记一条，统计一律归在主词名下。
        新建的规则默认停用。启用后同时纳入<b>自动识别</b>（新写入的工单文本实时命中）与<b>手动筛查</b>；
        手动筛查时可逐条挑规则，留空即<b>全部启用中的规则</b>。
      </p>
      <table class="word-table">
        <colgroup>
          <col class="wt-col-word" />
          <col class="wt-col-grade" />
          <col class="wt-col-scope" />
          <col class="wt-col-state" />
          <col class="wt-col-updated" />
          <col v-if="canMaintainWords" class="wt-col-ops" />
        </colgroup>
        <thead>
          <tr>
            <th>风险词</th><th>分级</th><th>匹配范围</th>
            <th>状态</th>
            <th>更新时间</th>
            <th v-if="canMaintainWords">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="w in localWords" :key="w.id" :class="{ off: !w.enabled }">
            <td class="wt-word">{{ w.word }}</td>
            <td class="wt-grade">
              <span class="risk-word" :style="{ color: RISK_LEVEL_STYLE[w.level].color, background: RISK_LEVEL_STYLE[w.level].bg }">{{ riskLevelText(w.level) }}</span>
            </td>
            <td class="wt-scope" :title="w.scopes.join(' / ')">{{ w.scopes.join(' / ') }}</td>
            <td class="wt-state-cell">
              <span class="wt-state" :class="w.enabled ? 'on' : 'off'">{{ w.enabled ? '启用' : '停用' }}</span>
            </td>
            <td class="wt-updated">{{ w.updatedAt ?? '—' }}</td>
            <td v-if="canMaintainWords" class="wt-ops">
              <!--
                编辑与启停并列：两者改的是同一条规则的两件事——
                「编辑」改规则内容（同义词 / 匹配范围 / 分级），「停用」改它还跑不跑。
                主词不在编辑范围内，说明在弹窗与表尾说明里给出。
              -->
              <button
                type="button" class="row-btn row-btn-primary"
                title="改同义词 / 匹配范围 / 分级；主词不可改"
                @click="openWordEdit(w)"
              >编辑</button>
              <button type="button" class="row-btn row-btn-primary" @click="toggleWordEnabled(w)">
                {{ w.enabled ? '停用' : '启用' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="canMaintainWords" class="drawer-note">
        词表由投诉督导与管理员维护；新建默认停用，确认命中量合理后再启用。
        编辑只改<b>同义词 / 匹配范围 / 分级</b>，且只对后续的实时识别与手动筛查生效，历史命中一条不动；
        <b>主词不可改</b>——它是统计口径与历史命中的归属键，需要纠正主词请停用本条、另建一条。
        规则不支持删除，停用即等效下线。
      </p>
      <p v-else class="drawer-note">词表只读；维护请联系投诉督导。</p>
    </a-drawer>

    <!-- 新建 / 编辑风险词：同一个表单两态，只在标题与主词能不能改上分叉 -->
    <a-modal
      v-model:open="wordFormOpen"
      :title="isWordEditing ? '编辑风险词' : '新建风险词'"
      :width="560"
      ok-text="保存"
      cancel-text="取消"
      @ok="saveWord"
    >
      <div class="word-form op-form">
        <p class="op-tip op-tip-info wf-tip">
          主词是规则的显示名与统计口径，同义词命中也记在它名下；同一工单同一段原文只产生一条命中。
        </p>

        <div class="wf-section">
          <div class="wf-section-title">规则定义</div>
          <div class="op-field op-field-h">
            <span class="op-label req">主词</span>
            <a-input
              v-model:value="wordForm.word"
              :disabled="isWordEditing"
              placeholder="如：曝光、12315"
            />
          </div>
          <p v-if="isWordEditing" class="op-hint wf-word-lock">
            主词是统计口径与历史命中的归属键，不可修改；需要改主词请停用本条、另建一条。
          </p>
          <div class="op-field op-field-h op-field-h-top">
            <span class="op-label">同义词</span>
            <div class="wf-syn-box">
              <div v-if="wordForm.synonyms.length" class="wf-syn-chips">
                <span v-for="(s, i) in wordForm.synonyms" :key="s" class="wf-syn-chip">
                  {{ s }}
                  <button type="button" class="wf-syn-del" @click="removeSynonym(i)">×</button>
                </span>
              </div>
              <a-input
                v-model:value="synonymDraft"
                placeholder="等价表达，回车添加，如：媒体、新闻"
                @press-enter="addSynonym"
              />
            </div>
          </div>
          <div class="op-field op-field-h">
            <span class="op-label">分级</span>
            <a-radio-group v-model:value="wordForm.level" button-style="solid" size="small">
              <a-radio-button v-for="g in GRADES" :key="g" :value="g">{{ g }}危</a-radio-button>
            </a-radio-group>
          </div>
        </div>

        <div class="wf-section">
          <div class="wf-section-title req">匹配范围</div>
          <a-checkbox-group v-model:value="wordForm.scopes" class="wf-scope-grid" :options="SCOPE_OPTIONS" />
        </div>

        <div class="op-field op-field-h">
          <span class="op-label">上线状态</span>
          <a-switch v-model:checked="wordForm.enabled" checked-children="启用" un-checked-children="停用" />
        </div>
      </div>
    </a-modal>

    <!-- 保存筛选器：存的是当前九个维度的整套取值，名字即日后认出它的唯一凭据 -->
    <a-modal
      v-model:open="filterSaveOpen"
      title="保存筛选器"
      :width="460"
      ok-text="保存"
      cancel-text="取消"
      @ok="confirmSaveFilter"
    >
      <div class="op-form sf-form">
        <div class="op-field op-field-h">
          <span class="op-label req">名称</span>
          <a-input
            v-model:value="filterNameDraft"
            placeholder="如：教育线安全事故专项"
            @press-enter="confirmSaveFilter"
          />
        </div>
        <p v-if="filterNameTaken" class="op-tip op-tip-info sf-tip">
          已有同名筛选器，保存后<b>覆盖</b>它的条件，不会多出第二条同名。
        </p>
        <div class="sf-preview">
          <div class="sf-preview-k">本次存下的条件</div>
          <div class="sf-preview-v">{{ scanSummary }}</div>
        </div>
      </div>
    </a-modal>

    <!--
      批量风险打标（只对「待打标」这一批）。结论与单条**同一个四选一**，
      不给"保持预设"这种只有批量才有的第五档 —— 批量与单条口径分家的话，
      同一批条目走两条路会得到两种结论，而进不进池全看它。
    -->
    <OpActionModal
      :open="bulkOpen"
      title="批量风险打标"
      :icon="TagsOutlined"
      tone="primary"
      :width="480"
      ok-text="保存"
      :ok-disabled="!canSaveBulk"
      @update:open="bulkOpen = $event"
      @ok="saveBulk"
    >
      <div class="op-form tag-modal-form">
        <div class="tag-hit-head tag-bulk-head">
          <div class="tag-bulk-summary">
            <span>已选 <strong>{{ bulkTargets.length }}</strong> 条</span>
            <template v-if="bulkSourceMix">
              <span class="tag-hit-sep">·</span>
              <span>来源 {{ bulkSourceMix }}</span>
            </template>
          </div>
        </div>

        <div class="op-field op-field-h tag-field-block">
          <div class="op-label req">打标结论</div>
          <div class="op-radio-cards op-radio-cards--row tag-radio-compact tag-radio-fill tag-radio-4">
            <div
              v-for="r in RISK_TAG_RESULTS"
              :key="r"
              class="op-radio-card"
              :class="{ on: bulkResult === r }"
              :style="bulkResult === r && isPoolLevel(r) ? { borderColor: RISK_LEVEL_STYLE[r].color, background: `${RISK_LEVEL_STYLE[r].bg}33` } : {}"
              @click="bulkResult = r"
            >
              <div class="op-rc-title">{{ isPoolLevel(r) ? `${r}危` : r }}</div>
            </div>
          </div>
        </div>
        <div class="tag-form-foot">
          {{
            bulkResult === NO_RISK
              ? '标记为无风险的不进池，落「已标记无风险」视图，可在那里复核'
              : '低 / 中 / 高一律进风险工单池等待领取；本批须同一结论，有分歧请分次打标'
          }}
        </div>

        <div class="op-field op-field-h op-field-h-top tag-field-note">
          <div class="op-label">打标备注</div>
          <a-textarea v-model:value="bulkNote" :rows="2" placeholder="判断依据与后续动作（可选）" />
        </div>
      </div>
    </OpActionModal>

    <!--
      单条风险打标：四选一（高 / 中 / 低 / 无风险）。首次打标与二次修改共用这一个弹窗，
      只在标题、按钮文案、必填项与留痕区上分叉 —— 与命中打标弹窗同一副骨架。
    -->
    <OpActionModal
      :open="entryTagOpen"
      :title="entryTagAmend ? '修正风险打标' : '风险打标'"
      :icon="entryTagAmend ? EditOutlined : TagOutlined"
      tone="primary"
      :width="480"
      :ok-text="entryTagAmend ? '保存修改' : '保存'"
      :ok-disabled="!canSaveEntryTag"
      @update:open="entryTagOpen = $event"
      @ok="saveEntryTag"
    >
      <div v-if="entryTagTarget" class="op-form tag-modal-form">
        <div class="tag-hit-head">
          <div class="tag-hit-top">
            <button type="button" class="tag-ticket-no" @click="openTicket(entryTagTarget.ticketNo)">
              {{ entryTagTarget.ticketNo }}
            </button>
            <span class="tag-hit-title">{{ rowTitleOf(entryTagTarget) }}</span>
          </div>
          <div class="tag-hit-meta">
            <span>监控来源 <strong>{{ entryTagTarget.source }}</strong></span>
            <span class="tag-hit-sep">·</span>
            <span>进监控 {{ entryTagTarget.at }}</span>
            <span class="tag-hit-sep">·</span>
            <span>已等待 {{ rowWaitedText(entryTagTarget) }}</span>
          </div>
          <!-- 修改态先把"现在是什么"摆明，否则改完不知道自己改动了哪一项 -->
          <div v-if="entryTagAmend && entryTagTarget.tag" class="tag-cur">
            <span class="tag-cur-k">现行结论</span>
            <span
              v-if="isPoolLevel(entryTagTarget.tag.result)"
              class="grade-pill-inline"
              :style="{ color: RISK_LEVEL_STYLE[entryTagTarget.tag.result].color, background: RISK_LEVEL_STYLE[entryTagTarget.tag.result].bg }"
            >{{ entryTagTarget.tag.result }}危</span>
            <span v-else class="state-chip">{{ entryTagTarget.tag.result }}</span>
            <span class="tag-hit-sep">·</span>
            <span>{{ entryTagTarget.tag.by }}（{{ entryTagTarget.tag.byRole }}）于 {{ entryTagTarget.tag.at }}</span>
          </div>
        </div>

        <!--
          证据：本单的风险词命中原话。**只有预警词那一路有**，另两类来源整块 v-if 掉、不留空标题。
          🔴 它必须排在结论之上：条目的 desc 只有一句"命中风险词，已自动纳入实时监控"，
          说不出客户到底讲了什么；把原话摆到底下，等于让人先下结论再看依据。
        -->
        <div v-if="entryTagHits.length" class="tag-sib">
          <div class="tag-sib-head">
            <span class="tag-sib-title">本单风险词命中</span>
            <span class="tag-sib-n">{{ entryTagHits.length }} 条</span>
            <span class="tag-sib-grade">
              本单当前风险等级
              <span
                v-if="ticketGradeOf(entryTagTarget.ticketNo)"
                class="grade-pill-inline"
                :style="{ color: RISK_LEVEL_STYLE[ticketGradeOf(entryTagTarget.ticketNo)!].color, background: RISK_LEVEL_STYLE[ticketGradeOf(entryTagTarget.ticketNo)!].bg }"
                title="已打标条目与已核实成立的命中取最高；误报与未核实的不参与；同一条改判以最新结论为准"
              >{{ ticketGradeOf(entryTagTarget.ticketNo) }}危</span>
              <span v-else class="tag-sib-nograde" title="该单还没有任何一条条目被打标，也没有任何一条命中被核实为成立">尚无</span>
            </span>
          </div>
          <ol class="tag-sib-list">
            <li v-for="s in entryTagHits" :key="s.id" class="tsb-item">
              <div class="tsb-head">
                <span class="tsb-word">「{{ s.word }}」</span>
                <span class="tsb-at">{{ s.when }}</span>
                <span v-if="!verdictOf(s)" class="tsb-open">待核实</span>
                <span
                  v-else
                  class="verdict-chip"
                  :class="verdictOf(s) === '误报' ? 'vc-fp' : 'vc-ok'"
                >{{ verdictOf(s) }}</span>
              </div>
              <div class="tsb-excerpt" :title="s.excerpt">
                <span class="hit-pos">{{ s.position }}</span>
                <span class="excerpt-quote">「<template v-if="excerptWindow(s).headTruncated">…</template>{{ excerptWindow(s).before }}<mark v-if="excerptWindow(s).hit" class="excerpt-hit">{{ excerptWindow(s).hit }}</mark>{{ excerptWindow(s).after }}<template v-if="excerptWindow(s).tailTruncated">…</template>」</span>
              </div>
            </li>
          </ol>
        </div>

        <!--
          🔴 **四选一**：高 / 中 / 低 / 无风险。四个答案回答的是同一个问题——"这张单有没有风险、多大"。
          拆成"有没有风险 + 等级"两个字段会立刻长出"无风险却带着等级""有风险却没等级"两种非法组合，
          而这两种组合恰恰决定条目进不进池。
        -->
        <div class="op-field op-field-h tag-field-block">
          <div class="op-label req">打标结论</div>
          <div class="op-radio-cards op-radio-cards--row tag-radio-compact tag-radio-fill tag-radio-4">
            <div
              v-for="r in RISK_TAG_RESULTS"
              :key="r"
              class="op-radio-card"
              :class="{ on: entryTagResult === r }"
              :style="entryTagResult === r && isPoolLevel(r) ? { borderColor: RISK_LEVEL_STYLE[r].color, background: `${RISK_LEVEL_STYLE[r].bg}33` } : {}"
              @click="entryTagResult = r"
            >
              <div class="op-rc-title">{{ isPoolLevel(r) ? `${r}危` : r }}</div>
            </div>
          </div>
        </div>
        <div class="tag-form-foot">
          {{
            entryTagResult === NO_RISK
              ? '判为无风险的不进池，落「已标记无风险」视图 —— 那里是核查漏标误判的地方，不是回收站'
              : entryTagResult
                ? '低 / 中 / 高一律进风险工单池，等客诉专员领取后给出升级 / 不升级的结论'
                : '先判这张单有没有风险、多大；低 / 中 / 高进池，无风险不进池'
          }}
        </div>

        <!-- 二次修改必须答得出"为什么改"：只记改前改后，复盘时链条仍是断的 -->
        <div v-if="entryTagAmend" class="op-field op-field-h op-field-h-top tag-field-note">
          <div class="op-label req">修正原因</div>
          <a-textarea
            v-model:value="entryTagReason"
            :rows="2"
            placeholder="为什么改判，如：复听通话录音，客户已明确提出对外投诉"
          />
        </div>

        <div class="op-field op-field-h op-field-h-top tag-field-note">
          <div class="op-label">打标备注</div>
          <a-textarea v-model:value="entryTagNote" :rows="2" placeholder="判断依据与后续动作（可选）" />
        </div>

        <div v-if="entryTagResult === '高'" class="op-tip op-tip-info tag-tip-compact">
          保存后可在「已入池」视图点「去管控」转交{{ DISPOSAL_BY_GRADE['高'].who }}
        </div>

        <!-- 打标历史：它是佐证不是填写项，按信息层级排在最后。追加不覆盖，故爬坡读得出先后 -->
        <div v-if="entryTagHistory.length" class="tag-trace">
          <div class="tag-trace-head">
            打标记录<span class="tag-trace-n">{{ entryTagHistory.length }} 条</span>
          </div>
          <ol class="tag-trace-list">
            <li v-for="(e, i) in entryTagHistory" :key="`${e.at}-${i}`" class="tt-item">
              <div class="tt-head">
                <span class="tt-step">{{ i === 0 ? '首次打标' : `第 ${i} 次修正` }}</span>
                <span class="tt-by">{{ e.by }}</span>
                <span class="tt-role">{{ e.byRole }}</span>
                <span class="tt-at">{{ e.at }}</span>
              </div>
              <div class="tt-change">
                {{ e.level ? `${e.level}危` : '无风险' }}
                <!-- 并入痕迹记在打标记录上，不进来源列（§5A.1 ④） -->
                <span v-if="e.viaManualScan" class="tt-role">由手动筛查并入</span>
              </div>
              <div v-if="e.amendReason" class="tt-reason">原因：{{ e.amendReason }}</div>
            </li>
          </ol>
        </div>
      </div>
    </OpActionModal>

    <!-- 扫库记录：实时监控与手动筛查的执行留痕 -->
    <a-drawer v-model:open="runsOpen" title="扫库记录" width="880" placement="right">
      <p class="drawer-note top">
        实时监控由系统或刷新触发；手动筛查由坐席点「查询」触发。
        每次执行记开始/结束时刻、触发人与结果；<b>扫了没发现新问题同样是结论</b>。
      </p>
      <div v-if="!scanRuns.length" class="ob-empty">尚无扫库记录</div>
      <table v-else class="word-table run-table">
        <thead>
          <tr>
            <th style="width: 76px">类型</th>
            <th style="width: 72px">触发人</th>
            <th style="width: 148px">开始</th>
            <th style="width: 148px">结束</th>
            <th style="width: 168px">结果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in scanRunsDesc" :key="r.id">
            <td>
              <span class="run-kind" :class="r.kind">{{ SCAN_KIND_LABEL[r.kind] }}</span>
            </td>
            <td class="hit-sub">{{ r.triggerBy }}</td>
            <td class="hit-when">{{ r.startedAt }}</td>
            <td class="hit-when">{{ r.endedAt }}</td>
            <td>
              <span class="run-status" :class="r.status">{{ SCAN_STATUS_LABEL[r.status] }}</span>
              <div class="run-res" :class="r.status">{{ scanRunResultText(r) }}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </a-drawer>

    <!-- 单条核实：首次打标与后续修正共用同一个弹窗，只在标题、必填项与留痕区上区分 -->
    <OpActionModal
      :open="tagOpen"
      :title="tagAmend ? '修正核实结果' : '风险打标'"
      :icon="tagAmend ? EditOutlined : TagOutlined"
      tone="primary"
      :width="480"
      :ok-text="tagAmend ? '保存修正' : '保存'"
      :ok-disabled="!canSaveTag"
      @update:open="tagOpen = $event"
      @ok="saveTag"
    >
      <div v-if="tagTarget" class="op-form tag-modal-form">
        <div class="tag-hit-head">
          <div class="tag-hit-top">
            <button type="button" class="tag-ticket-no" @click="openTicket(tagTarget.ticketNo)">
              {{ tagTarget.ticketNo }}
            </button>
            <span class="tag-hit-title">{{ tagTarget.title }}</span>
          </div>
          <div class="tag-hit-excerpt" :title="tagTarget.excerpt">
            <span class="hit-pos">{{ tagTarget.position }}</span>
            <span class="excerpt-quote">「<template v-if="excerptWindow(tagTarget).headTruncated">…</template>{{ excerptWindow(tagTarget).before }}<mark v-if="excerptWindow(tagTarget).hit" class="excerpt-hit">{{ excerptWindow(tagTarget).hit }}</mark>{{ excerptWindow(tagTarget).after }}<template v-if="excerptWindow(tagTarget).tailTruncated">…</template>」</span>
          </div>
          <div class="tag-hit-meta">
            <span>风险词 <strong>「{{ tagTarget.word }}」</strong></span>
            <template v-if="tagTarget.matchedWord && tagTarget.matchedWord !== tagTarget.word">
              <span class="tag-hit-sep">·</span>
              <span>命中「{{ tagTarget.matchedWord }}」</span>
            </template>
            <span class="tag-hit-sep">·</span>
            <span>词表预设</span>
            <span
              class="grade-pill-inline"
              :style="{ color: RISK_LEVEL_STYLE[presetGradeOf(tagTarget)].color, background: RISK_LEVEL_STYLE[presetGradeOf(tagTarget)].bg }"
            >{{ presetGradeOf(tagTarget) }}危</span>
          </div>
          <!-- 修正态先把"现在是什么"摆明，否则改完不知道自己改动了哪一项 -->
          <div v-if="tagAmend && tagCurrent" class="tag-cur">
            <span class="tag-cur-k">现行结果</span>
            <span
              v-if="tagCurrent.level"
              class="grade-pill-inline"
              :style="{ color: RISK_LEVEL_STYLE[tagCurrent.level].color, background: RISK_LEVEL_STYLE[tagCurrent.level].bg }"
            >{{ tagCurrent.level }}危</span>
            <span class="verdict-chip" :class="tagCurrent.verdict === '误报' ? 'vc-fp' : 'vc-ok'">{{ tagCurrent.verdict }}</span>
            <span class="tag-hit-sep">·</span>
            <span>{{ tagCurrent.by }}（{{ tagCurrent.byRole }}）于 {{ tagCurrent.at }}</span>
          </div>
        </div>

        <!--
          同单其它命中及其结论（PRD §6.7 / 规则 26b）。
          🔴 这一块是「同单互见」的全部价值所在：核实第二条的人必须看得到第一条判成了什么。
          客户从「退一赔三」升级到「12315」是**措辞在爬坡**，比一个客户单次说 12315
          严重得多——而这个判断只有把两条摆在一起才做得出来。故连原文片段一并列出，
          光有规则名与结论看不出"话是怎么一步步说重的"。
        -->
        <div v-if="tagSiblings.length" class="tag-sib">
          <div class="tag-sib-head">
            <span class="tag-sib-title">本单其它命中</span>
            <span class="tag-sib-n">{{ tagSiblings.length }} 条</span>
            <span class="tag-sib-grade">
              本单当前风险等级
              <span
                v-if="tagTicketGrade"
                class="grade-pill-inline"
                :style="{ color: RISK_LEVEL_STYLE[tagTicketGrade].color, background: RISK_LEVEL_STYLE[tagTicketGrade].bg }"
                title="已打标条目与已核实成立的命中取最高；误报与未核实的不参与；同一条改判以最新结论为准"
              >{{ tagTicketGrade }}危</span>
              <span v-else class="tag-sib-nograde" title="该单还没有任何一条条目被打标，也没有任何一条命中被核实为成立">尚无</span>
            </span>
          </div>
          <ol class="tag-sib-list">
            <li v-for="s in tagSiblings" :key="s.id" class="tsb-item">
              <div class="tsb-head">
                <span class="tsb-word">「{{ s.word }}」</span>
                <span class="tsb-at">{{ s.when }}</span>
                <span v-if="!verdictOf(s)" class="tsb-open">待核实</span>
                <template v-else>
                  <span
                    class="verdict-chip"
                    :class="verdictOf(s) === '误报' ? 'vc-fp' : 'vc-ok'"
                  >{{ verdictOf(s) }}</span>
                  <span
                    v-if="gradeOf(s)"
                    class="grade-pill-inline"
                    :style="{ color: RISK_LEVEL_STYLE[gradeOf(s)!].color, background: RISK_LEVEL_STYLE[gradeOf(s)!].bg }"
                  >{{ gradeOf(s) }}危</span>
                </template>
              </div>
              <div class="tsb-excerpt" :title="s.excerpt">
                <span class="hit-pos">{{ s.position }}</span>
                <span class="excerpt-quote">「<template v-if="excerptWindow(s).headTruncated">…</template>{{ excerptWindow(s).before }}<mark v-if="excerptWindow(s).hit" class="excerpt-hit">{{ excerptWindow(s).hit }}</mark>{{ excerptWindow(s).after }}<template v-if="excerptWindow(s).tailTruncated">…</template>」</span>
              </div>
            </li>
          </ol>
        </div>

        <div class="op-field op-field-h tag-field-block">
          <div class="op-label req">本次命中</div>
          <div class="op-radio-cards op-radio-cards--row tag-radio-compact tag-radio-fill">
            <div
              class="op-radio-card"
              :class="{ on: tagVerdict === '成立' }"
              @click="tagVerdict = '成立'"
            >
              <div class="op-rc-title">成立</div>
            </div>
            <div
              class="op-radio-card"
              :class="{ on: tagVerdict === '误报' }"
              @click="tagVerdict = '误报'"
            >
              <div class="op-rc-title">误报</div>
            </div>
          </div>
        </div>

        <div class="op-field op-field-h tag-field-block">
          <div class="op-label req">风险等级</div>
          <div
            class="op-radio-cards op-radio-cards--row tag-radio-compact tag-radio-fill"
            :class="{ 'op-radio-disabled': tagVerdict === '误报' }"
          >
            <div
              v-for="g in GRADES"
              :key="g"
              class="op-radio-card"
              :class="{ on: tagLevel === g }"
              :style="tagLevel === g ? { borderColor: RISK_LEVEL_STYLE[g].color, background: `${RISK_LEVEL_STYLE[g].bg}33` } : {}"
              @click="tagVerdict !== '误报' && (tagLevel = g)"
            >
              <div class="op-rc-title">{{ g }}危</div>
            </div>
          </div>
        </div>
        <div class="tag-form-foot">
          {{
            tagVerdict === '误报'
              ? '误报无需定级'
              : tagAmend
                ? '改判会立即改变台账归属与准确率，等级同理'
                : '等级默认沿用词表预设，可按实际情况调整'
          }}
        </div>

        <!-- 修正必须答得出"为什么改"：只记改前改后，复盘时链条仍是断的 -->
        <div v-if="tagAmend" class="op-field op-field-h op-field-h-top tag-field-note">
          <div class="op-label req">修正原因</div>
          <a-textarea
            v-model:value="tagReason"
            :rows="2"
            placeholder="为什么改判，如：复听通话录音，客户并未提及外部渠道"
          />
        </div>

        <div class="op-field op-field-h op-field-h-top tag-field-note">
          <div class="op-label">处置备注</div>
          <a-textarea v-model:value="tagNote" :rows="2" placeholder="核实结论与后续动作（可选）" />
        </div>

        <div v-if="tagVerdict === '成立' && tagLevel === '高'" class="op-tip op-tip-info tag-tip-compact">
          保存后可在列表点「去管控」转交{{ DISPOSAL_BY_GRADE['高'].who }}
        </div>

        <!-- 改动历史：它是佐证不是填写项，按信息层级排在最后 -->
        <div v-if="tagHistory.length" class="tag-trace">
          <div class="tag-trace-head">
            修正记录<span class="tag-trace-n">{{ tagHistory.length }} 条</span>
          </div>
          <ol class="tag-trace-list">
            <li v-for="(e, i) in tagHistory" :key="`${e.at}-${i}`" class="tt-item">
              <div class="tt-head">
                <span class="tt-step">{{ i === 0 ? '首次核实' : `第 ${i} 次修正` }}</span>
                <!-- 角色与姓名并列：复盘时"谁判的"要连着"他是什么岗"一起读才有分量 -->
                <span class="tt-by">{{ e.by }}</span>
                <span class="tt-role">{{ e.byRole }}</span>
                <span class="tt-at">{{ e.at }}</span>
              </div>
              <div class="tt-change">
                <template v-if="i === 0">判为 {{ e.verdict }}{{ e.level ? ` · ${e.level}危` : '' }}</template>
                <template v-else>{{ entryDiffText(tagHistory[i - 1], e) }}</template>
              </div>
              <div v-if="e.amendReason" class="tt-reason">原因：{{ e.amendReason }}</div>
            </li>
          </ol>
        </div>
      </div>
    </OpActionModal>

    <!--
      评估报备（《【930】》§5.4）。
      主按钮**不做 disabled**：报备信息一屏读完就要下结论，按钮灰着不说为什么，
      人只能逐项试探哪里没填。故点了就校验、缺哪项在哪项下面出红字（missAssess* 一组）。
    -->
    <OpActionModal
      :open="assessOpen"
      title="评估报备"
      :icon="EditOutlined"
      tone="primary"
      :width="600"
      ok-text="提交结论"
      @update:open="assessOpen = $event"
      @ok="confirmAssess"
    >
      <div v-if="assessTarget" class="op-form assess-form">
        <!--
          ① 第一区块：**按原单来路分两种**（PRD §5.3.2，见 `assessTargetFromPool`）
          · A 线（池内条目）→「入池依据」：风险等级 / 打标人 / 打标时刻 / 打标备注 / 命中原话；
          · B 线（报备单）→「报备信息」：报备人 / 原因 / 风险类型 / 场景描述 / 附件。
          卡的骨架与配色两条线共用（对齐工单操作页「风险报备」在队卡片 rr-sheet），
          分岔只发生在**抬头那几格与卡体里摆什么**。
        -->
        <section class="assess-sheet" :aria-label="assessTargetFromPool ? '入池依据' : '报备信息'">
          <header class="assess-sheet-head">
            <div class="assess-sheet-brand">
              <div class="assess-sheet-title-row">
                <!-- 区块名摆在明面上：两条线的第一区块答的不是同一个问题，只靠内容差异读不出来 -->
                <span class="assess-sheet-kind">{{ assessTargetFromPool ? '入池依据' : '报备信息' }}</span>
                <button type="button" class="tag-ticket-no assess-ticket-no" @click="openTicket(assessTarget.ticketNo)">
                  {{ assessTarget.ticketNo }}
                </button>
                <span class="assess-sheet-time">
                  {{ assessTargetFromPool ? '入池于' : '提交于' }} {{ assessTarget.at }}
                </span>
              </div>
              <div class="assess-sheet-meta">
                <!--
                  A 线的抬头 ＝ **打标那一组**（风险等级 / 打标人 / 打标时刻）。
                  🔴 **这里不出「报备人」「原因」** —— A 线的这两格是 riskQueue 补的恒定占位
                  （系统（系统） / 其他），不是谁填的数据，摆出来是在说一件没发生的事。
                -->
                <template v-if="assessTargetFromPool">
                  <template v-if="assessTarget.tag">
                    <span class="assess-meta-pair">
                      <span class="assess-meta-label">风险等级</span>
                      <span
                        class="assess-meta-value"
                        :class="{ 'assess-meta-warn': assessTarget.tag.result === '高' }"
                      >{{ isPoolLevel(assessTarget.tag.result) ? riskLevelText(assessTarget.tag.result) : assessTarget.tag.result }}</span>
                    </span>
                    <span class="assess-meta-sep" aria-hidden="true" />
                    <span class="assess-meta-pair">
                      <UserOutlined class="assess-meta-icon" />
                      <span class="assess-meta-label">打标人</span>
                      <span class="assess-meta-value">{{ assessTarget.tag.by }}（{{ assessTarget.tag.byRole }}）</span>
                    </span>
                    <span class="assess-meta-sep" aria-hidden="true" />
                    <span class="assess-meta-pair">
                      <span class="assess-meta-label">打标时刻</span>
                      <span class="assess-meta-value">{{ assessTarget.tag.at }}</span>
                    </span>
                  </template>
                  <!--
                    罕见：进了池却没有打标（旧缓存，见 needsVerify）。不编一个等级出来充数，
                    只说清缺的正是这一格——评估人由此知道该先去补打标，而不是照着空白下结论。
                  -->
                  <span v-else class="assess-meta-pair">
                    <span class="assess-meta-label">风险等级</span>
                    <span class="assess-meta-value">未打标</span>
                  </span>
                </template>
                <template v-else>
                  <span class="assess-meta-pair">
                    <UserOutlined class="assess-meta-icon" />
                    <span class="assess-meta-label">报备人</span>
                    <span class="assess-meta-value">{{ assessTarget.by }}（{{ assessTarget.byRole }}）</span>
                  </span>
                  <span class="assess-meta-sep" aria-hidden="true" />
                  <span class="assess-meta-pair">
                    <span class="assess-meta-label">原因</span>
                    <span class="assess-meta-value">{{ assessTarget.reason }}</span>
                  </span>
                  <template v-if="assessTarget.category">
                    <span class="assess-meta-sep" aria-hidden="true" />
                    <span class="assess-meta-pair">
                      <span class="assess-meta-label">风险类型</span>
                      <span class="assess-meta-value assess-meta-warn">{{ assessTarget.category }}</span>
                    </span>
                  </template>
                </template>
              </div>
            </div>
          </header>

          <div class="assess-sheet-body">
            <!-- A 线：入池说明（系统写的"为什么捞它"）；B 线：报备人填的场景描述 -->
            <blockquote class="assess-quote">{{ assessTarget.desc }}</blockquote>

            <!--
              入池依据的**证据那两项**：命中原话 + 打标备注。
              等级 / 打标人 / 打标时刻已经上了抬头，这里不再复述一遍。
              条目的 desc 只有一句"命中风险词，已自动纳入实时监控"，说不出客户讲了什么；
              客诉专员要在知道"监控为什么判它有风险"的前提下决定升不升级。
              B 线的报备单没有打标也没有命中（它不走那道门），整块 v-if 掉、不留空标题。
              行式沿用底栏那套 assess-foot-*，两处读起来是同一种"键：值"。
            -->
            <div v-if="assessTargetVerifiedHit || assessTarget.tag?.note" class="assess-verify">
              <!-- 命中原话：与命中清单、打标弹窗同一套取窗与高亮（三处一份口径） -->
              <div v-if="assessTargetVerifiedHit" class="assess-foot-row">
                <span class="assess-foot-k">命中原话</span>
                <span class="assess-foot-v" :title="assessTargetVerifiedHit.excerpt">
                  <span class="hit-pos">{{ assessTargetVerifiedHit.position }}</span>
                  <span class="excerpt-quote">「<template v-if="excerptWindow(assessTargetVerifiedHit).headTruncated">…</template>{{ excerptWindow(assessTargetVerifiedHit).before }}<mark v-if="excerptWindow(assessTargetVerifiedHit).hit" class="excerpt-hit">{{ excerptWindow(assessTargetVerifiedHit).hit }}</mark>{{ excerptWindow(assessTargetVerifiedHit).after }}<template v-if="excerptWindow(assessTargetVerifiedHit).tailTruncated">…</template>」</span>
                  <span class="assess-foot-sub">
                    风险词「{{ assessTargetVerifiedHit.word }}」<template v-if="assessTargetVerifiedHit.matchedWord && assessTargetVerifiedHit.matchedWord !== assessTargetVerifiedHit.word">，命中「{{ assessTargetVerifiedHit.matchedWord }}」</template>
                  </span>
                </span>
              </div>
              <!-- 打标时填的备注：打标人当时怎么想的，比结论本身更能帮下一个人接上 -->
              <div v-if="assessTarget.tag?.note" class="assess-foot-row">
                <span class="assess-foot-k">打标备注</span>
                <span class="assess-foot-v">{{ assessTarget.tag.note }}</span>
              </div>
            </div>
            <ul v-if="assessTarget.attachments.length" class="assess-files">
              <li v-for="a in assessTarget.attachments" :key="a" class="assess-file">
                <PaperClipOutlined />
                <button
                  type="button"
                  class="assess-file-btn"
                  :title="`下载 ${a}`"
                  @click="downloadReportAttachment(a)"
                >
                  {{ a }}
                </button>
              </li>
            </ul>
            <!--
              释放记录（§5.5 ⑥「在**两个池**的条目详情上可见」）。**没被释放过整段不出**。
              🔴 **它必须摆在评估人眼前**：这条条目刚被人领走过又退回来，退回的理由
              往往正是"我判不了 / 不该我办"——现在轮到你判，那句话是你要读的第一手材料。
              历次全列、最近一次在前（累积不覆盖）。
              🔴 **与 B 线报备池、工单「风险报备」Tab 的在队卡同一口径同一版式**
              （`RiskReportPoolPanel` 的 `.assess-releases` / `OpRiskMonitorTab` 的 `.rr-releases`）：
              同一条留痕在三处长得不一样，人只会以为其中一处少显示了东西。
            -->
            <div v-if="releasesOf(assessTarget).length" class="assess-releases">
              <div class="assess-releases-head">
                <RollbackOutlined />
                释放记录（已释放 {{ releasesOf(assessTarget).length }} 次）
              </div>
              <div
                v-for="(rel, i) in releasesOf(assessTarget)"
                :key="i"
                class="assess-release"
              >
                <div class="assess-release-head">
                  <span class="assess-release-who">{{ rel.by }}（{{ rel.byRole }}）</span>
                  <span class="assess-release-at">{{ rel.at }}</span>
                </div>
                <div class="assess-release-reason">{{ rel.reason }}</div>
              </div>
            </div>
          </div>

          <!-- ② 本单另有：收在卡片底栏，弱于主体描述 -->
          <footer
            v-if="assessTargetHits || assessTargetHistory.length"
            class="assess-sheet-foot"
          >
            <div v-if="assessTargetHits" class="assess-foot-row">
              <span class="assess-foot-k">风险词命中</span>
              <span class="assess-foot-v">
                {{ assessTargetHits.hitCount }} 条
                <span class="assess-foot-sub">
                  成立 {{ assessTargetHits.confirmedCount }} · 误报 {{ assessTargetHits.falseCount }} · 待核实 {{ assessTargetHits.pendingCount }}
                </span>
              </span>
            </div>
            <div v-if="assessTargetHistory.length" class="assess-foot-row">
              <span class="assess-foot-k">历史报备</span>
              <ol class="assess-foot-list">
                <li v-for="h in assessTargetHistory" :key="h.id" class="assess-foot-item">
                  <span class="assess-foot-at">{{ h.assessment?.at ?? h.at }}</span>
                  <span class="assess-foot-dec">{{ h.status === '已撤回' ? '已撤回' : (h.assessment ? normalizeDecision(h.assessment.decision) : '—') }}</span>
                  <span v-if="h.assessment?.escalatedToNo" class="assess-foot-esc">→ {{ h.assessment.escalatedToNo }}</span>
                </li>
              </ol>
            </div>
          </footer>
        </section>

        <!-- ③ 评估表单：二选一决策 + 必填说明 -->
        <section class="assess-block assess-block-form">
          <h4 class="assess-block-title">评估结论</h4>

          <!--
            决策**二选一**：升级 / 不升级。「升级」只指**转投诉单**（走 830 第一跳派生），
            **不含升三线**；旧词「接管」整个作废，见 riskShared 的 ASSESS_DECISIONS。
            🔴 这里既没有「风险等级」也没有「关联投诉单号」——
            二选一之后没有"确认有风险 + 定级"这一档，评估不再产出等级、不再往工单回传；
            而「关联已有投诉单」这一档随 O11 一并作废（报上来评估侧答不了它）。
          -->
          <div class="op-field assess-dec-field">
            <div class="op-field-h assess-dec-row">
              <div class="op-label req">评估决策</div>
              <a-radio-group v-model:value="assessDecision" class="assess-dec-inline">
                <a-radio v-for="d in ASSESS_DECISIONS" :key="d" :value="d">{{ d }}</a-radio>
              </a-radio-group>
            </div>
            <div v-if="missAssessDecision" class="assess-err assess-dec-foot">请先选择一个评估决策</div>
            <!--
              选「升级」后才出现的分流提示（O20）：它是"你点下去会立刻发生什么"，
              且**按原单类型给的是两种完全相反的后果**，是做决策所必需的一行。
              常驻的话选「不升级」也跟着显示，那时它是句噪音，故只在选中「升级」时出。
            -->
            <div
              v-else-if="assessDecision === '升级'"
              class="assess-hint assess-dec-foot"
            >{{ escalateHint }}</div>
          </div>

          <div class="op-field">
            <div class="op-label req">{{ assessAdviceLabel || '反馈意见' }}</div>
            <a-textarea
              v-model:value="assessAdvice"
              :rows="3"
              :placeholder="assessAdvicePlaceholder || '请先选择评估决策'"
            />
            <div v-if="missAssessAdvice" class="assess-err">请填写{{ assessAdviceLabel || '反馈意见' }}</div>
          </div>
        </section>
      </div>
    </OpActionModal>

    <!--
      协同处理弹窗（投诉单那一路的工作面）。**与工单页底栏那一枚是同一个组件**：
      必填项、两个副作用（落第八类履历 + 挂建议标记）、"不发通知"这条口径都在组件里，
      两个入口不会各走各的。提交后条目转「已结论」由 `riskPool.coordinate` 一处收口。
    -->
    <OpRiskCollabModal
      v-if="collabTarget"
      v-model:open="collabOpen"
      :ticket-no="collabTarget.ticketNo"
      :ticket-title="TICKET_BY_NO.get(collabTarget.ticketNo)?.title ?? derivedTickets.find(collabTarget.ticketNo)?.title"
    />

    <!--
      释放：**只填一项「释放原因」**（§5.5 ④）。
      🔴 **不出接手人这一格** —— 释放不指定接手人、不是换人（§5.5 ①）；
      摆一个人员下拉在这里，做的就是已经整套取消的「改派」。
      🔴 **版式与提示文案照 B 线报备池那个释放弹窗**（`RiskReportPoolPanel` 的 `rrp-release`）：
      同一个动作在两个池上是同一套壳（OpActionModal · warn · 440 宽 ·「确认释放」danger），
      两处只在"退回到哪个池"与"钟从哪个时刻起算"两句上不同。
    -->
    <OpActionModal
      :open="releaseOpen"
      :title="releaseTarget ? `释放条目 · ${releaseTarget.ticketNo}` : '释放条目'"
      :icon="RollbackOutlined"
      tone="warn"
      :width="440"
      ok-text="确认释放"
      ok-tone="danger"
      @update:open="releaseOpen = $event"
      @ok="confirmRelease"
    >
      <div class="rm-release">
        <div class="op-field">
          <div class="op-label req">释放原因</div>
          <a-textarea
            v-model:value="releaseReason"
            :rows="3"
            :status="missReleaseReason ? 'error' : undefined"
            placeholder="写清为什么退回，例如判不了 / 不该由我办 / 需要换人跟进…"
          />
          <div v-if="missReleaseReason" class="assess-err">请填写释放原因</div>
        </div>
        <!--
          释放的两个后果都得在下决心之前说清：
          ① 退回池子由**任何有资格的人**重新领（不是指给某个人）；
          ② **等待时长不归零**（§5.5 ⑤）——已经超时的退回来仍是超时态，
             不写这一句，人会以为退一次就把钟重置了、于是拿它当"续命"用。
          🔴 A 线的钟从**进池时刻**起算（B 线是提交时刻，§9 规则 26），这一句两处不同。
        -->
        <p class="assess-hint rm-release-hint">
          释放后本条退回「待领取」，由客诉专员或管理员重新领取；等待时长仍从进池时刻起算、不会因此重新计时。
        </p>
      </div>
    </OpActionModal>

    <!--
      🔴 **分派弹窗已删**（业务第三轮拍板取消分派 / 改派 / 批量分派整套）。
      池内只剩「领取」，它不需要弹窗——领取的对象就是当前这一行、承办人就是当前登录的人，
      没有任何一项要人填。为一个无参动作留一个确认弹窗，只是多一次点击。
      ⚠️ 「**释放**」相反：它**必填释放原因**（§5.5 ④），故有上面那个弹窗。
    -->
  </div>
</template>

<style scoped>
/* 页壳：对齐个人门户 / 班组长看板 §4.9 */
.risk-monitor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px 24px;
  min-height: 100%;
  width: 100%;
  min-width: 0;
  background:
    radial-gradient(ellipse 80% 40% at 0% 0%, rgba(26, 111, 255, 0.08), transparent 55%),
    radial-gradient(ellipse 60% 30% at 100% 8%, rgba(16, 185, 129, 0.05), transparent 50%),
    #f3f6fb;
}

/* ① 页面标识条：token 全部对齐 §4.9「问候区」，与个人门户 / 班组看板同一条 */
.greeting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 18px;
  border-radius: 14px;
  border: 1px solid rgba(26, 111, 255, 0.18);
  background: linear-gradient(135deg, #eff6ff 0%, #f8fbff 48%, #ecfdf5 100%);
  box-shadow: 0 4px 16px rgba(26, 111, 255, 0.08);
}
/* 有高危未核实时整条转危险语义（§2.3），不再靠满屏粉底喊人 */
.greeting-card.urgent {
  border-color: rgba(239, 68, 68, 0.24);
  background: linear-gradient(135deg, #fef2f2 0%, #fff8f8 52%, #fffbeb 100%);
  box-shadow: 0 4px 16px rgba(239, 68, 68, 0.08);
}
.greeting-lead {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.greeting-text { min-width: 0; }
.greeting-title {
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.greeting-sub { margin-top: 6px; font-size: 12px; color: #64748b; line-height: 1.55; }
.greeting-aside { display: flex; align-items: center; flex: none; }

/* 工具/筛选条外壳：§4.9「筛选条」token */
.section-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  padding: 6px 10px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}
.head-tools { background: rgba(255, 255, 255, 0.72); border-color: rgba(255, 255, 255, 0.9); }

/* ② 监控成效：双卡并排，左蓝右橙，紧凑 KPI + 文字链 */
.effect-section {
  padding: 0;
  gap: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}
/*
 * 三栏：监控数据（命中记录）｜ 工单存量（在办工单）｜ 评估处置（队列条目）。
 * 左栏四个 KPI、右栏三个，中栏只有两个，故按 1.15 : 0.85 : 1 分宽，
 * 均分会让中栏空出一截、左栏的四格挤成两行。
 */
.effect-split {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr 1fr;
  gap: 10px;
  min-width: 0;
  align-items: stretch;
}
@media (max-width: 1280px) {
  .effect-split { grid-template-columns: 1fr 1fr; }
  /* 折成两行时中栏独占一行，避免它跟右栏挤在半幅里 */
  .effect-pane--ticket { grid-column: 1 / -1; }
}
@media (max-width: 900px) {
  .effect-split { grid-template-columns: 1fr; gap: 8px; }
  .effect-pane--ticket { grid-column: auto; }
}
.effect-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  padding: 8px 10px 7px;
  border-radius: 10px;
  border: 1px solid transparent;
}
.effect-pane--monitor {
  background: linear-gradient(180deg, #f0f7ff 0%, #fafcff 100%);
  border-color: #bfdbfe;
  box-shadow: inset 3px 0 0 #1a6fff;
}
.effect-pane--report {
  background: linear-gradient(180deg, #fffbeb 0%, #fffdf7 100%);
  border-color: #fde68a;
  box-shadow: inset 3px 0 0 #f59e0b;
}
/* 中栏取紫：与左蓝右橙拉开，三个分母一眼分得出是三块而不是一条长带 */
.effect-pane--ticket {
  background: linear-gradient(180deg, #faf5ff 0%, #fdfaff 100%);
  border-color: #e9d5ff;
  box-shadow: inset 3px 0 0 #a855f7;
}
.pane-title {
  margin: 0 0 5px;
  font-size: 12px;
  font-weight: 700;
  color: #111827;
  line-height: 1.2;
}
.effect-pane--monitor .pane-title { color: #1e40af; }
.effect-pane--ticket .pane-title { color: #7e22ce; }
.effect-pane--report .pane-title { color: #b45309; }
.dash-grid {
  display: grid;
  gap: 1px;
  background: rgba(148, 163, 184, 0.35);
  border-radius: 6px;
  overflow: hidden;
  flex: none;
}
.dash-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.dash-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.dash-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 1100px) {
  .dash-grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.dm-cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 4px 7px;
  min-height: 38px;
  background: rgba(255, 255, 255, 0.88);
  border: none;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 0.12s;
}
.dm-val {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 19px;
}
.dm-cell:hover { background: #fff; }
.dm-cell.on { background: #f3f4f6; }
.dm-cell.hot .dm-v { color: #dc2626; }
.dm-cell.hot.on .dm-v { color: #111827; }
.dm-static { cursor: default; }
.dm-static:hover { background: rgba(255, 255, 255, 0.88); }
.dm-k { font-size: 10px; font-weight: 500; color: #64748b; line-height: 1.2; }
.dm-v {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.1;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}
.dm-v.muted { font-size: 14px; color: #cbd5e1; }
.dm-h { font-size: 9px; color: #94a3b8; font-variant-numeric: tabular-nums; line-height: 1.2; }
.dm-h.bad { color: #dc2626; font-weight: 600; }
.dash-links {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 2px 8px;
  flex: 1;
  margin-top: 5px;
  padding-top: 5px;
  min-height: 22px;
  border-top: 1px dashed rgba(148, 163, 184, 0.35);
}
.dash-links-k {
  flex: none;
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
}
.dl-item {
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 2px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
}
.dl-item:hover { color: #1a6fff; }
.dl-item.on { color: #1a6fff; font-weight: 600; }
.effect-pane--report .dl-item.on { color: #d97706; }
.dl-item b {
  font-weight: 700;
  color: #111827;
  margin-left: 1px;
  font-variant-numeric: tabular-nums;
}
.dl-item.on b { color: #1a6fff; }
.effect-pane--report .dl-item.on b { color: #d97706; }
.dl-item.danger b { color: #dc2626; }
.dl-item small {
  font-size: 9px;
  font-weight: 400;
  color: #94a3b8;
  margin-left: 1px;
}
/* 等级分布是只读读数：不给指针、不给 hover 变色，免得被当成可下钻 */
.dl-item.dl-static { cursor: default; font-weight: 600; }
.dl-item.dl-static:hover { color: inherit; }
.dl-item.dl-static b { color: inherit; }
.dl-empty { font-size: 11px; color: #cbd5e1; }

/* 上次执行 + 扫库记录：§4.1 次按钮外形，记录条数用主色点出可点 */
.run-entry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #D1D5DB;
  border-radius: 4px;
  background: #fff;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.run-entry:hover:not(:disabled) { background: #F9FAFB; border-color: #9CA3AF; }
.run-entry:disabled { cursor: default; background: #F3F4F6; border-color: #E5E7EB; }
.monitor-last-run-k { font-size: 11px; color: #9CA3AF; }
.monitor-clock { font-size: 12px; color: #374151; font-variant-numeric: tabular-nums; font-weight: 600; }
.run-entry-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #1A6FFF;
  padding-left: 8px;
  border-left: 1px solid #E5E7EB;
  font-variant-numeric: tabular-nums;
}
.run-entry:disabled .run-entry-meta { color: #9CA3AF; }
.run-entry:disabled .monitor-clock { color: #6B7280; }
.monitor-refresh {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 1px solid #D1D5DB; background: #fff; border-radius: 4px;
  color: #6B7280; cursor: pointer; font-size: 12px;
}
.monitor-refresh:hover { background: #F9FAFB; color: #374151; }

/* 风险词入口：§4.1 次按钮 + 主色背景（弱强调），28px 紧凑高度 */
.word-entry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #dbeafe;
  border-radius: 4px;
  background: #EFF6FF;
  color: #1A6FFF;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  flex: none;
}
.word-entry:hover { background: #dbeafe; border-color: #93c5fd; color: #0F4FCC; }
.word-entry-label { white-space: nowrap; }
.word-entry-meta {
  font-size: 11px;
  font-weight: 500;
  color: #6B7280;
  padding-left: 6px;
  border-left: 1px solid #bfdbfe;
  white-space: nowrap;
}

/* 分区卡片：对齐 overview-section */
.overview-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.section-head {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap;
}
.section-head-actions {
  display: inline-flex; align-items: center; gap: 8px; flex: none;
}
.section-head-main { min-width: 0; }
.section-title {
  margin: 0; font-size: 13px; font-weight: 700; color: #111827;
  display: inline-flex; align-items: center; gap: 6px; line-height: 1.3;
}
.list-count {
  min-width: 20px; padding: 0 6px; border-radius: 8px; font-size: 11px; font-weight: 700;
  background: #f3f4f6; color: #6b7280; font-variant-numeric: tabular-nums;
}

/*
 * 左栏漏斗 + 右侧清单。
 *
 * 【左栏定宽 196px 是量出来的，不是拍的】三段拆到顶部页签之后每行只剩"档名 + 一个数字"，
 * 全页最长的一行是第三级缩进下的「P2（普通加急）」：
 *   缩进 33 + 标签 85.2 + 间隙 8 + 数字位 26 + 右内边距 8 ＝ 160.2px。
 * 减去右内边距 12 与那条 1px 分隔线，内容区还有 183px，富余 23px。
 * 🔴 **一行都不许折行、不许省略号截断** —— 档名是这个选择器的唯一标识，
 * 截断之后人不知道自己点的是哪一档。再往下收就会先卡在这一行上。
 */
.funnel-layout {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.funnel-rail {
  flex: none;
  width: 196px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 12px;
  border-right: 1px solid #eef2f7;
  align-self: stretch;
}
/*
 * ==== 阶段切换器（分段控件）====
 * 坐在档位正上方、占满左栏、两段等分，中间夹一枚「▸」。
 * 🔴 **灰槽 + 白底浮起**（而不是 `.fr-item` 那套蓝底 + 左侧色标）：它是上位开关，
 * 与下面那层档位在视觉上必须分层，否则一列里上下两个蓝块，人分不清哪个管哪个。
 * 下面靠 12px 间距 + 一条细线与档位隔开：上面切阶段、下面切档，是两件事。
 */
.fr-seg {
  display: flex;
  align-items: stretch;
  gap: 1px;
  padding: 2px;
  border-radius: 6px;
  background: #f3f4f6;
}
.fr-seg-btn {
  flex: 1 1 0;
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 5px;
  padding: 5px 4px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #6b7280;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  cursor: pointer;
}
.fr-seg-btn:hover { color: #111827; }
.fr-seg-btn.on {
  background: #fff;
  color: #1a6fff;
  font-weight: 700;
  box-shadow: 0 1px 2px rgba(17, 24, 39, 0.1);
}
/* 阶段总数：比段名大一号且等宽数位 —— 这个控件上要读的就是这两个数 */
.fr-seg-num {
  font-size: 14px;
  font-weight: 700;
  color: #374151;
  font-variant-numeric: tabular-nums;
}
.fr-seg-btn.on .fr-seg-num { color: #1a6fff; }
/* 两段之间的箭头：它是**工作流方向**（未标记 —打标→ 已标记），不是数量递减；坐在灰槽上、不可点 */
.fr-seg-arrow {
  flex: none;
  display: inline-flex;
  align-items: center;
  color: #9ca3af;
  font-size: 10px;
  line-height: 1;
  user-select: none;
}
/* 切换器与档位之间的那条细线：上面切阶段、下面切档 */
.fr-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-top: 8px;
  border-top: 1px solid #eef2f7;
}
.fr-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 5px 8px 5px 10px;
  border: none;
  border-left: 2px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #4b5563;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.fr-item:hover { background: #f8fafc; color: #111827; }
/* 选中态＝填充块 + 深色文字 + 左侧一条主色标：只靠变色在一列里读不出"就是这一档" */
.fr-item.on {
  background: #eff6ff;
  border-left-color: #1a6fff;
  color: #1a6fff;
  font-weight: 700;
}
.fr-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 数字右对齐 + 等宽数位：一列纵向读的就是这一竖排数，位数不对齐就比不出大小 */
.fr-num {
  flex: none;
  min-width: 26px;
  text-align: right;
  color: #6b7280;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.fr-item.on .fr-num { color: #1a6fff; }
.fr-num.bad { color: #ef4444; }
/*
 * 「筛后 / 全量」的分母那一半：**弱化到与档名同色**，不与前半争视线 ——
 * 前半是"表里有多少行"（要看的），后半是"这一路本来有多少"（对分母用的）。
 * 两半同粗同深的话，一列数字读起来全是分数，反而看不出哪一路被筛了。
 */
.fr-num-den { margin-left: 2px; color: #b6bcc7; font-weight: 500; }
.fr-item.on .fr-num-den { color: #93b8ff; }
.fr-num.bad .fr-num-den { color: #f4a5a5; }
/* 「无风险」上方的细分隔线：它是漏斗的漏出口、走到这儿止步，不能和上面几档排成一列读 */
.fr-sep { height: 1px; margin: 4px 8px; background: #eef2f7; }
/*
 * 缩进语法（左栏只有 186px 宽，故第二、三级靠**缩进 + 字号/字重弱化**分层，不再加图标）：
 *   d0 阶段全量 / 阶段本身 / 与全量并列的另一种分类 —— 不缩进、字重加粗、颜色最深；
 *   d1 上一行那一类的取值行 —— 缩进一级、常规字重；
 *   d2 取值行里再展开的一层 —— 缩进两级、更小字号、更浅。
 */
.fr-item.d0 { padding-left: 10px; color: #374151; font-weight: 600; }
.fr-item.d1 { padding-left: 21px; color: #6b7280; font-weight: 500; }
.fr-item.d2 { padding-left: 33px; padding-top: 3px; padding-bottom: 3px; color: #949dab; font-weight: 400; font-size: 12px; }
.fr-item.d2 .fr-num { font-size: 11px; }
/* 展开箭头：这一列里唯一一个有下级的入口，不给箭头会被当成和「高危」一类 */
.fr-caret { flex: none; margin-left: auto; color: #9ca3af; font-size: 9px; line-height: 1; }
.fr-item.on .fr-caret { color: #1a6fff; }

.funnel-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/*
 * 表头只剩右侧那排动作（批量操作 / 手动筛查 / 命中台账）。
 * 标题与说明删掉之后不能让按钮贴到卡片上沿，故这一行自己撑住一点上边距。
 */
.funnel-main-head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 28px;
}

/*
 * 窄屏（< 1100px）：左栏折成一行横向 chip。
 * 纵向那一列在窄屏下会把右侧的表压到出滚动条，而表才是这一屏的正事。
 * 🔴 阶段切换器在窄屏下**照旧是一枚分段控件、照旧带箭头**，只是不再撑满整行：
 * 它是漏斗的流向，摊平成两枚 chip 就与下面的档位混成一排了。
 */
@media (max-width: 1100px) {
  .funnel-layout { flex-direction: column; gap: 10px; }
  .fr-seg { margin-right: 6px; flex: none; align-self: center; }
  .fr-seg-btn { flex: none; padding: 4px 10px; }
  .funnel-rail {
    width: auto;
    align-self: auto;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    padding: 0 0 8px;
    border-right: none;
    border-bottom: 1px solid #eef2f7;
  }
  .fr-group {
    flex-direction: row; align-items: center; flex-wrap: wrap; gap: 4px;
    padding-top: 0; border-top: none;
  }
  .fr-item {
    width: auto;
    padding: 3px 10px;
    border: 1px solid #d1d5db;
    border-radius: 3px;
    font-size: 12px;
  }
  .fr-item.on { background: #1a6fff; border-color: #1a6fff; color: #fff; }
  .fr-item.on .fr-num { color: #fff; }
  /*
   * 折成横排之后缩进没有意义（一行里"缩进一级"读不出任何层级），
   * 故三级统一回到 chip 的内边距，层级改由字重承担：全量加粗、切面常规。
   */
  .fr-item.d0,
  .fr-item.d1,
  .fr-item.d2 { padding: 3px 10px; font-size: 12px; }
  .fr-item.d0 { font-weight: 700; }
  .fr-item.d2 .fr-num { font-size: 12px; }
  .fr-caret { margin-left: 4px; }
  .fr-num { min-width: 0; margin-left: 4px; }
  .fr-sep { width: 1px; height: 14px; margin: 0 2px; }
}

/* ③-b 分级筛选 chip：选中态用品牌主色（§4.6 激活），等级点取 RISK_LEVEL_STYLE */
.grade-filters { gap: 6px 8px; }
.gf-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border: 1px solid #D1D5DB; border-radius: 3px;
  background: #fff; color: #6B7280; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit;
}
.gf-chip:hover { background: #F9FAFB; border-color: #9CA3AF; color: #374151; }
.gf-chip.active { background: #1A6FFF; border-color: #1A6FFF; color: #fff; font-weight: 600; }
.gf-chip.active .gf-dot { box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.7); }
.gf-chip.warn:not(.active) { border-color: #EF4444; background: #EF444422; color: #EF4444; }
.gf-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.gf-num {
  min-width: 18px; padding: 0 5px; border-radius: 8px; font-size: 11px; font-weight: 700;
  background: rgba(0, 0, 0, 0.06); font-variant-numeric: tabular-nums;
}
.gf-chip.active .gf-num { background: rgba(255, 255, 255, 0.22); }

/* 表格 */
.ob-empty { padding: 32px 8px; text-align: center; color: #94a3b8; font-size: 13px; }
.work-panel .hit-table { margin: 0; }
.hit-table-wrap {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  /*
   * 窄屏兜底：七列固定宽加起来就 726px，容器再窄「命中内容」会被挤到只剩几十像素，
   * 而 overflow: hidden 会把命中原文**静默裁掉**——人看到的是半句话，却不知道被截了。
   * 给表格一条下限并允许横向滚动：宁可滚，也不能悄悄把判断依据吞掉。
   * 正常桌面宽度下达不到这条线，滚动条不会出现。
   */
  overflow-x: auto;
  background: #fff;
}
.hit-table { min-width: 960px; }

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
}
.pager-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.pager-total {
  font-size: 13px;
  color: #6b7280;
}
.pager-selected {
  font-size: 13px;
  color: #1a6fff;
}

.hit-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.hit-table th {
  text-align: left; font-weight: 600; color: #6B7280; font-size: 11px;
  padding: 8px 10px; border-bottom: 1px solid #E5E7EB; background: #F3F4F6;
}
.hit-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.hit-table tr.untagged { background: #fef2f2; }
/*
 * 浅红底上原来的 #f1f5f9 行线几乎看不见，连续高危行会糊成一块。
 * 已核实是白底，行线还在——这里用白线分行；左侧红条改成每行一段（不算进盒模型），
 * 避免 inset 阴影盖住行线、看起来连成一条。
 */
.hit-table tr.untagged td { border-bottom-color: #fff; }
.hit-table tr.untagged td:first-child {
  background-image: linear-gradient(#EF4444, #EF4444);
  background-repeat: no-repeat;
  background-size: 3px calc(100% - 2px);
  background-position: 0 1px;
}
.grade-pill {
  display: inline-block; min-width: 22px; text-align: center;
  padding: 1px 6px; border-radius: 3px; font-size: 12px; font-weight: 700;
}
.rt-no { border: none; background: none; color: #1A6FFF; cursor: pointer; padding: 0; font-size: 13px; font-variant-numeric: tabular-nums; }
.hit-title { color: #0f172a; margin-top: 2px; font-size: 12px; }
.hit-sub { color: #94a3b8; font-size: 11px; }
.hit-excerpt { color: #475569; line-height: 1.6; font-size: 12px; }
/*
  命中词高亮。取本页既有的琥珀强调（与「待核实」标 .tsb-open 同一对色值），
  不用 <mark> 的浏览器默认荧光黄——那个色在本页任何一处都没出现过，看着像别的系统混进来的。
  三处片段（命中清单 / 打标弹窗顶部 / 同单其它命中）共用这一份。
*/
.excerpt-quote { word-break: break-word; }
.excerpt-hit {
  padding: 0 2px;
  border-radius: 2px;
  background: #FEF3C7;
  color: #B45309;
  font-weight: 600;
}
.hit-pos { display: inline-block; padding: 0 5px; margin-right: 4px; border-radius: 3px; background: #F3F4F6; color: #6B7280; font-size: 11px; }
.hit-when { color: #64748b; font-variant-numeric: tabular-nums; font-size: 12px; }

.track-word { color: #475569; font-size: 12px; font-weight: 500; }
.track-word-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.grade-pill-inline { padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }

.hit-flag { display: inline-block; margin-top: 4px; padding: 0 6px; border-radius: 3px; font-size: 10px; }
.flag-scan { background: #EFF6FF; color: #1D4ED8; }

/* 工单级事实：同单互见徽标 + 工单级等级提示，同处工单列 */
.ticket-facts { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
/* 徽标可点，故给出按钮形态与主色描边——不可点的 flag-scan 保持纯色块，两者不能长得一样 */
.flag-sib {
  border: 1px solid #C7D2FE; background: #EEF2FF; color: #4338CA;
  font-family: inherit; line-height: 16px; cursor: pointer;
}
.flag-sib:hover { border-color: #6366F1; background: #E0E7FF; }
.flag-sib.on { border-color: #4338CA; background: #4338CA; color: #fff; }
.ticket-grade-note { margin-top: 3px; font-size: 11px; }
.ticket-grade-note b { font-weight: 700; }

/* 手动筛查：就地筛选条，沿用工作台 query-filters 形态 */
.scan-entry { display: inline-flex; align-items: center; gap: 4px; }
.scan-entry.active { border-color: #1a6fff; color: #1a6fff; }
.hit-batch-btn.active { background: #f8fbff; }
.hit-batch-badge {
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
  color: #fff;
  background: #1a6fff;
  border-radius: 7px;
}

.scan-bar { margin: 2px 0 8px; }
/* 手动筛查九维：5 列更紧凑，避免 4 列时每格过宽、占三行 */
.scan-bar .list-toolbar {
  gap: 6px 10px;
  padding: 8px 10px;
}
.scan-bar .tb-fields {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px 10px;
}
.scan-bar .fi { gap: 12px; }
.scan-bar .fi-date { grid-column: span 2; }
.scan-bar .fl {
  width: 4.5em;
  font-size: 11px;
  line-height: 28px;
}
.scan-bar .tb-actions { min-width: 84px; }
.scan-bar .list-toolbar :deep(.tb-ctl.ant-select-multiple .ant-select-selection-item) {
  max-width: 64px;
}
.scan-bar .list-toolbar :deep(.tb-range .ant-picker-input > input) {
  font-size: 11px;
}

/*
 * 已保存筛选器 chip：胶囊 + 漏斗标 + 靛蓝一色，与等级 chip（方角、灰白底、蓝色实心激活）
 * 一眼可分。两者点下去的后果不是一个量级：那边是筛，这边是换整套条件并重跑。
 */
.saved-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-top: 8px;
  padding: 6px 10px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 8px;
}
.sf-label { font-size: 11px; color: #9ca3af; flex: none; }
.sf-chip {
  display: inline-flex;
  align-items: center;
  height: 24px;
  border: 1px solid #c7d2fe;
  border-radius: 999px;
  background: #fff;
  overflow: hidden;
}
.sf-chip:hover { border-color: #6366f1; }
.sf-chip.on { border-color: #4338ca; background: #eef2ff; }
.sf-apply {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 100%;
  padding: 0 4px 0 10px;
  border: none;
  background: transparent;
  color: #4338ca;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sf-chip.on .sf-apply { font-weight: 600; }
.sf-apply:disabled { color: #a5b4fc; cursor: not-allowed; }
.sf-ic { font-size: 11px; flex: none; }
.sf-del {
  height: 100%;
  padding: 0 8px 0 4px;
  border: none;
  background: transparent;
  color: #a5b4fc;
  font-size: 13px;
  line-height: 1;
  font-family: inherit;
  cursor: pointer;
}
.sf-del:hover { color: #ef4444; }
.sf-hint { font-size: 11px; color: #cbd5e1; }

/* 保存筛选器弹窗 */
.sf-form .op-label { width: 3.5em; }
.sf-tip { margin: 8px 0 0; }
.sf-preview {
  margin-top: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 6px;
}
.sf-preview-k { font-size: 11px; color: #9ca3af; }
.sf-preview-v { margin-top: 4px; font-size: 12px; color: #475569; line-height: 1.6; }

.ledger-bar { margin: 2px 0 8px; }
.ledger-bar .list-toolbar {
  gap: 6px 10px;
  padding: 8px 10px;
}
.ledger-bar .tb-actions { min-width: 84px; }

/* 筛选条：标签左、控件右（固定标签宽，列内对齐）；右侧动作跟两行控件对齐 */
.list-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 12px;
  align-items: start;
  padding: 8px 12px;
  background: #f9fafb;
  border: 1px solid #f0f1f3;
  border-radius: 6px;
}
.tb-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px 12px;
  min-width: 0;
}
.fi {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.fl {
  width: 4em;
  flex: none;
  font-size: 12px;
  color: #6b7280;
  line-height: 28px;
  text-align: right;
  white-space: nowrap;
}
.tb-ctl { flex: 1; min-width: 0; width: auto !important; }
.list-toolbar :deep(.tb-ctl.ant-select .ant-select-selector) {
  font-size: 13px;
  border-radius: 6px;
  background: #fff;
  min-height: 28px !important;
  border-color: #d1d5db;
}
.list-toolbar :deep(.tb-ctl.ant-select-single .ant-select-selector) {
  height: 28px !important;
  align-items: center;
}
.list-toolbar :deep(.tb-ctl.ant-select-single .ant-select-selection-item),
.list-toolbar :deep(.tb-ctl.ant-select-single .ant-select-selection-placeholder) {
  line-height: 26px;
}
.list-toolbar :deep(.tb-ctl.ant-select-multiple .ant-select-selector) {
  height: 28px !important;
  padding-block: 0;
  align-items: center;
  overflow: hidden;
}
.list-toolbar :deep(.tb-ctl.ant-select-multiple .ant-select-selection-overflow) {
  flex-wrap: nowrap;
}
.list-toolbar :deep(.tb-ctl.ant-select-multiple .ant-select-selection-item) {
  height: 20px;
  line-height: 18px;
  margin-block: 0;
  max-width: 100%;
}
.tb-range { flex: 1; min-width: 0; width: auto !important; }
.list-toolbar :deep(.tb-range.ant-picker) {
  width: 100%;
  height: 28px;
  font-size: 13px;
  border-radius: 6px;
  background: #fff;
  padding: 0 4px 0 8px;
  border-color: #d1d5db;
}
.list-toolbar :deep(.tb-range .ant-picker-input) {
  flex: 1;
  min-width: 0;
}
.list-toolbar :deep(.tb-range .ant-picker-input > input) {
  width: 100%;
  min-width: 0;
  font-size: 12px;
  line-height: 26px;
}
.list-toolbar :deep(.tb-range .ant-picker-suffix) {
  display: none;
}
.list-toolbar :deep(.tb-range .ant-picker-input) {
  flex: 1;
  min-width: 0;
}
.list-toolbar :deep(.tb-range .ant-picker-input > input) {
  width: 100%;
  min-width: 0;
  font-size: 12px;
  line-height: 26px;
}
.tb-search {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-sizing: border-box;
}
.tb-search:focus-within {
  border-color: #1a6fff;
  box-shadow: 0 0 0 2px rgb(26 111 255 / 10%);
}
.tb-search-ic { color: #9ca3af; font-size: 13px; flex: none; }
.tb-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 13px;
  color: #374151;
  background: transparent;
  font-family: inherit;
}
.tb-search-input::placeholder { color: #9ca3af; }
.tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 12px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  font-family: inherit;
}
.tb-btn:hover { border-color: #1a6fff; color: #1a6fff; }
.tb-btn :deep(.anticon) { font-size: 12px; }
.tb-btn:disabled { color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed; }
.tb-btn:disabled:hover { color: #9ca3af; border-color: #e5e7eb; }
.tb-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  align-self: center;
  gap: 8px;
  min-width: 96px;
}
.tb-actions .tb-btn,
.tb-actions .scan-go { width: 100%; }

@media (max-width: 860px) {
  .list-toolbar { grid-template-columns: 1fr; }
  .tb-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .scan-bar .tb-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tb-actions { flex-direction: row; min-width: 0; gap: 8px; }
}

.link-btn {
  padding: 0; border: none; background: transparent; font-size: 12px;
  color: #1a6fff; cursor: pointer; font-family: inherit;
}
.link-btn:hover { color: #0f4fcc; text-decoration: underline; }
.link-btn:disabled { color: #cbd5e1; cursor: not-allowed; text-decoration: none; }
.link-btn:disabled:hover { color: #cbd5e1; text-decoration: none; }
.row-btn-solid { background: #1e293b; border-color: #1e293b; color: #fff; }
.row-btn-solid:disabled { opacity: 0.45; cursor: not-allowed; }

/* 筛查结果条 */
.scan-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 12px; margin-bottom: 10px;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;
}
.sb-stat { font-size: 13px; color: #334155; }
.sb-stat b { font-size: 16px; color: #0f172a; }
.sr-fresh { margin-left: 8px; padding: 0 7px; border-radius: 10px; font-size: 12px; background: #dcfce7; color: #15803d; }
.sr-dup { margin-left: 6px; padding: 0 7px; border-radius: 10px; font-size: 12px; background: #f1f5f9; color: #64748b; }
.sb-hint { margin-left: 10px; font-size: 12px; color: #94a3b8; }
/* 单工单焦点条：与筛查结果条同形，靛蓝一色区分"这是收窄不是新数据" */
.focus-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 12px; margin-bottom: 10px;
  background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 6px;
}
.fb-stat { font-size: 13px; color: #3730A3; }
.fb-stat b { font-size: 14px; color: #312E81; font-variant-numeric: tabular-nums; }
.fb-hint { margin-left: 10px; font-size: 12px; color: #818CF8; }
.fb-grade { margin-left: 10px; font-size: 12px; color: #4338CA; }
.fb-grade.muted { color: #818CF8; }
.fb-exit {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  height: 26px; padding: 0 10px; border: 1px solid #C7D2FE; border-radius: 4px;
  background: #fff; color: #4338CA; font-size: 12px; font-family: inherit; cursor: pointer;
}
.fb-exit:hover { border-color: #6366F1; background: #F5F3FF; }
.fb-x { font-size: 13px; line-height: 1; }

.sb-actions { display: inline-flex; align-items: center; gap: 12px; }
.sb-all { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #64748b; cursor: pointer; }
.sb-picked { font-size: 12px; color: #64748b; }

.hit-table tr.scan-dup { opacity: 0.55; }
.state-chip { padding: 1px 8px; border-radius: 10px; font-size: 12px; background: #f1f5f9; color: #64748b; }
.state-chip.sc-will { background: #dcfce7; color: #15803d; }
.state-chip.sc-skip { background: #fff; color: #94a3b8; border: 1px solid #e2e8f0; }
/* 开始筛查：主动作，与两个 link 按钮拉开层级 */
.scan-go {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  height: 28px; padding: 0 12px; border: none; border-radius: 6px;
  background: #1a6fff; color: #fff; font-size: 13px; cursor: pointer; font-family: inherit;
}
.scan-go:hover { background: #0f4fcc; }
.scan-go:disabled { opacity: 0.5; cursor: not-allowed; }

/* 监控雷达（顶栏） */
.radar { flex: none; display: flex; align-items: center; }
.radar-face {
  position: relative; width: 48px; height: 48px; border-radius: 50%;
  background: radial-gradient(circle, #f8fafc 0%, #eef2f7 70%, #e6ebf2 100%);
  border: 1px solid #dbe3ec; overflow: hidden;
}
.radar-ring { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); border: 1px solid #dbe3ec; border-radius: 50%; }
.radar-ring.r1 { width: 34%; height: 34%; }
.radar-ring.r2 { width: 64%; height: 64%; }
.radar-ring.r3 { width: 92%; height: 92%; }
.radar-cross { position: absolute; background: #dbe3ec; }
.radar-cross.v { left: 50%; top: 4%; width: 1px; height: 92%; }
.radar-cross.h { top: 50%; left: 4%; height: 1px; width: 92%; }
.radar-sweep {
  position: absolute; inset: 0; border-radius: 50%;
  background: conic-gradient(from 0deg, rgba(26, 111, 255, 0.28) 0deg, rgba(26, 111, 255, 0.06) 42deg, transparent 70deg, transparent 360deg);
  animation: radar-spin 4s linear infinite;
}
.radar.alert .radar-sweep {
  background: conic-gradient(from 0deg, rgba(220, 38, 38, 0.26) 0deg, rgba(220, 38, 38, 0.06) 42deg, transparent 70deg, transparent 360deg);
}
@keyframes radar-spin { to { transform: rotate(360deg); } }
.radar-blip {
  position: absolute; width: 4px; height: 4px; border-radius: 50%;
  transform: translate(-50%, -50%); cursor: help;
  animation: radar-pulse 4s ease-in-out infinite;
}
@keyframes radar-pulse { 0%, 70%, 100% { opacity: 0.5; } 82% { opacity: 1; } }
.radar-hub {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  width: 8px;
  height: 8px;
  border: 1.5px solid #94a3b8;
  border-radius: 50%;
  background: #fff;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 60%);
  pointer-events: none;
}
.radar-hub::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #1a6fff;
  transform: translate(-50%, -50%);
}
.radar.alert .radar-hub {
  border-color: #f87171;
  box-shadow: 0 0 0 1px rgb(255 255 255 / 70%), 0 0 6px rgb(220 38 38 / 18%);
}
.radar.alert .radar-hub::after {
  background: #dc2626;
}
@media (prefers-reduced-motion: reduce) {
  .radar-sweep, .radar-blip { animation: none; }
}

.hit-cb {
  width: 16px;
  height: 16px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  vertical-align: middle;
}
.hit-cb.checked {
  background: #1a6fff;
  border-color: #1a6fff;
}

/* 打标弹窗 · 紧凑布局 */
.tag-modal-form { gap: 10px; }
.tag-hit-head {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tag-hit-top {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.tag-ticket-no {
  flex: none;
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: #1a6fff;
  cursor: pointer;
}
.tag-ticket-no:hover { text-decoration: underline; }
.tag-hit-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-hit-excerpt {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.55;
}
.tag-hit-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
}
.tag-hit-meta strong { color: #374151; font-weight: 600; }
.tag-hit-sep { color: #d1d5db; }
.tag-bulk-head { padding: 8px 12px; }
.tag-bulk-summary {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}
.tag-bulk-summary strong {
  color: #111827;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.tag-modal-form .op-field-h > .op-label {
  width: 72px;
  text-align: right;
  flex-shrink: 0;
}
.tag-modal-form .op-field-h.tag-field-block {
  gap: 14px;
  margin: 0;
}
.tag-modal-form .op-field-h.tag-field-note {
  gap: 14px;
}
.tag-modal-form :deep(.tag-radio-fill) { flex: 1; min-width: 0; }
.tag-modal-form :deep(.tag-radio-compact .op-radio-card) {
  padding: 2px 8px;
  min-height: 26px;
  border-radius: 5px;
  justify-content: center;
  text-align: center;
}
.tag-modal-form :deep(.tag-radio-compact .op-rc-title) {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
}
.tag-modal-form :deep(.tag-radio-compact) { gap: 4px; }
.tag-modal-form :deep(.tag-radio-4 .op-rc-title) { font-size: 11px; }
.tag-modal-form :deep(.tag-radio-4 .op-radio-card) { padding: 2px 4px; }
.tag-modal-form .tag-field-block + .tag-field-block { margin-top: 8px; }
.tag-field-note :deep(textarea.ant-input) { font-size: 13px; }
.tag-form-foot {
  margin: -2px 0 0 86px;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.4;
}
.tag-tip-compact { padding: 8px 10px; font-size: 11px; }

/* 修正态：现行结果与改动历史 */
.tag-cur {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
}
.tag-cur-k { color: #9ca3af; }

/* 同单其它命中：靛蓝一色，与灰底的命中头、修正记录区分开——它讲的是别的命中，不是本条 */
.tag-sib {
  padding: 10px 12px;
  background: #F5F7FF;
  border: 1px solid #DDE3FF;
  border-radius: 8px;
}
.tag-sib-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
}
.tag-sib-title { font-weight: 600; color: #312E81; }
.tag-sib-n { font-size: 11px; color: #6366F1; font-variant-numeric: tabular-nums; }
.tag-sib-grade { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; color: #6b7280; }
.tag-sib-nograde { color: #9ca3af; cursor: help; }
.tag-sib-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tsb-item { padding-left: 10px; border-left: 2px solid #C7D2FE; }
.tsb-head { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.tsb-word { font-size: 12px; font-weight: 600; color: #374151; }
.tsb-at { font-size: 11px; color: #9ca3af; font-variant-numeric: tabular-nums; }
.tsb-open { padding: 0 6px; border-radius: 3px; font-size: 10px; background: #FEF3C7; color: #B45309; }
.tsb-excerpt { margin-top: 3px; font-size: 12px; color: #6b7280; line-height: 1.55; }
.tag-trace {
  padding: 10px 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.tag-trace-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.tag-trace-n { font-size: 11px; font-weight: 400; color: #9ca3af; }
.tag-trace-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tt-item { padding-left: 10px; border-left: 2px solid #e5e7eb; }
/* 末条即当前生效值，用主色标出来，免得在一串历史里认错 */
.tt-item:last-child { border-left-color: #1a6fff; }
.tt-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  color: #9ca3af;
}
.tt-step { font-weight: 600; color: #6b7280; }
/* 角色贴在姓名后面做弱强调：它是姓名的限定语，不该抢姓名的视线 */
.tt-role { padding: 0 5px; border-radius: 8px; background: #f3f4f6; color: #6b7280; }
.tt-at { font-variant-numeric: tabular-nums; }
.tt-change { margin-top: 2px; font-size: 12px; color: #374151; line-height: 1.5; }
.tt-reason { margin-top: 2px; font-size: 11px; color: #6b7280; line-height: 1.5; }

/* 打标弹窗 */
.op-radio-disabled { pointer-events: none; opacity: 0.45; }

/* 扫库记录 */
.run-table .hit-when { font-size: 12px; line-height: 1.5; white-space: nowrap; }
.run-kind {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 12px;
  white-space: nowrap;
}
.run-kind.realtime { background: #eff6ff; color: #1d4ed8; }
.run-kind.manual { background: #f5f3ff; color: #6d28d9; }
.run-status {
  display: inline-block;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
}
.run-status.success { background: #dcfce7; color: #15803d; }
.run-status.failed { background: #fee2e2; color: #dc2626; }
.run-status.abnormal { background: #ffedd5; color: #c2410c; }
.rule-chip { padding: 0 7px; border-radius: 10px; background: #eff6ff; color: #1d4ed8; font-size: 12px; }
.run-res { margin-top: 4px; font-size: 12px; color: #475569; line-height: 1.5; }
.run-res.failed, .run-res.abnormal { color: #64748b; }

.cell-done { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.tag-done { padding: 1px 7px; border-radius: 3px; font-size: 11px; cursor: help; font-weight: 600; }
/* 误报行没有等级徽标，打标来源的悬停说明落在这枚判定标上，故它同样给 help 光标 */
.verdict-chip { padding: 0 5px; border-radius: 3px; font-size: 10px; cursor: help; }
.vc-ok { background: #10B98122; color: #10B981; }
.vc-fp { background: #F3F4F6; color: #6B7280; }
.row-btn {
  padding: 2px 8px; border: 1px solid #D1D5DB; border-radius: 3px;
  background: #fff; color: #374151; font-size: 11px; cursor: pointer; font-family: inherit;
}
.row-btn:hover { background: #F9FAFB; }
.row-btn-tag { border-color: #1A6FFF; color: #1A6FFF; font-weight: 600; }
/* 修正是低频动作，收到次按钮里最轻的一档，不与「去管控」争视线 */
.row-btn-amend { border-color: #E5E7EB; color: #6B7280; }
.row-btn-amend:hover { border-color: #D1D5DB; color: #374151; }
.row-btn-primary { border-color: #1A6FFF; color: #1A6FFF; display: inline-flex; align-items: center; gap: 3px; font-weight: 600; }
.row-btn-primary:hover { background: #EFF6FF; }

.word-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
.word-table th {
  text-align: left; font-weight: 500; color: #64748b; font-size: 12px;
  padding: 6px 6px; border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}
.word-table td { padding: 6px 6px; border-bottom: 1px solid #f1f5f9; color: #374151; vertical-align: middle; }
.wt-col-word { width: 60px; }
.wt-col-grade { width: 48px; }
.wt-col-state { width: 48px; }
.wt-col-updated { width: 108px; }
.wt-col-ops { width: 92px; }
.word-table tr.off { opacity: 0.55; }
.wt-word { font-weight: 500; color: #0f172a; white-space: nowrap; }
.wt-grade,
.wt-state-cell,
.wt-updated,
.wt-ops { white-space: nowrap; }
.wt-scope {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.risk-word {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 12px;
  white-space: nowrap;
  line-height: 1.4;
}
.hits-high { color: #EF4444; font-weight: 600; }
.hits-saved { margin-left: 5px; font-size: 11px; color: #10B981; cursor: help; }
.acc { padding: 0 7px; border-radius: 10px; font-size: 12px; cursor: help; font-variant-numeric: tabular-nums; }
.acc.good { background: #10B98122; color: #10B981; }
.acc.mid { background: #F59E0B22; color: #F59E0B; }
.acc.bad { background: #EF444422; color: #EF4444; }
.wt-state { padding: 0 7px; border-radius: 10px; font-size: 12px; }
.wt-state.on { background: #10B98122; color: #10B981; }
.wt-state.off { background: #F3F4F6; color: #9CA3AF; }
.wt-updated {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.wt-ops { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.drawer-note { font-size: 12px; color: #64748b; line-height: 1.7; margin: 12px 0 0; }
.drawer-note.top { margin: 0 0 12px; }
.drawer-toolbar { margin-bottom: 10px; }
.word-form { gap: 16px; }
.word-form .op-field-h > .op-label { width: 4.5em; }
.word-form :deep(.ant-radio-group.ant-radio-group-small .ant-radio-button-wrapper) {
  font-size: 12px;
  height: 24px;
  line-height: 22px;
  padding-inline: 8px;
}
.wf-tip { margin: 0; }
.wf-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: #f9fafb;
  border: 1px solid #f0f1f3;
  border-radius: 8px;
}
.wf-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}
.wf-section-title.req::before { content: '* '; color: #ef4444; }
.wf-syn-box {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.word-form :deep(.wf-scope-grid) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px 10px;
  flex: 1;
  min-width: 0;
}
.word-form :deep(.wf-scope-grid.ant-checkbox-group) {
  line-height: 1.5;
}
.word-form :deep(.wf-scope-grid .ant-checkbox-wrapper) {
  margin-inline-start: 0;
  font-size: 13px;
  white-space: nowrap;
}
.wf-syn-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.wf-syn-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 6px 1px 8px; border: 1px solid #e2e8f0; border-radius: 10px;
  background: #f8fafc; color: #475569; font-size: 12px;
}
.wf-syn-del {
  border: none; background: none; padding: 0; line-height: 1;
  color: #94a3b8; font-size: 13px; cursor: pointer; font-family: inherit;
}
.wf-syn-del:hover { color: #ef4444; }

/* ==== 风险工单池（队列 + 领取 + 评估弹窗）==== */

/* 收窄标：等级 chip 那一排里混着的"当前生效条件"，故取同一个圆角与字号，
   只在配色上与 chip 区分——chip 是可点的选择项，它是可摘的既成条件。 */
.report-filters { align-items: center; }
/* 来源那一排贴着三态那一排，间距收窄一点，读起来才是"同一组条件的第二层"而不是新的一块 */
.report-source-filters { align-items: center; margin-top: -4px; }
/* 行首的分类名：它不是可点项，故不给边框与 hover，只当标签用 */
.rf-k { font-size: 12px; color: #6B7280; margin-right: 2px; }
.nc-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 6px 3px 10px; border: 1px solid #BFDBFE; border-radius: 3px;
  background: #EFF6FF; color: #1D4ED8; font-size: 12px; font-weight: 500;
}
.nc-chip.bad { border-color: #FECACA; background: #FEF2F2; color: #B91C1C; }
.nc-del {
  border: none; background: none; padding: 0 2px; line-height: 1;
  color: inherit; opacity: 0.55; font-size: 13px; cursor: pointer; font-family: inherit;
}
.nc-del:hover { opacity: 1; }

/*
 * 报备表比命中表少一列长文本，min-width 相应放低，窄屏下不必无谓地出横滚。
 * table-layout: fixed 是「场景描述单行截断」的前提——自动布局下长描述会把
 * 这一列一路撑宽、把其余列挤扁，ellipsis 根本不会触发。
 */
.report-table-wrap .report-table { min-width: 1040px; table-layout: fixed; }
/*
 * 监控来源标：与扫库记录的 .run-kind 同一个胶囊形态（本页已有的"分类标"写法），
 * 不另造一种。关键词触发单独着色——它是队列里**唯一走核实打标**的那一路，
 * 操作列的按钮也跟着变字，颜色先把这件事说在前面。
 */
.src-tag {
  display: inline-block; padding: 1px 7px; border-radius: 10px;
  font-size: 12px; white-space: nowrap;
  background: #f1f5f9; color: #475569;
}
.src-tag.kw { background: #eff6ff; color: #1d4ed8; }
/*
 * 「未纳入监控」＝ 这一格没有值，**不是第五个监控来源**。故不给底色、只留一圈虚线，
 * 与真来源那几枚实心 chip 在形状上就分得开 —— 摆成一样的话，
 * 人会以为系统新增了一路叫"未纳入监控"的自动识别。
 */
.src-tag.none {
  background: transparent;
  border: 1px dashed #dde3ea;
  color: #9ca3af;
  padding: 0 6px;
}
/*
 * 「兼：X」＝ 这张单**同时还满足**的其余来源（多路命中的行才有）。
 * 复用 `.src-tag` 的骨架、**不新造视觉**，只压小一档并转灰：它是提示、不是这一格的主角，
 * 与紧邻的工单号抢不了视线。单路行根本不渲染这个节点，故不占位、不留空。
 */
.src-tag.also-src {
  margin: 2px 4px 0 0;
  padding: 0 6px;
  font-size: 11px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  color: #94a3b8;
}
/* 「+N」＝ 这一格还有没摆出来的东西，全部内容挂在它的悬停上。弱化、可 hover */
.kw-more {
  display: inline-block;
  padding: 0 5px;
  border-radius: 9px;
  background: #f3f4f6;
  color: #9ca3af;
  font-size: 11px;
  white-space: nowrap;
  cursor: help;
}
.kw-more:hover { background: #e5e7eb; color: #4b5563; }
/* 可排序表头：只加一个箭头位，不换字号与底色——表头一变形，人会以为整张表换了 */
.th-sortable { cursor: pointer; user-select: none; }
.th-sortable:hover { color: #1A6FFF; }
.th-sortable.on { color: #1A6FFF; }
.th-sort-mark { margin-left: 3px; font-size: 10px; opacity: 0.7; }
/* 场景描述单行截断：队列是用来挑下一条评的，全文在 title 与评估弹窗里 */
.rr-desc {
  color: #475569; font-size: 12px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* 定宽列里的工单号 / 人名不能被撑破，超出即省略，全值挂在 title 上 */
.report-table td { overflow: hidden; text-overflow: ellipsis; }
/*
 * 已领取行的操作格现在是两枚按钮（处置 +「释放」，§5.4 元素 ⑥ ⑩a）。
 * Vue 的 `whitespace: condense` 会把两个元素之间那个带换行的空白节点整个抹掉，
 * 两枚按钮会**贴死在一起**；故显式给间距，不靠模板里的换行。
 * ⚠️ 只收在本表内：实时监控那张表的「去管控 + 修正」是既有形状，本轮不动它。
 */
.report-table .row-btn + .row-btn { margin-left: 6px; }
/*
 * 「已标记」段那一格 SLA 的两行。**与工作台那张富列表逐字同一副形状**（12px / 18px 行高 / 600），
 * 颜色由 `slaResolveLine` / `slaFirstLine` 现算现给 —— 那是两处共用的同一份口径，
 * 本页只负责把它画出来，不自己判"算不算超时"。
 */
.report-table .sla-line {
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
}
/* 这一格里的产品名跟在客户下面，与「客户 / 班组」那一格同一副形状 */
.report-table .rr-desc .hit-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 🔴 超时只标这一格：整行铺红后，队列一长满屏都是红的，反而分辨不出哪几条超了 */
.rr-waited { color: #64748b; font-weight: 500; }
.rr-waited.over { color: #EF4444; font-weight: 700; }
/*
 * 富列表那张表的外壳。它自己是 flex:1 + 内部滚动（工作台那一屏是整页高度），
 * 而本页清单下面还挂着分页条，故这里给一个不撑满的高度上限，让它在本页也只占内容高度。
 */
.tk-list-wrap { display: flex; flex-direction: column; min-height: 0; }
.tk-list-wrap :deep(.rich-list) { flex: none; }
.tk-list-wrap :deep(.table-grid) { padding: 0; }
.rr-dec { color: #374151; font-size: 12px; font-weight: 500; }
.rr-dec.risk { color: #B91C1C; font-weight: 600; }

/* ---- 评估报备弹窗 ---- */
.assess-form { gap: 14px !important; }
.assess-block { display: flex; flex-direction: column; gap: 10px; }
.assess-block-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.assess-block-form {
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}

/* ① 第一区块：入池依据（A 线）/ 报备信息（B 线），共用一张卡的骨架（对齐工单侧 rr-sheet） */
.assess-sheet {
  background: #fff;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(234, 88, 12, 0.06);
}
.assess-sheet-head {
  padding: 12px 14px;
  background: linear-gradient(180deg, #fff7ed 0%, #fff 100%);
  border-bottom: 1px solid #ffedd5;
}
.assess-sheet-brand { min-width: 0; }
.assess-sheet-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.assess-ticket-no { font-size: 13px; }
/*
 * 区块名（入池依据 / 报备信息）。做成小徽标而不是标题行：卡本身已经有描边与暖色抬头，
 * 再压一行 h4 会把弹窗第一屏撑掉一截，而这里要说的只是"这一格答的是哪个问题"。
 */
.assess-sheet-kind {
  flex: none;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  color: #9a3412;
  background: #ffedd5;
  border-radius: 4px;
}
.assess-sheet-time {
  font-size: 12px;
  font-weight: 600;
  color: #9a3412;
  font-variant-numeric: tabular-nums;
}
.assess-sheet-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 0;
  margin-top: 8px;
}
.assess-meta-pair {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.assess-meta-icon { color: #9ca3af; font-size: 12px; }
.assess-meta-label { color: #9ca3af; }
.assess-meta-value { color: #374151; font-weight: 600; }
.assess-meta-warn { color: #c2410c; }
.assess-meta-sep {
  width: 1px;
  height: 12px;
  margin: 0 10px;
  background: #e5e7eb;
  flex: none;
}
.assess-sheet-body { padding: 12px 14px 14px; }
.assess-quote {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.65;
  color: #1f2937;
  background: #f8fafc;
  border-left: 3px solid #fdba74;
  border-radius: 0 6px 6px 0;
  white-space: pre-wrap;
  word-break: break-word;
}
/*
 * 核实结论块：行式直接复用底栏那套 assess-foot-*，这里只给它一个容器。
 * 底色取 .assess-quote 同一个 #f8fafc、描边取 .assess-file 同一个 #e2e8f0——
 * 不另起一套色，它与描述块是同一层级的"这条是怎么回事"，不该比描述更抢眼。
 */
.assess-verify {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}
.assess-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.assess-file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11px;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
}
.assess-file :deep(.anticon) { color: #94a3b8; font-size: 11px; }
.assess-file-btn {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: #4338ca;
  cursor: pointer;
  line-height: 1.4;
}
.assess-file-btn:hover { color: #1d4ed8; text-decoration: underline; }

/* ---- 释放记录（评估弹窗内 · §5.5 ⑥）：与 B 线报备池那一份**逐行同值**，改一处必两处同改 ---- */
.assess-releases {
  margin-top: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}
.assess-releases-head {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}
.assess-release {
  margin-top: 6px;
}
/* 分隔线只给第二条起。⚠️ 不能写 `:first-of-type`——标题也是 div，规则会落空 */
.assess-release + .assess-release {
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
}
.assess-release-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.assess-release-who {
  font-size: 11px;
  font-weight: 600;
  color: #374151;
}
.assess-release-at {
  font-size: 11px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}
.assess-release-reason {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.55;
  color: #4b5563;
  word-break: break-word;
}

/* ---- 释放弹窗 ---- */
.rm-release {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rm-release-hint { margin: 0; }

/* ② 本单另有：卡片底栏 */
.assess-sheet-foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 12px;
  background: #fafafa;
  border-top: 1px dashed #e5e7eb;
}
.assess-foot-row {
  display: grid;
  grid-template-columns: 68px 1fr;
  gap: 8px;
  align-items: start;
  font-size: 12px;
}
.assess-foot-k { color: #9ca3af; line-height: 1.5; }
.assess-foot-v { color: #374151; font-weight: 600; line-height: 1.5; }
.assess-foot-sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 400;
  color: #64748b;
}
.assess-foot-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.assess-foot-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  color: #475569;
}
.assess-foot-at { color: #94a3b8; font-variant-numeric: tabular-nums; }
.assess-foot-dec { color: #374151; font-weight: 600; }
.assess-foot-esc { color: #64748b; font-variant-numeric: tabular-nums; }

/* ③ 评估表单：标签与决策同一行（须自带 display:flex，不能单靠 op-field-h） */
.assess-dec-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin: 0;
}
.assess-dec-row > .op-label {
  flex: none;
  width: 72px;
  text-align: right;
  white-space: nowrap;
}
.assess-dec-inline {
  display: inline-flex !important;
  flex: 1;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.assess-dec-inline :deep(.ant-radio-wrapper) {
  margin: 0 !important;
  padding: 6px 12px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  line-height: 1.45;
  font-size: 12px;
  white-space: nowrap;
  align-items: center;
  transition: border-color 0.15s, background 0.15s;
}
.assess-dec-inline :deep(.ant-radio-wrapper-checked) {
  border-color: #1a6fff;
  background: #eff6ff;
}
.assess-dec-inline :deep(.ant-radio) { margin-top: 0; top: 0; }
.assess-dec-foot {
  margin-left: calc(72px + 10px);
}
.assess-err { margin-top: 4px; font-size: 11px; color: #ef4444; line-height: 1.4; }
/* 「升级」的派生说明行：与工单页 OpRiskAssessModal 的 .ticket-assess-hint 同一套 token */
.assess-hint { margin-top: 4px; font-size: 11px; color: #6b7280; line-height: 1.5; }
</style>
