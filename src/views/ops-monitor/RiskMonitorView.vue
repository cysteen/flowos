<script setup lang="ts">
// 风险监控 —— 从《【915】运营监控大盘》模块四拆出独立立项（D7a）
//
// 【与旧版风险词命中的根本差别】
// 旧版是一张七列流水表：命中词 → 打标 → 结束。打标没有下游，风险源一直在。
// 本页按调研结论重做，四件事必须在界面上看得见：
//   ① 等级不是拍的 —— 后果严重度 × 外部信号强度交叉出来（对标 ITIL Priority = Impact × Urgency）
//   ② 分级即定处置层级 —— 高危该找投诉处理角色，中危找班组长，不是三种颜色
//   ③ 打标有下游 —— 高危打标后当场给「去管控」入口（基线 ※27，人点、系统不自动管控）
//   ④ 词表会自己变好 —— 打标回填「本次命中成立/误报」，喂给规则准确率
//
// 【新旧对比开关】评审用的演示装置，不是产品功能，正式上线前删除本文件中标了
// RULE_COMPARE_DEMO 的代码块即可。它存在的理由：同一批数据切一下，业务立刻看懂双轨的价值。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { ReloadOutlined, ArrowRightOutlined } from '@ant-design/icons-vue';
import MetricTipIcon from '@/components/MetricTipIcon.vue';
import { opsTip } from '@/mock/opsMonitorTips';
import { useUserStore } from '@/stores/user';
import { RISK_TAG_ROLES, RISK_WORD_MAINTAIN_ROLES } from '@/config/roles';
import { OPS_GROUPS, getOpsScopeSelectGroups, type OpsScope } from '@/mock/opsMonitor';
import {
  RISK_LEVEL_STYLE,
  RISK_MATRIX,
  RISK_WORDS,
  DISPOSAL_BY_GRADE,
  accuracyOf,
  riskHitsOf,
  legacyRiskHitsOf,
  riskGradeOf,
  type RiskHit,
  type RiskWord,
  type RiskLevel,
  type RiskImpact,
  type RiskSignal,
  type HitVerdict,
} from '@/mock/opsReport';

const route = useRoute();
const router = useRouter();
const user = useUserStore();

// ---- 监控范围 ----
// 从大盘下钻进来时带着范围与「仅看待打标」，不让人到了新页面再选一遍
const scopeIds = ref<string[]>(
  typeof route.query.scope === 'string' && route.query.scope ? route.query.scope.split(',') : [],
);
/** 仅看待打标：大盘点「待打标」卡下钻时预置 */
const gradeFilter = ref<'all' | RiskLevel | 'pending'>(
  route.query.pending === '1' ? 'pending' : 'all',
);
const scope = computed<OpsScope>(() => (scopeIds.value.length ? scopeIds.value : 'all'));
const scopeSelectGroups = getOpsScopeSelectGroups();
const isAllScope = computed(() => scopeIds.value.length === 0);
const scopeSelectedCount = computed(() => scopeIds.value.length);
function filterScopeOption(input: string, option: { label?: string }) {
  const q = input.trim().toLowerCase();
  if (!q) return true;
  return (option.label ?? '').toLowerCase().includes(q);
}
function setScopeAll() { scopeIds.value = []; }
function scopeTagPlaceholder(omittedValues: unknown[]) { return `+${omittedValues.length} 组`; }

