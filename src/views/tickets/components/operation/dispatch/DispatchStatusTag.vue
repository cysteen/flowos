<script setup lang="ts">
/**
 * 处理页页头派单状态标签（【1215】PRD 9.2）：工单在池中且排队时显示「排队中」；
 * 已有处理人、已离池或混合派单 / 人工派单下无派单状态时不渲染。
 */
import { computed } from 'vue';
import { useDispatchStore } from '@/stores/dispatch';
import type { DispatchStatus } from '@/views/tickets/types/dispatch';
import { softBg } from '@/views/tickets/types/ticket';

const props = defineProps<{ ticketNo: string }>();
const store = useDispatchStore();

const COLOR: Record<DispatchStatus, string> = {
  排队中: '#1A6FFF',
};

const status = computed(() => store.ticketStateOf(props.ticketNo)?.status ?? null);

</script>

<template>
  <span
    v-if="status"
    class="badge dispatch-tag"
    :style="{ color: COLOR[status], background: softBg(COLOR[status]) }"
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
