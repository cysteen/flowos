<script setup lang="ts">
/**
 * **风险报备池**（《【930】风险报备 · 监控 · 管控》B 线，业务第三轮拍板）——
 * 工单工作台的一枚页签，装二线专员在**非投诉单**上发起的风险报备单。
 *
 * 【与风险监控页的分界】风险侧是两条互不交汇的线：
 *   · A 线（自动识别 → 实时监控 → 打标 → 风险工单池）留在风险监控页；
 *   · B 线（二线报备 → **本页** → 评估）挪到工作台，因为它是**一线办公面上的活**：
 *     谁领谁办、办完出列，与「催补待回」同形，故紧挨着它摆。
 * 本页**只读 B 线**（`stores/riskReports.ts` 的 `reports`），一条 A 线条目都不混进来。
 *
 * 🔴 **只有「领取」，没有分派**：分派 / 改派 / 批量分派整套已取消（第三轮拍板），
 * 两个池子都只留自取。督导不再是队列的单点，谁有空谁领。
 */
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  EditOutlined,
  PaperClipOutlined,
  RollbackOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import TicketFilterBar from './TicketFilterBar.vue';
import TicketTitleCell from './TicketTitleCell.vue';
import OpActionModal from './operation/OpActionModal.vue';
import { useUserStore } from '@/stores/user';
import { useRiskReportStore, type RiskReport } from '@/stores/riskReports';
// 领取走合并层的 `claim`：它一并落了「谁何时接走这条」的通知留痕，
// 并置 `assessArrivalTicket`（工单详情页据此自动开评估弹窗）。
// 直接改状态做不到这两件事，而留痕正是这条队列的凭据。
import { useRiskPoolStore } from '@/stores/riskPool';
import { useRiskReportAssess } from '@/composables/useRiskReportAssess';
import { todayPrefix, type ReportStatus, type RiskReleaseRecord } from '@/stores/riskShared';
// 状态界面词与工单「风险报备」Tab、风险监控页同一张映射：待领取 / 已领取 / 已结论 / 已撤回
import { poolStatusText } from './operation/OpRiskDecision';
import { TICKETS } from '@/mock/tickets';
import {
  canClaimRiskReport,
  canReleaseAnyRiskReport,
  PRIORITY_COLOR,
  resolveTicketGroupNames,
  type ChipMeta,
  type Ticket,
} from '@/views/tickets/types/ticket';

const emit = defineEmits<{ openTicket: [ticketNo: string] }>();

const user = useUserStore();
const reportStore = useRiskReportStore();
const pool = useRiskPoolStore();
const {
  ASSESS_DECISIONS,
  assessOpen,
  // 评估弹窗里那块「报备信息」读的就是它（六项齐：报备人 / 提交时刻 / 报备原因 /
  // 风险类型 / 场景描述 / 附件），不再让评估人隔着遮罩去池表上读场景描述
  assessTarget,
  assessDecision,
  assessAdvice,
  missAssessDecision,
  missAssessAdvice,
  assessAdviceLabel,
  assessAdvicePlaceholder,
  // 选「升级」后的派生说明行与「本单另有」区：三个评估入口同一个 composable，不另写文案
  escalateHint,
  assessOthers,
  openAssess,
  confirmAssess,
} = useRiskReportAssess();

/**
 * 能不能动手。**投诉督导看得见、一枚动作没有**——它已去权，只看数据。
 * 判据收在 types/ticket.ts，本组件不写 `if (role === …)`。
 *
 * 🔴 **本页签现在进得来三种人，不是两种**（2026-09-11，`34e6f365` 起）：三个管理员 scope
 * 的 `hiddenTabs` 去掉了 `riskReport`（基线 §4 ※29 + v1.24「两个池的兜底角色 ＝ 管理员」），
 * 此前它们**根本进不到这个页面**。故本文件里任何"进来的只会是客诉专员或投诉督导"的
 * 隐含假设都已不成立 —— 行内动作一律按「**是不是这条的承办人**」判（见 `actionsOf`），
 * **不要按角色名分支**：管理员领了的那条，承办人就是他本人，评估与释放都该照常出。
 */
const canAct = computed(() => canClaimRiskReport(user.roleKey));

/**
 * 池内**能动手的角色**，写给人看的那一串。
 *
 * 🔴 **文案照常量的实际取值写，改一处必同源同改**：判据是
 * `REPORT_POOL_ACT_ROLES`（`types/ticket.ts`）＝ **客诉专员 + 三个 admin scope**
 * （system-admin / ops-admin / tenant-admin），而前台视角只有一个「管理员」
 * （基线 §3.1：三个 scope 在前台合并显示为一个角色），故这里写「客诉专员或管理员」。
 *
 * 【为什么非收成一个常量不可】此前几处提示只写了「客诉专员」—— 管理员**本来就有权**，
 * 却被告知没权限，还被指挥去"切换角色"；切过去反而丢掉自己的兜底身份。
 * 这不是漏写一个角色，是**给了一条会让人做错事的指令**。常量与文案分家，
 * 同一种错法在本文件族已经犯过七次；收在这里之后，权限集改了、每一句提示跟着改。
 */
const POOL_ACT_ROLE_TEXT = '客诉专员或管理员';

/**
 * **管理员兜底**（PRD §5.5 ②）：可释放**任意**已领取条目，不限于自己承办的那一条。
 * 客诉专员恒 false —— 他只能退自己的那条。
 */
const canReleaseAny = computed(() => canReleaseAnyRiskReport(user.roleKey));

/* ---------------- 取数 ---------------- */

