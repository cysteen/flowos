// 工单可操作项注册表（单一数据源）。按**工单类型**过滤出**底部操作条**要展示的操作。
// 类型矩阵取自基线「动作 × 角色 × 工单类型」表的「工单类型」列：
//   转单 / 调剂 / 委派 / 下送 / 撤回 / 强结 / 关闭工单 = 全部四类；
//   挂起 / 退回 / 升级 = 投 咨 建（商机不可）；转售后 = 咨 建 商（投诉走头部「关联售后」）。
// 底栏扁平展示顺序见 OpActionBar 的 BAR_ORDER；此处仅登记能力与类型矩阵。
//
// ⚠️ **只登记底栏的动作**。基线§2「本表与操作页按钮的对照」把动作分了三处，
// 其中「**同步飞书**」与领取 / 指派 / 工单管控 / 联系客户同列在「**不在操作页**的动作」里，
// 所以它**不该出现在本表**，也就不该出现在底栏（详见下方 note）。
import { isDirectClosure } from '@/views/tickets/types/ticket';
import type { ClosureMode, TicketType } from '@/views/tickets/types/ticket';
import type { OpActionType } from './opActions';
import { useUserStore } from '@/stores/user';

export interface ActionDef {
  key: OpActionType;
  label: string;
  /** ant 图标组件名，OpActionBar 内查表解析 */
  icon: string;
  /** primary=主操作区；more=更多·子流程；manage=更多·管理类（不属于9操作） */
  group: 'primary' | 'more' | 'manage';
  /** 适用工单类型 */
  types: TicketType[];
  /**
   * 转售后：须该产品有售后服务。
   * ⚠️ 基线 ※12 明确这条拦截是**置灰 + 提示**，不是隐藏——它的拦截维度是**工单数据**，
   * 不属于角色 / 状态 / 类型三维，坐席看不见按钮就不知道为什么不能转。
   * 因此本标记**不参与 availableActions 的过滤**，只是把"要不要判这条"登记出来，
   * 置灰与提示由 OpActionBar 呈现。
   */
  needsAftersale?: boolean;
  danger?: boolean;
}

const ALL: TicketType[] = ['投诉', '咨询', '建议', '商机'];
const NO_LEAD: TicketType[] = ['投诉', '咨询', '建议']; // 商机不支持
/** 风险报备 / 风险评估两形态：咨 建 商（基线 §4「风险报备」行，与 risk Tab 类型集同源） */
const RISK_REPORT_TYPES: TicketType[] = ['咨询', '建议', '商机'];
/** 协同处理形态：**仅投诉单**（基线 §4「协同处理」行）。与上一行在类型维正好互补 */
const RISK_COLLAB_TYPES: TicketType[] = ['投诉'];
/**
 * 转售后的类型集 = 咨 建 商（基线 §4 该行 + ※12a）。
 * ※12a 的口径是「投诉单走关联售后、**其余全部**走转售后」，两边合起来覆盖四类、不重不漏——
 * 所以这里必须是三类，不是只有咨询。基线 §5.5 原写的「商机/建议不可转售后」已在 v1.6 作废。
 */
const AFTERSALE_TRANSFER: TicketType[] = ['咨询', '建议', '商机'];

