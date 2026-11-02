<script setup lang="ts">
// 智能分派后台页通用区块卡片：左蓝条标题 + 简短说明 + 右侧操作；内容区留白统一
defineProps<{ title?: string; sub?: string; flush?: boolean }>();
</script>

<template>
  <section class="dc-card" :class="{ flush }">
    <header v-if="title || $slots.extra" class="dc-hd">
      <span class="dc-title">{{ title }}</span>
      <span v-if="sub" class="dc-sub">{{ sub }}</span>
      <span v-if="$slots.extra" class="dc-extra"><slot name="extra" /></span>
    </header>
    <div class="dc-body"><slot /></div>
    <footer v-if="$slots.foot" class="dc-foot"><slot name="foot" /></footer>
  </section>
</template>

<style scoped>
.dc-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 20px; min-width: 0; }
.dc-hd { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-height: 24px; margin-bottom: 14px; }
.dc-title { font-size: 13px; font-weight: 600; color: #111827; padding-left: 10px; border-left: 3px solid #1a6fff; line-height: 16px; }
.dc-sub { font-size: 12px; color: #9ca3af; min-width: 0; }
.dc-extra { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dc-body { min-width: 0; }
.flush .dc-body { margin: 0 -20px; }
.dc-foot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; padding-top: 14px; border-top: 1px solid #f0f0f0; }
</style>
