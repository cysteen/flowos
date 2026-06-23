<script setup lang="ts">
import OpContactRows from './OpContactRows.vue';
import AdaptiveTags from './AdaptiveTags.vue';

defineProps<{
  customer: {
    name: string;
    types: string[];
    gender: string;
    contacts: import('@/views/tickets/types/operation').ContactItem[];
    region: string;
    address: string;
  };
}>();

const emit = defineEmits<{ contact: [type: 'call' | 'sms' | 'email', value: string] }>();
</script>

<template>
  <div class="side-card">
    <div class="card-title">客户信息</div>
    <div class="kv kv-name">
      <span class="k">客户名称</span>
      <div class="kv-value-with-tags">
        <span class="v">{{ customer.name }}</span>
        <AdaptiveTags :tags="customer.types" />
      </div>
    </div>
    <div class="kv">
      <span class="k">客户性别</span>
      <span class="v">{{ customer.gender }}</span>
    </div>
    <div class="kv kv-contacts">
      <span class="k">联系方式</span>
      <OpContactRows :contacts="customer.contacts" @contact="(t, v) => emit('contact', t, v)" />
    </div>
    <div class="kv">
      <span class="k">省市区</span>
      <span class="v">{{ customer.region }}</span>
    </div>
    <div class="kv">
      <span class="k">详细地址</span>
      <span class="v">{{ customer.address }}</span>
    </div>
  </div>
</template>

<style scoped>
.side-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 14px; display: flex; flex-direction: column; gap: 8px;
}
.card-title { font-size: 14px; font-weight: 700; color: #111827; }
.kv { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.kv .k { color: #9ca3af; flex: none; white-space: nowrap; }
.kv .v { color: #374151; font-weight: 500; min-width: 0; }
.kv-name { align-items: center; }
.kv-contacts { align-items: flex-start; }
.kv-value-with-tags {
  display: flex; align-items: center; gap: 6px;
  flex: 1; min-width: 0; overflow: hidden;
}
</style>
