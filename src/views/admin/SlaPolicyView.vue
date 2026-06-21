<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, DeleteOutlined, ThunderboltOutlined,
} from '@ant-design/icons-vue';
import AdminSectionTabs from './components/AdminSectionTabs.vue';
import { SLA_NAV_ITEMS, adminNavActiveKey } from '@/config/adminNav';

const route = useRoute();
const slaActiveKey = computed(() => adminNavActiveKey(route.path));

// SLA 策略（PRD-55）：策略列表 + 四步向导（适用范围 → 双层时限矩阵 → 升级规则 → 计时口径）。

type Unit = '分钟' | '小时' | '工作日';
interface MatrixRow { level: string; respVal: number; respUnit: Unit; solveVal: number | null; solveUnit: Unit; }
interface EscRule { id: number; dim: '响应' | '解决'; cond: string; actions: string[]; }
interface Policy {
  no: string; name: string; types: string[]; channels: string[]; levels: string[];
  calendar: string; priority: number; status: '启用' | '停用'; updatedAt: string;
  matrix: MatrixRow[]; escalations: EscRule[]; pauseStates: string[]; remark: string;
}

const TYPE_OPTS = ['投诉', '咨询', '建议', '商机', '报修', '退换'];
const CHANNEL_OPTS = ['在线客服', '电话', '邮件', '小程序', 'APP'];
const LEVEL_OPTS = ['VIP', '普通', '企业客户', '战略客户'];
const CAL_OPTS = ['标准工作日历(9:00-18:00)', '7×24 自然时间', '售后工作日历'];
const PAUSE_OPTS = ['已挂起·待客户', '待第三方', '待备件', '待审核'];
const UNIT_OPTS: Unit[] = ['分钟', '小时', '工作日'];
const ESC_ACTIONS = ['通知处理人', '通知班组长', '通知指定人', '自动升级二线', '优先级+1', '打升级标记'];

function defMatrix(): MatrixRow[] {
  return [
    { level: 'P0 紧急', respVal: 15, respUnit: '分钟', solveVal: 4, solveUnit: '小时' },
    { level: 'P1 高', respVal: 30, respUnit: '分钟', solveVal: 8, solveUnit: '小时' },
    { level: 'P2 中', respVal: 2, respUnit: '小时', solveVal: 1, solveUnit: '工作日' },
    { level: 'P3 低', respVal: 4, respUnit: '小时', solveVal: 3, solveUnit: '工作日' },
  ];
}

const policies = ref<Policy[]>([
  {
    no: 'SLA001', name: '投诉-VIP 加严', types: ['投诉'], channels: [], levels: ['VIP'],
    calendar: '7×24 自然时间', priority: 1, status: '启用', updatedAt: '2026-06-14 10:20',
    matrix: defMatrix(), escalations: [
      { id: 1, dim: '响应', cond: '剩余 ≤ 25%', actions: ['通知处理人'] },
      { id: 2, dim: '响应', cond: '已超时', actions: ['通知班组长', '打升级标记'] },
    ], pauseStates: ['已挂起·待客户'], remark: 'VIP 投诉走最严时限',
  },
  {
    no: 'SLA002', name: '标准工单默认策略', types: ['全部'], channels: [], levels: [],
    calendar: '标准工作日历(9:00-18:00)', priority: 99, status: '启用', updatedAt: '2026-06-12 09:00',
    matrix: defMatrix(), escalations: [{ id: 1, dim: '解决', cond: '已超时', actions: ['自动升级二线', '优先级+1'] }],
    pauseStates: ['已挂起·待客户', '待第三方'], remark: 'catch-all 默认',
  },
  {
    no: 'SLA003', name: '咨询-标准', types: ['咨询'], channels: ['在线客服', '电话'], levels: [],
    calendar: '标准工作日历(9:00-18:00)', priority: 20, status: '停用', updatedAt: '2026-06-10 16:30',
    matrix: defMatrix(), escalations: [], pauseStates: ['已挂起·待客户'], remark: '',
  },
]);

// 筛选
const fName = ref('');
const fType = ref('全部');
const fStatus = ref('全部');
const applied = reactive({ name: '', type: '全部', status: '全部' });
function onQuery() { applied.name = fName.value; applied.type = fType.value; applied.status = fStatus.value; }
function onReset() { fName.value = ''; fType.value = '全部'; fStatus.value = '全部'; onQuery(); }
const filtered = computed(() => policies.value.filter((p) => {
  if (applied.name && !p.name.includes(applied.name)) return false;
  if (applied.type !== '全部' && !(p.types.includes(applied.type) || p.types.includes('全部'))) return false;
  if (applied.status !== '全部' && p.status !== applied.status) return false;
  return true;
}));

