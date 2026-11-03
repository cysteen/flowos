/**
 * 智能派单（【1215】智能派单 PRD，P0）—— 类型与常量。
 *
 * 只放数据形状与口径常量；运行时状态、种子与派单引擎在 `stores/dispatch.ts`。
 * 章节号均指《【1215】智能派单 产品需求文档(PRD)》。
 */
import type { Priority, TicketStatus, TicketType } from './ticket';

/* ------------------------------------------------------------------ */
/* 基础枚举                                                             */
/* ------------------------------------------------------------------ */

/** 派单方式（第 5 章）。取较严者，严格程度：自动派单 < 混合派单 < 人工派单 */
export type PoolMode = '自动派单' | '混合派单' | '人工派单';
export const POOL_MODES: PoolMode[] = ['自动派单', '混合派单', '人工派单'];
const MODE_RANK: Record<PoolMode, number> = { 自动派单: 0, 混合派单: 1, 人工派单: 2 };
/** 取较严者（5.1） */
export function stricterMode(...modes: PoolMode[]): PoolMode {
  return modes.reduce<PoolMode>((a, b) => (MODE_RANK[b] > MODE_RANK[a] ? b : a), '自动派单');
}

/** 留池工单的派单状态（1.3 / 10.1）。混合派单、人工派单下为空 */
export type DispatchStatus = '等原处理人' | '排队中' | '派单失败回池';
export const DISPATCH_STATUSES: DispatchStatus[] = ['等原处理人', '排队中', '派单失败回池'];

/**
 * 坐席状态（11.5）：与顶栏话务条联动。签入后未点「就绪」为未就绪；点「就绪」后才接派单、可领取；
 * 「在班」＝就绪。未就绪、小休、签出都不被派单、不可领取。
 */
export type SignInStatus = '未就绪' | '就绪' | '小休' | '签出';
export const SIGN_IN_STATUSES: SignInStatus[] = ['就绪', '未就绪', '小休', '签出'];

/** 熟练度（6.4）。新增坐席默认熟练 */
export type Proficiency = '初级' | '熟练' | '专家';
export const PROFICIENCIES: Proficiency[] = ['初级', '熟练', '专家'];

/**
 * 可派单角色（1.1 / 7.1）。用 PRD 的角色名而不是 RoleKey：
 * 「小智工单处理人」「二线刷机处理人」不是系统角色，是在对应组里的二线专员岗位。
 */
export type DispatchRole =
  | '二线专员'
  | '小智工单处理人'
  | '二线刷机处理人'
  | '技术支持'
  | '班组长'
  | '客诉专员'
  | '督导'
  | '运营'
  | '管理员';
export const DISPATCH_ROLES: DispatchRole[] = [
  '二线专员', '小智工单处理人', '二线刷机处理人', '技术支持', '班组长', '客诉专员', '督导', '运营', '管理员',
];
/** 管理角色：个人开关默认关闭（8.1 / 澄清 #68） */
export const MANAGEMENT_ROLES: DispatchRole[] = ['班组长', '客诉专员', '督导', '运营', '管理员'];

/** 角色基准值默认值（7.1） */
export const DEFAULT_ROLE_BASE: Record<DispatchRole, number> = {
  二线专员: 10, 小智工单处理人: 10, 二线刷机处理人: 10,
  技术支持: 8,
  班组长: 5, 客诉专员: 5, 督导: 5, 运营: 5, 管理员: 5,
};
/** 熟练度系数默认值（7.1） */
export const DEFAULT_PROFICIENCY_COEF: Record<Proficiency, number> = { 初级: 0.6, 熟练: 1, 专家: 1.3 };

/** 客户类型（3.3 / 6.1 七项） */
export const DISPATCH_CUSTOMER_TYPES = ['个人用户', '家长', '学生', '经销商', '内部员工', '老师', '终端用户'];
/** 工单类型（PRD 含「表扬」；原型建单只有四类，表扬留作取值） */
export const DISPATCH_TICKET_TYPES: (TicketType | '表扬')[] = ['咨询', '投诉', '建议', '商机', '表扬'];
/** 工单优先级 → PRD 口径（紧急 / 高 / 中 / 低），入池规则与紧急度因子共用 */
export const PRIORITY_LEVEL: Record<Priority, '紧急' | '高' | '中' | '低'> = { P0: '紧急', P1: '高', P2: '中', P3: '低' };

