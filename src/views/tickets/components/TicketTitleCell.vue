<script setup lang="ts">
import {
  isDunningTagPending,
  isSupplementTagPending,
  isMentionUnread,
  statusStyle,
  ticketStatusDisplayName,
  type Ticket,
} from '@/views/tickets/types/ticket';
import { ticketListSourceLabel } from '@/views/tickets/types/createTicket';

withDefaults(
  defineProps<{
    ticket: Ticket;
    highlightMentionUnread?: boolean;
    /**
     * 第二行（渠道 · 单号 · 关联标 · 行尾插槽）放不下时**允许换行**，
     * 让「已升级为 / 升级自 〈单号〉」那枚关联标**整枚掉到下一行**，而不是被单元格硬切。
     *
     * 🔴 **为什么是换行而不是继续裁**：关联标的正文**就是一个工单号**，与本行的单号同类。
     * `.rel-tag` 是 `flex: none`（不收缩），被 `.title-line2 { overflow: hidden }` 切时
     * 连省略号都不留，「已升级为 IFLYTS-20260709-00001」会切成「已升级为 IFLYTS-202」——
     * **半个单号会被读成另一张单，比整枚不显示更糟**。换行一个字都不丢。
     *
     * 🔴 **为什么做成可选而不是全局默认**：开了之后那一行会变高（第二行占两行），
     * 而**工单列表的行高节奏是另一件事**，不在本轮范围 —— 所以不给就是现状，
     * 既有调用方（`TicketRichList.vue`）行为一格不变。
     *
     * 当前只有 `RiskReportPoolPanel.vue` 那一处传它。
     */
    line2Wrap?: boolean;
  }>(),
  { highlightMentionUnread: false, line2Wrap: false },
);

const emit = defineEmits<{ clickNo: [ticket: Ticket] }>();

function dunningTagLabel(): string {
  return '催';
}

function supplementTagLabel(): string {
  return '补';
}

function dunningTagTip(t: Ticket): string {
  return isDunningTagPending(t) ? '被催办 · 待联系回话' : '已催 · 已联系';
}

function supplementTagTip(t: Ticket): string {
  return isSupplementTagPending(t) ? '新补充 · 待联系回话' : '已补 · 已联系';
}

const csTagTipOverlayWrap = { maxWidth: '340px' };
const csTagTipOverlayInner = {
  maxWidth: '340px',
  color: '#713f12',
  fontSize: '12px',
  lineHeight: '1.6',
  padding: '10px 12px',
};
</script>

