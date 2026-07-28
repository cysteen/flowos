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
  dunning: [];
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

/** 从时间线推断当前负责人 */
const cardOwner = computed(() => {
  const hit = [...props.records].reverse().find((r) =>
    r.side === '产研侧' && (r.kind === 'feedback' || r.kind === 'result' || r.kind === 'activate'),
  );
  if (!hit) return '—';
  return hit.who.replace(/（.*?）/, '') || hit.who;
});

/** 时间线人员展示：产研侧统一为「张三（技术支持）」 */
function displayWho(who: string) {
  return who
    .replace(/何霄煜（飞书·技术支持）/g, '张三（技术支持）')
    .replace(/何霄煜（技术支持）/g, '张三（技术支持）');
}

/** 处理人字段：标签=角色名，值为人员 */
const handler = { label: '技术支持', name: '张三' } as const;

/** 扭转记录按时间倒序（最新在上） */
const orderedRecords = computed(() => [...props.records].reverse());

/**
 * 产研反馈单状态枚举（PRD §7.2）：已建单 / 处理中 / 已反馈 / 已结案
 * 「已催单」不做主状态——催单是过程动作，记履历即可
 */
const statusMeta = computed(() => {
  if (props.syncState === 'failed') {
    return { label: '关联失败', tone: 'danger' as const };
  }
  if (props.syncState === 'closed') {
    return { label: '已结案', tone: 'done' as const };
  }
  const kinds = new Set(props.records.map((r) => r.kind));
  // 二次激活后回到处理中（已有 activate，且当前未结案）
  if (kinds.has('activate') && props.syncState === 'synced') {
    return { label: '处理中', tone: 'doing' as const };
  }
  if (props.syncState === 'feedback' || kinds.has('feedback')) {
    return { label: '已反馈', tone: 'feedback' as const };
  }
  if (kinds.has('push') || props.syncState === 'synced') {
    // 仅建关联、尚无预反馈 → 已建单
    return { label: '已建单', tone: 'created' as const };
  }
  return { label: '—', tone: 'created' as const };
});

/** 更新时间：取时间线最新一条；无记录则回落创建时间 */
const updatedAt = computed(() => {
  if (!props.records.length) return props.createdAt || '—';
  return orderedRecords.value[0]?.when || props.createdAt || '—';
});


/** 已关联产研反馈（synced/feedback/closed）→ 催单、二次激活两按钮均常驻展示 */
const isAssociated = computed(() =>
  props.syncState === 'synced' || props.syncState === 'feedback' || props.syncState === 'closed',
);
/** 催单：处理中/已反馈（未结案）可点；已结案置灰不可催 */
const dunningEnabled = computed(() =>
  props.syncState === 'synced' || props.syncState === 'feedback',
);
/** 二次激活：仅已结案可点；未结案置灰 */
const activateEnabled = computed(() => props.syncState === 'closed');

const KIND_META: Record<FeishuRecord['kind'], { icon: unknown; color: string; tag: string }> = {
  push: { icon: SendOutlined, color: '#2563eb', tag: '建关联' },
  fail: { icon: CloseCircleOutlined, color: '#dc2626', tag: '关联失败' },
  feedback: { icon: SyncOutlined, color: '#1a6fff', tag: '预反馈' },
  result: { icon: CheckCircleOutlined, color: '#10b981', tag: '关单' },
  activate: { icon: ThunderboltOutlined, color: '#f59e0b', tag: '二次激活' },
  dunning: { icon: BellOutlined, color: '#d97706', tag: '催单' },
};

function onActivate() {
  if (!activateEnabled.value) return;
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
  activateOpen.value = false;
  emit('activate', text);
  return Promise.resolve();
}

function onRetry() {
  emit('retry');
}

function onDunning() {
  if (!dunningEnabled.value) return;
  emit('dunning');
}
</script>

