<script setup lang="ts">
import { computed } from 'vue';
import { LinkOutlined } from '@ant-design/icons-vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';
import { buildTicketRelations, type TicketRelation } from '@/views/tickets/composables/ticketRelations';
import OpRelationList from './OpRelationList.vue';

/**
 * 右栏常驻「关联关系」卡（Freshdesk Additional Info pane 口径）：
 * 关系信息不该藏在二级 Tab 里——坐席要随时看得见本单派生了什么、来自哪里。
 * 无关联时整卡不出现，不占版面。
 */
const props = defineProps<{ detail: TicketDetailMeta }>();
const emit = defineEmits<{ open: [rel: TicketRelation] }>();

const relations = computed(() => buildTicketRelations(props.detail));
</script>

<template>
  <div v-if="relations.length" class="rel-card">
    <div class="rel-card-head">
      <LinkOutlined />
      <span class="rel-card-title">关联关系</span>
      <span class="rel-card-count">{{ relations.length }}</span>
    </div>
    <OpRelationList :relations="relations" @open="emit('open', $event)" />
  </div>
</template>

<style scoped>
.rel-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 8px 8px;
  flex: none;
}
.rel-card-head {
  display: flex; align-items: center; gap: 6px;
  padding: 0 4px 8px;
  font-size: 13px; font-weight: 700; color: #111827;
}
.rel-card-title { flex: 1; min-width: 0; }
.rel-card-count {
  flex: none; font-size: 11px; font-weight: 600; line-height: 18px;
  padding: 0 6px; border-radius: 9px; color: #4f46e5; background: #eef2ff;
}
</style>
