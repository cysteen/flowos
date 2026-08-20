<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { LinkOutlined, FileAddOutlined, BellOutlined } from '@ant-design/icons-vue';
import OpCollapsibleSection from '../OpCollapsibleSection.vue';
import OpAttachList from '../shared/OpAttachList.vue';
import OpSimpleRecordList from '../shared/OpSimpleRecordList.vue';
import type { RelatedTicketCard, SimpleRecord } from '@/views/tickets/types/operationTabs';

defineProps<{
  relatedTickets: RelatedTicketCard[];
  supplementRecords: SimpleRecord[];
  dunningRecords: SimpleRecord[];
  /**
   * 本 Tab 对当前角色只读（矩阵 #46：⑦ ⑧ 只读、⑥ 条件可用暂按不可写，其余可用）。
   * Tab 内**唯一写动作是「已知晓」**（标记已读）—— 只读态下该按钮不出。
   * 关联单跳转、附件查看、分组展开这类读的交互不受影响。
   */
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'mark-read': [id: string];
}>();

const expanded = ref({ related: true, supplement: true, dunning: true });

function openRelated(t: RelatedTicketCard) {
  // 售后单在客服侧只读，跳转入口在底栏「转售后」的悬浮卡片上，卡片本身不响应
  if (t.source === '售后' || t.externalLink) return;
  message.info(`打开 ${t.no}`);
}

function typeBg(t: RelatedTicketCard) {
  return t.typeBgColor ?? t.typeColor + '1F';
}

function processEntries(t: RelatedTicketCard) {
  if (t.processRecords?.length) return t.processRecords;
  if (t.processInfo) {
    return [{ who: '', when: '', content: t.processInfo }];
  }
  return [];
}
</script>

<template>
  <div class="related-tab">
    <!-- 关联单 -->
    <OpCollapsibleSection
      :title="`关联单 (${relatedTickets.length})`"
      :icon="LinkOutlined"
      :expanded="expanded.related"
      @toggle="expanded.related = !expanded.related"
    >
      <div class="card-list">
        <div
          v-for="t in relatedTickets"
          :key="t.no"
          class="rel-card"
          :class="{ 'rel-card--external': t.source === '售后' }"
          @click="openRelated(t)"
        >
          <div class="rel-top">
            <div class="rel-title-row">
              <span v-if="t.source === '售后'" class="src-badge">售后</span>
              <span
                class="status-tag"
                :style="{ color: t.statusColor, background: t.statusColor + '18' }"
              >{{ t.status }}</span>
              <span class="rel-title">{{ t.title }}</span>
            </div>
            <span class="rel-time">{{ t.createdAtFull ?? t.createdAt }}</span>
          </div>
          <div class="rel-meta">
            <span class="rel-no">{{ t.no }}</span>
            <span class="sep">·</span>
            <span class="type-tag" :style="{ color: t.typeColor, background: typeBg(t) }">{{ t.type }}</span>
            <span class="sep">·</span>
            <span class="builder">{{ t.builder }}</span>
          </div>
          <div class="rel-divider" />
          <div class="rel-block">
            <div class="rel-label">问题描述</div>
            <div class="rel-text">{{ t.demand }}</div>
            <OpAttachList v-if="t.attachments?.length" :files="t.attachments" />
          </div>
          <div v-if="processEntries(t).length" class="rel-block">
            <div class="rel-label">处理信息</div>
            <div v-for="(p, idx) in processEntries(t)" :key="idx" class="process-entry">
              <div v-if="p.who || p.when" class="who-when">
                <span v-if="p.who" class="who">{{ p.who }}</span>
                <span v-if="p.who && p.when" class="sep">·</span>
                <span v-if="p.when" class="muted">{{ p.when }}</span>
              </div>
              <div class="entry-desc">{{ p.content }}</div>
              <OpAttachList v-if="p.attachments?.length" :files="p.attachments" />
            </div>
          </div>
        </div>
      </div>
    </OpCollapsibleSection>

    <!-- 补充信息 -->
    <OpCollapsibleSection
      title="补充信息"
      :icon="FileAddOutlined"
      :expanded="expanded.supplement"
      @toggle="expanded.supplement = !expanded.supplement"
    >
      <OpSimpleRecordList
        :records="supplementRecords"
        show-supplement-type
        :readonly="readonly"
        @mark-read="emit('mark-read', $event)"
      />
    </OpCollapsibleSection>

    <!-- 催单记录 -->
    <OpCollapsibleSection
      title="催单记录"
      :icon="BellOutlined"
      :expanded="expanded.dunning"
      @toggle="expanded.dunning = !expanded.dunning"
    >
      <OpSimpleRecordList
        :records="dunningRecords"
        :readonly="readonly"
        @mark-read="emit('mark-read', $event)"
      />
    </OpCollapsibleSection>
  </div>
</template>

<style scoped>
.related-tab { display: flex; flex-direction: column; gap: 12px; width: 100%; }

.card-list { display: flex; flex-direction: column; gap: 8px; }

.rel-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 8px 10px; cursor: pointer; display: flex; flex-direction: column; gap: 8px;
}
.rel-card:hover { border-color: #d1d5db; }

.rel-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.rel-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.status-tag { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; flex: none; }
.src-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; flex: none; color: #0e7490; background: #cffafe; }
/* 售后单在客服侧只读：整卡不可点，仅工单地址可点跳售后系统 */
.rel-card--external { border-style: dashed; cursor: default; }
.rel-title { font-size: 13px; font-weight: 600; color: #111827; min-width: 0; }
.rel-time { font-size: 11px; color: #9ca3af; flex: none; white-space: nowrap; }

.rel-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; }
.rel-no { font-size: 12px; color: #1a6fff; font-weight: 500; }
.type-tag { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; flex: none; }
.builder { color: #6b7280; font-size: 11px; }
.sep { color: #d1d5db; }

.rel-divider { height: 1px; background: #e5e7eb; }

.rel-block { display: flex; flex-direction: column; gap: 6px; }
.rel-label { font-size: 11px; font-weight: 600; color: #9ca3af; }
.rel-text { font-size: 12px; color: #374151; line-height: 1.6; }

.process-entry { display: flex; flex-direction: column; gap: 6px; }
.process-entry + .process-entry { margin-top: 6px; }
.process-entry .who { font-weight: 600; color: #374151; font-size: 11px; }
.process-entry .muted { color: #9ca3af; font-size: 11px; }
.process-entry .entry-desc { font-size: 12px; color: #6b7280; line-height: 1.6; }
</style>
