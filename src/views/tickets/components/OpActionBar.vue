<script setup lang="ts">
import { computed, ref } from 'vue';
import { Modal, message } from 'ant-design-vue';
import {
  ArrowRightOutlined, VerticalAlignBottomOutlined, PauseCircleOutlined,
  PlayCircleOutlined, RiseOutlined, UndoOutlined, StopOutlined,
  ToolOutlined, CheckCircleOutlined, SaveOutlined, SwapOutlined,
  RollbackOutlined, TeamOutlined, WarningOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue';
import {
  FLASH_L1_BAR_ORDER, FLASH_L2_BAR_ORDER,
  flashBarLabel, flashButtonGate, type FlashBarKey, type FlashStage, type FlashView,
} from '../composables/flashGate';
import OpActionDialogs from './OpActionDialogs.vue';
import OpRiskReportModal from './operation/OpRiskReportModal.vue';
import OpAftersaleLinkCard from './operation/OpAftersaleLinkCard.vue';
import OpForwardModal from './operation/OpForwardModal.vue';
import OpAftersaleActivateModal from './operation/OpAftersaleActivateModal.vue';
import type { SuspendInfo, OpActionType, TicketOpState, AftersaleContext } from '../composables/opActions';
import { availableActions, NO_AFTERSALE_TIP } from '../composables/opActionRegistry';
import { XIAOZHI_RD_PENDING_BLOCKED, XIAOZHI_TIP } from '../types/xiaozhi';
import type { ClosureMode } from '@/views/tickets/types/ticket';
import { MAX_RETURN_COUNT } from '../composables/opActions';
import { activateAftersaleTicket } from '@/api/aftersaleActivate';
import type { AftersaleButtonForm } from '../composables/aftersaleButtonForm';

const props = defineProps<{
  ticketNo: string;
  ticketTitle: string;
  ticketType: string;
  /** 「刷机单」标识（1013 A1：刷机单类型为咨询，刷机底栏按标识判，不看类型） */
  isFlash?: boolean;
  /** 「小智工单」标识（1130 D1：小智单类型为咨询，小智底栏按标识判，不看类型） */
  isXiaozhi?: boolean;
  /**
   * 本单对当前登录人**可领取**（工单池里无人认领的单，1130 PRD §1.2 / §5.3 / §6）。
   *
   * 🔴 **判据不在本组件算**，由工单页给（它才知道标识 + 子状态 + 角色）—— 与
   * `riskControlBlocked` 等几枚同形制：门控落在取值一侧，组件只管「有值就渲染」。
   * 刷机单那条路走的是 `isFlash + flashView==='claim'`（`isFlashClaim`），本字段是**通用那条**：
   * 原先「领取」整枚只在 `isFlashClaim` 下渲染，**是刷机专属的** ——
   * 于是小智单的工单池单打开后底栏根本没有「领取」，PRD 列的 12 枚里有一枚界面上不存在。
   * 待领取时底栏只出「领取」（用户 10-19）。老四类未认领的单不走本字段：整条底栏不渲染（由工单页 `hideBar` 收）。
   */
  claimable?: boolean;
  /** 本单的一线人员域账号（一·补 B24）：只透传给升级弹窗只读带出，本组件不读它 */
  frontlineAccount?: string;
  /**
   * 结案方式（基线 §1「结案方式」小节），与工单类型正交。
   * 「直接结案」的单动作集极简 —— 不下送、不升级、不挂起、不转派，见 availableActions。
   * 缺省视为「正常流程」，不会误收窄历史单的动作集。
   */
  closureMode?: ClosureMode;
  afterSaleEnabled: boolean;
  opState: TicketOpState;
  suspendInfo: SuspendInfo | null;
  returnCount?: number;
  draftSavedAt?: string | null;
  /** 消费者BG工单：升级通道开放飞书项目 */
  feishuEligible?: boolean;
  /** 飞书协同子状态：已关联（synced/feedback/closed）时底栏「升级」置灰 */
  feishuSync?: string;
  /**
   * 本单是**产研退回后待重新提交**的小智单（1130 一·补 B31 / B33：子状态「已退回」）。
   *
   * 🔴 **它是 `feishuSync` 那道置灰的例外**：`feishuSync ∈ {synced, feedback, closed}` 置灰「升级」，
   * 拿的是"已经升过、别再升"这个**代理条件**；而「已退回」的语义恰恰是"这次升级已经结束、
   * 允许重新提交" —— 判据用错了维度。退回后本单的 `rdSync` **保留真实值**（产研反馈 Tab 与
   * 那几条历史记录要继续看得见，创建人正要照着它补信息），开闸改由本字段按**子状态**给。
   *
   * 🔴 **判据不在本组件算**（与 `claimable` 同形制）：组件只拿一个布尔，不自己去拼
   * 「是小智单 ∧ 子状态是已退回」。也**不要**把这道例外加到通用单上 ——
   * `feishuEscalateBlocked` 是共用门控，通用单的「已退回」是技术支持退回给处理人，
   * 与飞书那条升级链路无关，放开即是改坏别人。
   */
  xiaozhiRdReturned?: boolean;
  /**
   * 本单是**已推给产研、还在等提报人确认**的小智单（子状态「已升级产研」）。
   *
   * 成立时 `XIAOZHI_RD_PENDING_BLOCKED` 那四枚（关闭工单 / 调剂 / 委派 / 转单）**置灰**，
   * 悬停出 `XIAOZHI_TIP.rdPendingConfirm` —— 这是 B5「确认完才关单」在界面上的闸门。
   * 判据同样在工单页算（与 `claimable` / `xiaozhiRdReturned` 同形制），本组件只拿布尔，
   * 且**只对小智单成立**，通用单在该态照基线的「可用」走。
   */
  xiaozhiRdPending?: boolean;
  /** 转售后上下文（投诉分流 + 预填 + 已有关联售后单） */
  aftersaleContext?: AftersaleContext;
  /**
   * 「转售后」位的形态（《【1025】》§5.1，`resolveAftersaleButtonForm` 的结果，由工单页算好传入）：
   * 建单「转售后」/ 激活「激活售后单」/ 置灰（含 hover 卡片）。本组件不另判。
   */
  aftersaleForm?: AftersaleButtonForm;
  /** 处理表单现值：挂起申请需校验服务类型/服务方式 */
  serviceType?: string;
  serviceMethod?: string;
  /** 处理表单现值：下送（正常结案）前需校验问题原因/处理结果已填 */
  problemCause?: string;
  processResult?: string;
  /** 工单归属组（挂起/关单默认审批组） */
  groupNames?: string[];
  groupId?: string;
  lastHandler?: string | null;
  /** 委派中：协办未完成前锁定流转/终结类动作 */
  delegateTargets?: string;
  /**
   * 工单是否正在**三线技术支持**手上。
   * 「退回」只有三线技术支持 → 工单处理人这一个方向，故仅在三线持单时展示。
   * 判据＝子状态「已升级技术支持」（依据基线 §1 ※14b：产研那一类处理人仍是二线、
   * 不给「退回」），由视图侧算好传入。
   */
  atTechSupport?: boolean;
  /**
   * 隐藏底部操作栏本体（一线视角）：只藏可见的按钮条，组件仍挂载，
   * 头部按钮触发的弹窗（如「关联售后」）照常可用。
   */
  hideBar?: boolean;
  /**
   * 终态「结案后补充」：底栏只留「保存」且可点（提交商机编号 / 结案后备注），流转动作不出。
   */
  saveOnly?: boolean;
  /**
   * 底栏那一枚风险按钮要不要出。**底栏只剩报备形态**（2026-09-28 裁决：评估结论与
   * 协同处理两支已挪到页头「风险管控」），文案与类型集由 `resolveRiskBarForm` 现算，
   * 出现条件由工单页算（见 TicketOperationView 的 `showRiskReport`）。
   */
  showRiskReport?: boolean;
  /** 那一枚按钮要不要置灰（条件由工单页算，见 TicketOperationView） */
  riskReportPending?: boolean;
  /**
   * 置灰的**原因原文**，由调用方给。
   *
   * 🔴 **不要在本组件里写死**：底栏只知道"这枚按钮该灰"，不知道是谁挡住的 ——
   * 此前这里硬写着「本单已有报备待评估」，而挡住它的可能是一条 A 线的自动条目
   * （那不是报备，二线点进 Tab 一条报备都找不到），也可能是本单的报备已被人领走
   * （该找的是领它的那个人，不是"等评估"）。判据在工单页手上，原因就该跟着判据走。
   */
  riskForbiddenTip?: string;
  /**
   * 刷机单视角（930 教育刷机单 PRD §5.5，判据见 `composables/flashGate.ts`）。
   * 一线 / 二线视角走刷机单底栏（表一顺序 + 表二逐格取值）；可领取只出「领取」；
   * 客诉专员在底栏一枚都不出（他落的是评估形态，已挪到页头「风险管控」）。
   * 四类老工单不传，底栏走原路径。
   */
  flashView?: FlashView | null;
  /** 刷机单子状态列（表二的列） */
  flashStage?: FlashStage;
  /** 当前用户是否本次下送 / 申请的发起人（撤回） */
  flashIsInitiator?: boolean;
  /** 调研中本单有无下送发起人（撤回悬停原因取值，M99） */
  flashHasForwarder?: boolean;
  /** 刷机单下送必填校验不通过的提示（空＝通过，PRD §5.4「下送必填校验」；含「已线下登记」拦截） */
  flashForwardTip?: string;
  /** 刷机处理结论＝升级二线（一线）：下送改为「升级二线确认」，确认后进教育刷机处理组池（1013 A18） */
  flashForwardEscalate?: boolean;
  /** 刷机单下送确认弹窗主按钮文案（本单已产生过回访结论＝「下送并结案」，PRD §5.5） */
  flashForwardOkText?: string;
  /** 刷机单已在二线（1014）：下送必填校验与咨询单一致（问题原因、处理结果），不按刷机处理结论拦 */
  flashConsultForward?: boolean;
}>();

/** 置灰提示的兜底：调用方没给原因时至少说清"被挡住了"，不冒充一个具体理由 */
const RISK_FORBIDDEN_FALLBACK = '当前不可发起风险操作';

const emit = defineEmits<{
  action: [payload: Record<string, unknown>];
  cancel: [];
  withdraw: [];
  transferTicket: [];
  riskReport: [payload: {
    reason: string;
    category: string | null;
    desc: string;
    attachments: string[];
  }];
  /** 刷机单下送且处理结果＝升级二线：确认弹窗与落库由处理页接（1013 A18） */
  flashEscalate: [];
  /** 刷机单一线下送被拦（提示原文），处理页据此在字段下方出提示 */
  flashForwardBlocked: [tip: string];
  /** 刷机单池中未认领：领取（PRD §4.2） */
  claim: [];
}>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICONS: Record<string, any> = {
  ArrowRightOutlined, VerticalAlignBottomOutlined, PauseCircleOutlined,
  PlayCircleOutlined, RiseOutlined, UndoOutlined, StopOutlined,
  ToolOutlined, CheckCircleOutlined, SaveOutlined, SwapOutlined,
  RollbackOutlined, TeamOutlined, WarningOutlined, ReloadOutlined,
};

/**
 * 已成功关联产研反馈：底栏升级置灰，催单/二次激活改在「产研反馈」Tab。
 *
 * **例外：产研退回后待重新提交的小智单**（1130 一·补 B31 / B33）——「已退回」说明这次升级
 * 已经结束、正等着补料重提，不是「已经升过别再升」。见 `xiaozhiRdReturned` 的说明。
 */
const feishuEscalateBlocked = computed(() =>
  !props.xiaozhiRdReturned
  && (props.feishuSync === 'synced'
    || props.feishuSync === 'feedback'
    || props.feishuSync === 'closed'),
);

const DIALOG_ACTIONS: OpActionType[] = [
  '调剂', '委派', '强结', '挂起', '恢复', '退回', '升级', '同步飞书', '转售后',
  '标记已解决', '关闭工单',
];

/** 底栏展示顺序（对齐参考原型 bottom-actions + 强结） */
const BAR_ORDER: (OpActionType | '转单')[] = [
  '下送', '升级', '风险报备', '转售后', '撤回', '调剂', '委派', '转单', '挂起', '退回', '关闭工单', '强结',
];

const dialogOpen = ref(false);
const dialogAction = ref<OpActionType | null>(null);
const forwardModalOpen = ref(false);
const riskReportOpen = ref(false);

const isTerminal = computed(() => ['closed', 'cancelled', 'settled'].includes(props.opState));
const isSuspended = computed(() => props.opState === 'suspended');
/**
 * 已转出：非诉转售后后的等待态。单子在售后手上，客服侧无可作为——
 * 底栏流转类动作全部锁定（含再次转售后：1:1 关联已占用），只留「保存」与「联系客户」。
 * 出态只由售后回传驱动，没有任何按钮能主动离开该态。
 */
const isTransferred = computed(() => props.opState === 'transferred');
const TRANSFERRED_LOCK_TIP = '工单已转出至售后，等待售后处理结果';

/** 本单的活跃关联售后单（hover 卡片内容） */
const linkedAftersale = computed(() => props.aftersaleContext?.existing);
/**
 * 激活形态（§5.1 第 2 / 3 行：售后转入的非诉单、回流单）：「转售后」位换成「激活售后单」，
 * 点开无表单二次确认，激活的是已关联的那张售后单。能不能激活由售后侧判，客服侧不预判、不置灰（§4.4）。
 */
const activatableAftersale = computed(() =>
  ((props.aftersaleForm?.shape === 'activate' || headerActivate.value) && linkedAftersale.value) || null,
);
/**
 * 页头「关联售后」位的激活形态（口径定稿 6d：④ 咨询单升级投诉而来的投诉单）也走这一个确认弹窗；
 * 投诉单底栏没有「转售后」位，故由页头经 `openActivate` 打开。
 */
const headerActivate = ref(false);

/** 委派中：单子交给协办人先处理，处理完回到本节点，期间锁定流转与终结类动作 */
const isDelegating = computed(() => !!props.delegateTargets);
/**
 * 委派中锁定：一切"把单子转出去或终结掉"的动作。
 * 「下送」不锁——在委派节点，下送=送到下一节点=回到委派节点（协办完成回送）。
 */
const DELEGATE_LOCKED: (OpActionType | '转单')[] = [
  '调剂', '关闭工单', '强结', '升级', '转售后', '转单', '退回', '挂起',
];
const DELEGATE_LOCK_TIP = '工单委派中，协办完成后可操作';

const actions = computed(() =>
  availableActions({
    ticketType: props.ticketType,
    closureMode: props.closureMode,
    isFlash: !!props.isFlash,
    // 小智单走单列的 XIAOZHI_ACTION_KEYS（1130 D16 / D18：不登记风险报备与转售后）
    isXiaozhi: !!props.isXiaozhi,
    // 刷机单按视角收一道（表一）；老工单不传，取值与改前一致
    ...(!!props.isFlash && props.flashView ? { flashView: props.flashView } : {}),
  }),
);

/**
 * 产品无售后服务 → 「转售后」**置灰 + 提示**，不是隐藏（基线 ※12）。
 * 该拦截维度是**工单数据**，不属于角色 / 状态 / 类型三维；隐藏会让坐席不知道为什么不能转，
 * 只能反复找入口。原实现在 availableActions 里把动作整个滤掉了，现改为在此呈现。
 */
const noAftersaleProduct = computed(() => !props.afterSaleEnabled);

/**
 * 「转售后」何时用 hover 卡片代替原生 title：形态判定给了卡片（本单有活跃关联）时。
 * 其余置灰原因（状态、产品无售后服务）没有卡片可弹，由 title 把提示带出来。
 */
function showsAftersaleCard(key: OpActionType | '转单'): boolean {
  return key === '转售后' && !!props.aftersaleForm?.card && !!linkedAftersale.value;
}

/** 「转售后」位按形态判定出一格（底栏冻结 / 委派 / 常态三条路径共用） */
function aftersaleBarItem(def: { key: OpActionType; icon: string; danger?: boolean }): BarItem {
  const f = props.aftersaleForm;
  if (!f) return { key: def.key, label: def.key, icon: def.icon, danger: def.danger };
  return {
    key: def.key,
    label: f.label,
    icon: def.icon,
    danger: def.danger,
    forbidden: !f.enabled,
    forbiddenTip: f.tip,
  };
}
const actionMap = computed(() => new Map(actions.value.map((a) => [a.key, a])));

interface BarItem {
  key: OpActionType | '转单';
  label: string;
  icon: string;
  danger?: boolean;
  /** 禁止操作示意（如无上一流转可撤回 / 已升级飞书） */
  forbidden?: boolean;
  forbiddenTip?: string;
}

/**
 * 撤回 = 撤销**本次下送**或**本次申请**，只有两种场景成立（基线 §2 ※2）：
 * 「调研中」撤销本次下送、「审核中」四态撤销本次申请（申请挂起 / 关闭 / 强结 / 业务动作审核中）。
 * 基线状态 × 动作表里其余 13 个状态的「撤回」列一律 🔒。
 *
 * 本页轻量态映射：调研中 → `resolved`、审核中四态 → `review`。
 *
 * 原先这里写的是「终态才可撤回、非终态一律置灰」——判据方向与基线相反，
 * 结果是唯一有意义的两个场景反而撤不了、而已结案的单却显示可撤。
 */
const withdrawBlocked = computed(
  () => !['review', 'resolved'].includes(props.opState),
);

const barActions = computed<BarItem[]>(() => {
  const items: BarItem[] = [];
  for (const key of BAR_ORDER) {
    // 已转出：整条底栏锁定（无逃生口——回来只能等售后转回）
    if (isTransferred.value) {
      const def = key === '转单' ? null : actionMap.value.get(key);
      if (key !== '转单' && !def) continue;
      // 刷机单不出「转单」（M25，任何角色、任何子状态）
      if (key === '转单' && props.isFlash) continue;
      if (key === '退回' && !props.atTechSupport) continue;
      // 报备形态只给本单主责处理人：不是主责处理人的，冻结态下也不展示
      // （底栏这一格只会是报备形态，判定已在 resolveRiskBarForm 收口）
      if (key === '风险报备' && !props.showRiskReport) continue;
      // 「转售后」取形态判定（§5.1 第 5 / 6 / 7 行：置灰 + hover 卡片），其余统一说明冻结原因
      if (key === '转售后' && def && props.aftersaleForm) {
        items.push(aftersaleBarItem(def));
        continue;
      }
      items.push({
        key,
        label: key === '挂起' ? '申请挂起' : (def?.label ?? '转单'),
        icon: def?.icon ?? 'SwapOutlined',
        danger: def?.danger,
        forbidden: true,
        forbiddenTip: TRANSFERRED_LOCK_TIP,
      });
      continue;
    }
    // 「转售后」位：形态与置灰一律取 §5.1 判定（委派中＝第 0 行「已委派」，同一句提示）
    if (key === '转售后' && props.aftersaleForm) {
      const def = actionMap.value.get(key);
      if (!def) continue;
      items.push(aftersaleBarItem(def));
      continue;
    }
    /**
     * 🔴 **小智单「已升级产研」态的四枚置灰**（1130 一·补 B5 / PRD §5.3 表二）：
     * 关闭工单 / 调剂 / 委派 / 转单 —— 产研还在办、提报人一次没确认，这期间
     * 既不许把单关掉、也不许把单交出去。放在委派锁之前判：两者都成立时这一句更贴本单处境。
     * 判据只认 `xiaozhiRdPending`（工单页按「是小智单 ∧ 子状态＝已升级产研」算），通用单不受影响。
     */
    if (props.xiaozhiRdPending && XIAOZHI_RD_PENDING_BLOCKED.includes(key)) {
      const def = key === '转单' ? null : actionMap.value.get(key);
      if (key !== '转单' && !def) continue;
      if (key === '转单' && !actionMap.value.has('转单')) continue;
      items.push({
        key,
        label: def?.label ?? '转单',
        icon: def?.icon ?? 'SwapOutlined',
        danger: def?.danger,
        forbidden: true,
        forbiddenTip: XIAOZHI_TIP.rdPendingConfirm,
      });
      continue;
    }
    // 委派中：锁定流转与终结类动作，置灰并说明原因
    if (isDelegating.value && DELEGATE_LOCKED.includes(key)) {
      const locked = key === '转单' ? null : actionMap.value.get(key);
      if (key !== '转单' && !locked) continue;
      if (key === '转单' && props.isFlash) continue;
      items.push({
        key,
        label: locked?.label ?? '转单',
        icon: locked?.icon ?? 'SwapOutlined',
        danger: locked?.danger,
        forbidden: true,
        forbiddenTip: DELEGATE_LOCK_TIP,
      });
      continue;
    }
    if (key === '转单') {
      // 转单也登记在 ACTION_DEFS 里（类型 × 结案方式两维都由 availableActions 判），
      // 只是它开的是建单弹窗、不走 OpActionDialogs，所以在这里单独 push，
      // 而不是从 actionMap 取 def —— 但可见性仍得问 actionMap，否则被滤掉了也照样出来。
      if (!actionMap.value.has('转单')) continue;
      items.push({ key: '转单', label: '转单', icon: 'SwapOutlined' });
      continue;
    }
    const def = actionMap.value.get(key);
    if (!def) continue;
    if (key === '风险报备' && !props.showRiskReport) continue;
    if (key === '风险报备' && props.riskReportPending) {
      items.push({
        key: def.key,
        label: def.label,
        icon: def.icon,
        forbidden: true,
        forbiddenTip: props.riskForbiddenTip || RISK_FORBIDDEN_FALLBACK,
      });
      continue;
    }
    // 退回=技术支持退回给工单处理人（唯一方向），仅技术支持持单时出现
    if (key === '退回' && !props.atTechSupport) continue;
    // 委派中：「委派」位切换为「撤销委派」——委派锁住了几乎所有动作，必须留逃生口
    if (key === '委派' && isDelegating.value) {
      items.push({ key: '撤销委派', label: '撤销委派', icon: 'UndoOutlined' });
      continue;
    }
    if (key === '撤回') {
      items.push({
        key: def.key,
        label: def.label,
        icon: def.icon,
        forbidden: withdrawBlocked.value,
        forbiddenTip: '当前无可撤回的操作',
      });
      continue;
    }
    if (key === '挂起') {
      // 未挂起→「申请挂起」（提交审批）；审批通过已挂起→「解除挂起」
      items.push(
        isSuspended.value
          ? { key: '恢复', label: '解除挂起', icon: 'PlayCircleOutlined' }
          : { key: '挂起', label: '申请挂起', icon: def.icon },
      );
      continue;
    }
    // 产品无售后服务：转售后置灰 + 提示（基线 ※12，先于"已有关联单"判——它是更根本的不可转）
    if (key === '转售后' && noAftersaleProduct.value) {
      items.push({
        key: def.key,
        label: def.label,
        icon: def.icon,
        forbidden: true,
        forbiddenTip: NO_AFTERSALE_TIP,
      });
      continue;
    }
    // 已升级飞书项目：升级置灰（催单/二次激活在「产研反馈」Tab）
    if (key === '升级' && feishuEscalateBlocked.value) {
      items.push({
        key: def.key,
        label: def.label,
        icon: def.icon,
        forbidden: true,
        forbiddenTip: escalatedTip.value,
      });
      continue;
    }
    items.push({ key: def.key, label: def.label, icon: def.icon, danger: def.danger });
  }
  return items;
});

/* ---------------- 刷机单底栏（930 教育刷机单 PRD §5.5 表一 × 表二） ---------------- */

/** 走刷机单底栏：一线 / 二线视角与可领取。客诉专员（other）仍走上面的原路径（只剩风险那一枚） */
const isFlashBar = computed(
  () => !!props.isFlash && (props.flashView === 'l1' || props.flashView === 'l2' || props.flashView === 'claim'),
);

/** 刷机单底栏顺序（1013 A15 / B2）：真源在 `flashGate.ts` 的 FLASH_L1 / L2 BAR_ORDER；与咨询单同一排平铺渲染 */
function flashItem(k: FlashBarKey): BarItem | null {
  const stage = props.flashStage ?? '处理中';
  const def = actionMap.value.get(k);
  if (!def) return null;
  // 风险报备限本单主责处理人（出现条件由工单页算）
  if (k === '风险报备' && !props.showRiskReport) return null;
  const gate = flashButtonGate(k, {
    view: props.flashView ?? 'l2',
    stage,
    isInitiator: !!props.flashIsInitiator,
    hasForwarder: props.flashHasForwarder,
    afterSaleEnabled: props.afterSaleEnabled,
  });
  let forbidden = gate.forbidden;
  let tip = gate.tip;
  if (!forbidden && k === '升级' && feishuEscalateBlocked.value) {
    forbidden = true;
    tip = escalatedTip.value;
  }
  if (!forbidden && k === '风险报备' && props.riskReportPending) {
    forbidden = true;
    tip = props.riskForbiddenTip || RISK_FORBIDDEN_FALLBACK;
  }
  if (!forbidden && k === '转售后' && props.aftersaleForm && !props.aftersaleForm.enabled) {
    forbidden = true;
    tip = props.aftersaleForm.tip;
  }
  let key: OpActionType = k;
  let icon = def.icon;
  if (k === '挂起' && stage === '已挂起') { key = '恢复'; icon = 'PlayCircleOutlined'; }
  if (k === '委派' && stage === '已委派') { key = '撤销委派'; icon = 'UndoOutlined'; }
  const label = flashBarLabel(k, stage);
  return { key, label, icon, danger: def.danger, forbidden, forbiddenTip: tip };
}

const flashPrimaryItems = computed<BarItem[]>(() => {
  const order = props.flashView === 'l1' ? FLASH_L1_BAR_ORDER : props.flashView === 'l2' ? FLASH_L2_BAR_ORDER : [];
  return order.map(flashItem).filter((x): x is BarItem => !!x);
});
const isFlashClaim = computed(() => !!props.isFlash && props.flashView === 'claim');
/**
 * 待领取态（两条路合一）：刷机单的 `claim` 视角，或工单页判定的通用可领取（`claimable`，小智单走它）。
 * 「领取」按钮出不出、「保存」置不置灰，都读这一个 —— 两处各判一次迟早分家。
 */
const isClaimPending = computed(() => isFlashClaim.value || !!props.claimable);

/**
 * 「升级」在已升级产研后置灰时的指路文案。
 *
 * 🔴 **小智单那一版不再指向「产研反馈」Tab 的任何入口**：二次激活整枚不渲染
 * （1130 一·补 B5：确认未解决由系统自动回传，不设坐席入口）、那枚催产研的催单也整枚不渲染
 * （一·补 B36）。两个入口都没了还照通用那句写，就是把人指到这张单上不存在的地方去。
 * 催单本身没取消 —— 走页头右上角那一枚，但那不是本提示该指的位置，故改为只说现状。
 * ⚠️ 通用单与刷机单仍用 `ESCALATED_TIP`，一字未动 —— 这句原先是**三处各写一份字面量**，
 * 收口成常量时顺手全量替换最容易误伤它们，故两份分开定名、按标识取。
 */
const ESCALATED_TIP = '已升级产研反馈，请在「产研反馈」Tab 催单或二次激活';
const ESCALATED_TIP_XIAOZHI = '已升级产研反馈，待产研回传后可再操作';
const escalatedTip = computed(() => (props.isXiaozhi ? ESCALATED_TIP_XIAOZHI : ESCALATED_TIP));
/** 客诉专员在刷机单上只读工单内容（M94 / M102）：底栏不出「保存」，只留风险那一枚 */
const hideFlashSave = computed(() => !!props.isFlash && props.flashView === 'other');

function saveDraft() {
  emit('action', { type: '保存草稿' });
}

function run(action: OpActionType | '转单') {
  if (isTerminal.value || isTransferred.value) return;


  if (action === '转单') {
    emit('transferTicket');
    return;
  }
  if (action === '取消工单') return emit('cancel');
  if (action === '撤销委派') {
    Modal.confirm({
      title: '撤销委派',
      content: `将撤销对 ${props.delegateTargets} 的委派，工单回到本节点并解锁流转与结案动作。确定撤销？`,
      okText: '确认撤销',
      cancelText: '取消',
      onOk: () => emit('action', { type: '撤销委派' }),
    });
    return;
  }
  if (isDelegating.value && DELEGATE_LOCKED.includes(action)) {
    message.warning(DELEGATE_LOCK_TIP);
    return;
  }
  if (action === '撤回') {
    // 刷机单撤回的可用与否已由门控逐格判定（限发起人，X30），不再按轻量态判
    if (isFlashBar.value) return emit('withdraw');
    if (withdrawBlocked.value) {
      message.warning('当前无可撤回的操作');
      return;
    }
    return emit('withdraw');
  }
  if (action === '升级' && feishuEscalateBlocked.value) {
    message.warning(escalatedTip.value);
    return;
  }
  if (action === '挂起' && isSuspended.value) return;
  if (action === '恢复' && !isSuspended.value) {
    Modal.info({ title: '提示', content: '当前工单未处于挂起状态' });
    return;
  }
  if (action === '退回') {
    if ((props.returnCount ?? 0) >= MAX_RETURN_COUNT) {
      message.warning(`本工单已退回 ${MAX_RETURN_COUNT} 次，已达上限`);
      return;
    }
  }
  if (action === '下送') {
    // 委派中：下送=协办完成、回到委派节点，不结案、不校验必填
    if (isDelegating.value) {
      forwardModalOpen.value = true;
      return;
    }
    // 刷机单一线：按刷机处理结论判（PRD §5.4），不校验问题原因；已在二线的按咨询单校验（1014）
    if (props.isFlash && !props.flashConsultForward) {
      if (props.flashForwardTip) {
        message.warning(props.flashForwardTip);
        emit('flashForwardBlocked', props.flashForwardTip);
        return;
      }
      if (props.flashForwardEscalate) return emit('flashEscalate');
      forwardModalOpen.value = true;
      return;
    }
    // 下送=正常结案，需先在处理表单填齐问题原因/处理结果（815 定稿：下送需验证必填字段）
    if (!props.problemCause?.trim()) {
      message.warning('请先在处理表单填写「问题原因」后再下送');
      return;
    }
    if (!props.processResult?.trim()) {
      message.warning('请先在处理表单填写「处理结果」后再下送');
      return;
    }
    forwardModalOpen.value = true;
    return;
  }
  // 「转售后」位：置灰形态的键盘 / 程序调用兜底给同一句；激活形态走确认弹窗，不进建单表单
  if (action === '转售后' && props.aftersaleForm && !props.aftersaleForm.enabled) {
    const f = props.aftersaleForm;
    message.warning(f.tip ?? f.cardFoot ?? NO_AFTERSALE_TIP);
    return;
  }
  if (action === '转售后' && noAftersaleProduct.value && !activatableAftersale.value) {
    message.warning(NO_AFTERSALE_TIP);
    return;
  }
  if (action === '转售后' && activatableAftersale.value) {
    activateError.value = '';
    activateOpen.value = true;
    return;
  }
  if (action === '风险报备') {
    if (!props.showRiskReport) return;
    if (props.riskReportPending) {
      // 键盘 / 程序调用的兜底走**同一句**提示：两处不同文案会让人以为是两回事
      message.warning(props.riskForbiddenTip || RISK_FORBIDDEN_FALLBACK);
      return;
    }
    riskReportOpen.value = true;
    return;
  }
  if (DIALOG_ACTIONS.includes(action)) {
    dialogAction.value = action;
    dialogOpen.value = true;
  }
}

/* ---------------- 激活售后单（售后转入的非诉单 / 回流单，§4.4） ---------------- */

const activateOpen = ref(false);
const activateLoading = ref(false);
/** 激活失败原因：弹窗不关、红字原样透出售后侧返回，不降级为新建售后单 */
const activateError = ref('');

async function onActivateConfirm() {
  const as = activatableAftersale.value;
  if (!as || activateLoading.value) return;
  activateLoading.value = true;
  activateError.value = '';
  const res = await activateAftersaleTicket({ no: as.no, ticketNo: props.ticketNo, slot: as.slot });
  activateLoading.value = false;
  if (!res.ok) {
    activateError.value = `售后工单 ${as.no} 激活失败：${res.error ?? ''}`;
    return;
  }
  activateOpen.value = false;
  // 成功提示由 applyOpAction 的返回消息统一弹，此处不重复
  emit('action', {
    type: '激活售后',
    data: { no: as.no, title: as.title, status: res.status ?? '待接单' },
  });
}

function onDialogConfirm(payload: Record<string, unknown>) {
  emit('action', payload);
}

function onForwardConfirm(data: { ticketTitle: string }) {
  emit('action', { type: '下送', data: { ...data, backToDelegator: isDelegating.value } });
}

/** 产研反馈 Tab「重新发起」：打开升级弹窗 */
function openEscalate() {
  if (isTerminal.value || isTransferred.value) return;
  dialogAction.value = '升级';
  dialogOpen.value = true;
}

/**
 * 投诉单「关联售后」入口：打开售后建单弹窗，提交走独立动作「关联售后」（1025，不再复用转售后）。
 * 已有 1:1 关联时不弹窗——未结案点开工单号去售后系统操作、已结案线下联系售后（D2 改写）。
 */
function openAftersale() {
  // 投诉单终态仍可关联售后（§2.1 状态维「展示」列含已结案等，基线 ※7）
  if (isTransferred.value) return;
  // 已有活跃关联时按钮已置灰（§5.1 第 5 / 6 行），不建第二张
  if (linkedAftersale.value) return;
  dialogAction.value = '关联售后';
  dialogOpen.value = true;
}

/** 页头「关联售后」位的激活形态：打开同一个激活确认 */
function openActivate() {
  if (!linkedAftersale.value) return;
  headerActivate.value = true;
  activateError.value = '';
  activateOpen.value = true;
}

defineExpose({ openEscalate, openAftersale, openActivate });
</script>

<template>
  <div v-if="!hideBar" class="op-actionbar" :class="{ disabled: isTerminal && !saveOnly }">
    <div class="bottom-actions">
      <!-- 待领取（刷机单 / 小智单未认领）：底栏只出「领取」，不出「保存」（用户 10-19） -->
      <button
        v-if="!hideFlashSave && !isClaimPending"
        type="button"
        class="ab-item ab-save"
        :disabled="isTerminal && !saveOnly"
        @click="saveDraft"
      >
        <SaveOutlined />
        <span>保存</span>
        <span v-if="draftSavedAt" class="save-hint">已保存 {{ draftSavedAt }}</span>
      </button>

      <!--
        「转售后」在已有关联售后单时不可点，改为 hover 出售后单卡片：
        状态一眼可见，工单地址可点直接跳售后系统操作（其余按钮无卡片，trigger 置空）
      -->
      <a-popover
        v-for="a in (saveOnly || isClaimPending ? [] : (isFlashBar ? flashPrimaryItems : barActions))"
        :key="a.key"
        :trigger="showsAftersaleCard(a.key) ? 'hover' : []"
        placement="top"
      >
        <template #content>
          <OpAftersaleLinkCard
            v-if="linkedAftersale"
            :no="linkedAftersale.no"
            :status="linkedAftersale.status"
            :service-type="linkedAftersale.serviceType"
            :foot="aftersaleForm?.cardFoot ?? null"
            :held-slot="linkedAftersale.slot"
            :peer="linkedAftersale.peer"
          />
        </template>
        <span class="ab-slot">
          <button
            type="button"
            class="ab-item"
            :class="{
              danger: a.danger,
              resume: a.key === '恢复',
              forbidden: a.forbidden,
            }"
            :disabled="isTerminal || a.forbidden"
            :title="a.forbidden && !showsAftersaleCard(a.key) ? a.forbiddenTip : undefined"
            @click="run(a.key)"
          >
            <span v-if="a.forbidden" class="forbidden-mark" aria-hidden="true">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <line x1="4" y1="4" x2="96" y2="96" />
                <line x1="96" y1="4" x2="4" y2="96" />
              </svg>
            </span>
            <component :is="ICONS[a.icon]" />
            <span>{{ a.label }}</span>
          </button>
        </span>
      </a-popover>

      <!-- 领取：刷机 claim 视角 + 通用可领取（小智单走后者，1130 PRD §1.2 / §5.3 / §6） -->
      <button v-if="isClaimPending && !saveOnly" type="button" class="ab-item ab-claim" @click="emit('claim')">
        <span>领取</span>
      </button>
    </div>
  </div>

  <!-- 弹窗挂在操作栏之外：隐藏操作栏（一线视角）时，头部按钮触发的弹窗仍可用 -->
  <OpActionDialogs
    v-model:open="dialogOpen"
    :action="dialogAction"
    :ticket-no="ticketNo"
    :suspend-info="suspendInfo"
    :return-count="returnCount ?? 0"
    :feishu-eligible="feishuEligible"
    :feishu-sync="feishuSync"
    :aftersale-context="aftersaleContext"
    :service-type="serviceType"
    :service-method="serviceMethod"
    :group-names="groupNames"
    :group-id="groupId"
    :last-handler="lastHandler"
    :is-xiaozhi="isXiaozhi"
    :is-flash="isFlash"
    :frontline-account="frontlineAccount"
    @confirm="onDialogConfirm"
  />

  <OpForwardModal
    v-model:open="forwardModalOpen"
    :ticket-no="ticketNo"
    :ticket-title="ticketTitle"
    :back-to-delegator="isDelegating"
    :delegate-targets="delegateTargets"
    :ok-text="isFlash && !isDelegating ? flashForwardOkText : undefined"
    @confirm="onForwardConfirm"
  />

  <OpAftersaleActivateModal
    v-if="activatableAftersale"
    v-model:open="activateOpen"
    :no="activatableAftersale.no"
    :title="activatableAftersale.title"
    :loading="activateLoading"
    :error="activateError"
    @confirm="onActivateConfirm"
  />

  <OpRiskReportModal
    v-model:open="riskReportOpen"
    :ticket-no="ticketNo"
    :ticket-title="ticketTitle"
    @submit="(p) => emit('riskReport', p)"
  />
