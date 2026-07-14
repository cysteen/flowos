<script setup lang="ts">
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  SendOutlined, SyncOutlined, CheckCircleOutlined,
  ThunderboltOutlined, BellOutlined, CloseCircleOutlined, ReloadOutlined,
} from '@ant-design/icons-vue';
import type { FeishuRecord, FeishuSyncState } from '@/mock/ticketDetail';

/** 二次激活原因枚举（对齐 PRD §7.4） */
const FEISHU_ACTIVATE_REASONS = [
  '用户反馈未解决',
  '处理结论不符预期',
  '修复未生效或问题复现',
  '影响范围扩大',
  '验收材料不足，需补充验证',
  '其他',
] as const;

const props = defineProps<{
  records: FeishuRecord[];
  syncState?: FeishuSyncState;
  /** 反馈名称（用工单标题） */
  feedbackName?: string;
  priority?: string;
  productName?: string;
  feedbackNo?: string;
  failReason?: string;
  createdAt?: string;
}>();

const emit = defineEmits<{
  activate: [reason: string];
  retry: [];
}>();

const activateOpen = ref(false);
const activateReason = ref<string>(FEISHU_ACTIVATE_REASONS[0]);
const activateNote = ref('');
const noteRequired = computed(() => activateReason.value === '其他');
const reasonOptions = FEISHU_ACTIVATE_REASONS.map((r) => ({ value: r, label: r }));

const isFailed = computed(() => props.syncState === 'failed');

/** 卡片上展示的反馈单号 */
const feedbackNo = computed(
  () => props.feedbackNo
    || props.records.find((r) => r.kind === 'push')?.meta?.replace('反馈单号 ', '')
    || '—',
);

/** 从时间线推断当前负责人 / 下游状态 */
const cardOwner = computed(() => {
  const hit = [...props.records].reverse().find((r) =>
    r.side === '飞书反馈' && (r.kind === 'feedback' || r.kind === 'result' || r.kind === 'activate'),
  );
  if (!hit) return '—';
  return hit.who.replace(/（.*?）/, '') || hit.who;
});

const cardStatus = computed(() => {
  switch (props.syncState) {
    case 'synced': return '已建单 · 待产研受理';
    case 'feedback': return '处理中 · 已有进展';
    case 'closed': return '已结案';
    case 'failed': return '关联失败';
    default: return '—';
  }
});

/** 扭转记录按时间倒序（最新在上） */
const orderedRecords = computed(() => [...props.records].reverse());

/** 飞书已结案后可二次激活 */
const canActivate = computed(() => props.syncState === 'closed');

const KIND_META: Record<FeishuRecord['kind'], { icon: unknown; color: string; tag: string }> = {
  push: { icon: SendOutlined, color: '#2563eb', tag: '建关联' },
  fail: { icon: CloseCircleOutlined, color: '#dc2626', tag: '关联失败' },
  feedback: { icon: SyncOutlined, color: '#4f46e5', tag: '预反馈' },
  result: { icon: CheckCircleOutlined, color: '#10b981', tag: '关单' },
  activate: { icon: ThunderboltOutlined, color: '#f59e0b', tag: '二次激活' },
  dunning: { icon: BellOutlined, color: '#d97706', tag: '催单提醒' },
};

function onActivate() {
  activateReason.value = FEISHU_ACTIVATE_REASONS[0];
  activateNote.value = '';
  activateOpen.value = true;
}

function confirmActivate() {
  if (!activateReason.value) {
    message.warning('请选择激活原因');
    return Promise.reject();
  }
  if (noteRequired.value && !activateNote.value.trim()) {
    message.warning('选择「其他」时请填写补充说明');
    return Promise.reject();
  }
  const text = activateNote.value.trim()
    ? `${activateReason.value}：${activateNote.value.trim()}`
    : activateReason.value;
  emit('activate', text);
  return Promise.resolve();
}

function onRetry() {
  emit('retry');
}
</script>

