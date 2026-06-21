<script setup lang="ts">
import { ref, reactive } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { stdPagination } from '@/config/adminUi';

// 岗位管理（PRD-24）：岗位列表 + 关联角色 + 在岗人数。
interface Post { id: string; name: string; code: string; org: string; roles: string[]; level: string; count: number; status: boolean; }
const posts = ref<Post[]>([
  { id: 'PT01', name: '客服专员', code: 'POST_AGENT', org: '一线客服部', roles: ['一线坐席'], level: 'P3', count: 44, status: true },
  { id: 'PT02', name: '高级客服', code: 'POST_SR_AGENT', org: '二线处理部', roles: ['二线坐席'], level: 'P5', count: 18, status: true },
  { id: 'PT03', name: '班组长', code: 'POST_LEADER', org: '一线客服部', roles: ['一线主管', '审批人'], level: 'M1', count: 6, status: true },
  { id: 'PT04', name: '售后工程师', code: 'POST_AFTERSALE', org: '售后服务部', roles: ['售后坐席'], level: 'P4', count: 12, status: true },
  { id: 'PT05', name: '质检员', code: 'POST_QA', org: '质量管理部', roles: ['质检员'], level: 'P4', count: 3, status: true },
  { id: 'PT06', name: '客服主管', code: 'POST_MANAGER', org: '客服中心', roles: ['运营管理员'], level: 'M2', count: 2, status: true },
  { id: 'PT07', name: '实习坐席', code: 'POST_INTERN', org: '一线客服部', roles: ['一线坐席'], level: 'P1', count: 0, status: false },
]);
const cols = [
  { title: '岗位名称', dataIndex: 'name', key: 'name', width: 150 },
  { title: '岗位编码', dataIndex: 'code', key: 'code', width: 160 },
  { title: '所属机构', dataIndex: 'org', key: 'org', width: 140 },
  { title: '职级', dataIndex: 'level', key: 'level', width: 80 },
  { title: '关联角色', dataIndex: 'roles', key: 'roles' },
  { title: '在岗', dataIndex: 'count', key: 'count', width: 80 },
  { title: '启用', dataIndex: 'status', key: 'status', width: 70 },
  { title: '操作', key: 'op', width: 100 },
];
const ORG_OPTS = ['一线客服部', '二线处理部', '售后服务部', '质量管理部', '客服中心'];
const ROLE_OPTS = ['一线坐席', '二线坐席', '售后坐席', '一线主管', '审批人', '质检员', '运营管理员'];
const LEVEL_OPTS = ['P1', 'P3', 'P4', 'P5', 'M1', 'M2'];

let postSeq = 8;
const modalOpen = ref(false);
const editingId = ref<string | null>(null);
const pf = reactive<Omit<Post, 'id' | 'count'>>({ name: '', code: '', org: '一线客服部', roles: [], level: 'P3', status: true });
function openCreate() {
  editingId.value = null;
  Object.assign(pf, { name: '', code: '', org: '一线客服部', roles: [], level: 'P3', status: true });
  modalOpen.value = true;
}
function openEdit(p: Post) {
  editingId.value = p.id;
  Object.assign(pf, { name: p.name, code: p.code, org: p.org, roles: [...p.roles], level: p.level, status: p.status });
  modalOpen.value = true;
}
function savePost() {
  if (!pf.name || !pf.code) { message.error('请填写岗位名称与编码'); return; }
  if (editingId.value) {
    const p = posts.value.find((x) => x.id === editingId.value);
    if (p) Object.assign(p, { ...pf, roles: [...pf.roles] });
    message.success('岗位已更新');
  } else {
    posts.value.unshift({ id: 'PT' + String(postSeq++).padStart(2, '0'), count: 0, ...pf, roles: [...pf.roles] });
    message.success(`岗位「${pf.name}」已新增`);
  }
  modalOpen.value = false;
}
function delPost(p: Post) {
  if (p.count > 0) { message.warning(`「${p.name}」仍有 ${p.count} 人在岗，不可删除`); return; }
  Modal.confirm({
    title: '删除岗位', icon: null, content: `确定删除岗位「${p.name}」？`,
    okText: '确认删除', okType: 'danger', cancelText: '取消',
    onOk: () => { posts.value = posts.value.filter((x) => x.id !== p.id); message.success('岗位已删除'); },
  });
}
</script>

<template>
  <div class="post-manage">
    <AdminPageHeader title="岗位管理" subtitle="岗位是「机构 × 角色」的复用载体；用户挂岗即继承岗位角色与数据范围">
      <template #actions>
        <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新增岗位</a-button>
      </template>
    </AdminPageHeader>
    <a-table :columns="cols" :data-source="posts" row-key="id" :pagination="stdPagination()" size="middle">
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'code'" class="mono">{{ record.code }}</span>
        <a-tag v-else-if="column.key === 'level'" color="geekblue">{{ record.level }}</a-tag>
        <template v-else-if="column.key === 'roles'">
          <a-tag v-for="r in record.roles" :key="r" color="blue">{{ r }}</a-tag>
          <span v-if="!record.roles.length" class="muted">未关联</span>
        </template>
        <span v-else-if="column.key === 'count'"><b>{{ record.count }}</b></span>
        <a-switch v-else-if="column.key === 'status'" v-model:checked="record.status" size="small" />
        <template v-else-if="column.key === 'op'">
          <EditOutlined class="op-ic" @click="openEdit(record as Post)" /><DeleteOutlined class="op-ic danger" @click="delPost(record as Post)" />
        </template>
      </template>
    </a-table>

    <!-- 新增 / 编辑岗位 -->
    <a-modal v-model:open="modalOpen" :title="editingId ? '编辑岗位' : '新增岗位'" :width="560" :ok-text="editingId ? '保存' : '创建'" cancel-text="取消" @ok="savePost">
      <a-form layout="vertical" class="post-form">
        <a-form-item label="岗位名称" required class="half"><a-input v-model:value="pf.name" placeholder="如：客服专员" /></a-form-item>
        <a-form-item label="岗位编码" required class="half"><a-input v-model:value="pf.code" placeholder="POST_XXX" /></a-form-item>
        <a-form-item label="所属机构" class="half"><a-select v-model:value="pf.org" :options="ORG_OPTS.map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="职级" class="half"><a-select v-model:value="pf.level" :options="LEVEL_OPTS.map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="关联角色" class="full"><a-select v-model:value="pf.roles" mode="multiple" :options="ROLE_OPTS.map((v)=>({value:v,label:v}))" placeholder="选择岗位继承的角色" /></a-form-item>
        <a-form-item label="启用" class="full"><a-switch v-model:checked="pf.status" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.post-manage { padding: 16px 24px; }
.bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.tip { font-size: 13px; color: #6b7280; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; color: #6b7280; }
.muted { color: #d1d5db; }
.post-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
.post-form .full { grid-column: 1 / -1; }
.post-form :deep(.ant-form-item) { margin-bottom: 14px; }
.op-ic { color: #6b7280; cursor: pointer; margin-right: 12px; } .op-ic.danger { color: #ef4444; } .op-ic:hover { opacity: 0.7; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
