<script setup lang="ts">
/**
 * 刷机单「工单处理」Tab 第一块：自动刷机结果（只读卡，PRD §5.2 / 页面规格 P4、P0-11、P0′-14）。
 * 卡上无操作按钮；卡头标题右侧紧挨外链「智能硬件平台」，行尾为最近一次回传 / 推送时间（「MDM 平台」在刷机信息区块头，PRD §5.3）。
 * 卡内直接展示全部明细：与「刷机信息」同规格的三列 label/value 网格（当前结果 / 失败原因 / 转人工原因 / 推送次数 / 建单校验结果）＋ 刷机记录表（建单校验一行 ＋ 每次推送一行，时间正序，至少一行）。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ExportOutlined, ThunderboltOutlined } from '@ant-design/icons-vue';
import { useFlashConfigStore } from '@/stores/flashConfig';
import {
  FLASH_EXTERNAL_LINKS, FLASH_VERIFY_ITEM_LABELS,
  flashElapsedText, flashExternalUrl, flashRunInitiator, flashRunResultText,
  type FlashFailL2, type TicketFlash,
} from '@/views/tickets/types/flash';

const props = defineProps<{
  /** 刷机字段组（工单库那一行的快照） */
  flash: TicketFlash;
  /** 建单校验时刻（年-月-日 时:分:秒，取处理履历「建单」条目） */
  verifiedAt?: string;
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

/** 建单校验一行：校验时刻、结果（通过 / 不通过 / 未校验）与不通过项 */
const verifyRow = computed(() => {
  const v = state.value.verifyResult;
  if (v.status === '未校验') {
    return { id: 'verify', at: props.verifiedAt || '—', initiator: '系统', result: '建单校验 · 未校验', resultTone: 'muted', fail: '—' };
  }
  const failed: FlashFailL2[] = [];
  if (v.snAccountMatch === '不通过') failed.push('SN与学生账号不一致');
  if (v.graduate === '不通过') failed.push('非毕业生身份');
  return {
    id: 'verify',
    at: props.verifiedAt || '—',
    initiator: '系统',
    result: failed.length ? '建单校验 · 不通过' : '建单校验 · 通过',
    resultTone: failed.length ? 'bad' : 'ok',
    // 结果列已写「不通过」，失败原因列只列不通过项
    fail: failed.length ? failed.join('、') : '—',
  };
});

/** 刷机记录：建单校验一行 ＋ 每次推送一行，时间正序，不分页；块在即至少一行 */
const recordRows = computed(() => [
  verifyRow.value,
  ...props.flash.runs.map((r) => ({
    id: r.id,
    at: r.pushedAt,
    initiator: flashRunInitiator(r),
    result: flashRunResultText(r.result),
    resultTone: r.result === '等待回传' ? 'auto' : r.result === '接收成功' ? 'ok' : 'bad',
    fail: config.failReasonText(r.failL1, r.failL2) || '—',
  })),
]);

/** 标题行行尾时间：最近一次推送的回传 / 判定时刻，未回传取推送时刻；从未推送不出 */
const headTime = computed(() => (latestRun.value ? latestRun.value.resultAt ?? latestRun.value.pushedAt : ''));

const hardwareUrl = flashExternalUrl('hardwarePlatform');

/** 失败原因超过此字数时占两列（三列网格单列约容 12 个汉字） */
const FAIL_TEXT_ONE_COL = 12;
</script>

