<script setup lang="ts">
import { computed } from 'vue';
import { Modal as AModal } from 'ant-design-vue';

const props = defineProps<{ open: boolean; currentNode: string }>();
const emit = defineEmits<{ 'update:open': [v: boolean] }>();

// 标准处理流程主链（参照参考稿工单处理流程图）
const MAIN_STAGES = ['工单创建', '自动派单', '工单处理', '技术支持处理', '完成结单'];

const currentIndex = computed(() => {
  const cur = props.currentNode || '';
  const i = MAIN_STAGES.findIndex((s) => cur.includes(s) || s.includes(cur));
  return i >= 0 ? i : 2; // 默认定位「工单处理」
});

function statusOf(i: number): 'done' | 'current' | 'pending' {
  if (i < currentIndex.value) return 'done';
  if (i === currentIndex.value) return 'current';
  return 'pending';
}
</script>

<template>
  <AModal
    :open="open"
    title="工单处理流程图"
    :footer="null"
    :width="560"
    @update:open="emit('update:open', $event)"
  >
    <div class="flow-chart">
      <div class="flow-main">
        <template v-for="(stage, i) in MAIN_STAGES" :key="stage">
          <div class="flow-node" :class="statusOf(i)">
            <span v-if="statusOf(i) === 'current'" class="cur-mark">▶</span>
            <span class="node-text">{{ stage }}</span>
          </div>
          <div v-if="i < MAIN_STAGES.length - 1" class="flow-arrow">↓</div>
        </template>
      </div>

      <!-- 工单处理节点的可能分支 -->
      <div class="flow-branches">
        <div class="branch-title">工单处理可能分支</div>
        <div class="branch-row">
          <span class="branch-chip warn">挂起 / 转办</span>
          <span class="branch-chip info">关联单 / 升级</span>
        </div>
      </div>

      <div class="flow-legend">
        <span class="lg"><i class="d done" />已完成</span>
        <span class="lg"><i class="d current" />当前节点</span>
        <span class="lg"><i class="d pending" />待执行</span>
      </div>
    </div>
  </AModal>
</template>

<style scoped>
.flow-chart { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 8px 0; }
.flow-main { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.flow-node {
  width: 200px;
  text-align: center;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.flow-node.done { background: #ecfdf5; border: 1px solid #10b981; color: #047857; }
.flow-node.current { background: #eff6ff; border: 2px solid #1a6fff; color: #1a6fff; }
.flow-node.pending { background: #f9fafb; border: 1px dashed #d1d5db; color: #9ca3af; }
.cur-mark { font-size: 12px; }
.flow-arrow { color: #9ca3af; font-size: 14px; line-height: 1; }

.flow-branches {
  width: 100%;
  margin-top: 6px;
  padding: 12px;
  background: #fafafb;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.branch-title { font-size: 12px; color: #9ca3af; }
.branch-row { display: flex; gap: 10px; }
.branch-chip { font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 6px; }
.branch-chip.warn { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
.branch-chip.info { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }

.flow-legend { display: flex; gap: 18px; margin-top: 4px; }
.lg { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #6b7280; }
.lg .d { width: 10px; height: 10px; border-radius: 50%; }
.lg .d.done { background: #10b981; }
.lg .d.current { background: #1a6fff; }
.lg .d.pending { background: #d1d5db; }
</style>
