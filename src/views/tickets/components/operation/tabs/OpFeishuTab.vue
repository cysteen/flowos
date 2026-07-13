<script setup lang="ts">
import { computed } from 'vue';
import { Modal } from 'ant-design-vue';
import {
  SendOutlined, SyncOutlined, CheckCircleOutlined,
  ThunderboltOutlined, BellOutlined,
} from '@ant-design/icons-vue';
import type { FeishuRecord, FeishuSyncState } from '@/mock/ticketDetail';

const props = defineProps<{
  records: FeishuRecord[];
  syncState?: FeishuSyncState;
}>();

const emit = defineEmits<{ activate: [reason: string] }>();

/** 反馈单号取首条「传过去」记录的 meta */
const feedbackNo = computed(() => {
  const push = props.records.find((r) => r.kind === 'push');
  return push?.meta?.replace('反馈单号 ', '') ?? '—';
});

/** 是否可二次激活：飞书已回传处理结果（closed）后开放 */
const canActivate = computed(() => props.syncState === 'closed');

const KIND_META: Record<FeishuRecord['kind'], { icon: unknown; color: string; tag: string }> = {
  push: { icon: SendOutlined, color: '#2563eb', tag: '传过去' },
  feedback: { icon: SyncOutlined, color: '#4f46e5', tag: '反馈进度' },
  result: { icon: CheckCircleOutlined, color: '#10b981', tag: '处理结果' },
  activate: { icon: ThunderboltOutlined, color: '#f59e0b', tag: '二次激活' },
  dunning: { icon: BellOutlined, color: '#d97706', tag: '催单' },
};

function onActivate() {
  Modal.confirm({
    title: '激活飞书反馈单',
    content: '处理结果不符合客户预期时，可一键激活飞书项目反馈单，回推产研继续处理。确定激活？',
    okText: '确认激活',
    cancelText: '取消',
    onOk: () => emit('activate', '客户对处理结果不认可，需重新处理'),
  });
}
</script>

<template>
  <div class="fs-tab">
    <!-- 关联飞书反馈单 概要 -->
    <div class="fs-summary">
      <div class="fs-summary-main">
        <span class="fs-summary-icon"><SendOutlined /></span>
        <div>
          <div class="fs-summary-title">已关联飞书项目 · 客户反馈单</div>
          <div class="fs-summary-sub">反馈单号 {{ feedbackNo }} · 上下游经 OpenAPI 协同</div>
        </div>
      </div>
      <button
        type="button"
        class="fs-activate"
        :disabled="!canActivate"
        :title="canActivate ? '' : '飞书回传处理结果后可激活'"
        @click="onActivate"
      >
        <ThunderboltOutlined />
        激活反馈单
      </button>
    </div>

    <!-- 扭转记录时间线 -->
    <div class="fs-timeline">
      <div v-for="rec in records" :key="rec.id" class="fs-item">
        <div class="fs-item-rail">
          <span class="fs-item-dot" :style="{ background: KIND_META[rec.kind].color }">
            <component :is="KIND_META[rec.kind].icon" />
          </span>
          <span class="fs-item-line" />
        </div>
        <div class="fs-item-body">
          <div class="fs-item-head">
            <span class="fs-item-tag" :style="{ color: KIND_META[rec.kind].color, background: `${KIND_META[rec.kind].color}14` }">
              {{ KIND_META[rec.kind].tag }}
            </span>
            <span class="fs-item-title">{{ rec.title }}</span>
            <span class="fs-item-side" :class="{ downstream: rec.side === '飞书项目' }">{{ rec.side }}</span>
          </div>
          <div class="fs-item-content">{{ rec.content }}</div>
          <div class="fs-item-meta">
            <span>{{ rec.who }}</span>
            <span v-if="rec.meta" class="fs-item-metabadge">{{ rec.meta }}</span>
            <span class="fs-item-when">{{ rec.when }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fs-tab { display: flex; flex-direction: column; gap: 14px; }

.fs-summary {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: #f5f7ff; border: 1px solid #c7d2fe; border-radius: 10px; padding: 12px 14px;
}
.fs-summary-main { display: flex; align-items: center; gap: 10px; min-width: 0; }
.fs-summary-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 8px; flex: none;
  background: #4f46e5; color: #fff; font-size: 16px;
}
.fs-summary-title { font-size: 14px; font-weight: 700; color: #312e81; }
.fs-summary-sub { font-size: 12px; color: #6366f1; margin-top: 2px; }
.fs-activate {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  padding: 7px 14px; font-size: 13px; font-weight: 600; font-family: inherit;
  color: #b45309; background: #fffbeb; border: 1.5px solid #fcd34d; border-radius: 7px;
  cursor: pointer; transition: background .15s, border-color .15s;
}
.fs-activate:hover:not(:disabled) { background: #fef3c7; border-color: #f59e0b; }
.fs-activate:disabled { opacity: .5; cursor: not-allowed; }

.fs-timeline { display: flex; flex-direction: column; }
.fs-item { display: flex; gap: 12px; }
.fs-item-rail { display: flex; flex-direction: column; align-items: center; flex: none; }
.fs-item-dot {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 50%; color: #fff; font-size: 14px; flex: none;
}
.fs-item-line { flex: 1; width: 2px; background: #e5e7eb; margin: 4px 0; min-height: 8px; }
.fs-item:last-child .fs-item-line { display: none; }
.fs-item-body { flex: 1; min-width: 0; padding-bottom: 16px; }
.fs-item-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fs-item-tag { font-size: 11px; font-weight: 700; border-radius: 4px; padding: 1px 7px; flex: none; }
.fs-item-title { font-size: 13px; font-weight: 600; color: #111827; }
.fs-item-side {
  font-size: 11px; color: #6b7280; background: #f3f4f6; border-radius: 4px; padding: 1px 6px; flex: none;
}
.fs-item-side.downstream { color: #4338ca; background: #eef2ff; }
.fs-item-content { font-size: 13px; color: #374151; line-height: 1.6; margin-top: 5px; }
.fs-item-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; color: #9ca3af; margin-top: 6px; }
.fs-item-metabadge { color: #6366f1; background: #eef2ff; border-radius: 4px; padding: 1px 6px; }
.fs-item-when { margin-left: auto; }
</style>
