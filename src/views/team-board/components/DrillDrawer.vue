<script lang="ts">
/**
 * 班组长看板 · 下钻抽屉（对外类型，供 TeamBoardView 接线使用）
 * 实现依据：《班组长看板-实现规格》§零 交叉裁决 X2/X3/X5 + §二 下钻抽屉 2.1–2.5
 */

/** 下钻型别：priority=型1 分布型；people=型2 人员型；source=型2 变体·来源型 */
export type DrillType = 'priority' | 'people' | 'source';

/** go-list 出口载荷。抽屉内一律离开看板去 02，不做二次下钻（§2.4 / §2.5） */
export interface DrillGoListPayload {
  type: DrillType;
  /** row=某一聚合桶行；footer=页脚整体出口 */
  scope: 'row' | 'footer';
  /** 桶键：P0 / 人员 id / 来源名；footer 出口为 undefined */
  key?: string;
  /** 桶展示名，便于父级做 message 提示 */
  label?: string;
  /** 建议跳转路径（父级可覆盖） */
  path: string;
  /** 查询串，已按 §2.2 口径拼好（footer = 行出口去掉桶维度） */
  query: Record<string, string>;
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  CloseOutlined,
  RightOutlined,
  InboxOutlined,
  TeamOutlined,
  ExclamationCircleFilled,
  ExclamationCircleOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons-vue';
/**
 * 类型来自 mock 数据源（该文件由他人维护，本组件只读不改）。
 * eslint-disable-next-line @typescript-eslint/consistent-type-imports -- 仅取类型，避免运行时耦合
 */
import type { PriorityBucket, PeopleDrillRow, SourceDrillGroup } from '@/mock/teamBoard';

/* ==========================================================================
 * lucide → @ant-design/icons-vue 图标映射（规格用 lucide 语义名，工程只有 antd 图标）
 * --------------------------------------------------------------------------
 *  规格 lucide 名        antd 组件                    用处
 *  x                  → CloseOutlined               §2.1 Header 关闭
 *  chevron-right      → RightOutlined               §2.2 行尾箭头 / §2.3 行尾箭头
 *  inbox              → InboxOutlined               §2.4 无数据态
 *  users              → TeamOutlined                §2.4 型2 空态
 *  shield-alert       → ExclamationCircleOutlined   §2.4 错误态（antd 无盾形告警，取同语义圆形感叹号描边）
 *  「!」告警标         → ExclamationCircleFilled     §2.2 合计不平标记（实心以拉开与错误态的层级）
 *  arrow-right（→）   → ArrowRightOutlined          §2.1 Footer 出口箭头
 * ========================================================================== */

interface Props {
  open: boolean;
  type: DrillType | null;
  title: string;
  subtitle?: string;
  total: number;
  /** 仅 people 型的催单场景使用 */
  totalUnread?: number;
  buckets?: PriorityBucket[];
  people?: PeopleDrillRow[];
  sources?: SourceDrillGroup[];
  loading?: boolean;
  error?: boolean;
  footerText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  subtitle: '',
  totalUnread: undefined,
  buckets: () => [],
  people: () => [],
  sources: () => [],
  loading: false,
  error: false,
  footerText: '',
});

const emit = defineEmits<{
  'update:open': [v: boolean];
  'go-list': [payload: DrillGoListPayload];
  assign: [row: PeopleDrillRow];
  supervise: [row: PeopleDrillRow];
  retry: [];
}>();

/* --------------------------------------------------------------------------
 * 层快照 —— 用于「原地替换内容」的交叉淡变（§2.1）
 * 切 type 时不叠层：旧层 leaving 淡出、新层淡入，两层同时在场 150ms
 * ------------------------------------------------------------------------ */
interface Snap {
  type: DrillType | null;
  title: string;
  subtitle: string;
  total: number;
  totalUnread?: number;
  buckets: PriorityBucket[];
  people: PeopleDrillRow[];
  sources: SourceDrillGroup[];
  loading: boolean;
  error: boolean;
  footerText: string;
}

interface Layer {
  key: number;
  snap: Snap;
  leaving: boolean;
  /** 条入场动画开关：false→true 触发 320ms 从左展开 */
  barsIn: boolean;
  /** §2.4 行序在打开瞬间冻结，60s 静默刷新不重排 */
  order: string[];
}

function readSnap(): Snap {
  return {
    type: props.type,
    title: props.title,
    subtitle: props.subtitle,
    total: props.total,
    totalUnread: props.totalUnread,
    buckets: props.buckets ?? [],
    people: props.people ?? [],
    sources: props.sources ?? [],
    loading: props.loading,
    error: props.error,
    footerText: props.footerText,
  };
}

