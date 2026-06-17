<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, EyeOutlined, ClockCircleOutlined, ExclamationCircleFilled,
} from '@ant-design/icons-vue';
import {
  TENANTS, SIM_ORG_TREE, SIM_USERS, type Tenant, type SimUser,
} from '@/mock/platformAdmin';

const tenants = ref<Tenant[]>(JSON.parse(JSON.stringify(TENANTS)));

// ---- 筛选 ----
const search = ref('');
const statusFilter = ref('');
const filtered = computed(() =>
  tenants.value.filter((t) => {
    if (search.value && !t.name.includes(search.value) && !t.code.includes(search.value)) return false;
    if (statusFilter.value && t.status !== statusFilter.value) return false;
    return true;
  }),
);
const stats = computed(() => ({
  total: tenants.value.length,
  active: tenants.value.filter((t) => t.status === 'active').length,
  suspended: tenants.value.filter((t) => t.status === 'suspended').length,
}));

const columns = [
  { title: '租户名称', key: 'name' },
  { title: '编码', key: 'code', width: 110 },
  { title: '状态', key: 'status', width: 90 },
  { title: '管理员', key: 'admin', width: 170 },
  { title: '创建时间', key: 'createdAt', width: 120 },
  { title: '操作', key: 'action', width: 260 },
];

