<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useTicketDraftStore } from '@/stores/ticketDrafts';
import {
  SearchOutlined,
  PlusOutlined,
  CloseOutlined,
  WarningOutlined,
  RightOutlined,
  UserAddOutlined,
} from '@ant-design/icons-vue';
import type { Ticket, CreateTicketPrefill } from '@/views/tickets/types/ticket';
import {
  BUSINESS_TYPES,
  CREATE_TICKET_TYPES,
  PRODUCT_CATEGORIES,
  PRIORITY_OPTIONS,
  TICKET_SOURCE_OPTIONS,
  COMPLAINT_PLATFORM_OPTIONS,
  BUSINESS_LINE_OPTIONS,
  PRIOR_FEEDBACK_OPTIONS,
  SERVICE_REVIEW_OPTIONS,
  COMPLAINT_L1_OPTIONS,
  COMPLAINT_L2_MAP,
  SUGGEST_L1_OPTIONS,
  SUGGEST_L2_MAP,
  formatCustomerSubline,
} from '@/views/tickets/types/createTicket';
import { useCreateTicketForm } from '@/views/tickets/composables/useCreateTicketForm';
import CreateTicketPartCard from './create-ticket/CreateTicketPartCard.vue';
import CustomerInfoModal from './create-ticket/CustomerInfoModal.vue';
import FormSelect from './create-ticket/FormSelect.vue';

const props = defineProps<{
  open: boolean;
  prefill?: CreateTicketPrefill | null;
  /** 从草稿箱「继续编辑」时传入草稿 id，提交/再次存草稿按此回写 */
  draftId?: string | null;
}>();

const draftStore = useTicketDraftStore();
const activeDraftId = ref<string | null>(null);

const emit = defineEmits<{
  'update:open': [v: boolean];
  created: [t: Ticket, processAfter?: boolean];
}>();

const {
  form,
  submitting,
  customerModalOpen,
  editingCustomer,
  errors,
  problemL1Options,
  problemL2Options,
  problemL3Options,
  productNameOptions,
  showTypePart,
  typePartSubtitle,
  customerAddressRequired,
  reset,
  applyPrefill,
  onTitleInput,
  onProductCategoryChange,
  onProductNameChange,
  onProblemL1Change,
  onProblemL2Change,
  searchCustomer,
  openCreateCustomer,
  openEditCustomer,
  saveCustomer,
  validate,
  buildTicket,
  syncTitle,
} = useCreateTicketForm(() => props.prefill);

const isChildMode = computed(() => props.prefill?.mode === 'child');
const isReopenMode = computed(() => props.prefill?.mode === 'reopen');
/** 升级投诉：原单升级建更高阶投诉新单（提交后关原单 + 双向关联） */
const isEscalateMode = computed(() => props.prefill?.mode === 'escalate');
const modalTitle = computed(() => {
  if (isChildMode.value) return '转单';
  if (isReopenMode.value) return '重新建单';
  if (isEscalateMode.value) return `升级投诉 · 新建${props.prefill?.escalateTarget ?? '投诉'}单`;
  return '新建工单';
});
const parentMetaLabel = computed(() => {
  if (isReopenMode.value) return 'Reopen 原单';
  if (isEscalateMode.value) return '升级自原单';
  return '关联主单';
});
const showParentInTitle = computed(
  () => (isChildMode.value || isReopenMode.value || isEscalateMode.value) && !!props.prefill?.parentNo,
);

const complaintL2Options = computed(
  () => COMPLAINT_L2_MAP[form.complaintL1] ?? [],
);
const suggestL2Options = computed(() => SUGGEST_L2_MAP[form.suggestL1] ?? []);

function onCancel() {
  emit('update:open', false);
}

function onCreate(processAfter = false) {
  if (!validate()) return;
  submitting.value = true;
  const ticket = buildTicket();
  emit('created', ticket, processAfter);
  let msg = `工单 ${ticket.no} 已创建${processAfter ? '，进入处理页' : ''}`;
  if (isChildMode.value) msg = `子工单 ${ticket.no} 已创建${processAfter ? '，进入处理页' : ''}`;
  else if (isReopenMode.value) msg = `Reopen 工单 ${ticket.no} 已创建${processAfter ? '，进入处理页' : ''}`;
  else if (isEscalateMode.value) {
    msg = `${props.prefill?.escalateTarget ?? '投诉'}单 ${ticket.no} 已创建，原单已关闭并双向关联`;
  }
  message.success(msg);
  // 由草稿提交 → 从草稿箱移除
  if (activeDraftId.value) { draftStore.remove(activeDraftId.value); activeDraftId.value = null; }
  submitting.value = false;
  emit('update:open', false);
  reset();
}

