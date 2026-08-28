<script setup lang="ts">
// 风险监控 —— 从《【915】运营监控大盘》模块四拆出独立立项（D7a）
//
// 【一期范围】仅支持风险词命中；系统不做双轨交叉定级，打标时由人填风险等级 + 命中判定。
//   ① 识别 —— 关键字（及后续语义算子）命中风险词即产生命中记录
//   ② 打标 —— 核实「成立/误报」并标注高/中/低危（默认沿用词表预设，可改）
//   ③ 下游 —— 高危且成立后给「去管控」入口（基线 ※27，人点、系统不自动管控）
//   ④ 词表改进 —— 命中判定回填规则准确率
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DatePicker, message } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import { ReloadOutlined, ArrowRightOutlined, RightOutlined, SearchOutlined, SettingOutlined, HistoryOutlined, CheckOutlined, UnorderedListOutlined, DownOutlined, TagOutlined, TagsOutlined, EditOutlined, SaveOutlined, FilterOutlined } from '@ant-design/icons-vue';
import MetricTipIcon from '@/components/MetricTipIcon.vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import AppPagination from '@/components/AppPagination.vue';
import { opsTip } from '@/mock/opsMonitorTips';
import { useUserStore } from '@/stores/user';
import { RISK_TAG_ROLES, RISK_WORD_MAINTAIN_ROLES } from '@/config/roles';
import { getOpsScopeSelectGroups, type OpsScope } from '@/mock/opsMonitor';
import {
  RISK_LEVEL_STYLE,
  RISK_WORDS,
  DISPOSAL_BY_GRADE,
  accuracyOf,
  wordOnlyRiskHitsOf,
  runManualScan,
  SCAN_FIELDS,
  SCAN_NODE_STATUS_OPTIONS,
  SCAN_TICKET_TYPES,
  SCAN_BUSINESS_TYPES,
  SCAN_PRODUCT_CATEGORIES,
  defaultScanCriteria,
  type RiskHit,
  type RiskWord,
  type RiskLevel,
  type HitVerdict,
  type ScanCriteria,
  type ScanResultRow,
} from '@/mock/opsReport';
import { PRODUCT_NAMES } from '@/views/tickets/types/createTicket';

const RangePicker = DatePicker.RangePicker;

const route = useRoute();
const router = useRouter();
const user = useUserStore();

// ---- 监控范围：固定全中心，页内不提供范围切换（筛查条内可另选班组） ----
//
// 【清单的两层选择】视图（看哪一批）× 视图内条件（这批里筛哪些），两层各归其位。
// 视图回答的是「看待核实的、还是已核实的」，视图内条件回答的是「这批里挑等级 / 挑核实结果」。
//
// 【为什么只有一个状态变量】这里一度并存两个：上方 KPI 卡驱动的「域」（全部/待核实/已核实）
// 与清单卡头驱动的「页签」（实时监控/手动筛查/已核实），两者只做了部分同步。
// 后果是页签标签与清单内容当场对不上——点 KPI「发现 19」把域切成全部、页签却停在实时监控，
// 于是标签写着「实时监控 15」、表里躺着 19 行。**一块屏上同一件事只能有一个真源**，
// 两套状态机不管同步得多勤，都会在某条路径上分叉；故合并成 listView 这一个。
//
// 【为什么取消「全部」域】业务已拍板。"待核实 + 已核实"混在一屏，人既不能照着它干活
// （里面一半是干完的），也不能拿它交代成果（里面一半还没判）；而它偏偏又是等级 chip
// 唯一需要变口径的场合——chip 底表得随域在"全部"与"待核实"之间跳。
// 取消之后，chip 底表恒为待核实，数字不再有两个口径。
//
// 【为什么核实结果不是一个视图】成立/误报和等级一样，都是**在已核实这批里再收窄**，
// 与视图不是一个层级。把它摆成视图，会让人以为点「确认是风险」是和点「高危」平级的动作，
// 实则前者换了整批数据、后者只是筛。降到台账查询条里当一个筛选项后，
// 层级关系就直白了：先选批（页签），再筛条件（chip / 查询条）。
/** 清单主视图：实时监控（待核实）/ 手动筛查 / 已核实 —— 页签与两张可点 KPI 卡同一个状态 */
type ListView = 'realtime' | 'scan' | 'judged';
// 视图内的等级条件，只在实时监控视图生效。
// 🔴 原先另有一个 'pending'（高危待核），它与 '高' **筛出的是同一批数据**——
// 实时监控视图本身已排除已核实的，「高危」在这里就是「高危待核」。
// 那个 chip 是「打标即出队」改动前的遗留（当时"高危"含已核实的，两者才有别），
// 2026-08-26 删除，红色告警态与深链 ?pending=1 一并并入 '高'。
type GradeFilter = 'all' | RiskLevel;
/** 清单唯一的视图状态：页签、KPI 卡、成效卡的核实结果按钮全读写它 */
const listView = ref<ListView>('realtime');
/** 视图内的等级选择。大盘点「待打标」卡下钻时预置为高危 */
const gradeFilter = ref<GradeFilter>(route.query.pending === '1' ? '高' : 'all');
/** 已核实视图才需要台账查询条：只有这批记录会被事后点查 */
const inLedger = computed(() => listView.value === 'judged');
const scope = computed<OpsScope>(() => 'all');
const scopeSelectGroups = getOpsScopeSelectGroups();
function filterScopeOption(input: string, option: { label?: string }) {
  const q = input.trim().toLowerCase();
  if (!q) return true;
  return (option.label ?? '').toLowerCase().includes(q);
}
function scopeTagPlaceholder(omittedValues: unknown[]) { return `+${omittedValues.length} 组`; }
function compactTagPlaceholder(omittedValues: unknown[]) { return `已选 ${omittedValues.length}`; }

// ---- 扫库记录（实时监控 + 手动筛查） ----
type ScanRunKind = 'realtime' | 'manual';
type ScanRunStatus = 'success' | 'failed' | 'abnormal';

interface ScanRun {
  id: string;
  /** 实时监控 · 手动筛查 */
  kind: ScanRunKind;
  /** 触发人：系统 或 坐席姓名 */
  triggerBy: string;
  startedAt: string;
  endedAt: string;
  status: ScanRunStatus;
  errorMessage?: string;
  /** 手动筛查：套用了已保存筛选器则记名，否则为空 */
  filterName?: string;
  /** 手动筛查：完整条件摘要；实时监控：扫描范围说明 */
  criteriaText?: string;
  /** 手动筛查 · 成功 */
  total?: number;
  fresh?: number;
  adopted?: number;
  highAdopted?: number;
  /** 实时监控 · 成功 */
  hitCount?: number;
  openCount?: number;
}

const SCAN_RUN_LS_KEY = 'flowos-risk-scan-runs';
/** 种子版本：变更 DEFAULT_SCAN_RUNS 时递增，强制刷新演示数据 */
const SCAN_RUN_SEED_VERSION = 2;
const SCAN_RUN_VERSION_KEY = 'flowos-risk-scan-runs-v';

/**
 * 扫库记录演示样例 —— 覆盖实时监控 / 手动筛查 × 成功 / 失败 / 异常，
 * 以及「无新增」「有新增未并入」「有新增已并入」等结果口径。
 */
const DEFAULT_SCAN_RUNS: ScanRun[] = [
  // —— 实时监控 ——
  { id: 'run-seed-01', kind: 'realtime', triggerBy: '系统', startedAt: '2026-08-04 14:30:02', endedAt: '2026-08-04 14:30:08', status: 'success', hitCount: 19, openCount: 15 },
  { id: 'run-seed-02', kind: 'realtime', triggerBy: '王坐席', startedAt: '2026-08-04 13:20:00', endedAt: '2026-08-04 13:20:06', status: 'success', hitCount: 19, openCount: 15 },
  { id: 'run-seed-03', kind: 'realtime', triggerBy: '系统', startedAt: '2026-08-04 10:00:01', endedAt: '2026-08-04 10:00:07', status: 'success', hitCount: 17, openCount: 12 },
  { id: 'run-seed-04', kind: 'realtime', triggerBy: '系统', startedAt: '2026-08-03 14:00:00', endedAt: '2026-08-03 14:00:06', status: 'abnormal', errorMessage: '部分班组数据延迟，结果可能不完整', hitCount: 12, openCount: 8 },
  { id: 'run-seed-05', kind: 'realtime', triggerBy: '系统', startedAt: '2026-08-03 08:00:00', endedAt: '2026-08-03 08:00:02', status: 'failed', errorMessage: '实时扫描中断，请检查词表与连接' },
  { id: 'run-seed-06', kind: 'realtime', triggerBy: '系统', startedAt: '2026-08-02 18:00:00', endedAt: '2026-08-02 18:00:05', status: 'success', hitCount: 14, openCount: 9 },
  // —— 手动筛查 · 成功 ——
  { id: 'run-seed-07', kind: 'manual', triggerBy: '郑监控', startedAt: '2026-08-04 13:55:11', endedAt: '2026-08-04 13:56:42', status: 'success', filterName: '高危词专项', total: 47, fresh: 3, adopted: 2, highAdopted: 2 },
  { id: 'run-seed-08', kind: 'manual', triggerBy: '李文萍', startedAt: '2026-08-04 11:08:33', endedAt: '2026-08-04 11:12:18', status: 'success', total: 128, fresh: 0, adopted: 0 },
  { id: 'run-seed-09', kind: 'manual', triggerBy: '秦督导', startedAt: '2026-08-26 13:28:41', endedAt: '2026-08-26 13:29:06', status: 'success', total: 2, fresh: 0, adopted: 0 },
  { id: 'run-seed-10', kind: 'manual', triggerBy: '孙坐席', startedAt: '2026-08-03 16:20:44', endedAt: '2026-08-03 16:24:01', status: 'success', total: 86, fresh: 5, adopted: 4, highAdopted: 1 },
  { id: 'run-seed-11', kind: 'manual', triggerBy: '郑监控', startedAt: '2026-08-03 10:15:22', endedAt: '2026-08-03 10:18:55', status: 'success', filterName: '教育产线近30天', total: 203, fresh: 7, adopted: 6, highAdopted: 2 },
  { id: 'run-seed-12', kind: 'manual', triggerBy: '周坐席', startedAt: '2026-08-02 15:33:08', endedAt: '2026-08-02 15:35:41', status: 'success', total: 56, fresh: 3, adopted: 0 },
  { id: 'run-seed-13', kind: 'manual', triggerBy: '秦督导', startedAt: '2026-08-02 09:12:18', endedAt: '2026-08-02 09:14:52', status: 'success', filterName: '受理一组在办', total: 34, fresh: 2, adopted: 2, highAdopted: 1 },
  // —— 手动筛查 · 失败 ——
  { id: 'run-seed-14', kind: 'manual', triggerBy: '郑监控', startedAt: '2026-08-04 09:42:15', endedAt: '2026-08-04 09:42:16', status: 'failed', errorMessage: '词表服务超时，请稍后重试' },
  { id: 'run-seed-15', kind: 'manual', triggerBy: '秦督导', startedAt: '2026-08-01 17:05:33', endedAt: '2026-08-01 17:05:34', status: 'failed', errorMessage: '筛查执行失败，请稍后重试' },
];

function nowStamp(withSeconds = false): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return withSeconds ? `${base}:${p(d.getSeconds())}` : base;
}

function normalizeScanRun(raw: Record<string, unknown>): ScanRun {
  if (raw.kind === 'realtime' || raw.kind === 'manual') {
    // 已是新结构，原样放行。Record<string, unknown> 与 ScanRun 在 TS 看来没有重叠，
    // 这里的窄化依据是运行时的 kind 判断，故须经 unknown 中转。
    return raw as unknown as ScanRun;
  }
  const at = String(raw.at ?? nowStamp());
  return {
    id: String(raw.id ?? `run-${Date.now()}`),
    kind: 'manual',
    triggerBy: String(raw.by ?? '—'),
    startedAt: at,
    endedAt: at,
    status: 'success',
    filterName: raw.filterName as string | undefined,
    criteriaText: String(raw.criteriaText ?? ''),
    total: Number(raw.total ?? 0),
    fresh: Number(raw.fresh ?? 0),
    adopted: Number(raw.adopted ?? 0),
    highAdopted: Number(raw.highAdopted ?? 0),
  };
}

function loadScanRuns(): ScanRun[] {
  try {
    const ver = localStorage.getItem(SCAN_RUN_VERSION_KEY);
    if (Number(ver) !== SCAN_RUN_SEED_VERSION) {
      localStorage.setItem(SCAN_RUN_VERSION_KEY, String(SCAN_RUN_SEED_VERSION));
      localStorage.removeItem(SCAN_RUN_LS_KEY);
    }
    const raw = localStorage.getItem(SCAN_RUN_LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p) && p.length) return p.map((r) => normalizeScanRun(r as Record<string, unknown>));
    }
  } catch { /* ignore */ }
  return [...DEFAULT_SCAN_RUNS];
}

const scanRuns = ref<ScanRun[]>(loadScanRuns());
const pendingManualRunId = ref<string | null>(null);
/**
 * 扫库记录按开始时刻倒序。数组本身只按写入顺序追加，种子里 8/26 那条排在 8/4 之后——
 * 直接取首条会把一条旧执行当成"上次执行"，这个时刻是人判断"数据新不新"的唯一依据，不能错。
 */
const scanRunsDesc = computed(
  () => [...scanRuns.value].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
);
const lastRefresh = computed(() => scanRunsDesc.value[0]?.endedAt ?? '—');

function persistScanRuns() {
  try { localStorage.setItem(SCAN_RUN_LS_KEY, JSON.stringify(scanRuns.value.slice(0, 50))); } catch { /* ignore */ }
}

function appendScanRun(run: ScanRun) {
  scanRuns.value = [run, ...scanRuns.value].slice(0, 50);
  persistScanRuns();
}

const runsOpen = ref(false);

const SCAN_KIND_LABEL: Record<ScanRunKind, string> = { realtime: '实时监控', manual: '手动筛查' };
const SCAN_STATUS_LABEL: Record<ScanRunStatus, string> = { success: '成功', failed: '失败', abnormal: '异常' };

function scanRunResultText(r: ScanRun): string {
  const filterTag = r.filterName ? `${r.filterName} · ` : '';
  if (r.status === 'failed') return r.errorMessage ?? '执行失败';
  if (r.status === 'abnormal') {
    const hint = r.errorMessage ?? '执行异常';
    if (r.kind === 'realtime' && r.hitCount != null) {
      return `${hint}（发现 ${r.hitCount} · 待核实 ${r.openCount ?? 0}）`;
    }
    return hint;
  }
  if (r.kind === 'realtime') {
    return `${filterTag}发现 ${r.hitCount ?? 0} · 待核实 ${r.openCount ?? 0}`;
  }
  const parts = [`扫出 ${r.total ?? 0}`, `新命中 ${r.fresh ?? 0}`];
  if (r.adopted) parts.push(`并入 ${r.adopted}${r.highAdopted ? `（高危 ${r.highAdopted}）` : ''}`);
  else if (r.fresh) parts.push('未并入');
  else parts.push('无新增风险');
  return filterTag + parts.join(' · ');
}

// ---- 手动批量筛查 ----
// 选范围 + 选词 → 对存量工单跑一遍 → 结果**就在同一张命中清单里**呈现 → 人确认后并入。
//
// 【为什么不用侧边抽屉】抽屉把结果放进另一张表，与命中清单割裂——同一批数据两套表头、
// 两套操作。改为沿用工作台的 query-filters 就地筛选条：条件在清单上方展开，
// 结果直接渲染进清单本体，列与交互完全一致。
//
// 【为什么仍保留"确认并入"】筛查是对存量的一次性扫描，「孩子」那类词一扫上百条，
// 直接入库会把待核实队列淹没且不可逆。故结果先以「待并入」态呈现在清单里，勾选后才落。
const scanBarOpen = computed(() => listView.value === 'scan');
const scanning = ref(false);
const scanResult = ref<ScanResultRow[] | null>(null);
/** 结果里勾选要入库的行；重复项默认不勾 */
const scanPicked = ref<Set<string>>(new Set());
/** 已确认入库的筛查命中，与实时命中并入同一份清单 */
const scanAdopted = ref<RiskHit[]>([]);
/** 清单当前是不是在展示筛查结果 */
const inScanResult = computed(() => scanResult.value !== null);