/* ------------------------------------------------------------------ */
/* 维度取值                                                             */
/* ------------------------------------------------------------------ */

/**
 * 产品取值：可混选产品分类与产品名称（3.1 / 6.1）。`name` 为空＝选了整个分类（含其下全部产品）。
 */
export interface ProductPick {
  category: string;
  name?: string;
}

/**
 * 问题分类取值：节点路径，一级 / 二级 / 三级，用两侧带空格的「 / 」连接（`PROBLEM_PATH_SEP`，分类名本身可含「/」），
 * 如 `功能异常 / 播放问题`；分类只读引用问题分类管理（`stores/problemTags`）。
 * 选上级节点即含其全部下级（3.1 / 6.1）。
 */
export type ProblemPath = string;

/**
 * 人员画像单维取值（6.1）：`null`＝未设（画像未配置），`'any'`＝不限，数组＝指定值集合（至少一项）。
 */
export type DimSel<T> = null | 'any' | T[];

/** 人员画像五维（6.1） */
export interface AgentProfile {
  businessTypes: DimSel<string>;
  ticketTypes: DimSel<string>;
  products: DimSel<ProductPick>;
  problems: DimSel<ProblemPath>;
  customerTypes: DimSel<string>;
}
export type ProfileDimKey = keyof AgentProfile;
export const PROFILE_DIMS: { key: ProfileDimKey; label: string }[] = [
  { key: 'businessTypes', label: '业务类型' },
  { key: 'ticketTypes', label: '工单类型' },
  { key: 'products', label: '产品' },
  { key: 'problems', label: '问题分类' },
  { key: 'customerTypes', label: '客户类型' },
];
/** 新增坐席：五维均为空，即未配置（6.3） */
export function emptyProfile(): AgentProfile {
  return { businessTypes: null, ticketTypes: null, products: null, problems: null, customerTypes: null };
}
/** 画像已配置：五维均已设值（含「不限」，6.3） */
export function isProfileConfigured(p: AgentProfile): boolean {
  return PROFILE_DIMS.every((d) => p[d.key] !== null);
}

/** 产品逐级放宽层级（6.2）：0 精确、1 同产品分类、2 不限 */
export type RelaxLevel = 0 | 1 | 2;
export const RELAX_LEVEL_LABEL: Record<RelaxLevel, '精确' | '同产品分类' | '不限'> = { 0: '精确', 1: '同产品分类', 2: '不限' };

/* ------------------------------------------------------------------ */
/* 入池规则（第 3 章）                                                   */
/* ------------------------------------------------------------------ */

/** 入池规则七维度：每维为空数组即不限（3.1） */
export interface PoolRuleConditions {
  businessTypes: string[];
  ticketTypes: string[];
  problems: ProblemPath[];
  products: ProductPick[];
  ticketSources: string[];
  customerTypes: string[];
  priorities: Priority[];
}
export function emptyPoolRuleConditions(): PoolRuleConditions {
  return { businessTypes: [], ticketTypes: [], problems: [], products: [], ticketSources: [], customerTypes: [], priorities: [] };
}

export interface PoolRule {
  id: string;
  /** 最多 30 字；租户内不重复 */
  name: string;
  /** 正整数 1–999，数值小者优先，不可重复 */
  priority: number;
  conditions: PoolRuleConditions;
  /** 目标池（工单池 id；只可选启用中的池，3.3） */
  poolId: string;
  enabled: boolean;
  /** 迁移来源（3.4）；人工新增为空 */
  migratedFrom?: '问题分类处理组' | '规则引擎派单';
  updatedBy: string;
  updatedAt: string;
}

/** 默认池：综合处理组池（3.1 未命中落默认池，也是兜底池） */
export const DEFAULT_POOL_ID = 'general';
export const DEFAULT_POOL_LABEL = '综合处理组';

