<script setup lang="ts">
/**
 * 刷机单速览带「最新处理」卡的第一条：自动刷机结果（只读，PRD §5.2 / 页面规格 P4、P0-11、P0′-14）。
 * 与卡内其余条目同一样式：抬头「系统」+ 灰底标签「自动刷机结果」+ 外链「智能硬件平台」+ 时间（最近一次推送或回传，到秒）；
 * 正文逐行：① 当前结果 · 失败原因 ② 转人工原因；推送次数 ③ 建单校验 ④ 起推送记录（时间 发起方 结果），
 * 收起时推送记录只列最近 1 条、每行超长截断；卡片 ⤢ 放大后（`expanded`）全部列出、不截断。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ExportOutlined } from '@ant-design/icons-vue';
import { useFlashConfigStore } from '@/stores/flashConfig';
import {
  FLASH_EXTERNAL_LINKS, FLASH_VERIFY_ITEM_LABELS,
  flashElapsedText, flashExternalUrl, flashRunInitiator, flashRunResultText,
  type TicketFlash,
} from '@/views/tickets/types/flash';

const props = defineProps<{
  /** 刷机字段组（工单库那一行的快照） */
  flash: TicketFlash;
  /** 所在卡片已放大：推送记录全部列出、不截断 */
  expanded?: boolean;
}>();

const config = useFlashConfigStore();

const state = computed(() => props.flash.state);
const pushed = computed(() => state.value.pushCount >= 1);
const latestRun = computed(() => props.flash.runs[props.flash.runs.length - 1]);
const waiting = computed(() => pushed.value && state.value.outcome === '等待回传');

/* ---- 「已推送 mm:ss」每秒刷新；回传到达或转人工后计时消失 ---- */
const now = ref(Date.now());
let timer: number | undefined;
watch(
  waiting,
  (on) => {
    window.clearInterval(timer);
    timer = undefined;
    if (on) {
      now.value = Date.now();
      timer = window.setInterval(() => { now.value = Date.now(); }, 1000);
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => window.clearInterval(timer));

const elapsedText = computed(() => (latestRun.value ? flashElapsedText(now.value - latestRun.value.pushedAtMs) : '00:00'));

type Tone = 'auto' | 'ok' | 'bad';
const toneOf = (o: string): Tone => (o === '等待回传' ? 'auto' : o === '接收成功' ? 'ok' : 'bad');

const failText = computed(() => config.failReasonText(state.value.failL1, state.value.failL2));

/** 抬头时间：最近一次推送的回传 / 判定时刻，未回传取推送时刻；从未推送不出 */
const headTime = computed(() => (latestRun.value ? latestRun.value.resultAt ?? latestRun.value.pushedAt : ''));

/** 第 1 行：当前结果 · 失败原因（失败原因已含一级结果，有则直接用它） */
const line1 = computed(() => {
  if (pushed.value) {
    return { text: failText.value || flashRunResultText(state.value.outcome), tone: toneOf(state.value.outcome) };
  }
  return failText.value ? { text: failText.value, tone: 'bad' as Tone } : null;
});

/** 第 2 行：转人工原因；推送次数 */
const line2 = computed(() => [
  state.value.handoffReason ? `转人工原因：${state.value.handoffReason}` : '',
  pushed.value ? `推送 ${state.value.pushCount} 次` : '',
].filter(Boolean).join('；'));

/** 第 3 行：建单校验 */
const verify = computed(() => {
  const v = state.value.verifyResult;
  if (v.status === '未校验') return null;
  return [
    { label: FLASH_VERIFY_ITEM_LABELS.snAccountMatch, value: v.snAccountMatch },
    { label: FLASH_VERIFY_ITEM_LABELS.graduate, value: v.graduate },
  ];
});

/** 推送记录：时间倒序；收起只列最近 1 条 */
const runRows = computed(() => [...props.flash.runs].reverse().map((r) => ({
  id: r.id,
  at: r.pushedAt,
  initiator: flashRunInitiator(r),
  text: config.failReasonText(r.failL1, r.failL2) || flashRunResultText(r.result),
  tone: toneOf(r.result),
})));
const shownRuns = computed(() => (props.expanded ? runRows.value : runRows.value.slice(0, 1)));

const hardwareUrl = computed(() => flashExternalUrl('hardwarePlatform', props.flash.info.sn));
</script>

<template>
  <div class="handle-item fr-item" :class="{ 'is-expanded': expanded }">
    <div class="fr-meta">
      <span class="fr-who">系统</span>
      <span class="fr-action">自动刷机结果</span>
      <a class="fr-link" :href="hardwareUrl" target="_blank" rel="noopener noreferrer">
        {{ FLASH_EXTERNAL_LINKS.hardwarePlatform.label }}<ExportOutlined />
      </a>
      <span v-if="headTime" class="fr-when">{{ headTime }}</span>
    </div>
    <div class="fr-text">
      <div v-if="line1" class="fr-line">
        <span :class="`tone-${line1.tone}`">{{ line1.text }}</span>
        <span v-if="waiting" class="fr-elapsed"> · 已推送 {{ elapsedText }}</span>
      </div>
      <div v-if="line2" class="fr-line">{{ line2 }}</div>
      <div class="fr-line">
        建单校验：<template v-if="!verify">未校验</template>
        <template v-else>
          <template v-for="(item, i) in verify" :key="item.label">
            {{ item.label }} <span :class="item.value === '通过' ? 'tone-ok' : 'tone-bad'">{{ item.value }}</span><template v-if="i < verify.length - 1">；</template>
          </template>
        </template>
      </div>
      <div v-for="r in shownRuns" :key="r.id" class="fr-line fr-run">
        {{ r.at }} {{ r.initiator }} <span :class="`tone-${r.tone}`">{{ r.text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 条目样式与「最新处理」卡其余条目一致（OpOverviewBand 的 .hi-meta / .hi-who / .hi-action / .hi-when / .hi-text） */
.fr-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; min-width: 0; }
.fr-who { font-size: 12px; font-weight: 600; color: #111827; }
.fr-action {
  font-size: 11px; line-height: 18px; color: #6b7280; background: #f3f4f6;
  border-radius: 4px; padding: 0 6px; white-space: nowrap;
}
.fr-link {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 2px;
  font-size: 11px; color: #1a6fff; white-space: nowrap;
}
.fr-link:hover { text-decoration: underline; }
.fr-when { font-size: 11px; color: #9ca3af; white-space: nowrap; font-variant-numeric: tabular-nums; }
.fr-text { font-size: 12px; line-height: 1.6; color: #374151; }
.fr-item:not(.is-expanded) .fr-line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-run { font-variant-numeric: tabular-nums; }
.fr-elapsed { color: #6b7280; font-variant-numeric: tabular-nums; }
.tone-ok { color: #059669; }
.tone-bad { color: #dc2626; }
.tone-auto { color: #7c3aed; }
</style>
