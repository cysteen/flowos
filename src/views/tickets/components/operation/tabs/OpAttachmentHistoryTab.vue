<script setup lang="ts">
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import OpAttachmentViewModal from '@/views/tickets/components/operation/OpAttachmentViewModal.vue';
import { formatOpTime } from '@/views/tickets/utils/opTime';
import type {
  AttachmentHistoryRecord,
  AttachmentLinkFile,
  AttachmentLinkRecord,
  AttachmentLinkSource,
} from '@/views/tickets/types/operationTabs';

const props = defineProps<{
  records: AttachmentHistoryRecord[];
  /** 下发给客户的附件上传短链接 */
  links: AttachmentLinkRecord[];
  /**
   * 本 Tab 对当前角色只读。矩阵 #50「附件历史」**九格全「只读」**，原话是
   * 「查看/下载保留，**上传入口在处理表单区**」—— 故这条「上传附件」栏在只读态整条不出，
   * 上传走「工单处理」Tab 的处理表单区。查看/下载不受影响。
   */
  readonly?: boolean;
}>();

type SubTab = 'files' | 'links';

const subTab = ref<SubTab>('files');
const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'files', label: '坐席上传' },
  { key: 'links', label: '客户上传' },
];

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
  if (props.readonly) return;
  fileInput.value?.click();
}

function onFilesSelected(e: Event) {
  if (props.readonly) return;
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

/* ---- 子页签二：客户上传（按关联 ID 向容联云拉取上传短链接与文件清单） ---- */

/** 链接的发出渠道，每个渠道一套配色 */
function linkSourceClass(s: AttachmentLinkSource): string {
  if (s === '工单短信') return 'is-sms';
  if (s === '热线短信') return 'is-hotline';
  return 'is-online';
}

/** 按发送时间倒序 */
const sortedLinks = computed(() =>
  [...props.links].sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
);

const viewOpen = ref(false);
const viewFiles = ref<AttachmentLinkFile[]>([]);

function openLinkFiles(link: AttachmentLinkRecord) {
  if (!link.uploaded) return;
  viewFiles.value = link.files;
  viewOpen.value = true;
}
</script>

<template>
  <div class="attach-tab">
    <div class="sub-tabs" role="tablist">
      <button
        v-for="t in SUB_TABS"
        :key="t.key"
        type="button"
        role="tab"
        class="sub-tab"
        :class="{ on: subTab === t.key }"
        :aria-selected="subTab === t.key"
        @click="subTab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <template v-if="subTab === 'files'">
      <div v-if="!readonly" class="upload-bar">
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
              <td class="col-time">{{ formatOpTime(r.uploadedAt) }}</td>
              <td class="col-user">{{ r.uploadedBy }}</td>
              <td class="col-actions">
                <button type="button" class="link-btn" @click="onView(r.name)">查看</button>
                <button type="button" class="link-btn" @click="onDownload(r.name)">下载</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else>
      <div class="table-wrap links-wrap">
        <table class="attach-table links-table">
          <thead>
            <tr>
              <th class="col-url">链接</th>
              <th class="col-phone">接收号码</th>
              <th class="col-sender">发送人</th>
              <th class="col-time">发送时间</th>
              <th class="col-link-source">来源</th>
              <th class="col-state">链接状态</th>
              <th class="col-state">是否上传</th>
              <th class="col-time">更新时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in sortedLinks" :key="l.id">
              <td class="col-url">
                <button
                  v-if="l.uploaded"
                  type="button"
                  class="link-btn link-url"
                  :title="l.url"
                  @click="openLinkFiles(l)"
                >
                  {{ l.url }}
                </button>
                <span v-else class="link-url is-disabled" title="客户尚未上传附件">{{ l.url }}</span>
              </td>
              <td class="col-phone">{{ l.phone }}</td>
              <td class="col-sender">{{ l.senderName }}</td>
              <td class="col-time">{{ formatOpTime(l.sentAt) }}</td>
              <td class="col-link-source">
                <span class="source-tag" :class="linkSourceClass(l.source)">{{ l.source }}</span>
              </td>
              <td class="col-state">
                <span class="state-tag" :class="l.expired ? 'is-expired' : 'is-active'">
                  {{ l.expired ? '已失效' : '生效中' }}
                </span>
              </td>
              <td class="col-state">
                <span class="state-tag" :class="l.uploaded ? 'is-uploaded' : 'is-pending'">
                  {{ l.uploaded ? '已上传' : '未上传' }}
                </span>
              </td>
              <td class="col-time">{{ l.updatedAt ? formatOpTime(l.updatedAt) : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <OpAttachmentViewModal v-model:open="viewOpen" :files="viewFiles" />
  </div>
</template>

<style scoped>
.attach-tab {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  font-family: inherit;
}

.sub-tabs {
  display: inline-flex;
  align-self: flex-start;
  padding: 2px;
  background: #f3f4f6;
  border-radius: 6px;
  gap: 2px;
}

.sub-tab {
  padding: 4px 16px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.sub-tab:hover {
  color: #374151;
}
.sub-tab.on {
  color: #1a6fff;
  background: #fff;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(17, 24, 39, 0.08);
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

/* 时刻列靠右（2026-10-07 裁决：全页签时刻一律靠右），表头与单元格同向 */
.col-time {
  width: 164px;
  white-space: nowrap;
  text-align: right;
}

.col-user {
  width: 120px;
  white-space: nowrap;
}

.col-phone {
  width: 112px;
  white-space: nowrap;
}

.col-sender {
  width: 80px;
  white-space: nowrap;
}

.col-state {
  width: 80px;
  white-space: nowrap;
}

.col-link-source {
  width: 88px;
  white-space: nowrap;
}

.col-url {
  width: 168px;
}

/* 「客户上传」子页签：八列定宽，窄容器下整表横向滚动而非挤压各列 */
.table-wrap.links-wrap {
  overflow-x: auto;
  overflow-y: hidden;
}

/* min-width = 168+112+80+140+88+80+80+140 */
.links-table {
  table-layout: fixed;
  min-width: 888px;
}

.source-tag {
  display: inline-block;
  padding: 1px 7px;
  font-size: 11px;
  line-height: 18px;
  border-radius: 4px;
  white-space: nowrap;
}
.source-tag.is-sms {
  color: #1a6fff;
  background: #eff6ff;
}
.source-tag.is-hotline {
  color: #7c3aed;
  background: #f5f3ff;
}
.source-tag.is-online {
  color: #0e7490;
  background: #ecfeff;
}

.state-tag {
  display: inline-block;
  padding: 1px 7px;
  font-size: 11px;
  line-height: 18px;
  border-radius: 4px;
  white-space: nowrap;
}
.state-tag.is-expired {
  color: #6b7280;
  background: #f3f4f6;
}
.state-tag.is-active {
  color: #059669;
  background: #ecfdf5;
}
.state-tag.is-uploaded {
  color: #059669;
  background: #ecfdf5;
}
.state-tag.is-pending {
  color: #ea580c;
  background: #fff7ed;
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

.link-url {
  display: block;
  width: 100%;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.link-url.is-disabled {
  color: #9ca3af;
  cursor: not-allowed;
}
</style>
