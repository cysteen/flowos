/**
 * 小智工单 · 常量与字段组类型 —— **单一真源**（1130 小智工单 D1–D27 / W1–W8）。
 *
 * 建单弹窗、处理页产研反馈区、后台 SLA、通知规则、查询筛选等模块**只从这里取**枚举与类型，
 * 不在各自文件里另写一份。形制照 `types/flash.ts`（同为「咨询 + 标识」建模的 1130 批次）。
 *
 * 本文件只放**常量、类型与读口函数**，不依赖 Pinia / 工单库，任何模块都可以放心引用。
 * 唯一的数据依赖是后台维护的产品模块字典（`mock/xiaozhi/rdModules.ts`，一·补 B30）——
 * 那份字典会被后台改写，故按模块取接收人 / 产品线的几个函数不是纯函数，取的是字典当下的值。
 */
import type { FeishuRecord, FeishuSyncState } from '@/mock/ticketDetail';
import { XIAOZHI_RD_MODULES } from '@/mock/xiaozhi/rdModules';

/** 小智工单的工单类型：小智工单＝咨询单 + 建单时写入的「小智工单」标识（D1） */
export const XIAOZHI_TICKET_TYPE = '咨询' as const;

/** 小智工单标识的展示名（类型徽章旁的标识、查询筛选项、页头徽章） */
export const XIAOZHI_MARK_LABEL = '小智';

/** 小智工单标题：「小智 · 〈产品名称〉 · 〈问题三级〉 · 〈工单来源〉」，空段跳过（口径对齐刷机单标题） */
export function xiaozhiTicketTitle(productName: string, problemL3?: string, source?: string): string {
  return [XIAOZHI_MARK_LABEL, productName, problemL3, source].filter((s) => !!s?.trim()).join(' · ');
}

/**
 * 是否小智工单 —— **全仓唯一判据**（D1）：读工单上的 `isXiaozhi` 标识。
 * 标识在建单时由小智建单入口写入，此后不随配置变化、不可修改；
 * 不要再用工单类型、单号前缀或标题判断小智工单。
 */
export function isXiaozhiTicket(t: { isXiaozhi?: boolean } | null | undefined): boolean {
  return t?.isXiaozhi === true;
}

/** 业务大类固定「教育」（D4：业务大类属教育，入口与服务团队独立） */
export const XIAOZHI_BUSINESS_TYPE = '教育';

/** 来源渠道统一记 IM（D24：不区分小智 APP / 小智外部端 / 各色外部端） */
export const XIAOZHI_TICKET_SOURCE = 'IM' as const;

/** 分派：一个大组、进池自己领（D21），不按产品 / 优先级细分、不直派到个人 */
export const XIAOZHI_POOL_GROUP_NAME = '小智工单处理组';
export const XIAOZHI_POOL_GROUP_ID = 'xiaozhi';

/**
 * 系统处理人：**「系统」**，不是建单人。两处都落它 ——
 *
 * ① 勾了「升级 TPD」那一支的处理人（一·补 B2）：工单池里留的是记录不是待领任务，
 *    不经领取直接到「已升级产研」；
 * ② **自动结案时的处理人（一·补 B9）**：🔴 **人工跟进过的单也一样统一改系统**，
 *    不保留原处理人 —— 这比 B2 的覆盖范围更大。原口径只是「没有处理人时补一个、不让悬空」（D10），
 *    B9 把它改成无条件覆盖：结案那一下是系统做的，落在那位跟进过的坐席头上，
 *    绩效与工作量口径都会把一笔系统动作算成人做的。
 */
export const XIAOZHI_SYSTEM_HANDLER = '系统';

/**
 * 小智工单**不纳入 SLA 考核**（一·补 B1）：不起响应 / 解决时效、处理页不出 SLA 条、
 * 列表 SLA 列置空。故**不单配工作日历、不加 SLA 策略** —— 原 D22 / D23 的「单配日历 +
 * 时限放宽」随之作废。业务侧仍在确认，本标识判定保留、只是不驱动 SLA。
 */
export const XIAOZHI_SLA_EXEMPT = true;
/** 不计 SLA 的单在列表 / 页头上的 SLA 摘要（与刷机单一线不计 SLA 同一套写法） */
export const XIAOZHI_SLA_IDLE = { slaText: '—', slaSub: '未计时', slaState: 'ok', slaMinutes: 9999 } as const;