</template>

<style scoped>
.op-actionbar {
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 57px;
  padding: 10px 20px;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  box-shadow: 0 -4px 16px rgba(15, 23, 42, 0.06);
}

.op-actionbar.disabled {
  opacity: 0.72;
}

.bottom-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 5px 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.08);
}

/* popover 需要一个能接鼠标事件的宿主——disabled 按钮本身不触发 hover */
.ab-slot { display: inline-flex; }

.ab-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: background 0.12s, color 0.12s;
}

.ab-item :deep(.anticon) {
  font-size: 16px;
  color: #4b5563;
}

.ab-item:hover:not(:disabled) {
  background: #f3f4f6;
  color: #1a6fff;
}

.ab-item:hover:not(:disabled) :deep(.anticon) {
  color: #1a6fff;
}

.ab-item:disabled {
  cursor: not-allowed;
}

.ab-item.forbidden {
  position: relative;
  color: #9ca3af;
  opacity: 0.72;
  background: #f9fafb;
}

.ab-item.forbidden :deep(.anticon) {
  color: #9ca3af;
}

.ab-item.forbidden .forbidden-mark {
  --forbidden-stroke: #d1d5db;
  position: absolute;
  inset: 6px 8px;
  border: 1.5px solid var(--forbidden-stroke);
  border-radius: 6px;
  pointer-events: none;
  z-index: 1;
}

