<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { BellOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import OpTextareaAttach from './shared/OpTextareaAttach.vue';

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: { content: string; attachments: string[] }];
}>();

const content = ref('');
const attachments = ref<string[]>([]);

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    content.value = '';
    attachments.value = [];
  },
);

function close() {
  emit('update:open', false);
}

const canSubmit = computed(() => !!content.value.trim());

function onSubmit() {
  if (!canSubmit.value) return;
  emit('submit', { content: content.value.trim(), attachments: [...attachments.value] });
  close();
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="催单"
    :icon="BellOutlined"
    tone="warn"
    ok-text="提交催单"
    :ok-disabled="!canSubmit"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
    @cancel="close"
  >
    <div class="op-form">
      <div class="op-field">
        <div class="op-label req">催单信息</div>
        <OpTextareaAttach
          v-model="content"
          :attachments="attachments"
          :min-input-height="96"
          placeholder="请填写催单说明，如客户诉求、紧急程度等…"
          @update:attachments="attachments = $event"
        />
      </div>
    </div>
  </OpActionModal>
</template>