// ---- 创建 / 编辑 ----
const showTenantModal = ref(false);
const editing = ref<Tenant | null>(null);
const form = reactive({ name: '', code: '', adminEmail: '', orderLimit: 1000, apiLimit: 10000, storageLimit: 50 });
function openCreate() {
  editing.value = null;
  Object.assign(form, { name: '', code: '', adminEmail: '', orderLimit: 1000, apiLimit: 10000, storageLimit: 50 });
  showTenantModal.value = true;
}
function openEdit(t: Tenant) {
  editing.value = t;
  Object.assign(form, { name: t.name, code: t.code, adminEmail: t.admin, orderLimit: t.quota.orderLimit, apiLimit: t.quota.apiLimit, storageLimit: t.quota.storageLimit });
  showTenantModal.value = true;
}
function saveTenant() {
  if (!form.name || !form.code || !form.adminEmail) {
    message.error('请填写必填项');
    return;
  }
  if (editing.value) {
    const t = editing.value;
    t.name = form.name; t.code = form.code; t.admin = form.adminEmail;
    t.quota.orderLimit = form.orderLimit; t.quota.apiLimit = form.apiLimit; t.quota.storageLimit = form.storageLimit;
    message.success('租户信息已更新');
  } else {
    const colors = ['#1A6FFF', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
    tenants.value.unshift({
      id: 't' + (tenants.value.length + 1), name: form.name, code: form.code, status: 'active', admin: form.adminEmail,
      createdAt: '2026-06-17', color: colors[tenants.value.length % colors.length],
      quota: { orderLimit: form.orderLimit, orderUsed: 0, orderPct: 0, apiLimit: form.apiLimit, apiUsed: 0, apiPct: 0, storageLimit: form.storageLimit, storageUsed: 0, storagePct: 0 },
      logs: [{ time: '2026-06-17 12:00', action: '创建租户', user: 'admin' }],
    });
    message.success('租户创建成功');
  }
  showTenantModal.value = false;
}
function toggleStatus(t: Tenant) {
  t.status = t.status === 'active' ? 'suspended' : 'active';
  message.success(t.status === 'active' ? '租户已启用' : '租户已停用');
}
function delTenant(t: Tenant) {
  Modal.confirm({
    title: '确认删除', icon: null,
    content: `确定要删除租户「${t.name}」吗？此操作不可恢复。`,
    okText: '确认删除', okType: 'danger', cancelText: '取消',
    onOk: () => { tenants.value = tenants.value.filter((x) => x.id !== t.id); message.success('租户已删除'); },
  });
}

// ---- 详情抽屉 ----
const detail = ref<Tenant | null>(null);

// ---- 模拟角色 ----
const showSimulate = ref(false);
const simTenant = ref<Tenant | null>(null);
const simActiveDept = ref('dept1');
const simUserSearch = ref('');
const simRoleFilter = ref('');
const simFilteredUsers = computed(() => {
  let list = SIM_USERS.filter((u) => u.dept === simActiveDept.value);
  if (simUserSearch.value) {
    const kw = simUserSearch.value.toLowerCase();
    list = list.filter((u) => u.name.includes(kw) || u.empId.toLowerCase().includes(kw));
  }
  if (simRoleFilter.value) list = list.filter((u) => u.role === simRoleFilter.value);
  return list;
});
function openSimulate(t: Tenant) {
  if (t.status !== 'active') return;
  simTenant.value = t; simActiveDept.value = 'dept1'; simUserSearch.value = ''; simRoleFilter.value = '';
  showSimulate.value = true;
}

// ---- 模拟确认 ----
const showSimConfirm = ref(false);
const simUser = ref<SimUser | null>(null);
const simDuration = ref('30');
const simReasonType = ref('');
const simReasonDetail = ref('');
function selectSimUser(u: SimUser) {
  simUser.value = u; simReasonType.value = ''; simReasonDetail.value = ''; simDuration.value = '30';
  showSimulate.value = false; showSimConfirm.value = true;
}

// ---- 模拟运行态 ----
const simulateMode = ref(false);
const simRemain = ref('30:00');
let simTimer: number | undefined;
const showSimLog = ref(false);
const simLogs = ref<{ time: string; action: string; color: string }[]>([]);

function enterSimulate() {
  if (!simUser.value || !simReasonType.value) return;
  simulateMode.value = true;
  simLogs.value = [
    { time: '12:00:00', action: `发起模拟: ${simUser.value.name} (${simUser.value.role})`, color: '#1A6FFF' },
    { time: '12:00:00', action: `原因: ${simReasonType.value}`, color: '#9CA3AF' },
  ];
  showSimConfirm.value = false;
  message.success(`已进入模拟模式 - ${simUser.value.name}`);
  let sec = parseInt(simDuration.value) * 60;
  simRemain.value = simDuration.value + ':00';
  if (simTimer) clearInterval(simTimer);
  simTimer = window.setInterval(() => {
    sec--;
    if (sec <= 0) { exitSimulate(); return; }
    const m = Math.floor(sec / 60), s = sec % 60;
    simRemain.value = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }, 1000);
}
function exitSimulate() {
  simulateMode.value = false;
  if (simTimer) { clearInterval(simTimer); simTimer = undefined; }
  message.success('已退出模拟模式');
}
onBeforeUnmount(() => { if (simTimer) clearInterval(simTimer); });
</script>

<template>
  <div class="plat-tenants">
    <!-- 模拟横幅 -->
    <div v-if="simulateMode" class="sim-banner">
      <span class="sim-tag">模拟观察中</span>
      <EyeOutlined />
      <span>操作者：<b>admin</b></span><span class="sep">|</span>
      <span>租户：<b>{{ simTenant?.name }}</b></span><span class="sep">|</span>
      <span>目标：<b>{{ simUser?.name }} ({{ simUser?.role }})</b></span><span class="sep">|</span>
      <span class="sim-remain"><ClockCircleOutlined /> 剩余 <b>{{ simRemain }}</b></span>
      <div class="spacer"></div>
      <button class="sim-btn ghost" @click="showSimLog = true">操作日志</button>
      <button class="sim-btn exit" @click="exitSimulate">退出模拟</button>
    </div>

    <div class="body">
      <div class="page-head-row">
        <div class="page-head"><h2>租户管理</h2><p>管理平台所有租户的开通、停用与配置</p></div>
        <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>创建租户</a-button>
      </div>

      <!-- 统计 -->
      <div class="stats">
        <div class="stat"><div class="stat-ic blue">🏢</div><div><div class="stat-num">{{ stats.total }}</div><div class="stat-lbl">总租户数</div></div></div>
        <div class="stat"><div class="stat-ic green">✓</div><div><div class="stat-num">{{ stats.active }}</div><div class="stat-lbl">活跃租户</div></div></div>
        <div class="stat"><div class="stat-ic amber">⏸</div><div><div class="stat-num">{{ stats.suspended }}</div><div class="stat-lbl">已停用</div></div></div>
      </div>

      <!-- 筛选 -->
      <div class="filter-card">
        <a-input v-model:value="search" placeholder="搜索租户名称 / 编码..." allow-clear style="width: 240px" />
        <a-select v-model:value="statusFilter" style="width: 140px" :options="[
          { value: '', label: '全部状态' }, { value: 'active', label: '活跃' }, { value: 'suspended', label: '已停用' }]" />
        <a-button @click="search = ''; statusFilter = ''">重置筛选</a-button>
      </div>

      <!-- 表格 -->
      <div class="table-card">
        <a-table :columns="columns" :data-source="filtered" row-key="id" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <div class="tname"><span class="tavatar" :style="{ background: record.color }">{{ record.name[0] }}</span><span class="tn">{{ record.name }}</span></div>
            </template>
            <span v-else-if="column.key === 'code'" class="mono">{{ record.code }}</span>
            <span v-else-if="column.key === 'status'" class="pill" :class="record.status === 'active' ? 'on' : 'off'">● {{ record.status === 'active' ? '活跃' : '已停用' }}</span>
            <span v-else-if="column.key === 'admin'" class="muted">{{ record.admin }}</span>
            <span v-else-if="column.key === 'createdAt'" class="muted">{{ record.createdAt }}</span>
            <template v-else-if="column.key === 'action'">
              <span class="link" @click="detail = record">详情</span>
              <span class="link" @click="openEdit(record)">编辑</span>
              <span class="link" :style="{ color: record.status === 'active' ? '#D97706' : '#059669' }" @click="toggleStatus(record)">{{ record.status === 'active' ? '停用' : '启用' }}</span>
              <span class="link" :class="{ disabled: record.status !== 'active' }" style="color:#7C3AED" @click="openSimulate(record)">模拟角色</span>
              <span class="link" style="color:#EF4444" @click="delTenant(record)">删除</span>
            </template>
          </template>
        </a-table>
      </div>
    </div>

    <!-- 创建/编辑租户 -->
    <a-modal v-model:open="showTenantModal" :title="editing ? '编辑租户' : '创建租户'" :width="560" :ok-text="editing ? '保存修改' : '创建租户'" cancel-text="取消" @ok="saveTenant">
      <div class="form-grid">
        <div class="field"><label><i>*</i>租户名称</label><a-input v-model:value="form.name" placeholder="输入租户名称" /></div>
        <div class="field"><label><i>*</i>租户编码</label><a-input v-model:value="form.code" placeholder="如 XFKJ" /></div>
        <div class="field span2"><label><i>*</i>管理员邮箱</label><a-input v-model:value="form.adminEmail" placeholder="admin@example.com" /></div>
      </div>
      <div class="form-sub">配额设置</div>
      <div class="form-grid3">
        <div class="field"><label>工单上限</label><a-input-number v-model:value="form.orderLimit" style="width:100%" /></div>
        <div class="field"><label>API 调用/日</label><a-input-number v-model:value="form.apiLimit" style="width:100%" /></div>
        <div class="field"><label>存储空间(GB)</label><a-input-number v-model:value="form.storageLimit" style="width:100%" /></div>
      </div>
    </a-modal>

    <!-- 详情抽屉 -->
    <a-drawer v-model:open="detail" :title="detail ? detail.name + ' - 租户详情' : ''" :width="560" placement="right" @close="detail = null">
      <template v-if="detail">
        <div class="d-section-title">基本信息</div>
        <div class="d-grid">
          <div><span class="muted">名称：</span>{{ detail.name }}</div>
          <div><span class="muted">编码：</span><span class="mono">{{ detail.code }}</span></div>
          <div><span class="muted">状态：</span><span class="pill" :class="detail.status === 'active' ? 'on' : 'off'">● {{ detail.status === 'active' ? '活跃' : '已停用' }}</span></div>
          <div><span class="muted">管理员：</span>{{ detail.admin }}</div>
          <div class="span2"><span class="muted">创建时间：</span>{{ detail.createdAt }}</div>
        </div>
        <div class="d-section-title">配额使用情况</div>
        <div class="quota">
          <div v-for="q in [
            { l: '工单配额', u: detail.quota.orderUsed, t: detail.quota.orderLimit, p: detail.quota.orderPct },
            { l: 'API调用/日', u: detail.quota.apiUsed, t: detail.quota.apiLimit, p: detail.quota.apiPct },
            { l: '存储空间', u: detail.quota.storageUsed + 'GB', t: detail.quota.storageLimit + 'GB', p: detail.quota.storagePct }]" :key="q.l" class="q-row">
            <div class="q-top"><span>{{ q.l }}</span><span class="mono muted">{{ q.u }} / {{ q.t }}</span></div>
            <div class="q-track"><div class="q-fill" :style="{ width: q.p + '%', background: q.p > 80 ? '#EF4444' : '#1A6FFF' }"></div></div>
          </div>
        </div>
        <div class="d-section-title">操作日志</div>
        <div class="logs">
          <div v-for="l in detail.logs" :key="l.time" class="log-row">
            <span class="mono muted">{{ l.time }}</span><span class="log-act">{{ l.action }}</span><span class="muted log-user">{{ l.user }}</span>
          </div>
        </div>
      </template>
    </a-drawer>

    <!-- 模拟角色：组织树 + 人员 -->
    <a-modal v-model:open="showSimulate" :title="`模拟角色 - ${simTenant?.name ?? ''}`" :width="900" :footer="null">
      <div class="sim-wrap">
        <div class="sim-tree">
          <a-input v-model:value="simUserSearch" placeholder="搜索部门..." size="small" style="margin-bottom: 8px" />
          <div v-for="d in SIM_ORG_TREE" :key="d.id" class="dept" :class="{ active: simActiveDept === d.id }" @click="simActiveDept = d.id">
            <span class="dept-name">{{ d.name }}</span><span class="dept-count">{{ d.count }}</span>
          </div>
        </div>
        <div class="sim-users">
          <div class="sim-users-head">
            <a-input v-model:value="simUserSearch" placeholder="搜索姓名、工号..." size="small" style="flex:1" />
            <a-select v-model:value="simRoleFilter" size="small" style="width:120px" :options="[
              { value: '', label: '全部角色' }, { value: '客服坐席', label: '客服坐席' }, { value: '组长', label: '组长' }, { value: '运营专员', label: '运营专员' }, { value: '租户管理员', label: '租户管理员' }]" />
          </div>
          <a-table :columns="[{ title: '人员', key: 'p' }, { title: '角色', key: 'role', width: 90 }, { title: '状态', key: 'status', width: 70 }, { title: '负载', key: 'load', width: 90 }, { title: '操作', key: 'op', width: 70 }]"
            :data-source="simFilteredUsers" row-key="id" :pagination="false" size="small">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'p'">
                <div class="su"><span class="su-av" :style="{ background: record.avatarBg }">{{ record.name.slice(-1) }}</span><div><div class="su-name">{{ record.name }}</div><div class="su-id mono">{{ record.empId }}</div></div></div>
              </template>
              <span v-else-if="column.key === 'role'" class="su-role" :style="{ background: record.roleBg, color: record.roleColor }">{{ record.role }}</span>
              <span v-else-if="column.key === 'status'" class="su-status">{{ record.status }}</span>
              <template v-else-if="column.key === 'load'">
                <div class="load"><div class="load-track"><div class="load-fill" :style="{ width: record.load + '%', background: record.load >= 80 ? '#EF4444' : record.load >= 50 ? '#F59E0B' : '#10B981' }"></div></div><span class="mono">{{ record.load }}%</span></div>
              </template>
              <a-button v-else-if="column.key === 'op'" type="primary" size="small" @click="selectSimUser(record)">选择</a-button>
            </template>
          </a-table>
        </div>
      </div>
    </a-modal>

    <!-- 模拟确认 -->
    <a-modal v-model:open="showSimConfirm" title="确认模拟进入" :width="520" :footer="null">
      <template v-if="simUser">
        <div class="sc-user">
          <span class="sc-av" :style="{ background: simUser.avatarBg }">{{ simUser.name.slice(-1) }}</span>
          <div class="sc-info"><div class="sc-name">{{ simUser.name }}</div><div class="muted">{{ simUser.role }} · {{ simUser.empId }}</div></div>
          <span class="su-status">{{ simUser.status }}</span>
        </div>
        <div class="sc-block">
          <div class="sc-label">模拟模式</div>
          <div class="sc-radio active"><b>观察模式（只读）</b><span class="muted">以目标用户视角查看界面和数据，不可执行任何操作</span></div>
        </div>
        <div class="sc-block">
          <div class="sc-label">模拟时效</div>
          <a-select v-model:value="simDuration" style="width:100%" :options="[{ value: '15', label: '15 分钟' }, { value: '30', label: '30 分钟' }, { value: '60', label: '1 小时' }]" />
        </div>
        <div class="sc-block">
          <div class="sc-label"><i>*</i> 模拟原因</div>
          <a-select v-model:value="simReasonType" style="width:100%; margin-bottom:8px" placeholder="请选择原因分类..." :options="[
            { value: '排查问题', label: '排查用户反馈问题' }, { value: '权限验证', label: '验证权限配置' }, { value: '流程测试', label: '测试业务流程' }, { value: '其他', label: '其他' }]" />
          <a-textarea v-model:value="simReasonDetail" :rows="2" placeholder="请补充具体说明..." />
        </div>
        <div class="sc-warn">
          <ExclamationCircleFilled :style="{ color: '#DC2626' }" />
          <div><b>安全须知</b><div class="muted">本次模拟全程录入审计日志，不可删除。模拟期间您的所有浏览和操作均被记录。</div></div>
        </div>
        <div class="sc-foot">
          <a-button @click="showSimConfirm = false">取消</a-button>
          <a-button type="primary" :disabled="!simReasonType" style="background:#F59E0B; border-color:#F59E0B" @click="enterSimulate"><template #icon><EyeOutlined /></template>确认进入模拟</a-button>
        </div>
      </template>
    </a-modal>

    <!-- 模拟会话日志 -->
    <a-modal v-model:open="showSimLog" title="模拟会话操作日志" :width="560" :footer="null">
      <div class="simlog">
        <div v-for="(l, i) in simLogs" :key="i" class="simlog-row">
          <span class="mono muted">{{ l.time }}</span><span class="dot" :style="{ background: l.color }"></span><span>{{ l.action }}</span>
        </div>
      </div>
      <div class="simlog-foot"><span class="muted">日志不可删除，永久保留</span><a-button @click="showSimLog = false">关闭</a-button></div>
    </a-modal>
  </div>
