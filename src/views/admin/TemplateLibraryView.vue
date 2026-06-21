<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  PlusOutlined, FormOutlined, BranchesOutlined, CopyOutlined,
  EditOutlined, EyeOutlined, SendOutlined,
} from '@ant-design/icons-vue';

// 模板库（PRD-66 表单 / PRD-67 流程）：分类侧栏 + 模板卡片 + 引用计数 + 复制派生 + 进入设计器。
const route = useRoute();
const router = useRouter();
const kind = computed<'form' | 'flow'>(() => (route.path.includes('flow-templates') ? 'flow' : 'form'));
const isForm = computed(() => kind.value === 'form');

interface Tpl { id: string; name: string; cat: string; metric: number; refs: number; ver: string; status: '已发布' | '草稿'; updated: string; }

const FORM_CATS = ['全部', '客服受理', '处理记录', '回访满意度', '商机登记', '通用'];
const FLOW_CATS = ['全部', '投诉处理', '咨询处理', '售后流程', '审批流', '通用'];
const cats = computed(() => (isForm.value ? FORM_CATS : FLOW_CATS));
const cat = ref('全部');

const FORM_TPLS = ref<Tpl[]>([
  { id: 'ft1', name: '投诉受理表单', cat: '客服受理', metric: 24, refs: 3, ver: 'v2.1', status: '已发布', updated: '2026-06-18' },
  { id: 'ft2', name: '咨询登记表单', cat: '客服受理', metric: 16, refs: 2, ver: 'v1.3', status: '已发布', updated: '2026-06-12' },
  { id: 'ft3', name: '处理结果表单', cat: '处理记录', metric: 12, refs: 5, ver: 'v3.0', status: '已发布', updated: '2026-06-15' },
  { id: 'ft4', name: '回访满意度表单', cat: '回访满意度', metric: 8, refs: 4, ver: 'v1.0', status: '已发布', updated: '2026-05-28' },
  { id: 'ft5', name: '商机线索表单', cat: '商机登记', metric: 18, refs: 1, ver: 'v0.9', status: '草稿', updated: '2026-06-19' },
  { id: 'ft6', name: '通用客户信息块', cat: '通用', metric: 6, refs: 9, ver: 'v4.2', status: '已发布', updated: '2026-06-10' },
]);
const FLOW_TPLS = ref<Tpl[]>([
  { id: 'fl1', name: '标准投诉处理流程', cat: '投诉处理', metric: 7, refs: 2, ver: 'v3.2', status: '已发布', updated: '2026-06-18' },
  { id: 'fl2', name: '咨询快速处理流程', cat: '咨询处理', metric: 4, refs: 1, ver: 'v2.0', status: '已发布', updated: '2026-06-15' },
  { id: 'fl3', name: '售后退换货流程', cat: '售后流程', metric: 6, refs: 3, ver: 'v2.3', status: '已发布', updated: '2026-06-17' },
  { id: 'fl4', name: '三级升级审批流', cat: '审批流', metric: 5, refs: 4, ver: 'v1.4', status: '已发布', updated: '2026-06-08' },
  { id: 'fl5', name: '通用回访流程', cat: '通用', metric: 3, refs: 6, ver: 'v1.1', status: '草稿', updated: '2026-06-19' },
]);
const all = computed(() => (isForm.value ? FORM_TPLS.value : FLOW_TPLS.value));
const list = computed(() => all.value.filter((t) => cat.value === '全部' || t.cat === cat.value));
const catCount = (c: string) => (c === '全部' ? all.value.length : all.value.filter((t) => t.cat === c).length);

const previewOpen = ref(false);
const previewTpl = ref<Tpl | null>(null);

function openDesigner(t: Tpl) {
  router.push({ name: 'admin-template-designer', params: { kind: kind.value, id: t.id }, query: { name: t.name } });
}
function create() { router.push({ name: 'admin-template-designer', params: { kind: kind.value, id: 'new' } }); }
let copySeq = 1;
function duplicate(t: Tpl) {
  const arr = isForm.value ? FORM_TPLS : FLOW_TPLS;
  arr.value.unshift({ ...t, id: t.id + '_copy' + copySeq++, name: `${t.name} 副本`, refs: 0, status: '草稿', ver: 'v0.1', updated: '2026-06-21' });
  message.success(`已复制派生「${t.name} 副本」（草稿）`);
}
function preview(t: Tpl) { previewTpl.value = t; previewOpen.value = true; }
</script>