function today(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const scanForm = ref<ScanCriteria>(defaultScanCriteria({ to: today() }));

const scanProductNameOptions = computed(() => {
  const cats = scanForm.value.productCategories;
  if (!cats.length) {
    return [...new Set(Object.values(PRODUCT_NAMES).flat())];
  }
  return [...new Set(cats.flatMap((c) => PRODUCT_NAMES[c] ?? []))];
});

watch(
  () => scanForm.value.productCategories,
  (cats) => {
    const allowed = cats.length
      ? [...new Set(cats.flatMap((c) => PRODUCT_NAMES[c] ?? []))]
      : [...new Set(Object.values(PRODUCT_NAMES).flat())];
    scanForm.value.productNames = scanForm.value.productNames.filter((n) => allowed.includes(n));
  },
);

function buildScanPresetRange(days: number): [Dayjs, Dayjs] {
  const end = dayjs().startOf('day');
  const start = end.subtract(days - 1, 'day');
  return [start, end];
}

const scanRangePresets = computed(() => [
  { label: '最近一周', value: buildScanPresetRange(7) },
  { label: '最近一个月', value: buildScanPresetRange(30) },
  { label: '最近三个月', value: buildScanPresetRange(90) },
]);

const scanDateRange = computed((): [Dayjs, Dayjs] | undefined => {
  const { from, to } = scanForm.value;
  if (!from || !to) return undefined;
  return [dayjs(from), dayjs(to)];
});

function onScanDateRangeChange(
  dates: [Dayjs, Dayjs] | [string, string] | null,
  dateStrings: [string, string],
) {
  if (!dates?.[0] || !dates?.[1]) {
    scanForm.value.from = '';
    scanForm.value.to = '';
    return;
  }
  scanForm.value.from = dateStrings[0] || dayjs(dates[0]).format('YYYY-MM-DD');
  scanForm.value.to = dateStrings[1] || dayjs(dates[1]).format('YYYY-MM-DD');
}


/**
 * 切视图。页签、KPI 卡、成效卡的核实结果按钮**全部走这里**，
 * 保证"换一批数据"这件事只有一套语义：
 *   ① 进已核实视图时把查询条复位到默认 30 天窗口，视图内互切则保留已填条件；
 *   ② 等级一律复位——带着"高危"进新视图大概率直接空列表，人会误以为没数据。
 */
function setListView(v: ListView) {
  if (v === 'judged' && listView.value !== 'judged') resetLedgerFilter();
  // 单工单焦点跨视图取数，切视图时若留着它，页签写着「已核实 5」而表里躺着别的一批
  clearTicketFocus();
  listView.value = v;
  gradeFilter.value = 'all';
}

function doScan() {
  /*
   * 建单时间区间不允许无界（PRD §8.3.1 / §9 规则 42）。
   *
   * 【为什么单挑这一个维度拦】其余八维留空的含义是"不限"，扫出来无非多几条；
   * 时间留空却是**对全库做一次扫描**——而这个功能的产出是"新命中"，
   * 「孩子」那类通用词一扫上百条，一次失手就把待核实队列淹没，且并入之后收不回来。
   *
   * 【为什么日期控件已经不给清除、这里还要再拦一道】去掉清除按钮只挡住了鼠标那一条路：
   * 条件还会被套用筛选器、被重置逻辑、被将来任何一处新入口整体灌进来。
   * 守卫必须落在"执行"这个唯一出口上，而不是落在某一个控件上。
   */
  if (!scanForm.value.from || !scanForm.value.to) {
    message.warning('请先选定建单时间区间的起止日期，筛查不支持不限时间');
    return;
  }
  scanning.value = true;
  const t0 = Date.now();
  const startedAt = nowStamp(true);
  try {
    // 词表与判重底表都从页面当前状态传进去：扫的必须是人此刻在下拉里看到的那份词，
    // 判重也必须认这一会话已经并入的行，否则同样条件再扫一次会把它们当新命中重报一遍。
    const rows = runManualScan(scanForm.value, {
      words: localWords.value,
      adopted: scanAdopted.value,
    });
    scanResult.value = rows;
    scanPicked.value = new Set(rows.filter((r) => !r.duplicated).map((r) => r.hit.id));
    const runId = `run-${Date.now()}`;
    pendingManualRunId.value = runId;
    // 模拟扫描耗时，避免开始/结束时刻完全相同
    const elapsed = Math.max(800, Date.now() - t0);
    const endedAt = dayjs(t0 + elapsed).format('YYYY-MM-DD HH:mm:ss');
    appendScanRun({
      id: runId,
      kind: 'manual',
      triggerBy: user.current.name,
      startedAt,
      endedAt,
      status: 'success',
      // 套用了哪个筛选器要记下来：事后翻扫库记录，「按什么扫的」靠它才答得出，
      // 手工调过条件的执行则不记名（appliedFilterName 在条件被改动的那一刻就清掉了）。
      filterName: appliedFilterName.value ?? undefined,
      criteriaText: scanSummary.value,
      total: rows.length,
      fresh: rows.filter((r) => !r.duplicated).length,
      adopted: 0,
      highAdopted: 0,
    });
  } catch {
    appendScanRun({
      id: `run-${Date.now()}`,
      kind: 'manual',
      triggerBy: user.current.name,
      startedAt,
      endedAt: dayjs(t0 + Math.max(500, Date.now() - t0)).format('YYYY-MM-DD HH:mm:ss'),
      status: 'failed',
      errorMessage: '筛查执行失败，请稍后重试',
      criteriaText: scanSummary.value,
    });
    message.error('筛查执行失败');
  } finally {
    scanning.value = false;
  }
}

function toggleScanPick(id: string) {
  const s = new Set(scanPicked.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  scanPicked.value = s;
}

/** 已在清单中的行 id——这些在结果里置灰、不可勾，避免同一条记两遍 */
const scanDupIds = computed(
  () => new Set((scanResult.value ?? []).filter((r) => r.duplicated).map((r) => r.hit.id)),
);
const scanFreshCount = computed(() => (scanResult.value ?? []).filter((r) => !r.duplicated).length);
const scanDupCount = computed(() => (scanResult.value ?? []).filter((r) => r.duplicated).length);
const scanAllPicked = computed(() => {
  const list = (scanResult.value ?? []).filter((r) => !r.duplicated);
  return list.length > 0 && list.every((r) => scanPicked.value.has(r.hit.id));
});
function toggleScanPickAll() {
  const list = (scanResult.value ?? []).filter((r) => !r.duplicated);
  scanPicked.value = scanAllPicked.value ? new Set() : new Set(list.map((r) => r.hit.id));
}

function adoptScan() {
  const picked = (scanResult.value ?? []).filter((r) => scanPicked.value.has(r.hit.id));
  if (!picked.length) { message.warning('请先勾选要并入清单的命中'); return; }
  const known = new Set(scanAdopted.value.map((h) => h.id));
  const fresh = picked.map((r) => r.hit).filter((h) => !known.has(h.id));
  scanAdopted.value = [...scanAdopted.value, ...fresh];
  // 回填到本次任务记录：结果陈述靠它
  const runId = pendingManualRunId.value;
  if (runId) {
    scanRuns.value = scanRuns.value.map((r) => (
      r.id === runId
        ? {
            ...r,
            adopted: (r.adopted ?? 0) + fresh.length,
            highAdopted: (r.highAdopted ?? 0) + fresh.filter((h) => h.level === '高').length,
          }
        : r
    ));
    persistScanRuns();
  }
  // 陈述实际入库条数而不是勾选条数：两者不等时（勾的已经在清单里）报勾选数就是句假话，
  // 人会以为这批已经进队列了，回头在待核实里找不到又说不清哪儿丢的。
  if (!fresh.length) {
    message.info('所勾选的命中都已在清单中，本次没有新增');
  } else {
    message.success(`已并入 ${fresh.length} 条命中，可按等级处置`);
  }
  exitScanResult();
}

/** 退出筛查结果态，清单回到常规命中 */
function exitScanResult() {
  scanResult.value = null;
  scanPicked.value = new Set();
  pendingManualRunId.value = null;
}

function resetScanForm() {
  scanForm.value = defaultScanCriteria({ to: today() });
  // 重置的是条件本身，套用关系跟着一起断：条件都换回默认了还挂着筛选器名，
  // 这次执行会被记到那个筛选器名下，事后照名字复现不出同一批结果。
  appliedFilterName.value = null;
  exitScanResult();
}

/** 条件摘要（人话）——扫完看到数字得知道是按什么扫的，筛选器 chip 的悬停说明也用它 */
function criteriaSummaryOf(f: ScanCriteria): string {
  const parts: string[] = [];
  parts.push(f.groupIds.length ? `${f.groupIds.length} 个班组` : '全中心');
  parts.push(`${f.from} 至 ${f.to}`);
  parts.push(f.wordIds.length ? `${f.wordIds.length} 条词` : '全部启用中的词');
  parts.push(f.matchScopes.length ? f.matchScopes.join('/') : '按词表范围');
  parts.push(f.nodeStatuses.length
    ? (f.nodeStatuses.length <= 3 ? f.nodeStatuses.join('/') : `${f.nodeStatuses.length} 个子状态`)
    : '不限状态');
  if (f.ticketTypes.length) parts.push(f.ticketTypes.join('/'));
  if (f.businessTypes.length) parts.push(f.businessTypes.join('/'));
  if (f.productCategories.length) parts.push(f.productCategories.join('/'));
  if (f.productNames.length) parts.push(f.productNames.join('/'));
  return parts.join(' · ');
}
const scanSummary = computed(() => criteriaSummaryOf(scanForm.value));

// ---- 已保存筛选器（PRD §8.3.4） ----
// 专项排查的常态是「每周照同样的条件跑一遍」。九个维度每次重填，慢是其次——
// 漏勾的那一项不会报错，只会让这周扫出的条数与上周对不上，而人还以为是数据变了。
// 条件存得下来，这次与上次才是同一把尺子。
//
// 【为什么点 chip 就直接执行，不是"先套用再点开始"】拆成两步，人每周都要多点一次；
// 而套用与执行之间本来就没有需要再确认的东西——要改条件的人根本不会去点 chip。
//
// 【为什么同名覆盖而不是追加】筛选器是靠名字被认出来的。允许两条「教育线安全事故专项」，
// 下次点的人无从判断哪条是调过的那一条，结果是两条都不敢用，等于一条都没存。
//
// 【为什么与工作台的「保存筛选器」各存各的】两者绑的条件结构完全不同——工作台绑工单查询条件，
// 这里绑九个筛查维度。共用一份存储，套过来的条件在对面一项也对不上。
interface SavedScanFilter {
  id: string;
  name: string;
  criteria: ScanCriteria;
}

function cloneCriteria(c: ScanCriteria): ScanCriteria {
  // 数组逐个复制：直接引用的话，存下来之后人再动一下多选框，
  // 已保存的那条会跟着一起变——存的东西会被后来的操作偷偷改写，这是最难查的一类错。
  return {
    ...c,
    groupIds: [...c.groupIds],
    wordIds: [...c.wordIds],
    matchScopes: [...c.matchScopes],
    nodeStatuses: [...c.nodeStatuses],
    ticketTypes: [...c.ticketTypes],
    businessTypes: [...c.businessTypes],
    productCategories: [...c.productCategories],
    productNames: [...c.productNames],
  };
}

/** 两套条件是不是同一把尺子。多选项比较前先排序：勾选先后不改变条件本身 */
function sameCriteria(a: ScanCriteria, b: ScanCriteria): boolean {
  const key = (c: ScanCriteria) => JSON.stringify([
    c.from, c.to,
    [...c.groupIds].sort(), [...c.wordIds].sort(), [...c.matchScopes].sort(),
    [...c.nodeStatuses].sort(), [...c.ticketTypes].sort(), [...c.businessTypes].sort(),
    [...c.productCategories].sort(), [...c.productNames].sort(),
  ]);
  return key(a) === key(b);
}

/**
 * 起手就有的两条专项条件——扫库记录里「高危词专项」「教育产线近30天」两次执行正是按它们跑的。
 * 记录里记着名字、条件却找不回来，那两次扫描就复现不了，而「按什么扫的」正是记录存在的理由。
 */
function seedSavedFilters(): SavedScanFilter[] {
  return [
    {
      id: 'sf-high-words',
      name: '高危词专项',
      criteria: defaultScanCriteria({ to: today(), wordIds: ['w1', 'w3', 'w4'] }),
    },
    {
      id: 'sf-edu-30d',
      name: '教育产线近30天',
      criteria: defaultScanCriteria({ from: today(-29), to: today(), groupIds: ['edu'] }),
    },
  ];
}

const savedFilters = ref<SavedScanFilter[]>(seedSavedFilters());
/** 当前条件是套用哪条筛选器来的。扫库记录的「所用规则」记的就是它，手工调过即为空 */
const appliedFilterName = ref<string | null>(null);

// 条件一旦被人改动，套用关系当场作废。留着名字的话，本次执行会被记到那个筛选器名下，
// 而它扫的其实是另一套条件——事后照名字复现，出来的是第三批结果。
watch(scanForm, () => {
  const name = appliedFilterName.value;
  if (!name) return;
  const f = savedFilters.value.find((x) => x.name === name);
  if (!f || !sameCriteria(f.criteria, scanForm.value)) appliedFilterName.value = null;
}, { deep: true });

const filterSaveOpen = ref(false);
const filterNameDraft = ref('');
/** 命名与已有的撞上时先说清「会覆盖」，别让人保存完才发现旧的没了 */
const filterNameTaken = computed(() => {
  const name = filterNameDraft.value.trim();
  return !!name && savedFilters.value.some((f) => f.name === name);
});

function openSaveFilter() {
  // 存一条起止为空的条件，等于把一次全库扫描做成一键可复发的按钮——比手工失手更危险
  if (!scanForm.value.from || !scanForm.value.to) {
    message.warning('请先选定建单时间区间的起止日期，再保存筛选器');
    return;
  }
  filterNameDraft.value = appliedFilterName.value ?? '';
  filterSaveOpen.value = true;
}

function confirmSaveFilter() {
  const name = filterNameDraft.value.trim();
  if (!name) { message.warning('请为这条筛选器命名'); return; }
  if (!scanForm.value.from || !scanForm.value.to) {
    message.warning('请先选定建单时间区间的起止日期，再保存筛选器');
    return;
  }
  const criteria = cloneCriteria(scanForm.value);
  const idx = savedFilters.value.findIndex((f) => f.name === name);
  if (idx >= 0) {
    // 覆盖保留原 id：chip 的位置不动，人下次还在原地找得到它
    const next = [...savedFilters.value];
    next[idx] = { ...next[idx], criteria };
    savedFilters.value = next;
    message.success(`已用当前条件覆盖筛选器「${name}」`);
  } else {
    savedFilters.value = [...savedFilters.value, { id: `sf-${Date.now()}`, name, criteria }];
    message.success(`已保存筛选器「${name}」，点它即按此条件筛查`);
  }
  appliedFilterName.value = name;
  filterSaveOpen.value = false;
}

/** 套用即执行：条件整套灌回表单，随即跑一次 */
function applySavedFilter(f: SavedScanFilter) {
  if (scanning.value) return;
  scanForm.value = cloneCriteria(f.criteria);
  // 先落名字再执行：doScan 要拿它记进扫库记录
  appliedFilterName.value = f.name;
  doScan();
}

/**
 * 删除。PRD 只写了「chip 上直接删」，但它是必需的：存了删不掉，chip 行会越积越长，
 * 常用的那两条被埋在一堆一次性条件里，等于把这个功能自己用废。
 */
function removeSavedFilter(f: SavedScanFilter) {
  savedFilters.value = savedFilters.value.filter((x) => x.id !== f.id);
  if (appliedFilterName.value === f.name) appliedFilterName.value = null;
  message.success(`已删除筛选器「${f.name}」`);
}

// ---- 命中列表 ----
const allHits = computed(() => {
  const live = wordOnlyRiskHitsOf(scope.value);
  if (!scanAdopted.value.length) return live;
  return [...live, ...scanAdopted.value].sort((a, b) => b.when.localeCompare(a.when));
});
const rows = computed(() => allHits.value);
/** 这条是不是手动筛查并进来的——列表上标一下，来源要可追 */
function isFromScan(h: RiskHit): boolean {
  return h.id.startsWith('scan-');
}

const GRADE_ORDER: Record<RiskLevel, number> = { 高: 0, 中: 1, 低: 2 };

// ---- 同单互见（PRD §6.7 / 规则 26b） ----
// 一行还是一条命中，**不按工单合并**：一条规则一条证据，各自独立核实、各自回填准确率。
// 合并成一行会让其中一条永远拿不到结论，那条规则的准确率就永远算不出来。
//
// 🔴 但不合并 ≠ 互不相干。客户从「退一赔三」升级到「12315」是**措辞在爬坡**，
// 比一个客户单次说 12315 严重得多——而这个判断只有把两条摆在一起才做得出来。
// 核实第二条的人若看不到第一条判成了什么，他手上的信息就只有孤零零一句威胁，
// 于是把一次升级当成一次寻常抱怨。故行内标「本单另有 N 条」、打标弹窗顶部列同单结论。
const hitsByTicket = computed(() => {
  const m = new Map<string, RiskHit[]>();
  rows.value.forEach((h) => {
    const list = m.get(h.ticketNo);
    if (list) list.push(h);
    else m.set(h.ticketNo, [h]);
  });
  // 同单内按命中时刻正序：爬坡是一条时间线，倒着读读不出"先说了什么、后说了什么"
  m.forEach((list) => list.sort((a, b) => a.when.localeCompare(b.when)));
  return m;
});
function ticketHitsOf(no: string): RiskHit[] {
  return hitsByTicket.value.get(no) ?? [];
}
/** 同一张单上除本条外的其它命中，供打标弹窗对照 */
function siblingsOf(h: RiskHit): RiskHit[] {
  return ticketHitsOf(h.ticketNo).filter((x) => x.id !== h.id);
}
function siblingCountOf(h: RiskHit): number {
  return Math.max(0, ticketHitsOf(h.ticketNo).length - 1);
}

/**
 * 工单级风险等级 ＝ max(该单已核实且判定为「成立」的命中等级)（PRD §4.9 / 规则 13a）。
 *
 * 【为什么取 max 而不是最新一条】一张单先命中「12315」被判高危、随后命中一条低危规则，
 * 按"最新一条"算这张单会在**没有任何人做出降级判断**的情况下自己变成低危——
 * 等级降下来了，风险没有降。取 max 即棘轮：后到的低等级不覆盖已定的高等级。
 * （改判是例外，也只是例外：那背后有一条明确的人工修正，等级跟着人的判断走，不是跟着到达顺序走。）
 *
 * 【为什么误报与未核实不参与】误报的结论恰恰是"这里没有风险"，让它抬高工单等级等于
 * 把已排除的东西重新算进来；未核实的还没有人的判断，它另有自己的告警口径（待核实高危）。
 *
 * 【为什么不落库】纯派生。落成字段就要维护它与命中记录的一致性，而每一次核实、
 * 每一次修正都会改它——多存一份就是多一处会对不上的地方。每次读取现算。
 */
function ticketGradeOf(ticketNo: string): RiskLevel | null {
  let best: RiskLevel | null = null;
  for (const h of ticketHitsOf(ticketNo)) {
    if (verdictOf(h) !== '成立') continue;
    const g = gradeOf(h);
    if (!g) continue;
    if (!best || GRADE_ORDER[g] < GRADE_ORDER[best]) best = g;
  }
  return best;
}
/**
 * 行内要不要提示工单级等级。**只在工单级严格高于本条自己的等级时提示**——
 * 同级时再写一遍"本单当前 X 危"，说的是同一件事，属纯噪音。
 * 误报行没有等级：它自己不代表风险，但本单可能已被别的证据定成高危，这时更该提示。
 */
function ticketGradeHint(h: RiskHit): RiskLevel | null {
  const tg = ticketGradeOf(h.ticketNo);
  if (!tg) return null;
  const own = gradeOf(h);
  if (!own) return tg;
  return GRADE_ORDER[tg] < GRADE_ORDER[own] ? tg : null;
}

/**
 * 只看某一张单的全部命中。
 * 【为什么它必须跨视图】同单两条命中常常一条已核实、一条还在待核——
 * 这正是要对照的场合。焦点态若仍受视图约束，人点开「本单另有 N 条」只会看到其中一半，
 * 而他想看的恰恰是另一半。故焦点一旦落下，视图与视图内条件全部让位。
 */
const ticketFocus = ref<string | null>(null);
function focusTicket(no: string) {
  ticketFocus.value = ticketFocus.value === no ? null : no;
}
function clearTicketFocus() {
  ticketFocus.value = null;
}

// ---- 台账查询 ----
// 台账（已核实的记录）最主要的用法是**事后点查**：客户几个月后捅到 12315，
// 要当场答出"当时发现了吗、谁核实的、判成什么"。只能翻不能查，等于答不出来。
//
// 【与手动筛查的区别】手动筛查是拿条件去扫**存量工单**产生新命中（发现），
// 这里是在**已有命中记录**里回溯（查证）。两者形态像、目标反，故各自独立一套条件，不复用。
interface LedgerFilter {
  /** 工单号或客户名，模糊匹配任一 */
  keyword: string;
  /**
   * 核实结果。它与 level 同层——都是在「已核实」这批里再收窄，
   * 故摆在查询条第一位，而不是像早先那样单独占一个域。
   */
  verdict: 'all' | HitVerdict;
  level: 'all' | RiskLevel;
  from: string;
  to: string;
  groupIds: string[];
  /** 按规则主词，与统计口径一致 */
  words: string[];
  taggers: string[];
}
/** 默认窗口 30 天：台账是只增不减的永久记录，全量默认会让点查一开始就淹在历史里 */
const LEDGER_WINDOW_DAYS = 30;
function defaultLedgerFilter(): LedgerFilter {
  return {
    keyword: '',
    verdict: 'all',
    level: 'all',
    from: today(-(LEDGER_WINDOW_DAYS - 1)),
    to: today(),
    groupIds: [],
    words: [],
    taggers: [],
  };
}
const ledgerFilter = ref<LedgerFilter>(defaultLedgerFilter());

const ledgerDateRange = computed((): [Dayjs, Dayjs] | undefined => {
  const { from, to } = ledgerFilter.value;
  if (!from || !to) return undefined;
  return [dayjs(from), dayjs(to)];
});
const ledgerRangePresets = computed(() => [
  { label: '近 30 天', value: buildScanPresetRange(30) },
  { label: '近 90 天', value: buildScanPresetRange(90) },
  { label: '近一年', value: buildScanPresetRange(365) },
]);
function onLedgerRangeChange(
  dates: [Dayjs, Dayjs] | [string, string] | null,
  dateStrings: [string, string],
) {
  if (!dates?.[0] || !dates?.[1]) {
    ledgerFilter.value.from = '';
    ledgerFilter.value.to = '';
    return;
  }
  ledgerFilter.value.from = dateStrings[0] || dayjs(dates[0]).format('YYYY-MM-DD');
  ledgerFilter.value.to = dateStrings[1] || dayjs(dates[1]).format('YYYY-MM-DD');
}

/**
 * 已核实视图的全部记录（未过筛选）——既是查询底表，也是下拉项的取值来源。
 * 底表含成立与误报两类：成立/误报是查询条里的一个筛选项，不再各占一个视图。
 */
const ledgerBase = computed(() => {
  if (listView.value !== 'judged') return [];
  return rows.value.filter((h) => !!verdictOf(h));
});

/** 下拉项一律从台账记录本身派生：只列真出现过的值，选了必有结果 */
function uniqOptions(pairs: Array<[string, string]>) {
  const seen = new Map<string, string>();
  pairs.forEach(([value, label]) => { if (value && !seen.has(value)) seen.set(value, label); });
  return [...seen].map(([value, label]) => ({ value, label }));
}
const ledgerGroupOptions = computed(() =>
  uniqOptions(ledgerBase.value.map((h) => [h.groupId, h.groupName])),
);
const ledgerWordOptions = computed(() =>
  uniqOptions(ledgerBase.value.map((h) => [h.word, h.word])),
);
const ledgerTaggerOptions = computed(() =>
  uniqOptions(ledgerBase.value.map((h) => {
    const by = traceOf(h)?.by ?? '';
    return [by, by] as [string, string];
  })),
);

function applyLedgerFilter(list: RiskHit[]): RiskHit[] {
  const f = ledgerFilter.value;
  const kw = f.keyword.trim().toLowerCase();
  return list.filter((h) => {
    if (f.verdict !== 'all' && verdictOf(h) !== f.verdict) return false;
    if (kw && !h.ticketNo.toLowerCase().includes(kw) && !h.customer.toLowerCase().includes(kw)) return false;
    // 误报没有等级（gradeOf 返回 null），故选定任一具体等级时它一律不匹配。
    // 让它落进某一档等于承认"误报也是风险，只是低一点"，与准确率的口径直接打架。
    if (f.level !== 'all' && gradeOf(h) !== f.level) return false;
    // 时间锚在**命中时刻**而非打标时刻：点查问的是"当时有没有发现"
    const day = h.when.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (f.groupIds.length && !f.groupIds.includes(h.groupId)) return false;
    if (f.words.length && !f.words.includes(h.word)) return false;
    if (f.taggers.length && !f.taggers.includes(traceOf(h)?.by ?? '')) return false;
    return true;
  });
}

/** 当前时间窗口的人话说法——空态必须把它讲出来，否则"没查到"会被当成"当时没发现" */
const ledgerRangeText = computed(() => {
  const f = ledgerFilter.value;
  if (!f.from && !f.to) return '不限时间';
  const base = `${f.from || '不限'} 至 ${f.to || '不限'}`;
  if (!f.from || !f.to) return base;
  const span = dayjs(f.to).diff(dayjs(f.from), 'day') + 1;
  return f.to === today() ? `${base}（近 ${span} 天）` : base;
});

const ledgerFilterDirty = computed(() => {
  const f = ledgerFilter.value;
  const d = defaultLedgerFilter();
  return !!f.keyword.trim() || f.verdict !== 'all' || f.level !== 'all' || f.from !== d.from || f.to !== d.to
    || !!f.groupIds.length || !!f.words.length || !!f.taggers.length;
});

function resetLedgerFilter() {
  ledgerFilter.value = defaultLedgerFilter();
}

function applyLedgerQuery() {
  hitPageCurrent.value = 1;
}

/**
 * 清单数据源。筛查结果与常规命中**共用同一张表**——
 * 列、排序、判定依据的呈现完全一致，只是筛查态多一列勾选。
 */
const filteredRows = computed(() => {
  if (inScanResult.value) {
    return (scanResult.value ?? []).map((r) => r.hit)
      .sort((a, b) => {
        const d = gradeRank(a) - gradeRank(b);
        return d !== 0 ? d : b.when.localeCompare(a.when);
      });
  }
  let list = rows.value;
  if (ticketFocus.value) {
    // 焦点态按命中时刻正序：这一屏读的是"这张单上先后发生了什么"，倒序会把爬坡读反
    return rows.value
      .filter((h) => h.ticketNo === ticketFocus.value)
      .sort((a, b) => a.when.localeCompare(b.when));
  }
  if (inLedger.value) {
    // 已核实视图：核实成立 / 误报的，出待办队列但**不删除**——
    // 它是这个岗位"发现了什么"的证据，也是复盘与准确率的依据。
    // 视图已定，核实结果与等级等条件只在视图内收窄，不会把人拽去别的批次。
    list = applyLedgerFilter(ledgerBase.value);
  } else {
    // 实时监控视图：已核实的出队，否则待核实归零了清单还是那么长，
    // 监控岗每天打开看到的全是自己上周处理完的，很快就没人看了。
    list = list.filter((h) => !isJudged(h));
    if (gradeFilter.value !== 'all') {
      list = list.filter((h) => gradeOf(h) === gradeFilter.value);
    }
  }
  return [...list].sort((a, b) => {
    const ra = gradeRank(a);
    const rb = gradeRank(b);
    if (ra !== rb) return ra - rb;
    if (gradeOf(a) === '高') {
      const ua = isJudged(a) ? 1 : 0;
      const ub = isJudged(b) ? 1 : 0;
      if (ua !== ub) return ua - ub;
    }
    // 同级同状态时按命中时刻倒序：不给末位判据，排序就取决于数组的写入顺序，
    // 同一份数据两次进来可能给出两个次序，翻页时行会跳。
    return b.when.localeCompare(a.when);
  });
});

const hitPageCurrent = ref(1);
/** 与分页器的可选每页条数保持一致：给一个下拉里根本选不回来的值，人一改就回不去了 */
const hitPageSize = ref(10);

const pagedRows = computed(() => {
  const start = (hitPageCurrent.value - 1) * hitPageSize.value;
  return filteredRows.value.slice(start, start + hitPageSize.value);
});

function setHitPage(page: number, size: number) {
  hitPageCurrent.value = page;
  hitPageSize.value = size;
}

watch([listView, gradeFilter, ledgerFilter, scanResult, inScanResult, scope, ticketFocus], () => {
  hitPageCurrent.value = 1;
}, { deep: true });

/** 视图内选等级：只换视图内条件，视图不动——早先它会把人拽回待核实那批，等于等级与视图互斥 */
function setGradeFilter(g: GradeFilter) {
  // 焦点是比等级更强的一层收窄，两者叠着会让 chip 上的数字与表里的行数对不上——
  // 人点「高危 5」却只看到 1 行，说不清是筛没了还是数错了。选等级即退出焦点。
  clearTicketFocus();
  gradeFilter.value = g;
}

/**
 * 列表展示等级。已核实的取核实结果，否则取词表预设。
 * 判为**误报的返回 null**：误报是"规则捞错了"，不是"风险很低"——
 * 回落到词表预设去冒充一个等级，界面上就会同时挂着「高风险」与「误报」两个互相打架的标签。
 */
function gradeOf(h: RiskHit): RiskLevel | null {
  const e = latestEntryOf(h);
  return e ? e.level : h.level;
}

/** 排序用的等级序位：没有等级的（误报）排在同批末尾，它不该混进风险的轻重排队里 */
function gradeRank(h: RiskHit): number {
  const g = gradeOf(h);
  return g ? GRADE_ORDER[g] : 3;
}

/** 词表预设等级（打标前参考值） */
function presetGradeOf(h: RiskHit): RiskLevel {
  return h.level;
}

const GRADES: RiskLevel[] = ['高', '中', '低'];

// ---- 命中的三种状态 ----
// 核实 ≠ 处置。打标做的是**核实**：判断这条命中是不是真风险、定个级。
// 早先把「打标即出队」实现成「进已处置」，于是误报和真风险混在一个池子里，
// 「已处置」这个词也名不副实——里面躺着的其实是"已核实的"。按状态三分理清：
//   ① 待核实  ——系统命中，还没人判
//   ② 确认是风险——核实成立，三级都算，风险监控到此交棒，处置在工单侧
//   ③ 误报    ——核实不成立，是规则问题不是风险，**不进风险统计**
// 注意这三种是**数据状态**，不等于清单的三个视图：②③ 同属「已核实」这一批，
// 在视图内靠核实结果这个筛选项区分；把它们各摆一个视图，正是早先层级错位的由来。
//
// 「判过没有」一律看 isJudged，不看有没有等级：误报是判过的，但它没有等级，
// 用 gradeOf 当判据会让所有误报重新掉回待核实队列里。
const openHits = computed(() => rows.value.filter((h) => !isJudged(h)));
const confirmedHits = computed(() => rows.value.filter((h) => verdictOf(h) === '成立'));
const falseHits = computed(() => rows.value.filter((h) => verdictOf(h) === '误报'));

/**
 * 等级 chip 的底表恒为待核实。chip 只在实时监控视图出现，那里看的就是待核实这一批——
 * 「全部」域取消后底表不再有第二种口径，chip 上的数字与点进去的行数永远对得上。
 */
const gradeBase = computed(() => openHits.value);
/** 等级分布：chip 上的数字现算，与清单同口径 */
const gradeCount = computed<Record<RiskLevel, number>>(() => ({
  高: gradeBase.value.filter((h) => gradeOf(h) === '高').length,
  中: gradeBase.value.filter((h) => gradeOf(h) === '中').length,
  低: gradeBase.value.filter((h) => gradeOf(h) === '低').length,
}));
/**
 * 确认是风险的等级分布——成效条要回答"等级如何"。
 * 底表只含成立的，而成立必定带等级，故这里不会出现无等级的行，三档之和恒等于成立数。
 */
const confirmedByGrade = computed<Record<RiskLevel, number>>(() => ({
  高: confirmedHits.value.filter((h) => gradeOf(h) === '高').length,
  中: confirmedHits.value.filter((h) => gradeOf(h) === '中').length,
  低: confirmedHits.value.filter((h) => gradeOf(h) === '低').length,
}));

// ---- 监控成效 ----
// 需求分析表 D 块定义了「命中条数 / 命中成立数 / 规则准确率」三个指标，
// 但此前没有任何落点。打标即出队之后更需要它——待办清空了，
// 这个岗位这段时间到底发现了什么、判准了没有，全靠这一组数说话。
const effect = computed(() => {
  const total = rows.value.length;
  const valid = confirmedHits.value.length;
  const falsePositive = falseHits.value.length;
  const judged = valid + falsePositive;
  return {
    total,
    judged,
    valid,
    falsePositive,
    open: openHits.value.length,
    // 准确率分母用**已判定数**，不用命中数——还没核实的不该拉低它（需求分析表 D-3）
    accuracy: judged ? valid / judged : null,
  };
});

// ---- 打标（核实）与修正 ----
// 打标即「已核实」，它本身就是确认动作，不另设复核角色、不加审批。
// 但核实结果**必须可改**：判错了却改不了，台账里就永久躺着一条错的定论，
// 而台账正是事后被追问时唯一能拿出来的东西。故同一个弹窗既用于首次核实，也用于修正。
//
// 留痕从「只存最后一次」改为**可追加的修正历史**：只留最新值答不出
// "改过没有、从什么改成什么、为什么改"，复盘时链条是断的。
// 第 1 条＝首次核实，之后每次修正各追加一条；末条即当前生效值。
type TagEntry = {
  /**
   * 本次判定的风险等级。判为**误报时为 null**——PRD 口径是"误报没有等级"，
   * 不是"等级为低"。弹窗里等级区在选误报时已置灰，值也必须跟着不落，
   * 否则台账里躺着一条既是「高风险」又是「误报」的记录，事后没人说得清它到底算什么。
   */
  level: RiskLevel | null;
  verdict: HitVerdict;
  note: string;
  by: string;
  /**
   * 打标人当时的角色（基线 §3.1）。姓名回答"是谁"，角色回答"他有多少分量"——
   * 客诉专员判的和投诉督导判的，复盘时的采信度与改判成本都不一样。
   */
  byRole: string;
  at: string;
  /** 本次修正的理由。首次核实没有这一项。字段名与 PRD §6.3 一致 */
  amendReason?: string;
};
/** 每条命中的核实历史，按时间正序 */
const localTags = ref<Record<string, TagEntry[]>>({});
const canRiskTag = computed(() => RISK_TAG_ROLES.includes(user.roleKey));

/**
 * 数据源里带来的首次核实，作为历史的第 1 条并回展示，否则修正记录会从半截开始。
 * 判据是 verdict 而不是 tagged：误报本来就不该带等级，用等级当"判过没有"的判据，
 * 会把已核实为误报的记录整批漏掉。
 */
function seedEntryOf(h: RiskHit): TagEntry | undefined {
  if (!h.verdict) return undefined;
  return {
    level: h.verdict === '误报' ? null : (h.tagged ?? h.level),
    verdict: h.verdict,
    note: h.taggedNote ?? '',
    by: h.taggedBy ?? '—',
    byRole: h.taggedByRole ?? '—',
    at: h.taggedAt ?? '—',
  };
}
function historyOf(h: RiskHit): TagEntry[] {
  const seed = seedEntryOf(h);
  const appended = localTags.value[h.id] ?? [];
  return seed ? [seed, ...appended] : appended;
}
/**
 * 当前生效的核实结果＝历史末条。等级、判定、准确率一律从这里取——
 * 准确率的分子分母都来自 verdict，取错版本整组数就失真，故只留这一个取值口。
 */
function latestEntryOf(h: RiskHit): TagEntry | undefined {
  const list = historyOf(h);
  return list.length ? list[list.length - 1] : undefined;
}

const tagOpen = ref(false);
const tagTarget = ref<RiskHit | null>(null);
const tagLevel = ref<RiskLevel>('高');
const tagVerdict = ref<HitVerdict | undefined>(undefined);
const tagNote = ref('');
/** 本次修正的理由。修正必填——只记改前改后而不记为什么，复盘时链条仍是断的 */
const tagReason = ref('');
/** 已核实过的再打开就是修正：标题、按钮文案与必填项都随之不同 */
const tagAmend = ref(false);
const tagHistory = computed(() => (tagTarget.value ? historyOf(tagTarget.value) : []));
const tagCurrent = computed(() => (tagTarget.value ? latestEntryOf(tagTarget.value) : undefined));
/**
 * 同单的其它命中及其结论——弹窗里位置最靠前的一块，排在「本次命中」这个必填项之上。
 * 【为什么必须靠前】它不是佐证，是**做这次判断的前提**：本条是不是一次升级、
 * 客户是第几次加码，答案全在别的命中里。摆到底部与修正记录并列，等于让人先下结论再看依据。
 */
const tagSiblings = computed(() => (tagTarget.value ? siblingsOf(tagTarget.value) : []));
/** 本单当前风险等级——同一块区域一并给出，人不必自己把几条等级在心里取一次 max */
const tagTicketGrade = computed(
  () => (tagTarget.value ? ticketGradeOf(tagTarget.value.ticketNo) : null),
);
/**
 * 本次真正会落库的等级。误报一律落 null——等级单选还留着上一次的选中态，
 * 拿它当"改动了"的依据的话，把成立改判成误报后再点一次某个等级，
 * 界面会认为又变了一次，历史里就多出一条什么都没改的修正。
 */
const tagLevelToSave = computed<RiskLevel | null>(
  () => (tagVerdict.value === '误报' ? null : tagLevel.value),
);
/** 值没变就不该追加一条空修正，否则历史会被无意义的记录稀释 */
const tagDirty = computed(() => {
  const cur = tagCurrent.value;
  if (!cur) return true;
  return tagVerdict.value !== cur.verdict
    || tagLevelToSave.value !== cur.level
    || tagNote.value.trim() !== cur.note;
});
const canSaveTag = computed(() => {
  if (!canRiskTag.value || !tagVerdict.value) return false;
  if (tagAmend.value) return tagDirty.value && !!tagReason.value.trim();
  return true;
});

function openTag(h: RiskHit) {
  if (!canRiskTag.value) { message.warning('只有客诉专员与投诉督导可以打标'); return; }
  tagTarget.value = h;
  const cur = latestEntryOf(h);
  tagAmend.value = !!cur;
  tagLevel.value = cur?.level ?? h.level;
  tagVerdict.value = cur?.verdict;
  tagNote.value = cur?.note ?? '';
  tagReason.value = '';
  tagOpen.value = true;
}
function saveTag() {
  const target = tagTarget.value;
  if (!target) return;
  if (!canRiskTag.value) { message.warning('无打标权限'); return; }
  if (!tagVerdict.value) { message.warning('请先判定本次命中是否成立'); return; }
  if (tagAmend.value && !tagDirty.value) { message.warning('核实结果没有变化，无需修正'); return; }
  if (tagAmend.value && !tagReason.value.trim()) { message.warning('请填写修正原因'); return; }
  const entry: TagEntry = {
    level: tagLevelToSave.value,
    verdict: tagVerdict.value,
    note: tagNote.value.trim(),
    by: user.current.name,
    byRole: user.role.name,
    at: nowStamp(),
    ...(tagAmend.value ? { amendReason: tagReason.value.trim() } : {}),
  };
  // 追加而不覆盖
  localTags.value = {
    ...localTags.value,
    [target.id]: [...(localTags.value[target.id] ?? []), entry],
  };
  message.success(
    tagAmend.value
      ? `已修正 ${target.ticketNo} 的核实结果为「${entry.verdict}」，本次修正已留痕`
      : entry.verdict === '误报'
        ? `已记为误报，将计入规则准确率`
        : `已对 ${target.ticketNo} 打标「${tagLevel.value}风险」`,
  );
  tagOpen.value = false;
}
/** 等级的人话说法：误报没有等级，说清"无等级"而不是留空，否则读不出这次改的是什么 */
function levelText(l: RiskLevel | null): string {
  return l ? `${l}危` : '无等级';
}
/** 两次核实之间实际改了什么——修正记录要能直接读出"从 X 改成 Y" */
function entryDiffText(prev: TagEntry, next: TagEntry): string {
  const parts: string[] = [];
  if (prev.verdict !== next.verdict) parts.push(`判定 ${prev.verdict} → ${next.verdict}`);
  if (prev.level !== next.level) parts.push(`等级 ${levelText(prev.level)} → ${levelText(next.level)}`);
  if (prev.note !== next.note) parts.push(next.note ? '处置备注已更新' : '处置备注已清空');
  return parts.join(' · ');
}
/** 这条判过没有。等级可以为空（误报），判定不会，故"判过没有"只认它 */
function isJudged(h: RiskHit): boolean {
  return !!latestEntryOf(h);
}
/** 现行核实结果里的等级；误报为 null，未核实为 undefined */
function tagOf(h: RiskHit): RiskLevel | null | undefined {
  return latestEntryOf(h)?.level;
}

/** 实时监控扫库：系统定时或人工刷新触发，只读不写 */
function runRealtimeScan(triggerBy = '系统') {
  const t0 = Date.now();
  const startedAt = nowStamp(true);
  const criteriaText = '全中心 · 全部启用词 · 实时增量扫描';
  const endedAt = () => dayjs(t0 + Math.max(600, Date.now() - t0)).format('YYYY-MM-DD HH:mm:ss');
  try {
    const hits = wordOnlyRiskHitsOf(scope.value);
    const open = hits.filter((h) => !isJudged(h)).length;
    appendScanRun({
      id: `run-rt-${Date.now()}`,
      kind: 'realtime',
      triggerBy,
      startedAt,
      endedAt: endedAt(),
      status: 'success',
      criteriaText,
      hitCount: hits.length,
      openCount: open,
    });
  } catch {
    appendScanRun({
      id: `run-rt-${Date.now()}`,
      kind: 'realtime',
      triggerBy,
      startedAt,
      endedAt: endedAt(),
      status: 'failed',
      errorMessage: '实时扫描中断，请检查词表与连接',
      criteriaText,
    });
  }
}

function refresh() {
  runRealtimeScan(user.current.name);
}

onMounted(() => {
  if (!scanRuns.value.length) runRealtimeScan('系统');
});

function verdictOf(h: RiskHit): HitVerdict | undefined {
  return latestEntryOf(h)?.verdict;
}
function traceOf(h: RiskHit): { by: string; byRole: string; at: string; note: string } | undefined {
  const e = latestEntryOf(h);
  return e ? { by: e.by, byRole: e.byRole, at: e.at, note: e.note } : undefined;
}
/** 处置列徽标的悬停说明：现行核实结果的来源；改过就把次数标出来，指向修正记录 */
function tagTraceTitle(h: RiskHit): string | undefined {
  const t = traceOf(h);
  if (!t) return undefined;
  // 角色与姓名同行给出：光看姓名答不出"这条判定有多少分量"
  const lines = [`打标人：${t.by}（${t.byRole}）`, `打标时刻：${t.at}`];
  if (t.note) lines.push(`处置备注：${t.note}`);
  const amended = historyOf(h).length - 1;
  if (amended > 0) lines.push(`已修正 ${amended} 次，明细见「修正」`);
  return lines.join('\n');
}

// ---- 批量打标 ----
// 等级默认保持各条词表预设，确需一致时再统一改。
const bulkPicked = ref<Set<string>>(new Set());
function toggleBulkPick(id: string) {
  const s = new Set(bulkPicked.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  bulkPicked.value = s;
}
const bulkAllPicked = computed(
  () => pagedRows.value.length > 0 && pagedRows.value.every((h) => bulkPicked.value.has(h.id)),
);
function toggleBulkAll() {
  const next = new Set(bulkPicked.value);
  if (bulkAllPicked.value) pagedRows.value.forEach((h) => next.delete(h.id));
  else pagedRows.value.forEach((h) => next.add(h.id));
  bulkPicked.value = next;
}
function clearBulk() { bulkPicked.value = new Set(); }

const bulkCount = computed(() => bulkPicked.value.size);
// 只有实时监控视图给批量选择：批量动作就一个「批量打标」，
// 而已核实视图里条目都判完了，没得可批。
// 焦点态也不给：那一屏里已核实与待核实混在一起（本来就是要对照着看），
// 勾中一条已核实的再走批量打标，等于绕过「修正原因」这道必填门追加一条无理由的改判。
const showHitSelection = computed(
  () => !inScanResult.value && !ticketFocus.value && canRiskTag.value && listView.value === 'realtime',
);
const batchMenuOpen = ref(false);

function pickBatchAction(action: 'tag' | 'clear') {
  if (action === 'tag') {
    if (!bulkCount.value) return;
    batchMenuOpen.value = false;
    openBulk();
    return;
  }
  if (bulkCount.value) clearBulk();
  batchMenuOpen.value = false;
}

const bulkOpen = ref(false);
const bulkVerdict = ref<HitVerdict | undefined>(undefined);
/** '' ＝ 保持各条词表预设 */
const bulkLevel = ref<RiskLevel | ''>('');
const bulkNote = ref('');
const canSaveBulk = computed(() => canRiskTag.value && !!bulkVerdict.value);
const bulkTargets = computed(() => filteredRows.value.filter((h) => bulkPicked.value.has(h.id)));
/** 选中项里词表预设的等级分布 */
const bulkGradeMix = computed(() => {
  const m: Record<string, number> = {};
  bulkTargets.value.forEach((h) => { const g = presetGradeOf(h); m[g] = (m[g] ?? 0) + 1; });
  return Object.entries(m).map(([g, n]) => `${g}危 ${n}`).join(' · ');
});

function openBulk() {
  if (!canRiskTag.value) { message.warning('只有客诉专员与投诉督导可以打标'); return; }
  bulkVerdict.value = undefined;
  bulkLevel.value = '';
  bulkNote.value = '';
  bulkOpen.value = true;
}
function saveBulk() {
  if (!bulkVerdict.value) { message.warning('请先判定这批命中是否成立'); return; }
  const at = nowStamp();
  const next = { ...localTags.value };
  bulkTargets.value.forEach((h) => {
    // 与单条同一套留痕：追加一条，不覆盖既有历史；
    // 误报同样不落等级——批量与单条必须是同一个口径，否则台账里会出现两种误报。
    next[h.id] = [...(next[h.id] ?? []), {
      level: bulkVerdict.value === '误报'
        ? null
        : (bulkLevel.value === '' ? presetGradeOf(h) : bulkLevel.value),
      verdict: bulkVerdict.value!,
      note: bulkNote.value.trim(),
      by: user.current.name,
      byRole: user.role.name,
      at,
    }];
  });
  localTags.value = next;
  message.success(
    bulkVerdict.value === '误报'
      ? `已将 ${bulkTargets.value.length} 条记为误报，计入规则准确率`
      : `已批量打标 ${bulkTargets.value.length} 条`,
  );
  bulkOpen.value = false;
  clearBulk();
}

// ---- 监控雷达 ----
// 「全面监控」是这个岗位的状态，不是一个数字。雷达把三件事一屏说清：
//   ① 一直在扫（扫描扇持续转）② 覆盖多大（全中心）③ 扫到了什么（光点＝命中，按等级着色）
// 光点坐标用**命中 id 派生的确定性哈希**，不用 Math.random——
// 随机会让每次刷新光点乱跳，看着像数据在变，其实没变。
function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
// 判为误报的不上雷达：雷达画的是"扫到了什么风险"，误报的结论恰恰是"这里没有风险"，
// 让它继续亮着，等于把已经排除掉的东西留在屏幕上继续吓人。
const radarBlips = computed(() =>
  rows.value.filter((h) => gradeOf(h) !== null).slice(0, 14).map((h) => {
    const n = hashOf(h.id);
    const g = gradeOf(h)!;
    const ring = g === '高' ? 0.3 : g === '中' ? 0.58 : 0.84;
    const angle = (n % 360) * (Math.PI / 180);
    const r = ring + ((n >> 9) % 12) / 100;
    return {
      id: h.id,
      x: 50 + Math.cos(angle) * r * 46,
      y: 50 + Math.sin(angle) * r * 46,
      color: RISK_LEVEL_STYLE[g].color,
      grade: g,
      title: `${g}危 · ${h.title}`,
    };
  }),
);

const untaggedHigh = computed(() =>
  allHits.value.filter((h) => !isJudged(h) && presetGradeOf(h) === '高'),
);

/**
 * 「去管控」：只跳到工单、把入口送到人眼前，**不代替人做管控**。
 * 基线 ※27——分级决定"该找谁"，不代表系统自动指派；管控会把工单从原处理人
 * 名下拿走（在办量、解决率分母、超时数全变），这个代价必须由人承担判断。
 *
 * 【入口按工单级判，不按单条命中判】（PRD §6.5）管控管的是**工单**，不是某一条证据。
 * 一张单只要有一条命中被核实为成立·高危，该单每一行都该有这个入口——
 * 否则人正停在那条中危命中上，明明该管控却看不到路，还得先猜到"别处还有一条"。
 */
function goControl(h: RiskHit) {
  router.push(`/tickets/${h.ticketNo}`);
}
function openTicket(no: string) { router.push(`/tickets/${no}`); }

// ---- 风险词管理（维护权归投诉督导与管理员；客诉专员只打标、词表只读，基线 §3.1） ----
const riskWordsOpen = ref(false);
const canMaintainWords = computed(() => RISK_WORD_MAINTAIN_ROLES.includes(user.roleKey));
/** 原型本地词表：可新建，刷新后回 mock 初始值 */
const localWords = ref<RiskWord[]>([...RISK_WORDS]);
const enabledWords = computed(() => localWords.value.filter((w) => w.enabled));
const enabledWordCount = computed(() => enabledWords.value.length);
/**
 * 手动筛查的风险词下拉只列启用中的。停用是维护人给这条规则下的判决——
 * 把停用词摆进选项里（哪怕标着「停用」），等于邀请人把当初停用它的理由重演一遍：
 * 「孩子」一选就是上百条噪音，而筛查结果是要并入待核实队列的。
 */
const scanWordOptions = computed(
  () => enabledWords.value.map((w) => ({ value: w.id, label: w.word })),
);

const wordFormOpen = ref(false);
const wordForm = ref({
  word: '',
  synonyms: [] as string[],
  level: '中' as RiskLevel,
  scopes: ['问题描述', '沟通记录'] as string[],
  enabled: false,
});
const SCOPE_OPTIONS = SCAN_FIELDS;
/** 同义词输入框的暂存值：确认后才进 wordForm.synonyms，避免半截词被保存 */
const synonymDraft = ref('');

function addSynonym() {
  const raw = synonymDraft.value.trim();
  if (!raw) return;
  // 粘贴一串同义词是常见输入方式，按常见分隔符一次拆开
  const items = raw.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
  for (const s of items) {
    if (s === wordForm.value.word.trim()) { message.warning(`「${s}」已是主词`); continue; }
    if (wordForm.value.synonyms.includes(s)) { message.warning(`「${s}」已在同义词中`); continue; }
    wordForm.value.synonyms.push(s);
  }
  synonymDraft.value = '';
}
function removeSynonym(i: number) {
  wordForm.value.synonyms.splice(i, 1);
}

function openWordForm() {
  wordForm.value = {
    word: '',
    synonyms: [],
    level: '中',
    scopes: ['问题描述', '沟通记录'],
    enabled: false,
  };
  synonymDraft.value = '';
  wordFormOpen.value = true;
}
function saveWord() {
  const word = wordForm.value.word.trim();
  if (!word) { message.warning('请填写主词'); return; }
  if (!wordForm.value.scopes.length) { message.warning('请至少选一个匹配范围'); return; }
  localWords.value = [
    ...localWords.value,
    {
      id: `w-${Date.now()}`,
      word,
      synonyms: wordForm.value.synonyms.filter((s) => s !== word),
      level: wordForm.value.level,
      speakerLimit: '不限',
      scopes: [...wordForm.value.scopes],
      receivers: [],
      enabled: wordForm.value.enabled,
      hits7d: 0,
      hits7dRaw: 0, // 与 hits7d 同口径；当前无法区分发话角色
      judged7d: 0,
      valid7d: 0,
    },
  ];
  message.success(wordForm.value.enabled ? `已新建并启用「${word}」` : `已新建「${word}」（停用中，启用后才纳入实时监控与手动筛查）`);
  wordFormOpen.value = false;
}
function toggleWordEnabled(w: RiskWord) {
  if (!canMaintainWords.value) return;
  localWords.value = localWords.value.map((item) =>
    item.id === w.id ? { ...item, enabled: !item.enabled } : item,
  );
  // 刚停用的词若还留在筛查条件里，下拉已经不列它、条件却还带着它，
  // 于是筛出来的结果与人看到的条件对不上。停用即从条件里摘掉。
  if (w.enabled) {
    scanForm.value.wordIds = scanForm.value.wordIds.filter((id) => id !== w.id);
  }
  message.success(w.enabled ? `已停用「${w.word}」` : `已启用「${w.word}」`);
}
/**
 * 词表准确率的实时口径。分子分母都来自 verdict，且一律取**最新一次**。
 * 页面上把一条改判了、词表这一列却还是旧数字，就成了同一件事两套账；
 * 故在近 7 天基数上按每条命中的「基线判定 → 当前判定」做增量修正，
 * 而不是让界面另算一套百分比。
 */
const liveWordStats = computed<Record<string, { judged: number; valid: number }>>(() => {
  const stats: Record<string, { judged: number; valid: number }> = {};
  localWords.value.forEach((w) => { stats[w.id] = { judged: w.judged7d, valid: w.valid7d }; });
  const idByWord = new Map(localWords.value.map((w) => [w.word, w.id]));
  allHits.value.forEach((h) => {
    const id = idByWord.get(h.word);
    const s = id ? stats[id] : undefined;
    if (!s) return;
    // 基数里已经含了这条的原判定，先扣回去再按当前判定加上，避免重复计数
    const seed = seedEntryOf(h);
    if (seed) { s.judged -= 1; if (seed.verdict === '成立') s.valid -= 1; }
    const now = verdictOf(h);
    if (now) { s.judged += 1; if (now === '成立') s.valid += 1; }
  });
  Object.values(stats).forEach((s) => {
    s.judged = Math.max(s.judged, 0);
    s.valid = Math.max(0, Math.min(s.valid, s.judged));
  });
  return stats;
});
function wordStatsOf(w: RiskWord): { judged: number; valid: number } {
  return liveWordStats.value[w.id] ?? { judged: w.judged7d, valid: w.valid7d };
}
/** 百分比仍由共享口径函数算，界面不自带第二套公式 */
function wordAccuracyOf(w: RiskWord): number | null {
  const s = wordStatsOf(w);
  return accuracyOf({ ...w, judged7d: s.judged, valid7d: s.valid });
}

/** 准确率分档：低于 30% 的规则基本在制造噪音，该收窄或停用 */
function accTone(v: number): 'bad' | 'mid' | 'good' {
  if (v < 0.3) return 'bad';
  if (v < 0.7) return 'mid';
  return 'good';
}
/** 准确率分档取规范 §2.3 语义色，不另调色值 */
const ACC_TONE_COLOR: Record<'bad' | 'mid' | 'good', string> = {
  bad: '#EF4444',
  mid: '#F59E0B',
  good: '#10B981',
};
</script>

<template>
  <div class="risk-monitor">
    <!--
      三层信息各归其位，不再挤在一条横带里：
      ① 页面标识条（本页是什么 + 随手要用的工具）
      ② 监控成效卡（这个岗位发现了什么、判准了没有——价值陈述，独立成卡才有分量）
      ③ 筛选条（操作区，随清单走，见下方命中清单卡）
    -->
    <!-- ① 页面标识：与个人门户 / 班组看板 / 工单监控同款 greeting-card -->
    <div class="greeting-card" :class="{ urgent: untaggedHigh.length > 0 }">
      <div class="greeting-lead">
        <!-- 雷达讲的是"覆盖与在扫"，属页面身份而非指标，故与标题同列 -->
        <div class="radar" :class="{ alert: untaggedHigh.length > 0 }">
          <div class="radar-face">
            <i class="radar-ring r1" /><i class="radar-ring r2" /><i class="radar-ring r3" />
            <i class="radar-cross v" /><i class="radar-cross h" />
            <i class="radar-sweep" />
            <i class="radar-hub" aria-hidden="true" />
            <i
              v-for="b in radarBlips" :key="b.id" class="radar-blip"
              :style="{ left: b.x + '%', top: b.y + '%', background: b.color, boxShadow: `0 0 6px ${b.color}` }"
              :title="b.title"
            />
          </div>
        </div>
        <div class="greeting-text">
          <div class="greeting-title">风险监控</div>
          <div class="greeting-sub">全中心 · 风险词实时命中 → 人工核实定级 → 成立后转交工单侧处置</div>
        </div>
      </div>
      <div class="greeting-aside">
        <div class="section-filters head-tools">
          <!--
            上次执行时刻＝最近一次扫库的结果，扫库记录是它的历史，
            两者是同一条信息的"此刻"与"过往"，合成一个控件而不是并排两个。
          -->
          <button
            type="button"
            class="run-entry"
            :disabled="!scanRuns.length"
            :title="scanRuns.length ? '查看扫库记录（实时监控与手动筛查）' : '尚未有过扫库执行'"
            @click="runsOpen = true"
          >
            <span class="monitor-last-run-k">上次执行</span>
            <span class="monitor-clock">{{ lastRefresh }}</span>
            <span class="run-entry-meta"><HistoryOutlined />扫库记录 {{ scanRuns.length }}</span>
          </button>
          <button type="button" class="monitor-refresh" title="刷新" @click="refresh"><ReloadOutlined /></button>
          <button type="button" class="word-entry" @click="riskWordsOpen = true">
            <SettingOutlined />
            <span class="word-entry-label">{{ canMaintainWords ? '风险词管理' : '查看风险词' }}</span>
            <span class="word-entry-meta">{{ enabledWordCount }} 启用</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ② 监控成效：待办清空后，这一组数是这个岗位这段时间的全部交代 -->
    <section class="overview-section effect-section">
      <!--
        只有「待核实」「已核实」两张卡可点：它们各自背后是一批**能被打开来逐条看**的记录，
        与下方清单的两个视图一一对应，点哪张就换哪一批，激活态两处联动。
        「发现」与「准确率」保持不可点——「全部」域取消后前者已没有对应的清单可去，
        后者是比率、背后本就没有一批记录；给它们一个点不出结果的手型，比不给更误导。
        核实结果是成效的落点，同时是「已核实」视图内筛选项的快捷入口。
      -->
      <div class="effect-row">
        <h2 class="section-title effect-title" title="发现 → 核实 → 定论 · 准确率分母只算已核实，未核实的不拉低它">监控数据</h2>

        <div class="effect-metrics">
          <div
            class="em-item em-static"
            :style="{ '--kpi-accent': '#1A6FFF' }"
            title="风险词命中总数 · 待核实与已核实之和"
          >
            <span class="em-label">发现</span>
            <span class="em-val">{{ effect.total }}</span>
          </div>
          <button
            type="button"
            class="em-item"
            :class="{ on: listView === 'judged' }"
            :style="{ '--kpi-accent': '#10B981' }"
            title="已判定成立或误报"
            @click="setListView('judged')"
          >
            <span class="em-label">已核实</span>
            <span class="em-val">{{ effect.judged }}</span>
          </button>
          <!-- 准确率是比率，背后没有一批可看的记录，故它保持不可点 -->
          <div
            class="em-item em-static"
            :style="{ '--kpi-accent': effect.accuracy === null ? '#9CA3AF' : ACC_TONE_COLOR[accTone(effect.accuracy)] }"
            title="确认是风险 ÷ 已核实 · 当前范围 · 累计"
          >
            <span class="em-label">准确率</span>
            <span
              v-if="effect.accuracy !== null"
              class="em-val"
              :style="{ color: ACC_TONE_COLOR[accTone(effect.accuracy)] }"
            >{{ Math.round(effect.accuracy * 100) }}%</span>
            <span v-else class="em-val muted" title="还没有核实过任何命中">—</span>
          </div>
          <button
            type="button"
            class="em-item"
            :class="{ on: listView === 'realtime' }"
            :style="{ '--kpi-accent': untaggedHigh.length > 0 ? '#EF4444' : '#F59E0B' }"
            :title="`其中高危 ${untaggedHigh.length} 条`"
            @click="setListView('realtime')"
          >
            <span class="em-label">待核实</span>
            <span
              class="em-val"
              :style="{ color: untaggedHigh.length > 0 ? '#EF4444' : '#F59E0B' }"
            >{{ effect.open }}</span>
            <span class="em-hint" :class="{ bad: untaggedHigh.length > 0 }">高危 {{ untaggedHigh.length }}</span>
          </button>
        </div>

        <div class="effect-result">
          <span class="er-label">核实结果</span>
          <button
            type="button"
            class="er-btn"
            :class="{ active: listView === 'judged' && ledgerFilter.verdict === '成立' }"
            @click="setListView('judged'); ledgerFilter.verdict = '成立'"
          >
            <span class="er-name">确认是风险</span>
            <span class="er-num danger">{{ confirmedHits.length }}</span>
            <span v-if="confirmedHits.length" class="er-mix">
              高 {{ confirmedByGrade['高'] }} · 中 {{ confirmedByGrade['中'] }} · 低 {{ confirmedByGrade['低'] }}
            </span>
            <RightOutlined class="er-go" />
          </button>
          <button
            type="button"
            class="er-btn"
            :class="{ active: listView === 'judged' && ledgerFilter.verdict === '误报' }"
            title="不计入风险统计"
            @click="setListView('judged'); ledgerFilter.verdict = '误报'"
          >
            <span class="er-name">误报</span>
            <span class="er-num muted">{{ falseHits.length }}</span>
            <RightOutlined class="er-go" />
          </button>
        </div>
      </div>
    </section>

    <!-- 统一命中清单 -->
    <section class="overview-section work-panel">
      <!--
        主 Tab 一层收拢三种视图：实时监控（待核实）· 手动筛查 · 已核实。
        页签数字与清单内容同源：实时监控恒等于待核实数，已核实恒等于台账底表数——
        标签写着一个数、表里躺着另一批，正是两套状态机并存时踩过的坑。
      -->
      <div class="list-panel-head">
        <div class="list-view-tabs">
          <button
            type="button"
            class="lvt-tab"
            :class="{ on: listView === 'realtime' }"
            @click="setListView('realtime')"
          >
            实时监控<span class="lvt-num" :class="{ bad: untaggedHigh.length > 0 }">{{ effect.open }}</span>
          </button>
          <button
            type="button"
            class="lvt-tab"
            :class="{ on: listView === 'scan' }"
            @click="setListView('scan')"
          >
            手动筛查
            <span v-if="inScanResult" class="lvt-num">{{ scanResult!.length }}</span>
          </button>
          <button
            type="button"
            class="lvt-tab"
            :class="{ on: listView === 'judged' }"
            @click="setListView('judged')"
          >
            已核实<span class="lvt-num">{{ effect.judged }}</span>
          </button>
        </div>
        <div class="section-head-actions">
          <a-dropdown
            v-if="showHitSelection"
            v-model:open="batchMenuOpen"
            trigger="click"
            placement="bottomRight"
          >
            <div
              class="row-btn scan-entry hit-batch-btn"
              :class="{ active: bulkCount > 0 }"
            >
              <UnorderedListOutlined :style="{ fontSize: '12px' }" />
              <span>批量操作</span>
              <span v-if="bulkCount > 0" class="hit-batch-badge">{{ bulkCount }}</span>
              <DownOutlined :style="{ color: '#9CA3AF', fontSize: '10px' }" />
            </div>
            <template #overlay>
              <a-menu class="batch-menu">
                <a-menu-item :disabled="bulkCount <= 0" @click="pickBatchAction('tag')">
                  批量打标
                </a-menu-item>
                <a-menu-item :disabled="bulkCount <= 0" @click="pickBatchAction('clear')">
                  取消选择
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </div>

      <!-- 实时监控 · 等级 chip：底表恒为待核实，故第一枚恒是「全部待核」，不再有第二套口径 -->
      <!-- 焦点态跨视图取数，等级 chip 此刻不作数；留着它会让人以为"高危 5"与表里的行数该对上 -->
      <div v-if="listView === 'realtime' && !ticketFocus" class="section-filters grade-filters">
        <button
          type="button"
          class="gf-chip"
          :class="{ active: gradeFilter === 'all' }"
          @click="setGradeFilter('all')"
        >
          全部待核<span class="gf-num">{{ openHits.length }}</span>
        </button>
        <button
          v-for="g in GRADES"
          :key="g"
          type="button"
          class="gf-chip"
          :class="{
            active: gradeFilter === g,
            warn: g === '高' && untaggedHigh.length > 0,
          }"
          @click="setGradeFilter(g)"
        >
          <i class="gf-dot" :style="{ background: RISK_LEVEL_STYLE[g].color }" />{{ g }}危<span class="gf-num">{{ gradeCount[g] }}</span>
        </button>
      </div>

      <!-- 台账查询条：七维全部展开，右侧动作对齐手动筛查（查询 + 重置） -->
      <div v-if="listView === 'judged' && !ticketFocus" class="ledger-bar" @keyup.enter="applyLedgerQuery">
        <div class="list-toolbar">
          <div class="tb-fields">
            <div class="fi">
              <span class="fl">核实结果</span>
              <a-select
                v-model:value="ledgerFilter.verdict"
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false"
                :options="[
                  { value: 'all', label: '全部' },
                  { value: '成立', label: '确认是风险' },
                  { value: '误报', label: '误报' },
                ]"
              />
            </div>
            <div class="fi">
              <span class="fl">关键词</span>
              <div class="tb-search">
                <SearchOutlined class="tb-search-ic" />
                <input
                  v-model="ledgerFilter.keyword"
                  class="tb-search-input"
                  type="text"
                  placeholder="工单号 / 客户名"
                >
              </div>
            </div>
            <div class="fi">
              <span class="fl">等级</span>
              <a-select
                v-model:value="ledgerFilter.level"
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false"
                :options="[{ value: 'all', label: '全部' }, ...GRADES.map((g) => ({ value: g, label: `${g}危` }))]"
              />
            </div>
            <div class="fi">
              <span class="fl">命中时间</span>
              <RangePicker
                :value="ledgerDateRange"
                :presets="ledgerRangePresets"
                allow-clear
                size="small"
                format="YYYY-MM-DD"
                :placeholder="['开始日期', '结束日期']"
                class="tb-range"
                @change="onLedgerRangeChange"
              />
            </div>
            <div class="fi">
              <span class="fl">班组</span>
              <a-select
                v-model:value="ledgerFilter.groupIds" mode="multiple" show-search allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="全中心" :max-tag-count="1"
                :options="ledgerGroupOptions" :filter-option="filterScopeOption"
                :max-tag-placeholder="scopeTagPlaceholder"
              />
            </div>
            <div class="fi">
              <span class="fl">风险词</span>
              <a-select
                v-model:value="ledgerFilter.words" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                :options="ledgerWordOptions"
              />
            </div>
            <div class="fi">
              <span class="fl">打标人</span>
              <a-select
                v-model:value="ledgerFilter.taggers" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                :options="ledgerTaggerOptions"
              />
            </div>
          </div>
          <div class="tb-actions">
            <button type="button" class="scan-go" @click="applyLedgerQuery">
              <SearchOutlined />查询
            </button>
            <button type="button" class="tb-btn" :disabled="!ledgerFilterDirty" @click="resetLedgerFilter">
              <ReloadOutlined /><span>重置</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 筛选条：九维（班组 / 风险词 / 建单时间 / 工单状态 / 匹配范围 / 工单类型 / 业务类型 / 产品分类 / 产品名称） -->
      <div v-if="listView === 'scan'" class="scan-bar" @keyup.enter="doScan">
        <div class="list-toolbar">
          <div class="tb-fields">
            <div class="fi">
              <span class="fl">班组</span>
              <a-select
                v-model:value="scanForm.groupIds" mode="multiple" show-search allow-clear
                size="small" class="tb-ctl"
                :options="scopeSelectGroups" :filter-option="filterScopeOption"
                :dropdown-match-select-width="false" placeholder="全中心" :max-tag-count="1"
                :max-tag-placeholder="scopeTagPlaceholder"
              />
            </div>
            <div class="fi">
              <span class="fl">风险词</span>
              <a-select
                v-model:value="scanForm.wordIds" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="全部启用中的词" :max-tag-count="1"
                :options="scanWordOptions"
              />
            </div>
            <div class="fi fi-date">
              <span class="fl">建单时间</span>
              <!--
                不给清除按钮：时间区间清空即"对全库扫一遍"，而扫库的产出是待并入的新命中，
                一次范围失手就把待核实队列淹没且不可逆。这一维只允许换区间，不允许没有区间。
              -->
              <RangePicker
                :value="scanDateRange"
                :presets="scanRangePresets"
                :allow-clear="false"
                size="small"
                format="YYYY-MM-DD"
                :placeholder="['开始日期', '结束日期']"
                class="tb-range"
                @change="onScanDateRangeChange"
              />
            </div>
            <div class="fi">
              <span class="fl">工单状态</span>
              <a-select
                v-model:value="scanForm.nodeStatuses" mode="multiple" show-search allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="0"
                :max-tag-placeholder="compactTagPlaceholder"
                :options="SCAN_NODE_STATUS_OPTIONS"
              />
            </div>
            <div class="fi">
              <span class="fl">匹配范围</span>
              <a-select
                v-model:value="scanForm.matchScopes" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="按词表范围" :max-tag-count="1"
                :options="SCAN_FIELDS.map((f) => ({ value: f, label: f }))"
              />
            </div>
            <div class="fi">
              <span class="fl">工单类型</span>
              <a-select
                v-model:value="scanForm.ticketTypes" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                :options="SCAN_TICKET_TYPES.map((t) => ({ value: t, label: t }))"
              />
            </div>
            <div class="fi">
              <span class="fl">业务类型</span>
              <a-select
                v-model:value="scanForm.businessTypes" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                :options="SCAN_BUSINESS_TYPES.map((t) => ({ value: t, label: t }))"
              />
            </div>
            <div class="fi">
              <span class="fl">产品分类</span>
              <a-select
                v-model:value="scanForm.productCategories" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                :options="SCAN_PRODUCT_CATEGORIES.map((t) => ({ value: t, label: t }))"
              />
            </div>
            <div class="fi">
              <span class="fl">产品名称</span>
              <a-select
                v-model:value="scanForm.productNames" mode="multiple" allow-clear
                size="small" class="tb-ctl"
                :dropdown-match-select-width="false" placeholder="不限" :max-tag-count="1"
                :options="scanProductNameOptions.map((t) => ({ value: t, label: t }))"
              />
            </div>
          </div>
          <div class="tb-actions">
            <button type="button" class="scan-go" :disabled="scanning" @click="doScan">
              <SearchOutlined />{{ scanning ? '筛查中…' : '开始筛查' }}
            </button>
            <button type="button" class="tb-btn" @click="resetScanForm">
              <ReloadOutlined /><span>重置</span>
            </button>
            <button
              type="button"
              class="tb-btn"
              title="把当前九个维度的取值整套存下来，下次点一下即按它筛查；同名覆盖"
              @click="openSaveFilter"
            >
              <SaveOutlined /><span>保存筛选器</span>
            </button>
          </div>
        </div>
        <!--
          已保存筛选器：一枚 chip ＝ 一整套筛查条件，点即套用并立刻执行。
          【为什么与等级 chip 长得不一样】两者的动作根本不同——等级 chip 是在同一批数据里收窄，
          这里一点就换掉九个维度并重跑一次。形态相同会让人以为点错了也就是筛一下。
        -->
        <div v-if="savedFilters.length" class="saved-filters">
          <span class="sf-label">已保存筛选器</span>
          <span
            v-for="f in savedFilters"
            :key="f.id"
            class="sf-chip"
            :class="{ on: appliedFilterName === f.name }"
          >
            <button
              type="button"
              class="sf-apply"
              :disabled="scanning"
              :title="`点击立即按此条件筛查 —— ${criteriaSummaryOf(f.criteria)}`"
              @click="applySavedFilter(f)"
            >
              <FilterOutlined class="sf-ic" />{{ f.name }}
            </button>
            <button
              type="button"
              class="sf-del"
              :title="`删除筛选器「${f.name}」`"
              @click.stop="removeSavedFilter(f)"
            >×</button>
          </span>
          <span class="sf-hint">点一枚即按该条件重跑一次</span>
        </div>
      </div>

      <!-- 筛查结果条：结果就在下面这张清单里，这里只给统计与并入动作 -->
      <div v-if="inScanResult" class="scan-banner">
        <div class="sb-stat">
          扫出 <b>{{ scanResult!.length }}</b> 条
          <span class="sr-fresh">新命中 {{ scanFreshCount }}</span>
          <span v-if="scanDupCount" class="sr-dup">已在清单 {{ scanDupCount }}</span>
          <span class="sb-hint">结果尚未并入，勾选后确认</span>
        </div>
        <div class="sb-actions">
          <label class="sb-all">
            <a-checkbox :checked="scanAllPicked" @change="toggleScanPickAll" />全选新命中
          </label>
          <span class="sb-picked">已选 {{ scanPicked.size }}</span>
          <button type="button" class="row-btn row-btn-solid" :disabled="!scanPicked.size" @click="adoptScan">
            并入清单
          </button>
          <button type="button" class="link-btn" @click="exitScanResult">退出筛查</button>
        </div>
      </div>

      <!--
        单工单焦点条：焦点跨视图取数，页签与等级 chip 此刻都不作数，
        故必须有一条明说"现在只看这一张单"的横幅，并把退出的路摆在同一处。
        没有它，人会以为清单被筛空了，反复点页签也回不来。
      -->
      <div v-if="ticketFocus && !inScanResult" class="focus-banner">
        <div class="fb-stat">
          只看 <b>{{ ticketFocus }}</b> 的 {{ filteredRows.length }} 条命中
          <span class="fb-hint">按命中时刻正序，含已核实的</span>
          <span v-if="ticketGradeOf(ticketFocus!)" class="fb-grade">
            本单当前
            <span
              class="grade-pill-inline"
              :style="{ color: RISK_LEVEL_STYLE[ticketGradeOf(ticketFocus!)!].color, background: RISK_LEVEL_STYLE[ticketGradeOf(ticketFocus!)!].bg }"
            >{{ ticketGradeOf(ticketFocus!) }}危</span>
          </span>
          <span v-else class="fb-grade muted">本单尚无已核实成立的命中</span>
        </div>
        <button type="button" class="fb-exit" @click="clearTicketFocus">
          退出<span class="fb-x">×</span>
        </button>
      </div>

      <div v-if="!filteredRows.length" class="ob-empty">
        <template v-if="inScanResult">该条件下没有扫到命中，可放宽时间区间或匹配范围</template>
        <!--
          台账空态必须把当前时间窗口讲出来。默认只看近 30 天，
          不说清楚的话，查三个月前的记录会被读成"当时没发现"——这是默认窗口唯一的风险。
        -->
        <template v-else-if="inLedger">
          当前只看 {{ ledgerRangeText }}，未找到匹配记录——扩大命中时间范围试试
        </template>
        <template v-else>{{ gradeFilter === 'all' ? '该范围近期没有待核实的风险命中' : `该范围下没有待核实的${gradeFilter}危命中` }}</template>
      </div>


      <div v-if="filteredRows.length && !(listView === 'scan' && !inScanResult)" class="hit-table-wrap">
      <table class="hit-table">
        <thead>
          <tr>
            <th v-if="showHitSelection || inScanResult" style="width: 36px">
              <div
                v-if="showHitSelection"
                class="hit-cb"
                :class="{ checked: bulkAllPicked }"
                @click="toggleBulkAll"
              >
                <CheckOutlined v-if="bulkAllPicked" :style="{ color: '#fff', fontSize: '10px' }" />
              </div>
            </th>
            <th style="width: 52px">等级</th>
            <th style="width: 120px">风险词</th>
            <th style="width: 200px">工单</th>
            <th>命中内容</th>
            <th style="width: 118px">客户 / 班组</th>
            <th style="width: 52px">时间</th>
            <th style="width: 148px">{{ inScanResult ? '状态' : '处置' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="h in pagedRows" :key="h.id"
            :class="{
              untagged: !inScanResult && !isJudged(h) && presetGradeOf(h) === '高',
              'scan-dup': inScanResult && scanDupIds.has(h.id),
            }"
          >
            <td v-if="showHitSelection || inScanResult">
              <a-checkbox
                v-if="inScanResult"
                :checked="scanPicked.has(h.id)"
                :disabled="scanDupIds.has(h.id)"
                @change="toggleScanPick(h.id)"
              />
              <div
                v-else
                class="hit-cb"
                :class="{ checked: bulkPicked.has(h.id) }"
                @click.stop="toggleBulkPick(h.id)"
              >
                <CheckOutlined v-if="bulkPicked.has(h.id)" :style="{ color: '#fff', fontSize: '10px' }" />
              </div>
            </td>
            <td>
              <!-- 误报没有等级，这一格就空着（—）；回落到词表预设去补一个，等于给已排除的东西重新贴上风险标 -->
              <span
                v-if="gradeOf(h)"
                class="grade-pill"
                :style="{ color: RISK_LEVEL_STYLE[gradeOf(h)!].color, background: RISK_LEVEL_STYLE[gradeOf(h)!].bg }"
              >{{ gradeOf(h) }}</span>
              <span v-else class="hit-sub" title="判为误报的命中不带风险等级">—</span>
            </td>
            <td>
              <div class="track-word">「{{ h.word }}」</div>
              <!-- 命中的是同义词时必须标出来，否则复核的人在原文里找不到主词 -->
              <div v-if="h.matchedWord && h.matchedWord !== h.word" class="track-word-sub">命中「{{ h.matchedWord }}」</div>
              <div class="track-word-sub">词表预设 {{ presetGradeOf(h) }}危</div>
            </td>
            <td>
              <button type="button" class="rt-no" @click="openTicket(h.ticketNo)">{{ h.ticketNo }}</button>
              <div class="hit-title">{{ h.title }}</div>
              <div v-if="isFromScan(h)" class="hit-flag flag-scan">来自手动筛查</div>
              <!--
                工单级的两条事实都落在工单列：同一列里读"这张单是什么、这张单现在几级、
                这张单还有几条证据"，比把它们散到等级列与处置列更连贯。
              -->
              <div v-if="!inScanResult" class="ticket-facts">
                <button
                  v-if="siblingCountOf(h) > 0"
                  type="button"
                  class="hit-flag flag-sib"
                  :class="{ on: ticketFocus === h.ticketNo }"
                  title="同一张单被多条规则先后命中，点开对照着看"
                  @click="focusTicket(h.ticketNo)"
                >本单另有 {{ siblingCountOf(h) }} 条</button>
                <!-- 只在工单级严格高于本条时出现：同级时重复展示是噪音 -->
                <div
                  v-if="ticketGradeHint(h)"
                  class="ticket-grade-note"
                  :style="{ color: RISK_LEVEL_STYLE[ticketGradeHint(h)!].color }"
                  title="工单级风险等级 ＝ 该单已核实且成立的命中取最高，只升不降"
                >本单当前 <b>{{ ticketGradeHint(h) }}</b> 危</div>
              </div>
            </td>
            <td class="hit-excerpt">
              <span class="hit-pos">{{ h.position }}</span>
              「{{ h.excerpt }}」
            </td>
            <td>{{ h.customer }}<div class="hit-sub">{{ h.groupName }} · {{ h.assignee }}</div></td>
            <td class="hit-when">{{ h.when.slice(11) }}</td>
            <td>
              <!-- 筛查态：这一列说明"这条会不会进清单"，处置动作等并入后再给 -->
              <template v-if="inScanResult">
                <span v-if="scanDupIds.has(h.id)" class="state-chip">已在清单</span>
                <span v-else-if="scanPicked.has(h.id)" class="state-chip sc-will">并入后待核实</span>
                <span v-else class="state-chip sc-skip">不并入</span>
              </template>
              <!--
                「去管控」按**工单级**判（PRD §6.5），故它在已核实与待核实两支里都出现：
                管控管的是工单，本条自己判成什么、判没判过都不改变"这张单已经是高危"这件事。
              -->
              <div v-else class="cell-done">
                <template v-if="isJudged(h)">
                  <!-- 误报只出判定标，不出风险标：两个标同时挂着，读的人不知道该信哪一个 -->
                  <span
                    v-if="tagOf(h)"
                    class="tag-done"
                    :style="{ color: RISK_LEVEL_STYLE[tagOf(h)!].color, background: RISK_LEVEL_STYLE[tagOf(h)!].bg }"
                    :title="tagTraceTitle(h)"
                  >{{ tagOf(h) }}风险</span>
                  <span
                    v-if="verdictOf(h)"
                    class="verdict-chip"
                    :class="verdictOf(h) === '误报' ? 'vc-fp' : 'vc-ok'"
                    :title="tagTraceTitle(h)"
                  >{{ verdictOf(h) }}</span>
                  <button
                    v-if="ticketGradeOf(h.ticketNo) === '高'"
                    type="button" class="row-btn row-btn-primary"
                    :title="`本单工单级风险等级为高（该单已核实成立的命中取最高），转交${DISPOSAL_BY_GRADE['高'].who}`"
                    @click="goControl(h)"
                  >去管控<ArrowRightOutlined /></button>
                  <!--
                    修正入口：绝大多数已核实的记录不需要再动，故用次按钮排在动作末位，
                    但它必须存在——台账里翻出一条判错的，正是要改的时候。
                  -->
                  <button
                    v-if="canRiskTag"
                    type="button" class="row-btn row-btn-amend"
                    :title="historyOf(h).length > 1 ? `已修正 ${historyOf(h).length - 1} 次，可继续修正` : '重新核实并修正本条结果'"
                    @click="openTag(h)"
                  >修正</button>
                </template>
                <template v-else>
                  <button
                    v-if="ticketGradeOf(h.ticketNo) === '高'"
                    type="button" class="row-btn row-btn-primary"
                    :title="`本单已有命中被核实为成立·高危，转交${DISPOSAL_BY_GRADE['高'].who}；本条仍需单独核实`"
                    @click="goControl(h)"
                  >去管控<ArrowRightOutlined /></button>
                  <button v-if="canRiskTag" type="button" class="row-btn row-btn-tag" @click="openTag(h)">核实打标</button>
                  <span v-else-if="ticketGradeOf(h.ticketNo) !== '高'" class="hit-sub">—</span>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="pager">
        <div class="pager-left">
          <span class="pager-total">共 {{ filteredRows.length }} 条</span>
          <span v-if="showHitSelection && bulkCount > 0" class="pager-selected">已选 {{ bulkCount }} 项</span>
        </div>
        <AppPagination
          :total="filteredRows.length"
          :current="hitPageCurrent"
          :page-size="hitPageSize"
          :show-total="false"
          @change="setHitPage"
        />
      </div>
      </div>
    </section>

    <!-- 风险词维护抽屉 -->
    <a-drawer v-model:open="riskWordsOpen" title="风险词管理" width="760" placement="right">
      <div v-if="canMaintainWords" class="drawer-toolbar">
        <button type="button" class="row-btn row-btn-primary" @click="openWordForm">新建风险词</button>
      </div>
      <p class="drawer-note top">
        一条规则＝<b>一个主词 + N 个同义词</b>，命中任一即算命中，同一工单的同一段原文只记一条，统计一律归在主词名下。
        <b>近 7 天命中</b>是新增词条前的试跑依据——命中量过大的词上线即刷屏；
        <b>准确率</b>是上线后的体检——准确率低说明这条规则捞进来的多半不是风险，应先收窄匹配范围，而不是等人肉发现。
      </p>
      <table class="word-table">
        <thead>
          <tr>
            <th>风险词</th><th>分级</th><th>匹配范围</th>
            <th>近 7 天命中</th>
            <!--
              列头标明「近 7 天」与「本规则」两个限定：页头监控成效那个准确率是**全局累计**
              （确认是风险 ÷ 已核实），本列是**按规则 × 近 7 天**。两个数本来就该不同——
              一个看整体判得准不准、一个看单条规则该不该收窄——问题只在于名字一模一样。
            -->
            <th>近 7 天准确率</th><th>状态</th>
            <th v-if="canMaintainWords" style="width: 64px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="w in localWords" :key="w.id" :class="{ off: !w.enabled }">
            <td class="wt-word">
              {{ w.word }}
              <div v-if="w.synonyms.length" class="wt-syn">同义词 {{ w.synonyms.join(' / ') }}</div>
            </td>
            <td>
              <span class="risk-word" :style="{ color: RISK_LEVEL_STYLE[w.level].color, background: RISK_LEVEL_STYLE[w.level].bg }">{{ w.level }}</span>
            </td>
            <td class="hit-sub">{{ w.scopes.join(' / ') }}</td>
            <td>
              <span :class="{ 'hits-high': w.hits7d > 50 }">{{ w.hits7d }}</span>
            </td>
            <td>
              <!-- 悬停给出分子分母原值，让人能当场核对这个百分比是怎么来的 -->
              <span v-if="wordAccuracyOf(w) === null" class="hit-sub" title="本规则近 7 天还没有被人核实过的命中，无法计算">—</span>
              <span
                v-else class="acc" :class="accTone(wordAccuracyOf(w)!)"
                :title="`本规则近 7 天：成立 ${wordStatsOf(w).valid} ÷ 已判定 ${wordStatsOf(w).judged}。分母不含未核实的命中，判定取每条命中最新一次结果`"
              >{{ Math.round(wordAccuracyOf(w)! * 100) }}%</span>
            </td>
            <td>
              <span class="wt-state" :class="w.enabled ? 'on' : 'off'">{{ w.enabled ? '启用' : '停用' }}</span>
            </td>
            <td v-if="canMaintainWords">
              <button type="button" class="row-btn" @click="toggleWordEnabled(w)">
                {{ w.enabled ? '停用' : '启用' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="drawer-note">
        {{ canMaintainWords ? '词表由投诉督导与管理员维护；新建默认停用，确认近 7 天命中量后再启用。' : '词表只读；维护请联系投诉督导。' }}
      </p>
    </a-drawer>

    <!-- 新建风险词 -->
    <a-modal
      v-model:open="wordFormOpen"
      title="新建风险词"
      :width="560"
      ok-text="保存"
      cancel-text="取消"
      @ok="saveWord"
    >
      <div class="word-form op-form">
        <p class="op-tip op-tip-info wf-tip">
          主词是规则的显示名与统计口径，同义词命中也记在它名下；同一工单同一段原文只产生一条命中。
        </p>

        <div class="wf-section">
          <div class="wf-section-title">规则定义</div>
          <div class="op-field op-field-h">
            <span class="op-label req">主词</span>
            <a-input v-model:value="wordForm.word" placeholder="如：曝光、12315" />
          </div>
          <div class="op-field op-field-h op-field-h-top">
            <span class="op-label">同义词</span>
            <div class="wf-syn-box">
              <div v-if="wordForm.synonyms.length" class="wf-syn-chips">
                <span v-for="(s, i) in wordForm.synonyms" :key="s" class="wf-syn-chip">
                  {{ s }}
                  <button type="button" class="wf-syn-del" @click="removeSynonym(i)">×</button>
                </span>
              </div>
              <a-input
                v-model:value="synonymDraft"
                placeholder="等价表达，回车添加，如：媒体、新闻"
                @press-enter="addSynonym"
              />
            </div>
          </div>
          <div class="op-field op-field-h">
            <span class="op-label">分级</span>
            <a-radio-group v-model:value="wordForm.level" button-style="solid" size="small">
              <a-radio-button v-for="g in GRADES" :key="g" :value="g">{{ g }}危</a-radio-button>
            </a-radio-group>
          </div>
        </div>

        <div class="wf-section">
          <div class="wf-section-title req">匹配范围</div>
          <a-checkbox-group v-model:value="wordForm.scopes" class="wf-scope-grid" :options="SCOPE_OPTIONS" />
        </div>

        <div class="op-field op-field-h">
          <span class="op-label">上线状态</span>
          <div class="wf-enable-row">
            <a-switch v-model:checked="wordForm.enabled" checked-children="启用" un-checked-children="停用" />
            <span class="op-hint wf-enable-hint">启用后纳入实时监控，增量工单自动命中，手动筛查也只跑启用中的词；停用即完全不参与筛查。建议新建先对照近 7 天命中量，确认不会刷屏后再启用。</span>
          </div>
        </div>
      </div>
    </a-modal>

    <!-- 保存筛选器：存的是当前九个维度的整套取值，名字即日后认出它的唯一凭据 -->
    <a-modal
      v-model:open="filterSaveOpen"
      title="保存筛选器"
      :width="460"
      ok-text="保存"
      cancel-text="取消"
      @ok="confirmSaveFilter"
    >
      <div class="op-form sf-form">
        <div class="op-field op-field-h">
          <span class="op-label req">名称</span>
          <a-input
            v-model:value="filterNameDraft"
            placeholder="如：教育线安全事故专项"
            @press-enter="confirmSaveFilter"
          />
        </div>
        <p v-if="filterNameTaken" class="op-tip op-tip-info sf-tip">
          已有同名筛选器，保存后<b>覆盖</b>它的条件，不会多出第二条同名。
        </p>
        <div class="sf-preview">
          <div class="sf-preview-k">本次存下的条件</div>
          <div class="sf-preview-v">{{ scanSummary }}</div>
        </div>
      </div>
    </a-modal>

    <!-- 批量打标 -->
    <OpActionModal
      :open="bulkOpen"
      title="批量打标"
      :icon="TagsOutlined"
      tone="primary"
      :width="480"
      ok-text="保存"
      :ok-disabled="!canSaveBulk"
      @update:open="bulkOpen = $event"
      @ok="saveBulk"
    >
      <div class="op-form tag-modal-form">
        <div class="tag-hit-head tag-bulk-head">
          <div class="tag-bulk-summary">
            <span>已选 <strong>{{ bulkTargets.length }}</strong> 条</span>
            <template v-if="bulkGradeMix">
              <span class="tag-hit-sep">·</span>
              <span>词表预设 {{ bulkGradeMix }}</span>
            </template>
          </div>
        </div>

        <div class="op-field op-field-h tag-field-block">
          <div class="op-label req">本次命中</div>
          <div class="op-radio-cards op-radio-cards--row tag-radio-compact tag-radio-fill">
            <div
              class="op-radio-card"
              :class="{ on: bulkVerdict === '成立' }"
              @click="bulkVerdict = '成立'"
            >
              <div class="op-rc-title">均成立</div>
            </div>
            <div
              class="op-radio-card"
              :class="{ on: bulkVerdict === '误报' }"
              @click="bulkVerdict = '误报'"
            >
              <div class="op-rc-title">均误报</div>
            </div>
          </div>
        </div>

        <div class="op-field op-field-h tag-field-block">
          <div class="op-label">风险等级</div>
          <div
            class="op-radio-cards op-radio-cards--row tag-radio-compact tag-radio-fill tag-radio-4"
            :class="{ 'op-radio-disabled': bulkVerdict === '误报' }"
          >
            <div
              class="op-radio-card"
              :class="{ on: bulkLevel === '' }"
              @click="bulkVerdict !== '误报' && (bulkLevel = '')"
            >
              <div class="op-rc-title">保持预设</div>
            </div>
            <div
              v-for="g in GRADES"
              :key="g"
              class="op-radio-card"
              :class="{ on: bulkLevel === g }"
              :style="bulkLevel === g ? { borderColor: RISK_LEVEL_STYLE[g].color, background: `${RISK_LEVEL_STYLE[g].bg}33` } : {}"
              @click="bulkVerdict !== '误报' && (bulkLevel = g)"
            >
              <div class="op-rc-title">{{ g }}危</div>
            </div>
          </div>
        </div>
        <div class="tag-form-foot">
          {{
            bulkVerdict === '误报'
              ? '误报无需定级'
              : '默认保持词表预设；本批须同一结论，有分歧请分次打标'
          }}
        </div>

        <div class="op-field op-field-h op-field-h-top tag-field-note">
          <div class="op-label">处置备注</div>
          <a-textarea v-model:value="bulkNote" :rows="2" placeholder="核实结论与后续动作（可选）" />
        </div>
      </div>
    </OpActionModal>

    <!-- 扫库记录：实时监控与手动筛查的执行留痕 -->
    <a-drawer v-model:open="runsOpen" title="扫库记录" width="880" placement="right">
      <p class="drawer-note top">
        实时监控由系统或刷新触发；手动筛查由坐席点「开始筛查」触发。
        每次执行记开始/结束时刻、触发人与结果；<b>扫了没发现新问题同样是结论</b>。
      </p>
      <div v-if="!scanRuns.length" class="ob-empty">尚无扫库记录</div>
      <table v-else class="word-table run-table">
        <thead>
          <tr>
            <th style="width: 76px">类型</th>
            <th style="width: 72px">触发人</th>
            <th style="width: 148px">开始</th>
            <th style="width: 148px">结束</th>
            <th style="width: 168px">结果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in scanRunsDesc" :key="r.id">
            <td>
              <span class="run-kind" :class="r.kind">{{ SCAN_KIND_LABEL[r.kind] }}</span>
            </td>
            <td class="hit-sub">{{ r.triggerBy }}</td>
            <td class="hit-when">{{ r.startedAt }}</td>
            <td class="hit-when">{{ r.endedAt }}</td>
            <td>
              <span class="run-status" :class="r.status">{{ SCAN_STATUS_LABEL[r.status] }}</span>
              <div class="run-res" :class="r.status">{{ scanRunResultText(r) }}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </a-drawer>

    <!-- 单条核实：首次打标与后续修正共用同一个弹窗，只在标题、必填项与留痕区上区分 -->
    <OpActionModal
      :open="tagOpen"
      :title="tagAmend ? '修正核实结果' : '风险打标'"
      :icon="tagAmend ? EditOutlined : TagOutlined"
      tone="primary"
      :width="480"
      :ok-text="tagAmend ? '保存修正' : '保存'"
      :ok-disabled="!canSaveTag"
      @update:open="tagOpen = $event"
      @ok="saveTag"
    >
      <div v-if="tagTarget" class="op-form tag-modal-form">
        <div class="tag-hit-head">
          <div class="tag-hit-top">
            <button type="button" class="tag-ticket-no" @click="openTicket(tagTarget.ticketNo)">
              {{ tagTarget.ticketNo }}
            </button>
            <span class="tag-hit-title">{{ tagTarget.title }}</span>
          </div>
          <div class="tag-hit-excerpt">
            <span class="hit-pos">{{ tagTarget.position }}</span>
            「{{ tagTarget.excerpt }}」
          </div>
          <div class="tag-hit-meta">
            <span>风险词 <strong>「{{ tagTarget.word }}」</strong></span>
            <template v-if="tagTarget.matchedWord && tagTarget.matchedWord !== tagTarget.word">
              <span class="tag-hit-sep">·</span>
              <span>命中「{{ tagTarget.matchedWord }}」</span>
            </template>
            <span class="tag-hit-sep">·</span>
            <span>词表预设</span>
            <span
              class="grade-pill-inline"
              :style="{ color: RISK_LEVEL_STYLE[presetGradeOf(tagTarget)].color, background: RISK_LEVEL_STYLE[presetGradeOf(tagTarget)].bg }"
            >{{ presetGradeOf(tagTarget) }}危</span>
          </div>
          <!-- 修正态先把"现在是什么"摆明，否则改完不知道自己改动了哪一项 -->
          <div v-if="tagAmend && tagCurrent" class="tag-cur">
            <span class="tag-cur-k">现行结果</span>
            <span
              v-if="tagCurrent.level"
              class="grade-pill-inline"
              :style="{ color: RISK_LEVEL_STYLE[tagCurrent.level].color, background: RISK_LEVEL_STYLE[tagCurrent.level].bg }"
            >{{ tagCurrent.level }}危</span>
            <span class="verdict-chip" :class="tagCurrent.verdict === '误报' ? 'vc-fp' : 'vc-ok'">{{ tagCurrent.verdict }}</span>
            <span class="tag-hit-sep">·</span>
            <span>{{ tagCurrent.by }}（{{ tagCurrent.byRole }}）于 {{ tagCurrent.at }}</span>
          </div>
        </div>

        <!--
          同单其它命中及其结论（PRD §6.7 / 规则 26b）。
          🔴 这一块是「同单互见」的全部价值所在：核实第二条的人必须看得到第一条判成了什么。
          客户从「退一赔三」升级到「12315」是**措辞在爬坡**，比一个客户单次说 12315
          严重得多——而这个判断只有把两条摆在一起才做得出来。故连原文片段一并列出，
          光有规则名与结论看不出"话是怎么一步步说重的"。
        -->
        <div v-if="tagSiblings.length" class="tag-sib">
          <div class="tag-sib-head">
            <span class="tag-sib-title">本单其它命中</span>
            <span class="tag-sib-n">{{ tagSiblings.length }} 条</span>
            <span class="tag-sib-grade">
              本单当前风险等级
              <span
                v-if="tagTicketGrade"
                class="grade-pill-inline"
                :style="{ color: RISK_LEVEL_STYLE[tagTicketGrade].color, background: RISK_LEVEL_STYLE[tagTicketGrade].bg }"
                title="已核实且成立的命中取最高，只升不降；误报与未核实的不参与"
              >{{ tagTicketGrade }}危</span>
              <span v-else class="tag-sib-nograde" title="该单还没有任何一条命中被核实为成立">尚无</span>
            </span>
          </div>
          <ol class="tag-sib-list">
            <li v-for="s in tagSiblings" :key="s.id" class="tsb-item">
              <div class="tsb-head">
                <span class="tsb-word">「{{ s.word }}」</span>
                <span class="tsb-at">{{ s.when }}</span>
                <span v-if="!verdictOf(s)" class="tsb-open">待核实</span>
                <template v-else>
                  <span
                    class="verdict-chip"
                    :class="verdictOf(s) === '误报' ? 'vc-fp' : 'vc-ok'"
                  >{{ verdictOf(s) }}</span>
                  <span
                    v-if="gradeOf(s)"
                    class="grade-pill-inline"
                    :style="{ color: RISK_LEVEL_STYLE[gradeOf(s)!].color, background: RISK_LEVEL_STYLE[gradeOf(s)!].bg }"
                  >{{ gradeOf(s) }}危</span>
                </template>
              </div>
              <div class="tsb-excerpt">
                <span class="hit-pos">{{ s.position }}</span>
                「{{ s.excerpt }}」
              </div>
            </li>
          </ol>
        </div>

        <div class="op-field op-field-h tag-field-block">
          <div class="op-label req">本次命中</div>
          <div class="op-radio-cards op-radio-cards--row tag-radio-compact tag-radio-fill">
            <div
              class="op-radio-card"
              :class="{ on: tagVerdict === '成立' }"
              @click="tagVerdict = '成立'"
            >
              <div class="op-rc-title">成立</div>
            </div>
            <div
              class="op-radio-card"
              :class="{ on: tagVerdict === '误报' }"
              @click="tagVerdict = '误报'"
            >
              <div class="op-rc-title">误报</div>
            </div>
          </div>
        </div>

        <div class="op-field op-field-h tag-field-block">
          <div class="op-label req">风险等级</div>
          <div
            class="op-radio-cards op-radio-cards--row tag-radio-compact tag-radio-fill"
            :class="{ 'op-radio-disabled': tagVerdict === '误报' }"
          >
            <div
              v-for="g in GRADES"
              :key="g"
              class="op-radio-card"
              :class="{ on: tagLevel === g }"
              :style="tagLevel === g ? { borderColor: RISK_LEVEL_STYLE[g].color, background: `${RISK_LEVEL_STYLE[g].bg}33` } : {}"
              @click="tagVerdict !== '误报' && (tagLevel = g)"
            >
              <div class="op-rc-title">{{ g }}危</div>
            </div>
          </div>
        </div>
        <div class="tag-form-foot">
          {{
            tagVerdict === '误报'
              ? '误报无需定级'
              : tagAmend
                ? '改判会立即改变台账归属与准确率，等级同理'
                : '等级默认沿用词表预设，可按实际情况调整'
          }}
        </div>

        <!-- 修正必须答得出"为什么改"：只记改前改后，复盘时链条仍是断的 -->
        <div v-if="tagAmend" class="op-field op-field-h op-field-h-top tag-field-note">
          <div class="op-label req">修正原因</div>
          <a-textarea
            v-model:value="tagReason"
            :rows="2"
            placeholder="为什么改判，如：复听通话录音，客户并未提及外部渠道"
          />
        </div>

        <div class="op-field op-field-h op-field-h-top tag-field-note">
          <div class="op-label">处置备注</div>
          <a-textarea v-model:value="tagNote" :rows="2" placeholder="核实结论与后续动作（可选）" />
        </div>

        <div v-if="tagVerdict === '成立' && tagLevel === '高'" class="op-tip op-tip-info tag-tip-compact">
          保存后可在列表点「去管控」转交{{ DISPOSAL_BY_GRADE['高'].who }}
        </div>

        <!-- 改动历史：它是佐证不是填写项，按信息层级排在最后 -->
        <div v-if="tagHistory.length" class="tag-trace">
          <div class="tag-trace-head">
            修正记录<span class="tag-trace-n">{{ tagHistory.length }} 条</span>
          </div>
          <ol class="tag-trace-list">
            <li v-for="(e, i) in tagHistory" :key="`${e.at}-${i}`" class="tt-item">
              <div class="tt-head">
                <span class="tt-step">{{ i === 0 ? '首次核实' : `第 ${i} 次修正` }}</span>
                <!-- 角色与姓名并列：复盘时"谁判的"要连着"他是什么岗"一起读才有分量 -->
                <span class="tt-by">{{ e.by }}</span>
                <span class="tt-role">{{ e.byRole }}</span>
                <span class="tt-at">{{ e.at }}</span>
              </div>
              <div class="tt-change">
                <template v-if="i === 0">判为 {{ e.verdict }}{{ e.level ? ` · ${e.level}危` : '' }}</template>
                <template v-else>{{ entryDiffText(tagHistory[i - 1], e) }}</template>
              </div>
              <div v-if="e.amendReason" class="tt-reason">原因：{{ e.amendReason }}</div>
            </li>
          </ol>
        </div>
      </div>
    </OpActionModal>
  </div>
</template>

<style scoped>
/* 页壳：对齐个人门户 / 班组长看板 §4.9 */
.risk-monitor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px 24px;
  min-height: 100%;
  width: 100%;
  min-width: 0;
  background:
    radial-gradient(ellipse 80% 40% at 0% 0%, rgba(26, 111, 255, 0.08), transparent 55%),
    radial-gradient(ellipse 60% 30% at 100% 8%, rgba(16, 185, 129, 0.05), transparent 50%),
    #f3f6fb;
}

/* ① 页面标识条：token 全部对齐 §4.9「问候区」，与个人门户 / 班组看板同一条 */
.greeting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 18px;
  border-radius: 14px;
  border: 1px solid rgba(26, 111, 255, 0.18);
  background: linear-gradient(135deg, #eff6ff 0%, #f8fbff 48%, #ecfdf5 100%);
  box-shadow: 0 4px 16px rgba(26, 111, 255, 0.08);
}
/* 有高危未核实时整条转危险语义（§2.3），不再靠满屏粉底喊人 */
.greeting-card.urgent {
  border-color: rgba(239, 68, 68, 0.24);
  background: linear-gradient(135deg, #fef2f2 0%, #fff8f8 52%, #fffbeb 100%);
  box-shadow: 0 4px 16px rgba(239, 68, 68, 0.08);
}
.greeting-lead {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.greeting-text { min-width: 0; }
.greeting-title {
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.greeting-sub { margin-top: 6px; font-size: 12px; color: #64748b; line-height: 1.55; }
.greeting-aside { display: flex; align-items: center; flex: none; }

/* 工具/筛选条外壳：§4.9「筛选条」token */
.section-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  padding: 6px 10px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}
.head-tools { background: rgba(255, 255, 255, 0.72); border-color: rgba(255, 255, 255, 0.9); }

/* ② 监控成效：标题 + 四项指标 + 核实结果收成一行 */
.effect-section { padding: 8px 12px; }
.effect-row {
  display: flex;
  align-items: center;
  gap: 10px 14px;
  min-width: 0;
  flex-wrap: nowrap;
}
.effect-title {
  flex: none;
  margin: 0;
  white-space: nowrap;
}
.effect-metrics {
  display: flex;
  align-items: stretch;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.em-item {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  padding: 4px 10px 4px 10px;
  border: 1px solid transparent;
  border-left: 3px solid var(--kpi-accent, #9ca3af);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.em-item:hover { background: #f9fafb; }
.em-item.on {
  border-color: var(--kpi-accent);
  background: color-mix(in srgb, var(--kpi-accent) 6%, #fff);
}
.em-item.em-static { cursor: default; }
.em-item.em-static:hover { background: transparent; }
.em-label { font-size: 11px; color: #9ca3af; flex: none; }
.em-val {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: #111827;
  font-variant-numeric: tabular-nums;
}
.em-val.muted { color: #9ca3af; }
.em-hint { font-size: 11px; color: #9ca3af; font-variant-numeric: tabular-nums; }
.em-hint.bad { color: #EF4444; }

/* 核实结果：成效的落点，同时是切到「已核实」两态的入口 */
.effect-result {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  min-width: 0;
  padding-left: 12px;
  border-left: 1px solid #eef2f7;
}
.er-label {
  flex: none;
  font-size: 11px;
  font-weight: 500;
  color: #9ca3af;
  white-space: nowrap;
}
.er-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px 0 10px;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  white-space: nowrap;
}
.er-btn:hover { border-color: #1a6fff; background: #f8fbff; }
.er-btn.active { border-color: #1a6fff; background: #EFF6FF; }
.er-btn.active .er-name { color: #1a6fff; font-weight: 600; }
.er-num {
  flex: none;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.er-num.danger { color: #EF4444; }
.er-num.muted { color: #9CA3AF; }
.er-name { font-size: 12px; font-weight: 500; color: #374151; }
.er-mix { font-size: 11px; color: #9ca3af; font-variant-numeric: tabular-nums; }
.er-go { flex: none; font-size: 10px; color: #d1d5db; }
.er-btn:hover .er-go, .er-btn.active .er-go { color: #1a6fff; }

/* 上次执行 + 扫库记录：§4.1 次按钮外形，记录条数用主色点出可点 */
.run-entry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #D1D5DB;
  border-radius: 4px;
  background: #fff;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.run-entry:hover:not(:disabled) { background: #F9FAFB; border-color: #9CA3AF; }
.run-entry:disabled { cursor: default; background: #F3F4F6; border-color: #E5E7EB; }
.monitor-last-run-k { font-size: 11px; color: #9CA3AF; }
.monitor-clock { font-size: 12px; color: #374151; font-variant-numeric: tabular-nums; font-weight: 600; }
.run-entry-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #1A6FFF;
  padding-left: 8px;
  border-left: 1px solid #E5E7EB;
  font-variant-numeric: tabular-nums;
}
.run-entry:disabled .run-entry-meta { color: #9CA3AF; }
.run-entry:disabled .monitor-clock { color: #6B7280; }
.monitor-refresh {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 1px solid #D1D5DB; background: #fff; border-radius: 4px;
  color: #6B7280; cursor: pointer; font-size: 12px;
}
.monitor-refresh:hover { background: #F9FAFB; color: #374151; }

/* 风险词入口：§4.1 次按钮 + 主色背景（弱强调），28px 紧凑高度 */
.word-entry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #dbeafe;
  border-radius: 4px;
  background: #EFF6FF;
  color: #1A6FFF;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  flex: none;
}
.word-entry:hover { background: #dbeafe; border-color: #93c5fd; color: #0F4FCC; }
.word-entry-label { white-space: nowrap; }
.word-entry-meta {
  font-size: 11px;
  font-weight: 500;
  color: #6B7280;
  padding-left: 6px;
  border-left: 1px solid #bfdbfe;
  white-space: nowrap;
}

/* 分区卡片：对齐 overview-section */
.overview-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.section-head {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap;
}
.section-head-actions {
  display: inline-flex; align-items: center; gap: 8px; flex: none;
}
.section-head-main { min-width: 0; }
.section-title {
  margin: 0; font-size: 13px; font-weight: 700; color: #111827;
  display: inline-flex; align-items: center; gap: 6px; line-height: 1.3;
}
.list-count {
  min-width: 20px; padding: 0 6px; border-radius: 8px; font-size: 11px; font-weight: 700;
  background: #f3f4f6; color: #6b7280; font-variant-numeric: tabular-nums;
}

/* 清单主 Tab：实时监控 / 手动筛查 / 已核实 */
.list-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.list-view-tabs {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 0 4px;
  border-bottom: 1px solid #eef2f7;
  flex: 1;
  min-width: 0;
}
.lvt-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  margin-bottom: -1px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #6b7280;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.lvt-tab:hover { color: #374151; }
.lvt-tab.on { color: #1a6fff; font-weight: 700; border-bottom-color: #1a6fff; }
.lvt-num {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 8px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.lvt-tab.on .lvt-num { background: #eff6ff; color: #1a6fff; }
.lvt-num.bad { background: #fee2e2; color: #ef4444; }

/* ③-b 分级筛选 chip：选中态用品牌主色（§4.6 激活），等级点取 RISK_LEVEL_STYLE */
.grade-filters { gap: 6px 8px; }
.gf-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border: 1px solid #D1D5DB; border-radius: 3px;
  background: #fff; color: #6B7280; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit;
}
.gf-chip:hover { background: #F9FAFB; border-color: #9CA3AF; color: #374151; }
.gf-chip.active { background: #1A6FFF; border-color: #1A6FFF; color: #fff; font-weight: 600; }
.gf-chip.active .gf-dot { box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.7); }
.gf-chip.warn:not(.active) { border-color: #EF4444; background: #EF444422; color: #EF4444; }
.gf-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.gf-num {
  min-width: 18px; padding: 0 5px; border-radius: 8px; font-size: 11px; font-weight: 700;
  background: rgba(0, 0, 0, 0.06); font-variant-numeric: tabular-nums;
}
.gf-chip.active .gf-num { background: rgba(255, 255, 255, 0.22); }

/* 表格 */
.ob-empty { padding: 32px 8px; text-align: center; color: #94a3b8; font-size: 13px; }
.work-panel .hit-table { margin: 0; }
.hit-table-wrap {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  /*
   * 窄屏兜底：七列固定宽加起来就 726px，容器再窄「命中内容」会被挤到只剩几十像素，
   * 而 overflow: hidden 会把命中原文**静默裁掉**——人看到的是半句话，却不知道被截了。
   * 给表格一条下限并允许横向滚动：宁可滚，也不能悄悄把判断依据吞掉。
   * 正常桌面宽度下达不到这条线，滚动条不会出现。
   */
  overflow-x: auto;
  background: #fff;
}
.hit-table { min-width: 960px; }

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
}
.pager-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.pager-total {
  font-size: 13px;
  color: #6b7280;
}
.pager-selected {
  font-size: 13px;
  color: #1a6fff;
}

.hit-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.hit-table th {
  text-align: left; font-weight: 600; color: #6B7280; font-size: 11px;
  padding: 8px 10px; border-bottom: 1px solid #E5E7EB; background: #F3F4F6;
}
.hit-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.hit-table tr.untagged { background: #fef2f2; }
.hit-table tr.untagged td:first-child { box-shadow: inset 3px 0 0 #EF4444; }
.grade-pill {
  display: inline-block; min-width: 22px; text-align: center;
  padding: 1px 6px; border-radius: 3px; font-size: 12px; font-weight: 700;
}
.rt-no { border: none; background: none; color: #1A6FFF; cursor: pointer; padding: 0; font-size: 13px; font-variant-numeric: tabular-nums; }
.hit-title { color: #0f172a; margin-top: 2px; font-size: 12px; }
.hit-sub { color: #94a3b8; font-size: 11px; }
.hit-excerpt { color: #475569; line-height: 1.6; font-size: 12px; }
.hit-pos { display: inline-block; padding: 0 5px; margin-right: 4px; border-radius: 3px; background: #F3F4F6; color: #6B7280; font-size: 11px; }
.hit-when { color: #64748b; font-variant-numeric: tabular-nums; font-size: 12px; }

.track-word { color: #475569; font-size: 12px; font-weight: 500; }
.track-word-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.grade-pill-inline { padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }

.hit-flag { display: inline-block; margin-top: 4px; padding: 0 6px; border-radius: 3px; font-size: 10px; }
.flag-scan { background: #EFF6FF; color: #1D4ED8; }

/* 工单级事实：同单互见徽标 + 工单级等级提示，同处工单列 */
.ticket-facts { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
/* 徽标可点，故给出按钮形态与主色描边——不可点的 flag-scan 保持纯色块，两者不能长得一样 */
.flag-sib {
  border: 1px solid #C7D2FE; background: #EEF2FF; color: #4338CA;
  font-family: inherit; line-height: 16px; cursor: pointer;
}
.flag-sib:hover { border-color: #6366F1; background: #E0E7FF; }
.flag-sib.on { border-color: #4338CA; background: #4338CA; color: #fff; }
.ticket-grade-note { margin-top: 3px; font-size: 11px; }
.ticket-grade-note b { font-weight: 700; }

/* 手动筛查：就地筛选条，沿用工作台 query-filters 形态 */
.scan-entry { display: inline-flex; align-items: center; gap: 4px; }
.scan-entry.active { border-color: #1a6fff; color: #1a6fff; }
.hit-batch-btn.active { background: #f8fbff; }
.hit-batch-badge {
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
  color: #fff;
  background: #1a6fff;
  border-radius: 7px;
}

.scan-bar { margin: 2px 0 8px; }
/* 手动筛查九维：5 列更紧凑，避免 4 列时每格过宽、占三行 */
.scan-bar .list-toolbar {
  gap: 6px 10px;
  padding: 8px 10px;
}
.scan-bar .tb-fields {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px 10px;
}
.scan-bar .fi { gap: 6px; }
.scan-bar .fi-date { grid-column: span 2; }
.scan-bar .fl {
  width: 3.5em;
  font-size: 11px;
  line-height: 28px;
}
.scan-bar .tb-actions { min-width: 84px; }
.scan-bar .list-toolbar :deep(.tb-ctl.ant-select-multiple .ant-select-selection-item) {
  max-width: 64px;
}
.scan-bar .list-toolbar :deep(.tb-range .ant-picker-input > input) {
  font-size: 11px;
}

/*
 * 已保存筛选器 chip：胶囊 + 漏斗标 + 靛蓝一色，与等级 chip（方角、灰白底、蓝色实心激活）
 * 一眼可分。两者点下去的后果不是一个量级：那边是筛，这边是换整套条件并重跑。
 */
.saved-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-top: 8px;
  padding: 6px 10px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 8px;
}
.sf-label { font-size: 11px; color: #9ca3af; flex: none; }
.sf-chip {
  display: inline-flex;
  align-items: center;
  height: 24px;
  border: 1px solid #c7d2fe;
  border-radius: 999px;
  background: #fff;
  overflow: hidden;
}
.sf-chip:hover { border-color: #6366f1; }
.sf-chip.on { border-color: #4338ca; background: #eef2ff; }
.sf-apply {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 100%;
  padding: 0 4px 0 10px;
  border: none;
  background: transparent;
  color: #4338ca;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sf-chip.on .sf-apply { font-weight: 600; }
.sf-apply:disabled { color: #a5b4fc; cursor: not-allowed; }
.sf-ic { font-size: 11px; flex: none; }
.sf-del {
  height: 100%;
  padding: 0 8px 0 4px;
  border: none;
  background: transparent;
  color: #a5b4fc;
  font-size: 13px;
  line-height: 1;
  font-family: inherit;
  cursor: pointer;
}
.sf-del:hover { color: #ef4444; }
.sf-hint { font-size: 11px; color: #cbd5e1; }

/* 保存筛选器弹窗 */
.sf-form .op-label { width: 3.5em; }
.sf-tip { margin: 8px 0 0; }
.sf-preview {
  margin-top: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 6px;
}
.sf-preview-k { font-size: 11px; color: #9ca3af; }
.sf-preview-v { margin-top: 4px; font-size: 12px; color: #475569; line-height: 1.6; }
.ledger-bar { margin: 2px 0 8px; }
.ledger-bar .list-toolbar {
  gap: 6px 10px;
  padding: 8px 10px;
}
.ledger-bar .tb-actions { min-width: 84px; }

/* 筛选条：标签左、控件右（固定标签宽，列内对齐）；右侧动作跟两行控件对齐 */
.list-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 12px;
  align-items: start;
  padding: 8px 12px;
  background: #f9fafb;
  border: 1px solid #f0f1f3;
  border-radius: 6px;
}
.tb-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px 12px;
  min-width: 0;
}
.fi {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.fl {
  width: 4em;
  flex: none;
  font-size: 12px;
  color: #6b7280;
  line-height: 28px;
  text-align: right;
  white-space: nowrap;
}
.tb-ctl { flex: 1; min-width: 0; width: auto !important; }
.list-toolbar :deep(.tb-ctl.ant-select .ant-select-selector) {
  font-size: 13px;
  border-radius: 6px;
  background: #fff;
  min-height: 28px !important;
  border-color: #d1d5db;
}
.list-toolbar :deep(.tb-ctl.ant-select-single .ant-select-selector) {
  height: 28px !important;
  align-items: center;
}
.list-toolbar :deep(.tb-ctl.ant-select-single .ant-select-selection-item),
.list-toolbar :deep(.tb-ctl.ant-select-single .ant-select-selection-placeholder) {
  line-height: 26px;
}
.list-toolbar :deep(.tb-ctl.ant-select-multiple .ant-select-selector) {
  height: 28px !important;
  padding-block: 0;
  align-items: center;
  overflow: hidden;
}
.list-toolbar :deep(.tb-ctl.ant-select-multiple .ant-select-selection-overflow) {
  flex-wrap: nowrap;
}
.list-toolbar :deep(.tb-ctl.ant-select-multiple .ant-select-selection-item) {
  height: 20px;
  line-height: 18px;
  margin-block: 0;
  max-width: 100%;
}
.tb-range { flex: 1; min-width: 0; width: auto !important; }
.list-toolbar :deep(.tb-range.ant-picker) {
  width: 100%;
  height: 28px;
  font-size: 13px;
  border-radius: 6px;
  background: #fff;
  padding: 0 4px 0 8px;
  border-color: #d1d5db;
}
.list-toolbar :deep(.tb-range .ant-picker-input) {
  flex: 1;
  min-width: 0;
}
.list-toolbar :deep(.tb-range .ant-picker-input > input) {
  width: 100%;
  min-width: 0;
  font-size: 12px;
  line-height: 26px;
}
.list-toolbar :deep(.tb-range .ant-picker-suffix) {
  display: none;
}
.list-toolbar :deep(.tb-range .ant-picker-input) {
  flex: 1;
  min-width: 0;
}
.list-toolbar :deep(.tb-range .ant-picker-input > input) {
  width: 100%;
  min-width: 0;
  font-size: 12px;
  line-height: 26px;
}
.tb-search {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-sizing: border-box;
}
.tb-search:focus-within {
  border-color: #1a6fff;
  box-shadow: 0 0 0 2px rgb(26 111 255 / 10%);
}
.tb-search-ic { color: #9ca3af; font-size: 13px; flex: none; }
.tb-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 13px;
  color: #374151;
  background: transparent;
  font-family: inherit;
}
.tb-search-input::placeholder { color: #9ca3af; }
.tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 12px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  font-family: inherit;
}
.tb-btn:hover { border-color: #1a6fff; color: #1a6fff; }
.tb-btn :deep(.anticon) { font-size: 12px; }
.tb-btn:disabled { color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed; }
.tb-btn:disabled:hover { color: #9ca3af; border-color: #e5e7eb; }
.tb-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  align-self: center;
  gap: 8px;
  min-width: 96px;
}
.tb-actions .tb-btn,
.tb-actions .scan-go { width: 100%; }

@media (max-width: 860px) {
  .list-toolbar { grid-template-columns: 1fr; }
  .tb-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .scan-bar .tb-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tb-actions { flex-direction: row; min-width: 0; gap: 8px; }
}

.link-btn {
  padding: 0; border: none; background: transparent; font-size: 12px;
  color: #1a6fff; cursor: pointer; font-family: inherit;
}
.link-btn:hover { color: #0f4fcc; text-decoration: underline; }
.link-btn:disabled { color: #cbd5e1; cursor: not-allowed; text-decoration: none; }
.link-btn:disabled:hover { color: #cbd5e1; text-decoration: none; }
.row-btn-solid { background: #1e293b; border-color: #1e293b; color: #fff; }
.row-btn-solid:disabled { opacity: 0.45; cursor: not-allowed; }

/* 筛查结果条 */
.scan-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 12px; margin-bottom: 10px;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;
}
.sb-stat { font-size: 13px; color: #334155; }
.sb-stat b { font-size: 16px; color: #0f172a; }
.sr-fresh { margin-left: 8px; padding: 0 7px; border-radius: 10px; font-size: 12px; background: #dcfce7; color: #15803d; }
.sr-dup { margin-left: 6px; padding: 0 7px; border-radius: 10px; font-size: 12px; background: #f1f5f9; color: #64748b; }
.sb-hint { margin-left: 10px; font-size: 12px; color: #94a3b8; }
/* 单工单焦点条：与筛查结果条同形，靛蓝一色区分"这是收窄不是新数据" */
.focus-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 12px; margin-bottom: 10px;
  background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 6px;
}
.fb-stat { font-size: 13px; color: #3730A3; }
.fb-stat b { font-size: 14px; color: #312E81; font-variant-numeric: tabular-nums; }
.fb-hint { margin-left: 10px; font-size: 12px; color: #818CF8; }
.fb-grade { margin-left: 10px; font-size: 12px; color: #4338CA; }
.fb-grade.muted { color: #818CF8; }
.fb-exit {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  height: 26px; padding: 0 10px; border: 1px solid #C7D2FE; border-radius: 4px;
  background: #fff; color: #4338CA; font-size: 12px; font-family: inherit; cursor: pointer;
}
.fb-exit:hover { border-color: #6366F1; background: #F5F3FF; }
.fb-x { font-size: 13px; line-height: 1; }

.sb-actions { display: inline-flex; align-items: center; gap: 12px; }
.sb-all { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #64748b; cursor: pointer; }
.sb-picked { font-size: 12px; color: #64748b; }

.hit-table tr.scan-dup { opacity: 0.55; }
.state-chip { padding: 1px 8px; border-radius: 10px; font-size: 12px; background: #f1f5f9; color: #64748b; }
.state-chip.sc-will { background: #dcfce7; color: #15803d; }
.state-chip.sc-skip { background: #fff; color: #94a3b8; border: 1px solid #e2e8f0; }
/* 开始筛查：主动作，与两个 link 按钮拉开层级 */
.scan-go {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  height: 28px; padding: 0 12px; border: none; border-radius: 6px;
  background: #1a6fff; color: #fff; font-size: 13px; cursor: pointer; font-family: inherit;
}
.scan-go:hover { background: #0f4fcc; }
.scan-go:disabled { opacity: 0.5; cursor: not-allowed; }

/* 监控雷达（顶栏） */
.radar { flex: none; display: flex; align-items: center; }
.radar-face {
  position: relative; width: 48px; height: 48px; border-radius: 50%;
  background: radial-gradient(circle, #f8fafc 0%, #eef2f7 70%, #e6ebf2 100%);
  border: 1px solid #dbe3ec; overflow: hidden;
}
.radar-ring { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); border: 1px solid #dbe3ec; border-radius: 50%; }
.radar-ring.r1 { width: 34%; height: 34%; }
.radar-ring.r2 { width: 64%; height: 64%; }
.radar-ring.r3 { width: 92%; height: 92%; }
.radar-cross { position: absolute; background: #dbe3ec; }
.radar-cross.v { left: 50%; top: 4%; width: 1px; height: 92%; }
.radar-cross.h { top: 50%; left: 4%; height: 1px; width: 92%; }
.radar-sweep {
  position: absolute; inset: 0; border-radius: 50%;
  background: conic-gradient(from 0deg, rgba(26, 111, 255, 0.28) 0deg, rgba(26, 111, 255, 0.06) 42deg, transparent 70deg, transparent 360deg);
  animation: radar-spin 4s linear infinite;
}
.radar.alert .radar-sweep {
  background: conic-gradient(from 0deg, rgba(220, 38, 38, 0.26) 0deg, rgba(220, 38, 38, 0.06) 42deg, transparent 70deg, transparent 360deg);
}
@keyframes radar-spin { to { transform: rotate(360deg); } }
.radar-blip {
  position: absolute; width: 4px; height: 4px; border-radius: 50%;
  transform: translate(-50%, -50%); cursor: help;
  animation: radar-pulse 4s ease-in-out infinite;
}
@keyframes radar-pulse { 0%, 70%, 100% { opacity: 0.5; } 82% { opacity: 1; } }
.radar-hub {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  width: 8px;
  height: 8px;
  border: 1.5px solid #94a3b8;
  border-radius: 50%;
  background: #fff;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 60%);
  pointer-events: none;
}
.radar-hub::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #1a6fff;
  transform: translate(-50%, -50%);
}
.radar.alert .radar-hub {
  border-color: #f87171;
  box-shadow: 0 0 0 1px rgb(255 255 255 / 70%), 0 0 6px rgb(220 38 38 / 18%);
}
.radar.alert .radar-hub::after {
  background: #dc2626;
}
@media (prefers-reduced-motion: reduce) {
  .radar-sweep, .radar-blip { animation: none; }
}

.hit-cb {
  width: 16px;
  height: 16px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  vertical-align: middle;
}
.hit-cb.checked {
  background: #1a6fff;
  border-color: #1a6fff;
}

/* 打标弹窗 · 紧凑布局 */
.tag-modal-form { gap: 10px; }
.tag-hit-head {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tag-hit-top {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.tag-ticket-no {
  flex: none;
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: #1a6fff;
  cursor: pointer;
}
.tag-ticket-no:hover { text-decoration: underline; }
.tag-hit-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-hit-excerpt {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.55;
}
.tag-hit-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
}
.tag-hit-meta strong { color: #374151; font-weight: 600; }
.tag-hit-sep { color: #d1d5db; }
.tag-bulk-head { padding: 8px 12px; }
.tag-bulk-summary {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}
.tag-bulk-summary strong {
  color: #111827;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.tag-modal-form .op-field-h > .op-label {
  width: 72px;
  text-align: right;
  flex-shrink: 0;
}
.tag-modal-form .op-field-h.tag-field-block {
  gap: 14px;
  margin: 0;
}
.tag-modal-form .op-field-h.tag-field-note {
  gap: 14px;
}
.tag-modal-form :deep(.tag-radio-fill) { flex: 1; min-width: 0; }
.tag-modal-form :deep(.tag-radio-compact .op-radio-card) {
  padding: 2px 8px;
  min-height: 26px;
  border-radius: 5px;
  justify-content: center;
  text-align: center;
}
.tag-modal-form :deep(.tag-radio-compact .op-rc-title) {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
}
.tag-modal-form :deep(.tag-radio-compact) { gap: 4px; }
.tag-modal-form :deep(.tag-radio-4 .op-rc-title) { font-size: 11px; }
.tag-modal-form :deep(.tag-radio-4 .op-radio-card) { padding: 2px 4px; }
.tag-modal-form .tag-field-block + .tag-field-block { margin-top: 8px; }
.tag-field-note :deep(textarea.ant-input) { font-size: 13px; }
.tag-form-foot {
  margin: -2px 0 0 86px;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.4;
}
.tag-tip-compact { padding: 8px 10px; font-size: 11px; }

/* 修正态：现行结果与改动历史 */
.tag-cur {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
}
.tag-cur-k { color: #9ca3af; }

/* 同单其它命中：靛蓝一色，与灰底的命中头、修正记录区分开——它讲的是别的命中，不是本条 */
.tag-sib {
  padding: 10px 12px;
  background: #F5F7FF;
  border: 1px solid #DDE3FF;
  border-radius: 8px;
}
.tag-sib-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
}
.tag-sib-title { font-weight: 600; color: #312E81; }
.tag-sib-n { font-size: 11px; color: #6366F1; font-variant-numeric: tabular-nums; }
.tag-sib-grade { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; color: #6b7280; }
.tag-sib-nograde { color: #9ca3af; cursor: help; }
.tag-sib-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tsb-item { padding-left: 10px; border-left: 2px solid #C7D2FE; }
.tsb-head { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.tsb-word { font-size: 12px; font-weight: 600; color: #374151; }
.tsb-at { font-size: 11px; color: #9ca3af; font-variant-numeric: tabular-nums; }
.tsb-open { padding: 0 6px; border-radius: 3px; font-size: 10px; background: #FEF3C7; color: #B45309; }
.tsb-excerpt { margin-top: 3px; font-size: 12px; color: #6b7280; line-height: 1.55; }
.tag-trace {
  padding: 10px 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.tag-trace-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.tag-trace-n { font-size: 11px; font-weight: 400; color: #9ca3af; }
.tag-trace-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tt-item { padding-left: 10px; border-left: 2px solid #e5e7eb; }
/* 末条即当前生效值，用主色标出来，免得在一串历史里认错 */
.tt-item:last-child { border-left-color: #1a6fff; }
.tt-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  color: #9ca3af;
}
.tt-step { font-weight: 600; color: #6b7280; }
/* 角色贴在姓名后面做弱强调：它是姓名的限定语，不该抢姓名的视线 */
.tt-role { padding: 0 5px; border-radius: 8px; background: #f3f4f6; color: #6b7280; }
.tt-at { font-variant-numeric: tabular-nums; }
.tt-change { margin-top: 2px; font-size: 12px; color: #374151; line-height: 1.5; }
.tt-reason { margin-top: 2px; font-size: 11px; color: #6b7280; line-height: 1.5; }

/* 打标弹窗 */
.op-radio-disabled { pointer-events: none; opacity: 0.45; }

/* 扫库记录 */
.run-table .hit-when { font-size: 12px; line-height: 1.5; white-space: nowrap; }
.run-kind {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 12px;
  white-space: nowrap;
}
.run-kind.realtime { background: #eff6ff; color: #1d4ed8; }
.run-kind.manual { background: #f5f3ff; color: #6d28d9; }
.run-status {
  display: inline-block;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
}
.run-status.success { background: #dcfce7; color: #15803d; }
.run-status.failed { background: #fee2e2; color: #dc2626; }
.run-status.abnormal { background: #ffedd5; color: #c2410c; }
.rule-chip { padding: 0 7px; border-radius: 10px; background: #eff6ff; color: #1d4ed8; font-size: 12px; }
.run-res { margin-top: 4px; font-size: 12px; color: #475569; line-height: 1.5; }
.run-res.failed, .run-res.abnormal { color: #64748b; }

.cell-done { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.tag-done { padding: 1px 7px; border-radius: 3px; font-size: 11px; cursor: help; font-weight: 600; }
/* 误报行没有等级徽标，打标来源的悬停说明落在这枚判定标上，故它同样给 help 光标 */
.verdict-chip { padding: 0 5px; border-radius: 3px; font-size: 10px; cursor: help; }
.vc-ok { background: #10B98122; color: #10B981; }
.vc-fp { background: #F3F4F6; color: #6B7280; }
.row-btn {
  padding: 2px 8px; border: 1px solid #D1D5DB; border-radius: 3px;
  background: #fff; color: #374151; font-size: 11px; cursor: pointer; font-family: inherit;
}
.row-btn:hover { background: #F9FAFB; }
.row-btn-tag { border-color: #1A6FFF; color: #1A6FFF; font-weight: 600; }
/* 修正是低频动作，收到次按钮里最轻的一档，不与「去管控」争视线 */
.row-btn-amend { border-color: #E5E7EB; color: #6B7280; }
.row-btn-amend:hover { border-color: #D1D5DB; color: #374151; }
.row-btn-primary { border-color: #1A6FFF; color: #1A6FFF; display: inline-flex; align-items: center; gap: 3px; font-weight: 600; }

.word-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.word-table th {
  text-align: left; font-weight: 500; color: #64748b; font-size: 12px;
  padding: 6px 8px; border-bottom: 1px solid #e2e8f0;
}
.word-table td { padding: 8px; border-bottom: 1px solid #f1f5f9; color: #374151; }
.word-table tr.off { opacity: 0.55; }
.wt-word { font-weight: 500; color: #0f172a; }
.wt-syn { margin-top: 2px; font-size: 11px; font-weight: 400; color: #94a3b8; }
.risk-word { padding: 1px 8px; border-radius: 10px; font-size: 12px; }
.hits-high { color: #EF4444; font-weight: 600; }
.hits-saved { margin-left: 5px; font-size: 11px; color: #10B981; cursor: help; }
.acc { padding: 0 7px; border-radius: 10px; font-size: 12px; cursor: help; font-variant-numeric: tabular-nums; }
.acc.good { background: #10B98122; color: #10B981; }
.acc.mid { background: #F59E0B22; color: #F59E0B; }
.acc.bad { background: #EF444422; color: #EF4444; }
.wt-state { padding: 0 7px; border-radius: 10px; font-size: 12px; }
.wt-state.on { background: #10B98122; color: #10B981; }
.wt-state.off { background: #F3F4F6; color: #9CA3AF; }
.drawer-note { font-size: 12px; color: #64748b; line-height: 1.7; margin: 12px 0 0; }
.drawer-note.top { margin: 0 0 12px; }
.drawer-toolbar { margin-bottom: 10px; }
.word-form { gap: 16px; }
.word-form .op-field-h > .op-label { width: 4.5em; }
.wf-tip { margin: 0; }
.wf-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: #f9fafb;
  border: 1px solid #f0f1f3;
  border-radius: 8px;
}
.wf-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}
.wf-section-title.req::before { content: '* '; color: #ef4444; }
.wf-syn-box {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wf-enable-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.wf-enable-row .op-hint { flex: 1; min-width: 0; }
.wf-enable-hint { line-height: 1.55; }
.word-form :deep(.wf-scope-grid) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px 10px;
  flex: 1;
  min-width: 0;
}
.word-form :deep(.wf-scope-grid.ant-checkbox-group) {
  line-height: 1.5;
}
.word-form :deep(.wf-scope-grid .ant-checkbox-wrapper) {
  margin-inline-start: 0;
  font-size: 13px;
  white-space: nowrap;
}
.wf-syn-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.wf-syn-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 6px 1px 8px; border: 1px solid #e2e8f0; border-radius: 10px;
  background: #f8fafc; color: #475569; font-size: 12px;
}
.wf-syn-del {
  border: none; background: none; padding: 0; line-height: 1;
  color: #94a3b8; font-size: 13px; cursor: pointer; font-family: inherit;
}
.wf-syn-del:hover { color: #ef4444; }
</style>
