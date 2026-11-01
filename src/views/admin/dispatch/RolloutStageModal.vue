<script setup lang="ts">
// 上线阶段推进 / 退回确认（PRD 第 17 章）：列出进入条件的当前值，未满足项标红，仍可确认；指标阈值可在确认时调整
import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { RiseOutlined, RollbackOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import { useDispatchStore } from '@/stores/dispatch';
import { ROLLOUT_STAGES, isProfileConfigured, type DispatchLogEntry, type RolloutStage } from '@/views/tickets/types/dispatch';
import { computeStats, minText, parseAt } from './dispatchMetrics';

const props = defineProps<{ open: boolean; direction: 'forward' | 'back' }>();
const emit = defineEmits<{ 'update:open': [v: boolean] }>();
const store = useDispatchStore();

const from = computed<RolloutStage>(() => store.rolloutStage());
const to = computed<RolloutStage | null>(() => {
  const i = ROLLOUT_STAGES.indexOf(from.value) + (props.direction === 'forward' ? 1 : -1);
  return ROLLOUT_STAGES[i] ?? null;
});
const isForward = computed(() => props.direction === 'forward');

/* ---------------- 组选择 ---------------- */

const onGroups = computed(() => store.groups.filter((g) => g.switchOn));
const offGroups = computed(() => store.groups.filter((g) => !g.switchOn));
/** 单选：试点组（推进至单组试点 / 退回至单组试点时保留的组） */
const single = ref<string | undefined>(undefined);
/** 多选：推进至多组时开启的组 / 退回至多组时关闭的组 */
const multi = ref<string[]>([]);

const pickKind = computed<'single' | 'multi' | null>(() => {
  if (to.value === '单组试点') return 'single';
  if (to.value === '多组') return 'multi';
  return null;
});
const singleOpts = computed(() => (isForward.value ? store.groups : onGroups.value).map((g) => ({ value: g.id, label: store.poolLabel(g.id) })));
const multiOpts = computed(() => (isForward.value ? offGroups.value : onGroups.value).map((g) => ({ value: g.id, label: store.poolLabel(g.id) })));
const pickLabel = computed(() => {
  if (pickKind.value === 'single') return isForward.value ? '试点组' : '保留试点组';
  return isForward.value ? '开启的组' : '关闭的组';
});

/* ---------------- 进入条件（推进时） ---------------- */

/** 阈值默认值（第 17 章），可在确认时调整 */
const th = reactive({ trialDays: 10, profileRate: 100, matchRate: 90, pilotDays: 10, successRate: 80, fallbackRate: 10, fullDays: 5 });

watch(() => props.open, (v) => {
  if (!v) return;
  single.value = undefined;
  multi.value = [];
  Object.assign(th, { trialDays: 10, profileRate: 100, matchRate: 90, pilotDays: 10, successRate: 80, fallbackRate: 10, fullDays: 5 });
});

/** 自 `from` 起已满的工作日数（周一至周五，不含当日） */
function workDaysSince(fromMs: number | null, now: number): number {
  if (fromMs == null) return 0;
  const d = new Date(fromMs);
  d.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  let n = 0;
  while (d.getTime() < end.getTime()) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 10) / 10}%`);

interface CondRow {
  key: string;
  label: string;
  value: string;
  /** 阈值：可调整的数值键与单位前后缀；无阈值项为空 */
  th?: { key: keyof typeof th; prefix: string; unit: string; min: number; max: number };
  thText?: string;
  ok: boolean;
}

function statsOf(logs: DispatchLogEntry[], poolIds: string[], now: number) {
  return computeStats(logs, store.agents, '30d', poolIds, now, (name) => store.onDutyHoursOf(name, now));
}

const conditions = computed<CondRow[]>(() => {
  if (!isForward.value || !to.value) return [];
  void store.logs;
  const now = Date.now();
  if (to.value === '单组试点') {
    const days = workDaysSince(store.rolloutStageSince('试运行'), now);
    const gid = single.value;
    const members = gid ? store.membersOf(gid) : [];
    const configured = members.filter((a) => isProfileConfigured(a.profile)).length;
    const profileRate = members.length ? (configured / members.length) * 100 : null;
    const trialLogs = gid ? store.logs.filter((l) => l.poolId === gid && l.trial && l.trial.actual) : [];
    const matchRate = trialLogs.length ? (trialLogs.filter((l) => l.trial!.same).length / trialLogs.length) * 100 : null;
    const engineErr = gid ? store.logs.filter((l) => l.poolId === gid && l.failReason === '引擎异常').length : 0;
    return [
      { key: 'trialDays', label: '试运行运行时长', value: `${days} 个工作日`, th: { key: 'trialDays', prefix: '满', unit: '个工作日', min: 1, max: 60 }, ok: days >= th.trialDays },
      { key: 'profileRate', label: '试点组成员画像配置率', value: gid ? `${pct(profileRate)}（${configured} / ${members.length}）` : '—', th: { key: 'profileRate', prefix: '≥', unit: '%', min: 1, max: 100 }, ok: profileRate != null && profileRate >= th.profileRate },
      { key: 'matchRate', label: '试点组建议与实际处理人画像匹配率', value: gid ? `${pct(matchRate)}（${trialLogs.length} 单）` : '—', th: { key: 'matchRate', prefix: '≥', unit: '%', min: 1, max: 100 }, ok: matchRate != null && matchRate >= th.matchRate },
      { key: 'engineErr', label: '派单日志「引擎异常」', value: gid ? `${engineErr} 条` : '—', thText: '无', ok: !!gid && engineErr === 0 },
    ];
  }
  const since = store.rolloutStageSince(from.value);
  const days = workDaysSince(since, now);
  const pools = onGroups.value.map((g) => g.id);
  const afterLogs = since == null ? store.logs : store.logs.filter((l) => parseAt(l.at) >= since);
  const beforeLogs = since == null ? [] : store.logs.filter((l) => parseAt(l.at) < since);
  const s = statsOf(afterLogs, pools, now);
  const b = statsOf(beforeLogs, pools, now);
  const respOk = s.respMedian != null && (b.respMedian == null || s.respMedian <= b.respMedian);
  const respRow: CondRow = {
    key: 'resp', label: '派单后首响中位数',
    value: `${minText(s.respMedian)}（${to.value === '多组' ? '试点前' : '本阶段前'} ${minText(b.respMedian)}）`,
    thText: `不劣于${to.value === '多组' ? '试点前' : '本阶段前'}`, ok: respOk,
  };
  if (to.value === '多组') {
    return [
      { key: 'pilotDays', label: '试点组运行时长', value: `${days} 个工作日`, th: { key: 'pilotDays', prefix: '满', unit: '个工作日', min: 1, max: 60 }, ok: days >= th.pilotDays },
      { key: 'successRate', label: '自动派单成功率', value: pct(s.successRate), th: { key: 'successRate', prefix: '≥', unit: '%', min: 1, max: 100 }, ok: s.successRate != null && s.successRate >= th.successRate },
      { key: 'fallbackRate', label: '兜底回池率', value: pct(s.fallbackRate), th: { key: 'fallbackRate', prefix: '≤', unit: '%', min: 0, max: 100 }, ok: s.fallbackRate != null && s.fallbackRate <= th.fallbackRate },
      respRow,
    ];
  }
  // 推进至全量：已开启各组连续 N 个工作日满足多组进入条件中的指标
  const per = pools.map((id) => ({ id, s: statsOf(afterLogs, [id], now) }));
  const succVals = per.map((x) => x.s.successRate).filter((v): v is number => v != null);
  const fbVals = per.map((x) => x.s.fallbackRate).filter((v): v is number => v != null);
  const minSucc = succVals.length === per.length && per.length ? Math.min(...succVals) : null;
  const maxFb = fbVals.length === per.length && per.length ? Math.max(...fbVals) : null;
  return [
    { key: 'fullDays', label: '已开启各组连续运行时长', value: `${days} 个工作日`, th: { key: 'fullDays', prefix: '满', unit: '个工作日', min: 1, max: 60 }, ok: days >= th.fullDays },
    { key: 'successRate', label: '各组自动派单成功率（最低）', value: pct(minSucc), th: { key: 'successRate', prefix: '≥', unit: '%', min: 1, max: 100 }, ok: minSucc != null && minSucc >= th.successRate },
    { key: 'fallbackRate', label: '各组兜底回池率（最高）', value: pct(maxFb), th: { key: 'fallbackRate', prefix: '≤', unit: '%', min: 0, max: 100 }, ok: maxFb != null && maxFb <= th.fallbackRate },
    respRow,
  ];
});

/* ---------------- 提交 ---------------- */

const effectText = computed(() => {
  switch (to.value) {
    case '单组试点': return isForward.value ? '运行方式切为正式派单；只开启试点组的班组开关，其余组关闭班组开关、保持降级态' : '只保留试点组开启班组开关，其余组关闭班组开关';
    case '多组': return isForward.value ? '开启所选组的班组开关' : '关闭所选组的班组开关';
    case '全量': return '开启全部组的班组开关';
    case '试运行': return '运行方式切回试运行，引擎只出派单建议、不实际派单';
    default: return '';
  }
});

function submit() {
  if (!to.value) return;
  let ids: string[] = [];
  if (pickKind.value === 'single') {
    if (!single.value) { message.error(isForward.value ? '请选择试点组' : '请选择保留的试点组'); return; }
    ids = [single.value];
  } else if (pickKind.value === 'multi') {
    if (!multi.value.length) { message.error(isForward.value ? '请选择开启的组' : '请选择关闭的组'); return; }
    ids = [...multi.value];
  }
  const r = store.setRolloutStage(to.value, ids);
  if (!r.ok) { if (r.message) message.error(r.message); return; }
  message.success(r.message);
  emit('update:open', false);
}
</script>

<template>
  <OpActionModal
    :open="open"
    :title="isForward ? '推进上线阶段' : '退回上线阶段'"
    :icon="isForward ? RiseOutlined : RollbackOutlined"
    :tone="isForward ? 'primary' : 'warn'"
    :ok-text="isForward ? '确认推进' : '确认退回'"
    cancel-text="取消"
    :width="640"
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="op-form">
      <div class="op-field op-field-h">
        <span class="op-label">当前阶段</span>
        <span class="rs-val">{{ from }}</span>
      </div>
      <div class="op-field op-field-h">
        <span class="op-label">{{ isForward ? '推进至' : '退回至' }}</span>
        <span class="rs-val strong">{{ to }}</span>
      </div>
      <div v-if="pickKind" class="op-field op-field-h">
        <span class="op-label req">{{ pickLabel }}</span>
        <div class="rs-grow">
          <a-select v-if="pickKind === 'single'" v-model:value="single" :options="singleOpts" placeholder="请选择" style="width: 100%" />
          <a-select v-else v-model:value="multi" mode="multiple" :options="multiOpts" placeholder="请选择" style="width: 100%" />
        </div>
      </div>
      <div class="op-field op-field-h">
        <span class="op-label">影响</span>
        <span class="rs-val muted">{{ effectText }}；已派出、已领取的工单不收回</span>
      </div>

      <div v-if="isForward && conditions.length" class="rs-cond">
        <div class="rs-cond-hd">进入条件</div>
        <table class="rs-table">
          <thead><tr><th>条件</th><th>当前值</th><th>阈值</th><th>结论</th></tr></thead>
          <tbody>
            <tr v-for="c in conditions" :key="c.key" :class="{ bad: !c.ok }">
              <td>{{ c.label }}</td>
              <td class="rs-cur">{{ c.value }}</td>
              <td>
                <span v-if="c.th" class="rs-th">
                  <span>{{ c.th.prefix }}</span>
                  <a-input-number v-model:value="th[c.th.key]" :min="c.th.min" :max="c.th.max" :precision="0" size="small" style="width: 72px" />
                  <span>{{ c.th.unit }}</span>
                </span>
                <span v-else>{{ c.thText }}</span>
              </td>
              <td><span class="rs-flag" :class="c.ok ? 'ok' : 'no'">{{ c.ok ? '已满足' : '未满足' }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.rs-val { font-size: 13px; color: #111827; }
.rs-val.strong { font-weight: 600; }
.rs-val.muted { color: #6b7280; }
.rs-grow { flex: 1; min-width: 0; }
.rs-cond { margin-top: 4px; }
.rs-cond-hd { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 8px; }
.rs-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rs-table th { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; padding: 8px 10px; text-align: left; white-space: nowrap; }
.rs-table td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; color: #374151; vertical-align: middle; }
.rs-table tr.bad .rs-cur { color: #dc2626; font-weight: 600; }
.rs-th { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.rs-flag { font-size: 12px; white-space: nowrap; }
.rs-flag.ok { color: #059669; }
.rs-flag.no { color: #dc2626; }
</style>
