<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  ArrowLeftOutlined, SaveOutlined, SendOutlined, EyeOutlined, PlusOutlined, DeleteOutlined,
  HolderOutlined, FontSizeOutlined, AlignLeftOutlined, DownOutlined, CheckSquareOutlined,
  CalendarOutlined, PaperClipOutlined, NumberOutlined, TableOutlined, GroupOutlined,
  PlayCircleOutlined, CheckCircleOutlined, BranchesOutlined, FlagOutlined,
} from '@ant-design/icons-vue';

// 模板设计器二级页（PRD-68 表单 / PRD-69 流程）：表单=可拖拽组件；流程=BPMN-lite 节点画布。
const route = useRoute();
const router = useRouter();
const kind = computed<'form' | 'flow'>(() => (route.params.kind === 'flow' ? 'flow' : 'form'));
const tplName = computed(() => String(route.query.name || (route.params.id === 'new' ? '新建模板' : '模板')));

/* ── 表单设计器 ── */
const PALETTE = [
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
  { id: 'f1', type: 'select', label: '问题分类', required: true, placeholder: '请选择', width: 'half' },
  { id: 'f2', type: 'select', label: '优先级', required: true, placeholder: '请选择', width: 'half' },
  { id: 'f3', type: 'textarea', label: '问题描述', required: true, placeholder: '请输入', width: 'full' },
]);
const selectedId = ref('f1');
const selected = computed(() => canvas.value.find((i) => i.id === selectedId.value));
const plabel = (t: string) => PALETTE.find((p) => p.type === t)?.label ?? t;
const picon = (t: string) => PALETTE.find((p) => p.type === t)?.icon ?? FontSizeOutlined;

const dragType = ref<string | null>(null);
const dragIndex = ref<number | null>(null);
const overIndex = ref<number | null>(null);
function pStart(t: string) { dragType.value = t; dragIndex.value = null; }
function iStart(i: number) { dragIndex.value = i; dragType.value = null; }
function dOver(i: number, e: DragEvent) { e.preventDefault(); overIndex.value = i; }
function newItem(t: string): FormItem { return { id: `f${seq++}`, type: t, label: plabel(t), required: false, placeholder: '', width: 'full' }; }
function dropAt(i: number, e: DragEvent) {
  e.preventDefault();
  if (dragType.value) { const it = newItem(dragType.value); canvas.value.splice(i, 0, it); selectedId.value = it.id; }
  else if (dragIndex.value !== null && dragIndex.value !== i) {
    const [m] = canvas.value.splice(dragIndex.value, 1);
    canvas.value.splice(dragIndex.value < i ? i - 1 : i, 0, m);
  }
  dragType.value = dragIndex.value = overIndex.value = null;
}
function dropEnd(e: DragEvent) {
  e.preventDefault();
  if (dragType.value) { const it = newItem(dragType.value); canvas.value.push(it); selectedId.value = it.id; }
  else if (dragIndex.value !== null) { const [m] = canvas.value.splice(dragIndex.value, 1); canvas.value.push(m); }
  dragType.value = dragIndex.value = overIndex.value = null;
}
function removeItem(id: string) {
  const i = canvas.value.findIndex((x) => x.id === id);
  if (i >= 0) canvas.value.splice(i, 1);
  if (selectedId.value === id) selectedId.value = canvas.value[0]?.id ?? '';
}

/* ── 流程设计器 ── */
interface FNode { id: string; label: string; kind: 'start' | 'task' | 'gateway' | 'end'; role: string; }
const flow = ref<FNode[]>([
  { id: 'n1', label: '开始', kind: 'start', role: '系统' },
  { id: 'n2', label: '受理', kind: 'task', role: '一线坐席' },
  { id: 'n3', label: '处理', kind: 'task', role: '二线坐席' },
  { id: 'n4', label: '审核?', kind: 'gateway', role: '规则' },
  { id: 'n5', label: '结案', kind: 'end', role: '系统' },
]);
let nseq = 10;
const fIcon: Record<string, any> = { start: PlayCircleOutlined, task: CheckCircleOutlined, gateway: BranchesOutlined, end: FlagOutlined };
const fTone: Record<string, string> = { start: '#10b981', task: '#7c3aed', gateway: '#f59e0b', end: '#ef4444' };
function addNode(i: number) { flow.value.splice(i + 1, 0, { id: `n${nseq++}`, label: '新节点', kind: 'task', role: '一线坐席' }); }
function delNode(id: string) { flow.value = flow.value.filter((n) => n.id !== id); }

