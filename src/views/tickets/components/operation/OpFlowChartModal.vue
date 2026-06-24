<script setup lang="ts">
import { computed } from 'vue';
import { Modal as AModal } from 'ant-design-vue';
import { RightOutlined } from '@ant-design/icons-vue';

const props = defineProps<{ open: boolean; currentNode: string }>();
const emit = defineEmits<{ 'update:open': [v: boolean] }>();

interface FlowStage {
  id: string;
  label: string;
  /** 与 currentNode 模糊匹配 */
  match: string[];
  /** 是否展示处理中分支 */
  branches?: boolean;
}

const STAGES: FlowStage[] = [
  { id: 'create', label: '工单创建', match: ['工单创建', '创建'] },
  { id: 'dispatch', label: '自动派单', match: ['自动派单', '派单'] },
  {
    id: 'process',
    label: '坐席处理',
    match: ['工单处理', '处理中', '一线处理', '坐席处理'],
    branches: true,
  },
  { id: 'tech', label: '技术支持', match: ['技术支持', '技术支持处理', '二线'] },
  { id: 'survey', label: '结案回访', match: ['结案回访', '满意度', '回访'] },
  { id: 'done', label: '已完成', match: ['已完成', '完成结单', '已结案', '结案'] },
];

const BRANCH_ITEMS = [
  { label: '挂起', desc: '暂停计时' },
  { label: '转办', desc: '换人处理' },
  { label: '升级', desc: '提至上级' },
  { label: '关联单', desc: '绑定工单' },
];

const currentIndex = computed(() => {
  const cur = (props.currentNode || '').trim();
  if (!cur) return 2;
  const i = STAGES.findIndex((s) =>
    s.match.some((m) => cur.includes(m) || m.includes(cur)),
  );
  return i >= 0 ? i : 2;
});

function statusOf(i: number): 'done' | 'current' | 'pending' {
  if (i < currentIndex.value) return 'done';
  if (i === currentIndex.value) return 'current';
  return 'pending';
}

function connectorStatus(i: number): 'done' | 'pending' {
  return i < currentIndex.value ? 'done' : 'pending';
}
</script>

<template>
  <AModal
    :open="open"
    title="工单处理流程图"
    :footer="null"
    :width="760"
    @update:open="emit('update:open', $event)"
  >
    <div class="flow-chart">
      <p class="flow-desc">
        主流程自左向右推进；坐席处理阶段可触发挂起、转办等旁路，完成后回到主链继续流转。
      </p>

      <div class="flow-track-wrap">
        <div class="flow-track">
          <template v-for="(stage, i) in STAGES" :key="stage.id">
            <div class="node-col" :class="{ 'has-branch': stage.branches }">
              <div class="flow-node" :class="statusOf(i)">
                <span v-if="statusOf(i) === 'current'" class="cur-badge">当前</span>
                <span class="node-label">{{ stage.label }}</span>
              </div>

              <div v-if="stage.branches" class="branch-area">
                <div class="branch-stem" />
                <div class="branch-box">
                  <div class="branch-title">处理中旁路</div>
                  <div class="branch-grid">
                    <div v-for="b in BRANCH_ITEMS" :key="b.label" class="branch-item">
                      <span class="branch-name">{{ b.label }}</span>
                      <span class="branch-desc">{{ b.desc }}</span>
                    </div>
                  </div>
                  <div class="branch-return">↩ 结束后回到主流程</div>
                </div>
              </div>
            </div>

            <div
              v-if="i < STAGES.length - 1"
              class="flow-connector"
              :class="connectorStatus(i)"
            >
              <span class="connector-line" />
              <RightOutlined class="connector-arrow" />
            </div>
          </template>
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
.flow-chart {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 0 8px;
}

.flow-desc {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.55;
}

.flow-track-wrap {
  overflow-x: auto;
  padding-bottom: 4px;
}

.flow-track {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  min-width: min-content;
  padding: 8px 4px 12px;
}

.node-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: none;
  min-width: 96px;
}

.node-col.has-branch {
  min-width: 148px;
}

.flow-node {
  position: relative;
  min-width: 88px;
  text-align: center;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-sizing: border-box;
}

.flow-node.done {
  background: #ecfdf5;
  border: 1px solid #6ee7b7;
  color: #047857;
}

.flow-node.current {
  background: #eff6ff;
  border: 2px solid #1a6fff;
  color: #1a6fff;
  box-shadow: 0 0 0 3px rgba(26, 111, 255, 0.12);
}

.flow-node.pending {
  background: #f9fafb;
  border: 1px dashed #d1d5db;
  color: #9ca3af;
}

.cur-badge {
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 4px;
  background: #1a6fff;
  color: #fff;
}

.node-label {
  line-height: 1.3;
  white-space: nowrap;
}

.flow-connector {
  display: flex;
  align-items: center;
  flex: none;
  width: 36px;
  margin-top: 22px;
  color: #d1d5db;
}

.flow-connector.done {
  color: #10b981;
}

.flow-connector.done .connector-line {
  background: #6ee7b7;
}

.connector-line {
  flex: 1;
  height: 2px;
  background: #e5e7eb;
  border-radius: 1px;
}

.connector-arrow {
  font-size: 11px;
  flex: none;
  margin-left: -2px;
}

.branch-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin-top: 10px;
}

.branch-stem {
  width: 2px;
  height: 10px;
  background: #d1d5db;
  flex: none;
}

.branch-box {
  width: 100%;
  padding: 10px;
  background: #fafafb;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.branch-title {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-align: center;
}

.branch-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.branch-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  text-align: center;
}

.branch-name {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

.branch-desc {
  font-size: 10px;
  color: #9ca3af;
}

.branch-return {
  font-size: 10px;
  color: #6b7280;
  text-align: center;
}

.flow-legend {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding-top: 4px;
  border-top: 1px solid #f3f4f6;
}

.lg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #6b7280;
}

.lg .d {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}

.lg .d.done { background: #10b981; }
.lg .d.current { background: #1a6fff; }
.lg .d.pending { background: #d1d5db; }
</style>
