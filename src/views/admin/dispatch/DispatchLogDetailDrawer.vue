<script setup lang="ts">
// 派单日志详情（PRD 8.6）：判定结论 → 工单信息 → 判定过程三步（谁可以接单 / 优先派回原处理人 / 综合打分）；人工记录只列动作、操作人、原处理人、目标与原因
import { computed } from 'vue';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons-vue';
import { useDispatchStore } from '@/stores/dispatch';
import { GATE_ORDER, PRIORITY_LEVEL, SCORE_WEIGHTS, type DispatchLogEntry } from '@/views/tickets/types/dispatch';
import { EXCLUSION_LABEL, GATE_LABEL, LOG_RESULT_TONE, SCORE_DIMENSION_ROWS, logHandlerName, logResult, logSummary } from './dispatchLabels';

const props = defineProps<{ open: boolean; log: DispatchLogEntry | null }>();
const emit = defineEmits<{ 'update:open': [v: boolean] }>();
const store = useDispatchStore();

const result = computed(() => (props.log ? logResult(props.log) : '留池'));
const isManual = computed(() => props.log?.kind === '人工');

function personText(name?: string) {
  if (!name) return '—';
  const staffNo = store.agentOf(name)?.staffNo;
  return staffNo ? `${name}（${staffNo}）` : name;
}
const handlerText = computed(() => {
  const l = props.log;
  if (!l) return '—';
  const base = personText(logHandlerName(l));
  return l.chosen?.groupLabel ? `${base} · ${l.chosen.groupLabel}` : base;
});

const ticketItems = computed(() => {
  const s = props.log?.snapshot;
  if (!s) return [];
  return [
    ['业务类型', s.businessType], ['工单类型', s.ticketType], ['产品分类', s.productCategory], ['产品名称', s.product],
    ['问题分类', s.problem], ['工单来源', s.ticketSource], ['客户类型', s.customerType], ['优先级', PRIORITY_LEVEL[s.priority]],
    ['首次响应 SLA 剩余', s.firstRespRemainMin == null ? '无首次响应 SLA' : `${s.firstRespRemainMin} 分钟`],
  ].map(([k, v]) => ({ k: k as string, v: (v as string | undefined) || '—' }));
});

/* ---------------- 人工记录 ---------------- */
/** 原处理人：本单此前最后一条落到坐席名下的记录 */
const prevHandler = computed(() => {
  const l = props.log;
  if (!l) return undefined;
  const prev = store.logs
    .filter((x) => x.ticketNo === l.ticketNo && x.seq < l.seq && logHandlerName(x))
    .sort((a, b) => b.seq - a.seq)[0];
  return prev ? logHandlerName(prev) : undefined;
});
const manualItems = computed(() => {
  const m = props.log?.manual;
  if (!m) return [];
  return [
    { k: '动作', v: m.action },
    { k: '操作人', v: personText(m.operator) },
    { k: '原处理人', v: personText(prevHandler.value) },
    { k: '目标', v: m.action === '调剂到池' ? m.target || '—' : personText(m.target) },
    { k: '原因', v: m.reason || '—' },
  ];
});

/* ---------------- 判定过程 ---------------- */
const stepGate = computed(() => {
  const l = props.log;
  if (!l || l.candidateCount == null) return null;
  return { count: l.candidateCount };
});
/** 第一个没人满足的条件之前为勾、该条件为叉、其后为「—」；派回原处理人不列条件 */
const gateRows = computed(() => {
  const l = props.log;
  if (!stepGate.value || l?.path === '原处理人') return [];
  const failedIdx = l?.gateFailedAt ? GATE_ORDER.indexOf(l.gateFailedAt) : GATE_ORDER.length;
  return GATE_ORDER.map((g, i) => ({
    gate: GATE_LABEL[g],
    state: i < failedIdx ? 'pass' : i === failedIdx ? 'fail' : 'skip',
  }));
});

/** 人工派单、系统异常、按规则直派都不走原处理人一步 */
const stepOriginalEntered = computed(() => {
  const l = props.log;
  return !!l && l.effectiveMode !== '人工派单' && l.failReason !== '系统异常' && l.path !== '直派规则';
});
const originalVerdict = computed(() => {
  const l = props.log;
  if (l?.path === '原处理人') return '派回原处理人';
  if (l?.path === '预留') return '为原处理人保留';
  return '未派回原处理人';
});
const originalRows = computed(() => {
  const l = props.log;
  if (!l) return [];
  const out: { k: string; v: string }[] = [];
  if (l.originalRelation && (l.path === '原处理人' || l.path === '预留')) out.push({ k: '关系', v: l.originalRelation });
  if (l.path === '原处理人' && l.chosen) out.push({ k: '原处理人', v: `${l.chosen.name}（${l.chosen.staffNo}）` });
  if (l.reserved) {
    out.push({ k: '原处理人', v: `${l.reserved.name}（${l.reserved.staffNo}）` });
    out.push({ k: '到期时间', v: l.reserved.until });
  }
  for (const x of l.originalExcluded ?? []) {
    out.push({ k: `不派回 · ${x.name}（${x.relation}）`, v: EXCLUSION_LABEL[x.reason] });
  }
  return out;
});