function onDraft() {
  const id = activeDraftId.value || 'draft-' + Date.now();
  activeDraftId.value = id;
  draftStore.save({
    id,
    title: form.title || '未命名草稿',
    typeLabel: form.ticketType || '工单',
    customerName: form.customer?.name || '未选择客户',
    savedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    form: JSON.parse(JSON.stringify(form)),
  });
  message.success('已存草稿，可在工作台「草稿箱」继续编辑');
  emit('update:open', false);
}

function toggleReporter() {
  form.showReporter = !form.showReporter;
}

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    const draft = props.draftId ? draftStore.get(props.draftId) : null;
    if (draft) {
      // 从草稿箱继续编辑：恢复表单快照
      reset();
      Object.assign(form, draft.form);
      syncTitle();
      activeDraftId.value = draft.id;
    } else if (props.prefill) {
      applyPrefill(props.prefill);
      activeDraftId.value = null;
    } else {
      reset();
      syncTitle();
      activeDraftId.value = null;
    }
  },
);

watch(
  () => form.complaintL1,
  () => {
    const opts = COMPLAINT_L2_MAP[form.complaintL1] ?? [];
    if (!opts.includes(form.complaintL2)) form.complaintL2 = opts[0] ?? '';
  },
);

watch(
  () => form.suggestL1,
  () => {
    const opts = SUGGEST_L2_MAP[form.suggestL1] ?? [];
    if (!opts.includes(form.suggestL2)) form.suggestL2 = opts[0] ?? '';
  },
);
</script>

