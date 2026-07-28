<script setup lang="ts">
import { computed, defineAsyncComponent, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { useWorkspaceTabsStore, resolveTicketTabTitle } from '@/stores/workspaceTabs';
import { useCtiStore } from '@/stores/cti';
import { useUserStore } from '@/stores/user';
import OpHeader from './components/operation/OpHeader.vue';
import OpOverviewBand from './components/operation/OpOverviewBand.vue';
import OpStatDetailModal from './components/operation/OpStatDetailModal.vue';
import OpSupplementModal from './components/operation/OpSupplementModal.vue';
import OpDunningModal from './components/operation/OpDunningModal.vue';
import OpCancelModal from './components/operation/OpCancelModal.vue';
import OpSmsModal from './components/operation/OpSmsModal.vue';
import OpEmailModal from './components/operation/OpEmailModal.vue';
import TicketEventToastStack from './components/operation/TicketEventToastStack.vue';
import OpProcessTabs from './components/operation/OpProcessTabs.vue';
import OpSidePanel from './components/operation/OpSidePanel.vue';
import OpActionBar from './components/OpActionBar.vue';
// 建单弹窗仅在「转单/重开」时用，按需异步加载，不阻塞操作页首屏
const CreateTicketModal = defineAsyncComponent(() => import('./components/CreateTicketModal.vue'));
import { useTicketOperation } from './composables/useTicketOperation';
import { FEISHU_ESCALATE_CHANNEL, mapUserRole, isAftersaleSettled } from './composables/opActions';
import { useProcessForm } from './composables/useProcessForm';
import { useOperationTabs } from './composables/useOperationTabs';
import { useTicketLiveNotify } from './composables/useTicketLiveNotify';
import { formatTicketRecordWho, MOCK_FIRST_LINE_AGENTS } from './utils/ticketRecordWho';
import { mergeDraftIntoLatestHandling } from './utils/ticketOverview';
import { TICKETS } from '@/mock/tickets';
import { buildChildTicketPrefill, buildReopenTicketPrefill } from './composables/childTicketPrefill';
import type { CreateTicketPrefill, Ticket } from './types/ticket';
import type { ProcessFormDraft, InsightAction, InsightModalKey } from './types/operation';
import type { ProcessTabKey } from './types/operation';
import type { OperationTabData } from './types/operationTabs';
import type { TicketLiveEventType, TicketLiveToast } from './types/ticketLiveNotify';

const route = useRoute();
const router = useRouter();
const {
  detail: d, timeline, opState, suspendInfo, draftSavedAt,
  dispatch, confirmWithdraw, addChildTicket, addReopenTicket,
} = useTicketOperation();
const {
  form, activeChip, expandedSections, filledSupplementCount,
  toggleSection, selectChip,
} = useProcessForm(() => d.value.type);
const { tabData } = useOperationTabs(() => d.value.type);
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

// 联系客户：短信 / 邮件弹窗（统一走 OpActionModal 风格）
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
  // email
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
  if (!statModalKey.value) return;
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

function onTicketCreated(ticket: Ticket, processAfter?: boolean) {
  if (createPrefill.value?.mode === 'child') addChildTicket(ticket);
  else if (createPrefill.value?.mode === 'reopen') addReopenTicket(ticket);
  if (processAfter) router.push(`/tickets/${ticket.no}`);
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

/** 转售后后：把 1:1 关联售后单同步进「关联单」列表（售后来源卡片，点击深链跳转） */
function syncAftersaleRelatedCard() {
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
  processTabsRef.value?.switchTab('related');
}

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
    });
    d.value.insight.supplementCount += 1;
  }

  if (options?.notify !== false && pageActive.value) {
    pushLiveToast(type, content, who, when, options?.supplementType, recordId);
  }
}

/** 标记催单/补充记录为已读，并同步统计宫格的「已读」计数 */
function onMarkRecordRead(id: string) {
  const dRec = tabData.value.dunningRecords.find((r) => r.id === id);
  const rec = dRec ?? tabData.value.supplementRecords.find((r) => r.id === id);
  if (!rec || rec.read) return;
  rec.read = true;
  const ins = d.value.insight;
  if (dRec) ins.dunningReadCount = (ins.dunningReadCount ?? 0) + 1;
  else ins.supplementReadCount = (ins.supplementReadCount ?? 0) + 1;
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

function onSupplementSubmit(payload: { supplementType: string; content: string; attachments: string[] }) {
  onIncomingTicketEvent('supplement', payload.content, formatTicketRecordWho(user.name, user.roleKey), {
    supplementType: payload.supplementType,
    notify: false,
  });
  const record = tabData.value.supplementRecords[0];
  if (record && payload.attachments.length) {
    record.attachments = payload.attachments;
  }
  processTabsRef.value?.switchTab('related');
  message.success('补充信息已提交');
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
  message.success('催单信息已提交');
}

function formatCancelReason(reason: string, remark: string) {
  return remark ? `${reason}：${remark}` : reason;
}

function onCancelSubmit(payload: { reason: string; remark: string }) {
  dispatch({ type: '取消工单', reason: formatCancelReason(payload.reason, payload.remark) });
}

function onHeaderAction(name: string) {
  switch (name) {
    case '关联投诉': // 非诉工单：关联投诉，关原单建 B 投诉单（详见《【815】关联投诉 PRD》）
      openChildCreate();
      break;
    case '关联售后': // 投诉工单：打开售后建单弹窗
      actionBarRef.value?.openAftersale();
      break;
    case '新建补充':
      supplementModalOpen.value = true;
      break;
    case '催单':
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
      @copy-no="copyNo"
      @action="onHeaderAction"
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

    <OpActionBar
      ref="actionBarRef"
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
      :service-type="form.serviceType"
      :service-method="form.serviceMethod"
      :problem-cause="form.problemCause"
      :process-result="form.processResult"
      :delegate-targets="d.delegateInfo?.targets"
      :at-tech-support="d.status.includes('已升级·二线')"
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
