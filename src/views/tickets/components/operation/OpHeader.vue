<script setup lang="ts">
import { computed } from 'vue';
import { CopyOutlined, FlagOutlined } from '@ant-design/icons-vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import { PRIORITY_COLOR, softBg, type Priority } from '@/views/tickets/types/ticket';
import OpSlaBar from './OpSlaBar.vue';

const props = defineProps<{
  detail: TicketDetailMeta;
  ticketNo: string;
}>();

const metaTitle = computed(
  () =>
    `建单人：${props.detail.builderShort}，建单时间：${props.detail.createdAtFull}，期望解决：${props.detail.expectedResolve}，单号：${props.ticketNo}`,
);

const emit = defineEmits<{
  copyNo: [];
  action: [name: string];
}>();

/** 状态 → 语义色（对齐 STATUS_TONE：进行中=橙、完成=绿、中性=灰、异常=红） */
function statusHex(s: string): string {
  if (/已解决|已完成|已结案|已结单|完成/.test(s)) return '#10B981';
  if (/挂起|已关闭|撤销|取消|终止/.test(s)) return '#6B7280';
  if (/升级/.test(s)) return '#A855F7';
  if (/逾期|超时|异常|驳回|失败/.test(s)) return '#EF4444';
  if (/处理中|受理|待|审核|进行/.test(s)) return '#F59E0B';
  return '#1A6FFF';
}
/** 淡底标签样式（颜色=语义，避免厚重实底/红色滥用） */
function tagStyle(hex: string) {
  return { color: hex, background: softBg(hex) };
}
function priorityHex(p: string): string {
  return PRIORITY_COLOR[p as Priority] ?? '#9CA3AF';
}
</script>

<template>
  <div class="op-header">
    <div class="oh-left">
      <div class="title-row">
        <span class="badge" :style="tagStyle(statusHex(detail.status))">
          <span class="badge-dot" :style="{ background: statusHex(detail.status) }" />{{ detail.status }}
        </span>
        <span class="badge badge-neutral">{{ detail.type }}</span>
        <span class="badge" :style="tagStyle(priorityHex(detail.priority))">
          <FlagOutlined />{{ detail.priority }}
        </span>
        <span class="oh-title">{{ detail.title }}</span>
      </div>
      <div class="meta-row" :title="metaTitle">
        <span class="meta-text">
          <span class="meta-k">建单人</span>：{{ detail.builderShort }}<span class="meta-sep">，</span>
          <span class="meta-k">建单时间</span>：{{ detail.createdAtFull }}<span class="meta-sep">，</span>
          <span class="meta-k">期望解决</span>：{{ detail.expectedResolve }}<span class="meta-sep">，</span>
          <span class="meta-k">单号</span>：{{ ticketNo }}
        </span>
        <CopyOutlined class="copy" @click="emit('copyNo')" />
      </div>
    </div>
    <div class="oh-right">
      <OpSlaBar :detail="detail" />
      <div class="oh-actions">
        <button type="button" class="action-btn" @click="emit('action', '新建关联')">新建关联</button>
        <button type="button" class="action-btn" @click="emit('action', '新建补充')">新建补充</button>
        <button type="button" class="action-btn" @click="emit('action', '催单')">催单</button>
        <button type="button" class="action-btn action-btn--danger" @click="emit('action', '取消工单')">取消工单</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.op-header {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; padding: 8px 20px; border-bottom: 1px solid #e5e7eb;
}
.oh-left { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.title-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600;
  border-radius: 4px; padding: 0 8px; flex: none; height: 24px;
}
.badge-neutral { color: #6b7280; background: #f3f4f6; }
.badge-dot {
  width: 6px; height: 6px; border-radius: 50%;
}
.oh-title { font-size: 14px; font-weight: 700; color: #111827; line-height: 1.3; }
.meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.3;
}
.meta-text {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta-k {
  color: #6b7280;
  font-weight: 600;
}
.meta-sep {
  color: #d1d5db;
}
.copy { cursor: pointer; font-size: 13px; flex: none; }
.copy:hover { color: #6b7280; }

.oh-right { display: flex; align-items: center; gap: 12px; flex: none; }
.oh-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.action-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  color: #1a6fff;
  background: #fff;
  border: 1.5px solid #93c5fd;
  border-radius: 6px;
  cursor: pointer;
  flex: none;
  font-family: inherit;
  white-space: nowrap;
  appearance: none;
  box-shadow: 0 1px 2px rgba(26, 111, 255, 0.1);
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.action-btn:hover {
  background: #eff6ff;
  border-color: #1a6fff;
  box-shadow: 0 2px 8px rgba(26, 111, 255, 0.18);
}
.action-btn--danger {
  color: #dc2626;
  background: #fef2f2;
  border-color: #fecaca;
  box-shadow: 0 1px 2px rgba(220, 38, 38, 0.1);
}
.action-btn--danger:hover {
  color: #b91c1c;
  background: #fee2e2;
  border-color: #f87171;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.18);
}
</style>
