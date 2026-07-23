<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import { PlusOutlined, ImportOutlined, CopyOutlined } from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { slaCalendars, addCalendar, removeCalendar, renameCalendar, type SlaCalendar } from '@/config/slaCalendars';
import SlaNotifyRuleList from '@/views/admin/components/sla/SlaNotifyRuleList.vue';
import SlaPreAlertList from '@/views/admin/components/sla/SlaPreAlertList.vue';
import { adminNavActiveKey } from '@/config/adminNav';
import { SERVICE_TYPE_OPTIONS, SERVICE_TYPE_TO_METHODS } from '@/views/tickets/types/operation';

// SLA 引擎非策略子页（PRD-55/56/57）：双层计时 / 挂起规则 / 预警配置 / 升级链 / 达标统计 / 监控看板 / 工作日历。
const route = useRoute();
const activeKey = computed(() => adminNavActiveKey(route.path));

// 平台固定「双层 SLA（整单 + 节点并行）」，不提供计时模式开关（伪动作，已移除）。
// 节点级时限 = 轻量 OLA（P1），在 SLA 策略内配，不在此页。
/** 本期不做挂起/停表配置与运行逻辑；置 false 隐藏「挂起 / 停表规则」区块 */
const ENABLE_SUSPEND_RULES = false;

// —— 挂起规则（参考 V1 A3#suspend：最长挂起防永久挂起 + 自动恢复条件 + 挂起审批）——
let suspendSeq = 0;
const suspendRows = ref([
  { id: ++suspendSeq, reason: '等待客户反馈', pause: true, maxDuration: '72 小时', autoResume: '客户回复后自动恢复', needAudit: false },
  { id: ++suspendSeq, reason: '等待备件到货', pause: true, maxDuration: '7 天', autoResume: '到货确认后恢复', needAudit: false },
  { id: ++suspendSeq, reason: '等待第三方系统', pause: true, maxDuration: '48 小时', autoResume: '接口回调后恢复', needAudit: false },
  { id: ++suspendSeq, reason: '等待产研修复', pause: true, maxDuration: '15 天', autoResume: '版本发布后恢复', needAudit: true },
  { id: ++suspendSeq, reason: '客户要求暂缓', pause: true, maxDuration: '30 天', autoResume: '客户确认后恢复', needAudit: true },
]);
function addSuspend() { suspendRows.value.push({ id: ++suspendSeq, reason: '', pause: true, maxDuration: '', autoResume: '', needAudit: false }); }
function delSuspend(id: number) { suspendRows.value = suspendRows.value.filter((r) => r.id !== id); }
/** 挂起场景枚举（对客承诺停表原因；来自字段字典·挂起原因） */
const SUSPEND_SCENES = ['等待客户反馈', '等待备件到货', '等待第三方系统', '等待产研修复', '等待上级审批', '客户要求暂缓', '其他'];
const suspendSceneOpts = SUSPEND_SCENES.map((s) => ({ value: s, label: s }));

// —— 预警与升级：按时效维度配置（整单 + 节点，各时效独立）——
type DueJudgeMode = 'percent' | 'countdown';
type DueCountUnit = '分钟' | '小时';
type ClockKind = 'resp' | 'proc' | 'solve';

interface PreAlertRow {
  id: number;
  minutesBefore: number;
  targets: string[];
  channel: string;
  template: string;
}

interface NotifyRuleRow {
  id: number;
  targets: string[];
  channel: string;
  template: string;
  /** 超时后第 N 分钟提醒一次（0=刚超时；非周期） */
  minutesAfter?: number;
}

interface ClockAlertConfig {
  enabled: boolean;
  dueJudge: { mode: DueJudgeMode; value: number; unit: DueCountUnit };
  preAlertEnabled: boolean;
  preAlerts: PreAlertRow[];
  dueAlertEnabled: boolean;
  dueAlerts: NotifyRuleRow[];
  timeoutEnabled: boolean;
  timeoutAlerts: NotifyRuleRow[];
}

interface ClockDim {
  key: string;
  group: '整单' | '节点';
  label: string;
  kind: ClockKind;
  node?: string;
}

