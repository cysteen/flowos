<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ToolOutlined } from '@ant-design/icons-vue';
import AdminSectionTabs from './components/AdminSectionTabs.vue';
import {
  SLA_NAV_ITEMS, RULES_NAV_ITEMS, isSlaNavKey, isRulesNavKey, adminNavActiveKey,
} from '@/config/adminNav';

const route = useRoute();
const activeKey = computed(() => adminNavActiveKey(route.path));
const title = computed(() => (route.meta.title as string) ?? '');
const prd = computed(() => (route.meta.prd as string) ?? '');
const v1Ref = computed(() => (route.meta.v1Ref as string) ?? '');
const sectionTabs = computed(() => {
  if (isSlaNavKey(activeKey.value)) return SLA_NAV_ITEMS;
  if (isRulesNavKey(activeKey.value)) return RULES_NAV_ITEMS;
  return [];
});
</script>

<template>
  <div class="engine-stub">
    <AdminSectionTabs v-if="sectionTabs.length" :items="sectionTabs" :active-key="activeKey" />
    <div class="stub-body">
      <a-card :bordered="false" class="ph-card">
        <ToolOutlined class="ph-icon" />
        <div class="ph-title-row">
          <h2 class="ph-title">{{ title }}</h2>
          <a-tag color="processing">待迁入 V1 交互</a-tag>
        </div>
        <p v-if="prd" class="ph-desc">需求文档：{{ prd }}</p>
        <p v-if="v1Ref && v1Ref !== '—'" class="ph-desc">V1 原型：{{ v1Ref }}</p>
        <p class="ph-note">侧栏与路由骨架已就绪；下一步从 V1 HTML 迁入本 Tab 页内能力。</p>
      </a-card>
    </div>
  </div>
</template>

<style scoped>
.engine-stub {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.stub-body {
  display: flex;
  justify-content: center;
  padding: 48px 24px;
  flex: 1;
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
  margin-top: 10px;
  color: #6b7280;
  font-size: 13px;
}
.ph-note {
  margin-top: 12px;
  color: #9ca3af;
  font-size: 13px;
  line-height: 1.7;
}
</style>
