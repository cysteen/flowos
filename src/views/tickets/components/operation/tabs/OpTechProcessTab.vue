<script setup lang="ts">
import { ref } from 'vue';
import { FileTextOutlined } from '@ant-design/icons-vue';
import OpCollapsibleSection from '../OpCollapsibleSection.vue';
import OpRecordFields from '../OpRecordFields.vue';
import type { TechProcessDraft } from '@/views/tickets/types/operationTabs';

defineProps<{ draft: TechProcessDraft }>();
const emit = defineEmits<{ 'update:draft': [draft: TechProcessDraft] }>();

const expanded = ref(true);
</script>

<template>
  <div class="tech-tab-pane">
    <OpCollapsibleSection
      title="处理记录"
      :icon="FileTextOutlined"
      badge="必填"
      badge-variant="required"
      :expanded="expanded"
      @toggle="expanded = !expanded"
    >
      <OpRecordFields
        :problem-cause="draft.problemCause"
        :process-result="draft.processResult"
        :problem-cause-attachments="draft.problemCauseAttachments"
        :process-result-attachments="draft.processResultAttachments"
        @update:problem-cause="(v) => emit('update:draft', { ...draft, problemCause: v })"
        @update:process-result="(v) => emit('update:draft', { ...draft, processResult: v })"
        @update:problem-cause-attachments="(v) => emit('update:draft', { ...draft, problemCauseAttachments: v })"
        @update:process-result-attachments="(v) => emit('update:draft', { ...draft, processResultAttachments: v })"
      />
    </OpCollapsibleSection>
  </div>
</template>

<style scoped>
/* SAMBO：Tab 内容区 gap 16，仅含「处理记录区」 */
.tech-tab-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
</style>
