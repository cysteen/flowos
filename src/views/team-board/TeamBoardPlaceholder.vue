<script setup lang="ts">
import { DashboardOutlined } from '@ant-design/icons-vue';
import PlaceholderPage from '@/components/PlaceholderPage.vue';
</script>

<template>
  <PlaceholderPage
    title="班组看板"
    :icon="DashboardOutlined"
    description="占位页。班组长 / 租户管理员可见；其余角色侧栏隐藏，深链由路由守卫拦截。"
  />
</template>
