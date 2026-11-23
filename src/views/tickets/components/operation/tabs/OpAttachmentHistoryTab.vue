<script setup lang="ts">
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import OpAttachmentViewModal from '@/views/tickets/components/operation/OpAttachmentViewModal.vue';
import { formatOpTime } from '@/views/tickets/utils/opTime';
import { dataUrlToPreviewBlob } from '@/views/tickets/utils/attachmentPreview';
import { countAttachmentFiles, attachmentCountLabel } from '@/views/tickets/types/operationTabs';
import type {
  AttachmentHistoryRecord,
  AttachmentLinkFile,
  AttachmentLinkRecord,
  AttachmentLinkSource,
  AttachmentLoadScope,
} from '@/views/tickets/types/operationTabs';

const props = withDefaults(defineProps<{
  records: AttachmentHistoryRecord[];
  /** 下发给客户的附件上传短链接 */
  links: AttachmentLinkRecord[];
  /** 明确完整、部分加载或未知范围；不传时只显示未知数。 */
  loadScope?: Partial<AttachmentLoadScope>;
  /**
   * 本 Tab 对当前角色只读。矩阵 #50「附件历史」**九格全「只读」**，原话是
   * 「查看/下载保留」；「上传附件」栏在 #50 Tab 只读时仍可出（见 tabAttachmentUploadEnabled），
   * 只读角色 / 整页只读时不出。处理表单区上传与此处写入同一路径。
   */
  readonly?: boolean;
  /** 业务登记等场景：仅上传人可删 */
  allowDelete?: (record: AttachmentHistoryRecord) => boolean;
  /** 隐藏「客户上传」子页签（无线音乐等业务仅坐席上传） */
  showCustomerUpload?: boolean;
}>(), { showCustomerUpload: true });

const emit = defineEmits<{
  upload: [files: { name: string; size: number; file: File }[]];
  delete: [id: string];
}>();

type SubTab = 'files' | 'links';

const subTab = ref<SubTab>('files');
const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'files', label: '坐席上传' },
  { key: 'links', label: '客户上传' },
];
const visibleSubTabs = computed(() => (
  props.showCustomerUpload === false
    ? SUB_TABS.filter((tab) => tab.key === 'files')
    : SUB_TABS
));
const fileCounts = computed(() => countAttachmentFiles(props.records, props.links, props.loadScope));

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
  const picked = Array.from(input.files ?? []);
  if (!picked.length) return;
  emit('upload', picked.map((f) => ({ name: f.name, size: f.size, file: f })));
  message.success(`已上传 ${picked.length} 个附件`);
  input.value = '';
}

function onView(record: AttachmentHistoryRecord) {
  if (record.url) {
    if (/^data:/i.test(record.url)) {
      let previewUrl: string | undefined;
      try {
        previewUrl = URL.createObjectURL(dataUrlToPreviewBlob(record.url));
        window.open(previewUrl, '_blank', 'noopener,noreferrer');
        const ownedUrl = previewUrl;
        window.setTimeout(() => URL.revokeObjectURL(ownedUrl), 60_000);
      } catch {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        message.warning('附件内容无效，无法预览');
      }
      return;
    }
    window.open(record.url, '_blank', 'noopener,noreferrer');
    return;
  }
  message.info(`查看 ${record.name}`);
}

function onDownload(record: AttachmentHistoryRecord) {
  if (record.url) {
    const link = document.createElement('a');
    link.href = record.url;
    link.download = record.name;
    link.rel = 'noopener';
    link.target = '_blank';
    link.click();
    return;
  }
  message.info(`下载 ${record.name}`);
}

function onDelete(record: AttachmentHistoryRecord) {
  if (props.readonly || !props.allowDelete?.(record)) return;
  emit('delete', record.id);
}

/* ---- 子页签二：客户上传。当前接收原型清单；生产需按关联 ID 对接容联文件 list。 ---- */

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
    <div class="attach-toolbar">
      <div class="sub-tabs" role="tablist">
        <button
          v-for="t in visibleSubTabs"
          :key="t.key"
          type="button"
          role="tab"
          class="sub-tab"
          :class="{ on: subTab === t.key }"
          :aria-selected="subTab === t.key"
          @click="subTab = t.key"
        >
          {{ t.label }}（{{ attachmentCountLabel(t.key === 'files' ? fileCounts.agent : fileCounts.customer) }}）
        </button>
      </div>
      <div v-if="subTab === 'files' && !readonly" class="upload-bar">
        <span class="upload-hint">支持上传图片、文档、压缩包等，单个文件不超过 200MB</span>
        <button type="button" class="upload-btn tko-upload-btn" @click="openUpload">
          上传附件
        </button>
        <input
          ref="fileInput"
          type="file"
          class="file-input"
          multiple
          @change="onFilesSelected"
        />
      </div>
    </div>

    <template v-if="subTab === 'files'">
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
                <button
                  type="button"
                  class="link-btn"
                  :disabled="!r.url"
                  @click="onView(r)"
                >
                  查看
                </button>
                <button
                  type="button"
                  class="link-btn"
                  :disabled="!r.url"
                  @click="onDownload(r)"
                >
                  下载
                </button>
                <button
                  v-if="allowDelete?.(r)"
                  type="button"
                  class="link-btn is-danger"
                  @click="onDelete(r)"
                >
                  删除
                </button>
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

.attach-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 32px;
}

.sub-tabs {
  display: inline-flex;
  flex: none;
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
  justify-content: flex-end;
  gap: 10px;
  flex: 1;
  min-width: 0;
  margin-left: auto;
}

.upload-btn {
  flex: none;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 25px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  color: #1a6fff;
  background: #fff;
  border: 1px solid #93c5fd;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 1px 2px rgba(17, 24, 39, 0.08);
}
.upload-btn:hover {
  background: #eff6ff;
  border-color: #1a6fff;
}

.upload-hint {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.4;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  width: 132px;
  white-space: nowrap;
}

.link-btn.is-danger {
  color: #dc2626;
}
.link-btn:disabled {
  color: #9ca3af;
  cursor: not-allowed;
}
.link-btn:disabled:hover {
  text-decoration: none;
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
