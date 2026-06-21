<script setup lang="ts">
import { ref, computed } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined, ImportOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue';

// 流程实体字典（PRD-88）：分类（一级）→ 实体字段（二级），被表单/流程/工单类型引用。
interface Cat { key: string; name: string; count: number; }
interface Field { key: string; name: string; type: string; constraint: string; refs: number; status: '启用' | '停用'; }

const cats = ref<Cat[]>([
  { key: 'customer', name: '客户信息', count: 6 },
  { key: 'product', name: '产品信息', count: 5 },
  { key: 'problem', name: '问题描述', count: 4 },
  { key: 'process', name: '处理过程', count: 7 },
  { key: 'complaint', name: '投诉专属', count: 5 },
]);
const selected = ref('process');
const selName = computed(() => cats.value.find((c) => c.key === selected.value)?.name ?? '');

const fieldMap: Record<string, Field[]> = {
  process: [
    { key: 'problem_cause', name: '问题原因', type: '多行文本', constraint: '结案前必填', refs: 4, status: '启用' },
    { key: 'process_result', name: '处理结果', type: '多行文本', constraint: '结案前必填', refs: 4, status: '启用' },
    { key: 'build_standard', name: '建单是否规范', type: '单选', constraint: '是/否', refs: 4, status: '启用' },
    { key: 'service_method', name: '服务方式', type: '下拉', constraint: '关键词搜索', refs: 1, status: '启用' },
    { key: 'conclusion', name: '解决结论', type: '单选', constraint: '已解决/退让/未解决', refs: 1, status: '启用' },
    { key: 'attachments', name: '处理附件', type: '附件', constraint: '≤10个', refs: 2, status: '启用' },
    { key: 'remark', name: '内部备注', type: '多行文本', constraint: '', refs: 0, status: '停用' },
  ],
  customer: [
    { key: 'cust_name', name: '客户姓名', type: '单行文本', constraint: '必填', refs: 8, status: '启用' },
    { key: 'cust_phone', name: '联系电话', type: '单行文本', constraint: '手机号校验', refs: 8, status: '启用' },
    { key: 'cust_level', name: '客户等级', type: '下拉', constraint: 'VIP/普通', refs: 6, status: '启用' },
    { key: 'cust_region', name: '省市区', type: '级联', constraint: '商机必填', refs: 5, status: '启用' },
    { key: 'cust_addr', name: '详细地址', type: '单行文本', constraint: '', refs: 3, status: '启用' },
    { key: 'agent_info', name: '代办人', type: '复合', constraint: '姓名/电话/关系', refs: 2, status: '启用' },
  ],
  complaint: [
    { key: 'complaint_type', name: '投诉类型', type: '下拉', constraint: '', refs: 1, status: '启用' },
    { key: 'complaint_l1', name: '投诉分类一级', type: '下拉', constraint: '', refs: 1, status: '启用' },
    { key: 'complaint_l2', name: '投诉分类二级', type: '下拉', constraint: '联动一级', refs: 1, status: '启用' },
    { key: 'platform', name: '投诉平台', type: '下拉', constraint: '12315/黑猫…', refs: 1, status: '启用' },
    { key: 'external', name: '外投处理', type: '复合', constraint: '来源=外投时', refs: 1, status: '启用' },
  ],
  product: [
    { key: 'prod_cat', name: '产品分类', type: '级联', constraint: '', refs: 5, status: '启用' },
    { key: 'prod_name', name: '产品名称', type: '下拉', constraint: '', refs: 5, status: '启用' },
    { key: 'sn', name: '设备SN', type: '单行文本', constraint: '视产品必填', refs: 4, status: '启用' },
    { key: 'warranty', name: '保修状态', type: '只读', constraint: '系统带出', refs: 3, status: '启用' },
    { key: 'aftersale', name: '售后能力', type: '只读', constraint: '控转售后', refs: 2, status: '启用' },
  ],
  problem: [
    { key: 'problem_l1', name: '问题分类一级', type: '下拉', constraint: '', refs: 6, status: '启用' },
    { key: 'problem_l2', name: '问题分类二级', type: '下拉', constraint: '联动', refs: 6, status: '启用' },
    { key: 'problem_time', name: '问题发生时间', type: '日期时间', constraint: '咨询专属', refs: 2, status: '启用' },
    { key: 'desc', name: '诉求描述', type: '多行文本', constraint: '必填', refs: 8, status: '启用' },
  ],
};
const fields = computed(() => fieldMap[selected.value] ?? []);