<template>
  <div class="fs-tab">
    <!-- 关联失败：失败横幅 -->
    <div v-if="isFailed" class="fs-fail-banner">
      <div class="fs-fail-main">
        <CloseCircleOutlined class="fs-fail-icon" />
        <div>
          <div class="fs-fail-title">转产研反馈失败 · 尚未关联反馈单</div>
          <div class="fs-fail-sub">{{ failReason || '未能拿到反馈单号，可重新发起升级' }}</div>
        </div>
      </div>
      <button type="button" class="fs-retry" @click="onRetry">
        <ReloadOutlined />
        重新发起
      </button>
    </div>

    <!-- 产研反馈单：主体信息 + 状态反馈 -->
    <section v-else class="fs-sheet" aria-label="产研反馈单主体信息">
      <header class="fs-sheet-head">
        <div class="fs-sheet-brand">
          <h3 class="fs-sheet-title">{{ feedbackName || '客户反馈单' }}</h3>
          <div class="fs-sheet-idrow">
            <span class="fs-sheet-no">{{ feedbackNo }}</span>
            <span v-if="productName" class="fs-sheet-dot">·</span>
            <span v-if="productName" class="fs-sheet-product">{{ productName }}</span>
          </div>
        </div>
        <div v-if="isAssociated" class="fs-sheet-actions">
          <button
            type="button"
            class="action-btn"
            :disabled="!dunningEnabled"
            :title="dunningEnabled ? '' : '已结案，无需催单'"
            @click="onDunning"
          >催单</button>
          <button
            type="button"
            class="action-btn"
            :disabled="!activateEnabled"
            :title="activateEnabled ? '' : '产研反馈结案后方可二次激活'"
            @click="onActivate"
          >二次激活</button>
          <span class="fs-status" :class="`tone-${statusMeta.tone}`">{{ statusMeta.label }}</span>
        </div>
        <div v-else class="fs-sheet-actions">
          <span class="fs-status" :class="`tone-${statusMeta.tone}`">{{ statusMeta.label }}</span>
        </div>
      </header>

      <div class="fs-sheet-meta">
        <span class="fs-meta-pair">
          <span class="fs-meta-label">优先级</span>
          <em class="fs-prio">{{ priority || '—' }}</em>
        </span>
        <span class="fs-meta-sep" aria-hidden="true" />
        <span class="fs-meta-pair">
          <span class="fs-meta-label">负责人</span>
          <span class="fs-meta-value">{{ cardOwner }}</span>
        </span>
        <span class="fs-meta-sep" aria-hidden="true" />
        <span class="fs-meta-pair">
          <span class="fs-meta-label">{{ handler.label }}</span>
          <span class="fs-meta-value">{{ handler.name }}</span>
        </span>
        <span class="fs-meta-sep" aria-hidden="true" />
        <span class="fs-meta-pair">
          <span class="fs-meta-label">创建</span>
          <span class="fs-meta-value">{{ createdAt || '—' }}</span>
        </span>
        <span class="fs-meta-sep" aria-hidden="true" />
        <span class="fs-meta-pair">
          <span class="fs-meta-label">更新</span>
          <span class="fs-meta-value">{{ updatedAt }}</span>
        </span>
      </div>
    </section>

    <div v-if="!records.length" class="fs-empty">暂无产研反馈协同记录</div>

    <!-- 协同时间线 -->
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
            <span class="fs-item-side" :class="{ downstream: rec.side === '产研侧' }">{{ rec.side }}</span>
          </div>
          <div class="fs-item-content">{{ rec.content }}</div>
          <!-- 预反馈 / 关单节点内联「问题原因 / 处理结果」——用户最关注的要点 -->
          <div v-if="rec.cause || rec.result" class="fs-item-fields">
            <div v-if="rec.cause" class="fs-field">
              <span class="fs-field-label label-cause">问题原因</span>
              <span class="fs-field-text">{{ rec.cause }}</span>
            </div>
            <div v-if="rec.result" class="fs-field">
              <span class="fs-field-label label-result">处理结果</span>
              <span class="fs-field-text">{{ rec.result }}</span>
            </div>
          </div>
          <div class="fs-item-meta">
            <span>{{ displayWho(rec.who) }}</span>
            <span v-if="rec.meta" class="fs-item-metabadge">{{ rec.meta }}</span>
            <span class="fs-item-when">{{ rec.when }}</span>
          </div>
        </div>
      </div>
    </div>

    <a-modal
      v-model:open="activateOpen"
      title="二次激活产研反馈单"
      ok-text="确认激活"
      cancel-text="取消"
      :width="480"
      destroy-on-close
      @ok="confirmActivate"
    >
      <p class="act-tip">产研反馈已结案后，若客户问题仍未解决，可重开反馈单交产研继续处理。</p>
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

