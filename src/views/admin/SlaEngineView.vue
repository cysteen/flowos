<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { PlusOutlined, DeleteOutlined, ImportOutlined, CopyOutlined } from '@ant-design/icons-vue';
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

// —— 自动升级链（A3-05，SLA 引擎自有；区别于规则中心的「升级路由→目标系统」）——
const ESC_TRIGGERS = ['响应剩余 ≤ 25%', '响应已超时', '解决剩余 ≤ 25%', '解决已超时', '超时后每 30 分钟'];
const ESC_TARGETS = ['处理人', '班组长', '二线技术支持组', '客服主管', '指定人'];
const escChain = ref([
  { id: 1, level: 'L1', trigger: '响应剩余 ≤ 25%', target: '处理人', extra: '打升级标记' },
  { id: 2, level: 'L2', trigger: '响应已超时', target: '班组长', extra: '打升级标记' },
  { id: 3, level: 'L3', trigger: '解决已超时', target: '二线技术支持组', extra: '优先级 +1' },
  { id: 4, level: 'L4', trigger: '超时后每 30 分钟', target: '客服主管', extra: '飞书同步' },
]);
function addEsc() { escChain.value.push({ id: Date.now(), level: `L${escChain.value.length + 1}`, trigger: '解决已超时', target: '班组长', extra: '' }); }
function delEsc(id: number) { escChain.value = escChain.value.filter((e) => e.id !== id); escChain.value.forEach((e, i) => { e.level = `L${i + 1}`; }); }

// 监控看板（达标统计）已移出 SLA 配置：完整看板归运营看板/数据总览、班组看板（单一算法源）；
// SLA 策略列表页保留轻量达成概览。

