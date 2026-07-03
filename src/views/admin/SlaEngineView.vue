<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { PlusOutlined, DeleteOutlined, ImportOutlined, CopyOutlined } from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { adminNavActiveKey } from '@/config/adminNav';
import { SERVICE_TYPE_OPTIONS, SERVICE_TYPE_TO_METHODS } from '@/views/tickets/types/operation';

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

// —— 预警与升级：按时钟维度配置（整单 + 节点，各钟独立）——
type DueJudgeMode = 'percent' | 'countdown';
type DueCountUnit = '分钟' | '小时';
type ClockKind = 'resp' | 'proc' | 'solve';

interface PreAlertRow {
  id: number;
  minutesBefore: number;
  targets: string[];
  channels: string[];
  template: string;
}

interface NotifyRule {
  targets: string[];
  channels: string[];
  template: string;
}

interface ClockAlertConfig {
  enabled: boolean;
  dueJudge: { mode: DueJudgeMode; value: number; unit: DueCountUnit };
  preAlerts: PreAlertRow[];
  dueAlert: NotifyRule;
  timeoutEnabled: boolean;
  timeoutAlert: NotifyRule;
}

interface ClockDim {
  key: string;
  group: '整单' | '节点';
  label: string;
  kind: ClockKind;
  node?: string;
}

const CHANNELS = ['系统弹窗', 'i讯飞', '站内信', '短信', '邮件'];
const TARGETS = ['处理人', '班组长', '技术顾问', '客服主管'];
const COUNT_UNIT_OPTS: DueCountUnit[] = ['分钟', '小时'];
const NODE_CLOCK_NAMES = ['处理', '技术', '审核', '回访'] as const;

const CLOCK_DIMS: ClockDim[] = [
  { key: 'global:resp', group: '整单', label: '整单响应', kind: 'resp' },
  { key: 'global:solve', group: '整单', label: '整单解决', kind: 'solve' },
  ...NODE_CLOCK_NAMES.flatMap((node) => [
    { key: `node:${node}:resp`, group: '节点' as const, label: `${node} · 响应`, kind: 'resp' as const, node },
    { key: `node:${node}:proc`, group: '节点' as const, label: `${node} · 处理`, kind: 'proc' as const, node },
  ]),
];

function tplPair(dim: ClockDim): [string, string] {
  if (dim.kind === 'solve') return ['SLA-解决临期前提醒', 'SLA-解决临期提醒'];
  if (dim.kind === 'proc') return [`SLA-${dim.node}-处理临期前提醒`, `SLA-${dim.node}-处理临期提醒`];
  if (dim.node) return [`SLA-${dim.node}-响应临期前提醒`, `SLA-${dim.node}-响应临期提醒`];
  return ['SLA-响应临期前提醒', 'SLA-响应临期提醒'];
}

function timeoutTpl(dim: ClockDim): string {
  if (dim.kind === 'solve') return 'SLA-解决超时通知';
  if (dim.kind === 'proc') return `SLA-${dim.node}-处理超时通知`;
  if (dim.node) return `SLA-${dim.node}-响应超时通知`;
  return 'SLA-响应超时通知';
}

function defClockConfig(dim: ClockDim): ClockAlertConfig {
  const [preTpl, dueTpl] = tplPair(dim);
  return {
    enabled: dim.group === '整单',
    dueJudge: { mode: 'percent', value: 25, unit: '分钟' },
    preAlerts: [
      { id: 1, minutesBefore: 20, targets: ['处理人', '班组长'], channels: ['系统弹窗', 'i讯飞'], template: preTpl },
      { id: 2, minutesBefore: 10, targets: ['处理人', '班组长'], channels: ['系统弹窗', 'i讯飞'], template: preTpl },
    ],
    dueAlert: { targets: ['处理人', '班组长'], channels: ['系统弹窗', 'i讯飞'], template: dueTpl },
    timeoutEnabled: true,
    timeoutAlert: { targets: ['班组长'], channels: ['系统弹窗', 'i讯飞', '短信'], template: timeoutTpl(dim) },
  };
}

const alertConfigs = ref<Record<string, ClockAlertConfig>>(
  Object.fromEntries(CLOCK_DIMS.map((d) => [d.key, defClockConfig(d)])),
);
const selectedClockKey = ref('global:resp');
const clockSearch = ref('');

