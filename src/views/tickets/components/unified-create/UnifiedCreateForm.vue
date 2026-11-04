<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useRouter } from 'vue-router';
import { WarningOutlined } from '@ant-design/icons-vue';
import type { CreateTicketPrefill, Priority, Ticket } from '@/views/tickets/types/ticket';
import { isTicketClosed } from '@/views/tickets/types/ticket';
import type { CreateFormTicketType } from '@/views/tickets/types/createTicket';
import {
  BUSINESS_TYPES,
  CREATE_TICKET_TYPES,
  PRIORITY_OPTIONS,
  PRODUCT_CATEGORIES,
  complaintPlatformsBySource,
  ticketSourceOptionsForRole,
} from '@/views/tickets/types/createTicket';
import { CREATE_COMPLAINT_L2_MAP } from '@/views/tickets/types/complaintCreateCategory';
import { useCreateTicketForm } from '@/views/tickets/composables/useCreateTicketForm';
import type { AftersaleContext } from '@/views/tickets/composables/opActions';
import { UNIFIED_CREATE_PATH, type UnifiedCreateScene } from '@/views/tickets/composables/unifiedCreateEntry';
import { XIAOZHI_TIP, XIAOZHI_TOAST } from '@/views/tickets/types/xiaozhi';
import OpTextareaAttach from '@/views/tickets/components/operation/shared/OpTextareaAttach.vue';
import AftersaleCreateForm from '@/views/tickets/components/operation/AftersaleCreateForm.vue';
import { TICKETS } from '@/mock/tickets';
import { useDispatchStore } from '@/stores/dispatch';
import { useProblemTagsStore } from '@/stores/problemTags';
import { useTicketDraftStore } from '@/stores/ticketDrafts';
import { useUserStore } from '@/stores/user';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';
import CreateTicketPartCard from '../create-ticket/CreateTicketPartCard.vue';
import FormSelect from '../create-ticket/FormSelect.vue';
import FlashInfoPart from '../create-ticket/FlashInfoPart.vue';
import RefundInfoPart from '../create-ticket/RefundInfoPart.vue';
import XiaozhiInfoPart from '../create-ticket/XiaozhiInfoPart.vue';
import UnifiedComplaintPart from './UnifiedComplaintPart.vue';
import UnifiedCustomerPart from './UnifiedCustomerPart.vue';

const props = defineProps<{ scene: UnifiedCreateScene }>();

const router = useRouter();
const tabs = useWorkspaceTabsStore();
const userStore = useUserStore();
const draftStore = useTicketDraftStore();
const problemTags = useProblemTagsStore();

const prefill: CreateTicketPrefill | null = props.scene === 'xiaozhi' ? { xiaozhiScene: true } : null;
const ctx = useCreateTicketForm(() => prefill, { twoLevelProblem: true });
const {
  form,
  errors,
  submitting,
  problemL1Options,
  problemL2Options,
  problemL3Options,
  productNameOptions,
  showTypePart,
  hidesSnAndDesc,
  isFlashType,
  isRefundType,
  isXiaozhiType,
  flashErrors,
  flashBlock,
  refundErrors,
  xiaozhiErrors,
  onTitleInput,
  onProductNameChange,
  validate,
  buildTicket,
  submitFlash,
  submitRefund,
  submitXiaozhi,
  applyPrefill,
  applyXiaozhiFrontlineDefault,
} = ctx;

if (prefill) {
  applyPrefill(prefill);
  void nextTick(() => applyXiaozhiFrontlineDefault(true));
}

/* ---------------- 问题分类：不带首项，换上级即清下级 ---------------- */

// 同步执行：要赶在表单内部「分类回落首项」的监听之前把下级清掉
watch(() => form.productName, () => { form.problemL1 = ''; }, { flush: 'sync' });
watch(() => form.problemL1, () => { form.problemL2 = ''; }, { flush: 'sync' });
watch(() => form.problemL2, () => { form.problemL3 = ''; }, { flush: 'sync' });

const l3Options = computed(() => problemL3Options.value.filter(Boolean));
/** 选到二级后，该路径有没有三级（无线音乐类分类只到二级） */
const hasL3 = computed(() => l3Options.value.length > 0);

