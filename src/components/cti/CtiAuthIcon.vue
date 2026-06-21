<script setup lang="ts">
/** 签入/签出图标 —— 1:1 对齐 iFLY-FlowOS-坐席视角.pen · V5SOcH / xXJ0d */
withDefaults(
  defineProps<{ kind: 'sign-in' | 'sign-out'; size?: number }>(),
  { size: 18 },
);
</script>

<template>
  <svg
    class="cti-auth-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      v-if="kind === 'sign-in'"
      d="M12 3a8.5 8.5 0 1 1 0 18m-9.5-9h8.5m-4-3.5l4 3.5-4 3.5"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      v-else
      d="M12 3a8.5 8.5 0 1 0 0 18m9.5-9h-8.5m4-3.5l-4 3.5 4 3.5"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.cti-auth-icon { flex: none; display: block; }
</style>