export const ACTION_DEFS: ActionDef[] = [
  // —— 主操作区（高频流转）——
  { key: '调剂', label: '调剂', icon: 'ArrowRightOutlined', group: 'primary', types: ALL },
  { key: '委派', label: '委派', icon: 'TeamOutlined', group: 'primary', types: ALL },
  { key: '下送', label: '下送', icon: 'VerticalAlignBottomOutlined', group: 'primary', types: ALL },
  { key: '挂起', label: '挂起', icon: 'PauseCircleOutlined', group: 'primary', types: NO_LEAD },
  { key: '退回', label: '退回', icon: 'RollbackOutlined', group: 'primary', types: NO_LEAD },
  // 底栏「升级」＝ 升三线技术支持 / 产研（※14 / ※14a），**与投诉无关**，
  // 故基线 ※8a 收回二线第一跳升级投诉那一条不落在这里，落在头部「升级投诉」上（见文件末尾）
  { key: '升级', label: '升级', icon: 'RiseOutlined', group: 'primary', types: NO_LEAD },
  // 风险那一枚按钮。**登记的是"这一格"而不是"风险报备"这一个动作**：它按角色与类型
  // 呈现 风险报备 / 风险评估 / 协同处理 三种形态（基线 ※29），文案与类型集由
  // availableActions 走 resolveRiskActionForm 现算，这里的取值只是报备形态的缺省。
  { key: '风险报备', label: '风险报备', icon: 'WarningOutlined', group: 'more', types: RISK_REPORT_TYPES },
  // 转单：原单关闭、新单继续跑（基线 ※16）。全类型可用。
  // 它开的是**建单弹窗**（新单要有单号才谈得上"转"），不是 OpActionDialogs 里的表单弹窗，
  // 所以 OpActionBar 里单独走 emit('transferTicket')，见该文件 run()。
  { key: '转单', label: '转单', icon: 'SwapOutlined', group: 'primary', types: ALL },
  // —— 更多 · 子流程（低频/协同/异常）——
  { key: '撤回', label: '撤回', icon: 'UndoOutlined', group: 'more', types: ALL },
  { key: '强结', label: '强结', icon: 'StopOutlined', group: 'more', types: ALL, danger: true },
  /*
   * 「同步飞书」**有意不在本表**（2026-08-19 按基线核对）：
   * 基线 §2 表末「本表与操作页按钮的对照」把它列在「**不在操作页**的动作」一行
   * （与领取 / 指派 / 退回 / 工单管控 / 联系客户同列），底部操作条那一行只有
   * 保存 · 下送 · 升级 · 转售后 · 撤回 · 调剂 · 委派 · 转单 · 申请挂起 · 关闭工单 · 强结。
   * 之前它登记在这里、group='more'，但 BAR_ORDER 里没有它 —— 表里登记了、界面上永远出不来，
   * 看起来像"漏了入口"。核对结论是**不该补入口**，故从本表移除，只保留这段说明。
   * 动作本身（类1、单向推送、本单状态不变，※11）的实现仍在 opActions.ts / OpActionDialogs.vue，
   * 将来若在飞书协同 Tab 上开入口可直接复用，不必重写。
   */
  // 转售后 = 咨 建 商（基线 §4 该行）：投诉单改走工单头「关联售后」入口（类1，本单状态不变）
  { key: '转售后', label: '转售后', icon: 'ToolOutlined', group: 'more', types: AFTERSALE_TRANSFER, needsAftersale: true },
  // —— 更多 · 管理类（不属于 9 子流程）——
  { key: '关闭工单', label: '关闭工单', icon: 'CheckCircleOutlined', group: 'manage', types: ALL },
  /*
   * 「归档工单」**已移除**（按基线核对）：基线「动作 × 状态」「动作 × 角色」两张表都没有这个
   * 动作，§2 表末「本表与操作页按钮的对照」的底栏与头部两行也都没有它 —— 关闭类动作只有
   * 「关闭」与「强结」，且两个都走审批。它原来一键直落终态「已关闭」，等于绕开审批；
   * 而且从未进过 BAR_ORDER，界面上根本点不到，属旧实现残留，故整条删除（含弹窗与落库分支）。
   * 「归档」是**与状态正交的留存维度**（工单 archived 标记 + 工单列表「已归档」视图），不在本表。
   */
  { key: '取消工单', label: '取消工单', icon: 'CloseOutlined', group: 'manage', types: ALL, danger: true },
];

