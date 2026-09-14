<script setup lang="ts">
import { computed, ref } from 'vue';
import { MessageOutlined } from '@ant-design/icons-vue';
import OpCollapsibleSection from './OpCollapsibleSection.vue';
import type { ClosingNote } from '@/views/tickets/types/operation';

/**
 * 结案后备注（四类工单通用）：只追加、不可改删，结案前后均可添加。
 *
 * 控件的 disabled 显式由 `readonly` 决定 —— 外层处理表单在终态会整区禁用，
 * 本区是终态下仍可写的例外，不能继承那一档。
 */
const props = defineProps<{
  notes: ClosingNote[];
  expanded: boolean;
  /** 当前角色对「工单处理」Tab 不可写 / 整页锁死 */
  readonly?: boolean;
  /** 工单已是终态 */
  postClose?: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  add: [text: string];
}>();

const draft = ref('');
const canAdd = computed(() => !props.readonly && !!draft.value.trim());

/** 新的在上 */
const ordered = computed(() => [...props.notes].reverse());

function onAdd() {
  if (!canAdd.value) return;
  emit('add', draft.value.trim());
  draft.value = '';
}
</script>

<template>
  <OpCollapsibleSection
    title="结案后备注"
    :icon="MessageOutlined"
    :badge="notes.length ? String(notes.length) : (postClose ? '可追加' : '')"
    :badge-variant="notes.length ? 'count' : 'hint'"
    :expanded="expanded"
    @toggle="emit('toggle')"
  >
    <div v-if="!readonly" class="cn-editor">
      <a-textarea
        v-model:value="draft"
        :disabled="false"
        :rows="2"
        :maxlength="500"
        placeholder="补充结案后的跟进情况、客户反馈等，提交后不可修改"
      />
      <div class="cn-actions">
        <span class="cn-tip">结案前后均可追加，提交后记入处理履历 · {{ draft.length }}/500</span>
        <a-button type="primary" size="small" :disabled="!canAdd" @click="onAdd">添加</a-button>
      </div>
    </div>

    <ul v-if="ordered.length" class="cn-list">
      <li v-for="n in ordered" :key="n.id" class="cn-item">
        <div class="cn-meta">
          <span class="cn-who">{{ n.who }}</span>
          <span class="cn-role">{{ n.role }}</span>
          <span class="cn-at">{{ n.at }}</span>
          <span v-if="n.afterClose" class="cn-tag">结案后</span>
        </div>
        <div class="cn-text">{{ n.text }}</div>
      </li>
    </ul>
    <div v-else-if="readonly" class="cn-empty">暂无结案后备注</div>
  </OpCollapsibleSection>
</template>

<style scoped>
.cn-editor { display: flex; flex-direction: column; gap: 6px; }
.cn-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cn-tip { font-size: 12px; color: #9ca3af; }
.cn-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.cn-item {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 10px;
}
.cn-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6b7280; }
.cn-who { color: #374151; font-weight: 600; }
.cn-role { color: #6b7280; }
.cn-at { color: #9ca3af; }
.cn-tag {
  font-size: 10px; font-weight: 600; padding: 0 6px; border-radius: 4px;
  color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe;
}
.cn-text { margin-top: 2px; font-size: 13px; color: #1f2937; white-space: pre-wrap; word-break: break-word; }
.cn-empty { font-size: 12px; color: #9ca3af; }
</style>
