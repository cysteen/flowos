<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { PlusOutlined, ImportOutlined, EditOutlined, DeleteOutlined, InboxOutlined } from '@ant-design/icons-vue';

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

const fieldMap: Record<string, Field[]> = reactive({
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
});
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

const FIELD_TYPES = ['单行文本', '多行文本', '下拉', '单选', '级联', '日期时间', '附件', '复合', '只读', '数字'];

// —— 新增分类 ——
let catSeq = 1;
const catModalOpen = ref(false);
const catName = ref('');
function openAddCat() { catName.value = ''; catModalOpen.value = true; }
function saveCat() {
  if (!catName.value.trim()) { message.error('请输入分类名称'); return; }
  const key = 'cat' + catSeq++;
  cats.value.push({ key, name: catName.value.trim(), count: 0 });
  fieldMap[key] = [];
  selected.value = key;
  message.success(`分类「${catName.value.trim()}」已创建`);
  catModalOpen.value = false;
}

// —— 字段 增/改/删 ——
const fieldModalOpen = ref(false);
const editingKey = ref<string | null>(null);
const ff = reactive<Field>({ key: '', name: '', type: '单行文本', constraint: '', refs: 0, status: '启用' });
function syncCount() { const c = cats.value.find((x) => x.key === selected.value); if (c) c.count = (fieldMap[selected.value] ?? []).length; }
function openAddField() { editingKey.value = null; Object.assign(ff, { key: '', name: '', type: '单行文本', constraint: '', refs: 0, status: '启用' }); fieldModalOpen.value = true; }
function openEditField(f: Field) { editingKey.value = f.key; Object.assign(ff, { ...f }); fieldModalOpen.value = true; }
function saveField() {
  if (!ff.name) { message.error('请填写字段名称'); return; }
  const arr = fieldMap[selected.value];
  if (editingKey.value) {
    const i = arr.findIndex((x) => x.key === editingKey.value);
    if (i >= 0) arr[i] = { ...ff };
    message.success('字段已更新');
  } else {
    arr.push({ ...ff, key: ff.key || `field_${arr.length + 1}`, refs: 0 });
    message.success('字段已新增');
  }
  syncCount();
  fieldModalOpen.value = false;
}
function delField(f: Field) {
  if (f.refs > 0) { message.warning(`「${f.name}」被引用 ${f.refs} 处，请先停用而非删除`); return; }
  Modal.confirm({
    title: '删除字段', icon: null, content: `确定删除字段「${f.name}」？`,
    okText: '确认删除', okType: 'danger', cancelText: '取消',
    onOk: () => { const arr = fieldMap[selected.value]; const i = arr.findIndex((x) => x.key === f.key); if (i >= 0) arr.splice(i, 1); syncCount(); message.success('已删除'); },
  });
}

// —— 导入 ——
const importOpen = ref(false);
const importN = ref(0);
function openImport() { importN.value = 0; importOpen.value = true; }
function onImportFile(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { importN.value = Math.max(1, Math.round(f.size / 60)); message.success(`已解析「${f.name}」，识别 ${importN.value} 个字段`); } }
function doImport() { if (!importN.value) { message.warning('请先选择文件'); return; } message.success(`已导入 ${importN.value} 个字段`); importOpen.value = false; }
</script>

