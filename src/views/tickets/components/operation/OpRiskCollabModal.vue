<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { TeamOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import { useUserStore } from '@/stores/user';
import { useRiskQueueStore } from '@/stores/riskQueue';
import { useRiskReportStore } from '@/stores/riskReports';
import { useRiskTagStore } from '@/stores/riskTags';
import { isPooledStatus } from '@/stores/riskShared';
import {
  RISK_ADVICE_ITEMS,
  recordRiskCollab,
  resolveTicketRowFor,
  riskCollabOf,
  type RiskAdviceItem,
} from '@/views/tickets/composables/opActions';
import { riskLevelText } from '@/config/risk';

/**
 * **协同处理**（底栏那一枚按钮的第三形态，基线 ※29；同时是 §2 / §4 的第 28 个动作）。
 *
 * 一个动作 + 多选建议项：客诉专员对风险工单池里的**投诉单**给一次意见与建议。
 * 提交后发生**两件事**，除此之外工单一格不动：
 *   ① 落工单处理履历（由工单页从协同记录投影，见 TicketOperationView 的 syncCollabTimeline）；
 *   ② 工单上挂**建议标记**（历次勾选项的并集，见 opActions.ts 的 riskAdviceMarksOf）。
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
  const tail = v.latest ? `最近一次结论 ${riskLevelText(v.latest.level ?? null)}` : '尚无核实结论';
  return `预警词命中 ${v.hitCount} 条 · ${tail}`;
});
const reportSummary = computed(() => {
  const list = reportStore.reportsOf(props.ticketNo).filter((r) => r.source === '二线报备');
  if (!list.length) return '无历史风险报备';
  const done = list.filter((r) => r.status === '已评估').length;
  return `历史风险报备 ${list.length} 条 · 已出结论 ${done} 条`;
});
const collabSummary = computed(() => {
  const list = riskCollabOf(props.ticketNo);
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
  tried.value = true;
  if (!opinion.value.trim()) return;
  if (needsOther.value && !otherAdvice.value.trim()) return;

  const picked = RISK_ADVICE_ITEMS.filter((a) => advices.value.includes(a));
  const at = nowStamp();
  recordRiskCollab({
    ticketNo: props.ticketNo,
    opinion: opinion.value.trim(),
    advices: [...picked],
    ...(needsOther.value ? { otherAdvice: otherAdvice.value.trim() } : {}),
    by: user.name || '当前用户',
    byRole: user.role.name || '客诉专员',
    at,
  });

  /*
   * 这里**没有**通知那一步：本轮不往消息体系里加新事件（2026-09-10 口径变更），
   * 故建议事项只落在工单上、等当前处理人自己打开这张单时读到。见文件头的说明。
   */
  const adviceText = picked.length
    ? picked.map((a) => (a === '其他' ? `其他（${otherAdvice.value.trim()}）` : a)).join('、')
    : '未勾选建议事项';

  close();
  message.success(picked.length ? `已提交协同处理，建议事项：${adviceText}` : '已提交协同处理');
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
