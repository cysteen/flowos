<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  InboxOutlined,
  Loading3QuartersOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  FieldTimeOutlined,
  CarOutlined,
  EnvironmentOutlined,
  ExportOutlined,
  DownOutlined,
} from '@ant-design/icons-vue';
import { useUserStore } from '@/stores/user';
import {
  AS_KPIS,
  AS_MEMBERS,
  CS_KPIS,
  CS_MEMBERS,
  STATUS_STYLE,
  TEAM_OPTIONS,
  type TeamBoardDim,
  type TeamKpi,
} from '@/mock/teamBoard';

const router = useRouter();
const user = useUserStore();

const CS_ICONS = [InboxOutlined, Loading3QuartersOutlined, CheckCircleOutlined, ClockCircleOutlined, DashboardOutlined, FieldTimeOutlined];
const AS_ICONS = [InboxOutlined, EnvironmentOutlined, ClockCircleOutlined, CheckCircleOutlined, DashboardOutlined, CarOutlined];

function defaultDim(): TeamBoardDim {
  const menus = user.visibleMenus;
  if (menus.includes('aftersale') && !menus.includes('tickets')) return 'as';
  return 'cs';
}

const dimension = ref<TeamBoardDim>(defaultDim());
const team = ref(TEAM_OPTIONS[0]);

watch(
  () => user.roleKey,
  () => {
    dimension.value = defaultDim();
  },
);

const kpis = computed(() => (dimension.value === 'cs' ? CS_KPIS : AS_KPIS));
const kpiIcons = computed(() => (dimension.value === 'cs' ? CS_ICONS : AS_ICONS));
const members = computed(() => (dimension.value === 'cs' ? CS_MEMBERS : AS_MEMBERS));

function setDim(dim: TeamBoardDim) {
  dimension.value = dim;
}

function onKpiClick(kpi: TeamKpi) {
  message.info(`下钻「${kpi.label}」风险列表`);
}

function onExport() {
  message.info('导出组绩效 / SLA 报表');
}

function onViewMember(name: string) {
  message.info(`查看 ${name} 的工单明细`);
  router.push('/tickets/list');
}
</script>

