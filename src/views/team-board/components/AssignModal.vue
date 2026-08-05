<script lang="ts">
/**
 * 班组长看板 · 指派弹窗（实现规格 §三）
 *
 * 定位：不新建动作 = `B6 调剂` 的批量壳 + 看板入口变体。
 * 壳复用全站统一的 `OpActionModal`（tone=primary，宽 560），页脚走 a-modal 原生 footer，禁止自绘。
 *
 * 两个入口共用本组件，仅 `preselectedIds` 不同：
 *   ① 概览条「去指派 8」→ 预载全部待指派；② 下钻抽屉行内「指派」→ 预选 1 张。
 *
 * ⚠️ 交叉裁决 X2：非风格规范色一律不用。选中底一律 `#EFF6FF`，hover 底一律 `#F9FAFB`。
 * ⚠️ 交叉裁决 X4：负载三档阈值统一抽为 `LOAD_THRESHOLD`，与负载分布卡 / 组员表同源同口径。
 *
 * 本块（普通 <script>）只放**需要对外导出的值**：`<script setup>` 不允许 ES 值导出，
 * 而 `LOAD_THRESHOLD` / `loadLevelOf` 要供看板其它模块复用，故拆在这里。
 */

/** 工单优先级（系统枚举 P0–P3） */
export type TicketPriority = 'P0' | 'P1' | 'P2' | 'P3';

/** 负载三档 */
export type LoadLevel = '空闲' | '适中' | '满载';

/**
 * X4：负载三档阈值，全局唯一口径 —— **空闲 <15 / 适中 15–30 / 满载 >30**
 * （2026-08-05 业务定，原为 ≤5 / 6–12 / >12）。
 * ⚠️ 后续应做成租户可配；改这里即可全站生效。
 */
export const LOAD_THRESHOLD = { idle: 14, normal: 30 } as const;

export function loadLevelOf(workload: number): LoadLevel {
  if (workload <= LOAD_THRESHOLD.idle) return '空闲';
  if (workload <= LOAD_THRESHOLD.normal) return '适中';
  return '满载';
}

/** 负载徽章配色（R4 语义五色） */
export const LOAD_STYLE: Record<LoadLevel, { color: string; bg: string }> = {
  空闲: { color: '#10B981', bg: '#10B98122' },
  适中: { color: '#F59E0B', bg: '#F59E0B22' },
  满载: { color: '#EF4444', bg: '#EF444422' },
};

/** 指派弹窗工单行（覆盖规格 §3.1 表格 6 列） */
export interface AssignTicket {
  id: string;
  /** 工单号 */
  no: string;
  /** 客户名 */
  customer: string;
  /** 工单类型 */
  type: string;
  priority: TicketPriority;
  /** SLA 剩余分钟数；负数 = 已超时 */
  slaLeftMin: number;
  /** 创建时间（排序用，不占列） */
  createdAt: string;
}

/** 提交结果行（部分失败态由父级回填，见组件 defineExpose） */
export interface AssignResultRow {
  id: string;
  ok: boolean;
  /** 失败原因，如「已被 李坐席 领取」 */
  reason?: string;
}

export type AssignScope = 'in-team' | 'cross-team';

export interface AssignSubmitPayload {
  ticketIds: string[];
  scope: AssignScope;
  /** 同组内 = 处理人 id；跨组 = 目标处理组 key */
  targetId: string;
  targetName: string;
  note: string;
  /** 合并为一条通知（消息风暴开关，默认 on） */
  mergeNotify: boolean;
  /** true = 本次是「重试失败项」 */
  isRetry: boolean;
}
</script>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import {
  ArrowRightOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  DownOutlined,
  UserAddOutlined,
} from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
// MemberRow 来自班组看板 mock（字段 name / online / workload / loadLevel …）。
// 该文件由他人并行扩展，此处只做 type-only 引用，不改动源文件；
// 若上游字段变更导致类型不匹配，改本组件的 CandOption 映射即可。
import type { MemberRow } from '@/mock/teamBoard';

