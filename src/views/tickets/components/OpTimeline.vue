<script setup lang="ts">
import {
  PlusCircleOutlined, UserSwitchOutlined, VerticalAlignTopOutlined,
  PauseCircleOutlined, SwapOutlined, PhoneOutlined, MessageOutlined,
  PaperClipOutlined, RollbackOutlined, BellOutlined, CheckCircleOutlined,
  StarFilled, PlayCircleOutlined, DownloadOutlined, ThunderboltOutlined,
} from '@ant-design/icons-vue';
import {
  CATEGORY_META, ROLE_BADGE, softBg,
  type TlAction, type TimelineEntry,
} from '@/views/tickets/types/ticketDetail';

defineProps<{ entries: TimelineEntry[] }>();

const ICON: Record<TlAction, unknown> = {
  create: PlusCircleOutlined,
  accept: UserSwitchOutlined,
  escalate: VerticalAlignTopOutlined,
  hold: PauseCircleOutlined,
  transfer: SwapOutlined,
  phone: PhoneOutlined,
  sms: MessageOutlined,
  supplement: PaperClipOutlined,
  reply: RollbackOutlined,
  dunning: BellOutlined,
  resolved: CheckCircleOutlined,
  praise: StarFilled,
};
const LEGEND = Object.values(CATEGORY_META);
</script>

<template>
  <div class="timeline-card">
    <!-- 标题 -->
    <div class="tl-header">
      <span class="tl-title">工单动态</span>
      <span class="tl-sub">全流程关键事件 · 状态 + 动作合一（建单 / 对客沟通 / 催办 / 解决 / 好评）</span>
    </div>

    <div class="tl-body">
      <!-- 图例 -->
      <div class="legend">
        <span v-for="l in LEGEND" :key="l.label" class="legend-item">
          <span class="legend-dot" :style="{ background: l.color }"></span>{{ l.label }}
        </span>
      </div>

      <!-- 条目 -->
      <div
        v-for="e in entries"
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
  align-items: baseline;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid #eff0f2;
}
.tl-title { font-size: 14px; font-weight: 700; color: #111827; }
.tl-sub { font-size: 11px; color: #9ca3af; }

.tl-body { display: flex; flex-direction: column; gap: 12px; padding: 16px; }

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 8px 12px;
  background: #fafafa;
  border: 1px solid #eef0f2;
  border-radius: 8px;
}
.legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #6b7280; }
.legend-dot { width: 8px; height: 8px; border-radius: 4px; }

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
