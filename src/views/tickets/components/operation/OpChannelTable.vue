<script setup lang="ts">
import { platformDisplay, type ComplaintPlatformPick } from '@/views/tickets/composables/complaintEscalation';

export type ChannelTableRow = Pick<ComplaintPlatformPick, 'platform' | 'customPlatform' | 'complaintNo'> & {
  complaintContent?: string;
};

const props = defineProps<{
  rows: ChannelTableRow[];
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:content': [index: number, value: string];
}>();

function nameOf(p: ChannelTableRow) {
  return platformDisplay({
    platform: p.platform,
    customPlatform: p.customPlatform,
    complaintNo: p.complaintNo ?? '',
  });
}

function onContentInput(index: number, value: string) {
  if (props.readonly) return;
  emit('update:content', index, value);
}
</script>

<template>
  <div class="ext-channel-table-wrap">
    <table class="ext-channel-table">
      <thead>
        <tr>
          <th class="col-plat">投诉平台</th>
          <th class="col-no">编号</th>
          <th class="col-content">投诉内容</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="`${row.platform}-${row.complaintNo ?? ''}-${i}`">
          <td class="col-plat">{{ nameOf(row) }}</td>
          <td class="col-no">
            <span :class="{ muted: !row.complaintNo?.trim() }">
              {{ row.complaintNo?.trim() || '—' }}
            </span>
          </td>
          <td class="col-content">
            <a-textarea
              v-if="!readonly"
              :value="row.complaintContent ?? ''"
              class="content-input"
              placeholder="填写投诉内容"
              :auto-size="{ minRows: 2, maxRows: 4 }"
              @update:value="(v: string) => onContentInput(i, v ?? '')"
            />
            <span v-else class="content-read" :class="{ muted: !row.complaintContent?.trim() }">
              {{ row.complaintContent?.trim() || '—' }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.ext-channel-table-wrap {
  overflow-x: auto;
  min-width: 0;
}
.ext-channel-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
}
.ext-channel-table th,
.ext-channel-table td {
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  vertical-align: top;
  text-align: left;
  line-height: 1.45;
}
.ext-channel-table th {
  background: #f3f4f6;
  color: #6b7280;
  font-weight: 600;
  font-size: 11px;
}
.ext-channel-table tbody tr {
  background: #fff;
}
.col-plat {
  width: 28%;
}
.col-no {
  width: 18%;
  font-family: Consolas, 'SF Mono', monospace;
  font-size: 11px;
}
.col-content {
  width: 54%;
}
.muted {
  color: #9ca3af;
}
.content-read {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
  color: #374151;
}
.content-input {
  font-size: 12px;
  line-height: 1.45;
}
.content-input :deep(textarea) {
  padding: 4px 8px;
  min-height: 54px !important;
}
</style>
