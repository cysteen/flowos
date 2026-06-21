<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { message } from 'ant-design-vue';
import {
  PlusOutlined, FileTextOutlined, SendOutlined, TeamOutlined,
  ClockCircleOutlined, CheckCircleOutlined, BellOutlined, CheckOutlined, CloseOutlined,
} from '@ant-design/icons-vue';

// BPM 审批中心（运行工作区，PRD-BPM）：发起/我的/团队/待办/已办/抄送。
const NAV = [
  { key: 'launch', label: '发起审批', icon: SendOutlined, count: 0 },
  { key: 'mine', label: '我的申请', icon: FileTextOutlined, count: 3 },
  { key: 'team', label: '团队审批', icon: TeamOutlined, count: 5 },
  { key: 'todo', label: '待我审批', icon: ClockCircleOutlined, count: 4 },
  { key: 'done', label: '我已审批', icon: CheckCircleOutlined, count: 0 },
  { key: 'cc', label: '抄送我的', icon: BellOutlined, count: 2 },
];
const active = ref('todo');

/* 发起审批：审批类型卡片 */
const launchTypes = [
  { key: 'force-close', name: '工单强结审批', desc: '未达解决标准强制结案，需班长审批', icon: '🔒', color: '#ef4444' },
  { key: 'escalate', name: '工单升级审批', desc: '升级至二线/主管，附升级理由', icon: '⬆️', color: '#f59e0b' },
  { key: 'refund', name: '退款审批', desc: '售后退款，按金额分级审批', icon: '💰', color: '#10b981' },
  { key: 'compensate', name: '补偿审批', desc: '客户补偿/赠品发放申请', icon: '🎁', color: '#7c3aed' },
  { key: 'leave', name: '请假调班', desc: '坐席请假与排班调整', icon: '📅', color: '#1a6fff' },
  { key: 'config', name: '配置变更发布', desc: 'SLA/规则/类型变更上线审批', icon: '⚙️', color: '#0ea5e9' },
];

/* 通用申请数据 */
interface Req { id: string; title: string; type: string; applicant: string; node: string; status: '审批中' | '已通过' | '已驳回' | '已撤回'; submit: string; amount?: string; }
const STATUS_TONE: Record<string, string> = { 审批中: 'blue', 已通过: 'green', 已驳回: 'red', 已撤回: 'default' };

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

const baseCols = [
  { title: '申请单号', dataIndex: 'id', key: 'id', width: 110 },
  { title: '标题', dataIndex: 'title', key: 'title' },
  { title: '类型', dataIndex: 'type', key: 'type', width: 150 },
  { title: '申请人', dataIndex: 'applicant', key: 'applicant', width: 90 },
  { title: '当前节点', dataIndex: 'node', key: 'node', width: 110 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '提交时间', dataIndex: 'submit', key: 'submit', width: 120 },
  { title: '操作', key: 'op', width: 160 },
];

let apSeq = 2050;
function moveToDone(r: Req) {
  const i = dataMap.todo.findIndex((x) => x.id === r.id);
  if (i >= 0) dataMap.todo.splice(i, 1);
  dataMap.done.unshift({ ...r });
}
function approve(r: Req) { r.status = '已通过'; r.node = '已完成'; moveToDone(r); message.success(`已通过 ${r.id}`); }
function reject(r: Req) { r.status = '已驳回'; r.node = '已驳回'; moveToDone(r); message.success(`已驳回 ${r.id}`); }

// —— 发起审批（真实写入「我的申请」）——
const launchOpen = ref(false);
const lf = reactive({ name: '', reason: '', amount: '' });
function startApproval(name: string) { lf.name = name; lf.reason = ''; lf.amount = ''; launchOpen.value = true; }
function submitLaunch() {
  if (!lf.reason) { message.error('请填写申请说明'); return; }
  const id = 'AP-' + apSeq++;
  dataMap.mine.unshift({ id, title: lf.reason.slice(0, 24), type: lf.name, applicant: '我', node: '审批中', status: '审批中', submit: '06-21 12:00', amount: lf.amount || undefined });
  message.success(`已发起「${lf.name}」`);
  launchOpen.value = false;
  active.value = 'mine';
}

// —— 进度/详情 + 撤回 ——
const detailOpen = ref(false);
const detailReq = ref<Req | null>(null);
function viewDetail(r: Req) { detailReq.value = r; detailOpen.value = true; }
function withdraw(r: Req) { r.status = '已撤回'; r.node = '已撤回'; message.success(`已撤回 ${r.id}`); }
</script>