const columns = [
  { title: '策略名称', dataIndex: 'name', key: 'name', width: 160 },
  { title: '适用范围', key: 'scope' },
  { title: '优先级覆盖', key: 'cover', width: 150 },
  { title: '工作日历', dataIndex: 'calendar', key: 'calendar', width: 180 },
  { title: '生效优先级', dataIndex: 'priority', key: 'priority', width: 100 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 150 },
  { title: '操作', key: 'action', width: 200 },
];
function scopeText(p: Policy): string {
  const parts = [p.types.join('/') || '全部', p.channels.length ? p.channels.join('/') : '全渠道'];
  if (p.levels.length) parts.push(p.levels.join('/'));
  return parts.join(' · ');
}
const pagination = { pageSize: 10, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` };

// 向导抽屉
const drawerOpen = ref(false);
const step = ref(0);
const editing = ref<Policy | null>(null);
const form = reactive<Policy>(blankPolicy());
function blankPolicy(): Policy {
  return {
    no: '', name: '', types: [], channels: [], levels: [],
    calendar: CAL_OPTS[0], priority: 50, status: '启用', updatedAt: '',
    matrix: defMatrix(), escalations: [], pauseStates: ['已挂起·待客户'], remark: '',
  };
}
function openNew() {
  editing.value = null;
  Object.assign(form, blankPolicy());
  step.value = 0;
  drawerOpen.value = true;
}
function openEdit(p: Policy) {
  editing.value = p;
  Object.assign(form, JSON.parse(JSON.stringify(p)));
  step.value = 0;
  drawerOpen.value = true;
}
function addEsc() {
  form.escalations.push({ id: Date.now(), dim: '响应', cond: '剩余 ≤ 25%', actions: ['通知处理人'] });
}
function removeEsc(id: number) { form.escalations = form.escalations.filter((e) => e.id !== id); }

function matrixValid(): boolean {
  return form.matrix.every((r) => {
    if (r.respVal <= 0) return false;
    if (r.solveVal != null && r.solveVal > 0) {
      // 解决应 ≥ 响应（粗略按分钟折算）
      const toMin = (v: number, u: Unit) => v * (u === '分钟' ? 1 : u === '小时' ? 60 : 480);
      if (toMin(r.solveVal, r.solveUnit) < toMin(r.respVal, r.respUnit)) return false;
    }
    return true;
  });
}
function save() {
  if (!form.name.trim()) { message.warning('请填写策略名称'); step.value = 0; return; }
  if (!form.types.length) { message.warning('请选择适用工单类型（或全部）'); step.value = 0; return; }
  if (!matrixValid()) { message.warning('时限矩阵不合法：响应须>0，解决须 ≥ 响应'); step.value = 1; return; }
  form.updatedAt = '2026-06-21 12:00';
  if (editing.value) {
    Object.assign(editing.value, JSON.parse(JSON.stringify(form)));
    message.success('已保存');
  } else {
    form.no = `SLA${String(policies.value.length + 1).padStart(3, '0')}`;
    policies.value = [JSON.parse(JSON.stringify(form)), ...policies.value];
    message.success('已创建，新工单即刻参与计时');
  }
  drawerOpen.value = false;
}
function toggle(p: Policy) {
  const next = p.status === '启用' ? '停用' : '启用';
  Modal.confirm({ title: '状态变更', content: `确定${next}「${p.name}」？`, onOk: () => { p.status = next; message.success(`已${next}`); } });
}
function copy(p: Policy) {
  policies.value = [{ ...JSON.parse(JSON.stringify(p)), no: `SLA${String(policies.value.length + 1).padStart(3, '0')}`, name: `${p.name} 副本`, status: '停用' }, ...policies.value];
  message.success('已复制为新策略（停用态）');
}
function del(p: Policy) {
  Modal.confirm({
    title: '确认删除', okText: '删除', okType: 'danger', cancelText: '取消',
    content: `删除策略「${p.name}」后，命中该范围的工单将改走默认策略或失去 SLA 约束。建议优先停用。`,
    onOk: () => { policies.value = policies.value.filter((x) => x.no !== p.no); message.success('已删除'); },
  });
}

// 匹配测试
const testOpen = ref(false);
const testType = ref('投诉');
const testChannel = ref('在线客服');
const testLevel = ref('VIP');
const testResult = computed(() => {
  const hit = policies.value
    .filter((p) => p.status === '启用')
    .filter((p) => p.types.includes('全部') || p.types.includes(testType.value))
    .filter((p) => !p.channels.length || p.channels.includes(testChannel.value))
    .filter((p) => !p.levels.length || p.levels.includes(testLevel.value))
    .sort((a, b) => a.priority - b.priority)[0];
  return hit ?? null;
});
</script>

<template>
  <div class="sla-page">
    <AdminSectionTabs :items="SLA_NAV_ITEMS" :active-key="slaActiveKey" />
    <div class="admin-page">
    <!-- 筛选卡 -->
    <div class="filter-card">
      <div class="filters">
        <div class="fi"><span class="fl">策略名称</span><a-input v-model:value="fName" placeholder="请输入" allow-clear style="width:160px" @press-enter="onQuery" /></div>
        <div class="fi"><span class="fl">适用类型</span><a-select v-model:value="fType" style="width:130px" :options="['全部', ...TYPE_OPTS].map((o) => ({ value: o, label: o }))" /></div>
        <div class="fi"><span class="fl">状态</span><a-select v-model:value="fStatus" style="width:120px" :options="['全部', '启用', '停用'].map((o) => ({ value: o, label: o }))" /></div>
      </div>
      <div class="fa">
        <a-button type="primary" @click="onQuery"><template #icon><SearchOutlined /></template>查询</a-button>
        <a-button @click="onReset"><template #icon><ReloadOutlined /></template>重置</a-button>
      </div>
    </div>

    <!-- 表格卡 -->
    <div class="table-card">
      <div class="toolbar">
        <div class="tb-left"><span class="tb-title">SLA 策略</span><span class="tb-count">共 {{ filtered.length }} 条</span></div>
        <div class="tb-right">
          <a-button @click="testOpen = true"><template #icon><ThunderboltOutlined /></template>匹配测试</a-button>
          <a-button type="primary" @click="openNew"><template #icon><PlusOutlined /></template>新增策略</a-button>
        </div>
      </div>

      <a-table :columns="columns" :data-source="filtered" row-key="no" :pagination="pagination" size="middle">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'name'" class="cell-link" @click="openEdit(record as Policy)">{{ (record as Policy).name }}</span>
          <span v-else-if="column.key === 'scope'">{{ scopeText(record as Policy) }}</span>
          <span v-else-if="column.key === 'cover'">
            <a-tag v-for="m in (record as Policy).matrix" :key="m.level" :color="m.respVal ? 'blue' : 'default'" style="margin:1px">{{ m.level.split(' ')[0] }}</a-tag>
          </span>
          <template v-else-if="column.key === 'status'">
            <span class="status" :class="(record as Policy).status === '启用' ? 'on' : 'off'" @click="toggle(record as Policy)">● {{ (record as Policy).status }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <span class="act primary" @click="openEdit(record as Policy)">编辑</span>
            <span class="act" @click="toggle(record as Policy)">{{ (record as Policy).status === '启用' ? '停用' : '启用' }}</span>
            <span class="act" @click="copy(record as Policy)">复制</span>
            <span class="act danger" @click="del(record as Policy)">删除</span>
          </template>
        </template>
      </a-table>
    </div>

    <!-- 向导抽屉 -->
    <a-drawer
      v-model:open="drawerOpen"
      :title="editing ? '编辑 SLA 策略' : '新增 SLA 策略'"
      width="720"
      :footer-style="{ textAlign: 'right' }"
    >
      <a-steps :current="step" size="small" class="wiz-steps" @change="(s: number) => (step = s)">
        <a-step title="适用范围" />
        <a-step title="双层时限" />
        <a-step title="升级规则" />
        <a-step title="计时口径" />
      </a-steps>

      <!-- 步1 -->
      <div v-show="step === 0" class="wiz-body">
        <a-form layout="vertical">
          <a-row :gutter="16">
            <a-col :span="12"><a-form-item label="策略名称" required><a-input v-model:value="form.name" placeholder="如 投诉-VIP 加严" /></a-form-item></a-col>
            <a-col :span="6"><a-form-item label="生效优先级"><a-input-number v-model:value="form.priority" :min="1" style="width:100%" /></a-form-item></a-col>
            <a-col :span="6"><a-form-item label="状态"><a-radio-group v-model:value="form.status"><a-radio value="启用">启用</a-radio><a-radio value="停用">停用</a-radio></a-radio-group></a-form-item></a-col>
          </a-row>
          <a-form-item label="适用工单类型" required>
            <a-select v-model:value="form.types" mode="multiple" placeholder="选择类型，或选「全部」" :options="['全部', ...TYPE_OPTS].map((o) => ({ value: o, label: o }))" />
          </a-form-item>
          <a-row :gutter="16">
            <a-col :span="12"><a-form-item label="适用渠道（空=全部）"><a-select v-model:value="form.channels" mode="multiple" :options="CHANNEL_OPTS.map((o) => ({ value: o, label: o }))" /></a-form-item></a-col>
            <a-col :span="12"><a-form-item label="客户等级（空=全部）"><a-select v-model:value="form.levels" mode="multiple" :options="LEVEL_OPTS.map((o) => ({ value: o, label: o }))" /></a-form-item></a-col>
          </a-row>
          <a-form-item label="备注"><a-textarea v-model:value="form.remark" :rows="2" /></a-form-item>
          <div class="tip">多策略命中时取「生效优先级」最高（数字最小）一条**唯一生效**，不叠加。</div>
        </a-form>
      </div>

      <!-- 步2 双层时限矩阵 -->
      <div v-show="step === 1" class="wiz-body">
        <div class="sec-title">双层 SLA 时限矩阵<span class="sec-sub">响应时限 / 解决时限 × 优先级（解决须 ≥ 响应；可对某级不设解决时限）</span></div>
        <table class="matrix">
          <thead><tr><th>优先级</th><th>响应时限</th><th>解决时限</th></tr></thead>
          <tbody>
            <tr v-for="m in form.matrix" :key="m.level">
              <td class="lv">{{ m.level }}</td>
              <td>
                <a-input-number v-model:value="m.respVal" :min="0" size="small" style="width:80px" />
                <a-select v-model:value="m.respUnit" size="small" style="width:84px;margin-left:6px" :options="UNIT_OPTS.map((u) => ({ value: u, label: u }))" />
              </td>
              <td>
                <a-input-number v-model:value="m.solveVal" :min="0" size="small" style="width:80px" placeholder="不设" />
                <a-select v-model:value="m.solveUnit" size="small" style="width:84px;margin-left:6px" :options="UNIT_OPTS.map((u) => ({ value: u, label: u }))" />
              </td>
            </tr>
          </tbody>
        </table>
        <div class="tip">响应=创建/分派→首次有效响应；解决=创建→已解决/关闭。二者独立计时、独立判定，工作台「双层倒计时」即源于此。</div>
      </div>

      <!-- 步3 升级规则 -->
      <div v-show="step === 2" class="wiz-body">
        <div class="sec-title">升级规则<span class="sec-sub">计时到达阈值时自动通知/升级，防止超时无人管</span></div>
        <div v-for="e in form.escalations" :key="e.id" class="esc-row">
          <a-select v-model:value="e.dim" size="small" style="width:90px" :options="[{ value: '响应', label: '响应' }, { value: '解决', label: '解决' }]" />
          <a-select v-model:value="e.cond" size="small" style="width:140px" :options="['剩余 ≤ 25%', '剩余 ≤ 10%', '已超时', '超时后每 30 分钟'].map((o) => ({ value: o, label: o }))" />
          <span class="arrow">→</span>
          <a-select v-model:value="e.actions" mode="multiple" size="small" style="flex:1" :options="ESC_ACTIONS.map((o) => ({ value: o, label: o }))" placeholder="选择动作" />
          <DeleteOutlined class="del-ic" @click="removeEsc(e.id)" />
        </div>
        <a-button type="dashed" block @click="addEsc"><template #icon><PlusOutlined /></template>添加升级规则</a-button>
        <div class="tip">示例：响应剩余 25% → 通知处理人；响应超时 → 通知班组长 + 打升级标；解决超时 → 升级二线 + 优先级+1。</div>
      </div>

      <!-- 步4 计时口径 -->
      <div v-show="step === 3" class="wiz-body">
        <a-form layout="vertical">
          <a-form-item label="关联工作日历" required>
            <a-select v-model:value="form.calendar" :options="CAL_OPTS.map((o) => ({ value: o, label: o }))" />
            <div class="hint">时限按工作时间推进；非工作时段不计入（除非选 7×24 自然时间）。</div>
          </a-form-item>
          <a-form-item label="暂停状态集（停表）">
            <a-select v-model:value="form.pauseStates" mode="multiple" :options="PAUSE_OPTS.map((o) => ({ value: o, label: o }))" />
            <div class="hint">这些状态停止 SLA 计时，恢复后续算（如挂起·待客户）。</div>
          </a-form-item>
          <div class="tip">已拍板：待回访停整单解决计时、单独起回访时限；已结案/已关闭不再计时（PRD-55 §9）。</div>
        </a-form>
      </div>

      <template #footer>
        <a-button v-if="step > 0" @click="step--">上一步</a-button>
        <a-button v-if="step < 3" type="primary" @click="step++">下一步</a-button>
        <a-button v-else type="primary" @click="save">保存策略</a-button>
      </template>
    </a-drawer>

    <!-- 匹配测试 -->
    <a-modal v-model:open="testOpen" title="SLA 策略匹配测试" :footer="null" width="460">
      <div class="test-body">
        <div class="fi"><span class="fl">工单类型</span><a-select v-model:value="testType" style="width:160px" :options="TYPE_OPTS.map((o) => ({ value: o, label: o }))" /></div>
        <div class="fi"><span class="fl">渠道</span><a-select v-model:value="testChannel" style="width:160px" :options="CHANNEL_OPTS.map((o) => ({ value: o, label: o }))" /></div>
        <div class="fi"><span class="fl">客户等级</span><a-select v-model:value="testLevel" style="width:160px" :options="LEVEL_OPTS.map((o) => ({ value: o, label: o }))" /></div>
        <div class="test-result">
          <template v-if="testResult">命中策略：<b>{{ testResult.name }}</b>（生效优先级 {{ testResult.priority }}）</template>
          <template v-else><span class="miss">无命中——该工单将无 SLA 约束，建议配置默认策略</span></template>
        </div>
      </div>
    </a-modal>
    </div>
  </div>
</template>

<style scoped>
.sla-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.admin-page { display: flex; flex-direction: column; gap: 16px; padding: 16px 24px; }
.filter-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.filters { display: flex; gap: 16px; flex-wrap: wrap; }
.fi { display: flex; align-items: center; gap: 8px; }
.fl { font-size: 12px; color: #6b7280; white-space: nowrap; }
.fa { display: flex; gap: 8px; }
.table-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; }
.tb-left { display: flex; align-items: baseline; gap: 10px; }
.tb-title { font-size: 14px; font-weight: 600; color: #111827; }
.tb-count { font-size: 12px; color: #9ca3af; }
.tb-right { display: flex; gap: 8px; }
.act { font-size: 13px; color: #6b7280; cursor: pointer; margin-right: 12px; }
.act.primary { color: #1a6fff; } .act.danger { color: #ef4444; } .act:hover { opacity: 0.7; }
.cell-link { color: #1a6fff; cursor: pointer; }
.status { cursor: pointer; font-size: 13px; } .status.on { color: #10b981; } .status.off { color: #9ca3af; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }

.wiz-steps { margin-bottom: 20px; }
.wiz-body { min-height: 320px; }
.sec-title { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 12px; }
.sec-sub { font-size: 12px; font-weight: normal; color: #9ca3af; margin-left: 8px; }
.matrix { width: 100%; border-collapse: collapse; }
.matrix th { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; text-align: left; padding: 8px 10px; border: 1px solid #e5e7eb; }
.matrix td { padding: 8px 10px; border: 1px solid #e5e7eb; }
.matrix td.lv { font-weight: 600; color: #374151; width: 110px; }
.esc-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.esc-row .arrow { color: #9ca3af; }
.del-ic { color: #ef4444; cursor: pointer; flex: none; }
.tip { margin-top: 12px; font-size: 12px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px; line-height: 1.6; }
.hint { font-size: 11px; color: #9ca3af; margin-top: 4px; }
.test-body { display: flex; flex-direction: column; gap: 12px; }
.test-result { margin-top: 8px; padding: 12px; background: #f0f6ff; border: 1px solid #bfdbfe; border-radius: 8px; font-size: 13px; }
.test-result .miss { color: #b45309; }
</style>
