<script setup lang="ts">
import { computed } from 'vue';
import { useUserStore } from '@/stores/user';
import { CopyOutlined, FlagOutlined } from '@ant-design/icons-vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import { PRIORITY_COLOR, softBg, csEntryAvailability, type Priority, type TicketStatus } from '@/views/tickets/types/ticket';
import OpSlaBar from './OpSlaBar.vue';
import OpAftersaleLinkCard from './OpAftersaleLinkCard.vue';
import { isAftersaleSettled } from '../../composables/opActions';
import { buildEscalateVerdict, isTicketTerminated } from '../../composables/complaintEscalation';
import { buildTicketRelations, type TicketRelation } from '../../composables/ticketRelations';
import OpRelationList from './OpRelationList.vue';
import OpSupersededBanner from './OpSupersededBanner.vue';

const props = defineProps<{
  detail: TicketDetailMeta;
  ticketNo: string;
  /**
   * **整页锁死**：本单已被新单接管（已转单）/ 只读角色（运营监控岗）。
   * ⚠️ **一线视角不走这条** —— 一线视角锁的是**底栏的二线流转动作**，
   * 头部这一排（升级投诉 / 关联售后 / 新建补充 / 催单 / 取消工单）**一线本来就有权限**：
   * 升级投诉一线可升非投诉单、取消工单是一线专属、催补是一线主动作。
   * 把一线视角接到 readonly 上会把整排按钮误置灰。
   */
  readonly?: boolean;
  /**
   * 客户侧两枚（新建补充 / 催单）是否展示 —— 按角色给（PRD-830 §4.1）：
   * 新建补充＝一线 + 二线；催单＝一线唯一；三线 / 班组长 / 投诉处理角色两枚都不展示。
   * ⚠️ 它们**不跟着 readonly 置灰**：一线视角虽然锁流转，但这两枚正是一线的主动作。
   * 真正会锁住它们的只有「已转单」（单已作废）与只读角色，见 customerEntryLocked。
   */
  canSupplement?: boolean;
  canDunning?: boolean;
  /**
   * 同排另三枚的角色门控（基线「动作 × 角色」表）：
   * - 升级投诉 / 关联售后：二线 · 班组长 · 投诉处理角色 · 管理员，一线也可
   * - **取消工单：一线专属** —— 二线及以上整枚不展示
   */
  canEscalateComplaint?: boolean;
  canLinkAftersale?: boolean;
  canCancelTicket?: boolean;
  /** 客户侧录入被锁：已转单 / 只读角色。一线视角**不**锁 */
  customerEntryLocked?: boolean;
  /** 已转单：业务转至新单，表头收束为只读提示 + 前往新单 */
  supersededBy?: TicketRelation | null;
}>();

const READONLY_TIP = '本单已被新单接管并锁定，请在新单上处理';

/**
 * 终态（基线 §1 六个：已解决 / 非常规关闭 / 已强结 / 已转单 / 已取消 / 已结案）：
 * **不再展示「取消工单」**——取消是对"在跑的单"的终止动作，对已经终止的单没有意义（PRD §5.6.3 ②）。
 */
const isTerminal = computed(() => isTicketTerminated(props.detail.status));

/** 委派中：升级投诉/关联售后/取消工单 同属转出或终结类，一并锁定 */
const delegateLocked = computed(() => !!props.detail.delegateInfo);
const DELEGATE_LOCK_TIP = '工单委派中，协办完成后可操作';

/**
 * 升级投诉入口：全类型展示，可用性按投诉阶层判定（《【815】关联投诉 PRD》§3.2/§4.2）——
 * 非投诉、低阶投诉（人员/业务）可升级；外投为终态，入口置灰并引导走「新建补充」。
 */
// 同上：升级判定认发起人角色
const user = useUserStore();
const escalateVerdict = computed(() => buildEscalateVerdict(props.detail, user.roleKey));
// 升级投诉的可用性：整页锁死 / 委派中 / 阶层判定（一线在非投诉单上可升，见 815 §3.3）
const escalateDisabled = computed(() => props.readonly || delegateLocked.value || !escalateVerdict.value.entryEnabled);
const escalateTip = computed(() => {
  if (props.readonly) return READONLY_TIP;
  if (delegateLocked.value) return DELEGATE_LOCK_TIP;
  return escalateVerdict.value.entryTip;
});

