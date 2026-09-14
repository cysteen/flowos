<script setup lang="ts">
import { computed } from 'vue';
import { PaperClipOutlined, RollbackOutlined, UserOutlined } from '@ant-design/icons-vue';
import { useRiskTagStore } from '@/stores/riskTags';
import { REPORT_SOURCE, isPoolLevel, type RiskPoolItem } from '@/stores/riskShared';
import { riskLevelText } from '@/config/risk';
import type { RiskOtherRow } from '@/composables/useRiskReportAssess';
import { downloadReportAttachment, excerptWindow, isKeywordRow } from './riskAssessSheet';

/**
 * 风险评估弹窗的**第一区块**（PRD §5.3.2）：卡片抬头 + 入池依据 / 报备信息 + 命中原话 + 打标备注 +
 * 附件 + 释放记录 +「本单另有」底栏。风险监控页评估弹窗与工单页 `OpRiskAssessModal` 共用这一份，
 * 字段、顺序、出现条件与样式只在这里改。
 *
 * 「本单另有」四行由调用方传入（取数仍走 `riskOthersOf`，本组件不另取数）。
 */
const props = defineProps<{
  target: RiskPoolItem;
  others: RiskOtherRow[];
  /** 单号是否可点（风险监控页可点开工单；工单页就在本单上，不可点） */
  linkTicket?: boolean;
}>();

const emit = defineEmits<{ openTicket: [ticketNo: string] }>();

const riskTags = useRiskTagStore();

/**
 * 待评估的这一条**来自哪条线**。判据取条目自带的身份标 `source`（B 线恒为「二线报备」），
 * 不看有没有 `tag` —— 那答的是"打没打标"，罕见的"进了池却没打标"会被误判成 B 线。
 * · A 线（风险工单池里的条目）→「入池依据」：风险等级 / 打标人 / 打标时刻 / 打标备注 / 命中原话。
 * · B 线（二线报备单）→「报备信息」：报备人 / 报备原因 / 风险类型 / 场景描述 / 附件。
 * A 线不出「报备人」「原因」：那两格是 `riskQueue.autoEntry()` 补的恒定占位（系统（系统） / 其他）。
 */
const fromPool = computed(() => props.target.source !== REPORT_SOURCE);

/**
 * 入池依据的「命中原话」：实时监控来源且已打标的条目，取本单**命中时刻最近**的一条风险词命中。
 * 不要求命中"已核实成立"：打标是对条目四选一，命中的成立/误报不是入池判据（见 `riskShared.ReportVerify`）。
 */
const verifiedHit = computed(() => {
  const t = props.target;
  if (!t.tag || !isKeywordRow(t)) return null;
  const hits = riskTags.hitsOfTicket(t.ticketNo).slice().sort((a, b) => a.when.localeCompare(b.when));
  return hits.length ? hits[hits.length - 1] : null;
});

/** 历次释放记录，最近一次在前；没被释放过时为空数组（§5.5 ⑥） */
const releases = computed(() => [...(props.target.releases ?? [])].reverse());
</script>

