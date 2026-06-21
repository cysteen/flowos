<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, TeamOutlined, MailOutlined, PhoneOutlined, IdcardOutlined,
  CheckCircleOutlined, EyeOutlined, ClockCircleOutlined, ExclamationCircleFilled,
} from '@ant-design/icons-vue';
import {
  TENANTS, ROLE_PRESETS, TENANT_ADMIN_SEAT_MAX, SIM_ORG_TREE, SIM_USERS,
  type Tenant, type RolePreset, type SimUser,
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
  admins: tenants.value.reduce((s, t) => s + t.adminCount, 0),
}));

const columns = [
  { title: '租户', key: 'name' },
  { title: '编码', key: 'code', width: 100 },
  { title: '状态', key: 'status', width: 90 },
  { title: '管理员', key: 'admin', width: 230 },
  { title: '管理员席位', key: 'seats', width: 120 },
  { title: '创建时间', key: 'createdAt', width: 120 },
  { title: '操作', key: 'action', width: 230 },
];

// ---- 创建 / 编辑 ----
const showTenantModal = ref(false);
const editing = ref<Tenant | null>(null);
const form = reactive({
  name: '', code: '', adminEmail: '', adminPhone: '', adminLimit: TENANT_ADMIN_SEAT_MAX,
  orderLimit: 1000, apiLimit: 10000, storageLimit: 50,
});
function openCreate() {
  editing.value = null;
  Object.assign(form, { name: '', code: '', adminEmail: '', adminPhone: '', adminLimit: TENANT_ADMIN_SEAT_MAX, orderLimit: 1000, apiLimit: 10000, storageLimit: 50 });
  showTenantModal.value = true;
}
function openEdit(t: Tenant) {
  editing.value = t;
  Object.assign(form, { name: t.name, code: t.code, adminEmail: t.admin, adminPhone: t.adminPhone, adminLimit: t.adminLimit, orderLimit: t.quota.orderLimit, apiLimit: t.quota.apiLimit, storageLimit: t.quota.storageLimit });
  showTenantModal.value = true;
}
function saveTenant() {
  if (!form.name || !form.code || !form.adminEmail || !form.adminPhone) {
    message.error('请填写租户名称、编码、管理员邮箱与手机号');
    return;
  }
  const limit = Math.min(Math.max(1, form.adminLimit || 1), TENANT_ADMIN_SEAT_MAX);
  if (editing.value) {
    const t = editing.value;
    t.name = form.name; t.code = form.code; t.admin = form.adminEmail; t.adminPhone = form.adminPhone;
    t.adminLimit = limit; t.adminCount = Math.min(t.adminCount, limit);
    t.quota.orderLimit = form.orderLimit; t.quota.apiLimit = form.apiLimit; t.quota.storageLimit = form.storageLimit;
    message.success('租户信息已更新');
  } else {
    const colors = ['#1A6FFF', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
    tenants.value.unshift({
      id: 't' + (tenants.value.length + 1), name: form.name, code: form.code, status: 'active',
      admin: form.adminEmail, adminPhone: form.adminPhone, adminLimit: limit, adminCount: 1,
      createdAt: '2026-06-21', color: colors[tenants.value.length % colors.length],
      quota: { orderLimit: form.orderLimit, orderUsed: 0, orderPct: 0, apiLimit: form.apiLimit, apiUsed: 0, apiPct: 0, storageLimit: form.storageLimit, storageUsed: 0, storagePct: 0 },
      logs: [{ time: '2026-06-21 12:00', action: '创建租户', user: 'admin' }],
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

// ---- 推荐起步角色（原「模拟角色」重构）----
const showRecommend = ref(false);
const recTenant = ref<Tenant | null>(null);
const recPicked = ref<Set<string>>(new Set());
function openRecommend(t: Tenant) {
  recTenant.value = t;
  recPicked.value = new Set(['agent', 'leader', 'ops']); // 默认推荐三件套
  showRecommend.value = true;
}
function presetDisabled(p: RolePreset): boolean {
  // 租户管理员受席位上限约束
  return !!p.tenantAdmin && (recTenant.value?.adminCount ?? 0) >= (recTenant.value?.adminLimit ?? TENANT_ADMIN_SEAT_MAX);
}
function togglePreset(p: RolePreset) {
  if (presetDisabled(p)) { message.warning(`管理员席位已满（上限 ${recTenant.value?.adminLimit} 个）`); return; }
  const s = new Set(recPicked.value);
  s.has(p.key) ? s.delete(p.key) : s.add(p.key);
  recPicked.value = s;
}
function sendRecommend() {
  if (!recPicked.value.size) { message.warning('请至少选择一个起步角色'); return; }
  const names = ROLE_PRESETS.filter((p) => recPicked.value.has(p.key)).map((p) => p.name).join('、');
  message.success(`已向「${recTenant.value?.name}」推荐起步角色：${names}，租户可一键采用`);
  showRecommend.value = false;
}

// ---- 模拟登录（排障用·严格只读观察，全程不可改动）----
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

// 模拟确认
const showSimConfirm = ref(false);
const simUser = ref<SimUser | null>(null);
const simDuration = ref('30');
const simReasonType = ref('');
const simReasonDetail = ref('');
function selectSimUser(u: SimUser) {
  simUser.value = u; simReasonType.value = ''; simReasonDetail.value = ''; simDuration.value = '30';
  showSimulate.value = false; showSimConfirm.value = true;
}

// 模拟运行态
const simulateMode = ref(false);
const simRemain = ref('30:00');
let simTimer: number | undefined;
const showSimLog = ref(false);
const simLogs = ref<{ time: string; action: string; color: string }[]>([]);
function enterSimulate() {
  if (!simUser.value || !simReasonType.value) return;
  simulateMode.value = true;
  simLogs.value = [
    { time: '12:00:00', action: `发起模拟登录: ${simUser.value.name} (${simUser.value.role})`, color: '#1A6FFF' },
    { time: '12:00:00', action: `模式: 只读观察（不可改动）`, color: '#9CA3AF' },
    { time: '12:00:00', action: `原因: ${simReasonType.value}`, color: '#9CA3AF' },
  ];
  showSimConfirm.value = false;
  message.success(`已进入只读模拟 - ${simUser.value.name}`);
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
  message.success('已退出模拟登录');
}
onBeforeUnmount(() => { if (simTimer) clearInterval(simTimer); });
</script>

<template>
  <div class="plat-tenants">
    <!-- 模拟登录·只读观察横幅 -->
    <div v-if="simulateMode" class="sim-banner">
      <span class="sim-tag">只读观察中</span>
      <EyeOutlined />
      <span>操作者：<b>admin</b></span><span class="sep">|</span>
      <span>租户：<b>{{ simTenant?.name }}</b></span><span class="sep">|</span>
      <span>目标：<b>{{ simUser?.name }} ({{ simUser?.role }})</b></span><span class="sep">|</span>
      <span>模式：<b>只读·不可改动</b></span><span class="sep">|</span>
      <span class="sim-remain"><ClockCircleOutlined /> 剩余 <b>{{ simRemain }}</b></span>
      <div class="spacer"></div>
      <button class="sim-btn ghost" @click="showSimLog = true">操作日志</button>
      <button class="sim-btn exit" @click="exitSimulate">退出模拟</button>
    </div>

    <div class="page-head-row">
      <div class="page-head"><h2>租户管理</h2><p>管理平台所有租户的开通、停用、配额与起步角色推荐</p></div>
      <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>创建租户</a-button>
    </div>

    <!-- 统计 -->
    <div class="stats">
      <div class="stat"><div class="stat-ic blue"><TeamOutlined /></div><div><div class="stat-num">{{ stats.total }}</div><div class="stat-lbl">总租户数</div></div></div>
      <div class="stat"><div class="stat-ic green"><CheckCircleOutlined /></div><div><div class="stat-num">{{ stats.active }}</div><div class="stat-lbl">活跃租户</div></div></div>
      <div class="stat"><div class="stat-ic amber">⏸</div><div><div class="stat-num">{{ stats.suspended }}</div><div class="stat-lbl">已停用</div></div></div>
      <div class="stat"><div class="stat-ic purple"><IdcardOutlined /></div><div><div class="stat-num">{{ stats.admins }}</div><div class="stat-lbl">管理员席位（在用）</div></div></div>
    </div>

    <!-- 筛选 -->
    <div class="filter-card">
      <a-input v-model:value="search" placeholder="搜索租户名称 / 编码…" allow-clear style="width: 260px" />
      <a-select v-model:value="statusFilter" style="width: 140px" :options="[
        { value: '', label: '全部状态' }, { value: 'active', label: '活跃' }, { value: 'suspended', label: '已停用' }]" />
      <a-button @click="search = ''; statusFilter = ''">重置</a-button>
    </div>

    <!-- 表格 -->
    <div class="table-card">
      <a-table :columns="columns" :data-source="filtered" row-key="id" :pagination="false" size="middle">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div class="tname"><span class="tavatar" :style="{ background: record.color }">{{ record.name[0] }}</span><span class="tn">{{ record.name }}</span></div>
          </template>
          <a-tag v-else-if="column.key === 'code'" class="code-tag">{{ record.code }}</a-tag>
          <a-tag v-else-if="column.key === 'status'" :color="record.status === 'active' ? 'green' : 'default'">{{ record.status === 'active' ? '活跃' : '已停用' }}</a-tag>
          <template v-else-if="column.key === 'admin'">
            <div class="adm"><MailOutlined class="adm-ic" /><span>{{ record.admin }}</span></div>
            <div class="adm"><PhoneOutlined class="adm-ic" /><span>{{ record.adminPhone }}</span></div>
          </template>
          <template v-else-if="column.key === 'seats'">
            <span class="seat-pill" :class="{ full: record.adminCount >= record.adminLimit }">{{ record.adminCount }} / {{ record.adminLimit }}</span>
          </template>
          <span v-else-if="column.key === 'createdAt'" class="muted">{{ record.createdAt }}</span>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" size="small" @click="detail = record">详情</a-button>
            <a-button type="link" size="small" @click="openEdit(record)">编辑</a-button>
            <a-button type="link" size="small" :style="{ color: record.status === 'active' ? '#D97706' : '#059669' }" @click="toggleStatus(record)">{{ record.status === 'active' ? '停用' : '启用' }}</a-button>
            <a-button type="link" size="small" :disabled="record.status !== 'active'" style="color:#7C3AED" @click="openRecommend(record)">推荐角色</a-button>
            <a-button type="link" size="small" :disabled="record.status !== 'active'" style="color:#0EA5E9" @click="openSimulate(record)">模拟登录</a-button>
            <a-button type="link" size="small" danger @click="delTenant(record)">删除</a-button>
          </template>
        </template>
      </a-table>
    </div>

    <!-- 创建/编辑租户 -->
    <a-modal v-model:open="showTenantModal" :title="editing ? '编辑租户' : '创建租户'" :width="560" :ok-text="editing ? '保存修改' : '创建租户'" cancel-text="取消" @ok="saveTenant">
      <a-form layout="vertical" class="t-form">
        <div class="grid2">
          <a-form-item label="租户名称" required><a-input v-model:value="form.name" placeholder="输入租户名称" /></a-form-item>
          <a-form-item label="租户编码" required><a-input v-model:value="form.code" placeholder="如 XFKJ" /></a-form-item>
          <a-form-item label="管理员邮箱" required><a-input v-model:value="form.adminEmail" placeholder="admin@example.com"><template #prefix><MailOutlined /></template></a-input></a-form-item>
          <a-form-item label="管理员手机号" required><a-input v-model:value="form.adminPhone" placeholder="138 0000 0000"><template #prefix><PhoneOutlined /></template></a-input></a-form-item>
        </div>
        <a-form-item :label="`管理员席位上限（最多 ${TENANT_ADMIN_SEAT_MAX} 个）`">
          <a-input-number v-model:value="form.adminLimit" :min="1" :max="TENANT_ADMIN_SEAT_MAX" style="width: 200px" />
          <span class="hint">每租户最多 {{ TENANT_ADMIN_SEAT_MAX }} 名「租户管理员」</span>
        </a-form-item>
        <div class="form-sub">配额设置</div>
        <div class="grid3">
          <a-form-item label="工单上限"><a-input-number v-model:value="form.orderLimit" style="width:100%" /></a-form-item>
          <a-form-item label="API 调用/日"><a-input-number v-model:value="form.apiLimit" style="width:100%" /></a-form-item>
          <a-form-item label="存储空间(GB)"><a-input-number v-model:value="form.storageLimit" style="width:100%" /></a-form-item>
        </div>
      </a-form>
    </a-modal>

    <!-- 详情抽屉 -->
    <a-drawer v-model:open="detail" :title="detail ? detail.name + ' · 租户详情' : ''" :width="560" placement="right" @close="detail = null">
      <template v-if="detail">
        <div class="d-section-title">基本信息</div>
        <a-descriptions :column="2" bordered size="small">
          <a-descriptions-item label="名称">{{ detail.name }}</a-descriptions-item>
          <a-descriptions-item label="编码"><span class="mono">{{ detail.code }}</span></a-descriptions-item>
          <a-descriptions-item label="状态"><a-tag :color="detail.status === 'active' ? 'green' : 'default'">{{ detail.status === 'active' ? '活跃' : '已停用' }}</a-tag></a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ detail.createdAt }}</a-descriptions-item>
          <a-descriptions-item label="管理员邮箱" :span="2">{{ detail.admin }}</a-descriptions-item>
          <a-descriptions-item label="管理员手机" :span="2">{{ detail.adminPhone }}</a-descriptions-item>
          <a-descriptions-item label="管理员席位" :span="2"><span class="seat-pill" :class="{ full: detail.adminCount >= detail.adminLimit }">{{ detail.adminCount }} / {{ detail.adminLimit }}</span></a-descriptions-item>
        </a-descriptions>
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

    <!-- 推荐起步角色 -->
    <a-modal v-model:open="showRecommend" :title="`推荐起步角色 · ${recTenant?.name ?? ''}`" :width="680" :footer="null">
      <p class="rec-intro">为新租户挑选推荐的起步角色，一键下发帮助其快速搭建团队并上手使用。租户可在「组织与权限」中直接采用。</p>
      <div class="rec-grid">
        <div v-for="p in ROLE_PRESETS" :key="p.key" class="rec-card"
             :class="{ on: recPicked.has(p.key), disabled: presetDisabled(p) }" @click="togglePreset(p)">
          <div class="rc-top">
            <span class="rc-emoji" :style="{ background: p.color + '1A', color: p.color }">{{ p.emoji }}</span>
            <span class="rc-name">{{ p.name }}</span>
            <span class="rc-check" :style="{ borderColor: recPicked.has(p.key) ? p.color : '#d1d5db', background: recPicked.has(p.key) ? p.color : '#fff' }">
              <CheckCircleOutlined v-if="recPicked.has(p.key)" :style="{ color: '#fff', fontSize: '13px' }" />
            </span>
          </div>
          <div class="rc-desc">{{ p.desc }}</div>
          <div class="rc-perms"><a-tag v-for="perm in p.perms" :key="perm" class="rc-perm">{{ perm }}</a-tag></div>
          <div v-if="p.tenantAdmin" class="rc-seat" :class="{ full: presetDisabled(p) }">
            管理员席位 {{ recTenant?.adminCount }} / {{ recTenant?.adminLimit }}{{ presetDisabled(p) ? '（已满）' : '' }}
          </div>
        </div>
      </div>
      <div class="rec-foot">
        <span class="muted">已选 {{ recPicked.size }} 个角色</span>
        <div>
          <a-button @click="showRecommend = false">取消</a-button>
          <a-button type="primary" style="margin-left: 8px" @click="sendRecommend">发送推荐</a-button>
        </div>
      </div>
    </a-modal>

    <!-- 模拟登录：组织树 + 人员 -->
    <a-modal v-model:open="showSimulate" :title="`模拟登录 · ${simTenant?.name ?? ''}`" :width="900" :footer="null">
      <div class="sim-hint"><EyeOutlined /> 选择要模拟的目标用户，进入后为<b>只读观察</b>——以其视角查看界面与数据，全程<b>不可改动</b>、不可执行任何操作。</div>
      <div class="sim-wrap">
        <div class="sim-tree">
          <a-input v-model:value="simUserSearch" placeholder="搜索部门…" size="small" style="margin-bottom: 8px" />
          <div v-for="d in SIM_ORG_TREE" :key="d.id" class="dept" :class="{ active: simActiveDept === d.id }" @click="simActiveDept = d.id">
            <span class="dept-name">{{ d.name }}</span><span class="dept-count">{{ d.count }}</span>
          </div>
        </div>
        <div class="sim-users">
          <div class="sim-users-head">
            <a-input v-model:value="simUserSearch" placeholder="搜索姓名、工号…" size="small" style="flex:1" />
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
    <a-modal v-model:open="showSimConfirm" title="确认模拟登录" :width="520" :footer="null">
      <template v-if="simUser">
        <div class="sc-user">
          <span class="sc-av" :style="{ background: simUser.avatarBg }">{{ simUser.name.slice(-1) }}</span>
          <div class="sc-info"><div class="sc-name">{{ simUser.name }}</div><div class="muted">{{ simUser.role }} · {{ simUser.empId }}</div></div>
          <span class="su-status">{{ simUser.status }}</span>
        </div>
        <div class="sc-block">
          <div class="sc-label">模拟模式</div>
          <div class="sc-radio active"><b>观察模式（只读）</b><span class="muted">以目标用户视角查看界面和数据，全程不可执行任何操作</span></div>
        </div>
        <div class="sc-block">
          <div class="sc-label">模拟时效</div>
          <a-select v-model:value="simDuration" style="width:100%" :options="[{ value: '15', label: '15 分钟' }, { value: '30', label: '30 分钟' }, { value: '60', label: '1 小时' }]" />
        </div>
        <div class="sc-block">
          <div class="sc-label"><i>*</i> 模拟原因</div>
          <a-select v-model:value="simReasonType" style="width:100%; margin-bottom:8px" placeholder="请选择原因分类…" :options="[
            { value: '排查问题', label: '排查用户反馈问题' }, { value: '权限验证', label: '验证权限配置' }, { value: '流程测试', label: '测试业务流程' }, { value: '其他', label: '其他' }]" />
          <a-textarea v-model:value="simReasonDetail" :rows="2" placeholder="请补充具体说明…" />
        </div>
        <div class="sc-warn">
          <ExclamationCircleFilled :style="{ color: '#DC2626' }" />
          <div><b>安全须知</b><div class="muted">本次模拟为只读观察、全程录入审计日志且不可删除。模拟期间您的所有浏览均被记录。</div></div>
        </div>
        <div class="sc-foot">
          <a-button @click="showSimConfirm = false">取消</a-button>
          <a-button type="primary" :disabled="!simReasonType" style="background:#0EA5E9; border-color:#0EA5E9" @click="enterSimulate"><template #icon><EyeOutlined /></template>进入只读模拟</a-button>
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
.plat-tenants { padding: 20px 24px; }
.page-head-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.page-head h2 { font-size: 18px; font-weight: 700; color: #111827; }
.page-head p { font-size: 13px; color: #6b7280; margin-top: 2px; }

.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 18px; }
.stat { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 18px; display: flex; align-items: center; gap: 14px; }
.stat-ic { width: 42px; height: 42px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.stat-ic.blue { background: #E8F1FF; color: #1A6FFF; } .stat-ic.green { background: #ECFDF5; color: #10B981; }
.stat-ic.amber { background: #FFFBEB; color: #F59E0B; } .stat-ic.purple { background: #F5F3FF; color: #8B5CF6; }
.stat-num { font-size: 22px; font-weight: 700; color: #111827; }
.stat-lbl { font-size: 12px; color: #6b7280; margin-top: 2px; }

.filter-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; display: flex; gap: 12px; }
.table-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }

.tname { display: flex; align-items: center; gap: 10px; }
.tavatar { width: 30px; height: 30px; border-radius: 9px; color: #fff; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.tn { font-weight: 600; color: #111827; }
.code-tag { font-family: ui-monospace, monospace; background: #f3f4f6; border: none; color: #4b5563; }
.adm { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #4b5563; line-height: 1.9; }
.adm-ic { color: #9ca3af; }
.seat-pill { display: inline-block; font-size: 12px; font-weight: 600; color: #1A6FFF; background: #E8F1FF; padding: 2px 10px; border-radius: 999px; }
.seat-pill.full { color: #DC2626; background: #FEF2F2; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.muted { color: #9ca3af; font-size: 12px; }

.t-form .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
.t-form .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 12px; }
.t-form :deep(.ant-form-item) { margin-bottom: 14px; }
.form-sub { font-size: 12px; font-weight: 600; color: #374151; margin: 6px 0 12px; padding-top: 12px; border-top: 1px solid #f0f0f0; }
.hint { font-size: 12px; color: #9ca3af; margin-left: 12px; }

.d-section-title { font-size: 11px; font-weight: 600; color: #9ca3af; letter-spacing: .05em; text-transform: uppercase; margin: 20px 0 12px; }
.quota { display: flex; flex-direction: column; gap: 14px; }
.q-top { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
.q-track { height: 8px; background: #eef0f2; border-radius: 4px; overflow: hidden; }
.q-fill { height: 100%; border-radius: 4px; }
.logs { display: flex; flex-direction: column; }
.log-row { display: flex; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid #f5f5f5; font-size: 12px; }
.log-act { font-weight: 500; color: #374151; } .log-user { margin-left: auto; }

.rec-intro { font-size: 13px; color: #6b7280; line-height: 1.7; margin: 0 0 16px; }
.rec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.rec-card { border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; cursor: pointer; transition: all 0.15s; }
.rec-card:hover { border-color: #93c5fd; }
.rec-card.on { border-color: #1A6FFF; background: #f7faff; }
.rec-card.disabled { opacity: 0.55; cursor: not-allowed; }
.rc-top { display: flex; align-items: center; gap: 10px; }
.rc-emoji { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 17px; }
.rc-name { flex: 1; font-size: 14px; font-weight: 600; color: #111827; }
.rc-check { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid #d1d5db; display: flex; align-items: center; justify-content: center; }
.rc-desc { font-size: 12px; color: #6b7280; margin: 10px 0; line-height: 1.5; min-height: 34px; }
.rc-perms { display: flex; flex-wrap: wrap; gap: 4px; }
.rc-perm { font-size: 11px; background: #f3f4f6; border: none; color: #4b5563; margin: 0; }
.rc-seat { margin-top: 10px; font-size: 11px; color: #1A6FFF; font-weight: 600; }
.rc-seat.full { color: #DC2626; }
.rec-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 20px; padding-top: 16px; border-top: 1px solid #f0f0f0; }

:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }

/* 模拟登录·只读观察 */
.sim-banner { display: flex; align-items: center; gap: 10px; background: linear-gradient(90deg, #0EA5E9, #0284C7); color: #fff; padding: 10px 18px; font-size: 13px; border-radius: 10px; margin-bottom: 16px; }
.sim-tag { background: rgba(255,255,255,.2); padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; }
.sim-banner .sep { opacity: .4; }
.sim-remain { display: flex; align-items: center; gap: 4px; }
.sim-banner .spacer { flex: 1; }
.sim-btn { border: 1px solid rgba(255,255,255,.3); border-radius: 6px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
.sim-btn.ghost { background: rgba(255,255,255,.15); color: #fff; }
.sim-btn.exit { background: #fff; color: #0284C7; font-weight: 600; border-color: #fff; }

.sim-hint { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #0369a1; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
.sim-wrap { display: flex; height: 460px; margin: 0 -24px -12px; border-top: 1px solid #f0f0f0; }
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
