<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { PlusOutlined, DeleteOutlined, ExportOutlined, ImportOutlined } from '@ant-design/icons-vue';
import AdminSectionTabs from './components/AdminSectionTabs.vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { SLA_NAV_ITEMS, adminNavActiveKey } from '@/config/adminNav';

// SLA 引擎非策略子页（PRD-55/56/57）：双层计时 / 挂起规则 / 预警配置 / 升级链 / 达标统计 / 监控看板 / 工作日历。
const route = useRoute();
const activeKey = computed(() => adminNavActiveKey(route.path));

// 平台固定「双层 SLA（整单 + 节点并行）」，不提供计时模式开关（伪动作，已移除）。
// 节点级时限 = 轻量 OLA（P1），在 SLA 策略内配，不在此页。

// —— 挂起规则（参考 V1 A3#suspend：最长挂起防永久挂起 + 自动恢复条件 + 挂起审批）——
const suspendRows = ref([
  { reason: '等待客户反馈', pause: true, maxDuration: '72 小时', autoResume: '客户回复后自动恢复', needAudit: false },
  { reason: '等待备件到货', pause: true, maxDuration: '7 天', autoResume: '到货确认后恢复', needAudit: false },
  { reason: '等待第三方系统', pause: true, maxDuration: '48 小时', autoResume: '接口回调后恢复', needAudit: false },
  { reason: '等待产研修复', pause: true, maxDuration: '15 天', autoResume: '版本发布后恢复', needAudit: true },
  { reason: '客户要求暂缓', pause: true, maxDuration: '30 天', autoResume: '客户确认后恢复', needAudit: true },
]);
function addSuspend() { suspendRows.value.push({ reason: '新挂起原因', pause: true, maxDuration: '72 小时', autoResume: '条件满足后恢复', needAudit: false }); }
function delSuspend(reason: string) { suspendRows.value = suspendRows.value.filter((r) => r.reason !== reason); }

// —— 预警配置 ——
const alertRows = ref([
  { id: 1, dim: '响应', threshold: '剩余 ≤ 50%', channel: ['站内信'], target: '处理人' },
  { id: 2, dim: '响应', threshold: '剩余 ≤ 25%', channel: ['站内信', '短信'], target: '处理人 + 班组长' },
  { id: 3, dim: '解决', threshold: '已超时', channel: ['短信', '邮件'], target: '班组长' },
]);
const CHANNELS = ['站内信', '短信', '邮件', 'i讯飞'];
const TARGETS = ['处理人', '班组长', '处理人 + 班组长', '指定人'];
function addAlert() { alertRows.value.push({ id: Date.now(), dim: '响应', threshold: '剩余 ≤ 25%', channel: ['站内信'], target: '处理人' }); }
function delAlert(id: number) { alertRows.value = alertRows.value.filter((r) => r.id !== id); }

// —— 升级链 ——
const escChain = ref([
  { level: 'L1', trigger: '响应剩余 ≤ 25%', action: '通知处理人', ref: 'EC01', tone: 'info' },
  { level: 'L2', trigger: '响应已超时', action: '通知班组长 + 打升级标记', ref: 'EC01', tone: 'warn' },
  { level: 'L3', trigger: '解决已超时', action: '自动升级二线组 + 优先级 +1', ref: 'EC02', tone: 'danger' },
  { level: 'L4', trigger: '超时后每 30 分钟', action: '升级客服主管 + 飞书同步', ref: 'EC03', tone: 'danger' },
]);
function goEscRoute() { message.info('前往「规则中心 · 升级路由」（原型占位）'); }

// 监控看板（达标统计）已移出 SLA 配置：完整看板归运营看板/数据总览、班组看板（单一算法源）；
// SLA 策略列表页保留轻量达成概览。

// —— 工作日历 ——
const is724 = ref(false);
const workDays = ref([
  { day: '周一', on: true, time: '09:00 - 18:00' },
  { day: '周二', on: true, time: '09:00 - 18:00' },
  { day: '周三', on: true, time: '09:00 - 18:00' },
  { day: '周四', on: true, time: '09:00 - 18:00' },
  { day: '周五', on: true, time: '09:00 - 18:00' },
  { day: '周六', on: false, time: '—' },
  { day: '周日', on: false, time: '—' },
]);
// 节假日按年维护：名称固定，日期/调休逐年不同；可一键导入国务院当年安排。
const holidayYear = ref('2026');
const HOLIDAY_YEARS = ['2026', '2027', '2028'];
const holidays = ref([
  { name: '元旦', range: '01-01 ~ 01-03', makeup: '—', count: false },
  { name: '春节', range: '02-16 ~ 02-22', makeup: '02-14, 02-28', count: false },
  { name: '清明节', range: '04-04 ~ 04-06', makeup: '—', count: false },
  { name: '劳动节', range: '05-01 ~ 05-05', makeup: '04-26, 05-09', count: false },
  { name: '端午节', range: '06-19 ~ 06-21', makeup: '—', count: false },
  { name: '中秋节', range: '09-25 ~ 09-27', makeup: '—', count: false },
  { name: '国庆节', range: '10-01 ~ 10-07', makeup: '09-27, 10-11', count: false },
]);
function importHolidays() { message.info(`已导入 ${holidayYear.value} 年国务院法定节假日及调休安排（演示）`); }
function addHoliday() { holidays.value.push({ name: '新假期', range: '', makeup: '—', count: false }); }
function delHoliday(name: string) { holidays.value = holidays.value.filter((h) => h.name !== name); }

