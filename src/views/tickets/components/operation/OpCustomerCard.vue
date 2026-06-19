<script setup lang="ts">
import { computed } from 'vue';
import OpContactRows from './OpContactRows.vue';

const props = defineProps<{
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

const MAX_TYPE_TAGS = 4;
const visibleTypes = computed(() => props.customer.types.slice(0, MAX_TYPE_TAGS));
const typeOverflow = computed(() => Math.max(0, props.customer.types.length - MAX_TYPE_TAGS));
</script>

<template>
  <div class="side-card">
    <div class="card-title">客户信息</div>
    <div class="kv kv-name">
      <span class="k">客户名称</span>
      <div class="kv-value-with-tags">
        <span class="v">{{ customer.name }}</span>
        <span class="pill-tags">
          <span v-for="t in visibleTypes" :key="t" class="pill-tag">{{ t }}</span>
          <span v-if="typeOverflow > 0" class="pill-tag">+{{ typeOverflow }}</span>
        </span>
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
.pill-tags { display: inline-flex; align-items: center; gap: 4px; flex-wrap: nowrap; overflow: hidden; }
.pill-tag {
  font-size: 10px; color: #374151; background: #f3f4f6;
  border-radius: 3px; padding: 2px 6px; flex: none;
}
</style>
