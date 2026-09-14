<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { TeamOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import { useUserStore } from '@/stores/user';
import { useRiskQueueStore } from '@/stores/riskQueue';
import { useRiskPoolStore } from '@/stores/riskPool';
import { useRiskCollabStore, RISK_ADVICE_ITEMS, type RiskAdviceItem } from '@/stores/riskCollab';
import { useRiskReportStore } from '@/stores/riskReports';
import { useRiskTagStore } from '@/stores/riskTags';
import { isPooledStatus } from '@/stores/riskShared';
import { isRiskTicketEnded } from '@/composables/useRiskReportAssess';
import { resolveTicketRowFor } from '@/views/tickets/composables/opActions';
import { riskLevelText } from '@/config/risk';

/**
 * **协同处理**（底栏那一枚按钮的第三形态，基线 ※29；同时是 §2 / §4 的第 28 个动作）。
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

const user = useUserStore();
const queue = useRiskQueueStore();
const pool = useRiskPoolStore();
const collab = useRiskCollabStore();
const reportStore = useRiskReportStore();
const riskTags = useRiskTagStore();

const opinion = ref('');
const advices = ref<RiskAdviceItem[]>([]);
const otherAdvice = ref('');
const tried = ref(false);

const adviceOptions = RISK_ADVICE_ITEMS.map((v) => ({ label: v, value: v }));
const needsOther = computed(() => advices.value.includes('其他'));

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    opinion.value = '';
    advices.value = [];
    otherAdvice.value = '';
    tried.value = false;
  },
);

watch(needsOther, (v) => {
  if (!v) otherAdvice.value = '';
});

const missOpinion = computed(() => tried.value && !opinion.value.trim());
const missOther = computed(() => tried.value && needsOther.value && !otherAdvice.value.trim());

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

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function onOk() {
  // 弹窗开着期间原单可能已结束；判据与三个评估入口同一份（isRiskTicketEnded）
  if (isRiskTicketEnded(props.ticketNo)) {
    message.warning('本单已结束，无法协同处理');
    return;
  }
  tried.value = true;
  if (!opinion.value.trim()) return;
  if (needsOther.value && !otherAdvice.value.trim()) return;

  const entry = poolEntry.value;
  if (!entry) {
    // 按钮的出现条件就是"本单在风险工单池里"，走到这里只可能是条目在弹窗开着的时候
    // 被人从池里撤了（改判无风险）。说清是哪一条挡住的，别给一句笼统的失败
    message.warning('本单已不在风险工单池中，无法提交协同处理');
    return;
  }

  const picked = RISK_ADVICE_ITEMS.filter((a) => advices.value.includes(a));
  /**
   * 「首次协同转已结论」由 store 判：`coordinate` 只在条目**还在队**时改状态，
   * 第二次及以后只追加记录。判据留在 store 里，是因为"还在不在队"是条目自己的状态，
   * 弹窗这边拿到的那份是渲染用的快照，隔着一次异步就可能不是最新的。
   */
  const firstTime = !entry.coordination;
  const ok = pool.coordinate(entry.id, {
    opinion: opinion.value.trim(),
    advices: [...picked],
    ...(needsOther.value ? { otherAdvice: otherAdvice.value.trim() } : {}),
    by: user.name || '当前用户',
    byRole: user.role.name || '客诉专员',
    at: nowStamp(),
  });
  if (!ok) {
    message.warning('本单已不在风险工单池中，无法提交协同处理');
    return;
  }

  /*
   * 这里**没有**通知那一步：本轮不往消息体系里加新事件（2026-09-10 口径变更），
   * 故建议事项只落在工单上、等当前处理人自己打开这张单时读到。见文件头的说明。
   */
  const adviceText = picked.length
    ? picked.map((a) => (a === '其他' ? `其他（${otherAdvice.value.trim()}）` : a)).join('、')
    : '未勾选建议事项';

  close();
  // 首次协同同时把池内条目结掉，这一步要在提示里说出来——否则客诉专员不知道
  // 自己刚刚把这条从待处理队列里摘走了，还会回池里再找一遍
  const tail = firstTime ? '，本单风险条目已转「已结论」' : '';
  message.success(
    picked.length ? `已提交协同处理，建议事项：${adviceText}${tail}` : `已提交协同处理${tail}`,
  );
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="协同处理"
    :icon="TeamOutlined"
    tone="primary"
    :width="520"
    ok-text="提交"
    @update:open="emit('update:open', $event)"
    @ok="onOk"
    @cancel="close"
  >
    <div class="op-form">
      <p class="rc-sub">
        工单 {{ ticketNo }}<template v-if="ticketTitle"> · {{ ticketTitle }}</template>
      </p>
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

      <div class="op-field">
        <div class="op-label req">评估意见</div>
        <a-textarea
          v-model:value="opinion"
          :rows="4"
          :status="missOpinion ? 'error' : undefined"
          placeholder="写清这张单当前的风险判断，以及要处理人怎么调整处理方式…"
        />
        <p v-if="missOpinion" class="field-err">请填写评估意见</p>
      </div>

      <div class="op-field">
        <div class="op-label">建议事项</div>
        <a-checkbox-group v-model:value="advices" :options="adviceOptions" class="rc-advices" />
      </div>

      <div v-if="needsOther" class="op-field">
        <div class="op-label req">「其他」的具体建议</div>
        <a-input
          v-model:value="otherAdvice"
          :status="missOther ? 'error' : undefined"
          placeholder="一句话说清要处理人做什么"
        />
        <p v-if="missOther" class="field-err">请填写「其他」的具体建议</p>
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
.rc-advices { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; }
.field-err {
  margin: 0;
  font-size: 11px;
  color: #ef4444;
  line-height: 1.3;
}
</style>
