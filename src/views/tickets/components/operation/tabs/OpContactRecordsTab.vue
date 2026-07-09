<script setup lang="ts">
import { reactive } from 'vue';
import {
  CaretRightOutlined,
  DownOutlined,
  UpOutlined,
  PhoneOutlined,
  MessageOutlined,
  MailOutlined,
  CommentOutlined,
  ExportOutlined,
} from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import type { ContactRecord } from '@/views/tickets/types/operationTabs';

defineProps<{ records: ContactRecord[] }>();

const expandedAsr = reactive<Record<string, boolean>>({});
const expandedNote = reactive<Record<string, boolean>>({});

const TITLE_ICON = {
  call: PhoneOutlined,
  sms: MessageOutlined,
  email: MailOutlined,
  im: CommentOutlined,
} as const;

function play() {
  message.info('播放录音');
}

function toggleAsr(id: string) {
  expandedAsr[id] = !expandedAsr[id];
}

function toggleNote(id: string) {
  expandedNote[id] = !expandedNote[id];
}

function jumpFirstline() {
  message.info('前往一线工作台查看 IM 记录');
}

function metaLabel(r: ContactRecord) {
  const prefix = r.metaPrefix ?? '操作人';
  let s = `${prefix}: ${r.operator} | ${r.when}`;
  if (r.im) s += ` | 会话 ${r.im.sessionDuration} · ${r.im.messageCount} 条`;
  return s;
}
</script>

<template>
  <div class="contact-tab">
    <div
      v-for="r in records"
      :key="r.id"
      class="record-card"
    >
      <div class="card-head">
        <div class="title-left">
          <component :is="TITLE_ICON[r.kind]" class="kind-icon" />
          <span class="title-text">{{ r.title }}</span>
          <span
            v-if="r.channel"
            class="tag"
            :class="r.channel === '热线' ? 'tag-hotline' : 'tag-im'"
          >{{ r.channel }}</span>
          <span
            class="tag"
            :class="r.source === '一线' ? 'tag-source' : 'tag-source-self'"
          >{{ r.source === '一线' ? '一线' : '二线' }}</span>
        </div>
        <span class="card-meta">{{ metaLabel(r) }}</span>
      </div>
      <div v-if="r.kind === 'im'" class="summary summary-im">
        <span class="summary-text">{{ r.summary }}</span>
        <button class="im-detail" type="button" @click="jumpFirstline">
          查看详情<ExportOutlined />
        </button>
      </div>
      <div v-else class="summary">{{ r.summary }}</div>

      <!-- 通话：录音 + 转写 -->
      <template v-if="r.kind === 'call' && r.recording">
        <div class="media-block">
          <div class="sub-label">录音</div>
          <div class="player">
            <button class="play-btn" type="button" @click="play">
              <CaretRightOutlined />
            </button>
            <div class="progress-track">
              <div
                class="progress-fill"
                :style="{ width: `${r.recording.progressPercent}%` }"
              />
            </div>
            <span class="duration">{{ r.recording.progress }}</span>
          </div>
          <div v-if="r.asr?.length" class="asr-box">
            <div class="asr-head">
              <span class="sub-label">文本转写</span>
              <span class="asr-toggle" @click="toggleAsr(r.id)">
                {{ expandedAsr[r.id] ? '收起' : '点击展开' }}
                <component :is="expandedAsr[r.id] ? UpOutlined : DownOutlined" class="asr-chevron" />
              </span>
            </div>
            <div v-if="expandedAsr[r.id]" class="asr-lines">
              <div v-for="(line, i) in r.asr" :key="i" class="asr-line">
                <span class="speaker">{{ line.speaker }}:</span> {{ line.text }}
              </div>
            </div>
          </div>

          <!-- 一线关联热线：小结（可展开），替代二线的文本转写 -->
          <div v-if="r.note" class="note-box">
            <div class="note-head">
              <span class="sub-label">一线小结</span>
              <span class="note-toggle" @click="toggleNote(r.id)">
                {{ expandedNote[r.id] ? '收起' : '展开' }}
                <component :is="expandedNote[r.id] ? UpOutlined : DownOutlined" class="asr-chevron" />
              </span>
            </div>
            <div class="note-text" :class="{ clamp: !expandedNote[r.id] }">{{ r.note }}</div>
          </div>
        </div>
      </template>

      <!-- 短信 -->
      <template v-else-if="r.kind === 'sms' && r.smsContent">
        <div class="content-block">
          <div class="sub-label">短信内容</div>
          <div class="content-box">{{ r.smsContent }}</div>
        </div>
      </template>

      <!-- 邮件 -->
      <template v-else-if="r.kind === 'email' && r.emailLines?.length">
        <div class="content-block">
          <div class="sub-label">邮件内容</div>
          <div class="content-box email-body">
            <p
              v-for="(line, i) in r.emailLines"
              :key="i"
              class="email-line"
              :class="{ bold: line.bold, muted: line.muted }"
            >
              {{ line.text }}
            </p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* sFxFw：Tab 内容 padding 16/16/24，卡片 gap 12 */
