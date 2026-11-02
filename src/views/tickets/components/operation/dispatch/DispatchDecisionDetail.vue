<script setup lang="ts">
/**
 * 处理履历「系统派单」节点的派单明细（【1215】PRD 13.1）：派单路径、派单原因、综合得分；因子明细可折叠。
 * 取值来自派单日志（同一工单、同一中选坐席、判定时刻相同的那条判定）；找不到日志时不渲染。
 */
import { computed, ref } from 'vue';
import { DownOutlined, RightOutlined } from '@ant-design/icons-vue';
import { useDispatchStore } from '@/stores/dispatch';
import { RELAX_LEVEL_LABEL, type DispatchLogEntry } from '@/views/tickets/types/dispatch';
import { FACTOR_LABEL, pathLabel, replacePathNames } from '@/views/admin/dispatch/dispatchLabels';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';

const props = defineProps<{ entry: TimelineEntry }>();
const store = useDispatchStore();

function ms(s?: string): number {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s) : null;
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)).getTime() : NaN;
}

/** 履历正文「系统派单 → 〈姓名〉（〈路径〉）」里的中选坐席 */
const chosenName = computed(() => /系统派单\s*→\s*([^（(；\s]+)/.exec(props.entry.what ?? '')?.[1]);

const log = computed<DispatchLogEntry | undefined>(() => {
  const name = chosenName.value;
  const at = ms(props.entry.when);
  if (!name || !Number.isFinite(at)) return undefined;
  return [...store.logs].reverse().find((x) => x.kind === '判定' && x.chosen?.name === name
    && Math.abs(ms(x.at) - at) <= 2000);
});

const factors = computed(() => {
  const s = log.value?.chosenScore;
  if (!s) return [];
  return store.config.factors
    .filter((f) => f.enabled)
    .map((f) => ({
      key: f.key,
      label: FACTOR_LABEL[f.key],
      weight: f.weight,
      value: s.factors[f.key].toFixed(2),
    }));
});

/** 派单原因：触发类型 ＋ 归属池（命中的入池规则）＋ 候选人数 ＋ 产品放宽层级 */
const reasonText = computed(() => {
  const l = log.value;
  if (!l) return '';
  const parts = [`${l.trigger ?? '新单'}进入${l.poolLabel}（${l.ruleName}）`];
  if (l.path === '原处理人') parts.push('原处理人可接单，优先派回');
  else if (l.candidateCount != null) parts.push(`可接单 ${l.candidateCount} 人`);
  if (l.relaxLevel) parts.push(`产品放宽至${RELAX_LEVEL_LABEL[l.relaxLevel]}`);
  return parts.join('；');
});

const open = ref(false);

/** 正文：明细里已列出得分时去掉正文里的得分串 */
const whatText = computed(() => {
  const w = replacePathNames(props.entry.what ?? '');
  return log.value?.chosenScore ? w.replace(/；综合得分[\s\S]*$/, '') : w;
});
</script>

<template>
  <div v-if="whatText" class="what">{{ whatText }}</div>
  <div v-if="log" class="dd">
    <div class="dd-row"><span class="dd-k">派单路径</span><span class="dd-v">{{ pathLabel(log.path) }}</span></div>
    <div class="dd-row"><span class="dd-k">派单原因</span><span class="dd-v">{{ reasonText }}</span></div>
    <div v-if="log.chosenScore" class="dd-row">
      <span class="dd-k">综合得分</span>
      <span class="dd-v dd-score">{{ log.chosenScore.total.toFixed(1) }}</span>
      <button type="button" class="dd-toggle" @click="open = !open">
        <component :is="open ? DownOutlined : RightOutlined" />因子明细
      </button>
    </div>
    <div v-if="open && log.chosenScore" class="dd-factors">
      <div v-for="f in factors" :key="f.key" class="dd-factor">
        <span class="dd-f-label">{{ f.label }}</span>
        <span class="dd-f-weight">权重 {{ f.weight }}</span>
        <span class="dd-f-val">{{ f.value }}</span>
      </div>
      <div v-if="log.top3?.length" class="dd-top3">
        得分前三：<span v-for="(t, i) in log.top3" :key="t.name">{{ i ? '、' : '' }}{{ t.name }} {{ t.total.toFixed(1) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.what { font-size: 13px; color: #374151; line-height: 1.6; }
.dd {
  display: flex; flex-direction: column; gap: 4px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px;
  font-size: 12px; line-height: 1.5;
}
.dd-row { display: flex; align-items: baseline; gap: 8px; }
.dd-k { color: #6b7280; flex: none; width: 56px; }
.dd-v { color: #374151; min-width: 0; }
.dd-score { font-weight: 600; color: #111827; font-variant-numeric: tabular-nums; }
.dd-toggle {
  display: inline-flex; align-items: center; gap: 3px;
  margin: 0 0 0 4px; padding: 0; border: none; background: none;
  font-family: inherit; font-size: 12px; color: #1a6fff; cursor: pointer;
}
.dd-toggle :deep(.anticon) { font-size: 10px; }
.dd-factors {
  display: flex; flex-direction: column; gap: 2px;
  margin-left: 64px; padding-top: 2px;
}
.dd-factor { display: flex; gap: 10px; }
.dd-f-label { color: #374151; width: 110px; }
.dd-f-weight { color: #9ca3af; width: 56px; }
.dd-f-val { color: #111827; font-variant-numeric: tabular-nums; }
.dd-top3 { color: #6b7280; margin-top: 2px; }
</style>
