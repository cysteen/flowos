<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PlusOutlined } from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { adminNavActiveKey } from '@/config/adminNav';
import DispatchMonitorPanel from './dispatch/DispatchMonitorPanel.vue';
import DispatchStrategyPanel from './dispatch/DispatchStrategyPanel.vue';
import PoolManagePanel from './dispatch/PoolManagePanel.vue';
import AgentProfilePanel from './dispatch/AgentProfilePanel.vue';
import DispatchLogPanel from './dispatch/DispatchLogPanel.vue';

// 【1215】智能分派五页（PRD 第 8 章）：分派监控、派单策略、工单池管理、坐席画像、派单日志；数据均取派单 store
const route = useRoute();
const router = useRouter();

const DISPATCH_PAGE_META: Record<string, { title: string; subtitle: string }> = {
  'dispatch-monitor': { title: '分派监控', subtitle: '派单效果、派单方式、池积压与处理人负载。' },
  'dispatch-strategy': { title: '派单策略', subtitle: '入池规则、出池规则、个人上限与指定人规则；保存即生效。' },
  'dispatch-pool': { title: '工单池管理', subtitle: '新建工单池并选择处理组；各池的派单方式、派单状态与成员画像配置，池内工单可指派。' },
  'dispatch-profile': { title: '坐席画像', subtitle: '坐席的人员画像、熟练度、个人上限与个人开关。' },
  'dispatch-log': { title: '派单日志', subtitle: '按工单查看每次派单结果、处理人与未派出原因；支持筛选与导出。' },
};
const routeKey = computed(() => adminNavActiveKey(route.path));
const pageKey = computed(() => (DISPATCH_PAGE_META[routeKey.value] ? routeKey.value : 'dispatch-monitor'));
const pageHeader = computed(() => DISPATCH_PAGE_META[pageKey.value]);

const strategyTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : 'inpool'),
  set: (v: string) => {
    if (route.query.tab === v) return;
    router.replace({ path: route.path, query: { ...route.query, tab: v } });
  },
});

/** 工单池管理页头「新建工单池」 */
const poolPanel = ref<InstanceType<typeof PoolManagePanel> | null>(null);
</script>

<template>
  <div class="dispatch-config" :class="{ 'is-compact-header': pageKey !== 'dispatch-monitor' }">
    <!-- 分派监控的页头带筛选，由面板自行渲染 -->
    <AdminPageHeader v-if="pageKey !== 'dispatch-monitor'" :title="pageHeader.title" :subtitle="pageHeader.subtitle">
      <template v-if="pageKey === 'dispatch-pool'" #actions>
        <a-button type="primary" @click="poolPanel?.openCreate()"><template #icon><PlusOutlined /></template>新建工单池</a-button>
      </template>
    </AdminPageHeader>
    <DispatchMonitorPanel v-if="pageKey === 'dispatch-monitor'" :title="pageHeader.title" :subtitle="pageHeader.subtitle" />
    <DispatchStrategyPanel v-else-if="pageKey === 'dispatch-strategy'" v-model:tab="strategyTab" />
    <PoolManagePanel v-else-if="pageKey === 'dispatch-pool'" ref="poolPanel" />
    <DispatchLogPanel v-else-if="pageKey === 'dispatch-log'" />
    <AgentProfilePanel v-else />
  </div>
</template>

<style scoped>
.dispatch-config { display: flex; flex-direction: column; gap: 8px; padding: 16px 24px; }
/* 分派监控外各子页：页头与正文紧挨（监控页头在面板内单独控距） */
.dispatch-config.is-compact-header { gap: 0; }
.dispatch-config.is-compact-header :deep(.admin-page-header) { margin-bottom: 12px; }
.dispatch-config.is-compact-header :deep(.admin-page-header .aph-sub) { max-width: 52em; line-height: 20px; }
</style>
