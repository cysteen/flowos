<script setup lang="ts">
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  APPROVALS, APPROVAL_FILTERS, APPROVAL_STATS,
  type ApprovalItem, type ApprovalStatus,
} from '@/mock/approvalCenter';
import { stdPagination } from '@/config/adminUi';

const approvals = ref<ApprovalItem[]>([...APPROVALS]);
const filterIdx = ref(0);
const detailOpen = ref(false);
const current = ref<ApprovalItem | null>(null);
const comment = ref('');

const pendingCount = computed(() => approvals.value.filter((a) => a.status === '待审批').length);

const filtered = computed(() => {
  if (filterIdx.value === 0) return approvals.value;
  const status = APPROVAL_FILTERS[filterIdx.value] as ApprovalStatus;
  return approvals.value.filter((a) => a.status === status);
});

const riskColor: Record<string, string> = { 高: 'error', 中: 'warning', 低: 'success' };
const statusColor: Record<string, string> = { 待审批: 'processing', 已批准: 'success', 已驳回: 'error' };

const columns = [
  { title: '申请编号', dataIndex: 'code', key: 'code', width: 140 },
  { title: '工单类型', dataIndex: 'typeName', key: 'typeName' },
  { title: '申请人', dataIndex: 'applicant', key: 'applicant', width: 100 },
  { title: '申请时间', dataIndex: 'time', key: 'time', width: 160 },
  { title: '变更类型', dataIndex: 'changeType', key: 'changeType', width: 120, align: 'center' as const },
  { title: '风险等级', key: 'risk', width: 110, align: 'center' as const },
  { title: '状态', key: 'status', width: 100, align: 'center' as const },
  { title: '操作', key: 'action', width: 140, align: 'center' as const },
];

function openDetail(item: ApprovalItem) {
  current.value = item;
  comment.value = '';
  detailOpen.value = true;
}

function approve() {
  if (!current.value) return;
  current.value.status = '已批准';
  message.success('已批准');
  detailOpen.value = false;
}

function reject() {
  if (!current.value) return;
  current.value.status = '已驳回';
  message.success('已驳回');
  detailOpen.value = false;
}
</script>

<template>
  <div class="approval-page">
    <div class="page-head">
      <div>
        <h2 class="page-title">审批中心</h2>
        <p class="page-sub">审核运营员提交的配置变更发布申请</p>
      </div>
      <div class="filter-chips">
        <button
          v-for="(f, i) in APPROVAL_FILTERS"
          :key="f"
          class="chip"
          :class="{ active: filterIdx === i }"
          @click="filterIdx = i"
        >
          {{ f }}
        </button>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-card blue">
        <div class="stat-label">待审批</div>
        <div class="stat-value">{{ pendingCount }}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">本月已审批</div>
        <div class="stat-value">{{ APPROVAL_STATS.approvedThisMonth }}</div>
      </div>
      <div class="stat-card amber">
        <div class="stat-label">批准率</div>
        <div class="stat-value">{{ APPROVAL_STATS.approvalRate }}</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-label">平均审批时长</div>
        <div class="stat-value">{{ APPROVAL_STATS.avgDuration }}</div>
      </div>
    </div>

    <div class="table-card">
      <a-table
        :columns="columns"
        :data-source="filtered"
        :pagination="stdPagination()"
        row-key="id"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'code'">
            <span class="mono">{{ record.code }}</span>
          </template>
          <template v-else-if="column.key === 'changeType'">
            <a-tag color="blue">{{ record.changeType }}</a-tag>
          </template>
          <template v-else-if="column.key === 'risk'">
            <a-tag :color="riskColor[record.risk]">{{ record.risk }}风险</a-tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColor[record.status]">{{ record.status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" size="small" @click="openDetail(record)">查看</a-button>
            <a-button
              v-if="record.status === '待审批'"
              type="primary"
              size="small"
              @click="openDetail(record)"
            >
              审批
            </a-button>
          </template>
        </template>
      </a-table>
    </div>

    <a-modal
      v-model:open="detailOpen"
      :width="720"
      :footer="null"
      destroy-on-close
      wrap-class-name="approval-detail-modal"
    >
      <template v-if="current">
        <!-- 头部：标题 + 编号 + 风险徽标 + 状态 -->
        <div class="d-header">
          <div class="dh-main">
            <div class="dh-title">{{ current.typeName }}</div>
            <div class="dh-code"><span class="mono">{{ current.code }}</span></div>
          </div>
          <div class="dh-tags">
            <a-tag :color="riskColor[current.risk]" class="dh-risk">{{ current.risk }}风险</a-tag>
            <a-tag :color="statusColor[current.status]">{{ current.status }}</a-tag>
          </div>
        </div>

        <!-- 基本信息 -->
        <a-descriptions :column="2" bordered size="small" class="d-desc">
          <a-descriptions-item label="申请人">{{ current.applicant }}</a-descriptions-item>
          <a-descriptions-item label="变更类型">{{ current.changeType }}</a-descriptions-item>
          <a-descriptions-item label="申请时间" :span="2">{{ current.time }}</a-descriptions-item>
        </a-descriptions>

        <!-- 变更详情 -->
        <div class="d-section">
          <div class="sec-title">变更详情</div>
          <div class="diff-list">
            <div class="diff-row add"><span class="diff-badge">新增</span>客户满意度评分字段（1-5 星）</div>
            <div class="diff-row mod"><span class="diff-badge">修改</span>流程增加「质检审核」节点</div>
            <div class="diff-row del"><span class="diff-badge">删除</span>旧版备注字段</div>
          </div>
        </div>

        <!-- 变更影响分析 -->
        <div class="d-section">
          <div class="sec-title">变更影响分析</div>
          <div class="impact-row">
            <div class="impact-card blue">
              <div class="impact-label">影响工单数</div>
              <div class="impact-value">0</div>
              <div class="impact-hint">新版本仅影响新创建工单</div>
            </div>
            <div class="impact-card purple">
              <div class="impact-label">影响用户数</div>
              <div class="impact-value">~25</div>
              <div class="impact-hint">客服团队成员</div>
            </div>
          </div>
        </div>

        <!-- 审批意见 -->
        <div v-if="current.status === '待审批'" class="d-section">
          <div class="sec-title">审批意见</div>
          <a-textarea v-model:value="comment" :rows="3" placeholder="填写审批意见（驳回时建议说明原因）…" />
        </div>

        <div class="modal-foot">
          <template v-if="current.status === '待审批'">
            <a-button @click="detailOpen = false">取消</a-button>
            <a-button danger @click="reject">驳回</a-button>
            <a-button type="primary" @click="approve">批准</a-button>
          </template>
          <a-button v-else @click="detailOpen = false">关闭</a-button>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.approval-page {
  padding: 24px;
  min-height: 100%;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}
