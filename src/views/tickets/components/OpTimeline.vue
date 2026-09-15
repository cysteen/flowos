<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  FileAddOutlined, SolutionOutlined, RiseOutlined, FormOutlined,
  ApartmentOutlined, LinkOutlined,
  PauseCircleOutlined, SwapOutlined, PhoneOutlined, MessageOutlined,
  PaperClipOutlined, SnippetsOutlined, CommentOutlined, BellOutlined,
  CheckCircleOutlined, StarFilled,
  ThunderboltOutlined, HistoryOutlined, ClockCircleOutlined, TeamOutlined,
  SafetyOutlined, SafetyCertificateOutlined, FileSearchOutlined, WarningOutlined,
  CloudUploadOutlined, CloseCircleOutlined, InteractionOutlined, RedoOutlined, RobotOutlined,
} from '@ant-design/icons-vue';
import RecordingPlayer from './operation/RecordingPlayer.vue';
import {
  CATEGORY_META, ROLE_BADGE, softBg,
  type TlAction, type TlCategory, type TimelineEntry, type RelatedTicketBrief,
} from '@/views/tickets/types/ticketDetail';

const router = useRouter();

/**
 * **打开一张单，全仓唯一一句**（《【720】》验收 T4）。
 *
 * 【为什么是 `router.push`】全仓打开一张单就是这一句（`TicketOperationView.openRelation`、
 * `RiskMonitorView.openTicket`、工作台 / 查询中心 / 客户全景各处同）—— 工单页是常驻页签，
 * 路由变了页签跟着定位，不另造一套跳法。
 *
 * 【为什么它必须可点】效果走查第六幕整幕在追问"从原单怎么走到新单"：
 * 一个不可点的单号等于让人把号手抄下来再去搜一遍。
 */
function openTicket(no: string) {
  router.push(`/tickets/${no}`);
}

/**
 * 第 2 类「关联单」卡片。**T4 要求新投诉单号两处一致且都可点跳**，这是第二处。
 *
 * 🔴 这里此前是 `message.info('打开关联单 XXX')` —— 一张长得像卡片、带 `cursor: pointer`
 * 和「打开 XXX」tooltip 的东西，点下去只弹一句提示，从来没跳过。第 8 类那一处上一轮已经真跳了，
 * 两处不一致的话，同一个新投诉单号在同一屏上一处点得动、一处点不动。
 * 走上面那**同一句** `openTicket`，不另造第二种跳法。
 */
function openRelated(t: RelatedTicketBrief) {
  openTicket(t.no);
}

const props = defineProps<{ entries: TimelineEntry[] }>();

// 图标取「一眼能认」的语义，与 how 徽章文案呼应
const ICON: Record<TlAction, unknown> = {
  create: FileAddOutlined,      // 建单
  accept: SolutionOutlined,     // 受理/办理
  escalate: RiseOutlined,       // 升级（与底栏升级按钮一致）
  relate: ApartmentOutlined,    // 关联单（升级投诉/关联售后派生关联工单）
  handle: FormOutlined,         // 处理登记（坐席填写处理结果/结论）
  slaClose: ClockCircleOutlined,// SLA 关钟
  hold: PauseCircleOutlined,    // 挂起
  transfer: SwapOutlined,       // 流转/调剂
  phone: PhoneOutlined,         // 电话
  sms: MessageOutlined,         // 短信
  supplement: SnippetsOutlined, // 补充材料
  reply: CommentOutlined,       // 回复
  dunning: BellOutlined,        // 催办
  resolved: CheckCircleOutlined,// 已解决
  praise: StarFilled,           // 好评
  // ---- 第八类「风险结论」五件，共用 risk 色条、图标各不相同（《【720】》§5.1 逐件指定）----
  riskReport: SafetyOutlined,           // 报备提交＝盾
  riskAssess: SafetyCertificateOutlined,// 评估结论＝盾+✓
  collab: TeamOutlined,                 // 协同处理＝双人
  riskTag: FileSearchOutlined,          // 打标＝放大镜+✓
  riskGrade: WarningOutlined,           // 风险等级变更＝警示三角
  // ---- 刷机单自动刷机链路（930 教育刷机单），归 node 类 ----
  flashPush: CloudUploadOutlined,       // 自动推送
  flashSuccess: CheckCircleOutlined,    // 回传成功
  flashFail: CloseCircleOutlined,       // 回传失败
  flashHandoff: InteractionOutlined,    // 转人工
  flashRepush: RedoOutlined,            // 重推
};
/**
 * 图例 ＝ `CATEGORY_META` 的键序，**八格**（《【720】》§5.2）。
 * 【为什么从 META 派生而不是另列一张表】图例本身就是筛选器，少一格就等于那一类的履历
 * 在页面上永远筛不出来；派生之后"加了一类却忘了加图例"这件事从结构上不可能发生。
 */
