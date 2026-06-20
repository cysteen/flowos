<script setup lang="ts">
import OpTextareaAttach from './shared/OpTextareaAttach.vue';

withDefaults(defineProps<{
  problemCause: string;
  processResult: string;
  problemCauseAttachments: string[];
  processResultAttachments: string[];
  subHint?: string;
}>(), {
  subHint: '结案前必填',
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
    <div class="section-subhead">
      <span class="sub-title">问题原因与处理结果</span>
      <span class="sub-hint">{{ subHint }}</span>
    </div>

    <div class="field">
      <label>问题原因</label>
      <OpTextareaAttach
        :model-value="problemCause"
        :attachments="problemCauseAttachments"
        placeholder="描述问题原因…"
        @update:model-value="(v) => emit('update:problemCause', v)"
        @update:attachments="(v) => emit('update:problemCauseAttachments', v)"
      />
    </div>

    <div class="field">
      <label>处理结果</label>
      <OpTextareaAttach
        :model-value="processResult"
        :attachments="processResultAttachments"
        placeholder="描述处理结果…"
        @update:model-value="(v) => emit('update:processResult', v)"
        @update:attachments="(v) => emit('update:processResultAttachments', v)"
      />
    </div>
  </div>
</template>

<style scoped>
.record-fields { display: flex; flex-direction: column; gap: 12px; }
.section-subhead {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.sub-title { font-size: 12px; font-weight: 600; color: #111827; }
.sub-hint { font-size: 11px; color: #9ca3af; flex: none; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 12px; font-weight: 600; color: #374151; }
</style>
