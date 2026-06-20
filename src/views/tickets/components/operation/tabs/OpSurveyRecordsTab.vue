<script setup lang="ts">
import { message } from 'ant-design-vue';
import type { SurveyRecord } from '@/views/tickets/types/operationTabs';

defineProps<{ records: SurveyRecord[] }>();

function openSurvey() {
  message.info('打开问卷（演示）');
}
</script>

<template>
  <div class="survey-tab">
    <div
      v-for="r in records"
      :key="r.id"
      class="record-card"
      :class="r.evaluated ? 'evaluated' : 'unevaluated'"
    >
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
        <div class="content-box" :class="{ placeholder: !r.evaluated }">{{ r.conclusion }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* JZXEW Tab⑧：卡片 gap 12；标题 14/600，元信息 11，详情 12，链接 12/500 */
.survey-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  font-family: inherit;
}

.record-card {
  border-radius: 8px;
  padding: 12px 14px;
  border-left: 3px solid;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.record-card.evaluated { background: #f5f3ff; border-left-color: #7c3aed; }
.record-card.unevaluated { background: #f9fafb; border-left-color: #9ca3af; }

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
  color: #374151;
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
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
  font-weight: 400;
  color: #6b7280;
  line-height: 18px;
}
.content-box.placeholder { color: #9ca3af; }
</style>
