<script setup lang="ts">
withDefaults(defineProps<{
  problemCause: string;
  processResult: string;
  subHint?: string;
}>(), {
  subHint: '结案前必填',
});

const emit = defineEmits<{
  'update:problemCause': [value: string];
  'update:processResult': [value: string];
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
      <a-textarea
        :value="problemCause"
        class="record-textarea"
        placeholder="描述问题原因…"
        @update:value="(v: string) => emit('update:problemCause', v)"
      />
    </div>
    <div class="field">
      <label>处理结果</label>
      <a-textarea
        :value="processResult"
        class="record-textarea"
        placeholder="描述处理结果…"
        @update:value="(v: string) => emit('update:processResult', v)"
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
.record-textarea :deep(textarea) {
  min-height: 88px;
  height: 88px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-size: 12px;
  line-height: 1.5;
  color: #374151;
  resize: vertical;
  box-shadow: none;
}
.record-textarea :deep(textarea::placeholder) { color: #6b7280; }
.record-textarea :deep(textarea:hover),
.record-textarea :deep(textarea:focus) {
  border-color: #e5e7eb;
  box-shadow: none;
}
</style>
