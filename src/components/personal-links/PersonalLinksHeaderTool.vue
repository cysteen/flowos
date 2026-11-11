<script setup lang="ts">
import { ref } from 'vue';
import { LinkOutlined } from '@ant-design/icons-vue';
import PersonalLinksSection from './PersonalLinksSection.vue';

const open = ref(false);
</script>

<template>
  <a-popover
    v-model:open="open"
    trigger="click"
    placement="bottomRight"
    overlay-class-name="pl-header-popover"
    :arrow="{ pointAtCenter: true }"
  >
    <template #content>
      <div class="pl-popover-body">
        <PersonalLinksSection variant="compact" embedded />
      </div>
    </template>
    <div
      class="tool header-pl-tool"
      role="button"
      tabindex="0"
      title="我的网址"
      aria-label="我的网址"
      @keydown.enter.prevent="open = !open"
    >
      <LinkOutlined :style="{ fontSize: '16px', color: '#6B7280' }" />
    </div>
  </a-popover>
</template>

<style scoped>
.header-pl-tool {
  cursor: pointer;
}
.pl-popover-body {
  width: 300px;
}
.pl-popover-body :deep(.pl-section.compact.pl-section--embedded) {
  border: none;
  padding: 0;
  background: transparent;
}
</style>