/** 工单号 → 工单快照。报备单只带单号，展示列复用工单列表「工单 / 标题」单元格 */
const TICKET_BY_NO = new Map<string, Ticket>(TICKETS.map((t) => [t.no, t]));
function ticketOf(no: string): Ticket | undefined {
  return TICKET_BY_NO.get(no);
}
function ticketTitle(no: string): string {
  return ticketOf(no)?.title ?? '—';
}
function reporterGroup(no: string): string {
  const t = ticketOf(no);
  if (!t) return '—';
  return resolveTicketGroupNames(t)[0] ?? '未归组';
}
function priorityColor(no: string): string {
  const t = ticketOf(no);
  return t ? PRIORITY_COLOR[t.priority] : 'transparent';
}

/** 在队 ＝ 待分派 + 评估中（还没有结论的全集） */
function isOpen(r: RiskReport): boolean {
  return r.status === '待分派' || r.status === '评估中';
}

/**
 * 排序：**在队的一律在上**，组内按提交时刻正序（等最久的排最前，与评估时限同向）；
 * 已收口的（已评估 / 已撤回）按提交时刻倒序垫底 —— 那是查证用的历史，最近的先看。
 */
const rows = computed(() =>
  [...reportStore.reports].sort((a, b) => {
    const ga = isOpen(a) ? 0 : 1;
    const gb = isOpen(b) ? 0 : 1;
    if (ga !== gb) return ga - gb;
    return ga === 0 ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at);
  }),
);

const search = ref('');
const activeChip = ref('all');

/**
 * 子筛选。「我承办」只对能动手的角色出 —— 督导领不了，那一格对它恒为 0，
 * 摆着只会让人以为自己漏领了什么。
 */
const chips = computed<ChipMeta[]>(() => {
  const list: ChipMeta[] = [
    { key: 'all', label: '全部' },
    // 两枚 title 里的角色串同样走 POOL_ACT_ROLE_TEXT：常量里有、文案里没有，正是那七处错法
    { key: 'unclaimed', label: '待领取', title: `还没有人领的报备单，${POOL_ACT_ROLE_TEXT}可自取` },
  ];
  if (canAct.value) {
    list.push({ key: 'mine', label: '我承办', title: '已落在我名下、等我给结论的报备单' });
  }
  // chip 名与状态列同词（待领取 / 已领取 / 已结论 / 已撤回）；key 不变
  list.push(
    { key: 'assessing', label: '已领取', title: '已有人承办，等结论' },
    { key: 'assessed', label: '已结论', title: '累计，不做时间收窄' },
    { key: 'withdrawn', label: '已撤回', title: '报备人自行收回；记录保留，不再进队列' },
  );
  return list;
});

function matchChip(r: RiskReport, key: string): boolean {
  switch (key) {
    case 'unclaimed':
      return r.status === '待分派';
    case 'mine':
      return r.status === '评估中' && r.assignee === user.name;
    case 'assessing':
      return r.status === '评估中';
    case 'assessed':
      return r.status === '已评估';
    case 'withdrawn':
      return r.status === '已撤回';
    default:
      // 「全部」＝ 待领取 + 已领取 + 已结论，**不含已撤回**（《【930】》§5B.3 ① / ⑧）
      return r.status !== '已撤回';
  }
}

function matchSearch(r: RiskReport): boolean {
  const kw = search.value.trim().toLowerCase();
  if (!kw) return true;
  return `${r.ticketNo} ${ticketTitle(r.ticketNo)} ${r.by}`.toLowerCase().includes(kw);
}

/**
 * 「已结论」chip 下的「仅今日」可选筛选（§5B.3 ①）：默认关；勾上后按**评估时刻**收窄清单，
 * chip 上的数不变（计数走 `searched`，不经过这一道）。只在「已结论」chip 下出现。
 */
const assessedTodayOnly = ref(false);
function matchToday(r: RiskReport): boolean {
  if (activeChip.value !== 'assessed' || !assessedTodayOnly.value) return true;
  return (r.assessment?.at ?? '').startsWith(todayPrefix());
}

const searched = computed(() => rows.value.filter(matchSearch));
const list = computed(() =>
  searched.value.filter((r) => matchChip(r, activeChip.value) && matchToday(r)),
);

/** chip 计数与列表同口径：搜索已经生效的话，计数也跟着窄，否则两个数对不上 */
const chipCounts = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {};
  for (const c of chips.value) {
    map[c.key] = searched.value.filter((r) => matchChip(r, c.key)).length;
  }
  return map;
});

const isFiltered = computed(() => activeChip.value !== 'all' || !!search.value.trim());

function resetFilters() {
  activeChip.value = 'all';
  search.value = '';
  assessedTodayOnly.value = false;
}

/** 切 chip 时摘掉「仅今日」：它只挂在「已结论」下，带到别的 chip 再切回来会让人以为默认就是开的 */
function selectChip(key: string) {
  if (key !== activeChip.value) assessedTodayOnly.value = false;
  activeChip.value = key;
}

/* ---------------- 单元格 ---------------- */

/**
 * 状态**展示名**走 `poolStatusText`（`OpRiskDecision.ts`）：待领取 / 已领取 / 已结论 / 已撤回，
 * 与工单「风险报备」Tab、风险监控页同一个词。本组件不再自带映射表。
 * ⚠️ 只换展示名，判据一律仍用落库值。
 */
const STATUS_TONE: Record<string, string> = {
  待分派: 'warn',
  评估中: 'info',
  已评估: 'ok',
  已撤回: 'gray',
};
function statusText(s: ReportStatus): string {
  return poolStatusText(s);
}
function statusTone(s: ReportStatus): string {
  return STATUS_TONE[s] ?? 'gray';
}