const selectedDim = computed(() => CLOCK_DIMS.find((d) => d.key === selectedClockKey.value) ?? CLOCK_DIMS[0]);
const currentClock = computed(() => alertConfigs.value[selectedClockKey.value]);
const currentTemplates = computed(() => tplPair(selectedDim.value));
const timeoutTemplateOpts = computed(() => [{ value: timeoutTpl(selectedDim.value), label: timeoutTpl(selectedDim.value) }]);

const clockGroups = computed(() => {
  const q = clockSearch.value.trim();
  const filtered = q ? CLOCK_DIMS.filter((d) => d.label.includes(q) || d.node?.includes(q)) : CLOCK_DIMS;
  return (['整单', '节点'] as const).map((g) => ({
    group: g,
    items: filtered.filter((d) => d.group === g),
  })).filter((g) => g.items.length);
});

function isClockEnabled(key: string) {
  return alertConfigs.value[key]?.enabled ?? false;
}

function addPreAlert() {
  const cfg = currentClock.value;
  cfg.preAlerts.push({
    id: Date.now(),
    minutesBefore: 5,
    targets: ['处理人', '班组长'],
    channels: ['系统弹窗'],
    template: currentTemplates.value[0],
  });
}
function delPreAlert(id: number) {
  const cfg = currentClock.value;
  cfg.preAlerts = cfg.preAlerts.filter((r) => r.id !== id);
}

