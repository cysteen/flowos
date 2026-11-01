<script setup lang="ts">
/**
 * 处理页页头派单状态标签（【1215】PRD 10.1）：工单在池中时显示「排队中」「等原处理人」「派单失败回池」；
 * 已有处理人、已离池或降级态 / 停派态下无派单状态时不渲染。等原处理人悬停「预留给 〈姓名〉，〈时:分〉 到期」。
 */
import { computed } from 'vue';
import { useDispatchStore } from '@/stores/dispatch';
import type { DispatchStatus } from '@/views/tickets/types/dispatch';
import { softBg } from '@/views/tickets/types/ticket';

const props = defineProps<{ ticketNo: string }>();
const store = useDispatchStore();

const COLOR: Record<DispatchStatus, string> = {
  排队中: '#1A6FFF',
  等原处理人: '#7C3AED',
  派单失败回池: '#EA580C',
};

const state = computed(() => store.ticketStateOf(props.ticketNo));
const status = computed(() => state.value?.status ?? null);

const title = computed(() => {
  const st = state.value;
  if (status.value !== '等原处理人' || !st?.reserveFor || !st.reserveUntil) return undefined;
  const d = new Date(st.reserveUntil);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `预留给 ${st.reserveFor}，${hm} 到期`;
});

</script>

<template>
  <span
    v-if="status"
    class="badge dispatch-tag"
    :style="{ color: COLOR[status], background: softBg(COLOR[status]) }"
    :title="title"
  >{{ status }}</span>
</template>

<style scoped>
/* 形制随页头同排标签（`.badge`：24px 高、12px 字、4px 圆角），这里只补不换行 */
.dispatch-tag {
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
  white-space: nowrap;
}
</style>
