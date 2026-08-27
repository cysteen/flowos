<script setup lang="ts">
import { platformDisplay, type ComplaintPlatformPick } from '@/views/tickets/composables/complaintEscalation';

const props = defineProps<{
  platforms: Array<Pick<ComplaintPlatformPick, 'platform' | 'customPlatform'> & { complaintNo?: string }>;
}>();

function nameOf(p: (typeof props.platforms)[number]) {
  return platformDisplay({
    platform: p.platform,
    customPlatform: p.customPlatform,
    complaintNo: p.complaintNo ?? '',
  });
}
</script>

<template>
  <div class="ext-channels">
    <span
      v-for="(p, i) in platforms"
      :key="`${p.platform}-${p.complaintNo ?? ''}-${i}`"
      class="ext-channel-tag"
      :title="p.complaintNo ? `${nameOf(p)} · ${p.complaintNo}` : nameOf(p)"
    >
      <span class="ext-channel-name">{{ nameOf(p) }}</span>
      <span v-if="p.complaintNo" class="ext-channel-no">{{ p.complaintNo }}</span>
    </span>
  </div>
</template>

<style scoped>
.ext-channels {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.ext-channel-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
}
.ext-channel-name {
  color: #374151;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ext-channel-no {
  flex: none;
  color: #6b7280;
  font-size: 11px;
  font-family: Consolas, 'SF Mono', monospace;
  padding-left: 6px;
  border-left: 1px solid #e5e7eb;
}
</style>