/* ------------------------------------------------------------------ */
/* 建单要素（W1：业务侧尚未正式产出，以通用咨询单字段为底叠加）              */
/* ------------------------------------------------------------------ */

/**
 * 🔴 **「问题类别」不是小智专属新字段 —— 它就是咨询单的问题分类一 / 二 / 三级**（一·补 B15）。
 *
 * 故本文件**不声明**问题类别枚举、建单表单也**不另起控件**：小智单的问题类别一律落在
 * 通用咨询表单那组级联的问题分类上（`form.problemL1 / L2 / L3`），与通用咨询单同一份字典。
 * 这是 D27「尽量复用通用咨询单」的直接延伸 —— 另起一个「问题类别」下拉等于把同一件事
 * 在两处各维护一份值域，且两份永远对不齐。
 *
 * 相对 toC 在线小结，小智真正多出来的只有「是否流转研发」一项，由「小智工单信息」卡上的
 * 「升级 TPD」勾选框表达（一·补 B27）。
 */

/**
 * 在线小结上的其余字段（话务性质 / 知识反馈 / 建单要素模版 / 三方售后工单号 / 帐号 / 密码）
 * 属**在线系统**字段，与 toC 在线共用，本轮不迁入工单系统建单表单（D27 复用通用咨询单）。
 * 值域亦未定（W1），故此处只留口径说明，不声明枚举、不渲染控件 ——
 * 值域未定的下拉渲染出来就是一排点不出东西的空控件。
 *
 * 其中「帐号」与「密码」已有规格层口径（需求分析表 X6）：
 * **帐号保留（选填）、密码不迁**（密码明文落库有合规风险）。
 * 这是字段去留的结论，不是控件形态的结论 —— **等 W1 建单要素到位后再落控件**。
 */

/* ------------------------------------------------------------------ */
/* 直通产研（TPD）· 建单要素                                             */
/* ------------------------------------------------------------------ */

/**
 * 产研优先级四档 —— 取**老系统「创建TPD工单」弹窗现状取值**（03 二·附）。
 * ⚠️ 与 TPD 建单接口文档的「4紧急 / 3高 / 2中 / 1低」值域不一致，映射关系并入 W2 对齐；
 * 本轮界面照弹窗现状四档展示，不自行映射。
 */
export const XIAOZHI_RD_PRIORITIES = ['普通', '普通加急', '紧急', '重要'] as const;
export type XiaozhiRdPriority = (typeof XIAOZHI_RD_PRIORITIES)[number];
export const XIAOZHI_RD_PRIORITY_DEFAULT: XiaozhiRdPriority = '普通';

/**
 * 「产品模块 ↔ 接收人（域账号）」配置 —— 字典本体与增删改在
 * `mock/xiaozhi/rdModules.ts`，由后台「业务管理 → 产品模块维护」维护（一·补 B30，**关闭 W2**）。
 * 本文件只留按模块取值的三个读口，各模块一律经这里取，不自己去遍历那份数组。
 */
export type { XiaozhiRdModule } from '@/mock/xiaozhi/rdModules';

/**
 * 产研平台当前可用与否。`false` 时：
 * - 建单勾了「升级 TPD」→ **工单照建**、留在工单池，提示 `rdPlatformDownOnCreate`（PRD §2）；
 * - 底栏「升级 · 产研」→ 本单状态不变，提示 `rdPlatformDownOnEscalate`（PRD §5.4）。
 *
 * 真实实现里这是调 TPD 接口的返回，不是配置项；这里留一个常量把**两条分支都接上**，
 * 否则那两句拦截文案在全仓是零命中的死文案。
 */
export const XIAOZHI_RD_PLATFORM_AVAILABLE = true;

/** 该产品模块配了产研接收人没有（接收人由产品模块带出、不可改，W2） */
export function xiaozhiHasReceiver(moduleName: string): boolean {
  return !!xiaozhiReceiverOf(moduleName).trim();
}

/** 按产品模块取接收人域账号（取不到返回空串） */
export function xiaozhiReceiverOf(moduleName: string): string {
  return XIAOZHI_RD_MODULES.find((m) => m.name === moduleName)?.receiver ?? '';
}