/**
 * 「直接结案」单**不给**的底栏动作（基线 §1「结案方式」小节「动作集」一条：
 * 不下送、不升级、不挂起、不转派）。
 *
 * - **不下送 / 不升级 / 不挂起**：字面照抄基线；
 * - **不转派**：调剂（换处理人）、委派（等协办回填）、转单（原单关闭新单跑）、
 *   转售后（原单冻结等回传）四枚都是"把单交出去"，一并归入；
 * - **退回**：只有三线技术支持 → 处理人这一个方向，而直接结案的单从不升级、
 *   永远到不了三线手上，入口本就不属于它（基线「置灰与不展示」判据表的"归属"一档）。
 *
 * 留下的是 撤回 / 关闭工单 / 强结 / 取消工单 —— 都是本人在本单上收口，不涉及流转。
 */
const DIRECT_CLOSURE_BLOCKED: OpActionType[] = [
  '下送', '升级', '挂起', '调剂', '委派', '转单', '转售后', '退回',
];

/* ---------------- 底栏那一枚风险按钮的三种形态（基线 ※29） ---------------- */

/**
 * 底部操作条上**只有一枚**风险按钮，文案 / 弹窗 / 类型集随「当前登录角色 × 本单工单类型」取：
 *
 * | 角色 | 文案 | 点开 | 类型 |
 * |---|---|---|---|
 * | 二线专员 / 二线班组长 / 管理员 | **风险报备** | 报备弹窗 | 咨 建 商 |
 * | 客诉专员（非投诉单） | **风险评估** | 评估弹窗（升级 / 不升级） | 咨 建 商 |
 * | 客诉专员（投诉单） | **协同处理** | 协同弹窗 | 投 |
 *
 * 🔴 **三种形态是同一枚动作的形态，不是三个权限点**（基线 ※29）：实现是
 * "**一枚按钮 + 一次形态判定**"，判定命中协同处理时再过 §2 / §4 的「协同处理」门控。
 * 「协同处理」虽已收进动作矩阵（动作数 27 → 28），**也不在按钮位上再开一枚** ——
 * 故 `ACTION_DEFS` 里仍只有 `风险报备` 这一条登记，`BAR_ORDER` 里也只占一格。
 *
 * **出现条件不在这里判**：报备要求"本单无在队报备"、评估要求"本单有未出结论的非投诉单条目"、
 * 协同要求"本单在风险工单池里"，三条都要读风险两条线的 store，而本模块是**按类型与结案方式
 * 过滤动作**的纯登记表。条件由工单页算好，经 `showRiskReport` / `riskReportPending`
 * 两个 prop 交给底栏（见 TicketOperationView）。本函数只答"这个角色在这类单上该看到哪一种"。
 *
 * **三种形态都不给的五个角色**：技术支持（主责仍是二线，由二线报）、一线坐席（走「新建补充」）、
 * 投诉督导（去权后只看大盘）、工单运营 / 质检（只读）。它们在这里返回 null。
 */
export type RiskActionForm = 'report' | 'assess' | 'collab';

export interface RiskActionFormDef {
  form: RiskActionForm;
  label: string;
  types: TicketType[];
}

/** 报备形态给处理侧。管理员取报备形态（基线 ※29「管理员取报备形态」） */
const RISK_REPORT_ROLES = ['agent-l2', 'team-leader', 'system-admin', 'ops-admin', 'tenant-admin'];

export function resolveRiskActionForm(roleKey: string, ticketType: string): RiskActionFormDef | null {
  if (RISK_REPORT_ROLES.includes(roleKey)) {
    return { form: 'report', label: '风险报备', types: RISK_REPORT_TYPES };
  }
  // 报的人与评的人必须分开：客诉专员不能报，它只评（非投诉单）或协同（投诉单）
  if (roleKey === 'complaint-handler') {
    return ticketType === '投诉'
      ? { form: 'collab', label: '协同处理', types: RISK_COLLAB_TYPES }
      : { form: 'assess', label: '风险评估', types: RISK_REPORT_TYPES };
  }
  return null;
}

