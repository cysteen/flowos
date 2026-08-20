<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  ReloadOutlined, DownloadOutlined, SearchOutlined,
  WarningOutlined, PhoneOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { stdPagination } from '@/config/adminUi';
import dayjs, { type Dayjs } from 'dayjs';

type TaskStatus = '待发送' | '静默缓存' | '已投放' | '待反馈' | '已反馈' | '无法触达' | '投放失败' | '已超时' | '免调研';
type Resolved = '解决' | '未解决' | '超时无反馈' | '';
type UnresolvedReason = '没有解决方案' | '解决方案没有用' | '解决方案太复杂' | '没有人联系解决';
type Flow = '调研后结案' | '结案后调研' | '免调研';

interface Row {
  key: string;
  ticketNo: string;
  title: string;
  flow: Flow;
  times: 1 | 2;
  mobile: string;
  status: TaskStatus;
  exemptReason?: string;          // 免调研原因（flow=免调研 时记录，不发短信、工单直接结案）
  resolved: Resolved;             // 是否解决
  unresolvedReasons: UnresolvedReason[]; // 未解决分类（可多选）
  score: number | null;           // 满意度分数
  satisfactionReasons?: string[]; // 满意度评价时勾选的原因标签
  submitAt: string;   // 调研提交时间：工单结案生成调研任务的时刻
  deliverAt: string;  // 调研投放时间：短信实际下发时刻
  feedbackAt: string; // 反馈时间：客户提交问卷时刻
}

const router = useRouter();

/** 工单号 → 工单处理（详情）页 */
function goTicket(ticketNo: string) {
  router.push({ name: 'ticket-operation', params: { ticketNo } });
}

// —— 时间范围：今日 / 7日 / 30日 快捷 + 自定义区间 ——
type RangeKey = 'today' | '7d' | '30d' | 'custom';
const rangeKey = ref<RangeKey>('today');
const customRange = ref<[Dayjs, Dayjs] | null>(null);

