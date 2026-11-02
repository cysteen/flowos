<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { adminNavActiveKey } from '@/config/adminNav';
import DispatchMonitorPanel from './dispatch/DispatchMonitorPanel.vue';
import DispatchStrategyPanel from './dispatch/DispatchStrategyPanel.vue';
import PoolManagePanel from './dispatch/PoolManagePanel.vue';
import RoutingSummaryPanel from './dispatch/RoutingSummaryPanel.vue';
import AgentProfilePanel from './dispatch/AgentProfilePanel.vue';

// 【1215】智能分派五页（PRD 第 14 章）：分派监控、派单策略、工单池管理、路由规则、坐席画像；数据均取派单 store
const route = useRoute();
const router = useRouter();

const DISPATCH_PAGE_META: Record<string, { title: string; subtitle: string }> = {
  'dispatch-monitor': { title: '分派监控', subtitle: '派单效果、池形态、池积压与处理人负载；派单日志查询。' },
  'dispatch-strategy': { title: '派单策略', subtitle: '运行设置、入池规则、出池规则与个人上限；保存即生效。' },
  'dispatch-pool': { title: '工单池管理', subtitle: '各组池的形态、派单状态与成员画像配置，池内待领工单可指派。' },
  'dispatch-routing': { title: '路由规则', subtitle: '入池规则汇总。' },
  'dispatch-profile': { title: '坐席画像', subtitle: '坐席的人员画像、熟练度、个人上限与个人开关。' },
};
const routeKey = computed(() => adminNavActiveKey(route.path));
const pageKey = computed(() => (DISPATCH_PAGE_META[routeKey.value] ? routeKey.value : 'dispatch-monitor'));
const pageHeader = computed(() => DISPATCH_PAGE_META[pageKey.value]);

const strategyTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : 'run'),
  set: (v: string) => {
    if (route.query.tab === v) return;
    router.replace({ path: route.path, query: { ...route.query, tab: v, rule: undefined } });
  },
});
const focusRuleId = computed(() => (typeof route.query.rule === 'string' ? route.query.rule : undefined));
</script>

<template>
  <div class="dispatch-config">
    <!-- 分派监控的页头带筛选与派单日志入口，由面板自行渲染 -->
    <AdminPageHeader v-if="pageKey !== 'dispatch-monitor'" :title="pageHeader.title" :subtitle="pageHeader.subtitle" />
    <DispatchMonitorPanel v-if="pageKey === 'dispatch-monitor'" :title="pageHeader.title" :subtitle="pageHeader.subtitle" />
    <DispatchStrategyPanel v-else-if="pageKey === 'dispatch-strategy'" v-model:tab="strategyTab" :focus-rule-id="focusRuleId" />
    <PoolManagePanel v-else-if="pageKey === 'dispatch-pool'" />
    <RoutingSummaryPanel v-else-if="pageKey === 'dispatch-routing'" />
    <AgentProfilePanel v-else />
  </div>
</template>

<style scoped>
.dispatch-config { display: flex; flex-direction: column; padding: 16px 24px; }
</style>
