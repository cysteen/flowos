<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  PlusOutlined, EditOutlined, BranchesOutlined, HistoryOutlined, SettingOutlined,
  MoreOutlined, ApiOutlined, NodeIndexOutlined, FormOutlined, AppstoreOutlined,
  SearchOutlined, ReloadOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { toneOf } from '@/config/adminUi';
import { BUSINESS_TYPES } from '@/views/tickets/types/createTicket';

// 工单类型管理（PRD-60，V1 A0-workorder-type-list）：概览统计 + 卡片（清晰层级）+ 设计器主入口 + 更多菜单。
interface TType {
  id: string; name: string; code: string; app: string; channels: string[]; bizTypes: string[];
  version: string; fields: number; nodes: number; status: '已发布' | '草稿' | '已停用'; updated: string;
}

const router = useRouter();
const apps = ['全部应用', '客服中心', '售后服务', '商机管理'];
const appFilter = ref('全部应用');
const statusFilter = ref('全部');
const keyword = ref('');

const all = ref<TType[]>([
  { id: 'complaint', name: '投诉工单', code: 'WO_COMPLAINT', app: '客服中心', channels: ['电话', '在线', '12315'], bizTypes: ['学习机', '翻录', '智学网'], version: 'v3.2', fields: 24, nodes: 7, status: '已发布', updated: '2026-06-18' },
  { id: 'consult', name: '咨询工单', code: 'WO_CONSULT', app: '客服中心', channels: ['电话', '在线'], bizTypes: ['学习机', '智学网'], version: 'v2.0', fields: 16, nodes: 4, status: '已发布', updated: '2026-06-15' },
  { id: 'suggest', name: '建议工单', code: 'WO_SUGGEST', app: '客服中心', channels: ['在线', '邮件'], bizTypes: ['学习机', '智学网'], version: 'v1.4', fields: 14, nodes: 4, status: '已发布', updated: '2026-06-10' },
  { id: 'biz', name: '商机工单', code: 'WO_BIZ', app: '商机管理', channels: ['电话'], bizTypes: ['学习机', '翻录'], version: 'v1.1', fields: 18, nodes: 5, status: '已发布', updated: '2026-06-12' },
  { id: 'aftersale', name: '售后工单', code: 'WO_AFTERSALE', app: '售后服务', channels: ['电话', '在线'], bizTypes: ['学习机', '翻录'], version: 'v2.3', fields: 22, nodes: 6, status: '已发布', updated: '2026-06-17' },
  { id: 'return', name: '退换货工单', code: 'WO_RETURN', app: '售后服务', channels: ['在线'], bizTypes: ['学习机'], version: 'v0.9', fields: 12, nodes: 5, status: '草稿', updated: '2026-06-19' },
]);
const bizTypeOptions = BUSINESS_TYPES.map((v) => ({ value: v, label: v }));

const applied = ref({ app: '全部应用', status: '全部', keyword: '' });

const list = computed(() =>
  all.value.filter((t) => {
    if (applied.value.app !== '全部应用' && t.app !== applied.value.app) return false;
    if (applied.value.status !== '全部' && t.status !== applied.value.status) return false;
    const kw = applied.value.keyword.trim().toLowerCase();
    if (kw && !`${t.name}${t.code}`.toLowerCase().includes(kw)) return false;
    return true;
  }),
);
function onQuery() {
  applied.value = { app: appFilter.value, status: statusFilter.value, keyword: keyword.value };
}
function onReset() {
  appFilter.value = '全部应用';
  statusFilter.value = '全部';
  keyword.value = '';
  onQuery();
}

const stats = computed(() => ({
  total: all.value.length,
  published: all.value.filter((t) => t.status === '已发布').length,
  draft: all.value.filter((t) => t.status === '草稿').length,
  disabled: all.value.filter((t) => t.status === '已停用').length,
}));


// 类型主题色（按 id）
const TYPE_THEME: Record<string, { color: string; emoji: string }> = {
  complaint: { color: '#ef4444', emoji: '⚠️' },
  consult: { color: '#1a6fff', emoji: '💬' },
  suggest: { color: '#10b981', emoji: '💡' },
  biz: { color: '#7c3aed', emoji: '📈' },
  aftersale: { color: '#f59e0b', emoji: '🔧' },
  return: { color: '#06b6d4', emoji: '📦' },
};
const themeOf = (id: string) => TYPE_THEME[id] ?? { color: '#1a6fff', emoji: '📋' };