const CHANNELS = ['i讯飞', '短信', '邮件'];
const TARGETS = ['处理人', '班组长'];
const COUNT_UNIT_OPTS: DueCountUnit[] = ['分钟', '小时'];
const NODE_CLOCK_NAMES = ['工单处理', '技术支持'] as const;

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
    preAlertEnabled: true,
    preAlerts: [
      { id: 1, minutesBefore: 20, targets: ['处理人', '班组长'], channel: 'i讯飞', template: preTpl },
      { id: 2, minutesBefore: 10, targets: ['处理人', '班组长'], channel: 'i讯飞', template: preTpl },
    ],
    dueAlertEnabled: true,
    dueAlerts: [
      { id: 1, targets: ['处理人', '班组长'], channel: 'i讯飞', template: dueTpl },
    ],
    timeoutEnabled: true,
    timeoutAlerts: [
      { id: 1, targets: ['班组长'], channel: '短信', template: timeoutTpl(dim), minutesAfter: 0 },
    ],
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
    channel: 'i讯飞',
    template: currentTemplates.value[0],
  });
}
function delPreAlert(id: number) {
  const cfg = currentClock.value;
  cfg.preAlerts = cfg.preAlerts.filter((r) => r.id !== id);
}

function addDueAlert() {
  const cfg = currentClock.value;
  const dueTpl = currentTemplates.value[1];
  cfg.dueAlerts.push({
    id: Date.now(),
    targets: ['处理人', '班组长'],
    channel: 'i讯飞',
    template: dueTpl,
  });
}
function delDueAlert(id: number) {
  const cfg = currentClock.value;
  cfg.dueAlerts = cfg.dueAlerts.filter((r) => r.id !== id);
}

function addTimeoutAlert() {
  const cfg = currentClock.value;
  const tpl = timeoutTpl(selectedDim.value);
  cfg.timeoutAlerts.push({
    id: Date.now(),
    targets: ['班组长'],
    channel: 'i讯飞',
    template: tpl,
    minutesAfter: 30,
  });
}
function delTimeoutAlert(id: number) {
  const cfg = currentClock.value;
  cfg.timeoutAlerts = cfg.timeoutAlerts.filter((r) => r.id !== id);
}

