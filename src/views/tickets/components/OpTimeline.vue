<script setup lang="ts">
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  FileAddOutlined, SolutionOutlined, RiseOutlined, FormOutlined,
  ApartmentOutlined, LinkOutlined,
  PauseCircleOutlined, SwapOutlined, PhoneOutlined, MessageOutlined,
  PaperClipOutlined, SnippetsOutlined, CommentOutlined, BellOutlined,
  CheckCircleOutlined, StarFilled, PlayCircleOutlined, DownloadOutlined,
  ThunderboltOutlined, HistoryOutlined,
} from '@ant-design/icons-vue';
import {
  CATEGORY_META, ROLE_BADGE, softBg,
  type TlAction, type TlCategory, type TimelineEntry, type RelatedTicketBrief,
} from '@/views/tickets/types/ticketDetail';

function openRelated(t: RelatedTicketBrief) {
  message.info(`打开关联单 ${t.no}`);
}

const props = defineProps<{ entries: TimelineEntry[] }>();

// 图标取「一眼能认」的语义，与 how 徽章文案呼应
const ICON: Record<TlAction, unknown> = {
  create: FileAddOutlined,      // 建单
  accept: SolutionOutlined,     // 受理/办理
  escalate: RiseOutlined,       // 升级（与底栏升级按钮一致）
  relate: ApartmentOutlined,    // 关联单（升级投诉/关联售后派生关联工单）
  handle: FormOutlined,         // 处理登记（坐席填写处理结果/结论）
  hold: PauseCircleOutlined,    // 挂起
  transfer: SwapOutlined,       // 流转/调剂
  phone: PhoneOutlined,         // 电话
  sms: MessageOutlined,         // 短信
  supplement: SnippetsOutlined, // 补充材料
  reply: CommentOutlined,       // 回复
  dunning: BellOutlined,        // 催办
  resolved: CheckCircleOutlined,// 已解决
  praise: StarFilled,           // 好评
};
const LEGEND = (Object.entries(CATEGORY_META) as [TlCategory, (typeof CATEGORY_META)[TlCategory]][])
  .map(([key, meta]) => ({ key, ...meta }));

const activeCategory = ref<TlCategory | null>(null);

function toggleFilter(key: TlCategory) {
  activeCategory.value = activeCategory.value === key ? null : key;
}

const filteredEntries = computed(() => {
  if (!activeCategory.value) return props.entries;
  return props.entries.filter((e) => e.category === activeCategory.value);
});
</script>

