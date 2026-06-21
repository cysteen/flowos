<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  FileAddOutlined,
  CarOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  CheckOutlined,
  SearchOutlined,
  EyeOutlined,
} from '@ant-design/icons-vue';
import AppPagination from '@/components/AppPagination.vue';
import {
  AFTERSALE_KPIS,
  AFTERSALE_ORDERS,
  AFTERSALE_TABS,
  type AftersaleTabKey,
} from '@/mock/aftersaleWorkbench';

const KPI_ICONS = [
  FileAddOutlined,
  CarOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  CheckOutlined,
];

const activeTab = ref<AftersaleTabKey>('outlet');
const current = ref(1);
const pageSize = ref(10);

const filters = reactive({
  org: undefined as string | undefined,
  customer: '',
  phone: '',
  serviceType: undefined as string | undefined,
  dateRange: '',
});

const tabLabel = computed(() => AFTERSALE_TABS.find((t) => t.key === activeTab.value)?.label ?? '');

const filtered = computed(() => {
  return AFTERSALE_ORDERS.filter((o) => o.tab === activeTab.value).filter((o) => {
    if (filters.customer && !o.customer.includes(filters.customer)) return false;
    if (filters.phone && !o.phone.includes(filters.phone)) return false;
    if (filters.serviceType && o.serviceType !== filters.serviceType) return false;
    return true;
  });
});

