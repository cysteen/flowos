<script setup lang="ts">
/**
 * 刷机单速览带「最新处理」卡的第一块：自动刷机结果（只读，PRD §5.2 / 页面规格 P4、P0-11、P0′-14）。
 * 块内无操作按钮；标题右侧紧挨外链「智能硬件平台」，行尾为最近一次回传 / 推送时间（「MDM 平台」在侧栏「刷机信息」卡，PRD §5.3）。
 * 卡片内直接展示全部明细：逐项分行（当前结果 / 失败原因 / 转人工原因 / 推送次数 / 建单校验结果）＋ 刷机记录表（建单校验一行 ＋ 每次推送一行，时间正序，块在即至少一行）；
 * 卡片收起与 ⤢ 放大展示同样内容，超出卡高时在卡内滚动。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ExportOutlined } from '@ant-design/icons-vue';
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

const hardwareUrl = computed(() => flashExternalUrl('hardwarePlatform', props.flash.info.sn));
</script>

<template>
  <div class="handle-item fr-block">
    <div class="fr-meta">
      <span class="fr-title">自动刷机结果</span>
      <a class="fr-link" :href="hardwareUrl" target="_blank" rel="noopener noreferrer">
        {{ FLASH_EXTERNAL_LINKS.hardwarePlatform.label }}<ExportOutlined />
      </a>
      <span v-if="headTime" class="fr-when">{{ headTime }}</span>
    </div>

    <!-- 逐项分行 + 刷机记录表：卡片内直接展示全部明细（收起与放大一致） -->
      <dl class="fr-kv">
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
      </dl>

      <div class="fr-table-wrap">
        <div class="fr-table-title">刷机记录</div>
        <table class="fr-table">
          <thead>
            <tr><th>时间</th><th>发起方</th><th>结果</th><th>失败原因</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in recordRows" :key="r.id">
              <td class="num">{{ r.at }}</td>
              <td>{{ r.initiator }}</td>
              <td><span :class="`tone-${r.resultTone}`">{{ r.result }}</span></td>
              <td>{{ r.fail }}</td>
            </tr>
          </tbody>
        </table>
      </div>
  </div>
</template>

<style scoped>
/* 块外框（.handle-item 分隔线）由 OpOverviewBand 提供；块头与卡内其余块的「处理人」行同一字号 */
.fr-block { display: flex; flex-direction: column; gap: 4px; }
.fr-meta { display: flex; align-items: center; gap: 8px; }
.fr-title { font-size: 12px; font-weight: 600; color: #111827; }
.fr-link {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; color: #1a6fff; white-space: nowrap;
}
.fr-link:hover { text-decoration: underline; }
/* 行尾时间：与「最新处理」卡条目的 .hi-when 同一规格（11px、#9ca3af、右对齐） */
.fr-when { font-size: 11px; color: #9ca3af; margin-left: auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
.fr-kv { display: flex; flex-direction: column; gap: 4px; margin: 0; }
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
.tone-muted { color: #6b7280; }
.fr-table-wrap { margin-top: 4px; overflow-x: auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; }
.fr-table-title { padding: 6px 10px 0; font-size: 12px; font-weight: 600; color: #374151; }
.fr-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.fr-table th {
  padding: 6px 10px; text-align: left; font-weight: 600; color: #6b7280;
  background: #f9fafb; border-bottom: 1px solid #e5e7eb; white-space: nowrap;
}
.fr-table td { padding: 6px 10px; color: #374151; border-bottom: 1px solid #f3f4f6; white-space: nowrap; }
.fr-table tr:last-child td { border-bottom: none; }
.fr-table td.num { font-variant-numeric: tabular-nums; }
/* 失败原因列可折行：建单校验两项都不通过时不撑出横向滚动 */
.fr-table td:last-child { white-space: normal; }
</style>