const lastRefresh = ref('14:20:06');
let timer: number | undefined;
function refresh() {
  const d = new Date();
  lastRefresh.value = [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0')).join(':');
}
onMounted(() => { timer = window.setInterval(refresh, 60000); });
onBeforeUnmount(() => { if (timer) window.clearInterval(timer); });

// ---- RULE_COMPARE_DEMO：新旧规则对比（评审演示装置，上线前删） ----
const ruleMode = ref<'new' | 'legacy'>('new');
const isLegacy = computed(() => ruleMode.value === 'legacy');

// ---- 命中列表 ----
const allHits = computed(() => riskHitsOf(scope.value));
const rows = computed(() => {
  const base = isLegacy.value ? legacyRiskHitsOf(scope.value) : allHits.value;
  return base;
});

const GRADE_ORDER: Record<RiskLevel, number> = { 高: 0, 中: 1, 低: 2 };

/** 按筛选 + 等级排序：高危置顶，同等级未打标优先 */
const filteredRows = computed(() => {
  let list = rows.value;
  if (gradeFilter.value === 'pending') {
    list = list.filter((h) => gradeOf(h) === '高' && !tagOf(h));
  } else if (gradeFilter.value !== 'all') {
    list = list.filter((h) => gradeOf(h) === gradeFilter.value);
  }
  return [...list].sort((a, b) => {
    const ga = gradeOf(a);
    const gb = gradeOf(b);
    if (GRADE_ORDER[ga] !== GRADE_ORDER[gb]) return GRADE_ORDER[ga] - GRADE_ORDER[gb];
    if (ga === '高') {
      const ua = tagOf(a) ? 1 : 0;
      const ub = tagOf(b) ? 1 : 0;
      if (ua !== ub) return ua - ub;
    }
    return 0;
  });
});

function setGradeFilter(f: 'all' | RiskLevel | 'pending') {
  gradeFilter.value = f;
}

/** 当前规则模式下这条命中的等级 */
function gradeOf(h: RiskHit): RiskLevel {
  return isLegacy.value ? (h.legacyLevel as RiskLevel) : riskGradeOf(h);
}

/** 按等级分区（概览计数仍用全量 rows） */
const GRADES: RiskLevel[] = ['高', '中', '低'];

const gradeCount = computed<Record<RiskLevel, number>>(() => ({
  高: rows.value.filter((h) => gradeOf(h) === '高').length,
  中: rows.value.filter((h) => gradeOf(h) === '中').length,
  低: rows.value.filter((h) => gradeOf(h) === '低').length,
}));

const filterLabel = computed(() => {
  if (gradeFilter.value === 'pending') return '待核实高危';
  if (gradeFilter.value === 'all') return '全部命中';
  return `${gradeFilter.value}危`;
});

// ---- RULE_COMPARE_DEMO：新旧差异摘要 ----
const diff = computed(() => {
  const all = allHits.value;
  return {
    /** 后果严重度这一轨新召回的：纯词表一个词都不命中，根本不进视野 */
    recalled: all.filter((h) => h.legacyLevel === null),
    /** 等级下调的：旧判高危，双轨交叉后不再是高危，不再挤占处置资源 */
    downgraded: all.filter((h) => h.legacyLevel === '高' && riskGradeOf(h) !== '高'),
  };
});

// ---- 打标 ----
type LocalTag = { level: RiskLevel; verdict: HitVerdict; note: string; by: string; at: string };
const localTags = ref<Record<string, LocalTag>>({});
const canRiskTag = computed(() => RISK_TAG_ROLES.includes(user.roleKey));

const tagOpen = ref(false);
const tagTarget = ref<RiskHit | null>(null);
const tagLevel = ref<RiskLevel>('高');
const tagVerdict = ref<HitVerdict | undefined>(undefined);
const tagNote = ref('');

function openTag(h: RiskHit) {
  if (!canRiskTag.value) { message.warning('只有运营监控岗与投诉处理角色可以打标'); return; }
  tagTarget.value = h;
  const local = localTags.value[h.id];
  tagLevel.value = local?.level ?? h.tagged ?? riskGradeOf(h);
  tagVerdict.value = local?.verdict ?? h.verdict;
  tagNote.value = local?.note ?? h.taggedNote ?? '';
  tagOpen.value = true;
}
function saveTag() {
  if (!tagTarget.value) return;
  if (!canRiskTag.value) { message.warning('无打标权限'); return; }
  if (!tagVerdict.value) { message.warning('请先判定本次命中是否成立'); return; }
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  localTags.value = {
    ...localTags.value,
    [tagTarget.value.id]: {
      level: tagLevel.value,
      verdict: tagVerdict.value,
      note: tagNote.value.trim(),
      by: user.current.name,
      at: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    },
  };
  message.success(
    tagVerdict.value === '误报'
      ? `已记为误报，将计入规则准确率`
      : `已对 ${tagTarget.value.ticketNo} 打标「${tagLevel.value}风险」`,
  );
  tagOpen.value = false;
}
function tagOf(h: RiskHit): RiskLevel | undefined {
  return localTags.value[h.id]?.level ?? h.tagged;
}
function verdictOf(h: RiskHit): HitVerdict | undefined {
  return localTags.value[h.id]?.verdict ?? h.verdict;
}
function traceOf(h: RiskHit): { by: string; at: string; note: string } | undefined {
  const local = localTags.value[h.id];
  if (local) return { by: local.by, at: local.at, note: local.note };
  if (h.tagged) return { by: h.taggedBy ?? '—', at: h.taggedAt ?? '—', note: h.taggedNote ?? '' };
  return undefined;
}

const untaggedHigh = computed(() =>
  allHits.value.filter((h) => riskGradeOf(h) === '高' && !tagOf(h)),
);

/**
 * 「去管控」：只跳到工单、把入口送到人眼前，**不代替人做管控**。
 * 基线 ※27——分级决定"该找谁"，不代表系统自动指派；管控会把工单从原处理人
 * 名下拿走（在办量、解决率分母、超时数全变），这个代价必须由人承担判断。
 */
function goControl(h: RiskHit) {
  router.push(`/tickets/${h.ticketNo}`);
}
function openTicket(no: string) { router.push(`/tickets/${no}`); }

const IMPACTS: RiskImpact[] = ['严重', '一般', '轻微'];
const SIGNALS: RiskSignal[] = ['强', '中', '无'];

// ---- 预警词管理（维护权归运营监控岗；投诉处理角色只读） ----
const riskWordsOpen = ref(false);
const canMaintainWords = computed(() => RISK_WORD_MAINTAIN_ROLES.includes(user.roleKey));
/** 原型本地词表：可新建，刷新后回 mock 初始值 */
const localWords = ref<RiskWord[]>([...RISK_WORDS]);

const wordFormOpen = ref(false);
const wordForm = ref({
  word: '',
  level: '中' as RiskLevel,
  scopes: ['问题描述', '沟通记录'] as string[],
  receivers: '',
  enabled: false,
});
const SCOPE_OPTIONS = ['标题', '问题描述', '沟通记录', '催补记录'];

function openWordForm() {
  wordForm.value = {
    word: '',
    level: '中',
    scopes: ['问题描述', '沟通记录'],
    receivers: '',
    enabled: false,
  };
  wordFormOpen.value = true;
}
function saveWord() {
  const word = wordForm.value.word.trim();
  if (!word) { message.warning('请填写预警词'); return; }
  const receivers = wordForm.value.receivers.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  if (!receivers.length) { message.warning('请填写至少一位通知人'); return; }
  if (!wordForm.value.scopes.length) { message.warning('请至少选一个匹配范围'); return; }
  localWords.value = [
    ...localWords.value,
    {
      id: `w-${Date.now()}`,
      word,
      level: wordForm.value.level,
      speakerLimit: '不限',
      scopes: [...wordForm.value.scopes],
      receivers,
      enabled: wordForm.value.enabled,
      hits7d: 0,
      hits7dRaw: 0, // 与 hits7d 同口径；当前无法区分发话角色
      judged7d: 0,
      valid7d: 0,
    },
  ];
  message.success(wordForm.value.enabled ? `已新建并启用「${word}」` : `已新建「${word}」（默认停用，可先试跑看近 7 天命中）`);
  wordFormOpen.value = false;
}
function toggleWordEnabled(w: RiskWord) {
  if (!canMaintainWords.value) return;
  localWords.value = localWords.value.map((item) =>
    item.id === w.id ? { ...item, enabled: !item.enabled } : item,
  );
  message.success(w.enabled ? `已停用「${w.word}」` : `已启用「${w.word}」`);
}
/** 准确率分档：低于 30% 的规则基本在制造噪音，该收窄或停用 */
function accTone(v: number): 'bad' | 'mid' | 'good' {
  if (v < 0.3) return 'bad';
  if (v < 0.7) return 'mid';
  return 'good';
}
</script>

<template>
  <div class="risk-monitor">
    <!-- 页头：对齐个人门户 / 班组长看板 greeting-card -->
    <div class="greeting-card">
      <div class="greeting-text">
        <div class="greeting-title">
          风险监控
          <span class="head-tag head-tag-complaint">投诉</span>
        </div>
        <div class="greeting-sub">① 核实命中 → ② 按等级处置 → ③ 回填规则准确率</div>
      </div>
      <div class="greeting-aside">
        <div class="section-filters">
          <div class="filter-item">
            <span class="filter-label">监控范围</span>
            <div class="monitor-scope-picker">
              <button type="button" class="monitor-scope-all-btn" :class="{ active: isAllScope }" @click="setScopeAll">
                全中心
              </button>
              <a-select
                v-model:value="scopeIds" mode="multiple" show-search allow-clear size="small"
                :options="scopeSelectGroups" :filter-option="filterScopeOption"
                class="monitor-scope-select" :dropdown-match-select-width="false"
                placeholder="筛选班组（可多选）" :max-tag-count="1" :max-tag-placeholder="scopeTagPlaceholder"
              />
              <span class="monitor-scope-meta">{{ isAllScope ? `共 ${OPS_GROUPS.length} 组` : `已选 ${scopeSelectedCount} 组` }}</span>
            </div>
          </div>
          <span class="live-badge"><i class="live-dot" />实时 · 60s</span>
          <span class="monitor-clock">{{ lastRefresh }}</span>
          <button type="button" class="monitor-refresh" title="刷新" @click="refresh"><ReloadOutlined /></button>
        </div>
      </div>
    </div>

    <!-- 当前重点：待核实高危 -->
    <section class="overview-section action-hero" :class="{ urgent: untaggedHigh.length > 0 }">
      <div class="ah-body">
        <span class="ah-kicker">当前重点</span>
        <div class="ah-main">
          <template v-if="untaggedHigh.length">
            <strong class="ah-count">{{ untaggedHigh.length }}</strong>
            <span class="ah-text">条高危命中待核实</span>
          </template>
          <template v-else>
            <strong class="ah-ok">暂无待核实高危</strong>
          </template>
        </div>
        <p class="ah-hint">先判定「命中是否成立」，成立后再按等级找对应处置人；误报会计入规则准确率。</p>
      </div>
      <button
        v-if="untaggedHigh.length"
        type="button"
        class="ah-btn"
        :class="{ active: gradeFilter === 'pending' }"
        @click="setGradeFilter('pending')"
      >
        处理待核实
      </button>
    </section>

    <!-- 分级筛选 + 处置层级说明 -->
    <section class="overview-section filter-row">
      <div class="grade-filters">
        <button type="button" class="gf-chip" :class="{ active: gradeFilter === 'all' }" @click="setGradeFilter('all')">
          全部<span class="gf-num">{{ rows.length }}</span>
        </button>
        <button
          v-for="g in GRADES"
          :key="g"
          type="button"
          class="gf-chip"
          :class="{ active: gradeFilter === g }"
          @click="setGradeFilter(g)"
        >
          {{ g }}危<span class="gf-num">{{ gradeCount[g] }}</span>
        </button>
        <button
          type="button"
          class="gf-chip gf-pending"
          :class="{ active: gradeFilter === 'pending', warn: untaggedHigh.length > 0 }"
          @click="setGradeFilter('pending')"
        >
          待核实<span class="gf-num">{{ untaggedHigh.length }}</span>
        </button>
      </div>
      <div class="disposal-legend">
        <span class="dl-label">处置层级</span>
        <span v-for="g in GRADES" :key="g" class="dl-item">
          <i class="dl-dot" :style="{ background: RISK_LEVEL_STYLE[g].color }" />
          {{ g }}危 → {{ DISPOSAL_BY_GRADE[g].who }}
        </span>
      </div>
    </section>

    <!-- RULE_COMPARE_DEMO 开始：评审演示，弱化展示 -->
    <details class="demo-panel">
      <summary>规则对比演示（评审用，上线前移除）</summary>
      <div class="demo-body">
        <div class="rule-switch">
          <button type="button" :class="{ on: !isLegacy }" @click="ruleMode = 'new'">双轨判定</button>
          <button type="button" :class="{ on: isLegacy }" @click="ruleMode = 'legacy'">仅关键词</button>
        </div>
        <section v-if="isLegacy" class="compare-note">
          <div class="cn-title">「仅关键词」与双轨判定的差异：</div>
          <ul class="cn-list">
            <li v-if="diff.recalled.length">
              <b class="cn-miss">漏 {{ diff.recalled.length }} 单</b>
              后果严重但客户未说狠话 —— 如
              <button type="button" class="cn-link" @click="openTicket(diff.recalled[0].ticketNo)">{{ diff.recalled[0].title }}</button>
            </li>
            <li v-if="diff.downgraded.length">
              <b class="cn-down">高估 {{ diff.downgraded.length }} 单</b>
              后果轻微但喊了外部渠道，仍被判高危
            </li>
          </ul>
        </section>
      </div>
    </details>
    <!-- RULE_COMPARE_DEMO 结束 -->

    <!-- 统一命中清单 -->
    <section class="overview-section work-panel">
      <div class="section-head">
        <div class="section-head-main">
          <h2 class="section-title">
            风险命中清单
            <span class="list-count">{{ filteredRows.length }}</span>
            <MetricTipIcon :tip="opsTip('riskHits')!" />
          </h2>
          <p class="section-sub">当前筛选：{{ filterLabel }}</p>
        </div>
      </div>

      <div v-if="!filteredRows.length" class="ob-empty">
        {{ gradeFilter === 'pending' ? '该范围下没有待核实的高危命中' : '该范围近期没有风险命中' }}
      </div>

      <table v-else class="hit-table">
        <thead>
          <tr>
            <th style="width: 52px">等级</th>
            <th style="width: 150px">判定依据</th>
            <th style="width: 200px">工单</th>
            <th>命中内容</th>
            <th style="width: 118px">客户 / 班组</th>
            <th style="width: 52px">时间</th>
            <th style="width: 148px">处置</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in filteredRows" :key="h.id" :class="{ untagged: !tagOf(h) && gradeOf(h) === '高' }">
            <td>
              <span
                class="grade-pill"
                :style="{ color: RISK_LEVEL_STYLE[gradeOf(h)].color, background: RISK_LEVEL_STYLE[gradeOf(h)].bg }"
              >{{ gradeOf(h) }}</span>
            </td>
            <td>
              <template v-if="isLegacy">
                <div class="track-legacy">命中「{{ h.word }}」</div>
                <div class="track-legacy-sub">按词表分级 {{ h.legacyLevel }}</div>
              </template>
              <template v-else>
                <div class="track-row">
                  <span class="track-k">后果</span>
                  <span class="track-v" :class="'impact-' + h.impact" :title="h.impactSource">{{ h.impact }}</span>
                </div>
                <div class="track-row">
                  <span class="track-k">信号</span>
                  <span class="track-v" :class="'signal-' + h.signal" :title="h.signalSource">{{ h.signal }}</span>
                </div>
              </template>
            </td>
            <td>
              <button type="button" class="rt-no" @click="openTicket(h.ticketNo)">{{ h.ticketNo }}</button>
              <div class="hit-title">{{ h.title }}</div>
              <div v-if="!isLegacy && h.legacyLevel === null" class="hit-flag flag-new">仅关键词时召不回</div>
            </td>
            <td class="hit-excerpt">
              <span class="hit-pos">{{ h.position }}</span>
              「{{ h.excerpt }}」
            </td>
            <td>{{ h.customer }}<div class="hit-sub">{{ h.groupName }} · {{ h.assignee }}</div></td>
            <td class="hit-when">{{ h.when.slice(11) }}</td>
            <td>
              <div v-if="tagOf(h)" class="cell-done">
                <span
                  class="tag-done"
                  :style="{ color: RISK_LEVEL_STYLE[tagOf(h)!].color, background: RISK_LEVEL_STYLE[tagOf(h)!].bg }"
                  :title="traceOf(h) ? `打标人：${traceOf(h)!.by}\n打标时刻：${traceOf(h)!.at}` + (traceOf(h)!.note ? `\n处置备注：${traceOf(h)!.note}` : '') : undefined"
                >{{ tagOf(h) }}风险</span>
                <span v-if="verdictOf(h)" class="verdict-chip" :class="verdictOf(h) === '误报' ? 'vc-fp' : 'vc-ok'">{{ verdictOf(h) }}</span>
                <button
                  v-if="tagOf(h) === '高' && verdictOf(h) === '成立'"
                  type="button" class="row-btn row-btn-primary" @click="goControl(h)"
                >去管控<ArrowRightOutlined /></button>
              </div>
              <button v-else-if="canRiskTag" type="button" class="row-btn row-btn-tag" @click="openTag(h)">核实打标</button>
              <span v-else class="hit-sub">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 预警词：主流程外，折叠为入口 -->
    <section class="overview-section panel-secondary">
      <div class="section-head">
        <div class="section-head-main">
          <h2 class="section-title">预警词管理</h2>
        </div>
        <button type="button" class="row-btn" @click="riskWordsOpen = true">
          {{ canMaintainWords ? '管理词表' : '查看词表' }}
        </button>
      </div>
      <p class="risk-board-note">
        <template v-if="canMaintainWords">
          词表 {{ localWords.filter((w) => w.enabled).length }} 条启用，
          近 7 天共命中 {{ localWords.reduce((s, w) => s + w.hits7d, 0) }} 次 · 新建词条默认停用，试跑后再启用。
        </template>
        <template v-else>
          词表只读 · 维护权归运营监控岗。词表 {{ localWords.filter((w) => w.enabled).length }} 条启用，
          近 7 天共命中 {{ localWords.reduce((s, w) => s + w.hits7d, 0) }} 次。
        </template>
      </p>
    </section>

    <!-- 预警词维护抽屉 -->
    <a-drawer v-model:open="riskWordsOpen" title="风险预警词" width="760" placement="right">
      <div v-if="canMaintainWords" class="drawer-toolbar">
        <button type="button" class="row-btn row-btn-primary" @click="openWordForm">新建预警词</button>
      </div>
      <p class="drawer-note top">
        命中即按词表推送指定人员。<b>近 7 天命中</b>是新增词条前的试跑依据——命中量过大的词上线即刷屏；
        <b>准确率</b>是上线后的体检——准确率低说明这条规则捞进来的多半不是风险，应先收窄匹配范围，而不是等人肉发现。
      </p>
      <table class="word-table">
        <thead>
          <tr>
            <th>预警词</th><th>分级</th><th>匹配范围</th>
            <th>通知人</th><th>近 7 天命中</th><th>准确率</th><th>状态</th>
            <th v-if="canMaintainWords" style="width: 64px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="w in localWords" :key="w.id" :class="{ off: !w.enabled }">
            <td class="wt-word">{{ w.word }}</td>
            <td>
              <span class="risk-word" :style="{ color: RISK_LEVEL_STYLE[w.level].color, background: RISK_LEVEL_STYLE[w.level].bg }">{{ w.level }}</span>
            </td>
            <td class="hit-sub">{{ w.scopes.join(' / ') }}</td>
            <td class="hit-sub">{{ w.receivers.join('、') }}</td>
            <td>
              <span :class="{ 'hits-high': w.hits7d > 50 }">{{ w.hits7d }}</span>
            </td>
            <td>
              <span v-if="accuracyOf(w) === null" class="hit-sub">—</span>
              <span v-else class="acc" :class="accTone(accuracyOf(w)!)">{{ Math.round(accuracyOf(w)! * 100) }}%</span>
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
        {{ canMaintainWords ? '词表由运营监控岗维护；新建默认停用，确认近 7 天命中量后再启用。' : '词表只读；维护请联系运营监控岗。' }}
      </p>
    </a-drawer>

    <!-- 新建预警词 -->
    <a-modal
      v-model:open="wordFormOpen"
      title="新建预警词"
      :width="520"
      ok-text="保存"
      cancel-text="取消"
      @ok="saveWord"
    >
      <div class="word-form">
        <div class="wf-row">
          <span class="wf-label req">预警词</span>
          <a-input v-model:value="wordForm.word" placeholder="如：曝光、12315" />
        </div>
        <div class="wf-row">
          <span class="wf-label">分级</span>
          <a-radio-group v-model:value="wordForm.level" button-style="solid">
            <a-radio-button v-for="g in GRADES" :key="g" :value="g">{{ g }}</a-radio-button>
          </a-radio-group>
        </div>
        <div class="wf-row">
          <span class="wf-label req">匹配范围</span>
          <a-checkbox-group v-model:value="wordForm.scopes" :options="SCOPE_OPTIONS" />
        </div>
        <div class="wf-row">
          <span class="wf-label req">通知人</span>
          <a-input v-model:value="wordForm.receivers" placeholder="多人用逗号分隔，如：李文萍、值班经理" />
        </div>
        <div class="wf-row">
          <span class="wf-label">上线状态</span>
          <a-switch v-model:checked="wordForm.enabled" checked-children="启用" un-checked-children="停用" />
          <span class="wf-hint">建议先停用试跑，确认近 7 天命中量合理后再启用。</span>
        </div>
      </div>
    </a-modal>

    <!-- 打标弹窗 -->
    <a-modal v-model:open="tagOpen" title="风险打标" :width="620" ok-text="保存" cancel-text="取消" @ok="saveTag">
      <div v-if="tagTarget" class="tag-form">
        <div class="tf-meta">
          <span class="tf-no">{{ tagTarget.ticketNo }}</span>
          <span class="tf-title">{{ tagTarget.title }}</span>
        </div>
        <div class="tf-excerpt">
          <span class="hit-pos">{{ tagTarget.position }}</span>
          「{{ tagTarget.excerpt }}」
        </div>

        <!-- 等级推导：让"为什么是这个等级"看得见 -->
        <div class="tf-block">
          <div class="tf-label">系统判定</div>
          <div class="derive">
            <div class="derive-line">
              <span class="derive-k">后果严重度</span>
              <span class="derive-v" :class="'impact-' + tagTarget.impact">{{ tagTarget.impact }}</span>
              <span class="derive-src">{{ tagTarget.impactSource }}</span>
            </div>
            <div class="derive-line">
              <span class="derive-k">外部信号</span>
              <span class="derive-v" :class="'signal-' + tagTarget.signal">{{ tagTarget.signal }}</span>
              <span class="derive-src">{{ tagTarget.signalSource }}</span>
            </div>
            <table class="matrix">
              <thead>
                <tr><th></th><th v-for="s in SIGNALS" :key="s">信号{{ s }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="im in IMPACTS" :key="im">
                  <th>后果{{ im }}</th>
                  <td
                    v-for="s in SIGNALS" :key="s"
                    :class="{ hit: im === tagTarget.impact && s === tagTarget.signal }"
                    :style="{ color: RISK_LEVEL_STYLE[RISK_MATRIX[im][s]].color }"
                  >{{ RISK_MATRIX[im][s] }}</td>
                </tr>
              </tbody>
            </table>
            <div class="derive-out">
              交叉结果
              <span class="derive-grade" :style="{ color: RISK_LEVEL_STYLE[riskGradeOf(tagTarget)].color, background: RISK_LEVEL_STYLE[riskGradeOf(tagTarget)].bg }">
                {{ riskGradeOf(tagTarget) }}危
              </span>
              <span class="derive-who">→ {{ DISPOSAL_BY_GRADE[riskGradeOf(tagTarget)].who }}</span>
            </div>
          </div>
        </div>

        <!-- 命中判定：判的是规则准不准，不是客户危不危险 -->
        <div class="tf-block">
          <div class="tf-label">本次命中<span class="tf-req">*</span></div>
          <a-radio-group v-model:value="tagVerdict" button-style="solid">
            <a-radio-button value="成立">成立</a-radio-button>
            <a-radio-button value="误报">误报</a-radio-button>
          </a-radio-group>
          <div class="tf-hint">判的是「规则这次命中得准不准」，不是「客户危不危险」。它决定规则准确率，是词表能否自己变好的唯一依据。</div>
        </div>

        <div class="tf-block">
          <div class="tf-label">风险等级</div>
          <a-radio-group v-model:value="tagLevel" button-style="solid" :disabled="tagVerdict === '误报'">
            <a-radio-button v-for="g in GRADES" :key="g" :value="g">{{ g }}</a-radio-button>
          </a-radio-group>
          <div class="tf-hint">默认取系统判定结果，可人工修正。判为误报时不需要定级。</div>
        </div>

        <div class="tf-block">
          <div class="tf-label">处置备注</div>
          <a-textarea v-model:value="tagNote" :rows="2" placeholder="记录核实结论与后续动作" />
        </div>

        <div v-if="tagVerdict === '成立' && tagLevel === '高'" class="tf-next">
          保存后可在列表中点「去管控」，转交{{ DISPOSAL_BY_GRADE['高'].who }}。管控需本人确认，系统不会自动改变工单归属。
        </div>
      </div>
    </a-modal>
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

.greeting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  gap: 12px;
  flex-wrap: wrap;
  border-radius: 14px;
  border: 1px solid rgba(26, 111, 255, 0.18);
  background: linear-gradient(135deg, #eff6ff 0%, #f8fbff 48%, #ecfdf5 100%);
  box-shadow: 0 4px 16px rgba(26, 111, 255, 0.08);
}
.greeting-text { min-width: 0; flex: 1; }
.greeting-title {
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
  line-height: 1.25;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.greeting-sub { margin-top: 6px; font-size: 12px; color: #64748b; line-height: 1.55; }
.greeting-aside { display: flex; align-items: center; flex: none; }
.head-tag { font-size: 10px; font-weight: 600; color: #6B7280; background: #F3F4F6; border-radius: 3px; padding: 1px 6px; }
.head-tag-complaint { color: #6B7280; background: #F3F4F6; }

.section-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 12px;
  padding: 6px 10px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}
.filter-item { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-label { flex: none; font-size: 12px; font-weight: 500; color: #9ca3af; line-height: 1; }

.monitor-scope-picker { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.monitor-scope-all-btn {
  border: 1px solid #e5e7eb; background: #fff; color: #64748b; border-radius: 8px;
  padding: 2px 10px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit; height: 28px;
}
.monitor-scope-all-btn:hover { background: #f9fafb; color: #374151; }
.monitor-scope-all-btn.active { background: #1a6fff; color: #fff; border-color: #1a6fff; }
.monitor-scope-select { min-width: 200px; max-width: 320px; }
.monitor-scope-select :deep(.ant-select-selector) { border-radius: 8px !important; font-size: 12px; min-height: 28px !important; }
.monitor-scope-meta { font-size: 11px; color: #94a3b8; white-space: nowrap; }
.live-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 600; color: #047857; background: #ecfdf5; border-radius: 999px; padding: 3px 10px;
}
.live-dot { width: 5px; height: 5px; border-radius: 50%; background: #10b981; animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.monitor-clock { font-size: 12px; color: #64748b; font-variant-numeric: tabular-nums; font-weight: 500; }
.monitor-refresh {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 1px solid #e5e7eb; background: #fff; border-radius: 8px;
  color: #64748b; cursor: pointer; font-size: 12px;
}
.monitor-refresh:hover { background: #f9fafb; color: #374151; }

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
.section-head-main { min-width: 0; }
.section-title {
  margin: 0; font-size: 13px; font-weight: 700; color: #111827;
  display: inline-flex; align-items: center; gap: 6px; line-height: 1.3;
}
.section-sub { margin: 2px 0 0; font-size: 11px; color: #9ca3af; }
.list-count {
  min-width: 20px; padding: 0 6px; border-radius: 8px; font-size: 11px; font-weight: 700;
  background: #f3f4f6; color: #6b7280; font-variant-numeric: tabular-nums;
}

/* 当前重点 */
.action-hero.overview-section {
  flex-direction: row; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  padding: 12px 14px;
}
.action-hero.urgent {
  background: #fff7f7; border-color: #fca5a5;
  box-shadow: 0 1px 4px rgba(239, 68, 68, 0.08);
  border-left: 3px solid #EF4444;
}
.ah-kicker { display: block; font-size: 10px; font-weight: 700; color: #9CA3AF; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 4px; }
.ah-main { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.ah-count { font-size: 28px; font-weight: 700; color: #EF4444; font-variant-numeric: tabular-nums; line-height: 1; }
.ah-text { font-size: 15px; font-weight: 600; color: #374151; }
.ah-ok { font-size: 15px; font-weight: 600; color: #10B981; }
.ah-hint { margin: 6px 0 0; font-size: 12px; color: #6B7280; line-height: 1.5; max-width: 640px; }
.ah-btn {
  flex-shrink: 0; padding: 6px 14px; border: 1px solid #D1D5DB; border-radius: 4px;
  background: #fff; color: #374151; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
}
.ah-btn:hover { background: #F9FAFB; color: #111827; }
.ah-btn.active { background: #1A6FFF; border-color: #1A6FFF; color: #fff; }

/* 筛选行 */
.filter-row.overview-section { gap: 10px; }
.grade-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.gf-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border: 1px solid #e2e8f0; border-radius: 3px;
  background: #fff; color: #64748b; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit;
}
.gf-chip:hover { background: #F9FAFB; color: #374151; }
.gf-chip.active { background: #334155; border-color: #334155; color: #fff; font-weight: 600; }
.gf-chip.gf-pending.warn:not(.active) { border-color: #fca5a5; background: #fff7f7; color: #EF4444; }
.gf-num {
  min-width: 18px; padding: 0 5px; border-radius: 8px; font-size: 11px; font-weight: 700;
  background: rgba(0, 0, 0, 0.06); font-variant-numeric: tabular-nums;
}
.gf-chip.active .gf-num { background: rgba(255, 255, 255, 0.22); }
.disposal-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; font-size: 11px; color: #64748b; }
.dl-label { font-weight: 700; color: #94a3b8; letter-spacing: 0.04em; }
.dl-item { display: inline-flex; align-items: center; gap: 5px; }
.dl-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

/* RULE_COMPARE_DEMO */
.demo-panel {
  padding: 8px 12px;
  background: #fafbfc; border: 1px dashed #cbd5e1; border-radius: 14px;
  font-size: 12px; color: #64748b;
}
.demo-panel summary { cursor: pointer; font-weight: 500; color: #475569; }
.demo-body { margin-top: 10px; }
.rule-switch { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 3px; overflow: hidden; margin-bottom: 8px; }
.rule-switch button {
  border: none; background: #fff; color: #64748b; font-size: 12px;
  padding: 3px 10px; cursor: pointer; font-family: inherit;
}
.rule-switch button.on { background: #334155; color: #fff; }
.compare-note {
  background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 4px;
  padding: 8px 12px;
}
.cn-title { font-size: 12px; color: #374151; margin-bottom: 4px; }
.cn-list { margin: 0; padding-left: 16px; font-size: 12px; color: #6B7280; }
.cn-list li { margin: 2px 0; }
.cn-miss { color: #EF4444; } .cn-fp { color: #6B7280; } .cn-down { color: #F59E0B; }
.cn-link { border: none; background: none; color: #1A6FFF; cursor: pointer; padding: 0; font-size: 12px; }

/* 表格 */
.panel-secondary { background: #fafbfc; }
.ob-empty { padding: 32px 8px; text-align: center; color: #94a3b8; font-size: 13px; }
.work-panel .hit-table { margin: 0; }

.hit-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.hit-table th {
  text-align: left; font-weight: 600; color: #64748b; font-size: 11px;
  padding: 8px 10px; border-bottom: 1px solid #e2e8f0; background: #fafbfc;
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

.track-row { display: flex; align-items: center; gap: 6px; margin: 2px 0; }
.track-k { font-size: 11px; color: #94a3b8; width: 26px; }
.track-v { padding: 0 7px; border-radius: 10px; font-size: 11px; cursor: help; }
.impact-严重, .impact-一般, .impact-轻微,
.signal-强, .signal-中, .signal-无 {
  background: #F3F4F6; color: #374151; font-weight: 500;
}
.track-legacy { color: #475569; font-size: 12px; }
.track-legacy-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }

.hit-flag { display: inline-block; margin-top: 4px; padding: 0 6px; border-radius: 3px; font-size: 10px; }
.flag-new, .flag-fp { background: #F3F4F6; color: #6B7280; }

.cell-done { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.tag-done { padding: 1px 7px; border-radius: 3px; font-size: 11px; cursor: help; font-weight: 600; }
.verdict-chip { padding: 0 5px; border-radius: 3px; font-size: 10px; }
.vc-ok { background: #10B98122; color: #10B981; }
.vc-fp { background: #F3F4F6; color: #6B7280; }
.row-btn {
  padding: 2px 8px; border: 1px solid #D1D5DB; border-radius: 3px;
  background: #fff; color: #374151; font-size: 11px; cursor: pointer; font-family: inherit;
}
.row-btn:hover { background: #F9FAFB; }
.row-btn-tag { border-color: #1A6FFF; color: #1A6FFF; font-weight: 600; }
.row-btn-primary { border-color: #1A6FFF; color: #1A6FFF; display: inline-flex; align-items: center; gap: 3px; font-weight: 600; }

.risk-board-note { margin: 0; padding: 8px 16px 12px; font-size: 11px; color: #64748b; line-height: 1.6; }
.word-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.word-table th {
  text-align: left; font-weight: 500; color: #64748b; font-size: 12px;
  padding: 6px 8px; border-bottom: 1px solid #e2e8f0;
}
.word-table td { padding: 8px; border-bottom: 1px solid #f1f5f9; color: #374151; }
.word-table tr.off { opacity: 0.55; }
.wt-word { font-weight: 500; color: #0f172a; }
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
.word-form { display: flex; flex-direction: column; gap: 14px; }
.wf-row { display: flex; flex-direction: column; gap: 6px; }
.wf-label { font-size: 13px; font-weight: 500; color: #374151; }
.wf-label.req::before { content: '* '; color: #ef4444; }
.wf-hint { font-size: 12px; color: #9ca3af; line-height: 1.5; }

/* 打标弹窗 */
.tf-meta { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
.tf-no { color: #1A6FFF; font-variant-numeric: tabular-nums; }
.tf-title { color: #0f172a; font-weight: 500; }
.tf-excerpt {
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;
  padding: 8px 10px; font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 14px;
}
.tf-block { margin-bottom: 14px; }
.tf-label { font-size: 13px; color: #334155; margin-bottom: 6px; font-weight: 500; }
.tf-req { color: #dc2626; margin-left: 2px; }
.tf-hint { margin-top: 5px; font-size: 12px; color: #94a3b8; line-height: 1.5; }

.derive { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; }
.derive-line { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; font-size: 12px; }
.derive-k { color: #64748b; width: 68px; }
.derive-v { padding: 0 7px; border-radius: 10px; }
.derive-src { color: #94a3b8; }
.matrix { border-collapse: collapse; margin: 8px 0 6px; font-size: 12px; }
.matrix th {
  padding: 3px 10px; color: #94a3b8; font-weight: 400; font-size: 11px;
  border: 1px solid #e2e8f0; background: #fff;
}
.matrix td { padding: 3px 14px; text-align: center; border: 1px solid #e2e8f0; background: #fff; }
.matrix td.hit { outline: 2px solid #1A6FFF; outline-offset: -2px; font-weight: 600; }
.derive-out { font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 6px; }
.derive-grade { padding: 1px 8px; border-radius: 10px; font-weight: 600; }
.derive-who { color: #475569; }
.tf-next {
  background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 6px;
  padding: 8px 10px; font-size: 12px; color: #374151; line-height: 1.6;
}
</style>
