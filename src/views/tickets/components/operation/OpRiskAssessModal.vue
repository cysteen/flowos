<script setup lang="ts">
import { computed, watch } from 'vue';
import { message } from 'ant-design-vue';
import { EditOutlined, PaperClipOutlined, RollbackOutlined, UserOutlined } from '@ant-design/icons-vue';
import OpActionModal from './OpActionModal.vue';
import { useRiskReportAssess } from '@/composables/useRiskReportAssess';
import { useRiskPoolStore } from '@/stores/riskPool';
import { useRiskReportStore } from '@/stores/riskReports';
import { useRiskTagStore } from '@/stores/riskTags';
import { useUserStore } from '@/stores/user';
import {
  REPORT_SOURCE,
  isOpenStatus,
  isPoolLevel,
  isVerifyMonitorSource,
  type RiskPoolItem,
} from '@/stores/riskShared';
import { riskLevelText } from '@/config/risk';
import type { RiskHit } from '@/mock/opsReport';
import {
  adviceLabelOf,
  advicePlaceholderOf,
  decisionText,
} from './OpRiskDecision';

/**
 * **风险评估**（底栏那一枚按钮的第二形态，基线 ※29）。
 *
 * 出现条件是"本单有**未出结论的非投诉单条目**"，条件由工单页算好（`showRiskReport`），
 * 本组件只负责：把那条条目**领过来**（若还没人领）→ 弹评估表单 → 提交结论。
 *
 * 🔴 **入口里没有「分派」这一步**（2026-09-10 拍板，「分派」一词整体作废）：两个池的条目
 * 只有「领取」，谁领谁办。从工单页进来的客诉专员就是那个要办的人，故这里**先自动领取
 * 再弹表单** —— 让他先跑一趟风险监控页点「领取」再回来，是把一次点击拆成三次页面跳转。
 */
const props = defineProps<{
  open: boolean;
  ticketNo: string;
  ticketTitle?: string;
}>();

const emit = defineEmits<{ 'update:open': [v: boolean] }>();

const user = useUserStore();
const pool = useRiskPoolStore();
const reportStore = useRiskReportStore();
const {
  ASSESS_DECISIONS,
  assessOpen,
  assessTarget,
  assessDecision,
  assessAdvice,
  missAssessDecision,
  missAssessAdvice,
  escalateHint,
  assessOthers,
  openAssess,
  confirmAssess,
} = useRiskReportAssess();

/** 本单**未出结论**的那条条目（至多一条：同单在队至多一条，基线 ※29） */
const target = computed<RiskPoolItem | null>(
  () => reportStore.reportsOf(props.ticketNo).find((r) => isOpenStatus(r.status)) ?? null,
);

/**
 * 打开：先把条目领到自己名下（已在自己名下的跳过这一步），再弹表单。
 *
 * 领取会往 `assessArrivalTicket` 写一笔（那是"领取后跳工单页自动弹评估"用的信号），
 * 这里**当场消费掉**——否则工单页「风险报备」Tab 会收到同一个信号再弹一次，
 * 屏幕上叠出两个一模一样的评估弹窗。
 */
watch(
  () => props.open,
  (v) => {
    if (!v) return;
    const t = target.value;
    if (!t) {
      message.warning('本单没有待评估的风险条目');
      emit('update:open', false);
      return;
    }
    // 存储值仍是「待分派」，界面写「待领取」（改名归风险 store 那一路，见 OpRiskDecision.ts）
    if (t.status === '待分派') {
      // 第三个实参是**领取那一刻的实际角色**，落在 `risk.report.claimed` 的正文落款上
      // （`riskPool.notifyClaimed`：不写死「客诉专员」，管理员兜底领取是常规路径）
      pool.claim(t.id, user.name || '当前用户', user.role.name);
      reportStore.consumeAssessArrival(props.ticketNo);
    }
    if (t.assignee !== (user.name || '当前用户')) {
      message.warning(`本条已由 ${t.assignee} 领取，请由领取人给出结论`);
      emit('update:open', false);
      return;
    }
    openAssess(t);
  },
);

/** 内部表单关掉时把外部 open 一并收回，两个开关不能各走各的 */
watch(assessOpen, (v) => {
  if (!v && props.open) emit('update:open', false);
});

const adviceLabel = computed(() => adviceLabelOf(assessDecision.value));
const advicePlaceholder = computed(() => advicePlaceholderOf(assessDecision.value));