const LEGEND = (Object.entries(CATEGORY_META) as [TlCategory, (typeof CATEGORY_META)[TlCategory]][])
  .map(([key, meta]) => ({ key, ...meta }));

const activeCategory = ref<TlCategory | null>(null);

function toggleFilter(key: TlCategory) {
  activeCategory.value = activeCategory.value === key ? null : key;
}

const filteredEntries = computed(() => {
  if (!activeCategory.value) return props.entries;
  return props.entries.filter((e) => e.category === activeCategory.value);
});
</script>

<template>
  <div class="timeline-card">
    <!-- 标题 + 图例筛选 -->
    <div class="tl-header">
      <span class="tl-title"><HistoryOutlined :style="{ fontSize: '15px' }" />工单动态</span>
      <div class="legend">
        <button
          v-for="l in LEGEND"
          :key="l.key"
          type="button"
          class="legend-item"
          :class="{ active: activeCategory === l.key, dimmed: activeCategory && activeCategory !== l.key }"
          :title="activeCategory === l.key ? '点击取消筛选' : `仅看${l.label}`"
          @click="toggleFilter(l.key)"
        >
          <span class="legend-dot" :style="{ background: l.color }"></span>{{ l.label }}
        </button>
      </div>
    </div>

    <div class="tl-body">
      <div v-if="!filteredEntries.length" class="empty-hint">
        暂无「{{ activeCategory ? CATEGORY_META[activeCategory].label : '' }}」类履历
        <button type="button" class="clear-filter" @click="activeCategory = null">查看全部</button>
      </div>
      <!-- 条目 -->
      <div
        v-for="e in filteredEntries"
        :key="e.id"
        class="entry"
        :class="{ 'entry-sla': e.category === 'sla' }"
        :style="{ background: CATEGORY_META[e.category].bg, borderLeftColor: CATEGORY_META[e.category].color }"
      >
        <div
          v-if="e.systemActor"
          class="entry-avatar entry-avatar--system"
          title="系统"
        >
          <RobotOutlined />
        </div>
        <div
          v-else
          class="entry-avatar"
          :style="{ background: softBg(CATEGORY_META[e.category].color), color: CATEGORY_META[e.category].color }"
        >
          <component :is="ICON[e.action]" />
        </div>

        <!-- SLA 时效：单行紧凑展示，去掉系统/角色/说明等冗余 -->
        <div v-if="e.category === 'sla' && e.slaClose" class="entry-main entry-main--sla">
          <span
            class="how-badge"
            :style="{ color: CATEGORY_META.sla.color, background: softBg(CATEGORY_META.sla.color) }"
          >{{ e.how }}</span>
          <span class="sla-close-time">{{ e.slaClose.closedAt }}</span>
        </div>

        <div v-else class="entry-main">
          <div class="entry-top">
            <span class="who">{{ e.who }}</span>
            <span class="role-badge" :style="{ color: ROLE_BADGE[e.role], background: softBg(ROLE_BADGE[e.role]) }">{{ e.role }}</span>
            <span class="how-badge" :style="{ color: CATEGORY_META[e.category].color, background: softBg(CATEGORY_META[e.category].color) }">
              {{ e.how }}<template v-if="e.dunningTimes"> · 第{{ e.dunningTimes }}次</template>
            </span>
            <span v-if="e.internal" class="internal">仅内部可见</span>
            <span class="when">{{ e.when }}</span>
          </div>

          <div v-if="e.what" class="what">{{ e.what }}</div>

          <!-- 工单处理字段变更（handle 事件）：补充/修改 明细 -->
          <div v-if="e.changes?.length" class="chg-list">
            <div v-for="(c, ci) in e.changes" :key="ci" class="chg-row">
              <span class="chg-kind" :class="c.kind === '补充' ? 'chg-add' : 'chg-mod'">{{ c.kind }}</span>
              <span class="chg-field">{{ c.field }}</span>
              <span class="chg-val">
                <template v-if="c.kind === '修改' && c.from"><span class="chg-from">{{ c.from }}</span><span class="chg-arrow">→</span></template>{{ c.to }}
              </span>
            </div>
          </div>

          <!--
            风险结论（risk 事件）的**四样 chip**，顺序照《【720】》§5.1：
            结论 / 建议事项 / 风险等级 / 新投诉单号。取值全部来自落库时固化的结构化字段，
            这里不解析正文（正文只说动词，见 `stores/riskHistory.ts` 的 `renderRow`）。
            一件至多用到其中两三样，没有的那几样整枚不出。
          -->
          <div
            v-if="e.riskConclusion || e.riskAdvices?.length || e.riskGradeTo || e.riskDerivedNo"
            class="risk-chips"
          >
            <!-- ① 结论：打标＝低危/中危/高危/无风险，评估＝升级/不升级。整条卡最该被扫到的那个值 -->
            <span v-if="e.riskConclusion" class="risk-chip risk-chip--concl">{{ e.riskConclusion }}</span>

            <!-- ② 建议事项：每项各一枚。走中性灰蓝，与「结论」分开 —— 它们是待办不是结论 -->
            <span v-for="(a, ai) in e.riskAdvices" :key="ai" class="risk-chip risk-chip--advice">{{ a }}</span>

            <!-- ③ 风险等级「旧 → 新」。箭头压灰，让两端的等级值自己跳出来 -->
            <span v-if="e.riskGradeTo" class="risk-chip risk-chip--grade">
              {{ e.riskGradeFrom }}<span class="risk-chip-arrow">→</span>{{ e.riskGradeTo }}
            </span>

            <!--
              ④ 新投诉单号：可点跳，样式对齐关联单卡片里那一格单号（`rel-mini-no`），
              不内联整张卡（§5.1）
            -->
            <button
              v-if="e.riskDerivedNo"
              type="button"
              class="risk-chip risk-derived"
              :title="`打开新投诉单 ${e.riskDerivedNo}`"
              @click="openTicket(e.riskDerivedNo)"
            >
              <LinkOutlined />
              <span class="risk-derived-no">{{ e.riskDerivedNo }}</span>
            </button>
          </div>

          <!-- 关联单卡片（relate 事件）：对齐关联单卡片字段，可点跳转 -->
          <div
            v-if="e.relatedTicket"
            class="rel-mini"
            :title="`打开 ${e.relatedTicket.no}`"
            @click="openRelated(e.relatedTicket)"
          >
            <div class="rel-mini-top">
              <span
                class="rel-mini-status"
                :style="{ color: e.relatedTicket.statusColor || '#6b7280', background: softBg(e.relatedTicket.statusColor || '#6b7280') }"
              >{{ e.relatedTicket.status }}</span>
              <span class="rel-mini-title">{{ e.relatedTicket.title }}</span>
              <span class="rel-mini-open"><LinkOutlined /></span>
            </div>
            <div class="rel-mini-meta">
              <span class="rel-mini-no">{{ e.relatedTicket.no }}</span>
              <span class="rel-mini-sep">·</span>
              <span
                class="rel-mini-type"
                :style="{ color: e.relatedTicket.typeColor || '#6b7280', background: softBg(e.relatedTicket.typeColor || '#6b7280') }"
              >{{ e.relatedTicket.type }}</span>
              <span class="rel-mini-sep">·</span>
              <span class="rel-mini-builder">{{ e.relatedTicket.builder }}</span>
              <span v-if="e.relatedTicket.createdAt" class="rel-mini-time">{{ e.relatedTicket.createdAt }}</span>
            </div>
          </div>

          <!-- 客户补充附件 -->
          <div v-if="e.attachment" class="attach">
            <PaperClipOutlined :style="{ fontSize: '12px' }" />{{ e.attachment }}
          </div>

          <!-- 电话录音条 + ASR -->
          <template v-if="e.recording">
            <RecordingPlayer
              :progress="`00:00 / ${e.recording}`"
              :name="`${e.how} ${e.when}`"
            />
            <div v-if="e.asr" class="asr">
              <div class="asr-head"><ThunderboltOutlined :style="{ color: '#06B6D4', fontSize: '12px' }" />语音识别转写</div>
              <div v-for="(line, i) in e.asr" :key="i" class="asr-line">
                <span class="asr-spk" :style="{ color: line.speaker === '坐席' ? '#06B6D4' : '#6B7280' }">[{{ line.speaker }}]</span>
                <span class="asr-text">{{ line.text }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
.tl-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-bottom: 1px solid #eff0f2;
}
.tl-title { font-size: 14px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 6px; flex: none; }

