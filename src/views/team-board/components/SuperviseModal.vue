<script lang="ts">
/**
 * 班组长看板 · 督办弹窗（实现规格 §四）
 *
 * 动作定位（§4.0 七维度）——本组件的行为依据：
 *  · 是否算响应：❌ 不算，不写 markResponded、不停首响钟
 *  · 状态迁移：**无**，主/子状态与处理人均不变
 *  · SLA 影响：**不变**（不暂停/不重置/不延期）→ 顶部提示必须明写「督办不影响 SLA 计时」
 *  · 前置校验：8 状态白名单 + 须有处理人 + **同一工单对同一处理人 24h 内仅可督办 1 次** + 至少 1 种方式 + 自定义文案非空
 *  · 后置动作：IM 必发给当前处理人，邮件可选；**不触发对客消息**（故不提供短信，D7/D8 短信仅对客）
 *
 * 壳复用全站统一的 `OpActionModal`（tone=warn 徽标 #FFF7ED/#EA580C，**okTone 仍为 primary**，
 * 因为督办可逆、非破坏性）；页脚走 a-modal 原生 footer，禁止自绘。
 *
 * ⚠️ 交叉裁决 X2：非风格规范色一律不用。hover 底一律 `#F9FAFB`。
 */

/** 督办弹窗工单行（覆盖规格 §4.1 表格 6 列） */
export interface SuperviseTicket {
  id: string;
  /** 工单号 */
  no: string;
  /** 客户名（文案占位符 ${customer} 用） */
  customer: string;
  /** 当前处理人（督办对象恒为工单当前处理人，无候选选择） */
  assignee: string;
  assigneeId?: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  /** 剩余时间（分钟）；负数 = 已超时 */
  slaLeftMin: number;
  /** 已督办展示文本，如「2h 前 · 张经理」；无记录则留空 */
  supervisedText?: string;
  /** 距最近一次督办的小时数；< 24 即命中 24h 去重 */
  supervisedHoursAgo?: number;
}

/** 提交结果行（部分失败态由父级回填，见组件 defineExpose） */
export interface SuperviseResultRow {
  id: string;
  ok: boolean;
  /** 失败原因：工单状态已变更 / IM 通道异常 / 处理人无 i讯飞映射 */
  reason?: string;
  /** 通道分别失败：IM 成功、邮件失败 → 仍判成功，只挂橙字备注，不进重试集合 */
  channelNote?: string;
}

export type SuperviseChannel = 'im' | 'email';

export interface SuperviseSubmitPayload {
  ticketIds: string[];
  /** 恒含 'im'（IM 默认选中且禁用取消） */
  channels: SuperviseChannel[];
  contentMode: 'template' | 'custom';
  /** contentMode = template 时有值 */
  templateKey?: string;
  /** 渲染后的最终文案（模板模式为占位符已替换的首张示例） */
  content: string;
  ccSelf: boolean;
  /** 合并为一条通知（消息风暴开关，默认 on） */
  mergeNotify: boolean;
  /** true = 本次是「重试失败项」 */
  isRetry: boolean;
}

/** 24 小时去重窗口（§4.0 前置校验③，去重键 工单号+处理人+日） */
export const SUPERVISE_DEDUP_HOURS = 24;
</script>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  FieldTimeOutlined,
} from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';

const PRIORITY_COLOR: Record<string, string> = {
  P0: '#EF4444',
  P1: '#F59E0B',
  P2: '#1A6FFF',
  P3: '#9CA3AF',
};

/** 消息风暴阈值：与指派弹窗 §3.1 同一规则 */
const STORM_THRESHOLD = 10;

const CUSTOM_MAX = 200;

/** 「2 小时内超时」的临期窗口（分钟），与顶部提示文案一致 */
const NEAR_DUE_MIN = 120;

/**
 * IM 模板。规格说候选来自消息中心（同 `notifyTemplates.ts` 机制），
 * 原型阶段先用本地常量占位，接口/模板中心就位后替换。
 * 占位符：${no} ${customer} ${agent} ${slaLeft}
 */
