<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { message } from 'ant-design-vue';
import {
  FileTextOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  BellOutlined,
  CheckOutlined,
  CloseOutlined,
} from '@ant-design/icons-vue';
import { stdPagination } from '@/config/adminUi';

const NAV = [
  { key: 'mine', label: '我的申请', icon: FileTextOutlined, count: 3 },
  { key: 'team', label: '团队审批', icon: TeamOutlined, count: 5 },
  { key: 'todo', label: '待我审批', icon: ClockCircleOutlined, count: 4 },
  { key: 'done', label: '我已审批', icon: CheckCircleOutlined, count: 0 },
  { key: 'cc', label: '抄送我的', icon: BellOutlined, count: 2 },
];
const active = ref('todo');

interface Req {
  id: string;
  title: string;
  type: string;
  applicant: string;
  node: string;
  status: '审批中' | '已通过' | '已驳回' | '已撤回';
  submit: string;
  amount?: string;
}
const STATUS_TONE: Record<string, string> = {
  审批中: 'processing',
  已通过: 'success',
  已驳回: 'error',
  已撤回: 'default',
};

const mine: Req[] = [
  { id: 'AP-2041', title: 'TK-88231 强制结案', type: '工单强结审批', applicant: '我', node: '班长审核', status: '审批中', submit: '06-19 10:20' },
  { id: 'AP-2038', title: '客户补偿 ¥200 话费', type: '补偿审批', applicant: '我', node: '已完成', status: '已通过', submit: '06-18 16:40', amount: '¥200' },
  { id: 'AP-2030', title: '6/22 调班申请', type: '请假调班', applicant: '我', node: '已驳回', status: '已驳回', submit: '06-17 09:10' },
];
const team: Req[] = [
  { id: 'AP-2045', title: 'TK-88250 升级二线', type: '工单升级审批', applicant: '陈静', node: '班长审核', status: '审批中', submit: '06-19 11:02' },
  { id: 'AP-2044', title: '退款 ¥1,299', type: '退款审批', applicant: '钱进', node: '主管审核', status: '审批中', submit: '06-19 10:50', amount: '¥1,299' },
  { id: 'AP-2042', title: 'TK-88240 强制结案', type: '工单强结审批', applicant: '黄勇', node: '已完成', status: '已通过', submit: '06-19 09:30' },
  { id: 'AP-2039', title: '赠品发放申请', type: '补偿审批', applicant: '刘洋', node: '已完成', status: '已通过', submit: '06-18 15:20' },
  { id: 'AP-2035', title: '请假 6/20', type: '请假调班', applicant: '周敏', node: '已驳回', status: '已驳回', submit: '06-18 08:00' },
];
const todo: Req[] = [
  { id: 'AP-2045', title: 'TK-88250 升级二线', type: '工单升级审批', applicant: '陈静', node: '待我审批', status: '审批中', submit: '06-19 11:02' },
  { id: 'AP-2043', title: 'TK-88248 强制结案', type: '工单强结审批', applicant: '黄勇', node: '待我审批', status: '审批中', submit: '06-19 10:35' },
  { id: 'AP-2041', title: 'TK-88231 强制结案', type: '工单强结审批', applicant: '吴婷', node: '待我审批', status: '审批中', submit: '06-19 10:20' },
  { id: 'AP-2040', title: '退款 ¥499', type: '退款审批', applicant: '钱进', node: '待我审批', status: '审批中', submit: '06-19 09:55', amount: '¥499' },
];
const done: Req[] = [
  { id: 'AP-2042', title: 'TK-88240 强制结案', type: '工单强结审批', applicant: '黄勇', node: '已通过', status: '已通过', submit: '06-19 09:30' },
  { id: 'AP-2036', title: '退款 ¥88', type: '退款审批', applicant: '李娜', node: '已驳回', status: '已驳回', submit: '06-18 14:10', amount: '¥88' },
];
const cc: Req[] = [
  { id: 'AP-2044', title: '退款 ¥1,299', type: '退款审批', applicant: '钱进', node: '主管审核', status: '审批中', submit: '06-19 10:50', amount: '¥1,299' },
  { id: 'AP-2037', title: '配置变更：SLA v3.2 上线', type: '配置变更发布', applicant: '王芳', node: '已完成', status: '已通过', submit: '06-18 17:30' },
];
const dataMap = reactive<Record<string, Req[]>>({ mine, team, todo, done, cc });
const rows = computed(() => dataMap[active.value] ?? []);