<template>
  <a-modal
    :open="open"
    :width="800"
    :footer="null"
    :closable="false"
    class="create-ticket-modal"
    destroy-on-close
    @cancel="onCancel"
  >
    <div class="modal-header">
      <div class="modal-title-row">
        <span class="modal-title">{{ modalTitle }}</span>
        <template v-if="showParentInTitle">
          <span class="title-sep">·</span>
          <span class="title-parent" :class="{ reopen: isReopenMode, escalate: isEscalateMode }">
            <span class="tp-label">{{ parentMetaLabel }}</span>
            <span class="tp-no">{{ prefill?.parentNo }}</span>
            <span v-if="prefill?.parentTitle" class="tp-title">{{ prefill.parentTitle }}</span>
          </span>
        </template>
      </div>
      <CloseOutlined class="modal-close" @click="onCancel" />
    </div>

    <div class="modal-body">
      <!-- ① 工单基础：三字段单行三列（对齐 .pen yTou1 / m8cXVW） -->
      <CreateTicketPartCard title="工单基础">
        <div class="row-3 basic-row">
          <div class="inline-field basic-field">
            <label class="inline-label base"><span class="req">*</span>业务分类</label>
            <FormSelect
              v-model:value="form.businessType"
              class="inline-control field-control"
              size="middle"
              :status="errors.businessType ? 'error' : ''"
              :options="BUSINESS_TYPES.map((v) => ({ value: v, label: v }))"
            />
          </div>
          <div class="inline-field basic-field">
            <label class="inline-label base"><span class="req">*</span>工单类型</label>
            <FormSelect
              v-model:value="form.ticketType"
              class="inline-control field-control"
              size="middle"
              :status="errors.ticketType ? 'error' : ''"
              :options="CREATE_TICKET_TYPES.map((v) => ({ value: v, label: v }))"
            />
          </div>
          <div class="inline-field basic-field">
            <label class="inline-label base"><span class="req">*</span>工单来源</label>
            <FormSelect
              v-model:value="form.ticketSource"
              class="inline-control field-control"
              size="middle"
              :options="TICKET_SOURCE_OPTIONS.map((v) => ({ value: v, label: v }))"
            />
          </div>
        </div>
      </CreateTicketPartCard>

      <!-- ② 客户信息（对齐 .pen tvmVK / i67UL） -->
      <CreateTicketPartCard title="客户信息">
        <div class="customer-body">
          <div class="customer-toolbar">
            <div class="search-box" @keyup.enter="searchCustomer">
              <SearchOutlined :style="{ color: '#9CA3AF', fontSize: '15px' }" />
              <input
                v-model="form.customerQuery"
                class="search-input"
                placeholder="搜索手机号 / 姓名"
              />
            </div>
            <button type="button" class="btn-outline" @click="openCreateCustomer">
              <PlusOutlined />
              新建客户
            </button>
            <button type="button" class="btn-outline" @click="toggleReporter">
              <UserAddOutlined />
              新增代报人
            </button>
          </div>

          <div v-if="form.showReporter" class="reporter-row">
            <a-input v-model:value="form.reporter.name" placeholder="代报人姓名" />
            <a-input v-model:value="form.reporter.phone" placeholder="代报人手机" />
            <FormSelect
              v-model:value="form.reporter.relation"
              :options="['家属', '同事', '朋友', '其他'].map((v) => ({ value: v, label: v }))"
            />
          </div>

          <div
            v-if="form.customer"
            class="customer-card"
            :class="{ 'addr-missing': customerAddressRequired && errors.customerAddress }"
          >
            <div class="cust-avatar">{{ form.customer.name.slice(0, 1) }}</div>
            <div class="cust-info">
              <div class="cust-line1">
                <span class="cust-name">{{ form.customer.name }}</span>
                <span v-if="form.customer.vip" class="vip-tag">VIP</span>
                <span class="cust-phone">{{ form.customer.phone }}</span>
              </div>
              <div class="cust-line2">
                {{ formatCustomerSubline(form.customer) }}
                <span
                  v-if="customerAddressRequired && errors.customerAddress"
                  class="addr-warn"
                >
                  · * 省市区未填写
                </span>
              </div>
            </div>
            <div class="cust-actions">
              <span class="link" @click="openEditCustomer">编辑</span>
            </div>
          </div>
          <div v-else class="customer-empty" :class="{ error: errors.customer }">
            请搜索或新建客户
          </div>
        </div>
      </CreateTicketPartCard>

      <!-- ③ 产品问题（对齐 .pen BaY72 / OKN77） -->
      <CreateTicketPartCard title="产品问题">
        <div class="product-body">
        <div class="product-top-row">
          <div class="product-cascade">
            <div class="inline-field flex1">
              <label class="inline-label sm"><span class="req">*</span>产品分类</label>
              <FormSelect
                v-model:value="form.productCategory"
                class="inline-control field-control"
                size="middle"
                :status="errors.productCategory ? 'error' : ''"
                :options="PRODUCT_CATEGORIES.map((v) => ({ value: v, label: v }))"
                @change="onProductCategoryChange"
              />
            </div>
            <RightOutlined class="cascade-arrow" />
            <div class="inline-field flex1">
              <label class="inline-label sm"><span class="req">*</span>产品名称</label>
              <FormSelect
                :key="form.productCategory"
                v-model:value="form.productName"
                class="inline-control field-control"
                size="middle"
                :status="errors.productName ? 'error' : ''"
                :disabled="!productNameOptions.length"
                :placeholder="productNameOptions.length ? '请选择' : '请先选分类'"
                :options="productNameOptions.map((v) => ({ value: v, label: v }))"
                @change="onProductNameChange"
              />
            </div>
          </div>
          <div class="inline-field product-sn-field">
            <label class="inline-label xs">设备SN</label>
            <a-input
              v-model:value="form.deviceSn"
              class="inline-control field-control"
              size="middle"
              placeholder="请输入设备SN"
            />
          </div>
        </div>

        <div class="problem-cascade">
          <div class="inline-field flex1">
            <label class="inline-label sm"><span class="req">*</span>问题一类</label>
            <FormSelect
              v-model:value="form.problemL1"
              class="inline-control field-control"
              size="middle"
              :status="errors.problemL1 ? 'error' : ''"
              :options="problemL1Options.map((v) => ({ value: v, label: v }))"
              @change="onProblemL1Change"
            />
          </div>
          <RightOutlined class="cascade-arrow" />
          <div class="inline-field flex1">
            <label class="inline-label sm"><span class="req">*</span>问题二类</label>
            <FormSelect
              v-model:value="form.problemL2"
              class="inline-control field-control"
              size="middle"
              :status="errors.problemL2 ? 'error' : ''"
              :options="problemL2Options.map((v) => ({ value: v, label: v }))"
              @change="onProblemL2Change"
            />
          </div>
          <RightOutlined class="cascade-arrow" />
          <div class="inline-field flex1">
            <label class="inline-label sm"><span class="req">*</span>问题三类</label>
            <FormSelect
              v-model:value="form.problemL3"
              class="inline-control field-control"
              size="middle"
              :status="errors.problemL3 ? 'error' : ''"
              :options="problemL3Options.map((v) => ({ value: v, label: v }))"
            />
          </div>
        </div>

        <div class="inline-field priority-row">
          <label class="inline-label priority"><span class="req">*</span>优先级</label>
          <FormSelect
            v-model:value="form.priority"
            class="inline-control field-control"
            size="middle"
            :options="PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))"
          />
        </div>

        <div class="desc-block">
          <div class="desc-label-row">
            <span class="req">*</span>
            <span>问题描述</span>
          </div>
          <a-textarea
            v-model:value="form.description"
            :rows="3"
            :status="errors.description ? 'error' : ''"
            class="desc-area"
          />
          <div class="inline-field resolve-remark-row">
            <label class="inline-label remark">解决时间备注</label>
            <a-input
              v-model:value="form.resolveTimeRemark"
              class="inline-control field-control"
              placeholder="请备注用户期望的解决时间，如：今天下班前"
            />
          </div>
        </div>
        </div>
      </CreateTicketPartCard>

      <!-- ④ 类型专属 -->
      <CreateTicketPartCard
        v-if="showTypePart"
        :subtitle="typePartSubtitle"
        :body-gap="10"
      >
        <template v-if="form.ticketType === '投诉'">
          <div class="row-3">
            <!-- 投诉性质由投诉二类推导，只读带出（0730 口径），坐席只填投诉一类/二类 -->
            <div class="inline-field">
              <label class="inline-label md">投诉性质</label>
              <div class="inline-control field-control derived-box" :class="{ empty: !form.complaintType }">
                {{ form.complaintType || '选择投诉二类后自动判定' }}
              </div>
            </div>
            <div class="inline-field">
              <label class="inline-label md">投诉平台</label>
              <FormSelect
                v-model:value="form.complaintPlatform"
                class="inline-control field-control"
                :options="COMPLAINT_PLATFORM_OPTIONS.map((v) => ({ value: v, label: v }))"
              />
            </div>
            <div class="inline-field">
              <label class="inline-label lg"><span class="req">*</span>归属业务线</label>
              <FormSelect
                v-model:value="form.businessLine"
                class="inline-control field-control"
                :options="BUSINESS_LINE_OPTIONS.map((v) => ({ value: v, label: v }))"
              />
            </div>
          </div>
          <div class="row-3">
            <div class="inline-field">
              <label class="inline-label md"><span class="req">*</span>投诉编号</label>
              <a-input
                v-model:value="form.complaintNo"
                placeholder="外部平台单号"
                class="inline-control field-control"
              />
            </div>
            <div class="inline-field">
              <label class="inline-label xl"><span class="req">*</span>前期反馈</label>
              <FormSelect
                v-model:value="form.priorFeedback"
                class="inline-control field-control"
                :options="PRIOR_FEEDBACK_OPTIONS.map((v) => ({ value: v, label: v }))"
              />
            </div>
            <div class="inline-field">
              <label class="inline-label md"><span class="req">*</span>服务回溯</label>
              <FormSelect
                v-model:value="form.serviceReview"
                class="inline-control field-control"
                :options="SERVICE_REVIEW_OPTIONS.map((v) => ({ value: v, label: v }))"
              />
            </div>
          </div>
          <div class="row-3">
            <div class="inline-field">
              <label class="inline-label xl"><span class="req">*</span>投诉一类</label>
              <FormSelect
                v-model:value="form.complaintL1"
                class="inline-control field-control"
                :options="COMPLAINT_L1_OPTIONS.map((v) => ({ value: v, label: v }))"
              />
            </div>
            <div class="inline-field">
              <label class="inline-label xl"><span class="req">*</span>投诉二类</label>
              <FormSelect
                v-model:value="form.complaintL2"
                class="inline-control field-control"
                :options="complaintL2Options.map((v) => ({ value: v, label: v }))"
              />
            </div>
            <div class="inline-field">
              <label class="inline-label xl"><span class="req">*</span>问题发生时间</label>
              <a-input
                v-model:value="form.problemTime"
                class="inline-control field-control"
                :status="errors.problemTime ? 'error' : ''"
                placeholder="请选择问题发生时间"
              />
            </div>
          </div>
        </template>

        <template v-else-if="form.ticketType === '建议'">
          <div class="row-2">
            <div class="inline-field">
              <label class="inline-label xl"><span class="req">*</span>建议分类一级</label>
              <FormSelect
                v-model:value="form.suggestL1"
                class="inline-control field-control"
                :options="SUGGEST_L1_OPTIONS.map((v) => ({ value: v, label: v }))"
              />
            </div>
            <div class="inline-field">
              <label class="inline-label xl"><span class="req">*</span>建议分类二级</label>
              <FormSelect
                v-model:value="form.suggestL2"
                class="inline-control field-control"
                :options="suggestL2Options.map((v) => ({ value: v, label: v }))"
              />
            </div>
          </div>
        </template>

        <template v-else-if="form.ticketType === '咨询'">
          <div class="inline-field">
            <label class="inline-label xl"><span class="req">*</span>问题发生时间</label>
            <a-input
              v-model:value="form.problemTime"
              class="inline-control field-control"
              :status="errors.problemTime ? 'error' : ''"
              placeholder="请选择问题发生时间"
            />
          </div>
        </template>
      </CreateTicketPartCard>

      <!-- ⑤ 工单标题（无分区大标题，对齐 SlSwt） -->
      <CreateTicketPartCard compact>
        <div class="inline-field">
          <label class="inline-label title-label">工单标题</label>
          <a-input
            v-model:value="form.title"
            class="inline-control field-control"
            :status="errors.title ? 'error' : ''"
            placeholder="产品名称 + 问题三级 + 工单来源"
            @input="onTitleInput"
          />
        </div>
      </CreateTicketPartCard>
    </div>

    <div class="modal-footer">
      <div v-if="!isChildMode" class="footer-hint">
        <WarningOutlined :style="{ color: '#F59E0B', fontSize: '13px' }" />
        <span v-if="isReopenMode">新建工单将自动建立 Reopen 关联，原单状态不变</span>
        <span v-else>检测到疑似重复工单 1 张，请确认</span>
      </div>
      <div class="footer-btns">
        <button type="button" class="btn-ghost" @click="onCancel">取消</button>
        <button type="button" class="btn-ghost" @click="onDraft">存草稿</button>
        <button type="button" class="btn-ghost" :disabled="submitting" @click="onCreate(false)">
          创建
        </button>
        <button type="button" class="btn-primary" :disabled="submitting" @click="onCreate(true)">
          创建并处理
        </button>
      </div>
    </div>

    <CustomerInfoModal
      v-model:open="customerModalOpen"
      :editing="editingCustomer"
      :initial="form.customer"
      @save="saveCustomer"
    />
  </a-modal>