/**
 * 已转出（转售后，客服侧完全冻结）：**催补两枚都不给**（PRD-830 §4.2 / §7.3、基线 ※6）。
 * 引导改由「已转售后」芯片的 hover 提示承担 —— 单在售后手上，客服既推不动也答不了；
 * 给了按钮就得回答"点了写在哪"，写原单没人看、建子单等于两边各处理一半。
 */
const isTransferredOut = computed(() => /已转出/.test(props.detail.status));

/**
 * 催补两枚的**状态门控**（PRD-830 §4.2）——与角色门控（canSupplement / canDunning）
 * **同时生效**，任一不通过即不展示。
 * 终态只留补充；草稿 / 已转出 / 已结案 / 已取消 两枚都不给。
 */
const csAvail = computed(() => csEntryAvailability(props.detail.status as TicketStatus));
const showSupplement = computed(() => props.canSupplement && csAvail.value.supplement);
const showDunning = computed(() => props.canDunning && csAvail.value.dunning);

/** 已有 1:1 关联售后单 → 「关联售后」封口，hover 出卡片跳售后系统（D2 改写） */
const linkedAftersale = computed(() => {
  const la = props.detail.linkedAftersale;
  if (!la) return null;
  return { ...la, settled: isAftersaleSettled(la.status) };
});

const metaTitle = computed(
  () =>
    `建单人：${props.detail.builderShort}，建单时间：${props.detail.createdAtFull}，期望解决：${props.detail.expectedResolve}，单号：${props.ticketNo}`,
);

const emit = defineEmits<{
  copyNo: [];
  action: [name: string];
  openRelation: [rel: TicketRelation];
  openSuperseded: [];
}>();

const isSuperseded = computed(() => !!props.supersededBy);

/**
 * 关联关系芯片：贴在单号右边——坐席确认"我在哪张单"时视线本来就在那儿。
 * 无关联则整枚不出现，不占位。详细清单同时常驻右栏（Freshdesk 口径）。
 */
const relations = computed(() => buildTicketRelations(props.detail));

/** 状态 → 语义色（对齐 STATUS_TONE：进行中=橙、完成=绿、中性=灰、异常=红） */
function statusHex(s: string): string {
  // 已转单/已转出＝业务转到别的单上（非正常关闭），用紫与"已关闭灰"区分开
  if (/已转单|已转出/.test(s)) return '#7C3AED';
  if (/已解决|已完成|已结案|已结单|完成/.test(s)) return '#10B981';
  if (/挂起|已关闭|撤销|取消|终止/.test(s)) return '#6B7280';
  if (/升级/.test(s)) return '#A855F7';
  if (/逾期|超时|异常|驳回|失败/.test(s)) return '#EF4444';
  if (/处理中|受理|待|审核|进行/.test(s)) return '#F59E0B';
  return '#1A6FFF';
}
/** 淡底标签样式（颜色=语义，避免厚重实底/红色滥用） */
function tagStyle(hex: string) {
  return { color: hex, background: softBg(hex) };
}
function priorityHex(p: string): string {
  return PRIORITY_COLOR[p as Priority] ?? '#9CA3AF';
}
</script>