<template>
  <div class="timeline-card">
    <!-- 标题 + 图例筛选 -->
    <div class="tl-header">
      <span class="tl-title"><HistoryOutlined :style="{ fontSize: '15px' }" />工单动态</span>
      <div class="legend">
        <button
          v-for="l in LEGEND"
          :key="l.key"
          type="button"
          class="legend-item"
          :class="{ active: activeCategory === l.key, dimmed: activeCategory && activeCategory !== l.key }"
          :title="activeCategory === l.key ? '点击取消筛选' : `仅看${l.label}`"
          @click="toggleFilter(l.key)"
        >
          <span class="legend-dot" :style="{ background: l.color }"></span>{{ l.label }}
        </button>
      </div>
    </div>

    <div class="tl-body">
      <div v-if="!filteredEntries.length" class="empty-hint">
        暂无「{{ activeCategory ? CATEGORY_META[activeCategory].label : '' }}」类履历
        <button type="button" class="clear-filter" @click="activeCategory = null">查看全部</button>
      </div>
      <!-- 条目 -->
      <div
        v-for="e in filteredEntries"
        :key="e.id"
        class="entry"
        :style="{ background: CATEGORY_META[e.category].bg, borderLeftColor: CATEGORY_META[e.category].color }"
      >
        <div
          class="entry-avatar"
          :style="{ background: softBg(CATEGORY_META[e.category].color), color: CATEGORY_META[e.category].color }"
        >
          <component :is="ICON[e.action]" />
        </div>

        <div class="entry-main">
          <div class="entry-top">
            <span class="who">{{ e.who }}</span>
            <span class="role-badge" :style="{ color: ROLE_BADGE[e.role], background: softBg(ROLE_BADGE[e.role]) }">{{ e.role }}</span>
            <span class="how-badge" :style="{ color: CATEGORY_META[e.category].color, background: softBg(CATEGORY_META[e.category].color) }">
              {{ e.how }}<template v-if="e.dunningTimes"> · 第{{ e.dunningTimes }}次</template>
            </span>
            <span v-if="e.internal" class="internal">仅内部可见</span>
            <span class="when">{{ e.when }}</span>
          </div>

          <div class="what">{{ e.what }}</div>

          <!-- 工单处理字段变更（handle 事件）：补充/修改 明细 -->
          <div v-if="e.changes?.length" class="chg-list">
            <div v-for="(c, ci) in e.changes" :key="ci" class="chg-row">
              <span class="chg-kind" :class="c.kind === '补充' ? 'chg-add' : 'chg-mod'">{{ c.kind }}</span>
              <span class="chg-field">{{ c.field }}</span>
              <span class="chg-val">
                <template v-if="c.kind === '修改' && c.from"><span class="chg-from">{{ c.from }}</span><span class="chg-arrow">→</span></template>{{ c.to }}
              </span>
            </div>
          </div>

          <!-- 关联单卡片（relate 事件）：对齐关联单卡片字段，可点跳转 -->
          <div
            v-if="e.relatedTicket"
            class="rel-mini"
            :title="`打开 ${e.relatedTicket.no}`"
            @click="openRelated(e.relatedTicket)"
          >
            <div class="rel-mini-top">
              <span
                class="rel-mini-status"
                :style="{ color: e.relatedTicket.statusColor || '#6b7280', background: softBg(e.relatedTicket.statusColor || '#6b7280') }"
              >{{ e.relatedTicket.status }}</span>
              <span class="rel-mini-title">{{ e.relatedTicket.title }}</span>
              <span class="rel-mini-open"><LinkOutlined /></span>
            </div>
            <div class="rel-mini-meta">
              <span class="rel-mini-no">{{ e.relatedTicket.no }}</span>
              <span class="rel-mini-sep">·</span>
              <span
                class="rel-mini-type"
                :style="{ color: e.relatedTicket.typeColor || '#6b7280', background: softBg(e.relatedTicket.typeColor || '#6b7280') }"
              >{{ e.relatedTicket.type }}</span>
              <span class="rel-mini-sep">·</span>
              <span class="rel-mini-builder">{{ e.relatedTicket.builder }}</span>
              <span v-if="e.relatedTicket.createdAt" class="rel-mini-time">{{ e.relatedTicket.createdAt }}</span>
            </div>
          </div>

          <!-- 客户补充附件 -->
          <div v-if="e.attachment" class="attach">
            <PaperClipOutlined :style="{ fontSize: '12px' }" />{{ e.attachment }}
          </div>

          <!-- 电话录音条 + ASR -->
          <template v-if="e.recording">
            <div class="rec-bar">
              <PlayCircleOutlined :style="{ color: '#06B6D4', fontSize: '16px' }" />
              <div class="rec-track"><div class="rec-fill"></div></div>
              <span class="rec-dur">{{ e.recording }}</span>
              <DownloadOutlined :style="{ color: '#6B7280', fontSize: '13px' }" />
            </div>
            <div v-if="e.asr" class="asr">
              <div class="asr-head"><ThunderboltOutlined :style="{ color: '#06B6D4', fontSize: '12px' }" />语音识别转写</div>
              <div v-for="(line, i) in e.asr" :key="i" class="asr-line">
                <span class="asr-spk" :style="{ color: line.speaker === '坐席' ? '#06B6D4' : '#6B7280' }">[{{ line.speaker }}]</span>
                <span class="asr-text">{{ line.text }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
.tl-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-bottom: 1px solid #eff0f2;
}
.tl-title { font-size: 14px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 6px; flex: none; }