.ab-item.forbidden .forbidden-mark svg {
  display: block;
  width: 100%;
  height: 100%;
}

.ab-item.forbidden .forbidden-mark line {
  stroke: var(--forbidden-stroke);
  stroke-width: 1.5;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.ab-item:disabled:not(.forbidden) {
  opacity: 0.45;
}

.ab-item.ab-save {
  color: #1a6fff;
  font-weight: 600;
}

.ab-item.ab-save :deep(.anticon) {
  color: #1a6fff;
}

.ab-item.ab-save.forbidden,
.ab-item.ab-save.forbidden :deep(.anticon) {
  color: #9ca3af;
}

.ab-item.ab-claim {
  color: #fff;
  background: #1a6fff;
  font-weight: 600;
}

.ab-item.ab-claim:hover:not(:disabled) {
  color: #fff;
  background: #1558d6;
}

.save-hint {
  font-size: 11px;
  font-weight: 500;
  color: #10b981;
}

.ab-item.danger {
  color: #dc2626;
}

.ab-item.danger :deep(.anticon) {
  color: #dc2626;
}

.ab-item.danger:hover:not(:disabled) {
  background: #fef2f2;
  color: #b91c1c;
}

.ab-item.danger:hover:not(:disabled) :deep(.anticon) {
  color: #b91c1c;
}

.ab-item.resume {
  color: #059669;
}

.ab-item.resume :deep(.anticon) {
  color: #059669;
}

.ab-item.resume:hover:not(:disabled) {
  background: #ecfdf5;
  color: #047857;
}

.ab-item.resume:hover:not(:disabled) :deep(.anticon) {
  color: #047857;
}
</style>