.tl-body { display: flex; flex-direction: column; gap: 16px; padding: 16px; }

.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #4b5563;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 3px 10px;
  cursor: pointer;
  user-select: none;
  line-height: 1.4;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s, color 0.15s, box-shadow 0.15s;
}
.legend-item:hover {
  background: #fff;
  border-color: #cbd5e1;
  color: #111827;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.legend-item:active {
  background: #f3f4f6;
  box-shadow: none;
}
.legend-item.active {
  background: #eff6ff;
  border-color: #93c5fd;
  color: #1d4ed8;
  font-weight: 600;
  box-shadow: none;
}
.legend-item.dimmed {
  opacity: 0.45;
  background: transparent;
}
.legend-dot { width: 8px; height: 8px; border-radius: 4px; flex: none; }

.empty-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #9ca3af;
  padding: 12px 4px;
}
.clear-filter {
  font-size: 12px;
  color: #2563eb;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.clear-filter:hover { text-decoration: underline; }

.entry {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-left: 3px solid;
  border-radius: 8px;
}
.entry-sla {
  align-items: center;
  padding: 6px 12px;
  min-height: 36px;
}
.entry-avatar {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
/* 系统头像（刷机单系统事件）：中性灰底 + 白色机器人 */
.entry-avatar--system { background: #64748b; color: #fff; }
.entry-sla .entry-avatar {
  width: 24px;
  height: 24px;
  border-radius: 12px;
  font-size: 12px;
}
.entry-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.entry-main--sla {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}
.entry-top { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.who { font-size: 13px; font-weight: 600; color: #111827; }
.role-badge, .how-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 4px;
}
.internal {
  font-size: 10px;
  color: #6b7280;
  background: #f3f4f6;
  border: 1px dashed #d1d5db;
  padding: 1px 6px;
  border-radius: 4px;
}
.when { margin-left: auto; font-size: 11px; color: #9ca3af; }
.what { font-size: 13px; color: #374151; line-height: 1.6; }

/* SLA 关钟：单行时间 */
.sla-close-time {
  margin-left: auto;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  font-variant-numeric: tabular-nums;
}

/* 工单处理字段变更明细 */
.chg-list {
  display: flex; flex-direction: column; gap: 4px;
  background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 6px; padding: 8px 10px;
}
.chg-row { display: flex; align-items: baseline; gap: 8px; font-size: 12px; line-height: 1.5; }
.chg-kind { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 3px; flex: none; }
.chg-add { color: #0d9488; background: #ccfbf1; }
.chg-mod { color: #b45309; background: #fef3c7; }
.chg-field { font-weight: 600; color: #374151; flex: none; }
.chg-val { color: #6b7280; min-width: 0; }
.chg-from { color: #9ca3af; text-decoration: line-through; }
.chg-arrow { margin: 0 5px; color: #9ca3af; }

/* 关联单卡片（relate 事件内联） */
.rel-mini {
  align-self: stretch;
  background: #fff; border: 1px solid #e0e7ff; border-radius: 6px;
  padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
}
.rel-mini:hover { border-color: #a5b4fc; box-shadow: 0 1px 6px rgba(79, 70, 229, 0.12); }
.rel-mini-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
.rel-mini-status { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 4px; flex: none; }
.rel-mini-title { font-size: 13px; font-weight: 600; color: #111827; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rel-mini-open { margin-left: auto; color: #4f46e5; font-size: 12px; flex: none; }
.rel-mini-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rel-mini-no { font-size: 12px; color: #4f46e5; font-weight: 600; }
.rel-mini-type { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; flex: none; }
.rel-mini-builder { font-size: 11px; color: #6b7280; }
.rel-mini-sep { color: #d1d5db; }
.rel-mini-time { margin-left: auto; font-size: 11px; color: #9ca3af; }

/*
 * 风险结论（risk 事件）的四样 chip（《【720】》§5.1）。
 *
 * 【为什么共一个 `.risk-chip` 底子、只换配色】四样都是"从正文里摘出来的结构化取值"，
 * 是同一类东西；尺寸/圆角/字重各写一套的话，一条协同处理卡上会出现三种高度的药丸。
 * 配色分两族：**结论与等级走玫红**（与第八类色条同源，一眼看得出属于风险结论这张卡、
 * 不是隔壁的关联单卡），**建议事项走中性灰蓝**（它们是待办，不是结论，不该抢结论的注意力）。
 */
.risk-chips {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  align-self: flex-start;
}
.risk-chip {
  display: inline-flex; align-items: center; gap: 5px;
  margin: 0; padding: 3px 10px;
  font-family: inherit; font-size: 12px; font-weight: 600; line-height: 1.5;
  border-radius: 999px;
  border: 1px solid transparent;
}
/* 结论：实心一点，整条卡上分量最重的那个值 */
.risk-chip--concl { color: #9d174d; background: #fce7f3; border-color: #fbcfe8; }
/* 风险等级「旧 → 新」：与结论同族但退一档，它答的是"变到了哪儿"而不是"判成了什么" */
.risk-chip--grade { color: #db2777; background: #fdf2f8; border-color: #fbcfe8; }
.risk-chip-arrow { color: #d1a0b8; margin: 0 5px; font-weight: 400; }
/* 建议事项：中性灰蓝，逐项一枚 */
.risk-chip--advice { color: #475569; background: #f8fafc; border-color: #e2e8f0; font-weight: 500; }

/* 新投诉单号：唯一可点的一枚，故给 hover 反馈 */
.risk-derived {
  color: #db2777; background: #fdf2f8; border-color: #fbcfe8;
  cursor: pointer;
  transition: background .15s, border-color .15s, box-shadow .15s;
}
.risk-derived:hover {
  background: #fce7f3; border-color: #f9a8d4;
  box-shadow: 0 1px 6px rgba(219, 39, 119, 0.14);
}
.risk-derived-no { letter-spacing: .2px; }

.attach {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  font-size: 12px;
  color: #2563eb;
  background: #fff;
  border: 1px solid #dbeafe;
  border-radius: 4px;
  padding: 3px 8px;
}


.asr {
  background: #fff;
  border: 1px solid #cffafe;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.asr-head { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: #06b6d4; margin-bottom: 2px; }
.asr-line { font-size: 12px; line-height: 1.5; }
.asr-spk { font-weight: 600; margin-right: 6px; }
.asr-text { color: #374151; }
</style>
