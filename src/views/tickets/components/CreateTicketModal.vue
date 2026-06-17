<script setup lang="ts">
import { reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import type { Priority, Ticket, TicketType, Channel } from '@/views/tickets/types/ticket';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [v: boolean]; created: [t: Ticket] }>();

const APPS = ['智能音箱 X1', '扫地机器人 R2', '空气净化器 P3', '蓝牙耳机 Air', '开放平台', '企业版'];
const TYPES: TicketType[] = ['投诉', '报修', '咨询', '安装', '退换', '技术'];
const CHANNELS: Channel[] = ['在线客服', '电话', '邮件', '小程序', 'APP'];
const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3'];

const form = reactive({
  app: undefined as string | undefined,
  type: undefined as TicketType | undefined,
  channel: undefined as Channel | undefined,
  customer: '',
  product: '',
  desc: '',
  priority: 'P2' as Priority,
});
const errors = reactive({ app: false, type: false, channel: false });

const submitting = ref(false);

function reset() {
  form.app = undefined;
  form.type = undefined;
  form.channel = undefined;
  form.customer = '';
  form.product = '';
  form.desc = '';
  form.priority = 'P2';
  errors.app = errors.type = errors.channel = false;
}

function onCancel() {
  emit('update:open', false);
}

function genNo() {
  const n = Math.floor(10000 + Math.random() * 89999);
  return `LCMN-20260617-${n}`;
}

function onOk() {
  errors.app = !form.app;
  errors.type = !form.type;
  errors.channel = !form.channel;
  if (errors.app || errors.type || errors.channel) {
    message.error('请填写必填项：应用 / 工单类型 / 渠道');
    return;
  }
  submitting.value = true;
  const ticket: Ticket = {
    id: 'new-' + genNo(),
    no: genNo(),
    type: form.type!,
    channel: form.channel!,
    title: form.desc.trim() || '（新建工单）',
    smartMarks: [],
    customer: form.customer.trim() || '未命名客户',
    vip: false,
    product: form.product.trim() || form.app!,
    nodeStatus: '待受理',
    nodeStep: 1,
    nodeTotal: 5,
    priority: form.priority,
    slaText: '08:00:00',
    slaSub: '充足',
    slaState: 'ok',
    slaMinutes: 480,
    assignee: '张三',
    tab: 'mine',
  };
  emit('created', ticket);
  message.success(`工单 ${ticket.no} 创建成功`);
  submitting.value = false;
  emit('update:open', false);
  reset();
}
</script>

<template>
  <a-modal
    :open="open"
    title="新建工单"
    :width="560"
    :confirm-loading="submitting"
    ok-text="创建并处理"
    cancel-text="取消"
    @ok="onOk"
    @cancel="onCancel"
  >
    <a-form layout="vertical" class="create-form">
      <div class="grid-3">
        <a-form-item :validate-status="errors.app ? 'error' : ''">
          <template #label><span class="req">*</span> 应用</template>
          <a-select v-model:value="form.app" placeholder="请选择" :options="APPS.map((v) => ({ value: v }))" />
        </a-form-item>
        <a-form-item :validate-status="errors.type ? 'error' : ''">
          <template #label><span class="req">*</span> 工单类型</template>
          <a-select v-model:value="form.type" placeholder="请选择" :options="TYPES.map((v) => ({ value: v }))" />
        </a-form-item>
        <a-form-item :validate-status="errors.channel ? 'error' : ''">
          <template #label><span class="req">*</span> 渠道</template>
          <a-select v-model:value="form.channel" placeholder="请选择" :options="CHANNELS.map((v) => ({ value: v }))" />
        </a-form-item>
      </div>

      <div class="grid-2">
        <a-form-item label="客户">
          <a-input v-model:value="form.customer" placeholder="手机号 / 姓名 / 编号" allow-clear />
        </a-form-item>
        <a-form-item label="产品 / SN">
          <a-input v-model:value="form.product" placeholder="选填" allow-clear />
        </a-form-item>
      </div>

      <a-form-item label="诉求描述">
        <a-textarea v-model:value="form.desc" :rows="3" placeholder="填写客户诉求，作为工单首条对客记录" />
        <div class="ai-hint">💡 智能识别：粘贴客户描述可自动推荐类型、提取关键信息（原型占位）</div>
      </a-form-item>

      <a-form-item label="优先级">
        <a-radio-group v-model:value="form.priority" button-style="solid">
          <a-radio-button v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</a-radio-button>
        </a-radio-group>
        <span class="sla-preview">按所选类型，响应 ≤ 30min、解决 ≤ 8h（SLA 预览）</span>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<style scoped>
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.req {
  color: #ef4444;
  margin-right: 2px;
}
.ai-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #7c3aed;
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 6px;
  padding: 6px 10px;
}
.sla-preview {
  margin-left: 12px;
  font-size: 12px;
  color: #9ca3af;
}
</style>
