<script setup lang="ts">
import { computed } from 'vue';
import { PaperClipOutlined, RollbackOutlined, UserOutlined } from '@ant-design/icons-vue';
import { useRiskTagStore } from '@/stores/riskTags';
import { REPORT_SOURCE, isPoolLevel, isVerifyMonitorSource, type RiskPoolItem } from '@/stores/riskShared';
import { riskLevelText } from '@/config/risk';
import { downloadReportAttachment, excerptWindow, isKeywordRow } from './riskAssessSheet';

/**
 * 「风险管控」弹窗的**第一区块**（PRD §5.3.2）：风险等级与标记备注一组 + 抬头 meta 行 +
 * 入池依据 / 报备信息 + 命中原话 + 附件 + 释放记录。风险监控页那一个与工单页
 * `OpRiskControlModal` 共用这一份，字段、顺序、出现条件与样式只在这里改。
 *
 * 🔴 卡上**不出单号、不出区块名**：两者都已在弹窗副标题（`〈来源〉 · 〈工单号〉`）里，
 * 一屏两遍。原来那一行的时刻没丢，并进了下面的 meta 行（`进监控` / `提交于`）。
 */
const props = defineProps<{ target: RiskPoolItem }>();

const riskTags = useRiskTagStore();

/**
 * 待评估的这一条**来自哪条线**。判据取条目自带的身份标 `source`（B 线恒为「二线报备」），
 * 不看有没有 `tag` —— 那答的是"打没打标"，罕见的"进了池却没打标"会被误判成 B 线。
 * · A 线（风险工单池里的条目）→「入池依据」：风险等级 / 标记人 / 标记时间 / 标记备注 / 命中原话。
 * · B 线（二线报备单）→「报备信息」：报备人 / 报备原因 / 风险类型 / 场景描述 / 附件。
 * A 线不出「报备人」「原因」：那两格是 `riskQueue.autoEntry()` 补的恒定占位（系统（系统） / 其他）。
 */
const fromPool = computed(() => props.target.source !== REPORT_SOURCE);

/**
 * meta 行末位那一对时刻出不出。**「重点工单」这一路整对不出**（2026-09-29）。
 *
 * 🔴 **那一档没有"进监控"的那一刻**：重点工单是"在办 ∧（类型＝投诉 ∨ P0/P1）"**天然成立**
 * 就在这一档里的，不存在被捞进来的动作；`at` 实际是条目生成时刻，标成「进监控」会被当成
 * 业务事实读。换个标签硬凑、或补一个「—」，同样是在答一个不存在的问题，故整对省掉。
 * · 实时监控（A 线）→「进监控」：命中把它捞进监控，这个时刻是真的。
 * · 二线报备（B 线）→「提交于」：报备人按下提交的那一刻。
 *
 * 判据取现成的读口（`isVerifyMonitorSource` / `REPORT_SOURCE`），不另造一套来源判断。
 */
