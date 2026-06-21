<script setup lang="ts">
import { ref, computed } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined, ImportOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue';

// 字典管理（PRD-52）：左字典类型 + 右字典数据 二级联动；配色；Excel 导入。
interface DictType { dictType: string; name: string; app: string; status: '启用' | '停用'; }
interface DictData { code: string; label: string; value: string; sort: number; status: '启用' | '停用'; colorType: string; remark: string; }

const types = ref<DictType[]>([
  { dictType: 'workorder_status', name: '工单状态', app: '客服系统', status: '启用' },
  { dictType: 'priority', name: '工单优先级', app: '客服系统', status: '启用' },
  { dictType: 'channel_type', name: '渠道类型', app: '客服系统', status: '启用' },
  { dictType: 'customer_level', name: '客户等级', app: '客服系统', status: '启用' },
  { dictType: 'action_type', name: '操作类型', app: '客服系统', status: '启用' },
]);
const selected = ref<string>('workorder_status');

const dataMap: Record<string, DictData[]> = {
  workorder_status: [
    { code: 'D01', label: '待受理', value: 'PENDING', sort: 1, status: '启用', colorType: 'warning', remark: '' },
    { code: 'D02', label: '处理中', value: 'PROCESSING', sort: 2, status: '启用', colorType: 'primary', remark: '' },
    { code: 'D03', label: '已挂起', value: 'SUSPENDED', sort: 3, status: '启用', colorType: 'default', remark: 'SLA停表' },
    { code: 'D04', label: '待审核', value: 'PENDING_REVIEW', sort: 4, status: '启用', colorType: 'warning', remark: '下送后' },
    { code: 'D05', label: '待回访', value: 'PENDING_CALLBACK', sort: 5, status: '启用', colorType: 'info', remark: '标记已解决后' },
    { code: 'D06', label: '已结案', value: 'SETTLED', sort: 6, status: '启用', colorType: 'success', remark: '强结/正常结案' },
    { code: 'D07', label: '已关闭', value: 'CLOSED', sort: 7, status: '启用', colorType: 'success', remark: '' },
  ],
  priority: [
    { code: 'P0', label: 'P0 紧急', value: 'P0', sort: 1, status: '启用', colorType: 'danger', remark: 'VIP+紧急' },
    { code: 'P1', label: 'P1 高', value: 'P1', sort: 2, status: '启用', colorType: 'warning', remark: '' },
    { code: 'P2', label: 'P2 中', value: 'P2', sort: 3, status: '启用', colorType: 'primary', remark: '' },
    { code: 'P3', label: 'P3 低', value: 'P3', sort: 4, status: '启用', colorType: 'default', remark: '' },
  ],
  channel_type: [
    { code: 'C1', label: '在线客服', value: 'web_chat', sort: 1, status: '启用', colorType: 'primary', remark: '' },
    { code: 'C2', label: '电话', value: 'phone', sort: 2, status: '启用', colorType: 'success', remark: '' },
    { code: 'C3', label: '邮件', value: 'email', sort: 3, status: '启用', colorType: 'warning', remark: '' },
  ],
  customer_level: [
    { code: 'L1', label: 'VIP', value: 'vip', sort: 1, status: '启用', colorType: 'danger', remark: '' },
    { code: 'L2', label: '普通', value: 'normal', sort: 2, status: '启用', colorType: 'default', remark: '' },
  ],
  action_type: [
    { code: 'A1', label: '下送', value: 'FORWARD', sort: 1, status: '启用', colorType: 'primary', remark: '→待审核' },
    { code: 'A2', label: '强结', value: 'FORCE_CLOSE', sort: 2, status: '启用', colorType: 'danger', remark: '审批结案' },
    { code: 'A3', label: '转售后', value: 'TO_AFTERSALE', sort: 3, status: '启用', colorType: 'warning', remark: '' },
  ],
};
const datas = computed(() => dataMap[selected.value] ?? []);
const selName = computed(() => types.value.find((t) => t.dictType === selected.value)?.name ?? '');