function save() { message.success(`「${tplName.value}」已保存草稿`); }
function publish() { message.success(`「${tplName.value}」已发布`); }
</script>

<template>
  <div class="tpl-designer">
    <div class="topbar">
      <div class="left">
        <a-button type="text" @click="router.back()"><template #icon><ArrowLeftOutlined /></template></a-button>
        <div class="t-title">{{ tplName }}<a-tag :color="kind === 'form' ? 'blue' : 'purple'">{{ kind === 'form' ? '表单模板' : '流程模板' }}</a-tag></div>
      </div>
      <div class="right">
        <a-button><template #icon><EyeOutlined /></template>预览</a-button>
        <a-button @click="save"><template #icon><SaveOutlined /></template>保存草稿</a-button>
        <a-button type="primary" @click="publish"><template #icon><SendOutlined /></template>发布</a-button>
      </div>
    </div>

    <!-- 表单设计器 -->
    <div v-if="kind === 'form'" class="designer-grid">
      <div class="palette">
        <div class="p-title">字段组件</div>
        <div v-for="p in PALETTE" :key="p.type" class="p-item" draggable="true" @dragstart="pStart(p.type)">
          <component :is="p.icon" /><span>{{ p.label }}</span>
        </div>
        <div class="p-tip">拖入画布添加 · 拖动卡片排序</div>
      </div>
      <div class="canvas-wrap">
        <div class="canvas-head">表单预览 · {{ canvas.length }} 个字段</div>
        <div class="canvas" @dragover.prevent @drop="dropEnd">
          <div v-for="(it, i) in canvas" :key="it.id" class="fitem"
               :class="{ on: selectedId === it.id, half: it.width === 'half', over: overIndex === i }"
               draggable="true" @dragstart="iStart(i)" @dragover="dOver(i, $event)" @drop.stop="dropAt(i, $event)" @click="selectedId = it.id">
            <div class="fi-handle"><HolderOutlined /></div>
            <div class="fi-body">
              <div class="fi-label">{{ it.label }}<span v-if="it.required" class="req">*</span><a-tag class="fi-type">{{ plabel(it.type) }}</a-tag></div>
              <div class="ctrl" :class="it.type">
                <component v-if="it.type==='select'||it.type==='radio'||it.type==='attach'" :is="picon(it.type)" />
                {{ it.type === 'group' ? it.label : (it.placeholder || '请输入') }}
              </div>
            </div>
            <DeleteOutlined class="fi-del" @click.stop="removeItem(it.id)" />
          </div>
          <div v-if="!canvas.length" class="canvas-empty">从左侧拖入字段组件开始设计</div>
        </div>
      </div>
      <div class="props">
        <div class="p-title">字段属性</div>
        <a-form v-if="selected" layout="vertical" size="small">
          <a-form-item label="字段标签"><a-input v-model:value="selected.label" /></a-form-item>
          <a-form-item label="组件类型"><a-select v-model:value="selected.type" :options="PALETTE.map((p)=>({value:p.type,label:p.label}))" /></a-form-item>
          <a-form-item label="占位提示"><a-input v-model:value="selected.placeholder" /></a-form-item>
          <a-form-item label="栅格宽度">
            <a-radio-group v-model:value="selected.width" button-style="solid" size="small">
              <a-radio-button value="full">整行</a-radio-button><a-radio-button value="half">半行</a-radio-button>
            </a-radio-group>
          </a-form-item>
          <a-form-item><a-checkbox v-model:checked="selected.required">必填字段</a-checkbox></a-form-item>
        </a-form>
        <a-empty v-else description="选择字段以编辑" :image="false" style="margin-top:40px" />
      </div>
    </div>

    <!-- 流程设计器 -->
    <div v-else class="flow-pane">
      <div class="flow-toolbar">流程节点（BPMN）· 点击 ＋ 在节点后插入，可删除中间节点</div>
      <div class="flow-canvas">
        <template v-for="(n, i) in flow" :key="n.id">
          <div class="fnode" :style="{ borderColor: fTone[n.kind] }">
            <div class="fn-ic" :style="{ background: fTone[n.kind] }"><component :is="fIcon[n.kind]" /></div>
            <div><div class="fn-label">{{ n.label }}</div><div class="fn-role">{{ n.role }}</div></div>
            <DeleteOutlined v-if="n.kind!=='start'&&n.kind!=='end'" class="fn-del" @click="delNode(n.id)" />
          </div>
          <div v-if="i < flow.length - 1" class="fconn">
            <span class="line"></span>
            <a-button shape="circle" size="small" class="add-btn" @click="addNode(i)"><PlusOutlined /></a-button>
            <span class="line"></span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tpl-designer { display: flex; flex-direction: column; height: 100%; background: #f5f6f8; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; background: #fff; border-bottom: 1px solid #e5e7eb; }
.topbar .left { display: flex; align-items: center; gap: 8px; }
.t-title { font-size: 16px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 8px; }
.topbar .right { display: flex; gap: 10px; }
.designer-grid { flex: 1; min-height: 0; display: grid; grid-template-columns: 180px 1fr 260px; gap: 16px; padding: 16px 24px; overflow: auto; }
.palette, .props { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; height: fit-content; }
.p-title { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 12px; }
.p-item { display: flex; align-items: center; gap: 8px; padding: 9px 10px; margin-bottom: 8px; border: 1px dashed #d1d5db; border-radius: 7px; font-size: 13px; color: #4b5563; cursor: grab; background: #fafbfc; }
.p-item:hover { border-color: #1a6fff; color: #1a6fff; background: #f0f5ff; }
.p-tip { font-size: 11px; color: #9ca3af; margin-top: 8px; }
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
.ctrl { margin-top: 6px; background: #f7f8fa; border: 1px solid #eef0f2; border-radius: 6px; padding: 6px 10px; font-size: 12px; color: #9ca3af; display: flex; align-items: center; gap: 6px; }
.ctrl.textarea { height: 44px; } .ctrl.group { background: transparent; border: none; border-left: 3px solid #1a6fff; border-radius: 0; font-weight: 600; color: #374151; }
.fi-del { position: absolute; top: 10px; right: 10px; color: #d1d5db; }
.fi-del:hover { color: #ef4444; }
.canvas-empty { width: 100%; text-align: center; color: #9ca3af; padding: 80px 0; border: 2px dashed #e5e7eb; border-radius: 8px; }
.props :deep(.ant-form-item) { margin-bottom: 12px; }
.flow-pane { flex: 1; min-height: 0; overflow: auto; padding: 20px 24px; }
.flow-toolbar { font-size: 13px; color: #6b7280; margin-bottom: 16px; }
.flow-canvas { display: flex; align-items: center; flex-wrap: wrap; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 28px 20px; row-gap: 24px; }
.fnode { position: relative; display: flex; align-items: center; gap: 10px; min-width: 140px; padding: 12px 14px; background: #fff; border: 2px solid #7c3aed; border-radius: 10px; }
.fn-ic { width: 30px; height: 30px; flex: none; border-radius: 8px; color: #fff; display: flex; align-items: center; justify-content: center; }
.fn-label { font-size: 13px; font-weight: 600; color: #111827; }
.fn-role { font-size: 11px; color: #9ca3af; }
.fn-del { position: absolute; top: -8px; right: -8px; background: #fff; border-radius: 50%; color: #d1d5db; font-size: 14px; }
.fn-del:hover { color: #ef4444; }
.fconn { display: flex; align-items: center; }
.fconn .line { width: 16px; height: 2px; background: #cbd5e1; }
.add-btn { color: #7c3aed; border-color: #c4b5fd; }
</style>