/** 售后：选到末级，且本产品这条分类的专属类型为售后 */
const isAftersaleType = computed(() => {
  if (isXiaozhiType.value || !form.problemL1 || !form.problemL2) return false;
  if (hasL3.value && !form.problemL3) return false;
  return problemTags.enabledRows.some((r) => r.exclusive === '售后'
    && r.productName === form.productName
    && r.tagL1 === form.problemL1 && r.tagL2 === form.problemL2 && r.tagL3 === form.problemL3);
});

/* ---------------- 切回通用：恢复命中前的工单类型与业务类型 ---------------- */

let beforeHit: { ticketType: typeof form.ticketType; businessType: typeof form.businessType } | null = null;
// 同步执行：要赶在表单内部把类型强改为咨询之前记下原值
watch(
  () => isFlashType.value || isRefundType.value,
  (hit) => {
    if (hit) {
      beforeHit = { ticketType: form.ticketType, businessType: form.businessType };
    } else if (beforeHit) {
      form.ticketType = beforeHit.ticketType;
      form.businessType = beforeHit.businessType;
      beforeHit = null;
    }
  },
  { flush: 'sync' },
);

/* ---------------- 优先级、工单类型、来源（与建单弹窗同一规则） ---------------- */

const HIGH_PRIORITIES: Priority[] = ['P0', 'P1'];
const LOW_PRIORITIES: Priority[] = ['P2', 'P3'];

function prioritiesFor(type: CreateFormTicketType | ''): Priority[] | null {
  if (!type || type === '投诉') return null;
  return LOW_PRIORITIES;
}
function typesFor(priority: Priority | ''): CreateFormTicketType[] {
  if (!priority) return [...CREATE_TICKET_TYPES];
  return HIGH_PRIORITIES.includes(priority) ? ['投诉'] : [...CREATE_TICKET_TYPES];
}
const ticketTypeOptions = computed(() => typesFor(form.priority).map((v) => ({ value: v, label: v })));
const priorityOptions = computed(() => {
  const allowed = prioritiesFor(form.ticketType);
  return PRIORITY_OPTIONS.filter((p) => !allowed || allowed.includes(p.value))
    .map((p) => ({ value: p.value, label: p.label }));
});
watch(
  () => form.priority,
  () => {
    if (!form.priority || !form.ticketType) return;
    const types = typesFor(form.priority);
    if (!types.includes(form.ticketType)) form.ticketType = types[0];
  },
);
watch(
  () => form.ticketType,
  () => {
    if (!form.priority || !form.ticketType) return;
    const allowed = prioritiesFor(form.ticketType);
    if (allowed && !allowed.includes(form.priority)) {
      form.priority = priorityOptions.value[0]?.value ?? allowed[allowed.length - 1];
    }
  },
);
const ticketSourceOptions = computed(() => ticketSourceOptionsForRole(userStore.roleKey, form.ticketSource));
const lockBusinessAndType = computed(() => isFlashType.value || isXiaozhiType.value || isRefundType.value);

// 投诉卡切走时不挂载，这两条联动放在表单这一层常驻
watch(
  () => form.ticketSource,
  () => {
    const allowed = complaintPlatformsBySource(form.ticketSource);
    if (form.complaintPlatforms.some((r) => r.platform && !allowed.includes(r.platform))) {
      form.complaintPlatforms = [{ platform: '', complaintNo: '' }];
    }
  },
);
watch(
  () => form.complaintL1,
  () => {
    const opts = CREATE_COMPLAINT_L2_MAP[form.complaintL1] ?? [];
    if (!opts.includes(form.complaintL2)) form.complaintL2 = form.complaintL2 ? (opts[0] ?? '') : '';
  },
);

/* ---------------- 底栏提示 ---------------- */

const createPrimaryLabel = computed(() => (isXiaozhiType.value && form.xiaozhi.escalateTpd ? '创建并流转TPD' : '创建'));