const SWAP_MS = 150;
const SKELETON_MIN_MS = 300;
const FLASH_MS = 200;

let seq = 0;
const layers = ref<Layer[]>([]);
let swapTimer: number | undefined;
let holdTimer: number | undefined;
let flashTimer: number | undefined;
let loadingStart = 0;

/** 骨架最短驻留（§2.4）：loading 结束后仍补足 300ms，防一闪而过 */
const skeletonHold = ref(false);
/** 数值刷新高亮（§2.4）：底 #EFF6FF 淡入淡出 200ms */
const flash = ref(false);

function makeLayer(): Layer {
  const layer: Layer = { key: ++seq, snap: readSnap(), leaving: false, barsIn: false, order: [] };
  freezeOrder(layer);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      layer.barsIn = true;
    });
  });
  return layer;
}

function freezeOrder(layer: Layer) {
  if (layer.order.length) return;
  if (layer.snap.type === 'people' && layer.snap.people.length) {
    layer.order = sortPeople(layer.snap.people).map((r) => r.id);
  }
}

function beginSkeletonGate() {
  window.clearTimeout(holdTimer);
  if (props.loading) {
    skeletonHold.value = true;
    loadingStart = Date.now();
  } else {
    skeletonHold.value = false;
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      layers.value = [makeLayer()];
      beginSkeletonGate();
    } else {
      window.clearTimeout(swapTimer);
      layers.value = [];
      skeletonHold.value = false;
      flash.value = false;
    }
  },
  { immediate: true },
);

/** type 变化 → 原地替换（不叠层）。必须注册在数据 watcher 之前，保证先建新层再灌数 */
watch(
  () => props.type,
  (nv, ov) => {
    if (!props.open || nv === ov) return;
    const cur = layers.value[layers.value.length - 1];
    if (cur) cur.leaving = true;
    layers.value.push(makeLayer());
    window.clearTimeout(swapTimer);
    swapTimer = window.setTimeout(() => {
      layers.value = layers.value.filter((l) => !l.leaving);
    }, SWAP_MS);
    beginSkeletonGate();
  },
);

/** 数据变化（非 type 切换）→ 就地更新当前层，不触发淡变 */
watch(
  () => [
    props.title,
    props.subtitle,
    props.total,
    props.totalUnread,
    props.buckets,
    props.people,
    props.sources,
    props.loading,
    props.error,
    props.footerText,
  ],
  () => {
    const cur = layers.value[layers.value.length - 1];
    if (!cur || cur.leaving) return;
    cur.snap = readSnap();
    freezeOrder(cur);
  },
);

watch(
  () => props.loading,
  (v) => {
    if (!props.open) return;
    window.clearTimeout(holdTimer);
    if (v) {
      skeletonHold.value = true;
      loadingStart = Date.now();
      return;
    }
    if (!skeletonHold.value) return;
    const rest = Math.max(0, SKELETON_MIN_MS - (Date.now() - loadingStart));
    holdTimer = window.setTimeout(() => {
      skeletonHold.value = false;
    }, rest);
  },
);

/** 60s 静默刷新导致数值变化时的 200ms 高亮（§2.4） */
watch(
  () => [props.total, props.totalUnread],
  (nv, ov) => {
    if (!props.open || props.loading) return;
    if (nv[0] === ov[0] && nv[1] === ov[1]) return;
    flash.value = true;
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      flash.value = false;
    }, FLASH_MS);
  },
);

/* --------------------------------------------------------------------------
 * 交互：Esc 关闭（§2.1）
 * ------------------------------------------------------------------------ */
function onKeydown(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === 'Escape' || e.key === 'Esc') close();
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  window.clearTimeout(swapTimer);
  window.clearTimeout(holdTimer);
  window.clearTimeout(flashTimer);
});

function close() {
  emit('update:open', false);
}

/* --------------------------------------------------------------------------
 * 型1 · 分布型（§2.2）
 * ------------------------------------------------------------------------ */
/** 排序固定 P0→P1→P2→P3，不按数量排（优先级是有序枚举，位置恒定才能跨日对照） */
const P_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
/** 兜底色：mock 未给 color 时按 §2.2 圆点色表回填 */
const P_COLOR: Record<string, string> = {
  P0: '#EF4444',
  P1: '#F59E0B',
  P2: '#1A6FFF',
  P3: '#9CA3AF',
};

