<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { RightOutlined } from '@ant-design/icons-vue';
import {
  TENANT_INFO, KPIS, TREND, TODOS, QUICK_CONFIG, SYSTEM_STATUS, ANNOUNCEMENTS,
} from '@/mock/adminOverview';
import { moduleCardsFor } from '@/config/adminNav';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const user = useUserStore();
// 按当前管理角色（租户/运营）显示对应模块网格
const moduleCards = computed(() => moduleCardsFor(user.role.adminScope));
const trendMax = computed(() => Math.max(...TREND.flatMap((d) => [d.created, d.resolved])));
const seatPct = Math.round((TENANT_INFO.seatUsed / TENANT_INFO.seatTotal) * 100);
const storagePct = Math.round((TENANT_INFO.storageUsed / TENANT_INFO.storageTotal) * 100);

const TODO_COLOR: Record<string, string> = { warn: '#F59E0B', danger: '#EF4444', info: '#1A6FFF' };
const HEALTH_COLOR: Record<string, string> = { 正常: '#10B981', 降级: '#F59E0B', 异常: '#EF4444' };

function go(key: string) {
  router.push(`/admin/${key}`);
}
function goPath(path: string) {
  router.push(path);
}
</script>

<template>
  <div class="overview">
    <!-- ① 租户信息条 -->
    <div class="tenant-bar">
      <div class="tb-left">
        <div class="tb-logo">iF</div>
        <div class="tb-info">
          <div class="tb-name-row">
            <span class="tb-name">{{ TENANT_INFO.name }}</span>
            <span class="tb-plan">{{ TENANT_INFO.plan }}</span>
            <span class="tb-status">● {{ TENANT_INFO.status }}</span>
          </div>
          <div class="tb-sub">有效期至 {{ TENANT_INFO.expiry }}</div>
        </div>
      </div>
      <div class="tb-usage">
        <div class="usage">
          <div class="usage-top"><span>坐席配额</span><span>{{ TENANT_INFO.seatUsed }}/{{ TENANT_INFO.seatTotal }}</span></div>
          <div class="usage-track"><div class="usage-fill" :style="{ width: seatPct + '%' }"></div></div>
        </div>
        <div class="usage">
          <div class="usage-top"><span>存储用量</span><span>{{ TENANT_INFO.storageUsed }}G/{{ TENANT_INFO.storageTotal }}G</span></div>
          <div class="usage-track"><div class="usage-fill" :style="{ width: storagePct + '%' }"></div></div>
        </div>
      </div>
    </div>

    <!-- ② 运营 KPI -->
    <div class="kpi-row">
      <div v-for="k in KPIS" :key="k.label" class="kpi">
        <div class="kpi-label">{{ k.label }}</div>
        <div class="kpi-value">{{ k.value }}</div>
        <div class="kpi-delta" :style="{ color: k.good === 'down' ? '#EF4444' : '#10B981' }">{{ k.delta }}</div>
      </div>
    </div>

    <!-- ③ 两列 -->
    <div class="cols">
      <div class="col-main">
        <!-- 趋势 -->
        <div class="card">
          <div class="card-head">
            <span class="card-title">工单量趋势 · 近 14 天</span>
            <div class="legend">
              <span class="lg"><i style="background:#1A6FFF"></i>新增</span>
              <span class="lg"><i style="background:#10B981"></i>解决</span>
            </div>
          </div>
          <div class="chart">
            <div v-for="d in TREND" :key="d.day" class="bar-group">
              <div class="bars">
                <div class="bar" :style="{ height: (d.created / trendMax * 100) + '%', background: '#1A6FFF' }" :title="`新增 ${d.created}`"></div>
                <div class="bar" :style="{ height: (d.resolved / trendMax * 100) + '%', background: '#10B981' }" :title="`解决 ${d.resolved}`"></div>
              </div>
              <span class="bar-label">{{ d.day.slice(3) }}</span>
            </div>
          </div>
        </div>

        <!-- 管理待办 -->
        <div class="card">
          <div class="card-head"><span class="card-title">管理待办</span></div>
          <div class="todo-list">
            <div v-for="t in TODOS" :key="t.text" class="todo">
              <span class="todo-type" :style="{ color: TODO_COLOR[t.tone], background: TODO_COLOR[t.tone] + '1F' }">{{ t.type }}</span>
              <span class="todo-text">{{ t.text }}</span>
              <span class="todo-count">{{ t.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="col-side">
        <!-- 快捷配置 -->
        <div class="card">
          <div class="card-head"><span class="card-title">快捷配置</span></div>
          <div class="quick-grid">
            <div v-for="q in QUICK_CONFIG" :key="q.key" class="quick" @click="go(q.key)">{{ q.label }}</div>
          </div>
        </div>
        <!-- 系统状态 -->
        <div class="card">
          <div class="card-head"><span class="card-title">系统状态</span></div>
          <div v-for="s in SYSTEM_STATUS" :key="s.name" class="health">
            <span>{{ s.name }}</span>
            <span class="health-dot" :style="{ color: HEALTH_COLOR[s.status] }">● {{ s.status }}</span>
          </div>
        </div>
        <!-- 平台公告 -->
        <div class="card">
          <div class="card-head"><span class="card-title">平台公告</span></div>
          <div v-for="a in ANNOUNCEMENTS" :key="a.title" class="ann">
            <span class="ann-title">{{ a.title }}</span>
            <span class="ann-time">{{ a.time }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ④ 全部配置模块 -->
    <div class="card">
      <div class="card-head"><span class="card-title">全部配置模块</span></div>
      <div class="module-grid">
        <div v-for="m in moduleCards" :key="m.key" class="module" @click="goPath(m.firstPath)">
          <div class="module-top">
            <span class="module-icon"><component :is="m.icon" /></span>
            <span class="module-name">{{ m.label }}</span>
            <RightOutlined :style="{ color: '#D1D5DB', fontSize: '12px' }" />
          </div>
          <div class="module-desc">{{ m.desc }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overview { display: flex; flex-direction: column; gap: 16px; padding: 20px 24px; }

.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }
.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.card-title { font-size: 14px; font-weight: 700; color: #111827; }

/* 租户条 */
.tenant-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: linear-gradient(90deg, #1a6fff, #3b82f6);
  border-radius: 12px; padding: 18px 24px; color: #fff;
}
.tb-left { display: flex; align-items: center; gap: 14px; }
.tb-logo { width: 44px; height: 44px; border-radius: 10px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; }
.tb-name-row { display: flex; align-items: center; gap: 10px; }
.tb-name { font-size: 17px; font-weight: 700; }
.tb-plan { font-size: 11px; background: #fde68a; color: #92400e; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
.tb-status { font-size: 12px; color: #bbf7d0; }
.tb-sub { font-size: 12px; color: rgba(255,255,255,0.8); margin-top: 4px; }
.tb-usage { display: flex; align-items: center; gap: 20px; }
.usage { width: 150px; }
.usage-top { display: flex; justify-content: space-between; font-size: 12px; color: rgba(255,255,255,0.9); margin-bottom: 4px; }
.usage-track { height: 5px; background: rgba(255,255,255,0.25); border-radius: 3px; overflow: hidden; }
.usage-fill { height: 100%; background: #fff; }

/* KPI */
.kpi-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
.kpi { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }
.kpi-label { font-size: 12px; color: #6b7280; }
.kpi-value { font-size: 24px; font-weight: 700; color: #111827; margin: 6px 0 4px; }
.kpi-delta { font-size: 12px; }

/* 两列 */
.cols { display: flex; gap: 16px; align-items: flex-start; }
.col-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.col-side { width: 320px; flex: none; display: flex; flex-direction: column; gap: 16px; }

/* 趋势图 */
.legend { display: flex; gap: 14px; }
.lg { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #6b7280; }
.lg i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.chart { display: flex; align-items: flex-end; gap: 8px; height: 180px; padding-top: 8px; }
.bar-group { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.bars { flex: 1; display: flex; align-items: flex-end; gap: 3px; width: 100%; justify-content: center; }
.bar { width: 9px; border-radius: 2px 2px 0 0; }
.bar-label { font-size: 10px; color: #9ca3af; margin-top: 6px; }

/* 待办 */
.todo-list { display: flex; flex-direction: column; gap: 10px; }
.todo { display: flex; align-items: center; gap: 10px; }
.todo-type { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; flex: none; }
.todo-text { flex: 1; font-size: 13px; color: #374151; }
.todo-count { font-size: 13px; font-weight: 600; color: #6b7280; }

/* 快捷配置 */
.quick-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.quick { background: #f9fafb; border: 1px solid #f0f0f0; border-radius: 6px; padding: 10px; text-align: center; font-size: 13px; color: #374151; cursor: pointer; }
.quick:hover { border-color: #1a6fff; color: #1a6fff; }

/* 系统状态 / 公告 */
.health, .ann { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; font-size: 13px; color: #374151; border-bottom: 1px solid #f5f5f5; }
.health:last-child, .ann:last-child { border-bottom: none; }
.health-dot { font-size: 12px; }
.ann-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ann-time { font-size: 12px; color: #9ca3af; margin-left: 8px; }

/* 模块网格 */
.module-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.module { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; cursor: pointer; }
.module:hover { border-color: #1a6fff; box-shadow: 0 2px 8px rgba(26,111,255,0.08); }
.module-top { display: flex; align-items: center; gap: 8px; }
.module-icon { color: #1a6fff; font-size: 16px; }
.module-name { flex: 1; font-size: 14px; font-weight: 600; color: #111827; }
.module-desc { margin-top: 8px; font-size: 12px; color: #9ca3af; line-height: 1.6; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

@media (max-width: 1200px) {
  .kpi-row { grid-template-columns: repeat(3, 1fr); }
  .module-grid { grid-template-columns: repeat(2, 1fr); }
  .cols { flex-direction: column; }
  .col-side { width: 100%; }
}
@media (max-width: 900px) {
  .tenant-bar { flex-direction: column; align-items: flex-start; gap: 16px; }
  .tb-usage { flex-wrap: wrap; width: 100%; }
}
</style>
