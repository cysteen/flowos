<script setup lang="ts">
import { FileTextOutlined } from '@ant-design/icons-vue';
import type { TicketDraft } from '@/stores/ticketDrafts';

defineProps<{ drafts: TicketDraft[] }>();
const emit = defineEmits<{
  open: [id: string];
  remove: [id: string];
}>();
</script>

<template>
  <div class="draft-list">
    <!-- 表头 -->
    <div class="thead">
      <div class="col-title th">草稿标题</div>
      <div class="col-customer th">客户</div>
      <div class="col-time th">保存时间</div>
      <div class="col-action th">操作</div>
    </div>

    <!-- 空态 -->
    <div v-if="drafts.length === 0" class="empty">
      <FileTextOutlined :style="{ fontSize: '22px', color: '#d1d5db' }" />
      <div class="empty-text">暂无草稿</div>
      <div class="empty-hint">在「新建工单」中点「存草稿」即可暂存为草稿</div>
    </div>

    <!-- 草稿行（灰显，整行可点 → 继续编辑弹窗） -->
    <div
      v-for="d in drafts"
      :key="d.id"
      class="row"
      @click="emit('open', d.id)"
    >
      <div class="col-title cell-title">
        <div class="title-line1">
          <span class="tag">{{ d.typeLabel }}</span>
          <span class="title-text">{{ d.title }}</span>
        </div>
        <div class="title-line2">
          <span class="draft-flag">草稿</span>
          <span class="sep">·</span>
          <span class="hint">点击继续编辑</span>
        </div>
      </div>

      <div class="col-customer cell-customer">{{ d.customerName }}</div>

      <div class="col-time cell-time">{{ d.savedAt }}</div>

      <div class="col-action cell-action" @click.stop>
        <span class="act" @click="emit('open', d.id)">继续编辑</span>
        <span class="act danger" @click="emit('remove', d.id)">删除</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.draft-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.col-title { flex: 1; min-width: 160px; }
.col-customer { width: 140px; flex: none; }
.col-time { width: 180px; flex: none; }
.col-action { width: 132px; flex: none; }

.thead {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 20px;
  background: #fafafb;
  border-bottom: 1px solid #e5e7eb;
  flex: none;
}
.th {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

/* 草稿整体灰显：弱化文字、淡背景，区别于已发起工单 */
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 20px;
  border-left: 4px solid #e5e7eb;
  border-bottom: 1px solid #f0f0f0;
  background: #fcfcfd;
  cursor: pointer;
  flex: none;
}
.row:hover {
  background: #f5f7fa;
}

.cell-title { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.title-line1 { display: flex; align-items: center; gap: 8px; min-width: 0; }
.title-line2 { display: flex; align-items: center; gap: 6px; }
.tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  color: #6b7280;
  background: #f3f4f6;
}
.title-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.draft-flag {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  background: #f3f4f6;
  border-radius: 3px;
  padding: 0 6px;
}
.sep { font-size: 12px; color: #d1d5db; }
.hint { font-size: 12px; color: #9ca3af; }

.cell-customer { font-size: 13px; color: #6b7280; }
.cell-time { font-size: 12px; color: #9ca3af; }

.cell-action { display: flex; align-items: center; gap: 12px; }
.act { font-size: 13px; font-weight: 500; color: #1a6fff; cursor: pointer; }
.act:hover { text-decoration: underline; }
.act.danger { color: #ef4444; }

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 64px 0;
}
.empty-text { font-size: 14px; color: #6b7280; }
.empty-hint { font-size: 12px; color: #9ca3af; }
</style>