/** 按产品模块取产品线（取不到返回空串） */
export function xiaozhiProductLineOf(moduleName: string): string {
  return XIAOZHI_RD_MODULES.find((m) => m.name === moduleName)?.productLine ?? '';
}

/**
 * 推给产研的单标题（W3 暂沿用老规则，形如「Z咨询-J精准教学产品线-S扫描」）。
 * ⚠️ 只用于推产研那一笔，**不是本单在工单系统里的标题** —— 本单标题照通用咨询单生成（D27）。
 */
export function xiaozhiRdTitle(moduleName: string): string {
  const line = xiaozhiProductLineOf(moduleName);
  return `Z${XIAOZHI_TICKET_TYPE}${line ? `-J${line}` : ''}${moduleName ? `-S${moduleName}` : ''}`;
}

/** 产研流转信息（建单时采集，推产研那一笔按它组装） */
export interface XiaozhiRdInfo {
  /** 产品模块 */
  module: string;
  /** 接收人（域账号）：由产品模块带出，只读 */
  receiver: string;
  /** 产研优先级 */
  priority: XiaozhiRdPriority;
  /** 一线人员域账号：**客户（校代 / 渠道商）的**讯飞域账号，选填（一·补 B29） */
  frontlineAccount: string;
  /** 附件（文件名，选填） */
  attachments: string[];
}

export function defaultXiaozhiRdInfo(): XiaozhiRdInfo {
  return {
    module: '',
    receiver: '',
    priority: XIAOZHI_RD_PRIORITY_DEFAULT,
    frontlineAccount: '',
    attachments: [],
  };
}

/* ------------------------------------------------------------------ */
/* 产研回传 + 提报人确认（一·补 B5 / B7 / B8 / B9 / B31 / B33）              */
/* ------------------------------------------------------------------ */

/**
 * 回传类型。三类里**驱动本单状态的有两笔**：
 * - 「处理中」等中间态：只留痕，不驱动本单（D7 原口径，未变）；
 * - 「退回」：🔴 本单转「**已退回**」、处理人改回**创建人 / 最后编辑人**（一·补 B31 / B33，
 *   **关闭 T1**）。产研的退回**主要用于信息补充场景，不是拒绝处理**，故退回来的单要有人接着补，
 *   补完复用底栏既有的「升级 · 产研」重新提交；与 B5②「提报人确认未解决由系统自动回传」
 *   是**两条独立链路**，不可合并；
 * - 「办结」：落办结结果 + 转入**待提报人确认**，本单仍留在「已升级产研」，**不自动关单**（B5）。
 */
export type XiaozhiRdFeedbackKind = '处理中' | '退回' | '办结';

/**
 * 🔴 **产研办结不再自动关单，改由提报人确认是否解决**（一·补 B5，**推翻 D9 / D11**；称谓照 B19）。
 *
 * 链路：产研办结回传 → 本单落办结结果、置「待提报人确认」、**状态不动**（仍「已升级产研」）→
 * 工单系统发一条**完成通知**（一·补 B28 / B34：有客户域账号走 IM，否则走短信，**不是调研**）→
 * 提报人在小智工单应用里确认（B6：建单入口迁 400，确认流程保留）→
 * - 确认「**是**」→ 落终态「**已关闭**」（一·补 B32：走关闭、不下送、不调研）；
 * - 确认「**否**」→ 状态仍不动，**系统自动**回传产研「未解决」，产研重新处理后再办结、再等确认。
 *
 * ⚠️ 「否」那一支是**系统动作不是坐席动作** —— 页面上**没有「二次提交产研」按钮**。
 * 确认循环**不封顶**，但每轮记次数（B8，见 `TicketXiaozhi.rdReturnCount`）。
 */
export const XIAOZHI_CONFIRM_STATES = ['未确认', '已确认解决', '已确认未解决'] as const;
export type XiaozhiConfirmState = (typeof XIAOZHI_CONFIRM_STATES)[number];