.tl-body { display: flex; flex-direction: column; gap: 16px; padding: 16px; }

.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #4b5563;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 3px 10px;
  cursor: pointer;
  user-select: none;
  line-height: 1.4;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s, color 0.15s, box-shadow 0.15s;
}
.legend-item:hover {
  background: #fff;
  border-color: #cbd5e1;
  color: #111827;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.legend-item:active {
  background: #f3f4f6;
  box-shadow: none;
}
.legend-item.active {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1d4ed8;
  font-weight: 600;
  box-shadow: none;
}
.legend-item.dimmed {
  opacity: 0.45;
  background: transparent;
}
.legend-dot { width: 8px; height: 8px; border-radius: 4px; flex: none; }

.empty-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #9ca3af;
  padding: 12px 4px;
}
.clear-filter {
  font-size: 12px;
  color: #2563eb;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.clear-filter:hover { text-decoration: underline; }

.entry {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-left: 3px solid;
  border-radius: 8px;
}
.entry-avatar {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.entry-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.entry-top { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.who { font-size: 13px; font-weight: 600; color: #111827; }
.role-badge, .how-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 4px;
}
.internal {
  font-size: 10px;
  color: #6b7280;
  background: #f3f4f6;
  border: 1px dashed #d1d5db;
  padding: 1px 6px;
  border-radius: 4px;
}
.when { margin-left: auto; font-size: 11px; color: #9ca3af; }
.what { font-size: 13px; color: #374151; line-height: 1.6; }

/* 工单处理字段变更明细 */
.chg-list {
  display: flex; flex-direction: column; gap: 4px;
  background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 6px; padding: 8px 10px;
}
.chg-row { display: flex; align-items: baseline; gap: 8px; font-size: 12px; line-height: 1.5; }
.chg-kind { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 3px; flex: none; }
.chg-add { color: #0d9488; background: #ccfbf1; }
.chg-mod { color: #b45309; background: #fef3c7; }
.chg-field { font-weight: 600; color: #374151; flex: none; }
.chg-val { color: #6b7280; min-width: 0; }
.chg-from { color: #9ca3af; text-decoration: line-through; }
.chg-arrow { margin: 0 5px; color: #9ca3af; }

/* 关联单卡片（relate 事件内联） */
.rel-mini {
  align-self: stretch;
  background: #fff; border: 1px solid #e0e7ff; border-radius: 6px;
  padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
}
.rel-mini:hover { border-color: #a5b4fc; box-shadow: 0 1px 6px rgba(79, 70, 229, 0.12); }
.rel-mini-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
.rel-mini-status { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 4px; flex: none; }
.rel-mini-title { font-size: 13px; font-weight: 600; color: #111827; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rel-mini-open { margin-left: auto; color: #4f46e5; font-size: 12px; flex: none; }
.rel-mini-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rel-mini-no { font-size: 12px; color: #4f46e5; font-weight: 600; }
.rel-mini-type { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; flex: none; }
.rel-mini-builder { font-size: 11px; color: #6b7280; }
.rel-mini-sep { color: #d1d5db; }
.rel-mini-time { margin-left: auto; font-size: 11px; color: #9ca3af; }

.attach {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  font-size: 12px;
  color: #2563eb;
  background: #fff;
  border: 1px solid #dbeafe;
  border-radius: 4px;
  padding: 3px 8px;
}

.rec-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 1px solid #cffafe;
  border-radius: 6px;
  padding: 6px 10px;
}
.rec-track { flex: 1; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; }
.rec-fill { width: 35%; height: 100%; background: #06b6d4; }
.rec-dur { font-size: 11px; color: #6b7280; }

.asr {
  background: #fff;
  border: 1px solid #cffafe;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.asr-head { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: #06b6d4; margin-bottom: 2px; }
.asr-line { font-size: 12px; line-height: 1.5; }
.asr-spk { font-weight: 600; margin-right: 6px; }
.asr-text { color: #374151; }
</style>