function ticketHref(no: string): string {
  return router.resolve(`/tickets/${no}`).href;
}
const duplicateTickets = computed<Ticket[]>(() => {
  const phone = (form.customer?.phone ?? '').replace(/\s/g, '');
  if (!phone || !form.productName) return [];
  return TICKETS.filter((t) => (t.customerPhone ?? '').replace(/\s/g, '') === phone
    && t.product === form.productName
    && !t.archived
    && !isTicketClosed(t.nodeStatus));
});

/* ---------------- 售后：内嵌售后建单页 ---------------- */

/** 售后建单页接到新的预填会重写表单：只在客户或产品的取值真的变了才换，重取同一份档案不算 */
function buildAftersaleContext(): AftersaleContext {
  return {
    // 该标记在售后建单页上只决定「转出说明」显隐：统一建单没有原单可转出
    isComplaint: true,
    customerName: form.customer?.name ?? '',
    customerPhone: form.customer?.phone ?? '',
    region: form.customer?.region ?? '',
    address: form.customer?.address ?? '',
    productCategory: form.productCategory,
    productName: form.productName,
  };
}
const aftersaleContext = shallowRef<AftersaleContext>(buildAftersaleContext());
watch(
  () => JSON.stringify(buildAftersaleContext()),
  () => { aftersaleContext.value = buildAftersaleContext(); },
);
const aftersaleForm = ref<InstanceType<typeof AftersaleCreateForm> | null>(null);

function aftersaleNo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `AS-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${Math.floor(Date.now() % 90000) + 10000}`;
}

function onConfirmAftersale() {
  if (!aftersaleForm.value?.getPayload()) {
    scrollToFirstError();
    return;
  }
  message.success(`售后单 ${aftersaleNo()} 已创建`);
  void leaveTo('/home');
}

/* ---------------- 提交 ---------------- */