const channelOpts = CHANNELS.map((c) => ({ value: c, label: c }));
const targetOpts = TARGETS.map((t) => ({ value: t, label: t }));
const templateOpts = computed(() => currentTemplates.value.map((t) => ({ value: t, label: t })));

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
// —— 整单解决·服务方式动态调整（全局、独立于标准策略：选定服务方式后动态覆盖策略的优先级默认解决时限）——
type PriK = 'P0' | 'P1' | 'P2' | 'P3';
const PRI_KEYS: PriK[] = ['P0', 'P1', 'P2', 'P3'];
const PRI_COEFF: Record<PriK, number> = { P0: 0.75, P1: 1, P2: 1.25, P3: 1.5 };
const SVC_P1_HOURS: Record<string, number> = {
  与需求人建立联系: 24, 处理人直接解决: 48, 再次流转及后台处理: 72, 需产研侧升级修复: 72, 上门处理: 72,
  首响人直接办理退费: 24, 审核退费: 72, '渠道/第三方退费': 72, '业务线/电商/门店售后': 168,
};
function svcSpread(p1: number): Record<PriK, number> {
  return { P0: Math.ceil(p1 * PRI_COEFF.P0), P1: p1, P2: Math.ceil(p1 * PRI_COEFF.P2), P3: Math.ceil(p1 * PRI_COEFF.P3) };
}
const svcAdjust = ref(true);
const svcSolve = ref(
  SERVICE_TYPE_OPTIONS.flatMap((serviceType) =>
    (SERVICE_TYPE_TO_METHODS[serviceType] ?? []).map((serviceMethod) => ({
      serviceType, serviceMethod, limits: svcSpread(SVC_P1_HOURS[serviceMethod] ?? 48),
    })),
  ),
);
const svcGroups = computed(() => {
  const map = new Map<string, typeof svcSolve.value>();
  svcSolve.value.forEach((row) => { const l = map.get(row.serviceType) ?? []; l.push(row); map.set(row.serviceType, l); });
  return [...map.entries()].map(([serviceType, rows]) => ({ serviceType, rows }));
});
function recalcSvc() { svcSolve.value.forEach((r) => { r.limits = svcSpread(r.limits.P1); }); message.success('已按 P1 重算 P0/P2/P3（系数 0.75/1/1.25/1.5）'); }

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
  <div class="sla-page">
    <!-- ===== 计时规则 ===== -->
    <div v-if="activeKey === 'sla-timing'" class="admin-page">
      <AdminPageHeader
        title="计时规则"
        subtitle="计时规则 = 工作日历与停表底座：定义工作时段、节假日/调休及挂起是否暂停计时，供全部 SLA 策略共用。"
      />

      <div class="content-card">
          <div class="card-toolbar">
            <a-button type="primary" @click="save">保存</a-button>
          </div>
          <div class="sec-h">SLA 工作日历 <a-switch v-model:checked="is724" size="small" style="margin-left:6px" /><span class="muted" style="margin-left:6px">7×24</span></div>
          <a-table :columns="calCols" :data-source="workDays" row-key="day" :pagination="false" size="middle" :class="{ 'tbl-disabled': is724 }">
            <template #headerCell="{ column }">
              <template v-if="column.key === 'time'">
                <div class="cal-time-th">
                  <span>工作时段（上午 / 下午）</span>
                  <a-button size="small" :disabled="is724" @click="applyMondayToAll"><template #icon><CopyOutlined /></template>将周一时段应用到全部 7 天</a-button>
                </div>
              </template>
            </template>
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
          <a-table :columns="holidayCols" :data-source="holidays" row-key="name" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <a-switch v-if="column.key === 'count'" v-model:checked="record.count" size="small" checked-children="计时" un-checked-children="休息" />
              <a-button v-else-if="column.key === 'op'" type="link" size="small" danger @click="delHoliday(record.name)">删除</a-button>
            </template>
          </a-table>

          <div class="sec-h mt2">挂起 / 停表规则</div>
          <a-table :columns="suspendCols" :data-source="suspendRows" row-key="reason" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <a-switch v-if="column.key === 'pause'" v-model:checked="record.pause" size="small" checked-children="暂停" un-checked-children="计时" />
              <a-switch v-else-if="column.key === 'needAudit'" v-model:checked="record.needAudit" size="small" />
              <span v-else-if="column.key === 'autoResume'" class="muted">{{ record.autoResume }}</span>
              <a-button v-else-if="column.key === 'op'" type="link" size="small" danger @click="delSuspend(record.reason)">删除</a-button>
            </template>
          </a-table>
          <a-button type="dashed" block class="mt" @click="addSuspend"><template #icon><PlusOutlined /></template>添加挂起原因</a-button>

          <div class="sec-h mt2">整单解决 · 服务方式动态调整（选填）
            <a-switch v-model:checked="svcAdjust" size="small" style="margin-left:8px" />
          </div>
          <template v-if="svcAdjust">
            <div style="text-align:right;margin-bottom:8px"><a-button size="small" @click="recalcSvc">按 P1 重算 P0/P2/P3</a-button></div>
            <table class="svc-matrix">
              <thead><tr><th>服务类型</th><th>服务方式</th><th v-for="pk in PRI_KEYS" :key="pk">{{ pk }}</th></tr></thead>
              <tbody>
                <template v-for="g in svcGroups" :key="g.serviceType">
                  <tr v-for="(row, idx) in g.rows" :key="row.serviceMethod">
                    <td v-if="idx === 0" class="rowh" :rowspan="g.rows.length">{{ g.serviceType }}</td>
                    <td class="mcell">{{ row.serviceMethod }}</td>
                    <td v-for="pk in PRI_KEYS" :key="pk"><a-input-number v-model:value="row.limits[pk]" :min="1" size="small" style="width:56px" /> <span class="uh">h</span></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </template>
      </div>
    </div>

    <!-- ===== 预警与升级 ===== -->
    <div v-else-if="activeKey === 'sla-escalate'" class="admin-page">
      <AdminPageHeader
        title="预警与升级"
        subtitle="预警与升级 = 按 SLA 时钟配置临期判定、临期前提醒、临期预警与超时升级；升级动作在 SLA 引擎内闭环，与规则引擎升级路由区分。"
      />

      <div class="content-card content-card--alert">
          <div class="alert-layout">
            <aside class="clock-nav">
              <a-input v-model:value="clockSearch" size="small" placeholder="搜索时钟" allow-clear class="clock-search" />
              <div v-for="grp in clockGroups" :key="grp.group" class="clock-nav-group">
                <div class="clock-nav-label">{{ grp.group }}</div>
                <div
                  v-for="dim in grp.items"
                  :key="dim.key"
                  class="clock-nav-item"
                  :class="{ on: selectedClockKey === dim.key, off: !isClockEnabled(dim.key) }"
                  @click="selectedClockKey = dim.key"
                >
                  <span class="clock-nav-text">{{ dim.label }}</span>
                  <a-switch
                    v-model:checked="alertConfigs[dim.key].enabled"
                    size="small"
                    @click.stop
                  />
                </div>
              </div>
            </aside>

            <div class="alert-main">
              <div class="alert-main-h">
                <span>{{ selectedDim.label }}</span>
                <a-button type="primary" @click="save">保存</a-button>
              </div>

              <template v-if="currentClock.enabled">
              <div class="step-block">
                <div class="step-head"><span class="step-title">临期判定</span></div>
                <a-radio-group v-model:value="currentClock.dueJudge.mode" class="due-group">
                  <div class="due-row">
                    <a-radio value="percent">到期百分比</a-radio>
                    <template v-if="currentClock.dueJudge.mode === 'percent'">
                      剩余 ≤ <a-input-number v-model:value="currentClock.dueJudge.value" :min="1" :max="99" size="small" style="width:72px" /> %
                    </template>
                  </div>
                  <div class="due-row">
                    <a-radio value="countdown">到期倒计时</a-radio>
                    <template v-if="currentClock.dueJudge.mode === 'countdown'">
                      剩余 ≤ <a-input-number v-model:value="currentClock.dueJudge.value" :min="1" size="small" style="width:72px" />
                      <a-select v-model:value="currentClock.dueJudge.unit" size="small" style="width:80px" :options="COUNT_UNIT_OPTS.map((u) => ({ value: u, label: u }))" />
                    </template>
                  </div>
                </a-radio-group>
              </div>

              <div class="step-block">
                <div class="step-head step-head--toolbar">
                  <span class="step-title">临期前提醒</span>
                  <a-button type="link" size="small" @click="addPreAlert"><template #icon><PlusOutlined /></template>添加</a-button>
                </div>
                <table class="alert-matrix">
                  <thead>
                    <tr>
                      <th style="width:140px">临期前</th>
                      <th style="width:160px">通知对象</th>
                      <th style="width:200px">通知方式</th>
                      <th>消息模板</th>
                      <th style="width:56px" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in currentClock.preAlerts" :key="row.id">
                      <td class="pre-minutes-cell">
                        <span>前</span>
                        <a-input-number v-model:value="row.minutesBefore" :min="1" size="small" class="pre-minutes-input" />
                        <span>分钟</span>
                      </td>
                      <td><a-select v-model:value="row.targets" mode="multiple" size="small" style="width:100%" :options="targetOpts" /></td>
                      <td><a-select v-model:value="row.channels" mode="multiple" size="small" style="width:100%" :options="channelOpts" /></td>
                      <td><a-select v-model:value="row.template" size="small" style="width:100%" :options="templateOpts" /></td>
                      <td><a-button type="link" size="small" danger @click="delPreAlert(row.id)"><template #icon><DeleteOutlined /></template></a-button></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="step-block">
                <div class="step-head"><span class="step-title">临期预警</span></div>
                <div class="notify-row">
                  <span class="nr-label">通知对象</span>
                  <a-select v-model:value="currentClock.dueAlert.targets" mode="multiple" size="small" style="width:180px" :options="targetOpts" />
                  <span class="nr-label">通知方式</span>
                  <a-select v-model:value="currentClock.dueAlert.channels" mode="multiple" size="small" style="width:220px" :options="channelOpts" />
                  <span class="nr-label">消息模板</span>
                  <a-select v-model:value="currentClock.dueAlert.template" size="small" style="flex:1;min-width:180px" :options="templateOpts" />
                </div>
              </div>

              <div class="step-block step-block--timeout">
                <div class="step-head">
                  <span class="step-title">超时升级</span>
                  <a-switch v-model:checked="currentClock.timeoutEnabled" size="small" style="margin-left:8px" />
                </div>
                <div v-if="currentClock.timeoutEnabled" class="notify-row">
                  <span class="nr-label">通知对象</span>
                  <a-select v-model:value="currentClock.timeoutAlert.targets" mode="multiple" size="small" style="width:180px" :options="targetOpts" />
                  <span class="nr-label">通知方式</span>
                  <a-select v-model:value="currentClock.timeoutAlert.channels" mode="multiple" size="small" style="width:220px" :options="channelOpts" />
                  <span class="nr-label">消息模板</span>
                  <a-select v-model:value="currentClock.timeoutAlert.template" size="small" style="flex:1;min-width:180px" :options="timeoutTemplateOpts" />
                </div>
              </div>
              </template>
              <div v-else class="alert-empty">
                <span class="alert-empty-text">未启用预警策略，该时钟仅计时</span>
              </div>
            </div>
          </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sla-page { display: flex; flex-direction: column; min-height: 100%; }
