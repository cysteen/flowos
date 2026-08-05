<script setup lang="ts">
// 客户查询（PRD-02 衍生）：只读查询页，两种查法——
//   手机号 / 客户姓名 → 客户全景；工单号 → 该工单信息 + 其报单客户的全景。
// 版式对齐处理页：「通栏速览（人/势/单）→ 主体 Tab」，本页只读，处理动作仍回工单处理页。
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  SearchOutlined,
  PhoneOutlined,
  CopyOutlined,
  MessageOutlined,
  MailOutlined,
  ExportOutlined,
  RightOutlined,
} from '@ant-design/icons-vue';
import {
  buildCustomerInsight,
  searchCustomers,
  suggestedCustomers,
  detectQueryKind,
  QUERY_KIND_LABEL,
  type CustomerCandidate,
  type CustomerInsight,
  type CustomerTicketRow,
} from '@/mock/customerInsight';
import { aftersaleDeepLink } from '@/views/tickets/composables/opActions';
import { CUSTOMER_TAG_COLOR } from '@/views/tickets/types/ticket';
import { useUserStore } from '@/stores/user';

/**
 * embedded：作为组件嵌在别的页面里（运营监控 · 溯源查询 Tab）。
 * 此时不改写地址栏——否则会把宿主页面踢出自己的路由。
 */
const props = defineProps<{ embedded?: boolean }>();

const route = useRoute();
const router = useRouter();
const user = useUserStore();

const keyword = ref('');
const insight = ref<CustomerInsight | null>(null);
const candidates = ref<CustomerCandidate[]>([]);
const highlightNo = ref('');
const searched = ref(false);
const notFoundFor = ref('');

const suggestions = suggestedCustomers(6);

const kindHint = computed(() => (keyword.value.trim() ? QUERY_KIND_LABEL[detectQueryKind(keyword.value)] : ''));

// ---- 主体 Tab + 履历筛选 ----
type BodyTab = 'history' | 'contact' | 'aftersale' | 'survey';
type TicketFilter = 'all' | 'processing' | 'closed' | 'complaint' | 'escalated';

const activeTab = ref<BodyTab>('history');
const activeFilter = ref<TicketFilter>('all');
/** 点「常投诉产品」时收窄履历到该产品名 */
const productFilter = ref('');

const filters = computed<{ key: TicketFilter; label: string; count: number }[]>(() => {
  const list = insight.value?.tickets ?? [];
  return [
    { key: 'all', label: '全部', count: list.length },
    { key: 'processing', label: '处理中', count: list.filter((t) => t.isProcessing).length },
    { key: 'closed', label: '已关闭', count: list.filter((t) => t.isClosed).length },
    { key: 'complaint', label: '投诉', count: list.filter((t) => t.isComplaint).length },
    { key: 'escalated', label: '升级', count: list.filter((t) => t.escalatedToNo || t.escalatedFromNo).length },
  ];
});

const visibleTickets = computed(() => {
  let list = insight.value?.tickets ?? [];
  switch (activeFilter.value) {
    case 'processing': list = list.filter((t) => t.isProcessing); break;
    case 'closed': list = list.filter((t) => t.isClosed); break;
    case 'complaint': list = list.filter((t) => t.isComplaint); break;
    case 'escalated': list = list.filter((t) => t.escalatedToNo || t.escalatedFromNo); break;
    default: break;
  }
  if (productFilter.value) {
    const p = productFilter.value;
    list = list.filter((t) => t.product === p || t.product.includes(p) || p.includes(t.product));
  }
  return list;
});

/** 常投诉产品：按投诉工单聚合，附带已购 SN/保修；无投诉时不展示此块 */
const hotComplaintProducts = computed(() => {
  const data = insight.value;
  if (!data) return [];
  const counts = new Map<string, number>();
  for (const t of data.tickets) {
    if (!t.isComplaint || !t.product) continue;
    counts.set(t.product, (counts.get(t.product) ?? 0) + 1);
  }
  if (!counts.size) return [];
  return [...counts.entries()]
    .map(([name, count]) => {
      const buy = data.profile.purchases.find(
        (p) => p.name === name || p.name.includes(name) || name.includes(p.name),
      );
      return {
        name,
        count,
        sn: buy?.sn,
        warranty: buy?.warranty,
        inWarranty: buy?.inWarranty,
      };
    })
    .sort((a, b) => b.count - a.count);
});

function openHotProduct(name: string) {
  activeTab.value = 'history';
  activeFilter.value = 'complaint';
  productFilter.value = name;
}

/**
 * 统计宫格 = 导航：履历类切历史工单 Tab + 筛选；售后/满意度切对应 Tab。
 */
interface StatItem {
  key: string;
  label: string;
  value: number | string;
  unit: string;
  warn?: boolean;
  filter?: TicketFilter;
  tab?: BodyTab;
}

const topStats = computed<StatItem[]>(() => {
  const m = insight.value?.metrics;
  if (!m) return [];
  return [
    { key: 'total', label: '历史', value: m.total, unit: '单', filter: 'all', tab: 'history' },
    { key: 'processing', label: '在办', value: visibleCount('processing'), unit: '单', filter: 'processing', tab: 'history' },
    { key: 'complaint', label: '投诉', value: m.complaint, unit: '单', warn: m.complaint > 0, filter: 'complaint', tab: 'history' },
    { key: 'recent30', label: '近30天', value: m.recent30, unit: '单', warn: m.recent30 >= 2, tab: 'history' },
  ];
});

const bottomStats = computed<StatItem[]>(() => {
  const m = insight.value?.metrics;
  if (!m) return [];
  return [
    { key: 'escalated', label: '升级', value: m.escalated, unit: '次', warn: m.escalated > 0, filter: 'escalated', tab: 'history' },
    { key: 'breached', label: '超时', value: m.breached, unit: '单', warn: m.breached > 0, tab: 'history' },
    { key: 'satisfaction', label: '满意度', value: m.avgSatisfaction === null ? '—' : m.avgSatisfaction.toFixed(1), unit: '分', warn: m.avgSatisfaction !== null && m.avgSatisfaction < 3.5, tab: 'survey' },
    { key: 'aftersale', label: '售后', value: m.aftersale, unit: '单', tab: 'aftersale' },
  ];
});

