<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { PlusOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons-vue';
import AdminSectionTabs from './components/AdminSectionTabs.vue';
import { RULES_NAV_ITEMS, adminNavActiveKey } from '@/config/adminNav';
import { stdPagination } from '@/config/adminUi';

// 规则中心（PRD-58）：规则列表 / 可视化编辑 / 流转路由 / 工单池规则 / 升级路由 / 执行日志。
const route = useRoute();
const activeKey = computed(() => adminNavActiveKey(route.path));

// —— 规则列表 ——
const rules = ref([
  { no: 'RL001', name: '投诉自动派学习机组', type: '流转路由', cond: '类型=投诉 且 产品线=学习机', action: '派发→学习机处理组', status: '启用', hits: 1240 },
  { no: 'RL002', name: 'VIP 入专属池', type: '工单池规则', cond: '客户等级=VIP', action: '入池→大客户专属池', status: '启用', hits: 320 },
  { no: 'RL003', name: '超时升级二线', type: '升级路由', cond: '解决SLA 已超时', action: '升级→二线技术支持组 + 优先级+1', status: '启用', hits: 86 },
  { no: 'RL004', name: '夜间转值班组', type: '流转路由', cond: '创建时间 ∈ 22:00-08:00', action: '派发→夜班应急组', status: '停用', hits: 12 },
]);
const ruleCols = [
  { title: '规则编号', dataIndex: 'no', key: 'no', width: 100 },
  { title: '规则名称', dataIndex: 'name', key: 'name', width: 180 },
  { title: '类型', dataIndex: 'type', key: 'type', width: 110 },
  { title: 'IF 条件', dataIndex: 'cond', key: 'cond' },
  { title: 'THEN 动作', dataIndex: 'action', key: 'action' },
  { title: '命中', dataIndex: 'hits', key: 'hits', width: 80 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '操作', key: 'action_', width: 130 },
];
function toggle(r: { name: string; status: string }) {
  const next = r.status === '启用' ? '停用' : '启用';
  Modal.confirm({ title: '状态变更', content: `确定${next}「${r.name}」？`, onOk: () => { r.status = next; message.success(`已${next}`); } });
}

// —— 可视化编辑（条件树 + 动作）——
const logic = ref<'AND' | 'OR'>('AND');
const conds = ref([
  { id: 1, field: '工单类型', op: '等于', value: '投诉' },
  { id: 2, field: '产品线', op: '等于', value: '学习机' },
  { id: 3, field: '客户等级', op: '属于', value: 'VIP' },
]);
const FIELDS = ['工单类型', '产品线', '客户等级', '渠道', '优先级', '创建时间', 'SLA状态'];
const OPS = ['等于', '不等于', '属于', '包含', '大于', '小于'];
const acts = ref([
  { id: 1, type: '派发到组', value: '学习机处理组' },
  { id: 2, type: '设置优先级', value: 'P1' },
]);
const ACT_TYPES = ['派发到组', '派发到人', '入工单池', '设置优先级', '打标签', '发通知', '升级'];
function addCond() { conds.value.push({ id: Date.now(), field: FIELDS[0], op: '等于', value: '' }); }
function delCond(id: number) { conds.value = conds.value.filter((c) => c.id !== id); }
function addAct() { acts.value.push({ id: Date.now(), type: ACT_TYPES[0], value: '' }); }
function delAct(id: number) { acts.value = acts.value.filter((a) => a.id !== id); }

// —— 流转路由 / 工单池 / 升级路由（按 key 复用列表形态）——
const routingRows = ref([
  { no: 'RT01', name: '按产品线派发', cond: '产品线=学习机', target: '学习机处理组', priority: 1, status: '启用' },
  { no: 'RT02', name: '按技能派发', cond: '问题类型=技术', target: '技术支持组', priority: 2, status: '启用' },
  { no: 'RT03', name: '兜底派发', cond: '默认', target: '通用工单池', priority: 99, status: '启用' },
]);
const poolRows = ref([
  { no: 'PL01', name: 'VIP 专属池', cond: '客户等级=VIP', claim: '组内认领', status: '启用' },
  { no: 'PL02', name: '投诉池', cond: '类型=投诉 且 未分派', claim: '班组长分派', status: '启用' },
  { no: 'PL03', name: '通用池', cond: '默认', claim: '抢单', status: '启用' },
]);
const escRows = ref([
  { no: 'EC01', name: '响应超时升级', cond: '响应SLA超时', target: '班组长', status: '启用' },
  { no: 'EC02', name: '解决超时升二线', cond: '解决SLA超时', target: '二线技术支持组', status: '启用' },
  { no: 'EC03', name: '高优先直升', cond: '优先级=P0', target: '客服主管', status: '启用' },
]);
const routeColsCommon = computed(() => {
  if (activeKey.value === 'rules-pool') return [
    { title: '编号', dataIndex: 'no', key: 'no', width: 90 }, { title: '池名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '入池条件', dataIndex: 'cond', key: 'cond' }, { title: '认领策略', dataIndex: 'claim', key: 'claim', width: 140 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  ];
  return [
    { title: '编号', dataIndex: 'no', key: 'no', width: 90 }, { title: '规则名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '条件', dataIndex: 'cond', key: 'cond' }, { title: '目标', dataIndex: 'target', key: 'target', width: 160 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  ];
});
const routeData = computed(() => activeKey.value === 'rules-routing' ? routingRows.value : activeKey.value === 'rules-pool' ? poolRows.value : escRows.value);

// —— 执行日志 ——
const logRows = [
  { time: '2026-06-21 11:20:05', rule: 'RL001 投诉自动派学习机组', ticket: 'LCMN-20260610-73026', result: '命中·已派发', tone: 'ok' },
  { time: '2026-06-21 11:18:30', rule: 'RL003 超时升级二线', ticket: 'LCMN-20260610-75002', result: '命中·已升级', tone: 'ok' },
  { time: '2026-06-21 11:05:12', rule: 'RL002 VIP 入专属池', ticket: 'LCMN-20260610-73118', result: '命中·已入池', tone: 'ok' },
  { time: '2026-06-21 10:50:44', rule: 'RL004 夜间转值班组', ticket: '—', result: '未命中(规则停用)', tone: 'muted' },
];
const logCols = [
  { title: '执行时间', dataIndex: 'time', key: 'time', width: 170 },
  { title: '规则', dataIndex: 'rule', key: 'rule' },
  { title: '工单', dataIndex: 'ticket', key: 'ticket', width: 200 },
  { title: '结果', dataIndex: 'result', key: 'result', width: 160 },
];

const pagination = stdPagination();
function save() { message.success('已保存并生效'); }
</script>

<template>
  <div class="rules-engine">
    <AdminSectionTabs :items="RULES_NAV_ITEMS" :active-key="activeKey" />
    <div class="body">
      <!-- 规则列表 -->
      <template v-if="activeKey === 'rules-list'">
        <div class="table-card">
          <div class="toolbar"><span class="tt">规则列表</span><a-button type="primary"><template #icon><PlusOutlined /></template>新增规则</a-button></div>
          <a-table :columns="ruleCols" :data-source="rules" row-key="no" :pagination="pagination" size="middle">
            <template #bodyCell="{ column, record }">
              <a-tag v-if="column.key === 'type'" color="blue">{{ (record as any).type }}</a-tag>
              <span v-else-if="column.key === 'status'" class="status" :class="(record as any).status === '启用' ? 'on' : 'off'" @click="toggle(record as any)">● {{ (record as any).status }}</span>
              <template v-else-if="column.key === 'action_'"><span class="act primary">编辑</span><span class="act" @click="toggle(record as any)">{{ (record as any).status === '启用' ? '停用' : '启用' }}</span></template>
            </template>
          </a-table>
        </div>
      </template>

      <!-- 可视化规则编辑 -->
      <template v-else-if="activeKey === 'rules-editor'">
        <div class="card">
          <div class="card-title">IF 条件（满足 <a-select v-model:value="logic" size="small" style="width:80px" :options="[{value:'AND',label:'全部'},{value:'OR',label:'任一'}]" /> 条件）</div>
          <div v-for="c in conds" :key="c.id" class="cond-row">
            <a-select v-model:value="c.field" size="small" style="width:130px" :options="FIELDS.map((o)=>({value:o,label:o}))" />
            <a-select v-model:value="c.op" size="small" style="width:90px" :options="OPS.map((o)=>({value:o,label:o}))" />
            <a-input v-model:value="c.value" size="small" style="flex:1" placeholder="值" />
            <DeleteOutlined class="del" @click="delCond(c.id)" />
          </div>
          <a-button type="dashed" block @click="addCond"><template #icon><PlusOutlined /></template>添加条件</a-button>

          <div class="card-title mt">THEN 动作</div>
          <div v-for="a in acts" :key="a.id" class="cond-row">
            <a-select v-model:value="a.type" size="small" style="width:130px" :options="ACT_TYPES.map((o)=>({value:o,label:o}))" />
            <a-input v-model:value="a.value" size="small" style="flex:1" placeholder="目标/值" />
            <DeleteOutlined class="del" @click="delAct(a.id)" />
          </div>
          <a-button type="dashed" block @click="addAct"><template #icon><PlusOutlined /></template>添加动作</a-button>
          <a-button type="primary" class="mt" @click="save">保存规则</a-button>
        </div>
      </template>

      <!-- 流转路由 / 工单池 / 升级路由 -->
      <template v-else-if="['rules-routing','rules-pool','rules-escalation'].includes(activeKey)">
        <div class="table-card">
          <div class="toolbar"><span class="tt">{{ route.meta.title }}</span><a-button type="primary"><template #icon><PlusOutlined /></template>新增</a-button></div>
          <a-table :columns="routeColsCommon" :data-source="routeData" row-key="no" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'status'" class="status on">● {{ (record as any).status }}</span>
            </template>
          </a-table>
          <div class="intro">规则按优先级顺序匹配；路由/升级=首条命中即止，通知/打标=全部命中。</div>
        </div>
      </template>

      <!-- 执行日志 -->
      <template v-else-if="activeKey === 'rules-logs'">
        <div class="table-card">
          <div class="toolbar"><span class="tt">规则执行日志（只读）</span><ThunderboltOutlined style="color:#1a6fff" /></div>
          <a-table :columns="logCols" :data-source="logRows" row-key="time" :pagination="pagination" size="middle">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'result'" :class="(record as any).tone === 'ok' ? 'rate-ok' : 'muted'">{{ (record as any).result }}</span>
              <span v-else-if="column.key === 'ticket' && (record as any).ticket !== '—'" class="cell-link">{{ (record as any).ticket }}</span>
            </template>
          </a-table>
        </div>
      </template>

      <template v-else><div class="card"><div class="card-title">{{ route.meta.title }}</div><div class="intro">该子页内容待补。</div></div></template>
    </div>
  </div>
</template>

<style scoped>
.rules-engine { display: flex; flex-direction: column; min-height: 100%; }
.body { padding: 16px 24px; display: flex; flex-direction: column; gap: 16px; }
.card, .table-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.card { padding: 16px 20px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; }
.tt { font-size: 14px; font-weight: 600; color: #111827; }
.card-title { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
.cond-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.cond-row .del { color: #ef4444; cursor: pointer; flex: none; }
.mt { margin-top: 16px; }
.intro { font-size: 12px; color: #6b7280; background: #f9fafb; border-top: 1px solid #f0f0f0; padding: 10px 16px; line-height: 1.6; }
.act { font-size: 13px; color: #6b7280; cursor: pointer; margin-right: 12px; } .act.primary { color: #1a6fff; } .act:hover { opacity: 0.7; }
.status { cursor: pointer; font-size: 13px; } .status.on { color: #10b981; } .status.off { color: #9ca3af; }
.cell-link { color: #1a6fff; cursor: pointer; }
.rate-ok { color: #10b981; font-weight: 600; } .muted { color: #9ca3af; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
</style>
