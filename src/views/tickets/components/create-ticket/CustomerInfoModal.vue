<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { CustomerInfo } from '@/views/tickets/types/createTicket';
import { MOCK_CUSTOMER } from '@/views/tickets/types/createTicket';
import FormSelect from './FormSelect.vue';

const props = defineProps<{
  open: boolean;
  editing: boolean;
  initial?: CustomerInfo | null;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  save: [customer: CustomerInfo];
}>();

const draft = reactive({
  name: '',
  phone: '',
  vip: false,
  customerType: '个人客户',
  gender: '男',
  region: '',
  address: '',
});

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    const src = props.editing && props.initial ? props.initial : null;
    draft.name = src?.name ?? '';
    draft.phone = src?.phone ?? '';
    draft.vip = src?.vip ?? false;
    draft.customerType = src?.customerType ?? '个人客户';
    draft.gender = src?.gender ?? '男';
    draft.region = src?.region ?? '';
    draft.address = src?.address ?? '';
  },
);

function onCancel() {
  emit('update:open', false);
}

function onSave() {
  emit('save', {
    id: props.initial?.id ?? 'c-' + Date.now(),
    name: draft.name.trim() || '新客户',
    phone: draft.phone.trim() || '未填写',
    vip: draft.vip,
    customerType: draft.customerType,
    gender: draft.gender,
    region: draft.region.trim(),
    address: draft.address.trim(),
  });
}
</script>

<template>
  <a-modal
    :open="open"
    :title="editing ? '编辑客户' : '新建客户'"
    :width="480"
    ok-text="保存"
    cancel-text="取消"
    destroy-on-close
    @cancel="onCancel"
    @ok="onSave"
  >
    <div class="form">
      <div class="field">
        <label class="label"><span class="req">*</span>姓名</label>
        <a-input v-model:value="draft.name" placeholder="客户姓名" />
      </div>
      <div class="field">
        <label class="label"><span class="req">*</span>手机号</label>
        <a-input v-model:value="draft.phone" placeholder="11 位手机号" />
      </div>
      <div class="field">
        <label class="label">客户类型</label>
        <FormSelect
          v-model:value="draft.customerType"
          class="full"
          :options="['个人客户', '企业客户'].map((v) => ({ value: v, label: v }))"
        />
      </div>
      <div class="field">
        <label class="label">性别</label>
        <FormSelect
          v-model:value="draft.gender"
          class="full"
          :options="['男', '女', '未知'].map((v) => ({ value: v, label: v }))"
        />
      </div>
      <div class="field">
        <label class="label">VIP</label>
        <a-switch v-model:checked="draft.vip" />
      </div>
      <div class="field">
        <label class="label"><span class="req">*</span>省市区</label>
        <a-input v-model:value="draft.region" placeholder="如 安徽省/合肥市/蜀山区" />
      </div>
      <div class="field">
        <label class="label"><span class="req">*</span>详细地址</label>
        <a-input v-model:value="draft.address" placeholder="街道门牌号" />
      </div>
      <p v-if="!editing" class="hint">保存后将自动选中该客户并回填至工单</p>
      <p v-else class="hint">示例默认客户：{{ MOCK_CUSTOMER.name }}</p>
    </div>
  </a-modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
.hint {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
}
</style>