/**
 * 标题按条目所属的线取：A 线（风险工单池条目）「风险评估」、B 线（报备单）「评估报备」，
 * 与风险报备池、工单 Tab 在队卡两处评估弹窗的叫法对齐。
 */
const modalTitle = computed(() => (assessTarget.value?.source === REPORT_SOURCE ? '评估报备' : '风险评估'));

/* ---- 第一区块：按条目来路分两种（PRD §5.3.2），字段与版式对齐风险监控页评估弹窗 ---- */

const riskTags = useRiskTagStore();

/** A 线（风险工单池条目）→「入池依据」；B 线（报备单）→「报备信息」。判据取条目的 `source` */
const fromPool = computed(() => !!assessTarget.value && assessTarget.value.source !== REPORT_SOURCE);

/** 入池依据的「命中原话」：实时监控来源且已打标的条目，取本单命中时刻最近的一条 */
const verifiedHit = computed<RiskHit | null>(() => {
  const t = assessTarget.value;
  if (!t?.tag || !isVerifyMonitorSource(t.source)) return null;
  const hits = riskTags.hitsOfTicket(t.ticketNo);
  return hits.length ? hits[hits.length - 1] : null;
});

/** 命中原话取窗：命中词前后各 40 字，找不到命中词时取开头 80 字；只在被截的一侧加省略号 */
const hitWindow = computed(() => {
  const h = verifiedHit.value;
  if (!h) return null;
  const text = h.excerpt ?? '';
  const term = h.matchedWord ?? '';
  const at = term ? text.indexOf(term) : -1;
  if (at < 0) {
    return { before: text.slice(0, 80), hit: '', after: '', head: false, tail: text.length > 80 };
  }
  const start = Math.max(0, at - 40);
  const end = Math.min(text.length, at + term.length + 40);
  return {
    before: text.slice(start, at),
    hit: text.slice(at, at + term.length),
    after: text.slice(at + term.length, end),
    head: start > 0,
    tail: end < text.length,
  };
});

/** 历次释放记录，最近一次在前 */
const releases = computed(() => [...(assessTarget.value?.releases ?? [])].reverse());

