<script setup lang="ts">
/**
 * 外呼号码回显配置（业务管理 · 外显号码）
 * 号码主数据由呼叫中心同步；本页维护可用班组与备注。
 */
import { ref, reactive, computed, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  SyncOutlined, SearchOutlined, ReloadOutlined, QuestionCircleOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { stdPagination } from '@/config/adminUi';
import {
  OUTBOUND_NUMBERS,
  RONGLIAN_NUMBER_SNAPSHOT,
  SERVICE_TEAM_OPTIONS,
  NUMBER_STATUS_META,
  teamNamesOf,
  formatDateTime,
  type OutboundNumberRow,
  type OutboundNumberStatus,
} from '@/mock/outboundNumbers';

const rows = ref<OutboundNumberRow[]>([...OUTBOUND_NUMBERS]);
const syncing = ref(false);
const lastSyncAt = ref('2026-09-08 14:20:00');

const filter = reactive({
  keyword: '',
  teamKey: undefined as string | undefined,
  /** 号码是否在呼叫中心仍有效 */
  numberStatus: 'all' as 'all' | OutboundNumberStatus,
});

const filtered = computed(() =>
  rows.value.filter((r) => {
    if (filter.keyword.trim()) {
      const kw = filter.keyword.trim().toLowerCase();
      if (!r.number.includes(kw) && !(r.remark || '').toLowerCase().includes(kw)) return false;
    }
    if (filter.teamKey && !r.teamKeys.includes(filter.teamKey)) return false;
    if (filter.numberStatus !== 'all' && r.status !== filter.numberStatus) return false;
    return true;
  }),
);

const list = computed(() =>
  filtered.value.map((r, i) => ({ ...r, index: i + 1, teamNames: teamNamesOf(r.teamKeys) })),
);

const cols = [
  { title: '序号', dataIndex: 'index', key: 'index', width: 56, align: 'center' as const },
  { title: '外显号码', dataIndex: 'number', key: 'number', width: 200 },
  { title: '可用班组', dataIndex: 'teamNames', key: 'teams', ellipsis: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 160, ellipsis: true },
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 168 },
  { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 168 },
  { title: '操作', key: 'op', width: 100, align: 'center' as const },
];

const tablePage = reactive({ current: 1, pageSize: 10 });
const pagination = computed(() =>
  stdPagination({
    current: tablePage.current,
    pageSize: tablePage.pageSize,
    total: filtered.value.length,
    onChange: (p: number, s: number) => { tablePage.current = p; tablePage.pageSize = s; },
  }),
);
watch(
  [() => filter.keyword, () => filter.teamKey, () => filter.numberStatus],
  () => { tablePage.current = 1; },
);

const teamFilterOptions = computed(() =>
  SERVICE_TEAM_OPTIONS.map((t) => ({ value: t.key, label: t.name })),
);
const numberStatusOptions = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '有效' },
  { value: 'expired', label: '失效' },
];

function resetFilter() {
  filter.keyword = '';
  filter.teamKey = undefined;
  filter.numberStatus = 'all';
}

const editOpen = ref(false);
const editing = ref<OutboundNumberRow | null>(null);
const form = reactive({ teamKeys: [] as string[], remark: '' });

function openEdit(row: OutboundNumberRow) {
  if (row.status === 'expired') return;
  editing.value = row;
  form.teamKeys = [...row.teamKeys];
  form.remark = row.remark;
  editOpen.value = true;
}

function saveEdit() {
  if (!editing.value) return;
  const row = rows.value.find((r) => r.id === editing.value!.id);
  if (!row) return;
  row.teamKeys = [...form.teamKeys];
  row.remark = form.remark.trim();
  row.updatedAt = formatDateTime();
  message.success('已保存');
  editOpen.value = false;
}

function deleteRow(row: OutboundNumberRow) {
  const isExpired = row.status === 'expired';
  Modal.confirm({
    title: isExpired ? '删除失效号码' : '删除外显号码',
    content: isExpired
      ? `外显号码「${row.number}」已不在呼叫中心队列，确定从本系统删除？删除后不可恢复。`
      : `外显号码「${row.number}」仍在呼叫中心队列中，删除后下次同步将重新入库，班组与备注需重新配置。确定删除？`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      rows.value = rows.value.filter((r) => r.id !== row.id);
      message.success('已删除');
    },
  });
}

/**
 * 同步逻辑：
 * 1. 快照内号码 → 有效，更新同步时间，保留班组/备注
 * 2. 快照外且原有效的本地号码 → 标为失效
 * 3. 快照有、本地无 → 新增
 */
