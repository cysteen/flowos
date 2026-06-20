<script setup lang="ts">
import { ref } from 'vue';
import { FormOutlined } from '@ant-design/icons-vue';
import OpTextareaAttach from './shared/OpTextareaAttach.vue';

const emit = defineEmits<{ action: [name: string] }>();
const activeTab = ref<'note' | 'supplement'>('note');
const note = ref('');
const attachments = ref<string[]>([]);
</script>

<template>
  <div class="side-card add-card">
    <div class="add-top">
      <span class="add-title"><FormOutlined /> 添加记录</span>
      <div class="add-tabs">
        <span class="add-tab" :class="{ active: activeTab === 'note' }" @click="activeTab = 'note'">备注</span>
        <span class="add-tab" :class="{ active: activeTab === 'supplement' }" @click="activeTab = 'supplement'">补充信息</span>
      </div>
    </div>

    <OpTextareaAttach
      v-model="note"
      :attachments="attachments"
      :min-input-height="48"
      :shell-background="'#f9fafb'"
      :shell-radius="8"
      :placeholder="activeTab === 'note' ? '填写内部备注（仅团队可见）…' : '填写补充信息…'"
      @update:attachments="attachments = $event"
    />

    <div class="add-foot">
      <button class="add-btn" @click="emit('action', '添加记录')">添加</button>
    </div>
  </div>
</template>

<style scoped>
.side-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.add-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.add-title { font-size: 14px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 6px; }
.add-tabs { display: flex; gap: 2px; background: #f3f4f6; border-radius: 6px; padding: 2px; flex: none; }
.add-tab { font-size: 12px; color: #6b7280; padding: 4px 10px; border-radius: 5px; cursor: pointer; }
.add-tab.active { background: #fff; color: #1a6fff; font-weight: 600; border: 1px solid #e5e7eb; }
.add-foot { display: flex; align-items: center; justify-content: flex-end; }
.add-btn { font-size: 12px; font-weight: 600; color: #fff; background: #1a6fff; border: none; border-radius: 6px; padding: 6px 18px; cursor: pointer; }
</style>