const ONLINE_COLOR: Record<string, string> = {
  在线: '#10B981',
  小休: '#F59E0B',
  离线: '#9CA3AF',
};

const PRIORITY_COLOR: Record<TicketPriority, string> = {
  P0: '#EF4444',
  P1: '#F59E0B',
  P2: '#1A6FFF',
  P3: '#9CA3AF',
};

/** 负载徽章取色。a-select 的 #option 插槽形参为 any，故此处收敛一次类型 */
function loadStyle(level: unknown) {
  return LOAD_STYLE[level as LoadLevel] ?? LOAD_STYLE['适中'];
}

/** 消息风暴阈值：选中 ≥10 张出提示 + 合并开关（规格 §3.1 / 风险 R2） */
const STORM_THRESHOLD = 10;

const NOTE_MAX = 200;

/**
 * 跨组目标处理组候选。规格未指定数据源（跨组走 G5 场景2，候选应由后端下发），
 * 原型阶段用本地常量占位，接口就位后替换。
 */
const CROSS_TEAM_GROUPS = [
  { value: 'g-cs2', label: '受理二组' },
  { value: 'g-cs3', label: '受理三组' },
  { value: 'g-as1', label: '售后一组' },
  { value: 'g-dispatch', label: '值班调度组' },
];

/* ============================== Props / Emits ============================== */

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** 预选工单 id；入口① 传全部待指派 id，入口② 传 1 个 */
    preselectedIds?: string[];
    candidates: MemberRow[];
    tickets: AssignTicket[];
    /** 是否有跨组权限；false 时「跨组」单选置灰 */
    canCrossTeam?: boolean;
  }>(),
  {
    preselectedIds: () => [],
    canCrossTeam: false,
  },
);

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: AssignSubmitPayload];
}>();

/* ============================== 状态 ============================== */

const selectedIds = ref<string[]>([]);
const sortKey = ref<'sla' | 'created'>('sla');
const scope = ref<AssignScope>('in-team');
const targetId = ref<string | undefined>(undefined);
const note = ref('');
const mergeNotify = ref(true); // 消息风暴合并开关：默认 on
const submitting = ref(false);
const flashTickets = ref(false);
const lastClickIndex = ref<number | null>(null);
const targetRef = ref<any>(null);
const scrollRef = ref<HTMLElement | null>(null);

/** 部分失败态：非空即进入结果态，弹窗不关闭 */
const results = ref<AssignResultRow[]>([]);

function reset() {
  const pre = props.preselectedIds ?? [];
  const valid = new Set(props.tickets.map((t) => t.id));
  selectedIds.value = pre.filter((id) => valid.has(id));
  sortKey.value = 'sla';
  scope.value = 'in-team';
  targetId.value = undefined;
  note.value = '';
  mergeNotify.value = true;
  submitting.value = false;
  results.value = [];
  lastClickIndex.value = null;
}

watch(
  () => props.open,
  (v) => {
    if (v) reset();
  },
  { immediate: true },
);

/* ============================== 工单表 ============================== */

const sortedTickets = computed(() => {
  const list = [...props.tickets];
  if (sortKey.value === 'sla') {
    // SLA 剩余 ↑：越紧急越靠前（已超时为负数，自然排最前）
    list.sort((a, b) => a.slaLeftMin - b.slaLeftMin);
  } else {
    // 创建时间 ↓
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }
  return list;
});

const resultMap = computed(() => {
  const m = new Map<string, AssignResultRow>();
  results.value.forEach((r) => m.set(r.id, r));
  return m;
});

const isResultMode = computed(() => results.value.length > 0);
const failedIds = computed(() => results.value.filter((r) => !r.ok).map((r) => r.id));
const successCount = computed(() => results.value.filter((r) => r.ok).length);
const allFailed = computed(() => isResultMode.value && successCount.value === 0);

