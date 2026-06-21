<script setup lang="ts">
import { ref, computed } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons-vue';

// 平台门禁（系统管理员）：套餐管理 + 菜单门禁矩阵 + 租户授权。
const tab = ref('plans');

/* 套餐 */
interface Plan { key: string; name: string; price: string; seats: string; orders: string; api: string; storage: string; tenants: number; color: string; }
const plans = ref<Plan[]>([
  { key: 'basic', name: '基础版', price: '¥0', seats: '≤10', orders: '1,000/月', api: '1万/日', storage: '10 GB', tenants: 8, color: '#9ca3af' },
  { key: 'pro', name: '专业版', price: '¥1,980/月', seats: '≤50', orders: '2万/月', api: '10万/日', storage: '100 GB', tenants: 14, color: '#1a6fff' },
  { key: 'flagship', name: '旗舰版', price: '¥6,800/月', seats: '不限', orders: '不限', api: '100万/日', storage: '1 TB', tenants: 5, color: '#7c3aed' },
]);

/* 菜单门禁矩阵 */
const MENUS = [
  { key: 'tickets', label: '工单工作台' },
  { key: 'aftersale', label: '售后工作台' },
  { key: 'sla', label: 'SLA 与规则' },
  { key: 'templates', label: '模板库设计器' },
  { key: 'workflow', label: '工作流引擎' },
  { key: 'connectors', label: '集成对接' },
  { key: 'bpm', label: 'BPM 审批中心' },
  { key: 'analytics', label: '高级分析报表' },
];
// matrix[menuKey][planKey] = boolean
const matrix = ref<Record<string, Record<string, boolean>>>({
  tickets: { basic: true, pro: true, flagship: true },
  aftersale: { basic: true, pro: true, flagship: true },
  sla: { basic: false, pro: true, flagship: true },
  templates: { basic: false, pro: true, flagship: true },
  workflow: { basic: false, pro: true, flagship: true },
  connectors: { basic: false, pro: false, flagship: true },
  bpm: { basic: false, pro: true, flagship: true },
  analytics: { basic: false, pro: false, flagship: true },
});
function toggle(menu: string, plan: string) { matrix.value[menu][plan] = !matrix.value[menu][plan]; }

/* 租户授权 */
const grants = ref([
  { tenant: '讯飞科技', plan: 'flagship', expire: '2027-01-01', overrides: '+ 高级分析', status: '生效' },
  { tenant: '智学网络', plan: 'pro', expire: '2026-09-30', overrides: '—', status: '生效' },
  { tenant: '云听科技', plan: 'pro', expire: '2026-08-15', overrides: '+ 集成对接', status: '生效' },
  { tenant: '小语种教育', plan: 'basic', expire: '—', overrides: '—', status: '生效' },
  { tenant: '测试租户', plan: 'basic', expire: '2026-07-01', overrides: '—', status: '已过期' },
]);
const planName = (k: string) => plans.value.find((p) => p.key === k)?.name ?? k;
const planColor = (k: string) => plans.value.find((p) => p.key === k)?.color ?? '#9ca3af';
const grantCols = [
  { title: '租户', dataIndex: 'tenant', key: 'tenant', width: 160 },
  { title: '套餐', dataIndex: 'plan', key: 'plan', width: 120 },
  { title: '到期', dataIndex: 'expire', key: 'expire', width: 130 },
  { title: '功能覆写', dataIndex: 'overrides', key: 'overrides' },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '操作', key: 'op', width: 110 },
];
function todo(t: string) { message.info(`「${t}」（演示）`); }
function save() { message.success('门禁配置已保存'); }
</script>