/* 主体信息板：反馈单身份 + 状态反馈 */
.fs-sheet {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}
.fs-sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px 12px;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  border-bottom: 1px solid #f1f5f9;
}
.fs-sheet-brand { min-width: 0; flex: 1; }
.fs-sheet-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.4;
  word-break: break-word;
}
.fs-sheet-idrow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
}
.fs-sheet-no {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
  color: #475569;
}
.fs-sheet-dot { color: #cbd5e1; }
.fs-sheet-product { color: #64748b; }

.fs-sheet-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex: none;
}
.fs-status {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  border-radius: 999px;
  padding: 4px 10px;
  white-space: nowrap;
}
/* 状态色对齐 PRD §7.2 胶囊色表 */
.fs-status.tone-created { color: #1d4ed8; background: #dbeafe; }   /* 已建单 · 蓝 */
.fs-status.tone-doing { color: #0369a1; background: #e0f2fe; }     /* 处理中 · 青 */
.fs-status.tone-feedback { color: #0f766e; background: #ccfbf1; }  /* 已反馈 · 青绿 */
.fs-status.tone-done { color: #047857; background: #d1fae5; }      /* 已结案 · 绿 */
.fs-status.tone-danger { color: #b91c1c; background: #fee2e2; }    /* 关联失败 · 红 */

/* 对齐工单头「催单」对齐键按钮（OpHeader.action-btn） */
.action-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  color: #1a6fff;
  background: #fff;
  border: 1.5px solid #93c5fd;
  border-radius: 6px;
  cursor: pointer;
  flex: none;
  font-family: inherit;
  white-space: nowrap;
  appearance: none;
  box-shadow: 0 1px 2px rgba(26, 111, 255, 0.1);
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.action-btn:hover:not(:disabled) {
  background: #eff6ff;
  border-color: #1a6fff;
  box-shadow: 0 2px 8px rgba(26, 111, 255, 0.18);
}
.action-btn:disabled {
  color: #b6bcc6;
  background: #f5f6f8;
  border-color: #e5e7eb;
  box-shadow: none;
  cursor: not-allowed;
}

.fs-sheet-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 0;
  padding: 6px 16px;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
}
.fs-meta-pair {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 1.2;
  padding: 2px 0;
}
.fs-meta-label {
  color: #94a3b8;
  font-weight: 500;
  flex: none;
}
.fs-meta-value {
  color: #334155;
  font-weight: 600;
}
.fs-meta-sep {
  width: 1px;
  height: 12px;
  background: #e2e8f0;
  margin: 0 12px;
  flex: none;
}
.fs-prio {
  font-style: normal;
  color: #c2410c;
  background: #fff7ed;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 720px) {
  .fs-sheet-head { flex-direction: column; }
  .fs-sheet-actions { align-items: flex-start; flex-direction: row; flex-wrap: wrap; }
  .fs-meta-sep { margin: 0 8px; }
}

/* 时间线节点内联「问题原因 / 处理结果」——轻量，不另起卡片 */
.fs-item-fields {
  margin-top: 6px; display: flex; flex-direction: column; gap: 6px;
}
.fs-field { display: flex; gap: 8px; align-items: flex-start; }
.fs-field-label {
  flex: none; font-size: 11px; font-weight: 700; border-radius: 4px;
  padding: 1px 7px; line-height: 18px;
}
.label-cause { color: #b45309; background: #fef3c7; }
.label-result { color: #047857; background: #d1fae5; }
.fs-field-text { font-size: 13px; color: #334155; line-height: 1.6; }

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

.act-tip { margin: 0 0 14px; font-size: 13px; color: #64748b; line-height: 1.55; }
.act-field { margin-bottom: 12px; }
.act-label { font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; }
.act-label .req { color: #ef4444; margin-right: 2px; }
.act-optional { font-weight: 400; color: #94a3b8; font-size: 12px; }
</style>