const activeNav = computed(() => NAV.find((n) => n.key === active.value));

const baseCols = [
  { title: '申请单号', dataIndex: 'id', key: 'id', width: 108 },
  { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
  { title: '类型', dataIndex: 'type', key: 'type', width: 132, ellipsis: true },
  { title: '申请人', dataIndex: 'applicant', key: 'applicant', width: 88 },
  { title: '当前节点', dataIndex: 'node', key: 'node', width: 100 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 88 },
  { title: '提交时间', dataIndex: 'submit', key: 'submit', width: 112 },
  { title: '操作', key: 'op', width: 220 },
];

function moveToDone(r: Req) {
  const i = dataMap.todo.findIndex((x) => x.id === r.id);
  if (i >= 0) dataMap.todo.splice(i, 1);
  dataMap.done.unshift({ ...r });
}
function approve(r: Req) {
  r.status = '已通过';
  r.node = '已完成';
  moveToDone(r);
  message.success(`已通过 ${r.id}`);
}
function reject(r: Req) {
  r.status = '已驳回';
  r.node = '已驳回';
  moveToDone(r);
  message.success(`已驳回 ${r.id}`);
}

const detailOpen = ref(false);
const detailReq = ref<Req | null>(null);
function viewDetail(r: Req) {
  detailReq.value = r;
  detailOpen.value = true;
}
function withdraw(r: Req) {
  r.status = '已撤回';
  r.node = '已撤回';
  message.success(`已撤回 ${r.id}`);
}
</script>

<template>
  <div class="approval-ws">
    <div class="approval-panel">
      <aside class="rail">
        <div class="rail-title">审批中心</div>
        <button
          v-for="n in NAV"
          :key="n.key"
          type="button"
          class="rail-item"
          :class="{ on: active === n.key }"
          @click="active = n.key"
        >
          <component :is="n.icon" class="ri-ic" />
          <span class="ri-label">{{ n.label }}</span>
          <span v-if="n.count" class="ri-count" :class="{ on: active === n.key }">{{ n.count }}</span>
        </button>
      </aside>

      <main class="content">
        <header class="c-head">
          <div>
            <h3>{{ activeNav?.label }}</h3>
            <p v-if="active === 'todo'">需要您审批的申请，按提交时间排序</p>
            <p v-else-if="active === 'team'">本团队成员发起的全部审批申请</p>
            <p v-else-if="active === 'cc'">作为抄送人知会您的审批</p>
            <p v-else-if="active === 'mine'">由业务场景触发的、与您相关的审批申请</p>
            <p v-else-if="active === 'done'">您已处理完成的审批记录</p>
          </div>
        </header>

        <div class="table-wrap">
          <a-table
            :key="active"
            :columns="baseCols"
            :data-source="rows"
            row-key="id"
            :pagination="stdPagination()"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'id'">{{ record.id }}</span>
              <span v-else-if="column.key === 'title'" class="rt">
                {{ record.title }}
                <span v-if="record.amount" class="amt">{{ record.amount }}</span>
              </span>
              <a-tag
                v-else-if="column.key === 'status'"
                :color="STATUS_TONE[record.status]"
                :bordered="false"
              >
                {{ record.status }}
              </a-tag>
              <template v-else-if="column.key === 'op'">
                <a-button type="link" size="small" @click="viewDetail(record as Req)">
                  查看详情
                </a-button>
                <template v-if="active === 'todo'">
                  <a-button type="link" size="small" @click="approve(record as Req)">
                    <template #icon><CheckOutlined /></template>
                    通过
                  </a-button>
                  <a-button type="link" size="small" danger @click="reject(record as Req)">
                    <template #icon><CloseOutlined /></template>
                    驳回
                  </a-button>
                </template>
                <template v-else-if="active === 'mine'">
                  <a-button
                    type="link"
                    size="small"
                    danger
                    :disabled="record.status !== '审批中'"
                    @click="withdraw(record as Req)"
                  >
                    撤回
                  </a-button>
                </template>
              </template>
            </template>
            <template #emptyText>
              <div class="empty">暂无数据</div>
            </template>
          </a-table>
        </div>
      </main>
    </div>

    <a-modal
      v-model:open="detailOpen"
      :title="detailReq ? `审批详情 · ${detailReq.id}` : ''"
      :width="560"
      :footer="null"
    >
      <template v-if="detailReq">
        <a-descriptions :column="2" bordered size="small">
          <a-descriptions-item label="标题" :span="2">{{ detailReq.title }}</a-descriptions-item>
          <a-descriptions-item label="类型">{{ detailReq.type }}</a-descriptions-item>
          <a-descriptions-item label="申请人">{{ detailReq.applicant }}</a-descriptions-item>
          <a-descriptions-item label="当前节点">{{ detailReq.node }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="STATUS_TONE[detailReq.status]" :bordered="false">{{ detailReq.status }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="提交时间" :span="2">{{ detailReq.submit }}</a-descriptions-item>
          <a-descriptions-item v-if="detailReq.amount" label="金额" :span="2">
            {{ detailReq.amount }}
          </a-descriptions-item>
        </a-descriptions>
        <div class="prog-title">审批进度</div>
        <a-steps :current="detailReq.status === '审批中' ? 1 : 2" size="small" direction="vertical">
          <a-step title="提交申请" :description="detailReq.submit" />
          <a-step title="审批中" :description="detailReq.node" />
          <a-step :title="detailReq.status === '已驳回' ? '已驳回' : '审批完成'" />
        </a-steps>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.approval-ws {
  min-height: 100%;
  padding: 16px 20px 20px;
  background: var(--flowos-content-bg, #f9fafb);
}

.approval-panel {
  display: flex;
  min-height: calc(100vh - 128px);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.rail {
  width: 196px;
  flex: none;
  padding: 16px 10px;
  border-right: 1px solid #f0f1f3;
  background: #fafbfc;
}

.rail-title {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  letter-spacing: 0.02em;
  padding: 0 10px 12px;
}

.rail-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  margin-bottom: 2px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  color: #4b5563;
  text-align: left;
  transition: background 0.12s, color 0.12s;
}

.rail-item:hover {
  background: #f3f4f6;
  color: #111827;
}

.rail-item.on {
  background: #fff;
  color: #1a6fff;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.ri-ic {
  font-size: 14px;
  flex: none;
}

.ri-label {
  flex: 1;
  min-width: 0;
}

.ri-count {
  flex: none;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}

.ri-count.on {
  background: #dbeafe;
  color: #1a6fff;
}

.content {
  flex: 1;
  min-width: 0;
  padding: 20px 24px 24px;
}

.c-head {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f1f3;
}

.c-head h3 {
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  line-height: 1.4;
}

.c-head p {
  margin-top: 4px;
  font-size: 13px;
  color: #9ca3af;
  line-height: 1.5;
}

.table-wrap {
  border: 1px solid #eef0f3;
  border-radius: 8px;
  overflow: hidden;
}

.table-wrap :deep(.ant-table) {
  font-size: 13px;
}

.table-wrap :deep(.ant-table-thead > tr > th) {
  background: #fafbfc;
  color: #6b7280;
  font-size: 12px;
  font-weight: 500;
  border-bottom: 1px solid #eef0f3;
}

.table-wrap :deep(.ant-table-tbody > tr > td) {
  border-bottom: 1px solid #f5f6f8;
}

.table-wrap :deep(.ant-table-tbody > tr:last-child > td) {
  border-bottom: none;
}

.table-wrap :deep(.ant-table-tbody > tr:hover > td) {
  background: #fafbfc;
}

.table-wrap :deep(.ant-pagination) {
  margin: 12px 16px 8px;
}

.rt {
  font-weight: 400;
  color: #374151;
}

.amt {
  margin-left: 8px;
  font-size: 12px;
  color: #6b7280;
}

.empty {
  padding: 32px 0;
  color: #9ca3af;
  font-size: 13px;
}

.prog-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin: 18px 0 12px;
}
</style>
