<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, ApartmentOutlined, EditOutlined, UserOutlined, DeleteOutlined,
  TeamOutlined,
} from '@ant-design/icons-vue';

// 组织管理（PRD-23，原「机构管理」）：可筛选的组织架构树（树内含新增/编辑/新增下级）+ 组织人员管理。
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

// —— 扁平索引 ——
const flat = computed<Record<string, OrgNode>>(() => {
  const m: Record<string, OrgNode> = {};
  const walk = (ns: OrgNode[]) => ns.forEach((n) => { m[n.key] = n; if (n.children) walk(n.children); });
  walk(tree.value);
  return m;
});
const parentOptions = computed(() => Object.values(flat.value).filter((n) => n.type !== '班组').map((n) => ({ value: n.key, label: n.title })));

// —— 筛选 ——
const search = ref('');
function filterTree(nodes: OrgNode[], kw: string): OrgNode[] {
  const res: OrgNode[] = [];
  for (const n of nodes) {
    const children = n.children ? filterTree(n.children, kw) : undefined;
    if (n.title.includes(kw) || (children && children.length)) res.push({ ...n, children });
  }
  return res;
}
const displayTree = computed(() => (search.value ? filterTree(tree.value, search.value) : tree.value));
function allKeys(nodes: OrgNode[]): string[] {
  return nodes.flatMap((n) => [n.key, ...(n.children ? allKeys(n.children) : [])]);
}
const expandedKeys = ref<string[]>(['root', 'd1', 'd2']);
watch(search, (kw) => { if (kw) expandedKeys.value = allKeys(displayTree.value); });

const selectedKeys = ref<string[]>(['d1']);
const current = computed(() => flat.value[selectedKeys.value[0]] ?? flat.value.root);

// —— 新增 / 编辑组织（落地弹窗）——
const orgModalOpen = ref(false);
const orgMode = ref<'create' | 'child' | 'edit'>('create');
const orgForm = reactive({ name: '', type: '部门' as OrgNode['type'], parent: 'root', leader: '' });
const orgModalTitle = computed(() => (orgMode.value === 'edit' ? '编辑组织' : orgMode.value === 'child' ? '新增下级组织' : '新增组织'));
function openCreateOrg() {
  orgMode.value = 'create';
  Object.assign(orgForm, { name: '', type: '部门', parent: selectedKeys.value[0] || 'root', leader: '' });
  orgModalOpen.value = true;
}
function openAddChild(node: OrgNode) {
  orgMode.value = 'child';
  Object.assign(orgForm, { name: '', type: node.type === '公司' ? '部门' : '班组', parent: node.key, leader: '' });
  orgModalOpen.value = true;
}
function openEditOrg(node: OrgNode) {
  orgMode.value = 'edit';
  Object.assign(orgForm, { name: node.title, type: node.type, parent: node.key, leader: node.leader });
  orgModalOpen.value = true;
}
function saveOrg() {
  if (!orgForm.name) { message.error('请填写组织名称'); return; }
  message.success(`${orgModalTitle.value}成功：${orgForm.name}`);
  orgModalOpen.value = false;
}
function delOrg(node: OrgNode) {
  Modal.confirm({
    title: '确认删除', icon: null, content: `删除组织「${node.title}」及其下级？此操作不可恢复。`,
    okText: '确认删除', okType: 'danger', cancelText: '取消',
    onOk: () => message.success('组织已删除'),
  });
}

// —— 组织人员 ——
interface Member { id: string; name: string; post: string; role: string; ext: string; status: string; }
const members = ref<Member[]>([
  { id: 'u1', name: '陈静', post: '班组长', role: '一线主管', ext: '8012', status: '在职' },
  { id: 'u2', name: '黄勇', post: '客服专员', role: '一线坐席', ext: '8014', status: '在职' },
  { id: 'u3', name: '周敏', post: '客服专员', role: '一线坐席', ext: '8015', status: '在职' },
  { id: 'u4', name: '吴婷', post: '客服专员', role: '一线坐席', ext: '8016', status: '试用' },
]);
const memCols = [
  { title: '姓名', dataIndex: 'name', key: 'name', width: 130 },
  { title: '岗位', dataIndex: 'post', key: 'post', width: 110 },
  { title: '角色', dataIndex: 'role', key: 'role', width: 120 },
  { title: '分机', dataIndex: 'ext', key: 'ext', width: 90 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '操作', key: 'op', width: 120 },
];
const TYPE_TONE: Record<string, string> = { 公司: 'red', 部门: 'blue', 班组: 'green' };