<template>
  <div class="entity-dict">
    <div class="left">
      <div class="panel-head"><span>实体分类</span><a-button type="primary" size="small" @click="openAddCat"><template #icon><PlusOutlined /></template>新增</a-button></div>
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
          <a-button size="small" @click="openImport"><template #icon><ImportOutlined /></template>导入</a-button>
          <a-button type="primary" size="small" @click="openAddField"><template #icon><PlusOutlined /></template>新增字段</a-button>
        </div>
      </div>
      <a-table :columns="cols" :data-source="fields" row-key="key" :pagination="false" size="middle">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'key'" class="mono">{{ (record as Field).key }}</span>
          <a-tag v-else-if="column.key === 'type'" color="blue">{{ (record as Field).type }}</a-tag>
          <span v-else-if="column.key === 'refs'" :class="(record as Field).refs > 0 ? 'ref-on' : 'ref-off'">{{ (record as Field).refs }} 处</span>
          <span v-else-if="column.key === 'status'" class="status" :class="(record as Field).status === '启用' ? 'on' : 'off'">● {{ (record as Field).status }}</span>
          <template v-else-if="column.key === 'op'">
            <EditOutlined class="op-ic" @click="openEditField(record as Field)" /><DeleteOutlined class="op-ic danger" @click="delField(record as Field)" />
          </template>
        </template>
      </a-table>
      <div class="tip">字段被表单/流程/工单类型按「字段标识」引用；引用数>0 改/删有风险（点引用数看引用方）。被引用字段禁止硬删，引导停用。</div>
    </div>

    <!-- 新增分类 -->
    <a-modal v-model:open="catModalOpen" title="新增实体分类" :width="420" ok-text="创建" cancel-text="取消" @ok="saveCat">
      <a-form layout="vertical"><a-form-item label="分类名称" required><a-input v-model:value="catName" placeholder="如：客户信息" /></a-form-item></a-form>
    </a-modal>

    <!-- 新增 / 编辑字段 -->
    <a-modal v-model:open="fieldModalOpen" :title="editingKey ? '编辑字段' : '新增字段'" :width="520" :ok-text="editingKey ? '保存' : '创建'" cancel-text="取消" @ok="saveField">
      <a-form layout="vertical" class="e-form">
        <a-form-item label="字段名称" required class="half"><a-input v-model:value="ff.name" placeholder="如：客户姓名" /></a-form-item>
        <a-form-item label="字段标识" class="half"><a-input v-model:value="ff.key" placeholder="留空自动生成" /></a-form-item>
        <a-form-item label="类型" class="half"><a-select v-model:value="ff.type" :options="FIELD_TYPES.map((t)=>({value:t,label:t}))" /></a-form-item>
        <a-form-item label="状态" class="half"><a-radio-group v-model:value="ff.status" button-style="solid"><a-radio-button value="启用">启用</a-radio-button><a-radio-button value="停用">停用</a-radio-button></a-radio-group></a-form-item>
        <a-form-item label="约束" class="full"><a-input v-model:value="ff.constraint" placeholder="如：必填 / 手机号校验 / 结案前必填" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 导入 -->
    <a-modal v-model:open="importOpen" title="导入实体字段" :width="460" ok-text="开始导入" cancel-text="取消" @ok="doImport">
      <label class="dropzone">
        <InboxOutlined class="dz-ic" />
        <div class="dz-main">点击选择 Excel / CSV 文件</div>
        <div class="dz-sub">{{ importN ? `已识别 ${importN} 个字段` : '首行为表头：字段名称 / 标识 / 类型 / 约束' }}</div>
        <input type="file" accept=".xlsx,.xls,.csv" hidden @change="onImportFile" />
      </label>
    </a-modal>
  </div>
</template>

<style scoped>
.entity-dict { display: flex; gap: 16px; padding: 16px 24px; min-height: 100%; align-items: flex-start; }
.left { width: 240px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.right { flex: 1; min-width: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 600; color: #111827; }
.head-btns { display: flex; gap: 8px; }
.e-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
.e-form .full { grid-column: 1 / -1; }
.e-form :deep(.ant-form-item) { margin-bottom: 14px; }
.dropzone { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 28px; border: 1.5px dashed #d1d5db; border-radius: 10px; cursor: pointer; }
.dropzone:hover { border-color: #1a6fff; background: #f7faff; }
.dz-ic { font-size: 34px; color: #1a6fff; }
.dz-main { font-size: 14px; font-weight: 600; color: #374151; }
.dz-sub { font-size: 12px; color: #9ca3af; }
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