/**
 * 确认方的称谓 —— **一律「提报人」**（一·补 B19）。
 *
 * 🔴 **不写「校代」**：提报对象里除了校代**还有渠道商**（逐字稿 02:05「服务的是我们内部的
 * 一些校代，还有叫渠道商」），写「校代」在渠道商场景下就是错的；「提报人」两者皆覆盖。
 * 「提问人」那种叫法同样弃用 —— 三份文档原有三种叫法，收口到这一个常量，界面文案一律引它。
 */
export const XIAOZHI_CONFIRM_ACTOR = '提报人';

/** 校代 / 渠道商做确认的地方（B6：建单入口迁 400，查询 + 确认流程保留在小智工单应用） */
export const XIAOZHI_CONFIRM_APP = '小智工单应用';

/**
 * 超 N 天未确认即视为已解决，自动落终态「已关闭」（一·补 B7 + B32）。
 *
 * **N ＝ 3 天是用户拍板值**（一·补 B39，**关闭 B7** 的待定项）：提报人确认是一次
 * 「看一眼结果点个是」的轻动作，拖过一个完整工作周期（含一个周末）仍不点，再等下去也等不到。
 * 落地时这个数走后台配置项、本常量是它的默认值，不写死在代码里。
 */
export const XIAOZHI_CONFIRM_TIMEOUT_DAYS = 3;

/**
 * 办结回传的两套字段（W8 暂行口径：问题类与需求类分两组展示、有值才显示）。
 * 问题类 ＝ 解决结果 + 解决时间；需求类 ＝ 评估结果 / 分析方案 / 解决方案 / 开发计划 / 验收 / 完成 / 拒绝原因。
 */
export type XiaozhiSolutionType = '问题' | '需求';

/** 办结回传 · 问题类字段 */
export interface XiaozhiIssueResult {
  /** 解决结果 */
  solution: string;
  /** 解决时间 */
  solvedAt: string;
}

/** 办结回传 · 需求类字段 */
export interface XiaozhiDemandResult {
  /** 评估结果 */
  evaluation?: string;
  /** 分析方案 */
  analysis?: string;
  /** 解决方案 */
  solution?: string;
  /** 开发计划 */
  devPlan?: string;
  /** 验收 */
  acceptance?: string;
  /** 完成 */
  finished?: string;
  /** 拒绝原因 */
  rejectReason?: string;
}

/** 需求类字段展示名与次序（有值才显示，W8） */
export const XIAOZHI_DEMAND_FIELD_LABELS: { key: keyof XiaozhiDemandResult; label: string }[] = [
  { key: 'evaluation', label: '评估结果' },
  { key: 'analysis', label: '分析方案' },
  { key: 'solution', label: '解决方案' },
  { key: 'devPlan', label: '开发计划' },
  { key: 'acceptance', label: '验收' },
  { key: 'finished', label: '完成' },
  { key: 'rejectReason', label: '拒绝原因' },
];

/** 问题类字段展示名 */
export const XIAOZHI_ISSUE_FIELD_LABELS: { key: keyof XiaozhiIssueResult; label: string }[] = [
  { key: 'solution', label: '解决结果' },
  { key: 'solvedAt', label: '解决时间' },
];

/** 两套字段的分组标题（W8） */
export const XIAOZHI_RESULT_GROUP_TITLE: Record<XiaozhiSolutionType, string> = {
  问题: '问题处理结果',
  需求: '需求处理结果',
};

/* ------------------------------------------------------------------ */
/* 字段展示名                                                           */
/* ------------------------------------------------------------------ */

/**
 * 小智单字段展示名（统一口径：建单表单、处理页、履历字段 diff 都用这一份）。
 * ⚠️ 这里**没有「问题类别」** —— 它就是通用咨询单的问题分类一 / 二 / 三级（一·补 B15），
 * 展示名取通用咨询表单那一份，不在本表另起。
 */
export const XIAOZHI_FIELD_LABELS = {
  /**
   * 建单出口合为一枚「创建」+ 本勾选框（一·补 B27，**推翻 B11** 的两枚按钮）：
   * 勾上即走直通产研那条路，产研五项随勾选**动态展示**。
   */
  escalateTpd: '升级 TPD',
  rdModule: '产品模块',
  rdReceiver: '接收人（域账号）',
  rdPriority: '产研优先级',
  frontlineAccount: '一线人员域账号',
  attachments: '附件',
} as const;

