<script setup lang="ts">
import { ref } from 'vue';
import { FileTextOutlined } from '@ant-design/icons-vue';
import OpCollapsibleSection from '../OpCollapsibleSection.vue';
import OpRecordFields from '../OpRecordFields.vue';
import type { TechProcessDraft } from '@/views/tickets/types/operationTabs';

defineProps<{
  draft: TechProcessDraft;
  /**
   * 本 Tab 对当前角色只读。矩阵 #42：④ ⑤ ⑨ 可用、① ⑧ 只读、② ③ ⑥ ⑦ 无（整个 Tab 不渲染）。
   * 本 Tab 通篇是写区（问题原因 / 处理结果 + 附件），只读态下正文框与附件入口都不给。
   */
  readonly?: boolean;
}>();
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
        :readonly="readonly"
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
  gap: 12px;
  width: 100%;
}
</style>
