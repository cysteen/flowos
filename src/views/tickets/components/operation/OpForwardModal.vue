<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { VerticalAlignBottomOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';

const props = defineProps<{
  open: boolean;
  ticketTitle: string;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  confirm: [payload: { ticketTitle: string; resolved: boolean }];
}>();

const resolved = ref<boolean | undefined>(undefined);

watch(
  () => props.open,
  (v) => {
    if (v) resolved.value = undefined;
  },
);

function close() {
  emit('update:open', false);
}

const canSubmit = computed(() => resolved.value !== undefined);

function onSubmit() {
  if (!canSubmit.value) return;
  emit('confirm', {
    ticketTitle: props.ticketTitle,
    resolved: resolved.value!,
  });
  close();
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="下送审核"
    :icon="VerticalAlignBottomOutlined"
    tone="primary"
    ok-text="确定下送"
    :ok-disabled="!canSubmit"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
    @cancel="close"
  >
    <div class="op-form">
      <div class="fwd-box">
        <div class="fwd-box-label">工单名称</div>
        <div class="fwd-box-value">{{ ticketTitle }}</div>
      </div>

      <div class="op-field">
        <div class="op-label req">是否已经解决</div>
        <div class="fwd-radio-row">
          <label class="fwd-radio" :class="{ active: resolved === true }">
            <input v-model="resolved" type="radio" :value="true" />
            <span>是</span>
          </label>
          <label class="fwd-radio" :class="{ active: resolved === false }">
            <input v-model="resolved" type="radio" :value="false" />
            <span>否</span>
          </label>
        </div>
      </div>

      <div class="op-tip op-tip-info">确认下送后，工单将进入「待审核」状态。</div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.fwd-box {
  padding: 12px 14px; background: #f9fafb;
  border: 1px solid #e5e7eb; border-radius: 8px;
}
.fwd-box-label { font-size: 12px; color: #9ca3af; margin-bottom: 4px; }
.fwd-box-value { font-size: 14px; font-weight: 600; color: #111827; line-height: 1.5; }
.fwd-radio-row { display: flex; gap: 10px; }
.fwd-radio {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border: 1px solid #e5e7eb; border-radius: 8px;
  cursor: pointer; font-size: 13px; color: #374151;
  transition: border-color 0.12s, background 0.12s;
}
.fwd-radio input { margin: 0; }
.fwd-radio.active { border-color: #93c5fd; background: #eff6ff; color: #1a6fff; font-weight: 600; }
</style>