// 配置短表列（spec §3：a-table size middle + :pagination=false）
const suspendCols = [
  { title: '挂起原因', dataIndex: 'reason', key: 'reason' },
  { title: '暂停计时', key: 'pause', width: 110 },
  { title: '最长挂起', dataIndex: 'maxDuration', key: 'maxDuration', width: 110 },
  { title: '自动恢复', dataIndex: 'autoResume', key: 'autoResume' },
  { title: '需审核', key: 'needAudit', width: 90 },
  { title: '操作', key: 'op', width: 90 },
];
const holidayCols = [
  { title: '节日', dataIndex: 'name', key: 'name', width: 120 },
  { title: '放假日期', dataIndex: 'range', key: 'range', width: 180 },
  { title: '调休补班日', dataIndex: 'makeup', key: 'makeup' },
  { title: '是否计时', key: 'count', width: 110 },
  { title: '操作', key: 'op', width: 90 },
];
const calCols = [
  { title: '星期', dataIndex: 'day', key: 'day', width: 120 },
  { title: '是否工作日', key: 'on', width: 130 },
  { title: '工作时段', key: 'time' },
];

function save() { message.success('已保存并生效'); }
</script>

<template>
  <div class="sla-engine">
    <AdminSectionTabs :items="SLA_NAV_ITEMS" :active-key="activeKey" />
    <div class="body">
      <!-- ===== 工作日历与停表（策略共用的计时基础） ===== -->
      <template v-if="activeKey === 'sla-timing'">
        <div class="panel">
          <AdminPageHeader title="工作日历与停表" subtitle="SLA 策略共用的计时基础：工作日历（何时计时）+ 挂起停表（何时暂停）。平台固定双层 SLA（整单 + 节点并行）。">
            <template #actions><a-button type="primary" @click="save">保存</a-button></template>
          </AdminPageHeader>

          <div class="sec-h">SLA 工作日历 <a-switch v-model:checked="is724" size="small" style="margin-left:6px" /><span class="muted" style="margin-left:6px">7×24 自然时间</span></div>
          <div class="intro">SLA 时限按工作时段推进，非工作时段（夜间/周末/节假日）不计入计时；勾选 7×24 则按自然时间。各策略在「策略 · 计时口径」中引用本日历。</div>
          <a-table :columns="calCols" :data-source="workDays" row-key="day" :pagination="false" size="middle" :class="{ 'tbl-disabled': is724 }">
            <template #bodyCell="{ column, record }">
              <a-switch v-if="column.key === 'on'" v-model:checked="record.on" size="small" :disabled="is724" />
              <span v-else-if="column.key === 'time'" class="muted">{{ record.on ? record.time : '—' }}</span>
            </template>
          </a-table>
          <div class="sec-h mt2">节假日 / 调休
            <span class="hd-actions">
              <span class="muted">年份</span>
              <a-select v-model:value="holidayYear" size="small" style="width:92px" :options="HOLIDAY_YEARS.map((y) => ({ value: y, label: y + ' 年' }))" />
              <a-button size="small" @click="importHolidays"><template #icon><ImportOutlined /></template>导入国务院安排</a-button>
              <a-button size="small" type="primary" @click="addHoliday"><template #icon><PlusOutlined /></template>新增假期</a-button>
            </span>
          </div>
          <div class="intro">节日名称固定，但每年日期 / 调休不同 → 按年维护或一键导入国务院当年安排。节假日休息 = 不计时；调休补班日 = 计时；若该日承诺值班可改为「计时」。</div>
          <a-table :columns="holidayCols" :data-source="holidays" row-key="name" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <a-switch v-if="column.key === 'count'" v-model:checked="record.count" size="small" checked-children="计时" un-checked-children="休息" />
              <a-button v-else-if="column.key === 'op'" type="link" size="small" danger @click="delHoliday(record.name)">删除</a-button>
            </template>
          </a-table>

          <div class="sec-h mt2">挂起 / 停表规则</div>
          <div class="intro">工单挂起时 SLA 计时暂停，按挂起原因差异化；设「最长挂起」防永久挂起、「自动恢复」条件、敏感原因可要求「需审核」。各策略在「策略 · 计时口径」中引用这些停表状态。</div>
          <a-table :columns="suspendCols" :data-source="suspendRows" row-key="reason" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <a-switch v-if="column.key === 'pause'" v-model:checked="record.pause" size="small" checked-children="暂停" un-checked-children="计时" />
              <a-switch v-else-if="column.key === 'needAudit'" v-model:checked="record.needAudit" size="small" />
              <span v-else-if="column.key === 'autoResume'" class="muted">{{ record.autoResume }}</span>
              <a-button v-else-if="column.key === 'op'" type="link" size="small" danger @click="delSuspend(record.reason)">删除</a-button>
            </template>
          </a-table>
          <a-button type="dashed" block class="mt" @click="addSuspend"><template #icon><PlusOutlined /></template>添加挂起原因</a-button>
        </div>
      </template>

      <!-- ===== 预警与升级（预警配置 + 升级链只读引用） ===== -->
      <template v-if="activeKey === 'sla-escalate'">
        <div class="panel">
          <AdminPageHeader title="预警与升级" subtitle="到阈值的提醒与升级；升级动作统一在「规则中心·升级路由」维护，此处只读引用">
            <template #actions>
              <a-button type="primary" @click="save">保存</a-button>
              <a-button @click="goEscRoute"><template #icon><ExportOutlined /></template>前往升级路由</a-button>
            </template>
          </AdminPageHeader>

          <div class="sec-h">SLA 预警配置</div>
          <div class="intro">计时到阈值时按通知方式提醒对应对象；与工作台 AI 建议条、首页临期/超时联动。</div>
          <div v-for="r in alertRows" :key="r.id" class="alert-row">
            <a-select v-model:value="r.dim" size="small" style="width:88px" :options="[{value:'响应',label:'响应'},{value:'解决',label:'解决'}]" />
            <a-select v-model:value="r.threshold" size="small" style="width:140px" :options="['剩余 ≤ 50%','剩余 ≤ 25%','剩余 ≤ 10%','已超时'].map((o)=>({value:o,label:o}))" />
            <a-select v-model:value="r.channel" mode="multiple" size="small" style="width:200px" :options="CHANNELS.map((o)=>({value:o,label:o}))" placeholder="通知方式" />
            <a-select v-model:value="r.target" size="small" style="flex:1" :options="TARGETS.map((o)=>({value:o,label:o}))" />
            <a-button type="link" size="small" danger @click="delAlert(r.id)"><template #icon><DeleteOutlined /></template></a-button>
          </div>
          <a-button type="dashed" block class="mt" @click="addAlert"><template #icon><PlusOutlined /></template>添加预警规则</a-button>

          <div class="sec-h mt2">升级链（只读 · 来自「规则中心 · 升级路由」）</div>
          <div class="intro">升级规则已统一在「规则中心 · 升级路由」维护，此处只读展示当前生效升级链；SLA 策略通过「触发阈值 + 引用」接入（见 SLA 策略 ⑥ 升级）。</div>
          <div class="chain">
            <div v-for="(e, i) in escChain" :key="e.level" class="chain-node" :class="e.tone">
              <div class="cn-level">{{ e.level }}</div>
              <div class="cn-body">
                <div class="cn-trigger">{{ e.trigger }} <span class="cn-ref">({{ e.ref }})</span></div>
                <div class="cn-action">→ {{ e.action }}</div>
              </div>
              <div v-if="i < escChain.length - 1" class="cn-line" />
            </div>
          </div>
        </div>
      </template>

      <template v-if="!['sla-timing', 'sla-escalate'].includes(activeKey)">
        <div class="panel"><AdminPageHeader :title="String(route.meta.title || '')" subtitle="该子页内容待补" /></div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sla-engine { display: flex; flex-direction: column; min-height: 100%; }
