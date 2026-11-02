<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, TeamOutlined, UserOutlined, EditOutlined, CrownOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { useDispatchStore } from '@/stores/dispatch';
import { MODE_TONE } from '@/views/admin/dispatch/dispatchUi';
import type { DispatchRole } from '@/views/tickets/types/dispatch';

// 用户分组（PRD-70，D3：BPM 用户分组 与 服务班组合并）：分组（含排班/负责人）+ 成员。
// 【1215】14.7：组主数据统一为用户分组一套 —— 业务班组即派单组（一组一池），成员取派单坐席；
// 本组派单方式只读；组级技能移除，处理能力由成员人员画像表达。
interface Group {
  key: string; name: string; type: '业务班组' | '审批组' | '虚拟组';
  leader: string; shift: string;
}
interface Member { id: string; name: string; role: string; ext: string; status: string; tickets: number; }

const dispatch = useDispatchStore();

/** 本地维护的分组（不进入派单的一线客服组、审批组、虚拟组）；派单组取派单 store */
const localGroups = ref<Group[]>([
  { key: 'line1', name: '一线客服组', type: '业务班组', leader: '王芳', shift: '三班倒' },
  { key: 'g5', name: '班长审批组', type: '审批组', leader: '周琳', shift: '—' },
  { key: 'g6', name: '质检虚拟组', type: '虚拟组', leader: '吴昊', shift: '—' },
]);
/** 派单组的排班（本页维护） */
const dispatchShift = reactive<Record<string, string>>({});

const groups = computed<Group[]>(() => [
  localGroups.value[0],
  ...dispatch.groups.map((g) => ({
    key: g.id, name: g.label, type: '业务班组' as const, leader: g.leaders.join('、'), shift: dispatchShift[g.id] ?? '白班',
  })),
  ...localGroups.value.slice(1),
]);
const selected = ref('line1');
const sel = computed(() => groups.value.find((g) => g.key === selected.value) ?? groups.value[0]);
const isDispatchGroup = (key: string) => dispatch.isDispatchPool(key);
const selGroup = computed(() => dispatch.groupOf(selected.value));

const memberMap: Record<string, Member[]> = reactive({
  line1: [
    { id: 'u1', name: '王芳', role: '二线班组长', ext: '8001', status: '在线', tickets: 0 },
    { id: 'u2', name: '陈静', role: '一线坐席', ext: '8012', status: '在线', tickets: 5 },
    { id: 'u3', name: '刘洋', role: '一线坐席', ext: '8013', status: '小休', tickets: 3 },
    { id: 'u4', name: '黄勇', role: '一线坐席', ext: '8014', status: '在线', tickets: 7 },
    { id: 'u5', name: '周敏', role: '一线坐席', ext: '8015', status: '离线', tickets: 0 },
  ],
  g5: [{ id: 'u12', name: '周琳', role: '投诉督导', ext: '8401', status: '在线', tickets: 0 }],
  g6: [{ id: 'u13', name: '吴昊', role: '质检', ext: '8501', status: '在线', tickets: 0 }],
});

/** 派单角色 → 组内角色（0830 九角色） */
const ROLE_LABEL: Partial<Record<DispatchRole, string>> = { 班组长: '二线班组长', 督导: '投诉督导', 运营: '工单运营' };

function membersOf(key: string): Member[] {
  if (!isDispatchGroup(key)) return memberMap[key] ?? [];
  void dispatch.ticketStates;
  return dispatch.membersOf(key).map((a) => ({
    id: a.name,
    name: a.name,
    role: a.roles.map((r) => ROLE_LABEL[r] ?? r).join('、'),
    ext: a.staffNo,
    status: a.signIn,
    tickets: dispatch.inTransitOf(a.name),
  }));
}
const members = computed(() => membersOf(selected.value));
const countOf = (key: string) => membersOf(key).length;