</template>

<style scoped>
.body { padding: 20px 24px; }
.sim-banner { display: flex; align-items: center; gap: 10px; background: linear-gradient(90deg, #DC2626, #B91C1C); color: #fff; padding: 10px 20px; font-size: 13px; }
.sim-tag { background: rgba(255,255,255,.2); padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; }
.sim-banner .sep { opacity: .4; }
.sim-remain { display: flex; align-items: center; gap: 4px; }
.sim-banner .spacer { flex: 1; }
.sim-btn { border: 1px solid rgba(255,255,255,.3); border-radius: 6px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
.sim-btn.ghost { background: rgba(255,255,255,.15); color: #fff; }
.sim-btn.exit { background: #fff; color: #DC2626; font-weight: 600; border-color: #fff; }

.page-head-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.page-head h2 { font-size: 18px; font-weight: 700; color: #111827; }
.page-head p { font-size: 13px; color: #6b7280; margin-top: 2px; }

.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 18px; }
.stat { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; gap: 14px; }
.stat-ic { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.stat-ic.blue { background: #E8F1FF; } .stat-ic.green { background: #ECFDF5; color: #10B981; } .stat-ic.amber { background: #FFFBEB; color: #F59E0B; }
.stat-num { font-size: 22px; font-weight: 700; color: #111827; }
.stat-lbl { font-size: 11px; color: #6b7280; margin-top: 4px; }

.filter-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 16px; display: flex; gap: 12px; }
.table-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }

.tname { display: flex; align-items: center; gap: 8px; }
.tavatar { width: 28px; height: 28px; border-radius: 8px; color: #fff; font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.tn { font-weight: 600; }
.mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.muted { color: #9ca3af; font-size: 12px; }
.pill { font-size: 12px; font-weight: 600; }
.pill.on { color: #059669; } .pill.off { color: #DC2626; }
.link { font-size: 12px; color: #1A6FFF; cursor: pointer; margin-right: 10px; }
.link:hover { text-decoration: underline; }
.link.disabled { color: #d1d5db !important; cursor: not-allowed; pointer-events: none; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.form-sub { font-size: 12px; font-weight: 600; color: #374151; margin: 16px 0 10px; padding-top: 14px; border-top: 1px solid #f0f0f0; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.span2 { grid-column: span 2; }
.field label { font-size: 12px; color: #374151; }
.field label i { color: #EF4444; font-style: normal; margin-right: 2px; }

.d-section-title { font-size: 11px; font-weight: 600; color: #9ca3af; letter-spacing: .05em; text-transform: uppercase; margin: 18px 0 12px; }
.d-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; }
.d-grid .span2 { grid-column: span 2; }
.quota { display: flex; flex-direction: column; gap: 14px; }
.q-top { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
.q-track { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
.q-fill { height: 100%; border-radius: 4px; }
.logs { display: flex; flex-direction: column; }
.log-row { display: flex; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid #f5f5f5; font-size: 12px; }
.log-act { font-weight: 500; color: #374151; } .log-user { margin-left: auto; }

.sim-wrap { display: flex; height: 460px; margin: -8px -24px -12px; border-top: 1px solid #f0f0f0; }
.sim-tree { width: 230px; border-right: 1px solid #e5e7eb; padding: 12px; overflow-y: auto; }
.dept { display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.dept:hover { background: #f5f5f5; } .dept.active { background: #E8F1FF; color: #1A6FFF; font-weight: 600; }
.dept-count { font-size: 10px; background: #f0f0f0; color: #9ca3af; padding: 1px 7px; border-radius: 9px; }
.sim-users { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.sim-users-head { display: flex; gap: 8px; padding: 12px; border-bottom: 1px solid #f0f0f0; }
.su { display: flex; align-items: center; gap: 8px; }
.su-av { width: 28px; height: 28px; border-radius: 50%; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.su-name { font-size: 12px; font-weight: 500; } .su-id { font-size: 10px; color: #9ca3af; }
.su-role { font-size: 10px; padding: 1px 7px; border-radius: 9px; font-weight: 600; }
.su-status { font-size: 11px; color: #6b7280; }
.load { display: flex; align-items: center; gap: 6px; }
.load-track { width: 40px; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; }
.load-fill { height: 100%; border-radius: 2px; }

.sc-user { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 8px; background: #f9fafb; border: 1px solid #e5e7eb; }
.sc-av { width: 44px; height: 44px; border-radius: 50%; color: #fff; font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.sc-name { font-weight: 600; font-size: 14px; }
.sc-block { margin-top: 16px; }
.sc-label { font-size: 12px; font-weight: 600; color: #4b5563; margin-bottom: 8px; }
.sc-label i { color: #EF4444; font-style: normal; }
.sc-radio { display: flex; flex-direction: column; gap: 2px; padding: 10px; border-radius: 6px; border: 1px solid #1A6FFF; background: #E8F1FF; font-size: 12px; }
.sc-warn { display: flex; gap: 8px; margin-top: 16px; padding: 10px; border-radius: 6px; background: #FEF2F2; border: 1px solid #FECACA; font-size: 11px; color: #DC2626; }
.sc-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

.simlog-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
.simlog-row .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.simlog-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; }
</style>
