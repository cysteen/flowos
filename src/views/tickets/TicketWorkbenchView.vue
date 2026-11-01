<script setup lang="ts">
import { isFlashTicket } from '@/views/tickets/types/flash';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { UserSwitchOutlined } from '@ant-design/icons-vue';
import { useUserStore } from '@/stores/user';
import TicketTabs from './components/TicketTabs.vue';
import RiskReportPoolPanel from './components/RiskReportPoolPanel.vue';
import { TICKET_LIST_COLUMN_KEYS } from '@/views/tickets/composables/ticketListColumnCatalog';
import { useFlashStore } from '@/stores/flash';
import {
  FLASH_POOL_TAB,
  isPoolFamily,
  isTicketTab,
  RISK_REPORT_TAB,
  visiblePoolGroupsFor,
  canAssignTicket,
  canTransferTicket,
  isTransferredOut,
  TRANSFERRED_OUT_TRANSFER_TIP,
  TRANSFERRED_OUT_BATCH_TRANSFER_TIP,
  currentHandlerName,
  isCurrentHandler,
  resolveTicketGroupNames,
  type WorkbenchTabKey,
} from '@/views/tickets/types/ticket';
import { FLASH_POOL_TAB_ROLES, XIAOZHI_CREATE_ROLES } from '@/config/roles';
import { flashFailCellText, flashHandoffCellText } from './utils/flashPoolCells';
import { useRiskReportStore } from '@/stores/riskReports';
import AiSuggestionBar from './components/AiSuggestionBar.vue';
import AiSuggestionDrawer from './components/AiSuggestionDrawer.vue';
import type { AiSuggestion, AiSuggestionFilter } from './types/aiSuggestion';
import TicketFilterBar from './components/TicketFilterBar.vue';
import TicketMineQueryBar from './components/TicketMineQueryBar.vue';
import TicketToolbar from './components/TicketToolbar.vue';
import TicketRichList from './components/TicketRichList.vue';
import TicketDraftList from './components/TicketDraftList.vue';
import CreateTicketModal from './components/CreateTicketModal.vue';
import SaveFilterModal from './components/SaveFilterModal.vue';
import OpActionDialogs from './components/OpActionDialogs.vue';
import OpActionModal from './components/operation/OpActionModal.vue';
import AssignModal, {
  type AssignSubmitPayload,
  type AssignTicket,
} from '@/views/team-board/components/AssignModal.vue';
import { TEAM_MEMBERS } from '@/mock/teamBoard';
import DispatchAssignModal from '@/views/team-board/components/DispatchAssignModal.vue';
import { useDispatchStore } from '@/stores/dispatch';
import { DISPATCH_STATUSES } from './types/dispatch';
import {
  DISPATCH_STATUS_STYLE, MODE_TAG_STYLE, claimDisabledTip, modeTagOf, reserveTipOf, waitMinutesOf, waitText,
} from './composables/dispatchUi';
import { useTicketWorkbench } from './composables/useTicketWorkbench';
import { poolEntryQuery } from './composables/poolClaim';
import { useTicketColumns } from './composables/useTicketColumns';
import { useMineQueryFields } from './composables/useMineQueryFields';
import { hasMineQuery } from './types/mineQuery';
import type { OpActionType, ReturnPayload, TransferPayload } from './composables/opActions';
import { MAX_RETURN_COUNT } from './composables/opActions';
import type { CreateTicketPrefill, Ticket } from './types/ticket';

const user = useUserStore();
const router = useRouter();
const route = useRoute();
const wb = useTicketWorkbench();
const flashStore = useFlashStore();
const headerTabCounts = wb.headerTabCounts;
const riskReports = useRiskReportStore();

/**
 * 风险报备池页签。
 *
 * 【为什么它的选中态另存一个 ref，而不是并进 `wb.activeTab`】工作台那套取数
 * （`tabRows` / `tabCounts` / 结构化筛选）整个是围绕**工单**建的，键是 `TabKey`；
 * 报备池装的是**报备单**，喂不进去，也不该让 `TabKey` 多出一个工单永远落不到的值
 * （见 types/ticket.ts 的 `WorkbenchTabKey`）。故页签栏的选中态在这里合成：
 * 报备池开着就是它，否则跟着工单页签走。
 */
const riskReportTabActive = ref(false);

/**
 * 「刷机池」页签（930 教育刷机单 §9.2）：只对一线坐席渲染。与报备池同形，选中态另存、
 * 与隐藏页签取交集；隐藏页签＝角色 hiddenTabs ＋ 非 `FLASH_POOL_TAB_ROLES` 角色的「刷机池」。
 */
const flashPoolTabActive = ref(false);
const workbenchHiddenTabs = computed(() =>
  FLASH_POOL_TAB_ROLES.includes(user.roleKey)
    ? user.hiddenTabs
    : [...user.hiddenTabs, FLASH_POOL_TAB],
);
const flashPoolTabOpen = computed(
  () => flashPoolTabActive.value && !workbenchHiddenTabs.value.includes(FLASH_POOL_TAB),
);
/**
 * 🔴 **选中态要与 `hiddenTabs` 取交集**（2026-09-11 D-23 同类缺口）：
 * 顶栏「切换演示角色」**不重挂本页**（AppHeader 的 `afterContextChange` 只在新角色
 * 连 `tickets` 菜单都没有时才跳走），故报备池开着时切到一个看不到这枚页签的角色，
 * `riskReportTabActive` 仍是 true —— 页签栏上已经没有「风险报备池」，正文却还开着，
 * 报备人 / 风险类型 / 风险描述全文一览无余。渲染条件读这个合成值而不是裸 ref。
 */
const riskReportTabOpen = computed(
  () => riskReportTabActive.value && !user.hiddenTabs.includes(RISK_REPORT_TAB),
);
const activeWorkbenchTab = computed<WorkbenchTabKey>(() => {
  if (riskReportTabOpen.value) return RISK_REPORT_TAB;
  if (flashPoolTabOpen.value) return FLASH_POOL_TAB;
  return wb.activeTab.value;
});

/**
 * 报备池的徽章数 ＝ **在队**（待领取 + 评估中）条数。
 * 不数已评估 / 已撤回：徽章要答的是"还有多少活等着人",那两档活已经完了。
 */