const root = ref<HTMLElement | null>(null);
const ERROR_SELECTOR = [
  '.fi-error', '.ri-error', '.xz-error', '.as-err', '.customer-empty.error', '.cust-phone-error',
  '.flash-block-tip', '.ant-select-status-error', '.ant-input-status-error', '.desc-attach.has-error',
].join(', ');
function scrollToFirstError() {
  requestAnimationFrame(() => {
    root.value?.querySelector(ERROR_SELECTOR)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

/** 先落到目标页再关页签：当前页签已不是激活页，关闭时不会再跳到相邻页签 */
async function leaveTo(path: string) {
  await router.push(path);
  await nextTick();
  tabs.close(UNIFIED_CREATE_PATH);
}

function onCancel() {
  tabs.close(UNIFIED_CREATE_PATH);
}

function onDraft() {
  draftStore.save({
    id: `draft-${Date.now()}`,
    title: form.title || '未命名草稿',
    typeLabel: form.ticketType || '工单',
    customerName: form.customer?.name || '未选择客户',
    savedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    form: JSON.parse(JSON.stringify(form)),
  });
  message.success('已存草稿，可在工作台「草稿箱」继续编辑');
  onCancel();
}

function onCreate(processAfter = false) {
  submitting.value = true;
  try {
    if (isXiaozhiType.value) {
      const res = submitXiaozhi();
      if (!res) return scrollToFirstError();
      if (res.degraded) message.warning(XIAOZHI_TIP.rdPlatformDownOnCreate);
      else message.success(res.escalated ? XIAOZHI_TOAST.createdAndEscalated(res.ticket.no) : XIAOZHI_TOAST.created(res.ticket.no));
      void leaveTo(`/tickets/${res.ticket.no}`);
      return;
    }
    if (isFlashType.value) {
      const res = submitFlash();
      if (!res) return scrollToFirstError();
      message.success(
        res.evaluation.route === 'auto' && res.ticket.nodeStatus === '自动刷机中'
          ? `已创建刷机单 ${res.ticket.no}，正在自动刷机`
          : `已创建刷机单 ${res.ticket.no}，已转人工处理`,
      );
      void leaveTo(`/tickets/${res.ticket.no}`);
      return;
    }
    if (isRefundType.value) {
      const res = submitRefund();
      if (!res) return scrollToFirstError();
      message.success(res.message);
      void leaveTo(`/tickets/${res.ticket.no}`);
      return;
    }
    if (!validate()) return scrollToFirstError();
    const ticket = buildTicket();
    // 「创建」进入派单；「创建并处理」由建单人自行处理
    if (!processAfter) useDispatchStore().dispatchNewTicket(ticket, {});
    if (!TICKETS.some((x) => x.no === ticket.no)) TICKETS.unshift(ticket);
    message.success(`工单 ${ticket.no} 已创建，进入处理页`);
    void leaveTo(`/tickets/${ticket.no}`);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div ref="root" class="uc-page">
    <div class="uc-body">
      <!-- ① 工单基础 -->
      <CreateTicketPartCard title="工单基础">
        <div class="row-3">
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>业务类型</label>
            <FormSelect
              v-model:value="form.businessType"
              class="inline-control field-control"
              :disabled="lockBusinessAndType"
              :status="errors.businessType ? 'error' : ''"
              :options="BUSINESS_TYPES.map((v) => ({ value: v, label: v }))"
            />
          </div>
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>产品分类</label>
            <FormSelect
              v-model:value="form.productCategory"
              class="inline-control field-control"
              :status="errors.productCategory ? 'error' : ''"
              :options="PRODUCT_CATEGORIES.map((v) => ({ value: v, label: v }))"
            />
          </div>
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>产品名称</label>
            <FormSelect
              :key="form.productCategory"
              v-model:value="form.productName"
              class="inline-control field-control"
              :status="errors.productName ? 'error' : ''"
              :disabled="!productNameOptions.length"
              :placeholder="productNameOptions.length ? '请选择' : '请先选分类'"
              :options="productNameOptions.map((v) => ({ value: v, label: v }))"
              @change="onProductNameChange"
            />
          </div>
        </div>

        <div class="row-3">
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>问题一类</label>
            <FormSelect
              v-model:value="form.problemL1"
              class="inline-control field-control"
              :disabled="!form.productName"
              :status="errors.problemL1 ? 'error' : ''"
              :placeholder="form.productName ? '请选择' : '请先选产品'"
              :options="problemL1Options.map((v) => ({ value: v, label: v }))"
            />
          </div>
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>问题二类</label>
            <FormSelect
              v-model:value="form.problemL2"
              class="inline-control field-control"
              :disabled="!form.problemL1"
              :status="errors.problemL2 ? 'error' : ''"
              placeholder="请选择"
              :options="problemL2Options.map((v) => ({ value: v, label: v }))"
            />
          </div>
          <div class="inline-field">
            <label class="inline-label xl"><span v-if="hasL3 || !form.problemL2" class="req">*</span>问题三类</label>
            <FormSelect
              v-model:value="form.problemL3"
              class="inline-control field-control"
              :disabled="!hasL3"
              :status="errors.problemL3 ? 'error' : ''"
              placeholder="请选择"
              :options="l3Options.map((v) => ({ value: v, label: v }))"
            />
          </div>
        </div>

        <div v-if="!isAftersaleType" class="row-3">
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>优先级</label>
            <FormSelect
              v-model:value="form.priority"
              class="inline-control field-control"
              allow-clear
              :status="errors.priority ? 'error' : ''"
              :options="priorityOptions"
            />
          </div>
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>工单类型</label>
            <FormSelect
              v-model:value="form.ticketType"
              class="inline-control field-control"
              allow-clear
              :disabled="lockBusinessAndType"
              :status="errors.ticketType ? 'error' : ''"
              :options="ticketTypeOptions"
            />
          </div>
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>工单来源</label>
            <FormSelect
              v-model:value="form.ticketSource"
              class="inline-control field-control"
              :disabled="isXiaozhiType"
              :options="ticketSourceOptions"
            />
          </div>
        </div>
      </CreateTicketPartCard>

      <!-- ② 客户信息 -->
      <UnifiedCustomerPart :ctx="ctx" />

      <!-- ③ 工单详情 -->
      <CreateTicketPartCard v-if="isAftersaleType" title="工单详情">
        <AftersaleCreateForm ref="aftersaleForm" :context="aftersaleContext" />
      </CreateTicketPartCard>
      <template v-else>
        <CreateTicketPartCard v-if="!hidesSnAndDesc" title="工单详情">
          <div class="detail-body">
            <div v-if="!isFlashType" class="inline-field sn-field">
              <label class="inline-label xl">设备SN</label>
              <a-input
                v-model:value="form.deviceSn"
                class="inline-control field-control"
                placeholder="请输入设备SN"
              />
            </div>
            <div class="inline-field desc-field">
              <label class="inline-label xl"><span class="req">*</span>问题描述</label>
              <div class="inline-control field-control desc-attach" :class="{ 'has-error': errors.description }">
                <OpTextareaAttach
                  v-model="form.description"
                  v-model:attachments="form.descriptionAttachments"
                  :min-input-height="60"
                  :placeholder="isXiaozhiType ? '请描述问题与诉求，可上传截图或文档' : '请描述客户反馈的问题与诉求'"
                />
              </div>
            </div>
          </div>
        </CreateTicketPartCard>
        <UnifiedComplaintPart v-if="showTypePart" :ctx="ctx" />
        <FlashInfoPart v-if="isFlashType" v-model:info="form.flash" :errors="flashErrors" :customer-region="form.customer?.region" />
        <XiaozhiInfoPart v-if="isXiaozhiType" v-model:info="form.xiaozhi" :errors="xiaozhiErrors" />
        <RefundInfoPart v-if="isRefundType" v-model:info="form.refund" :errors="refundErrors" :customer-region="form.customer?.region" />
      </template>

      <!-- ④ 标题 -->
      <CreateTicketPartCard v-if="!isFlashType && !isAftersaleType" compact>
        <div class="inline-field">
          <label class="inline-label title-label">工单标题</label>
          <a-input
            v-model:value="form.title"
            class="inline-control field-control"
            :status="errors.title ? 'error' : ''"
            :placeholder="isXiaozhiType ? '小智 · 产品名称 + 问题三级 + 工单来源' : '产品名称 + 问题三级 + 工单来源'"
            @input="onTitleInput"
          />
        </div>
      </CreateTicketPartCard>
    </div>

    <div class="uc-footer-wrap">
      <div v-if="isFlashType && flashBlock" class="flash-block-tip" role="alert">
        <template v-if="flashBlock.code === 'A2' && flashBlock.inflightNo">
          该设备已有在途刷机单
          <a
            class="flash-block-link"
            :href="ticketHref(flashBlock.inflightNo)"
            target="_blank"
            rel="noopener"
          >{{ flashBlock.inflightNo }}</a>，请勿重复提交
        </template>
        <template v-else>{{ flashBlock.message }}</template>
      </div>
      <div class="uc-footer">
        <div v-if="!isFlashType && !isXiaozhiType && !isAftersaleType && duplicateTickets.length" class="footer-hint">
          <WarningOutlined :style="{ color: '#F59E0B', fontSize: '13px' }" />
          <span>
            检测到疑似重复工单 {{ duplicateTickets.length }} 张：<template v-for="(t, i) in duplicateTickets.slice(0, 3)" :key="t.no"
            ><template v-if="i">、</template><a
              class="flash-block-link"
              :href="ticketHref(t.no)"
              target="_blank"
              rel="noopener"
            >{{ t.no }}</a></template><template v-if="duplicateTickets.length > 3"> 等</template>，请确认
          </span>
        </div>
        <div class="footer-btns">
          <button type="button" class="btn-ghost" @click="onCancel">取消</button>
          <template v-if="isAftersaleType">
            <button type="button" class="btn-primary" @click="onConfirmAftersale">确认</button>
          </template>
          <template v-else>
            <button type="button" class="btn-ghost" @click="onDraft">存草稿</button>
            <button type="button" class="btn-primary" :disabled="submitting" @click="onCreate(false)">
              {{ createPrimaryLabel }}
            </button>
            <button
              v-if="!isXiaozhiType && !isRefundType"
              type="button"
              class="btn-ghost"
              :disabled="submitting"
              @click="onCreate(true)"
            >
              创建并处理
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="./unified-create.css"></style>
