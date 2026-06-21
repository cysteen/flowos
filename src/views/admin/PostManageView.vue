<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue';

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
function addPost() { posts.value.push({ id: 'PT' + Date.now(), name: '新岗位', code: 'POST_NEW', org: '一线客服部', roles: [], level: 'P3', count: 0, status: false }); }
function delPost(id: string) { posts.value = posts.value.filter((p) => p.id !== id); }
function todo(t: string) { message.info(`「${t}」（演示）`); }
</script>

<template>
  <div class="post-manage">
    <div class="bar">
      <span class="tip">岗位是「机构 × 角色」的复用载体；用户挂岗即继承岗位角色与数据范围</span>
      <a-button type="primary" @click="addPost"><template #icon><PlusOutlined /></template>新增岗位</a-button>
    </div>
    <a-table :columns="cols" :data-source="posts" row-key="id" :pagination="false" size="middle">
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
          <EditOutlined class="op-ic" @click="todo('编辑岗位')" /><DeleteOutlined class="op-ic danger" @click="delPost(record.id)" />
        </template>
      </template>
    </a-table>
  </div>
</template>

<style scoped>
.post-manage { padding: 16px 24px; }
.bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.tip { font-size: 13px; color: #6b7280; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; color: #6b7280; }
.muted { color: #d1d5db; }
.op-ic { color: #6b7280; cursor: pointer; margin-right: 12px; } .op-ic.danger { color: #ef4444; } .op-ic:hover { opacity: 0.7; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