function sortedBuckets(layer: Layer): PriorityBucket[] {
  return [...layer.snap.buckets].sort(
    (a, b) => (P_ORDER[a.sysKey] ?? 99) - (P_ORDER[b.sysKey] ?? 99),
  );
}

function bucketSum(layer: Layer): number {
  return layer.snap.buckets.reduce((s, b) => s + b.count, 0);
}

/** 各档之和 ≠ 总量 → 合计行右侧出红色「!」+ tooltip */
function sumMismatch(layer: Layer): boolean {
  if (!layer.snap.buckets.length) return false;
  return bucketSum(layer) !== layer.snap.total;
}

/* --------------------------------------------------------------------------
 * 型2 · 人员型（§2.3）
 * ------------------------------------------------------------------------ */
type PeopleFilter = 'all' | 'unread';
const peopleFilter = ref<PeopleFilter>('all');

/** 切 type / 重开抽屉时筛选态复位（筛选是本地态，不跨下钻继承） */
watch(
  () => [props.open, props.type],
  () => {
    peopleFilter.value = 'all';
  },
);

/** 未读 desc → 总量 desc → 姓名拼音 asc */
function sortPeople(rows: PeopleDrillRow[]): PeopleDrillRow[] {
  return [...rows].sort(
    (a, b) =>
      (b.unread ?? 0) - (a.unread ?? 0) ||
      b.count - a.count ||
      a.name.localeCompare(b.name, 'zh'),
  );
}

/** 排序 + 冻结行序 + 本地筛选。筛选 chip 是筛选不是下钻，不发 emit */
function displayPeople(layer: Layer): PeopleDrillRow[] {
  const sorted = sortPeople(layer.snap.people);
  const frozen = layer.order;
  if (frozen.length) {
    sorted.sort((a, b) => {
      const ia = frozen.indexOf(a.id);
      const ib = frozen.indexOf(b.id);
      return (ia < 0 ? Number.MAX_SAFE_INTEGER : ia) - (ib < 0 ? Number.MAX_SAFE_INTEGER : ib);
    });
  }
  if (peopleFilter.value === 'unread') return sorted.filter((r) => (r.unread ?? 0) > 0);
  return sorted;
}

/**
 * R6 落实（§零 X3 / §2.3，规格修订版）：行内按钮默认全为文字按钮；
 * 取排序后**第一个**命中「online==='离线' 且 unread>0」的行（不要求是首行），
 * 将其「指派」升为实心主按钮。全表最多一个；无命中则全表无实心。
 * （原「必须是首行」的写法在真实 mock 下永不成立 —— 未读 desc 排序会把在线的人顶到首位）
 */
function solidRowId(layer: Layer): string | null {
  const hit = displayPeople(layer).find((r) => r.online === '离线' && (r.unread ?? 0) > 0);
  return hit ? hit.id : null;
}

function unreadPeopleCount(layer: Layer): number {
  return layer.snap.people.filter((r) => (r.unread ?? 0) > 0).length;
}

/** 催单场景才有未读维度；退回场景无 unread，则不出筛选 chip 组（否则「未读 0」是噪声） */
function showChips(layer: Layer): boolean {
  return layer.snap.type === 'people' && layer.snap.totalUnread !== undefined;
}

const ONLINE_COLOR: Record<string, string> = {
  在线: '#10B981',
  小休: '#F59E0B',
  离线: '#9CA3AF',
};

/* --------------------------------------------------------------------------
 * 型2 变体 · 来源型（§2.5 边界：SourceDrillGroup.items 含工单号，渲染即越界，只出聚合行）
 * ------------------------------------------------------------------------ */
function sortedSources(layer: Layer): SourceDrillGroup[] {
  return [...layer.snap.sources].sort((a, b) => b.count - a.count);
}

function sourceSum(layer: Layer): number {
  return layer.snap.sources.reduce((s, g) => s + g.count, 0);
}

/* --------------------------------------------------------------------------
 * 通用
 * ------------------------------------------------------------------------ */