function downloadAttachment(name: string) {
  const url = URL.createObjectURL(new Blob([name], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <OpActionModal
    :open="assessOpen"
    :title="modalTitle"
    :icon="EditOutlined"
    tone="primary"
    :width="600"
    ok-text="提交结论"
    @update:open="assessOpen = $event"
    @ok="confirmAssess"
  >
    <div class="op-form ticket-assess-form">
      <!--
        ① 第一区块按条目来路分两种（PRD §5.3.2），与风险监控页评估弹窗同字段同版式：
        · A 线（风险工单池条目）→「入池依据」：风险等级 / 打标人 / 打标时刻 / 纳入说明 / 命中原话 / 打标备注；
        · B 线（报备单）→「报备信息」：报备人 / 原因 / 风险类型 / 场景描述 / 附件。
        A 线不出「报备人」「原因」：那两格是系统补的恒定占位（系统（系统） / 其他）。
      -->
      <section
        v-if="assessTarget"
        class="assess-sheet"
        :aria-label="fromPool ? '入池依据' : '报备信息'"
      >
        <header class="assess-sheet-head">
          <div class="assess-sheet-title-row">
            <span class="assess-sheet-kind">{{ fromPool ? '入池依据' : '报备信息' }}</span>
            <span class="assess-ticket-no">{{ assessTarget.ticketNo }}</span>
            <span class="assess-sheet-time">{{ fromPool ? '进监控于' : '提交于' }} {{ assessTarget.at }}</span>
          </div>
          <div class="assess-sheet-meta">
            <template v-if="fromPool">
              <template v-if="assessTarget.tag">
                <span class="assess-meta-pair">
                  <span class="assess-meta-label">风险等级</span>
                  <span
                    class="assess-meta-value"
                    :class="{ 'assess-meta-warn': assessTarget.tag.result === '高' }"
                  >{{ isPoolLevel(assessTarget.tag.result) ? riskLevelText(assessTarget.tag.result) : assessTarget.tag.result }}</span>
                </span>
                <span class="assess-meta-sep" aria-hidden="true" />
                <span class="assess-meta-pair">
                  <UserOutlined class="assess-meta-icon" />
                  <span class="assess-meta-label">打标人</span>
                  <span class="assess-meta-value">{{ assessTarget.tag.by }}（{{ assessTarget.tag.byRole }}）</span>
                </span>
                <span class="assess-meta-sep" aria-hidden="true" />
                <span class="assess-meta-pair">
                  <span class="assess-meta-label">打标时刻</span>
                  <span class="assess-meta-value">{{ assessTarget.tag.at }}</span>
                </span>
              </template>
              <span v-else class="assess-meta-pair">
                <span class="assess-meta-label">风险等级</span>
                <span class="assess-meta-value">未打标</span>
              </span>
            </template>
            <template v-else>
              <span class="assess-meta-pair">
                <UserOutlined class="assess-meta-icon" />
                <span class="assess-meta-label">报备人</span>
                <span class="assess-meta-value">{{ assessTarget.by }}（{{ assessTarget.byRole }}）</span>
              </span>
              <span class="assess-meta-sep" aria-hidden="true" />
              <span class="assess-meta-pair">
                <span class="assess-meta-label">原因</span>
                <span class="assess-meta-value">{{ assessTarget.reason }}</span>
              </span>
              <template v-if="assessTarget.category">
                <span class="assess-meta-sep" aria-hidden="true" />
                <span class="assess-meta-pair">
                  <span class="assess-meta-label">风险类型</span>
                  <span class="assess-meta-value assess-meta-warn">{{ assessTarget.category }}</span>
                </span>
              </template>
            </template>
          </div>
        </header>

        <div class="assess-sheet-body">
          <!-- A 线：纳入说明；B 线：场景描述 -->
          <blockquote class="assess-quote">{{ assessTarget.desc }}</blockquote>

          <div v-if="verifiedHit || assessTarget.tag?.note" class="assess-verify">
            <div v-if="verifiedHit && hitWindow" class="assess-foot-row">
              <span class="assess-foot-k">命中原话</span>
              <span class="assess-foot-v" :title="verifiedHit.excerpt">
                <span class="hit-pos">{{ verifiedHit.position }}</span>
                <span class="excerpt-quote">「<template v-if="hitWindow.head">…</template>{{ hitWindow.before }}<mark v-if="hitWindow.hit" class="excerpt-hit">{{ hitWindow.hit }}</mark>{{ hitWindow.after }}<template v-if="hitWindow.tail">…</template>」</span>
                <span class="assess-foot-sub">
                  风险词「{{ verifiedHit.word }}」<template v-if="verifiedHit.matchedWord && verifiedHit.matchedWord !== verifiedHit.word">，命中「{{ verifiedHit.matchedWord }}」</template>
                </span>
              </span>
            </div>
            <div v-if="assessTarget.tag?.note" class="assess-foot-row">
              <span class="assess-foot-k">打标备注</span>
              <span class="assess-foot-v">{{ assessTarget.tag.note }}</span>
            </div>
          </div>

          <ul v-if="assessTarget.attachments.length" class="assess-files">
            <li v-for="a in assessTarget.attachments" :key="a" class="assess-file">
              <PaperClipOutlined />
              <button type="button" class="assess-file-btn" :title="`下载 ${a}`" @click="downloadAttachment(a)">
                {{ a }}
              </button>
            </li>
          </ul>

          <!-- 释放记录（§5.5 ⑥）：没被释放过整段不出；历次全列、最近一次在前 -->
          <div v-if="releases.length" class="assess-releases">
            <div class="assess-releases-head">
              <RollbackOutlined />
              释放记录（已释放 {{ releases.length }} 次）
            </div>
            <div v-for="(rel, i) in releases" :key="i" class="assess-release">
              <div class="assess-release-head">
                <span class="assess-release-who">{{ rel.by }}（{{ rel.byRole }}）</span>
                <span class="assess-release-at">{{ rel.at }}</span>
              </div>
              <div class="assess-release-reason">{{ rel.reason }}</div>
            </div>
          </div>
        </div>

        <!-- ② 「本单另有」固定区块（§5.4 ⑦），取数见 riskOthersOf（三个评估入口同源），收在卡片底栏 -->
        <footer class="assess-sheet-foot" aria-label="本单另有">
          <div class="assess-foot-head">本单另有</div>
          <div v-for="row in assessOthers" :key="row.label" class="assess-foot-row">
            <span class="assess-foot-k">{{ row.label }}</span>
            <span class="assess-foot-v">{{ row.text }}</span>
          </div>
        </footer>
      </section>

      <section class="ticket-assess-block">
        <h4 class="ticket-assess-title">评估结论</h4>
        <div class="op-field ticket-assess-dec-field">
          <div class="op-field-h ticket-assess-dec-row">
            <div class="op-label req">评估决策</div>
            <a-radio-group v-model:value="assessDecision" class="ticket-assess-dec-inline">
              <!-- 值取 store 的枚举、字取界面词：改词与改枚举不是同一次改动，见 OpRiskDecision.ts -->
              <a-radio v-for="d in ASSESS_DECISIONS" :key="d" :value="d">{{ decisionText(d) }}</a-radio>
            </a-radio-group>
          </div>
          <div v-if="missAssessDecision" class="ticket-assess-err ticket-assess-foot">请先选择一个评估决策</div>
          <!--
            选「升级」后才出现的分流提示（O20）：它是"你点下去会立刻发生什么"，
            且**按原单类型给的是两种完全相反的后果**，是做决策所必需的一行。
          -->
          <div
            v-else-if="assessDecision === '升级'"
            class="ticket-assess-hint ticket-assess-foot"
          >{{ escalateHint }}</div>
        </div>
        <div class="op-field">
          <div class="op-label req">{{ adviceLabel }}</div>
          <a-textarea
            v-model:value="assessAdvice"
            :rows="3"
            :placeholder="advicePlaceholder"
          />
          <div v-if="missAssessAdvice" class="ticket-assess-err">请填写{{ adviceLabel }}</div>
        </div>
      </section>
    </div>
  </OpActionModal>
</template>

<style scoped>
/* ① 第一区块（入池依据 / 报备信息）+ ② 本单另有底栏：值与风险监控页评估弹窗 .assess-sheet 一组逐项相同 */
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
  flex: none;
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: #111827;
}
.assess-sheet-kind {
  flex: none;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  color: #9a3412;
  background: #ffedd5;
  border-radius: 4px;
}
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
.assess-verify {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}
.hit-pos {
  display: inline-block;
  padding: 0 5px;
  margin-right: 4px;
  border-radius: 3px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 11px;
}
.excerpt-quote { word-break: break-word; }
.excerpt-hit {
  padding: 0 2px;
  border-radius: 2px;
  background: #fef3c7;
  color: #b45309;
  font-weight: 600;
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
.assess-release { margin-top: 6px; }
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
.assess-sheet-foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 12px;
  background: #fafafa;
  border-top: 1px dashed #e5e7eb;
}
.assess-foot-row {
  display: grid;
  grid-template-columns: 68px 1fr;
  gap: 8px;
  align-items: start;
  font-size: 12px;
}
.assess-foot-head { font-size: 12px; font-weight: 600; color: #6b7280; }
.assess-foot-k { color: #9ca3af; line-height: 1.5; }
.assess-foot-v { color: #374151; font-weight: 600; line-height: 1.5; word-break: break-word; }
.assess-foot-sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 400;
  color: #64748b;
}
.ticket-assess-form { gap: 10px !important; }
.ticket-assess-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}
.ticket-assess-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.ticket-assess-dec-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin: 0;
}
.ticket-assess-dec-row > .op-label {
  flex: none;
  width: 72px;
  text-align: right;
  white-space: nowrap;
}
.ticket-assess-dec-inline {
  display: inline-flex !important;
  flex: 1;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ticket-assess-dec-inline :deep(.ant-radio-wrapper) {
  margin: 0 !important;
  padding: 6px 12px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  line-height: 1.45;
  font-size: 12px;
  white-space: nowrap;
  align-items: center;
}
.ticket-assess-dec-inline :deep(.ant-radio-wrapper-checked) {
  border-color: #1a6fff;
  background: #eff6ff;
}
.ticket-assess-dec-inline :deep(.ant-radio) { margin-top: 0; top: 0; }
.ticket-assess-foot { margin-left: calc(72px + 10px); margin-top: 4px; }
.ticket-assess-err {
  margin-top: 4px;
  font-size: 11px;
  color: #ef4444;
  line-height: 1.4;
}
/* 分流提示：与校验错误同一行位，但它讲的是后果不是错误，故取中性灰而非红 */
.ticket-assess-hint {
  margin-top: 4px;
  font-size: 11px;
  color: #6b7280;
  line-height: 1.5;
}
</style>