/* ------------------------------------------------------------------ */
/* 产品文案（Toast / 拦截 / 履历 / 通知）                                  */
/* ------------------------------------------------------------------ */

/**
 * 「取消工单」可用的子状态（一·补 B13：**照基线 ※5 不放宽**，不为小智开专属例外）。
 * 其余状态一律置灰，悬停出 `XIAOZHI_TIP.cancelAfterStarted`。
 */
export const XIAOZHI_CANCELLABLE_STATUSES: readonly string[] = ['未认领', '待响应'];

/**
 * 建单必填提示（输入类「请填写」、选择类「请选择」，与通用咨询单同一口径）
 * 与各处拦截 / 置灰悬停文案。问题类别那条已随 B15 去掉 ——
 * 问题分类走通用咨询表单的级联控件，它恒有值、无须另给必填提示。
 * 一线人员域账号那条已随 B29 去掉 —— 该字段取客户的域账号、客户没登记就留空，故不必填。
 */
export const XIAOZHI_TIP = {
  rdModuleRequired: `请选择${XIAOZHI_FIELD_LABELS.rdModule}`,
  /**
   * 产品模块选了、但该模块没配产研接收人（W2 的字典缺项）。
   * 接收人是**由产品模块带出、不可改**的，缺了这一项推出去产研也不知道派给谁，故在建单侧就拦。
   */
  rdReceiverMissing: '该产品模块未配置产研接收人，请联系管理员配置后再流转',
  /**
   * 建单时产研平台不可用：**工单照建**（客户的问题已经登记下来了，不能因为下游挂了就不收单），
   * 只是流转那一步没成，单子留在工单池里等人重新提交。
   */
  rdPlatformDownOnCreate: '产研平台暂不可用，工单已创建并留在工单池，请稍后在工单内重新提交产研',
  /** 人工点「升级 · 产研」时产研平台不可用（PRD §5.4）：本单状态不变，重试即可 */
  rdPlatformDownOnEscalate: '产研平台暂不可用，请稍后重试',
  /** 「取消工单」在已开始处理的状态上置灰（一·补 B13 / PRD §5.3 表二） */
  cancelAfterStarted: '工单已开始处理，不可取消',
  /**
   * 🔴 **B5 的闸门**（PRD §5.3）：本单已推给产研、还没等到提报人确认是否解决，
   * 这期间**不许把单关掉、也不许把单交出去** —— 关了就绕过了「确认完才关单」（一·补 B5），
   * 交出去则确认链路上那个"本单绑定的人"会对不上。
   * 用在「已升级产研」态的 `XIAOZHI_RD_PENDING_BLOCKED` 四枚动作的置灰悬停上。
   */
  rdPendingConfirm: '已升级产研反馈，待提报人确认是否解决后关单',
  /** 「保存」等写动作在未认领时置灰（PRD §5.3 表一） */
  unclaimed: '本单尚未认领，领取后可操作',
} as const;

export const XIAOZHI_TOAST = {
  created: (no: string) => `已创建小智工单 ${no}`,
  createdAndEscalated: (no: string) => `已创建小智工单 ${no}，已流转产研`,
  /** 小智单关单走「关闭工单」、不走审批，点完直落终态（一·补 B32） */
  closed: (no: string) => `已关闭 ${no}`,
} as const;

/**
 * 小智工单的**终态**（一·补 B32）：走「关闭工单」落「已关闭」，**不走「下送结案」**。
 *
 * 🔴 **「已结案」与「直接结案」两头都不贴**（基线 §1）：
 * 「已结案 ＝ 结案方式为正常流程的单**走完调研**后到这里」，而小智单全程无调研（一·补 B28）；
 * 「直接结案 ＝ **从未进流程**」，而小智单要么坐席办过、要么推过产研。
 * 「已关闭」是既有可落库子状态（基线 §1「友好沟通后关闭」），**不新造**。
 */
export const XIAOZHI_CLOSED_STATUS = '已关闭' as const;

