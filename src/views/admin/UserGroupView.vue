<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, TeamOutlined, UserOutlined, EditOutlined, CrownOutlined,
  CalendarOutlined, ApartmentOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';

// 用户分组（PRD-70，D3：BPM 用户分组 与 服务班组合并）：分组（含技能/排班/负责人）+ 成员。
interface Group {
  key: string; name: string; type: '业务班组' | '审批组' | '虚拟组';
  leader: string; skills: string[]; shift: string; count: number;
}
interface Member { id: string; name: string; role: string; ext: string; status: '在线' | '小休' | '离线'; tickets: number; }

const groups = ref<Group[]>([
  { key: 'g1', name: '一线客服组', type: '业务班组', leader: '王芳', skills: ['投诉', '咨询'], shift: '三班倒', count: 18 },
  { key: 'g2', name: '二线处理组', type: '业务班组', leader: '李强', skills: ['投诉', '技术'], shift: '白班', count: 9 },
  { key: 'g3', name: '售后服务组', type: '业务班组', leader: '赵敏', skills: ['售后', '退换货'], shift: '两班', count: 12 },
  { key: 'g4', name: '商机跟进组', type: '业务班组', leader: '孙磊', skills: ['商机'], shift: '白班', count: 6 },
  { key: 'g5', name: '班长审批组', type: '审批组', leader: '周琳', skills: ['审批'], shift: '—', count: 4 },
  { key: 'g6', name: '质检虚拟组', type: '虚拟组', leader: '吴昊', skills: ['质检'], shift: '—', count: 3 },
]);
const selected = ref('g1');
const sel = computed(() => groups.value.find((g) => g.key === selected.value)!);

const memberMap: Record<string, Member[]> = reactive({
  g1: [
    { id: 'u1', name: '王芳', role: '班组长', ext: '8001', status: '在线', tickets: 0 },
    { id: 'u2', name: '陈静', role: '一线坐席', ext: '8012', status: '在线', tickets: 5 },
    { id: 'u3', name: '刘洋', role: '一线坐席', ext: '8013', status: '小休', tickets: 3 },
    { id: 'u4', name: '黄勇', role: '一线坐席', ext: '8014', status: '在线', tickets: 7 },
    { id: 'u5', name: '周敏', role: '一线坐席', ext: '8015', status: '离线', tickets: 0 },
  ],
  g2: [
    { id: 'u6', name: '李强', role: '班组长', ext: '8101', status: '在线', tickets: 2 },
    { id: 'u7', name: '杨帆', role: '二线坐席', ext: '8112', status: '在线', tickets: 4 },
    { id: 'u8', name: '林峰', role: '二线坐席', ext: '8113', status: '在线', tickets: 6 },
  ],
  g3: [
    { id: 'u9', name: '赵敏', role: '班组长', ext: '8201', status: '在线', tickets: 1 },
    { id: 'u10', name: '钱进', role: '售后坐席', ext: '8212', status: '小休', tickets: 3 },
  ],
  g4: [{ id: 'u11', name: '孙磊', role: '班组长', ext: '8301', status: '在线', tickets: 2 }],
  g5: [{ id: 'u12', name: '周琳', role: '审批人', ext: '8401', status: '在线', tickets: 0 }],
  g6: [{ id: 'u13', name: '吴昊', role: '质检员', ext: '8501', status: '在线', tickets: 0 }],
});
const members = computed(() => memberMap[selected.value] ?? []);

const TYPE_TONE: Record<string, string> = { 业务班组: 'blue', 审批组: 'orange', 虚拟组: 'purple' };
const ST_TONE: Record<string, string> = { 在线: 'green', 小休: 'orange', 离线: 'default' };
const memCols = [
  { title: '成员', dataIndex: 'name', key: 'name', width: 140 },
  { title: '组内角色', dataIndex: 'role', key: 'role', width: 110 },
  { title: '分机', dataIndex: 'ext', key: 'ext', width: 90 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '在办工单', dataIndex: 'tickets', key: 'tickets', width: 100 },
  { title: '操作', key: 'op', width: 110 },
];
const TYPE_OPTS = ['业务班组', '审批组', '虚拟组'];
const SHIFT_OPTS = ['白班', '两班', '三班倒', '—'];
const SKILL_OPTS = ['投诉', '咨询', '技术', '售后', '退换货', '商机', '审批', '质检'];
const ROLE_OPTS = ['班组长', '一线坐席', '二线坐席', '售后坐席', '审批人', '质检员'];

function syncCount(key: string) { const g = groups.value.find((x) => x.key === key); if (g) g.count = (memberMap[key] ?? []).length; }