async function syncFromRonglian() {
  syncing.value = true;
  await new Promise((r) => setTimeout(r, 900));

  const syncTime = RONGLIAN_NUMBER_SNAPSHOT[0]?.syncedAt ?? formatDateTime();
  const snapshotNumbers = new Set(RONGLIAN_NUMBER_SNAPSHOT.map((s) => s.number));
  const byNumber = new Map(rows.value.map((r) => [r.number, r]));
  let added = 0;
  let expired = 0;

  for (const snap of RONGLIAN_NUMBER_SNAPSHOT) {
    const existing = byNumber.get(snap.number);
    if (existing) {
      existing.syncedAt = snap.syncedAt;
      if (existing.status !== 'active') {
        existing.status = 'active';
        existing.updatedAt = snap.syncedAt;
      }
    } else {
      rows.value.push({
        id: snap.id,
        number: snap.number,
        syncedAt: snap.syncedAt,
        status: 'active',
        teamKeys: [],
        remark: '',
        createdAt: snap.syncedAt,
        updatedAt: snap.syncedAt,
      });
      added += 1;
    }
  }

  for (const row of rows.value) {
    if (!snapshotNumbers.has(row.number) && row.status === 'active') {
      row.status = 'expired';
      row.updatedAt = syncTime;
      expired += 1;
    }
  }

  lastSyncAt.value = syncTime;
  syncing.value = false;

  const parts = [`共同步 ${RONGLIAN_NUMBER_SNAPSHOT.length} 个有效号码`];
  if (added) parts.push(`新增 ${added} 个`);
  if (expired) parts.push(`${expired} 个标为失效`);
  message.success(`同步完成：${parts.join('，')}`);
}
</script>

<template>
  <div class="outbound-number-view">
    <AdminPageHeader
      title="外呼号码回显配置"
      subtitle="号码由呼叫中心同步维护；有效号码可配置班组与备注，失效号码可删除"
    >
      <template #actions>
        <span class="sync-meta">
          <span class="sync-time">上次同步 {{ lastSyncAt }}</span>
          <a-tooltip title="从呼叫中心同步外显号码；不在同步结果中的号码将标为失效">
            <QuestionCircleOutlined class="sync-help" />
          </a-tooltip>
        </span>
        <a-button :loading="syncing" @click="syncFromRonglian">
          <template #icon><SyncOutlined /></template>
          同步号码
        </a-button>
      </template>
    </AdminPageHeader>

    <div class="table-card">
      <div class="list-toolbar">
        <div class="fi">
          <span class="fl">号码状态</span>
          <a-select
            v-model:value="filter.numberStatus"
            class="tb-ctl sel-w-sm"
            size="small"
            :options="numberStatusOptions"
          />
        </div>
        <div class="fi">
          <span class="fl">班组</span>
          <a-select
            v-model:value="filter.teamKey"
            class="tb-ctl sel-w-lg"
            size="small"
            allow-clear
            placeholder="全部"
            :options="teamFilterOptions"
          />
        </div>
        <div class="tb-search">
          <SearchOutlined class="tb-search-ic" />
          <input
            v-model="filter.keyword"
            class="tb-search-input"
            placeholder="搜索外显号码 / 备注"
            @keyup.enter="tablePage.current = 1"
          />
        </div>
        <button type="button" class="tb-btn" @click="resetFilter">
          <ReloadOutlined />
          <span>重置</span>
        </button>
      </div>

      <a-table
        :columns="cols"
        :data-source="list"
        row-key="id"
        :pagination="pagination"
        size="middle"
        :row-class-name="(r: OutboundNumberRow) => r.status === 'expired' ? 'row-expired' : ''"
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'number'" class="number-cell">
            <span class="mono" :class="{ 'num-expired': record.status === 'expired' }">{{ record.number }}</span>
            <a-tag
              class="status-tag"
              :color="NUMBER_STATUS_META[record.status as OutboundNumberStatus].color"
            >
              {{ NUMBER_STATUS_META[record.status as OutboundNumberStatus].label }}
            </a-tag>
          </span>
          <template v-else-if="column.key === 'teams'">
            <div v-if="record.teamNames.length" class="teams-cell">
              <a-tag v-for="name in record.teamNames" :key="name" color="blue">{{ name }}</a-tag>
            </div>
            <span v-else class="muted">未配班组</span>
          </template>
          <span v-else-if="column.key === 'remark'" :class="{ muted: !record.remark }">
            {{ record.remark || '未设置' }}
          </span>
          <span v-else-if="column.key === 'createdAt' || column.key === 'updatedAt'" class="time-cell">
            {{ record[column.key] }}
          </span>
          <template v-else-if="column.key === 'op'">
            <span
              v-if="record.status === 'active'"
              class="act primary"
              @click="openEdit(record as OutboundNumberRow)"
            >编辑</span>
            <span class="act danger" @click="deleteRow(record as OutboundNumberRow)">删除</span>
          </template>
        </template>
        <template #emptyText>
          <a-empty description="暂无匹配号码">
            <a-button
              v-if="filter.keyword || filter.teamKey || filter.numberStatus !== 'all'"
              @click="resetFilter"
            >
              清除筛选
            </a-button>
          </a-empty>
        </template>
      </a-table>
    </div>

    <a-modal
      v-model:open="editOpen"
      :title="editing ? `编辑外显号码 · ${editing.number}` : '编辑外显号码'"
      :width="520"
      ok-text="保存"
      cancel-text="取消"
      destroy-on-close
      @ok="saveEdit"
    >
      <a-form layout="vertical" class="edit-form">
        <a-form-item label="外显号码">
          <a-input :value="editing?.number" disabled />
        </a-form-item>
        <a-form-item label="可用班组" extra="外呼时，仅所属班组的坐席可选择该外显号码">
          <a-select
            v-model:value="form.teamKeys"
            mode="multiple"
            placeholder="选择可使用此外显号码的班组"
            :options="SERVICE_TEAM_OPTIONS.map((t) => ({ value: t.key, label: t.name }))"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea
            v-model:value="form.remark"
            placeholder="如：合肥本地号、投诉专线"
            :rows="3"
            :maxlength="100"
            show-count
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.outbound-number-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 24px;
  min-height: 100%;
}
.outbound-number-view :deep(.admin-page-header) {
  margin-bottom: 0;
}