<template>
  <div class="approval-ws">
    <!-- 左侧子导航 -->
    <div class="rail">
      <div class="rail-title">审批中心</div>
      <div v-for="n in NAV" :key="n.key" class="rail-item" :class="{ on: active === n.key }" @click="active = n.key">
        <component :is="n.icon" class="ri-ic" />
        <span class="ri-label">{{ n.label }}</span>
        <a-badge v-if="n.count" :count="n.count" :number-style="{ backgroundColor: active === n.key ? '#1a6fff' : '#f59e0b' }" />
      </div>
    </div>

    <!-- 右侧内容 -->
    <div class="content">
      <!-- 发起审批 -->
      <template v-if="active === 'launch'">
        <div class="c-head"><h3>发起审批</h3><p>选择审批类型，填写表单并提交至对应审批流</p></div>
        <div class="launch-grid">
          <div v-for="t in launchTypes" :key="t.key" class="launch-card" @click="startApproval(t.name)">
            <div class="lc-ic" :style="{ background: t.color }">{{ t.icon }}</div>
            <div class="lc-name">{{ t.name }}</div>
            <div class="lc-desc">{{ t.desc }}</div>
            <a-button type="primary" ghost size="small" block><template #icon><PlusOutlined /></template>发起</a-button>
          </div>
        </div>
      </template>

      <!-- 列表型 -->
      <template v-else>
        <div class="c-head">
          <h3>{{ NAV.find((n) => n.key === active)?.label }}</h3>
          <p v-if="active === 'todo'">需要您审批的申请，按提交时间排序</p>
          <p v-else-if="active === 'team'">本团队成员发起的全部审批申请</p>
          <p v-else-if="active === 'cc'">作为抄送人知会您的审批</p>
        </div>
        <a-table :columns="baseCols" :data-source="rows" row-key="id" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <code v-if="column.key === 'id'" class="mono">{{ record.id }}</code>
            <span v-else-if="column.key === 'title'" class="rt">{{ record.title }}<a-tag v-if="record.amount" color="green" class="amt">{{ record.amount }}</a-tag></span>
            <a-tag v-else-if="column.key === 'status'" :color="STATUS_TONE[record.status]">{{ record.status }}</a-tag>
            <template v-else-if="column.key === 'op'">
              <template v-if="active === 'todo'">
                <a-button type="primary" size="small" @click="approve(record as Req)"><template #icon><CheckOutlined /></template>通过</a-button>
                <a-button danger size="small" style="margin-left:8px" @click="reject(record as Req)"><template #icon><CloseOutlined /></template>驳回</a-button>
              </template>
              <template v-else-if="active === 'mine'">
                <a-button type="link" size="small" @click="viewDetail(record as Req)">进度</a-button>
                <a-button type="link" size="small" danger :disabled="record.status !== '审批中'" @click="withdraw(record as Req)">撤回</a-button>
              </template>
              <a-button v-else type="link" size="small" @click="viewDetail(record as Req)">详情</a-button>
            </template>
          </template>
        </a-table>
      </template>
    </div>

    <!-- 发起审批 -->
    <a-modal v-model:open="launchOpen" :title="`发起 · ${lf.name}`" :width="520" ok-text="提交申请" cancel-text="取消" @ok="submitLaunch">
      <a-form layout="vertical">
        <a-form-item label="申请说明" required><a-textarea v-model:value="lf.reason" :rows="3" placeholder="填写申请事由（如：TK-88231 客户已离线无法继续，申请强结）" /></a-form-item>
        <a-form-item label="金额（如涉及）"><a-input v-model:value="lf.amount" placeholder="如：¥200" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 进度 / 详情 -->
    <a-modal v-model:open="detailOpen" :title="detailReq ? `审批详情 · ${detailReq.id}` : ''" :width="560" :footer="null">
      <template v-if="detailReq">
        <a-descriptions :column="2" bordered size="small">
          <a-descriptions-item label="标题" :span="2">{{ detailReq.title }}</a-descriptions-item>
          <a-descriptions-item label="类型">{{ detailReq.type }}</a-descriptions-item>
          <a-descriptions-item label="申请人">{{ detailReq.applicant }}</a-descriptions-item>
          <a-descriptions-item label="当前节点">{{ detailReq.node }}</a-descriptions-item>
          <a-descriptions-item label="状态"><a-tag :color="STATUS_TONE[detailReq.status]">{{ detailReq.status }}</a-tag></a-descriptions-item>
          <a-descriptions-item label="提交时间" :span="2">{{ detailReq.submit }}</a-descriptions-item>
          <a-descriptions-item v-if="detailReq.amount" label="金额" :span="2">{{ detailReq.amount }}</a-descriptions-item>
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
.approval-ws { display: flex; gap: 16px; padding: 16px 24px; align-items: flex-start; min-height: 100%; }
.rail { width: 200px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; }
.rail-title { font-size: 13px; font-weight: 600; color: #9ca3af; padding: 6px 10px 12px; }
.prog-title { font-size: 13px; font-weight: 600; color: #374151; margin: 18px 0 12px; }
.rail-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; color: #4b5563; margin-bottom: 2px; }
.rail-item:hover { background: #f9fafb; }
.rail-item.on { background: #eff6ff; color: #1a6fff; font-weight: 600; }
.ri-ic { font-size: 15px; }
.ri-label { flex: 1; }
.content { flex: 1; min-width: 0; }
.c-head { margin-bottom: 16px; }
.c-head h3 { font-size: 16px; font-weight: 600; color: #111827; }
.c-head p { font-size: 13px; color: #6b7280; margin-top: 2px; }
.launch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.launch-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px; cursor: pointer; transition: all 0.15s; }
.launch-card:hover { border-color: #1a6fff; box-shadow: 0 4px 16px rgba(26,111,255,0.08); }
.lc-ic { width: 44px; height: 44px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 22px; margin-bottom: 12px; }
.lc-name { font-size: 14px; font-weight: 600; color: #111827; }
.lc-desc { font-size: 12px; color: #6b7280; margin: 6px 0 14px; line-height: 1.5; min-height: 32px; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; color: #0550ae; }
.rt { font-weight: 500; color: #374151; } .amt { margin-left: 8px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
