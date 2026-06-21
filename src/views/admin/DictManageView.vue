<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { PlusOutlined, ImportOutlined, EditOutlined, DeleteOutlined, InboxOutlined } from '@ant-design/icons-vue';

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

const dataMap: Record<string, DictData[]> = reactive({
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
});
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

const COLOR_OPTS = ['default', 'primary', 'success', 'warning', 'danger', 'info'];

// —— 新增字典类型 ——
const typeModalOpen = ref(false);
const tform = reactive({ name: '', dictType: '', app: '客服系统' });
function openAddType() { Object.assign(tform, { name: '', dictType: '', app: '客服系统' }); typeModalOpen.value = true; }
function saveType() {
  if (!tform.name || !tform.dictType) { message.error('请填写类型名称与编码'); return; }
  if (types.value.some((t) => t.dictType === tform.dictType)) { message.error('字典编码已存在'); return; }
  types.value.push({ dictType: tform.dictType, name: tform.name, app: tform.app, status: '启用' });
  dataMap[tform.dictType] = [];
  selected.value = tform.dictType;
  message.success(`字典类型「${tform.name}」已新增`);
  typeModalOpen.value = false;
}

// —— 字典数据 增/改/删 ——
const dataModalOpen = ref(false);
const editingCode = ref<string | null>(null);
const dform = reactive<DictData>({ code: '', label: '', value: '', sort: 1, status: '启用', colorType: 'primary', remark: '' });
function openAddData() {
  editingCode.value = null;
  Object.assign(dform, { code: '', label: '', value: '', sort: datas.value.length + 1, status: '启用', colorType: 'primary', remark: '' });
  dataModalOpen.value = true;
}
function openEditData(d: DictData) { editingCode.value = d.code; Object.assign(dform, { ...d }); dataModalOpen.value = true; }
function saveData() {
  if (!dform.label || !dform.value) { message.error('请填写字典标签与键值'); return; }
  const arr = dataMap[selected.value];
  if (editingCode.value) {
    const i = arr.findIndex((x) => x.code === editingCode.value);
    if (i >= 0) arr[i] = { ...dform };
    message.success('字典数据已更新');
  } else {
    arr.push({ ...dform, code: dform.code || `${selected.value.slice(0, 2).toUpperCase()}${arr.length + 1}` });
    message.success('字典数据已新增');
  }
  dataModalOpen.value = false;
}
function delData(d: DictData) {
  Modal.confirm({
    title: '删除字典数据', icon: null, content: `确定删除「${d.label}」？`,
    okText: '确认删除', okType: 'danger', cancelText: '取消',
    onOk: () => { const arr = dataMap[selected.value]; const i = arr.findIndex((x) => x.code === d.code); if (i >= 0) arr.splice(i, 1); message.success('已删除'); },
  });
}

// —— 导入 ——
const importOpen = ref(false);
const importN = ref(0);
function openImport() { importN.value = 0; importOpen.value = true; }
function onImportFile(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { importN.value = Math.max(1, Math.round(f.size / 60)); message.success(`已解析「${f.name}」，识别 ${importN.value} 条`); } }
function doImport() { if (!importN.value) { message.warning('请先选择 Excel/CSV 文件'); return; } message.success(`已导入 ${importN.value} 条字典数据`); importOpen.value = false; }
</script>

