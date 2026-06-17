<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import {
  ThunderboltOutlined,
  SearchOutlined,
  PlusOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons-vue';
import type { Priority, Ticket, TicketType, Channel } from '@/views/tickets/types/ticket';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [v: boolean]; created: [t: Ticket] }>();

const APPS = ['集团客户服务平台', '开放平台', '企业版'];
const TYPES: TicketType[] = ['投诉', '报修', '咨询', '安装', '退换', '技术'];
const CHANNELS: Channel[] = ['在线客服', '电话', '邮件', '小程序', 'APP'];
const PRODUCTS = ['智能音箱 X1', '扫地机器人 R2', '空气净化器 P3', '蓝牙耳机 Air'];
const COMPLAINT_TYPES = ['产品质量', '服务态度', '物流问题', '其他'];
const SEVERITIES = ['高', '中', '低'];
const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'P0', label: 'P0（VIP + 紧急）' },
  { value: 'P1', label: 'P1（紧急）' },
  { value: 'P2', label: 'P2（普通）' },
  { value: 'P3', label: 'P3（低）' },
];
const EXPECT_TIMES = ['今日 18:00', '今日 20:00', '明日 12:00', '3 个工作日内'];

const form = reactive({
  app: '集团客户服务平台' as string | undefined,
  type: '投诉' as TicketType | undefined,
  channel: '在线客服' as Channel | undefined,
  customerQuery: '',
  product: '智能音箱 X1',
  sn: 'SN-X1-88421003',
  complaintType: '产品质量',
  severity: '高',
  desc: '在线播放频繁跳歌，重启无效，影响使用，要求尽快解决。',
  priority: 'P0' as Priority,
  expectTime: '今日 18:00',
});
const customerSelected = ref(true);
const snVerified = ref(true);
const aiAdopted = ref(false);
const assignAdopted = ref(false);
const errors = reactive({ app: false, type: false, channel: false, customer: false, desc: false });
const submitting = ref(false);

const showTypeFields = computed(() => form.type === '投诉');
const showAiBar = computed(() => form.desc.trim().length > 0);
const slaPreview = computed(() => {
  const map: Record<Priority, string> = {
    P0: '响应≤15min · 解决≤4h',
    P1: '响应≤30min · 解决≤8h',
    P2: '响应≤2h · 解决≤24h',
    P3: '响应≤4h · 解决≤48h',
  };
  return map[form.priority];
});

function reset() {
  form.app = '集团客户服务平台';
  form.type = '投诉';
  form.channel = '在线客服';
  form.customerQuery = '';
  form.product = '智能音箱 X1';
  form.sn = 'SN-X1-88421003';
  form.complaintType = '产品质量';
  form.severity = '高';
  form.desc = '在线播放频繁跳歌，重启无效，影响使用，要求尽快解决。';
  form.priority = 'P0';
  form.expectTime = '今日 18:00';
  customerSelected.value = true;
  snVerified.value = true;
  aiAdopted.value = false;
  assignAdopted.value = false;
  errors.app = errors.type = errors.channel = errors.customer = errors.desc = false;
}

function onCancel() {
  emit('update:open', false);
}

function genNo() {
  const n = Math.floor(10000 + Math.random() * 89999);
  return `LCMN-20260617-${n}`;
}

function validate(): boolean {
  errors.app = !form.app;
  errors.type = !form.type;
  errors.channel = !form.channel;
  errors.customer = !customerSelected.value;
  errors.desc = !form.desc.trim();
  if (errors.app || errors.type || errors.channel || errors.customer || errors.desc) {
    message.error('请填写必填项');
    return false;
  }
  return true;
}

function buildTicket(): Ticket {
  return {
    id: 'new-' + Date.now(),
    no: genNo(),
    type: form.type!,
    channel: form.channel!,
    title: form.desc.trim(),
    smartMarks: form.type === '投诉' ? ['升级'] : [],
    customer: '张小凡',
    vip: true,
    product: form.product,
    nodeStatus: '待受理',
    nodeStep: 1,
    nodeTotal: 5,
    priority: form.priority,
    slaText: form.priority === 'P0' ? '00:15:00' : '08:00:00',
    slaSub: '距超时',
    slaState: form.priority === 'P0' ? 'soon' : 'ok',
    slaMinutes: form.priority === 'P0' ? 15 : 480,
    assignee: assignAdopted.value ? '王坐席' : '张三',
    tab: 'mine',
  };
}

function onCreate(processAfter = false) {
  if (!validate()) return;
  submitting.value = true;
  const ticket = buildTicket();
  emit('created', ticket);
  message.success(
    processAfter ? `工单 ${ticket.no} 已创建，进入处理页（占位）` : `工单 ${ticket.no} 已创建`,
  );
  submitting.value = false;
  emit('update:open', false);
  reset();
}

