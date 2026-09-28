<script setup lang="ts">
import { computed, watch } from 'vue';
import { TeamOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import RiskCollabFields from './RiskCollabFields.vue';
import { useRiskQueueStore } from '@/stores/riskQueue';
import { useRiskCollabStore } from '@/stores/riskCollab';
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
 * 期间不往里加新事件。代价是这条评估意见**没有主动触达**：当前处理人只有自己打开这张单、
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
    if (v) ctl.reset();
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

const tagLine = computed(() => {
  const tag = poolEntry.value?.tag;
  if (!tag) return '';
  return `${riskLevelText(tag.result === '无风险' ? null : tag.result)} · ${tag.by}（${tag.byRole}）· ${tag.at}`;
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
  const lv = t.result === '无风险' ? '无风险' : riskLevelText(t.result);
  return `预警词命中 ${v.hitCount} 条 · 命中待核实；风险打标已判「${lv}」`;
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
    :icon="TeamOutlined"
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
        <span v-if="tagLine" class="rc-head-pair">
          <span class="rc-head-label">风险打标</span>
          <span class="rc-head-value rc-head-warn">{{ tagLine }}</span>
        </span>
      </div>

      <!-- 「本单另有」：三行痕迹。不摆这一段，协同人得先翻三个 Tab 才知道这单被处置过几轮 -->
      <ul class="rc-context">
        <li>{{ hitSummary }}</li>
        <li>{{ reportSummary }}</li>
        <li>{{ collabSummary }}</li>
      </ul>

      <!-- 三项字段走共享组件：工单页页头「风险管控」弹窗的投诉支渲染的是同一份 -->
      <RiskCollabFields :ctl="ctl" />
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
.rc-head-warn { color: #c2410c; }
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
</style>
