<script setup lang="ts">
/**
 * 刷机单速览带「最新处理」卡的第一块：自动刷机结果（只读，PRD §5.2 / 页面规格 P4、P0-11、P0′-14）。
 * 块内无操作按钮；块头右侧外链「智能硬件平台」（「MDM 平台」在侧栏「刷机信息」卡，PRD §5.3）。
 * 收起时为一段摘要（当前结果 · 失败原因 · 转人工原因 · 推送次数 · 建单校验结果，超长截断）；
 * 卡片 ⤢ 放大后（`expanded`）逐项分行，并出推送记录表。
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
  /** 所在卡片已放大：逐项分行并出推送记录表 */
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
  <div class="handle-item fr-block">
    <div class="fr-meta">
      <span class="fr-title">自动刷机结果</span>
      <a class="fr-link" :href="hardwareUrl" target="_blank" rel="noopener noreferrer">
        {{ FLASH_EXTERNAL_LINKS.hardwarePlatform.label }}<ExportOutlined />
      </a>
    </div>

    <!-- 收起：一段摘要，超长截断 -->
    <div v-if="!expanded" class="fr-brief">
      <template v-if="pushed">
        <span class="fr-seg">
          <span class="fr-k">当前结果</span>
          <b class="fr-outcome" :class="`tone-${outcomeTone}`">{{ flashRunResultText(state.outcome) }}</b>
          <span v-if="waiting" class="fr-elapsed"> · 已推送 {{ elapsedText }}</span>
        </span>
      </template>
      <span v-if="failText" class="fr-seg"><span class="fr-k">失败原因</span>{{ failText }}</span>
      <span v-if="state.handoffReason" class="fr-seg"><span class="fr-k">转人工原因</span>{{ state.handoffReason }}</span>
      <span v-if="pushed" class="fr-seg"><span class="fr-k">推送次数</span>{{ state.pushCount }} 次</span>
      <span class="fr-seg">
        <span class="fr-k">建单校验结果</span>
        <span v-if="!verify" class="fr-muted">未校验</span>
        <template v-else>
          <template v-for="(item, i) in verify" :key="item.label">
            {{ item.label }}：<b :class="item.value === '通过' ? 'tone-ok' : 'tone-bad'">{{ item.value }}</b><span v-if="i < verify.length - 1">；</span>
          </template>
        </template>
      </span>
    </div>

    <!-- 放大：逐项分行 + 推送记录表 -->
    <template v-else>
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

      <div v-if="pushed" class="fr-table-wrap">
        <div class="fr-table-title">推送记录</div>
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
    </template>
  </div>
</template>

<style scoped>
/* 块外框（.handle-item 分隔线）由 OpOverviewBand 提供；块头与卡内其余块的「处理人」行同一字号 */
.fr-block { display: flex; flex-direction: column; gap: 4px; }
.fr-meta { display: flex; align-items: center; gap: 12px; }
.fr-title { font-size: 12px; font-weight: 600; color: #111827; }
.fr-link {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; color: #1a6fff; white-space: nowrap;
}
.fr-link:hover { text-decoration: underline; }
.fr-brief {
  font-size: 12px; line-height: 1.6; color: #374151;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.fr-seg + .fr-seg::before { content: '·'; margin: 0 6px; color: #9ca3af; }
.fr-k { color: #6b7280; margin-right: 4px; }
.fr-kv { display: flex; flex-direction: column; gap: 4px; margin: 0; }
.fr-row { display: flex; align-items: baseline; gap: 12px; font-size: 12px; line-height: 20px; }
.fr-row dt { flex: none; width: 84px; color: #6b7280; }
.fr-row dd { flex: 1; min-width: 0; margin: 0; color: #111827; }
.fr-verify b, .fr-brief b { font-weight: 600; }
.fr-sep { color: #9ca3af; margin: 0 4px; }
.fr-muted { color: #6b7280; }
.fr-outcome { font-weight: 600; }
.fr-elapsed { color: #6b7280; font-variant-numeric: tabular-nums; }
.tone-ok { color: #059669; }
.tone-bad { color: #dc2626; }
.tone-auto { color: #7c3aed; }
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
</style>
