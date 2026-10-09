<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { SafetyCertificateOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import RiskCollabFields from './RiskCollabFields.vue';
// 风险等级段与另外六处「风险管控」弹窗共用同一份呈现；本处是**只读回显**（2026-10-08 拍板）
import RiskLevelFields from './RiskLevelFields.vue';
import { makeRiskLevelFieldsView } from '@/composables/useRiskLevelFields';
import { formatOpTime } from '@/views/tickets/utils/opTime';
import { useRiskQueueStore } from '@/stores/riskQueue';
import { useRiskCollabStore, type RiskCollabRecord } from '@/stores/riskCollab';
import { useRiskReportStore } from '@/stores/riskReports';
import { useRiskTagStore } from '@/stores/riskTags';
import { isPooledStatus } from '@/stores/riskShared';
import { useRiskCollabFields } from '@/composables/useRiskCollabFields';
import { resolveTicketRowFor } from '@/views/tickets/composables/opActions';
import { riskLevelText } from '@/config/risk';

/**
 * **协同处理**（风险工单池里投诉单那一路的工作面，基线 ※29；同时是 §2 / §4 的第 28 个动作）。
 *
 * 🔴 **字段与落库走共享件**（`useRiskCollabFields` + `RiskCollabFields.vue`）：
 * 工单处理页页头「风险管控」弹窗的投诉支用的是同一份，两处不各写一套。
 * 本文件只剩"这张单现在什么情况"那几段抬头与主按钮壳。
 *
 * 🔴 **抬头也与那一枚同口径**：标题「风险管控」+ 副标题「来源 · 单号」。
 * 「协同处理」是这个动作在规格里的名字，不是弹窗抬头 —— 同一个动作在两个入口上
 * 写两个抬头，人会以为自己点开的是两件事。
 *
 * 一个动作 + 多选建议项：客诉专员对风险工单池里的**投诉单**给一次意见与建议。
 * 提交后发生**三件事**，除此之外工单一格不动：
 *   ① 落工单处理履历（《【720】》第八类「风险结论」）—— **落库在 `stores/riskPool.ts`
 *      的 `coordinate` 里**，走第八类唯一的落库口 `riskHistory.recordRiskHistory`；
 *      工单页只负责把记录投影成履历条目（`TicketOperationView` 的 `syncRiskTimeline`）；
 *   ② 工单上挂**建议标记**（历次勾选项的并集，见 `stores/riskCollab.ts` 的 `marksOf`）；
 *   ③ **首次协同把池内条目转「已结论」**（`stores/riskPool.ts` 的 `coordinate`）——
 *      同一张投诉单可协同多次，但"还没有结论"这件事只成立到第一次为止。
 *
 * 🔴 **本轮不发通知**（2026-09-10 业务口径变更）：《【930】》§5C.3 原定的第三个副作用
 * 「通知当前处理人（`risk.coordinated`）」**本轮不做** —— 现有消息体系要先整体重新梳理，
 * 期间不往里加新事件。代价是这条处理意见**没有主动触达**：当前处理人只有自己打开这张单、
 * 看到页头的建议标记或本 Tab 的「协同记录」块，才知道有人给过意见。这是已知取舍，不是遗漏。
 *
 * 🔴 **工单状态不变、处理人不变**：本组件一个字都不往 `TicketDetailMeta` 上写。
 * 也不拉回处理节点、不计看板「被催补数」、不通知客户。
 */
const props = defineProps<{
  open: boolean;
  ticketNo: string;
  ticketTitle?: string;
}>();

const emit = defineEmits<{ 'update:open': [v: boolean] }>();

const queue = useRiskQueueStore();
const collab = useRiskCollabStore();
const reportStore = useRiskReportStore();
const riskTags = useRiskTagStore();

/** 三项字段 + 校验 + 落库：与工单页页头「风险管控」弹窗同一份共享件 */
const ctl = useRiskCollabFields();

watch(
  () => props.open,
  (v) => {
    if (v) {
      ctl.reset();
      // 展开态归零：上一单展开过、这一单一进来就是展开的，与标记那两块同一条规矩
      collabTraceOpen.value = false;
    }
  },
);

/* ---------------- 头部：这张单现在是什么情况 ---------------- */

const ticket = computed(() => resolveTicketRowFor(props.ticketNo));
/**
 * 当前处理人 —— 建议事项最后是**他**去执行，头部先摆出来。
 * 本轮不发通知（见文件头），故这一栏同时是一句提醒：写的这些意见没有推送，
 * 要靠他自己打开这张单看到。
 */
const handler = computed(() => ticket.value?.assignee ?? '');

/** 本单在风险工单池里的那条 A 线条目（一张单至多一条，§3.1） */
const poolEntry = computed(
  () => queue.entriesOf(props.ticketNo).find((e) => isPooledStatus(e.status)) ?? null,
);
/**
 * 副标题 ＝ **来源 · 单号**（如「实时监控 · IFLYZX-…」），与工单处理页页头那一枚
 * 「风险管控」弹窗（`OpRiskControlModal.vue`）逐字同口径 —— 同一个动作在两个入口上
 * 不能有两个抬头。来源取条目自带的 `source`，不另造词；条目一时取不到就只写单号。
 */
const subtitle = computed(() => {
  const src = poolEntry.value?.source;
  return src ? `${src} · ${props.ticketNo}` : props.ticketNo;
});

/**
 * 抬头那一对现在**只剩"谁标的、什么时候"** —— 等级与风险备注已移进下面那个共用段
 * （2026-10-08 用户拍板「等级段接进来，只读回显」）。
 * 🔴 两处别再各写一遍：等级留在抬头、下面又摆一份，就是同屏两个「中危」。
 * 时刻走 `formatOpTime`，与 `RiskAssessSheet` 的〔标记时间〕同一个写法（分钟精度源补 `:00`）。
 */
const tagMeta = computed(() => {
  const tag = poolEntry.value?.tag;
  if (!tag) return '';
  return `${tag.by}（${tag.byRole}）· ${formatOpTime(tag.at)}`;
});

/**
 * **风险等级段 · 只读回显**（2026-10-08 用户拍板）。
 *
 * 🔴 **本处与另外六处「风险管控」弹窗共用 `RiskLevelFields` 的同一份呈现** ——
 * 在此之前本弹窗把等级写成抬头上一行灰色文字，而同一个动作在工单处理页页头的投诉支
 * 走的是共用件，同为投诉支「风险管控」却长成两样。
 *
 * 🔴 **只读、不落库**：这一路的工作是**协同处理**（给处理意见与建议事项），
 * 不是改判。要改等级走「已判」段条目表那一枚「风险管控」或工单页页头那一枚
 * —— 那两处才带落库路径（`recordTag` / `recordTagFor`）。故 setter 给空函数：
 * 接口不为只读态分叉，但本处**没有**写库的口子，将来也不许从这里加。
 *
 * `visible` 判的是"有没有结论可回显"：本单还没有标记结论时整段不出
 * （那时抬头的 `tagMeta` 同样为空，一屏不会只剩一个孤零零的标签）。
 */
const tagLevelView = makeRiskLevelFieldsView({
  getLevel: () => poolEntry.value?.tag?.result ?? '',
  setLevel: () => {},
  getNote: () => poolEntry.value?.tag?.note ?? '',
  setNote: () => {},
  visible: computed(() => !!poolEntry.value?.tag),
  isAmend: computed(() => false),
  required: computed(() => false),
  missLevel: computed(() => false),
  missNote: computed(() => false),
  noRiskLocked: computed(() => false),
  readonly: computed(() => true),
});

/* ---------------- 「本单另有」：一屏交代还有哪些痕迹（§5C.2） ---------------- */

const hitSummary = computed(() => {
  const v = riskTags.ticketVerificationOf(props.ticketNo);
  if (!v || !v.hitCount) return '无预警词命中';
  if (v.latest) return `预警词命中 ${v.hitCount} 条 · 最近一次结论 ${riskLevelText(v.latest.level ?? null)}`;
  /*
   * 🔴 **命中没核实 ≠ 这张单没有结论**：命中核实与风险打标是两条线（前者判"这次命中准不准"，
   * 后者判"这张单有没有风险、多大"）。打完标之后命中确实仍是待核实，但结论已经有了 ——
   * 一句「尚无核实结论」会与本弹窗头部紧挨着的「风险打标 中危」在同一屏上互相打脸。
   *
   * ⚠️ **这是同一句话的第三处**，另两处在 `tabs/OpRiskMonitorTab.vue` 与
   * `OpSupplementChipPanels.vue`，上一轮只改了那两处、漏了这一处。三处一律走
   * `riskQueue.currentTagOf` 这**同一个读口**（它就是为收掉重复判断而加的），
   * 不要在任何一处再抄一份 `entriesOf(...).find(e => !!e.tag)`。
   */
  const t = queue.currentTagOf(props.ticketNo);
  if (!t) return `预警词命中 ${v.hitCount} 条 · 尚无核实结论`;
  /*
   * 🔴 **这一支只说命中那一半**（2026-10-08，与 `tabs/OpRiskMonitorTab.vue` 那次同一个改法）：
   * 原来这里还接着「；风险等级已判「X」」—— 上面那段注释担心的"打完标的单被写成
   * 『尚无核实结论』"不会发生，因为这一支的前提就是 `t` 存在；而**它的结论现在由紧挨着的
   * 只读等级段负责说**，再写一遍就是同屏两个「中危」。
   */
  return `预警词命中 ${v.hitCount} 条 · 命中待核实`;
});
const reportSummary = computed(() => {
  const list = reportStore.reportsOf(props.ticketNo).filter((r) => r.source === '二线报备');
  if (!list.length) return '无历史风险报备';
  const done = list.filter((r) => r.status === '已评估').length;
  return `历史风险报备 ${list.length} 条 · 已出结论 ${done} 条`;
});
const collabSummary = computed(() => {
  const list = collab.recordsOf(props.ticketNo);
  if (!list.length) return '本单尚未协同处理过';
  return `已协同 ${list.length} 次 · 最近一次 ${list[0].at}`;
});

/* ---------------- 协同记录：历次给过什么意见（2026-10-09 用户拍板「补，与标记那一路同形」） ---------------- */
/*
 * 🔴 **补这一块是因为这一路可多次协同、却一点历史都看不到**：上面「本单另有」那一行
 * 只报 `已协同 N 次 · 最近一次 <时刻>`，**报数不报内容** —— 第二次协同的人看不到
 * 上次给了什么建议，只能凭空再给一遍。记录本来就在 `stores/riskCollab.ts` 里存着
 * （`recordsOf`），缺的只是把它摆出来。
 *
 * 🔴 **与风险监控页「标记记录 / 修正记录」两块同形的是「壳」，不是正文**（用户原话
 * 「风格保持一致」指的就是外观这一层）。**壳这六项逐项同形**：
 *   ① 整块的出现条件（`v-if="…History.length"`，一条也照摆、只是不给展开按钮）；
 *   ② 类名（`.tag-trace` / `.tag-trace-head` / `.tag-trace-n` / `.tag-trace-more`
 *      / `.tt-line` / `.tag-trace-list` / `.tt-*`）与那一份 CSS 规则；
 *   ③ 块头的「`N 条`」条数常驻；
 *   ④ **`> 1 条` 才出**「展开全部 / 收起」；
 *   ⑤ 默认一行、过长省略号、**整段历史挂该行 `title`**（一条一行）；
 *   ⑥ 展开态的 `<ol> / <li>` 三行结构（head 一行 + 正文一行 + 尾巴一行）。
 * 样式类名虽同，规则仍得在本文件再写一份 —— 两边 `<style scoped>` 各作用域，
 * **不是重复代码没清掉，是 scoped 的必然**。
 *
 * ⚠️ **本块只读**：`stores/riskCollab.ts` 的写入一个字没动，这里只调 `recordsOf`。
 *
 * 🔴 **正文与序号规则共四处不同，都是有意的，别照着标记那两块"对齐"回去**：
 *
 *   ㈠ **取数方向**：`recordsOf` 给的是**倒序**（最近在最上），本块 `.reverse()` 翻成正序；
 *      标记那两块本来就是正序。翻过来才能让 `.tt-item:last-child` 那条主色边
 *      落在**最近一次**上，与那两块看齐。
 *
 *   ㈡ **次条用词**：本块写「第 N 次**协同**」，那两块写「第 N 次**修正**」。
 *      协同的多次之间**不是互相修正的关系**：`riskCollab.ts` 的 `marksOf` 注释写明
 *      「第二次协同只勾了『每日跟进』并不表示第一次的『法务协同』已经不必做了」，
 *      建议标记取的是历次**并集**而非最后一次。写成「修正」＝ 说后一次推翻了前一次，是错的。
 *
 *   ㈢ 🔴 **序号基数不同，同一个 `i` 两边差 1**：本块 `i = 1 → 「第 2 次协同」`
 *      （`i + 1`，**含首次一起数**，因为每一次都是独立的一次协同）；
 *      那两块 `i = 1 → 「第 1 次修正」`（**不含首次**，首次是打标、之后才算修正）。
 *      两种数法各自对，**不要拿一边的公式去改另一边**。
 *
 *   ㈣ **正文与尾巴前缀不同**：本块正文 ＝ 建议事项 `join('/')`（一项未勾写「仅处理意见」）、
 *      尾巴前缀 **`意见：`**；那两块正文走 `traceChangeText`（结论或与上条的差）、
 *      尾巴前缀 **`备注：`**。字段本就不是同一批，没法也不该写成同一句。
 */
const collabHistory = computed(
  // `recordsOf` 给的是**倒序**（最近在最上）；这里翻成正序，与标记那两块一致：
  // 首条在最上、末条即最近一次，`.tt-item:last-child` 那条主色边才落在最近一次上
  () => collab.recordsOf(props.ticketNo).slice().reverse(),
);
const collabTraceOpen = ref(false);
/** 这一次给了什么 ＝ 建议事项（勾了「其他」的把具体建议接在后面）；一项都没勾就说只给了意见 */
function collabWhat(r: RiskCollabRecord): string {
  const items = r.advices.map((a) => (a === '其他' && r.otherAdvice ? `其他：${r.otherAdvice}` : a));
  return items.length ? items.join('/') : '仅处理意见';
}
function collabStepText(i: number): string {
  return i > 0 ? `第 ${i + 1} 次协同` : '首次协同';
}
/** 一行态的正文 ＝ 最近一次。处理意见接在末尾，过长由 CSS 省略、全文走 title */
const collabLastLine = computed(() => {
  const list = collabHistory.value;
  const r = list[list.length - 1];
  if (!r) return '';
  return [collabWhat(r), r.by, r.byRole, r.at, r.opinion ? `意见：${r.opinion}` : '']
    .filter(Boolean).join(' · ');
});
/** 悬停全文 ＝ 整段历史，一条一行。一行态把其余几条收起来了，这里必须一条都不少 */
const collabAllText = computed(
  () => collabHistory.value
    .map((r, i) => [collabStepText(i), collabWhat(r), r.by, r.byRole, r.at,
      r.opinion ? `意见：${r.opinion}` : ''].filter(Boolean).join(' · '))
    .join('\n'),
);

function close() {
  emit('update:open', false);
}

/** 校验、落库与提示全在共享件里（`submitTo`），本处只负责落成之后关窗 */
function onOk() {
  if (ctl.submitTo(props.ticketNo)) close();
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="风险管控"
    :subtitle="subtitle"
    :icon="SafetyCertificateOutlined"
    tone="primary"
    :width="520"
    ok-text="提交"
    @update:open="emit('update:open', $event)"
    @ok="onOk"
    @cancel="close"
  >
    <div class="op-form">
      <!-- 单号已在抬头副标题里（来源 · 单号），体内只补标题，不再写第二遍单号 -->
      <p v-if="ticketTitle" class="rc-sub">{{ ticketTitle }}</p>
      <div class="rc-head">
        <span class="rc-head-pair">
          <span class="rc-head-label">当前处理人</span>
          <span class="rc-head-value">{{ handler || '未认领' }}</span>
        </span>
        <span v-if="tagMeta" class="rc-head-pair">
          <span class="rc-head-label">标记人</span>
          <span class="rc-head-value">{{ tagMeta }}</span>
        </span>
      </div>

      <!-- 「本单另有」：三行痕迹。不摆这一段，协同人得先翻三个 Tab 才知道这单被处置过几轮 -->
      <ul class="rc-context">
        <li>{{ hitSummary }}</li>
        <li>{{ reportSummary }}</li>
        <li>{{ collabSummary }}</li>
      </ul>

      <!--
        ② 风险等级 —— 六处「风险管控」弹窗同一份共享件、同一种呈现，本处**只读回显**
        （2026-10-08 拍板）。段序与另几处一致：① 这张单什么情况 → ② 风险等级 → ③ 风险处理措施。
      -->
      <RiskLevelFields :ctl="tagLevelView" />

      <!-- ③ 风险处理措施：三项字段走共享组件，工单页页头「风险管控」弹窗的投诉支渲染的是同一份 -->
      <RiskCollabFields :ctl="ctl" />

      <!--
        ④ 协同记录：它是佐证不是填写项，按信息层级排在最后 —— 与风险监控页
        「标记记录 / 修正记录」两块同一个位置、同一套形态。只有一条时照摆这一行、
        只是不给展开按钮：那一条就是"上次给了什么建议"，正是再协同时要看的同屏依据。
      -->
      <div v-if="collabHistory.length" class="tag-trace">
        <div class="tag-trace-head">
          协同记录<span class="tag-trace-n">{{ collabHistory.length }} 条</span>
          <button
            v-if="collabHistory.length > 1"
            type="button" class="tag-trace-more"
            @click="collabTraceOpen = !collabTraceOpen"
          >{{ collabTraceOpen ? '收起' : '展开全部' }}</button>
        </div>
        <div v-if="!collabTraceOpen" class="tt-line" :title="collabAllText">
          <span class="tt-step">上次</span>{{ collabLastLine }}
        </div>
        <ol v-else class="tag-trace-list">
          <li v-for="(r, i) in collabHistory" :key="r.id" class="tt-item">
            <div class="tt-head">
              <span class="tt-step">{{ collabStepText(i) }}</span>
              <span class="tt-by">{{ r.by }}</span>
              <span class="tt-role">{{ r.byRole }}</span>
              <span class="tt-at">{{ r.at }}</span>
            </div>
            <div class="tt-change">{{ collabWhat(r) }}</div>
            <!-- 处理意见是这次协同的正文，没写的不占位（与标记那两块的「备注」同一条规矩） -->
            <div v-if="r.opinion" class="tt-reason">意见：{{ r.opinion }}</div>
          </li>
        </ol>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.rc-sub {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}
.rc-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}
.rc-head-pair { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.rc-head-label { color: #9ca3af; }
.rc-head-value { color: #374151; font-weight: 600; }
/* `.rc-head-warn` 已随抬头那一对里的等级移进共用段一并删除（2026-10-08） */
.rc-context {
  margin: 0;
  padding: 0 0 0 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  line-height: 1.6;
  color: #6b7280;
}

/*
 * 协同记录块。🔴 **与风险监控页「标记记录 / 修正记录」那两块逐字同一份规则** ——
 * 两边 `<style scoped>` 各自作用域，这一份不是没清掉的重复，是 scoped 的必然。
 * 🔴 改这里要连同 `views/ops-monitor/RiskMonitorView.vue` 里那一份一起改，
 * 否则同一个形态在两个弹窗上会长成两样（用户点过「风格保持一致」）。
 */
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
/* 「展开全部 / 收起」：排在条数之后、靠右，弱化成链接样，别和「提交」抢视线 */
.tag-trace-more {
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  font-size: 11px;
  color: #1a6fff;
  cursor: pointer;
}
.tag-trace-more:hover { text-decoration: underline; }
/* 一行态：整条压成单行，超出一律省略号，全文挂在这一行的 `title` 上 */
.tt-line {
  margin-top: 6px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
  color: #374151;
  line-height: 1.5;
  cursor: default;
}
.tt-line .tt-step { margin-right: 6px; font-size: 11px; }
.tag-trace-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tt-item { padding-left: 10px; border-left: 2px solid #e5e7eb; }
/* 末条即最近一次，用主色标出来，免得在一串历史里认错 */
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
.tt-role { padding: 0 5px; border-radius: 8px; background: #f3f4f6; color: #6b7280; }
.tt-at { font-variant-numeric: tabular-nums; }
.tt-change { margin-top: 2px; font-size: 12px; color: #374151; line-height: 1.5; }
.tt-reason { margin-top: 2px; font-size: 11px; color: #6b7280; line-height: 1.5; }
</style>