function onDraft() {
  message.success('已存草稿（占位）');
  emit('update:open', false);
}

watch(
  () => form.type,
  () => {
    aiAdopted.value = false;
  },
);
</script>

<template>
  <a-modal
    :open="open"
    :width="720"
    :footer="null"
    :closable="false"
    class="create-ticket-modal"
    destroy-on-close
    @cancel="onCancel"
  >
    <!-- Header -->
    <div class="modal-header">
      <div class="modal-title-row">
        <span class="modal-title">新建工单</span>
        <span class="smart-tag">
          <ThunderboltOutlined :style="{ fontSize: '12px' }" />
          智能填单
        </span>
      </div>
      <CloseOutlined class="modal-close" @click="onCancel" />
    </div>

    <!-- Body -->
    <div class="modal-body">
      <!-- 应用 / 类型 / 渠道 -->
      <div class="row-3">
        <div class="field">
          <label class="label"><span class="req">*</span>应用</label>
          <a-select
            v-model:value="form.app"
            class="full"
            :status="errors.app ? 'error' : ''"
            :options="APPS.map((v) => ({ value: v, label: v }))"
          />
        </div>
        <div class="field">
          <label class="label"><span class="req">*</span>工单类型</label>
          <a-select
            v-model:value="form.type"
            class="full"
            :status="errors.type ? 'error' : ''"
            :options="TYPES.map((v) => ({ value: v, label: v }))"
          />
        </div>
        <div class="field">
          <label class="label"><span class="req">*</span>渠道</label>
          <a-select
            v-model:value="form.channel"
            class="full"
            :status="errors.channel ? 'error' : ''"
            :options="CHANNELS.map((v) => ({ value: v, label: v }))"
          />
        </div>
      </div>

      <!-- 客户 -->
      <div class="field">
        <label class="label"><span class="req">*</span>客户</label>
        <div class="customer-search-row">
          <div class="search-box">
            <SearchOutlined :style="{ color: '#9CA3AF', fontSize: '15px' }" />
            <input
              v-model="form.customerQuery"
              class="search-input"
              placeholder="搜索手机号 / 姓名 / 客户编号"
            />
          </div>
          <button type="button" class="btn-outline" @click="message.info('新建客户（占位）')">
            <PlusOutlined />
            新建客户
          </button>
        </div>
        <div v-if="customerSelected" class="customer-card">
          <div class="cust-avatar">张</div>
          <div class="cust-info">
            <div class="cust-name-row">
              <span class="cust-name">张小凡</span>
              <span class="vip-tag">VIP</span>
            </div>
            <div class="cust-meta">钻石会员 · 历史工单 12 单 · 近30天 3 单</div>
          </div>
          <span class="link" @click="customerSelected = false">更换</span>
        </div>
      </div>

      <!-- 产品 / SN -->
      <div class="row-2">
        <div class="field">
          <label class="label">关联产品</label>
          <a-select
            v-model:value="form.product"
            class="full"
            :options="PRODUCTS.map((v) => ({ value: v, label: v }))"
          />
        </div>
        <div class="field">
          <label class="label"><span class="req">*</span>SN 序列号</label>
          <div class="sn-row">
            <a-input v-model:value="form.sn" class="sn-input" />
            <span v-if="snVerified" class="sn-badge">校验成功</span>
          </div>
        </div>
      </div>

      <!-- 类型专属字段 -->
      <template v-if="showTypeFields">
        <div class="type-section-label">
          <i class="type-bar" />
          <span>「{{ form.type }}」工单专属字段（随工单类型动态加载）</span>
        </div>
        <div class="row-2">
          <div class="field">
            <label class="label"><span class="req">*</span>投诉类型</label>
            <a-select
              v-model:value="form.complaintType"
              class="full"
              :options="COMPLAINT_TYPES.map((v) => ({ value: v, label: v }))"
            />
          </div>
          <div class="field">
            <label class="label"><span class="req">*</span>严重程度</label>
            <a-select
              v-model:value="form.severity"
              class="full"
              :options="SEVERITIES.map((v) => ({ value: v, label: v }))"
            />
          </div>
        </div>
      </template>

      <!-- 客户诉求 -->
      <div class="field">
        <label class="label"><span class="req">*</span>客户诉求</label>
        <a-textarea v-model:value="form.desc" :rows="3" class="desc-area" />
        <div v-if="showAiBar" class="ai-bar">
          <ThunderboltOutlined :style="{ color: '#7C3AED', fontSize: '13px', flex: 'none' }" />
          <span class="ai-text">
            AI 已识别：类型={{ form.type }} · 紧急度 {{ form.severity }} · 关键词 跳歌/在线歌单/重启无效
          </span>
          <button
            type="button"
            class="ai-adopt"
            :class="{ adopted: aiAdopted }"
            @click="aiAdopted = true"
          >
            {{ aiAdopted ? '已采纳' : '采纳' }}
          </button>
        </div>
      </div>

      <!-- 优先级 / 期望时间 / SLA -->
      <div class="row-3 row-bottom">
        <div class="field">
          <label class="label"><span class="req">*</span>优先级</label>
          <a-select
            v-model:value="form.priority"
            class="full"
            :options="PRIORITIES.map((p) => ({ value: p.value, label: p.label }))"
          />
        </div>
        <div class="field">
          <label class="label">期望解决时间</label>
          <a-select
            v-model:value="form.expectTime"
            class="full"
            :options="EXPECT_TIMES.map((v) => ({ value: v, label: v }))"
          />
        </div>
        <div class="field">
          <label class="label">SLA 预览</label>
          <div class="sla-preview">
            <ClockCircleOutlined :style="{ color: '#D97706', fontSize: '13px' }" />
            <span>{{ slaPreview }}</span>
          </div>
        </div>
      </div>

      <!-- 智能分派建议 -->
      <div class="assign-box">
        <div class="assign-head">
          <span class="assign-title">
            <ThunderboltOutlined :style="{ color: '#7C3AED', fontSize: '14px' }" />
            智能分派建议
          </span>
          <span class="link" @click="message.info('改派 / 转工单池（占位）')">改派 / 转工单池</span>
        </div>
        <div class="assign-card">
          <div class="cust-avatar sm">王</div>
          <div class="assign-info">
            <div class="assign-name">投诉处理一组 · 王坐席</div>
            <div class="assign-meta">技能匹配 · 当前负载低 3/8 · SLA 达成 96%</div>
          </div>
          <button
            type="button"
            class="assign-adopt"
            :class="{ adopted: assignAdopted }"
            @click="assignAdopted = true"
          >
            {{ assignAdopted ? '已采纳' : '采纳' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="modal-footer">
      <div class="footer-hint">
        <WarningOutlined :style="{ color: '#F59E0B', fontSize: '13px' }" />
        <span>检测到疑似重复工单 1 张，请确认</span>
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
}
.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}
.smart-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #7c3aed;
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 4px;
  padding: 2px 8px;
}
.modal-close {
  font-size: 16px;
  color: #909399;
  cursor: pointer;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}