// —— 分组 新建/编辑（含排班/技能）——
let gSeq = 7;
const groupModalOpen = ref(false);
const gMode = ref<'create' | 'edit'>('create');
const gf = reactive<Group>({ key: '', name: '', type: '业务班组', leader: '', skills: [], shift: '白班', count: 0 });
function openCreateGroup() { gMode.value = 'create'; Object.assign(gf, { key: '', name: '', type: '业务班组', leader: '', skills: [], shift: '白班', count: 0 }); groupModalOpen.value = true; }
function openEditGroup() { gMode.value = 'edit'; Object.assign(gf, { ...sel.value, skills: [...sel.value.skills] }); groupModalOpen.value = true; }
function saveGroup() {
  if (!gf.name) { message.error('请填写分组名称'); return; }
  if (gMode.value === 'edit') {
    const g = groups.value.find((x) => x.key === gf.key);
    if (g) Object.assign(g, { ...gf, skills: [...gf.skills] });
    message.success('分组已更新');
  } else {
    const key = 'g' + gSeq++;
    groups.value.push({ ...gf, key, count: 0, skills: [...gf.skills] });
    memberMap[key] = [];
    selected.value = key;
    message.success(`分组「${gf.name}」已创建`);
  }
  groupModalOpen.value = false;
}

// —— 成员 添加/移除/设组长 ——
let mSeq = 14;
const memModalOpen = ref(false);
const mf = reactive<Member>({ id: '', name: '', role: '一线坐席', ext: '', status: '在线', tickets: 0 });
function openAddMember() { Object.assign(mf, { id: '', name: '', role: '一线坐席', ext: '', status: '在线', tickets: 0 }); memModalOpen.value = true; }
function saveMember() {
  if (!mf.name) { message.error('请填写成员姓名'); return; }
  memberMap[selected.value].push({ ...mf, id: 'u' + mSeq++ });
  syncCount(selected.value);
  message.success(`已添加成员「${mf.name}」`);
  memModalOpen.value = false;
}
function setLeader(m: Member) {
  const arr = memberMap[selected.value];
  arr.forEach((x) => { if (x.role === '班组长') x.role = '一线坐席'; });
  m.role = '班组长';
  if (sel.value) sel.value.leader = m.name;
  message.success(`已将 ${m.name} 设为组长`);
}
function removeMember(m: Member) {
  Modal.confirm({
    title: '移除成员', icon: null, content: `确定将「${m.name}」移出本组？`,
    okText: '确认移除', okType: 'danger', cancelText: '取消',
    onOk: () => { const arr = memberMap[selected.value]; const i = arr.findIndex((x) => x.id === m.id); if (i >= 0) arr.splice(i, 1); syncCount(selected.value); message.success('已移除'); },
  });
}
</script>