function openDesigner(t: TType, tab = 'form') {
  router.push({ name: 'admin-ticket-type-designer', params: { id: t.id }, query: { tab } });
}
function createType() { router.push({ name: 'admin-ticket-type-designer', params: { id: 'new' }, query: { tab: 'basic' } }); }
function toggle(t: TType) {
  t.status = t.status === '已停用' ? '已发布' : '已停用';
  message.success(`${t.name} 已${t.status === '已停用' ? '停用' : '启用'}`);
}
function onMenu(key: string, t: TType) {
  if (key === 'basic') openDesigner(t, 'basic');
  else if (key === 'flow') openDesigner(t, 'flow');
  else if (key === 'version') openDesigner(t, 'version');
  else if (key === 'toggle') toggle(t);
}
</script>

<template>
  <div class="ticket-types-page">
    <div class="panel">
      <AdminPageHeader
        title="工单类型管理"
        subtitle="定义各应用下的工单类型，配置表单字段、处理流程，并绑定渠道与业务类型"
      >
        <template #actions>
          <a-button type="primary" @click="createType"><template #icon><PlusOutlined /></template>新建工单类型</a-button>
        </template>
      </AdminPageHeader>

    <div class="stat-row">
      <div class="stat"><div class="stat-num">{{ stats.total }}</div><div class="stat-lbl">全部类型</div></div>
      <div class="stat"><div class="stat-num ok">{{ stats.published }}</div><div class="stat-lbl">已发布</div></div>
      <div class="stat"><div class="stat-num warn">{{ stats.draft }}</div><div class="stat-lbl">草稿</div></div>
      <div class="stat"><div class="stat-num muted">{{ stats.disabled }}</div><div class="stat-lbl">已停用</div></div>
    </div>

    <!-- 筛选条 -->
    <div class="filter-card">
      <div class="filters">
        <div class="fi"><span class="fl">应用</span><a-select v-model:value="appFilter" style="width:130px" :options="apps.map((v) => ({ value: v, label: v }))" /></div>
        <div class="fi"><span class="fl">状态</span><a-select v-model:value="statusFilter" style="width:120px" :options="['全部', '已发布', '草稿', '已停用'].map((v) => ({ value: v, label: v }))" /></div>
        <div class="fi"><span class="fl">关键词</span><a-input v-model:value="keyword" placeholder="类型名称 / 编码" allow-clear style="width:200px" @press-enter="onQuery" /></div>
      </div>
      <div class="fa">
        <a-button type="primary" @click="onQuery"><template #icon><SearchOutlined /></template>查询</a-button>
        <a-button @click="onReset"><template #icon><ReloadOutlined /></template>重置</a-button>
      </div>
    </div>

    <!-- 卡片网格 -->
    <div class="grid">
      <div v-for="t in list" :key="t.id" class="card" :class="{ off: t.status === '已停用' }">
        <div class="c-topbar">
          <div class="c-head">
            <span class="c-ic" :style="{ background: themeOf(t.id).color + '14', color: themeOf(t.id).color }">{{ themeOf(t.id).emoji }}</span>
            <div class="c-title">
              <div class="c-name-row">
                <span class="c-name">{{ t.name }}</span>
                <a-tag :color="toneOf(t.status)" class="c-tag">{{ t.status }}</a-tag>
              </div>
              <div class="c-code">{{ t.code }}</div>
            </div>
          </div>
          <div class="c-actions">
            <a-button type="primary" size="small" @click="openDesigner(t, 'form')"><template #icon><SettingOutlined /></template>设计器</a-button>
            <a-dropdown placement="bottomRight" trigger="click">
              <a-button size="small" class="more-btn"><MoreOutlined /></a-button>
              <template #overlay>
                <a-menu @click="(e: any) => onMenu(e.key, t)">
                  <a-menu-item key="basic"><EditOutlined /> 编辑信息 / 字段</a-menu-item>
                  <a-menu-item key="flow"><BranchesOutlined /> 流程设计</a-menu-item>
                  <a-menu-item key="version"><HistoryOutlined /> 版本历史</a-menu-item>
                  <a-menu-divider />
                  <a-menu-item key="toggle" :danger="t.status !== '已停用'">{{ t.status === '已停用' ? '启用类型' : '停用类型' }}</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </div>
        </div>

        <!-- 关键信息：应用 + 版本 -->
        <div class="c-keyinfo">
          <span class="ki"><i>应用</i>{{ t.app }}</span>
          <span class="ki"><i>版本</i><b :style="{ color: themeOf(t.id).color }">{{ t.version }}</b></span>
          <span class="ki"><i>更新</i>{{ t.updated }}</span>
        </div>

        <!-- 度量：字段 / 节点 -->
        <div class="c-metrics">
          <div class="metric"><FormOutlined :style="{ color: themeOf(t.id).color }" /><b>{{ t.fields }}</b><span>表单字段</span></div>
          <div class="metric"><NodeIndexOutlined :style="{ color: themeOf(t.id).color }" /><b>{{ t.nodes }}</b><span>流程节点</span></div>
          <div class="metric"><ApiOutlined :style="{ color: themeOf(t.id).color }" /><b>{{ t.channels.length }}</b><span>绑定渠道</span></div>
          <div class="metric"><AppstoreOutlined :style="{ color: themeOf(t.id).color }" /><b>{{ t.bizTypes.length }}</b><span>业务类型</span></div>
        </div>

        <!-- 业务类型（多选绑定） -->
        <div class="c-bind">
          <span class="bind-label">业务类型</span>
          <a-select
            v-model:value="t.bizTypes"
            mode="multiple"
            size="small"
            allow-clear
            placeholder="选择适用的业务类型"
            :options="bizTypeOptions"
            class="bind-select"
            :max-tag-count="3"
          />
        </div>

        <!-- 渠道 -->
        <div class="c-channels">
          <span class="bind-label">绑定渠道</span>
          <div class="ch-tags">
            <a-tag v-for="c in t.channels" :key="c" class="ch">{{ c }}</a-tag>
          </div>
        </div>

      </div>
    </div>
    <a-empty v-if="!list.length" description="无匹配的工单类型" class="grid-empty" />
    </div>
  </div>
