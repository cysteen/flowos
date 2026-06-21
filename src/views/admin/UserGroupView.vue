<script setup lang="ts">
import { ref, computed } from 'vue';
import { message } from 'ant-design-vue';
import {
  PlusOutlined, TeamOutlined, UserOutlined, EditOutlined, DeleteOutlined, CrownOutlined,
} from '@ant-design/icons-vue';

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

const memberMap: Record<string, Member[]> = {
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
};
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
function todo(t: string) { message.info(`「${t}」（演示）`); }
</script>

<template>
  <div class="user-group">
    <!-- 分组列表 -->
    <div class="left">
      <div class="panel-head"><span>用户分组</span><a-button type="primary" size="small" @click="todo('新建分组')"><template #icon><PlusOutlined /></template>新建</a-button></div>
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
      <div class="g-detail">
        <div class="gd-title">{{ sel.name }}<a-tag :color="TYPE_TONE[sel.type]">{{ sel.type }}</a-tag></div>
        <div class="gd-meta">
          <div class="gd-cell"><label>负责人</label><span><CrownOutlined /> {{ sel.leader }}</span></div>
          <div class="gd-cell"><label>排班</label><span>{{ sel.shift }}</span></div>
          <div class="gd-cell"><label>技能标签</label><span><a-tag v-for="s in sel.skills" :key="s" color="blue">{{ s }}</a-tag></span></div>
          <div class="gd-cell"><label>成员数</label><span>{{ sel.count }} 人</span></div>
        </div>
        <div class="gd-acts">
          <a-button size="small" @click="todo('编辑分组')"><template #icon><EditOutlined /></template>编辑分组</a-button>
          <a-button size="small" @click="todo('排班配置')">排班配置</a-button>
          <a-button size="small" @click="todo('技能路由')">技能路由</a-button>
        </div>
      </div>

      <div class="mem-card">
        <div class="panel-head"><span>组内成员</span><a-button type="primary" size="small" @click="todo('添加成员')"><template #icon><PlusOutlined /></template>添加成员</a-button></div>
        <a-table :columns="memCols" :data-source="members" row-key="id" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'name'" class="mem-name"><a-avatar size="small"><template #icon><UserOutlined /></template></a-avatar>{{ record.name }}</span>
            <a-tag v-else-if="column.key === 'role'" :color="record.role === '班组长' ? 'gold' : 'default'">{{ record.role }}</a-tag>
            <a-tag v-else-if="column.key === 'status'" :color="ST_TONE[record.status]">{{ record.status }}</a-tag>
            <span v-else-if="column.key === 'tickets'"><b>{{ record.tickets }}</b></span>
            <template v-else-if="column.key === 'op'">
              <a-button type="link" size="small" @click="todo('设为组长')">设组长</a-button>
              <DeleteOutlined class="op-ic danger" @click="todo('移除')" />
            </template>
          </template>
        </a-table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-group { display: flex; gap: 16px; padding: 16px 24px; align-items: flex-start; }
.left { width: 300px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
.right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
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
.g-detail { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; }
.gd-title { font-size: 16px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.gd-meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px 24px; }
.gd-cell { display: flex; flex-direction: column; gap: 4px; }
.gd-cell label { font-size: 12px; color: #9ca3af; }
.gd-cell span { font-size: 13px; color: #374151; }
.gd-acts { display: flex; gap: 10px; margin-top: 18px; padding-top: 16px; border-top: 1px solid #f3f4f6; }
.mem-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
.mem-name { display: flex; align-items: center; gap: 8px; }
.op-ic { color: #ef4444; cursor: pointer; margin-left: 8px; } .op-ic:hover { opacity: 0.7; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