const TYPE_TONE: Record<string, string> = { 业务班组: 'blue', 审批组: 'orange', 虚拟组: 'purple' };
const ST_TONE: Record<string, string> = { 在线: 'green', 签入: 'green', 小休: 'orange', 离线: 'default', 签出: 'default' };
const memCols = computed(() => [
  { title: '成员', dataIndex: 'name', key: 'name', width: 140 },
  { title: '组内角色', dataIndex: 'role', key: 'role', width: 110 },
  { title: isDispatchGroup(selected.value) ? '工号' : '分机', dataIndex: 'ext', key: 'ext', width: 90 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '在办工单', dataIndex: 'tickets', key: 'tickets', width: 100 },
  { title: '操作', key: 'op', width: 110 },
]);
const TYPE_OPTS = ['业务班组', '审批组', '虚拟组'];
const SHIFT_OPTS = ['白班', '两班', '三班倒', '—'];
// 角色下拉取 0830 九角色（基线 §3.0）
const ROLE_OPTS = ['一线坐席', '二线专员', '技术支持', '二线班组长', '客诉专员', '投诉督导', '工单运营', '质检', '管理员'];

// —— 分组 新建/编辑（含排班）——
let gSeq = 7;
const groupModalOpen = ref(false);
const gMode = ref<'create' | 'edit'>('create');
const gf = reactive<Group>({ key: '', name: '', type: '业务班组', leader: '', shift: '白班' });
const gfDispatch = computed(() => gMode.value === 'edit' && isDispatchGroup(gf.key));
function openCreateGroup() {
  gMode.value = 'create';
  Object.assign(gf, { key: '', name: '', type: '业务班组', leader: '', shift: '白班' });
  groupModalOpen.value = true;
}
function openEditGroup() {
  gMode.value = 'edit';
  Object.assign(gf, { ...sel.value });
  groupModalOpen.value = true;
}
function saveGroup() {
  if (!gf.name) { message.error('请填写分组名称'); return; }
  if (gMode.value === 'edit') {
    const dg = dispatch.groupOf(gf.key);
    if (dg) {
      dg.label = gf.name;
      dg.leaders = gf.leader.split(/[、,，\s]+/).filter(Boolean);
      dispatchShift[gf.key] = gf.shift;
    } else {
      const g = localGroups.value.find((x) => x.key === gf.key);
      if (g) Object.assign(g, { name: gf.name, type: gf.type, leader: gf.leader, shift: gf.shift });
    }
    groupModalOpen.value = false;
    message.success('分组已更新');
    return;
  }
  const key = 'g' + gSeq++;
  localGroups.value.push({ key, name: gf.name, type: gf.type, leader: gf.leader, shift: gf.shift });
  memberMap[key] = [];
  selected.value = key;
  message.success(`分组「${gf.name}」已创建`);
  groupModalOpen.value = false;
}

// —— 成员 添加/移除/设组长 ——
let mSeq = 14;
const memModalOpen = ref(false);
const mf = reactive<Member>({ id: '', name: '', role: '一线坐席', ext: '', status: '在线', tickets: 0 });
function openAddMember() { Object.assign(mf, { id: '', name: '', role: '一线坐席', ext: '', status: '在线', tickets: 0 }); memModalOpen.value = true; }
function saveMember() {
  if (!mf.name) { message.error('请填写成员姓名'); return; }
  const a = dispatch.agentOf(mf.name);
  if (isDispatchGroup(selected.value)) {
    if (!a) { message.error('该成员不是派单坐席，请先在用户管理中维护'); return; }
    if (!a.groupIds.includes(selected.value)) a.groupIds = [...a.groupIds, selected.value];
  } else {
    (memberMap[selected.value] ??= []).push({ ...mf, id: 'u' + mSeq++ });
  }
  message.success(`已添加成员「${mf.name}」`);
  memModalOpen.value = false;
}
function setLeader(m: Member) {
  const dg = dispatch.groupOf(selected.value);
  if (dg) {
    dg.leaders = [m.name];
  } else {
    const arr = memberMap[selected.value] ?? [];
    arr.forEach((x) => { if (x.role === '班组长') x.role = '一线坐席'; });
    m.role = '班组长';
    const g = localGroups.value.find((x) => x.key === selected.value);
    if (g) g.leader = m.name;
  }
  message.success(`已将 ${m.name} 设为组长`);
}
function isLeader(m: Member): boolean {
  const dg = dispatch.groupOf(selected.value);
  return dg ? dg.leaders.includes(m.name) : m.role === '班组长';
}
function removeMember(m: Member) {
  Modal.confirm({
    title: '移除成员', icon: null, content: `确定将「${m.name}」移出本组？`,
    okText: '确认移除', okType: 'danger', cancelText: '取消',
    onOk: () => {
      const key = selected.value;
      const a = isDispatchGroup(key) ? dispatch.agentOf(m.name) : undefined;
      if (a) {
        a.groupIds = a.groupIds.filter((id) => id !== key);
      } else {
        const arr = memberMap[key] ?? [];
        const i = arr.findIndex((x) => x.id === m.id);
        if (i >= 0) arr.splice(i, 1);
      }
      message.success('已移除');
    },
  });
}
</script>