function visibleCount(f: TicketFilter) {
  return filters.value.find((x) => x.key === f)?.count ?? 0;
}

/** 全景表头右侧摘要：优先展示风险信号，否则历史/在办 */
const panoramaHeadMeta = computed(() => {
  const m = insight.value?.metrics;
  if (!m) return '';
  const parts: string[] = [];
  if (m.complaint > 0) parts.push(`投诉 ${m.complaint}`);
  if (m.escalated > 0) parts.push(`升级 ${m.escalated}`);
  if (m.breached > 0) parts.push(`超时 ${m.breached}`);
  if (!parts.length) {
    parts.push(`历史 ${m.total}`);
    parts.push(`在办 ${visibleCount('processing')}`);
  }
  return parts.join(' · ');
});

const panoramaHeadWarn = computed(() => {
  const m = insight.value?.metrics;
  return !!(m && (m.complaint > 0 || m.escalated > 0 || m.breached > 0));
});

function onStat(it: StatItem) {
  productFilter.value = '';
  if (it.tab) activeTab.value = it.tab;
  if (it.filter) activeFilter.value = it.filter;
  else if (it.tab === 'history') activeFilter.value = 'all';
}

function setHistoryFilter(key: TicketFilter) {
  activeFilter.value = key;
  productFilter.value = '';
}

