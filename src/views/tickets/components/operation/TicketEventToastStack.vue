<script setup lang="ts">
import { computed } from 'vue';
import { BellOutlined, MessageOutlined } from '@ant-design/icons-vue';
import type { TicketLiveToast } from '@/views/tickets/types/ticketLiveNotify';
import { TICKET_EVENT_NOTIFY_THEME as T } from '@/views/tickets/styles/ticketEventNotifyTheme';

const props = defineProps<{
  items: TicketLiveToast[];
  /** 嵌入客户全景卡片：顶框正中下滑，仅展示最新一条 */
  embedded?: boolean;
}>();

const emit = defineEmits<{
  dismiss: [id: string];
  click: [item: TicketLiveToast];
  'mark-read': [item: TicketLiveToast];
}>();

const visibleItems = computed(() => (props.embedded ? props.items.slice(0, 1) : props.items));
</script>

<template>
  <div
    v-if="visibleItems.length"
    id="toastWrap"
    class="ticket-notify-stack"
    :class="{ embedded }"
  >
      <article
        v-for="item in visibleItems"
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

        <!-- L4：操作 -->
        <footer class="ticket-notify__foot">
          <button
            type="button"
            class="ticket-notify__read-btn"
            @click.stop="emit('mark-read', item)"
          >标记已读</button>
        </footer>
      </article>
    </div>
</template>

<style scoped>
/*
 * 视觉章法（三层信息 × 一处语义色）：
 * 1. 容器永远中性白 —— 不整块染色，避免深浅打架
 * 2. 仅左侧色条 + 小徽章传递类型 —— 橙=催单紧迫，蓝=补充更新
 * 3. 字色三级递进 —— 标题 #111827 > 正文 #374151 > 来源/时间 #6B7280
 */

.ticket-notify-stack {
  position: absolute;
  top: 8px;
  right: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

/* 客户全景卡片内：自顶框正中向下滑入 */
.ticket-notify-stack.embedded {
  top: 0;
  left: 50%;
  right: auto;
  transform: translateX(-50%);
  z-index: 35;
  width: min(92%, 268px);
  gap: 0;
}

.ticket-notify {
  width: 300px;
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

.ticket-notify-stack.embedded .ticket-notify {
  position: relative;
  width: 100%;
  padding: 11px 10px 10px;
  border-radius: 0 0 8px 8px;
  border-top: none;
  box-shadow: 0 6px 16px rgba(124, 58, 237, 0.12), 0 2px 6px rgba(17, 24, 39, 0.06);
  animation: notify-drop-in 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.ticket-notify-stack.embedded .ticket-notify::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 40px;
  height: 3px;
  margin-left: -20px;
  border-radius: 0 0 3px 3px;
  background: #7c3aed;
}

.ticket-notify-stack.embedded .ticket-notify__head {
  margin-bottom: 4px;
}

.ticket-notify-stack.embedded .ticket-notify__title {
  font-size: 12px;
}

.ticket-notify-stack.embedded .ticket-notify__body {
  -webkit-line-clamp: 1;
}

.ticket-notify-stack.embedded .ticket-notify:hover {
  transform: none;
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

.ticket-notify__foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.ticket-notify__read-btn {
  padding: 2px 12px;
  height: 24px;
  border: 1px solid v-bind('T.border');
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  color: #1a6fff;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.ticket-notify__read-btn:hover {
  border-color: #1a6fff;
  background: #f5f9ff;
}

@keyframes notify-in {
  from {
    opacity: 0;
    transform: translateX(10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes notify-drop-in {
  from {
    opacity: 0;
    transform: translateY(-100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