const cols = [
  { title: '字段标识', dataIndex: 'key', key: 'key', width: 150 },
  { title: '字段名称', dataIndex: 'name', key: 'name', width: 140 },
  { title: '类型', dataIndex: 'type', key: 'type', width: 100 },
  { title: '约束', dataIndex: 'constraint', key: 'constraint' },
  { title: '引用', dataIndex: 'refs', key: 'refs', width: 80 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 80 },
  { title: '操作', key: 'op', width: 110 },
];
function pick(c: Cat) { selected.value = c.key; }
function todo(label: string) { message.info(`「${label}」（演示）`); }
</script>

<template>
  <div class="entity-dict">
    <div class="left">
      <div class="panel-head"><span>实体分类</span><a-button type="primary" size="small" @click="todo('新增分类')"><template #icon><PlusOutlined /></template>新增</a-button></div>
      <div class="cat-list">
        <div v-for="c in cats" :key="c.key" class="cat-item" :class="{ on: c.key === selected }" @click="pick(c)">
          <span class="ci-name">{{ c.name }}</span><a-badge :count="c.count" :number-style="{ backgroundColor: c.key === selected ? '#1a6fff' : '#d1d5db' }" />
        </div>
      </div>
    </div>
    <div class="right">
      <div class="panel-head">
        <span>{{ selName }} · 实体字段</span>
        <div class="head-btns">
          <a-button size="small" @click="todo('Excel导入')"><template #icon><ImportOutlined /></template>导入</a-button>
          <a-button type="primary" size="small" @click="todo('新增字段')"><template #icon><PlusOutlined /></template>新增字段</a-button>
        </div>
      </div>
      <a-table :columns="cols" :data-source="fields" row-key="key" :pagination="false" size="middle">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'key'" class="mono">{{ (record as Field).key }}</span>
          <a-tag v-else-if="column.key === 'type'" color="blue">{{ (record as Field).type }}</a-tag>
          <span v-else-if="column.key === 'refs'" :class="(record as Field).refs > 0 ? 'ref-on' : 'ref-off'" @click="(record as Field).refs && todo('查看引用清单')">{{ (record as Field).refs }} 处</span>
          <span v-else-if="column.key === 'status'" class="status" :class="(record as Field).status === '启用' ? 'on' : 'off'">● {{ (record as Field).status }}</span>
          <template v-else-if="column.key === 'op'">
            <EditOutlined class="op-ic" @click="todo('编辑字段')" /><DeleteOutlined class="op-ic danger" @click="todo('删除字段')" />
          </template>
        </template>
      </a-table>
      <div class="tip">字段被表单/流程/工单类型按「字段标识」引用；引用数>0 改/删有风险（点引用数看引用方）。被引用字段禁止硬删，引导停用。</div>
    </div>
  </div>
</template>

<style scoped>
.entity-dict { display: flex; gap: 16px; padding: 16px 24px; min-height: 100%; align-items: flex-start; }
.left { width: 240px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.right { flex: 1; min-width: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 600; color: #111827; }
.head-btns { display: flex; gap: 8px; }
.cat-list { padding: 8px; }
.cat-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 6px; cursor: pointer; }
.cat-item:hover { background: #f9fafb; }
.cat-item.on { background: #eff6ff; }
.ci-name { font-size: 13px; font-weight: 600; color: #374151; }
.cat-item.on .ci-name { color: #1a6fff; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; color: #6b7280; }
.ref-on { color: #1a6fff; cursor: pointer; font-weight: 600; } .ref-off { color: #9ca3af; }
.status { font-size: 13px; } .status.on { color: #10b981; } .status.off { color: #9ca3af; }
.op-ic { color: #6b7280; cursor: pointer; margin-right: 12px; } .op-ic.danger { color: #ef4444; } .op-ic:hover { opacity: 0.7; }
.tip { font-size: 12px; color: #6b7280; background: #f9fafb; border-top: 1px solid #f0f0f0; padding: 10px 16px; line-height: 1.6; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
</style>
