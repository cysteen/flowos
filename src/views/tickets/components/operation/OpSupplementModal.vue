<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Select as ASelect } from 'ant-design-vue';
import { FileAddOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import OpTextareaAttach from './shared/OpTextareaAttach.vue';
import { SUPPLEMENT_TYPE_OPTIONS } from '@/views/tickets/types/operationTabs';

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: { supplementType: string; content: string; attachments: string[] }];
}>();

const supplementType = ref<string | undefined>(undefined);
const content = ref('');
const attachments = ref<string[]>([]);

const typeOptions = SUPPLEMENT_TYPE_OPTIONS.map((v) => ({ value: v, label: v }));

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    supplementType.value = undefined;
    content.value = '';
    attachments.value = [];
  },
);

function close() {
  emit('update:open', false);
}

const canSubmit = computed(() => !!supplementType.value && !!content.value.trim());

function onSubmit() {
  if (!canSubmit.value) return;
  emit('submit', {
    supplementType: supplementType.value!,
    content: content.value.trim(),
    attachments: [...attachments.value],
  });
  close();
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="新建补充"
    :icon="FileAddOutlined"
    tone="primary"
    ok-text="提交补充"
    :ok-disabled="!canSubmit"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
    @cancel="close"
  >
    <div class="op-form">
      <div class="op-field">
        <div class="op-label req">补充类型</div>
        <ASelect
          v-model:value="supplementType"
          :options="typeOptions"
          placeholder="请选择补充类型"
          style="width:100%"
          allow-clear
        />
      </div>

      <div class="op-field">
        <div class="op-label req">补充内容</div>
        <OpTextareaAttach
          v-model="content"
          :attachments="attachments"
          :min-input-height="96"
          placeholder="请简要描述本次补充的信息…"
          @update:attachments="attachments = $event"
        />
      </div>
    </div>
  </OpActionModal>
</template>
