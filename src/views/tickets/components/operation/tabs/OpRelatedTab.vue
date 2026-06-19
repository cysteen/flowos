<script setup lang="ts">
import { message } from 'ant-design-vue';
import OpSectionTitle from '../shared/OpSectionTitle.vue';
import OpAttachList from '../shared/OpAttachList.vue';
import type { RelatedTicketCard, SimpleRecord } from '@/views/tickets/types/operationTabs';
import type { ChildTicket } from '@/mock/ticketDetail';

defineProps<{
  relatedTickets: RelatedTicketCard[];
  supplementRecords: SimpleRecord[];
  dunningRecords: SimpleRecord[];
  childTickets: ChildTicket[];
}>();

const emit = defineEmits<{ openChildCreate: []; openReopenCreate: [] }>();

function toast(name: string) {
  message.info(`「${name}」（演示）`);
}
</script>

<template>
  <div class="related-tab">
    <section class="block">
      <div class="block-head">
        <OpSectionTitle title="关联单" :count="relatedTickets.length" />
        <span class="actions">
          <button class="mini-btn" @click="toast('关联历史')">关联历史</button>
          <button class="mini-btn" @click="emit('openReopenCreate')">重新建单</button>
        </span>
      </div>
      <div class="card-list">
        <div v-for="t in relatedTickets" :key="t.no" class="rel-card" @click="toast('打开 ' + t.no)">
          <div class="rel-top">
            <div class="rel-title-row">
              <span class="status-tag" :style="{ color: t.statusColor, background: t.statusColor + '18' }">{{ t.status }}</span>
              <span class="rel-title">{{ t.title }}</span>
            </div>
            <span class="rel-time">{{ t.createdAt }}</span>
          </div>
          <div class="rel-meta">
            <span class="rel-no">{{ t.no }}</span>
            <span class="sep">·</span>
            <span class="type-tag" :style="{ color: t.typeColor, background: t.typeColor + '1F' }">{{ t.type }}</span>
            <span class="sep">·</span>
            <span class="builder">{{ t.builder }}</span>
          </div>
          <div class="rel-divider" />
          <div class="rel-block">
            <div class="rel-label">问题描述</div>
            <div class="rel-text">{{ t.demand }}</div>
            <OpAttachList v-if="t.attachments?.length" :files="t.attachments" />
          </div>
          <div v-if="t.processInfo" class="rel-block">
            <div class="rel-label">处理信息</div>
            <div class="rel-text">{{ t.processInfo }}</div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="childTickets.length" class="block">
      <div class="block-head">
        <OpSectionTitle title="子工单" :count="childTickets.length" />
        <span class="action" @click="emit('openChildCreate')">+ 新建子单</span>
      </div>
      <div class="simple-list">
        <div v-for="c in childTickets" :key="c.no" class="simple-item" @click="toast('打开 ' + c.no)">
          <div class="simple-top">
            <span class="rel-no">{{ c.no }}</span>
            <span class="mini-tags">
              <span class="mini-tag" :style="{ color: c.typeColor, background: c.typeColor + '22' }">{{ c.typeTag }}</span>
              <span class="mini-tag" :style="{ color: c.statusColor, background: c.statusColor + '22' }">{{ c.statusTag }}</span>
            </span>
          </div>
          <div class="simple-bottom">
            <span>{{ c.title }}</span>
            <span class="muted">{{ c.time }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="block">
      <OpSectionTitle title="补充信息" />
      <div class="simple-list">
        <div v-for="r in supplementRecords" :key="r.id" class="simple-item">
          <div class="who-when">
            <span class="who">{{ r.who }}</span><span class="sep">·</span><span class="muted">{{ r.when }}</span>
          </div>
          <div class="rel-text">{{ r.content }}</div>
          <OpAttachList v-if="r.attachments?.length" :files="r.attachments" />
        </div>
      </div>
    </section>

    <section class="block">
      <OpSectionTitle title="催单记录" />
      <div class="simple-list">
        <div v-for="r in dunningRecords" :key="r.id" class="simple-item">
          <div class="who-when">
            <span class="who">{{ r.who }}</span><span class="sep">·</span><span class="muted">{{ r.when }}</span>
          </div>
          <div class="rel-text">{{ r.content }}</div>
          <OpAttachList v-if="r.attachments?.length" :files="r.attachments" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.related-tab { display: flex; flex-direction: column; gap: 20px; }
.block { display: flex; flex-direction: column; gap: 8px; }
.block-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.action { font-size: 11px; font-weight: 600; color: #1a6fff; cursor: pointer; }
.actions { display: flex; gap: 6px; }
.mini-btn {
  font-size: 10px; font-weight: 600; color: #374151; background: #fff;
  border: 1px solid #d1d5db; border-radius: 4px; padding: 3px 8px; cursor: pointer;
}
.card-list, .simple-list { display: flex; flex-direction: column; gap: 8px; }
.rel-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 12px 14px; cursor: pointer; display: flex; flex-direction: column; gap: 10px;
}
.rel-card:hover { border-color: #d1d5db; }
.rel-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.rel-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.status-tag { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; flex: none; }
.rel-title { font-size: 13px; font-weight: 600; color: #111827; }
.rel-time { font-size: 11px; color: #9ca3af; flex: none; }
.rel-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; }
.rel-no { font-size: 12px; color: #1a6fff; font-weight: 500; }
.type-tag { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; }
.builder { color: #6b7280; }
.sep { color: #d1d5db; }
.rel-divider { height: 1px; background: #e5e7eb; }
.rel-block { display: flex; flex-direction: column; gap: 6px; }
.rel-label { font-size: 11px; font-weight: 600; color: #9ca3af; }
.rel-text { font-size: 12px; color: #374151; line-height: 1.6; }
.simple-item {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;
}
.simple-item:hover { background: #f9fafb; cursor: pointer; }
.simple-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mini-tags { display: flex; gap: 4px; }
.mini-tag { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; }
.simple-bottom { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: #6b7280; }
.who-when { display: flex; align-items: center; gap: 4px; font-size: 11px; }
.who { font-weight: 600; color: #374151; }
.muted { color: #9ca3af; }
</style>
