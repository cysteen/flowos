<script setup lang="ts">
import { computed } from 'vue';
import { CrownOutlined } from '@ant-design/icons-vue';
import { getPlanBrand } from '@/mock/platformAdmin';

const props = defineProps<{ plan: string }>();
const brand = computed(() => getPlanBrand(props.plan));
</script>

<template>
  <a-tag :color="brand.tagColor">
    <CrownOutlined v-if="brand.crown" />
    {{ plan }}
  </a-tag>
</template>
