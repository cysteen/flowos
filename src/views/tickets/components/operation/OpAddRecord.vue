<script setup lang="ts">
import { ref } from 'vue';
import { FormOutlined, PaperClipOutlined } from '@ant-design/icons-vue';

const emit = defineEmits<{ action: [name: string] }>();
const activeTab = ref<'note' | 'supplement'>('note');
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
    <textarea
      class="add-textarea"
      :placeholder="activeTab === 'note' ? '填写内部备注（仅团队可见）…' : '填写补充信息…'"
    />
    <div class="add-foot">
      <span class="add-hint"><PaperClipOutlined /> 附件</span>
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
.add-textarea {
  height: 80px; resize: none; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 10px; font-size: 12px; color: #374151; outline: none; font-family: inherit; background: #f9fafb;
}
.add-textarea::placeholder { color: #9ca3af; }
.add-foot { display: flex; align-items: center; justify-content: space-between; }
.add-hint { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #6b7280; cursor: pointer; }
.add-btn { font-size: 12px; font-weight: 600; color: #fff; background: #1a6fff; border: none; border-radius: 6px; padding: 6px 18px; cursor: pointer; }
</style>
