/**
 * 教育刷机单 · 工单处理页门控（930 教育刷机单 PRD §5.5 表一 / 表二 / 置灰悬停原因表，§1.2 / §9.4 数据范围，
 * D2 / D17 / M25 / M34 / M71 / M72 / M74 / M81 / M83，X6 / X25 / X26）。
 *
 * **单一真源**：底栏（OpActionBar）、页头（OpHeader）、侧栏联系客户（OpSidePanel）、Tab 写权（OpProcessTabs）、
 * 刷机信息区块头「修改刷机信息」都只问这里，不各写一套判据。四类老工单不经过本模块。
 *
 * 判定两道（§5.5 首段）：先定**视角**（角色 × 本单处理人 / 池，`resolveFlashView`），再按**子状态**逐格取值
 * （`flashButtonGate` / `flashEscalateComplaintGate`）；任一道「不展示」即不渲染，其余任一道「置灰」即置灰。
 * 同一按钮命中多条悬停原因时，取原因表中靠前的一条。
 */
import { isTicketClosed, type TicketStatus } from '@/views/tickets/types/ticket';
import { FLASH_L1_REPUSH_LIMIT, FLASH_TIP_AUTO_FLASHING, FLASH_TIP_L1_REPUSH_EXHAUSTED, type FlashPoolKey } from '@/views/tickets/types/flash';
import { NO_AFTERSALE_TIP } from './opActionRegistry';

/* ------------------------------------------------------------------ */
/* 视角                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 当前登录人在这张刷机单上的视角：
 * - `l1` 一线视角：一线坐席且是本单处理人；
 * - `l2` 二线视角：二线专员是本单处理人；二线班组长管辖范围内已有处理人的单；管理员已认领的单；
 * - `claim` 池中未认领、当前角色可领取（一线坐席 × 一线刷机池、二线专员 × 教育刷机处理组池）：只出领取入口；
 * - `readonly` 只读查看：数据范围外的单（他人名下、其他池、无处理人的自动刷机中 / 调研中、本人建的单等），
 *   以及不可领取角色打开的未认领单；
 * - `other` 客诉专员：底栏只出「风险评估」形态（PRD §5.5「其他」行）。
 */
export type FlashView = 'l1' | 'l2' | 'claim' | 'readonly' | 'other';

const FLASH_ADMIN_ROLES = new Set(['system-admin', 'ops-admin', 'tenant-admin']);

export interface FlashViewInput {
  roleKey: string;
  /** 当前登录人在工单数据源里的处理人名（`currentHandlerName`） */
  handlerName: string;
  /** 本单处理人；无处理人为 null */
  assignee: string | null | undefined;
  /** 本单子状态 */
  status: string;
  /** 本单归属池（未进过人工池为空） */
  pool?: FlashPoolKey;
  /** 处理人所属分组 id（`handlerGroupOf(assignee)?.id`），二线班组长判管辖范围用 */
  assigneeGroupId?: string;
}

/** 一线刷机池的分组 id（`FLASH_POOLS.l1.groupId`） */
const FLASH_L1_GROUP_ID = 'line1';

function unclaimedIn(i: FlashViewInput, pool: FlashPoolKey): boolean {
  return i.status === '未认领' && !i.assignee && i.pool === pool;
}

export function resolveFlashView(i: FlashViewInput): FlashView {
  const mine = !!i.assignee && i.assignee === i.handlerName;
  switch (i.roleKey) {
    case 'agent-l1':
      if (mine) return 'l1';
      return unclaimedIn(i, 'l1') ? 'claim' : 'readonly';
    case 'agent-l2':
      if (mine) return 'l2';
      return unclaimedIn(i, 'l2') ? 'claim' : 'readonly';
    case 'team-leader':
      // 管辖教育刷机处理组：本组全员名下可办理；未认领单只指派（不在处理页）、一线刷机池与一线坐席名下不管（M72）
      if (i.assignee && i.pool === 'l2' && i.assigneeGroupId !== FLASH_L1_GROUP_ID) return 'l2';
      return 'readonly';
    case 'complaint-handler':
      return 'other';
    default:
      // 管理员全租户：未认领单不出流转动作（X26），其余走二线视角
      if (FLASH_ADMIN_ROLES.has(i.roleKey)) return i.status === '未认领' ? 'readonly' : 'l2';
      return 'readonly';
  }
}

/* ------------------------------------------------------------------ */
/* 子状态列（表二的列）                                                  */
/* ------------------------------------------------------------------ */

export type FlashStage =
  | '未认领' | '待响应' | '处理中' | '自动刷机中' | '调研中' | '审核中'
  | '已挂起' | '已委派' | '已转出' | '终态' | '已升级投诉';

const REVIEW_STATUSES = ['申请挂起中', '申请关闭中', '申请强结中', '业务动作审核中'];

