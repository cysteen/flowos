<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import type { AttachmentHistoryRecord } from '@/views/tickets/types/operationTabs';

defineProps<{ records: AttachmentHistoryRecord[] }>();

const fileInput = ref<HTMLInputElement | null>(null);

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '📄';
  if (ext === 'pdf') return '📋';
  if (['mp4', 'mov', 'avi', 'mp3'].includes(ext)) return '🎬';
  if (['zip', 'rar', '7z'].includes(ext)) return '📦';
  return '📄';
}

function openUpload() {
  fileInput.value?.click();
}

function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const names = Array.from(input.files ?? []).map((f) => f.name);
  if (!names.length) return;
  message.success(`已选择 ${names.length} 个附件（原型演示）`);
  input.value = '';
}

function onView(name: string) {
  message.info(`查看 ${name}`);
}

function onDownload(name: string) {
  message.info(`下载 ${name}`);
}
</script>

<template>
  <div class="attach-tab">
    <div class="upload-bar">
      <button type="button" class="upload-btn" @click="openUpload">
        <span class="upload-icon" aria-hidden="true">📎</span>
        上传附件
      </button>
      <span class="upload-hint">支持上传图片、文档、压缩包等，单个文件不超过 200MB</span>
      <input
        ref="fileInput"
        type="file"
        class="file-input"
        multiple
        @change="onFilesSelected"
      />
    </div>

    <div class="table-wrap">
      <table class="attach-table">
        <thead>
          <tr>
            <th>附件名称</th>
            <th class="col-size">文件大小</th>
            <th class="col-time">上传时间</th>
            <th class="col-user">上传人</th>
            <th class="col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in records" :key="r.id">
            <td>
              <div class="col-name">
                <span class="file-icon" aria-hidden="true">{{ fileIcon(r.name) }}</span>
                <span class="file-name">{{ r.name }}</span>
              </div>
            </td>
            <td class="col-size">{{ r.size }}</td>
            <td class="col-time">{{ r.uploadedAt }}</td>
            <td class="col-user">{{ r.uploadedBy }}</td>
            <td class="col-actions">
              <button type="button" class="link-btn" @click="onView(r.name)">查看</button>
              <button type="button" class="link-btn" @click="onDownload(r.name)">下载</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.attach-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  font-family: inherit;
}

.upload-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #1a6fff;
  background: #fff;
  border: 1.5px solid #93c5fd;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 1px 2px rgba(26, 111, 255, 0.1);
}
.upload-btn:hover {
  background: #eff6ff;
  border-color: #1a6fff;
}

.upload-icon {
  font-size: 14px;
  line-height: 1;
}

.upload-hint {
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.4;
}

.file-input {
  display: none;
}

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
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  color: #6b7280;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
}

.attach-table td {
  padding: 10px 12px;
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

.col-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.file-icon {
  flex: none;
  font-size: 14px;
  line-height: 1;
}

.file-name {
  min-width: 0;
  word-break: break-all;
}

.col-size {
  width: 88px;
  white-space: nowrap;
}

.col-time {
  width: 148px;
  white-space: nowrap;
}

.col-user {
  width: 120px;
  white-space: nowrap;
}

.col-actions {
  width: 100px;
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
}
.link-btn + .link-btn {
  margin-left: 10px;
}
.link-btn:hover {
  text-decoration: underline;
}
</style>