/**
 * 固定落点池及其用途：不可停用，处理组不能移出最后一名成员；这些组的固定落点始终是初始池，同组新建的池不作固定落点。
 */
export const PROTECTED_POOL_USE: Record<string, string> = {
  [DEFAULT_POOL_ID]: '未命中入池规则的工单进入此池',
  tech: '升级三线的工单进入此池',
  xiaozhi: '小智工单进入此池',
  'edu-flash': '二线刷机工单进入此池',
  edu: '个册退费工单进入此池',
};
export function isProtectedPool(id: string): boolean {
  return id in PROTECTED_POOL_USE;
}

/** 工单池扫描间隔（分钟）：固定，不可配 */
export const SCAN_INTERVAL_MINUTES = 5;
/** 未领取工单滞留超过此时长（小时）汇总提醒班组长 */
export const STALL_REMIND_HOURS = 4;

/* ------------------------------------------------------------------ */
/* 人 · 组 · 池                                                          */
/* ------------------------------------------------------------------ */

/** 派单侧的处理组（用户分组中的派单组，沿用 `POOL_GROUPS`）：候选成员、归属组与班组长取自这里 */
export interface DispatchGroup {
  id: string;
  label: string;
  /** 班组长姓名（兜底回池通知、指派权限） */
  leaders: string[];
}

/** 工单池状态（14.3）：停用后由系统收尾，可再启用 */
export type PoolStatus = '启用' | '停用';
/** 池名称最多 20 字（14.3） */
export const POOL_NAME_MAX = 20;

/**
 * 工单池（14.3）：在工单池管理里新建，建池时选处理组；一个处理组可有多个池。
 * 派单只在池所属处理组的成员中选人，工单归属组＝所在池的处理组；派单方式按池设置，与全局取较严者（5.1）。
 * 初始 7 个池的 id 与原组 id 相同（小智 / 刷机 / 退费 / 售后转回的落池点按 id 接线）。
 */
