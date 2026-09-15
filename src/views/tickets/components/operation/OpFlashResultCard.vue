<script setup lang="ts">
/**
 * 刷机单「工单处理」Tab 第一块：自动刷机结果（只读卡，PRD §5.2 / 页面规格 P4、P0-11、P0′-14）。
 * 卡上无操作按钮；卡头右侧外链「智能硬件平台」。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ExportOutlined, ThunderboltOutlined } from '@ant-design/icons-vue';
import { useFlashConfigStore } from '@/stores/flashConfig';
import {
  FLASH_EXTERNAL_LINKS, FLASH_VERIFY_ITEM_LABELS,
  flashElapsedText, flashExternalUrl, flashRunInitiator, flashRunResultText,
  type TicketFlash,
} from '@/views/tickets/types/flash';

const props = defineProps<{
  /** 刷机字段组（工单库那一行的快照） */
  flash: TicketFlash;
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

const outcomeTone = computed(() => {
  const o = state.value.outcome;
  if (o === '等待回传') return 'auto';
  if (o === '接收成功') return 'ok';
  return 'bad';
});

const failText = computed(() => config.failReasonText(state.value.failL1, state.value.failL2));

const verify = computed(() => {
  const v = state.value.verifyResult;
  if (v.status === '未校验') return null;
  return [
    { label: FLASH_VERIFY_ITEM_LABELS.snAccountMatch, value: v.snAccountMatch },
    { label: FLASH_VERIFY_ITEM_LABELS.graduate, value: v.graduate },
  ];
});

/** 推送记录：时间倒序，不分页 */
const runRows = computed(() => [...props.flash.runs].reverse().map((r) => ({
  id: r.id,
  at: r.pushedAt,
  initiator: flashRunInitiator(r),
  result: flashRunResultText(r.result),
  resultTone: r.result === '等待回传' ? 'auto' : r.result === '接收成功' ? 'ok' : 'bad',
  fail: config.failReasonText(r.failL1, r.failL2) || '—',
})));

const hardwareUrl = computed(() => flashExternalUrl('hardwarePlatform', props.flash.info.sn));
</script>

<template>
  <section class="fr-card">
    <header class="fr-head">
      <span class="fr-title"><ThunderboltOutlined class="fr-icon" />自动刷机结果</span>
      <a class="fr-link" :href="hardwareUrl" target="_blank" rel="noopener noreferrer">
        {{ FLASH_EXTERNAL_LINKS.hardwarePlatform.label }}<ExportOutlined />
      </a>
    </header>

    <div class="fr-body">
      <div v-if="state.lateSuccessAt" class="fr-late">
        超时后收到回传：接收成功 {{ state.lateSuccessAt.slice(0, 16) }}
      </div>

      <dl class="fr-kv">
        <div class="fr-row">
          <dt>建单校验结果</dt>
          <dd>
            <span v-if="!verify" class="fr-muted">未校验</span>
            <template v-else>
              <template v-for="(item, i) in verify" :key="item.label">
                <span class="fr-verify">
                  {{ item.label }}：<b :class="item.value === '通过' ? 'tone-ok' : 'tone-bad'">{{ item.value }}</b>
                </span><span v-if="i < verify.length - 1" class="fr-sep">；</span>
              </template>
            </template>
          </dd>
        </div>

        <div v-if="pushed" class="fr-row">
          <dt>当前结果</dt>
          <dd>
            <span class="fr-outcome" :class="`tone-${outcomeTone}`">{{ flashRunResultText(state.outcome) }}</span>
            <span v-if="waiting" class="fr-elapsed"> · 已推送 {{ elapsedText }}</span>
          </dd>
        </div>

        <div v-if="failText" class="fr-row">
          <dt>失败原因</dt>
          <dd>{{ failText }}</dd>
        </div>

        <div v-if="state.handoffReason" class="fr-row">
          <dt>转人工原因</dt>
          <dd>{{ state.handoffReason }}</dd>
        </div>

        <div v-if="pushed" class="fr-row">
          <dt>推送次数</dt>
          <dd>{{ state.pushCount }} 次</dd>
        </div>
      </dl>

      <div v-if="pushed" class="fr-table-wrap">
        <table class="fr-table">
          <thead>
            <tr><th>时间</th><th>发起方</th><th>结果</th><th>失败原因</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in runRows" :key="r.id">
              <td class="num">{{ r.at }}</td>
              <td>{{ r.initiator }}</td>
              <td><span :class="`tone-${r.resultTone}`">{{ r.result }}</span></td>
              <td>{{ r.fail }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.fr-card { display: flex; flex-direction: column; }
.fr-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 12px; min-height: 32px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px 8px 0 0;
}
.fr-title { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #374151; }
.fr-icon { color: #6b7280; font-size: 14px; }
.fr-link {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; color: #1a6fff; white-space: nowrap;
}
.fr-link:hover { text-decoration: underline; }
.fr-body {
  display: flex; flex-direction: column; gap: 8px;
  padding: 8px 12px 10px; background: #f8fafc;
  border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;
}
.fr-late {
  align-self: flex-start;
  padding: 2px 8px; font-size: 12px; font-weight: 600; line-height: 20px;
  color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 4px;
}
.fr-kv { display: flex; flex-direction: column; gap: 6px; margin: 0; }
.fr-row { display: flex; align-items: baseline; gap: 12px; font-size: 12px; line-height: 20px; }
.fr-row dt { flex: none; width: 84px; color: #6b7280; }
.fr-row dd { flex: 1; min-width: 0; margin: 0; color: #111827; }
.fr-verify b { font-weight: 600; }
.fr-sep { color: #9ca3af; margin: 0 4px; }
.fr-muted { color: #6b7280; }
.fr-outcome { font-weight: 600; }
.fr-elapsed { color: #6b7280; font-variant-numeric: tabular-nums; }
.tone-ok { color: #059669; }
.tone-bad { color: #dc2626; }
.tone-auto { color: #7c3aed; }
.fr-table-wrap { overflow-x: auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; }
.fr-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.fr-table th {
  padding: 6px 10px; text-align: left; font-weight: 600; color: #6b7280;
  background: #f9fafb; border-bottom: 1px solid #e5e7eb; white-space: nowrap;
}
.fr-table td { padding: 6px 10px; color: #374151; border-bottom: 1px solid #f3f4f6; white-space: nowrap; }
.fr-table tr:last-child td { border-bottom: none; }
.fr-table td.num { font-variant-numeric: tabular-nums; }
</style>