/** RangePicker 内置快捷预设 */
const rangePresets = [
  { label: '今日', value: [dayjs().startOf('day'), dayjs().endOf('day')] as [Dayjs, Dayjs] },
  { label: '近 7 日', value: [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')] as [Dayjs, Dayjs] },
  { label: '近 30 日', value: [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')] as [Dayjs, Dayjs] },
];

function onRangeKey(k: RangeKey) {
  rangeKey.value = k;
  if (k !== 'custom') customRange.value = null;
}
function onCustomChange(v: [Dayjs, Dayjs] | null) {
  customRange.value = v;
  if (v) rangeKey.value = 'custom';
}

/** 自定义区间跨越天数（用于估算规模档：短→今日级，中→7日级，长→30日级） */
const scaleKey = computed<'today' | '7d' | '30d'>(() => {
  if (rangeKey.value === 'today') return 'today';
  if (rangeKey.value === '7d') return '7d';
  if (rangeKey.value === '30d') return '30d';
  const r = customRange.value;
  if (!r) return '7d';
  const days = r[1].diff(r[0], 'day') + 1;
  if (days <= 1) return 'today';
  if (days <= 10) return '7d';
  return '30d';
});

const rangeLabel = computed(() => {
  if (rangeKey.value === 'custom' && customRange.value) {
    return `${customRange.value[0].format('MM-DD')} ~ ${customRange.value[1].format('MM-DD')}`;
  }
  return { today: '今日', '7d': '近 7 日', '30d': '近 30 日' }[scaleKey.value];
});

/** 概览漏斗（当前范围快照） */
const FUNNEL_DATA: Record<'today' | '7d' | '30d', Record<string, number>> = {
  today: { 待发送: 128, 已投放: 3412, 待反馈: 891, 已反馈: 2401, 无法触达: 47, 免调研: 236 },
  '7d': { 待发送: 96, 已投放: 22140, 待反馈: 640, 已反馈: 18902, 无法触达: 312, 免调研: 1584 },
  '30d': { 待发送: 74, 已投放: 91580, 待反馈: 520, 已反馈: 82040, 无法触达: 1286, 免调研: 6702 },
};
const funnel = computed(() => FUNNEL_DATA[scaleKey.value]);

/** 反馈结果分布 + 平均满意度 */
const DIST_DATA: Record<'today' | '7d' | '30d', { rows: { label: string; pct: number; tone: string }[]; avgScore: number }> = {
  today: {
    rows: [
      { label: '已解决', pct: 68, tone: 'ok' },
      { label: '未解决·没有解决方案（结案）', pct: 15, tone: 'warn' },
      { label: '未解决·其他（打回重处理）', pct: 12, tone: 'back' },
      { label: '超时无反馈', pct: 5, tone: 'mute' },
    ],
    avgScore: 4.1,
  },
  '7d': {
    rows: [
      { label: '已解决', pct: 71, tone: 'ok' },
      { label: '未解决·没有解决方案（结案）', pct: 14, tone: 'warn' },
      { label: '未解决·其他（打回重处理）', pct: 10, tone: 'back' },
      { label: '超时无反馈', pct: 5, tone: 'mute' },
    ],
    avgScore: 4.2,
  },
  '30d': {
    rows: [
      { label: '已解决', pct: 73, tone: 'ok' },
      { label: '未解决·没有解决方案（结案）', pct: 13, tone: 'warn' },
      { label: '未解决·其他（打回重处理）', pct: 9, tone: 'back' },
      { label: '超时无反馈', pct: 5, tone: 'mute' },
    ],
    avgScore: 4.3,
  },
};
const dist = computed(() => DIST_DATA[scaleKey.value].rows);
const avgScore = computed(() => DIST_DATA[scaleKey.value].avgScore);

const ALERT_DATA: Record<'today' | '7d' | '30d', { key: string; text: string; filter: string }[]> = {
  today: [
    { key: 'fail', text: '投放失败 12 条', filter: '投放失败' },
    { key: 'silent', text: '静默积压 128 条', filter: '静默缓存' },
    { key: '5xx', text: '讯飞接口 5xx 近 1h：3 次', filter: '' },
  ],
  '7d': [
    { key: 'fail', text: '投放失败 34 条', filter: '投放失败' },
    { key: 'silent', text: '静默积压 96 条', filter: '静默缓存' },
  ],
  '30d': [
    { key: 'fail', text: '投放失败 146 条', filter: '投放失败' },
    { key: 'silent', text: '静默积压 74 条', filter: '静默缓存' },
  ],
};
const alerts = computed(() => ALERT_DATA[scaleKey.value]);

const STATUS_TONE: Record<TaskStatus, string> = {
  待发送: 'mute', 静默缓存: 'mute', 已投放: 'blue', 待反馈: 'warn',
  已反馈: 'green', 无法触达: 'red', 投放失败: 'red', 已超时: 'mute',
  免调研: 'mute',
};
const RESOLVED_TONE: Record<Resolved, string> = {
  解决: 'green', 未解决: 'back', 超时无反馈: 'mute', '': 'mute',
};
/** 未解决分类颜色：没有解决方案=结案(灰橙)，其余=打回(紫) */
function reasonTone(r: UnresolvedReason): string {
  return r === '没有解决方案' ? 'warn' : 'back';
}
function scoreTone(s: number | null): string {
  if (s == null) return 'mute';
  if (s >= 4) return 'green';
  if (s === 3) return 'warn';
  return 'red';
}

const SATISFACTION_LABELS: Record<number, string> = {
  1: '非常不满意',
  2: '不满意',
  3: '一般',
  4: '满意',
  5: '非常满意',
};

function satisfactionLabel(score: number | null): string {
  return score == null ? '—' : (SATISFACTION_LABELS[score] ?? '—');
}

const allRows = ref<Row[]>([
  { key: '1', ticketNo: 'TK20260724001', title: '云空间无法领取', flow: '调研后结案', times: 1, mobile: '138****2043', status: '已反馈', resolved: '未解决', unresolvedReasons: ['没有解决方案', '解决方案没有用', '解决方案太复杂', '没有人联系解决'], score: 2, satisfactionReasons: ['问题未得到解决', '业务流程/政策不好', '产品质量差', '产品功能未达预期', '对人员服务不满'], submitAt: '07-23 21:30', deliverAt: '07-24 08:12', feedbackAt: '07-24 10:30' },
  { key: '2', ticketNo: 'TK20260724002', title: '翻译机屏幕显示乱码', flow: '调研后结案', times: 1, mobile: '(全部无效)', status: '无法触达', resolved: '', unresolvedReasons: [], score: null, submitAt: '07-24 09:05', deliverAt: '—', feedbackAt: '—' },
  { key: '3', ticketNo: 'TK20260724003', title: '商机咨询转介绍', flow: '结案后调研', times: 1, mobile: '139****7781', status: '待反馈', resolved: '', unresolvedReasons: [], score: null, submitAt: '07-24 08:15', deliverAt: '07-24 08:15', feedbackAt: '—' },
  { key: '4', ticketNo: 'TK20260724004', title: '文件已上传能否直接转写', flow: '调研后结案', times: 1, mobile: '137****5520', status: '已反馈', resolved: '解决', unresolvedReasons: [], score: 5, submitAt: '07-24 08:10', deliverAt: '07-24 08:10', feedbackAt: '07-24 09:02' },
  { key: '5', ticketNo: 'TK20260724005', title: '会议翻译延迟卡顿', flow: '调研后结案', times: 1, mobile: '135****9087', status: '已超时', resolved: '超时无反馈', unresolvedReasons: [], score: null, submitAt: '07-23 08:20', deliverAt: '07-23 08:20', feedbackAt: '—' },
  { key: '6', ticketNo: 'TK20260724006', title: '导出格式咨询', flow: '调研后结案', times: 1, mobile: '136****3311', status: '投放失败', resolved: '', unresolvedReasons: [], score: null, submitAt: '07-24 10:12', deliverAt: '—', feedbackAt: '—' },
  { key: '7', ticketNo: 'TK20260724007', title: '设备丢失补办咨询', flow: '调研后结案', times: 1, mobile: '138****1120', status: '已反馈', resolved: '未解决', unresolvedReasons: ['没有解决方案'], score: 3, submitAt: '07-24 08:11', deliverAt: '07-24 08:11', feedbackAt: '07-24 11:45' },
  { key: '8', ticketNo: 'TK20260722015', title: '企业接口扩容(二次下送)', flow: '结案后调研', times: 2, mobile: '139****6654', status: '待反馈', resolved: '', unresolvedReasons: [], score: null, submitAt: '07-24 08:00', deliverAt: '07-24 08:14', feedbackAt: '—' },
  { key: '9', ticketNo: 'TK20260724008', title: '蓝牙无法断开连接', flow: '调研后结案', times: 1, mobile: '137****4402', status: '静默缓存', resolved: '', unresolvedReasons: [], score: null, submitAt: '07-23 22:40', deliverAt: '待次日08:00', feedbackAt: '—' },
  { key: '10', ticketNo: 'TK20260724009', title: '开放平台接口咨询', flow: '结案后调研', times: 1, mobile: '135****8890', status: '已反馈', resolved: '解决', unresolvedReasons: [], score: 4, submitAt: '07-24 08:16', deliverAt: '07-24 08:16', feedbackAt: '07-24 12:20' },
  { key: '11', ticketNo: 'TK20260724010', title: '录音笔售后处理态度投诉', flow: '免调研', times: 1, mobile: '—', status: '免调研', exemptReason: '工单类型=投诉', resolved: '', unresolvedReasons: [], score: null, submitAt: '07-24 09:41', deliverAt: '—', feedbackAt: '—' },
  { key: '12', ticketNo: 'TK20260724011', title: '重复来电无实际诉求', flow: '免调研', times: 1, mobile: '—', status: '免调研', exemptReason: '话务性质=骚扰用户-业务骚扰', resolved: '', unresolvedReasons: [], score: null, submitAt: '07-24 10:05', deliverAt: '—', feedbackAt: '—' },
  { key: '13', ticketNo: 'TK20260724012', title: '智慧屏投屏异常', flow: '免调研', times: 1, mobile: '—', status: '免调研', exemptReason: '客户黑名单', resolved: '', unresolvedReasons: [], score: null, submitAt: '07-24 11:22', deliverAt: '—', feedbackAt: '—' },
]);

const filter = reactive({
  ticketNo: '', flow: undefined as string | undefined,
  times: undefined as number | undefined, status: undefined as string | undefined,
  resolved: undefined as string | undefined, reason: undefined as string | undefined,
});

const displayRows = computed(() => allRows.value.filter((r) => {
  if (filter.ticketNo && !r.ticketNo.includes(filter.ticketNo.trim())) return false;
  if (filter.flow && r.flow !== filter.flow) return false;
  if (filter.times && r.times !== filter.times) return false;
  if (filter.status && r.status !== filter.status) return false;
  if (filter.resolved && r.resolved !== filter.resolved) return false;
  if (filter.reason && !r.unresolvedReasons.includes(filter.reason as UnresolvedReason)) return false;
  return true;
}));

// 行勾选（用于导出所选）
const checkedKeys = ref<string[]>([]);
const rowSelection = computed(() => ({
  selectedRowKeys: checkedKeys.value,
  onChange: (keys: (string | number)[]) => { checkedKeys.value = keys as string[]; },
}));

const cols = [
  { title: '工单编号', dataIndex: 'ticketNo', key: 'ticketNo', width: 150 },
  { title: '标题', dataIndex: 'title', key: 'title', width: 190 },
  { title: '调研方式', dataIndex: 'flow', key: 'flow', width: 108 },
  { title: '批次', dataIndex: 'times', key: 'times', width: 60 },
  { title: '触达号码', dataIndex: 'mobile', key: 'mobile', width: 116 },
  { title: '任务状态', dataIndex: 'status', key: 'status', width: 96 },
  { title: '是否解决', dataIndex: 'resolved', key: 'resolved', width: 92 },
  { title: '满意度', dataIndex: 'score', key: 'score', width: 76 },
  { title: '调研提交时间', dataIndex: 'submitAt', key: 'submitAt', width: 120 },
  { title: '调研投放时间', dataIndex: 'deliverAt', key: 'deliverAt', width: 120 },
  { title: '反馈时间', dataIndex: 'feedbackAt', key: 'feedbackAt', width: 120 },
  { title: '操作', key: 'op', width: 130, fixed: 'right' as const },
];

const pagination = computed(() => stdPagination({ pageSize: 20, total: displayRows.value.length }));

/** 概览卡 ↔ 明细列表联动：点卡片按该状态过滤，再点取消 */
function toggleStatus(k: string) {
  filter.status = filter.status === k ? undefined : k;
  if (filter.status) message.success(`已按「${k}」过滤明细`);
}

function applyAlert(f: string) {
  if (!f) { message.info('接口 5xx 为对接层告警，请查看讯飞投放平台日志'); return; }
  filter.status = f;
  message.success(`已按「${f}」过滤明细`);
}

// 详情抽屉
const detailOpen = ref(false);
const detailRow = ref<Row | null>(null);
function openDetail(r: Row) { detailRow.value = r; detailOpen.value = true; }

function toHuman(r: Row) {
  return {
    deliver: r.flow === '免调研'
      ? `（免调研，未调用投放接口）\n免调研原因：${r.exemptReason ?? '—'}`
      : `POST /api/kdxf/open/deliver/t1\n{\n  "ticket_id": "${r.ticketNo}",\n  "ticket_title": "${r.title}",\n  "mobile": "${r.mobile}",\n  "times": ${r.times},\n  "type": 2,\n  "sign": "6efd0bcc2f4cddff…"\n}`,
    callback: r.resolved
      ? `{\n  "ticket_id": "${r.ticketNo}",\n  "record_id": "cc308744606c",\n  "times": ${r.times},\n  "resolved": "${r.resolved}",\n  "unresolved_reasons": ${JSON.stringify(r.unresolvedReasons)},\n  "score": ${r.score ?? 'null'},\n  "satisfaction_option": "${satisfactionLabel(r.score)}",\n  "satisfaction_reasons": ${JSON.stringify(r.satisfactionReasons ?? [])},\n  "time": "${r.feedbackAt}"\n}`
      : '（尚无反馈回调）',
  };
}

function onManualCallback(r: Row) {
  message.success(`已为 ${r.ticketNo} 生成人工回访待办`);
}
function onExport() {
  const n = checkedKeys.value.length || displayRows.value.length;
  const scope = checkedKeys.value.length ? '所选' : '全部';
  message.success(`已导出「${rangeLabel.value}」${scope} ${n} 条明细`);
}
function onReset() { Object.assign(filter, { ticketNo: '', flow: undefined, times: undefined, status: undefined, resolved: undefined, reason: undefined }); }
</script>

<template>
  <div class="survey-monitor">
    <AdminPageHeader
      title="调研监控"
      subtitle="掌握调研投放与反馈进度，异常前置告警；从漏斗到明细核对触达与反馈，工单号直达处理。"
    >
      <template #actions>
        <a-radio-group :value="rangeKey" button-style="solid" size="small" @change="(e: any) => onRangeKey(e.target.value)">
          <a-radio-button value="today">今日</a-radio-button>
          <a-radio-button value="7d">7 日</a-radio-button>
          <a-radio-button value="30d">30 日</a-radio-button>
          <a-radio-button value="custom">自定义</a-radio-button>
        </a-radio-group>
        <a-range-picker
          v-if="rangeKey === 'custom'"
          :value="customRange ?? undefined"
          :presets="rangePresets"
          size="small"
          format="MM-DD"
          class="range-pick"
          @change="(v) => onCustomChange(v as [Dayjs, Dayjs] | null)"
        />
      </template>
    </AdminPageHeader>

    <!-- 上段：概览 -->
    <div class="funnel-row">
      <div
        v-for="(v, k) in funnel" :key="k"
        class="funnel-card" :class="[`fc-${STATUS_TONE[k as TaskStatus]}`, { 'is-active': filter.status === k }]"
        @click="toggleStatus(k as string)"
      >
        <span class="fc-num">{{ v.toLocaleString() }}</span>
        <span class="fc-label">{{ k }}<span v-if="filter.status === k" class="fc-on">筛选中</span></span>
      </div>
    </div>

    <div class="mid-row">
      <div class="dist-card">
        <div class="card-title">
          反馈结果分布
          <span class="avg-score">平均满意度 <b>{{ avgScore }}</b> / 5</span>
        </div>
        <div v-for="d in dist" :key="d.label" class="dist-line">
          <span class="dl-label">{{ d.label }}</span>
          <div class="dl-bar"><div class="dl-fill" :class="`bar-${d.tone}`" :style="{ width: `${d.pct}%` }" /></div>
          <span class="dl-pct">{{ d.pct }}%</span>
        </div>
      </div>
      <div class="alert-card">
        <div class="card-title"><WarningOutlined /> 异常告警</div>
        <div v-if="alerts.length" class="alert-list">
          <div v-for="a in alerts" :key="a.key" class="alert-line">
            <span class="al-dot" />
            <span class="al-text">{{ a.text }}</span>
            <a class="al-link" @click="applyAlert(a.filter)">查看</a>
          </div>
        </div>
        <div v-else class="alert-empty">当前范围无异常</div>
      </div>
    </div>

    <!-- 下段：明细 -->
    <div class="detail-card">
      <div class="filter-bar">
        <a-input v-model:value="filter.ticketNo" placeholder="工单编号" allow-clear class="f-input" size="small" />
        <a-select v-model:value="filter.flow" placeholder="调研方式" allow-clear size="small" class="f-sel" :options="[{ value: '调研后结案' }, { value: '结案后调研' }, { value: '免调研' }]" />
        <a-select v-model:value="filter.times" placeholder="批次" allow-clear size="small" class="f-sel-sm" :options="[{ value: 1, label: '1（首次）' }, { value: 2, label: '2（二次）' }]" />
        <a-select v-model:value="filter.status" placeholder="任务状态" allow-clear size="small" class="f-sel" :options="['待发送','静默缓存','已投放','待反馈','已反馈','无法触达','投放失败','已超时','免调研'].map((v) => ({ value: v }))" />
        <a-select v-model:value="filter.resolved" placeholder="是否解决" allow-clear size="small" class="f-sel-sm" :options="['解决','未解决','超时无反馈'].map((v) => ({ value: v }))" />
        <a-select v-model:value="filter.reason" placeholder="未解决分类" allow-clear size="small" class="f-sel" :options="['没有解决方案','解决方案没有用','解决方案太复杂','没有人联系解决'].map((v) => ({ value: v }))" />
        <a-button size="small" @click="onReset"><template #icon><ReloadOutlined /></template>重置</a-button>
        <span class="fb-spacer" />
        <span v-if="checkedKeys.length" class="fb-selinfo">已选 {{ checkedKeys.length }} 条</span>
        <a-button size="small" type="primary" ghost @click="onExport">
          <template #icon><DownloadOutlined /></template>{{ checkedKeys.length ? `导出所选（${checkedKeys.length}）` : '导出全部' }}
        </a-button>
      </div>

      <a-table
        :columns="cols"
        :data-source="displayRows"
        row-key="key"
        :row-selection="rowSelection"
        :pagination="pagination"
        size="middle"
        :scroll="{ x: 1430 }"
      >
        <template #bodyCell="{ column, record }">
          <a v-if="column.key === 'ticketNo'" class="cell-link" @click="goTicket((record as Row).ticketNo)">{{ (record as Row).ticketNo }}</a>
          <span v-else-if="column.key === 'times'">{{ (record as Row).times === 2 ? '二次' : '首次' }}</span>
          <span v-else-if="column.key === 'status'" class="tag" :class="`t-${STATUS_TONE[(record as Row).status]}`">{{ (record as Row).status }}</span>
          <span v-else-if="column.key === 'resolved'">
            <span v-if="(record as Row).resolved" class="tag" :class="`t-${RESOLVED_TONE[(record as Row).resolved]}`">{{ (record as Row).resolved }}</span>
            <span v-else class="muted">—</span>
          </span>
          <span v-else-if="column.key === 'score'">
            <span v-if="(record as Row).score != null" class="tag" :class="`t-${scoreTone((record as Row).score)}`">{{ (record as Row).score }} 分</span>
            <span v-else class="muted">—</span>
          </span>
          <span v-else-if="column.key === 'mobile'" :class="{ 'invalid-num': (record as Row).mobile.includes('无效') }">{{ (record as Row).mobile }}</span>
          <div v-else-if="column.key === 'op'" class="row-ops">
            <a-button type="link" size="small" @click="openDetail(record as Row)">详情</a-button>
            <a-button
              v-if="(record as Row).status === '无法触达' || (record as Row).status === '投放失败'"
              type="link" size="small" @click="onManualCallback(record as Row)"
            ><template #icon><PhoneOutlined /></template>转人工</a-button>
          </div>
        </template>
      </a-table>
    </div>

    <!-- 详情抽屉 -->
    <a-drawer v-model:open="detailOpen" title="调研任务详情" :width="520" placement="right">
      <template v-if="detailRow">
        <a-descriptions :column="1" size="small" bordered class="d-desc">
          <a-descriptions-item label="工单编号"><a class="cell-link" @click="goTicket(detailRow.ticketNo)">{{ detailRow.ticketNo }}</a></a-descriptions-item>
          <a-descriptions-item label="标题">{{ detailRow.title }}</a-descriptions-item>
          <a-descriptions-item label="分流">{{ detailRow.flow }}</a-descriptions-item>
          <a-descriptions-item label="投放批次">{{ detailRow.times === 2 ? '批次 2（二次下送工单）' : '批次 1（首次）' }}</a-descriptions-item>
          <a-descriptions-item label="触达号码">{{ detailRow.mobile }}</a-descriptions-item>
          <a-descriptions-item label="任务状态"><span class="tag" :class="`t-${STATUS_TONE[detailRow.status]}`">{{ detailRow.status }}</span></a-descriptions-item>
          <a-descriptions-item v-if="detailRow.exemptReason" label="免调研原因">{{ detailRow.exemptReason }}</a-descriptions-item>
          <a-descriptions-item label="是否解决">{{ detailRow.resolved || '—' }}</a-descriptions-item>
          <a-descriptions-item label="未解决分类">
            <div v-if="detailRow.unresolvedReasons.length" class="survey-reason-tags">
              <span
                v-for="reason in detailRow.unresolvedReasons"
                :key="reason"
                class="tag"
                :class="`t-${reasonTone(reason)}`"
              >{{ reason }}</span>
            </div>
            <span v-else>—</span>
          </a-descriptions-item>
          <a-descriptions-item label="满意度分数">{{ detailRow.score != null ? `${detailRow.score} 分` : '—' }}</a-descriptions-item>
          <a-descriptions-item label="满意度选项">{{ satisfactionLabel(detailRow.score) }}</a-descriptions-item>
          <a-descriptions-item label="评价标签">
            <div v-if="detailRow.satisfactionReasons?.length" class="survey-reason-tags">
              <span v-for="reason in detailRow.satisfactionReasons" :key="reason" class="survey-reason-tag">{{ reason }}</span>
            </div>
            <span v-else>—</span>
          </a-descriptions-item>
          <a-descriptions-item label="调研提交时间">{{ detailRow.submitAt }}</a-descriptions-item>
          <a-descriptions-item label="调研投放时间">{{ detailRow.deliverAt }}</a-descriptions-item>
          <a-descriptions-item label="反馈时间">{{ detailRow.feedbackAt }}</a-descriptions-item>
        </a-descriptions>

        <div class="d-block">
          <div class="d-block-title">投放报文</div>
          <pre class="d-pre">{{ toHuman(detailRow).deliver }}</pre>
        </div>
        <div class="d-block">
          <div class="d-block-title">反馈回调报文</div>
          <pre class="d-pre">{{ toHuman(detailRow).callback }}</pre>
        </div>
        <a class="d-log-link" @click="goTicket(detailRow.ticketNo)">查看工单处理履历 →</a>
      </template>
    </a-drawer>
  </div>
</template>

<style scoped>
.survey-monitor { padding: 16px 20px; }

.funnel-row { display: flex; gap: 12px; margin-bottom: 14px; }
.funnel-card {
  flex: 1; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 16px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
  border-left: 3px solid #d1d5db; cursor: pointer; transition: all .15s;
}
.funnel-card:hover { box-shadow: 0 2px 8px rgb(0 0 0 / 8%); transform: translateY(-1px); }
.funnel-card.is-active { border-color: #1a6fff; box-shadow: 0 0 0 2px rgb(26 111 255 / 12%); }
.fc-num { font-size: 26px; font-weight: 700; color: #111827; line-height: 1; font-variant-numeric: tabular-nums; }
.fc-label { font-size: 13px; color: #6b7280; display: inline-flex; align-items: center; gap: 6px; }
.fc-on {
  font-size: 10px; color: #1a6fff; background: #eff6ff; border-radius: 8px;
  padding: 0 6px; height: 16px; line-height: 16px;
}
.fc-mute { border-left-color: #9ca3af; }
.fc-blue { border-left-color: #1a6fff; }
.fc-warn { border-left-color: #d97706; }
.fc-green { border-left-color: #16a34a; }
.fc-red { border-left-color: #dc2626; }
.fc-red .fc-num { color: #dc2626; }

.mid-row { display: flex; gap: 12px; margin-bottom: 14px; }
.dist-card { flex: 1.6; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 18px; }
.alert-card { flex: 1; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 18px; }
.card-title { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 14px; display: flex; align-items: center; gap: 6px; }
.avg-score { margin-left: auto; font-size: 12px; font-weight: 400; color: #6b7280; }
.avg-score b { color: #16a34a; font-size: 14px; }
.card-title :deep(.anticon) { color: #d97706; }

.dist-line { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.dist-line:last-child { margin-bottom: 0; }
.dl-label { font-size: 12px; color: #6b7280; width: 180px; flex: none; }
.dl-bar { flex: 1; height: 8px; background: #f1f2f4; border-radius: 4px; overflow: hidden; }
.dl-fill { height: 100%; border-radius: 4px; }
.bar-ok { background: #16a34a; }
.bar-warn { background: #d97706; }
.bar-back { background: #7c3aed; }
.bar-mute { background: #9ca3af; }
.dl-pct { font-size: 12px; color: #374151; width: 36px; text-align: right; font-variant-numeric: tabular-nums; }

.alert-list { display: flex; flex-direction: column; gap: 12px; }
.alert-line { display: flex; align-items: center; gap: 8px; }
.al-dot { width: 8px; height: 8px; border-radius: 50%; background: #dc2626; flex: none; }
.al-text { flex: 1; font-size: 13px; color: #374151; }
.al-link { font-size: 12px; color: #1a6fff; cursor: pointer; }
.al-link:hover { text-decoration: underline; }
.alert-empty { font-size: 13px; color: #9ca3af; padding: 8px 0; }

.detail-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
.filter-bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #f0f2f5; flex-wrap: wrap; }
.fb-spacer { flex: 1 1 auto; }
.fb-selinfo { font-size: 12px; color: #1a6fff; white-space: nowrap; }
.f-input { width: 150px; }
.f-sel { width: 118px; }
.f-sel-sm { width: 100px; }
.range-pick { width: 220px; }

.detail-card :deep(.ant-table-thead > tr > th) { background: #fff; color: #6b7280; font-size: 12px; font-weight: 600; }
.detail-card :deep(.ant-table-tbody > tr > td) { font-size: 13px; color: #374151; }
.cell-link { color: #1a6fff; }
.cell-link:hover { text-decoration: underline; }
.muted { color: #cbd5e1; }
.invalid-num { color: #dc2626; }
.row-ops { display: inline-flex; align-items: center; }
.row-ops :deep(.ant-btn-link) { padding: 0 6px; }

.tag { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
.t-mute { color: #6b7280; background: #f3f4f6; }
.t-blue { color: #1a6fff; background: #eff6ff; }
.t-warn { color: #d97706; background: #fffbeb; }
.t-green { color: #16a34a; background: #f0fdf4; }
.t-red { color: #dc2626; background: #fef2f2; }
.t-back { color: #7c3aed; background: #f5f3ff; }

.d-desc { margin-bottom: 16px; }
.d-desc :deep(.ant-descriptions-item-label) { width: 120px; color: #6b7280; }
.survey-reason-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.survey-reason-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #f9fafb;
  color: #4b5563;
  font-size: 12px;
  line-height: 20px;
}
.d-block { margin-bottom: 14px; }
.d-block-title { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
.d-pre {
  margin: 0; padding: 10px 12px; background: #f9fafb; border: 1px solid #eef0f2; border-radius: 8px;
  font-size: 12px; color: #4b5563; line-height: 1.6; white-space: pre-wrap; word-break: break-all;
  font-family: 'Consolas', monospace;
}
.d-log-link { color: #1a6fff; font-size: 13px; cursor: pointer; }
.d-log-link:hover { text-decoration: underline; }
</style>