</template>

<style scoped>
/* 字号层级对齐 admin-ui-spec：标题 18/700 · 正文 13 · 标签 12/#6b7280 · 弱文案 12/#9ca3af · KPI 数字 22/700 */
.ticket-types-page {
  min-height: 100%;
  padding: 16px 20px 20px;
  background: var(--flowos-content-bg, #f9fafb);
}
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 20px 24px 24px;
}
.panel :deep(.admin-page-header) {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f1f3;
}

.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; max-width: 560px; }
.stat { background: #fafbfc; border: 1px solid #eef0f3; border-radius: 8px; padding: 8px 14px; }
.stat-num { font-size: 22px; font-weight: 700; color: #111827; line-height: 1.1; }
.stat-num.ok { color: #10b981; } .stat-num.warn { color: #f59e0b; } .stat-num.muted { color: #9ca3af; }
.stat-lbl { font-size: 12px; color: #9ca3af; margin-top: 2px; line-height: 1.2; }

.filter-card {
  background: #fafbfc;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.filters { display: flex; gap: 16px; flex-wrap: wrap; }
.fi { display: flex; align-items: center; gap: 8px; }
.fl { font-size: 12px; color: #6b7280; white-space: nowrap; }
.fa { display: flex; gap: 8px; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 14px; }
.grid-empty { margin: 48px 0; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; transition: all 0.15s; }
.card:hover { border-color: #1a6fff; box-shadow: 0 2px 8px rgba(26, 111, 255, 0.08); }
.card.off { opacity: 0.65; }

.c-topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.c-head { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.c-ic { width: 40px; height: 40px; flex: none; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
.c-title { flex: 1; min-width: 0; }
.c-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.c-name { font-size: 14px; font-weight: 600; color: #111827; }
.c-code { font-size: 12px; color: #9ca3af; font-family: ui-monospace, monospace; margin-top: 2px; }
.c-tag { margin: 0; font-size: 12px; line-height: 20px; }

.c-actions { flex: none; display: flex; align-items: center; gap: 4px; }
.c-actions :deep(.ant-btn-sm) { height: 24px; padding: 0 8px; font-size: 12px; line-height: 22px; }
.more-btn { width: 24px; min-width: 24px; padding: 0 !important; display: inline-flex; align-items: center; justify-content: center; }

.c-keyinfo { display: flex; gap: 22px; margin: 10px 0 2px; padding: 10px 12px; background: #f9fafb; border-radius: 8px; }
.ki { display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: #374151; }
.ki i { font-style: normal; font-size: 12px; color: #9ca3af; }
.ki b { font-weight: 600; }

.c-metrics { display: flex; gap: 6px; margin: 8px 0; }
.metric {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  min-height: 0;
  padding: 6px 2px;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
}
.metric :deep(.anticon) { font-size: 12px; margin-bottom: 2px; color: #6b7280; }
.metric b { font-size: 14px; font-weight: 700; color: #111827; line-height: 1.2; }
.metric span { font-size: 12px; color: #9ca3af; line-height: 1.2; margin-top: 1px; }

.c-bind { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
.c-channels { display: flex; align-items: flex-start; gap: 10px; min-height: 24px; }
.bind-label { flex: none; width: 56px; font-size: 12px; color: #6b7280; line-height: 24px; }
.bind-select { flex: 1; min-width: 0; }
.ch-tags { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; justify-content: flex-end; }
.ch { background: #f3f4f6; border: none; color: #4b5563; margin: 0; font-size: 12px; }
</style>