const scoreColumns = SCORE_DIMENSION_ROWS.map((x) => ({ key: x.key, label: x.dimension, weight: SCORE_WEIGHTS[x.key] }));
const scoreRows = computed(() => {
  const l = props.log;
  if (l?.path !== '加权评分') return [];
  return (l.top3 ?? []).map((t, i) => ({
    rank: i + 1,
    name: t.name,
    staffNo: t.staffNo,
    chosen: t.name === l.chosen?.name,
    total: t.total.toFixed(1),
    values: Object.fromEntries(scoreColumns.map((c) => [c.key, t.values[c.key].toFixed(2)])),
  }));
});
</script>

<template>
  <a-drawer :open="open" title="派单详情" :width="720" placement="right" @update:open="emit('update:open', $event)">
    <div v-if="log" class="dd">
      <section class="dd-sec">
        <div class="b-title">判定结论</div>
        <div class="dd-verdict">
          <a-tag :color="LOG_RESULT_TONE[result]" class="dd-tag">{{ result }}</a-tag>
          <span class="dd-verdict-text">{{ logSummary(log) }}</span>
          <a-tag v-if="log.overCap" :color="log.overCap === '超额指派' ? 'red' : 'orange'" class="dd-tag">{{ log.overCap }}</a-tag>
        </div>
        <a-descriptions bordered size="small" :column="2" class="dd-desc">
          <a-descriptions-item label="工单号">{{ log.ticketNo }}</a-descriptions-item>
          <a-descriptions-item label="处理人">{{ handlerText }}</a-descriptions-item>
          <a-descriptions-item label="判定时间">{{ log.at }}</a-descriptions-item>
          <a-descriptions-item label="判定次序">第 {{ log.seq }} 次判定</a-descriptions-item>
          <a-descriptions-item v-if="!isManual" label="触发" :span="2">{{ log.trigger ?? '—' }}</a-descriptions-item>
          <a-descriptions-item label="归属池">{{ log.poolLabel }}</a-descriptions-item>
          <a-descriptions-item label="入池规则">{{ log.ruleName }}</a-descriptions-item>
          <a-descriptions-item label="全局派单方式">{{ log.globalMode }}</a-descriptions-item>
          <a-descriptions-item label="归属池派单方式">{{ log.groupMode }}</a-descriptions-item>
        </a-descriptions>
      </section>

      <section class="dd-sec">
        <div class="b-title">工单信息</div>
        <a-descriptions bordered size="small" :column="2" class="dd-desc">
          <a-descriptions-item v-for="x in ticketItems" :key="x.k" :label="x.k">{{ x.v }}</a-descriptions-item>
        </a-descriptions>
      </section>

      <section v-if="isManual" class="dd-sec">
        <div class="b-title">人工记录</div>
        <a-descriptions bordered size="small" :column="2" class="dd-desc">
          <a-descriptions-item v-for="x in manualItems" :key="x.k" :label="x.k" :span="x.k === '原因' ? 2 : 1">{{ x.v }}</a-descriptions-item>
        </a-descriptions>
      </section>

      <section v-else class="dd-sec">
        <div class="b-title">判定过程</div>
        <div class="dd-steps">
          <div class="dd-step">
            <div class="dd-step-hd">
              <span class="dd-seq">1</span>
              <span class="dd-step-name">谁可以接单</span>
              <span v-if="stepGate" class="dd-step-res">可接单 <b>{{ stepGate.count }}</b> 人</span>
              <span v-else class="dd-step-off">未进入</span>
            </div>
            <div v-if="stepGate && gateRows.length" class="dd-step-bd">
              <div class="dd-gates">
                <div v-for="g in gateRows" :key="g.gate" class="dd-kv">
                  <span>{{ g.gate }}</span>
                  <CheckOutlined v-if="g.state === 'pass'" class="dd-gate-pass" />
                  <CloseOutlined v-else-if="g.state === 'fail'" class="dd-gate-fail" />
                  <b v-else class="dd-gate-skip">—</b>
                </div>
              </div>
            </div>
          </div>

          <div class="dd-step">
            <div class="dd-step-hd">
              <span class="dd-seq">2</span>
              <span class="dd-step-name">优先派回原处理人</span>
              <span v-if="stepOriginalEntered" class="dd-step-res">{{ originalVerdict }}</span>
              <span v-else class="dd-step-off">未进入</span>
            </div>
            <div v-if="stepOriginalEntered && originalRows.length" class="dd-step-bd">
              <div v-for="x in originalRows" :key="x.k" class="dd-kv"><span>{{ x.k }}</span><b>{{ x.v }}</b></div>
            </div>
          </div>

          <div class="dd-step">
            <div class="dd-step-hd">
              <span class="dd-seq">3</span>
              <span class="dd-step-name">综合打分</span>
              <span v-if="scoreRows.length" class="dd-step-res">得分前三</span>
              <span v-else class="dd-step-off">未进入</span>
            </div>
            <div v-if="scoreRows.length" class="dd-step-bd">
              <table class="dd-score">
                <thead>
                  <tr>
                    <th class="dd-rank">名次</th>
                    <th>坐席</th>
                    <th v-for="c in scoreColumns" :key="c.key" class="dd-num">{{ c.label }}<span class="dd-weight">权重 {{ c.weight }}</span></th>
                    <th class="dd-num">综合得分</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in scoreRows" :key="r.name" :class="{ 'is-chosen': r.chosen }">
                    <td class="dd-rank">{{ r.rank }}</td>
                    <td>
                      <span class="dd-name">{{ r.name }}</span><span class="dd-staff">{{ r.staffNo }}</span>
                      <a-tag v-if="r.chosen" color="blue" class="dd-chosen">中选</a-tag>
                    </td>
                    <td v-for="c in scoreColumns" :key="c.key" class="dd-num">{{ r.values[c.key] }}</td>
                    <td class="dd-num dd-total">{{ r.total }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  </a-drawer>
</template>

<style scoped>
.dd { display: flex; flex-direction: column; gap: 24px; }
.dd-sec .b-title { margin-bottom: 12px; }

.dd-verdict {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px;
  padding: 12px 14px; margin-bottom: 12px; background: #f9fafb; border: 1px solid #eef0f3; border-radius: 8px;
}
.dd-verdict-text { font-size: 14px; font-weight: 600; color: #111827; min-width: 0; overflow-wrap: anywhere; }
.dd-tag { margin-inline-end: 0; }

.dd-desc :deep(.ant-descriptions-view table) { table-layout: fixed; }
.dd-desc :deep(th.ant-descriptions-item-label),
.dd-desc :deep(td.ant-descriptions-item-content) { padding: 8px 12px; font-size: 13px; }
.dd-desc :deep(.ant-descriptions-item-label) { background: #f9fafb; color: #6b7280; white-space: nowrap; width: 140px; }
.dd-desc :deep(.ant-descriptions-item-content) { color: #374151; overflow-wrap: anywhere; }

.dd-steps { display: flex; flex-direction: column; gap: 8px; }
.dd-step { border: 1px solid #eef0f3; border-radius: 8px; padding: 12px 14px; background: #fff; }
.dd-step-hd { display: flex; align-items: center; gap: 10px; min-height: 22px; }
.dd-seq {
  width: 22px; height: 22px; border-radius: 50%; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  background: #eff6ff; color: #1a6fff; font-size: 12px; font-weight: 600;
}
.dd-step-name { font-size: 13px; font-weight: 600; color: #111827; }
.dd-step-res { margin-left: auto; font-size: 13px; color: #374151; }
.dd-step-res b { font-weight: 600; color: #111827; font-variant-numeric: tabular-nums; }
.dd-step-off { margin-left: auto; font-size: 13px; color: #9ca3af; }
.dd-step-bd { margin: 10px 0 0 32px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }

.dd-gates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 24px; }
.dd-kv { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 13px; line-height: 20px; }
.dd-kv span { color: #6b7280; min-width: 0; }
.dd-kv b { color: #374151; font-weight: 500; text-align: right; font-variant-numeric: tabular-nums; }
.dd-kv .dd-gate-pass { color: #16a34a; flex: none; }
.dd-kv .dd-gate-fail { color: #dc2626; flex: none; }
.dd-kv .dd-gate-skip { color: #9ca3af; font-weight: 400; flex: none; }

.dd-score { width: 100%; border-collapse: collapse; font-size: 13px; }
.dd-score th { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; text-align: left; padding: 6px 10px; line-height: 16px; vertical-align: top; }
.dd-score td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; color: #374151; }
.dd-score tr.is-chosen td { background: #eff6ff; }
.dd-score .dd-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dd-rank { width: 44px; white-space: nowrap; }
.dd-weight { display: block; font-weight: 400; color: #9ca3af; }
.dd-name { color: #111827; font-weight: 500; }
.dd-staff { margin-left: 6px; font-size: 12px; color: #9ca3af; }
.dd-chosen { margin: 0 0 0 6px; }
.dd-total { font-weight: 600; color: #111827 !important; }
</style>
