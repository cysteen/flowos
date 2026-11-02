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

/** 池形态（第 5 章）。较严者优先：停派态 > 降级态 > 正常态 */
export type PoolMode = '正常态' | '降级态' | '停派态';
export const POOL_MODES: PoolMode[] = ['正常态', '降级态', '停派态'];
const MODE_RANK: Record<PoolMode, number> = { 正常态: 0, 降级态: 1, 停派态: 2 };
/** 取较严者（5.1） */
export function stricterMode(...modes: PoolMode[]): PoolMode {
  return modes.reduce<PoolMode>((a, b) => (MODE_RANK[b] > MODE_RANK[a] ? b : a), '正常态');
}

/** 运行方式（14.2 运行设置 · 第 17 章）。默认试运行 */
export type RunMode = '试运行' | '正式派单';

/** 留池工单的派单状态（1.3 / 10.1）。降级态、停派态下为空 */
export type DispatchStatus = '等原处理人' | '排队中' | '派单失败回池';
export const DISPATCH_STATUSES: DispatchStatus[] = ['等原处理人', '排队中', '派单失败回池'];

/** 坐席状态（11.5）：与顶栏话务条联动，话务条签入、小休、签出即为派单签入状态 */
export type SignInStatus = '签入' | '小休' | '签出';
export const SIGN_IN_STATUSES: SignInStatus[] = ['签入', '小休', '签出'];

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
 * 问题分类取值：节点路径，一级 / 二级 / 三级，用「/」连接，如 `功能异常/播放问题`。
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
  /** 归属池（＝组 id，一组一池） */
  poolId: string;
  enabled: boolean;
  /** 迁移来源（3.4）；人工新增为空 */
  migratedFrom?: '问题分类处理组' | '规则引擎派单';
  updatedBy: string;
  updatedAt: string;
}

/** 默认池：综合处理组池（3.1 未命中落默认池） */
export const DEFAULT_POOL_ID = 'general';
export const DEFAULT_POOL_LABEL = '综合处理组';

/* ------------------------------------------------------------------ */
/* 人 · 组 · 池                                                          */
/* ------------------------------------------------------------------ */

/** 派单侧的组（一组一池，池 id ＝ 组 id，沿用 `POOL_GROUPS`） */
export interface DispatchGroup {
  id: string;
  label: string;
  /** 班组开关（8.1），默认开；关闭即本组池转降级态 */
  switchOn: boolean;
  /** 本组形态（管理员切换，5.4）；与全局形态、班组开关取较严者 */
  mode: PoolMode;
  /** 班组长姓名（兜底回池通知、指派权限） */
  leaders: string[];
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
  /** 本次签入起点（ms）；非签入为 null（在岗时长，13.2 派单均衡度） */
  signInSince?: number | null;
  /** 当日已累计在岗时长（ms，不含本次签入中的时长） */
  onDutyMs?: number;
  /** `onDutyMs` 所属日期（YYYY-MM-DD），跨日清零 */
  onDutyDay?: string;
}

/** 上线阶段（第 17 章）：试运行 → 单组试点 → 多组 → 全量 */
export type RolloutStage = '试运行' | '单组试点' | '多组' | '全量';
export const ROLLOUT_STAGES: RolloutStage[] = ['试运行', '单组试点', '多组', '全量'];

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

