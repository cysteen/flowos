<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { LinkOutlined, FileAddOutlined, BellOutlined } from '@ant-design/icons-vue';
import OpCollapsibleSection from '../OpCollapsibleSection.vue';
import OpAttachList from '../shared/OpAttachList.vue';
import type { RelatedTicketCard, SimpleRecord } from '@/views/tickets/types/operationTabs';

defineProps<{
  relatedTickets: RelatedTicketCard[];
  supplementRecords: SimpleRecord[];
  dunningRecords: SimpleRecord[];
}>();

const expanded = ref({ related: true, supplement: true, dunning: true });

function toast(name: string) {
  message.info(`「${name}」`);
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
          @click="toast('打开 ' + t.no)"
        >
          <div class="rel-top">
            <div class="rel-title-row">
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
      <div class="simple-list">
        <div v-for="r in supplementRecords" :key="r.id" class="simple-item">
          <div class="who-when">
            <span v-if="r.supplementType" class="type-tag">{{ r.supplementType }}</span>
            <span class="who">{{ r.who }}</span><span class="sep">·</span><span class="muted">{{ r.when }}</span>
          </div>
          <div class="entry-desc">{{ r.content }}</div>
          <OpAttachList v-if="r.attachments?.length" :files="r.attachments" />
        </div>
      </div>
    </OpCollapsibleSection>

    <!-- 催单记录 -->
    <OpCollapsibleSection
      title="催单记录"
      :icon="BellOutlined"
      :expanded="expanded.dunning"
      @toggle="expanded.dunning = !expanded.dunning"
    >
      <div class="simple-list">
        <div v-for="r in dunningRecords" :key="r.id" class="simple-item">
          <div class="who-when">
            <span class="who">{{ r.who }}</span><span class="sep">·</span><span class="muted">{{ r.when }}</span>
          </div>
          <div class="entry-desc">{{ r.content }}</div>
          <OpAttachList v-if="r.attachments?.length" :files="r.attachments" />
        </div>
      </div>
    </OpCollapsibleSection>
  </div>
</template>

<style scoped>
.related-tab { display: flex; flex-direction: column; gap: 16px; width: 100%; }

.card-list, .simple-list { display: flex; flex-direction: column; gap: 8px; }

.rel-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 12px 14px; cursor: pointer; display: flex; flex-direction: column; gap: 10px;
}
.rel-card:hover { border-color: #d1d5db; }

.rel-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.rel-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.status-tag { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; flex: none; }
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

.simple-item {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;
}

.who-when { display: flex; align-items: center; gap: 4px; font-size: 11px; flex-wrap: wrap; }
.who-when .type-tag {
  font-size: 10px; font-weight: 600; color: #6b7280;
  background: #f3f4f6; border-radius: 3px; padding: 1px 6px; flex: none;
}
.who { font-weight: 600; color: #374151; }
.muted { color: #9ca3af; }
.entry-desc { font-size: 12px; color: #6b7280; line-height: 1.6; }
</style>
