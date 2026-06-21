<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, TeamOutlined, MailOutlined, PhoneOutlined, IdcardOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons-vue';
import {
  TENANTS, ROLE_PRESETS, TENANT_ADMIN_SEAT_MAX, type Tenant, type RolePreset,
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
</script>

<template>
  <div class="plat-tenants">
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
</style>
