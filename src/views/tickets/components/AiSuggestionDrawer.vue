<script setup lang="ts">
import { computed } from 'vue';
import {
  ArrowUpOutlined,
  LinkOutlined,
  FrownOutlined,
} from '@ant-design/icons-vue';
import type { Ticket } from '@/views/tickets/types/ticket';
import {
  AI_FILTER_CHIPS,
  AI_KIND_META,
  type AiSuggestion,
  type AiSuggestionFilter,
  type AiSuggestionSummary,
} from '@/views/tickets/types/aiSuggestion';
import { PRIORITY_COLOR, SLA_COLOR } from '@/views/tickets/types/ticket';

const props = defineProps<{
  open: boolean;
  suggestions: AiSuggestion[];
  summary: AiSuggestionSummary;
  tickets: Ticket[];
  filter: AiSuggestionFilter;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  'update:filter': [v: AiSuggestionFilter];
  viewTicket: [s: AiSuggestion];
  primaryAction: [s: AiSuggestion];
}>();

const kindIcon = {
  upgrade: ArrowUpOutlined,
  similar: LinkOutlined,
  emotion: FrownOutlined,
} as const;

const filtered = computed(() => {
  if (props.filter === 'all') return props.suggestions;
  return props.suggestions.filter((s) => s.kind === props.filter);
});

function ticketOf(s: AiSuggestion): Ticket | undefined {
  return props.tickets.find((t) => t.id === s.ticketId);
}

function chipCount(key: AiSuggestionFilter): number {
  if (key === 'all') return props.summary.total;
  return props.summary[key];
}

function chipActive(key: AiSuggestionFilter): boolean {
  return props.filter === key;
}
</script>

<template>
  <a-drawer
    :open="open"
    :title="`今日 AI 建议 (${summary.total})`"
    placement="right"
    :width="520"
    @update:open="emit('update:open', $event)"
  >
    <div class="drawer-body">
      <div class="filter-chips">
        <div
          v-for="chip in AI_FILTER_CHIPS"
          :key="chip.key"
          class="filter-chip"
          :class="{ active: chipActive(chip.key) }"
          @click="emit('update:filter', chip.key)"
        >
          {{ chip.label }}
          <span class="chip-num">{{ chipCount(chip.key) }}</span>
        </div>
      </div>

      <div v-if="filtered.length === 0" class="empty">
        该分类下暂无待处理建议
      </div>

      <div v-else class="suggestion-list">
        <div v-for="s in filtered" :key="s.id" class="suggestion-card">
          <div class="card-head">
            <div class="kind-badge" :style="{ color: AI_KIND_META[s.kind].color }">
              <component :is="kindIcon[s.kind]" />
              <span>{{ AI_KIND_META[s.kind].label }}</span>
            </div>
            <template v-if="ticketOf(s)">
              <span
                class="priority-dot"
                :style="{ background: PRIORITY_COLOR[ticketOf(s)!.priority] }"
              />
              <span class="priority-text">{{ ticketOf(s)!.priority }}</span>
              <span
                class="sla-pill"
                :style="{
                  color: SLA_COLOR[ticketOf(s)!.slaState],
                  background: SLA_COLOR[ticketOf(s)!.slaState] + '1A',
                }"
              >
                {{ ticketOf(s)!.slaText }}
              </span>
            </template>
          </div>

          <template v-if="ticketOf(s)">
            <div class="ticket-line">
              <span class="ticket-no" @click="emit('viewTicket', s)">{{ ticketOf(s)!.no }}</span>
              <span class="ticket-title">{{ ticketOf(s)!.title }}</span>
            </div>
            <div class="reason">{{ s.reason }}</div>
            <div v-if="s.matchedNo" class="match-box">
              <span class="match-label">参考工单</span>
              <span class="match-no">{{ s.matchedNo }}</span>
              <span v-if="s.matchedSummary" class="match-summary">{{ s.matchedSummary }}</span>
            </div>
            <div class="card-actions">
              <a-button size="small" @click="emit('viewTicket', s)">查看工单</a-button>
              <a-button type="primary" size="small" @click="emit('primaryAction', s)">
                {{ AI_KIND_META[s.kind].action }}
              </a-button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </a-drawer>
</template>

<style scoped>
.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 13px;
  color: #6b7280;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.15s;
}
.filter-chip.active {
  color: #1a6fff;
  background: #eff6ff;
  border-color: #1a6fff;
  font-weight: 600;
}
.chip-num {
  font-size: 12px;
  color: #9ca3af;
}
.filter-chip.active .chip-num {
  color: #1a6fff;
}
.empty {
  padding: 48px 16px;
  text-align: center;
  font-size: 13px;
  color: #9ca3af;
}
.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.suggestion-card {
  padding: 14px 16px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.kind-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 700;
}
.priority-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: auto;
}
.priority-text {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.sla-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}
.ticket-line {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
}
.ticket-no {
  font-size: 12px;
  font-weight: 600;
  color: #1a6fff;
  cursor: pointer;
}
.ticket-no:hover {
  text-decoration: underline;
}
.ticket-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  line-height: 1.4;
}
.reason {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
  margin-bottom: 8px;
}
.match-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  margin-bottom: 10px;
  background: #eff6ff;
  border-radius: 6px;
  font-size: 12px;
}
.match-label {
  color: #9ca3af;
}
.match-no {
  color: #1a6fff;
  font-weight: 600;
}
.match-summary {
  color: #6b7280;
}
.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