<template>
  <div class="team-board">
    <!-- Headbar -->
    <div class="headbar">
      <div class="headbar-left">
        <a-dropdown>
          <div class="team-select">
            <span>班组：{{ team }}</span>
            <DownOutlined class="chev" />
          </div>
          <template #overlay>
            <a-menu @click="({ key }) => (team = String(key))">
              <a-menu-item v-for="t in TEAM_OPTIONS" :key="t">{{ t }}</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
        <div class="dim-toggle">
          <div
            class="dim-seg"
            :class="{ active: dimension === 'cs' }"
            @click="setDim('cs')"
          >
            客服维度
          </div>
          <div
            class="dim-seg"
            :class="{ active: dimension === 'as' }"
            @click="setDim('as')"
          >
            售后维度
          </div>
        </div>
      </div>
      <button type="button" class="btn-export" @click="onExport">
        <ExportOutlined />
        导出报表
      </button>
    </div>

    <!-- KPI 看板 -->
    <div class="kpi-row">
      <div
        v-for="(kpi, idx) in kpis"
        :key="kpi.key"
        class="kpi-card"
        @click="onKpiClick(kpi)"
      >
        <div class="kpi-left">
          <div class="kpi-label">{{ kpi.label }}</div>
          <div class="kpi-value">{{ kpi.value }}</div>
        </div>
        <div class="kpi-icon" :style="{ background: kpi.iconBg, color: kpi.iconColor }">
          <component :is="kpiIcons[idx]" :style="{ fontSize: '19px' }" />
        </div>
      </div>
    </div>

    <!-- 成员 SLA 跟进表 -->
    <div class="table-card">
      <div class="table-toolbar">班组成员工单与 SLA 跟进</div>
      <div class="table-wrap">
        <div class="table-head">
          <div class="col-name">坐席成员</div>
          <div class="col-num">在处理</div>
          <template v-if="dimension === 'cs'">
            <div class="col-num">今日已解决</div>
            <div class="col-num">超时</div>
            <div class="col-rate">SLA 达成率</div>
            <div class="col-rate">平均解决</div>
          </template>
          <template v-else>
            <div class="col-rate">上门及时率</div>
            <div class="col-rate">结单及时率</div>
            <div class="col-num">超时</div>
            <div class="col-rate">SLA 达成率</div>
          </template>
          <div class="col-status">状态</div>
          <div class="col-action">操作</div>
        </div>
        <div v-for="row in members" :key="row.id" class="table-row">
          <div class="col-name">{{ row.name }}</div>
          <div class="col-num">{{ row.inProgress }}</div>
          <template v-if="dimension === 'cs'">
            <div class="col-num">{{ row.resolvedToday }}</div>
            <div class="col-num" :class="{ danger: row.overdue > 0 }">{{ row.overdue }}</div>
            <div class="col-rate">{{ row.slaRate }}</div>
            <div class="col-rate">{{ row.avgResolve }}</div>
          </template>
          <template v-else>
            <div class="col-rate">{{ row.onsiteRate }}</div>
            <div class="col-rate">{{ row.closeRate }}</div>
            <div class="col-num" :class="{ danger: row.overdue > 0 }">{{ row.overdue }}</div>
            <div class="col-rate">{{ row.slaRate }}</div>
          </template>
          <div class="col-status">
            <span
              class="status-badge"
              :style="{ color: STATUS_STYLE[row.status].color, background: STATUS_STYLE[row.status].bg }"
            >
              {{ row.status }}
            </span>
          </div>
          <div class="col-action">
            <a class="action-link" @click="onViewMember(row.name)">查看工单</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.team-board {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
  width: 100%;
  min-width: 0;
  padding: 24px;
}

.headbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.headbar-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.team-select {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
}
.chev {
  font-size: 12px;
  color: #9ca3af;
}
.dim-toggle {
  display: flex;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 2px;
  height: 34px;
}
.dim-seg {
  display: flex;
  align-items: center;
  padding: 0 14px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  border-radius: 4px;
}
.dim-seg.active {
  background: #1a6fff;
  color: #fff;
  font-weight: 600;
}
.btn-export {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
}
.btn-export:hover {
  border-color: #1a6fff;
  color: #1a6fff;
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 14px;
  height: 100px;
}
.kpi-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
}
.kpi-card:hover {
  border-color: #bfdbfe;
}
.kpi-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}
.kpi-value {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  line-height: 1;
}
.kpi-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.table-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.table-toolbar {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  border-bottom: 1px solid #e5e7eb;
}
.table-wrap {
  overflow: auto;
}
.table-head,
.table-row {
  display: grid;
  grid-template-columns: 1.2fr repeat(5, 1fr) 96px 88px;
  align-items: center;
  min-width: 880px;
}
.table-head {
  background: #f3f4f6;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}
.table-head > div,
.table-row > div {
  padding: 10px 12px;
}
.table-row {
  font-size: 12px;
  color: #374151;
  border-bottom: 1px solid #e5e7eb;
}
.table-row:hover {
  background: #fafbff;
}
.col-num.danger {
  color: #ef4444;
  font-weight: 600;
}
.status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 3px;
}
.action-link {
  color: #1a6fff;
  cursor: pointer;
}
.action-link:hover {
  text-decoration: underline;
}

@media (max-width: 1280px) {
  .kpi-row {
    grid-template-columns: repeat(3, 1fr);
    height: auto;
  }
  .kpi-card {
    min-height: 100px;
  }
}
@media (max-width: 768px) {
  .headbar {
    flex-direction: column;
    align-items: stretch;
  }
  .headbar-left {
    flex-wrap: wrap;
  }
  .kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
