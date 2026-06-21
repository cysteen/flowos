<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  ArrowLeftOutlined, SaveOutlined, SendOutlined, PlusOutlined, DeleteOutlined,
  HolderOutlined, FontSizeOutlined, AlignLeftOutlined, DownOutlined, CheckSquareOutlined,
  CalendarOutlined, PaperClipOutlined, NumberOutlined, TableOutlined, GroupOutlined,
  BranchesOutlined, PlayCircleOutlined, CheckCircleOutlined, FlagOutlined,
} from '@ant-design/icons-vue';
import { stdPagination } from '@/config/adminUi';

// 工单类型设计器二级页（PRD-62~65）：实体字段 / 表单设计器(可拖拽) / 流程设计器 / 版本管理。
const route = useRoute();
const router = useRouter();
const typeId = computed(() => String(route.params.id));
const isNew = computed(() => typeId.value === 'new');
const TYPE_NAMES: Record<string, string> = {
  complaint: '投诉工单', consult: '咨询工单', suggest: '建议工单',
  biz: '商机工单', aftersale: '售后工单', return: '退换货工单',
};
const typeName = computed(() => (isNew.value ? '新建工单类型' : TYPE_NAMES[typeId.value] ?? typeId.value));
const activeTab = ref(String(route.query.tab || 'basic'));
function setTab(k: string) { activeTab.value = k; router.replace({ query: { ...route.query, tab: k } }); }

/* ── 基础信息 ── */
const basic = reactive({
  name: isNew.value ? '' : typeName.value, code: isNew.value ? '' : 'WO_X',
  app: '客服中心', channels: ['电话', '在线'], desc: '', icon: 'message',
});

/* ── 表单设计器：可拖拽 ── */
interface Palette { type: string; label: string; icon: any; }
const PALETTE: Palette[] = [
  { type: 'text', label: '单行文本', icon: FontSizeOutlined },
  { type: 'textarea', label: '多行文本', icon: AlignLeftOutlined },
  { type: 'select', label: '下拉选择', icon: DownOutlined },
  { type: 'radio', label: '单选', icon: CheckSquareOutlined },
  { type: 'number', label: '数字', icon: NumberOutlined },
  { type: 'date', label: '日期时间', icon: CalendarOutlined },
  { type: 'attach', label: '附件', icon: PaperClipOutlined },
  { type: 'table', label: '子表格', icon: TableOutlined },
  { type: 'group', label: '分组标题', icon: GroupOutlined },
];
interface FormItem { id: string; type: string; label: string; required: boolean; placeholder: string; width: 'full' | 'half'; }
let seq = 100;
const canvas = ref<FormItem[]>([
  { id: 'f1', type: 'select', label: '工单分类', required: true, placeholder: '请选择', width: 'half' },
  { id: 'f2', type: 'select', label: '优先级', required: true, placeholder: '请选择', width: 'half' },
  { id: 'f3', type: 'textarea', label: '诉求描述', required: true, placeholder: '请输入客户诉求', width: 'full' },
  { id: 'f4', type: 'attach', label: '凭证附件', required: false, placeholder: '', width: 'full' },
]);
const selectedId = ref<string>('f1');
const selected = computed(() => canvas.value.find((i) => i.id === selectedId.value));
const paletteLabel = (t: string) => PALETTE.find((p) => p.type === t)?.label ?? t;
const paletteIcon = (t: string) => PALETTE.find((p) => p.type === t)?.icon ?? FontSizeOutlined;

const dragType = ref<string | null>(null);
const dragIndex = ref<number | null>(null);
const overIndex = ref<number | null>(null);