<template>
  <div class="plat-access">
    <div class="page-head"><h2>平台门禁</h2><p>套餐能力包、菜单门禁与租户授权（控制各租户可见的功能范围）</p></div>
    <a-tabs v-model:activeKey="tab">
      <!-- 套餐管理 -->
      <a-tab-pane key="plans" tab="套餐管理">
        <div class="bar"><span class="tip">能力包定义 · 共 {{ plans.length }} 个套餐</span><a-button type="primary" @click="todo('新建套餐')"><template #icon><PlusOutlined /></template>新建套餐</a-button></div>
        <div class="plan-grid">
          <div v-for="p in plans" :key="p.key" class="plan-card" :style="{ borderTopColor: p.color }">
            <div class="pc-name" :style="{ color: p.color }">{{ p.name }}</div>
            <div class="pc-price">{{ p.price }}</div>
            <ul class="pc-feats">
              <li><label>坐席数</label>{{ p.seats }}</li>
              <li><label>工单量</label>{{ p.orders }}</li>
              <li><label>API</label>{{ p.api }}</li>
              <li><label>存储</label>{{ p.storage }}</li>
            </ul>
            <div class="pc-foot"><a-badge :count="p.tenants" :number-style="{ backgroundColor: p.color }" /> 个租户在用</div>
            <a-button size="small" block @click="todo('编辑套餐')">编辑</a-button>
          </div>
        </div>
      </a-tab-pane>

      <!-- 菜单门禁 -->
      <a-tab-pane key="menu" tab="菜单门禁">
        <div class="bar"><span class="tip">勾选每个套餐解锁的功能菜单，租户授权后按此生效</span><a-button type="primary" @click="save">保存矩阵</a-button></div>
        <div class="matrix-card">
          <table class="matrix">
            <thead>
              <tr><th class="mh-menu">功能菜单</th><th v-for="p in plans" :key="p.key" :style="{ color: p.color }">{{ p.name }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="m in MENUS" :key="m.key">
                <td class="mc-menu">{{ m.label }}</td>
                <td v-for="p in plans" :key="p.key" class="mc-cell" @click="toggle(m.key, p.key)">
                  <span class="chk" :class="{ on: matrix[m.key][p.key] }"><component :is="matrix[m.key][p.key] ? CheckOutlined : CloseOutlined" /></span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </a-tab-pane>

      <!-- 租户授权 -->
      <a-tab-pane key="grants" tab="租户授权">
        <div class="bar"><span class="tip">为各租户分配套餐与功能覆写</span><a-button type="primary" @click="todo('新增授权')"><template #icon><PlusOutlined /></template>新增授权</a-button></div>
        <a-table :columns="grantCols" :data-source="grants" row-key="tenant" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <a-tag v-if="column.key === 'plan'" :color="planColor(record.plan)" style="color:#fff;border:none">{{ planName(record.plan) }}</a-tag>
            <a-tag v-else-if="column.key === 'status'" :color="record.status === '生效' ? 'green' : 'red'">{{ record.status }}</a-tag>
            <template v-else-if="column.key === 'op'">
              <a-button type="link" size="small" @click="todo('调整套餐')">调整</a-button>
              <a-button type="link" size="small" @click="todo('功能覆写')">覆写</a-button>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<style scoped>
.plat-access { padding: 20px 24px; }
.page-head h2 { font-size: 18px; font-weight: 700; color: #111827; }
.page-head p { font-size: 13px; color: #6b7280; margin: 2px 0 12px; }
.bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.tip { font-size: 13px; color: #6b7280; }
.plan-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; max-width: 900px; }
.plan-card { background: #fff; border: 1px solid #e5e7eb; border-top: 3px solid; border-radius: 10px; padding: 18px; }
.pc-name { font-size: 16px; font-weight: 700; }
.pc-price { font-size: 22px; font-weight: 700; color: #111827; margin: 6px 0 14px; }
.pc-feats { list-style: none; padding: 0; margin: 0 0 14px; }
.pc-feats li { display: flex; justify-content: space-between; font-size: 13px; color: #374151; padding: 6px 0; border-bottom: 1px dashed #f0f0f0; }
.pc-feats label { color: #9ca3af; }
.pc-foot { font-size: 12px; color: #6b7280; margin-bottom: 12px; }
.matrix-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px; overflow-x: auto; max-width: 760px; }
.matrix { width: 100%; border-collapse: collapse; }
.matrix th, .matrix td { padding: 12px 16px; text-align: center; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
.matrix th { font-weight: 600; background: #f9fafb; }
.mh-menu, .mc-menu { text-align: left !important; }
.mc-menu { font-weight: 500; color: #374151; }
.mc-cell { cursor: pointer; }
.chk { display: inline-flex; width: 24px; height: 24px; border-radius: 6px; align-items: center; justify-content: center; background: #f3f4f6; color: #d1d5db; }
.chk.on { background: #dcfce7; color: #16a34a; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
