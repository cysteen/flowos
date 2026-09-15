<script setup lang="ts">
import { computed } from 'vue';
import { message } from 'ant-design-vue';
import { useRoute, useRouter } from 'vue-router';
import type { SurveyRecord } from '@/views/tickets/types/operationTabs';
import { useFlashStore } from '@/stores/flash';
import { useNotifyLogStore } from '@/stores/notifyLog';
import { FLASH_NOTIFY_EVENTS, flashSurveyPath } from '@/views/tickets/types/flash';

const props = defineProps<{ records: SurveyRecord[] }>();

const route = useRoute();
const router = useRouter();
const flash = useFlashStore();
const notifyLog = useNotifyLogStore();
const ticketNo = computed(() => String(route.params.ticketNo ?? ''));

/**
 * 刷机单（930 PRD §8 / M86）：调研记录取本单的调研短信（通知记录）与用户评价，
 * 评价归到提交前最近发出的那一条调研短信上；四类老工单沿用预置样本。
 */
const flashRecords = computed<SurveyRecord[] | null>(() => {
  const no = ticketNo.value;
  void flash.revisionOf(no);
  const f = flash.flashOf(no);
  if (!f) return null;
  const survey = f.state.survey;
  const sent = notifyLog.recordsOf(no).filter((r) => r.event === FLASH_NOTIFY_EVENTS.survey);
  const answeredId = survey ? sent.find((r) => r.when <= survey.at)?.id : undefined;
  const conclusion = survey
    ? `是否解决：${survey.solved ? '已解决' : '未解决'} | 满意度：${survey.score} 星${survey.remark ? ` | 补充说明：${survey.remark}` : ''}`
    : '';
  const rows: SurveyRecord[] = sent.map((r) => ({
    id: r.id,
    title: '满意度调研',
    sentAt: r.when,
    evaluated: r.id === answeredId,
    linkLabel: '查看问卷',
    conclusion: r.id === answeredId ? conclusion : '是否解决：— | 满意度：—',
  }));
  if (survey && !answeredId) {
    rows.push({
      id: `flash-survey-${no}`, title: '满意度调研', sentAt: f.state.surveySentAt ?? survey.at,
      evaluated: true, linkLabel: '查看问卷', conclusion,
    });
  }
  return rows;
});

const shownRecords = computed(() => flashRecords.value ?? props.records);

function openSurvey() {
  if (flashRecords.value) {
    window.open(router.resolve(flashSurveyPath(ticketNo.value)).href, '_blank', 'noopener');
    return;
  }
  message.info('打开问卷');
}
</script>

<template>
  <div class="survey-tab">
    <div v-for="r in shownRecords" :key="r.id" class="record-card">
      <div class="card-head">
        <div class="title-left">
          <span class="icon-wrap" aria-hidden="true">
            <!-- fSoej / PQ5NV：设计稿为 14px #374151 剪贴板图标（📋），非 FormOutlined -->
            <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3.25" y="3.25" width="7.5" height="9" rx="1" stroke="currentColor" stroke-width="1.1" />
              <path
                d="M5.5 3.25V2.75C5.5 2.2 5.95 1.75 6.5 1.75H7.5C8.05 1.75 8.5 2.2 8.5 2.75V3.25"
                stroke="currentColor"
                stroke-width="1.1"
                stroke-linecap="round"
              />
              <path d="M5.25 6.25H8.75" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
              <path d="M5.25 8.25H8.75" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
            </svg>
          </span>
          <span class="title-text">{{ r.title }}</span>
        </div>
        <span class="card-meta">发送时间: {{ r.sentAt }}</span>
      </div>

      <div class="detail-row">
        <span class="detail-prefix">
          是否评价: {{ r.evaluated ? '已评价' : '未评价' }} | 问卷链接:
        </span>
        <span v-if="r.linkLabel" class="link" @click="openSurvey">{{ r.linkLabel }}</span>
      </div>

      <div v-if="r.conclusion" class="conclusion-block">
        <div class="sub-label">评价结论</div>
        <div class="content-box">{{ r.conclusion }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.survey-tab {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  font-family: inherit;
}

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
  min-height: 20px;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.icon-wrap {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  line-height: 0;
  color: #6b7280;
}
.icon-wrap svg {
  display: block;
  width: 14px;
  height: 14px;
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
  font-weight: 400;
  color: #9ca3af;
  flex: none;
  white-space: nowrap;
  line-height: 20px;
}

.detail-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0;
  font-size: 12px;
  line-height: 18px;
}
.detail-prefix {
  font-weight: 400;
  color: #6b7280;
}
.link {
  color: #1a6fff;
  font-weight: 500;
  cursor: pointer;
  flex: none;
}

.conclusion-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sub-label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  line-height: 18px;
}
.content-box {
  background: #f9fafb;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
  font-weight: 400;
  color: #6b7280;
  line-height: 1.6;
}
</style>