function onPaletteDragStart(p: Palette) { dragType.value = p.type; dragIndex.value = null; }
function onItemDragStart(i: number) { dragIndex.value = i; dragType.value = null; }
function onDragOver(i: number, e: DragEvent) { e.preventDefault(); overIndex.value = i; }
function onDropAt(i: number, e: DragEvent) {
  e.preventDefault();
  if (dragType.value) {
    const item: FormItem = { id: `f${seq++}`, type: dragType.value, label: paletteLabel(dragType.value), required: false, placeholder: '', width: 'full' };
    canvas.value.splice(i, 0, item); selectedId.value = item.id;
  } else if (dragIndex.value !== null && dragIndex.value !== i) {
    const [moved] = canvas.value.splice(dragIndex.value, 1);
    canvas.value.splice(dragIndex.value < i ? i - 1 : i, 0, moved);
  }
  dragType.value = null; dragIndex.value = null; overIndex.value = null;
}
function onDropEnd(e: DragEvent) {
  e.preventDefault();
  if (dragType.value) {
    const item: FormItem = { id: `f${seq++}`, type: dragType.value, label: paletteLabel(dragType.value), required: false, placeholder: '', width: 'full' };
    canvas.value.push(item); selectedId.value = item.id;
  } else if (dragIndex.value !== null) {
    const [moved] = canvas.value.splice(dragIndex.value, 1); canvas.value.push(moved);
  }
  dragType.value = null; dragIndex.value = null; overIndex.value = null;
}
function removeItem(id: string) {
  const i = canvas.value.findIndex((x) => x.id === id);
  if (i >= 0) canvas.value.splice(i, 1);
  if (selectedId.value === id) selectedId.value = canvas.value[0]?.id ?? '';
}

/* ── 流程设计器（BPMN-lite） ── */
interface FlowNode { id: string; label: string; kind: 'start' | 'task' | 'gateway' | 'end'; role: string; }
const flow = ref<FlowNode[]>([
  { id: 'n1', label: '开始', kind: 'start', role: '系统' },
  { id: 'n2', label: '一线受理', kind: 'task', role: '一线坐席' },
  { id: 'n3', label: '判定升级?', kind: 'gateway', role: '规则' },
  { id: 'n4', label: '二线处理', kind: 'task', role: '二线坐席' },
  { id: 'n5', label: '班长审核', kind: 'task', role: '班组长' },
  { id: 'n6', label: '结案', kind: 'end', role: '系统' },
]);
let nseq = 10;
const flowKindIcon: Record<string, any> = { start: PlayCircleOutlined, task: CheckCircleOutlined, gateway: BranchesOutlined, end: FlagOutlined };
const flowKindTone: Record<string, string> = { start: '#10b981', task: '#1a6fff', gateway: '#f59e0b', end: '#ef4444' };
function addNodeAfter(i: number) {
  flow.value.splice(i + 1, 0, { id: `n${nseq++}`, label: '新节点', kind: 'task', role: '一线坐席' });
}
function removeNode(id: string) { flow.value = flow.value.filter((n) => n.id !== id); }

/* ── 版本管理 ── */
const versions = [
  { ver: 'v3.2', date: '2026-06-18', author: '王芳', note: '新增「投诉平台」字段，调整升级链', status: '当前' },
  { ver: 'v3.1', date: '2026-05-30', author: '王芳', note: '回访节点 SLA 由 24h 改 48h', status: '历史' },
  { ver: 'v3.0', date: '2026-04-12', author: '李强', note: '重构处理流程，拆分一线/二线', status: '历史' },
  { ver: 'v2.4', date: '2026-03-01', author: '李强', note: '初版投诉模型', status: '历史' },
];
const verCols = [
  { title: '版本', dataIndex: 'ver', key: 'ver', width: 90 },
  { title: '发布时间', dataIndex: 'date', key: 'date', width: 130 },
  { title: '操作人', dataIndex: 'author', key: 'author', width: 100 },
  { title: '变更说明', dataIndex: 'note', key: 'note' },
  { title: '', key: 'op', width: 180 },
];

function save() { message.success(`「${typeName.value}」已保存草稿`); }
function publish() { message.success(`「${typeName.value}」已发布新版本`); }
</script>