<template>
  <div class="fs-tab">
    <!-- 关联失败：失败横幅 -->
    <div v-if="isFailed" class="fs-fail-banner">
      <div class="fs-fail-main">
        <CloseCircleOutlined class="fs-fail-icon" />
        <div>
          <div class="fs-fail-title">转飞书失败 · 尚未关联反馈单</div>
          <div class="fs-fail-sub">{{ failReason || '未能拿到飞书反馈单号，可重新发起升级' }}</div>
        </div>
      </div>
      <button type="button" class="fs-retry" @click="onRetry">
        <ReloadOutlined />
        重新发起
      </button>
    </div>

    <!-- 成功态：关联反馈单卡片 -->
    <div v-else class="fs-summary">
      <div class="fs-summary-main">
        <span class="fs-summary-icon"><SendOutlined /></span>
        <div class="fs-summary-text">
          <div class="fs-summary-title">{{ feedbackName || '客户反馈单' }}</div>
          <div class="fs-summary-sub">反馈单号 {{ feedbackNo }}</div>
        </div>
      </div>
      <dl class="fs-summary-fields">
        <div class="fs-field">
          <dt>优先级</dt>
          <dd>{{ priority || '—' }}</dd>
        </div>
        <div class="fs-field">
          <dt>状态</dt>
          <dd>{{ cardStatus }}</dd>
        </div>
        <div class="fs-field">
          <dt>当前负责人</dt>
          <dd>{{ cardOwner }}</dd>
        </div>
        <div class="fs-field">
          <dt>创建时间</dt>
          <dd>{{ createdAt || '—' }}</dd>
        </div>
      </dl>
      <button
        type="button"
        class="fs-activate"
        :disabled="!canActivate"
        :title="canActivate ? '客户反馈未解决时可二次激活' : '飞书反馈结案后可二次激活'"
        @click="onActivate"
      >
        <ThunderboltOutlined />
        二次激活
      </button>
    </div>

    <div v-if="!records.length" class="fs-empty">暂无飞书协同记录</div>

    <!-- 协同时间线（聚焦飞书态，不双写催单/补充明细） -->
    <div v-else class="fs-timeline">
      <div v-for="rec in orderedRecords" :key="rec.id" class="fs-item">
        <div class="fs-item-rail">
          <span class="fs-item-dot" :style="{ background: KIND_META[rec.kind].color }">
            <component :is="KIND_META[rec.kind].icon" />
          </span>
          <span class="fs-item-line" />
        </div>
        <div class="fs-item-body">
          <div class="fs-item-head">
            <span
              class="fs-item-tag"
              :style="{ color: KIND_META[rec.kind].color, background: `${KIND_META[rec.kind].color}14` }"
            >
              {{ KIND_META[rec.kind].tag }}
            </span>
            <span class="fs-item-title">{{ rec.title }}</span>
            <span class="fs-item-side" :class="{ downstream: rec.side === '飞书反馈' }">{{ rec.side }}</span>
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

    <p class="fs-footnote">催单、补充信息、升级投诉、转售后等明细见「关联/补充/催单」与处理履历；本页只记与飞书反馈单相关的协同节点。</p>

    <a-modal
      v-model:open="activateOpen"
      title="二次激活飞书反馈单"
      ok-text="确认激活"
      cancel-text="取消"
      :width="480"
      destroy-on-close
      @ok="confirmActivate"
    >
      <p class="act-tip">飞书反馈已结案后，若客户问题仍未解决，可重开飞书反馈单交产研继续处理。</p>
      <div class="act-field">
        <div class="act-label"><span class="req">*</span>激活原因</div>
        <a-select
          v-model:value="activateReason"
          style="width: 100%"
          :options="reasonOptions"
          placeholder="请选择激活原因"
        />
      </div>
      <div class="act-field">
        <div class="act-label">
          <span v-if="noteRequired" class="req">*</span>补充说明
          <span v-if="!noteRequired" class="act-optional">（选填）</span>
        </div>
        <a-textarea
          v-model:value="activateNote"
          :rows="3"
          :placeholder="noteRequired ? '请说明具体原因（必填）' : '可补充客户原话、复现要点等'"
        />
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.fs-tab { display: flex; flex-direction: column; gap: 14px; }

.fs-fail-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 12px 14px;
}
.fs-fail-main { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.fs-fail-icon { color: #dc2626; font-size: 20px; margin-top: 2px; flex: none; }
.fs-fail-title { font-size: 14px; font-weight: 700; color: #991b1b; }
.fs-fail-sub { font-size: 12px; color: #b91c1c; margin-top: 2px; line-height: 1.5; }
.fs-retry {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  padding: 7px 14px; font-size: 13px; font-weight: 600; font-family: inherit;
  color: #fff; background: #dc2626; border: none; border-radius: 7px; cursor: pointer;
}
.fs-retry:hover { background: #b91c1c; }

.fs-summary {
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px;
}
.fs-summary-main { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1 1 200px; }
.fs-summary-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 8px; flex: none;
  background: #1a6fff; color: #fff; font-size: 16px;
}
.fs-summary-title { font-size: 14px; font-weight: 700; color: #0f172a; line-height: 1.35; }
.fs-summary-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
.fs-summary-fields {
  display: flex; flex-wrap: wrap; gap: 10px 18px; margin: 0; flex: 2 1 280px;
}
.fs-field { margin: 0; }
.fs-field dt { font-size: 11px; color: #94a3b8; margin: 0 0 2px; }
.fs-field dd { font-size: 12px; font-weight: 600; color: #334155; margin: 0; }
.fs-activate {
  display: inline-flex; align-items: center; gap: 6px; flex: none; margin-left: auto;
  padding: 7px 14px; font-size: 13px; font-weight: 600; font-family: inherit;
  color: #b45309; background: #fffbeb; border: 1.5px solid #fcd34d; border-radius: 7px;
  cursor: pointer; transition: background .15s, border-color .15s;
}
.fs-activate:hover:not(:disabled) { background: #fef3c7; border-color: #f59e0b; }
.fs-activate:disabled { opacity: .45; cursor: not-allowed; }

.fs-empty {
  padding: 28px 16px; text-align: center; font-size: 13px; color: #94a3b8;
  background: #f8fafc; border-radius: 8px; border: 1px dashed #e2e8f0;
}

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
.fs-item-side.downstream { color: #1d4ed8; background: #eff6ff; }
.fs-item-content { font-size: 13px; color: #374151; line-height: 1.6; margin-top: 5px; }
.fs-item-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; color: #9ca3af; margin-top: 6px; }
.fs-item-metabadge { color: #1d4ed8; background: #eff6ff; border-radius: 4px; padding: 1px 6px; }
.fs-item-when { margin-left: auto; }

.fs-footnote {
  margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.5;
  padding-top: 4px; border-top: 1px dashed #e2e8f0;
}

.act-tip { margin: 0 0 14px; font-size: 13px; color: #64748b; line-height: 1.55; }
.act-field { margin-bottom: 12px; }
.act-label { font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; }
.act-label .req { color: #ef4444; margin-right: 2px; }
.act-optional { font-weight: 400; color: #94a3b8; font-size: 12px; }
</style>