// —— 工作日历 ——
interface WorkDay {
  day: string;
  on: boolean;
  amStart: string;
  amEnd: string;
  pmStart: string;
  pmEnd: string;
}
const is724 = ref(false);
const workDays = ref<WorkDay[]>([
  { day: '周一', on: true, amStart: '09:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '18:00' },
  { day: '周二', on: true, amStart: '09:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '18:00' },
  { day: '周三', on: true, amStart: '09:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '18:00' },
  { day: '周四', on: true, amStart: '09:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '18:00' },
  { day: '周五', on: true, amStart: '09:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '18:00' },
  { day: '周六', on: false, amStart: '09:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '17:00' },
  { day: '周日', on: false, amStart: '10:00', amEnd: '12:00', pmStart: '13:30', pmEnd: '17:00' },
]);
const TIME_OPTS = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      opts.push({ value: t, label: t });
    }
  }
  return opts;
})();
function formatWorkTime(row: WorkDay): string {
  return `上午 ${row.amStart}–${row.amEnd}；下午 ${row.pmStart}–${row.pmEnd}`;
}
function applyMondayToAll() {
  const mon = workDays.value.find((d) => d.day === '周一');
  if (!mon) return;
  workDays.value.forEach((d) => {
    d.amStart = mon.amStart;
    d.amEnd = mon.amEnd;
    d.pmStart = mon.pmStart;
    d.pmEnd = mon.pmEnd;
  });
  message.success('已将以周一工作时段应用到全部 7 天');
}
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
  { title: '星期', dataIndex: 'day', key: 'day', width: 72 },
  { title: '是否工作日', key: 'on', width: 100 },
  { title: '工作时段（上午 / 下午）', key: 'time' },
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
          <div class="intro">SLA 时限按工作时段推进，非工作时段（夜间/午休/节假日）不计入计时；勾选 7×24 则按自然时间。每天可配置<strong>上午段 + 下午段</strong>；「是否工作日」仅控制当天是否计入 SLA，时段仍可预先配置（含周六日）。</div>
          <div class="cal-toolbar">
            <a-button size="small" :disabled="is724" @click="applyMondayToAll"><template #icon><CopyOutlined /></template>将周一时段应用到全部 7 天</a-button>
            <span class="cal-preview muted">示例：{{ formatWorkTime(workDays[0]) }}</span>
          </div>
          <a-table :columns="calCols" :data-source="workDays" row-key="day" :pagination="false" size="middle" :class="{ 'tbl-disabled': is724 }">
            <template #bodyCell="{ column, record }">
              <a-switch v-if="column.key === 'on'" v-model:checked="record.on" size="small" :disabled="is724" />
              <div v-else-if="column.key === 'time'" class="time-slots" :class="{ 'time-slots--off': !record.on }">
                <span class="slot-label">上午</span>
                <a-select v-model:value="record.amStart" size="small" class="time-sel" :options="TIME_OPTS" :disabled="is724" />
                <span class="slot-sep">—</span>
                <a-select v-model:value="record.amEnd" size="small" class="time-sel" :options="TIME_OPTS" :disabled="is724" />
                <span class="slot-divider" />
                <span class="slot-label">下午</span>
                <a-select v-model:value="record.pmStart" size="small" class="time-sel" :options="TIME_OPTS" :disabled="is724" />
                <span class="slot-sep">—</span>
                <a-select v-model:value="record.pmEnd" size="small" class="time-sel" :options="TIME_OPTS" :disabled="is724" />
              </div>
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

      <!-- ===== 预警与升级（A3-04 分级预警 + A3-05 自动升级链，SLA 引擎自有） ===== -->
      <template v-if="activeKey === 'sla-escalate'">
        <div class="panel">
          <AdminPageHeader title="预警与升级" subtitle="SLA 分级预警(A3-04) + 超时自动升级链(A3-05)，在 SLA 引擎统一维护">
            <template #actions><a-button type="primary" @click="save">保存</a-button></template>
          </AdminPageHeader>

          <div class="sec-h">SLA 分级预警（A3-04）</div>
          <div class="intro">计时到阈值时按通知方式提醒对应对象；与工作台 AI 建议条、首页临期/超时联动。</div>
          <div v-for="r in alertRows" :key="r.id" class="alert-row">
            <a-select v-model:value="r.dim" size="small" style="width:88px" :options="[{value:'响应',label:'响应'},{value:'解决',label:'解决'}]" />
            <a-select v-model:value="r.threshold" size="small" style="width:140px" :options="['剩余 ≤ 50%','剩余 ≤ 25%','剩余 ≤ 10%','已超时'].map((o)=>({value:o,label:o}))" />
            <a-select v-model:value="r.channel" mode="multiple" size="small" style="width:200px" :options="CHANNELS.map((o)=>({value:o,label:o}))" placeholder="通知方式" />
            <a-select v-model:value="r.target" size="small" style="flex:1" :options="TARGETS.map((o)=>({value:o,label:o}))" />
            <a-button type="link" size="small" danger @click="delAlert(r.id)"><template #icon><DeleteOutlined /></template></a-button>
          </div>
          <a-button type="dashed" block class="mt" @click="addAlert"><template #icon><PlusOutlined /></template>添加预警规则</a-button>

          <div class="sec-h mt2">SLA 自动升级链（A3-05）</div>
          <div class="intro">超时未处理按级别自动升级至上级/指定人员，支持多级。注：规则中心的「升级路由」是升级到目标系统(RDM/TPD/飞书)，与此不同。</div>
          <div v-for="e in escChain" :key="e.id" class="alert-row">
            <span class="esc-lv">{{ e.level }}</span>
            <a-select v-model:value="e.trigger" size="small" style="width:170px" :options="ESC_TRIGGERS.map((o)=>({value:o,label:o}))" />
            <span class="esc-arrow">→ 升级至</span>
            <a-select v-model:value="e.target" size="small" style="width:160px" :options="ESC_TARGETS.map((o)=>({value:o,label:o}))" />
            <a-input v-model:value="e.extra" size="small" style="flex:1" placeholder="附加动作（如 优先级 +1 / 飞书同步）" />
            <a-button type="link" size="small" danger @click="delEsc(e.id)"><template #icon><DeleteOutlined /></template></a-button>
          </div>
          <a-button type="dashed" block class="mt" @click="addEsc"><template #icon><PlusOutlined /></template>添加升级级别</a-button>
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
.cal-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.cal-preview { font-size: 12px; }
.time-slots {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  padding: 2px 0;
  white-space: nowrap;
}
.time-slots--off { opacity: 0.72; }
.slot-label { font-size: 12px; color: #6b7280; flex: none; }
.slot-sep { font-size: 12px; color: #9ca3af; flex: none; }
.slot-divider { width: 10px; flex: none; }
.time-sel { width: 76px !important; flex: none; }
.time-slots :deep(.ant-select-selector) { padding: 0 6px !important; }
.alert-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.esc-lv { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 24px; padding: 0 8px; border-radius: 4px; background: #eef2ff; color: #1a6fff; font-size: 12px; font-weight: 600; }
.esc-arrow { font-size: 12px; color: #9ca3af; white-space: nowrap; }
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
