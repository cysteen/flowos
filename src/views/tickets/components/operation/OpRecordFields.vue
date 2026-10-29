<script setup lang="ts">
import OpTextareaAttach from './shared/OpTextareaAttach.vue';

withDefaults(defineProps<{
  problemCause: string;
  processResult: string;
  problemCauseAttachments: string[];
  processResultAttachments: string[];
  /** 只读：两个正文框不可编辑、附件入口不出（原生 textarea 拦不住 antd 的 component-disabled） */
  readonly?: boolean;
  /** 是否出「问题原因」（含其附件）；建议 / 商机单只留处理结果 */
  showProblemCause?: boolean;
  /** 字段名前加必填红星（只标识，不做拦截） */
  required?: boolean;
}>(), {
  readonly: false,
  showProblemCause: true,
  required: false,
});

const emit = defineEmits<{
  'update:problemCause': [value: string];
  'update:processResult': [value: string];
  'update:problemCauseAttachments': [files: string[]];
  'update:processResultAttachments': [files: string[]];
}>();
</script>

<template>
  <div class="record-fields">
    <div v-if="showProblemCause" class="field">
      <label><span v-if="required" class="req">*</span>问题原因</label>
      <OpTextareaAttach
        :model-value="problemCause"
        :attachments="problemCauseAttachments"
        :readonly="readonly"
        :shell-background="readonly ? '#f5f5f5' : '#fff'"
        placeholder="描述问题原因…"
        @update:model-value="(v) => emit('update:problemCause', v)"
        @update:attachments="(v) => emit('update:problemCauseAttachments', v)"
      />
    </div>

    <div class="field">
      <label><span v-if="required" class="req">*</span>处理结果</label>
      <OpTextareaAttach
        :model-value="processResult"
        :attachments="processResultAttachments"
        :readonly="readonly"
        :shell-background="readonly ? '#f5f5f5' : '#fff'"
        placeholder="描述处理结果…"
        @update:model-value="(v) => emit('update:processResult', v)"
        @update:attachments="(v) => emit('update:processResultAttachments', v)"
      />
    </div>
  </div>
</template>

<style scoped>
.record-fields { display: flex; flex-direction: column; gap: 10px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 12px; font-weight: 600; color: #374151; }
.field label .req { color: #ef4444; margin-right: 2px; }
</style>
