<script setup lang="ts">
import { CustomerServiceOutlined } from '@ant-design/icons-vue';
import PlaceholderPage from '@/components/PlaceholderPage.vue';
</script>

<template>
  <PlaceholderPage
    title="工单工作台"
    :icon="CustomerServiceOutlined"
    badge="Prompt 2 实现"
    description="框架占位页。Prompt 2 将在此实现 PRD-02：多视图 Tab、AI 建议条、状态筛选、SLA 富列表、批量操作、新建工单弹窗（PRD-04）。"
  >
    <a-typography-text type="secondary">
      路由 /flowos/tickets 已注册并作为默认 landing。
    </a-typography-text>
  </PlaceholderPage>
</template>