.body { padding: 16px 24px; display: flex; flex-direction: column; gap: 16px; }
.panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px 24px; }
.sec-h { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 12px; padding-left: 10px; border-left: 3px solid #1a6fff; line-height: 1.4; display: flex; align-items: center; }
.sec-h.mt2 { margin-top: 24px; }
.intro { font-size: 12px; color: #6b7280; background: #f9fafb; border: 1px solid #f0f0f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; line-height: 1.6; }
.mb { margin-bottom: 14px; } .mt { margin-top: 14px; }
.muted { color: #9ca3af; }
.tbl-disabled { opacity: 0.5; }
.alert-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.chain { display: flex; flex-direction: column; gap: 0; padding: 8px 0; }
.chain-node { position: relative; display: flex; align-items: center; gap: 14px; padding: 12px 0; }
.cn-level { width: 40px; height: 40px; border-radius: 20px; flex: none; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; z-index: 1; }
.chain-node.info .cn-level { background: #eff6ff; color: #1a6fff; }
.chain-node.warn .cn-level { background: #fffbeb; color: #d97706; }
.chain-node.danger .cn-level { background: #fef2f2; color: #ef4444; }
.cn-body { flex: 1; }
.cn-trigger { font-size: 13px; font-weight: 600; color: #111827; }
.cn-action { font-size: 12px; color: #6b7280; margin-top: 2px; }
.cn-ref { color: #9ca3af; font-weight: normal; font-size: 11px; }
.cn-line { position: absolute; left: 20px; top: 44px; width: 2px; height: 28px; background: #e5e7eb; }
.hd-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
</style>