function pct(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

/** 轨恒满宽 440；填充宽 = 占比 × 440，最小 4px */
const TRACK_W = 440;
function fillWidth(count: number, total: number): string {
  if (!total) return '4px';
  return `${Math.max(4, Math.round((count / total) * TRACK_W))}px`;
}

function rowCount(layer: Layer): number {
  if (layer.snap.type === 'priority') return layer.snap.buckets.length;
  if (layer.snap.type === 'people') return layer.snap.people.length;
  if (layer.snap.type === 'source') return layer.snap.sources.length;
  return 0;
}

function isSkeleton(layer: Layer): boolean {
  const top = layers.value[layers.value.length - 1];
  if (layer === top) return layer.snap.loading || skeletonHold.value;
  return layer.snap.loading;
}

function isEmpty(layer: Layer): boolean {
  return !layer.snap.error && !isSkeleton(layer) && rowCount(layer) === 0;
}

/** 型2 且总量为 0 = 正向空态（「保持住」），其余为无数据态（必须带原因行） */
function isPositiveEmpty(layer: Layer): boolean {
  return isEmpty(layer) && layer.snap.type === 'people' && layer.snap.total === 0;
}

/**
 * §2.4 无数据态不得只写「暂无数据」。原因目前无接口字段，按前端可判定的两种情形推断：
 * 明细为空但总量 > 0 → 口径不一致，多半仍在统计；总量也为 0 → 指标未配置/无权限。
 */
function emptyReason(layer: Layer): string {
  if (layer.snap.total > 0) return '统计中，稍后刷新';
  return '该指标未配置，或无本组数据权限';
}

/** 总量块说明行。规格要求有说明位但契约未给字段，按型别推断 */
function caption(layer: Layer): string {
  const s = layer.snap;
  if (s.type === 'priority') return `共 ${s.total} 单 · 按优先级分档`;
  if (s.type === 'people') {
    return s.totalUnread !== undefined
      ? `共 ${s.total} 单 · 其中 ${s.totalUnread} 条未读`
      : `共 ${s.total} 单 · 按处理人归集`;
  }
  return `共 ${s.total} 单 · 按来源归集`;
}

/* --------------------------------------------------------------------------
 * 出口：一律 go-list，不开第二层抽屉（§2.4 / §2.5）
 * ------------------------------------------------------------------------ */
const BASE_QUERY: Record<string, string> = { scope: 'team' };

function goBucket(layer: Layer, b: PriorityBucket) {
  emit('go-list', {
    type: 'priority',
    scope: 'row',
    key: b.sysKey,
    label: `${b.sysKey} ${b.reqLabel}`,
    path: '/tickets/list',
    query: {
      ...BASE_QUERY,
      status: 'BACKLOG',
      priority: b.sysKey,
      _from: `board.backlog.${b.sysKey.toLowerCase()}`,
    },
  });
}

function goPerson(layer: Layer, r: PeopleDrillRow) {
  emit('go-list', {
    type: 'people',
    scope: 'row',
    key: r.id,
    label: r.name,
    path: '/tickets/list',
    query: {
      ...BASE_QUERY,
      assignee: r.id,
      _from: `board.people.${r.id}`,
    },
  });
}

function goSource(layer: Layer, g: SourceDrillGroup) {
  emit('go-list', {
    type: 'source',
    scope: 'row',
    key: g.source,
    label: g.source,
    path: '/tickets/list',
    query: {
      ...BASE_QUERY,
      source: g.source,
      _from: 'board.source',
    },
  });
}

function goFooter(layer: Layer) {
  const t = layer.snap.type;
  if (!t) return;
  const query: Record<string, string> =
    t === 'priority'
      ? { ...BASE_QUERY, status: 'BACKLOG', _from: 'board.backlog' }
      : { ...BASE_QUERY, _from: t === 'people' ? 'board.people' : 'board.source' };
  emit('go-list', { type: t, scope: 'footer', path: '/tickets/list', query });
}

/** 行内按钮作用于「人」不作用于某张单，抽屉内用 OpActionModal 完成（§2.5 唯一例外） */
function onAssign(r: PeopleDrillRow) {
  emit('assign', r);
}
function onSupervise(r: PeopleDrillRow) {
  emit('supervise', r);
}

const topLayer = computed(() => layers.value[layers.value.length - 1]);

/** 空态时 Footer 出口置禁用（§2.4） */
const footerDisabled = computed(() => {
  const l = topLayer.value;
  if (!l) return true;
  return l.snap.error || isSkeleton(l) || isEmpty(l);
});

const footerLabel = computed(() => {
  const l = topLayer.value;
  if (!l) return '';
  const raw = l.snap.footerText || `在工单工作台查看这 ${l.snap.total} 单`;
  return raw.replace(/\s*(→|->)\s*$/, '');
});
</script>

<template>
  <Teleport to="body">
    <!-- 不设遮罩（§2.1）：靠左边框 + -2px 0 8px #0000000F 阴影分层；open=false 时整体不渲染 -->
    <Transition name="dd">
      <aside v-if="open" class="dd" role="dialog" aria-modal="false" :aria-label="title">
        <!-- Header h56 -->
        <div class="dd-head">
          <div class="dd-head-stage">
            <div
              v-for="l in layers"
              :key="l.key"
              class="dd-head-text"
              :class="{ leaving: l.leaving }"
            >
              <div class="dd-title-line">
                <span class="dd-title">{{ l.snap.title }}</span>
                <span class="dd-badge">实时 60s</span>
              </div>
              <div v-if="l.snap.subtitle" class="dd-sub">{{ l.snap.subtitle }}</div>
            </div>
          </div>
          <button type="button" class="dd-close" aria-label="关闭" @click="close">
            <!-- lucide x -->
            <CloseOutlined />
          </button>
        </div>

        <!-- Body -->
        <div class="dd-body">
          <div class="dd-stage">
            <div v-for="l in layers" :key="l.key" class="dd-layer" :class="{ leaving: l.leaving }">
              <!-- ── 错误态（§2.4）── -->
              <div v-if="l.snap.error" class="dd-state">
                <!-- lucide shield-alert -->
                <ExclamationCircleOutlined class="dd-state-err-icon" />
                <div class="dd-state-title">加载失败</div>
                <button type="button" class="dd-linkbtn" @click="emit('retry')">重试</button>
              </div>

              <!-- ── 骨架屏（§2.4，非 spinner，最短驻留 300ms）── -->
              <template v-else-if="isSkeleton(l)">
                <div class="sk-total">
                  <div class="sk sk-num"></div>
                  <div class="sk sk-cap"></div>
                </div>
                <div v-for="n in 4" :key="n" class="sk-row">
                  <div class="sk-row-top">
                    <div class="sk sk-label"></div>
                    <div class="sk sk-val"></div>
                  </div>
                  <div class="sk sk-bar"></div>
                </div>
              </template>

              <!-- ── 型2 正向空态（§2.4）── -->
              <div v-else-if="isPositiveEmpty(l)" class="dd-state">
                <!-- lucide users -->
                <TeamOutlined class="dd-state-icon" />
                <div class="dd-state-title">本组暂无未读催单</div>
                <div class="dd-state-reason">保持住</div>
              </div>

              <!-- ── 无数据态（§2.4，必须带原因行）── -->
              <div v-else-if="isEmpty(l)" class="dd-state">
                <!-- lucide inbox -->
                <InboxOutlined class="dd-state-icon" />
                <div class="dd-state-title">暂无数据</div>
                <div class="dd-state-reason">{{ emptyReason(l) }}</div>
              </div>

              <!-- ── 有数据 ── -->
              <template v-else>
                <!-- 总量块 h56 -->
                <div class="dd-total" :class="{ flash: flash && !l.leaving }">
                  <div class="dd-total-line">
                    <span class="dd-total-num">{{ l.snap.total }}</span>
                    <span v-if="l.snap.totalUnread !== undefined" class="dd-total-unread">
                      未读 {{ l.snap.totalUnread }}
                    </span>
                  </div>
                  <div class="dd-total-cap">{{ caption(l) }}</div>
                </div>

                <!-- ════ 型1 · 分布型（§2.2）════ -->
                <template v-if="l.snap.type === 'priority'">
                  <div
                    v-for="b in sortedBuckets(l)"
                    :key="b.sysKey"
                    class="pr-row"
                    role="button"
                    tabindex="0"
                    @click="goBucket(l, b)"
                    @keydown.enter.prevent="goBucket(l, b)"
                    @keydown.space.prevent="goBucket(l, b)"
                  >
                    <div class="pr-top">
                      <span class="pr-dot" :style="{ background: b.color || P_COLOR[b.sysKey] }"></span>
                      <span class="pr-key">{{ b.sysKey }}</span>
                      <!-- 副标签是映射位：主标签 P0 与需求口径「紧急」并置，映射待业务确认（R8） -->
                      <span class="pr-map">{{ b.reqLabel }}</span>
                      <span class="pr-gap"></span>
                      <span class="pr-val">{{ b.count }}</span>
                      <span class="pr-pct">({{ pct(b.count, l.snap.total) }}%)</span>
                      <!-- lucide chevron-right -->
                      <RightOutlined class="pr-arrow" />
                    </div>
                    <div class="pr-track">
                      <div
                        class="pr-fill"
                        :style="{
                          width: l.barsIn ? fillWidth(b.count, l.snap.total) : '0px',
                          background: b.color || P_COLOR[b.sysKey],
                        }"
                      ></div>
                    </div>
                  </div>

                  <div class="dd-sum">
                    <span class="dd-sum-label">合计</span>
                    <span class="dd-sum-val">{{ bucketSum(l) }} · 100%</span>
                    <a-tooltip
                      v-if="sumMismatch(l)"
                      :title="`各档之和 ${bucketSum(l)} 与总量 ${l.snap.total} 不一致，可能存在未归档优先级或统计延迟`"
                    >
                      <!-- 「!」告警标 -->
                      <ExclamationCircleFilled class="dd-sum-warn" />
                    </a-tooltip>
                  </div>
                </template>

                <!-- ════ 型2 · 人员型（§2.3）════ -->
                <template v-else-if="l.snap.type === 'people'">
                  <!-- 筛选 chip 组：本地筛选，不是下钻 -->
                  <div v-if="showChips(l)" class="pp-chips">
                    <button
                      type="button"
                      class="pp-chip"
                      :class="{ on: peopleFilter === 'all' }"
                      @click="peopleFilter = 'all'"
                    >
                      全部 {{ l.snap.people.length }}
                    </button>
                    <button
                      type="button"
                      class="pp-chip"
                      :class="{ on: peopleFilter === 'unread' }"
                      @click="peopleFilter = 'unread'"
                    >
                      未读 {{ unreadPeopleCount(l) }}
                    </button>
                  </div>

                  <div class="pp-head">
                    <span>成员</span>
                    <span class="pp-h-count">数量</span>
                    <span class="pp-h-op">操作</span>
                  </div>

                  <div
                    v-for="r in displayPeople(l)"
                    :key="r.id"
                    class="pp-row"
                    role="button"
                    tabindex="0"
                    @click="goPerson(l, r)"
                    @keydown.enter.prevent="goPerson(l, r)"
                    @keydown.space.prevent="goPerson(l, r)"
                  >
                    <div class="pp-main">
                      <div class="pp-name-line">
                        <span class="pp-name">{{ r.name }}</span>
                        <span class="pp-no">{{ r.id }}</span>
                      </div>
                      <div class="pp-state" :style="{ color: ONLINE_COLOR[r.online] }">
                        <span class="pp-dot" :style="{ background: ONLINE_COLOR[r.online] }"></span>
                        {{ r.online }}
                      </div>
                    </div>
                    <div class="pp-count">
                      <span class="pp-count-total">{{ r.count }}</span>
                      <template v-if="(r.unread ?? 0) > 0">
                        <span class="pp-count-sep">·</span>
                        <span class="pp-count-unread">未读 {{ r.unread }}</span>
                      </template>
                    </div>
                    <div class="pp-ops" @click.stop>
                      <button type="button" class="pp-txtbtn" @click="onSupervise(r)">督办</button>
                      <button
                        type="button"
                        :class="solidRowId(l) === r.id ? 'pp-solidbtn' : 'pp-txtbtn'"
                        @click="onAssign(r)"
                      >
                        指派
                      </button>
                    </div>
                  </div>
                </template>

                <!-- ════ 型2 变体 · 来源型（占位实现）════ -->
                <template v-else-if="l.snap.type === 'source'">
                  <!-- R9 边界：SourceDrillGroup.items 含工单号，抽屉内只出聚合桶，明细一律跳 02 -->
                  <div
                    v-for="g in sortedSources(l)"
                    :key="g.source"
                    class="pr-row"
                    role="button"
                    tabindex="0"
                    @click="goSource(l, g)"
                    @keydown.enter.prevent="goSource(l, g)"
                    @keydown.space.prevent="goSource(l, g)"
                  >
                    <div class="pr-top">
                      <span class="pr-key">{{ g.source }}</span>
                      <span class="pr-gap"></span>
                      <span class="pr-val">{{ g.count }}</span>
                      <span class="pr-pct">({{ pct(g.count, l.snap.total) }}%)</span>
                      <RightOutlined class="pr-arrow" />
                    </div>
                    <div class="pr-track">
                      <!-- 来源是无序分类，R4 不许上语义色，一律中性 #9CA3AF -->
                      <div
                        class="pr-fill"
                        :style="{
                          width: l.barsIn ? fillWidth(g.count, l.snap.total) : '0px',
                          background: '#9CA3AF',
                        }"
                      ></div>
                    </div>
                  </div>

                  <div class="dd-sum">
                    <span class="dd-sum-label">合计</span>
                    <span class="dd-sum-val">{{ sourceSum(l) }} · 100%</span>
                    <a-tooltip
                      v-if="sourceSum(l) !== l.snap.total"
                      :title="`各来源之和 ${sourceSum(l)} 与总量 ${l.snap.total} 不一致，可能存在未归类来源或统计延迟`"
                    >
                      <ExclamationCircleFilled class="dd-sum-warn" />
                    </a-tooltip>
                  </div>
                </template>
              </template>
            </div>
          </div>
        </div>

        <!-- Footer h56 · 次按钮满宽 -->
        <div class="dd-foot">
          <button
            type="button"
            class="dd-footbtn"
            :disabled="footerDisabled"
            @click="topLayer && goFooter(topLayer)"
          >
            <span>{{ footerLabel }}</span>
            <!-- lucide arrow-right -->
            <ArrowRightOutlined class="dd-footbtn-arrow" />
          </button>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── 外壳（§2.1）：W480 × H100%，圆角 0，不设遮罩 ── */