/**
 * 提交时刻列去掉年份（与工单页报备卡片的 formatShortAt 同形）：
 * 这条队列的时间尺度是**小时**，评估时限才 2 小时，年份一格 12 列的表里挤不起。
 * 完整时刻挂 title，鼠标停一下就有。
 */
function shortAt(at: string): string {
  const m = at.match(/(\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : at;
}

/** 等待时长与工单页横幅同源（store 内含 60s 心跳），不本地各算一份 */
function waitedText(r: RiskReport): string {
  if (!isOpen(r)) return '—';
  const mins = reportStore.waitedMinutes(r.at);
  return mins >= 60 ? `${Math.floor(mins / 60)} 小时 ${mins % 60} 分` : `${mins} 分钟`;
}
function isOverdue(r: RiskReport): boolean {
  return reportStore.isOverdue(r);
}

/* ---------------- 动作 ---------------- */

type RowAction = { label: string; primary?: boolean };

/**
 * 行内动作。**没有分派 / 改派**（第三轮拍板取消），只有自取与它的回退：
 * - 待领取 → 「领取」（谁领谁办）
 * - 我承办 → 「评估」+「释放」（拿了办不了要能退回池子，否则等于把单子锁死在自己名下）
 * - 别人承办 / 已收口 → 无动作，承办人与结论在列上看得到
 *
 * 🔴 **字面是「领取」不是「领单」**（PRD 明写池内条目的归属只写「领取」）。
 * 原本取「领单」的理由是"与工单工作台的工单池同词"——那条理由留在这里备查，但它
 * 让**同一个动作在两个风险池叫两个名字**：A 线风险工单池的按钮已经是「领取」，
 * 一个人在两张池表上看到两个词，只会以为那是两件不同的事。工单池那一路的「领单」
 * 是另一个池子的既有词，不在本轮改动之列。
 */
function actionsOf(r: RiskReport): RowAction[] {
  // 🔴 无权角色（投诉督导）整列为「—」（§5B.3 ⑨），与 A 线风险工单池的 `canClaim` 同形：
  // 按钮不露出来，而不是露出来再点一下弹"本角色只读"
  if (!canAct.value) return [];
  if (r.status === '待分派') return [{ label: '领取', primary: true }];
  // 🔴 **仅「已领取」态出「释放」**（§5.5 ③）：已评估、已撤回、待领取三态无此入口 ——
  // 上面两个 return 已经把无权角色与待领取拿走，这里剩下的判据只剩「评估中」+ 谁在办
  if (r.status !== '评估中') return [];
  if (r.assignee === user.name) {
    return [{ label: '评估', primary: true }, { label: '释放' }];
  }
  /*
   * **管理员兜底**（§5.5 ②）：别人承办的那条，管理员也能释放 —— 承办人休假 / 离岗时
   * 不至于把条目锁死在池子里。**但只给「释放」不给「评估」**：结论要由承办的人给
   * （`canAssessReport` 判的就是 `assignee === 本人`），管理员越过他直接评，
   * 等于把一条已经有人在读的材料替他下了结论。
   */
  if (canReleaseAny.value) return [{ label: '释放' }];
  return [];
}

function onAction(label: string, r: RiskReport) {
  if (label === '领取') return claim(r);
  if (label === '评估') return openAssess(r);
  if (label === '释放') return release(r);
}

function claim(r: RiskReport) {
  if (!canAct.value) {
    /*
     * 🔴 **只说"谁能做"，不指挥人去切角色**：走到这一句的只可能是投诉督导
     * （本页签对其余角色整块不可见），而他**本轮已去权、只看数据** —— 让他切角色
     * 既不是他该做的事，也没有一个"切过去就能领"的身份给他切。
     * 角色串取 `POOL_ACT_ROLE_TEXT`，与 `REPORT_POOL_ACT_ROLES` 同源，见那里的说明。
     */
    message.warning(`报备单的领取与评估由${POOL_ACT_ROLE_TEXT}执行，本角色只读`);
    return;
  }
  // 第三个实参是**领取那一刻的实际角色**，落在 `risk.report.claimed` 的正文落款上
  // （`riskPool.notifyClaimed`：不写死「客诉专员」——本页的领取权含三个管理员 scope）
  if (!pool.claim(r.id, user.name, user.role.name)) {
    message.warning('该报备已被他人领取');
    return;
  }
  message.success(`已领取 ${r.ticketNo}，请给出评估结论`);
  openAssess(r);
}

/**
 * 报备附件的"下载"。**与风险监控页那个评估弹窗同一套做法**（原型内造一个同名占位文件）——
 * 两处都是"评估人要看报备人交上来的证据"，做法不一致会让人以为其中一处坏了。
 */
function downloadReportAttachment(name: string) {
  const blob = new Blob([`（原型演示）${name}\n`], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---- 释放（PRD v3.5 §5.5） ---- */

/**
 * 释放留痕的时刻。与本目录下另外几个动作弹窗同一种写法（分钟粒度，
 * 与队列上「报备时间」「已等待」两列同刻度）。
 */
function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const releaseOpen = ref(false);
const releaseTarget = ref<RiskReport | null>(null);
const releaseReason = ref('');
const releaseTried = ref(false);
/** 空白与全空格一律拦下（§5.5 ④），提示语按 PRD 原话写「请填写释放原因」 */
const missReleaseReason = computed(() => releaseTried.value && !releaseReason.value.trim());

/**
 * 「释放」——把已领取的条目**退回池子**（§5.5）。
 *
 * 🔴 **点开只填「释放原因」这一项**（§5.5 ④）：不选接手人、不改等级、不写结论 ——
 * 释放**不是换人**（§5.5 ①），弹窗里多摆任何一格都会让人以为自己正在把活指给谁。
 */
function release(r: RiskReport) {
  releaseTarget.value = r;
  releaseReason.value = '';
  releaseTried.value = false;
  releaseOpen.value = true;
}

function confirmRelease() {
  releaseTried.value = true;
  const target = releaseTarget.value;
  const reason = releaseReason.value.trim();
  if (!target || !reason) return;
  /*
   * 走合并层的 `release`（与 `claim` 对称）：状态回「待领取」、承办人清空、
   * 条目上**累积**一条释放记录（释放人 · 角色 · 时刻 · 原因，累积不覆盖）。
   * 🔴 **本轮不发通知、不落 720 履历**，两条都在 store 侧写死，见 `riskPool.release`。
   */
  const ok = pool.release(target.id, {
    by: user.name,
    byRole: user.role.name,
    at: nowStamp(),
    reason,
    // 管理员兜底可释放任意已领取条目；客诉专员恒 false，store 侧照旧校验承办人本人
    anyAssignee: canReleaseAny.value,
  });
  if (!ok) {
    /*
     * 走到这里只有两种可能：条目已经不在「已领取」态（别人给了结论 / 已被释放过），
     * 或它不在本人名下而本人又不是管理员。**不写"不在你名下"一句了事** ——
     * 管理员释放的本来就是别人名下的条目（§5.5 ②），那句话对他恒为假。
     */
    message.warning('该报备已不在「已领取」态，或不在你名下，请刷新后再看');
    releaseOpen.value = false;
    return;
  }
  releaseOpen.value = false;
  message.success(`已释放 ${target.ticketNo} 的风险报备，退回报备池等人重新领取`);
}

/**
 * 历次释放记录，**最近一次在前**。没有被释放过时为空数组（§5.5 ⑥ 的留痕在这里读）。
 * 入参取**结构**而不是 `RiskReport`：池表上拿到的是 B 线条目，评估弹窗里拿到的是
 * 合并层的 `RiskPoolItem`，两者都有这一格，收窄类型只会逼出一个没必要的 as 断言。
 */
function releasesOf(r: { releases?: RiskReleaseRecord[] }) {
  return [...(r.releases ?? [])].reverse();
}
</script>

<template>
  <div class="rrp">
    <!-- ① 子筛选：与其余页签同一条 chips 组件，样式与计数口径一并复用 -->
    <div class="rrp-filter">
      <TicketFilterBar
        :active-chip="activeChip"
        :chip-counts="chipCounts"
        :chips="chips"
        @chip="selectChip(String($event))"
      />
      <!-- 「已结论」chip 的「仅今日」可选筛选：默认关，勾上只收窄清单、chip 上的数不变 -->
      <a-checkbox
        v-if="activeChip === 'assessed'"
        v-model:checked="assessedTodayOnly"
        class="rrp-today"
      >仅今日</a-checkbox>
    </div>

    <!-- ② 工具行：与工作台搜索框同形（工单号 / 工单标题 / 报备人） -->
    <div class="rrp-toolbar">
      <span v-if="canAct" class="rrp-hint">谁领谁办 —— 领取后由你给出评估结论</span>
      <div class="rrp-search">
        <SearchOutlined :style="{ color: '#9CA3AF', fontSize: '14px' }" />
        <input
          v-model="search"
          class="rrp-search-input"
          placeholder="工单号 / 工单标题 / 报备人"
        />
      </div>
    </div>

    <!-- ③ 列表 -->
    <div class="table-card">
      <div class="rrp-list">
        <div v-if="!list.length" class="empty">
          <template v-if="isFiltered">
            <div class="empty-title">当前筛选下没有报备单</div>
            <div class="empty-sub">换个筛选项，或清空搜索词后再看</div>
            <button type="button" class="empty-act" @click="resetFilters">查看全部</button>
          </template>
          <template v-else>
            <div class="empty-title">报备池里还没有报备单</div>
            <div class="empty-sub">
              二线专员在咨询 / 建议 / 商机单上发起风险报备后会落到这里，等{{ POOL_ACT_ROLE_TEXT }}领取评估
            </div>
          </template>
        </div>

        <div v-else class="rrp-grid">
          <div class="thead">
            <div class="th th-cell th-prio" aria-hidden="true" />
            <div class="th th-cell">工单 / 标题</div>
            <div class="th th-cell">报备人/处理组</div>
            <div class="th th-cell">报备原因</div>
            <div class="th th-cell">风险类型</div>
            <div class="th th-cell">场景描述</div>
            <div class="th th-cell">报备时间</div>
            <div class="th th-cell">已等待</div>
            <div class="th th-cell">承办人</div>
            <div class="th th-cell">状态</div>
            <div class="th th-cell">操作</div>
          </div>

          <div
            v-for="r in list"
            :key="r.id"
            class="row"
            :class="{ 'is-withdrawn': r.status === '已撤回' }"
          >
            <div
              class="cell cell-prio row-leading"
              :style="{ borderLeftColor: priorityColor(r.ticketNo) }"
              aria-hidden="true"
            />
            <div class="cell cell-title-wrap">
              <TicketTitleCell
                v-if="ticketOf(r.ticketNo)"
                :ticket="ticketOf(r.ticketNo)!"
                @click-no="emit('openTicket', $event.no)"
              />
              <span v-else class="plain-text" :title="`${r.ticketNo} · ${ticketTitle(r.ticketNo)}`">
                {{ r.ticketNo }} · {{ ticketTitle(r.ticketNo) }}
              </span>
            </div>
            <div class="cell cell-col">
              <span class="who">{{ r.by }}</span>
              <span class="who-role">{{ reporterGroup(r.ticketNo) }}</span>
            </div>
            <div class="cell">
              <span class="tag tag-reason">{{ r.reason }}</span>
            </div>
            <div class="cell">
              <span v-if="r.category" class="tag tag-cat">{{ r.category }}</span>
              <span v-else class="muted">—</span>
            </div>
            <div class="cell cell-desc">
              <a-popover trigger="hover" placement="rightTop" :mouse-enter-delay="0.2">
                <div class="desc-text line-clamp-2">{{ r.desc || '—' }}</div>
                <template #content>
                  <div class="desc-pop">
                    <div class="desc-pop-text">{{ r.desc || '—' }}</div>
                  </div>
                </template>
              </a-popover>
              <!-- 已撤回条目：灰条 + 撤回原因（§5B.3 ⑧） -->
              <div
                v-if="r.status === '已撤回' && r.withdrawReason"
                class="withdraw-reason"
                :title="r.withdrawReason"
              >撤回原因：{{ r.withdrawReason }}</div>
            </div>
            <div class="cell">
              <span class="plain-text" :title="r.at">{{ shortAt(r.at) }}</span>
            </div>
            <div class="cell cell-col">
              <span class="waited" :class="{ 'is-overdue': isOverdue(r) }">{{ waitedText(r) }}</span>
              <!-- 超时的必须一眼看出来：这条队列卡的是投诉立项，压在池子里没人领是最坏的一档 -->
              <span v-if="isOverdue(r)" class="overdue-tag">已超处置时限</span>
            </div>
            <div class="cell cell-col">
              <span v-if="r.assignee" class="who">{{ r.assignee }}</span>
              <!-- 只有还在队里的才说「未领取」：已撤回的那条谁也不会再去领，写它等于挂一个假的待办 -->
              <span v-else class="who muted">{{ r.status === '待分派' ? '未领取' : '—' }}</span>
              <!--
                释放留痕（§5.5 ⑥）。**没被释放过整段不出**。
                🔴 **必须在这一格摆得到**：释放之后条目退回「待领取」、承办人清空，
                行上看着与"从来没人领过"一模一样 —— 而这两件事对下一个来领的人意义相反：
                后者是新活，前者是**别人看过之后退回来的活**，退回的理由正是他要先读的。
                历次记录挂 popover，与「场景描述」那一列同一种展开方式。
              -->
              <a-popover
                v-if="releasesOf(r).length"
                trigger="hover"
                placement="topRight"
                :mouse-enter-delay="0.2"
              >
                <span class="release-flag">
                  <RollbackOutlined />
                  已释放 {{ releasesOf(r).length }} 次
                </span>
                <template #content>
                  <div class="release-pop">
                    <div class="release-pop-title">释放记录</div>
                    <div v-for="(rel, i) in releasesOf(r)" :key="i" class="release-pop-item">
                      <div class="release-pop-head">
                        <span class="release-pop-who">{{ rel.by }}（{{ rel.byRole }}）</span>
                        <span class="release-pop-at">{{ rel.at }}</span>
                      </div>
                      <div class="release-pop-reason">{{ rel.reason }}</div>
                    </div>
                  </div>
                </template>
              </a-popover>
            </div>
            <div class="cell">
              <span class="state" :class="`tone-${statusTone(r.status)}`">{{ statusText(r.status) }}</span>
            </div>
            <div class="cell cell-action">
              <span
                v-for="a in actionsOf(r)"
                :key="a.label"
                class="act"
                :style="{ color: a.primary ? '#1A6FFF' : '#6B7280' }"
                @click="onAction(a.label, r)"
                >{{ a.label }}</span
              >
              <span v-if="!actionsOf(r).length" class="muted">—</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 无分页：与其余页签一致，全量快照展示，只报总数 -->
      <div class="pager">
        <span class="pager-total">共 {{ list.length }} 条</span>
      </div>
    </div>

    <!-- 评估结论：与工单详情页「风险报备」Tab 同一个 composable，两处结论口径不会分叉 -->
    <OpActionModal
      :open="assessOpen"
      :title="assessTarget ? `评估报备 · ${assessTarget.ticketNo}` : '评估报备'"
      :icon="EditOutlined"
      tone="primary"
      :width="520"
      ok-text="提交结论"
      @update:open="assessOpen = $event"
      @ok="confirmAssess"
    >
      <!--
        整块挂 `v-if="assessTarget"`：报备信息全部取自它，没有目标条目时连表单也无从提交
        （`confirmAssess` 第一句就按它返回）。与风险监控页那个评估弹窗同一种写法。
      -->
      <div v-if="assessTarget" class="rrp-assess">
        <!--
          ① 报备信息（2026-09-11 补）。**照风险监控页那个评估弹窗的「报备信息」卡做**，
          版式与类名一并沿用（`assess-sheet-*` / `assess-meta-*` / `assess-quote` / `assess-file*`），
          不新造一套 —— 两条线的评估人是同一批客诉专员，同一件事读起来必须是同一种样子。

          🔴 **必须有这一块**：原来这个弹窗只有「评估决策 + 反馈意见」两项，
          报备人 / 提交时刻 / 报备原因 / 风险类型 / 场景描述 / 附件**六项一项都没有**。
          评估人要读场景描述，只能去看被遮罩挡住的池表 —— 而结论恰恰是照着那段描述下的。

          🔴 **本块不复制 A 线的「入池依据」**：B 线的报备单不走打标那道门（`RiskReport` 上没有 `tag`）。
          「本单另有」区另起一块摆在本卡之下，按工单号取、与另外两个评估入口同源（`riskOthersOf`）。
        -->
        <section class="assess-sheet" aria-label="报备信息">
          <header class="assess-sheet-head">
            <div class="assess-sheet-title-row">
              <button
                type="button"
                class="assess-ticket-no"
                @click="emit('openTicket', assessTarget.ticketNo)"
              >{{ assessTarget.ticketNo }}</button>
              <!-- ② 提交时刻：等待时长与评估时限都从这一刻起算，故摆在最显眼的一行 -->
              <span class="assess-sheet-time">提交于 {{ assessTarget.at }}</span>
            </div>
            <div class="assess-sheet-meta">
              <!-- ① 报备人 -->
              <span class="assess-meta-pair">
                <UserOutlined class="assess-meta-icon" />
                <span class="assess-meta-label">报备人</span>
                <span class="assess-meta-value">{{ assessTarget.by }}（{{ assessTarget.byRole }}）</span>
              </span>
              <span class="assess-meta-sep" aria-hidden="true" />
              <!-- ③ 报备原因 -->
              <span class="assess-meta-pair">
                <span class="assess-meta-label">报备原因</span>
                <span class="assess-meta-value">{{ assessTarget.reason }}</span>
              </span>
              <!--
                ④ 风险类型：**只在原因＝「风险场景」时才有值**（§9 规则 10），
                故整段 v-if 掉而不是显示一个「—」——那会让人以为报备人漏填了一格。
              -->
              <template v-if="assessTarget.category">
                <span class="assess-meta-sep" aria-hidden="true" />
                <span class="assess-meta-pair">
                  <span class="assess-meta-label">风险类型</span>
                  <span class="assess-meta-value assess-meta-warn">{{ assessTarget.category }}</span>
                </span>
              </template>
            </div>
          </header>

          <div class="assess-sheet-body">
            <!-- ⑤ 场景描述：这条报备的正文，结论就是照着它下的，故摆主体、不收进底栏 -->
            <blockquote class="assess-quote">{{ assessTarget.desc || '—' }}</blockquote>
            <!-- ⑥ 附件：报备人交上来的证据（录音片段 / 截图），没有时整段不出 -->
            <ul v-if="assessTarget.attachments.length" class="assess-files">
              <li v-for="a in assessTarget.attachments" :key="a" class="assess-file">
                <PaperClipOutlined />
                <button
                  type="button"
                  class="assess-file-btn"
                  :title="`下载 ${a}`"
                  @click="downloadReportAttachment(a)"
                >{{ a }}</button>
              </li>
            </ul>
            <!--
              ⑦ 释放记录（§5.5 ⑥「在条目详情上可见」）。**没被释放过整段不出**。
              🔴 **它必须摆在评估人眼前**：这条条目刚被人领走过又退回来，退回的理由
              往往正是"我判不了 / 不该我办"——现在轮到你判，那句话是你要读的第一手材料。
              历次全列、最近一次在前（累积不覆盖）。
            -->
            <div v-if="releasesOf(assessTarget).length" class="assess-releases">
              <div class="assess-releases-head">
                <RollbackOutlined />
                释放记录（{{ releasesOf(assessTarget).length }} 次）
              </div>
              <div
                v-for="(rel, i) in releasesOf(assessTarget)"
                :key="i"
                class="assess-release"
              >
                <div class="assess-release-head">
                  <span class="assess-release-who">{{ rel.by }}（{{ rel.byRole }}）</span>
                  <span class="assess-release-at">{{ rel.at }}</span>
                </div>
                <div class="assess-release-reason">{{ rel.reason }}</div>
              </div>
            </div>
          </div>
        </section>

        <!-- 「本单另有」固定区块（§5.4 ⑦）：四行取数与另外两个评估入口同源（riskOthersOf） -->
        <section class="assess-others" aria-label="本单另有">
          <div class="assess-others-head">本单另有</div>
          <div v-for="row in assessOthers" :key="row.label" class="assess-others-row">
            <span class="assess-others-k">{{ row.label }}</span>
            <span class="assess-others-v">{{ row.text }}</span>
          </div>
        </section>

        <!-- ② 评估表单：二选一决策 + 必填说明 -->
        <div class="af-field">
          <span class="af-label req">评估决策</span>
          <a-radio-group v-model:value="assessDecision" class="af-decisions">
            <a-radio v-for="d in ASSESS_DECISIONS" :key="d" :value="d">{{ d }}</a-radio>
          </a-radio-group>
        </div>
        <p v-if="missAssessDecision" class="af-err">请先选择一个评估决策</p>
        <!-- 选「升级」后的派生说明行：文案取 escalateHintOf，三个评估入口同一句 -->
        <p v-else-if="assessDecision === '升级'" class="af-hint">{{ escalateHint }}</p>

        <div class="af-field af-field-block">
          <span class="af-label req">{{ assessAdviceLabel }}</span>
          <a-textarea
            v-model:value="assessAdvice"
            :rows="3"
            :placeholder="assessAdvicePlaceholder"
          />
        </div>
        <p v-if="missAssessAdvice" class="af-err">请填写{{ assessAdviceLabel }}</p>
      </div>
    </OpActionModal>

    <!--
      释放：**只填一项「释放原因」**（§5.5 ④）。
      🔴 **不出接手人这一格** —— 释放不指定接手人、不是换人（§5.5 ①）；
      摆一个人员下拉在这里，做的就是已经整套取消的「改派」。
    -->
    <OpActionModal
      :open="releaseOpen"
      :title="releaseTarget ? `释放报备 · ${releaseTarget.ticketNo}` : '释放报备'"
      :icon="RollbackOutlined"
      tone="warn"
      :width="440"
      ok-text="确认释放"
      ok-tone="danger"
      @update:open="releaseOpen = $event"
      @ok="confirmRelease"
    >
      <div class="rrp-release">
        <div class="af-field af-field-block">
          <span class="af-label req">释放原因</span>
          <a-textarea
            v-model:value="releaseReason"
            :rows="3"
            :status="missReleaseReason ? 'error' : undefined"
            placeholder="写清为什么退回，例如判不了 / 不该由我办 / 需要换人跟进…"
          />
        </div>
        <p v-if="missReleaseReason" class="af-err">请填写释放原因</p>
        <!--
          释放的两个后果都得在下决心之前说清：
          ① 退回池子由**任何有资格的人**重新领（不是指给某个人）；
          ② **等待时长不归零**（§5.5 ⑤）——已经超时的退回来仍是超时态，
             不写这一句，人会以为退一次就把钟重置了、于是拿它当"续命"用。
        -->
        <p class="af-hint">
          释放后本条退回「待领取」，由{{ POOL_ACT_ROLE_TEXT }}重新领取；等待时长仍从报备提交时刻起算、不会因此重新计时。
        </p>
      </div>
    </OpActionModal>
  </div>
</template>

<style scoped>
.rrp {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.rrp-filter {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}
.rrp-filter :deep(.filter-row) {
  flex: 1;
  min-width: 0;
}
.rrp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-width: 0;
}
.rrp-hint {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rrp-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 240px;
  height: 36px;
  margin-left: auto;
  padding: 0 10px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-sizing: border-box;
  flex: none;
}
.rrp-search:focus-within {
  border-color: #1a6fff;
  box-shadow: 0 0 0 2px rgb(26 111 255 / 10%);
}
.rrp-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 13px;
  color: #374151;
  background: transparent;
  font-family: inherit;
}
.table-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.rrp-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.rrp-grid {
  display: grid;
  /*
   * 两条弹性列（工单标题 / 场景描述）用 minmax + fr：宽屏时把富余宽度吃掉，
   * 窄屏时缩到下限、整表横向滚动。
   * ⚠️ 容器**不能**写 `width: max-content` —— 那会让 fr 按内容最大宽度解算，
   * 场景描述一长，整张表就撑到屏外、把「操作」推得看不见（折叠也随之失效）。
   */
  grid-template-columns:
    4px minmax(276px, 1.2fr) 96px 92px 88px minmax(190px, 1fr)
    92px 88px 76px 76px 84px;
  column-gap: 0;
  width: 100%;
  padding: 0 16px;
  box-sizing: border-box;
}
.thead,
.row {
  display: contents;
}
.th-cell {
  display: flex;
  align-items: center;
  padding: 11px 12px 11px 0;
  background: #fafafb;
  border-bottom: 1px solid #e5e7eb;
}
.th {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  white-space: nowrap;
}
.row > .cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  padding: 13px 12px 13px 0;
  border-bottom: 1px solid #f0f0f0;
  background: #fff;
}
.row:hover > .cell {
  background: #fafbff;
}
.cell-col {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.th-prio,
.cell-prio {
  padding: 0;
  min-width: 0;
  align-self: stretch;
}
.row-leading {
  border-left: 4px solid transparent;
  margin-left: -4px;
}
.cell-title-wrap {
  align-items: flex-start;
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 4px;
}
.plain-text {
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muted {
  font-size: 12px;
  color: #9ca3af;
}
.who {
  font-size: 12px;
  color: #374151;
  font-weight: 500;
}
.who-role {
  font-size: 11px;
  color: #9ca3af;
}
.tag {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  white-space: nowrap;
}
.tag-reason {
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}
.tag-cat {
  color: #c2410c;
  background: #fff7ed;
  border: 1px solid #fed7aa;
}
.cell-desc {
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  min-width: 0;
}
.cell-desc .desc-text {
  flex: none;
}
.withdraw-reason {
  font-size: 11px;
  line-height: 1.4;
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 已撤回条目＝灰条：整行底色转灰、正文降为灰字（§5B.3 ⑧） */
.row.is-withdrawn > .cell {
  background: #f9fafb;
}
.row.is-withdrawn .who,
.row.is-withdrawn .plain-text,
.row.is-withdrawn .desc-text {
  color: #9ca3af;
}
.rrp-today {
  flex: none;
  margin-left: 12px;
  font-size: 12px;
  white-space: nowrap;
}
/* 「本单另有」区（评估弹窗内） */
.assess-others {
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.assess-others-head {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}
.assess-others-row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.6;
}
.assess-others-k {
  flex: none;
  width: 72px;
  color: #9ca3af;
}
.assess-others-v {
  flex: 1;
  min-width: 0;
  color: #374151;
  word-break: break-word;
}
.desc-text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
  cursor: default;
  word-break: break-word;
}
.desc-text.line-clamp-2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
.waited {
  font-size: 12px;
  color: #374151;
  white-space: nowrap;
}
.waited.is-overdue {
  color: #dc2626;
  font-weight: 600;
}
.overdue-tag {
  padding: 1px 5px;
  font-size: 10px;
  font-weight: 600;
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  white-space: nowrap;
}
.state {
  padding: 2px 9px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  white-space: nowrap;
}
.state.tone-warn {
  color: #c2410c;
  background: #ffedd5;
}
.state.tone-info {
  color: #1d4ed8;
  background: #dbeafe;
}
.state.tone-ok {
  color: #047857;
  background: #d1fae5;
}
.state.tone-gray {
  color: #6b7280;
  background: #f3f4f6;
}
/*
 * 释放标：**灰蓝、不用红**。它说的是"这条被人退回来过"，不是告警 ——
 * 红色在这张表上已经归「超时未评」独占，两件事共用一个颜色会让超时那一档失去分量。
 */
.release-flag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 5px;
  font-size: 10px;
  font-weight: 600;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  white-space: nowrap;
  cursor: default;
}
.release-flag :deep(.anticon) {
  font-size: 10px;
}
.cell-action {
  gap: 12px;
}
.act {
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.empty {
  padding: 64px 0;
  text-align: center;
}
.empty-title {
  font-size: 13px;
  color: #6b7280;
}
.empty-sub {
  margin-top: 6px;
  font-size: 12px;
  color: #9ca3af;
}
.empty-act {
  margin-top: 12px;
  height: 28px;
  padding: 0 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.empty-act:hover {
  border-color: #1a6fff;
  color: #1a6fff;
}
.pager {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  flex: none;
}
.pager-total {
  font-size: 13px;
  color: #6b7280;
}

/* ---- 评估弹窗 ---- */
.rrp-assess {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/*
 * 报备信息卡。**样式逐条对齐风险监控页那个评估弹窗的同名类**
 * （`RiskMonitorView.vue` 的 .assess-sheet 一族）：两条线的评估人是同一批客诉专员，
 * 同一件事在两处读起来必须是同一种样子。琥珀色边与浅橙渐变头是那张卡的既有识别色，
 * 表示"这是别人交上来待你判的材料"，与下方白底的评估表单区分开。
 */
.assess-sheet {
  background: #fff;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(234, 88, 12, 0.06);
}
.assess-sheet-head {
  padding: 12px 14px;
  background: linear-gradient(180deg, #fff7ed 0%, #fff 100%);
  border-bottom: 1px solid #ffedd5;
}
.assess-sheet-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.assess-ticket-no {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #1a6fff;
  cursor: pointer;
  line-height: 1.4;
}
.assess-ticket-no:hover { text-decoration: underline; }
.assess-sheet-time {
  font-size: 12px;
  font-weight: 600;
  color: #9a3412;
  font-variant-numeric: tabular-nums;
}
.assess-sheet-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 0;
  margin-top: 8px;
}
.assess-meta-pair {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.assess-meta-icon { color: #9ca3af; font-size: 12px; }
.assess-meta-label { color: #9ca3af; }
.assess-meta-value { color: #374151; font-weight: 600; }
.assess-meta-warn { color: #c2410c; }
.assess-meta-sep {
  width: 1px;
  height: 12px;
  margin: 0 10px;
  background: #e5e7eb;
  flex: none;
}
.assess-sheet-body { padding: 12px 14px 14px; }
.assess-quote {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.65;
  color: #1f2937;
  background: #f8fafc;
  border-left: 3px solid #fdba74;
  border-radius: 0 6px 6px 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.assess-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.assess-file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11px;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
}
.assess-file :deep(.anticon) { color: #94a3b8; font-size: 11px; }
.assess-file-btn {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: #4338ca;
  cursor: pointer;
  line-height: 1.4;
}
.assess-file-btn:hover { color: #1d4ed8; text-decoration: underline; }
.af-field {
  display: flex;
  align-items: center;
  gap: 12px;
}
.af-field-block {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.af-label {
  flex: none;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.af-label.req::before {
  content: '*';
  color: #ef4444;
  margin-right: 2px;
}
.af-decisions {
  display: inline-flex;
  gap: 8px;
}
.af-decisions :deep(.ant-radio-wrapper) {
  margin: 0 !important;
  padding: 6px 12px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
  white-space: nowrap;
}
.af-decisions :deep(.ant-radio-wrapper-checked) {
  border-color: #1a6fff;
  background: #eff6ff;
}
.af-err {
  margin: 0;
  font-size: 11px;
  color: #ef4444;
}
.af-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #6b7280;
}

/* ---- 释放记录（评估弹窗内 · §5.5 ⑥） ---- */
.assess-releases {
  margin-top: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}
.assess-releases-head {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}
.assess-release {
  margin-top: 6px;
}
/* 分隔线只给第二条起。⚠️ 不能写 `:first-of-type`——标题也是 div，规则会落空 */
.assess-release + .assess-release {
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
}
.assess-release-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.assess-release-who {
  font-size: 11px;
  font-weight: 600;
  color: #374151;
}
.assess-release-at {
  font-size: 11px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}
.assess-release-reason {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.55;
  color: #4b5563;
  word-break: break-word;
}

/* ---- 释放弹窗 ---- */
.rrp-release {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>

<style>
.desc-pop { width: 320px; }
.desc-pop-text { font-size: 12px; color: #374151; line-height: 1.6; word-break: break-word; }
/* 释放记录 popover：挂在 body 上的浮层，故与 .desc-pop 同样走非 scoped 段 */
.release-pop { width: 300px; }
.release-pop-title { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 4px; }
.release-pop-item { padding-top: 6px; margin-top: 6px; border-top: 1px dashed #e5e7eb; }
.release-pop-item:first-of-type { padding-top: 0; margin-top: 0; border-top: none; }
.release-pop-head { display: flex; align-items: baseline; gap: 8px; }
.release-pop-who { font-size: 11px; font-weight: 600; color: #374151; }
.release-pop-at { font-size: 11px; color: #9ca3af; font-variant-numeric: tabular-nums; }
.release-pop-reason { margin-top: 2px; font-size: 12px; color: #4b5563; line-height: 1.6; word-break: break-word; }
</style>