const riskReportOpenCount = computed(
  () => riskReports.reports.filter((r) => r.status === '待分派' || r.status === '评估中').length,
);
const workbenchTabCounts = computed<Record<string, number>>(() => ({
  ...headerTabCounts.value,
  [RISK_REPORT_TAB]: riskReportOpenCount.value,
  [FLASH_POOL_TAB]: wb.flashPoolRows.value.length,
}));

function onTabChange(tab: WorkbenchTabKey) {
  // 与 Tab 条同一道门控：`hiddenTabs` 里有它就不认这次切换（TicketTabs 本就不渲染该枚，
  // 这里再挡一道是为了让"选中态"与"渲不渲染"永远是同一个答案）
  if (workbenchHiddenTabs.value.includes(tab)) return;
  riskReportTabActive.value = tab === RISK_REPORT_TAB;
  flashPoolTabActive.value = tab === FLASH_POOL_TAB;
  if (isTicketTab(tab)) wb.setTab(tab);
}

/**
 * `?tab=flashPool` 直达「刷机池」页签：容联云工作台「刷机池」入口新开页签嵌入的落点（1130 刷机册附录 A.3）。
 * 走 onTabChange，同一道 hiddenTabs 门控：看不到该页签的角色带此参数也不打开。
 */
watch(
  () => [route.query.tab, user.roleKey] as const,
  ([tab]) => {
    if (tab === FLASH_POOL_TAB) onTabChange(FLASH_POOL_TAB);
  },
  { immediate: true },
);

/** 我的任务 ·「已挂起」追加列 */
const SUSPEND_EXTRA_COLUMNS = [
  { key: 'suspendedAt', label: '申请挂起时间', width: 128, after: 'node' },
  { key: 'suspendResumeAt', label: '预期解挂时间', width: 128, after: 'node' },
];

/**
 * 工单池 · 教育刷机处理组池的两列（§9.3）：当前角色看得到教育刷机处理组时追加
 * 「转人工原因」「失败原因」，非刷机单显示「—」。
 */
const POOL_FLASH_EXTRA_COLUMNS = [
  { key: 'flashHandoff', label: '转人工原因', width: 120 },
  { key: 'flashFail', label: '失败原因', width: 160 },
];
const showPoolFlashColumns = computed(
  () => wb.isPoolTab.value && visiblePoolGroupsFor(user.roleKey).some((g) => g.id === 'edu-flash'),
);

/* —— 【1215】工单池 · 派单（PRD 第 10 章）—— */
const dispatch = useDispatchStore();
/** 派单状态、匹配我、所在池、等待时长四列 */
const POOL_DISPATCH_COLUMNS = [
  { key: 'dispatchStatus', label: '派单状态', width: 112, after: 'priority' },
  { key: 'dispatchMatch', label: '匹配我', width: 76, after: 'priority' },
  { key: 'dispatchPool', label: '所在池', width: 140, after: 'sla' },
  { key: 'dispatchWait', label: '等待时长', width: 104, after: 'sla' },
];
const listExtraColumns = computed(() => {
  if (wb.showSuspendColumns.value) return SUSPEND_EXTRA_COLUMNS;
  if (wb.isPoolTab.value) {
    return showPoolFlashColumns.value ? [...POOL_DISPATCH_COLUMNS, ...POOL_FLASH_EXTRA_COLUMNS] : POOL_DISPATCH_COLUMNS;
  }
  return undefined;
});

/** 分钟级时钟：等待时长按分钟走 */
const nowMs = ref(Date.now());
const nowTimer = window.setInterval(() => { nowMs.value = Date.now(); }, 30_000);
onBeforeUnmount(() => window.clearInterval(nowTimer));

/** 本人在派单中的画像是否已配置（未配置时「匹配我」置灰，10.1） */
const myProfileConfigured = computed(() => !!dispatch.agentOf(user.name) && !!dispatch.agentView(user.name)?.profileConfigured);
function dispatchStatusCell(t: Ticket) {
  return dispatch.dispatchStatusOf(t.no);
}
function matchesMeCell(t: Ticket): boolean {
  return myProfileConfigured.value && dispatch.matchesMe(t, user.name);
}

