<script setup lang="ts">
import { RightOutlined } from '@ant-design/icons-vue';

defineProps<{
  product: {
    category: string;
    name: string;
    tags: string[];
    sn: string;
    issueTags: string[];
  };
}>();
</script>

<template>
  <div class="side-card">
    <div class="card-title">产品信息</div>
    <div class="kv">
      <span class="k">产品分类</span>
      <span class="v">{{ product.category }}</span>
    </div>
    <div class="kv kv-name">
      <span class="k">产品名称</span>
      <div class="kv-value-with-tags">
        <span class="v">{{ product.name }}</span>
        <span class="pill-tags">
          <span v-for="tag in product.tags" :key="tag" class="pill-tag">{{ tag }}</span>
        </span>
      </div>
    </div>
    <div class="kv">
      <span class="k">SN</span>
      <span class="v">{{ product.sn }}</span>
    </div>
    <div class="kv kv-tags">
      <span class="k">问题标签</span>
      <div class="tag-path">
        <template v-for="(tag, i) in product.issueTags" :key="tag">
          <span class="pill-tag">{{ tag }}</span>
          <RightOutlined v-if="i < product.issueTags.length - 1" class="arrow" />
        </template>
      </div>
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
.kv-tags { align-items: center; }
.kv-value-with-tags {
  display: flex; align-items: center; gap: 4px;
  flex: 1; min-width: 0; overflow: hidden;
}
.pill-tags { display: inline-flex; align-items: center; gap: 4px; flex-wrap: nowrap; overflow: hidden; }
.pill-tag {
  font-size: 10px; color: #374151; background: #f3f4f6;
  border-radius: 3px; padding: 2px 6px; flex: none;
}
.tag-path { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; flex: 1; min-width: 0; }
.arrow { color: #d1d5db; font-size: 12px; }
</style>