.admin-page { display: flex; flex-direction: column; gap: 16px; padding: 16px 24px; }
.content-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px 24px; }
.content-card--alert { padding: 16px 20px 20px; }
.card-toolbar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
.admin-page :deep(.admin-page-header) { margin-bottom: 0; }
.svc-matrix { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
.svc-matrix th, .svc-matrix td { border: 1px solid #e5e7eb; padding: 6px 10px; font-size: 13px; text-align: center; }
.svc-matrix th { background: #f9fafb; color: #6b7280; font-weight: 600; }
.svc-matrix .rowh { background: #f9fafb; font-weight: 600; color: #111827; }
.svc-matrix .mcell { text-align: left; color: #374151; }
.svc-matrix .uh { color: #9ca3af; font-size: 12px; }
.sec-h { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 12px; padding-left: 10px; border-left: 3px solid #1a6fff; line-height: 1.4; display: flex; align-items: center; }
.sec-h.mt2 { margin-top: 24px; }
.intro { font-size: 12px; color: #6b7280; background: #f9fafb; border: 1px solid #f0f0f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; line-height: 1.6; }
.mb { margin-bottom: 14px; } .mt { margin-top: 14px; }
.muted { color: #9ca3af; }
.tbl-disabled { opacity: 0.5; }
.cal-time-th { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; }
.cal-time-th :deep(.ant-btn) { font-weight: 400; }
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
.content-card--alert .alert-layout { border: none; border-radius: 0; }
.alert-layout { display: flex; gap: 0; min-height: 520px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.clock-nav {
  width: 176px; flex: none; background: #f9fafb; border-right: 1px solid #e5e7eb;
  padding: 10px 0; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; max-height: 72vh;
}
.clock-search { margin: 0 8px 6px; width: calc(100% - 16px); }
.clock-nav-group { margin-bottom: 2px; }
.clock-nav-label { font-size: 10px; font-weight: 600; color: #9ca3af; padding: 4px 8px 2px; letter-spacing: 0.02em; }
.clock-nav-item {
  display: flex; align-items: center; gap: 6px; width: 100%; padding: 5px 6px 5px 8px; font-size: 12px; color: #374151;
  border-left: 2px solid transparent; cursor: pointer;
}
.clock-nav-item.off { color: #9ca3af; }
.clock-nav-item:hover { background: #f3f4f6; }
.clock-nav-item.on { background: #eff6ff; color: #1a6fff; border-left-color: #1a6fff; }
.clock-nav-item.on .clock-nav-text { font-weight: 600; }
.clock-nav-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clock-nav-item :deep(.ant-switch) { flex: none; transform: scale(0.85); transform-origin: center right; }
.alert-main { flex: 1; padding: 16px 20px; overflow-y: auto; }
.alert-main-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #f0f0f0; }
.alert-empty { display: flex; align-items: center; justify-content: center; min-height: 320px; }
.alert-empty-text { font-size: 13px; color: #9ca3af; }
.step-block { margin-bottom: 24px; }
.step-block--timeout { margin-bottom: 0; }
.step-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.step-head--toolbar { justify-content: space-between; }
.step-title { font-size: 13px; font-weight: 600; color: #111827; }
.due-group { display: flex; flex-direction: column; gap: 12px; }
.due-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #4b5563; flex-wrap: wrap; }
.alert-matrix { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
.alert-matrix th { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; text-align: left; padding: 8px 10px; border: 1px solid #e5e7eb; }
.alert-matrix td { padding: 8px 10px; border: 1px solid #e5e7eb; font-size: 13px; color: #374151; vertical-align: middle; }
.pre-minutes-cell { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.pre-minutes-input { width: 56px !important; flex: none; }
.pre-minutes-cell :deep(.ant-input-number) { width: 56px; }
.notify-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; }
.nr-label { color: #6b7280; white-space: nowrap; font-size: 12px; }
.hd-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
</style>
