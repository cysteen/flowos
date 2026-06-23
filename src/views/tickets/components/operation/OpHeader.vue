<script setup lang="ts">
import {
  CopyOutlined, StarOutlined, PrinterOutlined, EllipsisOutlined,
  FlagOutlined,
} from '@ant-design/icons-vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import { PRIORITY_COLOR, softBg, type Priority } from '@/views/tickets/types/ticket';

defineProps<{
  detail: TicketDetailMeta;
  ticketNo: string;
}>();

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
      <div class="meta-row">
        <span>建单人：{{ detail.builderShort }}，</span>
        <span>建单时间：{{ detail.createdAtFull }}，</span>
        <span class="no-row">
          单号：{{ ticketNo }}
          <CopyOutlined class="copy" @click="emit('copyNo')" />
        </span>
      </div>
    </div>
    <div class="oh-right">
      <div class="sla">
        <span class="sla-label">整单解决剩余</span>
        <span class="sla-val amber">{{ detail.slaWhole }}</span>
      </div>
      <div class="sla-divider" />
      <div class="sla">
        <span class="sla-label">当前节点响应</span>
        <span class="sla-val" :class="detail.slaNodeOverdue ? 'red' : 'amber'">{{ detail.slaNode }}</span>
      </div>
      <button class="icon-btn" @click="emit('action', '关注')"><StarOutlined /></button>
      <button class="icon-btn" @click="emit('action', '打印')"><PrinterOutlined /></button>
      <button class="icon-btn" @click="emit('action', '更多')"><EllipsisOutlined /></button>
    </div>
  </div>
</template>

<style scoped>
.op-header {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; padding: 14px 24px; border-bottom: 1px solid #e5e7eb;
}
.oh-left { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600;
  border-radius: 6px; padding: 0 12px; flex: none; height: 30px;
}
.badge-neutral { color: #6b7280; background: #f3f4f6; }
.badge-dot {
  width: 7px; height: 7px; border-radius: 50%;
}
.oh-title { font-size: 16px; font-weight: 700; color: #111827; }
.meta-row {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  font-size: 12px; color: #9ca3af;
}
.no-row { display: inline-flex; align-items: center; gap: 4px; }
.copy { cursor: pointer; font-size: 13px; }
.copy:hover { color: #6b7280; }

.oh-right { display: flex; align-items: center; gap: 20px; flex: none; }
.sla { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.sla-label { font-size: 11px; color: #9ca3af; }
.sla-val { font-size: 16px; font-weight: 700; }
.sla-val.amber { color: #f59e0b; }
.sla-val.red { color: #ef4444; }
.sla-divider { width: 1px; height: 30px; background: #e5e7eb; }
.icon-btn {
  width: 32px; height: 32px; border: 1px solid #e5e7eb; border-radius: 6px;
  background: #f9fafb; color: #6b7280; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.icon-btn:hover { background: #f3f4f6; }
</style>