/** 未结案：外投 > P0 > 其余，同级按建单时间倒序 */
const openTickets = computed(() => {
  const list = (insight.value?.tickets ?? []).filter((t) => t.isProcessing);
  return [...list].sort((a, b) => {
    const score = (t: CustomerTicketRow) => (t.complaintPlatform ? 4 : 0) + (t.priority === 'P0' ? 2 : 0);
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
});

const hitTicket = computed(
  () => (highlightNo.value ? insight.value?.tickets.find((t) => t.no === highlightNo.value) ?? null : null),
);

const tabCounts = computed(() => ({
  history: insight.value?.tickets.length ?? 0,
  contact: insight.value?.contacts.length ?? 0,
  aftersale: insight.value?.aftersales.length ?? 0,
  survey: insight.value?.surveys.length ?? 0,
}));

// ---- 视觉映射 ----
const TONE_STYLE: Record<CustomerTicketRow['tone'], { color: string; background: string }> = {
  processing: { color: '#1a6fff', background: '#1a6fff18' },
  pending: { color: '#f59e0b', background: '#f59e0b18' },
  suspended: { color: '#6b7280', background: '#6b728018' },
  closed: { color: '#10b981', background: '#10b98118' },
};
const TYPE_TONE: Record<string, string> = {
  投诉: '#EF4444', 建议: '#10B981', 商机: '#F59E0B', 咨询: '#1A6FFF', 维修: '#8B5CF6',
};
const CONTACT_ICON = { call: PhoneOutlined, im: MessageOutlined, sms: MessageOutlined, email: MailOutlined };
const CONTACT_LABEL = { call: '热线', im: '在线', sms: '短信', email: '邮件' };

/** 角色配色：记者/老师/校长/自媒体沿用工单库 CUSTOMER_TAG_COLOR，缺省身份走中性灰 */
const ROLE_COLOR: Record<string, string> = { ...CUSTOMER_TAG_COLOR };
function roleStyle(role: string) {
  const c = ROLE_COLOR[role];
  return c ? { color: c, background: `${c}18` } : { color: '#6b7280', background: '#6b728014' };
}

/** 主手机号已单独成行，此处只列其余联系方式 */
const otherContacts = computed(
  () => (insight.value?.profile.contacts ?? []).filter((c) => c.value !== insight.value?.profile.phone),
);

// ---- 查询 ----
function loadPhone(phone: string, ticketNo = '') {
  const data = buildCustomerInsight(phone);
  searched.value = true;
  if (!data) {
    insight.value = null;
    candidates.value = [];
    notFoundFor.value = phone;
    return;
  }
  insight.value = data;
  candidates.value = [];
  notFoundFor.value = '';
  highlightNo.value = ticketNo;
  activeFilter.value = 'all';
  productFilter.value = '';
  activeTab.value = 'history';
  if (ticketNo) {
    nextTick(() => {
      document.querySelector(`[data-ticket-no="${ticketNo}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

function runSearch(raw = keyword.value) {
  const q = raw.trim();
  if (!q) {
    message.warning('请输入手机号、工单号、设备 SN 或客户姓名');
    return;
  }
  keyword.value = q;
  const result = searchCustomers(q);
  searched.value = true;
  if (result.candidates.length === 0) {
    insight.value = null;
    candidates.value = [];
    notFoundFor.value = q;
    return;
  }
  if (result.candidates.length === 1) {
    loadPhone(result.candidates[0].phone, result.highlightTicketNo);
    syncQuery(q);
    return;
  }
  insight.value = null;
  notFoundFor.value = '';
  candidates.value = result.candidates;
  syncQuery(q);
}

function syncQuery(q: string) {
  if (props.embedded) return;
  if (route.query.q !== q) router.replace({ path: '/customer-insight', query: { q } });
}

function pickCandidate(c: CustomerCandidate) {
  keyword.value = c.phone;
  loadPhone(c.phone);
  syncQuery(c.phone);
}

/** 监控岗等只读角色菜单里没有工单列表，不出这个入口 */
const canOpenList = computed(() => user.canAccess('tickets'));

/**
 * 客户全景 → 工单列表：本页按"人"读履历，列表按"单"做筛选/批量/导出，
 * 两者用途不同不合并，但必须能一键互跳。
 */
function openInTicketList() {
  router.push({ path: '/tickets/list', query: { kw: insight.value?.profile.name ?? keyword.value } });
}

function openTicket(t: CustomerTicketRow) {
  if (t.source === '售后') {
    window.open(aftersaleDeepLink(t.no), '_blank', 'noopener');
    return;
  }
  if (!t.live) return;
  router.push(`/tickets/${t.no}`);
}

function callOut(phone: string) {
  message.success(`正在呼叫 ${phone}…`);
}

async function copyPhone(phone: string) {
  try {
    await navigator.clipboard.writeText(phone);
    message.success('手机号已复制');
  } catch {
    message.info(phone);
  }
}

function scoreColor(score: number) {
  if (score >= 4.5) return '#10b981';
  if (score >= 3.5) return '#f59e0b';
  return '#ef4444';
}

onMounted(() => {
  if (props.embedded) return;
  const q = (route.query.q as string) || (route.query.phone as string) || '';
  if (q) {
    keyword.value = q;
    runSearch(q);
  }
});

watch(() => route.query.q, (q) => {
  if (props.embedded) return;
  if (typeof q === 'string' && q && q !== keyword.value) {
    keyword.value = q;
    runSearch(q);
  }
});
</script>

<template>
  <div class="customer-insight">
    <!-- ① 查询条 -->
    <div class="search-card">
      <div class="search-row">
        <div class="search-box">
          <SearchOutlined class="search-ic" />
          <input
            v-model="keyword"
            class="search-input"
            placeholder="手机号 / 客户姓名 查客户，工单号 查工单"
            @keyup.enter="runSearch()"
          />
          <span v-if="kindHint" class="kind-chip">识别为 {{ kindHint }}</span>
        </div>
        <button type="button" class="search-btn" @click="runSearch()">查询</button>
      </div>
      <p class="search-tip">手机号 / 客户姓名 → 客户全景；工单号 → 工单信息与其报单客户</p>
    </div>

    <!-- 空态：起步入口 -->
    <div v-if="!searched" class="panel">
      <div class="ob-head">
        <span class="ob-title"><i class="ob-bar bar-blue" />近期高频客户</span>
      </div>
      <div class="sug-grid">
        <button v-for="c in suggestions" :key="c.phone" type="button" class="sug-tile" @click="pickCandidate(c)">
          <div class="sug-top">
            <span class="sug-name">{{ c.name }}</span>
            <span class="role-tag" :style="roleStyle(c.role)">{{ c.role }}</span>
          </div>
          <div class="sug-phone">{{ c.phone }}</div>
          <div class="sug-meta">{{ c.ticketCount }} 单 · 最近 {{ c.lastAt }}</div>
        </button>
      </div>
    </div>

    <!-- 未命中 -->
    <div v-else-if="notFoundFor" class="panel none-panel">
      <div class="none-title">未找到与「{{ notFoundFor }}」匹配的客户</div>
      <div class="none-sub">请确认手机号是否完整（11 位），或改用工单号、设备 SN、客户姓名重新查询。</div>
    </div>

    <!-- 多候选 -->
    <div v-else-if="candidates.length" class="panel">
      <div class="ob-head">
        <span class="ob-title"><i class="ob-bar bar-blue" />匹配到 {{ candidates.length }} 位客户</span>
      </div>
      <div class="cand-list">
        <button v-for="c in candidates" :key="c.phone" type="button" class="cand-row" @click="pickCandidate(c)">
          <div class="cand-main">
            <span class="cand-name">{{ c.name }}</span>
            <span class="role-tag" :style="roleStyle(c.role)">{{ c.role }}</span>
            <span v-for="t in c.tags" :key="t" class="mini-tag">{{ t }}</span>
          </div>
          <div class="cand-meta">{{ c.phone }} · 累计 {{ c.ticketCount }} 单 · 最近 {{ c.lastAt }} · {{ c.reason }}</div>
          <RightOutlined class="cand-arrow" />
        </button>
      </div>
    </div>

    <template v-else-if="insight">
      <!-- ② 工单号命中 -->
      <div v-if="hitTicket" class="panel hit-panel">
        <div class="ob-head">
          <span class="ob-title"><i class="ob-bar bar-blue" />工单信息</span>
          <button
            v-if="hitTicket.live || hitTicket.source === '售后'"
            type="button"
            class="open-btn"
            @click="openTicket(hitTicket)"
          >
            {{ hitTicket.source === '售后' ? '打开售后单' : '打开工单处理页' }}<ExportOutlined class="no-ext" />
          </button>
        </div>
        <div class="hit-body">
          <div class="hit-line1">
            <span class="st-tag" :style="TONE_STYLE[hitTicket.tone]">{{ hitTicket.statusText }}</span>
            <span
              class="ty-tag"
              :style="{ color: TYPE_TONE[hitTicket.type] ?? '#6b7280', background: (TYPE_TONE[hitTicket.type] ?? '#6b7280') + '18' }"
            >{{ hitTicket.type }}</span>
            <span class="hit-pri">{{ hitTicket.priority }}</span>
            <h2 class="hit-title">{{ hitTicket.title }}</h2>
            <span class="hit-no">{{ hitTicket.no }}</span>
          </div>
          <dl class="hit-fields">
            <div><dt>产品</dt><dd>{{ hitTicket.product }}</dd></div>
            <div><dt>渠道</dt><dd>{{ hitTicket.channel }}</dd></div>
            <div><dt>处理人</dt><dd>{{ hitTicket.assignee }}</dd></div>
            <div><dt>建单</dt><dd>{{ hitTicket.createdAt }}</dd></div>
            <div v-if="hitTicket.closedAt"><dt>关闭</dt><dd>{{ hitTicket.closedAt }}</dd></div>
            <div v-if="typeof hitTicket.satisfaction === 'number'">
              <dt>满意度</dt>
              <dd :style="{ color: scoreColor(hitTicket.satisfaction) }">{{ hitTicket.satisfaction }} 分</dd>
            </div>
            <div><dt>报单客户</dt><dd>{{ insight.profile.name }} · {{ insight.profile.phone }}</dd></div>
          </dl>
          <div v-if="hitTicket.escalatedFromNo || hitTicket.escalatedToNo || hitTicket.complaintPlatform || hitTicket.breached" class="hit-chain">
            <span v-if="hitTicket.escalatedFromNo">↑ 升级自 {{ hitTicket.escalatedFromNo }}</span>
            <span v-if="hitTicket.escalatedToNo">↓ 已升级为 {{ hitTicket.escalatedToNo }}</span>
            <span v-if="hitTicket.complaintPlatform" class="chain-danger">外投平台：{{ hitTicket.complaintPlatform }}</span>
            <span v-if="hitTicket.breached" class="flag danger">时效未达标</span>
          </div>
          <p v-if="hitTicket.conclusion" class="hit-sum">{{ hitTicket.conclusion }}</p>
        </div>
      </div>

      <!-- ③ 头部通栏：人 / 势 / 单（紧凑表头 + 右侧摘要提信息密度） -->
      <div class="overview-band">
        <div class="ob-cell">
          <section class="ob-col ob-profile">
            <header class="ob-head">
              <span class="ob-title"><i class="ob-dot" />客户档案</span>
              <span v-if="hotComplaintProducts.length" class="ob-meta warn">
                常投诉产品 {{ hotComplaintProducts.length }}
              </span>
              <span v-else-if="insight.profile.tags.length" class="ob-meta">
                {{ insight.profile.tags.join(' · ') }}
              </span>
            </header>
            <div class="ob-body">
              <!-- 客户名称 + 角色 -->
              <div class="p-name-row">
                <span class="p-name">{{ insight.profile.name }}</span>
                <span class="role-tag" :style="roleStyle(insight.profile.role)">{{ insight.profile.role }}</span>
                <span v-for="t in insight.profile.tags" :key="t" class="mini-tag">{{ t }}</span>
              </div>

              <!-- 联系方式 -->
              <div class="p-phone-row">
                <span class="p-phone">{{ insight.profile.phone }}</span>
                <button type="button" class="icon-btn" title="复制手机号" @click="copyPhone(insight.profile.phone)"><CopyOutlined /></button>
                <button type="button" class="call-btn" @click="callOut(insight.profile.phone)"><PhoneOutlined />外呼</button>
              </div>
              <div v-if="otherContacts.length" class="p-contacts">
                <span v-for="c in otherContacts" :key="c.kind + c.value" class="ct-way">
                  <em>{{ c.kind }}</em>{{ c.value }}
                </span>
              </div>

              <dl v-if="insight.profile.address" class="p-fields">
                <div class="full"><dt>地址</dt><dd>{{ insight.profile.address }}</dd></div>
              </dl>

              <!-- 常投诉产品（按履历投诉单聚合，二线对客优先看这个） -->
              <div v-if="hotComplaintProducts.length" class="buy-block">
                <div class="buy-head">常投诉产品 <b>{{ hotComplaintProducts.length }}</b></div>
                <button
                  v-for="d in hotComplaintProducts"
                  :key="d.name"
                  type="button"
                  class="buy-item"
                  :title="`在历史工单中查看「${d.name}」投诉`"
                  @click="openHotProduct(d.name)"
                >
                  <span class="buy-name">{{ d.name }}</span>
                  <span class="buy-cnt">投诉 {{ d.count }}</span>
                  <span v-if="d.sn" class="buy-sn">{{ d.sn }}</span>
                  <span
                    v-if="d.warranty && d.warranty !== '—'"
                    class="buy-wr"
                    :class="d.inWarranty ? 'wr-in' : 'wr-out'"
                  >
                    {{ d.inWarranty ? `保内至 ${d.warranty}` : '保外' }}
                  </span>
                </button>
              </div>
            </div>
          </section>
        </div>

        <div class="ob-cell">
          <section class="ob-col ob-stat">
            <header class="ob-head">
              <span class="ob-title"><i class="ob-dot" />客户全景</span>
              <span class="ob-meta" :class="{ warn: panoramaHeadWarn }">{{ panoramaHeadMeta }}</span>
            </header>
            <div class="ob-stat-body">
              <div class="stat-grid">
                <div class="stat-row">
                  <button
                    v-for="it in topStats"
                    :key="it.key"
                    type="button"
                    class="stat-item"
                    :class="{ warn: it.warn }"
                    :title="it.filter ? `在历史工单中查看${it.label}` : `查看${it.label}明细`"
                    @click="onStat(it)"
                  >
                    <span class="si-label">{{ it.label }}</span>
                    <span class="si-value">{{ it.value }}<span class="si-unit">{{ it.unit }}</span></span>
                  </button>
                </div>
                <div class="stat-row">
                  <button
                    v-for="it in bottomStats"
                    :key="it.key"
                    type="button"
                    class="stat-item"
                    :class="{ warn: it.warn }"
                    :title="`查看${it.label}明细`"
                    @click="onStat(it)"
                  >
                    <span class="si-label">{{ it.label }}</span>
                    <span class="si-value">{{ it.value }}<span class="si-unit">{{ it.unit }}</span></span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div class="ob-cell">
          <section class="ob-col ob-open">
            <header class="ob-head">
              <span class="ob-title"><i class="ob-dot" />未结案工单</span>
              <span class="ob-count" :class="{ empty: !openTickets.length }">{{ openTickets.length }}</span>
            </header>
            <div class="ob-body">
              <div v-if="!openTickets.length" class="ob-empty">当前无未结案工单</div>
              <div
                v-for="t in openTickets"
                :key="t.id"
                class="open-item"
                :class="{ hit: t.no === highlightNo }"
              >
                <div class="oi-top">
                  <span class="st-tag" :style="TONE_STYLE[t.tone]">{{ t.statusText }}</span>
                  <span class="oi-pri" :class="{ urgent: t.priority === 'P0' }">{{ t.priority }}</span>
                  <span
                    class="ty-tag"
                    :style="{ color: TYPE_TONE[t.type] ?? '#6b7280', background: (TYPE_TONE[t.type] ?? '#6b7280') + '18' }"
                  >{{ t.type }}</span>
                  <h4 class="oi-title">{{ t.title }}</h4>
                </div>
                <div class="oi-meta">
                  <button type="button" class="oi-no" @click="openTicket(t)">{{ t.no }}</button>
                  <span class="sep">·</span><span>{{ t.product }}</span>
                  <span class="sep">·</span><span>{{ t.assignee }}</span>
                  <span class="oi-when">建单 {{ t.createdAt }}</span>
                </div>
                <div v-if="t.complaintPlatform" class="oi-flag">外投平台：{{ t.complaintPlatform }}</div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <!-- ④ 主体 Tab：履历 / 联系 / 售后 / 满意度 -->
      <div class="panel body-panel">
        <div class="body-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="body-tab"
            :class="{ active: activeTab === 'history' }"
            :aria-selected="activeTab === 'history'"
            @click="activeTab = 'history'"
          >
            历史工单<span class="tab-count">{{ tabCounts.history }}</span>
          </button>
          <button
            type="button"
            role="tab"
            class="body-tab"
            :class="{ active: activeTab === 'contact' }"
            :aria-selected="activeTab === 'contact'"
            @click="activeTab = 'contact'"
          >
            联系记录<span class="tab-count">{{ tabCounts.contact }}</span>
          </button>
          <button
            type="button"
            role="tab"
            class="body-tab"
            :class="{ active: activeTab === 'aftersale' }"
            :aria-selected="activeTab === 'aftersale'"
            @click="activeTab = 'aftersale'"
          >
            关联售后<span class="tab-count">{{ tabCounts.aftersale }}</span>
          </button>
          <button
            type="button"
            role="tab"
            class="body-tab"
            :class="{ active: activeTab === 'survey' }"
            :aria-selected="activeTab === 'survey'"
            @click="activeTab = 'survey'"
          >
            满意度评价<span class="tab-count">{{ tabCounts.survey }}</span>
          </button>
        </div>

        <div class="tab-pane" role="tabpanel">
          <!-- 历史工单 -->
          <template v-if="activeTab === 'history'">
            <div class="chip-row">
              <button
                v-for="f in filters"
                :key="f.key"
                type="button"
                class="chip"
                :class="{ active: activeFilter === f.key }"
                @click="setHistoryFilter(f.key)"
              >
                {{ f.label }}({{ f.count }})
              </button>
              <button
                v-if="productFilter"
                type="button"
                class="chip active product-chip"
                @click="productFilter = ''"
              >
                {{ productFilter }} ×
              </button>
              <!-- 本页按"人"读履历；要按条件筛这批单、批量操作或导出，回工单列表 -->
              <button v-if="canOpenList" type="button" class="to-list" @click="openInTicketList">
                在工单列表中查看<ExportOutlined class="tl-ic" />
              </button>
            </div>
            <div class="hist-list">
              <article
                v-for="t in visibleTickets"
                :key="t.id"
                class="hist-card"
                :class="{ hit: t.no === highlightNo, 'is-aftersale': t.source === '售后' }"
                :data-ticket-no="t.no"
              >
                <div class="hc-top">
                  <span v-if="t.source === '售后'" class="src-tag">售后</span>
                  <span class="st-tag" :style="TONE_STYLE[t.tone]">{{ t.statusText }}</span>
                  <h3 class="hc-title">{{ t.title }}</h3>
                  <time class="hc-date">{{ t.createdAt }}</time>
                </div>
                <div class="hc-meta">
                  <button type="button" class="hc-no" :class="{ plain: !t.live && t.source !== '售后' }" @click="openTicket(t)">
                    {{ t.no }}<ExportOutlined v-if="t.source === '售后'" class="no-ext" />
                  </button>
                  <span class="sep">·</span>
                  <span class="ty-tag" :style="{ color: TYPE_TONE[t.type] ?? '#6b7280', background: (TYPE_TONE[t.type] ?? '#6b7280') + '18' }">{{ t.type }}</span>
                  <span class="sep">·</span><span>{{ t.priority }}</span>
                  <span class="sep">·</span><span>{{ t.product }}</span>
                  <span class="sep">·</span><span>{{ t.channel }}</span>
                  <span class="sep">·</span><span>{{ t.assignee }}</span>
                  <span v-if="t.closedAt" class="sep">·</span>
                  <span v-if="t.closedAt">关闭 {{ t.closedAt }}</span>
                  <span v-if="t.breached" class="flag danger">时效未达标</span>
                  <span
                    v-if="typeof t.satisfaction === 'number'"
                    class="flag"
                    :style="{ color: scoreColor(t.satisfaction), background: scoreColor(t.satisfaction) + '18' }"
                  >满意度 {{ t.satisfaction }}</span>
                  <span v-if="!t.live && t.source !== '售后'" class="flag muted">已归档</span>
                </div>
                <div v-if="t.escalatedFromNo || t.escalatedToNo || t.complaintPlatform" class="hc-chain">
                  <span v-if="t.escalatedFromNo">↑ 升级自 {{ t.escalatedFromNo }}</span>
                  <span v-if="t.escalatedToNo">↓ 已升级为 {{ t.escalatedToNo }}</span>
                  <span v-if="t.complaintPlatform" class="chain-danger">外投平台：{{ t.complaintPlatform }}</span>
                </div>
                <p v-if="t.conclusion" class="hc-sum">{{ t.conclusion }}</p>
              </article>
              <div v-if="!visibleTickets.length" class="ob-empty">当前筛选下没有工单</div>
            </div>
          </template>

          <!-- 联系记录 -->
          <template v-else-if="activeTab === 'contact'">
            <div v-if="insight.contacts.length" class="ct-list">
              <div v-for="c in insight.contacts" :key="c.id" class="ct-item">
                <div class="ct-top">
                  <component :is="CONTACT_ICON[c.kind]" class="ct-ic" />
                  <span class="ct-kind">{{ CONTACT_LABEL[c.kind] }}</span>
                  <span class="ct-when">{{ c.when }}</span>
                </div>
                <div class="ct-meta">{{ c.operator }} · {{ c.meta }}</div>
                <p class="ct-sum">{{ c.summary }}</p>
                <span v-if="c.ticketNo" class="ct-no">{{ c.ticketNo }}</span>
              </div>
            </div>
            <div v-else class="ob-empty">暂无联系记录</div>
          </template>

          <!-- 关联售后 -->
          <template v-else-if="activeTab === 'aftersale'">
            <div v-if="insight.aftersales.length" class="as-list">
              <a
                v-for="a in insight.aftersales"
                :key="a.no"
                class="as-item"
                :href="aftersaleDeepLink(a.no)"
                target="_blank"
                rel="noopener"
              >
                <div class="as-top">
                  <span class="as-no">{{ a.no }}<ExportOutlined class="no-ext" /></span>
                  <span class="as-status" :class="a.status === '已完成' ? 'done' : 'doing'">{{ a.status }}</span>
                </div>
                <div class="as-meta">{{ a.type }} · {{ a.product }} · {{ a.createdAt }}</div>
                <p class="as-sum">{{ a.conclusion }}</p>
                <span v-if="a.fromTicketNo" class="as-from">转自 {{ a.fromTicketNo }}</span>
              </a>
            </div>
            <div v-else class="ob-empty">暂无关联售后单</div>
          </template>

          <!-- 满意度 -->
          <template v-else>
            <div v-if="insight.surveys.length" class="sv-list">
              <div v-for="s in insight.surveys" :key="s.ticketNo + s.sentAt" class="sv-item">
                <div class="sv-top">
                  <span class="sv-no">{{ s.ticketNo }}</span>
                  <span
                    v-if="s.evaluated && typeof s.score === 'number'"
                    class="sv-score"
                    :style="{ color: scoreColor(s.score), background: scoreColor(s.score) + '18' }"
                  >{{ s.score }} 分</span>
                  <span v-else class="sv-score pending">未评价</span>
                </div>
                <div class="sv-when">{{ s.sentAt }}</div>
                <p v-if="s.comment" class="sv-cm">“{{ s.comment }}”</p>
              </div>
            </div>
            <div v-else class="ob-empty">暂无满意度评价</div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.customer-insight {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px 16px 24px;
}

.panel {
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.06);
}
.ob-empty { font-size: 12px; color: #9ca3af; padding: 16px 0; }

/* ---- 查询条 ---- */
.search-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.06);
}
.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.search-box {
  flex: 1;
  max-width: 520px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #d9e2ec;
  border-radius: 6px;
  background: #fbfdff;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.search-box:focus-within { border-color: #1a6fff; box-shadow: 0 0 0 3px rgba(26, 111, 255, 0.1); background: #fff; }
.search-ic { color: #9ca3af; font-size: 14px; }
.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: #111827;
  font-family: inherit;
}
.kind-chip {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  color: #1a6fff;
  background: #eff6ff;
  border-radius: 4px;
  padding: 1px 7px;
}
.search-btn {
  flex: none;
  height: 34px;
  padding: 0 20px;
  border: none;
  border-radius: 6px;
  background: #1a6fff;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.search-btn:hover { background: #1560e0; }
.search-tip { margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.4; }

/* ---- 空态 / 候选 ---- */
.sug-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; margin-top: 10px; }
.sug-tile {
  text-align: left;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  flex-direction: column;
  gap: 3px;
  transition: border-color 0.15s, background 0.15s;
}
.sug-tile:hover { border-color: #bfdbfe; background: #f8fbff; }
.sug-top { display: flex; align-items: center; gap: 6px; }
.sug-name { font-size: 13px; font-weight: 600; color: #111827; }
.sug-phone { font-size: 12px; color: #4b5563; font-variant-numeric: tabular-nums; }
.sug-meta { font-size: 11px; color: #9ca3af; }

.none-panel { display: flex; flex-direction: column; gap: 4px; padding: 20px; }
.none-title { font-size: 14px; font-weight: 600; color: #374151; }
.none-sub { font-size: 12px; color: #9ca3af; }

.cand-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.cand-row {
  position: relative;
  text-align: left;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 6px;
  padding: 8px 30px 8px 10px;
  cursor: pointer;
  font-family: inherit;
}
.cand-row:hover { border-color: #bfdbfe; background: #f8fbff; }
.cand-main { display: flex; align-items: center; gap: 6px; }
.cand-name { font-size: 13px; font-weight: 600; color: #111827; }
.cand-meta { font-size: 11px; color: #6b7280; margin-top: 3px; }
.cand-arrow { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #c3cbd6; font-size: 12px; }

/* ---- 概览带：人 / 势 / 单 ---- */
.overview-band { display: flex; gap: 12px; align-items: stretch; }
.ob-cell {
  flex: 1;
  min-width: 0;
  height: 156px;
}
.ob-col {
  box-sizing: border-box;
  height: 100%;
  border-radius: 12px;
  padding: 8px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  border: 1px solid transparent;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.06);
  transition: box-shadow 0.2s, border-color 0.2s;
  background-clip: padding-box;
}
.ob-col:hover { box-shadow: 0 4px 14px rgba(17, 24, 39, 0.1); }
.ob-profile { background: linear-gradient(180deg, #fff 0%, #f8faff 100%); border-color: #bfdbfe; border-top: 3px solid #1a6fff; }
.ob-stat { background: linear-gradient(180deg, #fff 0%, #faf8ff 100%); border-color: #ddd6fe; border-top: 3px solid #7c3aed; }
.ob-open { background: linear-gradient(180deg, #fff 0%, #f6fdf9 100%); border-color: #a7f3d0; border-top: 3px solid #10b981; }

/* 紧凑表头：单行 ~18px，右侧挂摘要提信息密度 */
.ob-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: none;
  min-height: 18px;
  line-height: 18px;
}
.ob-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  white-space: nowrap;
}
.ob-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
}
.ob-profile .ob-dot { background: #1a6fff; }
.ob-stat .ob-dot { background: #7c3aed; }
.ob-open .ob-dot { background: #10b981; }
.ob-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
}
.ob-meta.warn { color: #b91c1c; }
.ob-count {
  flex: none;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: #d1fae5;
  color: #047857;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
.ob-count.empty {
  background: #f3f4f6;
  color: #9ca3af;
}

.ob-body, .ob-stat-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.p-name-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.p-name { font-size: 16px; font-weight: 700; color: #111827; }
.p-phone-row { display: flex; align-items: center; gap: 6px; }
.p-phone { font-size: 14px; font-weight: 600; color: #1a6fff; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
.icon-btn { border: none; background: none; padding: 0 2px; cursor: pointer; color: #9ca3af; font-size: 12px; line-height: 1; }
.icon-btn:hover { color: #1a6fff; }
.call-btn {
  margin-left: auto;
  height: 24px;
  padding: 0 10px;
  border: 1px solid #1a6fff;
  border-radius: 4px;
  background: #fff;
  color: #1a6fff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.call-btn:hover { background: #1a6fff; color: #fff; }
.p-contacts { display: flex; gap: 10px; flex-wrap: wrap; }
.ct-way { font-size: 11px; color: #4b5563; display: inline-flex; align-items: baseline; gap: 4px; }
.ct-way em { font-style: normal; color: #9ca3af; }

.p-fields { display: flex; gap: 4px 14px; margin: 0; flex-wrap: wrap; }
.p-fields > div { display: flex; align-items: baseline; gap: 4px; min-width: 0; }
.p-fields > div.full { flex: 1 1 100%; }
.p-fields dd { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.buy-block { display: flex; flex-direction: column; gap: 3px; }
.buy-head { font-size: 11px; font-weight: 600; color: #6b7280; }
.buy-head b { color: #b91c1c; }
.buy-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  width: 100%;
  text-align: left;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid #fecaca;
  border-radius: 4px;
  padding: 3px 7px;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.15s, background 0.15s;
}
.buy-item:hover { background: #fff5f5; border-color: #fca5a5; }
.buy-name { font-size: 11px; font-weight: 600; color: #111827; }
.buy-cnt {
  font-size: 10px; font-weight: 700; color: #b91c1c;
  background: #fee2e2; border-radius: 3px; padding: 0 5px; line-height: 16px;
}
.buy-sn { font-size: 10px; color: #9ca3af; font-family: ui-monospace, monospace; }
.buy-wr { font-size: 10px; font-weight: 600; margin-left: auto; white-space: nowrap; }
.p-fields dt { margin: 0; font-size: 11px; color: #9ca3af; }
.p-fields dd { margin: 0; font-size: 11px; color: #374151; font-weight: 500; }
.wr-in { color: #10b981; }
.wr-out { color: #ef4444; }

.role-tag { font-size: 11px; font-weight: 700; border-radius: 4px; padding: 1px 6px; white-space: nowrap; }
.mini-tag { font-size: 11px; font-weight: 500; color: #1d4ed8; background: #eff6ff; border-radius: 4px; padding: 1px 6px; }

.stat-grid { display: flex; flex-direction: column; gap: 6px; flex: none; }
.stat-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.stat-item {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  padding: 5px 6px;
  border: 1px solid #e8e4f8;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  min-width: 0;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.stat-item:hover { border-color: #7c3aed; background: #fff; box-shadow: 0 2px 6px rgba(124, 58, 237, 0.12); }
.si-label { font-size: 12px; color: #6b7280; flex: none; }
.si-value { font-size: 15px; font-weight: 700; color: #1a6fff; line-height: 1; }
.si-unit { font-size: 11px; font-weight: 500; color: #9ca3af; margin-left: 1px; }
.stat-item.warn { border-color: #fcd34d; background: #fffbeb; }
.stat-item.warn .si-value { color: #d97706; }
.stat-item.warn:hover { border-color: #d97706; }

.open-item { padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px dashed #f0f0f0; }
.open-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.open-item.hit { background: rgba(26, 111, 255, 0.06); border-radius: 4px; padding: 4px 6px 8px; }
.oi-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 3px; }
.oi-pri { font-size: 11px; font-weight: 700; color: #6b7280; }
.oi-pri.urgent { color: #ef4444; }
.oi-title { margin: 0; flex: 1 1 100%; font-size: 12px; font-weight: 600; color: #111827; line-height: 1.5; }
.oi-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; font-size: 11px; color: #6b7280; }
.oi-no {
  margin: 0; padding: 0; border: none; background: none;
  font-family: ui-monospace, monospace; font-size: 11px; font-weight: 600; color: #1a6fff; cursor: pointer;
}
.oi-no:hover { text-decoration: underline; }
.oi-when { margin-left: auto; font-size: 10px; color: #9ca3af; white-space: nowrap; }
.oi-flag { margin-top: 3px; font-size: 10px; font-weight: 600; color: #b91c1c; }

.hit-panel { border-top: 3px solid #1a6fff; }
.hit-body { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; }
.hit-line1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hit-title { margin: 0; font-size: 15px; font-weight: 600; color: #111827; }
.hit-pri { font-size: 12px; font-weight: 700; color: #ef4444; }
.hit-no { font-family: ui-monospace, monospace; font-size: 12px; color: #6b7280; margin-left: auto; }
.hit-fields { display: flex; gap: 16px; margin: 0; flex-wrap: wrap; }
.hit-fields > div { display: flex; align-items: baseline; gap: 4px; }
.hit-fields dt { margin: 0; font-size: 11px; color: #9ca3af; }
.hit-fields dd { margin: 0; font-size: 12px; color: #374151; font-weight: 500; }
.hit-chain { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; font-size: 11px; color: #7c3aed; }
.hit-sum { margin: 0; font-size: 12px; color: #4b5563; line-height: 1.65; background: #f8fafc; border-radius: 6px; padding: 8px 10px; }
.open-btn {
  flex: none;
  height: 26px;
  padding: 0 12px;
  border: 1px solid #1a6fff;
  border-radius: 4px;
  background: #1a6fff;
  color: #fff;
  font-size: 12px; font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.open-btn:hover { background: #1560e0; }

/* ---- 主体 Tab ---- */
.body-panel { padding: 0; overflow: hidden; }
.body-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #e5e6eb;
  padding: 0 8px;
  background: #fafbfc;
}
.body-tab {
  position: relative;
  height: 42px;
  padding: 0 14px;
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.body-tab:hover { color: #111827; }
.body-tab.active {
  color: #1a6fff;
  font-weight: 700;
}
.body-tab.active::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 0;
  height: 2px;
  background: #1a6fff;
  border-radius: 2px 2px 0 0;
}
.tab-count {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  background: #f3f4f6;
  border-radius: 8px;
  padding: 0 6px;
  line-height: 18px;
}
.body-tab.active .tab-count {
  color: #1a6fff;
  background: #eff6ff;
}
.tab-pane {
  min-height: 280px;
  max-height: min(560px, calc(100vh - 360px));
  overflow-y: auto;
  padding: 12px 14px 16px;
}

.chip-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; align-items: center; }
.to-list {
  margin-left: auto;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.to-list:hover { border-color: #1a6fff; color: #1a6fff; }
.tl-ic { font-size: 10px; }
.chip {
  padding: 3px 10px; border-radius: 4px; border: none;
  background: #f3f4f6; color: #6b7280;
  font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit;
}
.chip.active { background: #eff6ff; border: 1px solid #1a6fff; color: #1a6fff; font-weight: 600; }
.chip.product-chip { border-color: #fca5a5; background: #fef2f2; color: #b91c1c; }

.hist-list { display: flex; flex-direction: column; gap: 10px; }
.hist-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
}
.hist-card.is-aftersale { border-style: dashed; }
.hist-card.hit { border-color: #1a6fff; box-shadow: 0 0 0 3px rgba(26, 111, 255, 0.12); }
.hc-top { display: flex; align-items: center; gap: 8px; min-height: 22px; }
.hc-title { margin: 0; flex: 1; min-width: 0; font-size: 13px; font-weight: 600; color: #111827; line-height: 18px; }
.hc-date { flex: none; font-size: 11px; color: #9ca3af; white-space: nowrap; font-variant-numeric: tabular-nums; }
.st-tag {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; line-height: 1; padding: 3px 8px; border-radius: 4px; white-space: nowrap;
}
.src-tag { flex: none; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; color: #0e7490; background: #cffafe; }
.hc-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; color: #6b7280; }
.hc-no {
  margin: 0; padding: 0; border: none; background: none;
  font-family: ui-monospace, monospace; font-size: 12px; font-weight: 600; color: #1a6fff; cursor: pointer;
}
.hc-no:hover { text-decoration: underline; }
.hc-no.plain { color: #6b7280; cursor: default; }
.hc-no.plain:hover { text-decoration: none; }
.no-ext { margin-left: 3px; font-size: 10px; }
.sep { color: #d1d5db; }
.ty-tag { flex: none; display: inline-flex; align-items: center; font-size: 10px; font-weight: 600; line-height: 14px; padding: 1px 6px; border-radius: 3px; }
.flag { font-size: 10px; font-weight: 600; border-radius: 3px; padding: 1px 6px; }
.flag.danger { color: #b91c1c; background: #fee2e2; }
.flag.muted { color: #6b7280; background: #f3f4f6; }
.hc-chain { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: #7c3aed; }
.chain-danger { color: #b91c1c; font-weight: 600; }
.hc-sum { margin: 0; font-size: 12px; color: #6b7280; line-height: 18px; }

.ct-list, .as-list, .sv-list { display: flex; flex-direction: column; gap: 10px; }
.ct-item, .sv-item { border-bottom: 1px solid #f3f4f6; padding-bottom: 10px; }
.ct-item:last-child, .sv-item:last-child { border-bottom: none; padding-bottom: 0; }
.ct-top { display: flex; align-items: center; gap: 6px; }
.ct-ic { color: #1a6fff; font-size: 12px; }
.ct-kind { font-size: 11px; font-weight: 600; color: #374151; }
.ct-when { margin-left: auto; font-size: 11px; color: #9ca3af; font-variant-numeric: tabular-nums; }
.ct-meta { font-size: 11px; color: #9ca3af; margin-top: 2px; }
.ct-sum { margin: 4px 0 0; font-size: 12px; color: #4b5563; line-height: 18px; }
.ct-no { font-size: 10px; color: #9ca3af; font-family: ui-monospace, monospace; }

.as-item { display: block; border: 1px solid #eef2f7; border-radius: 8px; padding: 8px 10px; text-decoration: none; }
.as-item:hover { border-color: #bfdbfe; background: #f8fbff; }
.as-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.as-no { font-size: 12px; font-weight: 600; color: #1a6fff; font-family: ui-monospace, monospace; }
.as-status { font-size: 10px; font-weight: 600; border-radius: 3px; padding: 1px 6px; }
.as-status.done { color: #047857; background: #d1fae5; }
.as-status.doing { color: #1d4ed8; background: #dbeafe; }
.as-meta { font-size: 11px; color: #9ca3af; margin-top: 3px; }
.as-sum { margin: 4px 0 0; font-size: 12px; color: #4b5563; line-height: 18px; }
.as-from { font-size: 10px; color: #9ca3af; }

.sv-top { display: flex; align-items: center; gap: 8px; }
.sv-no { font-size: 12px; color: #374151; font-family: ui-monospace, monospace; }
.sv-score { margin-left: auto; font-size: 11px; font-weight: 700; border-radius: 4px; padding: 1px 7px; }
.sv-score.pending { color: #9ca3af; background: #f3f4f6; }
.sv-when { font-size: 11px; color: #9ca3af; margin-top: 2px; }
.sv-cm { margin: 4px 0 0; font-size: 12px; color: #4b5563; line-height: 18px; }

@media (max-width: 1100px) {
  .overview-band { flex-wrap: wrap; }
  .ob-cell { flex: 1 1 320px; height: auto; min-height: 140px; max-height: 200px; }
}
</style>
