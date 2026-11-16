<script setup lang="ts">
import { CheckOutlined } from '@ant-design/icons-vue';

withDefaults(
  defineProps<{
    checked?: boolean;
    indeterminate?: boolean;
  }>(),
  {
    checked: false,
    indeterminate: false,
  },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <div
    class="cb"
    :class="{
      checked: checked && !indeterminate,
      indeterminate: indeterminate && !checked,
    }"
    @click.stop="emit('click', $event)"
  >
    <CheckOutlined v-if="checked && !indeterminate" :style="{ color: '#fff', fontSize: '10px' }" />
    <span v-else-if="indeterminate" class="cb-indeterminate-mark" aria-hidden="true" />
  </div>
</template>

<style scoped>
.cb {
  width: 16px;
  height: 16px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: none;
  box-sizing: border-box;
}
.cb.checked {
  background: #1a6fff;
  border-color: #1a6fff;
}
.cb.indeterminate {
  background: #1a6fff;
  border-color: #1a6fff;
}
.cb-indeterminate-mark {
  display: block;
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: #fff;
}
</style>
