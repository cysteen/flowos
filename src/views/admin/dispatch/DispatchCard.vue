<script setup lang="ts">
// 智能分派后台页通用区块卡片：区块标题（15/600 + 蓝竖条）+ 简短说明 + 右侧操作；白底细边，内容区留白统一
defineProps<{ title?: string; sub?: string; flush?: boolean }>();
</script>

<template>
  <section class="dc-card" :class="{ flush }">
    <header v-if="title || $slots.extra" class="dc-hd">
      <span v-if="title" class="dc-title">{{ title }}</span>
      <span v-if="sub" class="dc-sub">{{ sub }}</span>
      <span v-if="$slots.extra" class="dc-extra"><slot name="extra" /></span>
    </header>
    <div class="dc-body"><slot /></div>
    <footer v-if="$slots.foot" class="dc-foot"><slot name="foot" /></footer>
  </section>
</template>

<style scoped>
/* 对齐 dispatch-config · section.block + b-title */
.dc-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; min-width: 0; }
.dc-hd { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-height: 24px; margin-bottom: 14px; }
.dc-title { font-size: 13px; font-weight: 600; color: #111827; padding-left: 10px; border-left: 3px solid #1a6fff; line-height: 1.4; flex: none; }
.dc-sub { font-size: 12px; font-weight: normal; color: #9ca3af; min-width: 0; }
.dc-extra { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dc-body { min-width: 0; }
.flush .dc-body { margin: 0 -20px; }
.dc-foot { display: flex; justify-content: flex-end; gap: 12px; margin-top: 14px; padding-top: 14px; border-top: 1px solid #eef0f3; }
</style>