/** 结果态下成功行 checkbox 置灰 */
function isRowLocked(id: string) {
  return isResultMode.value && resultMap.value.get(id)?.ok === true;
}

const selectableIds = computed(() =>
  sortedTickets.value.filter((t) => !isRowLocked(t.id)).map((t) => t.id),
);

const allChecked = computed(
  () => selectableIds.value.length > 0 && selectableIds.value.every((id) => selectedIds.value.includes(id)),
);
const someChecked = computed(() => selectedIds.value.length > 0 && !allChecked.value);

function toggleAll(checked: boolean) {
  selectedIds.value = checked ? [...selectableIds.value] : [];
  lastClickIndex.value = null;
}

function toggleRow(t: AssignTicket, index: number, ev?: MouseEvent) {
  if (isRowLocked(t.id)) return;
  // Shift 连选
  if (ev?.shiftKey && lastClickIndex.value !== null) {
    const bounds = [lastClickIndex.value, index].sort((a, b) => a - b);
    const shouldSelect = !selectedIds.value.includes(t.id);
    const set = new Set(selectedIds.value);
    sortedTickets.value
      .slice(bounds[0], bounds[1] + 1)
      .filter((r) => !isRowLocked(r.id))
      .forEach((r) => (shouldSelect ? set.add(r.id) : set.delete(r.id)));
    selectedIds.value = [...set];
    lastClickIndex.value = index;
    return;
  }
  const i = selectedIds.value.indexOf(t.id);
  if (i >= 0) selectedIds.value.splice(i, 1);
  else selectedIds.value.push(t.id);
  lastClickIndex.value = index;
}

/** 工单号点击 → 新标签页开详情，**不关弹窗** */
function openTicket(t: AssignTicket, ev: MouseEvent) {
  ev.stopPropagation();
  window.open(`#/tickets/list?no=${encodeURIComponent(t.no)}`, '_blank');
}