.row-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.row-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}
.row-bottom {
  align-items: end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.label {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}
.req {
  color: #f56c6c;
  margin-right: 2px;
}
.full {
  width: 100%;
}

.customer-search-row {
  display: flex;
  gap: 8px;
}
.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}
.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 13px;
  color: #374151;
  background: transparent;
}
.search-input::placeholder {
  color: #9ca3af;
}
.btn-outline {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  font-size: 13px;
  color: #1a6fff;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
}

.customer-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #f0f7ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
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
.cust-avatar.sm {
  width: 34px;
  height: 34px;
}
.cust-info {
  flex: 1;
  min-width: 0;
}
.cust-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cust-name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}
.vip-tag {
  font-size: 11px;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  padding: 1px 6px;
  border-radius: 4px;
}
.cust-meta {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 3px;
}
.link {
  font-size: 12px;
  font-weight: 500;
  color: #1a6fff;
  cursor: pointer;
  flex: none;
}

.sn-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sn-input {
  flex: 1;
}
.sn-badge {
  font-size: 11px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  border-radius: 3px;
  padding: 1px 6px;
  flex: none;
}

.type-section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}
.type-bar {
  display: inline-block;
  width: 3px;
  height: 13px;
  background: #1a6fff;
  border-radius: 2px;
}

.desc-area {
  font-size: 13px;
}

.ai-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 6px;
}
.ai-text {
  flex: 1;
  font-size: 12px;
  color: #6d28d9;
  line-height: 1.4;
}
.ai-adopt {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: #7c3aed;
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  cursor: pointer;
}
.ai-adopt.adopted {
  background: #a78bfa;
}

.sla-preview {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #d97706;
  min-height: 38px;
}

.assign-box {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.assign-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.assign-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.assign-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.assign-info {
  flex: 1;
  min-width: 0;
}
.assign-name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}
.assign-meta {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}
.assign-adopt {
  flex: none;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: #1a6fff;
  border: none;
  border-radius: 4px;
  padding: 5px 14px;
  cursor: pointer;
}
.assign-adopt.adopted {
  background: #60a5fa;
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
.btn-ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
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
.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .row-3,
  .row-2 {
    grid-template-columns: 1fr;
  }
}
</style>