<template>
  <!--
    卡的骨架与配色两条线共用（对齐工单操作页「风险报备」在队卡片 rr-sheet），
    分岔只发生在**抬头那几格与卡体里摆什么**。
  -->
  <section class="assess-sheet" :aria-label="fromPool ? '入池依据' : '报备信息'">
    <header class="assess-sheet-head">
      <div class="assess-sheet-brand">
        <div class="assess-sheet-title-row">
          <!-- 区块名摆在明面上：两条线的第一区块答的不是同一个问题，只靠内容差异读不出来 -->
          <span class="assess-sheet-kind">{{ fromPool ? '入池依据' : '报备信息' }}</span>
          <button
            v-if="linkTicket"
            type="button"
            class="assess-ticket-link"
            @click="emit('openTicket', target.ticketNo)"
          >
            {{ target.ticketNo }}
          </button>
          <span v-else class="assess-ticket-no">{{ target.ticketNo }}</span>
          <span class="assess-sheet-time">
            {{ fromPool ? '进监控于' : '提交于' }} {{ target.at }}
          </span>
        </div>
        <div class="assess-sheet-meta">
          <!-- A 线的抬头 ＝ 打标那一组（风险等级 / 打标人 / 打标时刻） -->
          <template v-if="fromPool">
            <template v-if="target.tag">
              <span class="assess-meta-pair">
                <span class="assess-meta-label">风险等级</span>
                <span
                  class="assess-meta-value"
                  :class="{ 'assess-meta-warn': target.tag.result === '高' }"
                >{{ isPoolLevel(target.tag.result) ? riskLevelText(target.tag.result) : target.tag.result }}</span>
              </span>
              <span class="assess-meta-sep" aria-hidden="true" />
              <span class="assess-meta-pair">
                <UserOutlined class="assess-meta-icon" />
                <span class="assess-meta-label">打标人</span>
                <span class="assess-meta-value">{{ target.tag.by }}（{{ target.tag.byRole }}）</span>
              </span>
              <span class="assess-meta-sep" aria-hidden="true" />
              <span class="assess-meta-pair">
                <span class="assess-meta-label">打标时刻</span>
                <span class="assess-meta-value">{{ target.tag.at }}</span>
              </span>
            </template>
            <!-- 罕见：进了池却没有打标（旧缓存）。不编一个等级出来充数，只说清缺的正是这一格 -->
            <span v-else class="assess-meta-pair">
              <span class="assess-meta-label">风险等级</span>
              <span class="assess-meta-value">未打标</span>
            </span>
          </template>
          <template v-else>
            <span class="assess-meta-pair">
              <UserOutlined class="assess-meta-icon" />
              <span class="assess-meta-label">报备人</span>
              <span class="assess-meta-value">{{ target.by }}（{{ target.byRole }}）</span>
            </span>
            <span class="assess-meta-sep" aria-hidden="true" />
            <span class="assess-meta-pair">
              <span class="assess-meta-label">原因</span>
              <span class="assess-meta-value">{{ target.reason }}</span>
            </span>
            <template v-if="target.category">
              <span class="assess-meta-sep" aria-hidden="true" />
              <span class="assess-meta-pair">
                <span class="assess-meta-label">风险类型</span>
                <span class="assess-meta-value assess-meta-warn">{{ target.category }}</span>
              </span>
            </template>
          </template>
        </div>
      </div>
    </header>

    <div class="assess-sheet-body">
      <!-- A 线：入池说明（系统写的"为什么捞它"）；B 线：报备人填的场景描述 -->
      <blockquote class="assess-quote">{{ target.desc }}</blockquote>

      <!--
        入池依据的证据那两项：命中原话 + 打标备注。等级 / 打标人 / 打标时刻已上抬头，这里不复述。
        B 线的报备单没有打标也没有命中，整块 v-if 掉、不留空标题。
      -->
      <div v-if="verifiedHit || target.tag?.note" class="assess-verify">
        <!-- 命中原话：与风险监控页命中清单、打标弹窗同一套取窗与高亮（excerptWindow） -->
        <div v-if="verifiedHit" class="assess-foot-row">
          <span class="assess-foot-k">命中原话</span>
          <span class="assess-foot-v" :title="verifiedHit.excerpt">
            <span class="hit-pos">{{ verifiedHit.position }}</span>
            <span class="excerpt-quote">「<template v-if="excerptWindow(verifiedHit).headTruncated">…</template>{{ excerptWindow(verifiedHit).before }}<mark v-if="excerptWindow(verifiedHit).hit" class="excerpt-hit">{{ excerptWindow(verifiedHit).hit }}</mark>{{ excerptWindow(verifiedHit).after }}<template v-if="excerptWindow(verifiedHit).tailTruncated">…</template>」</span>
            <span class="assess-foot-sub">
              风险词「{{ verifiedHit.word }}」<template v-if="verifiedHit.matchedWord && verifiedHit.matchedWord !== verifiedHit.word">，命中「{{ verifiedHit.matchedWord }}」</template>
            </span>
          </span>
        </div>
        <!-- 打标时填的备注：打标人当时怎么想的，比结论本身更能帮下一个人接上 -->
        <div v-if="target.tag?.note" class="assess-foot-row">
          <span class="assess-foot-k">打标备注</span>
          <span class="assess-foot-v">{{ target.tag.note }}</span>
        </div>
      </div>

      <ul v-if="target.attachments.length" class="assess-files">
        <li v-for="a in target.attachments" :key="a" class="assess-file">
          <PaperClipOutlined />
          <button
            type="button"
            class="assess-file-btn"
            :title="`下载 ${a}`"
            @click="downloadReportAttachment(a)"
          >
            {{ a }}
          </button>
        </li>
      </ul>

      <!--
        释放记录（§5.5 ⑥「在两个池的条目详情上可见」）。没被释放过整段不出；历次全列、最近一次在前。
        退回的理由往往正是"我判不了 / 不该我办"——现在轮到评估人判，那句话是他要读的第一手材料。
      -->
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

    <!--
      「本单另有」：固定区块（§5.4 ⑦ / R62），收在卡片底栏。四行（风险词命中 / 打标结论 /
      历史报备 / 协同处理）由调用方按 riskOthersOf 取数，无取值的行写「无」，区块不隐藏。
    -->
    <footer class="assess-sheet-foot" aria-label="本单另有">
      <div class="assess-foot-head">本单另有</div>
      <div v-for="o in others" :key="o.label" class="assess-foot-row">
        <span class="assess-foot-k">{{ o.label }}</span>
        <span class="assess-foot-v">{{ o.text }}</span>
      </div>
    </footer>
  </section>
</template>

<style scoped>
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
.assess-sheet-brand { min-width: 0; }
.assess-sheet-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
/* 单号：不可点（工单页）走深灰字 */
.assess-ticket-no {
  flex: none;
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: #111827;
}
/* 单号：可点（风险监控页）走链接蓝，值同风险监控页 .tag-ticket-no */
.assess-ticket-link {
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
.assess-ticket-link:hover { text-decoration: underline; }
/*
 * 区块名（入池依据 / 报备信息）。做成小徽标而不是标题行：卡本身已经有描边与暖色抬头，
 * 再压一行 h4 会把弹窗第一屏撑掉一截，而这里要说的只是"这一格答的是哪个问题"。
 */
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
/*
 * 核实结论块：行式直接复用底栏那套 assess-foot-*，这里只给它一个容器。
 * 底色取 .assess-quote 同一个 #f8fafc、描边取 .assess-file 同一个 #e2e8f0。
 */
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
/* 命中原话：取值与风险监控页命中清单的 .hit-pos / .excerpt-quote / .excerpt-hit 同值 */
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

/* 释放记录：与 B 线报备池 RiskReportPoolPanel 的 .assess-releases 一族逐行同值 */
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

/* 本单另有：卡片底栏 */
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
</style>