<template>
  <div class="op-header" :class="{ 'is-superseded': isSuperseded }">
    <div class="oh-left" :class="{ 'oh-left--stamped': isSuperseded }">
      <span
        v-if="isSuperseded"
        class="status-stamp"
        aria-label="已转单"
      >已转单</span>
      <div class="oh-left-body">
        <div class="title-row">
          <span
            v-if="!isSuperseded"
            class="badge"
            :style="tagStyle(statusHex(detail.status))"
          >
            <span class="badge-dot" :style="{ background: statusHex(detail.status) }" />{{ detail.status }}
          </span>
          <span class="badge badge-neutral">{{ detail.type }}</span>
          <span class="badge" :style="tagStyle(priorityHex(detail.priority))">
            <FlagOutlined />{{ detail.priority }}
          </span>
          <span class="oh-title">{{ detail.title }}</span>
        </div>
        <div class="meta-row" :title="metaTitle">
        <span class="meta-text">
          <span class="meta-k">建单人</span>：{{ detail.builderShort }}<span class="meta-sep">，</span>
          <span class="meta-k">建单时间</span>：{{ detail.createdAtFull }}<span class="meta-sep">，</span>
          <span class="meta-k">期望解决</span>：{{ detail.expectedResolve }}<span class="meta-sep">，</span>
          <span class="meta-k">单号</span>：{{ ticketNo }}
        </span>
        <CopyOutlined class="copy" @click="emit('copyNo')" />
        <a-popover v-if="relations.length" placement="bottomLeft" trigger="hover">
          <template #content>
            <div class="rel-pop">
              <div class="rel-pop-title">关联关系</div>
              <OpRelationList :relations="relations" compact @open="emit('openRelation', $event)" />
            </div>
          </template>
          <span class="rel-chip">⧉ 关联 {{ relations.length }}</span>
        </a-popover>
        </div>
      </div>
    </div>
    <div class="oh-right">
      <OpSlaBar :detail="detail" />
      <OpSupersededBanner
        v-if="supersededBy"
        :by="supersededBy"
        @open="emit('openSuperseded')"
      />
      <div v-else class="oh-actions">
        <!--
          升级投诉：原单升级为更高阶投诉（关原单 + 同步信息建新单 + 双向关联）。
          外投为投诉终态，入口置灰并提示改走「新建补充」
        -->
        <button
          v-if="canEscalateComplaint"
          type="button"
          class="action-btn"
          :disabled="escalateDisabled"
          :title="escalateTip"
          @click="emit('action', '升级投诉')"
        >升级投诉</button>
        <!--
          已有 1:1 关联售后单时「关联售后」置灰（不建第二张单），
          改为 hover 出售后单卡片：状态可见、工单地址可点跳售后系统操作
        -->
        <a-popover
          v-if="canLinkAftersale && detail.type === '投诉'"
          :trigger="linkedAftersale ? 'hover' : []"
          placement="bottomRight"
        >
          <template #content>
            <OpAftersaleLinkCard
              v-if="linkedAftersale"
              :no="linkedAftersale.no"
              :status="linkedAftersale.status"
              :service-type="linkedAftersale.serviceType"
              :settled="linkedAftersale.settled"
            />
          </template>
          <span class="btn-slot">
            <button
              type="button"
              class="action-btn"
              :disabled="readonly || delegateLocked || !!linkedAftersale"
              :title="readonly ? READONLY_TIP : (delegateLocked ? DELEGATE_LOCK_TIP : undefined)"
              @click="emit('action', '关联售后')"
            >关联售后</button>
          </span>
        </a-popover>
        <!--
          已转出：催补两枚**都不展示**，改挂一枚「已转售后」芯片，
          hover 出售后单卡片（单号 + 状态 ｜ 服务类型 ｜「补充与催单请点开工单号，在售后系统中操作」），
          点单号直接跳售后系统（一线有该权限）。PRD-830 §7.3
        -->
        <a-popover
          v-if="isTransferredOut && linkedAftersale"
          trigger="hover"
          placement="bottomRight"
        >
          <template #content>
            <OpAftersaleLinkCard
              :no="linkedAftersale.no"
              :status="linkedAftersale.status"
              :service-type="linkedAftersale.serviceType"
              :settled="linkedAftersale.settled"
            />
          </template>
          <span class="as-chip">⇄ 已转售后 {{ linkedAftersale.no }}</span>
        </a-popover>
        <button
          v-if="showSupplement"
          type="button"
          class="action-btn"
          :disabled="customerEntryLocked"
          :title="customerEntryLocked ? READONLY_TIP : undefined"
          @click="emit('action', '新建补充')"
        >新建补充</button>
        <button
          v-if="showDunning"
          type="button"
          class="action-btn"
          :disabled="customerEntryLocked"
          :title="customerEntryLocked ? READONLY_TIP : undefined"
          @click="emit('action', '催单')"
        >催单</button>
        <button
          v-if="canCancelTicket && !isTerminal"
          type="button"
          class="action-btn action-btn--danger"
          :disabled="readonly || delegateLocked"
          :title="readonly ? READONLY_TIP : (delegateLocked ? DELEGATE_LOCK_TIP : undefined)"
          @click="emit('action', '取消工单')"
        >取消工单</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.op-header {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; padding: 8px 20px; border-bottom: 1px solid #e5e7eb;
}
.op-header.is-superseded {
  background: linear-gradient(180deg, #fffbeb 0%, #fff 72%);
  border-bottom-color: #fde68a;
}
.op-header.is-superseded .oh-title {
  color: #374151;
}
.oh-left {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.oh-left--stamped {
  min-height: 44px;
  padding-left: 2px;
}
.oh-left-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-height: 24px;
  min-width: 0;
}
.op-header.is-superseded .title-row {
  flex-wrap: nowrap;
}
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600;
  border-radius: 4px; padding: 0 8px; flex: none; height: 24px;
}
.badge-neutral { color: #6b7280; background: #f3f4f6; }
.badge-dot {
  width: 6px; height: 6px; border-radius: 50%;
}
/* 已转单：圆形戳章，叠盖在第一行标题 + 第二行 meta 上方 */
.status-stamp {
  position: absolute;
  left: 0;
  top: 50%;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border: 2px double #7c3aed;
  border-radius: 50%;
  color: #7c3aed;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1.05;
  text-align: center;
  transform: translateY(-50%) rotate(-12deg);
  background: rgba(255, 251, 235, 0.82);
  box-shadow: 0 1px 6px rgba(124, 58, 237, 0.18);
  user-select: none;
  pointer-events: none;
}
.oh-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.3;
}
.meta-text {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta-k {
  color: #6b7280;
  font-weight: 600;
}
.meta-sep {
  color: #d1d5db;
}
.copy { cursor: pointer; font-size: 13px; flex: none; }
.rel-chip {
  flex: none; cursor: pointer;
  font-size: 11px; font-weight: 600; line-height: 18px;
  padding: 0 7px; border-radius: 4px;
  color: #4f46e5; background: #eef2ff; border: 1px solid #e0e7ff;
}
.rel-chip:hover { background: #e0e7ff; }
.copy:hover { color: #6b7280; }

.oh-right { display: flex; align-items: center; gap: 12px; flex: none; }
.oh-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.action-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  color: #1a6fff;
  background: #fff;
  border: 1.5px solid #93c5fd;
  border-radius: 6px;
  cursor: pointer;
  flex: none;
  font-family: inherit;
  white-space: nowrap;
  appearance: none;
  box-shadow: 0 1px 2px rgba(26, 111, 255, 0.1);
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.action-btn:disabled {
  color: #9ca3af;
  background: #f9fafb;
  border-color: #e5e7eb;
  box-shadow: none;
  cursor: not-allowed;
}
/* popover 需要一个能接鼠标事件的宿主——disabled 按钮本身不触发 hover */
/* 已转售后芯片：替代催补两枚按钮的引导位（PRD-830 §7.3）。紫＝转到别处，与「已转单」同族 */
.as-chip {
  display: inline-flex; align-items: center; flex: none;
  height: 28px; padding: 0 10px;
  font-size: 12px; font-weight: 600; line-height: 28px;
  color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 4px;
  cursor: default;
}
.btn-slot { display: inline-flex; }

.action-btn:not(:disabled):hover {
  background: #eff6ff;
  border-color: #1a6fff;
  box-shadow: 0 2px 8px rgba(26, 111, 255, 0.18);
}
.action-btn--danger {
  color: #dc2626;
  background: #fef2f2;
  border-color: #fecaca;
  box-shadow: 0 1px 2px rgba(220, 38, 38, 0.1);
}
.action-btn--danger:not(:disabled):hover {
  color: #b91c1c;
  background: #fee2e2;
  border-color: #f87171;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.18);
}
</style>