/** 出池规则与运行设置（14.2，全部为后台可配默认值） */
export interface DispatchConfig {
  /* 运行设置 */
  globalSwitch: boolean;
  /** 全局形态（管理员切换或自动降级） */
  globalMode: PoolMode;
  /** 全局形态是否由自动降级进入（5.3；回切须管理员确认） */
  autoDegraded: boolean;
  runMode: RunMode;
  /** 自动降级 · 派单失败率：5 分钟内 ≥ N%（5.3） */
  autoFailRate: number;
  /** 自动降级 · 自动派单成功率：15 分钟内 ＜ N% */
  autoSuccessRate: number;
  /** 自动降级 · 坐席状态数据超过 N 分钟未同步 */
  autoSyncMinutes: number;
  /** 自动降级 · 引擎连续 N 分钟无响应 */
  autoEngineMinutes: number;
  /** 回切提示 · 各项指标连续达标 N 分钟（5.4） */
  resumeOkMinutes: number;
  /** 无操作转小休 N 分钟 */
  idleToBreakMinutes: number;
  /* 出池规则 */
  originalFirst: boolean;
  windowConsultDays: number;
  windowComplaintDays: number;
  /** 附加条件「同一问题分类」，默认不勾 */
  originalSameProblem: boolean;
  reserveMinutes: number;
  /** 不超过首响 SLA 剩余的百分比 */
  reserveSlaPercent: number;
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
    globalSwitch: false,
    globalMode: '正常态',
    autoDegraded: false,
    runMode: '试运行',
    autoFailRate: 20,
    autoSuccessRate: 60,
    autoSyncMinutes: 30,
    autoEngineMinutes: 3,
    resumeOkMinutes: 10,
    idleToBreakMinutes: 30,
    originalFirst: true,
    windowConsultDays: 7,
    windowComplaintDays: 15,
    originalSameProblem: false,
    reserveMinutes: 15,
    reserveSlaPercent: 30,
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

/** 触发类型（13.1）。跨班次回收为 P1，类型先列出 */
export type DispatchTrigger =
  | '新单'
  | '预留到期'
  | '名额释放'
  | '组内放宽'
  | '跨班次回收'
  | '调剂到池'
  | '升级三线'
  | '售后转回'
  | '回访打回'
  | '回切重派';

/** 判定路径（13.1）。直派规则为 P1 */
export type DispatchPath = '直派规则' | '原处理人' | '加权评分' | '预留' | '排队' | '组内放宽' | '兜底回池' | '留池';

/** 失败原因（13.1） */
export type DispatchFailReason = '无画像匹配成员' | '无在班成员' | '均达个人上限' | '引擎异常';

/** 门槛（4.1 P0 项），用于门槛淘汰计数 */
export type GateKey = '候选范围' | '三级开关' | '角色' | '在班' | '投诉回避' | '画像已配置' | '画像匹配' | '个人上限';
export const GATE_ORDER: GateKey[] = ['候选范围', '三级开关', '角色', '在班', '投诉回避', '画像已配置', '画像匹配', '个人上限'];

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
  groupMode: PoolMode;
  /** 生效形态（较严者） */
  effectiveMode: PoolMode;
  runMode: RunMode;
  path?: DispatchPath;
  relaxLevel?: RelaxLevel;
  /** 逐项门槛淘汰人数 */
  gateDrops?: Partial<Record<GateKey, number>>;
  candidateCount?: number;
  /** 中选坐席（试运行为建议处理人） */
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
  /** 试运行：建议处理人与实际处理人 */
  trial?: { suggested: string | null; actual: string | null; same: boolean };
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
  /** 投诉对象（投诉回避） */
  complaintTarget?: string;
  /** 售后转回 / 回访打回：本单上一处理人 */
  prevHandler?: string;
  /** 判定序号 */
  seq: number;
  /** 兜底后引擎不再自动判定（4.4） */
  fallbackDone?: boolean;
  /** 已首次派到人（受理短信只发一次） */
  everAssigned?: boolean;
}

/* ------------------------------------------------------------------ */
/* 审计（3.1 / 5.4 / 6.5 / 7.5 / 8.3）                                   */
/* ------------------------------------------------------------------ */

export type DispatchAuditKind = '全局开关' | '班组开关' | '个人开关' | '池形态' | '运行方式' | '入池规则' | '人员画像' | '熟练度' | '个人上限' | '派单策略';
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
  /** 试运行建议处理人 */
  suggested?: string | null;
  log: DispatchLogEntry;
}

/** 占用（先到先得）结果 */
export interface OccupyResult {
  ok: boolean;
  message: string;
}
export const TAKEN_MESSAGE = '该工单已被领取';