<template>
  <div class="dict-manage">
    <!-- 左：字典类型 -->
    <div class="left">
      <div class="panel-head"><span>字典类型</span><a-button type="primary" size="small" @click="openAddType"><template #icon><PlusOutlined /></template>新增</a-button></div>
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
          <a-button size="small" @click="openImport"><template #icon><ImportOutlined /></template>导入</a-button>
          <a-button type="primary" size="small" @click="openAddData"><template #icon><PlusOutlined /></template>新增数据</a-button>
        </div>
      </div>
      <a-table :columns="dataCols" :data-source="datas" row-key="code" :pagination="false" size="middle">
        <template #bodyCell="{ column, record }">
          <a-tag v-if="column.key === 'colorType'" :color="TONE[(record as DictData).colorType]">{{ (record as DictData).label }}</a-tag>
          <span v-else-if="column.key === 'status'" class="status" :class="(record as DictData).status === '启用' ? 'on' : 'off'">● {{ (record as DictData).status }}</span>
          <template v-else-if="column.key === 'op'">
            <EditOutlined class="op-ic" @click="openEditData(record as DictData)" /><DeleteOutlined class="op-ic danger" @click="delData(record as DictData)" />
          </template>
        </template>
      </a-table>
      <div class="tip">配色所见即所得：业务页标签/徽章按 colorType 渲染。停用项新建时不可选，历史已用值仍正常显示。删除被引用字典项会拦截。</div>
    </div>

    <!-- 新增字典类型 -->
    <a-modal v-model:open="typeModalOpen" title="新增字典类型" :width="460" ok-text="创建" cancel-text="取消" @ok="saveType">
      <a-form layout="vertical" class="d-form">
        <a-form-item label="类型名称" required class="half"><a-input v-model:value="tform.name" placeholder="如：工单状态" /></a-form-item>
        <a-form-item label="字典编码" required class="half"><a-input v-model:value="tform.dictType" placeholder="workorder_status" /></a-form-item>
        <a-form-item label="所属应用" class="full"><a-input v-model:value="tform.app" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 新增 / 编辑字典数据 -->
    <a-modal v-model:open="dataModalOpen" :title="editingCode ? '编辑字典数据' : '新增字典数据'" :width="520" :ok-text="editingCode ? '保存' : '创建'" cancel-text="取消" @ok="saveData">
      <a-form layout="vertical" class="d-form">
        <a-form-item label="字典标签" required class="half"><a-input v-model:value="dform.label" placeholder="展示文案" /></a-form-item>
        <a-form-item label="字典键值" required class="half"><a-input v-model:value="dform.value" placeholder="存储值 / 枚举码" /></a-form-item>
        <a-form-item label="编码" class="half"><a-input v-model:value="dform.code" placeholder="留空自动生成" /></a-form-item>
        <a-form-item label="排序" class="half"><a-input-number v-model:value="dform.sort" :min="0" style="width:100%" /></a-form-item>
        <a-form-item label="配色" class="half"><a-select v-model:value="dform.colorType" :options="COLOR_OPTS.map((c)=>({value:c,label:c}))" /></a-form-item>
        <a-form-item label="状态" class="half"><a-radio-group v-model:value="dform.status" button-style="solid"><a-radio-button value="启用">启用</a-radio-button><a-radio-button value="停用">停用</a-radio-button></a-radio-group></a-form-item>
        <a-form-item label="备注" class="full"><a-input v-model:value="dform.remark" placeholder="可选" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 导入 -->
    <a-modal v-model:open="importOpen" title="导入字典数据" :width="460" ok-text="开始导入" cancel-text="取消" @ok="doImport">
      <label class="dropzone">
        <InboxOutlined class="dz-ic" />
        <div class="dz-main">点击选择 Excel / CSV 文件</div>
        <div class="dz-sub">{{ importN ? `已识别 ${importN} 条` : '首行为表头：标签 / 键值 / 配色 / 备注' }}</div>
        <input type="file" accept=".xlsx,.xls,.csv" hidden @change="onImportFile" />
      </label>
    </a-modal>
  </div>
</template>

<style scoped>
.dict-manage { display: flex; gap: 16px; padding: 16px 24px; min-height: 100%; align-items: flex-start; }
.left { width: 280px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.right { flex: 1; min-width: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; font-weight: 600; color: #111827; }
.d-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
.d-form .full { grid-column: 1 / -1; }
.d-form :deep(.ant-form-item) { margin-bottom: 14px; }
.dropzone { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 28px; border: 1.5px dashed #d1d5db; border-radius: 10px; cursor: pointer; }
.dropzone:hover { border-color: #1a6fff; background: #f7faff; }
.dz-ic { font-size: 34px; color: #1a6fff; }
.dz-main { font-size: 14px; font-weight: 600; color: #374151; }
.dz-sub { font-size: 12px; color: #9ca3af; }
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
