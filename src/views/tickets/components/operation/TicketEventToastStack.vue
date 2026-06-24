<script setup lang="ts">
import { BellOutlined, MessageOutlined } from '@ant-design/icons-vue';
import type { TicketLiveToast } from '@/views/tickets/types/ticketLiveNotify';
import { TICKET_EVENT_NOTIFY_THEME as T } from '@/views/tickets/styles/ticketEventNotifyTheme';

defineProps<{
  items: TicketLiveToast[];
}>();

const emit = defineEmits<{
  dismiss: [id: string];
  click: [item: TicketLiveToast];
}>();
</script>

<template>
  <Teleport to="body">
    <div v-if="items.length" id="toastWrap" class="ticket-notify-stack">
      <article
        v-for="item in items"
        :key="item.id"
        class="ticket-notify"
        :class="item.type"
        role="alert"
        @click="emit('click', item)"
      >
        <!-- L1：类型标识 + 发生了什么 -->
        <header class="ticket-notify__head">
          <span class="ticket-notify__badge" aria-hidden="true">
            <MessageOutlined v-if="item.type === 'supplement'" />
            <BellOutlined v-else />
          </span>
          <h4 class="ticket-notify__title">{{ item.title }}</h4>
          <button
            type="button"
            class="ticket-notify__close"
            aria-label="关闭"
            @click.stop="emit('dismiss', item.id)"
          >
            ×
          </button>
        </header>

        <!-- L2：分类（补充）+ 谁 · 何时 -->
        <p class="ticket-notify__meta">
          <span
            v-if="item.type === 'supplement' && item.supplementType"
            class="ticket-notify__category-tag"
          >{{ item.supplementType }}</span>
          <span class="ticket-notify__who">{{ item.who }}</span>
          <span class="ticket-notify__sep">·</span>
          <time class="ticket-notify__when">{{ item.when }}</time>
        </p>

        <!-- L3：具体内容 -->
        <p class="ticket-notify__body">{{ item.content }}</p>
      </article>
    </div>
  </Teleport>
</template>

<style scoped>
/*
 * 视觉章法（三层信息 × 一处语义色）：
 * 1. 容器永远中性白 —— 不整块染色，避免深浅打架
 * 2. 仅左侧色条 + 小徽章传递类型 —— 橙=催单紧迫，蓝=补充更新
 * 3. 字色三级递进 —— 标题 #111827 > 正文 #374151 > 来源/时间 #6B7280
 */

.ticket-notify-stack {
  position: fixed;
  left: 20px;
  bottom: 84px;
  z-index: 1100;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  pointer-events: none;
}

.ticket-notify {
  width: 320px;
  padding: 12px 12px 12px 14px;
  border: 1px solid v-bind('T.border');
  border-left: 3px solid transparent;
  border-radius: 8px;
  background: v-bind('T.surface');
  box-shadow: v-bind('T.shadow');
  pointer-events: auto;
  cursor: pointer;
  animation: notify-in 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.ticket-notify:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.1);
}

.ticket-notify.urge {
  border-left-color: v-bind('T.urge.accent');
}

.ticket-notify.supplement {
  border-left-color: v-bind('T.supplement.accent');
}

.ticket-notify__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 6px;
}

.ticket-notify__badge {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.ticket-notify.urge .ticket-notify__badge {
  background: v-bind('T.urge.iconBg');
  color: v-bind('T.urge.icon');
}

.ticket-notify.supplement .ticket-notify__badge {
  background: v-bind('T.supplement.iconBg');
  color: v-bind('T.supplement.icon');
}

.ticket-notify__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: v-bind('T.text.title');
  line-height: 1.35;
}

.ticket-notify__close {
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: v-bind('T.text.muted');
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.ticket-notify__close:hover {
  background: #f3f4f6;
  color: #374151;
}

.ticket-notify__meta {
  margin: 0 0 4px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: v-bind('T.text.meta');
}

.ticket-notify__category-tag {
  flex: none;
  margin-right: 2px;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: v-bind('T.supplement.icon');
  background: v-bind('T.supplement.iconBg');
}

.ticket-notify__who {
  font-weight: 500;
  color: v-bind('T.text.body');
}

.ticket-notify__sep {
  margin: 0 4px;
  color: #d1d5db;
}

.ticket-notify__when {
  font-variant-numeric: tabular-nums;
}

.ticket-notify__body {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: v-bind('T.text.body');
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@keyframes notify-in {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