.contact-tab { display: flex; flex-direction: column; gap: 8px; width: 100%; }

.record-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.record-card:hover {
  border-color: #d1d5db;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.title-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.kind-icon {
  font-size: 14px;
  color: #6b7280;
  flex: none;
}
.title-text {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  line-height: 20px;
  min-width: 0;
}
.card-meta {
  font-size: 11px;
  color: #9ca3af;
  flex: none;
  white-space: nowrap;
  line-height: 20px;
}

.summary { font-size: 12px; color: #6b7280; line-height: 1.5; }

.media-block,
.content-block { display: flex; flex-direction: column; gap: 8px; }
.content-block { gap: 6px; }

.sub-label { font-size: 11px; font-weight: 600; color: #9ca3af; }

.player {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f9fafb;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 8px 10px;
}
.play-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  font-size: 12px;
}
.play-btn:hover {
  border-color: #93c5fd;
  color: #1a6fff;
}
.progress-track {
  flex: 1;
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill { height: 100%; background: #9ca3af; border-radius: 2px; }
.duration { font-size: 11px; color: #9ca3af; flex: none; }

.asr-box {
  background: #f9fafb;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 6px 8px;
}
.asr-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 20px;
}
.asr-head .sub-label { line-height: 20px; margin: 0; }
.asr-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #9ca3af;
  cursor: pointer;
  flex: none;
  line-height: 20px;
}
.asr-chevron { font-size: 12px; line-height: 0; }
.asr-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}
.asr-line { font-size: 12px; color: #374151; line-height: 1.5; }
.speaker { font-weight: 600; color: #6b7280; }

/* 一线关联标签：渠道 + 来源 */
.tag {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 4px;
}
.tag-hotline { color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; }
.tag-im { color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; }
.tag-source { color: #6b7280; background: #f3f4f6; border: 1px solid #e5e7eb; }
.tag-source-self { color: #2563eb; background: #eff6ff; border: 1px solid #bfdbfe; }

/* 一线小结（关联热线卡片） */
.note-box {
  background: #f9fafb;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 6px 8px;
}
.note-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 20px;
}
.note-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #9ca3af;
  cursor: pointer;
  flex: none;
  line-height: 20px;
}
.note-text { font-size: 12px; color: #374151; line-height: 1.5; margin-top: 6px; }
.note-text.clamp {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* IM 记录：摘要（首条消息）右侧「查看详情」入口 */
.summary-im {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.summary-text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.im-detail {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: #7c3aed;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  padding: 0;
}
.im-detail:hover { color: #6d28d9; }
.im-detail :deep(.anticon) { font-size: 11px; }

.content-box {
  background: #f9fafb;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.6;
}
.email-body { display: flex; flex-direction: column; gap: 6px; }
.email-line { margin: 0; }
.email-line.bold { font-weight: 600; color: #374151; }
.email-line.muted { font-size: 11px; color: #9ca3af; }
</style>
