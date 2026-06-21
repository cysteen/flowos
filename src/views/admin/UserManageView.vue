<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined, UserOutlined, ImportOutlined, KeyOutlined, InboxOutlined } from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { stdPagination } from '@/config/adminUi';

// 用户管理增强（PRD-50）：机构/岗位/角色多维 + 状态 + 新建抽屉 + 启停/重置密码。
interface User {
  id: string; name: string; account: string; org: string; post: string; roles: string[];
  phone: string; status: '正常' | '停用' | '锁定'; lastLogin: string;
}
const orgFilter = ref('全部机构');
const statusFilter = ref('全部');
const keyword = ref('');
const ORGS = ['全部机构', '一线客服部', '二线处理部', '售后服务部', '质量管理部'];

const users = ref<User[]>([
  { id: 'U1001', name: '王芳', account: 'wangfang', org: '一线客服部', post: '班组长', roles: ['一线主管', '审批人'], phone: '138****0001', status: '正常', lastLogin: '2026-06-19 08:30' },
  { id: 'U1002', name: '李强', account: 'liqiang', org: '二线处理部', post: '高级客服', roles: ['二线坐席'], phone: '139****0002', status: '正常', lastLogin: '2026-06-19 09:05' },
  { id: 'U1003', name: '陈静', account: 'chenjing', org: '一线客服部', post: '客服专员', roles: ['一线坐席'], phone: '137****0003', status: '正常', lastLogin: '2026-06-18 17:20' },
  { id: 'U1004', name: '赵敏', account: 'zhaomin', org: '售后服务部', post: '售后工程师', roles: ['售后坐席'], phone: '136****0004', status: '正常', lastLogin: '2026-06-19 10:12' },
  { id: 'U1005', name: '吴婷', account: 'wuting', org: '一线客服部', post: '实习坐席', roles: ['一线坐席'], phone: '135****0005', status: '锁定', lastLogin: '2026-06-10 14:00' },
  { id: 'U1006', name: '钱进', account: 'qianjin', org: '售后服务部', post: '客服专员', roles: ['售后坐席'], phone: '134****0006', status: '停用', lastLogin: '2026-05-28 11:30' },
]);
const list = computed(() => users.value.filter((u) => {
  if (orgFilter.value !== '全部机构' && u.org !== orgFilter.value) return false;
  if (statusFilter.value !== '全部' && u.status !== statusFilter.value) return false;
  if (keyword.value && !`${u.name}${u.account}${u.phone}`.includes(keyword.value)) return false;
  return true;
}));
const ST_TONE: Record<string, string> = { 正常: 'green', 停用: 'default', 锁定: 'red' };
const cols = [
  { title: '用户', dataIndex: 'name', key: 'name', width: 170 },
  { title: '账号', dataIndex: 'account', key: 'account', width: 130 },
  { title: '机构', dataIndex: 'org', key: 'org', width: 130 },
  { title: '岗位', dataIndex: 'post', key: 'post', width: 110 },
  { title: '角色', dataIndex: 'roles', key: 'roles' },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '最近登录', dataIndex: 'lastLogin', key: 'lastLogin', width: 150 },
  { title: '操作', key: 'op', width: 180 },
];

const drawerOpen = ref(false);
const editingId = ref<string | null>(null);
const form = reactive<Partial<User>>({});
let userSeq = 1007;
function openNew() { editingId.value = null; Object.assign(form, { name: '', account: '', org: '一线客服部', post: '客服专员', roles: [], phone: '', status: '正常' }); drawerOpen.value = true; }
function openEdit(u: User) { editingId.value = u.id; Object.assign(form, { ...u, roles: [...u.roles] }); drawerOpen.value = true; }
function saveUser() {
  if (!form.name || !form.account) { message.error('请填写姓名与登录账号'); return; }
  if (editingId.value) {
    const u = users.value.find((x) => x.id === editingId.value);
    if (u) Object.assign(u, { ...form, roles: [...(form.roles || [])] });
    message.success('用户已更新');
  } else {
    users.value.unshift({ id: 'U' + userSeq++, name: form.name!, account: form.account!, org: form.org || '一线客服部', post: form.post || '客服专员', roles: [...(form.roles || [])], phone: form.phone || '', status: '正常', lastLogin: '—' });
    message.success(`用户「${form.name}」已新建`);
  }
  drawerOpen.value = false;
}
function toggle(u: User) { u.status = u.status === '停用' ? '正常' : '停用'; message.success(`${u.name} 已${u.status === '停用' ? '停用' : '启用'}`); }
function resetPwd(u: User) { message.success(`已向 ${u.name} 发送密码重置链接`); }

// —— 导入用户 ——
const importOpen = ref(false);
const importN = ref(0);
function openImport() { importN.value = 0; importOpen.value = true; }
function onImportFile(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { importN.value = Math.max(1, Math.round(f.size / 70)); message.success(`已解析「${f.name}」，识别 ${importN.value} 个用户`); } }
function doImport() { if (!importN.value) { message.warning('请先选择 Excel/CSV 文件'); return; } message.success(`已导入 ${importN.value} 个用户`); importOpen.value = false; }
</script>