<template>
  <div class="designer">
    <!-- 顶部条 -->
    <div class="topbar">
      <div class="left">
        <a-button type="text" @click="router.push({ name: 'admin-ticket-types' })"><template #icon><ArrowLeftOutlined /></template></a-button>
        <div class="t-title">{{ typeName }}<a-tag color="orange" v-if="isNew">新建</a-tag><a-tag v-else color="blue">v3.2 草稿</a-tag></div>
      </div>
      <div class="right">
        <a-button @click="save"><template #icon><SaveOutlined /></template>保存草稿</a-button>
        <a-button type="primary" @click="publish"><template #icon><SendOutlined /></template>发布</a-button>
      </div>
    </div>

    <div class="tabs-bar">
      <div v-for="t in [['basic','实体字段'],['form','表单设计器'],['flow','流程设计器'],['version','版本管理']]" :key="t[0]"
           class="tab" :class="{ on: activeTab === t[0] }" @click="setTab(t[0])">{{ t[1] }}</div>
    </div>

    <!-- 实体字段 / 基础 -->
    <div v-if="activeTab === 'basic'" class="pane basic-pane">
      <a-form layout="vertical" class="basic-form">
        <div class="form-row">
          <a-form-item label="类型名称" required><a-input v-model:value="basic.name" placeholder="如：投诉工单" /></a-form-item>
          <a-form-item label="类型编码" required><a-input v-model:value="basic.code" placeholder="WO_XXX" /></a-form-item>
        </div>
        <div class="form-row">
          <a-form-item label="所属应用"><a-select v-model:value="basic.app" :options="['客服中心','售后服务','商机管理'].map((v)=>({value:v,label:v}))" /></a-form-item>
          <a-form-item label="绑定渠道">
            <a-select v-model:value="basic.channels" mode="multiple" :options="['电话','在线','邮件','12315','黑猫'].map((v)=>({value:v,label:v}))" />
          </a-form-item>
        </div>
        <a-form-item label="类型说明"><a-textarea v-model:value="basic.desc" :rows="3" placeholder="描述该工单类型的适用场景" /></a-form-item>
      </a-form>
      <div class="hint-card">
        <h4>实体字段</h4>
        <p>该类型引用「流程实体字典」中的字段集合。字段的增删改在表单设计器中拖拽配置，约束与配色继承自字典。当前共 <b>24</b> 个字段、<b>7</b> 个流程节点。</p>
        <a-button type="link" @click="setTab('form')">前往表单设计器 →</a-button>
      </div>
    </div>

    <!-- 表单设计器（可拖拽） -->
    <div v-else-if="activeTab === 'form'" class="pane designer-grid">
      <!-- 组件面板 -->
      <div class="palette">
        <div class="palette-title">字段组件</div>
        <div v-for="p in PALETTE" :key="p.type" class="palette-item" draggable="true" @dragstart="onPaletteDragStart(p)">
          <component :is="p.icon" /><span>{{ p.label }}</span>
        </div>
        <div class="palette-tip">拖拽到画布添加，拖拽卡片可排序</div>
      </div>

      <!-- 画布 -->
      <div class="canvas-wrap">
        <div class="canvas-head">表单预览 · {{ canvas.length }} 个字段</div>
        <div class="canvas" @dragover.prevent @drop="onDropEnd">
          <div v-for="(it, i) in canvas" :key="it.id"
               class="fitem" :class="{ on: selectedId === it.id, half: it.width === 'half', over: overIndex === i }"
               draggable="true"
               @dragstart="onItemDragStart(i)" @dragover="onDragOver(i, $event)" @drop.stop="onDropAt(i, $event)"
               @click="selectedId = it.id">
            <div class="fi-handle"><HolderOutlined /></div>
            <div class="fi-body">
              <div class="fi-label">{{ it.label }}<span v-if="it.required" class="req">*</span><a-tag class="fi-type">{{ paletteLabel(it.type) }}</a-tag></div>
              <div class="fi-control">
                <div v-if="it.type==='textarea'" class="ctrl ta">{{ it.placeholder || '多行文本…' }}</div>
                <div v-else-if="it.type==='select'||it.type==='radio'" class="ctrl sel"><component :is="paletteIcon(it.type)" />{{ it.placeholder || '请选择' }}</div>
                <div v-else-if="it.type==='attach'" class="ctrl att"><PaperClipOutlined />点击上传</div>
                <div v-else-if="it.type==='group'" class="ctrl grp">{{ it.label }}</div>
                <div v-else class="ctrl">{{ it.placeholder || '请输入' }}</div>
              </div>
            </div>
            <DeleteOutlined class="fi-del" @click.stop="removeItem(it.id)" />
          </div>
          <div v-if="!canvas.length" class="canvas-empty">从左侧拖入字段组件开始设计</div>
        </div>
      </div>

      <!-- 属性面板 -->
      <div class="props">
        <div class="palette-title">字段属性</div>
        <template v-if="selected">
          <a-form layout="vertical" size="small">
            <a-form-item label="字段标签"><a-input v-model:value="selected.label" /></a-form-item>
            <a-form-item label="组件类型">
              <a-select v-model:value="selected.type" :options="PALETTE.map((p)=>({value:p.type,label:p.label}))" />
            </a-form-item>
            <a-form-item label="占位提示"><a-input v-model:value="selected.placeholder" placeholder="placeholder" /></a-form-item>
            <a-form-item label="栅格宽度">
              <a-radio-group v-model:value="selected.width" button-style="solid" size="small">
                <a-radio-button value="full">整行</a-radio-button>
                <a-radio-button value="half">半行</a-radio-button>
              </a-radio-group>
            </a-form-item>
            <a-form-item><a-checkbox v-model:checked="selected.required">必填字段</a-checkbox></a-form-item>
          </a-form>
        </template>
        <a-empty v-else description="选择一个字段以编辑属性" :image="false" style="margin-top:40px" />
      </div>
    </div>

    <!-- 流程设计器 -->
    <div v-else-if="activeTab === 'flow'" class="pane flow-pane">
      <div class="flow-toolbar">流程节点（BPMN）· 拖动右键演示；点击 ＋ 在节点后插入</div>
      <div class="flow-canvas">
        <template v-for="(n, i) in flow" :key="n.id">
          <div class="fnode" :style="{ borderColor: flowKindTone[n.kind] }">
            <div class="fn-ic" :style="{ background: flowKindTone[n.kind] }"><component :is="flowKindIcon[n.kind]" /></div>
            <div class="fn-body">
              <div class="fn-label">{{ n.label }}</div>
              <div class="fn-role">{{ n.role }}</div>
            </div>
            <DeleteOutlined v-if="n.kind!=='start'&&n.kind!=='end'" class="fn-del" @click="removeNode(n.id)" />
          </div>
          <div v-if="i < flow.length - 1" class="fconn">
            <span class="line"></span>
            <a-button shape="circle" size="small" class="add-btn" @click="addNodeAfter(i)"><PlusOutlined /></a-button>
            <span class="line"></span>
          </div>
        </template>
      </div>
      <div class="flow-legend">
        <span><i style="background:#10b981"></i>开始</span>
        <span><i style="background:#1a6fff"></i>任务节点</span>
        <span><i style="background:#f59e0b"></i>网关/判定</span>
        <span><i style="background:#ef4444"></i>结束</span>
      </div>
    </div>

    <!-- 版本管理 -->
    <div v-else class="pane version-pane">
      <a-table :columns="verCols" :data-source="versions" row-key="ver" :pagination="stdPagination()" size="middle">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'ver'">
            <b>{{ record.ver }}</b><a-tag v-if="record.status==='当前'" color="green" style="margin-left:6px">当前</a-tag>
          </template>
          <template v-else-if="column.key === 'op'">
            <a-button type="link" size="small">查看</a-button>
            <a-button type="link" size="small" :disabled="record.status==='当前'">对比当前</a-button>
            <a-button type="link" size="small" :disabled="record.status==='当前'">回滚</a-button>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<style scoped>