const IM_TEMPLATES = [
  {
    value: 'sla-due',
    label: 'SLA 临期督办',
    content:
      '【督办】工单 ${no}（客户 ${customer}）SLA 剩余 ${slaLeft}，请 ${agent} 尽快跟进并回填处理进展。本次督办不影响 SLA 计时。',
  },
  {
    value: 'urge-repeat',
    label: '客户多次催单督办',
    content:
      '【督办】工单 ${no}（客户 ${customer}）客户已多次催单，请 ${agent} 优先处理并主动联系客户，剩余 ${slaLeft}。',
  },
  {
    value: 'overdue',
    label: '已超时督办',
    content:
      '【督办】工单 ${no}（客户 ${customer}）已超时，请 ${agent} 立即处理并说明延迟原因（剩余 ${slaLeft}）。',
  },
];

/* ============================== Props / Emits ============================== */

const props = defineProps<{
  open: boolean;
  tickets: SuperviseTicket[];
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  submit: [payload: SuperviseSubmitPayload];
}>();

/* ============================== 状态 ============================== */

const selectedIds = ref<string[]>([]);
/** IM（i讯飞）默认选中且禁用取消 —— 对内主通道 D4/D5，此值恒为 true */
const channelIm = ref(true);
const channelEmail = ref(false);
const contentMode = ref<'template' | 'custom'>('template');
const templateKey = ref<string>(IM_TEMPLATES[0].value);
const customText = ref('');
const ccSelf = ref(false);
const mergeNotify = ref(true);
const submitting = ref(false);
const flashTickets = ref(false);
const scrollRef = ref<HTMLElement | null>(null);

/** 部分失败态：非空即进入结果态，弹窗不关闭 */
const results = ref<SuperviseResultRow[]>([]);

/** 命中 24h 去重 → 不可勾选 */
function isDeduped(t: SuperviseTicket) {
  return t.supervisedHoursAgo !== undefined && t.supervisedHoursAgo < SUPERVISE_DEDUP_HOURS;
}

function reset() {
  // 列表**默认全部勾选**（督办场景默认全催），命中 24h 去重的除外
  selectedIds.value = props.tickets.filter((t) => !isDeduped(t)).map((t) => t.id);
  channelIm.value = true;
  channelEmail.value = false;
  contentMode.value = 'template';
  templateKey.value = IM_TEMPLATES[0].value;
  customText.value = '';
  ccSelf.value = false;
  mergeNotify.value = true;
  submitting.value = false;
  results.value = [];
}

watch(
  () => props.open,
  (v) => {
    if (v) reset();
  },
  { immediate: true },
);

/* ============================== 列表 ============================== */

/** 排序**固定「剩余时间 ↑」不可改** —— 督办的唯一有效序（规格 §4.1） */
const sortedTickets = computed(() => [...props.tickets].sort((a, b) => a.slaLeftMin - b.slaLeftMin));

const resultMap = computed(() => {
  const m = new Map<string, SuperviseResultRow>();
  results.value.forEach((r) => m.set(r.id, r));
  return m;
});

const isResultMode = computed(() => results.value.length > 0);
const failedIds = computed(() => results.value.filter((r) => !r.ok).map((r) => r.id));
const successCount = computed(() => results.value.filter((r) => r.ok).length);
const allFailed = computed(() => isResultMode.value && successCount.value === 0);

/** 结果态下成功行也锁定（与指派弹窗一致） */
function isRowLocked(t: SuperviseTicket) {
  if (isDeduped(t)) return true;
  return isResultMode.value && resultMap.value.get(t.id)?.ok === true;
}

const selectableIds = computed(() =>
  sortedTickets.value.filter((t) => !isRowLocked(t)).map((t) => t.id),
);

/** 全部工单均命中 24h 去重 → okText disabled + 灰字提示（§4.2.4） */
const allDeduped = computed(
  () => props.tickets.length > 0 && props.tickets.every((t) => isDeduped(t)),
);