<template>
  <div class="user-group">
    <AdminPageHeader title="用户分组" subtitle="按班组/审批组/虚拟组管理成员与技能；技能路由、排班依此分派">
      <template #actions>
        <a-button type="primary" @click="openCreateGroup"><template #icon><PlusOutlined /></template>新建分组</a-button>
      </template>
    </AdminPageHeader>

    <div class="cols">
      <!-- 分组列表 -->
      <div class="left">
        <div class="panel-head"><span>分组列表（{{ groups.length }}）</span></div>
        <div class="g-list">
          <div v-for="g in groups" :key="g.key" class="g-item" :class="{ on: g.key === selected }" @click="selected = g.key">
            <div class="gi-ic"><TeamOutlined /></div>
            <div class="gi-body">
              <div class="gi-name">{{ g.name }}<a-tag :color="TYPE_TONE[g.type]" class="gi-tag">{{ g.type }}</a-tag></div>
              <div class="gi-sub"><CrownOutlined /> {{ g.leader }} · {{ g.count }} 人</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 分组详情 + 成员 -->
      <div class="right">
        <div class="panel">
          <div class="panel-head">
            <span>分组详情 · {{ sel.name }}</span>
            <a-button size="small" @click="openEditGroup"><template #icon><EditOutlined /></template>编辑分组</a-button>
          </div>
          <div class="gd-body">
            <div class="gd-meta">
              <div class="gd-cell"><label>组类型</label><span><a-tag :color="TYPE_TONE[sel.type]">{{ sel.type }}</a-tag></span></div>
              <div class="gd-cell"><label><CrownOutlined /> 负责人</label><span>{{ sel.leader }}</span></div>
              <div class="gd-cell"><label><CalendarOutlined /> 排班</label><span>{{ sel.shift }}</span></div>
              <div class="gd-cell"><label>成员数</label><span>{{ sel.count }} 人</span></div>
              <div class="gd-cell full"><label><ApartmentOutlined /> 技能标签（技能路由依据）</label><span><a-tag v-for="s in sel.skills" :key="s" color="blue">{{ s }}</a-tag></span></div>
            </div>
          </div>
        </div>

        <div class="panel mem-card">
          <div class="panel-head"><span>组内成员（{{ members.length }}）</span><a-button type="primary" size="small" @click="openAddMember"><template #icon><PlusOutlined /></template>添加成员</a-button></div>
          <a-table :columns="memCols" :data-source="members" row-key="id" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'name'" class="mem-name"><a-avatar size="small"><template #icon><UserOutlined /></template></a-avatar>{{ record.name }}</span>
              <a-tag v-else-if="column.key === 'role'" :color="record.role === '班组长' ? 'gold' : 'default'">{{ record.role }}</a-tag>
              <a-tag v-else-if="column.key === 'status'" :color="ST_TONE[record.status]">{{ record.status }}</a-tag>
              <span v-else-if="column.key === 'tickets'"><b>{{ record.tickets }}</b></span>
              <template v-else-if="column.key === 'op'">
                <a-button type="link" size="small" :disabled="record.role === '班组长'" @click="setLeader(record as Member)">设组长</a-button>
                <a-button type="link" size="small" danger @click="removeMember(record as Member)">移除</a-button>
              </template>
            </template>
          </a-table>
        </div>
      </div>
    </div>

    <!-- 新建 / 编辑分组 -->
    <a-modal v-model:open="groupModalOpen" :title="gMode === 'edit' ? '编辑分组' : '新建分组'" :width="540" :ok-text="gMode === 'edit' ? '保存' : '创建'" cancel-text="取消" @ok="saveGroup">
      <a-form layout="vertical" class="g-form">
        <a-form-item label="分组名称" required class="half"><a-input v-model:value="gf.name" placeholder="如：一线客服组" /></a-form-item>
        <a-form-item label="分组类型" class="half"><a-select v-model:value="gf.type" :options="TYPE_OPTS.map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="负责人" class="half"><a-input v-model:value="gf.leader" placeholder="组长姓名" /></a-form-item>
        <a-form-item label="排班" class="half"><a-select v-model:value="gf.shift" :options="SHIFT_OPTS.map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="技能标签（技能路由依据）" class="full"><a-select v-model:value="gf.skills" mode="multiple" :options="SKILL_OPTS.map((v)=>({value:v,label:v}))" placeholder="选择该组承接的技能" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 添加成员 -->
    <a-modal v-model:open="memModalOpen" title="添加成员" :width="500" ok-text="添加" cancel-text="取消" @ok="saveMember">
      <a-form layout="vertical" class="g-form">
        <a-form-item label="成员姓名" required class="half"><a-input v-model:value="mf.name" placeholder="请输入" /></a-form-item>
        <a-form-item label="分机" class="half"><a-input v-model:value="mf.ext" placeholder="如：8012" /></a-form-item>
        <a-form-item label="组内角色" class="half"><a-select v-model:value="mf.role" :options="ROLE_OPTS.map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="状态" class="half"><a-select v-model:value="mf.status" :options="['在线','小休','离线'].map((v)=>({value:v,label:v}))" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.user-group { padding: 20px 24px; }
.cols { display: flex; gap: 16px; align-items: flex-start; }
.left { width: 300px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
.right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 600; color: #111827; }
.g-list { padding: 8px; }
.g-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; cursor: pointer; }
.g-item:hover { background: #f9fafb; }
.g-item.on { background: #eff6ff; }
.gi-ic { width: 36px; height: 36px; flex: none; border-radius: 9px; background: linear-gradient(135deg, #1a6fff, #4f9bff); color: #fff; display: flex; align-items: center; justify-content: center; }
.gi-body { flex: 1; min-width: 0; }
.gi-name { font-size: 13px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 6px; }
.gi-tag { transform: scale(0.8); }
.gi-sub { font-size: 12px; color: #9ca3af; margin-top: 2px; }
.gd-body { padding: 6px 20px 14px; }
.gd-meta { display: flex; flex-direction: column; }
.gd-cell { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 11px 0; border-bottom: 1px dashed #f0f0f0; }
.gd-cell:last-child { border-bottom: none; }
.gd-cell label { font-size: 13px; color: #6b7280; flex: none; display: flex; align-items: center; gap: 5px; }
.gd-cell span { font-size: 13px; color: #374151; text-align: right; min-width: 0; }
.mem-name { display: flex; align-items: center; gap: 8px; }
.g-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
.g-form .full { grid-column: 1 / -1; }
.g-form :deep(.ant-form-item) { margin-bottom: 14px; }
.op-ic { color: #ef4444; cursor: pointer; margin-left: 8px; } .op-ic:hover { opacity: 0.7; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