.dd {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 900; /* 低于 a-modal(1000)：抽屉内指派/督办弹窗必须压在其上 */
  display: flex;
  flex-direction: column;
  width: 480px;
  height: 100%;
  background: #ffffff;
  border-left: 1px solid #e5e7eb;
  border-radius: 0;
  box-shadow: -2px 0 8px #0000000f;
}

/* 滑入 240ms ease-out / 关闭 180ms */
.dd-enter-active {
  transition: transform 240ms ease-out;
}
.dd-leave-active {
  transition: transform 180ms ease-in;
}
.dd-enter-from,
.dd-leave-to {
  transform: translateX(100%);
}

/* ── Header ── */
.dd-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
  height: 56px;
  padding: 0 20px;
  border-bottom: 1px solid #e5e7eb;
}
.dd-head-stage {
  position: relative;
  flex: 1;
  min-width: 0;
  align-self: stretch;
}
.dd-head-text {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  transition: opacity 150ms linear;
  opacity: 1;
}
.dd-head-text.leaving {
  opacity: 0;
  pointer-events: none;
}
.dd-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.dd-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dd-badge {
  flex: none;
  height: 16px;
  padding: 2px 6px;
  border-radius: 3px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 9px;
  font-weight: 600;
  line-height: 12px;
}
.dd-sub {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 400;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dd-close {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #6b7280;
  font-size: 16px;
  cursor: pointer;
}
.dd-close:hover {
  background: #f3f4f6;
}

/* ── Body ── */
.dd-body {
  flex: 1;
  min-height: 0;
  padding: 16px 20px;
  overflow-y: auto;
  overflow-x: hidden;
}
.dd-stage {
  position: relative;
}
.dd-layer {
  transition: opacity 150ms linear;
  opacity: 1;
}
/* 切 type 时旧层原地淡出，新层淡入 —— 不叠层、不做抽屉栈 */
.dd-layer.leaving {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  opacity: 0;
  pointer-events: none;
}

/* ── 总量块 h56 ── */
.dd-total {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 56px;
  margin: 0 -20px;
  padding: 0 20px;
  border-radius: 4px;
}
.dd-total.flash {
  animation: dd-flash 200ms ease-in-out;
}
@keyframes dd-flash {
  0% {
    background: #ffffff;
  }
  50% {
    background: #eff6ff;
  }
  100% {
    background: #ffffff;
  }
}
.dd-total-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.dd-total-num {
  font-size: 28px;
  font-weight: 700;
  color: #111827;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.dd-total-unread {
  font-size: 20px;
  font-weight: 700;
  color: #f59e0b;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.dd-total-cap {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 400;
  color: #6b7280;
}

/* ── 型1 分布行 h46 ── */
.pr-row {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  height: 46px;
  margin: 0 -20px;
  padding: 0 20px;
  cursor: pointer;
  outline: none;
}
.pr-row:hover {
  background: #f9fafb;
}
.pr-row:focus-visible {
  box-shadow: inset 0 0 0 2px #1a6fff;
}
.pr-top {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 18px;
}
.pr-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.pr-key {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
}
.pr-map {
  flex: none;
  height: 16px;
  padding: 2px 6px;
  border-radius: 3px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 10px;
  font-weight: 600;
  line-height: 12px;
}
.pr-gap {
  flex: 1;
}
.pr-val {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  font-variant-numeric: tabular-nums;
}
.pr-pct {
  font-size: 11px;
  font-weight: 400;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}
.pr-arrow {
  flex: none;
  width: 12px;
  font-size: 12px;
  color: #9ca3af;
  opacity: 0;
  transition: opacity 120ms linear;
}
.pr-row:hover .pr-arrow {
  opacity: 1;
  color: #1a6fff;
}
.pr-track {
  width: 440px;
  max-width: 100%;
  height: 8px;
  border-radius: 4px;
  background: #f3f4f6;
  overflow: hidden;
}
.pr-fill {
  height: 8px;
  border-radius: 4px;
  /* 入场 320ms 从左展开 */
  transition: width 320ms ease-out;
}

/* ── 合计行 h36 ── */
.dd-sum {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  margin-top: 4px;
  border-top: 1px solid #e5e7eb;
  font-size: 12px;
  color: #6b7280;
}
.dd-sum-label {
  flex: 1;
  font-weight: 500;
}
.dd-sum-val {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  font-variant-numeric: tabular-nums;
}
.dd-sum-warn {
  font-size: 12px;
  color: #ef4444;
  cursor: help;
}

/* ── 型2 筛选 chip h24 ── */
.pp-chips {
  display: flex;
  gap: 8px;
  margin: 4px 0 12px;
}
.pp-chip {
  height: 24px;
  padding: 0 10px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #f9fafb;
  color: #6b7280;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}
.pp-chip.on {
  background: #eff6ff;
  border-color: #1a6fff;
  color: #1a6fff;
  font-weight: 600;
}

/* ── 型2 表头 h28 + 人员行 h52 ── */
.pp-head,
.pp-row {
  display: grid;
  grid-template-columns: 1fr 88px 104px;
  align-items: center;
  margin: 0 -20px;
  padding: 0 20px;
}
.pp-head {
  height: 28px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
}
.pp-h-count {
  text-align: right;
}
.pp-h-op {
  text-align: right;
}
.pp-row {
  height: 52px;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  outline: none;
}
.pp-row:hover {
  background: #f9fafb;
}
.pp-row:focus-visible {
  box-shadow: inset 0 0 0 2px #1a6fff;
}
.pp-main {
  min-width: 0;
}
.pp-name-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.pp-name {
  font-size: 13px;
  font-weight: 500;
  color: #111827;
}
.pp-no {
  font-size: 10px;
  font-weight: 400;
  color: #9ca3af;
}
.pp-state {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 3px;
  font-size: 10px;
  font-weight: 400;
}
.pp-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.pp-count {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 4px;
  width: 88px;
  font-variant-numeric: tabular-nums;
}
.pp-count-total {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}
.pp-count-sep {
  font-size: 11px;
  color: #d1d5db;
}
.pp-count-unread {
  font-size: 13px;
  font-weight: 600;
  color: #f59e0b;
}
.pp-ops {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}
.pp-txtbtn {
  height: 24px;
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #1a6fff;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  cursor: pointer;
}
.pp-txtbtn:hover {
  background: #eff6ff;
}
/* R6：全表最多一个实心主按钮 */
.pp-solidbtn {
  height: 24px;
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: #1a6fff;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  cursor: pointer;
}
.pp-solidbtn:hover {
  opacity: 0.88;
}

/* ── 状态区（§2.4）── */
.dd-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 200px;
}
.dd-state-icon {
  font-size: 32px;
  color: #d1d5db;
}
.dd-state-err-icon {
  font-size: 16px;
  color: #ef4444;
}
.dd-state-title {
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
}
.dd-state-reason {
  font-size: 11px;
  font-weight: 400;
  color: #9ca3af;
}
.dd-linkbtn {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #1a6fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.dd-linkbtn:hover {
  background: #eff6ff;
}

/* ── 骨架屏：#F3F4F6，1.4s 呼吸 100%↔60% ── */
.sk {
  background: #f3f4f6;
  border-radius: 4px;
  animation: dd-breathe 1.4s ease-in-out infinite;
}
@keyframes dd-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}
.sk-total {
  height: 56px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}
.sk-num {
  width: 96px;
  height: 28px;
}
.sk-cap {
  width: 160px;
  height: 11px;
}
.sk-row {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  height: 46px;
}
.sk-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 18px;
}
.sk-label {
  width: 108px;
  height: 14px;
}
.sk-val {
  width: 56px;
  height: 14px;
}
.sk-bar {
  width: 440px;
  max-width: 100%;
  height: 8px;
  border-radius: 4px;
}

/* ── Footer ── */
.dd-foot {
  flex: none;
  height: 56px;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
}
.dd-footbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 32px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #ffffff;
  color: #374151;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.dd-footbtn:hover:not(:disabled) {
  border-color: #1a6fff;
  color: #1a6fff;
}
.dd-footbtn:disabled {
  color: #d1d5db;
  border-color: #e5e7eb;
  cursor: not-allowed;
}
.dd-footbtn-arrow {
  font-size: 11px;
}
</style>