const entryAtVisible = computed(() => !fromPool.value || isVerifyMonitorSource(props.target.source));

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
    卡的骨架与配色两条线共用（对齐工单操作页「风险报备」在队卡片 rr-card-live），
    分岔只发生在**抬头那几格与卡体里摆什么**。
  -->
  <section class="assess-sheet" :aria-label="fromPool ? '入池依据' : '报备信息'">
    <header class="assess-sheet-head">
      <div class="assess-sheet-brand">
        <!--
          A 线的头一行 ＝ 打标结论那一组：风险等级在前、标记备注紧随其后。
          备注是标记人当时的判断依据，跟结论挨着读才接得上；备注长时在自己那一列里换行、行行左对齐。
          备注为空时整格不出，不留空行也不出标签。
        -->
        <div v-if="fromPool" class="assess-sheet-level">
          <span class="assess-meta-pair">
            <span class="assess-meta-label">风险等级</span>
            <!-- 罕见：进了池却没有打标（旧缓存）。不编一个等级出来充数，只说清缺的正是这一格 -->
            <span
              v-if="target.tag"
              class="assess-meta-value"
              :class="{ 'assess-meta-warn': target.tag.result === '高' }"
            >{{ isPoolLevel(target.tag.result) ? riskLevelText(target.tag.result) : target.tag.result }}</span>
            <span v-else class="assess-meta-value">未标记</span>
          </span>
          <span v-if="target.tag?.note" class="assess-note-pair">
            <span class="assess-meta-label">标记备注</span>
            <span class="assess-note-value">{{ target.tag.note }}</span>
          </span>
        </div>
        <div class="assess-sheet-meta">
          <!-- A 线：标记人 / 标记时间；B 线：报备人 / 原因 / 风险类型。时刻一律排在末位 -->
          <template v-if="fromPool">
            <template v-if="target.tag">
              <span class="assess-meta-pair">
                <UserOutlined class="assess-meta-icon" />
                <span class="assess-meta-label">标记人</span>
                <span class="assess-meta-value">{{ target.tag.by }}（{{ target.tag.byRole }}）</span>
              </span>
              <span class="assess-meta-sep" aria-hidden="true" />
              <span class="assess-meta-pair">
                <span class="assess-meta-label">标记时间</span>
                <span class="assess-meta-value">{{ target.tag.at }}</span>
              </span>
              <!-- 分隔点跟着末位那一对走：重点工单不出那一对，这一点也不能留成尾巴 -->
              <span v-if="entryAtVisible" class="assess-meta-sep" aria-hidden="true" />
            </template>
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
            <span class="assess-meta-sep" aria-hidden="true" />
            <template v-if="target.category">
              <span class="assess-meta-pair">
                <span class="assess-meta-label">风险类型</span>
                <span class="assess-meta-value assess-meta-warn">{{ target.category }}</span>
              </span>
              <span class="assess-meta-sep" aria-hidden="true" />
            </template>
          </template>
          <!--
            删掉的标题行里那个时刻并到这里：实时监控＝进监控、二线报备＝提交于。
            **重点工单整对不出** —— 判据与理由见 `entryAtVisible`。
          -->
          <span v-if="entryAtVisible" class="assess-meta-pair">
            <span class="assess-meta-label">{{ fromPool ? '进监控' : '提交于' }}</span>
            <span class="assess-meta-value">{{ target.at }}</span>
          </span>
        </div>
      </div>
    </header>

    <div class="assess-sheet-body">
      <!-- A 线：入池说明（系统写的"为什么捞它"）；B 线：报备人填的场景描述 -->
      <blockquote class="assess-quote">{{ target.desc }}</blockquote>

      <!--
        入池依据的证据只剩「命中原话」一项：等级 / 标记备注 / 标记人 / 标记时间都在抬头，这里不复述。
        B 线的报备单没有命中，整块 v-if 掉、不留空标题。
      -->
      <div v-if="verifiedHit" class="assess-verify">
        <!-- 命中原话：与风险监控页命中清单、打标弹窗同一套取窗与高亮（excerptWindow） -->
        <div class="assess-foot-row">
          <span class="assess-foot-k">命中原话</span>
          <span class="assess-foot-v" :title="verifiedHit.excerpt">
            <span class="hit-pos">{{ verifiedHit.position }}</span>
            <span class="excerpt-quote">「<template v-if="excerptWindow(verifiedHit).headTruncated">…</template>{{ excerptWindow(verifiedHit).before }}<span v-if="excerptWindow(verifiedHit).hit" class="excerpt-hit">{{ excerptWindow(verifiedHit).hit }}</span>{{ excerptWindow(verifiedHit).after }}<template v-if="excerptWindow(verifiedHit).tailTruncated">…</template>」</span>
            <span class="assess-foot-sub">
              风险词「{{ verifiedHit.word }}」<template v-if="verifiedHit.matchedWord && verifiedHit.matchedWord !== verifiedHit.word">，命中「{{ verifiedHit.matchedWord }}」</template>
            </span>
          </span>
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
/* 抬头两行（风险等级＋标记备注 / meta 行）之间的行距走同一个 gap，B 线只有 meta 行时不留空档 */
.assess-sheet-brand {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
/*
 * 风险等级与标记备注一组。两列 grid（等级 | 备注）：备注只在自己那一列里换行，
 * 续行与首行左对齐，相对等级自然缩进；备注不出时这一行就只剩等级那一格。
 */
.assess-sheet-level {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 4px 14px;
  min-width: 0;
}
/* 备注本身再分「标签 | 正文」两列，续行退到正文那一列，不顶到标签底下 */
.assess-note-pair {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 4px;
  min-width: 0;
  font-size: 12px;
}
.assess-note-value {
  color: #374151;
  font-weight: 600;
  line-height: 1.55;
  word-break: break-word;
  white-space: pre-wrap;
}
.assess-sheet-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 0;
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
 * 核实结论块：行式走下面那套 assess-foot-*（只剩命中原话一行），这里只给它一个容器。
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
  display: inline;
  padding: 0 2px;
  border-radius: 2px;
  background: #fef3c7;
  color: #b45309;
  font-weight: 600;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
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

/* 核实结论块的行式（命中原话） */
.assess-foot-row {
  display: grid;
  grid-template-columns: 68px 1fr;
  gap: 8px;
  align-items: start;
  font-size: 12px;
}
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