/** 池分段（10.1）：本人可见的各组池「〈组名〉池 · 〈N〉 张」，降级 / 停派另标；点选即按组池筛选 */
const poolSegments = computed(() => {
  void dispatch.groups;
  void dispatch.config;
  const ids = wb.poolGroups.value.map((g) => g.id).filter((id) => dispatch.isDispatchPool(id));
  return ids.map((id) => ({
    id,
    label: dispatch.poolLabel(id),
    count: wb.tabRows.value.filter((t) => t.groupId === id).length,
    tag: modeTagOf(dispatch.effectiveModeOf(id)),
  }));
});
function togglePoolSegment(id: string) {
  const cur = wb.poolDispatchFilter.value.pools;
  wb.setPoolDispatchFilter({ pools: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
}
const dispatchStatusOptions = DISPATCH_STATUSES.map((s) => ({ value: s, label: s }));
const poolFilterOptions = computed(() => poolSegments.value.map((p) => ({ value: p.id, label: p.label })));

/** 工单池行内：「领取」未签入置灰（10.2）；班组长等另有「指派」 */
function poolRowActionsDispatch(): { label: string; primary?: boolean; disabled?: boolean; tip?: string }[] {
  const tip = claimDisabledTip(user.name);
  const acts: { label: string; primary?: boolean; disabled?: boolean; tip?: string }[] = [
    tip ? { label: '领取', primary: true, disabled: true, tip } : { label: '领取', primary: true },
  ];
  if (canAssign.value) acts.push({ label: '指派' });
  return acts;
}

/** 领取刷机单：刷机服务落状态与履历，Toast「已领取 〈单号〉」；已被他人领取时提示领取人（§9.2 / §9.3） */
function claimFlash(t: Ticket) {
  const res = wb.claimFlashTicket(t.id);
  if (res.ok) message.success(res.message);
  else if (res.message) message.warning(res.message);
}

/** 刷机池 · 固定列（§9.2），与独立页签列表共用同一套工具行 / 表格壳 */
const FLASH_POOL_HIDDEN_COLUMNS = Object.fromEntries(TICKET_LIST_COLUMN_KEYS.map((k) => [k, false]));
const FLASH_POOL_EXTRA_COLUMNS = [
  { key: 'flashHandoff', label: '转人工原因', width: 120 },
  { key: 'flashFail', label: '失败原因', width: 230 },
  { key: 'flashModel', label: '产品名称', width: 210 },
  { key: 'flashPoolAt', label: '进池时间', width: 160 },
];
const FLASH_POOL_COLUMN_WIDTHS = { title: 380, action: 96 };
const FLASH_POOL_COLUMN_WIDTHS_KEY = 'flowos-flash-pool-column-widths';

const flashSearch = ref('');
const flashSelectedIds = ref(new Set<string>());

const flashPoolFiltered = computed(() => {
  const kw = flashSearch.value.trim().toLowerCase();
  const rows = wb.flashPoolRows.value;
  if (!kw) return rows;
  return rows.filter(
    (t) => t.no.toLowerCase().includes(kw) || (t.customerPhone ?? '').toLowerCase().includes(kw),
  );
});

const flashSelectedCount = computed(() => flashSelectedIds.value.size);

const flashAllPageSelected = computed(() => {
  const rows = flashPoolFiltered.value;
  if (!rows.length) return false;
  return rows.every((t) => flashSelectedIds.value.has(t.id));
});

function clearFlashSelection() {
  flashSelectedIds.value = new Set();
}

function toggleFlashSelect(id: string) {
  const next = new Set(flashSelectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  flashSelectedIds.value = next;
}

function toggleFlashSelectAllOnPage() {
  const rows = flashPoolFiltered.value;
  const next = new Set(flashSelectedIds.value);
  if (flashAllPageSelected.value) rows.forEach((t) => next.delete(t.id));
  else rows.forEach((t) => next.add(t.id));
  flashSelectedIds.value = next;
}

function flashPoolRowActions() {
  return [{ label: '领取', primary: true }];
}

function onToolbarSearch(v: string) {
  if (flashPoolTabOpen.value) flashSearch.value = v;
  else wb.setSearch(v);
}

const toolbarSearch = computed(() =>
  flashPoolTabOpen.value ? flashSearch.value : wb.searchText.value,
);
const toolbarSelectedCount = computed(() =>
  flashPoolTabOpen.value ? flashSelectedCount.value : wb.selectedCount.value,
);
const toolbarShowBatch = computed(
  () => flashPoolTabOpen.value || showBatchToolbar.value,
);
const toolbarBatchActions = computed(() =>
  flashPoolTabOpen.value ? ['领取'] : batchActions.value,
);

watch(flashPoolTabOpen, (open) => {
  if (open) {
    wb.clearSelection();
    clearFlashSelection();
  } else {
    flashSearch.value = '';
    clearFlashSelection();
  }
});

/** 报备池行内点工单号：与列表点单号同一个去处（工单操作页） */
function openTicketByNo(no: string) {
  router.push(`/tickets/${no}`);
}
const { optionalVisible, applyOptionalVisible } = useMineQueryFields();
const {
  visibleColumns,
  columnOrder,
  setColumnVisible,
  reorderColumn,
  resetColumns,
} = useTicketColumns();
const createOpen = ref(false);
/** 建单弹窗预填：小智入口置 `xiaozhiScene`，通用入口为 null */
const createPrefill = ref<CreateTicketPrefill | null>(null);
/** 「新建小智工单」只对小智坐席渲染（1130 D3 / W7：技能组判身份在容联云侧） */
const canCreateXiaozhi = computed(() => XIAOZHI_CREATE_ROLES.includes(user.roleKey));
const aiDrawerOpen = ref(false);
const aiDrawerFilter = ref<AiSuggestionFilter>('all');
const saveFilterModalOpen = ref(false);
/** 我的任务 / 已办 · 结构化筛选面板默认收起 */
const structuredFilterExpanded = ref(false);

const opDialogOpen = ref(false);
const opDialogAction = ref<OpActionType | null>(null);
const opTargetTickets = ref<Ticket[]>([]);

const opDialogTicketNo = computed(() => {
  const list = opTargetTickets.value;
  if (list.length === 1) return list[0].no;
  if (list.length > 1) return `已选 ${list.length} 单`;
  return '';
});

const opReturnCount = computed(() => {
  if (!opTargetTickets.value.length) return 0;
  return Math.max(...opTargetTickets.value.map((t) => t.returnCount ?? 0));
});

function openOpDialog(action: '调剂' | '退回', tickets: Ticket[]) {
  if (!tickets.length) {
    message.info(`请先选择要${action}的工单`);
    return;
  }
  if (action === '退回') {
    const blocked = tickets.some((t) => (t.returnCount ?? 0) >= MAX_RETURN_COUNT);
    if (blocked) {
      message.warning(`所选工单中有已达退回上限（${MAX_RETURN_COUNT} 次）的单据`);
      return;
    }
  }
  opTargetTickets.value = tickets;
  opDialogAction.value = action;
  opDialogOpen.value = true;
}

function onOpDialogConfirm(payload: Record<string, unknown>) {
  const tickets = opTargetTickets.value;
  const type = payload.type as string;

  if (type === '调剂') {
    const { target } = payload.data as TransferPayload;
    const name = target.split(' ')[0];
    for (const t of tickets) {
      t.assignee = name;
      t.myTransferAction = true;
    }
    const label = tickets.length === 1 ? tickets[0].no : `${tickets.length} 单`;
    message.success(tickets.length === 1 ? `已调剂至 ${name}` : `已对 ${label} 调剂至 ${name}`);
  } else if (type === '退回') {
    for (const t of tickets) {
      t.returnCount = (t.returnCount ?? 0) + 1;
      t.hasReturnAction = true;
      t.nodeStatus = '未认领';
    }
    const label = tickets.length === 1 ? tickets[0].no : `${tickets.length} 单`;
    // 退回的目标节点由流程配置决定、前端拿不到（ReturnPayload 只有 reason / note）——
    // 原先文案取 payload.data.targetNode，那个字段不存在，实际显示成"已退回至 undefined 节点"。
    // 这里按代码的实际行为写：退回后 nodeStatus 置「未认领」，即回到工单池。
    message.success(
      tickets.length === 1 ? '已退回，工单回到未认领' : `已对 ${label} 退回，工单回到未认领`,
    );
  }

  wb.clearSelection();
  opTargetTickets.value = [];
}

const isPoolFamilyTab = computed(() => isPoolFamily(wb.activeTab.value));
/** 催补待回：行内只出「领取」「调剂」，不设勾选与批量领取（PRD-02 §7⑤-B） */
const isPoolPendingTab = computed(() => wb.activeTab.value === 'poolPending');
const batchActions = computed(() => {
  // 工单池单次只领 1 张、不设勾选与批量领取（【1215】10.2）
  if (isPoolFamilyTab.value) return [];
  return wb.isMineTab.value ? ['调剂', '退回'] : [];
});
/** 批量调剂：所选工单含已转出单时置灰并悬停提示；不含时照常 */
const batchDisabledTips = computed<Record<string, string>>(() => {
  const tips: Record<string, string> = {};
  if (!wb.isMineTab.value) return tips;
  const hasOut = [...wb.selectedIds.value].some((id) => {
    const t = wb.ticketById(id);
    return !!t && isTransferredOut(t);
  });
  if (hasOut) tips['调剂'] = TRANSFERRED_OUT_BATCH_TRANSFER_TIP;
  return tips;
});
const showBatchToolbar = computed(() => wb.isMineTab.value);
const structuredFilterVariant = computed<'done' | 'pool' | 'mine'>(() => {
  if (wb.isDoneTab.value) return 'done';
  if (isPoolFamilyTab.value) return 'pool';
  return 'mine';
});

watch(
  () => wb.activeTab.value,
  () => {
    structuredFilterExpanded.value = false;
    wb.setSearch('');
  },
);

// —— 草稿 ——（非「我的任务」Tab 下「草稿」chip 选中时渲染草稿列表）
const editingDraftId = ref<string | null>(null);
const isDraftView = computed(() => wb.isDraftView.value);
function openCreate() { editingDraftId.value = null; createPrefill.value = null; createOpen.value = true; }
/**
 * 「新建小智工单」（1130 小智工单 D3；按钮名照一·补 B22）：与通用「新建工单」两枚并存。
 * 入口置位 `xiaozhiScene`，建单弹窗据此切小智表单（工单类型锁咨询、业务类型锁教育、来源锁 IM）。
 * 按技能组判身份是容联云 / UAP 侧的事（W7），这里只落结果 —— 入口对哪些角色渲染见 `XIAOZHI_CREATE_ROLES`。
 */
function openCreateXiaozhi() {
  editingDraftId.value = null;
  createPrefill.value = { xiaozhiScene: true };
  createOpen.value = true;
}
function editDraft(id: string) { editingDraftId.value = id; createOpen.value = true; }
function removeDraft(id: string) { wb.removeDraft(id); message.success('草稿已删除'); }

/**
 * 打开工单处理页。从「工单池」页签打开的带工单池入口标记，处理页据此自动领取（用户 10-19，不分工单类型）；
 * 「刷机池」页签与其余页签不带，按原样打开。
 */
function openOperation(t: Ticket) {
  const fromPool = activeWorkbenchTab.value === 'pool';
  router.push(fromPool ? { path: `/tickets/${t.no}`, query: poolEntryQuery() } : `/tickets/${t.no}`);
}

/*
 * —— 指派（动作矩阵 §G4.5 d）——
 * 班组长 / 投诉督导 / 管理员可跳过领取，把池中「待受理」单直接指给人。
 * 位置在**工作台列表行与批量工具条**，不在处理页底栏 —— 待受理单的处理页是只读的。
 * 弹窗直接复用班组看板那只 `AssignModal`（它本就是 B6 调剂的批量壳），不另画一个。
 */
const canAssign = computed(() => canAssignTicket(user.roleKey));
/**
 * 【1215】指派（9.3）：单张指派给归属本组池的本组成员，跨组走调剂；
 * 弹窗与班组看板池视图共用 `DispatchAssignModal`。
 */
const assignOpen = ref(false);
const assignTicket = ref<Ticket | null>(null);
const assignGroupId = computed(() => {
  const t = assignTicket.value;
  if (!t) return null;
  return dispatch.ticketStates[t.no]?.poolId ?? (dispatch.isDispatchPool(t.groupId) ? t.groupId! : null);
});

function openAssign(t: Ticket) {
  const st = dispatch.ticketStates[t.no];
  const gid = st?.poolId ?? t.groupId;
  if (!gid || !dispatch.isDispatchPool(gid)) {
    // 不进入派单的组池（一线客服组等）保持现行指派
    openLegacyAssign([t.id]);
    return;
  }
  assignTicket.value = t;
  assignOpen.value = true;
}

/* 现行指派弹窗：只用于不进入派单的组池 */
const legacyAssignOpen = ref(false);
const legacyAssignPreselect = ref<string[]>([]);
const legacyAssignRef = ref<InstanceType<typeof AssignModal> | null>(null);
const legacyAssignTickets = computed<AssignTicket[]>(() =>
  wb.sorted.value
    .filter((t) => t.tab === 'pool' && t.assignee === null && !dispatch.isDispatchPool(t.groupId))
    .map((t) => ({
      id: t.id,
      no: t.no,
      customer: t.customer,
      type: t.type,
      priority: t.priority,
      slaLeftMin: t.slaMinutes,
      createdAt: t.createdAt ?? '',
    })),
);
function openLegacyAssign(preselect: string[]) {
  legacyAssignPreselect.value = preselect;
  legacyAssignOpen.value = true;
}
function onLegacyAssignSubmit(p: AssignSubmitPayload) {
  legacyAssignRef.value?.setSubmitting(true);
  const rows = wb.assignTickets(p.ticketIds, { scope: p.scope, targetId: p.targetId, targetName: p.targetName });
  legacyAssignRef.value?.setSubmitting(false);
  if (rows.some((r) => !r.ok)) {
    legacyAssignRef.value?.applyResults(rows);
    return;
  }
  legacyAssignOpen.value = false;
  message.success(`已指派 ${rows.length} 张工单给 ${p.targetName}`);
}

/**
 * 催补待回 · 行内动作（PRD-02 §7⑤-B）：「领取」人人有；「调剂」只给二线班组长 / 投诉督导 /
 * 三类管理员（与指派同一组角色），且行要满足 `canTransferTicket`。
 * 已转出（非诉单转售后、等待售后回传）的单不支持调剂：「调剂」置灰，悬停出提示。
 */
function poolPendingRowActions(
  t: Ticket,
): { label: string; primary?: boolean; disabled?: boolean; tip?: string }[] {
  const acts: { label: string; primary?: boolean; disabled?: boolean; tip?: string }[] = [
    { label: '领取', primary: true },
  ];
  if (canAssign.value && canTransferTicket(t)) {
    acts.push(
      isTransferredOut(t)
        ? { label: '调剂', disabled: true, tip: TRANSFERRED_OUT_TRANSFER_TIP }
        : { label: '调剂' },
    );
  }
  return acts;
}

/** 催补待回 · 「领取工单」确认弹窗的数据（领取一律先弹窗：换人换组） */
const takeoverOpen = ref(false);
const takeoverTicket = ref<Ticket | null>(null);
const takeoverFrom = ref<string | null>(null);
const takeoverEscalated = computed(() => takeoverTicket.value?.nodeStatus === '已升级技术支持');
const takeoverMe = computed(() => currentHandlerName(user.roleKey, user.name));
/** 当前处理组：工单当前归属的处理组（＝分组名称首项） */
const takeoverCurGroup = ref<string | null>(null);
/** 领取后处理组：选项＝当前用户所在的全部班组 */
const takeoverGroup = ref<string | undefined>(undefined);
const takeoverGroupOptions = computed(() => user.groups.map((g) => ({ value: g, label: g })));

function runTakeOverPending(t: Ticket, groupName?: string) {
  const res = wb.takeOverPoolPending(t.id, groupName);
  if (!res.ok) {
    message.warning('该工单已不在催补待回');
    return;
  }
  // 主责本就是本人：处理人不变，不弹「已领取」
  if (!isCurrentHandler(res.from, user.roleKey, user.name)) message.success(`已领取 ${t.no}`);
  openOperation(t);
}

/**
 * 催补待回 · 领取：无处理人、他人名下、已升级单（二线主责）一律先弹「领取工单」确认。
 * 领取后处理组默认＝工单当前处理组；当前用户不在该组时取用户所在班组的第一个。
 * 确认后处理人＝本人、处理组＝所选处理组，进该单详情。
 */
function takeOverPending(t: Ticket) {
  const cur = resolveTicketGroupNames(t)[0] ?? null;
  const mine = user.groups;
  takeoverTicket.value = t;
  takeoverFrom.value = wb.poolPendingOwnerOf(t);
  takeoverCurGroup.value = cur;
  takeoverGroup.value = cur && mine.includes(cur) ? cur : (mine[0] ?? cur ?? undefined);
  takeoverOpen.value = true;
}

function onTakeoverOk() {
  const t = takeoverTicket.value;
  const g = takeoverGroup.value;
  if (!t || !g) return;
  takeoverOpen.value = false;
  runTakeOverPending(t, g);
}

// 「处理 / 详情 / 审核 / 受理」进工单操作页（PRD-03）；其余即时反馈
function onAction(label: string, t: Ticket) {
  if (label === '领取' && isPoolPendingTab.value) {
    takeOverPending(t);
    return;
  }
  if (label === '领取' && isFlashTicket(t) && flashPoolTabOpen.value) {
    claimFlash(t);
    return;
  }
  if (label === '领取') {
    // 【1215】先到先得 ＋ 未签入不可领；领取不校验画像、不受个人上限约束（10.2）
    const res = wb.claimTicketWithResult(t.id);
    if (res.ok) message.success(`已领取 ${t.no}`);
    else message.warning(res.message || '该工单已被领取');
    return;
  }
  if (label === '指派') {
    openAssign(t);
    return;
  }
  if (label === '调剂' || label === '退回') {
    openOpDialog(label, [t]);
    return;
  }
  if (['处理', '详情', '审核', '受理'].includes(label)) {
    openOperation(t);
  } else if (label === '领单') {
    if (wb.claimTicket(t.id)) {
      message.success(`已领取 ${t.no}，转入「我的任务」`);
    } else {
      message.warning('该工单已被他人认领');
    }
  } else {
    message.success(`已对 ${t.no} 执行「${label}」`);
  }
}
function onClickNo(t: Ticket) {
  openOperation(t);
}
function onClickCustomer(t: Ticket) {
  message.info(`查看客户「${t.customer}」详情卡`);
}
function onBatch(action: string) {
  if (flashPoolTabOpen.value) {
    if (action !== '领取') return;
    const ids = [...flashSelectedIds.value];
    if (!ids.length) {
      message.info('请先勾选要领取的工单');
      return;
    }
    let claimed = 0;
    let failed = 0;
    for (const id of ids) {
      if (wb.claimFlashTicket(id).ok) claimed++;
      else failed++;
    }
    if (claimed > 0) message.success(`已领取 ${claimed} 单`);
    if (failed > 0) message.warning(`${failed} 单领取失败或已被他人领取`);
    clearFlashSelection();
    return;
  }
  if (action === '领取') {
    const { claimed, failed } = wb.claimTickets(wb.selectedIds.value);
    if (claimed > 0) {
      message.success(`已领取 ${claimed} 单，转入「我的任务」`);
    }
    if (failed > 0) {
      message.warning(`${failed} 单已被他人认领`);
    }
    if (claimed === 0 && failed === 0) {
      message.info('请先勾选要领取的工单');
    }
    wb.clearSelection();
    return;
  }
  if (action === '调剂' && batchDisabledTips.value['调剂']) return;
  if (action === '调剂' || action === '退回') {
    const picked = [...wb.selectedIds.value]
      .map((id) => wb.ticketById(id))
      .filter((t): t is Ticket => !!t);
    // 刷机单的流转动作统一在工单处理页办理（M116 / M117），批量调剂 / 退回跳过刷机单
    const tickets = picked.filter((t) => !isFlashTicket(t));
    const skipped = picked.length - tickets.length;
    if (skipped > 0) {
      message.warning(`已跳过 ${skipped} 张刷机单，刷机单请在工单处理页操作`);
    }
    if (tickets.length === 0) return;
    openOpDialog(action, tickets);
    return;
  }
  message.success(`已对已选 ${wb.selectedCount.value} 单执行批量「${action}」`);
  wb.clearSelection();
}
function onCreated(t: Ticket) {
  wb.addTicket(t);
  // 建完单要能看见它，故一并退出报备池 —— 只调 setTab 的话页签栏还停在报备池上，
  // 新单落进了「我的任务」却一眼看不到
  riskReportTabActive.value = false;
  flashPoolTabActive.value = false;
  wb.setTab('mine');
}

function openAiDrawer() {
  aiDrawerFilter.value = 'all';
  aiDrawerOpen.value = true;
}

function onAiViewTicket(s: AiSuggestion) {
  const t = wb.ticketById(s.ticketId);
  if (!t) return;
  aiDrawerOpen.value = false;
  openOperation(t);
}

function onAiPrimaryAction(s: AiSuggestion) {
  const t = wb.ticketById(s.ticketId);
  if (!t) return;

  if (s.kind === 'upgrade') {
    message.success(`已对 ${t.no} 发起升级`);
  } else if (s.kind === 'similar') {
    aiDrawerOpen.value = false;
    router.push({ path: `/tickets/${t.no}`, query: { similar: s.matchedNo ?? '' } });
    message.success('已带入相似方案摘要');
    wb.dismissAiSuggestion(s.id);
    return;
  } else {
    message.success(`已标记 ${t.no} 为优先跟进`);
  }
  wb.dismissAiSuggestion(s.id);
}

function onChipSelect(chip: string) {
  wb.setChip(chip, applyOptionalVisible);
}

function onRemoveSavedChip(chipKey: string) {
  const sf = wb.activeChips.value.find((c) => c.key === chipKey);
  const name = sf?.label ?? '该筛选';
  Modal.confirm({
    title: '删除筛选器',
    content: `确定删除「${name}」？删除后不可恢复。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk() {
      const removed = wb.removeSavedFilterChip(chipKey);
      if (removed) message.success(`已删除筛选器「${removed.name}」`);
    },
  });
}

function onRequestSaveFilter() {
  if (!hasMineQuery(wb.structuredQuery.value)) {
    message.warning('请先设置筛选条件后再保存');
    return;
  }
  saveFilterModalOpen.value = true;
}

function onConfirmSaveFilter(name: string) {
  const item = wb.saveCurrentFilter(name, { ...optionalVisible.value }, applyOptionalVisible);
  if (item) {
    message.success(`已保存筛选器「${name}」`);
    structuredFilterExpanded.value = true;
  }
}
</script>

<template>
  <div class="workbench">
    <!-- ① 多视图 Tab（全宽贴顶，对齐 .pen） -->
    <div class="workbench-tabs">
      <TicketTabs
        :active="activeWorkbenchTab"
        :counts="workbenchTabCounts"
        :hidden-tabs="workbenchHiddenTabs"
        @change="onTabChange"
      />
    </div>

    <!-- 风险报备池：装的是报备单不是工单，故整块自成一页，不走下面那套工单列表 -->
    <div v-if="riskReportTabOpen" class="workbench-body">
      <RiskReportPoolPanel @open-ticket="openTicketByNo" />
    </div>

    <div v-else class="workbench-body">
      <!-- ② chips 筛选（催补待回等 Tab 有子筛选时展示；草稿箱视图下照常展示，点其他 chip 回列表） -->
      <div v-if="!flashPoolTabOpen && wb.activeChips.value.length" class="filter-row-unified">
        <TicketFilterBar
          :active-chip="wb.activeChip.value"
          :chip-counts="wb.chipCounts.value"
          :chips="wb.activeChips.value"
          :show-time-filter="!wb.usesStructuredFilter.value"
          @chip="onChipSelect"
          @remove-chip="onRemoveSavedChip"
        />
      </div>

      <!-- ③ 列表控制区：工具行固定在此（各 Tab 搜索栏对齐）；筛选面板向上展开 -->
      <div v-if="flashPoolTabOpen || !isDraftView" class="list-controls">
        <TicketMineQueryBar
          v-if="!flashPoolTabOpen && wb.usesStructuredFilter.value && structuredFilterExpanded"
          :expanded="true"
          :model-value="wb.structuredQuery.value"
          :variant="structuredFilterVariant"
          :pool-groups="wb.poolGroups.value"
          :optional-visible="optionalVisible"
          @update:model-value="wb.setStructuredQuery"
          @search="wb.applyStructuredQuery"
          @save-filter="onRequestSaveFilter"
          @apply-optional-visible="applyOptionalVisible"
        />

        <TicketToolbar
          :selected-count="toolbarSelectedCount"
          :search="toolbarSearch"
          search-placeholder="工单号 / 手机号"
          :show-create="!flashPoolTabOpen && !wb.isDoneTab.value"
          :show-xiaozhi-create="!flashPoolTabOpen && !wb.isDoneTab.value && canCreateXiaozhi"
          :show-batch="toolbarShowBatch"
          :batch-actions="toolbarBatchActions"
          :batch-disabled-tips="flashPoolTabOpen ? {} : batchDisabledTips"
          :visible-columns="visibleColumns"
          :column-order="columnOrder"
          :show-filter-toggle="!flashPoolTabOpen && wb.usesStructuredFilter.value"
          :show-sort="!flashPoolTabOpen"
          :filter-expanded="structuredFilterExpanded"
          :show-column-settings="true"
          @batch="onBatch"
          @update:search="onToolbarSearch"
          @create="openCreate"
          @create-xiaozhi="openCreateXiaozhi"
          @toggle-filter="structuredFilterExpanded = !structuredFilterExpanded"
          @set-column-visible="setColumnVisible"
          @reorder-column="reorderColumn"
          @reset-columns="resetColumns"
        />
      </div>

      <!-- 【1215】工单池 · 组池分段与派单筛选（10.1） -->
      <div v-if="!flashPoolTabOpen && wb.isPoolTab.value" class="pool-dispatch-bar">
        <div class="pdb-segs" role="list">
          <button
            v-for="p in poolSegments"
            :key="p.id"
            type="button"
            class="pdb-seg"
            :class="{ on: wb.poolDispatchFilter.value.pools.includes(p.id) }"
            @click="togglePoolSegment(p.id)"
          >
            <span>{{ p.label }} · {{ p.count }} 张</span>
            <span
              v-if="p.tag"
              class="pdb-mode"
              :style="{ color: MODE_TAG_STYLE[p.tag].color, background: MODE_TAG_STYLE[p.tag].bg, borderColor: MODE_TAG_STYLE[p.tag].border }"
            >{{ p.tag }}</span>
          </button>
        </div>
        <div class="pdb-filters">
          <a-select
            class="pdb-select"
            mode="multiple"
            :max-tag-count="1"
            allow-clear
            placeholder="派单状态"
            :options="dispatchStatusOptions"
            :value="wb.poolDispatchFilter.value.statuses"
            @update:value="(v: unknown) => wb.setPoolDispatchFilter({ statuses: Array.isArray(v) ? (v as string[]) : [] })"
          />
          <a-select
            class="pdb-select"
            mode="multiple"
            :max-tag-count="1"
            allow-clear
            placeholder="组池"
            :options="poolFilterOptions"
            :value="wb.poolDispatchFilter.value.pools"
            @update:value="(v: unknown) => wb.setPoolDispatchFilter({ pools: Array.isArray(v) ? (v as string[]) : [] })"
          />
          <a-tooltip :title="myProfileConfigured ? undefined : '人员画像未配置'">
            <a-checkbox
              :checked="wb.poolDispatchFilter.value.matchMe"
              :disabled="!myProfileConfigured"
              @update:checked="(v: boolean) => wb.setPoolDispatchFilter({ matchMe: v })"
            >匹配我</a-checkbox>
          </a-tooltip>
        </div>
      </div>

      <!-- ④ AI 建议条（仅我的任务；置于工具行之下，避免顶挤搜索栏） -->
      <AiSuggestionBar
        v-if="!flashPoolTabOpen && wb.showAiBar.value && !isDraftView"
        :summary="wb.aiSummary.value"
        @view="openAiDrawer"
        @close="wb.aiBarVisible.value = false"
      />

      <!-- ⑤ 列表区：草稿视图 → 草稿列表；否则 → SLA 富列表 + 分页 -->
      <div class="table-card">
        <TicketDraftList
          v-if="isDraftView"
          :drafts="wb.drafts.value"
          @open="editDraft"
          @remove="removeDraft"
        />
        <template v-else-if="flashPoolTabOpen">
          <TicketRichList
            :rows="flashPoolFiltered"
            :selected-ids="flashSelectedIds"
            :all-page-selected="flashAllPageSelected"
            variant="pool"
            :row-actions-fn="flashPoolRowActions"
            :visible-columns="FLASH_POOL_HIDDEN_COLUMNS"
            :extra-columns="FLASH_POOL_EXTRA_COLUMNS"
            :column-widths="FLASH_POOL_COLUMN_WIDTHS"
            :column-widths-storage-key="FLASH_POOL_COLUMN_WIDTHS_KEY"
            flex-before-action
            :empty-kind="flashSearch.trim() ? 'search' : 'none'"
            @toggle="toggleFlashSelect"
            @toggle-all="toggleFlashSelectAllOnPage"
            @action="onAction"
            @open="openOperation"
            @click-no="onClickNo"
          >
            <template #cell-flashHandoff="{ ticket }">
              <span class="flash-cell" :title="flashHandoffCellText(ticket)">{{ flashHandoffCellText(ticket) }}</span>
            </template>
            <template #cell-flashFail="{ ticket }">
              <span class="flash-cell" :title="flashFailCellText(ticket)">{{ flashFailCellText(ticket) }}</span>
            </template>
            <template #cell-flashModel="{ ticket }">
              <span class="flash-product" :title="ticket.flash?.info.productModel">{{ ticket.flash?.info.productModel || '—' }}</span>
            </template>
            <template #cell-flashPoolAt="{ ticket }">
              <span class="flash-plain">{{ flashStore.poolEnteredAtOf(ticket.no) || '—' }}</span>
            </template>
          </TicketRichList>
          <div class="pager">
            <div class="pager-left">
              <span class="pager-total">共 {{ flashPoolFiltered.length }} 条</span>
              <span class="pager-selected">已选 {{ flashSelectedCount }} 项</span>
            </div>
          </div>
        </template>
        <template v-else>
          <TicketRichList
            :rows="wb.paged.value"
            :selected-ids="wb.selectedIds.value"
            :all-page-selected="wb.allPageSelected.value"
            :variant="
              wb.isMineTab.value
                ? 'mine'
                : wb.isDoneTab.value
                  ? 'done'
                  : wb.isPoolTab.value
                    ? 'pool'
                    : 'default'
            "
            :row-actions-fn="isPoolPendingTab ? poolPendingRowActions : wb.isPoolTab.value ? poolRowActionsDispatch : undefined"
            :selectable="wb.isPoolTab.value ? false : undefined"
            :show-appointment-column="wb.showAppointmentColumn.value"
            :extra-columns="listExtraColumns"
            :visible-columns="visibleColumns"
            :column-order="columnOrder"
            @toggle="wb.toggleSelect"
            @toggle-all="wb.toggleSelectAllOnPage"
            @action="onAction"
            @open="openOperation"
            @click-no="onClickNo"
            @click-customer="onClickCustomer"
          >
            <template #cell-suspendedAt="{ ticket }">
              <span class="suspend-time">{{ ticket.suspendedAt || '—' }}</span>
            </template>
            <template #cell-suspendResumeAt="{ ticket }">
              <span class="suspend-time">{{ ticket.suspendResumeAt || '—' }}</span>
            </template>
            <template #cell-flashHandoff="{ ticket }">
              <span class="flash-cell">{{ flashHandoffCellText(ticket) }}</span>
            </template>
            <template #cell-flashFail="{ ticket }">
              <span class="flash-cell" :title="flashFailCellText(ticket)">{{ flashFailCellText(ticket) }}</span>
            </template>
            <template #cell-dispatchStatus="{ ticket }">
              <span
                v-if="dispatchStatusCell(ticket)"
                class="dsp-tag"
                :style="{
                  color: DISPATCH_STATUS_STYLE[dispatchStatusCell(ticket)!].color,
                  background: DISPATCH_STATUS_STYLE[dispatchStatusCell(ticket)!].bg,
                  borderColor: DISPATCH_STATUS_STYLE[dispatchStatusCell(ticket)!].border,
                }"
                :title="dispatchStatusCell(ticket) === '等原处理人' ? reserveTipOf(ticket.no) : undefined"
              >{{ dispatchStatusCell(ticket) }}</span>
              <span v-else class="dsp-empty">—</span>
            </template>
            <template #cell-dispatchMatch="{ ticket }">
              <span v-if="matchesMeCell(ticket)" class="dsp-match">匹配我</span>
              <span v-else class="dsp-empty">—</span>
            </template>
            <template #cell-dispatchPool="{ ticket }">
              <span class="dsp-plain" :title="ticket.groupId ? dispatch.poolLabel(ticket.groupId) : '—'">
                {{ ticket.groupId && dispatch.isDispatchPool(ticket.groupId) ? dispatch.poolLabel(ticket.groupId) : (ticket.groupNames?.[0] ? `${ticket.groupNames[0]}池` : '—') }}
              </span>
            </template>
            <template #cell-dispatchWait="{ ticket }">
              <span class="dsp-plain">{{ waitText(waitMinutesOf(ticket, nowMs)) }}</span>
            </template>
          </TicketRichList>
          <!-- 无分页：全量快照展示（PRD §8.2②），仅保留总数/已选统计 -->
          <div class="pager">
            <div class="pager-left">
              <span class="pager-total">共 {{ wb.total.value }} 条</span>
              <span v-if="wb.isMineTab.value" class="pager-selected">已选 {{ wb.selectedCount.value }} 项</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <CreateTicketModal
      v-model:open="createOpen"
      :draft-id="editingDraftId"
      :prefill="createPrefill"
      @created="onCreated"
    />

    <DispatchAssignModal
      v-model:open="assignOpen"
      :ticket="assignTicket"
      :group-id="assignGroupId"
    />
    <AssignModal
      ref="legacyAssignRef"
      v-model:open="legacyAssignOpen"
      :preselected-ids="legacyAssignPreselect"
      :candidates="TEAM_MEMBERS"
      :tickets="legacyAssignTickets"
      :can-cross-team="canAssign"
      @submit="onLegacyAssignSubmit"
    />

    <AiSuggestionDrawer
      v-model:open="aiDrawerOpen"
      v-model:filter="aiDrawerFilter"
      :suggestions="wb.aiSuggestions.value"
      :summary="wb.aiSummary.value"
      :tickets="wb.all.value"
      @view-ticket="onAiViewTicket"
      @primary-action="onAiPrimaryAction"
    />

    <SaveFilterModal
      v-model:open="saveFilterModalOpen"
      @save="onConfirmSaveFilter"
    />

    <OpActionDialogs
      v-model:open="opDialogOpen"
      :action="opDialogAction"
      :ticket-no="opDialogTicketNo"
      :suspend-info="null"
      :return-count="opReturnCount"
      @confirm="onOpDialogConfirm"
    />

    <OpActionModal
      v-model:open="takeoverOpen"
      title="领取工单"
      :icon="UserSwitchOutlined"
      tone="primary"
      ok-tone="primary"
      :width="440"
      ok-text="确认领取"
      cancel-text="取消"
      :ok-disabled="!takeoverGroup"
      @ok="onTakeoverOk"
    >
      <div v-if="takeoverTicket" class="op-form">
        <div class="op-box">
          <div class="tko-ticket" :title="`${takeoverTicket.no} · ${takeoverTicket.title}`">
            {{ takeoverTicket.no }} · {{ takeoverTicket.title }}
          </div>
        </div>
        <!-- 两行每行两格，每格字段名与值同一行；四列网格：左右两列字段名各自按本列最长者定宽，值左缘对齐 -->
        <div class="tko-kv">
          <div class="op-label">当前处理人</div>
          <div
            class="tko-ro"
            :title="`${takeoverFrom ?? '—'}${takeoverEscalated && takeoverFrom ? '（二线主责）' : ''}`"
          >{{ takeoverFrom ?? '—' }}<span v-if="takeoverEscalated && takeoverFrom" class="tko-note">（二线主责）</span></div>
          <div class="op-label">当前处理组</div>
          <div class="tko-ro" :title="takeoverCurGroup ?? '—'">{{ takeoverCurGroup ?? '—' }}</div>
          <div class="op-label">领取后处理人</div>
          <div class="tko-ro" :title="takeoverMe">{{ takeoverMe }}</div>
          <div class="op-label req">领取后处理组</div>
          <a-select
            v-model:value="takeoverGroup"
            class="tko-select"
            :options="takeoverGroupOptions"
            :allow-clear="false"
          />
        </div>
        <div class="op-hint">
          {{ takeoverEscalated
            ? '领取后由你担任二线主责，三线处理不受影响。'
            : '领取后工单进入你的处理队列，原处理人将不再处理此单。' }}
        </div>
      </div>
    </OpActionModal>
  </div>
</template>

<style scoped>
.workbench {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  width: 100%;
  min-width: 0;
}
.workbench-tabs {
  flex: none;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.workbench-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.filter-row-unified {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  flex-wrap: nowrap;
}
.filter-row-unified :deep(.filter-row) {
  flex: 1;
  min-width: 0;
}
.list-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  min-width: 0;
}
.suspend-time { font-variant-numeric: tabular-nums; white-space: nowrap; }
/* 【1215】工单池 · 组池分段与派单筛选 */
.pool-dispatch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}
.pdb-segs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.pdb-seg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.pdb-seg:hover { background: #f9fafb; }
.pdb-seg.on { color: #1a6fff; background: #eff6ff; border-color: #bfdbfe; font-weight: 600; }
.pdb-mode, .dsp-tag, .dsp-match {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: 4px;
  white-space: nowrap;
}
.dsp-match { color: #059669; background: #ecfdf5; border-color: #a7f3d0; }
.dsp-empty { color: #9ca3af; }
.dsp-plain { font-size: 12px; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pdb-filters { display: flex; align-items: center; gap: 10px; flex: none; }
.pdb-select { width: 168px; }
.flash-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flash-plain {
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.flash-product {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  flex: none;
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
  color: #9ca3af;
}
/* 领取工单弹窗：字段名与值同一行，垂直居中；只读值与下拉同高 32px */
.tko-kv {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
  column-gap: 10px;
  row-gap: 12px;
  align-items: center;
}
.tko-kv > .op-label {
  white-space: nowrap;
}
.tko-kv > .tko-select {
  width: 100%;
  min-width: 0;
}
/* 信息块里的工单号·标题 */
.tko-ticket {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tko-ro {
  min-width: 0;
  font-size: 14px;
  line-height: 32px;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tko-note { margin-left: 4px; font-size: 12px; color: #9ca3af; }
</style>