<template>
  <section class="fr-card">
    <header class="fr-head">
      <span class="fr-title"><ThunderboltOutlined class="fr-icon" />自动刷机结果</span>
      <a v-if="hardwareUrl" class="fr-link" :href="hardwareUrl" target="_blank" rel="noopener noreferrer">
        {{ FLASH_EXTERNAL_LINKS.hardwarePlatform.label }}<ExportOutlined />
      </a>
      <span v-if="headTime" class="fr-when">{{ headTime }}</span>
    </header>

    <div class="fr-body">
      <dl class="fr-kv">
        <div v-if="pushed" class="fr-item" :class="{ 'span-2': waiting }">
          <dt>当前结果</dt>
          <dd>
            <span class="fr-val" :class="`tone-${outcomeTone}`">{{ flashRunResultText(state.outcome) }}</span>
            <span v-if="waiting" class="fr-elapsed"> · 已推送 {{ elapsedText }}</span>
          </dd>
        </div>

        <div v-if="pushed" class="fr-item">
          <dt>推送次数</dt>
          <dd><span class="fr-val">{{ state.pushCount }} 次</span></dd>
        </div>

        <div v-if="failText" class="fr-item" :class="{ 'span-2': failText.length > FAIL_TEXT_ONE_COL }">
          <dt>失败原因</dt>
          <dd><span class="fr-val">{{ failText }}</span></dd>
        </div>

        <div v-if="state.handoffReason" class="fr-item">
          <dt>转人工原因</dt>
          <dd><span class="fr-val">{{ state.handoffReason }}</span></dd>
        </div>

        <div class="fr-item span-3">
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
      </dl>

      <div class="fr-table-wrap">
        <div class="fr-table-title">刷机记录</div>
        <table class="fr-table">
          <colgroup>
            <col class="col-at" />
            <col class="col-initiator" />
            <col class="col-result" />
            <col />
          </colgroup>
          <thead>
            <tr><th>时间</th><th>发起方</th><th>结果</th><th>失败原因</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in recordRows" :key="r.id">
              <td class="num">{{ r.at }}</td>
              <td>{{ r.initiator }}</td>
              <td><span :class="`tone-${r.resultTone}`">{{ r.result }}</span></td>
              <td class="fail-cell">{{ r.fail }}</td>
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
  display: flex; align-items: center; gap: 8px;
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
/* 行尾时间（11px、#9ca3af、右对齐） */
.fr-when { font-size: 11px; color: #9ca3af; margin-left: auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
/* 与 OpFlashInfoBlock（.fi-body / .fi-grid / .fi-item）同规格，保证 process-top 两块视觉一致 */
.fr-body {
  display: flex; flex-direction: column; gap: 8px;
  padding: 8px 12px 10px; background: #f8fafc;
  border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;
}
.fr-kv {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 16px; margin: 0;
}
.fr-item { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-size: 12px; line-height: 20px; }
.fr-item.span-2 { grid-column: span 2; }
.fr-item.span-3 { grid-column: 1 / -1; }
.fr-item dt { flex: none; width: 72px; color: #6b7280; }
.fr-item dd { flex: 1; min-width: 0; margin: 0; color: #111827; }
.fr-val { font-weight: 500; word-break: break-word; }
.fr-verify b { font-weight: 600; }
.fr-sep { color: #9ca3af; margin: 0 4px; }
.fr-muted { color: #6b7280; }
.fr-elapsed { color: #6b7280; font-variant-numeric: tabular-nums; }
.tone-ok { color: #059669; font-weight: 600; }
.tone-bad { color: #dc2626; font-weight: 600; }
.tone-auto { color: #7c3aed; font-weight: 600; }
.tone-muted { color: #6b7280; font-weight: 500; }
.fr-table-wrap { overflow-x: auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; }
.fr-table-title { padding: 6px 10px 0; font-size: 12px; line-height: 20px; font-weight: 600; color: #374151; }
.fr-table { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 20px; table-layout: fixed; }
.fr-table .col-at { width: 160px; }
.fr-table .col-initiator { width: 140px; }
.fr-table .col-result { width: 150px; }
.fr-table th {
  padding: 6px 10px; text-align: left; font-weight: 600; color: #6b7280;
  background: #f9fafb; border-bottom: 1px solid #e5e7eb; white-space: nowrap;
}
.fr-table td { padding: 6px 10px; color: #374151; border-bottom: 1px solid #f3f4f6; white-space: nowrap; }
.fr-table tr:last-child td { border-bottom: none; }
.fr-table td.num { font-variant-numeric: tabular-nums; }
.fr-table td.fail-cell { white-space: normal; word-break: break-word; }
</style>