const allChecked = computed(
  () => selectableIds.value.length > 0 && selectableIds.value.every((id) => selectedIds.value.includes(id)),
);
const someChecked = computed(() => selectedIds.value.length > 0 && !allChecked.value);

function toggleAll(checked: boolean) {
  selectedIds.value = checked ? [...selectableIds.value] : [];
}

function toggleRow(t: SuperviseTicket) {
  if (isRowLocked(t)) return;
  const i = selectedIds.value.indexOf(t.id);
  if (i >= 0) selectedIds.value.splice(i, 1);
  else selectedIds.value.push(t.id);
}

function openTicket(t: SuperviseTicket, ev: MouseEvent) {
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

/** 剩余时间徽章：已超时/≤30min 红；30min–2h 橙；>2h 中性 */
function leftBadge(min: number) {
  if (min < 0) return { text: `超时 ${fmtMin(-min)}`, color: '#EF4444', bg: '#EF444422' };
  if (min <= 30) return { text: fmtMin(min), color: '#EF4444', bg: '#EF444422' };
  if (min <= NEAR_DUE_MIN) return { text: fmtMin(min), color: '#F59E0B', bg: '#F59E0B22' };
  return { text: fmtMin(min), color: '#6B7280', bg: '#9CA3AF22' };
}

/** 红色行左加 4px 色条 */
function isCritical(min: number) {
  return min <= 30;
}

const nearDueCount = computed(() => props.tickets.filter((t) => t.slaLeftMin <= NEAR_DUE_MIN).length);

/* ============================== 文案 ============================== */

const selectedCount = computed(() => selectedIds.value.length);

/** 批量时预览首张，并标「以第 1 张为例，共 N 条」 */
const sampleTicket = computed(() => {
  const first = sortedTickets.value.find((t) => selectedIds.value.includes(t.id));
  return first ?? sortedTickets.value[0];
});

const currentTemplate = computed(
  () => IM_TEMPLATES.find((t) => t.value === templateKey.value) ?? IM_TEMPLATES[0],
);

/** 占位符 ${no} ${customer} ${agent} ${slaLeft} 按实际值渲染 */
function renderPlaceholders(raw: string) {
  const t = sampleTicket.value;
  if (!t) return raw;
  return raw
    .replace(/\$\{no\}/g, t.no)
    .replace(/\$\{customer\}/g, t.customer)
    .replace(/\$\{agent\}/g, t.assignee)
    .replace(/\$\{slaLeft\}/g, leftBadge(t.slaLeftMin).text);
}

const templatePreview = computed(() => renderPlaceholders(currentTemplate.value.content));

/** 最终提交的文案 */
const finalContent = computed(() =>
  contentMode.value === 'template' ? templatePreview.value : renderPlaceholders(customText.value),
);

/* ============================== 消息风暴 ============================== */

const showStorm = computed(() => selectedCount.value >= STORM_THRESHOLD);

/** 目标处理人去重数（提示「通知已发送给 N 名处理人」的口径） */
const assigneeCount = computed(
  () => new Set(sortedTickets.value.filter((t) => selectedIds.value.includes(t.id)).map((t) => t.assignee)).size,
);

/* ============================== 校验 / 提交 ============================== */

const okText = computed(() => {
  if (isResultMode.value) return allFailed.value ? '重试' : `重试失败项（${failedIds.value.length}）`;
  return `确认督办（${selectedCount.value}）`;
});

const okDisabled = computed(() => {
  if (isResultMode.value) return failedIds.value.length === 0;
  if (allDeduped.value) return true;
  return selectedCount.value === 0;
});

function flashTicketArea() {
  flashTickets.value = true;
  window.setTimeout(() => {
    flashTickets.value = false;
  }, 600);
}

function validate(): boolean {
  if (selectedCount.value === 0) {
    message.warning('请至少选择 1 张工单');
    flashTicketArea();
    return false;
  }
  if (!channelIm.value && !channelEmail.value) {
    message.warning('请选择至少一种督办方式');
    return false;
  }
  if (contentMode.value === 'custom' && !customText.value.trim()) {
    message.warning('请填写督办文案');
    nextTick(() => {
      document.querySelector<HTMLTextAreaElement>('.sv-editor textarea')?.focus();
    });
    return false;
  }
  return true;
}

function buildPayload(ids: string[], isRetry: boolean): SuperviseSubmitPayload {
  const channels: SuperviseChannel[] = [];
  if (channelIm.value) channels.push('im');
  if (channelEmail.value) channels.push('email');
  return {
    ticketIds: ids,
    channels,
    contentMode: contentMode.value,
    templateKey: contentMode.value === 'template' ? templateKey.value : undefined,
    content: finalContent.value,
    ccSelf: ccSelf.value,
    mergeNotify: mergeNotify.value,
    isRetry,
  };
}

function onOk() {
  if (isResultMode.value) {
    if (!failedIds.value.length) return;
    emit('submit', buildPayload([...failedIds.value], true));
    return;
  }
  if (!validate()) return;
  emit('submit', buildPayload([...selectedIds.value], false));
}

function close() {
  emit('update:open', false);
}

/* ============================== 对父级暴露的结果态控制 ============================== */
/**
 * 与指派弹窗同构：父级 setSubmitting(true) → 接口返回 → applyResults(rows)。
 * 「通道分别失败」（IM 成功 / 邮件失败）请回填 { ok:true, channelNote:'邮件未送达' }，
 * 该行判成功、不进重试集合。
 */
function setSubmitting(v: boolean) {
  submitting.value = v;
}

function applyResults(rows: SuperviseResultRow[]) {
  submitting.value = false;
  results.value = rows;
  selectedIds.value = rows.filter((r) => !r.ok).map((r) => r.id);
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
    title="督办工单"
    :icon="ClockCircleOutlined"
    tone="warn"
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
    <div class="op-form sv">
      <!-- 副标题：OpActionModal 标题槽只收一行文案，副标题落在正文首行 -->
      <div class="sv-sub">已选 {{ selectedCount }} 张 · 通知当前处理人</div>

      <!-- 结果态提示 -->
      <div v-if="isResultMode" class="op-tip" :class="allFailed ? 'sv-tip-danger' : 'op-tip-warn'">
        <template v-if="allFailed">全部失败，共 {{ failedIds.length }} 张未督办成功，可重试</template>
        <template v-else>成功 {{ successCount }} 张，失败 {{ failedIds.length }} 张</template>
      </div>

      <!-- 顶部提示：必须写明「督办不影响 SLA 计时」 -->
      <div v-else class="op-tip sv-tip-warn">
        <FieldTimeOutlined class="sv-tip-icon" />
        <span>
          本组 {{ nearDueCount }} 张工单将在 2 小时内超时，<b>督办不影响 SLA 计时</b>。
        </span>
      </div>

      <!-- ============ 工单列表 ============ -->
      <div class="op-field">
        <div class="sv-tools">
          <div class="sv-tools-l">
            <a-checkbox
              :checked="allChecked"
              :indeterminate="someChecked"
              :disabled="selectableIds.length === 0"
              @change="(e: any) => toggleAll(e.target.checked)"
            >
              <span class="sv-label-req">督办工单</span>
            </a-checkbox>
            <span class="sv-count">已选 {{ selectedCount }} / 共 {{ tickets.length }}</span>
          </div>
          <!-- 排序固定「剩余时间 ↑」，不提供切换 -->
          <span class="sv-sort-fixed">剩余时间 ↑</span>
        </div>

        <div ref="scrollRef" class="sv-scroll" :class="{ flash: flashTickets }">
          <div class="sv-thead" :class="{ res: isResultMode }">
            <div class="c-chk"></div>
            <div class="c-no">工单号</div>
            <div class="c-agent">处理人</div>
            <div class="c-pri">优先级</div>
            <div class="c-left">剩余时间</div>
            <div class="c-sup">已督办</div>
            <div v-if="isResultMode" class="c-res">结果</div>
          </div>

          <div
            v-for="t in sortedTickets"
            :key="t.id"
            class="sv-trow"
            :class="{ res: isResultMode, critical: isCritical(t.slaLeftMin), locked: isRowLocked(t) }"
            :data-row-id="t.id"
            @click="toggleRow(t)"
          >
            <div class="c-chk" @click.stop>
              <a-tooltip v-if="isDeduped(t)" title="24 小时内已督办">
                <a-checkbox :checked="false" disabled />
              </a-tooltip>
              <a-checkbox
                v-else
                :checked="selectedIds.includes(t.id)"
                :disabled="isRowLocked(t)"
                @change="toggleRow(t)"
              />
            </div>
            <div class="c-no">
              <a class="sv-no" @click="openTicket(t, $event)">{{ t.no }}</a>
            </div>
            <div class="c-agent sv-ellipsis">{{ t.assignee }}</div>
            <div class="c-pri">
              <span class="sv-pri" :style="{ color: PRIORITY_COLOR[t.priority] }">{{ t.priority }}</span>
            </div>
            <div class="c-left">
              <span
                class="sv-badge"
                :style="{ color: leftBadge(t.slaLeftMin).color, background: leftBadge(t.slaLeftMin).bg }"
              >
                {{ leftBadge(t.slaLeftMin).text }}
              </span>
            </div>
            <div class="c-sup sv-ellipsis" :class="t.supervisedText ? 'has' : 'none'">
              {{ t.supervisedText || '—' }}
            </div>
            <div v-if="isResultMode" class="c-res">
              <template v-if="resultMap.get(t.id)?.ok">
                <CheckCircleFilled class="sv-res-ok" />
                <span v-if="resultMap.get(t.id)?.channelNote" class="sv-res-note">
                  {{ resultMap.get(t.id)?.channelNote }}
                </span>
                <span v-else class="sv-res-ok-t">成功</span>
              </template>
              <template v-else-if="resultMap.get(t.id)">
                <CloseCircleFilled class="sv-res-fail" />
                <span class="sv-res-fail-t" :title="resultMap.get(t.id)?.reason">
                  {{ resultMap.get(t.id)?.reason || '失败' }}
                </span>
              </template>
              <span v-else class="sv-res-none">—</span>
            </div>
          </div>

          <div v-if="sortedTickets.length === 0" class="sv-empty">暂无待督办工单</div>
        </div>

        <!-- §4.2.4 全部命中 24h 去重 -->
        <div v-if="allDeduped" class="sv-dedup-hint">所选工单 24 小时内均已督办</div>
      </div>

      <!-- ============ 督办方式 ============ -->
      <div class="op-field">
        <div class="op-label req">督办方式</div>
        <div class="sv-channels">
          <!-- IM 为对内主通道（D4/D5），默认选中且禁用取消 -->
          <a-tooltip title="IM 为对内主通道，必发，不可取消">
            <a-checkbox :checked="true" disabled>IM（i讯飞）</a-checkbox>
          </a-tooltip>
          <a-checkbox v-model:checked="channelEmail">邮件</a-checkbox>
        </div>
        <!-- 不提供短信：短信仅对客（D7/D8），督办不触发对客消息 -->
        <div v-if="channelEmail" class="sv-hint">邮件送达约 1–3 分钟，适合离线坐席</div>
      </div>

      <!-- ============ 文案方式 ============ -->
      <div class="op-field">
        <div class="op-label req">督办文案</div>
        <div class="op-radio-cards op-radio-cards--row">
          <div
            class="op-radio-card sv-card"
            :class="{ on: contentMode === 'template' }"
            @click="contentMode = 'template'"
          >
            <a-radio :checked="contentMode === 'template'" />
            <div>
              <div class="op-rc-title">使用模板</div>
              <div class="op-rc-sub">来自消息中心 IM 模板</div>
            </div>
          </div>
          <div
            class="op-radio-card sv-card"
            :class="{ on: contentMode === 'custom' }"
            @click="contentMode = 'custom'"
          >
            <a-radio :checked="contentMode === 'custom'" />
            <div>
              <div class="op-rc-title">自定义文案</div>
              <div class="op-rc-sub">上限 {{ CUSTOM_MAX }} 字</div>
            </div>
          </div>
        </div>

        <a-select
          v-if="contentMode === 'template'"
          v-model:value="templateKey"
          class="sv-select"
          :options="IM_TEMPLATES"
        />

        <div class="sv-editor">
          <!-- 模板模式只读预览；自定义模式可编辑 -->
          <a-textarea
            v-if="contentMode === 'template'"
            :value="templatePreview"
            class="sv-readonly"
            :rows="4"
            readonly
          />
          <a-textarea
            v-else
            v-model:value="customText"
            :rows="4"
            :maxlength="CUSTOM_MAX"
            placeholder="填写督办文案，支持占位符 ${no} ${customer} ${agent} ${slaLeft}"
          />
          <div class="sv-editor-foot">
            <span v-if="selectedCount > 1 && sampleTicket" class="sv-sample">
              以第 1 张（{{ sampleTicket.no }}）为例，共 {{ selectedCount }} 条
            </span>
            <span v-else></span>
            <span v-if="contentMode === 'custom'" class="sv-counter">
              {{ customText.length }}/{{ CUSTOM_MAX }}
            </span>
          </div>
        </div>
      </div>

      <!-- ============ 抄送（只做「抄送我本人」，不做「抄送上级」，见风险 R5） ============ -->
      <div class="op-field sv-cc">
        <a-switch v-model:checked="ccSelf" size="small" />
        <span class="sv-cc-t">抄送我本人</span>
      </div>

      <!-- ============ 消息风暴（选中 ≥10 张） ============ -->
      <div v-if="showStorm" class="op-tip op-tip-warn sv-storm">
        <div class="sv-storm-t">
          本次将向 {{ assigneeCount }} 名处理人发送 <b>{{ selectedCount }} 条</b> IM 通知（当前无消息合并能力）
        </div>
        <div class="sv-storm-sw">
          <a-switch v-model:checked="mergeNotify" size="small" />
          <span>合并为一条通知</span>
        </div>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.sv { gap: 12px; }

.sv-sub { font-size: 11px; color: #9ca3af; line-height: 1.4; margin-top: -2px; }

/* 规格 §4.1 顶部提示：底 #FFF7ED 字 #EA580C，比全局 .op-tip-warn 更暖一档 */
.sv-tip-warn {
  display: flex; align-items: flex-start; gap: 8px;
  background: #fff7ed; color: #ea580c; border: 1px solid #fed7aa;
}
.sv-tip-icon { font-size: 14px; line-height: 18px; flex: none; }
.sv-tip-warn b { font-weight: 700; }
.sv-tip-danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

/* ---------- 工具行 ---------- */
.sv-tools {
  display: flex; align-items: center; justify-content: space-between;
  min-height: 28px; gap: 12px;
}
.sv-tools-l { display: flex; align-items: center; gap: 10px; min-width: 0; }
.sv-label-req { font-size: 13px; color: #374151; font-weight: 500; }
.sv-label-req::before { content: '* '; color: #ef4444; }
.sv-count { font-size: 12px; color: #6b7280; font-variant-numeric: tabular-nums; }
/* 排序不可改 —— 呈现为静态文本而非可点控件 */
.sv-sort-fixed { font-size: 12px; color: #9ca3af; cursor: default; user-select: none; }

/* ---------- 工单表 ---------- */
.sv-scroll {
  max-height: 220px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
.sv-scroll.flash { animation: sv-flash 600ms ease-in-out; }
@keyframes sv-flash {
  0%, 100% { border-color: #e5e7eb; box-shadow: none; }
  25%, 75% { border-color: #ef4444; box-shadow: 0 0 0 2px #ef444422; }
}

.sv-thead,
.sv-trow {
  display: grid;
  grid-template-columns: 32px 96px 72px 48px 80px minmax(56px, 1fr);
  align-items: center;
  min-width: 384px;
}
.sv-thead.res,
.sv-trow.res {
  grid-template-columns: 32px 96px 72px 48px 80px minmax(56px, 1fr) 128px;
  min-width: 512px;
}
.sv-thead {
  position: sticky; top: 0; z-index: 2;
  height: 30px; padding: 0 10px 0 14px;
  background: #f3f4f6;
  font-size: 11px; font-weight: 600; color: #6b7280;
}
.sv-trow {
  position: relative;
  min-height: 36px; padding: 0 10px 0 14px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 12px; color: #374151;
  cursor: pointer;
}
.sv-trow:last-child { border-bottom: none; }
.sv-trow:hover { background: #f9fafb; }
.sv-trow.locked { cursor: default; }
.sv-trow.locked:hover { background: transparent; }
/* 红色行左加 4px 色条 */
.sv-trow.critical::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0;
  width: 4px; background: #ef4444;
}

.sv-thead > div,
.sv-trow > div { padding-right: 6px; min-width: 0; }
.sv-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sv-no { color: #1a6fff; cursor: pointer; }
.sv-no:hover { text-decoration: underline; }
.sv-pri { font-weight: 600; font-variant-numeric: tabular-nums; }
.sv-badge {
  display: inline-block; padding: 2px 6px; border-radius: 3px;
  font-size: 10px; font-weight: 600; white-space: nowrap;
}
.c-sup { font-size: 11px; font-weight: 400; }
.c-sup.has { color: #ea580c; }
.c-sup.none { color: #9ca3af; }
.sv-empty { padding: 26px 0; text-align: center; font-size: 12px; color: #9ca3af; }
.sv-dedup-hint { font-size: 11px; color: #9ca3af; margin-top: 2px; }

.c-res { display: flex; align-items: center; gap: 4px; overflow: hidden; }
.sv-res-ok { color: #10b981; font-size: 12px; }
.sv-res-ok-t { color: #10b981; font-size: 11px; }
/* 通道分别失败：判成功，只挂橙字 */
.sv-res-note { color: #ea580c; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sv-res-fail { color: #ef4444; font-size: 12px; flex: none; }
.sv-res-fail-t {
  color: #ef4444; font-size: 11px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sv-res-none { color: #d1d5db; }

/* ---------- 督办方式 ---------- */
.sv-channels { display: flex; align-items: center; gap: 20px; }
.sv-hint { font-size: 11px; color: #9ca3af; }

/* ---------- 文案 ---------- */
.sv-card { min-height: 56px; align-items: center; }
.sv-select { width: 100%; margin-top: 2px; }
.sv-editor { display: flex; flex-direction: column; gap: 4px; }
.sv-editor :deep(textarea.ant-input) { min-height: 88px; }
/* 模板模式：只读预览 底 #F9FAFB 字 #6B7280 */
.sv-readonly :deep(textarea),
.sv-readonly { background: #f9fafb !important; color: #6b7280 !important; }
.sv-editor-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sv-sample { font-size: 11px; color: #9ca3af; }
.sv-counter { font-size: 11px; color: #9ca3af; margin-left: auto; }

/* ---------- 抄送 ---------- */
.sv-cc { flex-direction: row; align-items: center; gap: 8px; }
.sv-cc-t { font-size: 12px; color: #374151; }

/* ---------- 消息风暴 ---------- */
.sv-storm { display: flex; flex-direction: column; gap: 8px; }
.sv-storm-t b { font-weight: 700; }
.sv-storm-sw { display: flex; align-items: center; gap: 8px; font-size: 12px; }
</style>
