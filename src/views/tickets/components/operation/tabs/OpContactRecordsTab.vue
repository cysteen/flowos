<script setup lang="ts">
import { CaretRightOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import type { ContactRecord } from '@/views/tickets/types/operationTabs';

defineProps<{ records: ContactRecord[] }>();

function play() {
  message.info('播放录音（演示）');
}

function toggleAsr(id: string) {
  message.info(`展开转写 ${id}（演示）`);
}
</script>

<template>
  <div class="contact-tab">
    <div
      v-for="r in records"
      :key="r.id"
      class="record-card"
      :class="r.kind"
    >
      <div class="card-head">
        <span class="card-title">{{ r.kind === 'call' ? '📞' : '💬' }} {{ r.title }}</span>
        <span class="card-meta">操作人: {{ r.operator }} | {{ r.when }}</span>
      </div>
      <div class="summary">{{ r.summary }}</div>

      <template v-if="r.kind === 'call' && r.recording">
        <div class="sub-label">录音</div>
        <div class="player">
          <button class="play-btn" @click="play"><CaretRightOutlined /></button>
          <div class="progress-track">
            <div class="progress-fill" />
          </div>
          <span class="duration">{{ r.recording.progress }}</span>
        </div>
        <div v-if="r.asr?.length" class="asr-box">
          <div class="asr-head">
            <span class="sub-label">文本转写</span>
            <span class="asr-toggle" @click="toggleAsr(r.id)">展开 ›</span>
          </div>
          <div class="asr-lines">
            <div v-for="(line, i) in r.asr" :key="i" class="asr-line">
              <span class="speaker">{{ line.speaker }}:</span> {{ line.text }}
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="r.smsContent">
        <div class="sub-label">短信内容</div>
        <div class="sms-box">{{ r.smsContent }}</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.contact-tab { display: flex; flex-direction: column; gap: 12px; }
.record-card {
  border-radius: 8px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 8px;
  border-left: 3px solid transparent;
}
.record-card.call { background: #ecfeff; border-left-color: #06b6d4; }
.record-card.sms { background: #eff6ff; border-left-color: #2563eb; }
.card-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
}
.card-title { font-size: 14px; font-weight: 600; color: #111827; }
.card-meta { font-size: 11px; color: #9ca3af; }
.summary { font-size: 12px; color: #6b7280; }
.sub-label { font-size: 12px; font-weight: 600; color: #374151; }
.player {
  display: flex; align-items: center; gap: 8px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px;
}
.play-btn {
  width: 28px; height: 28px; border-radius: 50%; border: none;
  background: #1a6fff; color: #fff; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; flex: none;
}
.progress-track {
  flex: 1; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden;
}
.progress-fill { width: 48%; height: 100%; background: #1a6fff; border-radius: 2px; }
.duration { font-size: 11px; color: #9ca3af; flex: none; }
.asr-box {
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px;
}
.asr-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.asr-toggle { font-size: 11px; color: #1a6fff; cursor: pointer; }
.asr-lines { display: flex; flex-direction: column; gap: 4px; }
.asr-line { font-size: 12px; color: #374151; line-height: 1.5; }
.speaker { font-weight: 600; color: #6b7280; }
.sms-box {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 10px; font-size: 12px; color: #374151; line-height: 1.6;
}
</style>