const POST_OPTS = ['客服专员', '高级客服', '班组长', '售后工程师', '质检员'];
const ROLE_OPTS = ['一线坐席', '二线坐席', '售后坐席', '一线主管', '审批人', '质检员'];

// —— 成员 添加 / 转岗 / 移出（真实本地操作）——
let memSeq = 5;
const memModalOpen = ref(false);
const memMode = ref<'add' | 'transfer'>('add');
const mf = reactive<Member>({ id: '', name: '', post: '客服专员', role: '一线坐席', ext: '', status: '在职' });
const memModalTitle = computed(() => (memMode.value === 'transfer' ? '成员转岗' : '添加成员'));
function openAddMember() { memMode.value = 'add'; Object.assign(mf, { id: '', name: '', post: '客服专员', role: '一线坐席', ext: '', status: '在职' }); memModalOpen.value = true; }
function openTransfer(m: Member) { memMode.value = 'transfer'; Object.assign(mf, { ...m }); memModalOpen.value = true; }
function saveMember() {
  if (!mf.name) { message.error('请填写成员姓名'); return; }
  if (memMode.value === 'transfer') {
    const m = members.value.find((x) => x.id === mf.id);
    if (m) Object.assign(m, { ...mf });
    message.success(`${mf.name} 已转岗为「${mf.post}」`);
  } else {
    members.value.push({ ...mf, id: 'u' + memSeq++ });
    message.success(`已添加成员「${mf.name}」`);
  }
  memModalOpen.value = false;
}
function removeMember(m: Member) {
  Modal.confirm({
    title: '移出成员', icon: null, content: `确定将「${m.name}」移出本组织？`,
    okText: '确认移出', okType: 'danger', cancelText: '取消',
    onOk: () => { members.value = members.value.filter((x) => x.id !== m.id); message.success('已移出'); },
  });
}
</script>