/** 子状态 → 表二的列。委派中（`delegateInfo` 在）按「已委派」列取值 */
export function flashStageOf(status: string, delegating = false): FlashStage {
  if (status === '已升级投诉' || status === '已升级外投') return '已升级投诉';
  if (isTicketClosed(status as TicketStatus)) return '终态';
  if (delegating || status === '已委派') return '已委派';
  if (REVIEW_STATUSES.includes(status)) return '审核中';
  if (status === '已退回') return '处理中';
  const known: FlashStage[] = ['未认领', '待响应', '处理中', '自动刷机中', '调研中', '已挂起', '已转出'];
  return known.includes(status as FlashStage) ? (status as FlashStage) : '处理中';
}

/* ------------------------------------------------------------------ */
/* 悬停原因（PRD §5.5 置灰悬停原因表 1–13，逐字）                         */
/* ------------------------------------------------------------------ */

export const FLASH_GATE_TIPS = {
  /** 1 */ autoFlashing: FLASH_TIP_AUTO_FLASHING,
  /** 2 */ transferred: '工单已转出至售后，等待售后处理结果',
  /** 3 */ delegated: '工单委派中，协办完成后可操作',
  /** 4 */ review: '工单审核中，审批完成或撤回申请后可操作',
  /** 5 */ suspended: '工单已挂起，解除挂起后可操作',
  /** 6 */ survey: '工单回访中，撤回下送后可操作',
  /** 7 */ unclaimed: '本单尚未认领，领取后可操作',
  /** 8 */ unclaimedRisk: '本单尚未认领，领取后可发起报备',
  /** 9 */ l1RepushExhausted: FLASH_TIP_L1_REPUSH_EXHAUSTED,
  /** 10 */ withdrawNotForwarder: '只能撤回本人发起的下送',
  /** 11 */ withdrawNotApplicant: '只能撤回本人发起的申请',
  /** 12 */ withdrawNone: '当前无可撤回的操作',
  /** 13 */ noAftersale: NO_AFTERSALE_TIP,
} as const;

