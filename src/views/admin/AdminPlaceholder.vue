<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ToolOutlined } from '@ant-design/icons-vue';

const route = useRoute();
const title = computed(() => (route.meta.title as string) ?? '配置模块');
const prd = computed(() => (route.meta.prd as string) ?? '');
const group = computed(() => (route.meta.group as string) ?? '');
</script>

<template>
  <div class="admin-ph">
    <a-card :bordered="false" class="ph-card">
      <ToolOutlined class="ph-icon" />
      <div class="ph-title-row">
        <h2 class="ph-title">{{ title }}</h2>
        <a-tag color="processing">开发中</a-tag>
      </div>
      <p class="ph-desc">
        <template v-if="group">所属分组：{{ group }}　</template>
        <template v-if="prd">需求文档：{{ prd }}</template>
      </p>
      <p class="ph-note">本模块为管理后台 Phase B 待填充列表页，将按其 PRD 以统一「筛选卡 + 表格卡」模板实现。</p>
    </a-card>
  </div>
</template>

<style scoped>
.admin-ph {
  display: flex;
  justify-content: center;
  padding: 64px 24px;
  min-height: 100%;
}
.ph-card {
  width: 560px;
  max-width: 100%;
  text-align: center;
  border: 1px solid #f0f0f0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.ph-icon {
  font-size: 44px;
  color: #1a6fff;
  margin-bottom: 14px;
}
.ph-title-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.ph-title {
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
}
.ph-desc {
  margin-top: 12px;
  color: #6b7280;
}
.ph-note {
  margin-top: 8px;
  color: #9ca3af;
  font-size: 13px;
  line-height: 1.7;
}
</style>
