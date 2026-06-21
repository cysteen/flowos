<script setup lang="ts">
import { computed, ref, reactive } from 'vue';
import { useRoute } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons-vue';
import AdminSectionTabs from './components/AdminSectionTabs.vue';
import { adminNavActiveKey } from '@/config/adminNav';
import { stdPagination } from '@/config/adminUi';

// 工作流引擎（PRD-71~74）：流程实例 / 流程任务 / 流程监听器 / 流程表达式。
const route = useRoute();
const activeKey = computed(() => adminNavActiveKey(route.path));
const TABS = [
  { key: 'flow-instances', label: '流程实例' },
  { key: 'flow-tasks', label: '流程任务' },
  { key: 'flow-listeners', label: '流程监听器' },
  { key: 'flow-expressions', label: '流程表达式' },
];

/* 流程实例 */
const instStatus = ref('全部');
const instances = ref([
  { id: 'PI-20260619-001', ticket: 'TK-88231', def: '标准投诉处理 v3.2', node: '二线处理', status: '运行中', start: '06-19 09:12', cost: '2h13m' },
  { id: 'PI-20260619-002', ticket: 'TK-88245', def: '咨询快速处理 v2.0', node: '回访', status: '运行中', start: '06-19 10:40', cost: '45m' },
  { id: 'PI-20260618-118', ticket: 'TK-88102', def: '售后退换货 v2.3', node: '班长审核', status: '已挂起', start: '06-18 16:20', cost: '18h' },
  { id: 'PI-20260618-090', ticket: 'TK-88044', def: '标准投诉处理 v3.2', node: '结案', status: '已完成', start: '06-18 11:05', cost: '5h22m' },
  { id: 'PI-20260617-077', ticket: 'TK-87990', def: '三级升级审批 v1.4', node: '终止', status: '已终止', start: '06-17 14:30', cost: '—' },
]);
const instList = computed(() => instStatus.value === '全部' ? instances.value : instances.value.filter((i) => i.status === instStatus.value));
const INST_TONE: Record<string, string> = { 运行中: 'blue', 已挂起: 'orange', 已完成: 'green', 已终止: 'default' };
const instCols = [
  { title: '实例ID', dataIndex: 'id', key: 'id', width: 170 },
  { title: '关联工单', dataIndex: 'ticket', key: 'ticket', width: 110 },
  { title: '流程定义', dataIndex: 'def', key: 'def' },
  { title: '当前节点', dataIndex: 'node', key: 'node', width: 110 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '发起', dataIndex: 'start', key: 'start', width: 110 },
  { title: '耗时', dataIndex: 'cost', key: 'cost', width: 90 },
  { title: '操作', key: 'op', width: 160 },
];

/* 流程任务 */
const tasks = ref([
  { id: 'T-5521', inst: 'PI-20260619-001', name: '二线处理', assignee: '李强', due: '06-19 18:00', status: '处理中' },
  { id: 'T-5522', inst: 'PI-20260619-002', name: '满意度回访', assignee: '（待认领）', due: '06-20 12:00', status: '待认领' },
  { id: 'T-5510', inst: 'PI-20260618-118', name: '班长审核', assignee: '王芳', due: '06-19 12:00', status: '已逾期' },
]);
const TASK_TONE: Record<string, string> = { 处理中: 'blue', 待认领: 'orange', 已逾期: 'red', 已完成: 'green' };
const taskCols = [
  { title: '任务ID', dataIndex: 'id', key: 'id', width: 100 },
  { title: '所属实例', dataIndex: 'inst', key: 'inst', width: 170 },
  { title: '任务名', dataIndex: 'name', key: 'name', width: 130 },
  { title: '办理人', dataIndex: 'assignee', key: 'assignee', width: 120 },
  { title: '到期', dataIndex: 'due', key: 'due', width: 120 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '操作', key: 'op', width: 200 },
];