</template>

<style scoped>
:global(.create-ticket-modal .ant-modal-content) {
  padding: 0;
  border-radius: 10px;
  overflow: hidden;
}
:global(.create-ticket-modal .ant-modal-body) {
  padding: 0;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
}
.modal-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
  padding-right: 12px;
}
.modal-title {
  flex: none;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}
.title-sep {
  flex: none;
  color: #d1d5db;
  font-size: 14px;
}
.title-parent {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  color: #6b7280;
}
.tp-label { flex: none; color: #6d28d9; font-weight: 600; }
.tp-no { flex: none; color: #7c3aed; font-weight: 600; }
.tp-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #4b5563;
}
.title-parent.reopen .tp-label { color: #dc2626; }
.title-parent.reopen .tp-no { color: #ef4444; }
.title-parent.escalate .tp-label { color: #b45309; }
.title-parent.escalate .tp-no { color: #ea580c; }
.modal-close {
  font-size: 16px;
  color: #909399;
  cursor: pointer;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 24px 20px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}

.inline-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.inline-field.flex1 { flex: 1; }
.inline-label {
  flex: none;
  width: 76px;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  text-align: left;
}
.inline-label.sm { width: 60px; font-size: 12px; }
.inline-label.xs { width: 48px; font-size: 12px; }
.inline-label.md { width: 72px; font-size: 12px; }
.inline-label.lg { width: 84px; font-size: 12px; }
.inline-label.xl { width: 96px; font-size: 12px; }
.inline-label.title-label { width: 72px; font-size: 12px; }
.inline-label.priority {
  width: 64px;
  font-size: 13px;
}
.inline-label.base {
  width: 76px;
  font-size: 13px;
}
.field-control :deep(.ant-select-selector),
.field-control.ant-input {
  min-height: 32px;
}
.field-control :deep(.ant-select-selector) {
  align-items: center;
}
.priority-row {
  width: 100%;
}
.basic-row {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-items: center;
}
.basic-row .basic-field {
  min-width: 0;
  width: 100%;
}
.basic-row .inline-label.base {
  flex-shrink: 0;
  white-space: nowrap;
}
.basic-row :deep(.ant-select-single) {
  height: 32px;
}
.basic-row :deep(.ant-select-selector) {
  height: 32px !important;
  min-height: 32px !important;
}
.inline-control { flex: 1; min-width: 0; }
/* 推导值只读框（投诉性质）：与下拉同高，弱一档 */
.derived-box {
  display: flex; align-items: center;
  min-height: 32px; padding: 0 11px;
  font-size: 13px; color: #303133; font-weight: 500;
  background: #f7f8fa; border: 1px solid #dcdfe6; border-radius: 4px;
}
.derived-box.empty { color: #b0b4bb; font-weight: 400; }
.req { color: #f56c6c; margin-right: 2px; }

.row-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}
.row-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.row-bottom { align-items: end; }

.product-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.product-top-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.product-cascade {
  flex: 2;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}
.product-sn-field {
  flex: 1;
  min-width: 0;
}
.customer-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.customer-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: nowrap;
}
.search-box {
  flex: 1;
  min-width: 0;
  height: 35px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-sizing: border-box;
}
.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 13px;
  color: #374151;
  background: transparent;
}
.search-input::placeholder { color: #9ca3af; }
.btn-outline {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  height: 35px;
  font-size: 13px;
  color: #1a6fff;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 12px;
  cursor: pointer;
  white-space: nowrap;
  box-sizing: border-box;
}

.reporter-row {
  display: grid;
  grid-template-columns: 1fr 1fr 120px;
  gap: 8px;
}

.customer-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  padding: 10px;
  background: #f0f7ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  box-sizing: border-box;
}
.customer-card.addr-missing {
  border-color: #fca5a5;
}
.customer-empty {
  padding: 10px 12px;
  font-size: 12px;
  color: #9ca3af;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
}
.customer-empty.error {
  border-color: #fca5a5;
  color: #ef4444;
  background: #fef2f2;
}
.cust-avatar {
  width: 34px;
  height: 34px;
  border-radius: 17px;
  background: #1a6fff22;
  color: #1a6fff;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.cust-avatar.sm { width: 34px; height: 34px; }
.cust-info { flex: 1; min-width: 0; }
.cust-line1 {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.cust-name { font-size: 13px; font-weight: 600; color: #111827; }
.cust-phone { font-size: 12px; color: #6b7280; }
.vip-tag {
  font-size: 10px;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  padding: 1px 6px;
  border-radius: 3px;
  line-height: 1.4;
}
.cust-line2 {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 3px;
  line-height: 1.4;
}
.addr-warn { color: #ef4444; font-weight: 600; }
.cust-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  flex: none;
  align-self: stretch;
}
.link {
  font-size: 12px;
  font-weight: 500;
  color: #1a6fff;
  cursor: pointer;
  flex: none;
}

.problem-cascade {
  display: flex;
  align-items: center;
  gap: 4px;
}
.cascade-arrow {
  flex: none;
  font-size: 12px;
  color: #d1d5db;
  margin-top: 2px;
}

.sn-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.sn-badge {
  font-size: 11px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  border-radius: 3px;
  padding: 1px 6px;
  flex: none;
  white-space: nowrap;
}

.desc-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.desc-label-row {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}
.desc-area {
  font-size: 13px;
  min-height: 70px;
}
.resolve-remark-row {
  width: 100%;
}
.resolve-remark-row .inline-control {
  flex: 1;
}
.inline-label.remark {
  width: 84px;
  font-size: 12px;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 24px;
  border-top: 1px solid #f0f0f0;
}
.footer-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #9ca3af;
}
.footer-btns {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  margin-left: auto;
}
.btn-ghost {
  font-size: 13px;
  color: #374151;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 9px 18px;
  cursor: pointer;
}
.btn-ghost:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: #1a6fff;
  border: 1px solid #1a6fff;
  border-radius: 6px;
  padding: 9px 18px;
  cursor: pointer;
}
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

@media (max-width: 768px) {
  .row-3,
  .row-2,
  .reporter-row,
  .product-top-row {
    flex-direction: column;
    align-items: stretch;
  }
  .problem-cascade,
  .product-cascade {
    flex-direction: column;
    align-items: stretch;
  }
  .cascade-arrow {
    display: none;
  }
}
</style>