const total = computed(() => filtered.value.length);
const paged = computed(() => {
  const start = (current.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});

function setTab(key: AftersaleTabKey) {
  activeTab.value = key;
  current.value = 1;
}

function onSearch() {
  current.value = 1;
  message.success('已查询');
}

function onReset() {
  filters.org = undefined;
  filters.customer = '';
  filters.phone = '';
  filters.serviceType = undefined;
  filters.dateRange = '';
  current.value = 1;
}

function onKpiClick(label: string) {
  message.info(`筛选「${label}」`);
}

function onView(no: string) {
  message.info(`${no} → 售后单处理页`);
}

function setPage(page: number, size: number) {
  current.value = page;
  pageSize.value = size;
}
</script>

<template>
  <div class="aftersale-workbench">
    <!-- Tabs 全宽贴顶 -->
    <div class="workbench-tabs">
      <div class="as-tabs">
        <div
          v-for="tab in AFTERSALE_TABS"
          :key="tab.key"
          class="as-tab"
          :class="{ active: tab.key === activeTab }"
          @click="setTab(tab.key)"
        >
          {{ tab.label }}
        </div>
      </div>
    </div>

    <div class="workbench-body">
      <!-- 7 KPI 看板 -->
      <div class="kpi-row">
        <div
          v-for="(kpi, idx) in AFTERSALE_KPIS"
          :key="kpi.key"
          class="kpi-card"
          @click="onKpiClick(kpi.label)"
        >
          <div class="kpi-top">
            <div>
              <div class="kpi-label">{{ kpi.label }}</div>
              <div class="kpi-value">{{ kpi.value }}</div>
            </div>
            <div class="kpi-icon" :style="{ background: kpi.iconBg, color: kpi.iconColor }">
              <component :is="KPI_ICONS[idx]" :style="{ fontSize: '18px' }" />
            </div>
          </div>
          <div class="kpi-delta">{{ kpi.delta }}</div>
        </div>
      </div>

      <!-- 筛选区 -->
      <div class="filter-card">
        <div class="filter-fields">
          <div class="field">
            <label>服务机构</label>
            <a-select
              v-model:value="filters.org"
              allow-clear
              placeholder="请选择服务机构"
              class="full"
              :options="['华东服务中心', '华北服务中心', '华南服务中心'].map((v) => ({ value: v, label: v }))"
            />
          </div>
          <div class="field">
            <label>客户名称</label>
            <a-input v-model:value="filters.customer" placeholder="请输入客户名称" />
          </div>
          <div class="field">
            <label>联系电话</label>
            <a-input v-model:value="filters.phone" placeholder="请输入联系电话" />
          </div>
          <div class="field">
            <label>服务类型</label>
            <a-select
              v-model:value="filters.serviceType"
              allow-clear
              placeholder="请选择服务类型"
              class="full"
              :options="['退货', '维修', '安装', '换货'].map((v) => ({ value: v, label: v }))"
            />
          </div>
          <div class="field">
            <label>创建时间</label>
            <a-input v-model:value="filters.dateRange" placeholder="开始 - 结束" />
          </div>
        </div>
        <div class="filter-actions">
          <button type="button" class="btn-search" @click="onSearch">
            <SearchOutlined />
            搜索
          </button>
          <button type="button" class="btn-reset" @click="onReset">重置</button>
        </div>
      </div>

      <!-- 列表 -->
      <div class="table-card">
        <div class="table-toolbar">
          {{ tabLabel }} · 共 {{ total }} 条
        </div>
        <div class="table-wrap">
          <div class="table-head">
            <div class="col-no">工单号</div>
            <div class="col-customer">客户</div>
            <div class="col-phone">电话</div>
            <div class="col-type">服务类型</div>
            <div class="col-product">产品</div>
            <div class="col-addr">地址</div>
            <div class="col-status">状态</div>
            <div class="col-time">创建时间</div>
            <div class="col-action">操作</div>
          </div>
          <div v-for="row in paged" :key="row.id" class="table-row">
            <div class="col-no">
              <span class="link" @click="onView(row.no)">{{ row.no }}</span>
            </div>
            <div class="col-customer">{{ row.customer }}</div>
            <div class="col-phone">{{ row.phone }}</div>
            <div class="col-type">{{ row.serviceType }}</div>
            <div class="col-product">{{ row.product }}</div>
            <div class="col-addr" :title="row.address">{{ row.address }}</div>
            <div class="col-status">
              <span class="status-badge" :style="{ color: row.statusColor, background: row.statusBg }">
                {{ row.status }}
              </span>
            </div>
            <div class="col-time">{{ row.createdAt }}</div>
            <div class="col-action">
              <EyeOutlined class="action-icon" @click="onView(row.no)" />
            </div>
          </div>
          <div v-if="paged.length === 0" class="empty">暂无数据</div>
        </div>
        <div class="pager">
          <AppPagination
            :total="total"
            :current="current"
            :page-size="pageSize"
            :show-total="false"
            @change="setPage"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.aftersale-workbench {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  width: 100%;
  min-width: 0;
}
.workbench-tabs {
  flex: none;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.as-tabs {
  display: flex;
  gap: 4px;
  padding: 0 16px;
}
.as-tab {
  padding: 12px 16px;
  font-size: 14px;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.as-tab.active {
  color: #1a6fff;
  font-weight: 600;
  border-bottom-color: #1a6fff;
}

.workbench-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  flex: 1;
  min-height: 0;
  background: #f9fafb;
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 14px;
}
.kpi-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 104px;
}
.kpi-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.kpi-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}
.kpi-value {
  font-size: 26px;
  font-weight: 700;
  color: #111827;
  line-height: 1;
}
.kpi-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.kpi-delta {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 8px;
}

.filter-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.filter-fields {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.field label {
  font-size: 12px;
  color: #6b7280;
}
.full {
  width: 100%;
}
.filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn-search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
  color: #fff;
  background: #1a6fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.btn-reset {
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  cursor: pointer;
}

.table-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
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
  flex: 1;
}
.table-head,
.table-row {
  display: grid;
  grid-template-columns: minmax(140px, 1.2fr) 72px 130px 96px minmax(100px, 1fr) 220px 96px 130px 60px;
  align-items: center;
  min-width: 960px;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table-row {
  font-size: 12px;
  color: #374151;
  border-bottom: 1px solid #e5e7eb;
}
.table-row:hover {
  background: #fafbff;
}
.col-no .link {
  color: #1a6fff;
  cursor: pointer;
}
.status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 3px;
}
.action-icon {
  color: #1a6fff;
  font-size: 16px;
  cursor: pointer;
}
.empty {
  padding: 48px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
.pager {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
}

@media (max-width: 1400px) {
  .kpi-row {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 1024px) {
  .kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .filter-fields {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