const TONE: Record<string, string> = { default: 'default', primary: 'blue', success: 'green', warning: 'orange', danger: 'red', info: 'cyan' };
const dataCols = [
  { title: '字典编码', dataIndex: 'code', key: 'code', width: 90 },
  { title: '字典标签', dataIndex: 'label', key: 'label', width: 130 },
  { title: '字典键值', dataIndex: 'value', key: 'value', width: 160 },
  { title: '排序', dataIndex: 'sort', key: 'sort', width: 70 },
  { title: '配色', dataIndex: 'colorType', key: 'colorType', width: 100 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 80 },
  { title: '备注', dataIndex: 'remark', key: 'remark' },
  { title: '操作', key: 'op', width: 110 },
];
function pick(t: DictType) { selected.value = t.dictType; }
function todo(label: string) { message.info(`「${label}」（演示）`); }
</script>

<template>
  <div class="dict-manage">
    <!-- 左：字典类型 -->
    <div class="left">
      <div class="panel-head"><span>字典类型</span><a-button type="primary" size="small" @click="todo('新增类型')"><template #icon><PlusOutlined /></template>新增</a-button></div>
      <div class="type-list">
        <div v-for="t in types" :key="t.dictType" class="type-item" :class="{ on: t.dictType === selected }" @click="pick(t)">
          <div class="ti-name">{{ t.name }}</div>
          <div class="ti-code">{{ t.dictType }}</div>
        </div>
      </div>
    </div>

    <!-- 右：字典数据 -->
    <div class="right">
      <div class="panel-head">
        <span>{{ selName }} · 字典数据</span>
        <div class="head-btns">
          <a-button size="small" @click="todo('Excel导入')"><template #icon><ImportOutlined /></template>导入</a-button>
          <a-button type="primary" size="small" @click="todo('新增字典数据')"><template #icon><PlusOutlined /></template>新增数据</a-button>
        </div>
      </div>
      <a-table :columns="dataCols" :data-source="datas" row-key="code" :pagination="false" size="middle">
        <template #bodyCell="{ column, record }">
          <a-tag v-if="column.key === 'colorType'" :color="TONE[(record as DictData).colorType]">{{ (record as DictData).label }}</a-tag>
          <span v-else-if="column.key === 'status'" class="status" :class="(record as DictData).status === '启用' ? 'on' : 'off'">● {{ (record as DictData).status }}</span>
          <template v-else-if="column.key === 'op'">
            <EditOutlined class="op-ic" @click="todo('编辑')" /><DeleteOutlined class="op-ic danger" @click="todo('删除')" />
          </template>
        </template>
      </a-table>
      <div class="tip">配色所见即所得：业务页标签/徽章按 colorType 渲染。停用项新建时不可选，历史已用值仍正常显示。删除被引用字典项会拦截。</div>
    </div>
  </div>
</template>

<style scoped>
.dict-manage { display: flex; gap: 16px; padding: 16px 24px; min-height: 100%; align-items: flex-start; }
.left { width: 280px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.right { flex: 1; min-width: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 600; color: #111827; }
.head-btns { display: flex; gap: 8px; }
.type-list { padding: 8px; }
.type-item { padding: 10px 12px; border-radius: 6px; cursor: pointer; }
.type-item:hover { background: #f9fafb; }
.type-item.on { background: #eff6ff; }
.ti-name { font-size: 13px; font-weight: 600; color: #374151; }
.type-item.on .ti-name { color: #1a6fff; }
.ti-code { font-size: 11px; color: #9ca3af; margin-top: 2px; font-family: ui-monospace, monospace; }
.status { font-size: 13px; } .status.on { color: #10b981; } .status.off { color: #9ca3af; }
.op-ic { color: #6b7280; cursor: pointer; margin-right: 12px; } .op-ic.danger { color: #ef4444; } .op-ic:hover { opacity: 0.7; }
.tip { font-size: 12px; color: #6b7280; background: #f9fafb; border-top: 1px solid #f0f0f0; padding: 10px 16px; line-height: 1.6; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
</style>