/**
 * 小智单在「已升级产研」态上**置灰**的四枚底栏动作（PRD §5.3 表二，B5 的闸门）。
 *
 * 🔴 **这是类型维的例外**：基线 §2「已升级产研」行给通用单的是「关闭工单 / 调剂·同组 /
 * 委派 / 转单 ＝ 可用」—— 通用单在该态关单是二线自己拿的主意，合法；但小智单的关单闸门
 * 在**提报人**手上（一·补 B5：产研办结 → 提报人确认 → 才关），这四枚一旦放开，
 * 产研还在办、提报人一次没确认，单子就被关掉 / 被交出去了，B5 在界面上等于不存在。
 *
 * ⚠️ **置灰不是不展示**：它是**时序问题** —— 等提报人确认完、本单离开「已升级产研」，
 * 这四枚就该恢复可用（判据照基线 §4：会变回可用的落置灰，永远不会可用的才不渲染）。
 * ⚠️ **只对小智单**：判定必须带 `isXiaozhiTicket(ticket)`，不要动通用单在该态的取值。
 */
export const XIAOZHI_RD_PENDING_BLOCKED: readonly string[] = ['关闭工单', '调剂', '委派', '转单'];

/**
 * 产研退回后本单落的子状态（一·补 B31 / B33）。
 *
 * 产研因**信息不全**把单退回工单系统（不是拒绝处理），本单从「已升级产研」回到
 * 「已退回」、处理人改回本单创建人（建单后被编辑过的取最后编辑人），
 * 由他补充信息后**复用底栏既有的「升级 · 产研」重新提交** —— 不另造「重新提交产研」按钮。
 *
 * ⚠️ 与「提报人确认未解决」（B5②，系统自动回传、状态不动）是**两条独立链路**，不要合并。
 */
export const XIAOZHI_RD_RETURNED_STATUS = '已退回' as const;

/** 处理履历正文 */
export const XIAOZHI_TL = {
  /** `source` ＝ 工单来源（统一 IM，D24） */
  create: (source: string) => `创建小智工单 · ${source}`,
  /** 落池留记录后由系统自动流转推产研（D6）—— **只给 `auto` 那一支用** */
  autoEscalate: (channel: string, rdTitle: string) => `系统自动流转至${channel}；产研单标题：${rdTitle}`,
  /**
   * 人工跟进后点底栏「升级 · 产研」（PRD §11.2）。
   * ⚠️ 与 `autoEscalate` **分开两句**：操作人是坐席，正文不能写「系统自动流转」。
   */
  manualEscalate: (channel: string, rdTitle: string) => `升级 · 产研（${channel}）；产研单标题：${rdTitle}`,
  /** 中间态只写履历、不驱动本单状态（D7） */
  rdProgress: (who: string, note: string) => `产研处理中 · ${who}${note ? `；处理意见：${note}` : ''}`,
  /**
   * 产研**退回**回传（一·补 B31 / B33）：产研因信息不全把单退回来，不是拒绝处理。
   * 本单落「已退回」、处理人改回创建人 / 最后编辑人，补充信息后复用「升级 · 产研」重新提交。
   */
  rdReturned: (who: string, reason: string) =>
    `收到产研退回回传${reason ? `；退回原因：${reason}` : ''}。本单转「已退回」，处理人为 ${who}，`
    + '请补充信息后重新提交产研',
  /** 办结回传 → **不关单**，转入待提报人确认（一·补 B5） */
  rdSettled: (solutionType: XiaozhiSolutionType) =>
    `产研办结回传（${solutionType}类），待${XIAOZHI_CONFIRM_ACTOR}确认是否解决`,
  /**
   * 完成通知（一·补 B28 / B34）：产研办结后**由工单系统发**，**不是调研短信** ——
   * 小智工单全程无调研环节，这一条只告知「已完成，请确认」。
   * 通道二选一：本单登记了客户域账号 → IM 消息；否则 → 客户手机号短信。
   */
  completionNotice: (channel: string, to: string) =>
    `已向${XIAOZHI_CONFIRM_ACTOR}发送完成通知（${channel}：${to}），请其在${XIAOZHI_CONFIRM_APP}确认是否解决`,
  /** 域账号与手机号都没有：**不发**，只落一条履历留痕（B28） */
  completionNoticeSkipped: () =>
    `本单未登记客户域账号与联系手机号，完成通知未发出，待${XIAOZHI_CONFIRM_ACTOR}自行在${XIAOZHI_CONFIRM_APP}查询确认`,
  /** 坐席自办答完点「关闭工单」→ 直落「已关闭」，不走审批（一·补 B32） */
  closeByAgent: (reason: string, note: string) =>
    `关闭工单。关闭原因：${reason}${note ? `；${note}` : ''}（小智工单不走关闭审批）`,
  /** 提报人确认「是」→ 关闭工单（B5① + B32：走关闭、不下送、不调研） */
  confirmResolved: (who: string) => `${who}确认问题已解决，工单关闭`,
  /**
   * 提报人确认「否」→ 状态不动，系统自动回传产研（B5② + B8 记次数）。
   * 次数的词序照 PRD L420「**已回传产研 〈N〉 次**」，不写「第 N 次回传产研」。
   */
  confirmUnresolved: (who: string, times: number, channel: string) =>
    `${who}确认问题未解决，系统已自动回传${channel}「未解决」（已回传产研 ${times} 次），本单仍为「已升级产研」`,
  /**
   * 超 N 天未确认 → 视为已解决，自动关闭工单（B7 + B32）。
   * 这是**履历**，记的是已经发生的事，故据实写出当时生效的天数；
   * ⚠️ 界面上的**预告性**提示不能带天数（N 待业务定），见 `XIAOZHI_TIP` 外的 Tab 文案。
   */
  confirmTimeoutClosed: (days: number) =>
    `超 ${days} 天未收到${XIAOZHI_CONFIRM_ACTOR}确认，视为已解决，自动关闭工单`,
} as const;