export interface ActionCtx {
  ticketType: string;
  /** 结案方式；缺省视为「正常流程」，见 resolveClosureMode */
  closureMode?: ClosureMode;
  /**
   * 当前登录角色。**缺省时读登录态**——底栏（OpActionBar）只按工单维度调用本函数，
   * 而风险那一枚按钮的形态是「角色 × 类型」两维决定的（基线 ※29），类型在 ctx 里、
   * 角色只能从当前登录态取。留成入参是为了让判据可被单独喂值，不必先切登录。
   */
  roleKey?: string;
}

/**
 * 按**工单类型**与**结案方式**过滤可见操作 —— 两者正交，各拦各的。
 * 数据维的拦截（产品无售后服务）走置灰 + 提示，不在这里把动作过滤掉（基线 ※12）。
 *
 * 风险那一枚按钮另过一道**形态判定**：形态决定它的文案与类型集，判不出形态即整枚不给。
 */
export function availableActions(ctx: ActionCtx): ActionDef[] {
  const direct = isDirectClosure(ctx.closureMode);
  const roleKey = ctx.roleKey ?? useUserStore().roleKey;
  const riskForm = resolveRiskActionForm(roleKey, ctx.ticketType);
  return ACTION_DEFS
    .map((a) => {
      if (a.key !== '风险报备') return a;
      if (!riskForm) return null;
      return { ...a, label: riskForm.label, types: riskForm.types };
    })
    .filter((a): a is ActionDef => !!a)
    .filter(
      (a) =>
        a.types.includes(ctx.ticketType as TicketType)
        && !(direct && DIRECT_CLOSURE_BLOCKED.includes(a.key)),
    );
}

/** 基线 ※12 规定的拦截提示原文 */
export const NO_AFTERSALE_TIP = '该产品无售后服务，不可转售后';

/**
 * 基线 ※8a 的拦截提示原文（2026-09-09 业务第二轮拍板，《【930】》N3）。
 * 拦下来必须同时给出**去哪儿**——收回的是自主发起权，不是这条路本身。
 */
export const ESCALATE_VIA_RISK_REPORT_TIP = '投诉场景请先发起风险报备，由客诉专员评估';

/**
 * 第一跳升级投诉被收回自主发起权的两个角色（基线 ※8a）。
 *
 * 【为什么只卡这两个】投诉量的入口在二线"拿不准就升成投诉"这一手上；
 * 客诉专员 / 投诉督导 / 管理员本就是评估方与兜底方，卡他们等于把闸门自己也锁上。
 * 一线不在此列——一线的升级投诉走 ※8（只能升非投诉单），不经风险报备。
 */
const ESCALATE_REPORT_FIRST_ROLES = ['agent-l2', 'team-leader'];

/**
 * 「升级投诉」是否被 ※8a 收回：**非投诉单 → 投诉单**这一跳，二线专员与二线班组长不再自主发起。
 * 返回提示文案 ＝ 拦截；返回 null ＝ 放行。
 *
 * 【为什么判据是"当前不是投诉单"而不是"要升成投诉"】升阶只有两跳，
 * 非投诉单上的升级必然是第一跳，投诉单上的必然是第二跳（内投→外投），
 * 用工单类型判等价且不必等到弹窗里才知道目标阶层。**第二跳不受限**。
 *
 * 【为什么拦截而不是隐藏入口】隐藏＝坐席只看到按钮没了，不知道改走哪条路；
 * 基线 ※8a 收回的是发起权、给的是替代入口，必须把「先发起风险报备」这句话说出来。
 */
export function escalateComplaintBlockTip(roleKey: string, ticketType: string): string | null {
  if (!ESCALATE_REPORT_FIRST_ROLES.includes(roleKey)) return null;
  if (ticketType === '投诉') return null;
  return ESCALATE_VIA_RISK_REPORT_TIP;
}
