<script setup lang="ts">
import { ToolOutlined } from '@ant-design/icons-vue';
import PlaceholderPage from '@/components/PlaceholderPage.vue';
</script>

<template>
  <PlaceholderPage
    title="售后工作台"
    :icon="ToolOutlined"
    description="占位页。售后·二线坐席可见；客服坐席（agent-cs）侧栏隐藏，深链访问由路由守卫拦截。"
  />
</template>