/* 监听器 */
const listeners = ref([
  { id: 1, name: '工单创建同步CRM', event: '流程启动', node: '开始', impl: 'CrmSyncListener', status: true },
  { id: 2, name: '升级飞书通知', event: '节点进入', node: '二线处理', impl: 'FeishuNotifyListener', status: true },
  { id: 3, name: '结案归档', event: '流程结束', node: '结案', impl: 'ArchiveListener', status: true },
  { id: 4, name: '超时计数', event: '任务超时', node: '*', impl: 'OverdueCounterListener', status: false },
]);
const EVENTS = ['流程启动', '流程结束', '节点进入', '节点离开', '任务创建', '任务完成', '任务超时'];
const lsnCols = [
  { title: '监听器名称', dataIndex: 'name', key: 'name' },
  { title: '事件类型', dataIndex: 'event', key: 'event', width: 120 },
  { title: '触发节点', dataIndex: 'node', key: 'node', width: 120 },
  { title: '执行类', dataIndex: 'impl', key: 'impl', width: 200 },
  { title: '启用', dataIndex: 'status', key: 'status', width: 80 },
  { title: '操作', key: 'op', width: 110 },
];
function addListener() { listeners.value.push({ id: Date.now(), name: '新监听器', event: '节点进入', node: '*', impl: 'CustomListener', status: false }); }
function delListener(id: number) { listeners.value = listeners.value.filter((l) => l.id !== id); }

/* 表达式 */
const exprs = ref([
  { id: 1, name: '是否VIP升级', expr: "${customer.level == 'VIP' && ticket.priority >= 'P1'}", use: '升级网关条件', ret: 'Boolean' },
  { id: 2, name: '处理时限', expr: "${ticket.priority == 'P0' ? 4 : 24}", use: 'SLA 解决时限(h)', ret: 'Number' },
  { id: 3, name: '分派班组', expr: "${ticket.app == '售后服务' ? 'team_aftersale' : 'team_first'}", use: '任务分派目标', ret: 'String' },
]);
const exprCols = [
  { title: '名称', dataIndex: 'name', key: 'name', width: 140 },
  { title: '表达式', dataIndex: 'expr', key: 'expr' },
  { title: '用途', dataIndex: 'use', key: 'use', width: 150 },
  { title: '返回', dataIndex: 'ret', key: 'ret', width: 90 },
  { title: '操作', key: 'op', width: 110 },
];
function addExpr() { exprs.value.push({ id: Date.now(), name: '新表达式', expr: '${}', use: '', ret: 'Boolean' }); }
function delExpr(id: number) { exprs.value = exprs.value.filter((e) => e.id !== id); }

// —— 流程实例操作 ——
const flowOpen = ref(false);
const flowInst = ref<any>(null);
function viewFlow(r: any) { flowInst.value = r; flowOpen.value = true; }
function suspendInst(r: any) { r.status = '已挂起'; message.success(`实例 ${r.id} 已挂起`); }
function terminateInst(r: any) {
  Modal.confirm({
    title: '终止流程实例', icon: null, content: `确定终止实例「${r.id}」？终止后不可恢复。`,
    okText: '确认终止', okType: 'danger', cancelText: '取消',
    onOk: () => { r.status = '已终止'; r.node = '终止'; message.success('实例已终止'); },
  });
}

// —— 流程任务操作 ——
function claimTask(r: any) { r.assignee = '我'; r.status = '处理中'; message.success(`已认领任务 ${r.id}`); }
function handleTask(r: any) { r.status = '已完成'; message.success(`任务 ${r.id} 已办理完成`); }
const transferOpen = ref(false);
const transferTask = ref<any>(null);
const transferTo = ref('李强');
const STAFF = ['李强', '王芳', '陈静', '杨帆', '赵敏'];
function openTransfer(r: any) { transferTask.value = r; transferTo.value = STAFF[0]; transferOpen.value = true; }
function doTransfer() { if (transferTask.value) { transferTask.value.assignee = transferTo.value; transferTask.value.status = '处理中'; message.success(`已转办给 ${transferTo.value}`); } transferOpen.value = false; }

