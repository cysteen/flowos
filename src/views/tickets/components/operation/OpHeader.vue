<script setup lang="ts">
import {
  CopyOutlined, StarOutlined, PrinterOutlined, EllipsisOutlined,
  FlagOutlined, MessageOutlined,
} from '@ant-design/icons-vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';

defineProps<{
  detail: TicketDetailMeta;
  ticketNo: string;
}>();

const emit = defineEmits<{
  copyNo: [];
  action: [name: string];
}>();
</script>

<template>
  <div class="op-header">
    <div class="oh-left">
      <div class="title-row">
        <span class="badge badge-blue">
          <span class="badge-dot" />{{ detail.status }}
        </span>
        <span class="badge badge-red">
          <MessageOutlined />{{ detail.type }}
        </span>
        <span class="badge badge-red">
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
  font-size: 13px; font-weight: 600; color: #fff;
  border-radius: 6px; padding: 8px 14px; flex: none; height: 35px;
}
.badge-blue { background: #1a6fff; }
.badge-red { background: #ef4444; }
.badge-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #fff;
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