function fmtMin(m: number) {
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}h ${r}m` : `${h}h`;
  }
  return `${m}m`;
}

function slaBadge(min: number) {
  if (min < 0) return { text: `超时 ${fmtMin(-min)}`, color: '#EF4444', bg: '#EF444422' };
  if (min <= 30) return { text: fmtMin(min), color: '#EF4444', bg: '#EF444422' };
  if (min <= 120) return { text: fmtMin(min), color: '#F59E0B', bg: '#F59E0B22' };
  return { text: fmtMin(min), color: '#6B7280', bg: '#9CA3AF22' };
}

/* ============================== 目标处理人 / 处理组 ============================== */

interface CandOption {
  value: string;
  label: string;
  name: string;
  staffNo: string;
  online: string;
  workload: number;
  level: LoadLevel;
}

/** 候选**按在办数升序** —— 空闲的排最上，引导均衡分派（规格 §3.1 候选排序） */
const candidateOptions = computed<CandOption[]>(() =>
  [...props.candidates]
    .sort((a, b) => a.workload - b.workload || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .map((m) => {
      // loadLevel 优先取 mock 字段；缺失时用 LOAD_THRESHOLD 兜底，保证与 X4 同口径
      const level: LoadLevel = (m.loadLevel as LoadLevel) ?? loadLevelOf(m.workload);
      const staffNo = `工号 ${String(m.id).toUpperCase()}`;
      return {
        value: m.id,
        label: `${m.name} ${staffNo}`,
        name: m.name,
        staffNo,
        online: m.online,
        workload: m.workload,
        level,
      };
    }),
);

const isCross = computed(() => scope.value === 'cross-team');

const selectedCandidate = computed(() =>
  isCross.value ? undefined : candidateOptions.value.find((c) => c.value === targetId.value),
);

const targetName = computed(() => {
  if (isCross.value) return CROSS_TEAM_GROUPS.find((g) => g.value === targetId.value)?.label ?? '';
  return selectedCandidate.value?.name ?? '';
});

/** 切换指派范围 → **必须重置目标为空**（B6.4 防脏值） */
function onScopeChange(v: AssignScope) {
  if (v === 'cross-team' && !props.canCrossTeam) return;
  if (scope.value === v) return;
  scope.value = v;
  targetId.value = undefined;
}

function filterCandidate(input: string, option: any) {
  const kw = String(input).trim().toLowerCase();
  if (!kw) return true;
  return String(option?.label ?? '').toLowerCase().includes(kw);
}

/* ============================== 负载预览 ============================== */

const selectedCount = computed(() => selectedIds.value.length);

const loadPreview = computed(() => {
  const c = selectedCandidate.value;
  if (!c) return null;
  const before = c.workload;
  const after = before + selectedCount.value;
  const beforeLevel = loadLevelOf(before);
  const afterLevel = loadLevelOf(after);
  return { before, after, beforeLevel, afterLevel, crossed: beforeLevel !== afterLevel };
});

/** 满载确认提示：**不阻断提交** */
const showFullWarn = computed(() => !isCross.value && selectedCandidate.value?.level === '满载');

/* ============================== 消息风暴 ============================== */

const showStorm = computed(() => selectedCount.value >= STORM_THRESHOLD && !!targetId.value);

/* ============================== 校验 / 提交 ============================== */

const noteRequired = computed(() => isCross.value);

const okText = computed(() => {
  if (isResultMode.value) return allFailed.value ? '重试' : `重试失败项（${failedIds.value.length}）`;
  return `确认指派（${selectedCount.value}）`;
});

const okDisabled = computed(() => {
  if (isResultMode.value) return failedIds.value.length === 0;
  return selectedCount.value === 0;
});

function flashTicketArea() {
  flashTickets.value = true;
  window.setTimeout(() => {
    flashTickets.value = false;
  }, 600);
}

/** 校验未过 → message.warning + 不关弹窗（规格 §3.2） */
function validate(): boolean {
  if (selectedCount.value === 0) {
    message.warning('请至少选择 1 张工单');
    flashTicketArea();
    return false;
  }
  if (!targetId.value) {
    message.warning(isCross.value ? '请选择目标处理组' : '请选择目标处理人');
    nextTick(() => targetRef.value?.focus?.());
    return false;
  }
  if (isCross.value && !props.canCrossTeam) {
    message.warning('无跨组权限');
    return false;
  }
  if (noteRequired.value && !note.value.trim()) {
    message.warning('跨组指派需填写指派说明');
    nextTick(() => {
      document.querySelector<HTMLTextAreaElement>('.asg-note textarea')?.focus();
    });
    return false;
  }
  return true;
}

function onOk() {
  // 结果态：只重试失败项，工单集合收敛为失败行
  if (isResultMode.value) {
    if (!failedIds.value.length) return;
    emit('submit', {
      ticketIds: [...failedIds.value],
      scope: scope.value,
      targetId: targetId.value ?? '',
      targetName: targetName.value,
      note: note.value.trim(),
      mergeNotify: mergeNotify.value,
      isRetry: true,
    });
    return;
  }
  if (!validate()) return;
  emit('submit', {
    ticketIds: [...selectedIds.value],
    scope: scope.value,
    targetId: targetId.value ?? '',
    targetName: targetName.value,
    note: note.value.trim(),
    mergeNotify: mergeNotify.value,
    isRetry: false,
  });
}

function close() {
  emit('update:open', false);
}

/* ============================== 对父级暴露的结果态控制 ============================== */
/**
 * 提交是异步的、成败由服务端决定，所以「提交中 / 部分失败」两态由父级驱动：
 *   const m = ref(); m.value.setSubmitting(true) → 接口返回 → m.value.applyResults(rows)
 * 全部成功时父级直接置 open=false 并 message.success，弹窗自身不做假设。
 */
function setSubmitting(v: boolean) {
  submitting.value = v;
}

function applyResults(rows: AssignResultRow[]) {
  submitting.value = false;
  results.value = rows;
  // 成功行取消勾选（并置灰），失败行保持勾选，便于「重试失败项」
  selectedIds.value = rows.filter((r) => !r.ok).map((r) => r.id);
  // 自动滚到首个失败行
  nextTick(() => {
    const first = rows.find((r) => !r.ok);
    if (!first || !scrollRef.value) return;
    const el = scrollRef.value.querySelector<HTMLElement>(`[data-row-id="${first.id}"]`);
    if (el) scrollRef.value.scrollTop = Math.max(0, el.offsetTop - 30);
  });
}

defineExpose({ setSubmitting, applyResults, reset });
</script>

<template>
  <OpActionModal
    :open="open"
    title="指派工单"
    :icon="UserAddOutlined"
    tone="primary"
    :width="560"
    :ok-text="okText"
    :cancel-text="isResultMode ? '关闭' : '取消'"
    ok-tone="primary"
    :ok-disabled="okDisabled"
    :confirm-loading="submitting"
    @update:open="emit('update:open', $event)"
    @ok="onOk"
    @cancel="close"
  >
    <div class="op-form asg">
      <!-- 副标题：OpActionModal 标题槽只收一行文案，副标题落在正文首行 -->
      <div class="asg-sub">
        已选 {{ selectedCount }} 张 · {{ isCross ? '跨组转入目标组池' : '同组内调剂到人' }}
      </div>

      <!-- 结果态提示（部分失败 / 全部失败） -->
      <div v-if="isResultMode" class="op-tip" :class="allFailed ? 'asg-tip-danger' : 'op-tip-warn'">
        <template v-if="allFailed">全部失败，共 {{ failedIds.length }} 张未指派成功，可重试</template>
        <template v-else>成功 {{ successCount }} 张，失败 {{ failedIds.length }} 张</template>
      </div>

      <!-- ============ 工单选择区 ============ -->
      <div class="op-field">
        <div class="asg-tools">
          <div class="asg-tools-l">
            <a-checkbox
              :checked="allChecked"
              :indeterminate="someChecked"
              :disabled="selectableIds.length === 0"
              @change="(e: any) => toggleAll(e.target.checked)"
            >
              <span class="asg-label-req">选择工单</span>
            </a-checkbox>
            <span class="asg-count">已选 {{ selectedCount }} / 共 {{ tickets.length }}</span>
          </div>
          <a-dropdown :trigger="['click']">
            <span class="asg-sort">
              {{ sortKey === 'sla' ? 'SLA 剩余 ↑' : '创建时间 ↓' }}
              <DownOutlined class="asg-sort-chev" />
            </span>
            <template #overlay>
              <a-menu @click="({ key }) => (sortKey = String(key) === 'created' ? 'created' : 'sla')">
                <a-menu-item key="sla">SLA 剩余 ↑</a-menu-item>
                <a-menu-item key="created">创建时间 ↓</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>

        <!-- 内滚 max-height 220，表头 sticky -->
        <div ref="scrollRef" class="asg-scroll" :class="{ flash: flashTickets }">
          <div class="asg-thead" :class="{ res: isResultMode }">
            <div class="c-chk"></div>
            <div class="c-no">工单号</div>
            <div class="c-cus">客户</div>
            <div class="c-type">类型</div>
            <div class="c-pri">优先级</div>
            <div class="c-sla">SLA 剩余</div>
            <div v-if="isResultMode" class="c-res">结果</div>
          </div>

          <div
            v-for="(t, idx) in sortedTickets"
            :key="t.id"
            class="asg-trow"
            :class="{ res: isResultMode, locked: isRowLocked(t.id) }"
            :data-row-id="t.id"
            @click="toggleRow(t, idx, $event)"
          >
            <div class="c-chk" @click.stop>
              <a-checkbox
                :checked="selectedIds.includes(t.id)"
                :disabled="isRowLocked(t.id)"
                @change="toggleRow(t, idx)"
              />
            </div>
            <div class="c-no">
              <a class="asg-no" @click="openTicket(t, $event)">{{ t.no }}</a>
            </div>
            <div class="c-cus asg-ellipsis">{{ t.customer }}</div>
            <div class="c-type asg-ellipsis">{{ t.type }}</div>
            <div class="c-pri">
              <span class="asg-pri" :style="{ color: PRIORITY_COLOR[t.priority] }">{{ t.priority }}</span>
            </div>
            <div class="c-sla">
              <span
                class="asg-badge"
                :style="{ color: slaBadge(t.slaLeftMin).color, background: slaBadge(t.slaLeftMin).bg }"
              >
                {{ slaBadge(t.slaLeftMin).text }}
              </span>
            </div>
            <div v-if="isResultMode" class="c-res">
              <template v-if="resultMap.get(t.id)?.ok">
                <CheckCircleFilled class="asg-res-ok" />
                <span class="asg-res-ok-t">成功</span>
              </template>
              <template v-else-if="resultMap.get(t.id)">
                <CloseCircleFilled class="asg-res-fail" />
                <span class="asg-res-fail-t" :title="resultMap.get(t.id)?.reason">
                  {{ resultMap.get(t.id)?.reason || '失败' }}
                </span>
              </template>
              <span v-else class="asg-res-none">—</span>
            </div>
          </div>

          <div v-if="sortedTickets.length === 0" class="asg-empty">暂无待指派工单</div>
        </div>
      </div>

      <!-- ============ 指派范围 ============ -->
      <div class="op-field">
        <div class="op-label">指派范围</div>
        <div class="asg-scope">
          <a-radio :checked="scope === 'in-team'" @change="onScopeChange('in-team')">
            同组内（指派到人）
          </a-radio>
          <a-radio
            :checked="scope === 'cross-team'"
            :disabled="!canCrossTeam"
            @change="onScopeChange('cross-team')"
          >
            跨组（转入目标组池）
          </a-radio>
        </div>
        <div v-if="!canCrossTeam" class="asg-hint">仅班组长 / 运营管理员可跨组</div>
      </div>

      <!-- ============ 目标处理人 / 处理组 ============ -->
      <div class="op-field">
        <div class="op-label req">{{ isCross ? '目标处理组' : '目标处理人' }}</div>
        <a-select
          v-if="!isCross"
          ref="targetRef"
          v-model:value="targetId"
          show-search
          allow-clear
          class="asg-select"
          dropdown-class-name="asg-cand-dropdown"
          placeholder="搜索姓名 / 工号"
          :options="candidateOptions"
          :filter-option="filterCandidate"
        >
          <!-- 候选人下拉：状态点 + 姓名 + 工号 ‖ 负载徽章 + 在办数 -->
          <template #option="opt">
            <div class="asg-cand">
              <span class="asg-dot" :style="{ background: ONLINE_COLOR[opt.online] || '#9CA3AF' }"></span>
              <span class="asg-cand-name">{{ opt.name }}</span>
              <span class="asg-cand-no">{{ opt.staffNo }}</span>
              <span class="asg-cand-r">
                <span
                  class="asg-badge"
                  :style="{ color: loadStyle(opt.level).color, background: loadStyle(opt.level).bg }"
                >
                  {{ opt.level }}
                </span>
                <span class="asg-cand-load">在办 {{ opt.workload }}</span>
              </span>
            </div>
          </template>
        </a-select>
        <a-select
          v-else
          ref="targetRef"
          v-model:value="targetId"
          show-search
          allow-clear
          class="asg-select"
          placeholder="搜索目标处理组"
          :options="CROSS_TEAM_GROUPS"
          :filter-option="filterCandidate"
        />
      </div>

      <!-- 满载确认：提示但不阻断提交 -->
      <div v-if="showFullWarn" class="op-tip op-tip-warn">
        该坐席已满载（{{ selectedCandidate?.workload }} 单），确认仍要指派？
      </div>

      <!-- 负载预览盒（跨组时隐藏整个负载区） -->
      <div v-if="!isCross && loadPreview" class="op-box" :class="{ 'asg-box-warn': loadPreview.crossed }">
        <div class="op-box-title asg-box-title">负载变化预览</div>
        <div class="asg-load-row">
          <span class="asg-load-seg">
            指派前
            <b>{{ loadPreview.before }} 单</b>
            <i class="asg-mid">·</i>
            <em :style="{ color: LOAD_STYLE[loadPreview.beforeLevel].color }">{{ loadPreview.beforeLevel }}</em>
          </span>
          <ArrowRightOutlined class="asg-load-arrow" />
          <span class="asg-load-seg">
            指派后
            <b>{{ loadPreview.after }} 单</b>
            <i class="asg-mid">·</i>
            <em :style="{ color: LOAD_STYLE[loadPreview.afterLevel].color }">{{ loadPreview.afterLevel }}</em>
          </span>
        </div>
      </div>

      <!-- ============ 指派说明（同组内选填 / 跨组必填） ============ -->
      <div class="op-field asg-note">
        <div class="op-label" :class="{ req: noteRequired }">
          指派说明<span v-if="!noteRequired" class="asg-opt">（选填）</span>
        </div>
        <a-textarea
          v-model:value="note"
          :rows="3"
          :maxlength="NOTE_MAX"
          placeholder="说明指派原因，将写入工单履历并随 IM 通知目标坐席"
        />
        <div class="asg-counter">{{ note.length }}/{{ NOTE_MAX }}</div>
      </div>

      <!-- ============ 消息风暴（选中 ≥10 张） ============ -->
      <div v-if="showStorm" class="op-tip op-tip-warn asg-storm">
        <div class="asg-storm-t">
          本次将向 {{ targetName }} 发送 <b>{{ selectedCount }} 条</b> IM 通知（当前无消息合并能力）
        </div>
        <div class="asg-storm-sw">
          <a-switch v-model:checked="mergeNotify" size="small" />
          <span>合并为一条通知</span>
        </div>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.asg { gap: 12px; }

.asg-sub { font-size: 11px; color: #9ca3af; line-height: 1.4; margin-top: -2px; }

/* 全部失败：danger 底（规格 §3.3） */
.asg-tip-danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

/* ---------- 工具行 ---------- */
.asg-tools {
  display: flex; align-items: center; justify-content: space-between;
  min-height: 28px; gap: 12px;
}
.asg-tools-l { display: flex; align-items: center; gap: 10px; min-width: 0; }
.asg-label-req { font-size: 13px; color: #374151; font-weight: 500; }
.asg-label-req::before { content: '* '; color: #ef4444; }
.asg-count { font-size: 12px; color: #6b7280; font-variant-numeric: tabular-nums; }
.asg-sort {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; color: #1a6fff; cursor: pointer; user-select: none;
}
.asg-sort-chev { font-size: 10px; }

/* ---------- 工单表：内滚 220 + 表头 sticky ---------- */
.asg-scroll {
  max-height: 220px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.asg-scroll.flash { animation: asg-flash 600ms ease-in-out; }
@keyframes asg-flash {
  0%, 100% { border-color: #e5e7eb; box-shadow: none; }
  25%, 75% { border-color: #ef4444; box-shadow: 0 0 0 2px #ef444422; }
}

.asg-thead,
.asg-trow {
  display: grid;
  grid-template-columns: 32px 96px minmax(72px, 1fr) 64px 48px 76px;
  align-items: center;
  min-width: 388px;
}
.asg-thead.res,
.asg-trow.res {
  grid-template-columns: 32px 96px minmax(72px, 1fr) 64px 48px 76px 128px;
  min-width: 516px;
}
.asg-thead {
  position: sticky; top: 0; z-index: 2;
  height: 30px; padding: 0 10px;
  background: #f3f4f6;
  font-size: 11px; font-weight: 600; color: #6b7280;
}
.asg-trow {
  min-height: 36px; padding: 0 10px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 12px; color: #374151;
  cursor: pointer;
}
.asg-trow:last-child { border-bottom: none; }
.asg-trow:hover { background: #f9fafb; }
.asg-trow.locked { cursor: default; color: #9ca3af; }
.asg-trow.locked:hover { background: transparent; }

.asg-thead > div,
.asg-trow > div { padding-right: 6px; min-width: 0; }
.asg-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asg-no { color: #1a6fff; cursor: pointer; }
.asg-no:hover { text-decoration: underline; }
.asg-pri { font-weight: 600; font-variant-numeric: tabular-nums; }
.asg-badge {
  display: inline-block; padding: 2px 6px; border-radius: 3px;
  font-size: 10px; font-weight: 600; white-space: nowrap;
}
.asg-empty { padding: 26px 0; text-align: center; font-size: 12px; color: #9ca3af; }

.c-res { display: flex; align-items: center; gap: 4px; overflow: hidden; }
.asg-res-ok { color: #10b981; font-size: 12px; }
.asg-res-ok-t { color: #10b981; font-size: 11px; }
.asg-res-fail { color: #ef4444; font-size: 12px; flex: none; }
.asg-res-fail-t {
  color: #ef4444; font-size: 11px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.asg-res-none { color: #d1d5db; }

/* ---------- 指派范围 ---------- */
.asg-scope { display: flex; align-items: center; gap: 20px; }
.asg-hint { font-size: 11px; color: #9ca3af; }

/* ---------- 目标处理人 ---------- */
.asg-select { width: 100%; }
.asg-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.asg-cand { display: flex; align-items: center; gap: 8px; width: 100%; }
.asg-cand-name { font-size: 13px; font-weight: 500; color: #111827; }
.asg-cand-no { font-size: 11px; color: #9ca3af; }
.asg-cand-r { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.asg-cand-load { font-size: 11px; color: #6b7280; font-variant-numeric: tabular-nums; }

/* ---------- 负载预览 ---------- */
/* 规格 §3.1：跨档时盒切 warn 态（底 #FFF7ED / 边 #FED7AA），比全局 .op-box-warn 更暖一档 */
.asg-box-warn { background: #fff7ed; border-color: #fed7aa; }
.asg-box-title { color: #6b7280; font-weight: 600; margin-bottom: 2px; }
.asg-load-row { display: flex; align-items: center; gap: 10px; min-height: 22px; }
.asg-load-seg { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #6b7280; }
.asg-load-seg b { color: #111827; font-weight: 600; font-variant-numeric: tabular-nums; }
.asg-load-seg em { font-style: normal; font-weight: 600; }
.asg-mid { font-style: normal; color: #d1d5db; }
.asg-load-arrow { font-size: 12px; color: #9ca3af; }

/* ---------- 指派说明 ---------- */
.asg-note { position: relative; }
.asg-opt { color: #9ca3af; font-weight: 400; }
.asg-counter { align-self: flex-end; font-size: 11px; color: #9ca3af; margin-top: -2px; }

/* ---------- 消息风暴 ---------- */
.asg-storm { display: flex; flex-direction: column; gap: 8px; }
.asg-storm-t b { font-weight: 700; }
.asg-storm-sw { display: flex; align-items: center; gap: 8px; font-size: 12px; }
</style>

<!--
  候选人下拉挂在 body 上，scoped 选择器够不到，故用具名 dropdownClassName 做非 scoped 覆盖。
  X2：hover 底必须是 #F9FAFB（规格明确禁用的浅蓝 hover 色不得使用），选中底 #EFF6FF。
-->
<style>
.asg-cand-dropdown .ant-select-item-option { padding: 8px 10px; min-height: 40px; }
.asg-cand-dropdown .ant-select-item-option-active:not(.ant-select-item-option-disabled) { background: #f9fafb; }
.asg-cand-dropdown .ant-select-item-option-selected:not(.ant-select-item-option-disabled) { background: #eff6ff; }
</style>
