<script setup lang="ts">
import { platformDisplay, type ComplaintPlatformPick } from '@/views/tickets/composables/complaintEscalation';

export type ChannelTagRow = Pick<ComplaintPlatformPick, 'platform' | 'customPlatform' | 'complaintNo'> & {
  complaintContent?: string;
};

defineProps<{
  platforms: ChannelTagRow[];
}>();

function nameOf(p: ChannelTagRow) {
  return platformDisplay({
    platform: p.platform,
    customPlatform: p.customPlatform,
    complaintNo: p.complaintNo ?? '',
  });
}

function labelOf(p: ChannelTagRow) {
  const name = nameOf(p);
  const no = p.complaintNo?.trim();
  return no ? `${name} ${no}` : name;
}

function titleOf(p: ChannelTagRow) {
  const name = nameOf(p);
  const no = p.complaintNo?.trim();
  return no ? `${name} · ${no}` : name;
}
</script>

<template>
  <div class="ext-channel">
    <span
      v-for="(p, i) in platforms"
      :key="`${p.platform}-${p.complaintNo ?? ''}-${i}`"
      class="ext-channel-tag"
      :title="titleOf(p)"
    >
      {{ labelOf(p) }}
    </span>
  </div>
</template>

<style scoped>
.ext-channel {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.ext-channel-tag {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 4px 8px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  font-size: 11px;
  color: #374151;
  line-height: 18px;
  word-break: break-word;
}
</style>