const channelOpts = CHANNELS.map((c) => ({ value: c, label: c }));
const targetOpts = TARGETS.map((t) => ({ value: t, label: t }));
const preTemplateOpts = computed(() => [{ value: currentTemplates.value[0], label: currentTemplates.value[0] }]);
const dueTemplateOpts = computed(() => [{ value: currentTemplates.value[1], label: currentTemplates.value[1] }]);

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
// —— 多套工作日历（共享单一真源；策略下拉同源引用）——
const currentCalId = ref(slaCalendars[0].id);
const selectedCal = computed<SlaCalendar>(() => slaCalendars.find((c) => c.id === currentCalId.value) ?? slaCalendars[0]);
const calSelectOpts = computed(() => slaCalendars.map((c) => ({ value: c.id, label: c.name })));
const workDays = computed(() => selectedCal.value.workDays);
const is724 = computed({
  get: () => selectedCal.value.is724,
  set: (v: boolean) => { selectedCal.value.is724 = v; },
});
function onAddCal() {
  const cal = addCalendar();
  currentCalId.value = cal.id;
  message.success('已新增日历，请编辑其工作时段并命名');
}
function onDeleteCal() {
  const cal = selectedCal.value;
  if (cal.builtin) { message.info('内置日历不可删除'); return; }
  Modal.confirm({
    title: '删除日历',
    content: `确定删除「${cal.name}」？引用它的 SLA 策略需改选其他日历。`,
    okType: 'danger',
    onOk: () => { if (removeCalendar(cal.id)) { currentCalId.value = slaCalendars[0].id; message.success('已删除'); } },
  });
}
const renaming = ref(false);
const renameInput = ref('');
function openRename() {
  if (selectedCal.value.builtin) { message.info('内置日历不可重命名'); return; }
  renameInput.value = selectedCal.value.name;
  renaming.value = true;
}
function confirmRename() {
  if (renameCalendar(currentCalId.value, renameInput.value)) { renaming.value = false; message.success('已重命名'); }
  else message.warning('名称不能为空或与其他日历重复');
}
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
let holidaySeq = 0;
interface Holiday { id: number; name: string; range: [Dayjs, Dayjs] | null; makeup: (Dayjs | null)[]; count: boolean }
function hd(md: string): Dayjs { return dayjs(`${holidayYear.value}-${md}`); }
const holidays = ref<Holiday[]>([
  { id: ++holidaySeq, name: '元旦', range: [hd('01-01'), hd('01-03')], makeup: [], count: false },
  { id: ++holidaySeq, name: '春节', range: [hd('02-16'), hd('02-22')], makeup: [hd('02-14'), hd('02-28')], count: false },
  { id: ++holidaySeq, name: '清明节', range: [hd('04-04'), hd('04-06')], makeup: [], count: false },
  { id: ++holidaySeq, name: '劳动节', range: [hd('05-01'), hd('05-05')], makeup: [hd('04-26'), hd('05-09')], count: false },
  { id: ++holidaySeq, name: '端午节', range: [hd('06-19'), hd('06-21')], makeup: [], count: false },
  { id: ++holidaySeq, name: '中秋节', range: [hd('09-25'), hd('09-27')], makeup: [], count: false },
  { id: ++holidaySeq, name: '国庆节', range: [hd('10-01'), hd('10-07')], makeup: [hd('09-27'), hd('10-11')], count: false },
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
const svcAdjust = ref(false);
let svcRowSeq = 0;
const svcSolve = ref(
  SERVICE_TYPE_OPTIONS.flatMap((serviceType) =>
    (SERVICE_TYPE_TO_METHODS[serviceType] ?? []).map((serviceMethod) => ({
      id: ++svcRowSeq, serviceType, serviceMethod, limits: svcSpread(SVC_P1_HOURS[serviceMethod] ?? 48),
    })),
  ),
);
const svcTypeOpts = SERVICE_TYPE_OPTIONS.map((t) => ({ value: t, label: t }));
function svcMethodOpts(serviceType: string) {
  return (SERVICE_TYPE_TO_METHODS[serviceType] ?? []).map((m) => ({ value: m, label: m }));
}
/** 改服务类型后，若原服务方式不属于新类型则重置为该类型首项 */
function onSvcTypeChange(row: { serviceType: string; serviceMethod: string }) {
  const methods = SERVICE_TYPE_TO_METHODS[row.serviceType] ?? [];
  if (!methods.includes(row.serviceMethod)) row.serviceMethod = methods[0] ?? '';
}
function addSvcRow() {
  const serviceType = SERVICE_TYPE_OPTIONS[0];
  const serviceMethod = (SERVICE_TYPE_TO_METHODS[serviceType] ?? [])[0] ?? '';
  svcSolve.value.push({ id: ++svcRowSeq, serviceType, serviceMethod, limits: svcSpread(SVC_P1_HOURS[serviceMethod] ?? 48) });
}
function delSvcRow(id: number) { svcSolve.value = svcSolve.value.filter((r) => r.id !== id); }
function recalcSvc() { svcSolve.value.forEach((r) => { r.limits = svcSpread(r.limits.P1); }); message.success('已按 P1 重算 P0/P2/P3（系数 0.75/1/1.25/1.5）'); }

function importHolidays() { message.success(`已导入 ${holidayYear.value} 年国务院法定节假日与调休安排`); }
function addHoliday() { holidays.value.push({ id: ++holidaySeq, name: '', range: null, makeup: [], count: false }); }
function delHoliday(id: number) { holidays.value = holidays.value.filter((h) => h.id !== id); }
function addMakeup(h: Holiday) { h.makeup.push(null); }
function delMakeup(h: Holiday, idx: number) { h.makeup.splice(idx, 1); }

// 配置短表列（spec §3：a-table size middle + :pagination=false）
const suspendCols = [
  { title: '挂起场景', dataIndex: 'reason', key: 'reason', width: 180 },
  { title: '是否暂停', key: 'pause', width: 110 },
  { title: '最长挂起', dataIndex: 'maxDuration', key: 'maxDuration', width: 110 },
  { title: '自动恢复', dataIndex: 'autoResume', key: 'autoResume' },
  { title: '需审核', key: 'needAudit', width: 90 },
  { title: '操作', key: 'op', width: 90 },
];
const holidayCols = [
  { title: '节日', dataIndex: 'name', key: 'name', width: 120 },
  { title: '放假日期', dataIndex: 'range', key: 'range', width: 230 },
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
        subtitle="计时规则 = 工作日历底座：定义工作时段、节假日/调休，供全部 SLA 策略共用。（挂起/停表本期不做）"
      >
        <template #actions>
          <a-button type="primary" @click="save">保存</a-button>
        </template>
      </AdminPageHeader>

      <div class="content-card">
          <div class="sec-h cal-h">
            <span>SLA 工作日历</span>
            <a-select v-model:value="currentCalId" size="small" style="width:200px" :options="calSelectOpts" />
            <a-button size="small" @click="onAddCal"><template #icon><PlusOutlined /></template>新建</a-button>
            <a-button size="small" :disabled="selectedCal.builtin" @click="openRename">重命名</a-button>
            <a-button size="small" danger :disabled="selectedCal.builtin" @click="onDeleteCal">删除</a-button>
            <span class="cal-724"><a-switch v-model:checked="is724" size="small" /><span class="muted">7×24 连续计时</span></span>
          </div>
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
          <a-modal v-model:open="renaming" title="重命名日历" ok-text="保存" cancel-text="取消" @ok="confirmRename">
            <a-input v-model:value="renameInput" placeholder="请输入日历名称" allow-clear @press-enter="confirmRename" />
          </a-modal>

          <div class="sec-h mt2">节假日 / 调休
            <span class="hd-actions">
              <span class="muted">年份</span>
              <a-select v-model:value="holidayYear" size="small" style="width:92px" :options="HOLIDAY_YEARS.map((y) => ({ value: y, label: y + ' 年' }))" />
              <a-button size="small" @click="importHolidays"><template #icon><ImportOutlined /></template>导入国务院安排</a-button>
              <a-button size="small" type="primary" @click="addHoliday"><template #icon><PlusOutlined /></template>新增假期</a-button>
            </span>
          </div>
          <a-table :columns="holidayCols" :data-source="holidays" row-key="id" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <a-input v-if="column.key === 'name'" v-model:value="record.name" size="small" placeholder="节日名称" />
              <a-range-picker v-else-if="column.key === 'range'" v-model:value="record.range" size="small" format="MM-DD" :placeholder="['放假开始', '结束']" style="width:100%" />
              <div v-else-if="column.key === 'makeup'" class="makeup-cell">
                <span v-if="!record.makeup.length" class="muted">无补班</span>
                <span v-for="(m, idx) in record.makeup" :key="idx" class="makeup-item">
                  <a-date-picker v-model:value="record.makeup[idx]" size="small" format="MM-DD" placeholder="补班日" style="width:104px" />
                  <a-button type="text" size="small" danger class="makeup-del" @click="delMakeup(record, idx)">×</a-button>
                </span>
                <a-button type="link" size="small" @click="addMakeup(record)"><template #icon><PlusOutlined /></template>补班日</a-button>
              </div>
              <a-switch v-else-if="column.key === 'count'" v-model:checked="record.count" size="small" checked-children="计时" un-checked-children="休息" />
              <a-button v-else-if="column.key === 'op'" type="link" size="small" danger @click="delHoliday(record.id)">删除</a-button>
            </template>
          </a-table>

          <!-- 本期不做挂起/停表逻辑，区块隐藏；恢复时打开 ENABLE_SUSPEND_RULES -->
          <template v-if="ENABLE_SUSPEND_RULES">
            <div class="sec-h mt2">挂起 / 停表规则
              <span class="hd-actions">
                <a-button size="small" type="primary" @click="addSuspend"><template #icon><PlusOutlined /></template>新增挂起规则</a-button>
              </span>
            </div>
            <a-table :columns="suspendCols" :data-source="suspendRows" row-key="id" :pagination="false" size="middle">
              <template #bodyCell="{ column, record }">
                <a-select v-if="column.key === 'reason'" v-model:value="record.reason" :options="suspendSceneOpts" size="small" placeholder="选择挂起场景" style="width:100%" />
                <a-switch v-else-if="column.key === 'pause'" v-model:checked="record.pause" size="small" checked-children="暂停" un-checked-children="计时" />
                <a-input v-else-if="column.key === 'maxDuration'" v-model:value="record.maxDuration" size="small" placeholder="如 72 小时" />
                <a-input v-else-if="column.key === 'autoResume'" v-model:value="record.autoResume" size="small" placeholder="恢复条件，如 客户回复后自动恢复" />
                <a-switch v-else-if="column.key === 'needAudit'" v-model:checked="record.needAudit" size="small" />
                <a-button v-else-if="column.key === 'op'" type="link" size="small" danger @click="delSuspend(record.id)">删除</a-button>
              </template>
            </a-table>
          </template>

          <div class="sec-h mt2">整单解决 · 服务方式动态调整（选填）
            <a-switch v-model:checked="svcAdjust" size="small" style="margin-left:8px" />
            <span v-if="svcAdjust" class="hd-actions">
              <a-button size="small" type="primary" @click="addSvcRow"><template #icon><PlusOutlined /></template>新增服务方式</a-button>
              <a-button size="small" @click="recalcSvc">按 P1 重算 P0/P2/P3</a-button>
            </span>
          </div>
          <template v-if="svcAdjust">
            <table class="svc-matrix">
              <thead><tr><th style="width:160px">服务类型</th><th style="width:200px">服务方式</th><th v-for="pk in PRI_KEYS" :key="pk">{{ pk }}</th><th style="width:64px">操作</th></tr></thead>
              <tbody>
                <tr v-for="row in svcSolve" :key="row.id">
                  <td><a-select v-model:value="row.serviceType" :options="svcTypeOpts" size="small" style="width:150px" @change="onSvcTypeChange(row)" /></td>
                  <td><a-select v-model:value="row.serviceMethod" :options="svcMethodOpts(row.serviceType)" size="small" style="width:190px" placeholder="选择服务方式" /></td>
                  <td v-for="pk in PRI_KEYS" :key="pk"><a-input-number v-model:value="row.limits[pk]" :min="1" size="small" style="width:56px" /> <span class="uh">h</span></td>
                  <td><a-button type="link" size="small" danger @click="delSvcRow(row.id)">删除</a-button></td>
                </tr>
                <tr v-if="!svcSolve.length"><td :colspan="PRI_KEYS.length + 3" class="svc-empty">暂无服务方式，点「新增服务方式」添加</td></tr>
              </tbody>
            </table>
          </template>
          <div v-else class="svc-off-hint">关闭时整单解决时限按策略的优先级配置执行；开启后可对各服务方式细化到 P0–P3。</div>
      </div>
    </div>

    <!-- ===== 预警与升级 ===== -->
    <div v-else-if="activeKey === 'sla-escalate'" class="admin-page">
      <AdminPageHeader
        title="预警与升级"
        subtitle="预警与升级 = 按 SLA 时效配置临期判定、临期前提醒、临期预警与超时升级；升级动作在 SLA 引擎内闭环，与规则引擎升级路由区分。"
      />

      <div class="content-card content-card--alert">
          <div class="alert-layout">
            <aside class="clock-nav">
              <a-input v-model:value="clockSearch" size="small" placeholder="搜索时效" allow-clear class="clock-search" />
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
                <div class="alert-title-wrap">
                  <span class="alert-group-tag">{{ selectedDim.group }}</span>
                  <h3 class="alert-title">{{ selectedDim.label }}</h3>
                  <span class="alert-status" :class="currentClock.enabled ? 'on' : 'off'">
                    {{ currentClock.enabled ? '预警已启用' : '仅计时' }}
                  </span>
                </div>
                <a-button type="primary" @click="save">保存配置</a-button>
              </div>

              <template v-if="currentClock.enabled">
              <div class="alert-steps">
                <!-- 临期界定 -->
                <section class="step-card step-card--compact">
                  <div class="due-judge-bar">
                    <span class="due-judge-label">临期界定</span>
                    <a-radio-group v-model:value="currentClock.dueJudge.mode" size="small" class="due-radio-group">
                      <a-radio value="percent">到期百分比</a-radio>
                      <a-radio value="countdown">到期倒计时</a-radio>
                    </a-radio-group>
                    <div v-if="currentClock.dueJudge.mode === 'percent'" class="due-params">
                      <span class="due-param-text">剩余 ≤</span>
                      <a-input-number
                        v-model:value="currentClock.dueJudge.value"
                        :min="1"
                        :max="99"
                        size="small"
                        class="due-param-input"
                      />
                      <span class="due-param-text">%</span>
                    </div>
                    <div v-else class="due-params">
                      <span class="due-param-text">剩余 ≤</span>
                      <a-input-number
                        v-model:value="currentClock.dueJudge.value"
                        :min="1"
                        size="small"
                        class="due-param-input"
                      />
                      <a-select
                        v-model:value="currentClock.dueJudge.unit"
                        size="small"
                        class="due-param-unit"
                        :options="COUNT_UNIT_OPTS.map((u) => ({ value: u, label: u }))"
                      />
                    </div>
                  </div>
                </section>

                <!-- 临期前提醒 -->
                <section class="step-card">
                  <div class="step-card-head">
                    <div class="step-head-text">
                      <span class="step-title">临期前提醒</span>
                      <span class="step-desc">在到期前按时间节点逐级通知，可配置多条</span>
                    </div>
                    <div class="step-card-actions">
                      <a-button
                        v-if="currentClock.preAlertEnabled"
                        type="link"
                        size="small"
                        class="step-action"
                        @click="addPreAlert"
                      >
                        <template #icon><PlusOutlined /></template>添加提醒
                      </a-button>
                      <a-switch v-model:checked="currentClock.preAlertEnabled" size="small" class="step-switch" />
                    </div>
                  </div>
                  <div v-if="currentClock.preAlertEnabled" class="step-card-body step-card-body--flush">
                    <SlaPreAlertList
                      v-if="currentClock.preAlerts.length"
                      v-model:items="currentClock.preAlerts"
                      :target-opts="targetOpts"
                      :channel-opts="channelOpts"
                      :template-opts="preTemplateOpts"
                      @remove="delPreAlert"
                    />
                    <div v-else class="step-card-body step-card-body--muted">暂无提醒，点「添加提醒」新增</div>
                  </div>
                  <div v-else class="step-card-body step-card-body--muted">
                    已关闭临期前提醒，到期前不发送通知
                  </div>
                </section>

                <!-- 临期预警 -->
                <section class="step-card">
                  <div class="step-card-head">
                    <div class="step-head-text">
                      <span class="step-title">临期预警</span>
                      <span class="step-desc">到达临期判定时立即通知，可配置多条</span>
                    </div>
                    <div class="step-card-actions">
                      <a-button
                        v-if="currentClock.dueAlertEnabled"
                        type="link"
                        size="small"
                        class="step-action"
                        @click="addDueAlert"
                      >
                        <template #icon><PlusOutlined /></template>添加预警
                      </a-button>
                      <a-switch v-model:checked="currentClock.dueAlertEnabled" size="small" class="step-switch" />
                    </div>
                  </div>
                  <div v-if="currentClock.dueAlertEnabled" class="step-card-body step-card-body--flush">
                    <SlaNotifyRuleList
                      v-if="currentClock.dueAlerts.length"
                      v-model:items="currentClock.dueAlerts"
                      tag-prefix="预警"
                      summary="临期时通知"
                      tone="warn"
                      :target-opts="targetOpts"
                      :channel-opts="channelOpts"
                      :template-opts="dueTemplateOpts"
                      @remove="delDueAlert"
                    />
                    <div v-else class="step-card-body step-card-body--muted">暂无预警，点「添加预警」新增</div>
                  </div>
                  <div v-else class="step-card-body step-card-body--muted">
                    已关闭临期预警，到达临期判定时不发送通知
                  </div>
                </section>

                <!-- 超时升级 -->
                <section class="step-card step-card--timeout">
                  <div class="step-card-head">
                    <div class="step-head-text">
                      <span class="step-title">超时升级</span>
                      <span class="step-desc">超时后按「超时后 N 分钟」一次性通知，可配置多条（与临期前同构，非周期催办）</span>
                    </div>
                    <div class="step-card-actions">
                      <a-button
                        v-if="currentClock.timeoutEnabled"
                        type="link"
                        size="small"
                        class="step-action"
                        @click="addTimeoutAlert"
                      >
                        <template #icon><PlusOutlined /></template>添加升级
                      </a-button>
                      <a-switch v-model:checked="currentClock.timeoutEnabled" size="small" class="step-switch" />
                    </div>
                  </div>
                  <div v-if="currentClock.timeoutEnabled" class="step-card-body step-card-body--flush">
                    <SlaNotifyRuleList
                      v-if="currentClock.timeoutAlerts.length"
                      v-model:items="currentClock.timeoutAlerts"
                      tag-prefix="升级"
                      summary="超时通知"
                      tone="danger"
                      :show-after-offset="true"
                      :target-opts="targetOpts"
                      :channel-opts="channelOpts"
                      :template-opts="timeoutTemplateOpts"
                      @remove="delTimeoutAlert"
                    />
                    <div v-else class="step-card-body step-card-body--muted">暂无升级规则，点「添加升级」新增</div>
                  </div>
                  <div v-else class="step-card-body step-card-body--muted">
                    已关闭超时升级，超时后仅标记 SLA 违约，不发送通知
                  </div>
                </section>
              </div>
              </template>
              <div v-else class="alert-empty">
                <div class="alert-empty-icon">⏱</div>
                <p class="alert-empty-title">未启用预警策略</p>
                <p class="alert-empty-text">该时效仅参与 SLA 计时，不触发临期提醒与超时升级</p>
                <a-button size="small" type="primary" ghost @click="alertConfigs[selectedClockKey].enabled = true">启用预警</a-button>
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
.content-card--alert { padding: 0; overflow: hidden; }
.admin-page :deep(.admin-page-header) { margin-bottom: 0; }
.svc-empty { text-align: center; color: #9ca3af; padding: 14px; }
.svc-matrix { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
.svc-matrix th, .svc-matrix td { border: 1px solid #e5e7eb; padding: 6px 10px; font-size: 13px; text-align: center; }
.svc-matrix th { background: #f9fafb; color: #6b7280; font-weight: 600; }
.svc-matrix .rowh { background: #f9fafb; font-weight: 600; color: #111827; }
.svc-matrix .mcell { text-align: left; color: #374151; }
.svc-matrix .uh { color: #9ca3af; font-size: 12px; }
.sec-h { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 12px; padding-left: 10px; border-left: 3px solid #1a6fff; line-height: 1.4; display: flex; align-items: center; }
.cal-h { gap: 8px; flex-wrap: wrap; }
.cal-724 { margin-left: auto; display: flex; align-items: center; gap: 6px; font-weight: 400; }
.makeup-cell { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.makeup-item { display: inline-flex; align-items: center; }
.makeup-del { padding: 0 4px; }
.sec-h.mt2 { margin-top: 24px; }
.intro { font-size: 12px; color: #6b7280; background: #f9fafb; border: 1px solid #f0f0f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; line-height: 1.6; }
.mb { margin-bottom: 14px; } .mt { margin-top: 14px; }
.muted { color: #9ca3af; }
.svc-off-hint { color: #9ca3af; font-size: 12px; line-height: 1.6; }
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
.alert-layout { display: flex; gap: 0; min-height: 560px; }
.clock-nav {
  width: 200px; flex: none; background: #f8fafc; border-right: 1px solid #e5e7eb;
  padding: 12px 0; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; max-height: 72vh;
}
.clock-search { margin: 0 10px 8px; width: calc(100% - 20px); }
.clock-nav-group { margin-bottom: 4px; }
.clock-nav-label { font-size: 11px; font-weight: 600; color: #9ca3af; padding: 6px 12px 4px; letter-spacing: 0.04em; text-transform: uppercase; }
.clock-nav-item {
  display: flex; align-items: center; gap: 8px; margin: 0 8px; padding: 7px 10px; font-size: 13px; color: #374151;
  border-radius: 6px; cursor: pointer; transition: background 0.15s, color 0.15s;
}
.clock-nav-item.off { color: #9ca3af; }
.clock-nav-item:hover { background: #f1f5f9; }
.clock-nav-item.on { background: #eff6ff; color: #1a6fff; box-shadow: inset 0 0 0 1px #bfdbfe; }
.clock-nav-item.on .clock-nav-text { font-weight: 600; }
.clock-nav-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clock-nav-item :deep(.ant-switch) { flex: none; transform: scale(0.88); transform-origin: center right; }

.alert-main { flex: 1; padding: 20px 24px 24px; overflow-y: auto; background: #fafbfc; }
.alert-main-h {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;
}
.alert-title-wrap { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
.alert-group-tag {
  font-size: 11px; font-weight: 600; color: #1a6fff; background: #eff6ff;
  border: 1px solid #bfdbfe; border-radius: 4px; padding: 2px 8px; line-height: 1.4;
}
.alert-title { margin: 0; font-size: 16px; font-weight: 700; color: #111827; line-height: 1.3; }
.alert-status {
  font-size: 12px; font-weight: 500; padding: 2px 10px; border-radius: 999px; line-height: 1.5;
}
.alert-status.on { color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; }
.alert-status.off { color: #9ca3af; background: #f3f4f6; border: 1px solid #e5e7eb; }

.alert-steps { display: flex; flex-direction: column; gap: 14px; }
.step-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); overflow: hidden;
}
.step-card--compact { box-shadow: none; }
.step-card--timeout { border-color: #fde68a; }

.due-judge-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  flex-wrap: wrap;
}
.due-judge-label {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  flex: none;
  white-space: nowrap;
}
.due-radio-group :deep(.ant-radio-wrapper) { font-size: 13px; margin-inline-end: 12px; }
.due-params {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.due-param-text { font-size: 13px; color: #6b7280; }
.due-param-input { width: 64px !important; }
.due-param-unit { width: 72px !important; }

.step-card-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  padding: 14px 16px 0;
}
.step-card-actions {
  display: flex; align-items: center; gap: 4px; flex: none; margin-top: 1px;
}
.step-head-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.step-title { font-size: 14px; font-weight: 600; color: #111827; line-height: 1.4; }
.step-desc { font-size: 12px; color: #9ca3af; line-height: 1.5; }
.step-action { flex: none; font-weight: 500; padding: 0 4px; }
.step-switch { flex: none; }
.step-card-body { padding: 14px 16px 16px; }
.step-card-body--flush { padding-top: 12px; }
.step-card-body--muted {
  padding: 0 16px 14px; font-size: 12px; color: #9ca3af; line-height: 1.6;
}

.alert-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 360px; gap: 6px; text-align: center; padding: 40px 24px;
  background: #fff; border: 1px dashed #e5e7eb; border-radius: 10px;
}
.alert-empty-icon { font-size: 36px; line-height: 1; margin-bottom: 4px; opacity: 0.5; }
.alert-empty-title { margin: 0; font-size: 15px; font-weight: 600; color: #374151; }
.alert-empty-text { margin: 0 0 12px; font-size: 13px; color: #9ca3af; max-width: 320px; line-height: 1.6; }

@media (max-width: 960px) {
  .due-judge-bar { gap: 10px; }
  .due-params { width: 100%; padding-left: 0; }
}
.hd-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
</style>