.page-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: #9ca3af;
}

.filter-chips {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.chip {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  transition: all 0.15s;
}
.chip:hover {
  border-color: #1a6fff;
  color: #1a6fff;
}
.chip.active {
  background: #1a6fff;
  border-color: #1a6fff;
  color: #fff;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}
.stat-card {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  padding: 16px 20px;
  position: relative;
  overflow: hidden;
}
.stat-card::after {
  content: '';
  position: absolute;
  right: -12px;
  top: -12px;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  opacity: 0.12;
}
.stat-card.blue::after { background: #1a6fff; }
.stat-card.green::after { background: #10b981; }
.stat-card.amber::after { background: #f59e0b; }
.stat-card.purple::after { background: #8b5cf6; }
.stat-label {
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 6px;
}
.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #111827;
  font-variant-numeric: tabular-nums;
}

.table-card {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  padding: 0 1px;
}
.mono {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
}

/* 审批详情弹窗 */
.d-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid #f0f0f0; }
.dh-title { font-size: 17px; font-weight: 700; color: #111827; }
.dh-code { margin-top: 4px; }
.dh-tags { display: flex; gap: 8px; flex-shrink: 0; }
.dh-risk { font-weight: 600; }

.d-desc { margin-bottom: 20px; }
.d-desc :deep(.ant-descriptions-item-label) { background: #f9fafb; color: #6b7280; width: 92px; }

.d-section { margin-bottom: 20px; }
.sec-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
  padding-left: 9px;
  border-left: 3px solid #1a6fff;
  line-height: 1.2;
}

.diff-list { display: flex; flex-direction: column; gap: 8px; }
.diff-row { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #374151; padding: 9px 12px; border-radius: 8px; border: 1px solid; }
.diff-badge { font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 4px; flex: none; color: #fff; }
.diff-row.add { background: #f0fdf4; border-color: #dcfce7; }
.diff-row.add .diff-badge { background: #10b981; }
.diff-row.mod { background: #fffbeb; border-color: #fef3c7; }
.diff-row.mod .diff-badge { background: #f59e0b; }
.diff-row.del { background: #fef2f2; border-color: #fee2e2; }
.diff-row.del .diff-badge { background: #ef4444; }

.impact-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.impact-card { border-radius: 10px; padding: 14px 16px; border: 1px solid; }
.impact-card.blue { background: #eff6ff; border-color: #dbeafe; }
.impact-card.purple { background: #f5f3ff; border-color: #ede9fe; }
.impact-label { font-size: 12px; color: #6b7280; }
.impact-value { font-size: 24px; font-weight: 700; margin: 4px 0; font-variant-numeric: tabular-nums; }
.impact-card.blue .impact-value { color: #1a6fff; }
.impact-card.purple .impact-value { color: #8b5cf6; }
.impact-hint { font-size: 11px; color: #9ca3af; }

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
  margin-top: 4px;
}
</style>