/** 站内通知 / 对客通知文案 */
export const XIAOZHI_NOTICE = {
  /** 新单进工单池待领取（D21：一个大组、进池自己领） */
  pooled: (no: string) => `${no}已进入${XIAOZHI_POOL_GROUP_NAME}工单池，待领取`,
  /** 办结回传后不关单，等提报人确认（B5） */
  rdSettled: (no: string) => `${no}产研已办结，待${XIAOZHI_CONFIRM_ACTOR}确认是否解决`,
  /**
   * 🔴 **对客的完成通知**（一·补 B28 / B34）—— 不是调研、不含满意度评价。
   * 由**工单系统**发，通道二选一（有客户域账号走 IM，否则走短信）。
   */
  completed: (no: string) =>
    `${no}您反馈的问题已完成处理，请在${XIAOZHI_CONFIRM_APP}确认是否解决`,
  /** 提报人确认未解决 → 系统已自动回传产研（B5② / B8），词序照 PRD L420 */
  returnedToRd: (no: string, times: number) =>
    `${no}${XIAOZHI_CONFIRM_ACTOR}确认未解决，系统已自动回传产研（已回传产研 ${times} 次）`,
  /** 产研因信息不全退回 → 回到创建人 / 最后编辑人手上（B31 / B33） */
  returnedByRd: (no: string, who: string) =>
    `${no}产研因信息不全退回，已转「已退回」并交回 ${who}，请补充信息后重新提交产研`,
  /** 确认解决 / 超时视为解决 / 坐席自办关闭 → 已关闭（B5① / B7 / B32） */
  closed: (no: string) => `${no}已关闭`,
} as const;

/**
 * 🔴 **小智工单全程无调研环节**（一·补 B28，**D12 / D14 / B18 整条作废**）：
 * 不发调研短信、不进「调研中」、没有满意度评价，处理页「调研记录」Tab 在小智单上不渲染。
 *
 * 取而代之的是产研办结后的一条**完成通知**，由**工单系统**发（B34，产研侧那条
 * 「解决结果通知」已提对外要求关闭），通道由 `xiaozhiNoticeChannel()` 二选一。
 */
export const XIAOZHI_SURVEY_EXEMPT = true;

/** 完成通知的两条通道（B28）：有客户域账号走 IM 消息，否则走客户手机号短信 */
export const XIAOZHI_NOTICE_CHANNEL = { im: 'IM 消息', sms: '短信' } as const;

/**
 * 完成通知走哪条通道（一·补 B28，**二选一**）：
 * 本单登记了客户域账号 → IM 消息；否则有客户手机号 → 短信；**两者都无 → 不发**，只留一条履历。
 */