<template>
  <div class="cell-title">
    <a-popover trigger="hover" placement="rightTop" :mouse-enter-delay="0.2">
      <div class="title-cell-inner">
        <div class="title-line1">
          <a-tooltip
            v-if="ticket.hasDunning"
            :title="dunningTagTip(ticket)"
            placement="top"
            :mouse-enter-delay="0.15"
            color="#fffbeb"
            :overlay-style="csTagTipOverlayWrap"
            :overlay-inner-style="csTagTipOverlayInner"
          >
            <span
              class="cs-tag"
              :class="isDunningTagPending(ticket) ? 'cs-tag--dunning-pending' : 'cs-tag--dunning-done'"
              @click.stop
            >
              {{ dunningTagLabel() }}
            </span>
          </a-tooltip>
          <a-tooltip
            v-if="ticket.hasSupplement"
            :title="supplementTagTip(ticket)"
            placement="top"
            :mouse-enter-delay="0.15"
            color="#fffbeb"
            :overlay-style="csTagTipOverlayWrap"
            :overlay-inner-style="csTagTipOverlayInner"
          >
            <span
              class="cs-tag"
              :class="isSupplementTagPending(ticket) ? 'cs-tag--supplement-pending' : 'cs-tag--supplement-done'"
              @click.stop
            >
              {{ supplementTagLabel() }}
            </span>
          </a-tooltip>
          <span
            class="status-tag"
            :style="statusStyle(ticket.nodeStatus)"
            :title="ticketStatusDisplayName(ticket)"
          >{{ ticketStatusDisplayName(ticket) }}</span>
          <span class="tag">{{ ticket.type }}</span>
          <span
            class="title-text"
            :class="{ unread: highlightMentionUnread && isMentionUnread(ticket) }"
          >{{ ticket.title }}</span>
          <span v-if="highlightMentionUnread && isMentionUnread(ticket)" class="unread-tag">未读</span>
        </div>
        <div class="title-line2" :class="{ 'title-line2--wrap': line2Wrap }">
          <span class="channel">{{ ticketListSourceLabel(ticket) }}</span>
          <span class="sep">·</span>
          <span class="ticket-no" @click.stop="emit('clickNo', ticket)">{{ ticket.no }}</span>
          <span v-if="ticket.escalatedToNo" class="rel-tag rel-tag--to">已升级为 {{ ticket.escalatedToNo }}</span>
          <span v-else-if="ticket.escalatedFromNo" class="rel-tag rel-tag--from">升级自 {{ ticket.escalatedFromNo }}</span>
          <!--
            调用方挂在**第二行行尾**的额外小标（当前用于工单列表的风险侧行内标：
            风险等级 / 报备中 / 建议 N，见 `TicketRichList.vue`）。
            本行的顺序即渠道 · 单号 · 关联标 · 本插槽，风险标恒在最右。

            🔴 **落点在第二行**（2026-09-28 改，原方案挂在第一行行尾）：第一行已有
            催 / 补、状态、类型、标题，再往行尾塞三枚标只剩标题在缩，标题是这一格的正文。

            🔴 **被挤时压缩的是本插槽，不是单号**：单号是这一格唯一的点击入口，必须完整显示。
            实现 = 本行只有这一个可缩项 —— `.channel` / `.sep` / `.ticket-no` / `.rel-tag`
            全是 `flex: none`（flex-shrink:0，一格不让），而下面的 `.line2-extra`
            是 `flex: 0 1 auto; min-width: 0; overflow: hidden`：宽度不够时 flex 只找得到
            它来收，收到 0 为止，里面那几枚标（各自 `flex: none` 不变形）**整段被裁切**，
            读不全的是风险标而不是单号。裁切优于缩小：缩到一半的标读不出是哪一档。

            于是**不换行态（默认）**的优先级是：
            **单号完整 ＞ 关联标完整 ＞ `.line2-extra` 先收到 0 ＞ 关联标被行尾硬切**。
            🔴 末一档是**缺陷不是设计**：`.rel-tag` 不收缩又被 `overflow: hidden` 切，
            连省略号都不留，半个单号会被读成另一张单（见 `line2Wrap` 那段说明）。
            **`line2Wrap` 开着时这一档不再发生** —— 关联标不再是可裁项，整枚换到下一行；
            可缩的**仍只有** `.line2-extra`（它若也放不下，先换行、再在自己那行里收）。

            不传插槽内容时下面的包裹节点不渲染，行高与既有布局一字不变
            （`RiskReportPoolPanel.vue` 那处调用不传，故完全不受影响）。
          -->
          <span v-if="$slots['line2-extra']" class="line2-extra">
            <slot name="line2-extra" :ticket="ticket" />
          </span>
        </div>
      </div>
      <template #content>
        <div class="title-pop">
          <div class="tp-head">
            <span class="status-tag" :style="statusStyle(ticket.nodeStatus)">{{ ticketStatusDisplayName(ticket) }}</span>
            <span class="tag">{{ ticket.type }}</span>
          </div>
          <div class="tp-title">{{ ticket.title }}</div>
          <div class="tp-meta">{{ ticketListSourceLabel(ticket) }} · {{ ticket.no }}</div>
          <div v-if="ticket.escalatedToNo" class="tp-rel">已升级为 {{ ticket.escalatedToNo }}</div>
          <div v-else-if="ticket.escalatedFromNo" class="tp-rel">升级自 {{ ticket.escalatedFromNo }}</div>
        </div>
      </template>
    </a-popover>
  </div>
