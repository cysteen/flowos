<script setup lang="ts">
import { message } from 'ant-design-vue';
import { PaperClipOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import type { AttachmentLinkFile } from '@/views/tickets/types/operationTabs';

const props = defineProps<{
  open: boolean;
  files: AttachmentLinkFile[];
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
}>();

function close() {
  emit('update:open', false);
}

function onDownload(name: string) {
  message.info(`下载 ${name}`);
}

function onDownloadAll() {
  message.info(`打包下载 ${props.files.length} 个附件`);
  close();
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="附件查看"
    :icon="PaperClipOutlined"
    tone="primary"
    :width="640"
    ok-text="下载"
    cancel-text="取消"
    @update:open="emit('update:open', $event)"
    @ok="onDownloadAll"
    @cancel="close"
  >
    <div class="table-wrap">
      <table class="attach-table">
        <thead>
          <tr>
            <th class="col-idx">序号</th>
            <th>文件名</th>
            <th class="col-note">文件备注</th>
            <th class="col-time">上传时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(f, i) in files" :key="f.id">
            <td class="col-idx">{{ i + 1 }}</td>
            <td>
              <button type="button" class="link-btn" @click="onDownload(f.name)">{{ f.name }}</button>
            </td>
            <td class="col-note">{{ f.note }}</td>
            <td class="col-time">{{ f.uploadedAt }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </OpActionModal>
</template>

<style scoped>
.table-wrap {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.attach-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.attach-table thead {
  background: #f9fafb;
}

.attach-table th {
  padding: 6px 10px;
  text-align: left;
  font-weight: 600;
  color: #6b7280;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
}

.attach-table td {
  padding: 6px 10px;
  color: #374151;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}

.attach-table tbody tr:last-child td {
  border-bottom: none;
}

.attach-table tbody tr:hover {
  background: #fafbff;
}

.col-idx {
  width: 48px;
  white-space: nowrap;
}

.col-note {
  width: 140px;
}

.col-time {
  width: 148px;
  white-space: nowrap;
}

.link-btn {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  color: #1a6fff;
  cursor: pointer;
  text-align: left;
  word-break: break-all;
}
.link-btn:hover {
  text-decoration: underline;
}
</style>
