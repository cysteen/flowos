<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  PlusOutlined, AppstoreOutlined, EditOutlined, BranchesOutlined,
  HistoryOutlined, SettingOutlined,
} from '@ant-design/icons-vue';

// 工单类型管理（PRD-60，V1 A0-workorder-type-list）：按应用筛选 + 类型 CRUD + 进入版本/配置/设计器二级页。
interface TType {
  id: string; name: string; code: string; app: string; channels: string[];
  version: string; fields: number; nodes: number; status: '已发布' | '草稿' | '已停用'; updated: string;
}

const router = useRouter();
const apps = ['全部应用', '客服中心', '售后服务', '商机管理'];
const appFilter = ref('全部应用');
const statusFilter = ref('全部');
const keyword = ref('');

const all = ref<TType[]>([
  { id: 'complaint', name: '投诉工单', code: 'WO_COMPLAINT', app: '客服中心', channels: ['电话', '在线', '12315'], version: 'v3.2', fields: 24, nodes: 7, status: '已发布', updated: '2026-06-18' },
  { id: 'consult', name: '咨询工单', code: 'WO_CONSULT', app: '客服中心', channels: ['电话', '在线'], version: 'v2.0', fields: 16, nodes: 4, status: '已发布', updated: '2026-06-15' },
  { id: 'suggest', name: '建议工单', code: 'WO_SUGGEST', app: '客服中心', channels: ['在线', '邮件'], version: 'v1.4', fields: 14, nodes: 4, status: '已发布', updated: '2026-06-10' },
  { id: 'biz', name: '商机工单', code: 'WO_BIZ', app: '商机管理', channels: ['电话'], version: 'v1.1', fields: 18, nodes: 5, status: '已发布', updated: '2026-06-12' },
  { id: 'aftersale', name: '售后工单', code: 'WO_AFTERSALE', app: '售后服务', channels: ['电话', '在线'], version: 'v2.3', fields: 22, nodes: 6, status: '已发布', updated: '2026-06-17' },
  { id: 'return', name: '退换货工单', code: 'WO_RETURN', app: '售后服务', channels: ['在线'], version: 'v0.9', fields: 12, nodes: 5, status: '草稿', updated: '2026-06-19' },
]);

const list = computed(() =>
  all.value.filter((t) => {
    if (appFilter.value !== '全部应用' && t.app !== appFilter.value) return false;
    if (statusFilter.value !== '全部' && t.status !== statusFilter.value) return false;
    if (keyword.value && !`${t.name}${t.code}`.toLowerCase().includes(keyword.value.toLowerCase())) return false;
    return true;
  }),
);

const STATUS_TONE: Record<string, string> = { 已发布: 'green', 草稿: 'orange', 已停用: 'default' };

function openDesigner(t: TType, tab = 'basic') {
  router.push({ name: 'admin-ticket-type-designer', params: { id: t.id }, query: { tab } });
}
function createType() { router.push({ name: 'admin-ticket-type-designer', params: { id: 'new' }, query: { tab: 'basic' } }); }
function toggle(t: TType) {
  t.status = t.status === '已停用' ? '已发布' : '已停用';
  message.success(`${t.name} 已${t.status === '已停用' ? '停用' : '启用'}`);
}
</script>

<template>
  <div class="ticket-types">
    <div class="toolbar">
      <div class="filters">
        <a-segmented v-model:value="appFilter" :options="apps" />
        <a-select v-model:value="statusFilter" style="width: 120px" :options="['全部', '已发布', '草稿', '已停用'].map((v) => ({ value: v, label: v }))" />
        <a-input-search v-model:value="keyword" placeholder="搜索类型名称/编码" style="width: 220px" allow-clear />
      </div>
      <a-button type="primary" @click="createType"><template #icon><PlusOutlined /></template>新建工单类型</a-button>
    </div>

    <div class="grid">
      <div v-for="t in list" :key="t.id" class="card" @click="openDesigner(t)">
        <div class="card-head">
          <div class="ic"><AppstoreOutlined /></div>
          <div class="title-wrap">
            <div class="name">{{ t.name }}<a-tag :color="STATUS_TONE[t.status]" class="st-tag">{{ t.status }}</a-tag></div>
            <div class="code">{{ t.code }} · {{ t.app }}</div>
          </div>
          <a-tag class="ver">{{ t.version }}</a-tag>
        </div>
        <div class="chips">
          <span class="chip-label">渠道</span>
          <a-tag v-for="c in t.channels" :key="c" class="ch">{{ c }}</a-tag>
        </div>
        <div class="metrics">
          <div class="m"><b>{{ t.fields }}</b><span>字段</span></div>
          <div class="m"><b>{{ t.nodes }}</b><span>流程节点</span></div>
          <div class="m"><b>{{ t.updated }}</b><span>更新</span></div>
        </div>
        <div class="acts" @click.stop>
          <a-tooltip title="表单/视图/流程设计器"><a-button size="small" type="primary" ghost @click="openDesigner(t, 'form')"><template #icon><SettingOutlined /></template>设计器</a-button></a-tooltip>
          <a-tooltip title="实体字段编辑"><a-button size="small" @click="openDesigner(t, 'basic')"><template #icon><EditOutlined /></template>编辑</a-button></a-tooltip>
          <a-tooltip title="流程设计器"><a-button size="small" @click="openDesigner(t, 'flow')"><template #icon><BranchesOutlined /></template>流程</a-button></a-tooltip>
          <a-tooltip title="版本历史"><a-button size="small" @click="openDesigner(t, 'version')"><template #icon><HistoryOutlined /></template>版本</a-button></a-tooltip>
          <a-button size="small" :danger="t.status !== '已停用'" @click="toggle(t)">{{ t.status === '已停用' ? '启用' : '停用' }}</a-button>
        </div>
      </div>
    </div>
    <a-empty v-if="!list.length" description="无匹配的工单类型" style="margin-top: 60px" />
  </div>
</template>

<style scoped>
.ticket-types { padding: 16px 24px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 16px; flex-wrap: wrap; }
.filters { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; cursor: pointer; transition: all 0.15s; }
.card:hover { border-color: #1a6fff; box-shadow: 0 4px 16px rgba(26, 111, 255, 0.1); }
.card-head { display: flex; align-items: flex-start; gap: 12px; }
.ic { width: 38px; height: 38px; flex: none; border-radius: 9px; background: linear-gradient(135deg, #1a6fff, #4f9bff); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.title-wrap { flex: 1; min-width: 0; }
.name { font-size: 15px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 8px; }
.st-tag { transform: scale(0.85); }
.code { font-size: 12px; color: #9ca3af; margin-top: 2px; font-family: ui-monospace, monospace; }
.ver { flex: none; background: #f0f5ff; color: #1a6fff; border-color: #d6e4ff; }
.chips { display: flex; align-items: center; gap: 6px; margin: 12px 0; flex-wrap: wrap; }
.chip-label { font-size: 12px; color: #9ca3af; }
.ch { background: #f3f4f6; border: none; color: #4b5563; margin: 0; }
.metrics { display: flex; gap: 24px; padding: 10px 0; border-top: 1px dashed #eef0f2; }
.m { display: flex; flex-direction: column; }
.m b { font-size: 15px; color: #111827; } .m span { font-size: 11px; color: #9ca3af; }
.acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; padding-top: 12px; border-top: 1px solid #f3f4f6; }
</style>