export interface DispatchPool {
  id: string;
  /** 池名称：必填、最多 20 字、全局唯一 */
  name: string;
  /** 处理组：创建后不可改 */
  groupId: string;
  /** 本池派单方式（管理员 / 班组长切换，5.4） */
  mode: PoolMode;
  status: PoolStatus;
  /** 默认池：未命中任何入池规则时落入，不可停用 */
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/** 坐席（参与派单的处理人） */
export interface DispatchAgent {
  /** 姓名（＝工单处理人名，唯一键） */
  name: string;
  /** 工号 */
  staffNo: string;
  /** 所任角色（多角色取基准值最高者，7.1） */
  roles: DispatchRole[];
  /** 所在组（一人可属多组，2.1） */
  groupIds: string[];
  signIn: SignInStatus;
  /** P0「当日在班」＝当日签入过（4.2 投诉预留） */
  signedInToday: boolean;
  /** 账号停用 */
  disabled: boolean;
  profile: AgentProfile;
  proficiency: Proficiency;
  /** 个人上限个人值（7.1）；null＝按默认值 */
  capOverride: number | null;
  /** 个人开关（8.1） */
  personalSwitch: boolean;
  /** 上一次被派单或领取的时刻（ms，空闲时长因子） */
  lastTakenAt: number | null;
  /** 近期派单与领取时刻（ms，近 N 小时接单量因子；只留 24 小时内） */
  recentTakes: number[];
  /** 本次就绪起点（ms）；非就绪为 null（在岗时长，13.2 派单均衡度） */
  signInSince?: number | null;
  /** 当日已累计在岗时长（ms，不含本次就绪中的时长） */
  onDutyMs?: number;
  /** `onDutyMs` 所属日期（YYYY-MM-DD），跨日清零 */
  onDutyDay?: string;
}

/* ------------------------------------------------------------------ */
/* 配置（14.2）                                                          */
/* ------------------------------------------------------------------ */

export type ScoreFactorKey = 'load' | 'proficiency' | 'urgency' | 'recent' | 'idle';
export interface ScoreFactor {
  key: ScoreFactorKey;
  label: string;
  enabled: boolean;
  /** 0–100 整数 */
  weight: number;
}
/** 评分因子与默认权重（4.3）：负载 30 / 熟练度 25 / 紧急度 20 / 近 N 小时接单量 15 / 空闲时长 10 */
export function defaultScoreFactors(): ScoreFactor[] {
  return [
    { key: 'load', label: '负载', enabled: true, weight: 30 },
    { key: 'proficiency', label: '熟练度', enabled: true, weight: 25 },
    { key: 'urgency', label: '紧急度', enabled: true, weight: 20 },
    { key: 'recent', label: '近 N 小时接单量', enabled: true, weight: 15 },
    { key: 'idle', label: '空闲时长', enabled: true, weight: 10 },
  ];
}
/** 熟练度因子取值（4.3） */
export const PROFICIENCY_SCORE: Record<Proficiency, number> = { 专家: 1, 熟练: 0.6, 初级: 0.3 };
/** 紧急度 · 优先级分（4.3） */
export const PRIORITY_SCORE: Record<Priority, number> = { P0: 1, P1: 0.7, P2: 0.4, P3: 0.1 };

/* ------------------------------------------------------------------ */
/* 原处理人优先＝有序关系链（4.2，11-02 拍板方案 B）                        */
/* ------------------------------------------------------------------ */

/** 原处理人关系（P0 次序固定、不可调）：本单退回 → 关联单 → 同客户近期 */
export type OriginalRelation = '本单退回' | '关联单' | '同客户近期';
export const ORIGINAL_RELATIONS: OriginalRelation[] = ['本单退回', '关联单', '同客户近期'];
/** 人不在时：转下一步（下一行 / 综合打分）或保留 */
export type OriginalAbsentPolicy = '转下一步' | '保留';
/** 「保留」只对投诉单生效的关系（关联单、同客户近期）；本单退回对全部工单生效 */
export const RESERVE_COMPLAINT_ONLY: Record<OriginalRelation, boolean> = { 本单退回: false, 关联单: true, 同客户近期: true };

/** 关系链一行 */
export interface OriginalRelationRule {
  relation: OriginalRelation;
  enabled: boolean;
  /** 有效期（天，1–30）：以历史工单最近一次处理时间起算；本单退回不限，为 null */
  days: number | null;
  absent: OriginalAbsentPolicy;
  /** 保留时长（分钟，1–60） */
  reserveMinutes: number;
  /** 保留不超过首次响应剩余时限的百分比（1–100） */
  reserveSlaPercent: number;
  /** 仅限同一问题分类（只挂在「同客户近期」一行） */
  sameProblem?: boolean;
}

/** 不派回、不预留的情况（4.2 例外清单） */
export type OriginalExclusion = '被投诉人' | '不在归属组或已停用' | '上次回访不满意' | '小智退回';

export function defaultOriginalChain(): OriginalRelationRule[] {
  return [
    { relation: '本单退回', enabled: true, days: null, absent: '保留', reserveMinutes: 15, reserveSlaPercent: 30 },
    { relation: '关联单', enabled: true, days: 15, absent: '保留', reserveMinutes: 15, reserveSlaPercent: 30 },
    { relation: '同客户近期', enabled: true, days: 7, absent: '保留', reserveMinutes: 15, reserveSlaPercent: 30, sameProblem: false },
  ];
}

/**
 * 旧配置迁移（v2.7 及以前的出池规则 ② 五项 → 关系链）：
 * 开关 → 三行启用；时间窗 · 投诉 → 关联单天数；时间窗 · 咨询及其他 → 同客户近期天数；
 * 投诉预留时长 / 比例 → 各行保留时长 / 比例；同一问题分类 → 同客户近期一行。
 */
export function migrateOriginalChain(raw: Record<string, unknown> | null | undefined): OriginalRelationRule[] {
  const chain = defaultOriginalChain();
  if (!raw) return chain;
  if (Array.isArray(raw.originalChain)) {
    return chain.map((d) => {
      const hit = (raw.originalChain as Partial<OriginalRelationRule>[]).find((x) => x?.relation === d.relation);
      return hit ? { ...d, ...hit, relation: d.relation, days: d.relation === '本单退回' ? null : hit.days ?? d.days } : d;
    });
  }
  const num = (k: string) => (typeof raw[k] === 'number' ? raw[k] as number : undefined);
  const on = raw.originalFirst !== false;
  const mins = num('reserveMinutes');
  const pct = num('reserveSlaPercent');
  return chain.map((d) => ({
    ...d,
    enabled: on,
    ...(mins != null ? { reserveMinutes: mins } : {}),
    ...(pct != null ? { reserveSlaPercent: pct } : {}),
    ...(d.relation === '关联单' && num('windowComplaintDays') != null ? { days: num('windowComplaintDays')! } : {}),
    ...(d.relation === '同客户近期' && num('windowConsultDays') != null ? { days: num('windowConsultDays')! } : {}),
    ...(d.relation === '同客户近期' && typeof raw.originalSameProblem === 'boolean' ? { sameProblem: raw.originalSameProblem } : {}),
  }));
}

/** 派单配置（14.2 出池规则 / 个人上限，全部为后台可配默认值）与全局派单方式 */
export interface DispatchConfig {
  /** 全局派单方式（5.4，管理员在分派监控手动切换；人工派单＝全局不派单） */
  globalMode: PoolMode;
  /* 出池规则 */
  /** 步骤 ② 优先派回原处理人：关系链三行（4.2） */
  originalChain: OriginalRelationRule[];
  factors: ScoreFactor[];
  recentHours: number;
  relaxEnabled: boolean;
  /** 最远层级：同产品分类 / 不限 */
  relaxMaxLevel: 1 | 2;
  relaxQueueMinutes: number;
  relaxSlaPercent: number;
  fallbackSlaPercent: number;
  noSlaFallbackMinutes: number;
  /* 个人上限 */
  roleBase: Record<DispatchRole, number>;
  proficiencyCoef: Record<Proficiency, number>;
}
export function defaultDispatchConfig(): DispatchConfig {
  return {
    globalMode: '人工派单',
    originalChain: defaultOriginalChain(),
    factors: defaultScoreFactors(),
    recentHours: 2,
    relaxEnabled: true,
    relaxMaxLevel: 2,
    relaxQueueMinutes: 15,
    relaxSlaPercent: 50,
    fallbackSlaPercent: 25,
    noSlaFallbackMinutes: 30,
    roleBase: { ...DEFAULT_ROLE_BASE },
    proficiencyCoef: { ...DEFAULT_PROFICIENCY_COEF },
  };
}

/* ------------------------------------------------------------------ */
/* 在途计数（7.2 / 澄清 #43）                                            */
/* ------------------------------------------------------------------ */

/**
 * 逐状态口径：`assignee`＝计当前处理人；`none`＝不计任何人。
 * - 已委派：计工单处理人（主责），不计协办人 —— 原型工单行上的处理人即主责；
 * - 已升级技术支持：计三线当前处理人（工单行处理人）；三线池待领时处理人为空，自然不计；二线主责不计；
 * - 草稿与终态一律不计。
 */
export const IN_TRANSIT_COUNT_RULE: Record<TicketStatus, 'assignee' | 'none'> = {
  草稿: 'none',
  未认领: 'none',
  待响应: 'assignee',
  处理中: 'assignee',
  已退回: 'assignee',
  申请挂起中: 'assignee',
  申请关闭中: 'assignee',
  申请强结中: 'assignee',
  业务动作审核中: 'assignee',
  已委派: 'assignee',
  已升级技术支持: 'assignee',
  调研中: 'none',
  已挂起: 'none',
  已转出: 'none',
  已升级产研: 'none',
  自动刷机中: 'none',
  系统退费中: 'none',
  已结案: 'none',
  已关闭: 'none',
  已强结: 'none',
  已转咨询: 'none',
  已转建议: 'none',
  已转商机: 'none',
  已升级投诉: 'none',
  已升级外投: 'none',
  已取消: 'none',
  直接结案: 'none',
};

/* ------------------------------------------------------------------ */
/* 派单判定与日志（13.1）                                                */
/* ------------------------------------------------------------------ */

/**
 * 触发类型（13.1）。进池事件当场判定一次；其余都在每 5 分钟一轮的工单池扫描里判定：
 * 定时扫描、预留到期、切为自动派单（生效方式变为自动派单后的第一轮）。跨班次回收为 P1，类型先列出。
 */
export type DispatchTrigger =
  | '新单'
  | '定时扫描'
  | '预留到期'
  | '切为自动派单'
  | '跨班次回收'
  | '调剂到池'
  | '升级三线'
  | '售后转回'
  | '回访打回'
  | '池停用'
  | '重新进池';

/** 判定路径（13.1）。直派规则为 P1 */
export type DispatchPath = '直派规则' | '原处理人' | '加权评分' | '预留' | '排队' | '组内放宽' | '兜底回池' | '留池';

/** 失败原因（13.1） */
export type DispatchFailReason = '无画像匹配成员' | '无可接单成员' | '无在班成员' | '均达个人上限' | '系统异常' | '首响已超时';

/** 门槛（4.1 P0 项），用于门槛淘汰计数 */
export type GateKey = '候选范围' | '个人开关' | '角色' | '在班' | '投诉回避' | '画像已配置' | '画像匹配' | '个人上限';
export const GATE_ORDER: GateKey[] = ['候选范围', '个人开关', '角色', '在班', '投诉回避', '画像已配置', '画像匹配', '个人上限'];

/** 单个候选的评分明细（4.3） */
export interface ScoreDetail {
  name: string;
  /** 综合得分，0–100，一位小数 */
  total: number;
  /** 各因子取值（0–1） */
  factors: Record<ScoreFactorKey, number>;
  /** 同分规则用 */
  idleMinutes: number;
  inTransit: number;
}

/** 人工动作（13.1「人工动作」列） */
export type ManualAction = '班组长指派' | '改派' | '调剂到人' | '调剂到池' | '升级三线指定人' | '二线领取' | '升级投诉直派';

/** 人工换人（13.2）：引擎派出后发生即不计自动派单成功（分派监控统计卡） */
export const DISPATCH_UNDO_ACTIONS: ManualAction[] = ['改派', '调剂到人', '调剂到池', '班组长指派'];

/** 某单在判定序号 `afterSeq` 之后是否被跨班次回收或人工换人（自动派单成功率分子口径，13.2） */
export function isDispatchUndone(logs: DispatchLogEntry[], ticketNo: string, afterSeq: number): boolean {
  return logs.some((x) => x.ticketNo === ticketNo && x.seq > afterSeq
    && ((x.kind === '人工' && !!x.manual && DISPATCH_UNDO_ACTIONS.includes(x.manual.action)) || x.trigger === '跨班次回收'));
}

/** 派单日志条目（13.1） */
export interface DispatchLogEntry {
  id: string;
  ticketNo: string;
  /** 同一工单按判定先后编号，从 1 起 */
  seq: number;
  /** 年-月-日 时:分:秒 */
  at: string;
  kind: '判定' | '人工';
  trigger?: DispatchTrigger;
  poolId: string;
  poolLabel: string;
  /** 命中的入池规则名；未命中记「默认池」 */
  ruleName: string;
  globalMode: PoolMode;
  /** 归属池派单方式（字段名沿用） */
  groupMode: PoolMode;
  /** 生效派单方式（较严者） */
  effectiveMode: PoolMode;
  path?: DispatchPath;
  /** 派回原处理人 / 为原处理人保留时命中的关系（4.2） */
  originalRelation?: OriginalRelation;
  /** 关系链上因例外不派回、不保留的原处理人（4.2 例外清单） */
  originalExcluded?: { relation: OriginalRelation; name: string; reason: OriginalExclusion }[];
  relaxLevel?: RelaxLevel;
  /** 逐项门槛淘汰人数 */
  gateDrops?: Partial<Record<GateKey, number>>;
  candidateCount?: number;
  /** 中选坐席 */
  chosen?: { name: string; staffNo: string; groupLabel: string };
  chosenScore?: ScoreDetail;
  /** 得分前三名候选 */
  top3?: { name: string; total: number }[];
  failReason?: DispatchFailReason;
  /** 判定后派单状态 */
  status?: DispatchStatus | null;
  /** 工单快照 */
  snapshot: {
    businessType?: string;
    ticketType: string;
    productCategory?: string;
    product?: string;
    problem?: string;
    ticketSource?: string;
    customerType?: string;
    priority: Priority;
    /** 首响 SLA 剩余（分钟）；无首响 SLA 为空 */
    firstRespRemainMin?: number;
  };
  /** 人工动作（kind＝人工） */
  manual?: { action: ManualAction; operator: string; target?: string; reason?: string };
  /** 超额指派 / 超限标记 */
  overCap?: '超额指派' | '超限';
}

/** 工单在派单侧的状态（按工单号存，不写进工单行） */
export interface TicketDispatchState {
  ticketNo: string;
  poolId: string;
  /** 命中的入池规则 id；默认池为 null */
  ruleId: string | null;
  /** 进入派单时刻（ms） */
  enteredAt: number;
  status: DispatchStatus | null;
  relaxLevel: RelaxLevel;
  /** 本级排队起点（每放宽一级重新计时，4.4） */
  queueSince: number | null;
  /** 预留目标坐席与到期时刻（4.2） */
  reserveFor?: string;
  reserveUntil?: number;
  /** 首响时限（分钟）：工单 SLA 规则配置的完整时限，首响剩余比例的分母（4.4）；无首响 SLA 为空 */
  firstRespTotalMin?: number;
  /** 首响截止时刻（ms）：进入派单时刻 ＋ 当时的首响剩余；已超时的单早于进入派单时刻 */
  firstRespDueAt?: number;
  /** 经调剂到池、升级三线指定池进入（命中规则记「指定池」，13.1） */
  designatedPool?: boolean;
  /** 投诉对象（投诉回避） */
  complaintTarget?: string;
  /** 售后转回 / 回访打回：本单上一处理人（关系「本单退回」） */
  prevHandler?: string;
  /** 承接子单、升级投诉的原单号（关系「关联单」；外投单读工单行「升级自」） */
  relatedNo?: string;
  /** 预留关系（等原处理人时） */
  reserveRelation?: OriginalRelation;
  /** 本次进入派单已预留过（一张单只预留一次，4.2） */
  reservedOnce?: boolean;
  /** 判定序号 */
  seq: number;
  /** 已首次派到人（受理短信只发一次） */
  everAssigned?: boolean;
}

/* ------------------------------------------------------------------ */
/* 审计（3.1 / 5.4 / 6.5 / 7.5 / 8.3）                                   */
/* ------------------------------------------------------------------ */

export type DispatchAuditKind = '个人开关' | '派单方式' | '入池规则' | '工单池' | '组成员' | '人员画像' | '熟练度' | '个人上限' | '派单策略';
export interface DispatchAuditEntry {
  id: string;
  at: string;
  /** 操作方：姓名或「系统」 */
  operator: string;
  kind: DispatchAuditKind;
  /** 对象：全局 / 组名 / 姓名 / 规则名 */
  target: string;
  before: string;
  after: string;
  reason?: string;
}

/** 派单结果（引擎对外返回） */
export interface DispatchResult {
  /** 派到的人；留池为 null */
  assignee: string | null;
  poolId: string;
  poolLabel: string;
  path: DispatchPath;
  status: DispatchStatus | null;
  /** 履历 / 提示用的一句话 */
  reason: string;
  log: DispatchLogEntry;
}

/** 占用（先到先得）结果 */
export interface OccupyResult {
  ok: boolean;
  message: string;
}
export const TAKEN_MESSAGE = '该工单已被领取';
/** 非本人所在组的池只读（10.1） */
export const NOT_OWN_POOL_MESSAGE = '非本组工单池，不可领取';
/** 固定落点池的处理组不能移出最后一名成员 */
export const LAST_MEMBER_MESSAGE = '该组是固定落点工单池的处理组，至少保留一名成员';