/** 子状态类原因（1–8），按原因表顺序；`withdraw` 时跳过 4、6（撤回在审核中 / 调研中另判） */
function stageTip(stage: FlashStage, opts: { withdraw?: boolean; risk?: boolean } = {}): string | undefined {
  switch (stage) {
    case '自动刷机中': return FLASH_GATE_TIPS.autoFlashing;
    case '已转出': return FLASH_GATE_TIPS.transferred;
    case '已委派': return FLASH_GATE_TIPS.delegated;
    case '审核中': return opts.withdraw ? undefined : FLASH_GATE_TIPS.review;
    case '已挂起': return FLASH_GATE_TIPS.suspended;
    case '调研中': return opts.withdraw ? undefined : FLASH_GATE_TIPS.survey;
    case '未认领': return opts.risk ? FLASH_GATE_TIPS.unclaimedRisk : FLASH_GATE_TIPS.unclaimed;
    default: return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* 底栏按钮（表一 × 表二）                                               */
/* ------------------------------------------------------------------ */

/** 刷机单底栏按钮键（底栏展示顺序见下方两个 ORDER） */
export type FlashBarKey =
  | '下送' | '重推' | '升级二线' | '转售后' | '撤回'
  | '挂起' | '委派' | '调剂' | '关闭工单' | '强结' | '风险报备';

/** 一线视角底栏顺序：保存 · 下送 · 重新推送 · 升级二线 · 撤回（「保存」由底栏常驻） */
export const FLASH_L1_BAR_ORDER: readonly FlashBarKey[] = ['下送', '重推', '升级二线', '撤回'];
/** 二线视角底栏顺序：保存 · 下送 · 重新推送 · 转售后 · 更多 */
export const FLASH_L2_BAR_ORDER: readonly FlashBarKey[] = ['下送', '重推', '转售后'];
/** 二线视角「更多」内顺序：申请挂起 · 委派 · 调剂 · 关闭工单 · 强结 · 风险报备 · 撤回 */
export const FLASH_L2_MORE_ORDER: readonly FlashBarKey[] = ['挂起', '委派', '调剂', '关闭工单', '强结', '风险报备', '撤回'];

/** 按钮文案（「挂起」「委派」位在已挂起 / 已委派列切换为解除挂起 / 撤销委派，见 `flashBarLabel`） */
const FLASH_BAR_LABEL: Record<FlashBarKey, string> = {
  下送: '下送', 重推: '重新推送', 升级二线: '升级二线', 转售后: '转售后', 撤回: '撤回',
  挂起: '申请挂起', 委派: '委派', 调剂: '调剂', 关闭工单: '关闭工单', 强结: '强结', 风险报备: '风险报备',
};

export function flashBarLabel(key: FlashBarKey, stage: FlashStage): string {
  if (key === '挂起' && stage === '已挂起') return '解除挂起';
  if (key === '委派' && stage === '已委派') return '撤销委派';
  return FLASH_BAR_LABEL[key];
}

/** 表二各按钮「可用」的列 */
const AVAILABLE_STAGES: Record<FlashBarKey, readonly FlashStage[]> = {
  下送: ['待响应', '处理中', '已委派'],
  重推: ['待响应', '处理中'],
  升级二线: ['待响应', '处理中'],
  转售后: ['待响应', '处理中'],
  撤回: ['调研中', '审核中'],
  挂起: ['待响应', '处理中', '已挂起'],
  委派: ['待响应', '处理中', '已委派'],
  调剂: ['待响应', '处理中'],
  关闭工单: ['待响应', '处理中'],
  强结: ['待响应', '处理中'],
  风险报备: ['待响应', '处理中', '调研中', '审核中', '已挂起', '已委派'],
};

export interface FlashGateResult {
  forbidden: boolean;
  tip?: string;
}

export interface FlashBarGateCtx {
  view: FlashView;
  stage: FlashStage;
  /** 本单一线重推次数 */
  l1RepushCount: number;
  /** 当前用户是否本次下送 / 申请的发起人（撤回用） */
  isInitiator: boolean;
  /** 本单产品有售后服务（转售后用，基线 ※12） */
  afterSaleEnabled: boolean;
}

/** 单个底栏按钮在当前视角 × 子状态下的取值（渲染与否由视角与「重新推送」机型判定先行决定） */
export function flashButtonGate(key: FlashBarKey, ctx: FlashBarGateCtx): FlashGateResult {
  const { stage } = ctx;
  if (key === '撤回') {
    if (stage === '调研中') return ctx.isInitiator ? { forbidden: false } : { forbidden: true, tip: FLASH_GATE_TIPS.withdrawNotForwarder };
    if (stage === '审核中') return ctx.isInitiator ? { forbidden: false } : { forbidden: true, tip: FLASH_GATE_TIPS.withdrawNotApplicant };
    return { forbidden: true, tip: stageTip(stage, { withdraw: true }) ?? FLASH_GATE_TIPS.withdrawNone };
  }
  if (!AVAILABLE_STAGES[key].includes(stage)) {
    return { forbidden: true, tip: stageTip(stage, { risk: key === '风险报备' }) };
  }
  if (key === '重推' && ctx.view === 'l1' && ctx.l1RepushCount >= FLASH_L1_REPUSH_LIMIT) {
    return { forbidden: true, tip: FLASH_GATE_TIPS.l1RepushExhausted };
  }
  if (key === '转售后' && !ctx.afterSaleEnabled) {
    return { forbidden: true, tip: FLASH_GATE_TIPS.noAftersale };
  }
  return { forbidden: false };
}

/* ------------------------------------------------------------------ */
/* 刷机信息区块头「修改刷机信息」（表二「修改刷机信息」行）                    */
/* ------------------------------------------------------------------ */

/** null ＝ 不展示；否则置灰与否 + 原因。只读查看、终态、未认领不展示；二线视角限本单处理人 */
export function flashEditInfoGate(view: FlashView, stage: FlashStage, isHandler: boolean): FlashGateResult | null {
  if (view !== 'l1' && view !== 'l2') return null;
  if (view === 'l2' && !isHandler) return null;
  if (stage === '未认领' || stage === '终态' || stage === '已升级投诉') return null;
  if (stage === '待响应' || stage === '处理中') return { forbidden: false };
  return { forbidden: true, tip: stageTip(stage) };
}

/* ------------------------------------------------------------------ */
/* 页头「升级投诉」（表二「升级投诉（头部）」行）                              */
/* ------------------------------------------------------------------ */

/** 置灰与否 + 原因；「已升级投诉」列不展示由整页接管锁收掉，这里不另判 */
export function flashEscalateComplaintGate(stage: FlashStage): FlashGateResult {
  if (stage === '待响应' || stage === '处理中' || stage === '终态' || stage === '已升级投诉') return { forbidden: false };
  return { forbidden: true, tip: stageTip(stage) };
}

/**
 * 页头按钮的视角裁剪（§5.5「只读查看」行）：只读查看时一线坐席出催单 / 新建补充 / 升级投诉，
 * 二线（专员 / 班组长等）只出新建补充；管理员照二线视角（升级投诉按表二置灰）。取消工单刷机单一律不出（M6）。
 */
export function flashHeaderEscalateVisible(view: FlashView, roleKey: string): boolean {
  if (view !== 'readonly') return true;
  return roleKey === 'agent-l1' || FLASH_ADMIN_ROLES.has(roleKey);
}
