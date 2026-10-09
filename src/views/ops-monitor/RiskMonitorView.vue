<script setup lang="ts">
// 风险监控 —— 从《【915】运营监控大盘》模块四拆出独立立项（D7a）
//
// 【本页现在的主线：漏斗】（业务第三轮拍板）
//   ① 识别 —— 两类自动识别（预警词命中 / 重点工单）产生**监控条目**
//   ② 打标 —— 对条目四选一：高 / 中 / 低 / 无风险。**打标是入池门槛**
//   ③ 分流 —— 低/中/高 进风险工单池等评估；无风险不进池、**离开漏斗**（本页左栏不再列它）
//   ④ 评估 —— 池内条目二选一：升级 / 不升级（升级只指转投诉单，不含升三线）
//   ⑤ 下游 —— 高危单的管控由人在工单上发起（基线 ※27，人点、系统不自动管控）
//
// 【命中记录这一层还在，但退到旁路】风险词命中是**证据**不是工作项：一张单可以被三条词命中，
// 而人要判的始终是"这张单有没有风险"。故日常工作面是条目（实时监控页签），
// 命中记录留在「命中明细」页签供事后点查与核实，词表准确率仍由那里回填。
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DatePicker, message } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
// 🔴 `RollbackOutlined` 已删：它只给释放弹窗当图标，那块随领取 / 释放整套撤出本工作面而删除
import { ReloadOutlined, SearchOutlined, SettingOutlined, HistoryOutlined, CheckOutlined, UnorderedListOutlined, DownOutlined, TagsOutlined, SafetyCertificateOutlined, SaveOutlined, FilterOutlined } from '@ant-design/icons-vue';
import MetricTipIcon from '@/components/MetricTipIcon.vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
// 协同处理弹窗与工单页底栏那一枚**共用同一个组件**：投诉单在池里与在工单上做的是同一件事，
// 抄第二份的下场是两个入口的必填项、副作用与履历行文各走各的（本项目在「派生说明行」上刚栽过）
import OpRiskCollabModal from '@/views/tickets/components/operation/OpRiskCollabModal.vue';
// 评估弹窗第一区块（入池依据 / 报备信息 + 释放记录）与工单页 OpRiskControlModal 共用一个组件；
// 命中原话取窗 `excerptWindow`、实时监控来源判断 `isKeywordRow` 与附件下载同一个共享文件（本页命中清单 / 打标弹窗也读它）
import RiskAssessSheet from '@/views/tickets/components/operation/RiskAssessSheet.vue';
// 风险等级四选一 + 风险备注：**六处「风险管控」弹窗共用同一份呈现**（2026-09-29 裁决）。
// 评估处置工作面走真实例 `useRiskLevelFields`（落库 recordTagFor）；条目打标与命中那一路
// 两个形态各有既有状态与落库路径，用 `makeRiskLevelFieldsView` 包一层薄适配器交给同一个组件渲染。
import RiskLevelFields from '@/views/tickets/components/operation/RiskLevelFields.vue';
import { makeRiskLevelFieldsView, useRiskLevelFields } from '@/composables/useRiskLevelFields';
// 选「升级」后那一段投诉专属建单要素（投诉一类 / 二类）：与工单页底栏、风险报备池两个评估入口
// **共用同一个组件**，字段、级联与校验全在 `useEscalateComplaintFields`，本页不另写一份
import EscalateComplaintFields from '@/views/tickets/components/operation/EscalateComplaintFields.vue';
import { useEscalateComplaintFields } from '@/composables/useEscalateComplaintFields';
// 「风险管控」弹窗下半**投诉支**那三项（处理意见 / 建议事项 /「其他」的具体建议）：
// 与工单页页头「风险管控」弹窗、风险工单池的协同处理弹窗**共用同一份**，字段、校验与
// 落库（`submitTo`）全在 `useRiskCollabFields` 里，本页不另写一套
import RiskCollabFields from '@/views/tickets/components/operation/RiskCollabFields.vue';
import { useRiskCollabFields } from '@/composables/useRiskCollabFields';
import { excerptWindow, isKeywordRow } from '@/views/tickets/components/operation/riskAssessSheet';
import AppPagination from '@/components/AppPagination.vue';
import { opsTip } from '@/mock/opsMonitorTips';
import { useUserStore } from '@/stores/user';
// 核实历史放在 store 里：工单处理页要读同一份结论（打标回传），
// 组件内的 ref 只在本页活着，跨页就断了。
import { useRiskTagStore, type RiskTagEntry } from '@/stores/riskTags';
// 风险工单池（《【930】》§5）。队列条目与风险词命中记录**分母不同、两处不可相加**（§7 撞名），
// 故各走各的 store，本页只是把两块工作面并在一屏。
// 池是两条线（A 线自动入池 / B 线二线报备）合并后的那一个工作面，故读的是合并层 riskPool；
// 枚举与时限等两线共用的口径在 riskShared，两条线各自的模型在各自的 store 里。
import {
  isComplaintPoolTicket,
  poolStageStatusOf,
  useRiskPoolStore,
  type RiskPoolItem,
} from '@/stores/riskPool';
import {
  NO_RISK_LOCKED_TIP,
  canTagNoRisk,
  useRiskQueueStore,
  type HitVerifyOutcome,
  type RiskQueueEntry,
} from '@/stores/riskQueue';
import {
  ASSESS_DECISIONS,
  MONITOR_SOURCES,
  NO_RISK,
  QUEUE_SOURCES,
  REPORT_SOURCE,
  RISK_TAG_RESULTS,
  isPoolLevel,
  isPooledStatus,
  normalizeDecision,
  todayStamp,
  // 🔴 `REPORT_ASSESS_LIMIT_MIN` 那一笔已删：它只喂 `assessLimitText`，
  // 而那一个随「等待时长」整列撤出本工作面而删除。参数本身仍是 store 与报备池那一侧的真源
  type AssessDecision,
  type MonitorSource,
  type RiskTagResult,
} from '@/stores/riskShared';
import { useDerivedTicketStore } from '@/stores/derivedTickets';
// 评估弹窗的两处口径与工单页那个入口**共用同一份实现**：
// `deriveEscalatedComplaint` 是「升级」派生的完整落地，
// 提交前重查（`tagAssessSubmitBlockOf`）与原单终态判据（`isRiskTicketEnded`）
// 与报备池、工单页的评估入口共用，各处行为一致
// 🔴 **工作面那一处不再 import `assessSubmitBlockOf`**（2026-10-09）：那一份要的是
// 「条目仍为本人名下的「已领取」态」，而本工作面的领取整套已撤，那道判据恒不成立。
// 它**仍是报备池与工单页头两处的判据**，共享文件一个字没动，见 `workbenchAssessBlockOf`。
import {
  ASSESS_ALREADY_CONCLUDED_TIP,
  deriveEscalatedComplaint,
  isRiskTicketEnded,
  nextEscalatedNoOf,
  showEscalateComplaintFields,
  tagAssessSubmitBlockOf,
} from '@/composables/useRiskReportAssess';
import { RISK_TAG_ROLES, RISK_WORD_MAINTAIN_ROLES } from '@/config/roles';
import { RISK_LEVELS, riskLevelText } from '@/config/risk';
import { TICKETS } from '@/mock/tickets';
// 优先级的界面词取工单侧那一份**单一真源**：建单页下拉、班组看板都从那里取，
// 本文件再抄一份，改天业务把「普通加急」改个说法，这一列就会静默地留在旧词上。
// `canClaimRiskReport` 是**池内动作权**（客诉专员 + 三个管理员 scope）的全站唯一判据，
// 与 B 线报备池共用同一份 —— 本页原先自带一份同值的局部数组，2026-10-09 换成引它（见 `canClaim`）
// 🔴 `canReleaseAnyRiskReport` 那一笔 import 已随释放整套撤出本工作面而删除；
// 它仍是报备池那一侧管理员兜底释放的判据，`types/ticket.ts` 一个字没动
// 🔴 `ticketStatusDisplayName` 那一笔已删：它只服务待判筛选条那格「当前状态」，整格已撤
import { canClaimRiskReport, isLiveTicket as isLiveTicketShared, resolveTicketGroupNames, type Priority, type Ticket, type TicketType } from '@/views/tickets/types/ticket';
import { PRIORITY_OPTIONS } from '@/views/tickets/types/createTicket';
// 🔴 清单表直接复用工作台那张富列表，不在本页另画一张长得像的：
// 「重点工单」那一路的行**就是工单**，人在这一档要判的也正是工单本身
// （摘要 / SLA / 状态 / 产品）。原先那两列（监控来源 ＝ 档名的复述、风险描述 ＝ 一句写死的套话）
// 对判断没有任何信息量，停在这一档根本判不了，只能一条条点进工单。
import TicketRichList from '@/views/tickets/components/TicketRichList.vue';
// 🔴 池行表第一格的工单标题单元格 ＝ 工作台富列表用的**同一个共享件**，不在本页手搓一套：
// 那一格要摆的（催 / 补 · 状态 · 类型 · 标题 · 渠道 · 单号 · 关联标）与富列表逐字同一件东西，
// 另画一套就会在两处长出两副长相。富列表（`TicketRichList`）内部用的也是它。
import TicketTitleCell from '@/views/tickets/components/TicketTitleCell.vue';
// 池行只带一个单号，标题单元格要的是整张 `Ticket` —— 解析走**既有的那一个口**
// （静态工单库 → 升级派生的那批 → null），风险那枚按钮的形态判定用的就是它，
// 本页不另造一条查法：两条查法迟早在"某个单号查不到"那一档上给出两种结果。
import { resolveTicketRowFor } from '@/views/tickets/composables/opActions';
// SLA 那两行与"此刻是否超时"的口径取工作台那一份**单一真源**（已提到 utils 共用）——
// 本页再抄一份的话，同一张单在两个页面会给出不同的 SLA 说法
// 🔴 `isSlaBreachedNow` 那一笔已删：它只服务待判筛选条那格「SLA」，整格已撤
import { slaFirstLine, slaResolveLine } from '@/views/tickets/utils/ticketListCells';
import { getOpsScopeSelectGroups, type OpsScope } from '@/mock/opsMonitor';
import {
  RISK_LEVEL_STYLE,
  RISK_WORDS,
  wordOnlyRiskHitsOf,
  runManualScan,
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
 *   · `scan`     手动筛查 —— 风险词命中记录（拿条件去扫存量，**只做查询**，结果不落库）；
 *   · `judged`   命中明细 —— 风险词命中记录（事后点查 + 核实打标，词表准确率由它回填）；
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
 *                       └─无风险────▶ 离开漏斗（条目照旧落库，左栏不列、已判不计）
 * ```
 *
 * 🔴 **本轮只剩两视图**（2026-10-07 裁决）：原先的 `noRisk`（已标记无风险）与
 * `reported`（二线报备已出结论）两档**随左栏那两档一并删除** ——
 *   · **无风险不进已判**：判为无风险的离开漏斗，`已判 ＝ 全部有风险`；
 *   · **报备不在后台展示**：报备只在前台（工单工作台「风险报备池」）露出。
 * 🔴 **已判段本轮改成在办口径**（2026-10-08 拍板）：`已判 ＝ 在办 ∧ 标注了风险等级`，
 * 原单进终态即退出该段（哪怕条目已出结论），判据与待判段同一个 —— 见 `judgedUniverse`。
 * 两档的条目 / 报备单**数据照旧在 store 里**（`noRiskEntries` / `reports`），
 * 删掉的只是本页这两个视图与左栏那两档；页头「今日发现」「今日标记」仍照各自口径数无风险。
 *
 * 🔴 **随 `noRisk` 一并消失的是"核查漏标误判"那个容器**：原注释写着
 * "核查漏标误判除了从这里翻出来改，没有第二条路" —— 本轮按业务口径照删，
 * **这条能力本页不再提供**（判为无风险之后没有复核入口）。
 * 原因是无风险不进已判，容器挂在已判段上就不成立了；
 * 复核入口另立待办（命中明细 / 查询中心里做筛选项），本轮不补。
 */
type QueueView = 'monitoring' | 'pooled';
const queueView = ref<QueueView>('monitoring');

/**
 * 「未标记」这一段**两级展开**。
 *
 * ```
 *   实时监控   ▾ 高风险 / 中风险 / 低风险      ← 按**词表预设的识别风险等级**
 *   重点工单   ▾ P0 / P1 / P2 / P3           ← 按**工单优先级**
 * ```
 *
 * 🔴 **两路是同一维（监控来源）的两个值，互斥**。互斥这件事不是巧合而是要求：
 * 一条行只能算进一路，否则「实时监控 + 重点工单 ＝ 页签上那个数」这条恒等式当场失守，
 * 而这一列的全部说服力就在于"点开的数加起来对得上"。归属由 `effectiveSourceOf` 一处判定。
 *
 * 🔴 **原「投诉单」「重要紧急」两档合并成「重点工单」**（2026-09-18 裁决）：两档的行都是工单、
 * 列与筛选逐字相同、子档都按工单优先级分，拆成两档只是把同一件事切成两半，
 * 而切开的那条线（是不是投诉）在池子里已由「原单类型」单独答过。
 *
 * 🔴 **第二级的维度按各自的性质走，不强求统一**：命中那一路人排队看的是"机器觉得这句话多重"，
 * 工单那一路看的是"这张单本身多急"。硬拉成同一把尺，两边都会得到一列读不出业务含义的数。
 *
 * 【为什么没有一档"合计"】原先各路上面还压着一档「全部待判」装各路之和。删掉了：
 * 那个数现在由**页签**承担，档位与页签各摆一遍就是同一个数写两处；
 * 删掉之后这一段只剩两级缩进，与「已标记」段的层级语法齐平。
 *
 * 【为什么另开状态而不是塞进 `queueView`】`queueView` 分的是**打没打标**
 * （未标记 / 已入池 / 无风险），是链上的段；切片分的是**同一段里看哪一路**，是段内的维度。
 */
type UntaggedSlice = 'kw' | 'focus';
/** 默认停在第一路「实时监控」—— 两路里只有它带命中原话，是唯一能就地判完的一路 */
const untaggedSlice = ref<UntaggedSlice>('kw');
/** 切片内的第二级收窄；空串 ＝ 不限子档（＝ 点的是切面行本身） */
const untaggedSub = ref<string>('');
/**
 * 两个切面各自展开着没有。**默认全展开**：业务给的原始格式就是把子档一并列出来的，
 * 而且子档为 0 也照常显示（见 `untaggedSliceItems`）——结构稳定比省几行重要，
 * 档位时有时无，人会以为筛选坏了。
 */
const untaggedOpen = ref<Record<UntaggedSlice, boolean>>({
  kw: true,
  focus: true,
});

/**
 * 「已入池」这一档再按**现行打标等级**分档：高 / 中 / 低，`all` ＝ 全部有风险，
 * `tagger` ＝ 同一批条目**换按标记人看**。
 *
 * 🔴 **「全部有风险」不含「无风险」**，且**本轮起 `已判 ＝ 全部有风险`**（2026-10-07 裁决）：
 * 判为无风险的离开漏斗，左栏任何一段都不再计它、不再列它。
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
const tagLevelFilter = ref<RiskLevel | 'all' | 'tagger'>('all');

/**
 * 标记人单选（只在「按标记人」这一档作数）。`all` ＝ 不按人收窄。
 *
 * 🔴 **分母与「全部有风险」同一个**：只数打标为高 / 中 / 低的条目，**不含无风险**。
 * 把无风险也数进来，这一行会变成"谁判得多"，而督导要的是"谁名下压着多少条有风险的"。
 * 🔴 无风险那一批**本页已没有去处**（「无风险」那一档随 2026-10-07 裁决删除）：
 * 谁判的、判得对不对，要等复核入口另立待办之后才答得上，这一行只管有风险的那一批。
 */
const taggerFilter = ref<string>('all');
/**
 * 左栏「按标记人」展开着没有。**它只管展开、不管选中**：展开的是"有哪些人"这份清单，
 * 选中的是"看谁的"（`taggerFilter`）。合成一个变量的话，选了某个人再想看全部就只能先收起来。
 */
const taggerExpanded = ref(false);
/*
 * 🔴 **原先这里有一组「按处置阶段」的状态**（`poolStageFilter` / `POOL_STAGE_KEYS` /
 * `poolAxisExpanded`），给左栏那个第三轴供选中态与展开态。**整组随该轴删除**
 * （2026-10-07 裁决）：领取逻辑未闭环，且这一轴与「评估处置工作面」那张池行表
 * 的「处置阶段」列是同一件事 —— 同一个维度摆两处，人只会去找它们为什么不一样。
 * ⚠️ 那张池行表的「处置阶段」列**也已删**（2026-10-08 裁决：业务侧没有这个定义）。
 * 池内阶段现在只从每一行的「操作」列上读出来（`poolStageOf` 仍在，只服务那一列的分岔）。
 */

/**
 * 班组筛选（单选，横跨左栏每一档）。
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
  tagLevelFilter.value === 'all' || tagLevelFilter.value === 'tagger'
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
// 可这个池子里躺着重点工单这类压根不满足"有概率演变为投诉"的条目——
// 池名说的是"风险侧要盯的一池单"，比 §1.1 那个风险定义宽。
// 两个词各管各的，才不会在同一册里打架。
//
// 🔴 **O14 那条"同一条在两个页签各出现一次"的已知代价，本轮随漏斗消失了**：
// 打标成了入池门槛之后，一条条目在同一时刻只可能落在**一个**视图里——
// 还没打标的在实时监控·待判，打完低/中/高的在实时监控·已判（＝风险工单池里那一半），
// 判无风险的**离开漏斗**（2026-10-07 裁决：无风险不进已判，本页不再给它一个档）。
// 两个页签看的是同一条链的前后两段，不再是同一条的两份副本。
const reportStore = useRiskPoolStore();
/**
 * A 线队列本体。用于两件事：按两类判据补齐监控条目（`syncAutoEntries`）、
 * 命中核实回写条目（`verifyHit`）。其余取数一律走合并层 `reportStore`。
 */
const riskQueue = useRiskQueueStore();
/** 「升级」派生的新投诉单落这里，工单页解析时兜在静态数据源之后 */
const derivedTickets = useDerivedTicketStore();

/*
 * ==== 重点工单（页头第二块）====
 *
 * 🔴 **它的分母是「工单」，另外两块都不是**，三块并排最容易被读成一路数：
 *   · 实时监控 ＝ **监控条目**（A 线，今日扫描流量）
 *   · 重点工单 ＝ 工单系统里的**全部在办工单**      ← 本块
 *   · 风险工单 ＝ 左栏「已判」那一批**监控条目**（高 / 中 / 低）
 * 三者两两不可相加、不互校。
 *
 * 🔴 **本块分母 ＝ 全部在办工单，不是左栏来源档「重点工单」那个集合**（2026-10-07 裁决）。
 * 左栏那一档是**自动纳入监控的判据**，更窄：在办 ∧（投诉 ∨ P0 / P1）。
 * 同一个词在同屏指两个集合，故本块的块标题与每个数的 title 都把分母写死。
 * 【为什么本块取全量在办】类型四类（咨询 / 建议 / 商机 / 投诉）只有落在全量在办上才有参考价值；
 * 落在那个更窄的子集上，咨询 / 建议 / 商机三类会小到没法据以行动。
 *
 * 【为什么取在办、不取全库】终态单不入队、也不再需要盯。
 * 把已结案的单数进来，这两行就成了一个没法据以行动的历史总量。
 */
/**
 * 这张单**已被升级派生走**（已升级投诉 / 已升级外投）—— 判据与工单处理页
 * `useTicketOperation.loadDetail` 逐字同一份，不另写一套：
 *   · 工单自带的 `escalatedToNo`（工单库里那几张停表单写在字段上）；
 *   · 叠上本次会话的**升级台账** `derivedTickets.escalations`（评估判「升级」现场派生出来的那一跳）。
 *
 * 🔴 **台账那一跳非认不可**：`mock/tickets.ts` 的 `nodeStatus` 对原单仍写「处理中」
 * （那是有意的 —— 静态样本不可改脏、改了刷新即回滚，见 `stores/derivedTickets.ts`），
 * 「已升级投诉」是 `loadDetail` 从台账现推出来的。只读 `nodeStatus` 的话，
 * 同一张单在工单详情页是终态、在本页却还算在办，本页整条漏斗跟着算错。
 */
/**
 * 🔴 **"在办"判据只有一份，在 `types/ticket.ts`**（`isLiveTicketShared`）。
 * 本页待判段 / 已判段 / 评估处置工作面三处同取它（见 `isLiveRow`），
 * 页头「重点工单」那一块、以及那一块下钻到工单列表时传的 `scope=live` 也同取它 ——
 * 卡上写 38、点进去躺着 47 这种事，根子就是各写一份。
 * ⚠️ 原先这里另有一个 `escalatedAwayOf`，已并进那一份共用判据的第二条腿。
 */
const isLiveTicket = (t: Ticket) => isLiveTicketShared(t, derivedTickets.escalatedToNoOf);

/**
 * 本块的底表 ＝ **全部在办工单**。下面两行分布同取这一份，
 * 故 `ΣP0..P3 ≡ 它的条数`（`Priority` 只有四个取值，没有落不进格的单）。
 */
const liveTickets = computed(() => TICKETS.filter(isLiveTicket));

/**
 * 第一行 · **优先级四维**。界面词取建单下拉同一份 `PRIORITY_OPTIONS`（见 `PRIORITY_RAIL_LABEL`），
 * 本文件不另抄一套说法 —— 改天业务把「普通加急」改个词，这一行会跟着走。
 */
const HEAD_PRIORITY_KEYS = ['P0', 'P1', 'P2', 'P3'] as const satisfies readonly Priority[];
const livePriorityCounts = computed<Record<Priority, number>>(() => {
  const base: Record<Priority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const t of liveTickets.value) base[t.priority] += 1;
  return base;
});

/**
 * 第二行 · **工单类型**。业务点名的是前四类（咨询 / 建议 / 商机 / 投诉）。
 *
 * 🔴 **「刷机」作为第五格照常摆上**（2026-10-07 补）：工单类型这一维在建单侧**就是五个取值**
 * （`CreateFormTicketType`），只摆四类的话这一行之和会比上面那行少掉在办的刷机单 ——
 * 实测 ΣP0..P3 ＝ 92、Σ四类 ＝ 74，**同一块卡里两行差着 18 而没有任何说明，
 * 读的人只会以为其中一处坏了**。两行本来就同分母（都取 `liveTickets` ＝ 全部在办工单），
 * 差额纯粹是"类型这一维的第五个取值没摆出来"。摆上之后
 * **Σ五类 ≡ ΣP0..P3 ≡ 在办工单总数**，两行肉眼可验。
 * 🔴 差额如实摆出来、不吞也不凑：吞掉的话差的那十几条谁也找不出来在哪。
 *
 * `Record<TicketType, number>` 这一笔是**编译期的穷举保证**：将来枚举多一个取值，
 * 这里会直接编译不过，而不是静默地又少掉一格。
 */
const HEAD_TICKET_TYPES = ['咨询', '建议', '商机', '投诉', '刷机'] as const satisfies readonly TicketType[];
const liveTicketTypeCounts = computed<Record<TicketType, number>>(() => {
  const base: Record<TicketType, number> = { 咨询: 0, 建议: 0, 商机: 0, 投诉: 0, 刷机: 0 };
  for (const t of liveTickets.value) base[t.type] += 1;
  return base;
});

/**
 * 按**工单**数打标结论的高 / 中 / 低：取 `reportStore.pooledEntries`（打标为 高 / 中 / 低 进池的条目）
 * 经 `pick` 过滤后的条目，按 `ticketNo` 去重；同一张单有多条条目时取其中最高的 `tag.result`。
 * 「无风险」不进池、不在这批条目里，故不列。
 */
function tagLevelCountsOf(pick: (e: RiskQueueEntry) => boolean): Record<RiskLevel, number> {
  const best = new Map<string, RiskLevel>();
  for (const e of reportStore.pooledEntries) {
    const lv = e.tag?.result;
    if (!lv || !(RISK_LEVELS as readonly string[]).includes(lv) || !pick(e)) continue;
    const cur = best.get(e.ticketNo);
    if (!cur || RISK_LEVELS.indexOf(lv as RiskLevel) < RISK_LEVELS.indexOf(cur)) best.set(e.ticketNo, lv as RiskLevel);
  }
  const counts: Record<RiskLevel, number> = { 高: 0, 中: 0, 低: 0 };
  best.forEach((lv) => { counts[lv] += 1; });
  return counts;
}

/*
 * 🔴 **原先这里有一个 `liveTagLevelCounts`**，给页头「重点工单」块那一行「风险等级
 * 高危 / 中危 / 低危」供数：在办工单按打标结论、按工单去重取最高。
 * 随该行删除（2026-10-07 裁决）：它**与左栏「已判」那三档同名不同数** ——
 * 那边数的是**监控条目**、一条条目一个等级，这边按**工单**去重取最高，同屏两个「高危」天生不等。
 * 业务判「重点工单都没有风险等级，这个数也不合适」，整行撤掉，页头的高 / 中 / 低
 * 只在「风险工单」那一块出现一处，且与左栏走同一个派生值（见 `pooledAllCount` / `pooledLevelCount`）。
 * `tagLevelCountsOf` 本身**照旧在用**（「实时监控」块的「风险标注」走它），一个字没动。
 */

//
// 🔴 **本页不再有「处置阶段」这个轴，工作面也不再有视图档**（2026-10-08 裁决）。
// 原先这里有一个 `type ReportView` + `reportView` ref（all / open / unassigned /
// assigning / assessed 五档），给那一排 chip 与两张表的切换用。
//   · 那一排 chip 与表里同名那一列 —— **整排整列删**（业务侧没有「处置阶段」这个定义）；
//   · 与 `assessed` 档配套的「已结论」专表（评估人 / 结论时刻 / 评估决策 / 派生投诉单）
//     —— **整张删**（工作面只管处置、不兼做台账；那三项去左栏「已判」段看）；
//   · 「结论」那一排 chip —— 改成与来源 / 原单类型 / 风险等级同层的**筛选项**（`decisionFilter`）。
// 三处的消费端清完之后本变量再无人用，一并删掉。表**恒摆全部条目**（见 `reportAllRows`）。
//
// ⚠️ `unassigned` / `待分派` 这些词是**分派时代留下的**。分派 / 改派 / 批量分派整套已随
// 第三轮拍板取消，那一态现在的含义就是"**还没人领**"，故界面一律写「待领取」；
// 落库值不动（`ReportStatus` 是两条线共用的，B 线本轮不解冻），只在 `poolStageOf` 里译一次。
//
/**
 * 池行走到哪一步。取 store 的 `status`，不靠"有没有承办人"倒推。
 * 投诉单条目不经领取、没有「已领取」态（§5.4 ⑥），走 `poolStageStatusOf` 读成「待领取」。
 */
function poolStageOf(r: RiskPoolItem): '待领取' | '已领取' | '已结论' {
  const status = poolStageStatusOf(r);
  if (status === '待分派') return '待领取';
  if (status === '评估中') return '已领取';
  return '已结论';
}
/*
 * 🔴 **原先这里有一个 `poolAssigneeOf`**（池行表「承办人」那一格的取值：待领取的行写「—」，
 * 其余读 `r.assignee`）。随**那一列整个删除**一并删（2026-10-09 裁决）：
 * 承办人的值就是**领取人**，而本工作面的领取整套已撤，源没了。
 * ⚠️ `r.assignee` 这个字段本身照旧在写（`assessOnTag` 把空着的补成结论人、`coordinate` 同理），
 * 报备池那一侧也照旧有自己的承办人一列 —— 删的只是本表这一格。
 */

/**
 * 监控来源筛选（N6：来源是池行的一个属性、不是另一批数据）。
 *
 * 【为什么跨三态保留】来源是条目的固有属性，不随阶段变。切态时清掉它，
 * 人在「待领取 · 重点工单」筛完切到「评估中」会看到全部来源，只会以为筛选失灵。
 * ⚠️ 阶段这一轴已删（2026-10-08 裁决），表恒摆全部条目，这条"跨态保留"现在无条件成立。
 */
const sourceFilter = ref<MonitorSource | 'all'>('all');
/** 来源排序：默认不排（队列默认按等待时长），点表头在正序/倒序/不排之间轮转 */
const sourceSort = ref<'none' | 'asc' | 'desc'>('none');
/** 排序序位取枚举的声明次序，不按字面量排——中文按码点排出来的次序读不出任何业务含义 */
const SOURCE_ORDER = new Map<MonitorSource, number>(MONITOR_SOURCES.map((s, i) => [s, i]));
//
// 🔴 **原先这里有一个 `onlyOverdue`**（"只看超时未评的"那个视图内收窄），随 2026-10-08 裁决
// 删掉「处置阶段」整排 chip 一并删除：它唯一的置位入口就是那一排的第五枚「超时未评」，
// 那一枚一走，这个开关再也打不开，留着就是一条恒为 false 的腿（`openBase` / `reportAllRows` /
// `reportGroupBase` / 收窄标那一行都得为它分叉）。
// ⚠️ **工作面那一列「等待时长」也已删**（2026-10-09 裁决：等待时长 / 领取 / 释放是
// 风险报备池那一套）。**本文件此刻一处都不显示等待时长 / 超时**：`rowOverdue` /
// `rowWaitedText` / `waitedText` 与 `.rr-waited` / `.rr-overdue-tag` 全部随那一列删净。
// 超时这件事在**报备池**（`RiskReportPoolPanel` 自己那一列）与工单页「风险报备」Tab
// （`OpRiskMonitorTab`）照旧；store 的 `isOverdue` / `waitedMinutes` 由那两处在用。
//
/**
 * 「风险处理建议」——投诉单那一路的收口方式，**与升级 / 不升级并列的第三种结论**。
 * 🔴 它不是 `AssessDecision`（那个枚举归 store，只装评估二选一），
 * 故本页自己给它一个字面量，与那两枚摆在同一排上读。
 * 不摆出来的话，「今日已结论」与下面几枚决策之和会差一条，而那一条谁也找不出来在哪。
 *
 * 🔴 **字面量取短词「建议」**：它同时是那一排指标的**显示文案**，而那一格只有一枚数字的宽度，
 * 摆全称会把「升级 / 不升级」两枚挤到换行。判等一律用本常量，不要再写字面量 ——
 * 界面词再改一次时，改这一处就够。
 */
const COORD_DECISION = '建议' as const;
type DecisionKey = AssessDecision | typeof COORD_DECISION;
/** 三枚决策：升级 / 不升级 来自 store 的枚举，协同是本页并列的第三种收口 */
const DECISION_KEYS = computed<DecisionKey[]>(() => [...ASSESS_DECISIONS, COORD_DECISION]);
/** 已评估视图内的收窄：只看某一个结论（由「今日决策」三枚按钮下钻置上） */
const decisionFilter = ref<DecisionKey | 'all'>('all');
/*
 * 🔴 **`assessLimitText` 已删**（2026-10-09）：它把处置时限（`REPORT_ASSESS_LIMIT_MIN`）
 * 换算成「N 小时 / N 分钟」的界面词，唯一的消费端是池行表「等待时长」那一格的悬停
 * —— 那一列已随领取 / 释放 / 等待时长整套撤出本工作面而删除，grep 复验零调用方。
 * ⚠️ **参数本身没动**：`REPORT_ASSESS_LIMIT_MIN` 仍是 store 侧超时判定与报备池那一侧的真源。
 */

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

/**
 * 池行表的另两维筛选（《【930】》§5.4 ③）：**工单类型**与**风险等级**（高 / 中 / 低）。
 * 与监控来源一样是池行的固有属性，跨阶段保留。
 *
 * 🔴 **「工单类型」2026-10-09 改判**（业务原话「都修改为 工单类型，支持多选」）：
 * 这一维原先是 `PoolTicketTypeKey = '投诉' | '非投诉'` 的**单选二值**，判的是"原单是不是投诉单"；
 * 现在与待判那两路**合成同一维** —— 同取值域（咨询 / 建议 / 商机 / 投诉 / 刷机，
 * 走 `poolTicketTypeOf` 取原单真实类型）、同形态（多选）。空数组 ＝ 不收窄。
 * 连同 `PoolTicketTypeKey` / `POOL_TICKET_TYPE_KEYS` / `poolTicketTypeKeyOf`
 * 三个只为那个二值域存在的符号一并删除（grep 复验过：除这两个筛选器外无人用）。
 *
 * 🔴 **这不动业务分岔**：「这张单是不是投诉单」那条线走的一直是 `isComplaintTicket`
 * （操作列投诉支 / 非投诉支、升级派生、协同按钮共六处），与本维**从来不是同一个判据**，
 * 本轮一个字没碰。
 */
const poolTicketTypeFilter = ref<string[]>([]);
const poolLevelFilter = ref<RiskLevel | 'all'>('all');
/**
 * 池行对应的**整张工单**，给第一格那个标题单元格用；`null` ＝ 工单库与派生库里都查不到。
 *
 * 🔴 **查不到的行照旧摆光单号**（见模板里那一格的 `v-else`）：池内条目与工单库是两条线，
 * 条目在、原单查不到这一档必须有去处 —— 丢行会让表的行数与左栏角标对不上，
 * 报错会让整段清单白屏，而条目自己至少还知道自己是哪个单号。
 */
function poolTicketOf(r: { ticketNo: string }): Ticket | null {
  return resolveTicketRowFor(r.ticketNo);
}
/** 原单的工单类型（咨询 / 建议 / 商机 / 投诉）。工单库与派生库两处都查；都查不到时按单号前缀判投诉与否 */
function poolTicketTypeOf(r: { ticketNo: string }): string {
  const t = TICKET_BY_NO.get(r.ticketNo) ?? derivedTickets.find(r.ticketNo);
  return t?.type ?? (isComplaintTicket(r.ticketNo) ? '投诉' : '—');
}
/**
 * 池行的「风险摘要」：风险备注（标记人为什么判这个等级）；没填备注时退回工单的问题描述 / 标题。
 * 不取条目 `desc` —— 那是入队套话（「投诉类工单自动纳入实时监控」），答不了"风险是什么"。
 */
function poolRiskSummaryOf(r: RiskPoolItem): string {
  if (r.tag?.note) return r.tag.note;
  const t = TICKET_BY_NO.get(r.ticketNo) ?? derivedTickets.find(r.ticketNo);
  return t?.problemDesc || t?.title || r.desc || '—';
}
/*
 * 🔴 **`poolTicketTypeKeyOf` 已删**（2026-10-09）：它把原单真实类型压成「投诉 / 非投诉」二值，
 * 只为那个二值筛选项存在。「工单类型」改成五取值多选之后，两个筛选器都直接读
 * `poolTicketTypeOf`，它再无调用方（grep 复验）。
 * ⚠️ 想判"是不是投诉单"的地方一直走 `isComplaintTicket`，不是这一个，**那六处未动**。
 */
type PoolAttr = 'source' | 'type' | 'level' | 'decision';
/**
 * 四维池行筛选一处套用。`skip` 摘掉其中一维 —— 那一维自己那个筛选项上的数要靠
 * "除自己之外"的底表算，让筛选影响自己的数字，选中一个取值之后其余几项全变 0，
 * 人再也看不出该切到哪一项。
 *
 * 🔴 **「结论」是 2026-10-08 新并进来的第四维**（原先它是「已结论」档内的一个收窄，
 * 挂在 `assessedBase` 里）。并进来之后它与另三维**同层**：按这一维筛 ＝ 整表收窄，
 * **没出结论的行（在队那两段）整段不显示** —— 这是业务拍板的口径，不是漏了一支。
 * 🔴 **不给「未出结论」一个取值**：取值域就是 升级 / 不升级 / 风险处理建议 三个。
 */
function byPoolAttrs(rows: RiskPoolItem[], skip?: PoolAttr) {
  return rows.filter((r) => {
    if (skip !== 'source' && sourceFilter.value !== 'all' && r.source !== sourceFilter.value) return false;
    // 多选：空数组 ＝ 不收窄；取原单真实类型（`poolTicketTypeOf`），与待判那两路同一把尺
    if (skip !== 'type' && poolTicketTypeFilter.value.length && !poolTicketTypeFilter.value.includes(poolTicketTypeOf(r))) return false;
    if (skip !== 'level' && poolLevelFilter.value !== 'all' && r.tag?.result !== poolLevelFilter.value) return false;
    if (skip !== 'decision' && decisionFilter.value !== 'all' && decisionKindOf(r) !== decisionFilter.value) return false;
    return true;
  });
}
function bySource(rows: RiskPoolItem[]) {
  return byPoolAttrs(rows);
}

/**
 * **本页的池行只数 A 线**（业务拍板 · 两条线各有各的家）。
 *
 * 【为什么要收窄】风险监控页这条漏斗从头到尾讲的是 A 线：自动识别 → 打标 → 入池 → 处置。
 * B 线（二线报备）不走打标这道门，它有自己的工作面 —— 工单工作台的「风险报备池」页签。
 * 两条线混在同一个分母里，左栏读下来就是「已标记 4 → 待处置 8」，
 * 像是同一批数据的两个阶段，而实际上那 8 条里有一半从来没经过上面那 4 条所在的那道门。
 * ⚠️ 2026-10-07 裁决把"**报备不在后台展示**"从这一处的局部口径升成了全页规矩：
 * 左栏那一档「风险报备」也删了，报备只在前台「风险报备池」露出。
 *
 * 🔴 **收窄之后三个数会变小，这是对的**：少掉的那几条不是丢了，是回它自己的池子里去了。
 *
 * 🔴 **连「二线报备」来源的池内条目也一并挡在外面，这是口径不是漏洞**（2026-09-29 裁决）。
 * 报备线的评估弹窗给风险等级时，`riskQueue.ensureEntryFor` 会现补一条来源
 * 「二线报备」的条目（见 `autoSourceFor` 第三支）——**它只承载等级与计数**：
 * 让「已判 · 全部有风险」那两个轴（走 `pooledEntries`，不过本函数）把它数进去
 * —— 那是**标记条目**，与 2026-10-07 删掉的「风险报备」那一档（报备单本身）不是一回事。
 * 它的**处置入口仍在工单工作台的「风险报备池」**，报备单本身就有评估那条路。
 * 放它进本页这个处置工作面排队的话，同一件事会在两个队列里各排一次，
 * 谁先动都会把另一边弄成脏数据。故本函数照旧按来源一刀切，**不要"修"回来**。
 */
function isALine<T extends { source: MonitorSource }>(r: T): boolean {
  return r.source !== REPORT_SOURCE;
}

/**
 * **本工作面池行的入选判据 ＝ A 线 ∧ 原单在办**。
 *
 * 🔴 **在办这一道走的是全页唯一那份 `isLiveRow`**（＝ `ticketOfRow` + `isLiveTicket`），
 * 与左栏待判段 / 已判段逐字同一个，不另写一份：三处分叉的话，同一张已进终态的单
 * 会从左栏退出、却还躺在这张处置表里等人领 —— 一屏之内两种在办口径。
 * 🔴 工单库与派生库都查不到的行**照实留着**（`isLiveRow` 对 null 放行），不吞：那是数据异常、不是终态。
 *
 * 下面六处取数（在队两段的底表、已结论底表，以及与它们一一对应的四个计数）全部过这一道，
 * 故 `待领取 + 已领取 + 已结论 ＝ 不限阶段 ＝ 表行数` 这条恒等式在改口径之后自动成立。
 */
function isPoolRow<T extends { source: MonitorSource; ticketNo: string }>(r: T): boolean {
  return isALine(r) && isLiveRow(r);
}

/** 在队某一态的底表：**不含来源 / 原单类型 / 风险等级三维**（那三个筛选项的数字要靠它算） */
function openBase(v: 'unassigned' | 'assigning') {
  const all = v === 'unassigned' ? reportStore.unassignedQueue : reportStore.assigningQueue;
  return all.filter(isPoolRow);
}

/** 待领取：还没人领的那一批，客诉专员在这里自领 */
const reportUnassignedRows = computed(
  () => sortBySource(bySource(inGroup(openBase('unassigned'))), (a, b) => a.at.localeCompare(b.at)),
);
/** 已领取：已被人领走、等结论 */
const reportAssigningRows = computed(
  () => sortBySource(bySource(inGroup(openBase('assigning'))), (a, b) => a.at.localeCompare(b.at)),
);

/*
 * 🔴 **「仅今日」这个开关已整个删掉**（2026-10-09 裁决，业务原话
 * 「分母是 已判里面的全部数据呀，与时间无关」）。
 *
 * 【它原先是什么】`assessedTodayOnly = ref(true)`，给 `assessedBase` 按自然日收窄第三段
 * （出过结论的行）。当初（2026-09-09）设它是为了跟上方「评估决策」两枚按自然日算的卡对齐。
 * 【为什么现在非删不可】那两枚卡连同整块「评估处置」统计早已撤掉（2026-10-07 裁决），
 * 而筛选区整块改成上沿筛选项之后，**界面上再没有任何控件能关掉它** ——
 * 只剩页头四枚卡下钻时偷偷置 `false`。于是同一张表有两个口径：从页头进是全量、
 * 从别处进只剩今天；五个筛选项的「全部（N）」还都走这张被时间筛过的底表。
 * ⇒ 这一段现在**与时间无关**，`assessedBase` 只做"是不是池行"这一道。
 *
 * ⚠️ `todayPrefix` **保留**：它另有六处消费端（扫库记录是否今日、页头那几个"今日"计数）。
 * ⚠️ `concludedAtOf` **保留**：第三段仍按结论时刻倒序排。
 * ⚠️ **报备池那一侧自己的 `assessedTodayOnly`**（`RiskReportPoolPanel`，默认关、有勾选框）
 * 与本页无关，一个字没动。
 */
function todayPrefix() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 一条已处理条目的**结论时刻**。
 *
 * 🔴 **三种收口方式各写各的字段**：走评估的落 `assessment`（升级 / 不升级）、
 * 走协同处理的落 `coordination`（投诉单那一路，处理意见 + 建议事项）、
 * 走核实打标的落 `verify`。只读 `assessment` 的话，**协同过的条目会整条从"仅今日"里被筛掉**。
 * ⚠️ 原先与它成对的 `concludedByOf` / `concludedByRoleOf` 只喂「已结论」专表的「评估人」
 * 那一格，那张表已整张删（2026-10-08 裁决：工作面只管处置、不兼做台账，那三项去左栏「已判」看），
 * 两个函数随之删掉。
 */
function concludedAtOf(r: RiskPoolItem) {
  return r.assessment?.at ?? r.coordination?.at ?? r.verify?.at ?? '';
}

/**
 * 已结论底表：**出过结论的池行，全量、与时间无关**（2026-10-09 裁决）。
 * 🔴 **这里一道筛都不做**：
 *   · 时间 —— 「仅今日」已删（见上方那段）；
 *   · 结论 —— 它 2026-10-08 并成了与来源 / 工单类型 / 风险等级同层的第四维，
 *     统一由 `byPoolAttrs` 过。两处都过的话同一个条件过两遍，
 *     且「结论」那个筛选项自己的计数会被自己筛掉。
 */
const assessedBase = computed(() => reportStore.assessedList.filter(isPoolRow));

/** 已结论列表：结论时刻倒序；四维筛选是视图内条件 */
const reportAssessedRows = computed(
  // 已评估这批的默认次序是**评估时刻倒序**，与在队两态的"提交时刻正序"不是一回事，
  // 故 tie 单独给一份：套用队列那份会让刚评完的一条排到列表末尾去。
  () => sortBySource(
    bySource(inGroup(assessedBase.value)),
    (a, b) => concludedAtOf(b).localeCompare(concludedAtOf(a)),
  ),
);

/* ---- A 线池行的几个计数：一并收窄到 A 线 ∧ 原单在办 ∧ 当前班组（口径与 store 那几个 count 逐条对齐，差别就是多出来的这三道）---- */
//
// 🔴 **不收窄的话这一屏当场自相矛盾**：一处写「待评估总数 8」、另一处写「待领取 3 · 已领取 2」，
// 点下去落到的还是同一张表。同屏同一件事只能有一个数，这是本文件反复踩过的那个坑。
//
// 🔴 **原先这里有一串只服务筛选区那几排 chip 的计数**（`alineUnassignedCount` /
// `alineAssigningCount` / `alineOpenCount` / `alineStageAllCount` / `alineOverdueCount`
// 随「处置阶段」整排删；`alineAssessedList` / `alineConcludedBase` /
// `alineConcludedTodayCount` / `alineDecisionCounts` 随「结论」那一排删）。
// **五维全部改成了上沿工具条里的筛选项**，各项的数一律走 `byPoolAttrs` 那一套
// "摘掉自己这一维再算"（见 `reportSourceBase` 一组），本段不再留第二份计数。
// ⚠️ 连带消失的是 `待领取 + 已领取 + 已结论 ＝ 不限阶段 ＝ 表行数` 这条恒等式：轴没了，等式
// 无处可对。**页头那三条（实时监控 + 重点工单 ＝ 待判段总数、风险工单四枚 ≡ 左栏已判、
// ΣP0..P3 ＝ Σ五类）与本改动无关，照旧成立。**
//
// 🔴 **班组这一道（`inGroup`）与表身走同一个判据，少了它说的就是假话**：清单上沿那个班组
// 单选横跨本页每一档，表身三段各自都过了 `inGroup`（见 `reportUnassignedRows` /
// `reportAssigningRows` / `reportAssessedRows`）。只过 `isALine` 不过班组的话，切到「受理一组」
// 之后它仍写着全量、而它下面那张表只躺着这个组的几行 —— 另外四维（来源 / 原单类型 /
// 风险等级 / 结论，走 `inGroup(reportGroupBase)`）早就跟着班组收窄了，唯独这一处没跟。
// **复用 `inGroup`、不要另造一份按组反查**：组名由 `groupNameOf` 反查工单库，本页只有那一个口径。
/**
 * 这一条是**哪一种收口**；null ＝ 只补过打标、还没给出结论（也就是还在队里的那两段）。
 *
 * 🔴 **只补过打标、还没给结论的池行（只有 `verify`、没有 `assessment` / `coordination`）
 * 返回 null —— 它不属于任何一种收口。这是有意为之，不是漏了一种。**
 * 【为什么】`verify` 是打标反向派生出来的只读投影（见 `stores/riskQueue.ts`），
 * 它答的是"这条**成不成立**"，不是"这条**怎么收口**"。一条补完打标就停在那儿的行，
 * 还等着人给升级 / 不升级 / 协同 —— 把它算成一种收口，等于说这条已经处理完了。
 *
 * 🔴 **「结论」那个筛选项的判据就是它**（见 `byPoolAttrs` 与 `decisionCountInView`）：
 * 三个取值 升级 / 不升级 / 风险处理建议 **不覆盖整张表** —— 在队那两段的行一律返回 null，
 * 不属于其中任何一个。故 `三项之和 < 那一枚「全部（N）」`，**这是构造上的事实，不是对不上账**。
 * 归一化后再比：B 线的种子与它自己那份缓存里仍有旧词「接管」，直接比字面量的话，
 * 那一条在「升级」筛选下会凭空消失（见 `riskShared.normalizeDecision`）。
 */
function decisionKindOf(r: RiskPoolItem): DecisionKey | null {
  if (r.assessment) return normalizeDecision(r.assessment.decision);
  if (r.coordination) return COORD_DECISION;
  return null;
}

/**
 * 班组筛选项那一枚的底表 ＝ 当前表在**除班组之外**的全部条件下的行。
 * 摘出班组的道理与下面摘出来源的完全一样，见 `reportSourceBase`。
 *
 * 🔴 **恒为三段之和**：「处置阶段」那一轴已随 2026-10-08 裁决删除，这张表不再按档分组，
 * 故这里也不再分叉。与 `reportAllRows` 同进同退：只改一处的话，表里躺着 3 行、
 * 上沿那几格却写着「班组 全部（7）／来源 全部（7）」，筛选项当场变成同屏的第二个数。
 */
const reportGroupBase = computed(() => [
  ...openBase('unassigned'),
  ...openBase('assigning'),
  ...assessedBase.value,
]);

/**
 * 来源筛选项那一枚的底表 ＝ 当前表在**除来源之外**的全部条件下的行。
 * 【为什么要把来源摘出去】让来源筛选影响自己那一枚的数字，选中「重点工单」之后
 * 其余几项全变 0，人再也看不出该切到哪一项——筛选器把自己筛没了。
 * 班组不摘：它是**另一层**筛选，选了组之后来源那一枚本就该只数这个组里的条目。
 */
const reportSourceBase = computed(() => byPoolAttrs(inGroup(reportGroupBase.value), 'source'));
function sourceCountInView(s: MonitorSource) {
  return reportSourceBase.value.filter((r) => r.source === s).length;
}
/** 工单类型筛选项那一枚的底表（摘掉工单类型这一维） */
const reportTypeBase = computed(() => byPoolAttrs(inGroup(reportGroupBase.value), 'type'));
function ticketTypeCountInView(k: string) {
  return reportTypeBase.value.filter((r) => poolTicketTypeOf(r) === k).length;
}
/** 风险等级筛选项那一枚的底表（摘掉风险等级这一维） */
const reportLevelBase = computed(() => byPoolAttrs(inGroup(reportGroupBase.value), 'level'));
function poolLevelCountInView(lv: RiskLevel) {
  return reportLevelBase.value.filter((r) => r.tag?.result === lv).length;
}
/**
 * 结论筛选项那一枚的底表（摘掉结论这一维）。
 * 🔴 **三个取值之和 < 那一枚「全部（N）」**，与另三维不同：在队那两段的行没有结论
 * （`decisionKindOf` 返回 null），不属于任何一个取值。「全部（N）」里的 N 是
 * **不按这一维收窄时表里有多少行**，与标签逐字相符；别拿三项去加它。
 */
const reportDecisionBase = computed(() => byPoolAttrs(inGroup(reportGroupBase.value), 'decision'));
function decisionCountInView(k: DecisionKey) {
  return reportDecisionBase.value.filter((r) => decisionKindOf(r) === k).length;
}
/**
 * 空态里复述**当前生效的那几个筛选值**。
 * 🔴 **不能只点名其中一个**：五维并排摆着，筛空了往往是几维叠出来的 ——
 * 只写「不升级」会让人去摘那一个，摘完还是空的（真正把它筛空的是同时开着的「高危」）。
 * 界面词与筛选项上的取值逐字相同，摘哪一个一目了然。
 */
const poolNarrowedText = computed(() => [
  groupFilter.value,
  sourceFilter.value,
  // 工单类型是多选：选了几个就并排写几个，一个没选 ＝ 这一维没收窄
  ...poolTicketTypeFilter.value,
  poolLevelFilter.value === 'all' ? 'all' : riskLevelText(poolLevelFilter.value),
  decisionFilter.value === COORD_DECISION ? '风险处理建议' : decisionFilter.value,
].filter((v) => v !== 'all').join(' · '));

/**
 * 工作面那张表 ＝ 三段**按时间序首尾相接**，不重排、**恒摆全部条目**。
 * 🔴 顺序即时间序（待领取 → 已领取 → 已结论）：这三个取值之间有先后，混排成一坨会把它抹掉。
 *
 * 🔴 **三段恒接满**：原先第三段在开着「超时未评」时整段不接，那枚 chip 已随「处置阶段」
 * 整排删除（2026-10-08 裁决），这里不再分叉。
 * ⚠️ **池内阶段在界面上现在只分"出过结论没有"两档**（2026-10-09 裁决：领取整套撤掉）——
 * 「操作」列未出结论的摆一枚「风险管控」、已结论写「—」。待领取 / 已领取两态仍在落库里，
 * 界面不再据此分岔。
 */
const reportAllRows = computed(() => [
  ...reportUnassignedRows.value,
  ...reportAssigningRows.value,
  ...reportAssessedRows.value,
]);

//
// 🔴 **左栏那条「按处置阶段」的轴已不存在了**（2026-10-07 裁决：领取逻辑未闭环，
// 且与本工作面这张池行表的「处置阶段」列重复）。本文件曾为它先后留下两段墓碑注释
// （`poolStageTotal` / `poolStageCounts` 那一对，和后来同源重做的 `pooledStageCount`），
// 两段一并收口到这里：**池内阶段只在这张池行表上看**，左栏不再有第二处。
// 当年那对函数之所以必须废掉，原因仍然成立、且值得记着：它们数的是本工作面的池行
// （`RiskPoolItem`），而左栏两个轴数的是监控条目（`RiskQueueEntry`）——
// 同一批单、不同对象，列跟着不同，且「已结论」那一份带着「仅今日」的默认收窄会让合计随日期漂。
//
/**
 * 工作面那张表的行 ＝ `reportAllRows`，**恒等**。
 * 🔴 **原先这里按 `reportView` 分五支**（不限阶段 / 待领取 + 已领取 / 待领取 / 已领取 / 已结论），
 * 另有一张「已结论」专表与它配套。「处置阶段」整排 chip、那张专表与 `reportView` 本身
 * 已随 2026-10-08 裁决一并删除，这里收成一条直路。
 * 一并删掉的是 `reportOpenRows`（`open` 档专用）、`setReportView`、`setPoolStage`、
 * `poolStageChipOn` —— 它们的消费端全在那一排上。
 */
const reportRows = computed(() => reportAllRows.value);

/**
 * 页头「风险工单」块的卡片下钻：先把工作面上的五维筛选（班组 / 来源 / 工单类型 /
 * 风险等级 / 结论）放回「全部」，再切到工作面。卡上的数不跟这几维筛选，
 * 不清的话下钻后表行数 ≠ 卡上的数。只在点卡片时清；进了工作面之后照常收窄。
 * ⚠️ 工单类型是多选，它的"全部"＝ **清空选择**（空数组），不是写 `'all'`。
 * ⚠️ 班组筛选是本页一份共享状态（左栏各档也按它收窄），故点卡片后左栏角标同样回到全部班组口径。
 * ⚠️ **不再接视图参数**：工作面只有一张恒摆全部条目的表（见 `reportRows`）。
 */
function drillReport() {
  groupFilter.value = 'all';
  sourceFilter.value = 'all';
  poolTicketTypeFilter.value = [];
  poolLevelFilter.value = 'all';
  decisionFilter.value = 'all';
  setListView('report');
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
// 否则「第 3 页 → 换一个班组」会停在一张恰好没有行的页上。
watch([decisionFilter, sourceFilter, poolTicketTypeFilter, poolLevelFilter, sourceSort, groupFilter], () => {
  reportPageCurrent.value = 1;
});

/*
 * 🔴 **`waitedText` 已删**（2026-10-09）：等待时长整套撤出本工作面（业务：那是风险报备池
 * 的逻辑），它唯一的消费端 `rowWaitedText` 随之删掉，grep 复验零调用方。
 * ⚠️ 报备池与工单页「风险报备」Tab 各有自己那一份同名函数，照旧在用；
 * store 的 `waitedMinutes` 也一个字没动。
 */

// ---- 评估弹窗（§5.4）----
const assessOpen = ref(false);
const assessTarget = ref<RiskPoolItem | null>(null);
const assessDecision = ref<AssessDecision | ''>('');
const assessTried = ref(false);
/**
 * 评估弹窗的**风险等级段**（2026-09-29「风险管控」弹窗全站统一）。
 * 此前本弹窗只有评估决策，而同名弹窗在标记那三处都有这一段 —— 同一个弹窗名两种内容。
 * 与工单工作台风险报备池那一处共用 `useRiskLevelFields` / `RiskLevelFields`：
 * 落库走 `recordTagFor` 那条与标记同一的入口（写工单级等级、条目进风险工单池）。
 */
const assessLevel = useRiskLevelFields();

/**
 * 「投诉工单专属字段」段落（投诉一类 / 二类 / 升级说明三项）：状态与校验走共享
 * composable、渲染走共享组件 `EscalateComplaintFields`，与工单页底栏、风险报备池两个评估入口
 * **同一份实现**。整段显隐同样是共享的 `showEscalateComplaintFields`，本页不自判一遍。
 */
const escalateFields = useEscalateComplaintFields();

/**
 * 结论正文那一格。值存在 `escalateFields.fields.advice` 上，本 ref 只是个读写代理：
 * 选「升级」时这一格由段内的「升级说明」渲染，其余情形由本弹窗自己那格「处理意见」渲染，
 * 两处写的是同一个格子 —— 切换决策不丢字，提交路径照常从 `assessAdvice` 取值。
 */
const assessAdvice = computed({
  get: () => escalateFields.fields.advice,
  set: (v: string) => { escalateFields.fields.advice = v; },
});

const missAssessDecision = computed(() => assessTried.value && !assessDecision.value);
const missAssessAdvice = computed(() => assessTried.value && !assessAdvice.value.trim());
const assessValid = computed(() => !!assessDecision.value && !!assessAdvice.value.trim());

/** 二选一决策各自必填文本的标签 */
const assessAdviceLabel = computed(() =>
  assessDecision.value === '升级' ? '升级说明' : '处理意见',
);
const assessAdvicePlaceholder = computed(() => {
  switch (assessDecision.value) {
    case '不升级': return '告知报备人为什么不升级、可以怎么继续处理…';
    case '升级': return '写清升级理由与后续处置安排…';
    default: return '';
  }
});

/** 弹窗主按钮：决策＝升级 →「确认升级」，未选或「不升级」→「提交结论」（三处评估弹窗一致） */
const assessOkText = computed(() => (assessDecision.value === '升级' ? '确认升级' : '提交结论'));

/** 整段的显隐判据同样是共享的 `showEscalateComplaintFields`，本页不自判一遍 */
const showEscalateFields = computed(() =>
  showEscalateComplaintFields(assessDecision.value, assessTarget.value?.ticketNo),
);

/* ============ 「风险管控」弹窗（已判段条目表那一枚）下半的「风险处理措施」段 ============ */
//
// 已有结论的条目再打开时，标记人可以在**同一次提交**里把评估结论一起给掉（升级 / 不升级），
// 条目**直接落「已结论」**；段留空就照旧只改标记。
//
// 🔴 **只在条目弹窗的已判段入口上**（2026-10-07 裁决，见 `showEntryTagAssess` 的第一道门）：
//   · 待判段的那两枚叫「风险识别」—— 只做识别，没有这一段；
//   · 命中明细那两枚叫「风险识别」/「重新识别」—— 答的是"监控识别准不准"，同样没有这一段；
//   · **两枚「批量识别」弹窗（条目那一路 / 命中那一路）一字不动** —— 批量里一屏几十条各有各的原单类型与条目
//     状态，一个共用的结论落不到它们头上。
//
// 【为什么条目弹窗与评估弹窗**共用上面那一份 `escalateFields` 实例**，而不是各建一份】
// 两个弹窗各有自己的 open ref，但**永不同时开着**：都由清单的行内动作打开、都是带遮罩的
// `OpActionModal`，弹窗内部没有任何入口能打开另一个（条目清单在段内都是只读的）。
// 而两个入口的 `openXxx` 各自 `reset()` 一次（reset 连红字一并清），于是同一份实例在任一
// 弹窗打开的那一刻都是干净的。再建第二份实例，等于把这个共享 composable 存在的理由
// （字段、级联、校验只此一份）在同一个文件里推翻一次。
// 结论正文那一格同理走上面那个 `assessAdvice` 代理 —— 两处写的是同一个格子。

/**
 * 这一段的**权限门**：出结论只归**客诉专员与管理员**（`canClaim`，即全站共享的
 * `canClaimRiskReport`）。
 *
 * 🔴 **投诉督导不在其中**：他有打标权（`RISK_TAG_ROLES` 含他），但在风险评估那一侧是
 * **只读**（PRD §4.2 / §4.3；池内可见但不出动作，见 `canClaim` 的说明）。
 * 少了这道门，他就能从打标弹窗**绕开评估权限**出结论 —— 那是同一份权限在两个入口上
 * 各说一套。判据直接取池内领取 / 评估那一份 `canClaim`，本段不另立一份角色表。
 */
const canAssessOnTag = computed(() => canClaim.value);

/**
 * 本次打标的结论会落到**哪一条条目**上。
 *
 * 优先取这张单**已在池里**的那一条；没有的话取还在**实时监控**的那一条。
 * 两者都没有（打标判了无风险、或这张单根本没有 A 线条目）时返回 null，**整段不出**：
 * 没有承载体的结论落不了库，摆一段出来只会让人白填。
 */
function tagAssessEntryOf(ticketNo: string | undefined): RiskQueueEntry | null {
  if (!ticketNo) return null;
  const es = riskQueue.entriesOf(ticketNo);
  return es.find((e) => isPooledStatus(e.status))
    ?? es.find((e) => e.status === '实时监控中')
    ?? null;
}

/**
 * 下半整块出不出的**两道与单类型无关的门**（任一不过整块不出；不出即不参与校验，
 * 提交＝只打标，原行为）：
 *   ① **打标结论本身要"有风险"** —— 即本次选的是高 / 中 / 低。选「无风险」整段不出。
 *   ② **有一条承载结论 / 协同记录的条目** —— 没有承载体时结论落不了库。
 *   ③ **当前用户有出结论的权** —— 见 `canAssessOnTag`（投诉督导只读，不在其中）。
 *
 * 🔴 **「这条条目还没出过结论」那一道门已经整个取消**（2026-10-07 裁决）：
 * 两支现在都可多次提交 ——
 *   · 投诉支本来就可多次（§4.5 次数行：首次协同把条目转「已结论」，再次协同只追加记录、
 *     状态不变，判据在 `riskPool.coordinate` 里）；
 *   · 评估支这一轮跟上：**已出结论的非投诉单可以重新给结论**，推翻 §9 规则 22
 *     「提交即固化、不可修改」——"刚开始风险可控、判不升级，后来风险增大就得改成升级"，
 *     管控手段必须跟着风险走。
 * 故「风险管控」弹窗**一律出**下半那一段，不分未出结论 / 已出结论。
 */
function tagLowerHalfOpenFor(entry: RiskQueueEntry | null, hasRisk: boolean): boolean {
  if (!hasRisk || !canAssessOnTag.value) return false;
  return !!entry;
}

/**
 * 下半走**评估结论**那一支：上面两道门 + **原单不是投诉单**
 * —— 投诉单不做风险评估，它走协同处理那一支（与底部说明同一口径）。
 *
 * 🔴 **不判「已评估」**（2026-10-07 裁决取消了那道门）：已出结论的非投诉单条目再次进来
 * 照样出这一段，且打开时把现行结论灌回来（见 `openEntryTag`）。两支互斥（投诉 / 非投诉），
 * 并集就等于"下半出不出" —— 本页的「风险管控」弹窗恒有一支下半。
 */
function showTagAssessFor(entry: RiskQueueEntry | null, hasRisk: boolean): boolean {
  return tagLowerHalfOpenFor(entry, hasRisk) && !isComplaintTicket(entry!.ticketNo);
}

/**
 * 下半走**协同处理**那一支：上面两道门 + **原单是投诉单**。
 * 🔴 **不判「已评估」**：协同可多次（§4.5），已结论的投诉单条目再次进来照样出这一段，
 * 落库仍走共享件 `submitTo`。这一支本轮**一格未动**。
 */
function showTagCollabFor(entry: RiskQueueEntry | null, hasRisk: boolean): boolean {
  return tagLowerHalfOpenFor(entry, hasRisk) && isComplaintTicket(entry!.ticketNo);
}

/**
 * 段内必填项的校验，与评估路径同一套：
 * 会派生新投诉单时整段交给共享的 `escalateFields.validate()`（投诉一类 / 二类 / 升级说明
 * 三项各自出红字）；其余情形只校验「处理意见」那一格。
 * 🔴 **决策留空时调用方根本不调它** —— 留空＝不评估，整段不参与校验。
 */
function tagAssessFieldsOk(escalate: boolean): boolean {
  return escalate ? escalateFields.validate() : !!assessAdvice.value.trim();
}

/**
 * 段内给了结论时的落库 —— **与评估路径同一个派生入口、同一个结论写口**，不另造一条。
 *
 * 🔴 **在打标那一步写完之后才调**：条目正是被那一步送进池的，
 * 本函数按单号重取它、确认真的在池里，再落结论。
 *
 * 落的三件与评估弹窗逐字相同：① 选「升级」且原单不是投诉单 → `deriveEscalatedComplaint`
 * （造新单 + 记原单升级台账 + 新单问题描述＝原单问题描述 ＋ 空行 ＋ 升级说明 +
 * 投诉一类 / 二类写到新单 + 新单回流实时监控）；② 条目落「已结论」，**结论人＝标记人、
 * 结论时刻＝本次提交时刻**（`assessOnTag`）；③ 第八类履历与 `risk.report.assessed` 通知
 * 由 `assessOnTag` 内部与评估路径共用的那一份实现落，不另造事件。
 *
 * 🔴 **派生门：一条条目最多派生一张投诉单**（2026-10-07 裁决的必要推论）。
 * 结论可以重提，而"升级"那一支**会造一张真单**——照旧无条件取号造单的话，
 * 同一条条目重提三次就有三张投诉单，这是本轮最严重的失败模式。
 * 判据取 `entry.assessment.escalatedToNo`（派生这件事的**既有真源**，不新造字段）：
 *   · 没派生过 → 照旧取号 + 造单（**首次**）；
 *   · **已派生过 → 一个号都不取、一张单都不造**，只把上一次那个号**原样带下去**
 *     （它得留在结论上，否则重提一次就把"本单派生过谁"抹掉了，池行的单号 chip
 *     与下一次的这道门一起失效）。履历那边靠号变没变认"这一次是不是真派生了"，
 *     见 `riskPool.applyAssessment` 的 `derivedNow`。
 * 界面侧同源：已派生过的条目，决策锁在「升级」、「不升级」置灰（见 `entryTagNoDowngradeTip`）。
 *
 * 返回接在打标提示后面的那半句；落不了库时返回空串（此时一个字都没写，打标那一句照旧成立）。
 */
function commitTagAssess(ticketNo: string, decision: AssessDecision): string {
  const entry = tagAssessEntryOf(ticketNo);
  if (!entry || !isPooledStatus(entry.status)) return '';
  const derivedNo = entry.assessment?.escalatedToNo;
  const escalate = decision === '升级';
  // 已派生过的条目决策只能是「升级」（界面已置灰「不升级」）。真走到这儿就是哪条门漏了，
  // 宁可一个字都不写：改回不升级意味着那张已经存在的投诉单无人认领
  if (derivedNo && !escalate) { message.warning(entryTagNoDowngradeTip.value); return ''; }
  // 投诉单不派生（段对投诉单本就不出，这一判据只为与评估路径逐字同形）
  const firstDerive = !derivedNo && escalate && !isComplaintTicket(ticketNo);
  const escalatedToNo = derivedNo ?? (firstDerive ? nextEscalatedNo() : undefined);
  if (firstDerive && escalatedToNo) {
    deriveEscalatedComplaint({
      fromNo: ticketNo,
      no: escalatedToNo,
      assignee: user.name,
      reason: assessAdvice.value.trim(),
      complaint: escalateFields.payload(),
    });
  }
  const ok = reportStore.assessOnTag(entry.id, {
    decision,
    advice: assessAdvice.value.trim(),
    ...(escalatedToNo ? { escalatedToNo } : {}),
    by: user.name,
    byRole: user.role.name,
    at: nowStamp(),
  });
  if (!ok) return '';
  if (firstDerive && escalatedToNo) return `并直接给出结论：升级，已派生投诉单 ${escalatedToNo}`;
  if (derivedNo) return `并更新结论：升级（投诉单 ${derivedNo} 已派生，未重复派生）`;
  return escalate ? '并直接给出结论：升级' : '并直接给出结论：不升级';
}

function openAssess(r: RiskPoolItem) {
  // 🔴 门禁与按钮同一个判据（`canAssessRow`：角色 + 未出结论），按钮本就只对它渲染，
  // 这道是兜底。**原先这里拦的是"还没有人领取"** —— 领取整套已撤（2026-10-09 裁决），
  // 那句提示会让人去找一个不存在的「领取」按钮。
  if (!canAssessRow(r)) { message.warning('本条已有评估结论，或你没有风险评估权'); return; }
  assessTarget.value = r;
  assessDecision.value = '';
  assessTried.value = false;
  // 结论正文（升级说明 / 处理意见）与投诉一类 / 二类同在 escalateFields，reset 一次清完
  escalateFields.reset();
  // 风险等级段：把现行等级灌回这张单（没有就留空并转必填），见 useRiskLevelFields.reset
  assessLevel.reset(r.ticketNo);
  assessOpen.value = true;
}

// ---- 本工作面的动作权 ----
//
// 🔴 **「领取」整套已从本工作面撤掉**（2026-10-09 裁决，业务原话「等待时长、领取、释放是
// 风险报备池的逻辑，你这是搞混了吧」）：`doClaim` 连同它的提示、跳转一并删净 ——
// 行内「领取」按钮一走，它就没有任何入口了（grep 复验过零调用方）。
// ⚠️ **store 侧 `riskPool.claim` 一个字没动**：风险报备池（`RiskReportPoolPanel`）与
// 工单页头「风险管控」（`OpRiskControlModal`）都还在调它，那两处各自的领取态照旧。
// 🔴 **分派 / 改派 / 批量分派**更早一轮（业务第三轮拍板）已整套取消，留痕在此。
//
// 【为什么投诉督导仍看得见这张表】他要看的是"队列有没有堆起来"——那是督导的活；
// 而"这一条谁去判"不经他手。看得见、点不动，正是这条口径在界面上的样子。

/**
 * 本页这几处动作的**角色门**：客诉专员 + 三个管理员 scope（v1.24 拍板
 * 「领取 / 风险评估 / 协同处理三件事客诉专员与管理员同权」）。
 *
 * 🔴 **判据取全站那一份 `canClaimRiskReport`**（`views/tickets/types/ticket.ts`，
 * 内里是 `REPORT_POOL_ACT_ROLES`），**本页不再自带一份同值的角色数组**：
 * 原先这里有个四元素的 `REPORT_CLAIM_ROLES`，与那一份逐字相同 ——
 * 本仓已经为"同值常量分家"付过账（见 `config/roles.ts` 管理员那段：两处取值一样、
 * 入口却只按其中一处给，"动作给了、入口没给，自相矛盾"）。换源是**零行为变化**。
 * ⚠️ **不要改用 `canTagRiskOnTicketPage`**（那一份只含客诉专员、没有管理员，还掺着
 * 工单类型与来源两维）；也**不是 `canReleaseAnyRiskReport`**（那只是管理员兜底释放）。
 *
 * 消费端三处：`canAssessRow`（工作面评估）· `canAssessOnTag`（打标弹窗里出不出结论段）·
 * 模板里投诉单那一支的「风险管控」（协同处理）。
 */
const canClaim = computed(() => canClaimRiskReport(user.roleKey));

/**
 * 这一条能不能由**当前登录的人**在工作面上给结论 —— **按角色**（2026-10-09 裁决）。
 *
 * 🔴 **原先是"本人名下的「已领取」态"**（`r.status === '评估中' && r.assignee === user.name`，
 * PRD §5.4 / §9 规则 22 的领取门）。业务判「等待时长、领取、释放是风险报备池的逻辑，
 * 你这是搞混了吧」，领取在本工作面整套撤掉 —— 那道门的前提（有人领过、落款写的是他的名字）
 * 随之不成立，留着等于**谁都评不了**（没人领过，恒 false）。
 * ⇒ 改成：**有风险评估权的角色对尚未出结论的条目都能评**。
 *
 * 🔴 **角色判据取仓里现成那一份、不另写**：`canClaim` ＝ 全站共享的
 * `canClaimRiskReport`（客诉专员 + 三个管理员 scope），正是 v1.24 拍板的
 * 「领取 / 风险评估 / 协同处理三件事客诉专员与管理员同权」那一份
 * （见 `config/roles.ts` 管理员那段的说明）。投诉督导不在其中 ——
 * 他在池子里**可见但不出动作**，这一条口径一个字没改。
 *
 * 🔴 **状态这一道还在、只换了判据**：只收**进了池、还没出结论**的那两态（待分派 / 评估中），
 * 与 store 侧 `assessOnTag` 的门禁（`isPooledStatus` + 本页这道"未出结论"）对齐。
 * 已出结论的行在模板里走另一支、写「—」。
 *
 * ⚠️ **并发不靠这道门接**：撤掉领取之后两个客诉专员可能同时打开同一条，
 * 拦在**提交前重查**那一处（`workbenchAssessBlockOf`：已出结论 ⇒ 整次提交拦下）。
 */
function canAssessRow(r: RiskPoolItem) {
  return canClaim.value && (r.status === '待分派' || r.status === '评估中');
}

/**
 * 工作面这一处**提交结论前的重查**（§5.6 校验末两条 / §9 规则 29）。
 *
 * 🔴 **并发拦截的判据 2026-10-09 换了一条**：原先走共享的 `assessSubmitBlockOf`，
 * 它要的是「条目仍为本人名下的「已领取」态」—— 领取撤掉之后那一条恒不成立，
 * 每一次提交都会被拦成"本条已不在你名下的「已领取」态"。
 * ⇒ 换成 **「该条目已出结论 ⇒ 整次提交拦下」**：领取原本同时起"占住这条、
 * 别人看得见承办人"的作用，撤掉之后两个客诉专员可能同时评同一条，这一道替它接住并发。
 *
 * 🔴 **只换本页工作面这一处**：报备池与工单页头那两个评估入口各自的领取态还在，
 * 它们照旧走共享的 `assessSubmitBlockOf`，**一个字没动**。
 * 🔴 **其余三条判据仍取共享那一份实现**（`tagAssessSubmitBlockOf`：条目还在不在 /
 * 已被报备人撤回 / 原单已进终态只拦「升级」），本页不另写一遍。
 */
function workbenchAssessBlockOf(
  r: RiskPoolItem,
  decision: AssessDecision | '',
): { tip: string; closeModal: boolean } {
  // 🔴 读 store 里的**现值**：弹窗手上那份 `assessTarget` 是打开那一刻的引用
  const cur = reportStore.findById(r.id);
  // 🔴 提示语取共享那一份常量，**不在本页抄一句**（同值常量分家必漂，本仓付过账）
  if (cur && cur.status === '已评估') {
    return { tip: ASSESS_ALREADY_CONCLUDED_TIP, closeModal: true };
  }
  return tagAssessSubmitBlockOf(r.id, decision, r.ticketNo);
}

/*
 * 🔴 **「释放」整套已从本工作面撤掉**（2026-10-09 裁决，与「领取」同一条：
 * 等待时长 / 领取 / 释放归风险报备池）。随行内那枚按钮一并删净的有：
 * `canReleaseAny`（＋顶部 `canReleaseAnyRiskReport` 那一笔 import）、`canReleaseRow`、
 * `releaseOpen` / `releaseTarget` / `releaseReason` / `releaseTried` / `missReleaseReason`、
 * `openRelease` / `confirmRelease`、释放弹窗整块与 `.rm-release` 一族样式 ——
 * 删前逐个 grep 复验过：按钮一走，本文件里它们再无任何调用方。
 *
 * ⚠️ **释放这件事本身没消失，只是不在这张表上**：
 *   · **风险报备池**（`RiskReportPoolPanel`）那一摊一个字没动 —— 它自己的
 *     `canReleaseAnyRiskReport` / 释放按钮 / 释放弹窗 / 承办人列 / 「已等待」列全在；
 *   · store 侧 `riskPool.release`、条目上的 `releases` 留痕、`RiskReleaseRecord`
 *     同样一个字没动，报备池与工单页那几处仍在读写；
 *   · **释放记录**在本页照旧看得见：评估弹窗第一区块（与工单页 `OpRiskControlModal`
 *     共用的 `RiskAssessSheet`）会把 `releases` 逐条列出来。
 */

/* ---- 协同处理：**投诉单那一路的工作面**（《【930】》§5.2 / §5C，基线 ※29）---- */

/**
 * 🔴 **池行按原单类型分工作面**：非投诉单 → 风险评估（升级 / 不升级）；
 * 投诉单 → **协同处理**（处理意见 + 建议事项）。
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
  // 本单已进终态时拦下（§5C.2），与工单页底栏那条路同一口径；终态判据与评估入口共用
  if (isRiskTicketEnded(r.ticketNo)) {
    message.warning('本单已结束，无法协同处理');
    return;
  }
  collabTarget.value = r;
  collabOpen.value = true;
}

/**
 * 评估弹窗的**副标题 ＝ 来源 · 单号**（与工单页页头「风险管控」弹窗逐字同形）。
 * 来源取条目自带的身份标 `source`（实时监控 / 重点工单 / 二线报备），不另造词；
 * 取不到条目时给空串，`OpActionModal` 的副标题位自动不出。
 *
 * 🔴 弹窗第一区块**按同一个 `source` 分两种**（PRD §5.3.2，判据在 `RiskAssessSheet` 里，
 * 本页不再自判一遍）：
 * · A 线（风险工单池里的条目）→「**入池依据**」：风险等级 / 标记人 / 标记时间 /
 *   风险备注 / 命中原话。这一组就是它被送来评估的全部理由。
 * · B 线（二线报备单）→「**报备信息**」：报备人 / 报备原因 / 风险类型 / 风险描述 / 附件。
 *
 * 【为什么必须分】两条线此前共用一张「报备信息」卡，A 线条目在「报备人」「原因」两格里
 * 显示的是 `riskQueue.autoEntry()` 补的**恒定占位**（系统（系统） / 其他）——A 线全程
 * 没有"报备人"这个角色，条目是系统捞进来的。占位摆在评估人面前，读起来像"有人报过一次
 * 却什么都没填"；而真正的入池理由（打标那一组）反倒缩在卡体里的一个子块。
 */
const assessSubtitle = computed(
  () => (assessTarget.value ? `${assessTarget.value.source} · ${assessTarget.value.ticketNo}` : ''),
);

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
  // 取号规则与工单页那个评估入口共用一份（`nextEscalatedNoOf`）：两处各写一份，
  // 规则一改就分叉，同一天两个入口有可能发出同一个号。
  return nextEscalatedNoOf(reportStore.reports);
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
  // 与 store 的领取 / 释放门控同一个判据（原单类型，查不到时按 `IFLYTS-` 号段兜底）
  return isComplaintPoolTicket(ticketNo);
}

function confirmAssess() {
  assessTried.value = true;
  const target = assessTarget.value;
  if (!target) return;
  /*
   * 会派生新投诉单 → 段内三项（投诉一类 / 二类 / 升级说明）的必填校验**先跑**，缺项的红字
   * 才落得到字段下方。放在 `assessValid` 之后的话，升级说明空着会在那一句直接 return，
   * 而它此时正藏在段内，屏幕上一句红字都不会出。与另外两个评估入口同一份 validate。
   */
  const escalateFieldsOk = !showEscalateFields.value || escalateFields.validate();
  // 风险等级段的校验与上面几项**同批跑**（不短路），缺项的红字才能一屏全出
  const levelOk = assessLevel.validate();
  if (!assessValid.value || !assessDecision.value || !escalateFieldsOk || !levelOk) return;
  // 提交前按 id 回 store 重查（§5.6 / §9 规则 29）：已撤回整次拦下、原单已终态只拦「升级」、
  // 🔴 **已出结论整次拦下** —— 领取撤掉之后这一道接住并发，见 `workbenchAssessBlockOf`
  const block = workbenchAssessBlockOf(target, assessDecision.value);
  if (block.tip) {
    message.warning(block.tip);
    if (block.closeModal) assessOpen.value = false;
    return;
  }

  /*
   * 风险等级先落、评估结论后落（与页头「风险管控」那一支"先上半后下半"同序）。
   * 🔴 被 store 挡下就整次中止：等级没写进去还接着落评估结论，得到的是一条
   * "有结论、没等级"的条目 —— 它在左栏两个轴上一档都归不进去。
   */
  if (!assessLevel.submit()) return;

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
      // 评估弹窗里补齐的投诉一类 / 二类随派生动作写到新单上
      complaint: escalateFields.payload(),
    });
  }

  /*
   * 🔴 **落库口由 `assess` 换成 `assessOnTag`**（2026-10-09，领取撤掉的必然推论）：
   * store 的 `assess` 门禁写死「只收「评估中」」—— 它配的就是"先领取再评估"那一路。
   * 本工作面不再有领取，行一直停在「待分派」，`assess` 会**一声不响地什么都不写**。
   * `assessOnTag` 收的正是"进了池、还没出结论"那两态（待分派 / 评估中），
   * 并把 `assignee` 空着的条目补成结论人 —— 「已结论」的行照旧答得上"谁给的结论"。
   * 🔴 **两条路径的产物逐字相同**（同走 `applyAssessment`：状态迁移 + assessment +
   * 第八类履历 + `risk.report.assessed` 通知），故这不是换了一套落库，是换了那道门。
   * ⚠️ **store 侧 `assess` / `claim` / `release` 一个字没动**：报备池与工单页头那两处还在用。
   */
  const ok = reportStore.assessOnTag(target.id, {
    decision: assessDecision.value,
    advice: assessAdvice.value.trim(),
    // 只有派生这一路有新单号；不派生时不写这个字段，
    // 否则列表那格会渲染出一个点不开的空单号
    ...(escalatedToNo ? { escalatedToNo } : {}),
    by: user.name,
    byRole: user.role.name,
    at: nowStamp(),
  });
  // 走到这里只有一种可能：上面那道重查之后条目又被挪走了。提示与重查那一处同一句
  if (!ok) { message.warning('该条目已不在风险池中，请刷新后再看'); return; }

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
/** 命中明细才需要查询条：只有这批记录会被事后点查 */
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
  /**
   * 手动筛查 · 成功。
   * 🔴 **原先还有 `adopted` / `highAdopted` 两格**（本次执行并入了几条、其中几条高危），
   * 随「并入」这个动作一并删除（2026-10-08 裁决）：筛查只做查询，没有"并入了几条"这件事。
   */
  total?: number;
  fresh?: number;
  /** 实时监控 · 成功 */
  hitCount?: number;
  openCount?: number;
}

const SCAN_RUN_LS_KEY = 'flowos-risk-scan-runs';
/** 种子版本：变更 buildDefaultScanRuns() 时递增，强制刷新演示数据 */
const SCAN_RUN_SEED_VERSION = 5;
const SCAN_RUN_VERSION_KEY = 'flowos-risk-scan-runs-v';

/**
 * 扫库记录的时刻**按"距现在多久"生成**，不写死日历日。
 *
 * 🔴 **页头「扫描批次 / 命中记录」是按自然日切的流量指标**：种子若写死在某个过去的日子，
 * 这两个数就恒为 0，而旁边的「今日发现」走的是相对当下的条目时刻——一屏之内出现
 * 「今日发现 12 · 扫描批次 0 · 命中记录 0」，读起来像"今天没扫过却凭空多了 12 条"。
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
 * 以及「扫出 N · 无命中记录 M」「扫出 N · 全部已有命中记录」两种结果口径。
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
    { id: 'run-seed-07', kind: 'manual', triggerBy: '郑监控', startedAt: scanStamp(170), endedAt: scanStamp(168), status: 'success', filterName: '高危词专项', total: 47, fresh: 3 },
    { id: 'run-seed-08', kind: 'manual', triggerBy: '李文萍', startedAt: scanStamp(320), endedAt: scanStamp(316), status: 'success', total: 128, fresh: 0 },
    { id: 'run-seed-09', kind: 'manual', triggerBy: '秦督导', startedAt: scanStampDaysAgo(1, '13:28:41'), endedAt: scanStampDaysAgo(1, '13:29:06'), status: 'success', total: 2, fresh: 0 },
    { id: 'run-seed-10', kind: 'manual', triggerBy: '孙坐席', startedAt: scanStampDaysAgo(1, '16:20:44'), endedAt: scanStampDaysAgo(1, '16:24:01'), status: 'success', total: 86, fresh: 5 },
    { id: 'run-seed-11', kind: 'manual', triggerBy: '郑监控', startedAt: scanStampDaysAgo(1, '10:15:22'), endedAt: scanStampDaysAgo(1, '10:18:55'), status: 'success', filterName: '教育产线近30天', total: 203, fresh: 7 },
    { id: 'run-seed-12', kind: 'manual', triggerBy: '周坐席', startedAt: scanStampDaysAgo(2, '15:33:08'), endedAt: scanStampDaysAgo(2, '15:35:41'), status: 'success', total: 56, fresh: 3 },
    { id: 'run-seed-13', kind: 'manual', triggerBy: '秦督导', startedAt: scanStampDaysAgo(2, '09:12:18'), endedAt: scanStampDaysAgo(2, '09:14:52'), status: 'success', filterName: '受理一组在办', total: 34, fresh: 2 },
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
/*
 * 🔴 **原先这里有一个 `pendingManualRunId`**（本次手动筛查执行的记录 id）：
 * 点「并入清单」之后要回头把并入条数写回那一条执行记录。并入取消之后没有任何回填，
 * 执行记录在 `doScan` 里一次写完即定稿，故这个游标一并删掉。
 */
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
  // 🔴 后半截**跟着命中表状态列叫「无命中记录」**（2026-10-08 裁定），不再叫「新命中」：
  // 「并入清单」取消之后"新"字已无所指（原指"待并入的那批"），且与左栏「今日发现」的"新"
  // 撞口径；状态列已统一用「无命中记录」，**一个概念不能留两个词**。
  // 🔴 这个数本身保留：扫库记录正是回看"这一次扫出了什么"的地方，它是其中唯一有信息量的一项
  //（区别于已删掉的结果态横幅 —— 横幅与下方清单重复，日志不重复）。
  // 🔴 **两支共用状态列那一套词**（「已有命中记录」↔「无命中记录」），不留第三种说法：
  // 一次扫库的结论只有"有没有记录"这一个维度，多一套措辞就要读的人在两套词之间做换算。
  // 🔴 `fresh = 0` 时**不出计数、改说「全部已有命中记录」**：「无命中记录 0」是个双重否定的数
  //（"没有记录的有 0 条"），读起来得在脑子里绕一圈；正面说"扫出来的这些系统里都已经有记录了"
  // 一眼就读得出。
  // 🔴 这一支原先还要再缀一句「无新增风险」，随本次一并退场：它与「新命中」是同一个病根 ——
  // "新增"仍站在"这一批里哪些是新的"这个已废的视角上，并入取消后"新"已没有所指；
  // 且与前半截同说一件事，两个"无"连着读成了一句话说两遍。
  if (!r.fresh) return `${filterTag}扫出 ${r.total ?? 0} · 全部已有命中记录`;
  return `${filterTag}扫出 ${r.total ?? 0} · 无命中记录 ${r.fresh}`;
}

// ---- 手动批量筛查 ----
// 选范围 + 选词 → 对存量工单跑一遍 → 结果**就在同一张命中清单里**呈现。
//
// 🔴 **它是查询工具，不是入口**（2026-10-08 裁决）：原先结果可以勾选「并入清单」、
// 往「待判 · 实时监控」补条目，这条路径整条取消 —— 「实时监控」那一档恒为**自动扫库**的产出。
// 故结果态只剩"看"与"点进去"：行上工单号可点，落在该工单；看完「退出筛查」。
//
// 【为什么不用侧边抽屉】抽屉把结果放进另一张表，与命中清单割裂——同一批数据两套表头、
// 两套操作。改为沿用工作台的 query-filters 就地筛选条：条件在清单上方展开，
// 结果直接渲染进清单本体，列与交互完全一致。
const scanBarOpen = computed(() => listView.value === 'scan');
const scanning = ref(false);
const scanResult = ref<ScanResultRow[] | null>(null);
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
 *   ① 进命中明细时把查询条复位到默认 30 天窗口，视图内互切则保留已填条件；
 *   ② 离开手动筛查时把**筛查结果态**清掉，见下；
 *   ③ 单工单焦点与条目勾选都不跨页签留存，见下。
 */
function setListView(v: ListView) {
  if (v === 'judged' && listView.value !== 'judged') resetLedgerFilter();
  // 离开手动筛查即退出筛查结果态。
  // scanResult 是清单数据源的最高优先级分支（filteredRows 首行就判 inScanResult），
  // 留着它的话，切到实时监控后表里躺的还是那批筛查行、头上还挂着筛查结果条——
  // 页签写着实时监控，内容却是另一批数据，而且刷新前一直如此。
  // 这与"两套状态机分叉"是同一类错，只是这次分叉在数据源上。
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
    return;
  }
  scanResult.value = runManualScan(scanForm.value, { words: localWords.value });
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
   * 时间留空却是**对全库做一次扫描**——「孩子」那类通用词一扫上百条，
   * 结果页当场被噪音填满，人要找的那一条反而翻不到。
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
    // 模拟扫描耗时，避免开始/结束时刻完全相同
    const elapsed = Math.max(800, Date.now() - t0);
    const endedAt = dayjs(t0 + elapsed).format('YYYY-MM-DD HH:mm:ss');
    appendScanRun({
      id: `run-${Date.now()}`,
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

/**
 * **已有命中记录**的那几行的 id —— 结果里置灰标出，与新扫出来的那批区分开。
 * 🔴 原先它还兼着"不可勾选"那一层（并入时避免同一条记两遍），
 * 勾选与并入取消之后它只剩"标出来"这一个用处。
 */
const scanDupIds = computed(
  () => new Set((scanResult.value ?? []).filter((r) => r.duplicated).map((r) => r.hit.id)),
);

/*
 * 🔴 **原先这里有 `scanPicked` / `scanAllPicked` / `toggleScanPick` / `toggleScanPickAll`
 * 与 `adoptScan`**（勾选结果行 → 「并入清单」→ 补条目 + 并命中 + 回填本次执行的并入条数）。
 * 随 2026-10-08 裁决整组删除：手动筛查只做查询，结果不落库。
 * 结果态因此没有任何写动作，只剩"点工单号进那张单"与「退出筛查」两条出路。
 */

/** 退出筛查结果态，清单回到常规命中 */
function exitScanResult() {
  scanResult.value = null;
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
    // 🔴 空值一律写「全部」（2026-10-09 裁决，与三条筛选条的空值项统一）
    : '全部状态');
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
/*
 * 🔴 **命中记录只有自动链路一个来源**（2026-10-08 裁决：手动筛查取消「并入」）：
 * 原先这里要把"已并入的筛查命中"并进来、并给那几行标一枚「来自手动筛查」的徽标，
 * 两处随并入一并删除。筛查扫出来的行只活在结果态里，不进这份清单。
 */
const allHits = computed(() => wordOnlyRiskHitsOf(scope.value));
const rows = computed(() => allHits.value);

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
 * ⚠️ 第三句并存、管的是另一件事：**标记记录累积、不覆盖**（改判 N 次就有 N + 1 条记录）。
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

// ---- 命中明细查询 ----
// 明细（全部风险词命中记录）最主要的用法是**事后点查**：客户几个月后捅到 12315，
// 要当场答出"当时发现了吗、谁核实的、判成什么"。只能翻不能查，等于答不出来。
//
// 🔴 **本轮底表从"已核实的"放宽成"全部命中"**，页签也随之从「已核实」改名「命中台账」
// （2026-10-07 再改名「命中明细」，现行名以它为准）。
// 【为什么必须放宽】日常工作面已经改成条目漏斗（实时监控页签），命中不再是待办；
// 底表若仍只收已核实的，**待核实的命中在整页里就没有任何入口** ——
// 没人能再核实它们，词表准确率（本页唯一的规则改进回路）会永久停在当前这个数上。
// 放宽之后「待核实」降为查询条里的一个取值，与成立 / 误报同层，行内动作照旧给识别那一枚
// （未核实「风险识别」、已核实「重新识别」）。
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
 * 默认窗口：命中明细是只增不减的永久记录，**不能默认全量**——点查一开始就淹在历史里。
 *
 * 🔴 **从 30 天放宽到 90 天**。原因不是"30 天太短"这种口味问题，而是本轮改名之后
 * 页签角标取的是**命中总数**：命中记录的时刻分布若整段落在窗口外，
 * 屏幕上就会出现「命中明细 22」配一张 0 行的表 —— 正是本文件从头反对的那种
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
 * 命中明细的全部记录（未过筛选）——既是查询底表，也是下拉项的取值来源。
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
    // 时间锚在**命中时刻**而非标记时间：点查问的是"当时有没有发现"
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
 * 命中清单的数据源。它只服务**两个页签**：手动筛查（结果态）与命中明细。
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
// 注意这三种是**数据状态**，不等于页签：三者同在「命中明细」这一批，
// 在查询条里靠核实结果这个筛选项区分；把它们各摆一个视图，正是早先层级错位的由来。
//
// 「判过没有」一律看 isJudged，不看有没有等级：误报是判过的，但它没有等级，
// 用 gradeOf 当判据会让所有误报重新掉回待核实里。

/**
 * 命中明细的记录总数 —— 右上角「命中明细」入口角标。
 * 🔴 明细顶部原先那条统计条（命中 / 待核实 / 已核实 / 确认是风险 / 误报 / 规则准确率）已删：
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
/**
 * 本次核实的**风险备注**。
 *
 * 🔴 **原来它旁边还有一格必填的「修正原因」，2026-09-29 裁决已取消** ——
 * 两格用途重叠（都在答"这一次是怎么判的、为什么"），修正时人得把同一件事写两遍。
 * **取消的是字段、不是约束**：原先"修正必须填修正原因"那道硬校验**迁到本格**，
 * 即**修正时风险备注必填**，首次核实仍可选。
 * 故本格在修正形态下**不预填上一次那条** —— 预填等于让上一次的备注自动满足这一次的必填，
 * 那道约束就名存实亡了（`tagDirty` 随之把"空备注"排除在"动过"之外，见下）。
 */
const tagNote = ref('');
/**
 * 已核实过的再打开就是修正：按钮文案、必填项与**标题**随之不同。
 * **图标恒定**（盾牌 `SafetyCertificateOutlined`）；**标题随"首次 / 再次"变、不随入口变**
 * （见 `tagModalTitle`：首次写「风险识别」、再次写「重新识别」，2026-10-07 裁决）。
 */
const tagAmend = ref(false);
/**
 * 命中弹窗（「风险识别」/「重新识别」）的**副标题 ＝ 来源 · 单号**，与工单页页头那一枚、
 * 评估弹窗（`assessSubtitle`）逐字同形。
 *
 * 命中记录只可能来自预警词那一路，故来源恒写「实时监控」（见 `isVerifyMonitorSource`：
 * 「重点工单」那一路没有命中原话可摆，也就进不了这个形态）。
 */
const tagSubtitle = computed(
  () => (tagTarget.value ? `实时监控 · ${tagTarget.value.ticketNo}` : ''),
);
const tagHistory = computed(() => (tagTarget.value ? historyOf(tagTarget.value) : []));
const tagCurrent = computed(() => (tagTarget.value ? latestEntryOf(tagTarget.value) : undefined));
/**
 * 同单的其它命中及其结论——弹窗里位置最靠前的一块，排在「本次命中」这个必填项之上。
 * 【为什么必须靠前】它不是佐证，是**做这次判断的前提**：本条是不是一次升级、
 * 客户是第几次加码，答案全在别的命中里。摆到底部与修正记录并列，等于让人先下结论再看依据。
 */
/**
 * 本次真正会落库的等级。误报一律落 null——等级单选还留着上一次的选中态，
 * 拿它当"改动了"的依据的话，把成立改判成误报后再点一次某个等级，
 * 界面会认为又变了一次，历史里就多出一条什么都没改的修正。
 */
const tagLevelToSave = computed<RiskLevel | null>(
  () => (tagVerdict.value === '误报' ? null : tagLevel.value),
);
/**
 * 值没变就不该追加一条空修正，否则历史会被无意义的记录稀释。
 * 备注那一项判的是"**填了东西且与上一条不同**"：修正形态下本格从空开始（见 `tagNote`），
 * 若照旧直接比较，一打开就成了"动过"。
 */
const tagDirty = computed(() => {
  const cur = tagCurrent.value;
  if (!cur) return true;
  const note = tagNote.value.trim();
  return tagVerdict.value !== cur.verdict
    || tagLevelToSave.value !== cur.level
    || (!!note && note !== cur.note);
});
const canSaveTag = computed(() => {
  if (!canRiskTag.value || !tagVerdict.value) return false;
  // 修正必须答得出"为什么改"，那句话现在写在风险备注里（「修正原因」已取消）
  if (tagAmend.value) return tagDirty.value && !!tagNote.value.trim();
  return true;
});

/*
 * ---- 本弹窗**没有**「风险处理措施」段（2026-10-07 裁决） ----
 *
 * 首次打开它叫「风险识别」、已有结论再打开叫「重新识别」，两态答的都只是
 * "这条命中成不成立、风险多大、风险备注写什么"。处置怎么做归「风险管控」那一类弹窗
 * （已判段条目表 / 评估处置工作面 / 风险报备池 / 工单页页头），本弹窗一概不承载。
 *
 * 随段一并去掉的是"标完顺手给结论、条目直接落「已结论」"那条捷径：核实打标之后
 * 条目照原路进池落「待领取」，结论另起一步。只为那条捷径存在的状态与判据
 * （段内评估决策 / 点过保存没有 / 结论承载条目 /「这次核实会不会真的让它进池」）
 * 随段一并移除。
 */

/** 弹窗主按钮：本弹窗只做核实打标，文案只随"首次 / 修正"两态分 */
const tagOkText = computed(() => (tagAmend.value ? '保存修正' : '保存'));

/**
 * 命中弹窗的标题：**只认"首次 / 再次"，不认入口**（2026-10-07 裁决，命名从三类收成两类）。
 * 这一路两个入口（待判段的召回清单行、命中明细行）答的是同一个问题
 * "这条命中成不成立、风险多大"＝**识别**；它没有处置段，故"再次"仍是识别，
 * 叫「重新识别」，不叫管控（条目那一路的"再次"带处置段，才叫「风险管控」，
 * 见 `entryTagModalTitle`——那条分岔与本处无关）。
 */
const tagModalTitle = computed(() => (tagAmend.value ? '重新识别' : '风险识别'));

function openTag(h: RiskHit) {
  if (!canRiskTag.value) { message.warning('只有客诉专员、投诉督导与管理员可以标记'); return; }
  tagTarget.value = h;
  const cur = latestEntryOf(h);
  tagAmend.value = !!cur;
  tagLevel.value = cur?.level ?? h.level;
  tagVerdict.value = cur?.verdict;
  // 风险备注每次从空开始：修正形态下它承载"为什么改"，预填上一次那条会让必填名存实亡
  tagNote.value = '';
  tagOpen.value = true;
}
function saveTag() {
  const target = tagTarget.value;
  if (!target) return;
  if (!canRiskTag.value) { message.warning('无标记权限'); return; }
  if (!tagVerdict.value) { message.warning('请先判定本次命中是否成立'); return; }
  if (tagAmend.value && !tagDirty.value) { message.warning('核实结果没有变化，无需修正'); return; }
  // 「修正原因」已取消，那道约束迁到风险备注上：修正必填、首次可选
  if (tagAmend.value && !tagNote.value.trim()) { message.warning('请填写风险备注'); return; }
  const entry: TagEntry = {
    level: tagLevelToSave.value,
    verdict: tagVerdict.value,
    note: tagNote.value.trim(),
    by: user.current.name,
    byRole: user.role.name,
    at: nowStamp(),
  };
  /*
   * 🔴 **命中核实回写条目**（2026-09-15 裁决，推翻第三轮"命中核实不回写监控条目"）：
   * 追加命中记录之外，未打标工单上首次成立即打标入池；全部误报则改归「重点工单」，或打为无风险。
   * 已打标工单、修正只记命中。状态迁移全在 store 的 `verifyHit` 一处，批量识别（命中那一路）走同一个入口。
   */
  const outcome = riskQueue.verifyHit(target, { ...entry, verdict: tagVerdict.value });
  message.success(
    tagAmend.value
      ? `已修正 ${target.ticketNo} 的核实结果为「${entry.verdict}」，本次修正已留痕`
      : verifyOutcomeTip(target.ticketNo, entry, outcome),
  );
  tagOpen.value = false;
}
/** 首次核实保存后的去向提示：命中结论之外，把工单这一侧发生了什么说出来 */
function verifyOutcomeTip(no: string, entry: TagEntry, outcome: HitVerifyOutcome): string {
  if (outcome.kind === 'tagged') {
    return `已核实这条命中为「成立 · ${levelText(outcome.level)}」，${no} 已标记「${levelText(outcome.level)}」并进风险工单池等待领取`;
  }
  if (outcome.kind === 'rerouted') {
    return `已记为误报；${no} 已无待核实命中，改归「${outcome.source}」，仍在待判`;
  }
  if (outcome.kind === 'noRisk') {
    // 🔴 原来这一句末尾指路到「已判 · 无风险」档。那一档随 2026-10-07 裁决删除
    // （无风险不进已判），指路一并去掉 —— 本页不再有翻出这一批复核的地方。
    return `已记为误报；${no} 已无待核实命中，已判为无风险，不进风险工单池`;
  }
  return entry.verdict === '误报'
    ? '已记为误报，本条不计入风险，只回填词表准确率'
    : `已核实 ${no} 的这条命中为「成立 · ${levelText(entry.level)}」`;
}
/** 等级的人话说法：误报没有等级，说清"无等级"而不是留空，否则读不出这次改的是什么 */
const levelText = riskLevelText;
/** 两次核实之间实际改了什么——修正记录要能直接读出"从 X 改成 Y" */
function entryDiffText(prev: TagEntry, next: TagEntry): string {
  const parts: string[] = [];
  if (prev.verdict !== next.verdict) parts.push(`判定 ${prev.verdict} → ${next.verdict}`);
  if (prev.level !== next.level) parts.push(`等级 ${levelText(prev.level)} → ${levelText(next.level)}`);
  if (prev.note !== next.note) parts.push(next.note ? '风险备注已更新' : '风险备注已清空');
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
  const lines = [`标记人：${t.by}（${t.byRole}）`, `标记时间：${t.at}`];
  if (t.note) lines.push(`风险备注：${t.note}`);
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
 * 🔴 **表里只有一类行：监控条目**（《【930】》§5A.2）。在办、没人下过结论、满足两类判据的单
 * 由 store 补齐条目（`riskQueue.syncAutoEntries`），来源与进监控时刻照实写，不再有"无条目的行"。
 */
interface QueueRow {
  /** ＝ 条目 id */
  id: string;
  ticketNo: string;
  /**
   * A 线的监控条目。
   * 打标、批量识别（条目那一路）、修正三处只对有它的行开口，故那几处先判它在不在。
   *
   * 🔴 **原先还有一个 `report?: RiskPoolItem` 字段**，装 B 线报备单，给「已判 · 风险报备」
   * 那一档的行用。字段与那一档**一并删除**（2026-10-07 裁决：报备只在前台
   * 「风险报备池」展示、后台不展示），故这张表现在只有一类行：**A 线监控条目**。
   * ⚠️ 别把它与「来源恰好是二线报备的标记条目」搞混（`rowSourceText` 那一支仍在）：
   * 那是**标记条目**、走 `rowOfEntry`、`report` 本来就是空的，照旧进「全部有风险」。
   */
  entry?: RiskQueueEntry;
  /** 监控来源。A 线两值；报备线定级现补的那条标记条目为「二线报备」（界面词见 `rowSourceText`） */
  source: MonitorSource;
  desc: string;
  /** 进入实时监控的时刻 */
  at: string;
  status: RiskPoolItem['status'];
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

/*
 * 🔴 **原先这里有一个 `rowOfReport`**（报备单 → 视图行），给「已判 · 风险报备」那一档供行。
 * 随该档一并删除（2026-10-07 裁决：报备只在前台「风险报备池」展示、后台不展示）。
 * 报备单的数据照旧在 `reportStore.reports` 里，本页只是不再把它渲染成已判表的行。
 */
/**
 * 「未标记」的**全集 ＝「全部待判」**（未过班组筛选）＝ **监控队列里还没打标、且工单在办的条目**。
 *
 * 在办、没人下过结论、满足两类判据（实时监控 / 重点工单）的单，store 已按判据补齐条目
 * （`riskQueue.syncAutoEntries`，本页挂 watch 随命中与核实结论重跑），故全集只取条目这一处。
 * 两路按条目来源互斥，`实时监控 + 重点工单 ≡ 全部待判` 是**恒等号**。
 *
 * 🔴 **在办口径**（§5A.2 / R50a）：工单进终态即从「未标记」段消失。条目对应的单在工单库与派生库里
 * 都查不到时照实留着（`fallbackTicketOf` 顶一张最小工单），不吞 —— 那是数据异常，不是终态。
 *
 * 🔴 **「实时监控」这一档恒为自动扫库的产出**（2026-10-08 裁决）：它 ＝ **有待核实命中的未标记工单**。
 * 手动筛查是查询工具、不往这一档补货，故**无命中记录的单不会出现在这里**。
 */
const untaggedUniverse = computed<QueueRow[]>(() => reportStore.monitoringEntries
  .map(rowOfEntry)
  .filter(isLiveRow));

/**
 * 「已判」的**全集 ＝「全部有风险」**（未过班组筛选）＝ **标注了风险等级（高 / 中 / 低）、
 * 且工单在办的条目**。
 *
 * 🔴 **本段本轮改成在办口径**（2026-10-08 拍板，用户原话「已判，在行工单 && 标注了风险等级」）。
 * 此前它是**历史累计**：条目进段之后不因原单进终态而退出。改后两段同为在办口径，
 * 故原单一进终态，哪怕条目**已经出过结论**也退出已判段。
 *
 * 🔴 **判据与待判段逐字同一个**（`isLiveRow`，不另写一份）：
 *   · 「无风险不进已判」这条不变 —— 底表仍是 `pooledEntries`（只收打标为高 / 中 / 低的），
 *     判为无风险的照旧离开漏斗；
 *   · 工单库与派生库都查不到的条目**照实留着**，不吞 —— 那是数据异常，不是终态。
 *
 * 🔴 **本页唯一一份**：左栏已判页签 / 「全部有风险」三档 / 「按标记人」各行、
 * 以及页头「风险工单」块的四个数，全部由它派生（见 `pooledAllCount` 那段说明），
 * 故"页头 ≡ 左栏已判"这条恒等式在改口径之后自动成立，不需要分别再改一遍。
 */
const judgedUniverse = computed<RiskQueueEntry[]>(
  () => reportStore.pooledEntries.filter(isLiveRow),
);

/* ---- 「已判」段那条筛选条的另两维（2026-10-09 裁决：这条筛选条在已判段常驻，出四格） ---- */
/**
 * 「监控来源」「原单类型」两维在**已判段**的筛选值。
 *
 * 🔴 **与工作面那两维各存一份、互不干扰**：两段的分母本来就不是一个 —— 已判段数的是
 * **监控条目**（含来源「二线报备」那条标记条目，故这一维在这里有**三个**取值），
 * 工作面只收 A 线**池行**（经 `isALine`，两个取值）。共用一份状态的话，
 * "在工作面筛了重点工单 → 切回已判发现也被筛了"，而两边的数怎么也对不上。
 *
 * 🔴 **「风险等级」不在这里另存**：它与左栏「已判」段那一轴是同一件事，
 * 共用 `tagLevelFilter` 这一份真源（见 `judgedLevelFilter` 那个代理）。
 * 另存一份再去同步，迟早漂 —— 本文件在"同一个数两处各算一遍"上已经付过几次账。
 *
 * 🔴 **「结论」这一维不出**（2026-10-09 裁决）：已判段装的是 `RiskQueueEntry`（监控条目），
 * 身上**没有结论字段** —— 结论落在池行 `RiskPoolItem` 的 `assessment` / `coordination` 上。
 * 摆上去会是「全部（15）/ 升级（0）/ 不升级（0）/ 风险处理建议（0）」那种四项三个零。
 */
const judgedSourceFilter = ref<MonitorSource | 'all'>('all');
/** 🔴 **多选、取值 ＝ 原单真实工单类型**（2026-10-09 改判，与工作面那一格合成同一维） */
const judgedTypeFilter = ref<string[]>([]);
/** 两维一处套用；`skip` 摘掉其中一维 —— 那一维自己的计数要靠"除自己之外"的底表算 */
function byJudgedAttrs(rows: RiskQueueEntry[], skip?: 'source' | 'type') {
  return rows.filter((e) => {
    if (skip !== 'source' && judgedSourceFilter.value !== 'all' && e.source !== judgedSourceFilter.value) return false;
    if (skip !== 'type' && judgedTypeFilter.value.length && !judgedTypeFilter.value.includes(poolTicketTypeOf(e))) return false;
    return true;
  });
}
const judgedAttrDirty = computed(
  () => judgedSourceFilter.value !== 'all' || judgedTypeFilter.value.length > 0,
);
/** 已判段过了那两维之后的全集。左栏各档与表身**同走它**，两处不会分叉 */
const judgedFilteredUniverse = computed(() => byJudgedAttrs(judgedUniverse.value));
/**
 * 左栏当前那一档（按风险等级 / 按标记人）的收窄，抽成一处。
 * 🔴 表身与两个下拉的计数底表都走它，**档位逻辑只写这一份** ——
 * 原先它内联在 `queueBase` 里，加了筛选项之后要在三处各写一遍，必然分叉。
 */
function judgedPicked(list: RiskQueueEntry[]): RiskQueueEntry[] {
  if (tagLevelFilter.value === 'tagger') {
    return taggerFilter.value === 'all'
      ? list
      : list.filter((e) => taggerOf(e) === taggerFilter.value);
  }
  return tagLevelFilter.value === 'all'
    ? list
    : list.filter((e) => e.tag?.result === tagLevelFilter.value);
}
/*
 * 命中核实结论与打标回写的工单级等级一变，按两类判据重补一遍条目：
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
function effectiveSourceOf(r: QueueRow): MonitorSource {
  return r.source;
}

/** 切片 ↔ 监控来源字面量。两片就是这一维的两个值，故映射一处写死、别处只引用它 */
const SLICE_SOURCE: Record<UntaggedSlice, NonNullable<QueueRow['source']>> = {
  kw: '实时监控',
  focus: '重点工单',
};

/**
 * 「未标记」的某一路（未过班组筛选、未过子档）。
 * 两路**同出一个全集**（`untaggedUniverse`），故"两路之和 ＝ 页签上那个数"
 * 是构造出来的、不是碰巧成立的：换两条独立的查询去取，各自的"未标记"判据迟早分叉。
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
// 🔴 **字段随当前这一路而变**：风险词只有「实时监控」那一路有（「重点工单」那一路的行就是工单，
// 没有词可筛）；**工单类型与优先级两路都有**。两路的格子因此是：
//   · 实时监控 —— 班组 / 风险词 / 工单类型 / 优先级；
//   · 重点工单 —— 班组 / 工单类型 / 优先级。
// 🔴 「实时监控」那一路的风险词**作用在命中上**（行 ＝ 一条召回），一组里命中全被筛掉的工单整组不出现。
//
// 🔴 **不重复左栏与搜索条「班组」已经承担的收窄**（加进去就是同一件事两个入口）：
//   · 班组 —— 搜索条里的「班组」下拉已经在做；
//   · 标记人 —— 这一段按定义全是没打过标的单，恒空。
//   · 命中时间 / 核实结果 —— 不在这一段筛，查命中历史走命中明细那条查询条。
//
// 🔴 **「关键词」那一格 2026-10-09 整格删除**（业务原话「关键词去掉」，两路一起撤）：
// 它只比对工单号与联系方式，而这一段装的是**此刻等人判的存量**（两路合计三十几条、
// 一屏之内看得完），按单号点查的场合走右上角「手动筛查」或工单列表，不在这条筛选条上。
// 连带 `rowMatchesKeyword` 一并删掉 —— 它只有这一处消费端（命中明细那条查询条有自己的
// `ledgerFilter.keyword`，是另一套，不受影响）。
//
// 🔴 **「产品」「当前状态」「SLA」三格 2026-10-09 整格删除**（业务原话「SLA去掉」
// 「这三个选去掉」）：它们只在「重点工单」那一路出过。连同 `untaggedFilter.products` /
// `statuses` / `sla` 三个字段、`untaggedProductOptions` / `untaggedStatusOptions`
// 两个取值派生，以及顶部 `isSlaBreachedNow` / `ticketStatusDisplayName` 两笔 import
// 一并删净 —— 删前 grep 复验过：这三维在本文件只有那一条筛选条一个消费端
// （命中明细那条查询条的 `ledgerFilter` 是另一摊，不受影响）。
interface UntaggedFilter {
  /** 只有「实时监控」这一路用得到：命中的规则主词（与命中明细同一口径，取 `RiskHit.word`） */
  words: string[];
  /**
   * 工单类型（多选，从**当前这一路**真出现过的类型派生 —— 选了必有结果）。
   * 🔴 **两路都出这一维**（2026-10-09 裁决，业务原话「新增工单类型、优先级」）：
   * 原先只给「重点工单」那一路，理由是"实时监控那一路按词表预设等级排队，工单维度不是它的
   * 排队依据"。**那条理由已被这次拍板推翻**：业务要的是在这一路也按工单维度收窄，
   * 排队依据是另一回事（它仍是左栏子档那一轴）。理由留痕在这里，不再作为实现依据。
   */
  types: string[];
  /**
   * 工单优先级（单选，空串 ＝ 不限；取值从**当前这一路**真出现过的优先级派生）。
   *
   * 🔴 **这一维与左栏子档 `untaggedSub` 是两份状态，不许串台**：`untaggedSub` 在两路有
   * **两套取值域**（实时监控那一路是词表预设的识别风险等级 高/中/低，重点工单那一路才是
   * P0~P3，见 `UNTAGGED_SUB_KEYS`）。「重点工单」那一路的「优先级」那一格仍然**直接绑
   * `untaggedSub`**（一份 state 两个视图，见 `untaggedPriorityOptions`）；
   * 「实时监控」那一路的「优先级」走**这个字段**，碰不到 `untaggedSub` 一个字节。
   */
  priority: string;
}
/**
 * 默认**不设时间窗**。与命中明细那条相反：明细是只增不减的永久记录，不给默认窗口一开始就淹在
 * 历史里；而这一段装的是**此刻的存量**（还没人下结论的单），本来就没有多少历史深度，
 * 给一个默认窗口反而会让左栏角标与表行数在人什么都没筛的时候就对不上。
 */
function defaultUntaggedFilter(): UntaggedFilter {
  return { words: [], types: [], priority: '' };
}
const untaggedFilter = ref<UntaggedFilter>(defaultUntaggedFilter());

/**
 * 「风险词」下拉的取值：**从这一路真出现过的词派生**，与台账那几个下拉同一条规矩
 * （`uniqOptions` 的说明）—— 选了必有结果。
 * 🔴 底表取**未过本条筛选**的整片：拿过滤后的行去派生，选中一个词之后下拉里就只剩它自己，
 * 人再也换不回别的词。
 */
const untaggedWordOptions = computed(() => {
  const seen: string[] = [];
  for (const r of untaggedSliceRows('kw')) {
    for (const h of pendingRowHits(r)) if (!seen.includes(h.word)) seen.push(h.word);
  }
  return seen.map((w) => ({ value: w, label: w }));
});

/**
 * 工单维度那几个下拉的取值：**从当前这一路真出现过的值派生**，选了必有结果。
 * 🔴 现在只剩「工单类型」「优先级」两个消费端 —— 「产品」「当前状态」两个派生
 * 已随那两格一并删除（2026-10-09）。
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
/**
 * 「类型」下拉的取值：同上，从**当前这一路**真出现过的工单类型派生 —— 选了必有结果。
 * 🔴 两路共用这一个 computed（`untaggedTicketOptions` 读的就是当前这一路），
 * 故切路之后取值域自己跟着换，不为第二路另写一份。
 */
const untaggedTypeOptions = computed(() => untaggedTicketOptions((t) => t.type));

/**
 * 这一行对应的**工单**；null ＝ 工单库与派生库里都查不到。
 *
 * 🔴 **两处都要查**：静态样本 `TICKETS` 之外，「升级」派生出来的新投诉单落在
 * `derivedTickets` 里（那个 store 存的就是完整 `Ticket`），只查前者会让那批行整批解析不出来。
 * 🔴 **返回 null 的行不许被丢掉**：清单的行数必须恒等于左栏角标，少一行就是这一列的
 * 第一条不变量破了。故 `untaggedTicketRows` 对 null 的处理是"照实留在行集里、
 * 用行自己已知的信息补齐一张最小工单"，而不是 filter 掉，见那一段。
 */
function ticketOfRow(r: { ticketNo: string }): Ticket | null {
  return TICKET_BY_NO.get(r.ticketNo) ?? derivedTickets.find(r.ticketNo) ?? null;
}

/**
 * 这一行（视图行或条目）的原单**还在办**没有 —— 待判段与已判段**同取这一个判据**
 * （2026-10-08 拍板：已判也改在办口径）。
 *
 * 🔴 **查不到原单一律放行**：那是数据异常、不是终态。滤掉的话这批行会悄悄从两段里消失，
 * 而左栏角标仍数着它们 —— 行数与角标对不上是这一列的第一条不变量破了。
 */
function isLiveRow(r: { ticketNo: string }): boolean {
  const t = ticketOfRow(r);
  return !t || isLiveTicket(t);
}

/**
 * 把筛选条件套到某一路的行上。
 *   · **工单类型 / 优先级**两路同一条判法（`rowMatchesTicketAttrs`，作用在行对应的工单上）；
 *   · 实时监控 —— 行是**命中**（一条召回一行），故另筛 风险词，见 `kwHitsOf`；
 *   · 重点工单 —— 行**就是工单**，故另筛 产品 / 当前状态 / SLA 是否超时。
 *
 * 🔴 「进监控时间」这一维**已删**：实测工单那一路 11 条里只有 2 条有进监控时刻
 * （其余是「未纳入监控」、`at` 为 null），一设区间就只剩那 2 条 ——
 * 一个筛完必然只剩两条的字段，摆在那里只会让人以为筛坏了。
 * 🔴 「关键词」这一维**已删**（2026-10-09，业务原话「关键词去掉」），见 `UntaggedFilter`。
 */
/**
 * 工单维度那两维（工单类型 / 优先级）的行判法 —— **两路同一份**，故只写这一个。
 * 🔴 **查不到工单的行一律放行**而不是筛掉：它不是"不匹配"，是"这一维答不上来"。
 * 筛掉的话，人按类型收窄一次就再也看不到这批数据异常的行了（与下面那几维同一条规矩）。
 */
function rowMatchesTicketAttrs(r: QueueRow, types: string[], priority: string): boolean {
  if (!types.length && !priority) return true;
  const t = ticketOfRow(r);
  if (!t) return true;
  if (types.length && !types.includes(t.type)) return false;
  if (priority && t.priority !== priority) return false;
  return true;
}
/**
 * 这张单上**待核实**的命中（2026-09-15 裁决：召回清单只列未打标工单上待核实的命中；
 * 成立 / 误报的只在命中明细里）。次序同 `rowHits`。
 */
function pendingRowHits(r: QueueRow): RiskHit[] {
  return rowHits(r).filter((h) => !isJudged(h));
}
/**
 * 这张单上**过了筛选的待核实命中**，按命中时刻倒序 —— 召回清单里这一组的那几行。
 * 🔴 组数（角标 / 班组 / 分页）与行数（「N 条命中」）都从它派生，不另筛一遍。
 * 🔴 **只有风险词这一维作用在命中上**：工单类型 / 优先级是工单级的，整行留不留由
 * `rowMatchesTicketAttrs` 判，不在这里把一组命中筛成空（否则同一维在两处各判一遍）。
 */
function kwHitsOf(r: QueueRow): RiskHit[] {
  const hits = pendingRowHits(r).sort((a, b) => b.when.localeCompare(a.when));
  const { words } = untaggedFilter.value;
  return words.length ? hits.filter((h) => words.includes(h.word)) : hits;
}

function applyUntaggedFilter(list: QueueRow[], slice: UntaggedSlice): QueueRow[] {
  const f = untaggedFilter.value;
  // 🔴 **「优先级」这一维按路取不同真源**：实时监控那一路走本条筛选条自己的 `f.priority`；
  // 重点工单那一路的那一格直接绑左栏子档 `untaggedSub`，收窄已经由子档做掉了，
  // 故这里传空串 —— 不然同一维筛两遍，而两遍读的还不是同一份 state（见 `UntaggedFilter.priority`）。
  const priority = slice === 'kw' ? f.priority : '';
  const byAttrs = list.filter((r) => rowMatchesTicketAttrs(r, f.types, priority));
  // 「实时监控」：风险词作用在命中上，**一组里命中全被筛掉的工单整组不出现**
  if (slice === 'kw') {
    if (!f.words.length) return byAttrs;
    return byAttrs.filter((r) => kwHitsOf(r).length > 0);
  }
  // 「重点工单」那一路现在只剩工单类型这一维（优先级归左栏子档），上面那一行已经筛完
  return byAttrs;
}

/**
 * 这条筛选条动过没有。
 * 🔴 **按路算**：各路只数自己那一条上真摆着的那几维。换路时整条筛选本来就会被清空
 * （见下面那个 `resetUntaggedFilter` 的 watch），故这是第二道闸 —— 两路现在有
 * 「工单类型」这一维共用同一个字段、「优先级」还按路分两个真源，全维度一起数的话，
 * 哪天那个 watch 一改，就会冒出"这一路一格都没动过、左栏角标却成了「筛后 / 全量」"。
 */
function untaggedFilterDirtyOf(slice: UntaggedSlice): boolean {
  const f = untaggedFilter.value;
  // 实时监控多一个「风险词」；「优先级」那一维只有这一路走本条筛选条（另一路绑左栏子档）
  if (slice === 'kw') return !!f.words.length || !!f.types.length || !!f.priority;
  return !!f.types.length;
}
const untaggedFilterDirty = computed(() => untaggedFilterDirtyOf(untaggedSlice.value));

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
 *   · 重点工单 —— 工单优先级。
 * 🔴 返回 null 的行**照旧留在父切面里**，只是不进任何一个子档，故会让
 * 「Σ子档 ＝ 父切面」少掉几条。少掉就是少掉，不往哪个档里硬塞 ——
 * 塞进去的那一条会让人照着一个假分档去派活。
 */
function untaggedSubOf(r: QueueRow, slice: UntaggedSlice): string | null {
  if (slice === 'kw') return presetLevelOf(r.ticketNo);
  // 🔴 **两处都要查**（与 `ticketOf` / `groupNameOf` 同一条规矩）：升级派生的新投诉单
  // 落在 `derivedTickets` 里，只问静态工单库会让它进得了父切面、却掉不进任何一个子档 ——
  // 「Σ子档 ＝ 父切面」当场少一条，而这一条明明查得到自己的优先级。
  return ticketOfRow(r)?.priority ?? null;
}

/**
 * 某一片下的子档清单（**为 0 也照常列出**，档位时有时无会被读成筛选坏了）。
 * 🔴 「重点工单」列满 P0~P3 四档：这一路收全量在办投诉单（不限优先级），P2 / P3 是真有数的档。
 */
const UNTAGGED_SUB_KEYS: Record<UntaggedSlice, string[]> = {
  kw: [...RISK_LEVELS],
  focus: ['P0', 'P1', 'P2', 'P3'],
};
/** 与建单页 `PRIORITY_OPTIONS` 同文案：`P1（重要）` … */
const PRIORITY_RAIL_LABEL = Object.fromEntries(
  PRIORITY_OPTIONS.map((o) => [o.value, o.label]),
) as Record<Priority, string>;

/**
 * 「重点工单」那一路筛选条上的「优先级」那一格（2026-10-09 裁决）。
 *
 * 🔴 **它就是左栏那四档本身，不是第二份状态**：`v-model` 直接绑 `untaggedSub` ——
 * 左栏点「P1（重要）」这一格就显示它，在这一格改成 P2 左栏当场亮到 P2，空串 ＝ 不限。
 * 一份 state、两个视图，不会漂（与已判段「风险等级」那一格同一条做法）。
 *
 * 🔴 **这一格不摆数**：那四个数就在左栏同一屏上、且是同一批行，
 * 摆两遍就是"同一个数两处各算一遍"——本文件反复踩过的那个坑。与同一条上的
 * 「产品 / 当前状态 / SLA」三格也逐字同形（那三格本来就不带数）。
 *
 * ⚠️ **留痕**：上一轮据此判「实时监控那一路不出这一格」—— 那一路的子档是**词表预设的
 * 识别风险等级**（"机器觉得这句话多重"）、不是工单优先级（"这张单本身多急"），
 * 直接摆上去会让 `untaggedSub` 在两套取值域之间串台（见 `UNTAGGED_SUB_KEYS`）。
 * **那条判断已被 2026-10-09 的拍板推翻**（业务原话「新增工单类型、优先级」）：
 * 两路都要按工单维度筛。串台的隐患仍然成立，故**那一路另起一维**
 * （`untaggedFilter.priority`）、不碰 `untaggedSub`，见 `untaggedKwPriorityOptions`。
 */
const untaggedPriorityOptions = computed(() => [
  // 🔴 空值项一律写「全部」（2026-10-09 裁决，业务原话把「不限」统一成「全部」）：
  // 三条筛选条的空值项写法要一致 —— 另两条带计数、写「全部（N）」，这一条不带数、写「全部」
  { value: '', label: '全部' },
  ...UNTAGGED_SUB_KEYS.focus.map((k) => ({
    value: k,
    label: PRIORITY_RAIL_LABEL[k as Priority] ?? k,
  })),
]);
/**
 * 「实时监控」那一路筛选条上的「优先级」那一格（2026-10-09 裁决补进来的）。
 *
 * 🔴 **与上面那一格同形、不同真源**：这一格绑 `untaggedFilter.priority`，
 * 上面那一格绑左栏子档 `untaggedSub`。**两者都不写对方的 state** ——
 * 这一路的子档取值域是 高 / 中 / 低风险，把 P0~P3 写进 `untaggedSub` 会让左栏点亮一个
 * 不存在的档、同时把整路筛空（`untaggedSubOf` 在这一路返回的是风险等级，永不等于 `P2`）。
 * 🔴 **取值从这一路真出现过的优先级派生**（`untaggedTicketOptions`）—— 选了必有结果，
 * 与同一条上的「类型 / 风险词」两格同一条规矩。次序按 P0 → P3，不按出现先后。
 * 🔴 **不摆数**：与另一路那一格、以及同条上的多选格逐字同形（都不带数）。
 */
const untaggedKwPriorityOptions = computed(() => [
  // 空值项写法同上一格：三条筛选条一致
  { value: '', label: '全部' },
  ...untaggedTicketOptions((t) => t.priority)
    .sort((a, b) => (PRIORITY_RANK[a.value] ?? RANK_UNKNOWN) - (PRIORITY_RANK[b.value] ?? RANK_UNKNOWN))
    .map(({ value }) => ({ value, label: PRIORITY_RAIL_LABEL[value as Priority] ?? value })),
]);

/** 子档的界面词。等级取 `riskLevelText`；优先级取建单下拉同一套 `PRIORITY_OPTIONS` */
function untaggedSubLabel(slice: UntaggedSlice, key: string): string {
  if (slice === 'kw') return `${key}风险`;
  return PRIORITY_RAIL_LABEL[key as Priority] ?? key;
}
function untaggedSubTitle(slice: UntaggedSlice, key: string, parentLabel: string): string {
  if (slice === 'kw') return `「${parentLabel}」里${key}风险的那一档`;
  return `「${parentLabel}」里 ${untaggedSubLabel(slice, key)} 那一档`;
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
 * 没有命中记录的（「重点工单」那一路本就不产生命中）排最后，不吞。
 */
const PRESET_LEVEL_RANK: Record<RiskLevel, number> = { 高: 0, 中: 1, 低: 2 };
/**
 * 本单命中里**最重**的那一条的预设等级；null ＝ 这张单没有命中记录。
 * 取**待核实**的命中（召回清单只列这一批，「等级」列与子档同源）；一条待核实的都没有时退回全部命中。
 */
function presetLevelOf(ticketNo: string): RiskLevel | null {
  let best: RiskLevel | null = null;
  const all = riskTags.hitsOfTicket(ticketNo);
  const pending = all.filter((h) => !isJudged(h));
  for (const h of pending.length ? pending : all) {
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
 *   · 实时监控 —— 按**词表预设的识别风险等级**降序（高 → 中 → 低）；
 *   · 重点工单 —— 按**工单优先级**降序（P0 → P3）。
 *
 * 【为什么两片不共用一把尺】预警词那一路的排队依据是"机器觉得这句话多重"，
 * 而重点工单看的是"这张单本身多急"——同分时一律早进先出（`at` 升序），
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

/* ---- 「重点工单」这一路：直接用工作台那张富列表 ---- */
//
// 【为什么这一路换表】它的行**就是工单**，人在这一档要判的也正是工单本身。
// 原先那两列对判断零信息量：「监控来源」整列等于左栏档名的复述（停在这一档，
// 整列都写着同一个来源名），「风险描述」是一句写死的套话。于是这一档没法就地判，
// 只能一条条点进工单——与「实时监控」那一路当初的毛病一模一样，只是那边靠命中原话解决了。
//
// 🔴 **不另画一张长得像工作台的表**：摘要 / SLA 两行 / 状态徽章 / 优先级点 这几格的
// 呈现规则各有分支（光 SLA 就有五条），抄一份迟早与工作台分叉，同一张单在两个页面
// 说法不一。故给 `TicketRichList` 开了三个可选扩展位（`rowActionsFn` / `extraColumns` /
// `selectable`），本页当调用方用，一格都不重画。
/** 当前是不是停在「重点工单」那一路（含它的子档） */
const ticketListView = computed(() => (
  listView.value === 'realtime'
  && queueView.value === 'monitoring'
  && untaggedSlice.value !== 'kw'
));

/**
 * 传给富列表的那批工单。**逐行对应 `pagedQueueRows`，一行不多一行不少** ——
 * 富列表里的行数必须恒等于左栏角标与班组 chip，这是这一页的第一条不变量。
 *
 * 🔴 **查不到工单的行不丢，补一张最小工单顶上**：`ticketOfRow` 返回 null 时，
 * 用这一行**自己确实带着的**东西（工单号、条目里的描述）拼一张出来，其余字段留空。
 * 丢掉那一行的话，左栏写着 11、表里躺着 10，而少的那一条谁也找不出来在哪 ——
 * 那正是本文件反复警告的坑。补出来的行看得见、点得开、也照样能打标。
 * 【它在今天的数据上是死路】两路入选时已经过了一道工单存在性判据
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
 * 富列表按**工单 id** 收发勾选，而本页的批量识别按**队列行 id**（`QueueRow.id`）记选中。
 * 两边靠工单号搭桥，不另存第二份选中态 —— 存两份必然分叉，
 * "批量识别对一批看不见的行动手"就是这么来的。
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
/**
 * 本页那张富列表的列宽。**必须自带一套**：工作台那一屏宽 1290+，它的默认列宽合计 1370，
 * 而本页左边还压着一列漏斗导航，清单区只剩 1045 —— 照默认摆下来横向溢出 325px，
 * 而"横着拖才能看全的表，等于每一行都要动两次手"（与「实时监控」那一路收窄列宽同一条理由）。
 * 🔴 走 `columnWidths` 这个 prop 而不是去改工作台的默认值：那份默认是全局 localStorage，
 * 改了会把工作台的列一起改窄。传了它的实例同时也不出拖拽把手 —— 在这里拖窄一列
 * 会写回那份全局记忆，工作台跟着变。
 * 合计 ＝ 16 + 200 + 168 + 100 + 46 + 76 + 96 + 88 + 108 + 88 + 120 + 120 + 1fr + 132。
 */
const TICKET_LIST_COL_WIDTHS: Record<string, number> = {
  title: 200,
  summary: 168,
  sla: 100,
  priority: 46,
  customer: 76,
  product: 96,
  node: 88,
  assignee: 108,
  flowNode: 88,
  createdAt: 120,
  updatedAt: 120,
  action: 72,
};
function rowOfTicketNo(no: string): QueueRow | undefined {
  return rowByTicketNo.value.get(no);
}
/** 富列表的行内动作：这一段只有「风险识别」一枚（待判段，2026-10-07 改名），权限不足时不给按钮 */
function untaggedRowActions() {
  return canRiskTag.value ? [{ label: '风险识别', primary: true }] : [];
}
function onTicketRowAction(label: string, t: Ticket) {
  const r = rowOfTicketNo(t.no);
  if (label === '风险识别' && r) openEntryTag(r, 'untagged');
}

/* ---- 「实时监控」这一路 · 召回清单 ---- */
//
// 🔴 **行 ＝ 命中记录（一条召回一行）**，列与命中明细一致：等级 · 风险词 · 工单 · 命中内容 ·
// 客户 / 班组 · 时间 · 处置。只列**尚未打标的工单**上**待核实**的命中（2026-09-15 裁决）；
// 成立 / 误报的命中、已打标的单上的命中在命中明细里。
// 🔴 **计数单位仍是工单**：左栏角标、班组 chip、分页都按**工单组**数，
// 故 `实时监控 + 重点工单 ＝ 未标记页签数` 不变；命中条数只在分页处与单数并写。
// 同一张单的命中相邻成组：组序沿用 `untaggedRows`（词表预设等级最重的在前），组内按命中时刻倒序，
// 分页按组切，一组不被拆到两页。
// 「处置」列**按命中逐行**出「风险识别」（`openTag`，与命中明细同一个弹窗、同一个 store 入口 `verifyHit`）：
// 首次成立即给这张单打标入池，全部误报则改归或打为无风险。
// 🔴 这张表只装**待核实**的命中（`pendingRowHits` 已滤掉 `isJudged`），故这一枚恒是首次态 ——
// 文案与 `tagModalTitle` 都落在「风险识别」，不会出现「重新识别」。
/** 当前是不是停在「实时监控」那一路（含它的三个子档） */
const kwEvidenceView = computed(() => (
  listView.value === 'realtime'
  && queueView.value === 'monitoring'
  && untaggedSlice.value === 'kw'
));
/**
 * 当前页的工单组，每组带着它过了筛选的命中。
 * 🔴 **这一档里每一组必有至少一条待核实命中**：入选判据就是"本单有待核实命中"
 * （`autoSourceFor` 的 `pendingHitsOnly`），命中全核实完的单由 `verifyHit` 当场改归或打为无风险；
 * 筛选把一组的命中全筛掉时整组也不出现（`applyUntaggedFilter`）。
 * 故原先那条"没有命中的组照实留一行"的渲染分支已随 2026-10-08 裁决删除 —— 它只为
 * 手动筛查并入的无命中单而留，而并入这件事已经取消。
 */
const kwPageGroups = computed(() => (
  kwEvidenceView.value
    ? pagedQueueRows.value.map((r) => ({ row: r, hits: kwHitsOf(r) }))
    : []
));
/** 当前这一档（已过筛选 / 子档 / 班组）全部工单组上的命中条数 ——「N 单 · M 条命中」里的 M */
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

/* ---- 「已判」段（＝「全部有风险」那一批，两个轴共用）的证据列 ---- */
//
// 【为什么这一段也要换列】它原先摆的是「监控来源」+「风险描述」，两列都答不了
// "这条**凭什么**被判成这个等级"：
//   · 监控来源只有两个值，且都是上游入口的复述；
//   · 风险描述是一句写死的套话（「投诉类工单自动纳入实时监控」），一个字的判据都没有。
// 于是复核一条打标结论——这一段唯一的活——只能一条条点进工单。
//
// 🔴 **两类行的证据不是一种东西，故「证据 / 摘要」这一列按来源分岔**（见 `rowEvidenceKind`）：
//   · 实时监控 —— 摆**命中原话摘录**（最新一条，命中词高亮）；
//   · 重点工单 —— 这一路本就不产生命中，摆工单自己的**问题描述**。
//   （来源「二线报备」的那条标记条目走「重点工单」同一支，摆条目自己的 `desc` ＝ 报备人填的风险描述，
//     见 `rowSummaryOf`。它是**标记条目**不是报备单，故仍在这张表上。）
// 客户 / 产品 与 SLA 两列对**两类行都成立**，故不分岔、恒取工单。
/*
 * 🔴 **原先这里有一个 `taggedEvidenceView`**（"当前是不是停在已标记段那张表上"），
 * 给那张表上证据那四列的 `v-if` 与两列的列宽二选一供判据 —— 原因是那张表当时由
 * 已入池 / 无风险 / 风险报备三档共用，而无风险那一档不摆证据列。
 * 后两档随 2026-10-07 裁决删除之后，这张表只剩**一档**（已判 ＝ 全部有风险），
 * 判据恒为真，四列恒出、列宽恒定 —— 整个 computed 连同那些 `v-if` 一并删掉。
 */
/** 这一行有没有命中记录 —— 上面那两列按它分岔 */
function rowHasHits(r: QueueRow): boolean {
  return rowHits(r).length > 0;
}
/**
 * 这一行的「摘要」：取工单的**问题描述**，不取条目里那句套话。
 * 查不到工单时退回条目描述 —— 那是这一行仅有的信息，比空着强。
 *
 * 🔴 **来源为「二线报备」的标记条目是例外，先取条目自己的 `desc`**：那一路的 `desc`
 * 抄的正是**报备人填的风险描述**（条目由 `ensureEntryFor` 在定级那一刻现补，见
 * `riskQueue.autoSourceFor` 第三支），而它恰恰是这一行的证据本身 —— 结论就是照着它下的。
 * 退回工单问题描述会把这一行的证据换成一句与风险无关的话，那一列也就不再是"证据"。
 */
function rowSummaryOf(r: QueueRow): string {
  const t = ticketOfRow(r);
  if (r.source === REPORT_SOURCE && r.desc) return r.desc;
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
/*
 * ⚠️ **已删除 `rowWords` 与 `ROW_WORD_VISIBLE`**（2026-09-28 裁决的连带）。
 * 它们是原「风险词」那一列的取数与折叠阈值：把一行命中的全部词去重列出、前两枚并排、其余折成「+N」。
 * 那一列改成「风险来源」之后没有第二个调用方 —— 词并没有丢，它跟着证据走：
 * 「证据 / 摘要」那一格的原话里命中词仍然高亮（`excerptWindow`）。
 */
/**
 * 这一行的工单标题。**取工单库的真标题**，不取条目里那句写死的套话 ——
 * 「重点工单」那一路的「风险描述」同样走它，那一路本就没有命中原话可摆。
 */
function rowTitleOf(r: QueueRow): string {
  return TICKET_BY_NO.get(r.ticketNo)?.title || r.desc;
}
/** 这一行的客户：优先取命中记录（它带着这一格），没有命中就退回工单 */
function rowCustomerOf(r: QueueRow): string {
  return rowTopHit(r)?.customer || TICKET_BY_NO.get(r.ticketNo)?.customer || '—';
}
/** 处理组 · 处理人（如「投诉风险组 · 刘振撼」） */
function handlerLineOf(groupName: string | undefined, assignee: string | null | undefined): string {
  const g = (groupName ?? '').trim();
  const p = (assignee ?? '').trim();
  if (!g && !p) return '—';
  if (!p) return g;
  if (!g) return p;
  return `${g} · ${p}`;
}
function rowHandlerLine(r: QueueRow, hit?: RiskHit | null): string {
  const t = ticketOfRow(r);
  return handlerLineOf(
    groupNameOf(r.ticketNo),
    t?.assignee ?? hit?.assignee ?? r.assignee ?? rowTopHit(r)?.assignee,
  );
}

/* ---- 「已判」段条目表：来源 / 证据 / 结论三组按行分岔（2026-09-28 裁决） ---- */

/**
 * 「风险来源」列的界面词 —— 原「风险词」那一列改成的这一维，取值三种。
 *
 * 🔴 两路**照写条目自己的来源**（实时监控 / 重点工单，与待判段、来源 chip 全站一个说法）。
 *
 * 🔴 **第三种取值「风险报备」保留**（2026-10-07 裁决的连带判定）：它答的不是
 * "这里展示报备单"，而是"**这条标记条目是从报备那条路进来的**" ——
 * 报备线定级现补的那条条目（`riskQueue.autoSourceFor` 第三支）走的是 `rowOfEntry`，
 * `source` 为「二线报备」，而它**已经打过标、已经在「全部有风险」里**，是标记条目。
 * 本轮删掉的是"后台展示**报备条目**"（左栏那一档 + B 线报备行），不是这一支。
 * 界面写「风险报备」而不是落库值「二线报备」：这一列答的是"从哪条路进来的"，
 * 写成岗位名等于把来源说成了报备人的职级。
 * ⚠️ 这是**显示层的映射**，不是数据改名：内部常量 `REPORT_SOURCE` 仍是「二线报备」，
 * 条目、池行、缓存与筛选一律照旧用它，不要反过来去改那个常量。
 */
const REPORTED_SOURCE_TEXT = '风险报备';
function rowSourceText(r: QueueRow): string {
  return r.source === REPORT_SOURCE ? REPORTED_SOURCE_TEXT : r.source;
}

/**
 * 这一行**最新的那条命中** —— 「证据 / 摘要」列摆的原话取它。
 * 🔴 与 `rowTopHit`（按词表预设等级最重的那条）不是一回事：那一枚是定级时要看的"最重的证据"，
 * 这一格要的是"客户最近说了什么"，故多条命中取**最新一条**。
 */
function rowLatestHit(r: QueueRow): RiskHit | null {
  return rowHits(r).slice().sort((a, b) => b.when.localeCompare(a.when))[0] ?? null;
}

/**
 * 「证据 / 摘要」这一格摆的是哪一种东西 —— **按来源分岔，不按"有没有命中"分岔**：
 *   · 实时监控 → **命中原话摘录**（最新一条，命中词高亮）；
 *   · 重点工单 → **工单的问题描述**（这一路本就不靠词进来，没有原话可摆）。
 * 实时监控那一路万一一条命中都没有（命中已被删这类数据异常），退回问题描述，不留空格。
 *
 * 🔴 **原先还有一支 `'report'`**（报备行摆报备单的风险描述），随「风险报备」那一档删除。
 * 来源「二线报备」的标记条目走 `'summary'`，而 `rowSummaryOf` 对这一路先取条目自己的 `desc`
 * ＝ 报备人填的风险描述 —— 那一格的内容一个字没变，只是不再走单独一支。
 */
function rowEvidenceKind(r: QueueRow): 'hit' | 'summary' {
  if (r.source === '实时监控' && rowHasHits(r)) return 'hit';
  return 'summary';
}

/*
 * 🔴 **原先这里有一个 `reportConcludedAt`**（报备单出结论的时刻，给 `reportedEntries` 排序用）。
 * 随「风险报备」那一档删除（2026-10-07 裁决）。
 */

/** 「结论」列 ＝ **打标结论**（高 / 中 / 低，配色由模板按等级分岔） */
function rowConclusionText(r: QueueRow): string {
  return r.tag?.result ?? '—';
}
/** 「结论人」列的两行：姓名 + 角色，取**标记人**那一对 */
function rowConclusionBy(r: QueueRow): { name: string; role: string } {
  return { name: r.tag?.by ?? '—', role: r.tag?.byRole ?? '' };
}
/** 「结论时间」列 ＝ **标记时间**；取不到写「—」 */
function rowConclusionAt(r: QueueRow): string {
  return r.tag?.at ?? '—';
}

/* ---- 「按标记人」：标记人这一维 ---- */

/**
 * 这条条目是谁打的标。**标记人是条目自己的字段**（`tag.by`），不像班组要反查工单库。
 * 🔴 空值不吞：条目能进池就必然打过标，标记人为空是数据自身的异常，
 * 落一档「未署名」摆出来 —— 吞掉的话各人之和会小于「全部有风险」，
 * 而督导正是照这一行看"谁名下压着多少条"。
 */
const UNSIGNED_TAGGER = '未署名';
function taggerOf(e: RiskQueueEntry): string {
  return e.tag?.by || UNSIGNED_TAGGER;
}

/**
 * 左栏「按标记人」展开出来的那几行。底表是**已过班组**的池内条目 ——
 * 每一行的数字就是点进去表里的行数，且**各行之和 ≡「按标记人」≡「全部有风险」**
 * （只数高 / 中 / 低，不含无风险）。条数多的排前面，同数按姓名排。
 *
 * 🔴 **不随选中的人收窄**：这几行本身就是选择器，选中一个人之后其余几行全变 0，
 * 人再也看不出该切到谁。
 */
function taggerCountsOf(list: RiskQueueEntry[]) {
  const base = inGroup(list);
  const m = new Map<string, number>();
  base.forEach((e) => {
    const who = taggerOf(e);
    m.set(who, (m.get(who) ?? 0) + 1);
  });
  return { total: base.length, map: m };
}
/**
 * 🔴 **开着「监控来源」/「原单类型」筛选时改摆「筛后 / 全量」两段式**（`countTotal`，
 * 与「待判」段那两路同一套写法）：分母留在屏幕上，各行之和 ≡ 斜杠后那个总数仍肉眼可验，
 * 而斜杠前那个数 ＝ 表里的行数。少了这一笔，左栏写着 5、表里躺着 2，正是本文件反复踩的坑。
 * 🔴 **行的清单与次序取全量那一份**：按筛后的数排序的话，换一个来源整列人名会重排，
 * 而且筛成 0 的人会整行消失 —— 选择器把自己的选项筛没了。
 */
const taggerChips = computed(() => {
  const dirty = judgedAttrDirty.value;
  const hit = taggerCountsOf(judgedFilteredUniverse.value);
  const all = dirty ? taggerCountsOf(judgedUniverse.value) : hit;
  return {
    total: hit.total,
    totalAll: all.total,
    rows: [...all.map]
      .map(([tagger, count]) => ({
        tagger,
        count: dirty ? (hit.map.get(tagger) ?? 0) : count,
        countTotal: dirty ? count : undefined,
      }))
      .sort((a, b) => (b.countTotal ?? b.count) - (a.countTotal ?? a.count)
        || a.tagger.localeCompare(b.tagger)),
  };
});

/**
 * 左栏选中的那一档，**未过班组筛选**。班组 chip 那一排的数字要靠它算 ——
 * 让班组筛选影响自己那一排的数字，选中一个组之后其余几枚全变 0，
 * 人再也看不出该切到哪一组（与 `reportSourceBase` 是同一条道理）。
 */
/*
 * 🔴 **原先这里有一个 `reportedEntries`**：「已判」段那一档「风险报备」的底表
 * （B 线已出结论的报备单，已评估 + 已撤回，且本单还没有打标结论）。
 * **整个删除**（2026-10-07 裁决）：报备只在**前台**（工单工作台「风险报备池」）展示，
 * 后台（本页）不展示。随之：
 *   · 已判表里不再有报备行；
 *   · 「已判」页签的数不再加这一档，`已判 ＝ 全部有风险`；
 *   · B 线报备单的数据照旧在 `reportStore.reports` 里，前台那一页一字不动。
 * ⚠️ 报备线定级现补的那条**标记条目**（来源「二线报备」）照旧进「全部有风险」——
 * 那是标记条目不是报备条目，见 `rowSourceText`。
 */

const queueBase = computed<QueueRow[]>(() => {
  if (queueView.value === 'monitoring') return untaggedRows.value;
  // 🔴 **两个轴同出 `judgedUniverse` 这一份行集**（已过在办过滤）：按风险等级 / 按标记人
  // 是同一批条目的两种看法，差别只在各自多一层收窄。
  // 🔴 原先还有第三个轴「按处置阶段」，已随 2026-10-07 裁决删除；
  // 工作面那张池行表的同名列也已删（2026-10-08 裁决），本页再没有「处置阶段」这个维度。
  // 🔴 **先过筛选条那两维、再过左栏那一档**，两步各只写一处（`byJudgedAttrs` /
  // `judgedPicked`）—— 左栏角标与这里同走这两个函数，故"标签写一个数、表里躺另一批"不会出现。
  return judgedPicked(judgedFilteredUniverse.value).map(rowOfEntry);
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
 * 切两视图（待判 / 已判）。**勾选不能跨视图残留**：在待判里勾了三条再切到已判，
 * 批量识别会对一批看不见的行动手（而那一批已经有结论了）。
 * 页码同理回到第一页——底表换了一批，停在第 3 页多半是一张空表。
 */
function setQueueView(v: QueueView) {
  if (v === queueView.value) return;
  queueView.value = v;
  clearBulk();
  queuePageCurrent.value = 1;
}

// 等级分档、标记人、班组，以及已判段筛选条那两维换了，底表就换了一批，页码必须回到第一页 ——
// 否则「第 3 页 → 切到中风险」会停在一张恰好没有行的页上。
watch([tagLevelFilter, taggerFilter, groupFilter, judgedSourceFilter, judgedTypeFilter], () => {
  queuePageCurrent.value = 1;
});

/**
 * 换「待标记」的切片：与 `setQueueView` 同一套善后 —— 勾选不能跨片残留
 * （在「实时监控」里勾了三条切到「重点工单」，批量识别会对一批看不见的行动手），
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
 * 🔴 **只在换路时清，换子档时不清**：清的理由是"两路的字段本来就不一样"——
 * 实时监控那一路有风险词、有原话，「重点工单」那一路一个都没有，留着上一路的条件只会让人以为筛坏了。
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
/*
 * 🔴 **`poolStageTextOf` 与 `POOL_STATE_TEXT` 都已删**（2026-10-09）：
 * 前者的界面消费端早已先后删完（左栏「按处置阶段」那一轴 2026-10-07、
 * 池行表「处置阶段」列 2026-10-08），上一版留着它只是为了替后者当门面；
 * 后者在前者删掉之后同样零调用方。两个一并清掉，grep 复验过。
 * ⚠️ **那套落库值 ↔ 界面词的对应关系没有丢**：现行在用的是 `poolStageOf`
 * （待分派→待领取 / 评估中→已领取 / 已评估→已结论，同一套，就地现算）。
 *
 * 🔴 **`rowOverdue` / `rowWaitedText` 也已删**（2026-10-09）：两者的唯一消费端是
 * 工作面池行表「等待时长」那一格，随那一列一并撤掉之后 grep 复验**零调用方** ——
 * 上一轮注释里写的"左栏条目表还在用"是**旧话**，左栏那两张表从来没有这一列。
 * 连带删掉的是 `waitedText`（只有 `rowWaitedText` 调它）与 `.rr-waited` /
 * `.rr-overdue-tag` 两组样式（模板已无使用）。
 * ⚠️ **等待时长 / 超时这件事本身没消失**：
 *   · store 的 `isOverdue` / `waitedMinutes` / `REPORT_ASSESS_LIMIT_MIN` 一个字没动；
 *   · 风险报备池（`RiskReportPoolPanel`）与工单页「风险报备」Tab（`OpRiskMonitorTab`）
 *     各有自己那一份 `waitedText` 与「已超处置时限」标，照旧在用。
 */

/* ---- 批量识别（条目那一路）：**只在待判视图**（业务口径） ---- */
// 【为什么已判那个视图不给批量】它装的是**已经有结论**的条目，对这一批做的唯一一件事是
// 改判 —— 而改判必须逐条写清"为什么改"（改判时**风险备注必填**，2026-09-29 之前是
// 独立的「修正原因」那一格，已并入备注）。
// 批量改判等于绕过那道必填门，一次给一批条目追加一条没有理由的改判。
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
    // 两条路同一枚菜单项「批量识别」：「实时监控」那一路核实命中，另两路标记条目（2026-09-15 裁决）
    if (kwEvidenceView.value) openBulkVerify();
    else openBulk();
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
  if (!canRiskTag.value) { message.warning('只有客诉专员、投诉督导与管理员可以标记'); return; }
  bulkResult.value = '';
  bulkNote.value = '';
  bulkOpen.value = true;
}
function saveBulk() {
  if (!bulkResult.value) { message.warning('请先给这批条目定一个风险等级'); return; }
  const result = bulkResult.value;
  const at = nowStamp();
  const targets = bulkTargets.value;
  // 与单条走**同一个入口**（recordTag），状态迁移与留痕都在 store 里那一处，
  // 批量另写一套的话，"低/中/高进池、无风险不进池"这条门槛迟早只改一处
  // 批量只在待打标视图开（`showQueueSelection`），那一批全是 A 线条目；判一道 `r.entry` 是类型收口
  const done = targets.filter((r) => !!r.entry && reportStore.recordTag(r.entry.id, {
    result,
    note: bulkNote.value.trim(),
    by: user.current.name,
    byRole: user.role.name,
    at,
  })).length;
  if (done < targets.length) {
    message.warning(`有 ${targets.length - done} 条监控条目已不存在，未标记 —— 请刷新后再看`);
  }
  message.success(
    isPoolLevel(result)
      ? `已对 ${done} 条标记「${riskLevelText(result)}」，已进风险工单池等待领取`
      // 原来这一句末尾指路到「已判 · 无风险」档，随那一档删除一并去掉（2026-10-07 裁决）
      : `已将 ${done} 条判为无风险，不进池`,
  );
  bulkOpen.value = false;
  clearBulk();
}

/* ---- 「实时监控」那一路 · 批量识别（命中那一路）（2026-09-15 裁决） ---- */
//
// 对所选工单组上**待核实**的命中统一给 成立 + 等级 / 误报 + 风险备注，逐条走单条同一个入口
// （`riskQueue.verifyHit`）：同一张单的第一条成立即给这张单打标入池，其余几条只记命中；
// 全部误报的单按固定次序改归「重点工单」，或打为无风险。
// 命中取 `kwHitsOf`（过了当前筛选、即表里看得见的那几行），不对看不见的命中动手。
const bulkVerifyOpen = ref(false);
const bulkVerdict = ref<HitVerdict | undefined>(undefined);
const bulkVerifyLevel = ref<RiskLevel>('高');
const bulkVerifyNote = ref('');
const bulkVerifyHits = computed(() => bulkTargets.value.flatMap((r) => kwHitsOf(r)));
/** 所选组里没有待核实命中的单（这一档里不该有，兜数据异常）：批量识别（命中那一路）不处理，逐单走「风险识别」 */
const bulkVerifySkipped = computed(() => bulkTargets.value.filter((r) => !kwHitsOf(r).length).length);
const canSaveBulkVerify = computed(
  () => canRiskTag.value && !!bulkVerdict.value && bulkVerifyHits.value.length > 0,
);

function openBulkVerify() {
  if (!canRiskTag.value) { message.warning('只有客诉专员、投诉督导与管理员可以标记'); return; }
  bulkVerdict.value = undefined;
  // 等级默认取所选命中里**词表预设最高**的那一档：宁可让人往下调，也不让一批里的高危词被默认压低
  bulkVerifyLevel.value = bulkVerifyHits.value.reduce<RiskLevel | null>(
    (best, h) => (!best || GRADE_ORDER[h.level] < GRADE_ORDER[best] ? h.level : best),
    null,
  ) ?? '高';
  bulkVerifyNote.value = '';
  bulkVerifyOpen.value = true;
}

function saveBulkVerify() {
  if (!canRiskTag.value) { message.warning('无标记权限'); return; }
  const verdict = bulkVerdict.value;
  if (!verdict) { message.warning('请先判定所选命中是否成立'); return; }
  // 先取快照：逐条核实的过程中命中陆续离开召回清单，`bulkVerifyHits` 会跟着变
  const hits = bulkVerifyHits.value.slice();
  if (!hits.length) { message.warning('所选工单上没有待核实的命中'); return; }
  const skipped = bulkVerifySkipped.value;
  const base: TagEntry = {
    level: verdict === '误报' ? null : bulkVerifyLevel.value,
    verdict,
    note: bulkVerifyNote.value.trim(),
    by: user.current.name,
    byRole: user.role.name,
    at: nowStamp(),
  };
  let tagged = 0;
  let rerouted = 0;
  let noRisk = 0;
  hits.forEach((h) => {
    const o = riskQueue.verifyHit(h, { ...base, verdict });
    if (o.kind === 'tagged') tagged += 1;
    else if (o.kind === 'rerouted') rerouted += 1;
    else if (o.kind === 'noRisk') noRisk += 1;
  });
  const parts = verdict === '成立'
    ? [`已核实 ${hits.length} 条命中为「成立 · ${levelText(bulkVerifyLevel.value)}」`,
      ...(tagged ? [`${tagged} 单已标记并进风险工单池等待领取`] : [])]
    : [`已将 ${hits.length} 条命中记为误报`,
      ...(rerouted ? [`${rerouted} 单改归「重点工单」`] : []),
      ...(noRisk ? [`${noRisk} 单已标记为无风险`] : [])];
  message.success(parts.join('；'));
  if (skipped) message.warning(`${skipped} 单没有待核实命中，未处理，请逐单标记`);
  bulkVerifyOpen.value = false;
  clearBulk();
}

/* ---- 单条风险打标：四选一（高 / 中 / 低 / 无风险） ---- */
//
// 🔴 **它与「核实打标」不是一回事**，两个弹窗各答各的问题：
//   · 本弹窗（条目）—— "**这张单有没有风险、多大**"。四选一，低/中/高进池、无风险不进池。
//   · 命中打标弹窗（`openTag`）—— "**这次命中准不准**"。成立/误报 + 定级，回填词表准确率。
// 两者的衔接只有一处（2026-09-15 裁决，store 的 `verifyHit`）：**未打标**工单上首次成立即由核实给这张单打标入池，
// 全部误报则改归或打为无风险；工单一旦有了打标结论，之后的核实与修正只改命中，条目要改走本弹窗。
const entryTagOpen = ref(false);
const entryTagTarget = ref<QueueRow | null>(null);
const entryTagResult = ref<RiskTagResult | ''>('');
/**
 * 本次标记的**风险备注**。
 *
 * 🔴 **原来它旁边还有一格必填的「修正原因」，2026-09-29 裁决已取消**（两格用途重叠）。
 * **取消的是字段、不是约束**：原先"修正必须填修正原因"那道硬校验**迁到本格** ——
 * **改判时风险备注必填**，首次标记仍可选。
 * 故本格在改判形态下**不预填上一次那条**，否则上一次的备注会自动满足这一次的必填
 * （`entryTagDirty` 随之把"空备注"排除在"动过"之外，见下）。
 */
const entryTagNote = ref('');
/**
 * 已经打过标的再打开就是修改：按钮文案与必填项随之不同。
 * **图标恒定**（盾牌 `SafetyCertificateOutlined`）；**标题不随"首次 / 修改"变、只随入口变**
 * （见 `entryTagModalTitle`：待判段写「风险识别」、已判段写「风险管控」，2026-10-07 裁决）。
 */
const entryTagAmend = computed(() => !!entryTagTarget.value?.tag);
/**
 * 「风险管控」弹窗（条目打标形态）的**副标题 ＝ 来源 · 单号**，与评估弹窗
 * （`assessSubtitle`）、工单页页头那一枚逐字同形。来源取条目自带的身份标，不另造词。
 */
const entryTagSubtitle = computed(
  () => (entryTagTarget.value ? `${rowSourceText(entryTagTarget.value)} · ${entryTagTarget.value.ticketNo}` : ''),
);
/** 完整标记历史（含二次修改），时间正序。走 store 的 `tagHistoryOf`，与命中核实同一套留痕机制 */
const entryTagHistory = computed(
  () => (entryTagTarget.value ? reportStore.tagHistoryOf(entryTagTarget.value.id) : []),
);
/**
 * 值没变就不该追加一条空修改，否则历史会被无意义的记录稀释。
 * 备注那一项判的是"**填了东西且与上一条不同**"：改判形态下本格从空开始（见 `entryTagNote`），
 * 若照旧直接比较，一打开就成了"动过"。
 */
const entryTagDirty = computed(() => {
  const cur = entryTagTarget.value?.tag;
  if (!cur) return true;
  const note = entryTagNote.value.trim();
  return entryTagResult.value !== cur.result || (!!note && note !== cur.note);
});
/**
 * 这条条目已出结论：「无风险」一档置灰（《【930】》§5A.3 改判规则；store 侧 `recordTag` 同样拒绝）。
 * 读条目上的现行状态，不读行快照。
 */
const entryTagNoRiskLocked = computed(
  () => !!entryTagTarget.value?.entry && !canTagNoRisk(entryTagTarget.value.entry.status),
);
function pickEntryTagResult(r: RiskTagResult) {
  if (r === NO_RISK && entryTagNoRiskLocked.value) { message.warning(NO_RISK_LOCKED_TIP); return; }
  entryTagResult.value = r;
}

/**
 * 「风险等级 + 风险备注」那一段交给**六处共用**的 `RiskLevelFields` 渲染
 * （2026-09-29 裁决「风险等级段收敛成一份共享件、一种呈现」）。
 *
 * 🔴 **只是把既有状态包一层给组件看**：本形态是对**具体条目**做的事，落库走
 * `saveEntryTag` 里那条既有路径（不是 `recordTagFor(ticketNo)`），state、校验与写库一格未动。
 * · `setLevel` 走 `pickEntryTagResult` —— 那一步原本就带着置灰档的拦截，不能绕过；
 * · `required`：本来没有等级才标必填（原先恒标必填星，但"已有等级"形态下值本来就预置着、
 *   那道星从不落到 `canSaveEntryTag` 上，故口径统一不改变任何实际可提交性）；
 * · `missLevel` / `missNote` 恒假：本弹窗靠主按钮 disabled 拦，从来不出这两行红字。
 */
const entryTagLevelView = makeRiskLevelFieldsView({
  getLevel: () => entryTagResult.value,
  setLevel: (r) => pickEntryTagResult(r),
  getNote: () => entryTagNote.value,
  setNote: (v) => { entryTagNote.value = v; },
  visible: computed(() => true),
  isAmend: entryTagAmend,
  required: computed(() => !entryTagAmend.value),
  missLevel: computed(() => false),
  missNote: computed(() => false),
  noRiskLocked: entryTagNoRiskLocked,
});

/**
 * 这一枚条目弹窗是从**哪个入口**点开的。`untagged` ＝ 待判段（重点工单富列表行、
 * 召回清单里无待核实命中的行），`judged` ＝ 已判段条目表行。
 *
 * 🔴 它同时是下半「风险处理措施」段的**第一道门**（见 `showEntryTagAssess` /
 * `showEntryTagCollab`），故声明排在那两道门之上。
 */
type EntryTagFrom = 'untagged' | 'judged';
const entryTagFrom = ref<EntryTagFrom>('untagged');

/* ---- 「风险管控」弹窗（已判段入口）下半的「风险处理措施」段 ---- */
//
// 🔴 **只在 `entryTagFrom === 'judged'` 这一路出**（2026-10-07 裁决）：待判段打开的那一枚
// 叫「风险识别」，它只答"有没有风险、多大、风险备注写什么"；处置怎么做是下一步的事，
// 归「风险管控」。原先那条"标完顺手给结论、条目直接落「已结论」"的捷径随之取消 ——
// 待判段提交后条目照原路进池落「待领取」，一个字的结论都不落。

/**
 * 段内的评估决策。**空 ＝ 不评估**，提交就是原来的那一下打标。
 * 条目已有结论时打开即**灌着现行结论**（见 `openEntryTag`），此时留空这一档人点不回去
 * —— 那正是"已有结论"本身，不是"不评估"。
 */
const entryTagAssessDecision = ref<AssessDecision | ''>('');
const entryTagAssessTried = ref(false);
/**
 * 段出不出。第一道门是**入口**（只归已判段）；其后承载体就是本弹窗这条条目本身 ——
 * 打标为高 / 中 / 低之后它必进池（`recordTag` 的迁移表：实时监控中 / 已标记无风险 →
 * 待分派，池内三态原地不动）。
 * 🔴 **已出结论的条目照样出**（2026-10-07 裁决取消了「还没出过结论」那道门）。
 */
const showEntryTagAssess = computed(() => entryTagFrom.value === 'judged' && showTagAssessFor(
  entryTagTarget.value?.entry ?? null,
  !!entryTagResult.value && isPoolLevel(entryTagResult.value),
));

/**
 * 本条目**已经派生过**的那张投诉单号；没派生过为 undefined。
 *
 * 🔴 **派生这件事的既有真源就是它**（`ReportAssessment.escalatedToNo`，条目结论上那一格），
 * 本轮不新造字段。它同时管三件事：决策锁死、「不升级」置灰的理由、
 * 以及 `commitTagAssess` 里"这一次还要不要造单"。
 */
const entryTagDerivedNo = computed(() => entryTagTarget.value?.entry?.assessment?.escalatedToNo);
/**
 * 「不升级」那一档置灰。做法照「无风险」置灰那一处：**挡住 + 说清为什么**
 * （`NO_RISK_LOCKED_TIP` 既做 title 也做脚注），不是悄悄禁用。
 *
 * 【为什么必须锁】「升级」那一支已经造出了一张真的投诉单，改回「不升级」既撤不掉那张单、
 * 也没有任何动作去撤 —— 屏幕上会出现"结论：不升级"而池行里挂着一个派生单号。
 */
const entryTagNoDowngradeLocked = computed(() => !!entryTagDerivedNo.value);
const entryTagNoDowngradeTip = computed(
  () => `本单已派生投诉单 ${entryTagDerivedNo.value ?? ''}，无法改回不升级`,
);

/**
 * 选「升级」后那一段投诉专属字段（投诉一类 / 二类 / 升级说明）的显隐，判据与评估弹窗共享。
 *
 * 🔴 **已派生过就不出**：那一段是**建新单的要素**，而这一次不造新单 ——
 * 摆出来等于让人把一类 / 二类重填一遍再丢掉，三项必填还会把提交挡住。
 * 这一路的结论正文改由下面那一格「升级说明」渲染（见 `showEntryTagAssessAdvice`）。
 */
const showEntryTagAssessEscalate = computed(() =>
  !entryTagDerivedNo.value
  && showEscalateComplaintFields(entryTagAssessDecision.value, entryTagTarget.value?.ticketNo),
);
/**
 * 结论正文那一格自己出不出。**选了决策、而投诉专属字段那一段没出**时由它承载 ——
 * 「不升级」恒走这一路；「升级」只在已派生过（段不出）那一路走这里，
 * 否则正文那一格在段内（`EscalateComplaintFields` 的「升级说明」），两处写的是同一个格子。
 */
const showEntryTagAssessAdvice = computed(
  () => !!entryTagAssessDecision.value && !showEntryTagAssessEscalate.value,
);
/** 这一格的标签与占位：与评估弹窗（`assessAdviceLabel` / `assessAdvicePlaceholder`）逐字一致 */
const entryTagAssessAdviceLabel = computed(
  () => (entryTagAssessDecision.value === '升级' ? '升级说明' : '处理意见'),
);
const entryTagAssessAdvicePlaceholder = computed(
  () => (entryTagAssessDecision.value === '升级'
    ? '写清升级理由与后续处置安排…'
    : '告知报备人为什么不升级、可以怎么继续处理…'),
);
/** 结论正文那一格的红字，提示文案与评估弹窗逐字一致 */
const missEntryTagAssessAdvice = computed(
  () => entryTagAssessTried.value && !!entryTagAssessDecision.value && !assessAdvice.value.trim(),
);
/**
 * 这一段**动过没有**。没结论的条目沿用老判据（选了决策＝要评估）；
 * 已有结论的条目一打开就灌着现行值，照老判据会恒为"动过"——于是主按钮永远亮着、
 * 一点就往履历里再追加一条与上一条逐字相同的结论。故已结论那一路比的是
 * **决策或正文真的变了**，与上半 `entryTagDirty` 同一条口径。
 */
const entryTagAssessDirty = computed(() => {
  if (!entryTagAssessDecision.value) return false;
  const cur = entryTagTarget.value?.entry?.assessment;
  if (!cur) return true;
  return normalizeDecision(cur.decision) !== entryTagAssessDecision.value
    || assessAdvice.value.trim() !== (cur.advice ?? '').trim();
});

/* ---- 「风险管控」弹窗下半的**投诉支**：协同处理（判出高 / 中 / 低之后接出，可留空） ---- */
//
// 🔴 字段、校验与落库整套走共享件 `useRiskCollabFields` + `RiskCollabFields.vue`
// （工单页页头「风险管控」弹窗的投诉支、风险工单池的协同处理弹窗用的是同一份）。
// 本页只负责"什么时候出这一段"与"在哪一步调 `submitTo`"，一个字段都不自己声明。
const entryTagCollab = useRiskCollabFields();
/**
 * 投诉支出不出：与评估支同一道入口门（只归已判段的「风险管控」）、同三道共用门，
 * 只在"原单是不是投诉单"这一维上相反。
 */
const showEntryTagCollab = computed(() => entryTagFrom.value === 'judged' && showTagCollabFor(
  entryTagTarget.value?.entry ?? null,
  !!entryTagResult.value && isPoolLevel(entryTagResult.value),
));
/**
 * 段内动过没有。**全空 ＝ 不协同**，提交就是原来的那一下打标（与评估支"决策留空＝不评估"同形）；
 * 动过任意一项才进这一段的校验与落库 —— 否则共享件那道「整段全空不予提交」的拦截
 * 会把只想打个标的人挡在这儿。
 */
const entryTagCollabFilled = computed(() => {
  const f = entryTagCollab.fields;
  return !!f.opinion.trim() || f.advices.length > 0 || !!f.otherAdvice.trim();
});

/**
 * 下半**给没给东西**：两支互斥，取各自那一支自己的"动过没有"判据
 * （评估支＝`entryTagAssessDirty`，协同支＝三项里动过任意一项）。
 */
const entryTagLowerFilled = computed(
  () => (showEntryTagAssess.value && entryTagAssessDirty.value)
    || (showEntryTagCollab.value && entryTagCollabFilled.value),
);
/**
 * 主按钮可用性 ＝ **上半可保存 ∨ 下半有内容**。
 *
 * 🔴 修正形态下**不能只认上半**：人从「已判」段进来，多半是为了补一条评估结论 / 协同意见，
 * 等级一个字都不必改。按老判据（改动过 ∧ 填了备注）那种人只会看到一个永远灰着的按钮。
 * 没改判就没有"为什么改"可答，故这一路也不要求备注——它只在真改判时必填。
 * 定义位置排在下半两支之后，读的顺序就是判据的顺序。
 */
const canSaveEntryTag = computed(() => {
  if (!canRiskTag.value || !entryTagResult.value) return false;
  if (entryTagResult.value === NO_RISK && entryTagNoRiskLocked.value) return false;
  if (entryTagAmend.value) {
    // 改判必须答得出"为什么改"，那句话现在写在风险备注里（「修正原因」已取消）
    return (entryTagDirty.value && !!entryTagNote.value.trim()) || entryTagLowerFilled.value;
  }
  return true;
});
/**
 * 主按钮文案：段内决策＝「升级」→「确认升级」（与三处评估弹窗一致，
 * 点下去真的会派生一张新单，按钮得说出来）；改判了等级 →「保存修正」；其余「保存」。
 */
const entryTagOkText = computed(() => (
  showEntryTagAssess.value && entryTagAssessDecision.value === '升级'
    ? '确认升级'
    : entryTagAmend.value ? '保存修正' : '保存'
));
/**
 * 打标时摆出来的**证据**：本单的风险词命中原话。
 * 「重点工单」那一路没有原话可摆，整块 v-if 掉、不留空标题。
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

/**
 * 条目弹窗的标题：待判段本单尚无风险结论，答的是"有没有风险、多大"＝**风险识别**；
 * 已判段已有结论，答的是"之后怎么处置"＝**风险管控**。
 * 入口枚举 `EntryTagFrom` 与 `entryTagFrom` 声明在上面「风险处理措施」段的门控处。
 */
const entryTagModalTitle = computed(() => (entryTagFrom.value === 'untagged' ? '风险识别' : '风险管控'));

function openEntryTag(e: QueueRow, from: EntryTagFrom) {
  // 来源每次都显式落一遍，不依赖默认值：漏一处就会拿到上一次打开时的残留标题
  entryTagFrom.value = from;
  // 报备行不走打标（它的操作列本就没有按钮），这一道是防第二个调用方绕进来
  if (!e.entry) return;
  if (!canRiskTag.value) { message.warning('只有客诉专员、投诉督导与管理员可以标记'); return; }
  entryTagTarget.value = e;
  // 修改态先把现行结论灌回来：改完才知道自己动了哪一项
  entryTagResult.value = e.tag?.result ?? '';
  // 风险备注每次从空开始：改判形态下它承载"为什么改"，预填上一次那条会让必填名存实亡
  entryTagNote.value = '';
  // 下半两支先各自清干净：评估支决策不选＝不评估、协同支全空＝不协同，
  // 两边的字段与红字各由自己那份共享实例 reset 一次清完
  entryTagAssessDecision.value = '';
  entryTagAssessTried.value = false;
  escalateFields.reset();
  entryTagCollab.reset();
  /*
   * 🔴 **已出结论的非投诉单：把现行结论灌回来**（2026-10-07 裁决，与「风险等级」段
   * 预置现值同一个做法）。不灌的话，人一打开看到的是一张空表 —— 既读不出"现在判的是什么"，
   * 又会把"只改一句处理意见"变成"把结论整个重填一遍"。
   * 正文那一格值在 `escalateFields.fields.advice` 上（`assessAdvice` 是它的读写代理），
   * 故必须排在 `escalateFields.reset()` **之后**，否则刚灌的值当场被清掉。
   * 投诉支不灌：它的历次协同记录另有落点（`stores/riskCollab.ts`），
   * 且那一支本来就是"每次新写一条意见"，本轮一格不动。
   */
  const cur = e.entry.assessment;
  if (cur && !isComplaintTicket(e.ticketNo)) {
    entryTagAssessDecision.value = normalizeDecision(cur.decision);
    assessAdvice.value = cur.advice ?? '';
  }
  entryTagOpen.value = true;
}

function saveEntryTag() {
  const target = entryTagTarget.value;
  // 打标只对 A 线条目开（报备行的操作列写「—」，见条目表），故这里必有 `entry`
  if (!target?.entry) return;
  if (!canRiskTag.value) { message.warning('无标记权限'); return; }
  if (!entryTagResult.value) { message.warning('请先选择风险等级'); return; }
  const amend = entryTagAmend.value;
  /*
   * 这一次到底要做哪几件事，**在任何校验之前先认清**：
   *   · `retag` —— 上半那一下打标落不落。首次打标必落；修正形态只在结论真的动过时才落，
   *     没动过还落一遍，标记历史里就多一条与上一条逐字相同的记录、条数还虚增。
   *   · `assessDec` / `collab` —— 下半两支各自给没给东西（留空＝不做那一支，与首次打标同形）。
   * 三者全空才是"什么都没发生"，才拦；只要下半有一支有内容，这一次就是成立的提交。
   */
  const retag = !amend || entryTagDirty.value;
  // 评估支：**动过才算这一次给了结论**（已结论的条目一打开就灌着现行值，见 `entryTagAssessDirty`）
  const assessDec = showEntryTagAssess.value && entryTagAssessDirty.value
    ? entryTagAssessDecision.value
    : '';
  const collab = showEntryTagCollab.value && entryTagCollabFilled.value;
  // 文案说「风险标记」而不是「风险等级」：判据是 `entryTagDirty`（等级**或**风险备注动过），
  // 写成「风险等级」比判据窄 —— 只改了备注的人会被告知"等级没变"，对不上自己刚做的事。
  // 「风险标记」指的是上半那两项本身（等级 + 风险备注），不是本弹窗的名字（弹窗叫「风险管控」）。
  if (!retag && !assessDec && !collab) { message.warning('风险标记没有变化，无需修改'); return; }
  // 「为什么改」只在**真的改判**时才问得出口：没改判的那一路不要它。
  // 「修正原因」已取消，那句话现在写在风险备注里（约束迁移，不是取消）
  if (retag && amend && !entryTagNote.value.trim()) { message.warning('请填写风险备注'); return; }
  const prev = target.tag?.result;
  const result = entryTagResult.value;
  // 读条目上的现行状态，不读行快照：弹窗开着的这段时间里别人可能已经给了结论
  const prevStatus = target.entry.status;
  if (!isPoolLevel(result) && !canTagNoRisk(prevStatus)) { message.warning(NO_RISK_LOCKED_TIP); return; }
  /*
   * 「评估结论」段的校验与提交前重查。**段不出 / 决策留空一律不跑**（提交＝只打标，原行为）。
   * 🔴 **整个跑在任何写入之前**：拦下时打标那一下也不该发生 ——
   * 人只是漏填了升级说明，不该换来一条已经进了池、却没有结论的条目。
   */
  if (assessDec) {
    entryTagAssessTried.value = true;
    if (!tagAssessFieldsOk(showEntryTagAssessEscalate.value)) return;
    // 提交前重查：条目还在不在 / 已被报备人撤回 → 整次拦下；原单已进终态 → 只拦「升级」。
    // 🔴 **这一路不拦"已有评估结论"**：那道门已被 **2026-10-07 裁决取消**
    // （风险会变大，不升级得改成升级，推翻 §9 规则 22「提交即固化」），
    // 判据与注释都在 `useRiskReportAssess.tagAssessSubmitBlockOf` 里写着 ——
    // **是有意放行重提，不是漏了一道**。
    // ⚠️ 与工作面那一处不同：那边撤了领取，"已出结论 ⇒ 拦下"在那边是**接并发**的那道闸
    // （见 `workbenchAssessBlockOf`），两处要的不是同一件事。
    const block = tagAssessSubmitBlockOf(target.entry.id, assessDec, target.ticketNo);
    if (block.tip) {
      message.warning(block.tip);
      if (block.closeModal) entryTagOpen.value = false;
      return;
    }
  }
  /*
   * 投诉支同理**整个跑在任何写入之前**：终态判据取共享的 `isRiskTicketEnded`（`submitTo`
   * 里那一道与这里是同一个函数），「其他」那一项的条件必填校验取共享件的 `validate()`。
   * 🔴 拦下时打标那一下也不该发生 —— 人只是漏填了「其他」的具体建议，不该换来一条已经进了池、
   * 却没有协同意见的条目。
   */
  if (collab) {
    if (isRiskTicketEnded(target.ticketNo)) { message.warning('本单已结束，无法协同处理'); return; }
    if (!entryTagCollab.validate()) return;
  }
  // 没改判就不落打标：条目本就带着结论、早已在池里，下半两支找得到它（见下方两处注释）
  if (retag) {
    const ok = reportStore.recordTag(target.entry.id, {
      result,
      note: entryTagNote.value.trim(),
      by: user.current.name,
      byRole: user.role.name,
      at: nowStamp(),
    });
    if (!ok) { message.warning('这条监控条目已不存在，请刷新后再看'); return; }
  }
  // 段内给了结论：条目照常进池，但**直接落「已结论」**（结论人＝标记人、结论时刻＝本次提交时刻）
  const assessPhrase = assessDec ? commitTagAssess(target.ticketNo, assessDec) : '';
  /*
   * 投诉支的落库**整个在共享件里**（`submitTo`：提交前重查 + `riskPool.coordinate` +
   * 成功 / 拦截提示 + "首次协同转已结论"那半句）。本页不复述它的任何一条判据，
   * 也不另发一条协同的成功提示 —— 两个入口做的是同一件事（基线 ※29 /《【930】》§5C）。
   * 🔴 **在 `recordTag` 之后调**：条目正是被那一步送进池的，`submitTo` 要在池里找得到它。
   */
  const collabOk = collab ? entryTagCollab.submitTo(target.ticketNo) : false;
  entryTagOpen.value = false;
  /*
   * 提示必须把**去向**说出来，不能只说"保存成功"：打标的人做完这一步会以为事儿结了，
   * 而低/中/高的那一批其实刚进池、还等着有人领了给评估结论。
   * 去向按**保存前**的状态分：池内条目改等级不挪位置；待领取 / 已领取改判无风险即出池
   * （已领取的承办人一并清空，见 store 的 `recordTag`）。
   */
  const no = target.ticketNo;
  /*
   * 上半没落（没改判、只提交了下半）：这一次发生的事里没有"打标"，一个字都不能提。
   *   · 评估支 —— `commitTagAssess` 返回的是接在打标那句后面的半句（以「并」起头），
   *     这一路没有前半句，去掉那个「并」自己成句；它返回空串就是一个字都没写，不报成功。
   *   · 协同支 —— 提示由共享件 `submitTo` 自己那条发（含"已转已结论"那半句），本页不复述。
   */
  if (!retag) {
    if (assessPhrase) message.success(`已为 ${no} ${assessPhrase.replace(/^并/, '')}`);
    return;
  }
  const prevText = prev && isPoolLevel(prev) ? riskLevelText(prev) : prev;
  let tip: string;
  if (isPoolLevel(result)) {
    const lv = riskLevelText(result);
    // 段内给了结论时去向已经是「已结论」，下面那几句"等领取 / 处置阶段不变"一句都不成立
    if (assessPhrase) tip = `已对 ${no} 标记「${lv}」，${assessPhrase}`;
    // 协同支的去向由 `submitTo` 自己那条提示接着说（含"已转已结论"那半句），这里只报打标
    else if (collabOk) tip = `已对 ${no} 标记「${lv}」`;
    else if (prevStatus === '评估中' || prevStatus === '已评估') tip = `已把 ${no} 的风险等级改为「${lv}」，池内处置阶段不变`;
    else if (prevStatus === '待分派') tip = `已把 ${no} 的标记由「${prevText}」改为「${lv}」，仍在风险工单池等待领取`;
    else if (prevStatus === '已标记无风险') tip = `已把 ${no} 改判为「${lv}」，已补进风险工单池等待领取`;
    else tip = `已对 ${no} 标记「${lv}」，已进风险工单池等待领取`;
  // 🔴 改判为无风险的那三句原来末尾都指路到「已判 · 无风险」档。那一档随 2026-10-07 裁决
  // 删除（无风险不进已判、离开漏斗），指路一并去掉；**改判为无风险即离开已判**这件事
  // 要说出来 —— 人在已判表里点的「风险管控」，改判之后那一行会从表里消失，不说一句就成了"行丢了"。
  } else if (prevStatus === '评估中') {
    tip = `已把 ${no} 改判为无风险，已撤出风险工单池、承办人已清空，已离开「已判」`;
  } else if (prevStatus === '待分派') {
    tip = `已把 ${no} 改判为无风险，已撤出风险工单池，已离开「已判」`;
  } else if (prevStatus === '已标记无风险') {
    tip = `已更新 ${no} 的无风险标记`;
  } else {
    tip = `已将 ${no} 判为无风险，不进池`;
  }
  message.success(tip);
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
// 四组全部落在**监控条目**这个分母上，故整块并进页头左栏「实时监控」，
// 不另起第四块卡区——四块并排会把每块压到读不出数字的宽度，而三块的骨架现成。
//
// 🔴 每一个数都从现有 store 现算，**不预置任何写死的统计数字**：写死的数会在打完一次标之后
// 与列表当场对不上，而这一屏的全部用处就是让督导据以判断"今天该盯哪一批"。

/**
 * 「今日发现」＝ 今天（自然日）新进入**监控队列**的条目数 —— 一律由**自动识别**纳入
 * （2026-10-08 裁决：手动筛查只做查询、不往队列里补条目，故这个数里没有"人工并入"这一路）。
 * 只数 A 线条目，按进队时刻 `at` 切日；条目此刻是哪个状态（待打标 / 已入池 / 已标记无风险）都算
 * —— 这三个状态是 A 线条目的全集。二线报备不计入。
 *
 * 🔴 **这一块照旧含无风险**（2026-10-07 裁决的逐处判定之一，没有一刀切）：
 * 它数的是"今天**进来**多少条"，切日靠 `at`（进队时刻），与这条条目后来被判成什么、
 * 进不进漏斗的已判段毫无关系。把无风险剔出去，这个数就不再是"今天发现多少"，
 * 而成了"今天发现且最终有风险多少"——那是另一个问题，而且会随后来的改判回头变化。
 */
const dailyIntake = computed(() => {
  const today = todayPrefix();
  const inToday = (e: RiskQueueEntry) => e.at.startsWith(today);
  return reportStore.monitoringEntries.filter(inToday).length
    + reportStore.pooledEntries.filter(inToday).length
    + reportStore.noRiskEntries.filter(inToday).length;
});

/*
 * 🔴 **页头这一块只讲"扫描本身"，与左栏零重叠**。
 *
 * 【为什么改】左栏漏斗已经把 待判 / 已判（＝全部有风险）两个存量数完整摆在一列里了，
 * 页头再摆一遍就是**同屏重复**——两处摆同一个数，人只会去找它们为什么不一样。
 * ⚠️ 2026-10-07 之前左栏还摆着「已标记无风险」那第三个数，随「无风险」那一档一并删除。
 * 而"今天扫了几轮、扫出多少条命中、判掉了多少"这三件事左栏一个都答不了：
 * 左栏答的是**存量**（现在还堆着多少），这一块答的是**流量**（今天动了多少）。
 * 两者摆在同一屏上互相补足，才是这块卡区该有的用处。
 *
 * 【原「未打标分布」那一行删掉】它按监控来源给待打标条目分档，分母恒等于左栏的「全部待判」，
 * 是重复里最重的一处。
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
/**
 * 今日**下过结论**的条目数：含判为无风险的那一批（判无风险同样是一次结论，不能不算工作量）。
 *
 * 🔴 **这一块照旧含无风险**（2026-10-07 裁决的逐处判定之一）：它数的是**今天判了多少活**，
 * 而"判为无风险"就是一次判。剔出去之后这个数会比当天实际下过的结论少一截，
 * 而督导看它正是为了知道今天这摊活干了多少 —— 它与左栏「已判」那个数**本来就不是一个口径**：
 * 左栏答的是"有风险的累计存量"，这一枚答的是"今天的工作量流量"，两个数不相等是对的。
 */
const taggedToday = computed(() => {
  const today = todayPrefix();
  const hit = (e: RiskQueueEntry) => !!e.tag?.at.startsWith(today);
  return reportStore.pooledEntries.filter(hit).length + reportStore.noRiskEntries.filter(hit).length;
});
/**
 * 「风险标注」一行：**今日标记**结论为高 / 中 / 低的工单数。
 * 条目取 `tag.at` 落在今天的（与「今日标记」同一自然日窗口），按工单去重取最高，见 `tagLevelCountsOf`。
 *
 * 🔴 **这一行本来就不含无风险，一个字没动**（2026-10-07 裁决的逐处判定之一）：
 * 它按等级分档，而无风险不是一个等级 —— `tagLevelCountsOf` 只认高 / 中 / 低，
 * 本轮的口径收窄对它没有影响。
 */
const tagLevelToday = computed(() => {
  const today = todayPrefix();
  return tagLevelCountsOf((e) => !!e.tag?.at.startsWith(today));
});

/**
 * 工单号 → 工单（工单库）。
 * 组名由 `groupNameOf` 按它反查，取 `resolveTicketGroupNames` 的第一个名字
 * （工单列表「分组名称」列用的就是它，两处同一个口径，不另造一套分组）；查不到的落「未归组」。
 */
const TICKET_BY_NO = new Map(TICKETS.map((t) => [t.no, t]));
function groupNameOf(ticketNo: string): string {
  // 🔴 **两处都要查**，与 `ticketOf` 同一条规矩：升级派生出来的新投诉单落在 `derivedTickets` 里，
  // 只问静态工单库会把它整条判成「未归组」——它明明继承了原单的分组名。
  const t = TICKET_BY_NO.get(ticketNo) ?? derivedTickets.find(ticketNo);
  if (!t) return '未归组';
  return resolveTicketGroupNames(t)[0] ?? '未归组';
}

/* ==================== 左栏漏斗导航（本页的主导航） ==================== */
//
// 【为什么从四枚平铺页签改成一列纵向】原先的「实时监控 ｜ 手动筛查 ｜ 命中明细 ｜ 风险工单池」
// 是四枚并排的页签，而平铺页签这个形状**天生表达"四个平行的清单"**——
// 可这四者根本不平行：实时监控是上游、风险工单池是它的下游，手动筛查是往上游补货的手段，
// 命中明细则是词表准确率的旁路，压根不在这条链上。业务看完的原话是"看不懂这个漏斗和链路"，
// 症结就在这里：形状说的是并列，数据说的是流向，人只能信形状。
//
// 改成一列纵向之后，从上到下就是链路本身：
//
// ```
//   未标记 · 全部待判 ── 打标 ──▶ 已标记 · 高 / 中 / 低（＝全部有风险 ＝ 已判）
//                                  └─ 无风险 ─▶ 不进池、**离开漏斗**（左栏不列、已判不计）
// ```
//
// 上游、下游、分档、汇总全在一屏一列里。
//
// 【本轮：已判段只剩两个轴，口径收到「全部有风险」】（2026-10-07 裁决）
// 旧：`已判 ＝ 全部有风险 + 无风险 + 风险报备`（三段互斥、可相加）；
// 新：`已判 ＝ 全部有风险 ＝ 高危 + 中危 + 低危 ＝ 按标记人各项之和`。
// 删掉的三档各有各的理由：
//   · **按处置阶段**（待领取 / 已领取 / 已结论）—— 领取逻辑未闭环，且与「评估处置工作面」
//     那张池行表的「处置阶段」列是同一件事，同一个维度摆两处只会让人去找它们为什么不一样
//     （⚠️ 那一列与工作面上同名的那一排 chip 后来也一并删了，2026-10-08 裁决：没有这个定义）；
//   · **无风险** —— 判为无风险的不进已判，它离开漏斗；
//   · **风险报备** —— 报备只在**前台**（工单工作台「风险报备池」）展示，后台不展示。
// 于是已判段只剩两个轴：**按风险等级（全部有风险）** 与 **按标记人**，两者总数恒等。
// 链路真实只有两段：还没下结论 → 已下结论。
//
// 🔴 **两段同为在办口径**（2026-10-08 拍板：已判也改在办）：
// 未标记 ＝ 在办 ∧ 还没下结论、已标记 ＝ 在办 ∧ 已标注风险等级（高 / 中 / 低），
// 判据逐字同一个（`isLiveRow`），原单一进终态两段都退出。
// 🔴 **但两段的数仍不构成递减、不可相减**：两批**互斥**（有没有结论），没有父子关系；
// 页签之间那枚「▸」表达的是工作流方向，不是数量关系。
//
// 🔴 **手动筛查与命中明细不在这一列里**：它们不是链上的一段。前者是"往「全部待判」里补货、给两路规则兜底"的动作、
// 后者是命中记录（另一个分母）的旁路明细，两者都退成右上角的次级入口。
// 摆回这一列会重新犯"把不平行的东西摆成平行"这个错。
//
// 【三组九档 → 三组十二档】业务补充口径之后，前两组各自长出了自己的维度：
//   · 「未标记」拆两路 —— 实时监控 / 重点工单（见 `UntaggedSlice`）；
//   · 「已标记」在等级之外多一个**按标记人**看的切面（老系统里那张「监控人员 · 数量」表）。
// 🔴 两组新增的那几档都是**同一批条目的切面，不是新的来源类别**：
//   前者之和恒等于「全部待判」、后者与「全部有风险」是同一批行，故都摆在各自汇总项的近旁，
//   且在组标题的悬停里写明"不可相加"——摆成并列而不说清楚，人第一反应就是把数加起来。
/**
 * 左栏每一行的键。**它同时是路由的目的地和选中态的判据**，故格式要能表达两级：
 * `untagged:<切片>` 是切面行本身，`untagged:<切片>:<子档>` 是它下面那一档。
 */
// 🔴 **原先还有 `'noRisk'` / `'reported'` / `'stage:all'` / `stage:${string}` 四类键**，
// 随「无风险」「风险报备」「按处置阶段」三档一并删除（2026-10-07 裁决）。
type RailKey =
  | `untagged:${UntaggedSlice}` | `untagged:${UntaggedSlice}:${string}`
  | 'level:高' | 'level:中' | 'level:低' | 'level:all' | 'level:tagger'
  | `tagger:${string}`;

interface RailItem {
  key: RailKey;
  label: string;
  count: number;
  /**
   * 这一档的**全量**（未过「未标记」那条筛选）。只有**被筛的那一路**才给它，
   * 给了就渲染成「筛后 / 全量」两段式，如「2 / 11」。
   *
   * 【为什么要有它】筛选只收窄当前这一路，页签数却是两路全量，于是开着筛选时
   * `两路之和 ＝ 页签数` 这条恒等式在屏幕上会变成 `7 + 2 ≠ 28`。
   * 两条路都不好走：只让角标跟着变，屏幕上就真有一处数字打架，全靠悬停解释；
   * 让页签也跟着变，`28 → 9` 又会被读成"另一路少了 19 条"。
   * 两段式把**分母摆回屏幕上**：斜杠后那个数就是这一路的全量，
   * `7 + 21 ＝ 28` 肉眼可验；斜杠前那个数仍然 ＝ 表里的行数（铁律一）。
   *
   * 🔴 **只给被筛的那一路**：未被筛的路与子档保持单个数，否则满屏斜杠，
   * 人反而看不出到底哪一路被收窄了。
   */
  countTotal?: number;
  /**
   * **缩进层级 ＝ 这一行与上一行的关系**，是这一列唯一的视觉语法：
   *   · `0` 不缩进 + 字重加粗 —— 本阶段的全量，或与它**并列的另一种分类**
   *         （「已标记」段的两个分类：全部有风险 / 按标记人）；
   *   · `1` 缩进一级 + 常规字重 —— 上面那个分类的**取值行**（换个角度看同一批，不是下一步）；
   *   · `2` 缩进两级 + 更小字号 —— 取值行里再展开的一层（现在只剩「未标记」段的子档用得到）。
   * 🔴 没有这条语法的话，「预警词命中」与「已领取」在一列里长得一模一样，
   * 而前者是"同一批的一部分"、后者是"某个分类下的一个取值"，人只能信形状。
   */
  depth: 0 | 1 | 2;
  /** 数字标红：这一档堆着没人管就是要被看见的 */
  bad?: boolean;
  /** 可展开（现在只剩「按标记人」这一个分类）：给一个方向箭头，别让人以为它和「高危」是一类 */
  expandable?: boolean;
  expanded?: boolean;
  /*
   * 🔴 **原先还有一个 `sep?: boolean`**（上方补一条细分隔线），只给「无风险」那一档用 ——
   * 它是漏斗的漏出口、与"下一段"读起来必须不一样，故与 depth 分开表达。
   * 那一档删除之后这一列**没有第二个使用方**，字段连同模板里那条分隔线与它的样式一并删掉。
   */
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
 * 真正成立的恒等式全在段内（两路之和 ＝ 全部待判；两个轴的总数相等 ＝ 已判页签数），验收核那几条。
 */
type FunnelStage = 'untagged' | 'tagged';

interface RailGroup {
  stage: FunnelStage;
  /** 无障碍与侧栏 aria 用的全称（未标记 / 已标记） */
  title: string;
  /** 阶段切换器上的两字简称，省左栏宽度；语义见 title + title2 */
  segLabel: string;
  /** 阶段的悬停说明：这一段在链路上是什么、分母是什么。原先挂在组标题上，组标题删了之后挂到页签上 */
  title2: string;
  /**
   * 页签上的**阶段总数**。
   * 🔴 「已标记」这一段的总数**就是「全部有风险」**（2026-10-07 裁决：已判 ＝ 全部有风险）：
   * 判为无风险的离开漏斗、报备不在后台展示，两者都不进这个数。
   * 上一版它是 `全部有风险 + 无风险 + 风险报备` 三段互斥之和，那两档删掉之后
   * 这个数必须跟着收 —— 不收的话页签上的数会比侧栏两个轴各自的总数都大，而侧栏里再也没有那一截。
   */
  total: number;
  /** 切到这一段时侧栏落在哪一档。切页签不保留上一段的选中态，一律回默认档 */
  defaultKey: RailKey;
  items: RailItem[];
}

/*
 * ==== 已判段的两个派生值 · 本页**唯一一份** ====
 *
 * 🔴 **页头「风险工单」块与左栏「已判」段同取这两个，两处的数恒等**：
 *     · 页头「风险工单总数」 ≡ 左栏已判页签 ≡ 左栏「全部有风险」      → `pooledAllCount`
 *     · 页头「高危 / 中危 / 低危」 ≡ 左栏那三档                      → `pooledLevelCount`
 * 🔴 **改一处必须两处一起改**，也就是说：要改口径只能改这两个函数，
 *     不许在页头另写一份计数。页头与左栏同屏，各数各的必然分叉，
 *     而"同屏两个「高危」不同数"正是 2026-10-07 这一轮要治的病
 *     （被删掉的 `liveTagLevelCounts` 就是那个病例：它按工单去重取最高，与左栏天生不等）。
 * 🔴 两者都已过班组筛选（`inGroup`），故切班组时页头与左栏同进同退。
 * 🔴 两者的底表都是 `judgedUniverse`（**已过在办过滤**，2026-10-08 拍板），
 *     不是 `reportStore.pooledEntries` 那一整份 —— 口径只在那一个 computed 里定义一次，
 *     页头这四个数因此跟着一起变，"页头 ≡ 左栏已判"不需要另外对账。
 */

/** 已判段总数 ＝ 在办且已标注等级的条目（已过班组筛选）。页头「风险工单总数」与左栏已判页签同取它 */
const pooledAllCount = computed(() => inGroup(judgedUniverse.value).length);

/** 已判段里某一等级的条目数（已过班组筛选）。判档读现行 `tag.result`，与池内状态无关 */
function pooledLevelCount(lv: RiskLevel) {
  return inGroup(judgedUniverse.value.filter((e) => e.tag?.result === lv)).length;
}

/*
 * 🔴 **上面两个是「全量」口径，下面两个是「筛后」口径**，两者的差别只在
 * 已判段筛选条那两维（监控来源 / 原单类型）过没过。
 *
 * 【为什么必须分两份】
 *   · **页头「风险工单」那四枚卡取全量那一份** —— 它与左栏已判段**恒等**是一条硬约束，
 *     而那一块按设计只跟「班组」走、不跟这条筛选条走。让它跟着新维变，恒等式当场断。
 *   · **左栏各档取筛后那一份当 `count`、全量那一份当 `countTotal`**，开着筛选时摆成
 *     「筛后 / 全量」两段式（与「待判」段那两路逐字同一套写法）：斜杠前 ＝ 表里的行数，
 *     斜杠后仍 ＝ 页头那个数，恒等式落在斜杠后那一侧，一眼可验。
 *   · **筛选条上「风险等级」那一格的计数直接取这两个函数**，与左栏那几档**逐字同源**
 *     —— 同一个数不在两处各算一遍。
 */
const pooledAllCountHit = computed(() => inGroup(judgedFilteredUniverse.value).length);
function pooledLevelCountHit(lv: RiskLevel) {
  return inGroup(judgedFilteredUniverse.value.filter((e) => e.tag?.result === lv)).length;
}

/**
 * 页头「风险工单」块第二行 · **已判那一批按原单类型的分布**。
 *
 * 🔴 **分母是风险工单（＝左栏已判那一批监控条目），不是「重点工单」块那一行的全部在办工单**。
 * 同一个词「工单类型」在同屏出现两次、分母不同，两行**不可相减**；各自的 title 写死分母。
 * 🔴 **与本块另外四个数走同一批条目**（`inGroup(judgedUniverse)`，即
 * `pooledAllCount` / `pooledLevelCount` 读的那一份），故 **Σ各格 ≡ 风险工单总数**
 * 由构造成立，不是事后对账凑出来的；要改口径仍然只能改那一份，不许在这里另起一条查询。
 *
 * 原单类型取 `poolTicketTypeOf` —— 池行表「原单类型」那一列同一个口径（工单库 + 派生库两处查）。
 * ⚠️ 查不到原单、或原单类型落在四类之外（刷机）的条目收进「其他」一格，**不吞**：
 * 吞掉的话各格之和会小于总数，而差的那几条谁也找不出来在哪。
 * 「其他」为 0 时整格不出现 —— 它是**余额**不是一个档，摆一个恒为 0 的格只会让人去找它是什么。
 */
const POOLED_TYPE_KEYS = ['咨询', '建议', '商机', '投诉'] as const;
const POOLED_TYPE_REST = '其他';
const pooledTicketTypeCounts = computed<Record<string, number>>(() => {
  const base: Record<string, number> = { 咨询: 0, 建议: 0, 商机: 0, 投诉: 0, [POOLED_TYPE_REST]: 0 };
  for (const e of inGroup(judgedUniverse.value)) {
    const t = poolTicketTypeOf(e);
    base[(POOLED_TYPE_KEYS as readonly string[]).includes(t) ? t : POOLED_TYPE_REST] += 1;
  }
  return base;
});
/** 实际要摆的格：四类恒摆，「其他」只在真有余额时摆 */
const pooledTypeRowKeys = computed<string[]>(() => (
  pooledTicketTypeCounts.value[POOLED_TYPE_REST]
    ? [...POOLED_TYPE_KEYS, POOLED_TYPE_REST]
    : [...POOLED_TYPE_KEYS]
));

/**
 * 页头「风险工单」块的下钻：进「评估处置」工作面（那张表三段首尾相接、恒摆全部条目），
 * 可带一个风险等级收窄 —— 那一块原本就是这个工作面的唯一入口（`drillReport` 是唯一的进法），
 * 换数之后**下钻能力照留**，否则领取 / 评估 / 协同整个工作面就进不去了。
 *
 * ⚠️ `poolLevelFilter` 必须在 `drillReport` 之后补：那一步先把五维放回「全部」，这里再按卡片补上。
 * ⚠️ **原先这里还有一句 `assessedTodayOnly = false`**：那个开关默认开着、界面上又没有控件能关，
 * 于是只有这条下钻能看到全量第三段。开关已随 2026-10-09 裁决整个删除
 * （「分母是已判里面的全部数据呀，与时间无关」），这一句随之去掉 ——
 * **现在无论从哪儿进工作面，第三段都是全量**，不再有两个口径。
 *
 * 🔴 **本块的卡不点亮 `on`**：卡上的数是**监控条目**（已判，含来源为「风险报备」的那一条），
 * 工作面那张表数的是**池行**且只收 A 线（`isALine` 把来源「二线报备」挡在外面）——
 * 两个数天生差着那几条。点亮 `on` 等于宣称"这个数就是这张表的分母"，那是假话；
 * 本块是**进工作面的入口**，不是工作面的一个筛选档。
 */
function drillPooled(lv: RiskLevel | 'all') {
  drillReport();
  poolLevelFilter.value = lv;
}

/*
 * 🔴 **原先这里有一个 `pooledStageCount`**，给左栏「按处置阶段」那三档供数。
 * 随该轴删除（2026-10-07 裁决）：领取逻辑未闭环，且这一维与「评估处置工作面」那张池行表
 * 的「处置阶段」列是同一件事。那一列本身也已删（2026-10-08 裁决）。
 * `poolStageStatusOf` **照旧在用**：store 的队列分档（待分派 / 评估中）与本页
 * 「操作」列的按行分岔（`poolStageOf`）都走它。
 */

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
    // 🔴 **d0**：两路提到与「已标记」段那两个分类同一层之后，这一段也只剩两级缩进。
    // 🔴 与「已标记」那两个 d0 **算法相反**：那边两个轴是同一批的两种看法、数天然相等、
    // 不可相加；这边两路互斥、可以相加，之和 ＝ 页签上那个数。
    // 同一套缩进语法承载相反的算法，故两边的 title 各写一句把算法钉死。
    depth: 0,
    expandable: true,
    expanded: open,
    title: `${title}点它展开／收起下面的子档，行本身也可选 ＝ 这一路不限子档；`
      + '两路互斥，实时监控 + 重点工单 ＝ 页签上那个数。',
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
      title: untaggedSubTitle(slice, k, label),
    })),
  ];
}

const railGroups = computed<RailGroup[]>(() => {
  // 页签上那个数 ＝ 两路之和。两路同出 `untaggedUniverse`、互斥，故这里直接取全集的条数，
  // 不去把两路加一遍：加出来的与它恒等，多写一处就多一处会分叉的口径
  const untaggedAll = inGroup(untaggedUniverse.value).length;
  // 🔴 **已判段这一个数管到底**（2026-10-07 裁决）：页签、「全部有风险」、「按标记人」
  // 三处同取它 —— 已判 ＝ 全部有风险 ＝ 高危+中危+低危 ＝ 按标记人各项之和。
  // 原先这里还取 `noRiskAll` / `reportedAll` 两个数去加页签，两档删掉之后一并取消。
  // 🔴 **第四处是页头「风险工单」块**：它同取 `pooledAllCount`，与这里恒等、改一处必须两处一起改。
  // 🔴 它是**全量**口径：已判段筛选条那两维（监控来源 / 原单类型）**不进这个数**，
  // 否则页头那一块（只跟班组走）与这里当场不等。开着那两维时各档改摆「筛后 / 全量」。
  const pooledAll = pooledAllCount.value;
  const attrDirty = judgedAttrDirty.value;
  return [
    {
      stage: 'untagged',
      total: untaggedAll,
      defaultKey: 'untagged:kw',
      title: '未标记',
      segLabel: '待判',
      title2: '【未标记】两路自动识别（实时监控 / 重点工单）捞到、还没有人给过结论的工单'
        + ' —— 此刻的存量。计数单位是工单：一单多命中聚合成一行、按一单计，不是命中条数。'
        + '🔴 两路互斥，两路之和 ＝ 这个数（恒等号，不是约等）。'
        + '🔴 它不是"整本工单库里没人标过的单"：未标记是每张单与生俱来的默认态，'
        + '那样数出来的是全部在办单、永远清不零，真该判的那批反而被淹没。'
        + '🔴 这个数与「已标记」那个数分属两批、不相减也不互校：两段同为在办口径，'
        + '差别只在有没有下过结论，两批互斥、没有父子关系。'
        // 开着筛选时被筛的那一路显示「筛后 / 全量」，斜杠后那个数仍进这个恒等式 ——
        // 数字自己把话说清楚了，这里不再补一句文字解释
        + '🔴 开着清单上那条筛选时，被筛的那一路摆成「筛后 / 全量」，斜杠后那两个数之和仍 ＝ 这个数',
      items: [
        ...untaggedSliceItems('kw', '实时监控',
          '预警词捞进来的那一路，表里是尚未标记工单上待核实的命中，按词表预设的识别风险等级分档、最重的排最前，角标数的是工单；'),
        ...untaggedSliceItems('focus', '重点工单',
          '在办的投诉类工单，或优先级为 P0 / P1 的工单，按工单优先级分档；'),
      ],
    },
    {
      stage: 'tagged',
      // 🔴 **页签数 ＝ 全部有风险**（2026-10-07 裁决）：已判 ＝ 必须标注了风险等级（高/中/低）
      // 的那一批。判为无风险的离开漏斗、报备只在前台「风险报备池」展示，两者都不进这个数。
      total: pooledAll,
      defaultKey: 'level:all',
      title: '已标记',
      segLabel: '已判',
      title2: '【已标记】**在办工单**上已经标注了风险等级（高 / 中 / 低）的条目 —— 此刻的存量。'
        + '🔴 原单进终态即退出本段（与「未标记」同一道在办判据），哪怕条目已经出过结论。'
        + '🔴 这个数与「未标记」那个数分属两批、不相减也不互校：差别在有没有下过结论，两批互斥。'
        + '这一段摆两种并列的分类：按风险等级（全部有风险）、按标记人 —— 同一批条目两个角度。'
        + '页签上的数 ＝ 全部有风险（已判 ＝ 必须标注了风险等级：高 / 中 / 低）。'
        + '🔴 高 + 中 + 低 ≡ 全部有风险 ≡ 按标记人各项之和 ≡ 页签上这个数，四处是同一批行；'
        + '🔴 判为无风险的**不在这一段**：它不进池、离开漏斗，左栏任何一段都不计它；'
        + '🔴 二线报备**不在后台展示**：它的工作面在工单工作台的「风险报备池」'
        + '🔴 开着清单上那条筛选条的「监控来源」/「原单类型」时，下面各档摆成「筛后 / 全量」，'
        + '斜杠后那个数仍 ＝ 这个数',
      items: [
        {
          key: 'level:all' as RailKey,
          label: '全部有风险',
          count: pooledAllCountHit.value,
          countTotal: attrDirty ? pooledAll : undefined,
          depth: 0,
          title: '按风险等级看这一段：高危 + 中危 + 低危 的合计 ＝ 页签上那个数（已判 ＝ 全部有风险）。'
            + '🔴 不含无风险 —— 判为无风险的不进已判、离开漏斗，算进来等于把已经排除掉的那批重新当成风险。'
            + '🔴 与「按标记人」是同一批条目的两种看法，数天然相等、不可相加',
        },
        ...RISK_LEVELS.map((lv) => ({
          key: `level:${lv}` as RailKey,
          label: riskLevelText(lv),
          count: pooledLevelCountHit(lv),
          countTotal: attrDirty ? pooledLevelCount(lv) : undefined,
          bad: lv === '高' && pooledLevelCountHit(lv) > 0,
          depth: 1 as const,
          title: `标记为${riskLevelText(lv)}、已进风险工单池的条目`,
        })),
        {
          key: 'level:tagger' as RailKey,
          label: '按标记人',
          // 🔴 恒等于「全部有风险」，**不随选中的人收窄**：它是"换一维看同一批"，
          // 而不是"看得更少了"。收窄发生在展开出来的人员行上，那几行的数字才是表里的行数。
          count: pooledAllCountHit.value,
          countTotal: attrDirty ? pooledAll : undefined,
          // 🔴 **d0，与「全部有风险」平级**：它不是「全部有风险」的第四档，
          // 而是同一批已标记条目的**另一种分类方式**（一种按风险等级看、一种按标记人看）。
          // 挂在 d1 上跟高/中/低并排时，读起来就成了"按标记人"是一个等级，那是错的。
          // 两个分类的总数因此落在同一竖列上、上下对得齐 —— "这是同一批的两种看法"一眼可见。
          depth: 0,
          expandable: true,
          expanded: taggerExpanded.value,
          title: '与「全部有风险」并列的另一种分类：同一批已标记条目换成按标记人看。'
            + '点它展开／收起下面的标记人清单；分母与「全部有风险」同一个，只数高 / 中 / 低，不含无风险。'
            + '🔴 与「全部有风险」是同一批条目的两种看法，数天然相等、不可相加',
        },
        ...(taggerExpanded.value
          ? taggerChips.value.rows.map((t) => ({
            key: `tagger:${t.tagger}` as RailKey,
            label: t.tagger,
            count: t.count,
            countTotal: t.countTotal,
            // 与高 / 中 / 低同一层：它们各自是所属分类下的取值行
            depth: 1 as const,
            title: t.tagger === UNSIGNED_TAGGER
              ? '条目上没有留下标记人 —— 不吞掉，否则各人之和会小于「全部有风险」'
              : `只看「${t.tagger}」已标记的风险工单`,
          }))
          : []),
        /*
          🔴 **原先这一段下面还有三档，2026-10-07 裁决一并删除**：

          ① **按处置阶段**（第三个轴，`stage:all` + 待领取 / 已领取 / 已结论 三行）——
             **领取逻辑未闭环**，且与「评估处置工作面」那张池行表的「处置阶段」列重复：
             同一个维度摆两处，人只会去找它们为什么不一样。
             ⚠️ 那一列与工作面上同名的那一排 chip 后来也一并删了（2026-10-08 裁决：
             业务侧没有「处置阶段」这个定义）；池内阶段现在从工作面每一行的「操作」列上读。
          ② **无风险** —— **判为无风险的不进已判**：它不进池、离开漏斗，
             左栏任何一段都不再计它、不再列它。条目照旧落库（`reportStore.noRiskEntries`），
             页头「今日发现」「今日标记」照各自口径仍然数它，只是不进这条漏斗。
             ⚠️ **这一档原来还兼着"核查漏标误判"的容器**（原悬停：「它不是回收站：
             核查漏标误判除了从这里翻出来改，没有第二条路」）。删掉之后**本页不再提供
             复核判为无风险的入口** —— 这是按业务口径的取舍，不是漏了：无风险既然不进已判，
             容器挂在已判段上就不成立。复核入口另立待办（命中明细 / 查询中心里做筛选项），
             本轮不补、也不要在这里自作主张补回来。
          ③ **风险报备** —— **报备只在前台展示**：工单工作台的「风险报备池」是它唯一的露出，
             后台（本页）不展示报备条目。报备单数据照旧在 `reportStore.reports` 里，前台那一页一字不动。
             ⚠️ 与它**不是**一回事、照旧保留的是「风险来源」列里「风险报备」那个取值：
             那一行是**来源恰好是报备的标记条目**（已打标、已进「全部有风险」），见 `rowSourceText`。
        */
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
 * 手动筛查 / 命中明细两个旁路入口不在漏斗上，故返回 null —— 那时左栏**一档都不选中**，
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
    if (tagLevelFilter.value === 'tagger') {
      // 选了某个人就点亮那一行本身，不点亮它的父行：左栏每一档的数字要等于表里的行数，
      // 而收窄之后表里躺的是那个人名下的几条
      return taggerFilter.value === 'all' ? 'level:tagger' : (`tagger:${taggerFilter.value}` as RailKey);
    }
    return tagLevelFilter.value === 'all' ? 'level:all' : (`level:${tagLevelFilter.value}` as RailKey);
  }
  // 🔴 **「评估处置」工作面不点亮左栏任何一档**（`listView === 'report'`）。
  // 它与手动筛查 / 命中明细同一类：**动作的工作面，不是漏斗的一档**——
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
  // 🔴 **原先这里还有 `noRisk` / `reported` 两支与结尾那一段 `stage:*`**，
  // 随那三档一并删除（2026-10-07 裁决）。现在这一列只通往两处：待判两路、已判两个轴。
  if (key.startsWith('tagger:')) {
    setListView('realtime');
    setQueueView('pooled');
    tagLevelFilter.value = 'tagger';
    taggerFilter.value = key.slice('tagger:'.length);
    return;
  }
  // 「全部有风险」三档与「按标记人」这一档：同一批池内条目的两种看法，同走一张条目表
  setListView('realtime');
  setQueueView('pooled');
  // 「按标记人」这一档自己也可选（＝不限定人），点它同时展开／收起下级；
  // 已经停在它上面时再点一次就收起来——这一列里它是唯一一个有下级的入口
  if (key === 'level:tagger') {
    taggerExpanded.value = !(railKey.value === 'level:tagger' && taggerExpanded.value);
    taggerFilter.value = 'all';
  }
  tagLevelFilter.value = key.slice('level:'.length) as RiskLevel | 'all' | 'tagger';
}

/**
 * 离开「按标记人」就把标记人选择放掉。
 *
 * 【为什么它与班组的处理不同】班组横跨每一档不清空，因为组是工单的固有属性，
 * 在哪一档都答得上、且每一档都摆着那一行 chip 让人看得见自己筛过。
 * 标记人这一行**只在这一档出现**：带着它切走，人在别处看不到任何"已按谁收窄"的痕迹，
 * 回来时又莫名其妙只剩几条。故这一维随档进随档出。
 *
 * 🔴 挂在 `railKey` 上而不是 `setRail` 里：页头 KPI 卡是直接写 `setQueueView` 的另一条入口，
 * 只在 `setRail` 里清的话，从卡片切走的那条路会漏掉这一步。
 */
watch(railKey, (k) => {
  if (!(k === 'level:tagger' || k?.startsWith('tagger:'))) taggerFilter.value = 'all';
});

/**
 * 当前停在漏斗的哪一段。**与 `railKey` 一样是派生值，真源仍是 `listView` / `queueView`**——
 * 🔴 顶部页签另存一个 ref 的话，页头那几枚 KPI 卡（它们直接写 `setQueueView` / `drillReport`）
 * 点下去会切了侧栏却不切页签：页签写着「待标记」，侧栏和表里躺的却是池行。
 * 本文件已经为"两套状态机分叉"付过两次账，这里不再开第二个真源。
 */
const stageOfView = computed<FunnelStage | null>(() => {
  // 池行（listView='report'）也属「已标记」：它装的是这一段条目进池之后的处置，不是第三段
  if (listView.value === 'report') return 'tagged';
  if (listView.value === 'realtime') return queueView.value === 'monitoring' ? 'untagged' : 'tagged';
  // 手动筛查 / 命中明细是旁路，不在漏斗的任何一段上
  return null;
});
/**
 * 旁路视图（手动筛查 / 命中明细）下页签停在哪一枚。
 * 那两个入口不属于任何一段，但侧栏总得渲染一段出来 —— 沿用离开漏斗前的那一段，
 * 从旁路点回侧栏时人回到自己原来待的地方，而不是被弹回「待标记」。
 */
const lastStage = ref<FunnelStage>('untagged');
watch(stageOfView, (s) => { if (s) lastStage.value = s; }, { immediate: true });
const funnelStage = computed<FunnelStage>(() => stageOfView.value ?? lastStage.value);

/** 侧栏只渲染当前这一段自己的档 —— 两段拆开之后，最长的一段也只有十几行 */
const currentRailGroup = computed<RailGroup>(() => {
  const gs = railGroups.value;
  return gs.find((g) => g.stage === funnelStage.value) ?? (gs[0] as RailGroup);
});

/**
 * 点顶部页签 ＝ 换一段，侧栏落到该段的**默认档**。
 * 🔴 不保留上一段的选中态：两段的档位互不相干，"记住上次停在高危"这种贴心
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
 * 班组这一维的底表 ＝ **当前这一路在除班组之外的全部条件下的行**，
 * 故选中某一组之后其余几组的数字不变，人还看得出该切到哪一组。
 * 条数多的排前面；同数按组名排，免得同一份数据两次进来给出两个次序。
 *
 * 🔴 **工作面这一路要过 `byPoolAttrs`**：另外四维（来源 / 原单类型 / 风险等级 / 结论）
 * 已经是同一行上并排的筛选项，班组不跟着它们收窄的话，筛到「风险处理建议」之后
 * 这一行会写着「班组 全部（14）· 来源 全部（2）· 类型 全部（2）· 等级 全部（2）· 结论 风险处理建议（2）」——
 * 同一行上第一格的分母和后面四格不是一个，读的人只能去猜哪个才是表里的行数。
 * 班组自己不在 `byPoolAttrs` 里，故不传 `skip`，天然就是"摘掉自己这一维"。
 */
const groupChips = computed(() => {
  const base: { ticketNo: string }[] = listView.value === 'report'
    ? byPoolAttrs(reportGroupBase.value)
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

/*
 * 🔴 **各维那一枚「全部」项只写「全部（N）」**（2026-10-09 裁决，业务原话「框框里保留
 * 全部(数量) 即可，宽度可以减小」）：维名已经写在这一格左边的标签上（班组 / 来源 /
 * 类型 / 等级 / 结论），控件里再写一遍「全部班组」是同一个词在同一格里说两遍，
 * 白占 52px 宽。**其余取值一个字不改**（`实时监控（2）` / `高危（5）` / `风险处理建议（2）`）。
 * ⚠️ 收窄之后每一格的 `--tbw` 要**按新的最长取值重新量**（见模板里那一段）：
 * 「等级」「类型」两格原先的最长取值就是那一枚「全部X（N）」，它一短，整格就该跟着收。
 */
/** 搜索条里的「班组」下拉：各枚数字仍取除班组之外条件下的行数（见 groupChips） */
const groupFilterOptions = computed(() => [
  { value: 'all', label: `全部（${groupChips.value.total}）` },
  ...groupChips.value.rows.map(({ group, count }) => ({
    value: group,
    label: `${group}（${count}）`,
  })),
]);

/*
 * 工作面那四个下拉（监控来源 / 原单类型 / 风险等级 / 结论）：**与「班组」同一套控件、
 * 同一副标签写法**（`全部X（N）` / `取值（N）`）。2026-10-08 裁决把四维从筛选区那几排 chip
 * 改成了与班组并排的筛选项，**筛选行为、计数口径与表的联动一个字没改** ——
 * 各项的数一律取"摘掉自己这一维"之后的底表（`reportSourceBase` 一组），
 * 否则选中一项之后其余几项全变 0，筛选器把自己筛没了。
 * 🔴 **只在「评估处置」工作面上摆**（见模板里那四格的 `v-if`）：四维是池行的属性，
 * 这条工具条另一个落点（实时监控的「重点工单」等路）摆的不是池行。
 */
const sourceFilterOptions = computed(() => [
  { value: 'all', label: `全部（${reportSourceBase.value.length}）` },
  ...QUEUE_SOURCES.map((s) => ({ value: s, label: `${s}（${sourceCountInView(s)}）` })),
]);
/**
 * 「工单类型」下拉（多选）。
 * 🔴 **取值域从本路真出现过的类型派生**，不写死常量 —— 与待判那两路的
 * `untaggedTypeOptions` 同一条 idiom（"选了必有结果"）。次序按**本路首次出现**的先后，
 * 不另排：同一批数据两次进来要给出同一个次序。
 * 🔴 **计数照旧"摘掉自己这一维"**（底表 `reportTypeBase`），不然选中一项之后其余几项全变 0。
 * ⚠️ **总数不在选项里**：多选的"全部"＝ 清空选择、不是一行可选项，
 * 故 `全部（N）` 挪到 placeholder（见 `attrFilterCells` 里这一格的 `placeholder`）。
 */
const poolTicketTypeOptionKeys = computed(() => {
  const seen: string[] = [];
  for (const r of reportTypeBase.value) {
    const k = poolTicketTypeOf(r);
    if (k && !seen.includes(k)) seen.push(k);
  }
  return seen;
});
/*
 * 🔴 **`tagLabel` ＝ 选中之后回显在控件里那枚标签上的字，不带计数**（2026-10-09，
 * 业务原话「工单类型的长度压缩下」）：下拉里要带计数（那儿才是用来挑的地方，
 * `投诉（7）`），而选完之后标签只需答"筛的是哪一类"（`投诉`）——
 * 计数留在标签上白占 ~54px，整格因此被迫撑到 186。
 * 模板侧靠 `option-label-prop="tagLabel"` 取它，见那条 `v-for` 里的多选分支。
 */
const poolTicketTypeFilterOptions = computed(
  () => poolTicketTypeOptionKeys.value.map((k) => ({
    value: k,
    label: `${k}（${ticketTypeCountInView(k)}）`,
    tagLabel: k,
  })),
);
/**
 * 「结论」下拉。取值域恒为三个：升级 / 不升级 / 风险处理建议。
 * 🔴 **界面词一律写全称「风险处理建议」**：`COORD_DECISION` 那个短词只是判等用的常量键，
 * 不要让它漏到界面上 —— 同一个取值在两处写两个名字，读的人会以为是两件事。
 * 🔴 三项之和 < 那一枚「全部（N）」，见 `reportDecisionBase` 的注释（在队两段没有结论）。
 */
const decisionFilterOptions = computed(() => [
  { value: 'all', label: `全部（${reportDecisionBase.value.length}）` },
  ...DECISION_KEYS.value.map((k) => ({
    value: k,
    label: `${k === COORD_DECISION ? '风险处理建议' : k}（${decisionCountInView(k)}）`,
  })),
]);
/** 「风险等级」下拉。取值域取全站那一份 `RISK_LEVELS`，界面词走 `riskLevelText`（高危 / 中危 / 低危） */
const poolLevelFilterOptions = computed(() => [
  { value: 'all', label: `全部（${reportLevelBase.value.length}）` },
  ...RISK_LEVELS.map((lv) => ({ value: lv, label: `${riskLevelText(lv)}（${poolLevelCountInView(lv)}）` })),
]);

/* ---- 「已判」段那条筛选条的四格（2026-10-09 裁决）。班组那一格与工作面共用，另三格在这里 ---- */
/**
 * 「风险等级」那一格 ＝ **左栏那一轴的代理，不是第二份状态**。
 * 真源只有 `tagLevelFilter` 一个：左栏点「高危」这一格就显示「高危」，
 * 在这一格改成「中危」左栏当场亮到「中危」—— 一份 state、两个视图，不会漂。
 * 🔴 `tagger`（按标记人）**读成这一格的「全部」**：那一档与「全部有风险」是同一批行的两种看法，
 * 等级上本来就没有收窄。反过来在这一格选一个等级会把左栏从「按标记人」切到那一档 ——
 * 两者互斥（见 `tagLevelFilter` 的注释），这正是互斥该有的样子。
 */
const judgedLevelFilter = computed<RiskLevel | 'all'>({
  get: () => (tagLevelFilter.value === 'all' || tagLevelFilter.value === 'tagger'
    ? 'all'
    : tagLevelFilter.value),
  set: (v) => { tagLevelFilter.value = v; },
});
/** 🔴 计数**直接取左栏那几档读的同两个函数**，不另算一份 —— 同一个数不在两处各算一遍 */
const judgedLevelFilterOptions = computed(() => [
  { value: 'all', label: `全部（${pooledAllCountHit.value}）` },
  ...RISK_LEVELS.map((lv) => ({ value: lv, label: `${riskLevelText(lv)}（${pooledLevelCountHit(lv)}）` })),
]);
/**
 * 「监控来源」「原单类型」两格的底表：**摘掉自己这一维**，但过左栏当前那一档
 * （`judgedPicked`）与班组 —— 与工作面那四格同一条规矩。
 * 🔴 来源这一维在已判段有**三个**取值（走 `MONITOR_SOURCES`，含「二线报备」那条标记条目），
 * 与工作面那两个不同：工作面经 `isALine` 把报备挡在外面，这一段不挡。
 */
const judgedSourceBase = computed(
  () => inGroup(byJudgedAttrs(judgedPicked(judgedUniverse.value), 'source')),
);
const judgedTypeBase = computed(
  () => inGroup(byJudgedAttrs(judgedPicked(judgedUniverse.value), 'type')),
);
const judgedSourceFilterOptions = computed(() => [
  { value: 'all', label: `全部（${judgedSourceBase.value.length}）` },
  ...MONITOR_SOURCES.map((s) => ({
    value: s,
    label: `${s}（${judgedSourceBase.value.filter((e) => e.source === s).length}）`,
  })),
]);
/** 「工单类型」（多选）：取值域与计数口径同工作面那一格，底表换成已判段自己的 */
const judgedTypeFilterOptions = computed(() => {
  const seen: string[] = [];
  for (const e of judgedTypeBase.value) {
    const k = poolTicketTypeOf(e);
    if (k && !seen.includes(k)) seen.push(k);
  }
  return seen.map((k) => ({
    value: k,
    label: `${k}（${judgedTypeBase.value.filter((e) => poolTicketTypeOf(e) === k).length}）`,
    // 标签不带计数，同工作面那一格（见 `poolTicketTypeFilterOptions` 上方那段）
    tagLabel: k,
  }));
});

/* ---- 两条筛选条（评估处置工作面 / 已判段）的**同一份渲染规格** ---- */
/**
 * 这条筛选条上的**一格**。
 *
 * 🔴 **两条筛选条同走这一份规格与模板里那一个 `v-for`**（2026-10-09 裁决，业务原话
 * 「两处的搜索内容保持一致，复用的逻辑」）：原先两段的格子在模板里各写一遍
 * （工作面五个 `div.fi` + 已判三个），形态靠人工对齐 —— 改一处漏一处就是本文件
 * 反复踩过的"同一个控件两套写法"。现在形态、标签写法、计数口径、量宽规则只有这一处。
 *
 * 🔴 **"按路出维"，不是"两处都出五格"**：共用的是**实现与形态**，不是数据范围 ——
 *   · 「结论」这一维**在已判段不成立**：已判段装的是 `RiskQueueEntry`（监控条目），
 *     身上没有结论字段，结论落在池行 `RiskPoolItem` 的 `assessment` / `coordination` 上
 *     （见 `judgedSourceFilter` 上方那段）。硬摆上去是四格三个零。
 *   · 「来源」这一维**两处取值域本来就不同**（已判三个，含「二线报备」那条标记条目；
 *     工作面经 `isALine` 把报备挡在外面、只有两个）—— 这是对的，不去强行统一。
 *   · 故两路各给各路成立的维：工作面 班组/来源/类型/等级/结论 五格，已判 班组/来源/类型/等级 四格。
 * 🔴 **计数口径照旧**：各维一律"摘掉自己这一维"再算，两路各按**自己的分母**
 * （`reportSourceBase` 一组 / `judgedSourceBase` 一组）。
 *
 * 🔴 **`width` 就是模板里原来逐格写的那个 `--tbw`，数是量出来的**（13px 字实测，取这一格
 * **全部选项里最长的那一个**，不是当前选中的那一个 —— 后者会让控件随选随变宽）：
 *   · **单选**控件宽 ＝ 文字 + 34（内边距 14 + 边框 2 + 箭头 18）再留 3px 余量；
 *   · **多选**控件宽 ＝ 最长标签（文字 + 32）＋ `+ N ...`（53）＋ 尾隙（4）＋ 30，
 *     与待判那两格同一套量法（见那一条筛选条上那段注释里的实测值）。
 *   · 班组「硬件缺陷组（9）」99、两位数时约 106 ⇒ **147**；
 *   · 来源「实时监控（15）」93 ⇒ **130**；
 *   · **工单类型（多选）⇒ 146**：选中标签取 `tagLabel`（**不带计数**，业务「工单类型的
 *     长度压缩下」），最宽态 ＝ 「投诉」58 ＋ `+ N ...` 53 ＋ 尾隙 4 ＝ 115，＋ 30 ⇒ **145**，取 146。
 *     未选时显示 placeholder「全部（14）」67，也在 115 之内。
 *     **四处「工单类型」至此同宽 146**（待判那两格本来就是这个数）。
 *     ⚠️ 量宽史：117（单选二值）→ 186（多选、标签带计数，166 那一版实测被切
 *     needInner 148 / haveInner 136）→ **146**（标签去掉计数，省 40px）。**不要再往回收**。
 *   · 风险等级「高危（15）」67 ⇒ **104**；
 *   · 结论「风险处理建议（2）」112 ⇒ **149**。
 * ⚠️ **只能看画面、不能信 `scrollWidth === clientWidth`**：实测那两个值相等时画面上照样有
 * 省略号（184px 那一版「全部来源（14」真的被切了）。量法与余量见样式里 `.list-toolbar--grid` 那一段。
 *
 * 🔴 **「工单类型」四处已统一成同一维**（2026-10-09 改判，业务原话「都修改为 工单类型，
 * 支持多选」）—— **推翻 10-08 那条"同名不同义、不许统一"**：
 *   · 四处（工作面 / 已判 / 待判实时监控 / 待判重点工单）**同取值域**：原单真实工单类型
 *     咨询 / 建议 / 商机 / 投诉 / 刷机（工作面与已判走 `poolTicketTypeOf`，
 *     待判两路走 `untaggedTicketOptions`，都是"从本路真出现过的类型派生"）；
 *   · 四处**同形态**：多选、`allow-clear`、`:max-tag-count="1"`，空 ＝ 不收窄。
 *   · 工作面 / 已判这两格**保留计数**（`咨询（3）`），总数写在 placeholder 上
 *     （`全部（N）`）—— 多选的"全部"是清空选择，不是下拉里的一行。
 *     待判那两格本来就不摆数，placeholder 保持 `全部`。
 * ⚠️ **原先这两格筛的是「投诉 / 非投诉」二值**（`PoolTicketTypeKey`），已随本次改判删除。
 * 🔴 **"是不是投诉单"那条业务分岔没有跟着变**：它一直走 `isComplaintTicket`（六处），
 * 与本维不是同一个判据，本轮一个字没碰。
 *
 * ⚠️ **四字标签是 2026-10-09 改回来的**：之前为窄窗省 72px 把三个四字标签收成两字
 * （监控来源→来源、原单类型→类型、风险等级→等级），业务判「类型」「等级」两个字
 * 说不清是谁的类型、谁的等级，**改回「工单类型」「风险等级」**；「来源」保持两字
 * （这一屏只有这一处来源，不会读串）。重算后的边界见样式里那条媒体查询。
 */
interface AttrFilterCell {
  /** `v-for` 的 key；两路同名维同键，切路时控件就地换选项而不是整格重建 */
  key: string;
  /**
   * 标签。**两字与四字并存**：「班组」「来源」「结论」两字；「工单类型」「风险等级」四字
   * （2026-10-09 业务判两字说不清是谁的类型 / 谁的等级，改回四字）。宽度已按此重算。
   */
  label: string;
  /** 量出来的控件宽（px），见上面那张表 */
  width: number;
  /**
   * `label` 是下拉里那一行的字（带计数）；`tagLabel` 是选中后回显在控件里那枚标签上的字
   * （**不带计数**，多选格专用，模板侧 `option-label-prop="tagLabel"` 取它）。
   */
  options: { value: string; label: string; tagLabel?: string }[];
  /**
   * 多选那一格（当前只有「工单类型」）：`values` / `setMulti` / `placeholder` 三项同时给；
   * 单选那几格给 `value` / `set`，行为与形态一个字没变。
   */
  multiple?: boolean;
  /** 单选格的当前值 */
  value?: string;
  /** 多选格的当前值 */
  values?: string[];
  /** 多选格的占位：总数写在这里（`全部（N）`），因为"全部"在多选里是清空、不是一行选项 */
  placeholder?: string;
  /**
   * 🔴 `set` / `setMulti` 里回收各维自己的类型：这一份规格为了让两路共用一个 `v-for`
   * 把取值域抹成 `string`，各维的真源 ref 仍是各自的联合类型，故在这里**显式收回去**，
   * 不把 `any` 放进 state。
   */
  set?: (v: string) => void;
  setMulti?: (v: string[]) => void;
}
const attrFilterCells = computed<AttrFilterCell[]>(() => {
  // 班组是两路共用的那一格：同一份 state（左栏各档也按它收窄），故只写一次
  const group: AttrFilterCell = {
    key: 'group',
    label: '班组',
    width: 147,
    options: groupFilterOptions.value,
    value: groupFilter.value,
    set: (v) => { groupFilter.value = v; },
  };
  if (listView.value === 'report') {
    return [
      group,
      {
        key: 'source',
        label: '来源',
        width: 130,
        options: sourceFilterOptions.value,
        value: sourceFilter.value,
        set: (v) => { sourceFilter.value = v as MonitorSource | 'all'; },
      },
      // 🔴 **多选**（2026-10-09 改判）：总数写在 placeholder 上，选项里只摆取值 + 计数
      {
        key: 'type',
        label: '工单类型',
        width: 146,
        multiple: true,
        options: poolTicketTypeFilterOptions.value,
        values: poolTicketTypeFilter.value,
        placeholder: `全部（${reportTypeBase.value.length}）`,
        setMulti: (v) => { poolTicketTypeFilter.value = v; },
      },
      {
        key: 'level',
        label: '风险等级',
        width: 104,
        options: poolLevelFilterOptions.value,
        value: poolLevelFilter.value,
        set: (v) => { poolLevelFilter.value = v as RiskLevel | 'all'; },
      },
      // 🔴 **结论摆在末位**：它是唯一一个取值不覆盖整表的维度（在队两段没有结论，
      // 见 `reportDecisionBase`）；前面四格的次序即收窄的层次（谁的活 → 从哪儿进池 → 工单类型 → 风险等级）
      {
        key: 'decision',
        label: '结论',
        width: 149,
        options: decisionFilterOptions.value,
        value: decisionFilter.value,
        set: (v) => { decisionFilter.value = v as DecisionKey | 'all'; },
      },
    ];
  }
  return [
    group,
    {
      key: 'source',
      label: '来源',
      width: 130,
      options: judgedSourceFilterOptions.value,
      value: judgedSourceFilter.value,
      set: (v) => { judgedSourceFilter.value = v as MonitorSource | 'all'; },
    },
    // 🔴 **多选**，与工作面那一格逐字同形（2026-10-09 改判）
    {
      key: 'type',
      label: '工单类型',
      width: 146,
      multiple: true,
      options: judgedTypeFilterOptions.value,
      values: judgedTypeFilter.value,
      placeholder: `全部（${judgedTypeBase.value.length}）`,
      setMulti: (v) => { judgedTypeFilter.value = v; },
    },
    // 🔴 这一格**与左栏那一轴共用一份 state**（`judgedLevelFilter` 只是 `tagLevelFilter` 的代理）：
    // 左栏点哪一档这一格就显示哪一档，反过来也成立
    {
      key: 'level',
      label: '风险等级',
      width: 104,
      options: judgedLevelFilterOptions.value,
      value: judgedLevelFilter.value,
      set: (v) => { judgedLevelFilter.value = v as RiskLevel | 'all'; },
    },
  ];
});

/** 左栏这一列只在漏斗的两个视图上作数；旁路的两个入口自带各自的筛选条，不套班组 */
const showGroupFilter = computed(() => listView.value === 'realtime' || listView.value === 'report');

//
// 🔴 **原先这里有一个 `currentRail`**，用来在清单正上方复述"当前是哪一段的哪一档"
// 外加一行口径说明。整个删掉了：阶段名已在顶部页签、档名已在左栏且带选中态，
// 右侧再复述一遍是同一个信息说第三遍；那行说明则是本项目明令禁止的"多行介绍文案"
// （而且 `item.title` 里带着给悬停写的 `**` 星号，直接渲染出来是一串没解析的 markdown）。
// 口径没丢：它本来就是左栏每一档按钮 `title` 的原文，悬停仍在。
//
function openTicket(no: string) { router.push(`/tickets/${no}`); }

/**
 * 页头「重点工单」块 · 优先级那四格的下钻：**在本页下钻到左栏「待判 · 重点工单」
 * 对应的那一档**（2026-10-09 裁决，业务原话「怎么跳查询中心呢？应该跳待判的重点工单」）。
 *
 * 🔴 **走的就是左栏点档位那一条路**（`setRail('untagged:focus:Px')`），不另写一份：
 * 页面上每一个通往漏斗某一段的入口都过 `setRail`，它把 `listView` / `queueView` /
 * `untaggedSlice` / `untaggedSub` 四个真源一次写齐 —— 另写一份必然漏掉其中一两个。
 * 先把那一路展开（`untaggedOpen.focus`）：子档收起着的时候左栏不渲染它那一行，
 * 落过去会"选中了一个看不见的档"。
 *
 * 🔴 **两边的数不同，这是业务看过对照之后拍的板**：页头这一块的分母是**全部在办工单**
 * （`isLiveTicket`，实测 P0 15 / P1 28 / P2 38 / P3 5）；左栏那一档更窄 ——
 * 在办 ∧ 未标注等级 ∧（投诉 ∨ P0/P1），实测 P2 只有 2 条。
 * 卡上的数与落地那一档的行数不相等，**不是缺陷**：这一块是**入口**，不是那一档的计数器
 * （与「风险工单」那一块点卡不点亮 `on` 同一条道理，见 `drillPooled`）。
 *
 * 🔴 **原先落到工单列表**（`/query?tab=tickets&live=1&priority=Px`），连同为它新接的
 * `live=1` 一维一并不再由本页产生。**那一维的消费端在工单列表侧，本轮不动**；
 * 全站唯一那份"在办"判据 `isLiveTicket`（`types/ticket.ts`）照旧 ——
 * 本页页头三块卡的分母、已判段的在办口径都取它。
 */
function drillFocusPriority(p: Priority) {
  untaggedOpen.value = { ...untaggedOpen.value, focus: true };
  setRail(`untagged:focus:${p}` as RailKey);
}
/**
 * 弹窗内点单号跳工单页：先关弹窗并清掉目标再跳。
 * 本页在 keep-alive 里，弹窗挂在 body 上，不关的话会叠在工单页之上，回到本页时也会原样再出现。
 * 表格行里的单号仍走 `openTicket`。
 */
function openTicketFromModal(no: string) {
  assessOpen.value = false;
  assessTarget.value = null;
  entryTagOpen.value = false;
  entryTagTarget.value = null;
  tagOpen.value = false;
  tagTarget.value = null;
  openTicket(no);
}

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
 * 「孩子」一选就是上百条噪音，人要找的那一条当场被埋掉。
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
          <div class="greeting-sub">实时识别预警词命中与重点工单，标记定级后进入风险工单池处置</div>
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
      ② 页头大盘：三栏 —— 左实时监控（今日扫描流量）、中重点工单（在办工单）、右风险工单（已判条目）。
      三个分母（今日条目流量 / 在办工单 / 已判条目）两两不可相加，每个数的 title 各自写明自己数的是什么。
      🔴 「工单类型」这一维在中栏与右栏**各出现一次、分母不同**（全部在办 vs 已判那一批），
      两行不可相减；各自的 `.dash-links-k` title 都把分母写死。
    -->
    <section class="overview-section effect-section">
      <div class="effect-split">
        <!--
          左栏 ＝ 实时监控。**它只讲扫描本身，与左栏漏斗零重叠**：
          待打标 / 已入池 / 已标记无风险 三个存量数已经完整摆在下方那一列漏斗里了，
          页头再摆一遍就是同屏重复 —— 两处摆同一个数，人只会去找它们为什么不一样。
          这一块答的是**今天动了多少**（流量）：扫了几轮、扫出多少条命中、判掉了多少。
        -->
        <div class="effect-pane effect-pane--monitor">
          <h2
            class="pane-title"
            title="今日监控运行情况，按自然日统计 · 口径恒为全中心，不随「班组」变（右边「风险工单」那一块跟着班组走，三块分母不同、不要横着比）"
          >实时监控</h2>
          <div class="dash-grid dash-grid-4">
            <div
              class="dm-cell dm-static"
              title="当日由自动识别新进入监控队列的条目数"
            >
              <span class="dm-k">今日发现</span>
              <span class="dm-val"><span class="dm-v">{{ dailyIntake }}</span></span>
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
              title="今日产生的风险词命中记录条数。🔴 分母是命中不是条目：一张单可以被三条词命中，两个数不可相加；也不是右上角「命中明细」那个数 —— 那枚数的是全量命中记录"
            >
              <span class="dm-k">命中记录</span>
              <span class="dm-val"><span class="dm-v">{{ hitsToday }}</span></span>
            </div>
            <div
              class="dm-cell dm-static"
              title="今日下过结论的条目数，含判为无风险的那一批 —— 判无风险同样是一次结论，不算进来就看不出今天判了多少活"
            >
              <span class="dm-k">今日标记</span>
              <span class="dm-val"><span class="dm-v">{{ taggedToday }}</span></span>
            </div>
          </div>
          <!-- 风险标注：今日标记结论为高 / 中 / 低的工单数（tagLevelToday），无风险不列 -->
          <div class="dash-links">
            <span class="dash-links-k" title="今日判为高危 / 中危 / 低危的工单数">风险标注</span>
            <span
              v-for="lv in RISK_LEVELS"
              :key="lv"
              class="dl-item dl-static"
              :style="{ color: RISK_LEVEL_STYLE[lv].color }"
            >
              {{ riskLevelText(lv) }}<b>{{ tagLevelToday[lv] }}</b>
            </span>
          </div>
        </div>

        <!--
          中栏 ＝ 重点工单。分母是**工单**，另外两栏一个是今日监控流量、一个是已判条目，
          三栏并排最容易被读成一路数，故每个数各自 title 写明分母。

          🔴 **优先级那四格可点，下钻到左栏「待判 · 重点工单」对应的那一档**（2026-10-09 裁决，
          业务原话「怎么跳查询中心呢？应该跳待判的重点工单」）：走的就是左栏点档位那条路
          （`drillFocusPriority` → `setRail`），不新写一份下钻。
          ⚠️ **卡上的数与落地那一档的行数不相等，业务看过对照之后仍这么定**：本块分母是
          全部在办工单（P2 ＝ 38），左栏那一档更窄 —— 在办 ∧ 未标注等级 ∧（投诉 ∨ P0/P1），
          P2 ＝ 2。这一块是**进那一档的入口**，不是那一档的计数器（同 `drillPooled`）。
          ⚠️ 第二行「工单类型」五格**本轮不做**（业务拍板）：左栏待判那两路没有按工单类型分的档，
          落不到任何一档上。两行同源同分母，哪天要做就两行一起。

          🔴 **块名「重点工单」与左栏来源档「重点工单」同名、不同集合**（2026-10-07 业务拍板
          「不冲突，重点工单都是在办的工单」，块名保留）：左栏那一档是**自动纳入监控的判据**、
          更窄 —— 在办 ∧（投诉 ∨ P0 / P1）。同一个词在同屏指两个集合，不写清没人说得明白，
          故块标题与每个数的 title 都把「本块分母 ＝ 全部在办工单」写死，并点明与左栏那个判据不是同一批。

          🔴 **原先这里是「投诉工单 / 紧急·重要」两枚数 + 一行「风险等级 高危 / 中危 / 低危」**，
          2026-10-07 整块重做成**优先级四维 + 类型四类**：那一行按工单去重取最高、
          与左栏「已判」那三档同名不同数（见 script 里 `liveTagLevelCounts` 那段墓碑），
          业务判「重点工单都没有风险等级，所以这个数据也不合适」。两枚旧数连同小字里的
          「今日新增 / 已标记」一并撤掉，**不保留、也不搬到别处**。
        -->
        <div class="effect-pane effect-pane--ticket">
          <h2
            class="pane-title"
            title="在办工单的两维分布（优先级 / 工单类型）· 🔴 本块分母 ＝ 全部在办工单（终态单不计），口径恒为全中心、不随「班组」变（右边「风险工单」那一块跟着班组走）。🔴 与左栏来源档「重点工单」同名、不是同一个集合：左栏那一档是自动纳入监控的判据，更窄 —— 在办 ∧（投诉 ∨ P0 / P1）。与左栏监控条目、右栏已判条目均不可相加"
          >重点工单</h2>
          <!-- 第一行 · 优先级四维。`Priority` 只有这四个取值，故 P0 + P1 + P2 + P3 ≡ 在办工单总数 -->
          <div class="dash-grid dash-grid-4">
            <button
              v-for="p in HEAD_PRIORITY_KEYS"
              :key="p"
              type="button"
              class="dm-cell"
              :title="`在办且优先级为「${PRIORITY_RAIL_LABEL[p]}」的工单数 · 本块分母 ＝ 全部在办工单；P0 + P1 + P2 + P3 ＝ 在办工单总数`"
              @click="drillFocusPriority(p)"
            >
              <span class="dm-k">{{ PRIORITY_RAIL_LABEL[p] }}</span>
              <span class="dm-val"><span class="dm-v">{{ livePriorityCounts[p] }}</span></span>
            </button>
          </div>
          <!--
            第二行 · 工单类型。业务点名的是前四类，🔴 **「刷机」第五格照常摆上**：
            两行本就同分母（都取 `liveTickets`），少摆一格会让两行之和差着在办的刷机单，
            一块卡里两行对不上又没有说明，读的人只会以为其中一处坏了。
            摆上之后 Σ五类 ≡ ΣP0..P3 ≡ 在办工单总数，肉眼可验。
          -->
          <div class="dash-links">
            <span
              class="dash-links-k"
              title="同一个分母（全部在办工单）换一维看：按工单类型计。🔴 五类之和 ≡ 上面 P0 + P1 + P2 + P3 ≡ 在办工单总数 —— 工单类型这一维就是这五个取值，没有落不进格的单"
            >工单类型</span>
            <span
              v-for="tt in HEAD_TICKET_TYPES"
              :key="tt"
              class="dl-item dl-static"
              :title="`在办的「${tt}」类工单数 · 本块分母 ＝ 全部在办工单（与下方「风险工单」块那一行的「工单类型」不是同一个分母，两处不可相减）`"
            >
              {{ tt }}<b>{{ liveTicketTypeCounts[tt] }}</b>
            </span>
          </div>
        </div>

        <!--
          右栏 ＝ 风险工单。装的是**已判出风险等级（高 / 中 / 低）的监控条目**。

          🔴 **它与左栏「已判」段走同一个派生值，两处恒等**（见 script 里 `pooledAllCount` /
          `pooledLevelCount` 那一段）：
            · 风险工单总数 ≡ 左栏「已判」页签 ≡ 左栏「全部有风险」；
            · 高危 / 中危 / 低危 ≡ 左栏已判段那三档。
          🔴 **改一处必须两处一起改** —— 要改口径只能改那两个派生值，**不许在这里另写一份计数**：
          页头与左栏同屏，各数各的必然分叉，而"同屏两个「高危」不同数"正是本轮要治的病
          （被删掉的中栏那一行「风险等级」就是那个病例）。
          🔴 **允许它与左栏重复**（2026-10-07 业务拍板："就让它重复，但两处恒相等"）。

          🔴 **块名由「评估处置」改成「风险工单」，块内六个数整组撤掉**（2026-10-07 裁决）：
          待评估总数 / 待领取 · 已领取 / 超时未评 / 今日已结论 / 今日结论（升级 · 不升级 · 建议）
          全部不要，**也不搬到别处** —— 它们的真源是下面那个「评估处置」工作面与它自己的
          三枚下钻卡，那一面连同池行表一格没动，下钻进去照样找得到。
          【为什么】业务指着这一块判「这个数据调整下，展示已判的数据，比如风险工单总单、高中低分布」。
          块名跟着它数的东西走：它现在数的是**已判出等级的风险工单**，不再是池行的处置进度。
          块名不叫「已判」—— 那是左栏的段名，两处用同一个词会立刻被读成同一个控件。

          🔴 **下钻能力照留**：这一块原本是「评估处置」工作面的**唯一入口**
          （`drillReport` 是本页唯一一处 `setListView('report')`）。四枚卡仍然点得动、
          仍然进那个工作面，只是换了显示的数；不留的话领取 / 评估 / 协同整个工作面就再也进不去了。
          🔴 **四枚卡一律不点亮 `on`**：卡上数的是**监控条目**（已判，含来源为「风险报备」的那一条），
          工作面那张表数的是**池行**且只收 A 线（`isALine` 把来源「二线报备」挡在外面），
          两个数天生差着那几条。点亮 `on` 等于宣称"这个数就是这张表的分母"，那是假话。
          本块是**进工作面的入口**，不是工作面的一个筛选档。详见 `drillPooled` 的注释。
        -->
        <div class="effect-pane effect-pane--report">
          <h2
            class="pane-title"
            title="在办工单上已判出风险等级（高 / 中 / 低）的监控条目 · 🔴 与左栏「已判」段恒等：总数 ≡ 左栏已判页签 ≡ 「全部有风险」，高 / 中 / 低 ≡ 左栏那三档，两处同取一个派生值，改一处必须两处一起改。判为无风险的不在这一批（不进池、离开漏斗）；原单进终态的也不在（与左栏同一道在办判据）。🔴 本块跟着「班组」走（与左栏同进同退，恒等的必然结果）；左边「实时监控」「重点工单」两块恒为全中心、不随班组变 —— 同一排三块，分母不同，不要横着比。点任一枚进「评估处置」工作面处置这一批"
          >风险工单</h2>
          <div class="dash-grid dash-grid-4">
            <button
              type="button"
              class="dm-cell"
              title="在办工单上已判出风险等级（高 / 中 / 低）的监控条目总数 ≡ 左栏「已判」页签上那个数 ≡ 左栏「全部有风险」。点它进「评估处置」工作面"
              @click="drillPooled('all')"
            >
              <span class="dm-k">风险工单总数</span>
              <span class="dm-val"><span class="dm-v">{{ pooledAllCount }}</span></span>
            </button>
            <button
              v-for="lv in RISK_LEVELS"
              :key="lv"
              type="button"
              class="dm-cell"
              :class="{ hot: lv === '高' && pooledLevelCount(lv) > 0 }"
              :title="`判为${riskLevelText(lv)}的监控条目数 ≡ 左栏已判段「${riskLevelText(lv)}」那一档（同一个派生值，两处恒等）。点它进「评估处置」工作面并收窄到${riskLevelText(lv)}`"
              @click="drillPooled(lv)"
            >
              <span class="dm-k">{{ riskLevelText(lv) }}</span>
              <span class="dm-val"><span class="dm-v">{{ pooledLevelCount(lv) }}</span></span>
            </button>
          </div>
          <!--
            第二行 · 已判那一批按**原单类型**的分布（2026-10-07 补：业务「也展示一个工单类型维度的总集」）。
            🔴 **分母是风险工单，不是上面那块的全部在办工单** —— 同一个词「工单类型」同屏出现两次、
            两个分母，故两处的 title 都把分母写死，并点明不可相减。
            🔴 走的仍是本块另外四个数那一批条目（见 `pooledTicketTypeCounts`），
            故 Σ各格 ≡ 风险工单总数由构造成立。
          -->
          <div class="dash-links">
            <span
              class="dash-links-k"
              title="同一批风险工单（＝左栏「已判」那一批监控条目）换一维看：按原单的工单类型计。🔴 各格之和 ≡ 左边「风险工单总数」。🔴 分母是风险工单、不是全部在办工单 —— 与上面「重点工单」块那一行的「工单类型」不是同一个集合，两处不可相减"
            >工单类型</span>
            <span
              v-for="tt in pooledTypeRowKeys"
              :key="tt"
              class="dl-item dl-static"
              :title="tt === POOLED_TYPE_REST
                ? '原单类型落在四类之外（刷机），或原单已查不到的那几条 —— 不吞，吞掉的话各格之和会小于风险工单总数'
                : `原单类型为「${tt}」的风险工单数 · 分母 ＝ 风险工单（已判那一批），不是全部在办工单`"
            >
              {{ tt }}<b>{{ pooledTicketTypeCounts[tt] }}</b>
            </span>
          </div>
        </div>
      </div>
    </section>

    <!--
      统一工作面：**左栏（阶段切换器 + 当前段的档）+ 右侧清单**。
      左栏是本页的主导航（上游 → 下游 → 分档 → 汇总，见 script 里 RailKey 那段的说明），
      右上角两枚次级入口是不在链上的两件事（手动筛查 / 命中明细）。
    -->
    <section class="overview-section work-panel">
      <div class="funnel-layout">
        <!--
          左栏 ＝ **阶段切换器 + 当前这一段自己的档**。
          每一档右侧的数字**就是点进去表里的行数**（已过当前班组筛选）——
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
            **不是数量递减**：两段同为在办口径（2026-10-08 拍板），差别只在有没有下过结论，
            两批互斥、不相交。两个数不相减、不互校。
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
                :aria-label="`${g.title} ${g.total}`"
                :title="g.title2"
                @click="setStage(g.stage)"
              >
                <span class="fr-seg-label">{{ g.segLabel }}</span>
                <span class="fr-seg-num">{{ g.total }}</span>
              </button>
            </template>
          </div>
          <!--
            🔴 **原先每一行前面还可能插一条 `.fr-sep` 细分隔线**（`it.sep`），只给已判段
            「无风险」那一档用 —— 它是漏斗的漏出口。那一档随 2026-10-07 裁决删除，
            这一列再没有要隔开的行，分隔线连同 `RailItem.sep` 与它的样式一并删掉。
          -->
          <div class="fr-group">
            <template v-for="it in currentRailGroup.items" :key="it.key">
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
                    <!--
                      🔴 **文案恒为「批量识别」、不按视图分叉**（2026-10-07 裁决）：
                      两个分支都在待判段（条目那一路只在待打标视图、命中那一路在
                      「未标记 · 实时监控」），按三类命名都归"识别"。
                      点下去走哪一个弹窗仍按视图分（见 `pickBatchAction`），只是两个弹窗同名。
                    -->
                    <a-menu-item :disabled="bulkCount <= 0" @click="pickBatchAction('tag')">
                      批量识别
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
                手动筛查退成**动作按钮**：它不是一份平行的清单，而是一个**查询工具**。
                点开的仍是原来那套九维筛查条件面板，能力一格没动。

                🔴 **结果只读**（2026-10-08 裁决）：原先结果可以勾选「并入清单」、补条目回「待判」，
                这条路径整条取消 —— 「实时监控」那一档恒为自动扫库的产出。
                🔴 **入口本身受打标权门控**（§3.5 / 验收 93：无打标权不展示），判据取 `canRiskTag`，
                不另立一份角色表。
              -->
              <button
                v-if="canRiskTag"
                type="button"
                class="row-btn scan-entry"
                :class="{ active: listView === 'scan' }"
                title="旁路 · 存量点查：拿九维条件去扫存量工单，看哪些单上有风险词命中。它只做查询、结果不落库，点行上的工单号进那张单"
                @click="setListView('scan')"
              >
                <SearchOutlined :style="{ fontSize: '12px' }" />
                <span>手动筛查</span>
                <span v-if="inScanResult" class="hit-batch-badge">{{ scanResult!.length }}</span>
              </button>
              <!--
                命中明细退成**次级入口**：它的分母是风险词命中记录，是词表准确率的旁路，
                不在主链上。🔴 只挪入口，内容与能力一个字没动。
                ⚠️ **与页头卡「命中记录」不是一个数**：页头那枚是**今日**新产生的命中条数，
                这里是**全量**命中记录的明细（`ledgerTotal`），两处的 title 各自说清自己数的是什么。
              -->
              <button
                type="button"
                class="row-btn scan-entry"
                :class="{ active: listView === 'judged' }"
                title="旁路 · 风险词命中记录的全量明细：待核实 / 成立 / 误报三类都在，供事后点查与核实，词表准确率由它回填。分母是全部命中记录（含已标记工单上的，不是工单、也不是监控条目），与左栏条目不可相加；左栏「实时监控」只列其中尚未标记工单上的那部分"
                @click="setListView('judged')"
              >
                <TagsOutlined :style="{ fontSize: '12px' }" />
                <span>命中明细</span>
                <span class="hit-batch-badge">{{ ledgerTotal }}</span>
              </button>
            </div>
          </div>

          <!--
            🔴 **原来那行标记人 chip 已删**：标记人清单现在就在左栏「按标记人」下面展开着。
            同一个选择器在两处并存就是同屏重复，人还得先猜哪一处才是当前生效的那个。
          -->

      <!--
        班组筛选（单选）。它是**另一层**：左栏选的是"链上哪一段"，这条工具条选的是
        "这一段里哪一个组的活"。横跨左栏每一档不清空 —— 组是工单的固有属性，
        不随条目走到哪一段而变；切档就清掉的话，人在某一组筛完切档会看到全部组，只会以为筛选失灵。
        🔴 各项的数字取的是**除自己这一维之外**的全部条件下的行数（见 groupChips / reportSourceBase）。

        🔴 **评估处置工作面的四维筛选全在这里**（2026-10-08 裁决）：监控来源 / 原单类型 /
        风险等级 / 结论。四维原先是筛选区里几排 chip，与班组这一个下拉是同一类东西
        （单选、带计数、互不相干的几维），却长着两套形态；收进这一行之后，
        这一屏上"筛什么"只有一处可找，筛选区那一整块（`.section-filters`）随之撤掉。
        🔴 **每一格逐字同形**（`.fi` + `.fl` + `a-select.tb-ctl`，标签写法 `全部（N）` / `取值（N）`），
        不为了塞得下就把其中一两格换成另一种控件 —— 形态由 `attrFilterCells` 一处给，不靠人工对齐。
        ⚠️ 结论这一维只对池行成立，故只在工作面（`listView === 'report'`）上出；
        这条工具条的另一个落点（待判那两路）自带另一条筛选条，不走这里。

        🔴 **次序即收窄的层次**：班组（谁的活）→ 来源（从哪儿进的池）→ 类型 →
        等级 → 结论（走到哪一步收的口）。结论摆在末位是因为它是**唯一一个
        取值不覆盖整表的维度**（在队那两段没有结论，见 `reportDecisionBase`）。
      -->
      <div
        v-if="showGroupFilter && !(listView === 'realtime' && queueView === 'monitoring')"
        class="ledger-bar"
      >
        <div class="list-toolbar list-toolbar--one-line list-toolbar--no-actions">
          <!--
            🔴 **两条筛选条（工作面 / 已判）同走这一个 `v-for`**（2026-10-09 裁决，业务原话
            「两处的搜索内容保持一致，复用的逻辑」）：每一格的标签、宽度、选项、读写口径
            全在 script 的 `attrFilterCells` 里逐维列着 —— 格子不再在模板里各写一遍。
            🔴 **"按路出维"**：工作面五格（班组/来源/类型/等级/结论）· 已判四格（无「结论」，
            那一维在监控条目上不成立）。为什么、以及每一格的宽是怎么量出来的，见 `AttrFilterCell`。
          -->
          <div class="tb-fields">
            <div
              v-for="cell in attrFilterCells"
              :key="cell.key"
              class="fi"
              :style="{ '--tbw': `${cell.width}px` }"
            >
              <span class="fl">{{ cell.label }}</span>
              <!--
                🔴 **不用 `v-model`**：真源是各维自己那个 ref（类型各不相同），这里经
                `cell.set` / `cell.setMulti` 回写 —— 规格里把取值域抹成 `string` 是为了让两路
                共用一个 `v-for`，写回去时各维再把自己的类型收回来，不在 state 上留 `any`。
                🔴 **多选那一格（工单类型）与待判那两条上的同名格逐字同形**
                （`mode="multiple" allow-clear :max-tag-count="1"`）—— 四处一个形态，
                见 `AttrFilterCell` 上方那段。它的总数写在 `placeholder` 上，不在选项里。
              -->
              <!--
                🔴 `option-label-prop="tagLabel"`：下拉里那一行带计数（`投诉（7）`），
                选中之后回显的标签**不带计数**（`投诉`）—— 业务「工单类型的长度压缩下」。
                计数留在下拉里，那儿才是用来挑的地方；标签只答"筛的是哪一类"。
              -->
              <a-select
                v-if="cell.multiple"
                :value="cell.values"
                mode="multiple"
                allow-clear
                size="small"
                class="tb-ctl"
                option-label-prop="tagLabel"
                :dropdown-match-select-width="false"
                :placeholder="cell.placeholder"
                :max-tag-count="1"
                :options="cell.options"
                @update:value="(v) => cell.setMulti?.((v ?? []) as string[])"
              />
              <a-select
                v-else
                :value="cell.value"
                size="small"
                class="tb-ctl"
                :dropdown-match-select-width="false"
                :options="cell.options"
                @update:value="(v) => cell.set?.(v as string)"
              />
            </div>
          </div>
        </div>
      </div>

      <!--
        「未标记」筛选条。**复用命中明细那条查询条的类名与排版**（ledger-bar / list-toolbar /
        tb-fields / fi / tb-actions），一行新样式都不写 —— 这一段的外观已经定过，不该为多一条筛选另起一套。
        🔴 **只补筛选、不摆统计头**：命中统计（待核实 / 已核实 / 确认是风险 / 误报 / 规则准确率）
        讲的是词表质量，数在看板上展示；摆在日常打标的工作面前，
        等于把"规则准不准"塞给一个正在判"这张单有没有风险"的人。
        🔴 字段按路而变、且**不重复左栏子档与搜索条「班组」已经承担的收窄**，见 `UntaggedFilter`。
      -->
      <div
        v-if="listView === 'realtime' && queueView === 'monitoring'"
        class="ledger-bar"
        @keyup.enter="applyUntaggedQuery"
      >
        <!--
          🔴 **字段区走与工作面那条同一套"一格一宽"排版**（`--grid`，2026-10-09）：
          原来那套 flex 等分会把每格压到 120 来像素、四字标签 + 多选标签当场换行。
          三条筛选条一套排版。撤掉「关键词」与「产品 / 当前状态 / SLA」之后：
          实时监控 **班组 / 风险词 / 工单类型 / 优先级**（四格），
          重点工单 **班组 / 工单类型 / 优先级**（三格）—— 两路只差一个「风险词」。
        -->
        <div class="list-toolbar list-toolbar--one-line list-toolbar--grid">
          <!--
            🔴 **每一格的 `--tbw` 是量出来的**（真机实测，不是估的）：
              · 班组（单选）「硬件缺陷组（9）」99、两位数约 106 ⇒ **147**
                （与另两条筛选条那一格同宽，同一份选项同一个数）；
              · 优先级（单选）「P2（普通加急）」93 ⇒ **134**（实测格内可用 118，余 25）；
              · 风险词（多选）⇒ **172**；工单类型（多选）⇒ **146**。
            🔴 **多选那两格 2026-10-09 第一次按"真的最宽态"量**（此前一直按"只摆一枚标签"量，
            于是一选多项 `+ N ...` 那一枚就被切）。最宽态 ＝ **最长的一枚标签 ＋ `+ N ...` ＋ 尾隙**：
              · 标签宽 ＝ 文字 ＋ 32（标签自己的内边距与关闭叉，实测「曝光」58、「12315」67）；
              · `+ N ...` 实测 **53**，尾隙 **4**；控件宽 ＝ 上述之和 ＋ 30（选择器内边距 + 箭头）。
              ⇒ 风险词「投诉到底」52+32=84 → 84+53+4=141 ⇒ **171**，取 172；
                 工单类型「投诉」26+32=58 → 58+53+4=115 ⇒ **145**，取 146。
            🔴 **这一次量得起，是因为腾出了地方**：「关键词」（2026-10-09 业务「关键词去掉」）
            与「产品 / 当前状态 / SLA」三格（业务「SLA去掉」「这三个选去掉」）先后整格删除，
            两路因此只差一个「风险词」。实测本条 kw 路实需 **789**、focus 路 **567**，
            清单区 991 时字段区可用 825 ⇒ **一行**。
            ⚠️ 命中明细那条查询条有自己的「关键词」，是另一套（`ledgerFilter.keyword`），不受影响。
          -->
          <div class="tb-fields">
            <div class="fi" style="--tbw: 147px">
              <span class="fl">班组</span>
              <a-select
                v-model:value="groupFilter"
                size="small"
                class="tb-ctl"
                :dropdown-match-select-width="false"
                :options="groupFilterOptions"
              />
            </div>
            <!--
              风险词只有「实时监控」这一路有：「重点工单」那一路的行是工单，压根不产生命中。
              控件与命中明细那条同形（取规则主词）。
            -->
            <div v-if="untaggedSlice === 'kw'" class="fi" style="--tbw: 172px">
              <span class="fl">风险词</span>
              <a-select
                v-model:value="untaggedFilter.words" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="全部" :max-tag-count="1"
                :options="untaggedWordOptions"
              />
            </div>
            <!--
              「工单类型」**两路共用这一格**（同一个 `untaggedFilter.types`、同一个
              `untaggedTypeOptions`，后者读的就是当前这一路，取值从这一路真出现过的类型派生
              —— 选了必有结果），故不分支、只写一次。
              🔴 **本页四处「工单类型」已是同一维**（2026-10-09 改判，业务原话「都修改为
              工单类型，支持多选」，**推翻 10-08 那条"同名不同义、不许统一"**）：
              这一格与工作面 / 已判那两格**同取值域**（咨询 / 建议 / 商机 / 投诉 / 刷机，
              都从本路真出现过的类型派生）、**同形态**（多选 · allow-clear · max-tag-count 1）。
              唯一的差别是那两格**带计数**（`咨询（3）`、总数在 placeholder 上写 `全部（N）`），
              这一格不摆数、placeholder 只写 `全部` —— 待判这一段本来就不在筛选项上摆数。
            -->
            <div class="fi" style="--tbw: 146px">
              <span class="fl">工单类型</span>
              <a-select
                v-model:value="untaggedFilter.types" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="全部" :max-tag-count="1"
                :options="untaggedTypeOptions"
              />
            </div>
            <!--
              「优先级」**两路同形、不同真源**，这是本条上唯一一处按路分叉的地方：
                · 实时监控 —— 绑**这一路自己的一维** `untaggedFilter.priority`，
                  🔴 **不是 `untaggedSub`**：这一路的子档取值域是 高 / 中 / 低风险，
                  把 P0~P3 写进去会串台（见 `untaggedKwPriorityOptions`）；
                · 重点工单 —— 直接绑**左栏那四档本身** `untaggedSub`（一份 state 两个视图），
                  见 `untaggedPriorityOptions`。
              两处互不读写对方。
              🔴 **「产品」「当前状态」「SLA」三格 2026-10-09 整格删除**（业务原话「SLA去掉」
              「这三个选去掉」）：三维只在「重点工单」那一路出过，连同它们的 state 与取值派生
              一并删净（grep 复验过只有这一处消费端），那一路因此与实时监控那一路**只差一个「风险词」**。
              🔴 「进监控时间」更早一轮已删：实测 11 条里只有 2 条有进监控时刻，一设区间就只剩那 2 条。
            -->
            <div class="fi" style="--tbw: 134px">
              <span class="fl">优先级</span>
              <a-select
                v-if="untaggedSlice === 'kw'"
                v-model:value="untaggedFilter.priority"
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false"
                :options="untaggedKwPriorityOptions"
              />
              <a-select
                v-else
                v-model:value="untaggedSub"
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false"
                :options="untaggedPriorityOptions"
              />
            </div>
          </div>
          <div class="tb-actions">
            <button type="button" class="scan-go" @click="applyUntaggedQuery">
              <SearchOutlined />查询
            </button>
            <!-- 重置只清本条筛选：左栏选中档与搜索条「班组」是另外两层，不归它管 -->
            <button type="button" class="tb-btn" :disabled="!untaggedFilterDirty" @click="resetUntaggedFilter">
              <ReloadOutlined /><span>重置</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 实时监控 · 空态：把当前视图讲出来，否则"这里没东西"会被读成"系统没在扫" -->
      <div v-if="listView === 'realtime' && !queueRows.length" class="ob-empty">
        <!-- 收窄条件必须在空态里复述，否则"筛空了"会被读成"没有了" -->
        <template v-if="groupFilter !== 'all'">「{{ groupFilter }}」在这一档下没有条目 —— 把「班组」改回「全部」看全部</template>
        <template v-else-if="taggerFilter !== 'all'">「{{ taggerFilter }}」名下没有已标记的风险工单 —— 点左栏「按标记人」看全部</template>
        <template v-else-if="untaggedFilterDirty">当前筛选条件下没有工单 —— 点「重置」看这一路的全部</template>
        <template v-else-if="queueView === 'monitoring' && untaggedSub">这一档下没有待判的工单 —— 点上一级看这一路的全部</template>
        <template v-else-if="queueView === 'monitoring'">这一路没有待判的工单 —— 换一路看，或用右上角「手动筛查」去存量里捞</template>
        <template v-else-if="tagLevelText">当前没有标记为{{ tagLevelText }}的条目</template>
        <template v-else>当前没有有风险的条目 —— 标记为低 / 中 / 高的条目会落在这里</template>
      </div>

      <!--
        「重点工单」那一路 · **工作台那张富列表**（见 `ticketListView`）。
        这一路的行就是工单，故摆的是工单自己的信息：工单/标题 · 工单摘要 · SLA 时效 ·
        优先级 · 客户 · 产品 · 当前状态 · 当前处理人/组 · 当前节点 · 创建/更新时间，末列「风险识别」。
        列与筛选沿用原「投诉单」「重要紧急」两路的那一套，一格没动；默认按工单优先级降序。
        🔴 **去掉了「监控来源」**：停在这一档，整列都写着「重点工单」——
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
          :column-order="['summary', 'sla', 'priority', 'customer', 'product', 'node', 'assignee', 'flowNode', 'createdAt', 'updatedAt']"
          :column-widths="TICKET_LIST_COL_WIDTHS"
          flex-before-action
          :row-actions-fn="untaggedRowActions"
          @toggle="toggleTicketPick"
          @toggle-all="toggleBulkAll"
          @action="onTicketRowAction"
          @click-no="openTicket($event.no)"
          @open="openTicket($event.no)"
        />

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
        🔴 行 ＝ 待核实的命中；同一张单的命中相邻成组，勾选只在组首行（勾的是整单）；
        类型 / 工单每行重复，避免 rowspan 导致续行列错位；处置按命中逐行出「风险识别」。
        🔴 分页按工单组切（`pagedQueueRows`），「N 单 · M 条命中」两个数分别取 `queueRows` 与 `kwHitTotal`。
      -->
      <div v-if="listView === 'realtime' && kwEvidenceView && queueRows.length" class="hit-table-wrap">
        <table class="hit-table hit-table--kw">
          <colgroup>
            <col v-if="showQueueSelection" style="width: 36px">
            <col style="width: 52px">
            <col style="width: 108px">
            <col style="width: 52px">
            <col style="width: 200px">
            <col>
            <col style="width: 72px">
            <col style="width: 128px">
            <!--
              🔴 **时间列 88 → 120**（2026-10-09 随「时间」改全格式一并重量，量法见表头那一段）。
              ⚠️ **列宽的真源是这个 `<colgroup>`，不是 `<th style>`**：本表 `table-layout: fixed`，
              `<col>` 的宽**压过** `<th>` 上写的宽（实测只改 th 时计算值仍是 88、文字被切，
              `scrollWidth 103 > clientWidth 88`）。两处要一起给同一个数。
            -->
            <col style="width: 120px">
            <col style="width: 76px">
          </colgroup>
          <thead>
            <tr>
              <th v-if="showQueueSelection" style="width: 36px">
                <div class="hit-cb" :class="{ checked: bulkAllPicked }" @click="toggleBulkAll">
                  <CheckOutlined v-if="bulkAllPicked" :style="{ color: '#fff', fontSize: '10px' }" />
                </div>
              </th>
              <th style="width: 52px">等级</th>
              <th style="width: 120px">风险词</th>
              <th style="width: 52px">类型</th>
              <th style="width: 190px">工单</th>
              <th>命中内容</th>
              <th style="width: 72px">客户</th>
              <th style="width: 128px">处理人</th>
              <!--
                ⚠️ **列宽 120，不是 60**（2026-10-09 随「时间」改全格式一并重量）：
                这一格由 `MM-DD HH:mm` 改成 `YYYY-MM-DD HH:mm`（业务「这改时间的风格不对，
                应该是这个格式」，格式真源 ＝ 页头那枚 `.monitor-clock`）。
                实测 12px 字下 `2026-10-09 10:53` **94px**（旧文案 `10-09 11:18` 才 63），
                ＋ 单元格左右内边距 20 ＝ **114**，取 120 留 6px 余量。
                🔴 **不要收回 96**：本文件已判那张表的「结论时间」列给 96 时被省略成
                「2026-10-06 10:…」，**已经犯过一次**，最后给到 120 才没被切。
                ⚠️ 加宽的 60px 由弹性的「命中内容」让（实测让后仍有 130+，表宽不变、不出横滚）。
              -->
              <th style="width: 120px">时间</th>
              <th style="width: 88px">操作</th>
            </tr>
          </thead>
          <tbody>
            <!--
              🔴 **原先这里还有一支"没有待核实命中的组照实留一行"**（等级 / 风险词 / 时间写「—」、
              命中内容写「本单暂无待核实命中」、动作走条目打标形态）。它只为**手动筛查并入**的
              无命中单而留，随 2026-10-08 裁决一并删除：这一档恒为自动扫库的产出
              （入选判据 ＝ 本单有待核实命中），每一组必有至少一条命中，见 `kwPageGroups`。
            -->
            <template v-for="g in kwPageGroups" :key="g.row.id">
              <tr v-for="(h, hi) in g.hits" :key="`${g.row.id}-${h.id}`">
                <!--
                  类型 / 工单每行重复（不用 rowspan，避免续行列错位）。
                  勾选仍按整单合并：只在组首行出 td + rowspan，续行不占勾选列，避免空格子。
                -->
                <td v-if="showQueueSelection && hi === 0" :rowspan="g.hits.length">
                  <div
                    class="hit-cb"
                    :class="{ checked: bulkPicked.has(g.row.id) }"
                    @click.stop="toggleBulkPick(g.row.id)"
                  >
                    <CheckOutlined v-if="bulkPicked.has(g.row.id)" :style="{ color: '#fff', fontSize: '10px' }" />
                  </div>
                </td>
                <td>
                  <!-- 这一批全是待核实的命中，等级即词表预设 -->
                  <span
                    class="grade-pill"
                    :style="{ color: RISK_LEVEL_STYLE[presetGradeOf(h)].color, background: RISK_LEVEL_STYLE[presetGradeOf(h)].bg }"
                  >{{ presetGradeOf(h) }}</span>
                </td>
                <td>
                  <div class="track-word">「{{ h.word }}」</div>
                </td>
                <td class="hit-type-cell">
                  {{ poolTicketTypeOf(g.row) }}
                </td>
                <td class="hit-ticket-cell">
                  <button
                    type="button"
                    class="hit-ticket-link"
                    :title="`${g.row.ticketNo} · ${rowTitleOf(g.row)}`"
                    @click="openTicket(g.row.ticketNo)"
                  >{{ rowTitleOf(g.row) }}</button>
                </td>
                <td class="hit-excerpt" :title="`${h.position}：${h.excerpt}`">
                  <div class="hit-excerpt-inner">
                    <span class="hit-pos">{{ h.position }}</span>
                    <span class="excerpt-quote">「<template v-if="excerptWindow(h).headTruncated">…</template>{{ excerptWindow(h).before }}<span v-if="excerptWindow(h).hit" class="excerpt-hit">{{ excerptWindow(h).hit }}</span>{{ excerptWindow(h).after }}<template v-if="excerptWindow(h).tailTruncated">…</template>」</span>
                  </div>
                </td>
                <td class="hit-customer-cell">
                  <span class="hit-clip-line" :title="h.customer">{{ h.customer }}</span>
                </td>
                <td class="hit-handler-cell">
                  <span class="hit-clip-line" :title="rowHandlerLine(g.row, h)">{{ rowHandlerLine(g.row, h) }}</span>
                </td>
                <!--
                  🔴 **全格式 `YYYY-MM-DD HH:mm`**（2026-10-09，业务「这改时间的风格不对，
                  应该是这个格式」）：原先写 `MM-DD HH:mm`，**省掉年份与那一刀分段**，
                  与本页别处（页头 `.monitor-clock`、池行表「进监控时刻」、已判表「结论时间」、
                  扫库记录起止）四处全格式对不上。格式真源取页头那枚 `.monitor-clock`，不自创写法。
                  ⚠️ 列宽已随之由 60 重量到 120，见表头那一段。
                -->
                <td class="hit-when">{{ h.when.slice(0, 16) }}</td>
                <td class="hit-act-cell">
                  <button
                    v-if="canRiskTag"
                    type="button" class="row-btn row-btn-tag"
                    @click="openTag(h)"
                  >风险识别</button>
                  <span v-else class="hit-sub" title="标记归客诉专员、投诉督导与管理员">—</span>
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
        已判段 · 条目表（＝「全部有风险」那一批，按风险等级 / 按标记人两个轴共用）。
        🔴 「未标记」两路都不走这张表：「实时监控」走上面的召回清单，「重点工单」走富列表。
        🔴 **两个轴共用这一张表、一份列定义**：它们是同一批条目的两种看法，
        同一批行对象、列逐字相同，差别只在各自多一层收窄。
        🔴 **本轮这张表只剩一类行：标记条目**（2026-10-07 裁决）——
        原先无风险行与报备行也走这张表，两档删掉之后它们**不再出现在这里**：
        无风险离开漏斗、报备只在前台「风险报备池」展示。
      -->
      <div v-if="listView === 'realtime' && queueView === 'pooled' && queueRows.length" class="hit-table-wrap report-table-wrap">
        <table class="hit-table report-table">
          <thead>
            <tr>
              <!--
                第一格 ＝ **工单标题单元格**（与「评估处置工作面」池行表、工作台富列表同一个共享件），
                列宽 264 的量法与池行表那一格同一条（最宽一种第二行「客户服务小程序 · 单号」232 ＋ 内边距 20 ＝ 252，留 12）。
              -->
              <th style="width: 264px">工单</th>
              <!--
                🔴 「监控来源」「风险描述」两列**已删**，换成下面这四列。
                列宽合计 1040px（264+88+118+100+110+80+72+120+88），与本表 min-width 1040 同值，
                落在 1044 的清单区内 —— 与「实时监控」那一路收窄列宽同一条理由：横着拖才能看全的表，每一行都要动两次手。
                ⚠️ **按有纵向滚动条时的可用宽算**（1044，不是 1058）：行少到不出滚动条时会多出 14px，
                照那个宽度定列，行一多就溢出，而"行少的时候不溢出"恰恰是最容易漏测的一种。
                ⚠️ **合计贴到 1040 之后，各列在 1044 下几乎拿不到余量**（原先合计 942 时每列按 1.108 倍放大，
                「结论时间」给 104 实得 115 才没被切）—— 故下面每一格都按**实测自然宽（含内边距）＋ 余量**直接给足：
                SLA 实测 102 → **110**（最长一种「解决：超 88:40」，被切掉半个末位数字比不显示更糟）；
                「结论时间」实测 114 → **120**（给 96 时整列被省略成「2026-10-06 10:…」，已犯过一次）；
                风险来源 82 → 88、客户 / 产品 96 → 100、结论人 64 → 72、操作 82 → 88。
                「风险等级」表头四字，64 下内容区只剩 44px、与字宽持平，0 余量会偶发把末字切掉，故给 **80**。
                第一格多出来的 112px、上面这几格补足的余量，以及风险等级多出的 16px，全部从「证据 / 摘要」让（148 → 118）：
                那一列本来就是靠省略号收尾的长文、全文挂 title，少几十像素不丢信息。

                🔴 **原「风险词」这一列改成「风险来源」**（2026-09-28 裁决）：词只对其中一路成立，
                而"这条从哪条路进来的"每一行都答得上 —— 取值三种：
                实时监控 / 重点工单 / 风险报备（第三种 ＝ **来源恰好是报备的标记条目**，不是报备单本身）。
                原来那格里的词并没有丢，它跟着证据走：「证据 / 摘要」那一列的原话里命中词仍然高亮。
                🔴 **「风险等级 / 标记人 / 标记时间」改成「结论 / 结论人 / 结论时间」**，三列的列宽一格没动。
                ⏭️ **2026-10-08**：表头「结论」改回「**风险等级**」（列宽 64 → 80），「结论人」改成「**处理人**」（三字，列宽 72 不动）。「结论时间」这一列不动。
                🔴 **「池内状态」这一列已删**（2026-09-29 裁决），全表定为**九列**：
                这张表答的是"标了什么结论"，池内阶段是条目进池之后的事，它的真源在
                「评估处置工作面」那张池行表里，在这儿再摆一格等于把同一件事写成两处。
                🔴 **四列的 `v-if` 与两列的列宽二选一已删**（原先判 `taggedEvidenceView`）：
                那是为「无风险」那一档不摆证据列留的分支，这张表只剩一档之后四列恒出、列宽恒定。
              -->
              <th style="width: 88px">风险来源</th>
              <th style="width: 118px">证据 / 摘要</th>
              <th style="width: 100px">客户 / 产品</th>
              <th style="width: 110px">SLA</th>
              <th style="width: 80px">风险等级</th>
              <th style="width: 72px">处理人</th>
              <th style="width: 120px">结论时间</th>
              <!--
                操作列只剩一枚「风险管控」，列宽由 128 收到 88 —— 一枚按钮不需要两枚的位。
              -->
              <th style="width: 88px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in pagedQueueRows" :key="e.id">
              <!--
                第一格 ＝ **工单标题单元格**（共享件 `TicketTitleCell`，取数走 `poolTicketOf`）：
                催 / 补 · 状态 · 类型 · 标题 · 渠道 · 单号 · 关联标。单号仍可点、落点不变；
                `line2-wrap` 让关联标放不下时整枚换行，不被切成半个单号；
                查不到原单的行回退成光单号按钮 —— 写法与池行表那一格逐字同一套。
              -->
              <td>
                <TicketTitleCell
                  v-if="poolTicketOf(e)"
                  :ticket="poolTicketOf(e)!"
                  line2-wrap
                  @click-no="openTicket($event.no)"
                />
                <button v-else type="button" class="rt-no" @click="openTicket(e.ticketNo)">{{ e.ticketNo }}</button>
              </td>
              <!--
                风险来源：这一维取值三种（实时监控 / 重点工单 / 风险报备）。
                配色沿用风险工单池那张表的写法 —— 预警词那一路蓝底，另两路灰底。
              -->
              <td>
                <span class="src-tag" :class="{ kw: rowSourceText(e) === '实时监控' }">{{ rowSourceText(e) }}</span>
              </td>
              <!--
                证据 / 摘要：**两种行摆的不是一种东西**，按来源分岔（见 `rowEvidenceKind`）——
                实时监控摆命中原话摘录（最新一条，命中词高亮，取窗与召回清单、打标弹窗同一个
                `excerptWindow`）、重点工单摆工单的问题描述。
                来源「二线报备」那条标记条目走后一支，`rowSummaryOf` 对它先取条目自己的 desc
                ＝ 报备人填的风险描述，这一格的内容与改版前逐字相同。
                全文一律挂 title，这一屏是用来复核的、不是读完再判。
              -->
              <td class="rr-desc">
                <template v-if="rowEvidenceKind(e) === 'hit'">
                  <div :title="rowLatestHit(e)!.excerpt">
                    <span class="excerpt-quote">「<template v-if="excerptWindow(rowLatestHit(e)!).headTruncated">…</template>{{ excerptWindow(rowLatestHit(e)!).before }}<span v-if="excerptWindow(rowLatestHit(e)!).hit" class="excerpt-hit">{{ excerptWindow(rowLatestHit(e)!).hit }}</span>{{ excerptWindow(rowLatestHit(e)!).after }}<template v-if="excerptWindow(rowLatestHit(e)!).tailTruncated">…</template>」</span>
                  </div>
                  <span
                    v-if="rowHits(e).length > 1"
                    class="kw-more"
                    :title="rowHits(e).map((h) => `【${riskLevelText(h.level)}·${h.matchedWord || h.word}】${h.excerpt}`).join('\n')"
                  >+{{ rowHits(e).length - 1 }} 条命中</span>
                </template>
                <span v-else :title="rowSummaryOf(e)">{{ rowSummaryOf(e) }}</span>
              </td>
              <td class="rr-desc">
                {{ rowCustomerOf(e) }}<div class="hit-sub" :title="rowProductOf(e)">{{ rowProductOf(e) }}</div>
              </td>
              <!-- SLA 两行取工作台那一份单一真源（见 rowSlaLines），本页不另判一遍 -->
              <td>
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
              <!--
                结论 ＝ **打标结论**（高 / 中 / 低 套等级配色）。
                🔴 原先这一格还有两支：报备行的评估结论（升级 / 不升级 / 已撤回，走中性 state-chip）、
                以及非入池等级（无风险）那一支 —— 两档删掉之后这张表只剩有风险的标记行，
                两支一并删；拿不到 `tag` 的落「—」那一支留着兜数据异常。
              -->
              <td>
                <span
                  v-if="e.tag && isPoolLevel(e.tag.result)"
                  class="grade-pill"
                  :style="{ color: RISK_LEVEL_STYLE[e.tag.result].color, background: RISK_LEVEL_STYLE[e.tag.result].bg }"
                >{{ riskLevelText(e.tag.result) }}</span>
                <span v-else-if="e.tag" class="state-chip" :title="e.tag.note">{{ rowConclusionText(e) }}</span>
                <span v-else class="hit-sub">—</span>
              </td>
              <td>
                {{ rowConclusionBy(e).name }}<div v-if="rowConclusionBy(e).role" class="hit-sub">{{ rowConclusionBy(e).role }}</div>
              </td>
              <td class="hit-when">{{ rowConclusionAt(e) }}</td>
              <td>
                  <!--
                    🔴 **只给一枚「风险管控」**（2026-09-29 裁决）：原来那枚「修正」已取消 ——
                    改判等级走的就是这个弹窗的上半（打开时预置现行结论，改选别的即为改判、
                    改判时「风险备注」必填），一个动作不必摆两枚按钮。
                    🔴 原先这里还有一支"报备行不给行内操作、写「—」"，随报备那一档删除
                    （2026-10-07 裁决：报备只在前台「风险报备池」展示）—— 这张表再没有报备行。
                    悬停里原来那条"从无风险档进来"的分支同理删除：这一档只装有风险的条目。
                  -->
                  <button
                    v-if="canRiskTag"
                    type="button" class="row-btn row-btn-tag"
                    :title="e.entry && canTagNoRisk(e.entry.status)
                      ? '判定风险等级；改判为无风险会把它撤出风险工单池、并离开已判'
                      : `判定风险等级；${NO_RISK_LOCKED_TIP}`"
                    @click="openEntryTag(e, 'judged')"
                  >风险管控</button>
                  <span v-else class="hit-sub" title="风险管控归客诉专员、投诉督导与管理员">—</span>
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
        🔴 **原先这里有一排五枚「处置阶段」chip**（不限阶段 / 待领取 / 已领取 / 已结论 / 超时未评）。
        **整排已删**（2026-10-08 裁决：业务侧没有「处置阶段」这个定义），表里同名的那一列一并删，
        这张表现在**恒摆全部条目** ＝ 原先的「不限阶段」（见 `reportAllRows`）。
        连带删掉的有：`alineStageAllCount` / `alineOpenCount` / `alineUnassignedCount` /
        `alineAssigningCount` / `alineOverdueCount` 五个计数，以及 `onlyOverdue` /
        `reportOpenRows` / `setReportView` / `setPoolStage` / `poolStageChipOn`
        —— 它们的消费端全在那一排上，别处一个都没有。
        ⚠️ **池内阶段在本表只剩"出过结论没有"两档**（2026-10-09 裁决：领取 / 释放 / 等待时长
        整套撤出本工作面，归风险报备池）：「操作」列未出结论的摆一枚「风险管控」、已结论写「—」。
        「承办人」「等待时长」两列一并删，行级超时催办改只在**报备池**那一侧看。
        ⚠️ `待领取 + 已领取 + 已结论 ＝ 不限阶段 ＝ 表行数` 这条恒等式随那一轴一并消失，**预期之内**。
      -->
      <!--
        🔴 **筛选区那一整块 chip 排（`.section-filters`）已撤**（2026-10-08 裁决）。
        五维先后全部收进上沿那条工具条，与「班组」逐字同形：
          · 处置阶段 —— **整排删**，业务侧没有这个定义；
          · 监控来源 / 原单类型 / 结论 / 风险等级 —— 改成下拉筛选项。
        连带删掉的还有「下钻收窄标」那一行（`.report-filters`）：它存在的理由是
        "从页头卡点进来的条件得有个看得见、摘得掉的落点"，而五个筛选项本身就是
        那个落点 —— 同一个条件在一屏上摆两处，摘哪一处都是猜。
      -->

      <!-- 风险工单池 · 空态：把当前生效的筛选值逐个讲出来，否则"筛空了"会被读成"没有了" -->
      <div v-if="listView === 'report' && !reportRows.length" class="ob-empty">
        <template v-if="poolNarrowedText">「{{ poolNarrowedText }}」当前没有池行 —— 把筛选项换回「全部」看全部</template>
        <template v-else>当前没有进池的条目 —— 标记为高 / 中 / 低才进池</template>
      </div>

      <!--
        风险工单池队列表。**一张表装全部条目**：待领取 / 已领取 / 已结论三段按时间序首尾相接
        （见 `reportAllRows`），列对三段完全相同，按行分岔的只有「操作」那一格。
        🔴 **没有勾选列**：批量只服务于批量分派，而分派整套已取消。
      -->
      <div v-if="listView === 'report' && reportRows.length" class="hit-table-wrap report-table-wrap">
        <table class="hit-table report-table pool-row-table">
          <thead>
            <tr>
              <!--
                ⚠️ **列宽 264**，不是原来的 168：这一格从"一个光单号"换成**工单标题单元格**之后，
                第二行是「渠道 · 单号」，这一行里每一项都不收缩，故列宽由**最宽的那一种渠道**定。
                实测最宽的一种是「客户服务小程序 · IFLYTS-20260716-00002」——
                渠道 84（`TICKET_SOURCE_OPTIONS` 里最长的就是「客户服务小程序」七字）
                ＋ 分隔点 3 ＋ 单号 133 ＋ 两道 6px 间距 ＝ 232px，加单元格左右内边距 20 ＝ 252。
                取 **256** 留 4px 余量（照 6 字渠道量出来的 248 对这一行只剩 0.2px，等于没有余量）。
                第一行的标题可以省略号收尾，**状态 / 类型角标与单号一个字都不许被切**。
                ⚠️ **不能再收**：再窄下去「客户服务小程序」那一行的单号会被 `line2Wrap` 顶到第三行，
                整行从 53px 长到 76px —— 省下的那点宽度换不来一行高。

                ⚠️ **这 88px 是从哪腾的（全表合计必须落在清单区可视宽内，不许出横向滚动条）**：
                删「原单类型」整列 **−64**（与标题里的类型角标逐字重复），余下 24 从弹性的
                「风险摘要」列让。

                🔴 **2026-10-08 删「处置阶段」整列之后的重算（八列）**：
                　· 腾出 **80**；
                　· 「监控来源」88 → **96**：回到被挤之前的宽度（上一轮为了补「风险摘要」收过 8px，
                　　格里的来源标最宽 82、表头连排序箭头 70，96 才有余量，不会在四字胶囊上压线）；
                　· 「承办人」72 → **80**：同理回到被挤之前（最宽「吴投诉」59、表头 53，80 放得下四字人名）；
                　· 余下 **64 全部给「风险摘要」**（它无固定宽，吃掉定宽列让出的全部余量）。
                定宽列合计 968 → **904**，弹性列净增 64px，**不许留空洞**：fixed 布局下
                没有固定宽的「风险摘要」把差额整截吃掉，全表仍是 100% 宽、无横向溢出。

                🔴 **2026-10-09 删「等待时长」「承办人」两列之后的重算（八列 → 六列）**：
                业务原话「等待时长、领取、释放是风险报备池的逻辑，你这是搞混了吧」——
                本工作面不再有领取，故「承办人」没有源（它的值就是领取人）、「等待时长」
                （处置时限自进入实时监控起算）同属报备池那一套。
                　· 「等待时长」−144、「承办人」−80，腾出 **224**；
                　· 「操作」136 → **88**：这一格现在只剩一枚「风险管控」，
                　　11px 字四字 44 ＋ 按钮内边距边框 18 ＝ 62，加单元格左右内边距 20 ＝ 82，88 留 6px 余量
                　　（136 是当年为「风险管控」+「释放」两枚量的，一枚用不了那么宽）；
                　· 余下 **272 全部给「风险摘要」**（同上，弹性列吃掉全部余量）。
                定宽列合计 904 → **632**，弹性列净增 272px，**不留空洞、不出横向滚动条**。
                ⚠️ 「超时」这件事在本表随「等待时长」一并消失，**本文件此刻一处都不显示它**
                （`rowOverdue` / `rowWaitedText` / `waitedText` 与那两组样式已删净）。
                它在**报备池**（`RiskReportPoolPanel` 自己那一列，一格未动）与工单页
                「风险报备」Tab 照旧；store 的 `isOverdue` / `waitedMinutes` 由那两处在用。
              -->
              <th style="width: 256px">工单号</th>
              <!--
                本页池行只有 A 线（`isALine`）：「报备人 / 报备原因 / 风险类型」三格对 A 线恒为占位，已删；
                换成原单类型与风险等级两列（§5.4 ④）。
                🔴 **「原单类型」这一列已删**（2026-10-08 裁决）：第一格换成工单标题单元格之后，
                它与标题第一行那枚**类型角标逐字重复**（实测在表的每一行都是同一个值：投诉/投诉、咨询/咨询），
                同一个值在一行里摆两处，占的 64px 却正是「风险摘要」最缺的那一截。
                按原单类型筛的那一项**照旧在**（已改成上沿工具条里的筛选控件），筛选维度一个没少。
              -->
              <th style="width: 64px">风险等级</th>
              <!--
                来源列可点排序：多类来源合一队之后，"先把同一类过一遍"是最常见的翻法。
                ⚠️ 列宽 **96**：格里的来源标最宽 82（四字胶囊）、表头连排序箭头一起 70。
                上一轮曾为了补「风险摘要」收到 88（四字胶囊上只剩 4px 余量），
                删「处置阶段」腾出 80px 之后**回到 96**，不再在这一列上压线。
              -->
              <th
                style="width: 96px"
                class="th-sortable"
                :class="{ on: sourceSort !== 'none' }"
                :title="sourceSort === 'none' ? '点击按监控来源分组（同来源内仍按等待时长）' : sourceSort === 'asc' ? '点击倒序' : '点击恢复按等待时长排'"
                @click="cycleSourceSort"
              >监控来源<span class="th-sort-mark">{{ sourceSort === 'asc' ? '↑' : sourceSort === 'desc' ? '↓' : '↕' }}</span></th>
              <th>风险摘要</th>
              <!--
                🔴 **原先这里有一列「处置阶段」（80px，池内阶段：待领取 / 已领取 / 已结论）。
                整列已删**（2026-10-08 裁决：业务侧没有这个定义），与它同名的那一排 chip 一并删。
                每行走到哪一步照旧看得出来 —— 「操作」列按行分岔（待领取摆「领取」、已领取摆
                「风险管控」+「释放」、已结论两枚都不摆），「承办人」那一格也只有领过的行才有名字。
              -->
              <!--
                🔴 **「承办人」整列已删**（2026-10-09 裁决）：它的值就是**领取人**，
                而本工作面的领取整套已撤（业务：领取 / 释放 / 等待时长是风险报备池的逻辑），
                源没了，这一列在每一行都只能写「—」。
                ⚠️ "谁给的结论"没丢：结论人写在左栏「已判」段那一侧，池行表不兼做台账。
              -->
              <th style="width: 128px">进监控时刻</th>
              <!--
                🔴 **「等待时长」整列已删**（2026-10-09 裁决，同上）：它数的是"进池多久还没人处置"，
                配的是报备池那一套领取 / 超时催办；**报备池那一列一格未动**。
              -->
              <!--
                ⚠️ 列宽 **88**：这一格现在只剩一枚「风险管控」（见下面那一格的说明）。
                11px 字四字 44 ＋ 按钮内边距边框 18 ＝ 62，加单元格左右内边距 20 ＝ 82，88 留 6px 余量。
                ⚠️ **不要再收**：82 是"刚刚好"，`.report-table td` 带省略号，收到 82 以下
                会把「风险管控」切成「风险管…」——本仓在这一列上已经栽过。
              -->
              <th style="width: 88px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in pagedReportRows" :key="r.id">
              <!--
                第一格 ＝ **工单标题单元格**（与工作台富列表同一个共享件 `TicketTitleCell`）：
                催 / 补 · 状态 · 类型 · 标题 · 渠道 · 单号 · 关联标。原先这一格只有一个光单号 ——
                而人在这一列要认的是"这是哪一张单"，单号答不了，只能一条条点进去看。
                🔴 单号仍可点、落点不变：`@click-no` 接的就是原来那个 `openTicket`。
                🔴 **查不到原单的行回退成光单号按钮**（见 `poolTicketOf`）：这一格没有工单可摆时
                至少还摆得出单号，不白屏、不丢行。
              -->
              <td>
                <!--
                  `line2Wrap`：本列 256px 装不下「渠道 · 单号 · 升级自 〈单号〉」这一整行时，
                  让关联标**整枚换到下一行**。不开它会被单元格硬切成「升级自 IFLYTS-202」——
                  关联标的正文就是一个工单号，半截单号会被读成另一张单
                  （详见 `TicketTitleCell.vue` 里 `line2Wrap` 那段说明）。
                  🔴 实测：本表有关联标的行第二行自然宽 385px，256 下**必须换行**，没有别的去处。
                -->
                <TicketTitleCell
                  v-if="poolTicketOf(r)"
                  :ticket="poolTicketOf(r)!"
                  line2-wrap
                  @click-no="openTicket($event.no)"
                />
                <button v-else type="button" class="rt-no" @click="openTicket(r.ticketNo)">{{ r.ticketNo }}</button>
              </td>
              <!-- 「原单类型」那一格已删（与上面标题单元格里的类型角标逐字重复），见表头那一段 -->
              <td>
                <span
                  v-if="r.tag && isPoolLevel(r.tag.result)"
                  class="grade-pill"
                  :style="{ color: RISK_LEVEL_STYLE[r.tag.result].color, background: RISK_LEVEL_STYLE[r.tag.result].bg }"
                >{{ riskLevelText(r.tag.result) }}</span>
                <span v-else class="hit-sub">—</span>
              </td>
              <td><span class="src-tag" :class="{ kw: isKeywordRow(r) }">{{ r.source }}</span></td>
              <!--
                风险摘要：**两行夹断**，全文挂 title。队列是用来挑下一条办的，不是在这里读完再判，
                但这一列是全表唯一说明"这条为什么有风险"的地方，一行读到的是半句话。
                🔴 **夹断必须落在里面这个 `<span>` 上，不能写在 `<td>` 上**：
                `-webkit-line-clamp` 要配 `display: -webkit-box`，而浏览器会把 `<td>` 的 display
                强制算回表格单元格（实测 computed 是 `flow-root`），夹断**整条失效** ——
                文字照旧按几行排版、再被 `overflow: hidden` 从中间切开，第三行会露出半截字。
              -->
              <td class="rr-desc" :title="poolRiskSummaryOf(r)"><span class="rr-clamp2">{{ poolRiskSummaryOf(r) }}</span></td>
              <!-- 「处置阶段」那一格已随整列删除（2026-10-08 裁决），见表头那一段 -->
              <!-- 「承办人」「等待时长」两格已随整列删除（2026-10-09 裁决），见表头那两段 -->
              <td class="hit-when">{{ r.at }}</td>
              <td>
                <!--
                  🔴 **这一格只剩一枚「风险管控」**（2026-10-09 裁决，业务原话
                  「操作栏目，只有风险管控呀，没有领取 释放啥的」「等待时长、领取、释放是
                  风险报备池的逻辑，你这是搞混了吧」）：「领取」「释放」两枚整个撤掉。
                  ⚠️ 报备池那一侧（`RiskReportPoolPanel`）的领取 / 释放一格未动 ——
                  那个池自己的领取态还在，两处本来就不是同一摊。

                  🔴 **门禁改成"按角色"**：有风险评估权的角色（客诉专员 + 管理员，判据取
                  仓里现成那一份 `canClaimRiskReport` ＝ `canClaim`）对**尚未出结论**的条目
                  都能评 —— 原先那道"须为本人名下的「已领取」态"随领取一并撤。
                  并发由**提交前重查**接住（见 `workbenchAssessBlockOf`），不靠占位。

                  🔴 **按行自己走到哪一步判**：这张表三段混在一起、恒摆全部条目，
                  照整张表的状态判的话，已结论的行也会长出一枚按钮。

                  🔴 **先按原单类型分工作面**（《【930】》§2 摘要表 · §5.2 两处「投诉单不做风险评估」·
                  §9 池内分工作面 —— 同一条口径 PRD 写死了四处）：
                  **投诉单 → 协同处理**，**非投诉单 → 风险评估**，两类的入口名都叫「风险管控」
                  （入口名 ＝ 弹窗名）。协同可多次、已结论也可再协同（§5C.1 次数行），
                  故投诉单那一支不受"已出结论"那道门约束。
                -->
                <template v-if="isComplaintTicket(r.ticketNo)">
                  <button
                    v-if="canClaim"
                    type="button" class="row-btn row-btn-tag"
                    title="投诉单不做风险评估，走风险处理建议：给处理意见 + 建议事项；工单状态与处理人均不变"
                    @click="openCollab(r)"
                  >风险管控</button>
                  <span
                    v-else
                    class="hit-sub"
                    title="协同处理归客诉专员与管理员；本视角只读"
                  >—</span>
                </template>
                <template v-else-if="poolStageOf(r) === '已结论'">
                  <span
                    class="hit-sub"
                    title="本条已有评估结论"
                  >—</span>
                </template>
                <!--
                  尚未出结论的非投诉单（待领取 / 已领取两态合为一支 —— 领取撤掉之后
                  这两态在界面上不再分岔）：有评估权就出「风险管控」。
                -->
                <template v-else>
                  <button
                    v-if="canAssessRow(r)"
                    type="button" class="row-btn row-btn-tag"
                    title="给出评估结论：升级 / 不升级"
                    @click="openAssess(r)"
                  >风险管控</button>
                  <!-- 🔴 **操作列恒在、无动作时写「—」**（§5.4 元素 ⑨） -->
                  <span
                    v-else
                    class="hit-sub"
                    title="风险评估归客诉专员与管理员；本视角只读"
                  >—</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>

        <!--
          🔴 **原先这里还有第二张表：「已结论」专表**（工单号 / 风险等级 / 监控来源 / 评估人 /
          评估时刻 / 评估决策 / 派生投诉单 / 操作 八列），只在 `reportView === 'assessed'` 那一档下出。
          **整张删**（2026-10-08 裁决）：档位切换已随「处置阶段」整排一并删除，这个工作面
          **只管处置、不兼做台账** —— 「评估人 / 结论时刻 / 评估决策」三项去**左栏「已判」段**看，
          那边本来就有，信息一条不丢。
          连带删掉的有 `concludedByOf` / `concludedByRoleOf` 两个取值函数与 `.rr-dec` 那两条样式
          （消费端只有这张表），以及 `reportView` 本身（至此再无人用）。
          ⚠️ 「升级派生的投诉单」仍点得到：它写在那张单自己的关联标上（`TicketTitleCell` 的
          「升级自 〈单号〉」），不是只有这张表才看得见。
        -->
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
        <div class="list-toolbar list-toolbar--one-line">
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
              <span class="fl">标记人</span>
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
                不给清除按钮：时间区间清空即"对全库扫一遍"，通用词一扫上百条，
                结果页当场被噪音填满。这一维只允许换区间，不允许没有区间。
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
            <!--
              `tb-btn-row2` ＝ 这一枚独占动作列的**第二行**（查询 / 重置并排在第一行）。
              🔴 用类名而不是 `:last-child` / `:first-of-type` 这类位置选择器：
              这一块以后再加一枚按钮，位置选择器会当场错位。
            -->
            <button
              type="button"
              class="tb-btn tb-btn-row2"
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

      <!--
        筛查结果条：结果就在下面这张清单里，这一条只承载**退出**这一件事。
        🔴 **原先这一条右侧还有「全选新命中 / 已选 N / 并入清单」三件**，随 2026-10-08 裁决删除
        （手动筛查只做查询，结果不落库）；那句"结果尚未并入，勾选后确认"的提示同去 ——
        它指向的动作已经不存在。结果态的出路只剩两条：点行上的工单号进那张单，或「退出筛查」。
        🔴 **左侧那段「扫出 N 条 / 新命中 N / 已有命中记录 N」统计也已删**（2026-10-08 复盘）：
        条数清单末尾的「共 N 条」已经给了，两种状态逐行就在「状态」列里，统计条只是重述一遍。
        统计去掉之后这一条不再撑成灰底横幅——留一个只装一颗按钮的空盒子比不留更难看，
        故收成一条贴着清单上沿、右对齐的轻量行，与下方分页器的右对齐同一条轴。
      -->
      <div v-if="inScanResult" class="scan-banner">
        <button type="button" class="link-btn" @click="exitScanResult">退出筛查</button>
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
          <span v-else class="fb-grade muted">本单尚无已标记的条目，也没有已核实成立的命中</span>
        </div>
        <button type="button" class="fb-exit" @click="clearTicketFocus">
          退出<span class="fb-x">×</span>
        </button>
      </div>

      <!--
        命中清单只服务**手动筛查（结果态）与命中明细**两个页签。
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
            <!--
              🔴 **筛查态那一列勾选框已删**（2026-10-08 裁决）：勾选只为「并入清单」而存在，
              并入取消之后一个勾选框也没有落点，故整列（表头 + 单元格）一并去掉。
            -->
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
            </td>
            <td>
              <!--
                🔴 **工单号在筛查结果态里同样可点**（2026-10-08 裁决的保底要求）：
                并入取消之后这是结果列表唯一的出口 —— 查到一条，点进那张单去处理。
              -->
              <button type="button" class="rt-no" @click="openTicket(h.ticketNo)">{{ h.ticketNo }}</button>
              <div class="hit-title">{{ h.title }}</div>
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
                  title="工单级风险等级 ＝ 该单已标记条目与已核实成立的命中取最高；同一条改判以最新结论为准"
                >本单当前 <b>{{ ticketGradeHint(h) }}</b> 危</div>
              </div>
            </td>
            <!-- 原文全文挂在 title 上：取窗只是为了读得快，要核对整段时鼠标一停就有 -->
            <td class="hit-excerpt" :title="h.excerpt">
              <span class="hit-pos">{{ h.position }}</span>
              <span class="excerpt-quote">「<template v-if="excerptWindow(h).headTruncated">…</template>{{ excerptWindow(h).before }}<span v-if="excerptWindow(h).hit" class="excerpt-hit">{{ excerptWindow(h).hit }}</span>{{ excerptWindow(h).after }}<template v-if="excerptWindow(h).tailTruncated">…</template>」</span>
            </td>
            <td>{{ h.customer }}<div class="hit-sub">{{ h.groupName }} · {{ h.assignee }}</div></td>
            <td class="hit-when">{{ h.when.slice(11) }}</td>
            <td>
              <!--
                筛查态：这一列答的是"这条命中在系统里有没有记录"——有记录的那几条
                能在「命中明细」里查到核实结论，新扫出来的则还没有任何记录。
                🔴 **结果态不出任何处置动作**：筛查只做查询（2026-10-08 裁决），
                要处置就点上一列的工单号进那张单。
              -->
              <!--
                两种取值**互为反面、措辞对仗**（「已有」↔「无」，后半截同为"命中记录"）：
                同一列里一正一反，读的人不必记住哪个词对应哪种情形。
                🔴 另一支原先叫「新命中」——那是「并入清单」时代的叫法（新＝待并入的那批），
                并入取消之后"新"字已无所指，且与左栏「今日发现」的"新"撞口径。
              -->
              <template v-if="inScanResult">
                <span v-if="scanDupIds.has(h.id)" class="state-chip">已有命中记录</span>
                <span v-else class="state-chip sc-fresh">无命中记录</span>
              </template>
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
                  <!--
                    已核实的行走的是同一个弹窗的修正态，故按钮叫「**重新识别**」——
                    与弹窗标题同字（2026-10-07 裁决：这一路的名字只认"首次 / 再次"，
                    首次「风险识别」、再次「重新识别」；
                    2026-09-29 那条"**本册（风险报备 · 监控 · 管控）内**入口按钮文案 ＝ 弹窗标题"照旧，
                    全仓另有一批"动词 + 对象"式标题（调剂工单 / 挂起工单 / 释放条目 · 单号 …），
                    这条规矩不越出本册）。
                    绝大多数已核实的记录不需要再动，故仍用次按钮排在动作末位，
                    但它必须存在——明细里翻出一条判错的，正是要改的时候。
                  -->
                  <button
                    v-if="canRiskTag"
                    type="button" class="row-btn row-btn-amend"
                    :title="historyOf(h).length > 1 ? `已修正 ${historyOf(h).length - 1} 次，可继续修正` : '重新核实并修正本条结果'"
                    @click="openTag(h)"
                  >重新识别</button>
                </template>
                <template v-else>
                  <button v-if="canRiskTag" type="button" class="row-btn row-btn-tag" @click="openTag(h)">风险识别</button>
                  <span v-else class="hit-sub">—</span>
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
      批量识别（条目那一路，只对「待打标」这一批）。结论与单条**同一个四选一**，
      不给"保持预设"这种只有批量才有的第五档 —— 批量与单条口径分家的话，
      同一批条目走两条路会得到两种结论，而进不进池全看它。
      🔴 标题与下面那一枚**同名**（入口名＝弹窗标题，2026-10-07 裁决）：两路都在待判段、
      都只做识别。内容不同（命中那一路多一格「本次命中」）不是分两个名字的理由 ——
      单条那边的「风险识别」本来就有两支完全同形的内容。
    -->
    <OpActionModal
      :open="bulkOpen"
      title="批量识别"
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
          <div class="op-label req">风险等级</div>
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
        <!-- 无风险那一句原来写「落『已判 · 无风险』档，可在那里复核」，随那一档删除改成只讲去向 -->
        <div class="tag-form-foot">
          {{
            bulkResult === NO_RISK
              ? '判为无风险的不进风险工单池，也不进「已判」'
              : '低 / 中 / 高一律进风险工单池等待领取；本批须同一结论，有分歧请分次标记'
          }}
        </div>

        <div class="op-field op-field-h op-field-h-top tag-field-note">
          <div class="op-label">风险备注</div>
          <a-textarea v-model:value="bulkNote" :rows="2" placeholder="判这个等级的依据…（可选）" />
        </div>
      </div>
    </OpActionModal>

    <!--
      批量识别（命中那一路，「未标记 · 实时监控」）。字段与单条「风险识别」一致：
      本次命中 成立 / 误报、风险等级、风险备注。标题与上面那一枚同名，见上面那段红字。
    -->
    <OpActionModal
      :open="bulkVerifyOpen"
      title="批量识别"
      :icon="TagsOutlined"
      tone="primary"
      :width="480"
      ok-text="保存"
      :ok-disabled="!canSaveBulkVerify"
      @update:open="bulkVerifyOpen = $event"
      @ok="saveBulkVerify"
    >
      <div class="op-form tag-modal-form">
        <div class="tag-hit-head tag-bulk-head">
          <div class="tag-bulk-summary">
            <span>已选 <strong>{{ bulkTargets.length }}</strong> 单</span>
            <span class="tag-hit-sep">·</span>
            <span>待核实命中 <strong>{{ bulkVerifyHits.length }}</strong> 条</span>
          </div>
        </div>

        <div class="op-field op-field-h tag-field-block">
          <div class="op-label req">本次命中</div>
          <div class="op-radio-cards op-radio-cards--row tag-radio-compact tag-radio-fill">
            <div
              class="op-radio-card"
              :class="{ on: bulkVerdict === '成立' }"
              @click="bulkVerdict = '成立'"
            >
              <div class="op-rc-title">成立</div>
            </div>
            <div
              class="op-radio-card"
              :class="{ on: bulkVerdict === '误报' }"
              @click="bulkVerdict = '误报'"
            >
              <div class="op-rc-title">误报</div>
            </div>
          </div>
        </div>

        <div class="op-field op-field-h tag-field-block">
          <div class="op-label req">风险等级</div>
          <div
            class="op-radio-cards op-radio-cards--row tag-radio-compact tag-radio-fill"
            :class="{ 'op-radio-disabled': bulkVerdict === '误报' }"
          >
            <div
              v-for="g in GRADES"
              :key="g"
              class="op-radio-card"
              :class="{ on: bulkVerifyLevel === g }"
              :style="bulkVerifyLevel === g ? { borderColor: RISK_LEVEL_STYLE[g].color, background: `${RISK_LEVEL_STYLE[g].bg}33` } : {}"
              @click="bulkVerdict !== '误报' && (bulkVerifyLevel = g)"
            >
              <div class="op-rc-title">{{ g }}危</div>
            </div>
          </div>
        </div>

        <div class="op-field op-field-h op-field-h-top tag-field-note">
          <div class="op-label">风险备注</div>
          <a-textarea v-model:value="bulkVerifyNote" :rows="2" placeholder="本次核实的依据…（可选）" />
        </div>
      </div>
    </OpActionModal>

    <!--
      条目打标形态：四选一（高 / 中 / 低 / 无风险）。首次打标与二次修改共用这一个弹窗，
      只在按钮文案、必填项与留痕区上分叉 —— 与命中那一路的弹窗同一副骨架。
      🔴 **标题随入口变、副标题恒为「来源 · 单号」**（2026-10-07 裁决，见 `entryTagModalTitle`）：
      从**待判段**打开写「**风险识别**」（本单尚无结论，这一步在定级），
      从**已判段**打开写「**风险管控**」（已有结论，这一步是改判与处置）。
      规矩是「入口名＝它自己那个弹窗的标题」—— 它放宽了 2026-09-29 那条"六处同名"，
      但仍守住当初要治的病（每个入口都有确定的名字、点进去标题与它一致）：
      改名前是**同一类动作**在各页各叫一个名，现在是**两类不同动作**（识别 / 管控）各有自己的名字
      （识别这一族还按"首次 / 再次"分「风险识别」「重新识别」）。
      "这次是改已有结论"仍由按钮文案与改判时必填的「风险备注」说清，不靠标题。
    -->
    <OpActionModal
      :open="entryTagOpen"
      :title="entryTagModalTitle"
      :subtitle="entryTagSubtitle"
      :icon="SafetyCertificateOutlined"
      tone="primary"
      :width="480"
      :ok-text="entryTagOkText"
      :ok-disabled="!canSaveEntryTag"
      @update:open="entryTagOpen = $event"
      @ok="saveEntryTag"
    >
      <div v-if="entryTagTarget" class="op-form tag-modal-form">
        <div class="tag-hit-head">
          <div class="tag-hit-top">
            <button type="button" class="tag-ticket-no" @click="openTicketFromModal(entryTagTarget.ticketNo)">
              {{ entryTagTarget.ticketNo }}
            </button>
            <span class="tag-hit-title">{{ rowTitleOf(entryTagTarget) }}</span>
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
                <span class="excerpt-quote">「<template v-if="excerptWindow(s).headTruncated">…</template>{{ excerptWindow(s).before }}<span v-if="excerptWindow(s).hit" class="excerpt-hit">{{ excerptWindow(s).hit }}</span>{{ excerptWindow(s).after }}<template v-if="excerptWindow(s).tailTruncated">…</template>」</span>
              </div>
            </li>
          </ol>
        </div>

        <!--
          🔴 **四选一 + 风险备注：各处弹窗同一份共享件**（2026-09-29 裁决；入口名 2026-10-07 收成
          识别（风险识别 / 重新识别）与管控（风险管控）两类，共享件不随名字分叉）。
          四个答案回答的是同一个问题——"这张单有没有风险、多大"。拆成"有没有风险 + 等级"
          两个字段会立刻长出"无风险却带着等级""有风险却没等级"两种非法组合，
          而这两种组合恰恰决定条目进不进池。

          本形态的 state 与落库照旧走自己那条路（`entryTagResult` / `entryTagNote` /
          `saveEntryTag`），只是把它们包成 `entryTagLevelView` 交给共享件渲染。
        -->
        <RiskLevelFields :ctl="entryTagLevelView" />

        <!--
          🔴 **「风险处理措施」段只在「风险管控」形态出**（2026-10-07 裁决）：第一道门是入口
          —— `entryTagFrom === 'judged'`。待判段打开的那一枚叫「风险识别」，它只做识别
          （风险等级 + 风险备注），整块下半一个字都不出。
          段内按原单类型分岔：非投诉单走判是否升级那一支、投诉单走给处理意见那一支。
          两支互斥、都可留空；其余门控见 `tagLowerHalfOpenFor` 与它派生的
          `showTagAssessFor` / `showTagCollabFor`。

          ① 非投诉单这一支（判出高 / 中 / 低之后接出）。🔴 **可留空**：
          不选评估决策就照旧只打标、条目进池等领取；给了结论则条目照常进池但
          **直接落「已结论」**，结论人＝标记人。字段、校验、派生与红字文案与本页评估弹窗
          **同一套**（同一份 `escalateFields` 实例 + 共享组件 `EscalateComplaintFields`）。

          🔴 **已出结论的条目照样出这一段、且结论可以重新给**（2026-10-07 裁决，推翻
          §9 规则 22）：打开即灌着现行结论（见 `openEntryTag`），改完提交覆盖**当前**结论、
          历次留痕往第八类履历累积（`riskPool.applyAssessment` 的 `prev`）。
          **派生过投诉单的条目**决策锁在「升级」、「不升级」置灰，再次提交只更新正文、
          一张单都不再造（判据与落库见 `commitTagAssess` 的派生门）。
        -->
        <section v-if="showEntryTagAssess" class="assess-block assess-block-form">
          <!-- 段名恒为「风险处理措施」（六处同名，2026-09-29 追加裁决）；内容随原单类型分岔 -->
          <h4 class="assess-block-title">风险处理措施</h4>

          <div class="op-field assess-dec-field">
            <!--
              决策**不带必填星**：留空是合法的一种（＝不评估），与评估弹窗那一处的口径差别只在这里。
              🔴 条目**已派生过投诉单**时「不升级」那一档置灰：那张单既撤不掉、也没有动作去撤它。
              做法照「无风险」置灰那一处 —— 挡住（`disabled`）+ 说清为什么（title + 下面那行脚注）。
            -->
            <div class="op-field-h assess-dec-row">
              <div class="op-label">评估决策</div>
              <a-radio-group v-model:value="entryTagAssessDecision" class="assess-dec-inline">
                <a-radio
                  v-for="d in ASSESS_DECISIONS"
                  :key="d"
                  :value="d"
                  :disabled="d === '不升级' && entryTagNoDowngradeLocked"
                  :title="d === '不升级' && entryTagNoDowngradeLocked ? entryTagNoDowngradeTip : undefined"
                >{{ d }}</a-radio>
              </a-radio-group>
            </div>
            <div v-if="entryTagNoDowngradeLocked" class="tag-form-foot assess-dec-foot">
              {{ entryTagNoDowngradeTip }}；再次提交只更新结论正文，不会重复派生。
            </div>
          </div>

          <!--
            结论正文那一格（「不升级」→ 处理意见、「升级」→ 升级说明），两者写的是同一个格子。
            ⚠️ 选「升级」且**要派生新单**时它并进下面那一段、改由段内的「升级说明」渲染；
            已派生过的那一路段不出，正文就回到这里（见 `showEntryTagAssessAdvice`）。
          -->
          <div v-if="showEntryTagAssessAdvice" class="op-field">
            <div class="op-label req">{{ entryTagAssessAdviceLabel }}</div>
            <a-textarea
              v-model:value="assessAdvice"
              :rows="3"
              :placeholder="entryTagAssessAdvicePlaceholder"
            />
            <div v-if="missEntryTagAssessAdvice" class="assess-err">请填写{{ entryTagAssessAdviceLabel }}</div>
          </div>

          <!-- 投诉工单专属字段（投诉一类 / 二类 / 升级说明），三项均必填，与评估弹窗共用组件与状态 -->
          <EscalateComplaintFields v-if="showEntryTagAssessEscalate" :ctl="escalateFields" />
        </section>

        <!--
          ② 投诉单：「协同处理」段（处理意见 / 建议事项 /「其他」的具体建议）。
          **整段是共享件**，与工单页页头「风险管控」弹窗的投诉支、风险工单池的协同处理弹窗
          用的是同一个组件与同一个 composable —— 字段、占位文案、红字与落库只此一份。
          🔴 **可留空**：一项都没动就只打标、条目进池等领取；动过任意一项即走
          `useRiskCollabFields` 的校验与 `submitTo` 落库（首次协同同时把条目转「已结论」）。
        -->
        <RiskCollabFields v-if="showEntryTagCollab" :ctl="entryTagCollab" />

        <!-- 标记历史：它是佐证不是填写项，按信息层级排在最后。追加不覆盖，故爬坡读得出先后 -->
        <div v-if="entryTagHistory.length" class="tag-trace">
          <div class="tag-trace-head">
            标记记录<span class="tag-trace-n">{{ entryTagHistory.length }} 条</span>
          </div>
          <ol class="tag-trace-list">
            <li v-for="(e, i) in entryTagHistory" :key="`${e.at}-${i}`" class="tt-item">
              <div class="tt-head">
                <span class="tt-step">{{ i === 0 ? '首次标记' : `第 ${i} 次修正` }}</span>
                <span class="tt-by">{{ e.by }}</span>
                <span class="tt-role">{{ e.byRole }}</span>
                <span class="tt-at">{{ e.at }}</span>
              </div>
              <div class="tt-change">
                {{ e.level ? `${e.level}危` : '无风险' }}
                <span v-if="e.viaHitVerify" class="tt-role">由命中核实</span>
              </div>
              <!--
                每条带当次的风险备注。改判那几条的"为什么改"就在这里
                （「修正原因」已取消、约束迁到备注上，2026-09-29）；没填的不占位。
              -->
              <div v-if="e.note" class="tt-reason">备注：{{ e.note }}</div>
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

    <!--
      命中那一路的弹窗：首次核实与后续修正共用同一个弹窗，只在必填项与留痕区上区分。
      🔴 **标题随"首次 / 再次"变、副标题恒为「来源 · 单号」**（2026-10-07 裁决，见 `tagModalTitle`）：
      首次打开写「**风险识别**」，已有结论再打开写「**重新识别**」——
      两个入口（待判段的召回清单行 / 命中明细行）答的是同一个问题"这条命中成不成立、风险多大"，
      故入口不进标题；这一路**没有处置段**，所以"再次"仍归识别、不叫管控
      （条目那一路的"再次"带处置段才叫「风险管控」，见 `entryTagModalTitle`）。
      与条目弹窗仍靠**内容**（命中原话 / 条目结论）分辨，不靠标题。
    -->
    <OpActionModal
      :open="tagOpen"
      :title="tagModalTitle"
      :subtitle="tagSubtitle"
      :icon="SafetyCertificateOutlined"
      tone="primary"
      :width="480"
      :ok-text="tagOkText"
      :ok-disabled="!canSaveTag"
      @update:open="tagOpen = $event"
      @ok="saveTag"
    >
      <div v-if="tagTarget" class="op-form tag-modal-form">
        <div class="tag-hit-head">
          <div class="tag-hit-top">
            <button type="button" class="tag-ticket-no" @click="openTicketFromModal(tagTarget.ticketNo)">
              {{ tagTarget.ticketNo }}
            </button>
            <span class="tag-hit-title">{{ tagTarget.title }}</span>
          </div>
          <div class="tag-hit-excerpt" :title="tagTarget.excerpt">
            <span class="hit-pos">{{ tagTarget.position }}</span>
            <span class="excerpt-quote">「<template v-if="excerptWindow(tagTarget).headTruncated">…</template>{{ excerptWindow(tagTarget).before }}<span v-if="excerptWindow(tagTarget).hit" class="excerpt-hit">{{ excerptWindow(tagTarget).hit }}</span>{{ excerptWindow(tagTarget).after }}<template v-if="excerptWindow(tagTarget).tailTruncated">…</template>」</span>
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

        <!--
          风险等级。🔴 **判「误报」时整段不出**（2026-09-29 追加裁决）：
          误报的结论是"**规则捞错了**"，不是"风险很低"——这一次核实里没有等级要调，
          落库本来就是 `误报 → null`（见 `tagLevelToSave`）。原先那一路是把三档置灰摆着，
          等于界面上摆着一个选了也不生效的答案，与口径打架。
          `tagLevel` 在段不出这段时间里**不被写**，故切回「成立」时自动还是切换前那个值。
          段不出**不带来任何新的必填拦截**：`canSaveTag` 本来就只认 `tagVerdict` 与风险备注。
        -->
        <div v-if="tagVerdict !== '误报'" class="op-field op-field-h tag-field-block">
          <div class="op-label req">风险等级</div>
          <div class="op-radio-cards op-radio-cards--row tag-radio-compact tag-radio-fill">
            <div
              v-for="g in GRADES"
              :key="g"
              class="op-radio-card"
              :class="{ on: tagLevel === g }"
              :style="tagLevel === g ? { borderColor: RISK_LEVEL_STYLE[g].color, background: `${RISK_LEVEL_STYLE[g].bg}33` } : {}"
              @click="tagLevel = g"
            >
              <div class="op-rc-title">{{ g }}危</div>
            </div>
          </div>
        </div>

        <!--
          风险备注。**修正时必填**（2026-09-29 裁决把原来那格「修正原因」并了进来：
          两格都在答"这一次是怎么判的、为什么"，修正时人得把同一件事写两遍）。
          修正形态下本格从空开始、placeholder 换成问"为什么改"——只记改前改后，复盘时链条仍是断的。
        -->
        <div class="op-field op-field-h op-field-h-top tag-field-note">
          <div class="op-label" :class="{ req: tagAmend }">风险备注</div>
          <a-textarea
            v-model:value="tagNote"
            :rows="2"
            :placeholder="tagAmend
              ? '为什么改判，如：复听通话录音，客户并未提及外部渠道（必填）'
              : '本次核实的依据…（可选）'"
          />
        </div>

        <!--
          🔴 **本弹窗没有「风险处理措施」段**（2026-10-07 裁决）：「风险识别」/「重新识别」两态
          只答"命中成不成立、风险多大、风险备注写什么"，处置怎么做归「风险管控」那一类弹窗。
          段连带那条"标完顺手给结论"的捷径一并取消 —— 核实打标之后条目照原路进池落「待领取」。
        -->

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
              <!--
                每条带当次的风险备注。修正那几条的"为什么改"就在这里
                （「修正原因」已取消、约束迁到备注上，2026-09-29）；没填的不占位。
              -->
              <div v-if="e.note" class="tt-reason">备注：{{ e.note }}</div>
            </li>
          </ol>
        </div>
      </div>
    </OpActionModal>

    <!--
      风险管控 · 评估结论（《【930】》§5.4）。
      🔴 **标题恒为「风险管控」+ 副标题「来源 · 单号」**（2026-09-29 裁决）：与工单页页头
      那一枚逐字同形。原来那个按来路二选一的标题（「风险评估」/「评估报备」）已取消 ——
      同一个弹窗在两条线上各叫一个名字，说"去评估"没人知道指的是哪一处。
      主按钮**不做 disabled**：报备信息一屏读完就要下结论，按钮灰着不说为什么，
      人只能逐项试探哪里没填。故点了就校验、缺哪项在哪项下面出红字（missAssess* 一组）。
    -->
    <OpActionModal
      :open="assessOpen"
      title="风险管控"
      :subtitle="assessSubtitle"
      :icon="SafetyCertificateOutlined"
      tone="primary"
      :width="600"
      :ok-text="assessOkText"
      @update:open="assessOpen = $event"
      @ok="confirmAssess"
    >
      <div v-if="assessTarget" class="op-form assess-form">
        <!--
          ① 第一区块：**按原单来路分两种**（PRD §5.3.2，A 线「入池依据」/ B 线「报备信息」），
          与工单页 OpRiskControlModal 共用 RiskAssessSheet，字段、出现条件与样式只在那一处改。
        -->
        <RiskAssessSheet :target="assessTarget" />

        <!--
          ② 风险等级：各处入口同一段，共用 RiskLevelFields（2026-09-29 裁决；
          入口名 2026-10-07 拆成三类，这一段不随名字分叉）。
          已有等级预置可改（改了即改判、风险备注转必填），本来没有则必填；
          本单还推不出监控来源时整段不出（见 ctl.visible）。
        -->
        <RiskLevelFields :ctl="assessLevel" />

        <!-- ③ 风险处理措施：二选一决策 + 必填说明。段名六处同名（2026-09-29 追加裁决） -->
        <section class="assess-block assess-block-form">
          <h4 class="assess-block-title">风险处理措施</h4>

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
          </div>

          <!--
            结论正文那一格。选「升级」（且会派生新投诉单）时它并进下面那一段、改由段内的
            「升级说明」渲染，故本格只在**段不出**时出；两处渲染的是同一个格子
            （assessAdvice 代理 escalateFields.fields.advice）。
          -->
          <div v-if="!showEscalateFields" class="op-field">
            <div class="op-label req">{{ assessAdviceLabel || '处理意见' }}</div>
            <a-textarea
              v-model:value="assessAdvice"
              :rows="3"
              :placeholder="assessAdvicePlaceholder || '请先选择评估决策'"
            />
            <div v-if="missAssessAdvice" class="assess-err">请填写{{ assessAdviceLabel || '处理意见' }}</div>
          </div>

          <!--
            投诉工单专属字段：选「升级」（且会派生新投诉单）时才出。
            投诉一类 / 二类 / 升级说明三项、均必填；切到「不升级」整段隐藏、已填值保留。
            组件与状态和工单页底栏、风险报备池两个评估入口共用，本页不另写一份字段表。
            🔴 它在**本段 `<section>` 之内**（六处一致，2026-09-30 裁决）：它填的是本段
            「升级」这一档的要素，摆到段外会读成与「风险处理措施」并列的第四段。
          -->
          <EscalateComplaintFields v-if="showEscalateFields" :ctl="escalateFields" />
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
      🔴 **分派弹窗已删**（业务第三轮拍板取消分派 / 改派 / 批量分派整套）。
      🔴 **释放弹窗已删**（2026-10-09：领取 / 释放 / 等待时长整套撤出本工作面，归风险报备池）。
      那个弹窗是「释放」唯一的落点，按钮一撤它就没有入口了，连同 `openRelease` /
      `confirmRelease` / `canReleaseRow` / `canReleaseAny` 与 `.rm-release` 一族样式一并删净。
      ⚠️ **报备池那个释放弹窗（`RiskReportPoolPanel` 的 `rrp-release`）一个字没动**，
      store 的 `release` 与条目上的释放留痕同样没动；本页仍看得见释放记录 ——
      它在评估弹窗第一区块里（共享件 `RiskAssessSheet`）。
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
 * 三栏：实时监控（今日扫描流量）｜ 重点工单（在办工单）｜ 风险工单（已判条目）。
 * 🔴 **三栏现在各四格，故三等分**（2026-10-07 卡区改版）：
 * 上一版是 1.15 : 0.85 : 1 —— 彼时中栏只有两个 KPI，不收窄它会空出一截。
 * 中栏改成优先级四维之后三栏格数齐平，再留那个比例反而会把中栏的
 * 「P2（普通加急）」挤成两行。
 */
.effect-split {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
 * 【左栏定宽 158px】阶段切换器用两字（待判 / 已判）；重点工单子档文案同建单优先级下拉。
 * 🔴 **一行都不许折行、不许省略号截断** —— 档名是这个选择器的唯一标识。
 */
.funnel-layout {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.funnel-rail {
  flex: none;
  width: 158px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 8px;
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
  gap: 2px;
  padding: 3px 1px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #6b7280;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
  cursor: pointer;
}
.fr-seg-label { letter-spacing: -0.02em; }
.fr-seg-btn:hover { color: #111827; }
.fr-seg-btn.on {
  background: #fff;
  color: #1a6fff;
  font-weight: 700;
  box-shadow: 0 1px 2px rgba(17, 24, 39, 0.1);
}
/* 阶段总数：比段名大一号且等宽数位 —— 这个控件上要读的就是这两个数 */
.fr-seg-num {
  font-size: 12px;
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
  gap: 4px;
  width: 100%;
  padding: 4px 6px 4px 8px;
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
  min-width: 20px;
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
/*
 * 🔴 **原先这里有一条 `.fr-sep`**（档位之间的细分隔线），只给已判段「无风险」那一档用 ——
 * 它是漏斗的漏出口、不能和上面几档排成一列读。那一档随 2026-10-07 裁决删除，
 * 这一列再没有要隔开的行，样式连同 `RailItem.sep` 与模板里那个节点一并删掉。
 */
/*
 * 缩进语法（左栏收窄后靠**缩进 + 字号/字重弱化**分层，不再加图标）：
 *   d0 阶段全量 / 阶段本身 / 与全量并列的另一种分类 —— 不缩进、字重加粗、颜色最深；
 *   d1 上一行那一类的取值行 —— 缩进一级、常规字重；
 *   d2 取值行里再展开的一层 —— 缩进两级、更小字号、更浅。
 */
.fr-item.d0 { padding-left: 8px; color: #374151; font-weight: 600; font-size: 12px; }
.fr-item.d1 { padding-left: 16px; color: #6b7280; font-weight: 500; font-size: 12px; }
.fr-item.d2 { padding-left: 24px; padding-top: 2px; padding-bottom: 2px; color: #949dab; font-weight: 400; font-size: 11px; }
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
 * 表头只剩右侧那排动作（批量操作 / 手动筛查 / 命中明细）。
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
  /* 窄屏下那条 `.fr-sep` 的竖线写法随 `.fr-sep` 本身一并删除（见上面那段说明） */
}

/*
 * 🔴 **原先这里有一组分级筛选 chip 的样式**（`.grade-filters` / `.gf-chip` / `.gf-dot` /
 * `.gf-num`），服务工作面筛选区那几排 chip。**五维全部改成了上沿工具条里的下拉筛选项**
 * （2026-10-08 裁决），那几排连同这组样式一并删净 —— `<style scoped>` 下它们只可能被
 * 本文件用到，grep 过本文件模板，一处引用都不剩。
 * ⚠️ `.section-filters` 这个容器类**保留**：页头那一行工具（`.section-filters.head-tools`）
 * 还在用它，不是只为筛选区存在的。
 */

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

.hit-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
.hit-table--kw .row-btn { white-space: nowrap; }
/*
 * 召回清单 ↔ 重点工单富列表：同一套字号（与 TicketTitleCell / 摘要列一致）
 * 标题 13 · 正文 12 · 字段标签 10–11
 */
.funnel-main .hit-table--kw { font-size: 12px; }
.funnel-main .hit-table--kw .hit-ticket-link {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: #111827;
}
.funnel-main .hit-table--kw .hit-ticket-link:hover {
  color: #1a6fff;
}
.funnel-main .hit-table--kw .hit-excerpt,
.funnel-main .hit-table--kw .hit-clip-line,
.funnel-main .hit-table--kw .track-word,
.funnel-main .hit-table--kw .hit-type-cell,
.funnel-main .hit-table--kw .hit-when {
  font-size: 12px;
  line-height: 1.4;
}
.funnel-main .hit-table--kw .hit-pos {
  font-size: 10px;
  line-height: 16px;
}
.funnel-main .hit-table--kw .grade-pill {
  font-size: 11px;
}
.hit-table th {
  text-align: left; font-weight: 600; color: #6B7280; font-size: 11px;
  padding: 8px 10px; border-bottom: 1px solid #E5E7EB; background: #F3F4F6;
}
.hit-table td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
/*
 * 🔴 **召回清单的勾选列按整单合并（`rowspan`），必须顶对齐** —— 否则看上去像
 * "有的行有勾选框、有的行没有"（业务原话「多选框有时候有，有时候没有，是bug了吧」）。
 *
 * 【病因】上面那条 `vertical-align: middle` 对一个跨 N 行的 `<td>` 生效时，
 * 勾选框被垂直居中到**整组的正中**：一单三条命中时它飘到第二条（续行）旁边，
 * 组首行反而空着；而只有一条命中的组（`rowspan=1`）又正好对齐 ——
 * 同屏里两种混着出现，于是读成"随机有无"。
 * 实测默认档 15 行 / 10 组：只有 6 个落在自己那一行、4 个飘走，15 行里 5 行旁边没有勾选框。
 *
 * 【修法】顶对齐 + 按行高补 `padding-top`（9 ＝ (34 行高 − 16 勾选框) / 2），把它钉在组首行。
 * 🔴 **纯 CSS、不动模板**：勾的仍是整单（`rowspan` 的语义没变），只是画在哪一行。
 * ⚠️ 选择器带 `--kw` 限定：`tbody` 里只有勾选列带 `rowspan`（实测命中 10 个 td、
 * `cellIndex` 全 0），其余 `.hit-table` 实例不受影响。
 */
.hit-table--kw tbody td[rowspan] { vertical-align: top; padding-top: 9px; }
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
 * 召回清单：flex 写在 td 上会破坏表格列对齐（表头与数据列错位）。
 * 单行省略放在内层 div；列宽由 colgroup + table-layout: fixed 约束。
 */
.hit-table td.hit-ticket-cell,
.hit-table td.hit-excerpt,
.hit-table td.hit-customer-cell,
.hit-table td.hit-handler-cell {
  overflow: hidden;
  max-width: 0;
}
.hit-type-cell {
  font-size: 12px;
  color: #374151;
  white-space: nowrap;
  text-align: center;
}
.hit-excerpt-inner {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}
.hit-ticket-link {
  display: block;
  width: 100%;
  max-width: 100%;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-size: 12px;
  font-weight: 500;
  color: #1a6fff;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: inherit;
}
.hit-ticket-link:hover { text-decoration: underline; }
.hit-table td.hit-excerpt .hit-pos { flex: none; }
.hit-table td.hit-excerpt .excerpt-quote {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: normal;
}
.hit-clip-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #475569;
}
.hit-handler-cell .hit-clip-line { color: #4b5563; }
.hit-table td.hit-act-cell { white-space: nowrap; }
.hit-when { white-space: nowrap; }
/*
  命中词高亮。取本页既有的琥珀强调（与「待核实」标 .tsb-open 同一对色值），
  不用 <mark> 的浏览器默认荧光黄——那个色在本页任何一处都没出现过，看着像别的系统混进来的。
  三处片段（命中清单 / 打标弹窗顶部 / 同单其它命中）共用这一份。
*/
.excerpt-quote { word-break: break-word; }
.excerpt-hit {
  display: inline;
  padding: 0 2px;
  border-radius: 2px;
  background: #fef3c7;
  color: #b45309;
  font-weight: 600;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
.hit-pos { display: inline-block; padding: 0 5px; margin-right: 4px; border-radius: 3px; background: #F3F4F6; color: #6B7280; font-size: 11px; }
.hit-when { color: #64748b; font-variant-numeric: tabular-nums; font-size: 12px; }

.track-word { color: #475569; font-size: 12px; font-weight: 500; }
.grade-pill-inline { padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }

.hit-flag { display: inline-block; margin-top: 4px; padding: 0 6px; border-radius: 3px; font-size: 10px; }

/* 工单级事实：同单互见徽标 + 工单级等级提示，同处工单列 */
.ticket-facts { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
/* 徽标可点，故给出按钮形态与主色描边，与同列不可点的纯文本标记区分开 */
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
/*
 * 手动筛查条的动作列排成**两行**（2026-10-07 用户指定）：
 *   [查询] [重置]   ← 第一行，各占一半
 *   [ 保存筛选器 ]   ← 第二行，整行
 *
 * 🔴 **只写成 `.scan-bar` 的后代规则**：`.tb-actions` 的竖排本体与
 * `.list-toolbar--one-line .tb-actions` 的横排覆盖是**台账条与「未标记」筛选条共用**的
 * （那两条各只有两枚按钮、现状不动），改它们会把那两条一起带走。
 * 🔴 **高度仍是 28px**：同条里的输入控件与 `.fi` 行都按 28px 对基线，
 * "调小一些"只收横向 padding 与字号，不碰高度。
 */
.scan-bar .tb-actions {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  /* 两枚并排放得下（原来是 84px，只够竖排一枚） */
  min-width: 148px;
}
.scan-bar .tb-actions .scan-go,
.scan-bar .tb-actions .tb-btn {
  flex: 1 1 0;
  width: auto;
  padding: 0 8px;
  font-size: 12px;
}
.scan-bar .tb-actions .tb-btn-row2 {
  flex: 1 1 100%;
  width: 100%;
}
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
/*
 * 这条工具条**没有右侧动作区**（班组 / 监控来源 / 原单类型 三个筛选项都是选完即生效、
 * 不需要「查询」按钮），故收掉 `.list-toolbar` 的第二列。
 * ⚠️ 类名原先叫 `--group-only`（那时这一行上只有「班组」一个字段）。2026-10-08 把
 * 「监控来源」「原单类型」两维收进来之后那个名字已不准，改按"没有动作区"这个真实差异命名。
 */
.list-toolbar--no-actions {
  grid-template-columns: 1fr;
}

/* 筛选条：标签左、控件右（固定标签宽，列内对齐）；默认右侧动作竖排（手动筛查等多行字段） */
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

/*
 * 台账 / 未标记筛选条：整栏一行（字段横排 + 查询/重置并排）。
 * 写在 `.tb-actions` 竖排规则之后，避免动作列把工具条撑到 ~80px 高。
 */
.list-toolbar--one-line {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px 10px;
  padding: 6px 10px;
}
.list-toolbar--one-line .tb-fields {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px 10px;
  min-width: 0;
}
.list-toolbar--one-line .fi {
  flex: 1 1 0;
  min-width: 0;
}
.list-toolbar--one-line .fl {
  width: 3.5em;
}
.list-toolbar--one-line .tb-actions {
  display: flex;
  flex-direction: row;
  flex: none;
  align-items: center;
  align-self: center;
  gap: 8px;
  min-width: 0;
}
.list-toolbar--one-line .tb-actions .scan-go,
.list-toolbar--one-line .tb-actions .tb-btn {
  width: auto;
}
/*
 * 字段区 ＝ **一格一宽、按各自最长取值量出来的** flex 行（2026-10-09 改）。
 * 三条筛选条共用这一套：评估处置工作面（5 格）· 已判段（4 格）· 待判那两路
 * （实时监控 4 格 / 重点工单 3 格，外加两枚按钮）。
 *
 * 🔴 **原先是等宽轨网格 `repeat(auto-fit, 200px)`，改掉了**：各维最长取值差着一倍
 * （`SLA` 那一格最长「已超时」39px，`产品` 那一格「智能录音笔 SR302」105px），
 * 等宽轨按最长的那一格给所有格，一条四格的筛选条白白多占 60~80px，直接导致要换行。
 *
 * 🔴 **每一格的宽度写在模板里的 `--tbw`，数是量出来的**（13px 字 canvas 实测，
 * 取值域取"这一格全部选项里最长的那一个"，不是当前选中的那一个 —— 后者会让控件随选随变宽）：
 *   · 单选控件宽 ＝ 文字 ＋ 34（左右内边距 7×2 ＋ 边框 2 ＋ 右侧箭头预留 18），再留 3px 余量；
 *   · 多选控件宽 ＝ 文字 ＋ 56（上面那些 ＋ 标签自己的内边距与关闭叉约 22）；
 *   · 标签按内容宽（12px 字）：四字 48 / 三字 36 / 两字 24 / `SLA` 21。
 *   ⚠️ **余量 6 → 3 是 2026-10-09 为了把工作面那条压进窄窗的一行榨出来的**（五格省 15px），
 *     已逐格看画面确认最长取值仍一个字不缺。**再往下收就会复现 184px 那一版的截断**。
 *   🔴 **只能看画面、不能信 `scrollWidth === clientWidth`**：实测那两个值相等时画面上
 *     照样有省略号（上一轮就是这么误判了一次，184px 那一版「全部来源（14」真的被切了）。
 *   🔴 **按"大多数够用"取宽必被打脸**：本仓在「等待时长」「结论时间」「风险管控」
 *     三列上已经踩过三次。
 *
 * 🔴 **换行点仍然只由容器宽度决定**：每一格的宽度是定值、与当前选中什么无关，
 * 故不会随筛选结果忽上忽下。**不出横向滚动条**。
 */
.list-toolbar--one-line.list-toolbar--no-actions .tb-fields,
.list-toolbar--one-line.list-toolbar--grid .tb-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  max-width: 100%;
  /* 🔴 格间 12 → 10（2026-10-09 为把工作面那条压进窄窗的一行）：四道间距省 8px */
  gap: 6px 10px;
}
/*
 * 🔴 左右内边距 10 → 6（2026-10-09，同上为把工作面那条压进窄窗的一行）：两侧省 8px。
 * **三条筛选条一起收**，不动「命中明细」那条台账条 —— 三条之间左边缘要对齐，
 * 只收其中一条会让人在切档时看见工具条整体左右跳。
 */
.list-toolbar--one-line.list-toolbar--no-actions,
.list-toolbar--one-line.list-toolbar--grid { padding-inline: 6px; }
/* 没有右侧动作区的那一条按内容排；带动作区的那一条仍吃满左侧剩余宽（动作区自己 flex: none） */
.list-toolbar--one-line.list-toolbar--no-actions .tb-fields { flex: none; }
.list-toolbar--one-line.list-toolbar--grid .tb-fields { flex: 1 1 auto; }
.list-toolbar--one-line.list-toolbar--no-actions .fi,
.list-toolbar--one-line.list-toolbar--grid .fi {
  flex: 0 0 auto;
  min-width: 0;
  /* 🔴 标签→控件 6 → 4（同上）：五格省 10px */
  gap: 4px;
}
/* 标签按内容宽：省下的宽度全留给控件 */
.list-toolbar--one-line.list-toolbar--no-actions .fl,
.list-toolbar--one-line.list-toolbar--grid .fl { width: auto; }
/* 🔴 `--tbw` 由模板逐格给（量出来的数）；没给的退回 136px，够「全部X（14）」那一类取值 */
.list-toolbar--one-line.list-toolbar--no-actions .tb-ctl,
.list-toolbar--one-line.list-toolbar--grid .tb-ctl {
  flex: none;
  min-width: 0;
  width: var(--tbw, 136px) !important;
}
/*
 * 🔴 **多选格未选时那句 `全部（N）` 与同排单选格的选中值同色**（2026-10-09，业务
 * 「风格保持一致」）。
 * 【为什么要改】工作面 / 已判那条上五格并排写着同一句「全部（14）」，其中三格是**选中值**
 * （`.ant-select-selection-item`，`rgba(0,0,0,.88)`），改多选的那两格是 **placeholder**
 * （antd 默认 `rgba(0,0,0,.25)` 浅灰）—— 同一句话两种颜色，读的人会以为那两格是禁用态。
 * ⚠️ **只收在这三条筛选条内**：placeholder 在别处（手动筛查 / 命中明细那几个多选）仍是
 * 「还没填」的提示语，该浅灰就浅灰，不要一刀切全站。
 */
.list-toolbar--one-line.list-toolbar--no-actions :deep(.ant-select-selection-placeholder),
.list-toolbar--one-line.list-toolbar--grid :deep(.ant-select-selection-placeholder) {
  color: rgba(0, 0, 0, 0.88);
}

/*
 * 🔴 **窄窗下定死每行 4 格**（2026-10-09）：行数不再由"剩余空间够不够"决定。
 *
 * 【为什么非定死不可】清单区的宽度会**随纵向滚动条有无浮动 15px**：
 * 真正滚动的是外壳的 `.workspace-page-body`，它的滚动条占 15px，
 * 故清单区宽 ＝ 视口 − 450（有滚动条）或 视口 − 435（没有）。
 * 而工作面那条筛选条实需 **904**（＋左右内边距 12 ⇒ 要 916 的容器），恰好落在这条浮动带里：
 *   · 表 14 行、滚动条在 → 容器 1360−450 = 910 → 放不下 → 两行；
 *   · 筛到 2 行、滚动条消失 → 容器 1360−435 = 925 → 放得下 → 一行。
 * 于是**筛一下就从两行缩成一行，底下整张表跟着往上跳一行高**。业务拍板"窄窗接受两行"，
 * 要的是**稳定的两行**，这个跳动是缺陷、不是"接受两行"的应有之义。
 *
 * 🔴 **断点挂在视口宽上、不是容器宽**：视口**不随滚动条变**，是这里唯一拿得到的确定量。
 * 两个边界都是算出来**避开浮动带**的，不是卡在边界上凑：
 *   · 上界 **1379**（2026-10-09 第四次重算的落点）：
 *     ① 那一枚「全部（N）」把五格从 869 收到 827，上界一度算到 1299；
 *     ② 同日业务把「类型」「等级」改回四字，两个标签各 +24px ⇒ 875，上界回到 1349；
 *     ③ 同日业务再判「工单类型」改多选，那一格 117 → 186 ⇒ 五格 944，上界一度到 1419；
 *     ④ 同日业务判「工单类型的长度压缩下」⇒ 选中标签去掉计数，那一格 186 → **146**
 *        ⇒ 五格 **904** ⇒ 要 916 的容器 ⇒ 视口 ≥ 1366（有滚动条）/ ≥ 1351（没有），
 *        浮动带 [1351, 1366)。取 1380 起走自然排版，此时最窄也有 930 的容器、14px 余量。
 *     ⚠️ **本页常见窄窗（清单区 867 ⇒ 视口 1302~1317）落在这一档内**，走的是**稳定的两行
 *     （4 + 1）**；业务已拍板接受工作面这条两行，不再为回一行做妥协。
 *   · 下界 **1190**（1170 → 1220 → 1190，跟着上面那两次一起动）：已判那条四格
 *     688 → 757 → **717** ⇒ 要 729 的容器；视口 1190 时容器最窄 740、余 11px 排得下一行。
 *     **1170 仍然排不下**（容器 720 < 729），故不能退回 1170。
 *     （这一档里定死的那 4 格 ＝ 班组 + 来源 + 工单类型 + 风险等级 ＝ 717，同一个数。）
 * ⚠️ 1190 以下（本页实际窗口到不了）仍走自然换行 —— 那是"放不下就换行"，不会溢出。
 *
 * 🔴 **只收没有右侧动作区的那两条**（工作面 5 格 / 已判 4 格）：待判那两路那条带动作区
 * （查询 / 重置，自身约占 166px），定死 4 格会把那一行顶出横向滚动条。
 * 它维持自然换行 —— 实需 kw 路 789 / focus 路 567，清单区 991 下字段区可用 825，一行放得下。
 */
@media (min-width: 1190px) and (max-width: 1379px) {
  .list-toolbar--one-line.list-toolbar--no-actions .tb-fields {
    display: grid;
    grid-template-columns: repeat(4, max-content);
    justify-content: start;
  }
}

@media (max-width: 860px) {
  .list-toolbar { grid-template-columns: 1fr; }
  .list-toolbar--one-line {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .list-toolbar--one-line .tb-fields {
    flex: 1 1 100%;
    flex-wrap: wrap;
  }
  .list-toolbar--one-line .fi {
    flex: 1 1 calc(50% - 6px);
    min-width: 140px;
  }
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

/* 筛查结果条：只剩「退出筛查」一颗，故不再是横幅，而是清单上沿的一条右对齐轻量行 */
.scan-banner {
  display: flex; align-items: center; justify-content: flex-end;
  margin-bottom: 6px;
}
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

.hit-table tr.scan-dup { opacity: 0.55; }
.state-chip { padding: 1px 8px; border-radius: 10px; font-size: 12px; background: #f1f5f9; color: #64748b; }
/*
 * 「无命中记录」这一支：与默认的灰底一浓一淡，走本页的强调蓝（淡底 + 同色字，
 * 与 .vc-ok / .wt-state.on 同一套 chip 体例，只换了色相）。
 * 🔴 不用绿：绿在本页是"成立 / 启用"那一路的颜色，挂在这里会被读成"这条没事"，
 * 而它说的只是"系统里还没有这条记录"——一句事实，不是一个结论。
 */
.state-chip.sc-fresh { background: #1a6fff1a; color: #1a6fff; }
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
/* 已结论条目的「无风险」一档：置灰、不可选 */
.tag-modal-form .op-radio-card.tag-rc-locked {
  cursor: not-allowed;
  color: #c0c4cc;
  background: #f5f5f5;
  border-color: #e5e7eb;
}
.tag-modal-form .op-radio-card.tag-rc-locked .op-rc-title { color: #c0c4cc; }
.tag-modal-form .tag-field-block + .tag-field-block { margin-top: 8px; }
.tag-field-note :deep(textarea.ant-input) { font-size: 13px; }
.tag-form-foot {
  margin: -2px 0 0 86px;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.4;
}

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
/* 修正是低频动作，收到次按钮里最轻的一档 */
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

/*
 * 🔴 **原先这里有筛选区那几排的样式**：`.report-filters`（下钻收窄标那一行）、
 * `.report-source-filters`（来源 / 原单类型 / 风险等级几排的行距）、`.rf-k`（行首分类名）、
 * `.nc-chip` / `.nc-del`（可摘的收窄标）。**五维全部改成上沿工具条里的下拉筛选项之后，
 * 那几排与收窄标那一行一并撤掉**（2026-10-08 裁决），这组样式随之删净 ——
 * 筛选项自己就是"当前生效条件"的落点，同一个条件不在一屏上摆两处。
 */

/*
 * 报备表比命中表少一列长文本，min-width 相应放低，窄屏下不必无谓地出横滚。
 * table-layout: fixed 是「风险描述单行截断」的前提——自动布局下长描述会把
 * 这一列一路撑宽、把其余列挤扁，ellipsis 根本不会触发。
 *
 * ⚠️ 这条 1040 是**已判段那张条目表**的下限，本轮一格未动。
 * 池行表自己的下限见下面那一条（删两列之后已经降下来了）。
 */
.report-table-wrap .report-table { min-width: 1040px; table-layout: fixed; }
/*
 * 🔴 **池行表自己的下限 1040 → 768**（2026-10-09，删「等待时长」「承办人」两列之后重算）。
 *
 * 【这条数是怎么来的】下限 ＝ 定宽列合计 ＋ 留给弹性列「风险摘要」的那条底。
 *   · 定宽列合计 904 → **632**（256 + 64 + 96 + 128 + 88）；
 *   · 「风险摘要」的底仍取 **136**（原先 1040 − 904 就是这个数，那是已经验过能摆下两行夹断的）；
 *   · 632 + 136 ＝ **768**。
 *
 * 【为什么非降不可】这条下限不跟着列数降的话，表会被硬撑到 1040、
 * 而清单区在本页常见窗口下只有 993（窄窗 867），**表会在 `.hit-table-wrap` 里左右拖**
 * —— 那正是上一轮登记、原因是"改它要重新权衡那八列"的那条待办；
 * 八列已经变六列、每一列都重量过，那条前提没有了，故一并收掉。
 * 实测：清单区 993 ⇒ 表 993、「风险摘要」361，**横向滚动 0**；867 ⇒ 表 867、摘要 235，同样不拖。
 * ⚠️ **不要为了"更紧凑"再往下压**：768 以下「风险摘要」就低于 136 那条底，
 * 两行夹断会先被压成一行、再被 `overflow: hidden` 静默切掉 ——
 * 本仓在「等待时长」「结论时间」「风险管控」三列上已经为"压过头"付过三次账。
 */
.report-table-wrap .report-table.pool-row-table { min-width: 768px; }
/*
 * 【池行表那几列的配平简史】
 * 第一列换成工单标题单元格（168 → 256）之后，多出来的 88px 全部就地腾出来了 ——
 * 删「原单类型」整列 −64，余下 24 从弹性的「风险摘要」让。
 * 2026-10-08 删「处置阶段」整列之后再配平一次：腾出的 80px 里，
 * 「监控来源」88 → 96、「承办人」72 → 80 各拿回上一轮被挤掉的 8px，余下 64 全给「风险摘要」，
 * 定宽列合计 968 → 904（八列）。
 * 🔴 **2026-10-09 删「等待时长」「承办人」两列、「操作」136 → 88**：定宽列 904 → **632**（六列），
 * 腾出的 272 全部给「风险摘要」，表自己的下限同步 1040 → 768（见上面那一条）。
 * 于是这张表**不出横向滚动条**，弹性的「风险摘要」拿到的是"清单区可视宽 − 632"
 * （实测清单区 993 下为 361px），再窄也还有 768 − 632 ＝ 136px 的下限，
 * 不会被压成 0 宽、整列静默消失。
 */
/*
 * 🔴 **「风险摘要」改成两行夹断**（只收在池行表这一张）：这一列是全表唯一说明
 * "这条为什么有风险"的地方，而第一列换成标题单元格之后它分到的宽度只剩百来像素，
 * 单行省略读到的是半句话。标题单元格本身已把行撑到 53px，**两行摘要落在 46px 以内、
 * 行高一格不涨** —— 同样的宽度下可读字数翻一倍，不付任何代价。
 * 全文照旧挂在 title 悬停上。`.rr-desc` 是两张表共用的类，故带 `.pool-row-table` 限死。
 */
.report-table-wrap .report-table.pool-row-table td.rr-desc {
  white-space: normal;
  overflow: hidden;
}
/*
 * 夹断落在里面这个 span 上 —— `<td>` 的 display 会被浏览器算回表格单元格，
 * `-webkit-line-clamp` 在它身上整条失效（详见模板里那一格的说明）。
 * `max-height` 是第二道闸：万一哪天 `-webkit-box` 这套被弃用，也只会硬切在两行处，
 * 不会让第三行露出半截字。
 */
.report-table-wrap .report-table.pool-row-table td.rr-desc .rr-clamp2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 17px;
  max-height: 34px;
}
/*
 * 监控来源标：与扫库记录的 .run-kind 同一个胶囊形态（本页已有的"分类标"写法），
 * 不另造一种。关键词触发单独着色，与另两类按工单属性自动识别的来源区分开。
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
/* 风险描述单行截断：队列是用来挑下一条评的，全文在 title 与评估弹窗里 */
.rr-desc {
  color: #475569; font-size: 12px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* 定宽列里的工单号 / 人名不能被撑破，超出即省略，全值挂在 title 上 */
.report-table td { overflow: hidden; text-overflow: ellipsis; }
/*
 * 同一格里两枚按钮之间的间距：Vue 的 `whitespace: condense` 会把两个元素之间那个带换行的
 * 空白节点整个抹掉，不显式给间距的话两枚会**贴死在一起**。
 * ⚠️ **2026-10-09 起本表的操作格只剩一枚「风险管控」**（领取 / 释放两枚已撤），
 * 这条规则此刻不起作用；留着是因为它收的是"本表的操作格"这件事，不是某一组按钮。
 * ⚠️ 只收在本表内：命中明细那张表的次按钮（`.row-btn-amend`）是既有形状，本轮不动它。
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
/* 🔴 `.rr-waited` / `.rr-waited.over` / `.rr-overdue-tag` 三条已随「等待时长」整列删除（2026-10-09） */
/*
 * 富列表那张表的外壳。它自己是 flex:1 + 内部滚动（工作台那一屏是整页高度），
 * 而本页清单下面还挂着分页条，故这里给一个不撑满的高度上限，让它在本页也只占内容高度。
 */
.tk-list-wrap { display: flex; flex-direction: column; min-height: 0; }
.tk-list-wrap :deep(.rich-list) { flex: none; }
.tk-list-wrap :deep(.table-grid) { padding: 0; }
/* 与召回清单同尺度，避免本页两套列表「一大一小」 */
.tk-list-wrap :deep(.title-text) {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}
.tk-list-wrap :deep(.tag) {
  font-size: 11px;
}
.tk-list-wrap :deep(.summary-line .hi-label) {
  font-size: 10px;
  line-height: 16px;
}
.tk-list-wrap :deep(.summary-line .hi-text),
.tk-list-wrap :deep(.plain-text),
.tk-list-wrap :deep(.sla-line),
.tk-list-wrap :deep(.handler-line),
.tk-list-wrap :deep(.product-name),
.tk-list-wrap :deep(.node-badge),
.tk-list-wrap :deep(.channel),
.tk-list-wrap :deep(.ticket-no) {
  font-size: 12px;
  line-height: 1.4;
}
/* 操作列「风险管控」与召回清单 `.row-btn.row-btn-tag` 同形 */
.tk-list-wrap :deep(.cell-action .act) {
  display: inline-block;
  padding: 2px 8px;
  border: 1px solid #1a6fff;
  border-radius: 3px;
  background: #fff;
  color: #1a6fff !important;
  font-size: 11px;
  font-weight: 600;
  line-height: normal;
  white-space: nowrap;
}
.tk-list-wrap :deep(.cell-action .act:hover) {
  background: #f9fafb;
}
/* `.rr-dec`（「评估决策」那一格的配色）随「已结论」专表整张删除，消费端只有那一张表 */

/* ---- 「风险管控」弹窗（评估处置工作面与风险报备池两处共用这一个） ---- */
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

/* 🔴 `.rm-release` / `.rm-release-hint` 两条已随释放弹窗整块删除（2026-10-09） */

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
/* 「不升级」置灰的原因脚注：与上面决策那一排的控件左缘对齐（标签 72px + gap 10px） */
.assess-dec-foot { margin: 4px 0 0 82px; }
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
/* 中性灰的说明行（释放弹窗那一句后果）：与校验红字同一行位，但讲的是后果不是错误 */
.assess-hint { margin-top: 4px; font-size: 11px; color: #6b7280; line-height: 1.5; }
</style>
