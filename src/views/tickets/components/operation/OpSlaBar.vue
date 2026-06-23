<script setup lang="ts">
import { computed } from 'vue';
import type { TicketDetailMeta } from '@/mock/ticketDetail';

const props = defineProps<{ detail: TicketDetailMeta }>();

// 节点临近/超时 → 红；否则橙（进行中）
const nodeColor = computed(() => (props.detail.slaNodeOverdue ? '#EF4444' : '#F59E0B'));
const clamp = (n: number) => Math.max(0, Math.min(100, n));
</script>

<template>
  <div
    class="sla-bar"
    title="节点须先于整单到期；节点超时将拖累整单 SLA"
  >
    <div class="sla-legend">
      <span class="lg-node" :style="{ color: nodeColor }">
        <span class="dot" :style="{ background: nodeColor }" />当前节点 {{ detail.slaNode }}
      </span>
      <span class="lg-whole">整单解决 {{ detail.slaWhole }}</span>
    </div>

    <!-- 进度条 = 整单 SLA 时间轴；已用段=当前进度；竖标=节点截止（更早的检查点） -->
    <div
      class="sla-track"
      title="整单解决时限时间轴；节点须先于整单到期"
    >
      <div class="sla-fill" :style="{ width: clamp(detail.slaElapsedPct) + '%' }" />
      <div
        class="sla-tick"
        :style="{ left: clamp(detail.slaNodePct) + '%', background: nodeColor }"
        title="当前节点截止"
      />
    </div>
  </div>
</template>

<style scoped>
.sla-bar {
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sla-legend {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}
.lg-node {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}
.lg-whole {
  color: #6b7280;
}
.sla-track {
  position: relative;
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
}
.sla-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: #fcd34d;
  border-radius: 4px;
}
.sla-tick {
  position: absolute;
  top: -2px;
  width: 2px;
  height: 10px;
  border-radius: 1px;
  transform: translateX(-1px);
}
</style>