<template>
  <div class="user-manage">
    <AdminPageHeader title="用户管理" subtitle="管理租户内用户的机构/岗位/角色归属、账号状态与密码">
      <template #actions>
        <a-button @click="openImport"><template #icon><ImportOutlined /></template>导入</a-button>
        <a-button type="primary" @click="openNew"><template #icon><PlusOutlined /></template>新建用户</a-button>
      </template>
    </AdminPageHeader>
    <div class="bar">
      <div class="filters">
        <a-select v-model:value="orgFilter" style="width: 150px" :options="ORGS.map((v)=>({value:v,label:v}))" />
        <a-select v-model:value="statusFilter" style="width: 110px" :options="['全部','正常','停用','锁定'].map((v)=>({value:v,label:v}))" />
        <a-input-search v-model:value="keyword" placeholder="搜索姓名/账号/手机" style="width: 220px" allow-clear />
      </div>
    </div>
    <a-table :columns="cols" :data-source="list" row-key="id" :pagination="stdPagination()" size="middle">
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'name'" class="un">
          <a-avatar size="small"><template #icon><UserOutlined /></template></a-avatar><b>{{ record.name }}</b><span class="uid">{{ record.id }}</span>
        </span>
        <span v-else-if="column.key === 'account'" class="acct">{{ record.account }}</span>
        <template v-else-if="column.key === 'roles'">
          <a-tag v-for="r in record.roles" :key="r" color="blue">{{ r }}</a-tag>
        </template>
        <a-tag v-else-if="column.key === 'status'" :color="ST_TONE[record.status]">{{ record.status }}</a-tag>
        <template v-else-if="column.key === 'op'">
          <a-button type="link" size="small" @click="openEdit(record as User)">编辑</a-button>
          <a-button type="link" size="small" @click="resetPwd(record as User)"><KeyOutlined />重置密码</a-button>
          <a-button type="link" size="small" :danger="record.status !== '停用'" @click="toggle(record as User)">{{ record.status === '停用' ? '启用' : '停用' }}</a-button>
        </template>
      </template>
    </a-table>

    <a-drawer v-model:open="drawerOpen" :title="editingId ? '编辑用户' : '新建用户'" width="480" placement="right">
      <a-form layout="vertical">
        <a-form-item label="姓名" required><a-input v-model:value="form.name" /></a-form-item>
        <a-form-item label="登录账号" required><a-input v-model:value="form.account" /></a-form-item>
        <a-form-item label="手机号"><a-input v-model:value="form.phone" /></a-form-item>
        <a-form-item label="所属机构"><a-select v-model:value="form.org" :options="ORGS.slice(1).map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="岗位"><a-select v-model:value="form.post" :options="['客服专员','高级客服','班组长','售后工程师','质检员'].map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="角色"><a-select v-model:value="form.roles" mode="multiple" :options="['一线坐席','二线坐席','售后坐席','一线主管','审批人','质检员','运营管理员'].map((v)=>({value:v,label:v}))" /></a-form-item>
      </a-form>
      <template #footer>
        <a-space><a-button @click="drawerOpen = false">取消</a-button><a-button type="primary" @click="saveUser">保存</a-button></a-space>
      </template>
    </a-drawer>

    <!-- 导入用户 -->
    <a-modal v-model:open="importOpen" title="导入用户" :width="460" ok-text="开始导入" cancel-text="取消" @ok="doImport">
      <label class="dropzone">
        <InboxOutlined class="dz-ic" />
        <div class="dz-main">点击选择 Excel / CSV 文件</div>
        <div class="dz-sub">{{ importN ? `已识别 ${importN} 个用户` : '首行为表头：姓名 / 账号 / 手机 / 机构 / 岗位 / 角色' }}</div>
        <input type="file" accept=".xlsx,.xls,.csv" hidden @change="onImportFile" />
      </label>
    </a-modal>
  </div>
</template>

<style scoped>
.user-manage { padding: 16px 24px; }
.bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 16px; flex-wrap: wrap; }
.filters { display: flex; gap: 12px; align-items: center; }
.dropzone { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 28px; border: 1.5px dashed #d1d5db; border-radius: 10px; cursor: pointer; }
.dropzone:hover { border-color: #1a6fff; background: #f7faff; }
.dz-ic { font-size: 34px; color: #1a6fff; }
.dz-main { font-size: 14px; font-weight: 600; color: #374151; }
.dz-sub { font-size: 12px; color: #9ca3af; }
.btns { display: flex; gap: 10px; }
.un { display: flex; align-items: center; gap: 8px; }
.uid { font-size: 12px; color: #9ca3af; font-weight: 400; }
.acct { color: #374151; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
