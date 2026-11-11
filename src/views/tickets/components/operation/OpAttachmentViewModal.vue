<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { PaperClipOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import { formatOpTime } from '@/views/tickets/utils/opTime';
import type { AttachmentLinkFile } from '@/views/tickets/types/operationTabs';

const props = defineProps<{
  open: boolean;
  files: AttachmentLinkFile[];
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
}>();

const NO_PICK_TIP = '请选择要下载的附件';
const REVOKED_TIP = '客户已撤回，不能查看或下载';

/** 已勾选的文件 id；每次打开弹窗清空。已撤回的不能勾 */
const picked = ref<string[]>([]);

const selectable = computed(() => props.files.filter((f) => !f.revoked));
const pickedCount = computed(() => picked.value.length);
const allPicked = computed(
  () => selectable.value.length > 0 && pickedCount.value === selectable.value.length,
);
const somePicked = computed(() => pickedCount.value > 0 && pickedCount.value < selectable.value.length);

function isPicked(id: string) {
  return picked.value.includes(id);
}

function togglePick(id: string) {
  const file = props.files.find((f) => f.id === id);
  if (!file || file.revoked) return;
  picked.value = isPicked(id) ? picked.value.filter((x) => x !== id) : [...picked.value, id];
}

function toggleAll() {
  picked.value = allPicked.value ? [] : selectable.value.map((f) => f.id);
}

watch(
  () => props.open,
  (v) => {
    if (v) picked.value = [];
  },
  { immediate: true },
);

function close() {
  emit('update:open', false);
}

function onView(f: AttachmentLinkFile) {
  if (f.revoked) return;
  message.info(`查看 ${f.name}`);
}

function onDownload(f: AttachmentLinkFile) {
  if (f.revoked) return;
  message.info(`下载 ${f.name}`);
}

function onDownloadPicked() {
  if (pickedCount.value === 0) return;
  message.info(`下载 ${pickedCount.value} 个附件`);
  close();
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="附件查看"
    :icon="PaperClipOutlined"
    tone="primary"
    :width="880"
    ok-text="下载"
    cancel-text="取消"
    :ok-disabled="pickedCount === 0"
    :ok-disabled-tip="NO_PICK_TIP"
    @update:open="emit('update:open', $event)"
    @ok="onDownloadPicked"
    @cancel="close"
  >
    <!--
      本弹窗全是读操作（勾选、下载、查看），不该被所在 Tab 的只读态连带禁用。
      所在 Tab 外层用 a-config-provider 注入 component-disabled，provide/inject 沿组件树传递，
      本弹窗虽 portal 到 body 仍会继承；逐个控件加 :disabled="false" 易漏，故在此统一解除。
    -->
    <a-config-provider :component-disabled="false">
      <div class="table-wrap">
        <table class="attach-table">
          <colgroup>
            <col class="col-chk" />
            <col class="col-name" />
            <col class="col-note" />
            <col class="col-time" />
            <col class="col-revoked" />
            <col class="col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th class="col-chk">
                <a-checkbox
                  :checked="allPicked"
                  :indeterminate="somePicked"
                  :disabled="selectable.length === 0"
                  @change="toggleAll"
                />
              </th>
              <th>文件名</th>
              <th class="col-note">文件备注</th>
              <th class="col-time">上传时间</th>
              <th class="col-revoked">是否删除</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in files" :key="f.id">
              <td class="col-chk">
                <a-checkbox
                  :checked="isPicked(f.id)"
                  :disabled="f.revoked"
                  @change="togglePick(f.id)"
                />
              </td>
              <td class="col-name" :title="f.name">{{ f.name }}</td>
              <td class="col-note">{{ f.note }}</td>
              <td class="col-time">{{ formatOpTime(f.uploadedAt) }}</td>
              <td class="col-revoked">
                <span class="av-pill" :class="f.revoked ? 'av-pill-warn' : 'av-pill-gray'">
                  {{ f.revoked ? '是' : '否' }}
                </span>
              </td>
              <td class="col-actions">
                <button
                  type="button"
                  class="link-btn"
                  :disabled="f.revoked"
                  :title="f.revoked ? REVOKED_TIP : '查看'"
                  @click="onView(f)"
                >查看</button>
                <button
                  type="button"
                  class="link-btn"
                  :disabled="f.revoked"
                  :title="f.revoked ? REVOKED_TIP : '下载'"
                  @click="onDownload(f)"
                >下载</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </a-config-provider>
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
  table-layout: fixed;
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

.col-chk {
  width: 36px;
  padding-right: 0 !important;
  white-space: nowrap;
}

.col-name {
  word-break: break-all;
}

.col-note {
  width: 132px;
}

/* 时刻列靠右（2026-10-07 裁决：全页签时刻一律靠右），与附件历史 Tab 的表同一做法 */
.col-time {
  width: 156px;
  white-space: nowrap;
  text-align: right;
}

.col-revoked {
  width: 72px;
  white-space: nowrap;
  text-align: center;
}

.col-actions {
  width: 84px;
  white-space: nowrap;
}

.av-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  white-space: nowrap;
}
.av-pill-warn { color: #c2410c; background: #ffedd5; }
.av-pill-gray { color: #6b7280; background: #f3f4f6; }

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
.link-btn + .link-btn {
  margin-left: 10px;
}
.link-btn:hover:not(:disabled) {
  text-decoration: underline;
}
.link-btn:disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}
</style>