.designer { display: flex; flex-direction: column; height: 100%; background: #f5f6f8; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; background: #fff; border-bottom: 1px solid #e5e7eb; }
.topbar .left { display: flex; align-items: center; gap: 8px; }
.t-title { font-size: 16px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 8px; }
.topbar .right { display: flex; gap: 10px; }
.tabs-bar { display: flex; gap: 4px; padding: 0 24px; background: #fff; border-bottom: 1px solid #e5e7eb; }
.tab { padding: 12px 18px; font-size: 14px; color: #6b7280; cursor: pointer; border-bottom: 2px solid transparent; }
.tab:hover { color: #1a6fff; }
.tab.on { color: #1a6fff; font-weight: 600; border-bottom-color: #1a6fff; }
.pane { flex: 1; min-height: 0; overflow: auto; padding: 20px 24px; }

/* basic */
.basic-pane { display: flex; gap: 24px; }
.basic-form { flex: 1; max-width: 680px; background: #fff; padding: 20px 24px; border-radius: 10px; border: 1px solid #e5e7eb; }
.form-row { display: flex; gap: 16px; }
.form-row :deep(.ant-form-item) { flex: 1; }
.hint-card { width: 320px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px; height: fit-content; }
.hint-card h4 { margin: 0 0 8px; font-size: 14px; } .hint-card p { font-size: 13px; color: #6b7280; line-height: 1.7; }

/* designer grid */
.designer-grid { display: grid; grid-template-columns: 180px 1fr 260px; gap: 16px; padding: 16px 24px; }
.palette, .props { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; height: fit-content; }
.palette-title { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 12px; }
.palette-item { display: flex; align-items: center; gap: 8px; padding: 9px 10px; margin-bottom: 8px; border: 1px dashed #d1d5db; border-radius: 7px; font-size: 13px; color: #4b5563; cursor: grab; background: #fafbfc; }
.palette-item:hover { border-color: #1a6fff; color: #1a6fff; background: #f0f5ff; }
.palette-item:active { cursor: grabbing; }
.palette-tip { font-size: 11px; color: #9ca3af; margin-top: 8px; line-height: 1.5; }
.canvas-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; display: flex; flex-direction: column; overflow: hidden; }
.canvas-head { padding: 10px 16px; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #6b7280; font-weight: 600; }
.canvas { flex: 1; padding: 16px; display: flex; flex-wrap: wrap; gap: 12px; align-content: flex-start; min-height: 400px; }
.fitem { position: relative; width: 100%; display: flex; gap: 10px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; cursor: pointer; }
.fitem.half { width: calc(50% - 6px); }
.fitem.on { border-color: #1a6fff; box-shadow: 0 0 0 2px rgba(26,111,255,0.12); }
.fitem.over { border-top: 2px solid #1a6fff; }
.fi-handle { color: #cbd5e1; cursor: grab; padding-top: 2px; }
.fi-body { flex: 1; min-width: 0; }
.fi-label { font-size: 13px; font-weight: 600; color: #374151; display: flex; align-items: center; gap: 6px; }
.req { color: #ef4444; }
.fi-type { transform: scale(0.82); background: #f3f4f6; border: none; color: #9ca3af; }
.fi-control { margin-top: 6px; }
.ctrl { background: #f7f8fa; border: 1px solid #eef0f2; border-radius: 6px; padding: 6px 10px; font-size: 12px; color: #9ca3af; display: flex; align-items: center; gap: 6px; }
.ctrl.ta { height: 48px; } .ctrl.grp { background: transparent; border: none; font-weight: 600; color: #374151; border-left: 3px solid #1a6fff; border-radius: 0; }
.fi-del { position: absolute; top: 10px; right: 10px; color: #d1d5db; }
.fi-del:hover { color: #ef4444; }
.canvas-empty { width: 100%; text-align: center; color: #9ca3af; padding: 80px 0; border: 2px dashed #e5e7eb; border-radius: 8px; }
.props :deep(.ant-form-item) { margin-bottom: 12px; }

/* flow */
.flow-pane { display: flex; flex-direction: column; }
.flow-toolbar { font-size: 13px; color: #6b7280; margin-bottom: 16px; }
.flow-canvas { display: flex; align-items: center; flex-wrap: wrap; gap: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 28px 20px; row-gap: 24px; }
.fnode { position: relative; display: flex; align-items: center; gap: 10px; min-width: 150px; padding: 12px 14px; background: #fff; border: 2px solid #1a6fff; border-radius: 10px; }
.fn-ic { width: 30px; height: 30px; flex: none; border-radius: 8px; color: #fff; display: flex; align-items: center; justify-content: center; }
.fn-label { font-size: 13px; font-weight: 600; color: #111827; }
.fn-role { font-size: 11px; color: #9ca3af; }
.fn-del { position: absolute; top: -8px; right: -8px; background: #fff; border-radius: 50%; color: #d1d5db; font-size: 14px; }
.fn-del:hover { color: #ef4444; }
.fconn { display: flex; align-items: center; }
.fconn .line { width: 16px; height: 2px; background: #cbd5e1; }
.add-btn { color: #1a6fff; border-color: #93c5fd; }
.flow-legend { display: flex; gap: 20px; margin-top: 16px; font-size: 12px; color: #6b7280; }
.flow-legend span { display: flex; align-items: center; gap: 6px; }
.flow-legend i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }

/* version */
.version-pane :deep(.ant-table) { background: #fff; border-radius: 10px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
