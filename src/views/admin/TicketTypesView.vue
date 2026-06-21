<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  PlusOutlined, EditOutlined, BranchesOutlined, HistoryOutlined, SettingOutlined,
  MoreOutlined, ApiOutlined, NodeIndexOutlined, FormOutlined,
} from '@ant-design/icons-vue';

// 工单类型管理（PRD-60，V1 A0-workorder-type-list）：概览统计 + 卡片（清晰层级）+ 设计器主入口 + 更多菜单。
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

const stats = computed(() => ({
  total: all.value.length,
  published: all.value.filter((t) => t.status === '已发布').length,
  draft: all.value.filter((t) => t.status === '草稿').length,
  disabled: all.value.filter((t) => t.status === '已停用').length,
}));

const STATUS_TONE: Record<string, string> = { 已发布: 'success', 草稿: 'warning', 已停用: 'default' };
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
  <div class="ticket-types">
    <!-- 顶部：标题 + 概览统计 + 新建 -->
    <div class="head">
      <div class="head-l">
        <h2>工单类型管理</h2>
        <p>定义各应用下的工单类型，配置其表单字段、处理流程与渠道绑定</p>
      </div>
      <a-button type="primary" size="large" @click="createType"><template #icon><PlusOutlined /></template>新建工单类型</a-button>
    </div>

    <div class="stat-row">
      <div class="stat"><div class="stat-num">{{ stats.total }}</div><div class="stat-lbl">全部类型</div></div>
      <div class="stat"><div class="stat-num ok">{{ stats.published }}</div><div class="stat-lbl">已发布</div></div>
      <div class="stat"><div class="stat-num warn">{{ stats.draft }}</div><div class="stat-lbl">草稿</div></div>
      <div class="stat"><div class="stat-num muted">{{ stats.disabled }}</div><div class="stat-lbl">已停用</div></div>
    </div>

    <!-- 筛选条 -->
    <div class="toolbar">
      <a-segmented v-model:value="appFilter" :options="apps" />
      <div class="tb-right">
        <a-select v-model:value="statusFilter" style="width: 120px" :options="['全部', '已发布', '草稿', '已停用'].map((v) => ({ value: v, label: v }))" />
        <a-input-search v-model:value="keyword" placeholder="搜索类型名称 / 编码" style="width: 240px" allow-clear />
      </div>
    </div>

    <!-- 卡片网格 -->
    <div class="grid">
      <div v-for="t in list" :key="t.id" class="card" :class="{ off: t.status === '已停用' }">
        <!-- 头部：图标 + 名称/编码 + 状态 -->
        <div class="c-head">
          <span class="c-ic" :style="{ background: themeOf(t.id).color + '14', color: themeOf(t.id).color }">{{ themeOf(t.id).emoji }}</span>
          <div class="c-title">
            <div class="c-name">{{ t.name }}</div>
            <div class="c-code">{{ t.code }}</div>
          </div>
          <a-badge :status="STATUS_TONE[t.status] as any" :text="t.status" class="c-status" />
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
        </div>

        <!-- 渠道 -->
        <div class="c-channels">
          <a-tag v-for="c in t.channels" :key="c" class="ch">{{ c }}</a-tag>
        </div>

        <!-- 操作：主按钮 + 更多 -->
        <div class="c-foot">
          <a-button type="primary" block @click="openDesigner(t, 'form')"><template #icon><SettingOutlined /></template>进入设计器</a-button>
          <a-dropdown placement="bottomRight" trigger="click">
            <a-button class="more-btn"><MoreOutlined /></a-button>
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
    </div>
    <a-empty v-if="!list.length" description="无匹配的工单类型" style="margin-top: 60px" />
  </div>
</template>

<style scoped>
.ticket-types { padding: 20px 24px; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.head-l h2 { font-size: 18px; font-weight: 700; color: #111827; }
.head-l p { font-size: 13px; color: #6b7280; margin-top: 3px; }

.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; max-width: 640px; }
.stat { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 18px; }
.stat-num { font-size: 24px; font-weight: 700; color: #111827; line-height: 1.1; }
.stat-num.ok { color: #10b981; } .stat-num.warn { color: #f59e0b; } .stat-num.muted { color: #9ca3af; }
.stat-lbl { font-size: 12px; color: #6b7280; margin-top: 4px; }

.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.tb-right { display: flex; gap: 12px; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; transition: all 0.15s; }
.card:hover { border-color: #c7d2fe; box-shadow: 0 6px 20px rgba(26,111,255,0.08); }
.card.off { opacity: 0.62; }

.c-head { display: flex; align-items: center; gap: 12px; }
.c-ic { width: 44px; height: 44px; flex: none; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
.c-title { flex: 1; min-width: 0; }
.c-name { font-size: 16px; font-weight: 700; color: #111827; }
.c-code { font-size: 12px; color: #9ca3af; font-family: ui-monospace, monospace; margin-top: 2px; }
.c-status { flex: none; font-size: 12px; }

.c-keyinfo { display: flex; gap: 22px; margin: 16px 0 4px; padding: 12px 14px; background: #f9fafb; border-radius: 9px; }
.ki { display: flex; flex-direction: column; gap: 3px; font-size: 13px; color: #374151; }
.ki i { font-style: normal; font-size: 11px; color: #9ca3af; }
.ki b { font-weight: 700; }

.c-metrics { display: flex; gap: 10px; margin: 14px 0; }
.metric { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 6px; border: 1px solid #f0f0f0; border-radius: 9px; }
.metric b { font-size: 18px; font-weight: 700; color: #111827; }
.metric span { font-size: 11px; color: #9ca3af; }

.c-channels { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; min-height: 24px; }
.ch { background: #f3f4f6; border: none; color: #4b5563; margin: 0; }

.c-foot { display: flex; gap: 8px; }
.c-foot .ant-btn-block { flex: 1; }
.more-btn { width: 36px; flex: none; padding: 0; display: flex; align-items: center; justify-content: center; }
</style>
