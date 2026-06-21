<script setup lang="ts">
import { ref, computed } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined, ApartmentOutlined, EditOutlined, UserOutlined } from '@ant-design/icons-vue';

// 机构管理（PRD-23）：组织树 + 机构详情 + 下属人员。
interface OrgNode { key: string; title: string; type: '公司' | '部门' | '班组'; leader: string; count: number; children?: OrgNode[]; }
const tree = ref<OrgNode[]>([
  {
    key: 'root', title: '讯飞客服中心', type: '公司', leader: '总经理·郑华', count: 86,
    children: [
      { key: 'd1', title: '一线客服部', type: '部门', leader: '王芳', count: 33, children: [
        { key: 't1', title: '投诉一组', type: '班组', leader: '陈静', count: 12 },
        { key: 't2', title: '咨询一组', type: '班组', leader: '刘洋', count: 11 },
      ] },
      { key: 'd2', title: '二线处理部', type: '部门', leader: '李强', count: 21, children: [
        { key: 't3', title: '技术处理组', type: '班组', leader: '杨帆', count: 9 },
      ] },
      { key: 'd3', title: '售后服务部', type: '部门', leader: '赵敏', count: 18 },
      { key: 'd4', title: '质量管理部', type: '部门', leader: '吴昊', count: 8 },
    ],
  },
]);
const expandedKeys = ref(['root', 'd1', 'd2']);
const selectedKeys = ref(['d1']);

const flat: Record<string, OrgNode> = {};
function walk(ns: OrgNode[]) { ns.forEach((n) => { flat[n.key] = n; if (n.children) walk(n.children); }); }
walk(tree.value);
const current = computed(() => flat[selectedKeys.value[0]] ?? flat.root);

const members = [
  { id: 'u1', name: '陈静', post: '班组长', role: '一线主管', ext: '8012', status: '在职' },
  { id: 'u2', name: '黄勇', post: '客服专员', role: '一线坐席', ext: '8014', status: '在职' },
  { id: 'u3', name: '周敏', post: '客服专员', role: '一线坐席', ext: '8015', status: '在职' },
  { id: 'u4', name: '吴婷', post: '客服专员', role: '一线坐席', ext: '8016', status: '试用' },
];
const memCols = [
  { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
  { title: '岗位', dataIndex: 'post', key: 'post', width: 110 },
  { title: '角色', dataIndex: 'role', key: 'role', width: 120 },
  { title: '分机', dataIndex: 'ext', key: 'ext', width: 90 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
];
const TYPE_TONE: Record<string, string> = { 公司: 'red', 部门: 'blue', 班组: 'green' };
function todo(t: string) { message.info(`「${t}」（演示）`); }
</script>

<template>
  <div class="org-manage">
    <div class="left">
      <div class="panel-head"><span>组织架构</span><a-button type="primary" size="small" @click="todo('新增机构')"><template #icon><PlusOutlined /></template>新增</a-button></div>
      <a-tree v-model:expandedKeys="expandedKeys" v-model:selectedKeys="selectedKeys" :tree-data="tree" block-node style="padding: 8px">
        <template #title="{ title, type, count }">
          <span class="tnode"><ApartmentOutlined /> {{ title }}<a-tag :color="TYPE_TONE[type]" class="t-tag">{{ type }}</a-tag><span class="t-cnt">{{ count }}人</span></span>
        </template>
      </a-tree>
    </div>
    <div class="right">
      <div class="org-detail">
        <div class="od-title">{{ current.title }}<a-tag :color="TYPE_TONE[current.type]">{{ current.type }}</a-tag></div>
        <div class="od-meta">
          <div class="cell"><label>负责人</label><span>{{ current.leader }}</span></div>
          <div class="cell"><label>人员规模</label><span>{{ current.count }} 人</span></div>
          <div class="cell"><label>下级单位</label><span>{{ current.children?.length || 0 }} 个</span></div>
        </div>
        <div class="od-acts">
          <a-button size="small" @click="todo('编辑机构')"><template #icon><EditOutlined /></template>编辑</a-button>
          <a-button size="small" @click="todo('新增下级')"><template #icon><PlusOutlined /></template>新增下级</a-button>
          <a-button size="small" @click="todo('调整人员')"><template #icon><UserOutlined /></template>调整人员</a-button>
        </div>
      </div>
      <div class="mem-card">
        <div class="panel-head"><span>本机构人员（{{ members.length }}）</span></div>
        <a-table :columns="memCols" :data-source="members" row-key="id" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'name'" class="mn"><a-avatar size="small"><template #icon><UserOutlined /></template></a-avatar>{{ record.name }}</span>
            <a-tag v-else-if="column.key === 'status'" :color="record.status === '在职' ? 'green' : 'orange'">{{ record.status }}</a-tag>
          </template>
        </a-table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.org-manage { display: flex; gap: 16px; padding: 16px 24px; align-items: flex-start; }
.left { width: 340px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
.right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 600; color: #111827; }
.tnode { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.t-tag { transform: scale(0.78); } .t-cnt { font-size: 11px; color: #9ca3af; }
.org-detail { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; }
.od-title { font-size: 16px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.od-meta { display: flex; gap: 40px; }
.cell { display: flex; flex-direction: column; gap: 4px; }
.cell label { font-size: 12px; color: #9ca3af; } .cell span { font-size: 14px; color: #374151; }
.od-acts { display: flex; gap: 10px; margin-top: 18px; padding-top: 16px; border-top: 1px solid #f3f4f6; }
.mem-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
.mn { display: flex; align-items: center; gap: 8px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
