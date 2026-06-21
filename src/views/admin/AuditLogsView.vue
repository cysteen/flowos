<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons-vue';
import {
  AUDIT_LOGS, AUDIT_STATS, AUDIT_CATEGORIES, CATEGORY_TAG_COLOR,
  type AuditLogItem,
} from '@/mock/auditLogs';

const filter = reactive({
  category: '',
  operator: '',
  targetId: '',
  timeRange: '7d',
});

const expandedKeys = ref<string[]>([]);

const filtered = computed(() =>
  AUDIT_LOGS.filter((l) => {
    if (filter.category && l.category !== filter.category) return false;
    if (filter.operator && !l.operator.includes(filter.operator)) return false;
    if (filter.targetId && !l.targetId.includes(filter.targetId)) return false;
    return true;
  }),
);

const columns = [
  { title: '日志ID', dataIndex: 'id', key: 'id', width: 160 },
  { title: '事件分类', key: 'category', width: 100 },
  { title: '事件名称', dataIndex: 'event', key: 'event', width: 120 },
  { title: '操作人', dataIndex: 'operator', key: 'operator', width: 100 },
  { title: '角色', dataIndex: 'role', key: 'role', width: 110 },
  { title: '目标ID', dataIndex: 'targetId', key: 'targetId', width: 160 },
  { title: 'IP地址', dataIndex: 'ip', key: 'ip', width: 130 },
  { title: '时间', dataIndex: 'time', key: 'time', width: 160 },
  { title: '详情', key: 'action', width: 80, align: 'center' as const },
];

function toggleExpand(record: AuditLogItem) {
  const idx = expandedKeys.value.indexOf(record.id);
  if (idx >= 0) expandedKeys.value.splice(idx, 1);
  else expandedKeys.value.push(record.id);
}

function isExpanded(id: string) {
  return expandedKeys.value.includes(id);
}

function exportCsv() {
  message.success('已导出当前筛选结果');
}
</script>

<template>
  <div class="audit-page">
    <div class="stat-row">
      <div class="stat-card primary">
        <div class="stat-label">今日操作总数</div>
        <div class="stat-value">{{ AUDIT_STATS.todayTotal }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">登录次数</div>
        <div class="stat-value dark">{{ AUDIT_STATS.loginCount }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">工单操作</div>
        <div class="stat-value dark">{{ AUDIT_STATS.workorderOps }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">配置变更</div>
        <div class="stat-value warn">{{ AUDIT_STATS.configChanges }}</div>
      </div>
    </div>

    <div class="filter-bar">
      <a-select v-model:value="filter.category" style="width: 120px" :options="AUDIT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))" />
      <a-input v-model:value="filter.operator" placeholder="操作人..." style="width: 140px" allow-clear />
      <a-select v-model:value="filter.timeRange" style="width: 130px">
        <a-select-option value="24h">最近 24 小时</a-select-option>
        <a-select-option value="7d">最近 7 天</a-select-option>
        <a-select-option value="30d">最近 30 天</a-select-option>
      </a-select>
      <a-input v-model:value="filter.targetId" placeholder="目标ID..." style="width: 180px" allow-clear />
      <div class="filter-spacer" />
      <a-button @click="exportCsv">
        <template #icon><DownloadOutlined /></template>
        导出CSV
      </a-button>
    </div>

    <div class="table-card">
      <table class="audit-table">
        <thead>
          <tr>
            <th v-for="col in columns" :key="col.key">{{ col.title }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="log in filtered" :key="log.id">
            <tr>
              <td>{{ log.id }}</td>
              <td><a-tag :color="CATEGORY_TAG_COLOR[log.category]">{{ log.categoryLabel }}</a-tag></td>
              <td class="event-name">{{ log.event }}</td>
              <td>{{ log.operator }}</td>
              <td class="muted">{{ log.role }}</td>
              <td>{{ log.targetId }}</td>
              <td class="muted">{{ log.ip }}</td>
              <td class="muted">{{ log.time }}</td>
              <td class="action-cell">
                <a-button size="small" @click="toggleExpand(log)">
                  {{ isExpanded(log.id) ? '收起' : '展开' }}
                </a-button>
              </td>
            </tr>
            <tr v-if="isExpanded(log.id)" class="detail-row">
              <td :colspan="columns.length">
                <pre class="detail-pre">{{ log.detail }}</pre>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div class="storage-info">
      <InfoCircleOutlined class="info-icon" />
      <span>日志存储策略：近期日志 (90天) 存储于 MySQL → 历史日志迁移至 Elasticsearch → 保留期限 365天 → 日志不可篡改，写入后不可修改或删除</span>
    </div>
  </div>
</template>

<style scoped>
.audit-page {
  padding: 24px;
  min-height: 100%;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 20px;
}
.stat-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px 20px;
}
.stat-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}
.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #1a6fff;
  font-variant-numeric: tabular-nums;
}
.stat-value.dark { color: #111827; }
.stat-value.warn { color: #f59e0b; }

.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.filter-spacer { flex: 1; }

.table-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 16px;
}

.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.audit-table th {
  text-align: left;
  padding: 12px 16px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
  color: #374151;
  font-size: 13px;
}
.audit-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}
.audit-table tbody tr:hover:not(.detail-row) {
  background: #fafafa;
}
.event-name { font-weight: 500; }
.action-cell { text-align: center; }
.muted {
  font-size: 12px;
  color: #6b7280;
}

.detail-row td {
  background: #f9fafb;
  padding: 0;
}
.detail-pre {
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: #4b5563;
  white-space: pre-wrap;
  margin: 0;
  padding: 12px 16px;
}

.storage-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  background: #eff6ff;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  font-size: 12px;
  color: #1e40af;
}
.info-icon {
  font-size: 18px;
  color: #3b82f6;
  flex-shrink: 0;
}
</style>
