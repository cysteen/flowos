<script setup lang="ts">
import { computed, defineAsyncComponent, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { useWorkspaceTabsStore, resolveTicketTabTitle } from '@/stores/workspaceTabs';
import { useCtiStore } from '@/stores/cti';
import { useUserStore } from '@/stores/user';
import OpHeader from './components/operation/OpHeader.vue';
import OpOverviewBand from './components/operation/OpOverviewBand.vue';
import OpStatDetailModal from './components/operation/OpStatDetailModal.vue';
import OpSupplementModal from './components/operation/OpSupplementModal.vue';
import OpDunningModal from './components/operation/OpDunningModal.vue';
import OpCancelModal from './components/operation/OpCancelModal.vue';
import OpEscalateComplaintModal from './components/operation/OpEscalateComplaintModal.vue';
import OpSmsModal from './components/operation/OpSmsModal.vue';
import OpEmailModal from './components/operation/OpEmailModal.vue';
import TicketEventToastStack from './components/operation/TicketEventToastStack.vue';
import OpProcessTabs from './components/operation/OpProcessTabs.vue';
import OpSidePanel from './components/operation/OpSidePanel.vue';
import OpActionBar from './components/OpActionBar.vue';
// 建单弹窗仅在「转单/重开」时用，按需异步加载，不阻塞操作页首屏
const CreateTicketModal = defineAsyncComponent(() => import('./components/CreateTicketModal.vue'));
import { useTicketOperation } from './composables/useTicketOperation';
import { FEISHU_ESCALATE_CHANNEL, mapUserRole, isAftersaleSettled, isAftersaleInbound } from './composables/opActions';
import { useProcessForm } from './composables/useProcessForm';
import { useOperationTabs } from './composables/useOperationTabs';
import { useTicketLiveNotify } from './composables/useTicketLiveNotify';
import { formatTicketRecordWho, MOCK_FIRST_LINE_AGENTS } from './utils/ticketRecordWho';
import { mergeDraftIntoLatestHandling } from './utils/ticketOverview';
import { TICKETS } from '@/mock/tickets';
import { pullbackOnCsEvent, headerActionsByRole, type TicketStatus } from './types/ticket';
import { buildChildTicketPrefill, buildReopenTicketPrefill } from './composables/childTicketPrefill';
import {
  buildEscalatePrefill, buildEscalateVerdict, buildEscalatedTicket, escalateTargetLabel,
  isTicketTerminated, resolveEscalateOutcome, summarizeEscalateInput, type EscalateInput,
} from './composables/complaintEscalation';
import { resolveSupersededBy, type TicketRelation } from './composables/ticketRelations';
import type { CreateTicketPrefill, Ticket } from './types/ticket';
import type { ProcessFormDraft, InsightAction, InsightModalKey } from './types/operation';
import type { ProcessTabKey } from './types/operation';
import { COMPLAINT_SUPPLEMENT_TYPE } from './types/operationTabs';
import type { OperationTabData } from './types/operationTabs';
import type { TicketLiveEventType, TicketLiveToast } from './types/ticketLiveNotify';

const route = useRoute();
const router = useRouter();
const {
  detail: d, timeline, opState, suspendInfo, draftSavedAt,
  dispatch, confirmWithdraw, addChildTicket, addReopenTicket, addEscalatedComplaint,
} = useTicketOperation();
const {
  form, activeChip, expandedSections, filledSupplementCount,
  toggleSection, selectChip,
} = useProcessForm(() => d.value.type);
const { tabData } = useOperationTabs(() => d.value.type, () => d.value.no);
const {
  toasts: liveToasts,
  push: pushLiveToast,
  dismiss: dismissLiveToast,
  dismissAll: dismissAllLiveToasts,
} = useTicketLiveNotify();

/** keep-alive 下仅当前激活的工单操作 Tab 展示实时通知 */
const pageActive = ref(false);

const ticketNo = computed(() => (route.params.ticketNo as string) || d.value.no);
const processTabsRef = ref<InstanceType<typeof OpProcessTabs> | null>(null);
const actionBarRef = ref<{ openEscalate: () => void; openAftersale: () => void } | null>(null);

const tabsStore = useWorkspaceTabsStore();
const cti = useCtiStore();
const user = useUserStore();

const overviewExpanded = ref(false);
const supplementModalOpen = ref(false);
const dunningModalOpen = ref(false);
const cancelModalOpen = ref(false);

// 联系客户：短信 / 邮件弹窗
const smsModalOpen = ref(false);
const smsPhone = ref('');
const emailModalOpen = ref(false);
const emailTo = ref('');
const notifyCtx = computed(() => ({
  no: ticketNo.value,
  name: d.value.customer.name || '',
  product: d.value.product.name || '',
  agent: user.name || '当前坐席',
}));

/** 工单操作页加载后，用标题同步 Tab（避免仅显示工单号） */
watch(
  [ticketNo, () => d.value.title, () => d.value.no],
  ([no, title, detailNo]) => {
    if (!no) return;
    tabsStore.updateTitle(`/tickets/${no}`, resolveTicketTabTitle(no, title, detailNo));
  },
  { immediate: true },
);

const createOpen = ref(false);
const createPrefill = ref<CreateTicketPrefill | null>(null);

function onContact(type: 'call' | 'sms' | 'email', value: string) {
  if (type === 'call') {
    if (cti.workStatus === 'offline') {
      message.warning('请先签入上班');
      return;
    }
    if (cti.workStatus === 'break') {
      message.warning('请先切换为就绪');
      return;
    }
    if (cti.callSession) {
      message.warning('当前有进行中的外呼');
      return;
    }
    const isAgent = d.value.agent?.contacts?.some((c) => c.value === value);
    const role = isAgent ? '代办人' : '客户';
    const name = isAgent ? (d.value.agent?.name ?? '') : (d.value.customer.name || '');
    cti.startCall({
      ticketId: ticketNo.value,
      phone: value,
      contactLabel: name ? `${role}·${name}` : role,
    });
    return;
  }
  if (type === 'sms') {
    smsPhone.value = value;
    smsModalOpen.value = true;
    return;
  }
  emailTo.value = value;
  emailModalOpen.value = true;
}

function onSmsSubmit(payload: { phone: string; templateName: string; content: string }) {
  tabData.value.contactRecords.unshift({
    id: `c-${Date.now()}`,
    kind: 'sms',
    title: '短信发送',
    emoji: '💬',
    operator: user.name || '当前坐席',
    when: formatNow(),
    metaPrefix: '发送人',
    summary: `接收号码: ${payload.phone} | 状态: 发送成功 | 模板: ${payload.templateName}`,
    smsContent: payload.content,
  });
  syncContactedAfterOutreach();
  processTabsRef.value?.switchTab('contact');
  message.success(`短信已发送至 ${payload.phone}`);
}

function onEmailSubmit(payload: { to: string; subject: string }) {
  tabData.value.contactRecords.unshift({
    id: `c-${Date.now()}`,
    kind: 'email',
    title: '邮件发送',
    emoji: '📧',
    operator: user.name || '当前坐席',
    when: formatNow(),
    metaPrefix: '发送人',
    summary: `收件邮箱: ${payload.to} | 状态: 发送成功 | 主题: ${payload.subject}`,
  });
  syncContactedAfterOutreach();
  processTabsRef.value?.switchTab('contact');
  message.success(`邮件「${payload.subject}」已发送至 ${payload.to}`);
}

// —— 顶部速览带：统计宫格双层下钻 ——
const statModalKey = ref<InsightModalKey | null>(null);
const statTable = computed(() =>
  statModalKey.value ? d.value.insightDetails[statModalKey.value] : null,
);
// 弹窗「查看完整记录」跳向的 Tab + 文案
const STAT_VIEW_ALL: Record<Exclude<InsightModalKey, 'contact'>, { tab: ProcessTabKey; label: string }> = {
  history: { tab: 'customerHistory', label: '在「客户历史工单」中查看全部' },
  complaint: { tab: 'customerHistory', label: '在「客户历史工单」中查看全部' },
  recent30: { tab: 'customerHistory', label: '在「客户历史工单」中查看全部' },
};
const statViewAllLabel = computed(() => {
  if (!statModalKey.value || statModalKey.value === 'contact') return '';
  return STAT_VIEW_ALL[statModalKey.value].label;
});
const statModalWidth = computed(() => (statModalKey.value === 'contact' ? 960 : 760));

function onOverviewSelect(action: InsightAction) {
  if (action.kind === 'modal') {
    statModalKey.value = action.modalKey;
  } else {
    processTabsRef.value?.switchTab(action.tab);
  }
}
function onStatViewAll() {
  // contact 无「查看完整记录」跳转，其余三类才有对应 Tab
  if (!statModalKey.value || statModalKey.value === 'contact') return;
  processTabsRef.value?.switchTab(STAT_VIEW_ALL[statModalKey.value].tab);
  statModalKey.value = null;
}
function onStatOpenTicket(no: string) {
  message.info(`打开工单 ${no}`);
}

function openChildCreate() {
  createPrefill.value = buildChildTicketPrefill(d.value);
  createOpen.value = true;
}

function openReopenCreate() {
  createPrefill.value = buildReopenTicketPrefill(d.value);
  createOpen.value = true;
}

/**
 * 被接管：本单已因升级而关闭，业务已转到新单。
 * 按 Zendesk 合并口径**整页锁只读**——底部操作栏不出、Tab 只读、头部动作禁用，
 * 只留横幅上的「打开新单」。不这么做，催单/补充/再投诉就可能落在这张作废的旧单上。
 */
const supersededBy = computed(() => resolveSupersededBy(d.value));
/**
 * 只读态（**整页冻结**）：一线视角 / **已转单**（业务转到新单）/ **只读角色**（运营监控岗）。
 * 注意"正常关闭"不在此列——已关闭单仍保留头部动作（升级投诉 / 关联售后 / 新建补充 / 催单），
 * 补充/催单走 §5.2「建新单承接」。
 */
/**
 * **整页锁死**：已转单（业务已转到新单）/ 只读角色（运营监控岗）。
 *
 * ⚠️ **一线视角不在此列**（2026-08-18 修正）——它锁的是**底栏的二线流转动作**
 * （下送/升级/调剂/委派/挂起/关闭/强结），由 hideActionBar 单独管。
 * 头部那一排一线本来就有权限：**升级投诉**一线可升非投诉单、**取消工单**是一线专属、
 * **新建补充 / 催单**是一线主动作。之前把一线视角接进来，导致整排按钮
 * 在一线视角下全被置灰、提示还错成"本单已被新单接管"。
 */
const pageReadonly = computed(
  () => !!supersededBy.value || !!user.role.readonlyTickets,
);

/**
 * 一线视角：底栏不出、Tab 只读，但**头部的客户侧两枚照常可用** ——
 * 「新建补充」「催单」正是一线的主动作，跟着 pageReadonly 一起置灰是错的。
 *
 * 判据是**当前角色**，不是当前工单。此前读工单上的 `frontlineDemo` 字段，
 * 而 12 张 mock 单里 11 张带着它 —— 于是任何角色打开这些单都被当成一线，
 * 底栏整条不出、Tab 全只读，头部六枚也因走一线分支而四角色完全相同。
 */
const isFrontlineView = computed(() => !!user.role.frontline);

/**
 * 客户侧录入（新建补充 / 催单）什么时候被锁：
 * 只有**已转单**（本单已作废、业务在新单上）与**只读角色**（运营监控岗）会锁。
 * 一线视角**不锁** —— 它锁的是流转，不是客户诉求录入。
 */
const customerEntryLocked = computed(
  () => !!supersededBy.value || !!user.role.readonlyTickets,
);

/**
 * 客户侧两枚的角色可见性（PRD-830 §4.1，基线 §4 ※21a）：
 * - 新建补充：**一线 + 二线**（二线自己也联系客户，客户在电话里补的东西他就地录入）
 * - 催单：**一线唯一**（登记的是"客户来催"这个进线事件；二线是处理人，不必自己给自己记）
 * - 三线 / 班组长 / 投诉处理角色 / 监控岗 / 管理员：两枚都不展示
 */
const headerRoleGate = computed(() => headerActionsByRole(user.roleKey));
const canSupplement = computed(() => headerRoleGate.value.supplement);
const canDunning = computed(() => headerRoleGate.value.dunning);
const canEscalateComplaint = computed(() => headerRoleGate.value.escalateComplaint);
const canLinkAftersale = computed(() => headerRoleGate.value.linkAftersale);
const canCancelTicket = computed(() => headerRoleGate.value.cancelTicket);

/**
 * 底部流转操作栏隐藏：只读态，**或原单已是终态**——
 * 已关闭/已取消/已归档/已转单的单不该再出现 下送/升级/调剂/委派/挂起/关闭/强结。
 */
/**
 * 底栏（二线流转动作条）什么时候整条不出：
 * ① **一线视角** —— 下送/升级/调剂/委派/挂起/关闭/强结属二线权限，一线不该看到；
 * ② 整页锁死（已转单 / 只读角色）；
 * ③ 原单已是终态 —— 已解决/已强结/已转单等不该再出现流转动作。
 * ⚠️ 一线视角在这里显式列出，**不要**再合回 pageReadonly —— 头部那排按钮一线有权限。
 */
/**
 * Tab 区（处理表单）只读：**一线视角**（F17：一线只看不填）+ 整页锁死。
 * 与头部按钮分开 —— 头部那排一线有权限、Tab 区里的写操作没有。
 */
const tabsReadonly = computed(() => isFrontlineView.value || pageReadonly.value);

const hideActionBar = computed(
  () => isFrontlineView.value || pageReadonly.value || isTicketTerminated(d.value.status),
);

/** 关系跳转：售后单是外部系统走深链，客服单站内打开 */
function openRelation(rel: TicketRelation) {
  if (rel.href) { window.open(rel.href, '_blank'); return; }
  router.push(`/tickets/${rel.no}`);
}

// —— 升级投诉：判定弹窗 → 建投诉新单 → 关原单 + 双向关联（《【815】关联投诉 PRD》）——
const escalateModalOpen = ref(false);
const escalateInput = ref<EscalateInput | null>(null);

/**
 * 升级投诉入口分流（PRD §4.2，判据＝**是否跨工单类型**）：
 * - 非投诉 → 投诉：跨类型，实质是建一张投诉单 → **打开新建投诉单页面**，已知字段预填；
 * - 原单已是投诉：不跨类型 → **小弹窗**补录，落法由【工单来源】决定。
 */
function openEscalate() {
  if (buildEscalateVerdict(d.value, user.roleKey).kind === 'toComplaint') {
    createPrefill.value = buildEscalatePrefill(d.value);
    createOpen.value = true;
    return;
  }
  escalateModalOpen.value = true;
}

/** 分支 B 提交：外投渠道→建外投关联单并关原单；其余来源→落为补充写在原单上 */
function onEscalateSubmit(payload: EscalateInput) {
  escalateInput.value = payload;
  if (resolveEscalateOutcome(payload) === 'supplement') {
    finishEscalateAsSupplement(payload);
    return;
  }
  const src = TICKETS.find((t) => t.no === d.value.no);
  const ticket = buildEscalatedTicket(d.value, payload, {
    operator: user.name,
    channel: src?.channel,
    priority: src?.priority,
  });
  finishEscalate(ticket, escalateTargetLabel(payload));
}

/**
 * 落补充：原单加一条补充记录 + 写履历，**不建新单、不关单**。
 *
 * ⚠️ 2026-08-17 起「升级投诉」**不再兼做补充**——投诉信息补录统一走
 * 「新建补充 → 补充投诉信息」（PRD-830 §5.2），分类名「投诉补充」已作废。
 * 本函数仅为兼容尚未清理的旧调用保留；新链路不应再走到这里。
 */
function finishEscalateAsSupplement(payload: EscalateInput) {
  const content = summarizeEscalateInput(payload).join('\n');
  onIncomingTicketEvent('supplement', content, formatTicketRecordWho(user.name, user.roleKey), {
    supplementType: COMPLAINT_SUPPLEMENT_TYPE,
    notify: false,
  });
  escalateInput.value = null;
  processTabsRef.value?.switchTab('related');
  message.success('已作为补充信息写入原单，未产生新单');
}

/** 升级落库：登记关联单 + 写关联履历 + 关原单（两条分支共用） */
function finishEscalate(ticket: Ticket, targetLabel: string, processAfter?: boolean) {
  const note = escalateInput.value?.note ?? ticket.problemDesc ?? '';
  addEscalatedComplaint(ticket, targetLabel, note);
  syncEscalatedRelatedCard(ticket, targetLabel);
  dispatch({ type: '升级投诉', data: { target: targetLabel, newNo: ticket.no, note } });
  escalateInput.value = null;
  if (!processAfter) processTabsRef.value?.switchTab('related');
}

function onTicketCreated(ticket: Ticket, processAfter?: boolean) {
  if (createPrefill.value?.mode === 'child') addChildTicket(ticket);
  else if (createPrefill.value?.mode === 'reopen') addReopenTicket(ticket);
  // 分支 A：建单页提交即完成升级——关原单 + 双向关联 + 写履历
  else if (createPrefill.value?.mode === 'escalate') finishEscalate(ticket, '投诉', processAfter);
  if (processAfter) router.push(`/tickets/${ticket.no}`);
}

/** 升级生成的新投诉单同步进「关联单」列表（客服侧本系统单，可站内打开） */
function syncEscalatedRelatedCard(ticket: Ticket, target: string) {
  const cards = tabData.value.relatedTickets;
  if (cards.some((c) => c.no === ticket.no)) return;
  cards.unshift({
    no: ticket.no,
    title: ticket.title,
    status: '未认领',
    statusColor: '#1A6FFF',
    type: target,
    typeColor: '#EF4444',
    createdAt: nowFullText(),
    createdAtFull: nowFullText(),
    builder: user.name || '当前坐席',
    demand: d.value.demand,
    processRecords: [
      { who: user.name || '当前坐席', when: nowFullText(), content: `由原单 ${d.value.no} 升级投诉生成` },
    ],
  });
}

function nowFullText(): string {
  const dt = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

/** 升级到飞书项目入口：所有工单均开放（不再限消费者BG） */
const feishuEligible = computed(() => true);

/** 转售后上下文：投诉分流 + 客户/产品预填 + 已有关联售后单（有关联则封口，按是否结案给不同提示） */
const aftersaleContext = computed(() => ({
  isComplaint: d.value.type === '投诉',
  customerName: d.value.customer.name,
  customerPhone: d.value.customer.contacts.find((c) => c.type === 'phone')?.value ?? '',
  region: d.value.customer.region,
  address: d.value.customer.address,
  productCategory: d.value.product.category,
  productName: d.value.product.name,
  sn: d.value.product.sn,
  existing: d.value.linkedAftersale
    ? {
        no: d.value.linkedAftersale.no,
        title: d.value.linkedAftersale.title,
        serviceType: d.value.linkedAftersale.serviceType,
        status: d.value.linkedAftersale.status,
        settled: isAftersaleSettled(d.value.linkedAftersale.status),
      }
    : undefined,
}));

function isFeishuEscalate(payload: Record<string, unknown>): boolean {
  if (payload.type !== '升级') return false;
  const data = payload.data as { channel?: string } | undefined;
  return data?.channel === FEISHU_ESCALATE_CHANNEL;
}

// 工单处理 Tab 参与变更登记的字段（键 + 展示名）
const PROCESS_FIELDS: { key: keyof ProcessFormDraft; label: string }[] = [
  { key: 'problemCause', label: '问题原因' },
  { key: 'processResult', label: '处理结果' },
  { key: 'serviceType', label: '服务类型' },
  { key: 'serviceMethod', label: '服务方式' },
  { key: 'conclusion', label: '问题解决结论' },
  { key: 'serviceSolution', label: '解决方案' },
];

/** 处理表单快照（含各字段值 + 附件数），作为变更 diff 的基线 */
function snapshotProcess(): Record<string, string> {
  const f = form.value;
  const snap: Record<string, string> = {};
  for (const { key } of PROCESS_FIELDS) snap[key] = String(f[key] ?? '').trim();
  snap.__att = String([...(f.processResultAttachments ?? []), ...(f.problemCauseAttachments ?? [])].length);
  return snap;
}

let processBaseline: Record<string, string> = snapshotProcess();
// 切工单/类型（表单重建）后重置基线
watch(ticketNo, () => { processBaseline = snapshotProcess(); });

/** 保存并登记：对处理字段做前后 diff，产出「补充/修改」变更（无变更则不登记） */
function buildProcessLog() {
  const f = form.value;
  const changes: import('./types/ticketDetail').TimelineFieldChange[] = [];
  for (const { key, label } of PROCESS_FIELDS) {
    const before = (processBaseline[key] ?? '').trim();
    const after = String(f[key] ?? '').trim();
    if (before === after || !after) continue;
    changes.push(before ? { field: label, kind: '修改', from: before, to: after } : { field: label, kind: '补充', to: after });
  }
  const attArr = [...(f.processResultAttachments ?? []), ...(f.problemCauseAttachments ?? [])];
  const attAdded = attArr.length - Number(processBaseline.__att ?? '0');
  if (attAdded > 0) changes.push({ field: '附件', kind: '补充', to: `新增 ${attAdded} 个（${attArr[attArr.length - 1]}）` });
  if (!changes.length) return undefined;
  const add = changes.filter((c) => c.kind === '补充').length;
  const mod = changes.filter((c) => c.kind === '修改').length;
  const seg: string[] = [];
  if (add) seg.push(`补充 ${add} 项`);
  if (mod) seg.push(`修改 ${mod} 项`);
  return {
    summary: `登记处理进展（${seg.join('，')}）`,
    attachment: attAdded > 0 ? attArr[attArr.length - 1] : undefined,
    changes,
  };
}

function onAction(payload: Record<string, unknown>) {
  if (payload.type === '保存草稿') {
    const log = buildProcessLog();
    dispatch({ type: '保存草稿', process: log });
    if (log) processBaseline = snapshotProcess(); // 登记后更新基线，下次 diff 以此为准
    return;
  }
  const toFeishu = isFeishuEscalate(payload);
  dispatch(payload);
  if (toFeishu) {
    processTabsRef.value?.switchTab('feishu');
  }
  if (payload.type === '转售后') syncAftersaleRelatedCard();
}

/**
 * 把 1:1 关联售后单同步进「关联单」列表（售后来源卡片，点击打开售后工单详情）。
 * 转售后后调用，工单本身就带关联单（如「已转出」态）时于载入后调用。
 * @param focus 是否切到关联单 Tab——转售后是动作反馈要切，载入时不抢用户视线
 */
function syncAftersaleRelatedCard(focus = true) {
  const la = d.value.linkedAftersale;
  if (!la) return;
  const cards = tabData.value.relatedTickets;
  const existed = cards.find((c) => c.no === la.no);
  const card = {
    no: la.no,
    title: `${la.serviceType} · ${d.value.product.name}`,
    status: la.status,
    statusColor: '#1a6fff',
    type: la.serviceType,
    typeColor: '#0EA5A4',
    createdAt: la.createdAt,
    createdAtFull: la.createdAt,
    builder: '售后系统',
    demand: d.value.demand,
    source: '售后' as const,
    externalLink: true,
  };
  if (existed) Object.assign(existed, card);
  else cards.unshift(card);
  syncAftersaleHistoryRow();
  if (focus) processTabsRef.value?.switchTab('related');
}

/**
 * 把 1:1 关联售后单同步进「客户历史工单」列表（D10）。
 * 售后单是该客户名下的一段独立服务处理，**独立成行计入总数、不去重**；
 * channel='售后' 即来源标记，现有筛选（处理中/已关闭/投诉）自动覆盖。
 */
function syncAftersaleHistoryRow() {
  const la = d.value.linkedAftersale;
  if (!la) return;
  const hist = tabData.value.customerHistory;
  if (hist.tickets.some((t) => t.no === la.no)) return;
  const processing = !isAftersaleSettled(la.status);
  hist.tickets.unshift({
    id: `h-${la.no}`,
    no: la.no,
    title: `${la.serviceType} · ${d.value.product.name}`,
    status: la.status,
    statusColor: processing ? '#1A6FFF' : '#10B981',
    type: la.serviceType,
    typeColor: '#0EA5A4',
    typeBgColor: '#0EA5A41F',
    channel: '售后',
    date: la.createdAt.slice(0, 10),
    summary: d.value.demand,
    isProcessing: processing,
    isClosed: !processing,
    isComplaint: false,
  });
  hist.totalCount += 1;
  if (processing) hist.processingCount += 1;
  else hist.closedCount += 1;
}

// 工单本身带关联售后单（「已转出」态）：载入即把售后单挂进关联单列表与客户历史，
// 否则坐席在冻结的底栏之外找不到那张在跑的售后单。
watch(
  () => d.value.linkedAftersale?.no,
  (no) => { if (no) syncAftersaleRelatedCard(false); },
  { immediate: true },
);

/** 产研反馈 Tab · 二次激活 */
function onFeishuActivate(reason: string) {
  dispatch({ type: '激活飞书', data: { reason } });
}

/** 产研反馈 Tab · 关联失败后重新发起升级 */
function onFeishuRetry() {
  actionBarRef.value?.openEscalate();
}

function toast(name: string) {
  message.info(`「${name}」`);
}

function formatNow() {
  const n = new Date();
  const hh = String(n.getHours()).padStart(2, '0');
  const mm = String(n.getMinutes()).padStart(2, '0');
  const ss = String(n.getSeconds()).padStart(2, '0');
  return `今天 ${hh}:${mm}:${ss}`;
}

function onIncomingTicketEvent(
  type: TicketLiveEventType,
  content: string,
  who: string,
  options?: { supplementType?: string; notify?: boolean },
) {
  const when = formatNow();
  const recordId = `${type === 'urge' ? 'd' : 's'}-${Date.now()}`;
  if (type === 'urge') {
    tabData.value.dunningRecords.unshift({
      id: recordId,
      who,
      when,
      content,
      read: false,
      contacted: false,
    });
    d.value.insight.dunningCount += 1;
  } else {
    tabData.value.supplementRecords.unshift({
      id: recordId,
      who,
      when,
      supplementType: options?.supplementType ?? '问题描述补充',
      content,
      read: false,
      contacted: false,
    });
    d.value.insight.supplementCount += 1;
  }

  if (options?.notify !== false && pageActive.value) {
    pushLiveToast(type, content, who, when, options?.supplementType, recordId);
  }
}

/** 标记催单/补充为已知晓，并同步统计宫格计数 */
function markRecordAcknowledged(rec: { read?: boolean }, isDunning: boolean) {
  if (rec.read) return;
  rec.read = true;
  const ins = d.value.insight;
  if (isDunning) ins.dunningReadCount = (ins.dunningReadCount ?? 0) + 1;
  else ins.supplementReadCount = (ins.supplementReadCount ?? 0) + 1;
}

/**
 * ※24 关闭 / 强结拦截（PRD-830 §10.2）：
 * 工单发生过**客户侧催单 / 新建补充**后，须存在**该次催补之后的联系记录**才允许关闭或强结。
 *
 * 判据就是每条催补记录上的 `contacted` —— 它由 syncContactedAfterOutreach() 在坐席
 * 对客联系（电话 / 短信 / 邮件）时自动置上，**没有手动入口**：手动等于把拦截条件
 * 交给被拦的人自己解除，约束就不存在了。
 *
 * ⚠️ 只看客户侧两类记录。我方「补录处理记录」不进 supplementRecords，
 * 因此不会置上这个拦截、也不会解除它。
 * ⚠️ 「已知晓」（read）**不参与判断** —— 点开看过不算处理完。
 */
const pendingCsRecords = computed(() => [
  ...tabData.value.dunningRecords.filter((r) => !r.contacted),
  ...tabData.value.supplementRecords.filter((r) => !r.contacted),
]);
const closeBlockedByOutreach = computed(() => pendingCsRecords.value.length > 0);
const CLOSE_BLOCK_TIP = '客户催单/补充后尚未联系客户，请先联系再关闭';

/** 对客联系后自动置已联系，并连带已知晓（PRD §10.1） */
function syncContactedAfterOutreach() {
  for (const rec of tabData.value.dunningRecords) {
    if (!rec.contacted) {
      rec.contacted = true;
      markRecordAcknowledged(rec, true);
    }
  }
  for (const rec of tabData.value.supplementRecords) {
    if (!rec.contacted) {
      rec.contacted = true;
      markRecordAcknowledged(rec, false);
    }
  }
}

function onMarkRecordRead(id: string) {
  const dRec = tabData.value.dunningRecords.find((r) => r.id === id);
  const rec = dRec ?? tabData.value.supplementRecords.find((r) => r.id === id);
  if (!rec || rec.read) return;
  markRecordAcknowledged(rec, !!dRec);
}

function onToastMarkRead(item: TicketLiveToast) {
  if (item.recordId) onMarkRecordRead(item.recordId);
  dismissLiveToast(item.id);
}

function onLiveToastClick() {
  processTabsRef.value?.switchTab('related');
}

/** 原型演示：刷新后每 5 秒推送 1 条，共 3 条后停止（联调前替代 WebSocket） */
const DEMO_MAX_COUNT = 3;
const DEMO_INTERVAL_MS = 5_000;
let incomingDemoInterval: ReturnType<typeof setInterval> | null = null;
let incomingDemoTimeout: ReturnType<typeof setTimeout> | null = null;
let demoFiredCount = 0;

const DEMO_INCOMING_EVENTS: Array<{
  type: TicketLiveEventType;
  content: string;
  supplementType?: string;
}> = [
  { type: 'supplement', content: '设备插电后指示灯不亮,疑似主板供电模块故障', supplementType: '问题描述补充' },
  { type: 'urge', content: '要求今日内安排上门处理' },
  { type: 'supplement', content: '客户补充：已尝试更换电源线，问题依旧', supplementType: '问题描述补充' },
];

function stopIncomingDemo() {
  if (incomingDemoInterval) {
    clearInterval(incomingDemoInterval);
    incomingDemoInterval = null;
  }
  if (incomingDemoTimeout) {
    clearTimeout(incomingDemoTimeout);
    incomingDemoTimeout = null;
  }
}

function fireDemoEvent() {
  const item = DEMO_INCOMING_EVENTS[demoFiredCount % DEMO_INCOMING_EVENTS.length];
  const who = MOCK_FIRST_LINE_AGENTS[demoFiredCount % MOCK_FIRST_LINE_AGENTS.length];
  onIncomingTicketEvent(item.type, item.content, who, {
    supplementType: item.supplementType,
  });
  demoFiredCount += 1;
  if (demoFiredCount >= DEMO_MAX_COUNT) {
    stopIncomingDemo();
  }
}

function startIncomingDemo() {
  stopIncomingDemo();
  if (demoFiredCount >= DEMO_MAX_COUNT) return;

  incomingDemoTimeout = setTimeout(() => {
    incomingDemoTimeout = null;
    if (!pageActive.value || demoFiredCount >= DEMO_MAX_COUNT) return;
    fireDemoEvent();
    if (demoFiredCount < DEMO_MAX_COUNT) {
      incomingDemoInterval = setInterval(() => {
        if (!pageActive.value) return;
        fireDemoEvent();
      }, DEMO_INTERVAL_MS);
    }
  }, DEMO_INTERVAL_MS);
}

function pauseLiveNotify() {
  pageActive.value = false;
  stopIncomingDemo();
  dismissAllLiveToasts();
}

function resumeLiveNotify() {
  pageActive.value = true;
  startIncomingDemo();
}

watch(ticketNo, () => {
  demoFiredCount = 0;
  if (pageActive.value) startIncomingDemo();
});

onActivated(() => {
  resumeLiveNotify();
});

onDeactivated(() => {
  pauseLiveNotify();
});

onBeforeUnmount(() => {
  pauseLiveNotify();
});

/**
 * 客户侧催补落单后的**共同副作用**（PRD-830 §7.2 拉回 + §9 计数标识）。
 * 新建补充与催单都走这里 —— 两者副作用一致，差别只在记录去向与文案。
 *
 * 做三件事：
 * 1. **拉回处理节点**：调研中→撤回本次下送 / 审核中4态→撤回本次申请 / 已挂起→解除挂起，
 *    都回「处理中」，并写一条履历说明原因（不写的话坐席看不出状态为什么自己变了）。
 *    已升级 / 已委派 / 已转出**不拉回**。
 * 2. **置行内 Tag 与催补待回标记**：hasDunning / hasSupplement 供列表行标识；
 *    contactedAfterUrge 复位为 false —— 新的一次催补必须重新联系一次才算回应。
 * 3. **SLA 不动**：解决钟接着跑、不重置不回拨（反复催单不能刷新时效），故此处不碰 SLA。
 */
function applyCsEventSideEffects(kind: 'supplement' | 'urge') {
  // ① 拉回
  const pull = pullbackOnCsEvent(d.value.status as TicketStatus);
  if (pull) {
    const from = d.value.status;
    d.value.status = pull.to;
    timeline.value.unshift({
      id: `tl-cs-${Date.now()}`,
      kind: 'node',
      title: pull.why,
      who: '系统',
      when: formatNow(),
      what: `${pull.why}：${from} → ${pull.to}。SLA 解决钟接着跑，不重置。`,
    } as never);
  }
  // ② 行内 Tag + 催补待回：新的一次催补 → 复位为「未联系」
  const row = TICKETS.find((t) => t.no === d.value.no);
  if (row) {
    if (kind === 'urge') row.hasDunning = true;
    else row.hasSupplement = true;
    row.contactedAfterUrge = false;
  }
}

function onSupplementSubmit(payload: {
  supplementType: string;
  content: string;
  attachments: string[];
  complaintCategories?: { cat1: string; cat2: string }[];
  complaintChannels?: { platform: string; complaintNo: string; complaintContent: string }[];
}) {
  onIncomingTicketEvent('supplement', payload.content, formatTicketRecordWho(user.name, user.roleKey), {
    supplementType: payload.supplementType,
    notify: false,
  });
  const record = tabData.value.supplementRecords[0];
  if (record && payload.attachments.length) {
    record.attachments = payload.attachments;
  }

  // 「补充投诉信息」的两项补录：投诉分类只追加一组，投诉渠道记录逐条追加。
  // 都是**只追加、不覆盖**——原有记录一条不动（PRD-830 §5.3）。
  if (payload.complaintCategories?.length) {
    d.value.complaint.categories = [
      ...d.value.complaint.categories,
      ...payload.complaintCategories,
    ];
  }
  if (payload.complaintChannels?.length) {
    d.value.complaint.platforms = [
      ...d.value.complaint.platforms,
      ...payload.complaintChannels.map((c) => ({
        platform: c.platform,
        complaintNo: c.complaintNo,
        complaintContent: c.complaintContent,
        fromSupplement: true,
      })),
    ];
  }

  applyCsEventSideEffects('supplement');
  processTabsRef.value?.switchTab('related');
  message.success(
    payload.complaintChannels?.length
      ? `补充信息已提交，已追加 ${payload.complaintChannels.length} 条投诉渠道记录`
      : '补充信息已提交',
  );
}

function onDunningSubmit(payload: { content: string; attachments: string[] }) {
  const who = formatTicketRecordWho(user.name, user.roleKey);
  onIncomingTicketEvent('urge', payload.content, who, { notify: false });
  const record = tabData.value.dunningRecords[0];
  if (record && payload.attachments.length) {
    record.attachments = payload.attachments;
  }
  // 已关联产研反馈：与「关联/补充/催单」同步写一条到产研反馈时间线
  const sync = d.value.feishuSync;
  if (sync && sync !== 'none' && sync !== 'failed') {
    const when = record?.when ?? formatNow();
    d.value.feishuRecords = [
      ...(d.value.feishuRecords ?? []),
      {
        id: `fs-dunning-${Date.now()}`,
        kind: 'dunning',
        title: '催单 · 请产研尽快跟进',
        content: payload.content || '坐席发起催单',
        who,
        side: '客服工单',
        when,
        meta: '催单',
      },
    ];
  }
  processTabsRef.value?.switchTab('related');
  applyCsEventSideEffects('urge');
  message.success('催单信息已提交');
}

function formatCancelReason(reason: string, remark: string) {
  return remark ? `${reason}：${remark}` : reason;
}

function onCancelSubmit(payload: { reason: string; remark: string }) {
  dispatch({ type: '取消工单', reason: formatCancelReason(payload.reason, payload.remark) });
}

/**
 * 原单已终态（含升级投诉后的关闭）时，补充/催单不能直接落在原单上——
 * 按《【815】关联投诉 PRD》§5.2：基于原单建新单（新单号）+ 新单关联原单，再在新单上补充/催单。
 * @returns true = 已接管本次点击（走建新单），调用方不再打开原单弹窗
 */
function confirmCarryOnNewTicket(kind: '补充' | '催单'): boolean {
  if (!isTicketTerminated(d.value.status)) return false;
  // 因**升级**而关闭 → 业务在新单上，引导过去，不再建第三张单（Zendesk 合并口径）
  if (supersededBy.value) {
    const target = supersededBy.value;
    Modal.confirm({
      title: `本单已升级为 ${target.no}`,
      content: `${kind}信息应落在新单上，避免落到已作废的旧单。是否前往新单？`,
      okText: '前往新单',
      cancelText: '取消',
      onOk: () => openRelation(target),
    });
    return true;
  }
  Modal.confirm({
    title: `原单已${d.value.status}，无法直接${kind}`,
    content: `将基于原单 ${d.value.no} 新建工单（新单号）并关联原单，${kind}信息落在新单上。是否继续？`,
    okText: '基于原单建新单',
    cancelText: '取消',
    onOk: () => openReopenCreate(),
  });
  return true;
}

function onHeaderAction(name: string) {
  switch (name) {
    case '升级投诉': // 非投诉→建单页；投诉单→小弹窗（《【815】关联投诉 PRD》§4.2）
      openEscalate();
      break;
    case '关联售后': // 投诉工单：打开售后建单弹窗
      actionBarRef.value?.openAftersale();
      break;
    case '新建补充':
      if (confirmCarryOnNewTicket('补充')) return;
      supplementModalOpen.value = true;
      break;
    case '催单':
      if (confirmCarryOnNewTicket('催单')) return;
      dunningModalOpen.value = true;
      break;
    case '取消工单':
      cancelModalOpen.value = true;
      break;
    default:
      toast(name);
  }
}

function copyNo() {
  message.success('工单号已复制');
}

function updateForm(next: ProcessFormDraft) {
  form.value = next;
}

function updateTabData(next: OperationTabData) {
  tabData.value = next;
}

/** 处理表单 / 技术支持「处理结果」→ 速览带「最新处理」及时回写 */
function syncLatestHandlingFromDrafts() {
  d.value.latestHandling = mergeDraftIntoLatestHandling(d.value.latestHandling, {
    processResult: form.value.processResult,
    techProcessResult: tabData.value.techDraft.processResult,
    processWho: user.name || '当前坐席',
    processRole: mapUserRole(user.roleKey),
    techWho: '技术支持',
  });
  // 同步列表行预览文案
  const listTicket = TICKETS.find((t) => t.no === d.value.no);
  if (listTicket) {
    listTicket.latestHandling = d.value.latestHandling[0]?.text ?? '';
  }
}

watch(
  [
    () => form.value.processResult,
    () => tabData.value.techDraft.processResult,
    () => d.value.no,
  ],
  () => syncLatestHandlingFromDrafts(),
  { immediate: true },
);
</script>

<template>
  <div class="op-page">
    <OpHeader
      :detail="d"
      :ticket-no="ticketNo"
      :readonly="pageReadonly"
      :can-supplement="canSupplement"
      :can-dunning="canDunning"
      :can-escalate-complaint="canEscalateComplaint"
      :can-link-aftersale="canLinkAftersale"
      :can-cancel-ticket="canCancelTicket"
      :customer-entry-locked="customerEntryLocked"
      :superseded-by="supersededBy"
      @copy-no="copyNo"
      @action="onHeaderAction"
      @open-relation="openRelation"
      @open-superseded="supersededBy && openRelation(supersededBy)"
    />

    <!-- 顶部通栏速览带：客户诉求 | 客户全景宫格 | 最新处理（关注信息一屏） -->
    <div class="op-overview-wrap" :class="{ elevated: overviewExpanded }">
      <OpOverviewBand :detail="d" @select="onOverviewSelect" @expand-change="overviewExpanded = $event">
        <template #live-notify>
          <TicketEventToastStack
            v-if="pageActive"
            embedded
            :items="liveToasts"
            @dismiss="dismissLiveToast"
            @click="onLiveToastClick"
            @mark-read="onToastMarkRead"
          />
        </template>
      </OpOverviewBand>
    </div>

    <div class="op-body">
      <div class="op-main">
        <OpProcessTabs
          ref="processTabsRef"
          :detail="d"
          :tab-data="tabData"
          :form="form"
          :timeline="timeline"
          :expanded-sections="expandedSections"
          :active-chip="activeChip"
          :filled-supplement-count="filledSupplementCount"
          :readonly="tabsReadonly"
          @toggle-section="toggleSection"
          @select-chip="selectChip"
          @update:form="updateForm"
          @update:tab-data="updateTabData"
          @open-child-create="openChildCreate"
          @open-reopen-create="openReopenCreate"
          @mark-read="onMarkRecordRead"
          @feishu-activate="onFeishuActivate"
          @feishu-retry="onFeishuRetry"
          @dunning="dunningModalOpen = true"
        />
      </div>

      <OpSidePanel
        :detail="d"
        @contact="onContact"
        @action="toast"
      />
    </div>

    <!--
      一线视角演示单：隐藏底部流转操作栏（下送/升级/调剂/委派/挂起/关闭/强结属二线权限）。
      组件本身仍挂载——头部「关联售后」等动作复用它内部的弹窗。
    -->
    <OpActionBar
      ref="actionBarRef"
      :hide-bar="hideActionBar"
      :ticket-no="ticketNo"
      :ticket-title="d.title"
      :ticket-type="d.type"
      :after-sale-enabled="d.product.afterSaleEnabled"
      :op-state="opState"
      :suspend-info="suspendInfo"
      :draft-saved-at="draftSavedAt"
      :return-count="d.returnCount ?? 0"
      :feishu-eligible="feishuEligible"
      :feishu-sync="d.feishuSync"
      :aftersale-context="aftersaleContext"
      :aftersale-inbound="isAftersaleInbound(d)"
      :service-type="form.serviceType"
      :service-method="form.serviceMethod"
      :problem-cause="form.problemCause"
      :process-result="form.processResult"
      :delegate-targets="d.delegateInfo?.targets"
      :at-tech-support="d.status.includes('已升级·三线技术支持')"
      :close-blocked="closeBlockedByOutreach"
      :close-blocked-tip="CLOSE_BLOCK_TIP"
      @action="onAction"
      @cancel="cancelModalOpen = true"
      @withdraw="confirmWithdraw"
      @transfer-ticket="openChildCreate"
    />

    <CreateTicketModal
      v-model:open="createOpen"
      :prefill="createPrefill"
      @created="onTicketCreated"
    />

    <OpStatDetailModal
      :open="statModalKey !== null"
      :table="statTable"
      :width="statModalWidth"
      :view-all-label="statViewAllLabel"
      @update:open="(v) => { if (!v) statModalKey = null; }"
      @open-ticket="onStatOpenTicket"
      @view-all="onStatViewAll"
    />

    <OpSupplementModal
      v-model:open="supplementModalOpen"
      :ticket-type="d.type"
      :complaint-type="d.complaint.complaintType"
      :ticket-source="d.source"
      :existing-platforms="d.complaint.platforms"
      :existing-categories="d.complaint.categories"
      :is-external-appeal="d.isExternalAppeal"
      @submit="onSupplementSubmit"
    />

    <OpDunningModal
      v-model:open="dunningModalOpen"
      @submit="onDunningSubmit"
    />

    <OpCancelModal
      v-model:open="cancelModalOpen"
      @submit="onCancelSubmit"
    />

    <OpEscalateComplaintModal
      v-model:open="escalateModalOpen"
      :detail="d"
      @submit="onEscalateSubmit"
    />

    <OpSmsModal
      v-model:open="smsModalOpen"
      :phone="smsPhone"
      :ctx="notifyCtx"
      @submit="onSmsSubmit"
    />

    <OpEmailModal
      v-model:open="emailModalOpen"
      :email="emailTo"
      :ctx="notifyCtx"
      @submit="onEmailSubmit"
    />

  </div>
</template>

<style scoped>
/* 填满外壳滚动容器，头部 + 速览带常驻，主体区独立滚动 → 关注信息一屏 */
.op-page {
  --op-block-gap: 12px;
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  background: #f9fafb;
}
.op-overview-wrap {
  flex: none;
  padding: 10px 20px 0;
  position: relative;
  z-index: 1;
}
.op-overview-wrap.elevated { z-index: 50; }
.op-body {
  display: flex;
  gap: var(--op-block-gap);
  padding: 10px 20px 12px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}
.op-main {
  flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column;
}
</style>