<template>
  <div class="user-group">
    <AdminPageHeader title="用户分组" subtitle="按班组/审批组/虚拟组管理成员；组池、派单候选范围与报表均取用户分组">
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
              <div class="gi-sub"><CrownOutlined /> {{ g.leader || '—' }} · {{ countOf(g.key) }} 人</div>
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
              <div class="gd-kv">
                <span class="gd-label">组类型</span>
                <span class="gd-val"><a-tag :color="TYPE_TONE[sel.type]">{{ sel.type }}</a-tag></span>
              </div>
              <div class="gd-kv">
                <span class="gd-label">负责人</span>
                <span class="gd-val">{{ sel.leader || '—' }}</span>
              </div>
              <div class="gd-kv">
                <span class="gd-label">排班</span>
                <span class="gd-val">{{ sel.shift }}</span>
              </div>
              <div class="gd-kv">
                <span class="gd-label">成员数</span>
                <span class="gd-val">{{ members.length }} 人</span>
              </div>
              <div v-if="selGroup" class="gd-kv">
                <span class="gd-label">本组派单方式</span>
                <span class="gd-val"><a-tag :color="MODE_TONE[dispatch.groupModeOf(selGroup.id)]">{{ dispatch.groupModeOf(selGroup.id) }}</a-tag></span>
              </div>
            </div>
          </div>
        </div>

        <div class="panel mem-card">
          <div class="panel-head"><span>组内成员（{{ members.length }}）</span><a-button type="primary" size="small" @click="openAddMember"><template #icon><PlusOutlined /></template>添加成员</a-button></div>
          <a-table :columns="memCols" :data-source="members" row-key="id" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'name'" class="mem-name"><a-avatar size="small"><template #icon><UserOutlined /></template></a-avatar>{{ record.name }}</span>
              <a-tag v-else-if="column.key === 'role'" :color="isLeader(record as Member) ? 'gold' : 'default'">{{ record.role }}</a-tag>
              <a-tag v-else-if="column.key === 'status'" :color="ST_TONE[record.status]">{{ record.status }}</a-tag>
              <span v-else-if="column.key === 'tickets'"><b>{{ record.tickets }}</b></span>
              <template v-else-if="column.key === 'op'">
                <a-button type="link" size="small" :disabled="isLeader(record as Member)" @click="setLeader(record as Member)">设组长</a-button>
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
        <a-form-item label="分组类型" class="half"><a-select v-model:value="gf.type" :disabled="gfDispatch" :options="TYPE_OPTS.map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item label="负责人" class="half"><a-input v-model:value="gf.leader" placeholder="组长姓名" /></a-form-item>
        <a-form-item label="排班" class="half"><a-select v-model:value="gf.shift" :options="SHIFT_OPTS.map((v)=>({value:v,label:v}))" /></a-form-item>
        <a-form-item v-if="gfDispatch" label="本组派单方式" class="half">
          <a-tag :color="MODE_TONE[dispatch.groupModeOf(gf.key)]">{{ dispatch.groupModeOf(gf.key) }}</a-tag>
        </a-form-item>
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
.gd-body { padding: 14px 16px; }
.gd-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 40px;
}
.gd-kv {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}
.gd-label {
  flex: none;
  width: 64px;
  font-size: 13px;
  color: #9ca3af;
}
.gd-val {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: #374151;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.mem-name { display: flex; align-items: center; gap: 8px; }
.g-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
.g-form .full { grid-column: 1 / -1; }
.g-form :deep(.ant-form-item) { margin-bottom: 14px; }
.op-ic { color: #ef4444; cursor: pointer; margin-left: 8px; } .op-ic:hover { opacity: 0.7; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