.sync-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sync-time {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.sync-help {
  font-size: 14px;
  color: #9ca3af;
  cursor: help;
}
.sync-help:hover {
  color: #1a6fff;
}

.table-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 12px 4px;
}

.list-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #f9fafb;
  border: 1px solid #f0f1f3;
  border-radius: 6px;
}
.fi {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
.fl {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}
.sel-w-sm { width: 88px !important; }
.sel-w-lg { width: 160px !important; }
.list-toolbar :deep(.tb-ctl.ant-select .ant-select-selector) {
  font-size: 13px;
  border-radius: 6px;
  background: #fff;
}
.tb-search {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 200px;
  height: 28px;
  padding: 0 10px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-sizing: border-box;
  flex: none;
  margin-left: auto;
}
.tb-search:focus-within {
  border-color: #1a6fff;
  box-shadow: 0 0 0 2px rgb(26 111 255 / 10%);
}
.tb-search-ic {
  color: #9ca3af;
  font-size: 13px;
  flex: none;
}
.tb-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 13px;
  color: #374151;
  background: transparent;
  font-family: inherit;
}
.tb-search-input::placeholder {
  color: #9ca3af;
}
.tb-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  flex: none;
  font-family: inherit;
}
.tb-btn:hover {
  border-color: #1a6fff;
  color: #1a6fff;
}

.number-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}
.teams-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  row-gap: 4px;
}
.teams-cell :deep(.ant-tag) {
  margin: 0;
}
.number-cell :deep(.status-tag) {
  margin: 0;
  flex: none;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}
.num-expired {
  color: #9ca3af;
  text-decoration: line-through;
}
.muted {
  color: #9ca3af;
}
.time-cell {
  font-size: 13px;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.act {
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
  white-space: nowrap;
  margin-right: 8px;
}
.act:last-child {
  margin-right: 0;
}
.act.primary {
  color: #1a6fff;
}
.act.danger {
  color: #ef4444;
}
.act:hover {
  opacity: 0.75;
}

:deep(.ant-table) {
  padding: 0 4px;
}
:deep(.ant-table table) {
  table-layout: fixed;
}
:deep(.ant-table-thead > tr > th) {
  background: #f3f4f6;
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
}
:deep(.ant-table-tbody > tr > td) {
  font-size: 14px;
  color: #374151;
}
:deep(.ant-table-tbody > tr.row-expired > td) {
  background: #fafafa;
}
:deep(.ant-tag) {
  margin-inline-end: 4px;
}

.edit-form :deep(.ant-form-item) {
  margin-bottom: 14px;
}
.edit-form :deep(.ant-form-item:last-child) {
  margin-bottom: 0;
}
</style>