// —— 监听器 / 表达式 编辑 ——
const lsnModalOpen = ref(false);
const lf = reactive<any>({});
function editListener(r: any) { Object.assign(lf, { ...r }); lsnModalOpen.value = true; }
function saveListener() { const i = listeners.value.findIndex((x) => x.id === lf.id); if (i >= 0) listeners.value[i] = { ...lf }; message.success('监听器已更新'); lsnModalOpen.value = false; }
const exprModalOpen = ref(false);
const xf = reactive<any>({});
function editExpr(r: any) { Object.assign(xf, { ...r }); exprModalOpen.value = true; }
function saveExpr() { const i = exprs.value.findIndex((x) => x.id === xf.id); if (i >= 0) exprs.value[i] = { ...xf }; message.success('表达式已更新'); exprModalOpen.value = false; }
</script>

<template>
  <div class="wf-engine">
    <AdminSectionTabs :tabs="TABS" :active-key="activeKey" />
    <div class="content">
      <!-- 流程实例 -->
      <template v-if="activeKey === 'flow-instances'">
        <div class="bar">
          <a-segmented v-model:value="instStatus" :options="['全部','运行中','已挂起','已完成','已终止']" />
          <a-input-search placeholder="搜索实例ID/工单号" style="width: 240px" />
        </div>
        <a-table :columns="instCols" :data-source="instList" row-key="id" :pagination="stdPagination()" size="middle">
          <template #bodyCell="{ column, record }">
            <a-tag v-if="column.key === 'status'" :color="INST_TONE[record.status]">{{ record.status }}</a-tag>
            <template v-else-if="column.key === 'op'">
              <a-button type="link" size="small" @click="viewFlow(record)">流程图</a-button>
              <a-button type="link" size="small" :disabled="record.status!=='运行中'" @click="suspendInst(record)">挂起</a-button>
              <a-button type="link" size="small" danger :disabled="['已完成','已终止'].includes(record.status)" @click="terminateInst(record)">终止</a-button>
            </template>
          </template>
        </a-table>
      </template>

      <!-- 流程任务 -->
      <template v-else-if="activeKey === 'flow-tasks'">
        <a-table :columns="taskCols" :data-source="tasks" row-key="id" :pagination="stdPagination()" size="middle">
          <template #bodyCell="{ column, record }">
            <a-tag v-if="column.key === 'status'" :color="TASK_TONE[record.status]">{{ record.status }}</a-tag>
            <template v-else-if="column.key === 'op'">
              <a-button type="link" size="small" :disabled="record.status!=='待认领'" @click="claimTask(record)">认领</a-button>
              <a-button type="link" size="small" @click="handleTask(record)">办理</a-button>
              <a-button type="link" size="small" @click="openTransfer(record)">转办</a-button>
            </template>
          </template>
        </a-table>
      </template>

      <!-- 监听器 -->
      <template v-else-if="activeKey === 'flow-listeners'">
        <div class="bar"><span class="bar-tip">在流程生命周期事件上挂接执行逻辑（同步CRM、通知、归档等）</span><a-button type="primary" @click="addListener"><template #icon><PlusOutlined /></template>新增监听器</a-button></div>
        <a-table :columns="lsnCols" :data-source="listeners" row-key="id" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <a-tag v-if="column.key === 'event'" color="purple">{{ record.event }}</a-tag>
            <span v-else-if="column.key === 'impl'" class="mono">{{ record.impl }}</span>
            <a-switch v-else-if="column.key === 'status'" v-model:checked="record.status" size="small" />
            <template v-else-if="column.key === 'op'">
              <EditOutlined class="op-ic" @click="editListener(record)" /><DeleteOutlined class="op-ic danger" @click="delListener(record.id)" />
            </template>
          </template>
        </a-table>
      </template>

      <!-- 表达式 -->
      <template v-else>
        <div class="bar"><span class="bar-tip">流程网关条件、分派目标、动态时限等使用的 EL 表达式，集中管理便于复用</span><a-button type="primary" @click="addExpr"><template #icon><PlusOutlined /></template>新增表达式</a-button></div>
        <a-table :columns="exprCols" :data-source="exprs" row-key="id" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <code v-if="column.key === 'expr'" class="expr">{{ record.expr }}</code>
            <a-tag v-else-if="column.key === 'ret'" color="cyan">{{ record.ret }}</a-tag>
            <template v-else-if="column.key === 'op'">
              <EditOutlined class="op-ic" @click="editExpr(record)" /><DeleteOutlined class="op-ic danger" @click="delExpr(record.id)" />
            </template>
          </template>
        </a-table>
      </template>
    </div>

    <!-- 流程图 -->
    <a-modal v-model:open="flowOpen" :title="flowInst ? `流程图 · ${flowInst.id}` : ''" :width="640" :footer="null">
      <template v-if="flowInst">
        <a-descriptions :column="2" bordered size="small" style="margin-bottom:16px">
          <a-descriptions-item label="流程定义">{{ flowInst.def }}</a-descriptions-item>
          <a-descriptions-item label="状态">{{ flowInst.status }}</a-descriptions-item>
          <a-descriptions-item label="关联工单">{{ flowInst.ticket }}</a-descriptions-item>
          <a-descriptions-item label="当前节点">{{ flowInst.node }}</a-descriptions-item>
        </a-descriptions>
        <div class="flow-strip">
          <template v-for="(n, i) in ['受理','处理','审核','回访','结案']" :key="n">
            <span class="fs-node" :class="{ on: n === flowInst.node || (flowInst.node==='二线处理' && n==='处理') || (flowInst.node==='班长审核' && n==='审核') }">{{ n }}</span>
            <span v-if="i < 4" class="fs-arrow">→</span>
          </template>
        </div>
      </template>
    </a-modal>

    <!-- 转办 -->
    <a-modal v-model:open="transferOpen" title="转办任务" :width="420" ok-text="转办" cancel-text="取消" @ok="doTransfer">
      <a-form layout="vertical">
        <a-form-item label="转办给"><a-select v-model:value="transferTo" :options="STAFF.map((v)=>({value:v,label:v}))" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 编辑监听器 -->
    <a-modal v-model:open="lsnModalOpen" title="编辑监听器" :width="520" ok-text="保存" cancel-text="取消" @ok="saveListener">
      <a-form layout="vertical">
        <a-form-item label="名称"><a-input v-model:value="lf.name" /></a-form-item>
        <a-form-item label="事件类型"><a-select v-model:value="lf.event" :options="EVENTS.map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="触发节点"><a-input v-model:value="lf.node" /></a-form-item>
        <a-form-item label="执行类"><a-input v-model:value="lf.impl" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 编辑表达式 -->
    <a-modal v-model:open="exprModalOpen" title="编辑表达式" :width="520" ok-text="保存" cancel-text="取消" @ok="saveExpr">
      <a-form layout="vertical">
        <a-form-item label="名称"><a-input v-model:value="xf.name" /></a-form-item>
        <a-form-item label="表达式"><a-textarea v-model:value="xf.expr" :rows="2" /></a-form-item>
        <a-form-item label="用途"><a-input v-model:value="xf.use" /></a-form-item>
        <a-form-item label="返回类型"><a-select v-model:value="xf.ret" :options="['Boolean','Number','String'].map((v)=>({value:v,label:v}))" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.wf-engine { padding: 0; }
.content { padding: 16px 24px; }
.bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 16px; }
.bar-tip { font-size: 13px; color: #6b7280; }
.mono, .expr { font-family: ui-monospace, monospace; font-size: 12px; }
.expr { background: #f6f8fa; color: #0550ae; padding: 2px 8px; border-radius: 5px; display: inline-block; }
.op-ic { color: #6b7280; cursor: pointer; margin-right: 12px; } .op-ic.danger { color: #ef4444; } .op-ic:hover { opacity: 0.7; }
.flow-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 16px; background: #f9fafb; border-radius: 8px; }
.fs-node { padding: 8px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; color: #6b7280; }
.fs-node.on { border-color: #1a6fff; color: #1a6fff; font-weight: 600; background: #eff6ff; }
.fs-arrow { color: #cbd5e1; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