<template>
  <div class="org-manage">
    <!-- 左：组织架构树（含树内管理） -->
    <div class="left">
      <div class="panel-head">
        <span>组织架构</span>
        <a-button type="primary" size="small" @click="openCreateOrg"><template #icon><PlusOutlined /></template>新增组织</a-button>
      </div>
      <div class="tree-search">
        <a-input-search v-model:value="search" placeholder="搜索组织名称" allow-clear size="small" />
      </div>
      <a-tree v-model:expandedKeys="expandedKeys" v-model:selectedKeys="selectedKeys" :tree-data="displayTree" block-node class="org-tree">
        <template #title="node">
          <div class="tnode">
            <ApartmentOutlined class="tn-ic" />
            <span class="tn-name">{{ node.title }}</span>
            <a-tag :color="TYPE_TONE[node.type]" class="t-tag">{{ node.type }}</a-tag>
            <span class="t-cnt">{{ node.count }}人</span>
            <span class="tn-acts" @click.stop>
              <a-tooltip title="新增下级"><PlusOutlined class="ta-ic" @click="openAddChild(flat[node.key])" /></a-tooltip>
              <a-tooltip title="编辑"><EditOutlined class="ta-ic" @click="openEditOrg(flat[node.key])" /></a-tooltip>
              <a-tooltip title="删除"><DeleteOutlined v-if="node.key !== 'root'" class="ta-ic danger" @click="delOrg(flat[node.key])" /></a-tooltip>
            </span>
          </div>
        </template>
      </a-tree>
      <a-empty v-if="!displayTree.length" description="无匹配组织" :image="false" style="padding: 24px" />
    </div>

    <!-- 右：组织详情 + 组织人员管理 -->
    <div class="right">
      <div class="org-detail">
        <div class="od-title">{{ current.title }}<a-tag :color="TYPE_TONE[current.type]">{{ current.type }}</a-tag></div>
        <div class="od-meta">
          <div class="cell"><label>负责人</label><span>{{ current.leader }}</span></div>
          <div class="cell"><label>人员规模</label><span>{{ current.count }} 人</span></div>
          <div class="cell"><label>下级单位</label><span>{{ current.children?.length || 0 }} 个</span></div>
          <div class="cell"><label>组织类型</label><span>{{ current.type }}</span></div>
        </div>
        <div class="od-tip">组织的新增 / 编辑 / 新增下级 / 删除均在左侧「组织架构」树内悬停操作。</div>
      </div>

      <div class="mem-card">
        <div class="panel-head">
          <span>组织人员管理 · {{ current.title }}（{{ members.length }}）</span>
          <div class="mc-btns">
            <a-button type="primary" size="small" @click="openAddMember"><template #icon><PlusOutlined /></template>添加成员</a-button>
          </div>
        </div>
        <a-table :columns="memCols" :data-source="members" row-key="id" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'name'" class="mn"><a-avatar size="small"><template #icon><UserOutlined /></template></a-avatar>{{ record.name }}</span>
            <a-tag v-else-if="column.key === 'role'" color="blue">{{ record.role }}</a-tag>
            <a-tag v-else-if="column.key === 'status'" :color="record.status === '在职' ? 'green' : 'orange'">{{ record.status }}</a-tag>
            <template v-else-if="column.key === 'op'">
              <a-button type="link" size="small" @click="openTransfer(record as Member)">转岗</a-button>
              <a-button type="link" size="small" danger @click="removeMember(record as Member)">移出</a-button>
            </template>
          </template>
        </a-table>
      </div>
    </div>

    <!-- 新增 / 编辑组织 -->
    <a-modal v-model:open="orgModalOpen" :title="orgModalTitle" :width="460" :ok-text="orgMode === 'edit' ? '保存' : '创建'" cancel-text="取消" @ok="saveOrg">
      <a-form layout="vertical">
        <a-form-item label="组织名称" required><a-input v-model:value="orgForm.name" placeholder="如：华东客服部" /></a-form-item>
        <a-form-item label="组织类型">
          <a-radio-group v-model:value="orgForm.type" button-style="solid">
            <a-radio-button value="公司">公司</a-radio-button>
            <a-radio-button value="部门">部门</a-radio-button>
            <a-radio-button value="班组">班组</a-radio-button>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="上级组织">
          <a-select v-model:value="orgForm.parent" :options="parentOptions" :disabled="orgMode === 'child'" />
        </a-form-item>
        <a-form-item label="负责人"><a-input v-model:value="orgForm.leader" placeholder="选择或输入负责人" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 添加成员 / 转岗 -->
    <a-modal v-model:open="memModalOpen" :title="memModalTitle" :width="520" :ok-text="memMode === 'transfer' ? '保存' : '添加'" cancel-text="取消" @ok="saveMember">
      <a-form layout="vertical" class="mem-form">
        <a-form-item label="姓名" required class="half"><a-input v-model:value="mf.name" :disabled="memMode === 'transfer'" placeholder="请输入" /></a-form-item>
        <a-form-item label="分机" class="half"><a-input v-model:value="mf.ext" placeholder="如：8012" /></a-form-item>
        <a-form-item label="岗位" class="half"><a-select v-model:value="mf.post" :options="POST_OPTS.map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="角色" class="half"><a-select v-model:value="mf.role" :options="ROLE_OPTS.map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="状态" class="full"><a-radio-group v-model:value="mf.status" button-style="solid"><a-radio-button value="在职">在职</a-radio-button><a-radio-button value="试用">试用</a-radio-button><a-radio-button value="离职">离职</a-radio-button></a-radio-group></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.org-manage { display: flex; gap: 16px; padding: 16px 24px; align-items: flex-start; }
.left { width: 360px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding-bottom: 8px; }
.right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 600; color: #111827; }
.mc-btns { display: flex; gap: 8px; }
.mem-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
.mem-form .full { grid-column: 1 / -1; }
.mem-form :deep(.ant-form-item) { margin-bottom: 14px; }
.tree-search { padding: 10px 12px 4px; }
.org-tree { padding: 4px 8px 8px; }

.tnode { display: flex; align-items: center; gap: 6px; width: 100%; }
.tn-ic { color: #6b7280; }
.tn-name { font-size: 13px; }
.t-tag { transform: scale(0.78); }
.t-cnt { font-size: 11px; color: #9ca3af; }
.tn-acts { margin-left: auto; display: flex; gap: 10px; opacity: 0; transition: opacity 0.15s; }
.tnode:hover .tn-acts { opacity: 1; }
.ta-ic { font-size: 13px; color: #6b7280; }
.ta-ic:hover { color: #1a6fff; }
.ta-ic.danger:hover { color: #ef4444; }

.org-detail { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; }
.od-title { font-size: 16px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.od-meta { display: flex; flex-direction: column; }
.cell { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px dashed #f0f0f0; }
.cell:last-child { border-bottom: none; }
.cell label { font-size: 13px; color: #6b7280; flex: none; } .cell span { font-size: 13px; color: #374151; text-align: right; }
.od-tip { margin-top: 16px; padding-top: 14px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af; }
.mem-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
.mn { display: flex; align-items: center; gap: 8px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
:deep(.org-tree .ant-tree-node-content-wrapper) { width: 100%; }
</style>