<template>
  <div class="tpl-lib">
    <!-- 分类侧栏 -->
    <div class="cats">
      <div class="cats-title">{{ isForm ? '表单分类' : '流程分类' }}</div>
      <div v-for="c in cats" :key="c" class="cat-item" :class="{ on: c === cat }" @click="cat = c">
        <span>{{ c }}</span><span class="cnt">{{ catCount(c) }}</span>
      </div>
    </div>

    <!-- 模板区 -->
    <div class="main">
      <div class="bar">
        <div class="bar-title">{{ isForm ? '表单模板库' : '流程模板库' }} · {{ list.length }} 个模板</div>
        <a-button type="primary" @click="create"><template #icon><PlusOutlined /></template>新建{{ isForm ? '表单' : '流程' }}模板</a-button>
      </div>
      <div class="grid">
        <div v-for="t in list" :key="t.id" class="card">
          <div class="c-head">
            <div class="c-ic" :class="kind"><component :is="isForm ? FormOutlined : BranchesOutlined" /></div>
            <div class="c-meta">
              <div class="c-name">{{ t.name }}</div>
              <div class="c-sub">{{ t.cat }} · {{ t.ver }}</div>
            </div>
            <a-tag :color="t.status === '已发布' ? 'green' : 'orange'">{{ t.status }}</a-tag>
          </div>
          <div class="c-stats">
            <span><b>{{ t.metric }}</b>{{ isForm ? '字段' : '节点' }}</span>
            <span><b>{{ t.refs }}</b>处引用</span>
            <span class="upd">{{ t.updated }}</span>
          </div>
          <div class="c-acts">
            <a-button size="small" type="primary" ghost @click="openDesigner(t)"><template #icon><EditOutlined /></template>设计</a-button>
            <a-button size="small" @click="preview(t)"><template #icon><EyeOutlined /></template>预览</a-button>
            <a-button size="small" @click="duplicate(t)"><template #icon><CopyOutlined /></template>复制派生</a-button>
            <a-button size="small" v-if="t.status === '草稿'" type="link"><template #icon><SendOutlined /></template>发布</a-button>
          </div>
        </div>
      </div>
    </div>

    <a-drawer v-model:open="previewOpen" :title="previewTpl?.name" width="520" placement="right">
      <div v-if="previewTpl" class="pv">
        <a-descriptions :column="1" bordered size="small">
          <a-descriptions-item label="分类">{{ previewTpl.cat }}</a-descriptions-item>
          <a-descriptions-item label="版本">{{ previewTpl.ver }}</a-descriptions-item>
          <a-descriptions-item :label="isForm ? '字段数' : '节点数'">{{ previewTpl.metric }}</a-descriptions-item>
          <a-descriptions-item label="被引用">{{ previewTpl.refs }} 个工单类型</a-descriptions-item>
          <a-descriptions-item label="状态">{{ previewTpl.status }}</a-descriptions-item>
        </a-descriptions>
        <div class="pv-canvas">
          <div class="pv-title">{{ isForm ? '表单结构预览' : '流程结构预览' }}</div>
          <template v-if="isForm">
            <div class="pv-field" v-for="n in Math.min(previewTpl.metric, 6)" :key="n"><span class="lbl">字段 {{ n }}</span><span class="ctrl"></span></div>
          </template>
          <template v-else>
            <div class="pv-flow"><span v-for="n in previewTpl.metric" :key="n" class="pv-node">节点{{ n }}</span></div>
          </template>
        </div>
        <a-button type="primary" block style="margin-top: 16px" @click="previewOpen = false; openDesigner(previewTpl!)">在设计器中打开</a-button>
      </div>
    </a-drawer>
  </div>
</template>

<style scoped>
.tpl-lib { display: flex; gap: 16px; padding: 16px 24px; align-items: flex-start; }
.cats { width: 200px; flex: none; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
.cats-title { font-size: 13px; font-weight: 600; color: #374151; padding: 4px 8px 10px; }
.cat-item { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; border-radius: 7px; cursor: pointer; font-size: 13px; color: #4b5563; }
.cat-item:hover { background: #f9fafb; }
.cat-item.on { background: #eff6ff; color: #1a6fff; font-weight: 600; }
.cnt { font-size: 12px; color: #9ca3af; }
.cat-item.on .cnt { color: #1a6fff; }
.main { flex: 1; min-width: 0; }
.bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.bar-title { font-size: 14px; font-weight: 600; color: #111827; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; transition: all 0.15s; }
.card:hover { border-color: #1a6fff; box-shadow: 0 4px 16px rgba(26,111,255,0.08); }
.c-head { display: flex; align-items: center; gap: 12px; }
.c-ic { width: 40px; height: 40px; flex: none; border-radius: 9px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.c-ic.form { background: linear-gradient(135deg, #1a6fff, #4f9bff); }
.c-ic.flow { background: linear-gradient(135deg, #7c3aed, #a855f7); }
.c-meta { flex: 1; min-width: 0; }
.c-name { font-size: 14px; font-weight: 600; color: #111827; }
.c-sub { font-size: 12px; color: #9ca3af; margin-top: 2px; }
.c-stats { display: flex; gap: 20px; padding: 12px 0; margin: 12px 0; border-top: 1px dashed #eef0f2; border-bottom: 1px dashed #eef0f2; font-size: 12px; color: #9ca3af; }
.c-stats b { color: #111827; font-size: 15px; margin-right: 4px; }
.c-stats .upd { margin-left: auto; }
.c-acts { display: flex; gap: 8px; flex-wrap: wrap; }
.pv-canvas { margin-top: 16px; background: #f7f8fa; border: 1px solid #eef0f2; border-radius: 8px; padding: 16px; }
.pv-title { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 12px; }
.pv-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.pv-field .lbl { font-size: 12px; color: #6b7280; }
.pv-field .ctrl { height: 30px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; }
.pv-flow { display: flex; flex-wrap: wrap; gap: 8px; }
.pv-node { padding: 8px 14px; background: #fff; border: 1px solid #d6e4ff; border-radius: 6px; font-size: 12px; color: #1a6fff; }
</style>
