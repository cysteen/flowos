<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';

const props = defineProps<{ tags: string[] }>();

const host = ref<HTMLElement | null>(null);
const measurer = ref<HTMLElement | null>(null);
const visibleCount = ref(props.tags.length);

const GAP = 4;

/** 按容器可用宽度，算出能完整显示几个标签；放不下的折叠为「+N」 */
function recompute() {
  const h = host.value;
  const m = measurer.value;
  if (!h || !m) return;

  const avail = h.clientWidth;
  const tagEls = Array.from(m.querySelectorAll<HTMLElement>('.mt'));
  const moreEl = m.querySelector<HTMLElement>('.mt-more');
  const total = tagEls.length;
  if (total === 0) { visibleCount.value = 0; return; }

  const widths = tagEls.map((e) => e.offsetWidth);
  const moreW = (moreEl ? moreEl.offsetWidth : 28) + GAP;

  // 先尽量多放
  let used = 0;
  let count = 0;
  for (let i = 0; i < total; i++) {
    const need = widths[i] + (i > 0 ? GAP : 0);
    if (used + need <= avail) { used += need; count++; } else break;
  }

  // 若有溢出，需为「+N」预留位置，必要时再回退
  if (count < total) {
    while (count > 0) {
      let u = 0;
      for (let j = 0; j < count; j++) u += widths[j] + (j > 0 ? GAP : 0);
      if (u + moreW <= avail) break;
      count--;
    }
  }

  visibleCount.value = count;
}

let ro: ResizeObserver | null = null;
onMounted(() => {
  nextTick(recompute);
  ro = new ResizeObserver(() => recompute());
  if (host.value) ro.observe(host.value);
});
onBeforeUnmount(() => ro?.disconnect());
watch(() => props.tags, () => nextTick(recompute), { deep: true });
</script>

<template>
  <div ref="host" class="adaptive-tags">
    <span v-for="t in tags.slice(0, visibleCount)" :key="t" class="pill-tag">{{ t }}</span>
    <span v-if="visibleCount < tags.length" class="pill-tag pill-more" :title="tags.slice(visibleCount).join('、')">
      +{{ tags.length - visibleCount }}
    </span>

    <!-- 隐藏测量层：渲染全部标签 + 一个「+N」用于测宽 -->
    <div ref="measurer" class="measurer" aria-hidden="true">
      <span v-for="t in tags" :key="'m-' + t" class="pill-tag mt">{{ t }}</span>
      <span class="pill-tag mt-more">+{{ tags.length }}</span>
    </div>
  </div>
</template>

<style scoped>
.adaptive-tags {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.pill-tag {
  font-size: 10px;
  color: #374151;
  background: #f3f4f6;
  border-radius: 3px;
  padding: 2px 6px;
  flex: none;
}
.pill-more {
  color: #6b7280;
  cursor: default;
}
.measurer {
  position: absolute;
  left: -9999px;
  top: 0;
  display: flex;
  gap: 4px;
  visibility: hidden;
  pointer-events: none;
}
</style>
