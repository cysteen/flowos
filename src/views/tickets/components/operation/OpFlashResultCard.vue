<script setup lang="ts">
/**
 * 刷机单「工单处理」Tab 第一块：自动刷机结果（只读卡，PRD §5.2 / 页面规格 P4、P0-11、P0′-14）。
 * 卡上无操作按钮；卡头为标题 ＋ 行尾最近一次回传 / 推送时间。外链「智能硬件平台」只在配了地址时出在标题右侧，
 * 地址未给（`FLASH_EXTERNAL_LINKS.hardwarePlatform.url` 为空，见 PRD 附录 D 第 11 条）时不渲染；
 * 「MDM 平台」「保障中心」在「刷机信息」区块头（OpFlashInfoBlock，PRD §5.3）。
 * 卡内直接展示全部明细：与「刷机信息」同规格的三列 label/value 网格（当前结果 / 推送次数 / 失败原因 / 转人工原因）＋ 刷机记录表（每次推送一行，时间正序）。
 * 从未推送（特殊情况、非自研机型）的单只出转人工原因，不出刷机记录表（PRD §5.2）。
 */
import { computed } from 'vue';
import { ExportOutlined, ThunderboltOutlined } from '@ant-design/icons-vue';
import {
  FLASH_EXTERNAL_LINKS,
  flashExternalUrl, flashFailReasonText, flashRunInitiator, flashRunResultText,
  type TicketFlash,
} from '@/views/tickets/types/flash';

const props = defineProps<{
  /** 刷机字段组（工单库那一行的快照） */
  flash: TicketFlash;
}>();

const state = computed(() => props.flash.state);
const pushed = computed(() => state.value.pushCount >= 1);
const latestRun = computed(() => props.flash.runs[props.flash.runs.length - 1]);
const waiting = computed(() => pushed.value && state.value.outcome === '等待回传');

/* ---- 「自动刷机中 · 推送时间 〈年-月-日 时:分:秒〉」：取最近一次推送时刻，不走秒（PRD §5.2，1021） ---- */
const pushedAtText = computed(() => latestRun.value?.pushedAt ?? '');

const outcomeTone = computed(() => {
  const o = state.value.outcome;
  if (o === '等待回传') return 'auto';
  if (o === '接收成功') return 'ok';
  return 'bad';
});

const failText = computed(() => flashFailReasonText(state.value.failL1, state.value.failL2));

/** 刷机记录：每次推送一行，时间正序，不分页；推送次数为 0 时整表不出 */
const recordRows = computed(() => [
  ...props.flash.runs.map((r) => ({
    id: r.id,
    at: r.pushedAt,
    initiator: flashRunInitiator(r),
    result: flashRunResultText(r.result),
    resultTone: r.result === '等待回传' ? 'auto' : r.result === '接收成功' ? 'ok' : 'bad',
    fail: flashFailReasonText(r.failL1, r.failL2) || '—',
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
            <span v-if="waiting && pushedAtText" class="fr-elapsed"> · 推送时间 {{ pushedAtText }}</span>
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
      </dl>

      <div v-if="pushed" class="fr-table-wrap">
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
.fr-item dt { flex: none; width: 72px; color: #6b7280; }
.fr-item dd { flex: 1; min-width: 0; margin: 0; color: #111827; }
.fr-val { font-weight: 500; word-break: break-word; }
.fr-elapsed { color: #6b7280; font-variant-numeric: tabular-nums; }
.tone-ok { color: #059669; font-weight: 600; }
.tone-bad { color: #dc2626; font-weight: 600; }
.tone-auto { color: #7c3aed; font-weight: 600; }
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
