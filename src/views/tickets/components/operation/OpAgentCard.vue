<script setup lang="ts">
import OpContactRows from './OpContactRows.vue';
import type { AgentInfo } from '@/views/tickets/types/operation';

defineProps<{ agent: AgentInfo }>();
const emit = defineEmits<{ contact: [type: 'call' | 'sms' | 'email', value: string] }>();
</script>

<template>
  <div class="side-card">
    <div class="card-title">代办人信息</div>
    <div class="kv">
      <span class="k">名称</span>
      <span class="v">{{ agent.name }}</span>
    </div>
    <div class="kv kv-contacts">
      <span class="k">联系方式</span>
      <OpContactRows :contacts="agent.contacts" @contact="(t, v) => emit('contact', t, v)" />
    </div>
    <div class="kv">
      <span class="k">关系</span>
      <span class="v">{{ agent.relation }}</span>
    </div>
  </div>
</template>

<style scoped>
.side-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 12px; display: flex; flex-direction: column; gap: 6px;
}
.card-title { font-size: 14px; font-weight: 700; color: #111827; }
.kv { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.kv .k { color: #9ca3af; flex: none; white-space: nowrap; }
.kv .v { color: #374151; font-weight: 500; min-width: 0; }
.kv-contacts { align-items: flex-start; }
</style>