export function xiaozhiNoticeChannel(
  frontlineAccount?: string,
  customerPhone?: string,
): { channel: string; to: string } | null {
  const account = frontlineAccount?.trim() ?? '';
  if (account) return { channel: XIAOZHI_NOTICE_CHANNEL.im, to: account };
  const phone = customerPhone?.trim() ?? '';
  if (phone) return { channel: XIAOZHI_NOTICE_CHANNEL.sms, to: phone };
  return null;
}

/* ------------------------------------------------------------------ */
/* 字段组                                                               */
/* ------------------------------------------------------------------ */

/**
 * 工单上挂的小智字段组（仅小智单有值，见 `isXiaozhi`）。
 *
 * ⚠️ **没有 `problemCategory`** —— 问题类别就是工单行上的 `problemL1 / L2 / L3`（一·补 B15）。
 */
export interface TicketXiaozhi {
  /**
   * 一线人员域账号 —— 🔴 **取的是客户（校代 / 渠道商）的讯飞公司域账号**（一·补 B29），
   * 不是建单坐席的；**选填**（B29 推翻 B24 的必填），**与走不走产研无关**。
   *
   * 它是**提报人登录小智工单应用做「是否解决」确认的凭据**（B6），按本单客户自动预填；
   * 客户没登记域账号时留空 —— **不回落到建单人**，那等于把确认权交给了客服自己。
   * 故存在**工单层**，不是只存在 `rd` 里 —— 未勾「升级 TPD」落池自领那条路的单没有 `rd`，
   * 凭据却一样要留下来。
   * `rd.frontlineAccount` 是推给产研那一笔的**载荷副本**（W2 建单要素之一），两者同源于建单表单。
   */
  frontlineAccount?: string;
  /**
   * 本单创建人（建单那一下的操作人）。产研退回时处理人要交回给他（一·补 B31 / B33）。
   *
   * 落在字段组上而不是每次去翻履历：退回是**接口层**驱动的（产研侧回传），
   * 那条路上没有登录人、也不该依赖「履历里第一条 create 的 who」这种按次序找人的写法 ——
   * 履历一旦补录或重排，找到的就是另一个人。
   */
  createdBy?: string;
  /**
   * 建单后最后一次编辑本单的人（保存工单处理表单即算一次编辑）。
   * 产研退回时**优先交回给他**，没有则交回 `createdBy`（一·补 B31：创建人 / 编辑人）。
   */
  lastEditor?: string;
  /** 产研流转信息（走过产研的单才有值） */
  rd?: XiaozhiRdInfo;
  /**
   * 产研关联进度。复用「产研反馈」Tab 的那一套取值（`FeishuSyncState`）。
   * ⚠️ `closed` 说的是**产研那张反馈单**已办结，**不等于本单已结案** —— 本单要等校代确认（B5）。
   */
  rdSync?: FeishuSyncState;
  /** 「产研反馈」Tab 时间线（推单 / 中间态 / 办结 / 系统回传） */
  rdRecords?: FeishuRecord[];
  /** 产研单号（推成后回传） */
  rdFeedbackNo?: string;
  /** 办结回传的分叉：问题类 / 需求类（W8） */
  rdSolutionType?: XiaozhiSolutionType;
  /** 办结回传 · 问题类字段（W8：有值才显示） */
  rdIssueResult?: XiaozhiIssueResult;
  /** 办结回传 · 需求类字段（W8：有值才显示） */
  rdDemandResult?: XiaozhiDemandResult;
  /** 产研办结回传的时刻（`YYYY-MM-DD HH:mm:ss`）。超时视为已解决按它 + `XIAOZHI_CONFIRM_TIMEOUT_DAYS` 判（B7） */
  settledAt?: string;
  /** 提报人确认状态（B5；称谓照 B19）。办结回传后才有值；无值 ＝ 还没走到办结 */
  confirmState?: XiaozhiConfirmState;
  /** 提报人确认时刻 */
  confirmAt?: string;
  /** 确认人（提报人姓名；超时视为已解决时落「系统」） */
  confirmBy?: string;
  /**
   * 已回传产研「未解决」的次数（一·补 B8：确认循环不封顶，但记次数）。
   * 0 / 无值 ＝ 还没回传过。回传是**系统动作**，不是坐席点出来的（B5）。
   */
  rdReturnCount?: number;
}