</template>

<style scoped>
.cell-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}
.cell-title > :deep(.ant-popover-open),
.cell-title > :deep(span.ant-popover-open) {
  display: block;
  width: 100%;
  min-width: 0;
}
.title-cell-inner { width: 100%; min-width: 0; cursor: default; }
.title-line1 { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; overflow: hidden; }
.title-line1 :deep(.ant-tooltip) { flex: none; line-height: 1; }
.title-line2 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
.title-line2 .rel-tag {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
/*
  🔴 可选换行态（prop `line2Wrap`，当前只有 `RiskReportPoolPanel.vue` 那一处传）。
  只加 `flex-wrap: wrap` 一句就够：本行所有项（`.channel` / `.sep` / `.ticket-no`
  / `.rel-tag`）都是 `flex: none`，flex 换行**先断行、后收缩**，于是放不下时
  「已升级为 〈单号〉」那枚关联标**整枚换到下一行**，不再被 `overflow: hidden`
  切成半截单号。`.line2-extra` 仍是唯一可缩项（先换行，再在自己那行里收）。
  行距沿用本行既有的 `gap: 6px`（与 `.cell-title` 里第一行↔第二行同一个值），
  不另设 `row-gap`。`align-items: center` 在换行态下按**每行各自**居中，照旧。
  `overflow: hidden` 保留：换行后横向已不溢出，它只作兜底。
*/
.title-line2--wrap {
  flex-wrap: wrap;
}
/*
  第二行行尾插槽的包裹节点 —— 本行**唯一的可缩项**（见模板里那段说明）。
  `flex: 0 1 auto` 而不是 `flex: none`：同行的渠道 / 单号 / 关联标全是 flex:none，
  故宽度不够时 flex 只能从这里收，单号与关联标一格不动。
  `min-width: 0` + `overflow: hidden` ＝ 收到 0 也不把里面的标撑出去，整段裁切。
*/
.title-line2 .line2-extra {
  flex: 0 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  overflow: hidden;
}
.status-tag {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  max-width: 108px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  color: #4b5563;
  background: #f3f4f6;
  flex: none;
}
.title-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.title-text.unread { color: #1a6fff; }
.unread-tag {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  background: #ef4444;
  border-radius: 3px;
  padding: 0 4px;
  line-height: 16px;
}
.channel { font-size: 12px; color: #6b7280; flex: none; }
.sep { font-size: 12px; color: #d1d5db; flex: none; }
.ticket-no { font-size: 12px; font-weight: 500; color: #1a6fff; cursor: pointer; flex: none; }
.ticket-no:hover { text-decoration: underline; }
.rel-tag {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 4px;
}
.rel-tag--to { color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; }
.rel-tag--from { color: #4f46e5; background: #eef2ff; border: 1px solid #e0e7ff; }
.cs-tag {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  font-size: 11px;
  font-weight: 600;
  line-height: 14px;
  min-width: 16px;
  height: 16px;
  padding: 0 2px;
  border-radius: 3px;
  white-space: nowrap;
  cursor: default;
  flex-shrink: 0;
}
.cs-tag--dunning-pending,
.cs-tag--supplement-pending {
  color: #dc2626;
  background: #fee2e2;
  border: 1px solid #ef4444;
  font-weight: 700;
}
.cs-tag--dunning-done,
.cs-tag--supplement-done {
  color: #9ca3af;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  font-weight: 500;
  padding: 0 2px;
  min-width: 16px;
}
</style>

<style>
.title-pop { width: 320px; display: flex; flex-direction: column; gap: 6px; }
.title-pop .tp-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.title-pop .tp-title { font-size: 13px; font-weight: 600; color: #111827; line-height: 1.5; word-break: break-word; }
.title-pop .tp-meta { font-size: 12px; color: #6b7280; }
.title-pop .tp-rel { font-size: 11px; font-weight: 600; color: #7c3aed; }
</style>
