<script setup lang="ts">
import { computed } from 'vue';
import { CheckOutlined } from '@ant-design/icons-vue';
import { useUserStore } from '@/stores/user';
import {
  getOutboundNumbersForTeam,
  resolveAgentTeamKey,
  OUTBOUND_NONE_ID,
  OUTBOUND_NONE_OPTION,
  type OutboundNumberOption,
} from '@/mock/outboundNumbers';

defineProps<{ selectedId?: string }>();
const emit = defineEmits<{ select: [entry: OutboundNumberOption] }>();

const user = useUserStore();
const options = computed(() => getOutboundNumbersForTeam(resolveAgentTeamKey(user.roleKey)));
</script>

<template>
  <div class="phone-book">
    <div class="pb-cap">外显号码</div>

    <div class="pb-list">
      <button
        type="button"
        class="pb-row pb-row-none"
        :class="{ on: selectedId === OUTBOUND_NONE_ID }"
        @click="emit('select', OUTBOUND_NONE_OPTION)"
      >
        <div class="pb-row-main">
          <span class="pb-number">不指定</span>
          <span class="pb-remark muted">默认外显</span>
        </div>
        <CheckOutlined v-if="selectedId === OUTBOUND_NONE_ID" class="pb-check" />
      </button>

      <button
        v-for="entry in options"
        :key="entry.id"
        type="button"
        class="pb-row"
        :class="{ on: entry.id === selectedId }"
        @click="emit('select', entry)"
      >
        <div class="pb-row-main">
          <span class="pb-number">{{ entry.number }}</span>
          <span class="pb-remark" :class="{ muted: !entry.remark }">
            {{ entry.remark || '未设置备注' }}
          </span>
        </div>
        <CheckOutlined v-if="entry.id === selectedId" class="pb-check" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.phone-book {
  width: 152px;
  flex: none;
  padding: 6px 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-family: inherit;
}
.pb-cap {
  font-size: 10px;
  color: #9ca3af;
  font-weight: 600;
}
.pb-list {
  max-height: 280px;
  overflow-y: auto;
  margin: 0 -2px;
  padding: 0 2px;
}
.pb-list::-webkit-scrollbar {
  width: 4px;
}
.pb-list::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}
.pb-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 5px 4px;
  margin: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s;
}
.pb-row:hover {
  background: #f3f4f6;
}
.pb-row.on {
  background: #ecfdf5;
  border-color: #a7f3d0;
}
.pb-row-none .pb-number {
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
  color: #6b7280;
}
.pb-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pb-number {
  font-size: 11px;
  font-weight: 600;
  color: #111827;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.2px;
}
.pb-remark {
  font-size: 10px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pb-remark.muted {
  color: #9ca3af;
}
.pb-check {
  flex: none;
  font-size: 11px;
  color: #059669;
}
</style>
