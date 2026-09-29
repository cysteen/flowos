<script setup lang="ts">
import { computed } from 'vue';
import { message } from 'ant-design-vue';
import type { RiskLevelFieldsView } from '@/composables/useRiskLevelFields';
import { NO_RISK_LOCKED_TIP } from '@/stores/riskQueue';
import { NO_RISK, RISK_TAG_RESULTS, isPoolLevel, type RiskTagResult } from '@/stores/riskShared';
import { RISK_LEVEL_STYLE, riskLevelText } from '@/config/risk';

/**
 * **风险等级**那一段字段：四选一（高危 / 中危 / 低危 / 无风险）+ 标记备注。
 *
 * 🔴 **六处「风险管控」弹窗同一份、同一种呈现**（2026-09-29 裁决「风险等级段收敛」）：
 * 风险监控页的条目打标形态、评估处置工作面，工单工作台的风险报备池，
 * 工单处理页页头的投诉支与非投诉支。此前同一个字段在六处长出三种呈现、脚注五种说法、
 * 必填星两套规则 —— 那就是用户看到的不一致。
 *
 * 【版式】卡片式四选一、标签「风险等级」横排在左、**不带外框也不带 h4 段头**
 * （外框与段头只属于「风险处理措施」那一段）。风险等级是这个弹窗的
 * 主干字段，管控手段才是一个成块的子表单 —— 版式由用户点名指定的那一屏（条目打标形态）为准。
 *
 * 【入参】只认 `RiskLevelFieldsView`：`useRiskLevelFields` 的真实例满足它，宿主既有状态
 * 包出来的薄适配器（`makeRiskLevelFieldsView`）也满足它。**本组件不落库、不校验**，
 * 落库与校验各在宿主自己那条既有路径上。
 *
 * 四选一而不是"有没有风险 + 等级"两个字段：拆开会立刻长出"无风险却带着等级"
 * "有风险却没等级"两种非法组合，而这两种组合恰恰决定条目进不进池。
 *
 * 样式**自带、不借宿主类名**（与 `RiskCollabFields.vue` / `EscalateComplaintFields.vue` 同形）：
 * 借宿主弹窗的类名会让同一段字段在六处长得不一样 —— 那正是本轮要收掉的东西。
 * （`op-field` / `op-label` / `op-radio-card*` 是 `OpActionModal.vue` 里的**全局**表单原子类，
 * 不是某一个宿主的局部类，用它们不违反上面这条。）
 */
const props = defineProps<{ ctl: RiskLevelFieldsView }>();

/**
 * 渲染哪几档。**默认全部四档**；宿主给了 `levels` 才按它来。
 *
 * 🔴 **目前零调用方、有意保留**：它是给"误报时只出无风险一档"那一版规格开的口子，
 * 而那一版已被推翻（现行口径是**误报时整段不出**，由宿主自己的 `visible` 承担）。
 * 命中核实形态**也没有接进本组件**（它只有三档、备注是另一格「处置备注」、
 * 没有"无风险置灰"这回事，接进来要开三个开关，就不再是"一份共享件、一种呈现"）。
 * 留着这个口子是为了下一处真需要收窄档位的宿主，不要据此以为命中核实已经共用本件。
 */
const levels = computed<readonly RiskTagResult[]>(() => props.ctl.levels?.value ?? RISK_TAG_RESULTS);

/** 置灰档由本组件挡住并给出原因；其余交给 `ctl.fields.level` 的 setter（宿主那一步的动作全保留） */
function pick(r: RiskTagResult) {
  if (r === NO_RISK && props.ctl.noRiskLocked.value) {
    message.warning(NO_RISK_LOCKED_TIP);
    return;
  }
  props.ctl.fields.level = r;
}
</script>

<template>
  <section v-if="ctl.visible.value" class="rlf" aria-label="风险等级">
    <div class="op-field op-field-h rlf-row">
      <!-- 本来没有等级才标必填：已有等级的那一路是预置可改，不强制再选一次 -->
      <div class="op-label rlf-label" :class="{ req: ctl.required.value }">风险等级</div>
      <div class="op-radio-cards op-radio-cards--row rlf-cards">
        <!-- 已结论的条目「无风险」一档置灰（store 侧 recordTag 同样拒绝），见 ctl.noRiskLocked -->
        <div
          v-for="r in levels"
          :key="r"
          class="op-radio-card rlf-card"
          :class="{ on: ctl.fields.level === r, 'rlf-card-locked': r === NO_RISK && ctl.noRiskLocked.value }"
          :style="ctl.fields.level === r && isPoolLevel(r) ? { borderColor: RISK_LEVEL_STYLE[r].color, background: `${RISK_LEVEL_STYLE[r].bg}33` } : {}"
          :title="r === NO_RISK && ctl.noRiskLocked.value ? NO_RISK_LOCKED_TIP : undefined"
          :aria-disabled="r === NO_RISK && ctl.noRiskLocked.value ? 'true' : undefined"
          @click="pick(r)"
        >
          <div class="op-rc-title">{{ r === NO_RISK ? NO_RISK : riskLevelText(r) }}</div>
        </div>
      </div>
    </div>
    <p v-if="ctl.missLevel.value" class="rlf-err">请选择风险等级</p>
    <p v-else class="rlf-foot">
      <template v-if="ctl.noRiskLocked.value">{{ NO_RISK_LOCKED_TIP }}。</template>
      标为 低 / 中 / 高 即进风险工单池；标为「无风险」不进池。
    </p>

    <!--
      标记备注。**改判时必填**（原来那格「修正原因」已并进来，2026-09-29 裁决）：
      两格都在答"这一次是怎么判的、为什么"，改判时人得把同一件事写两遍。
      改判形态下本格从空开始、问法换成"为什么改"。
    -->
    <div class="op-field op-field-h op-field-h-top rlf-row rlf-row-note">
      <div class="op-label rlf-label" :class="{ req: ctl.isAmend.value }">标记备注</div>
      <a-textarea
        v-model:value="ctl.fields.note"
        :rows="2"
        :status="ctl.missNote.value ? 'error' : undefined"
        :placeholder="ctl.isAmend.value
          ? '上一次判的是什么、这次为什么改…（必填）'
          : '判断依据与后续动作（可选）'"
      />
    </div>
    <p v-if="ctl.missNote.value" class="rlf-err">请填写标记备注</p>
  </section>
</template>

<style scoped>
/* 🔴 段**不带外框、不带 h4 段头**：它是弹窗的主干字段，宿主的 flex gap 负责它与邻段的间距 */
.rlf {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.rlf-row {
  gap: 14px;
  margin: 0;
}
/* 标签横排在左，宽度自带 —— 不跟着宿主的 op-field-h 默认宽度跑 */
.rlf-row > .rlf-label {
  flex: none;
  width: 72px;
  text-align: right;
  white-space: nowrap;
}
.rlf-cards {
  flex: 1;
  min-width: 0;
  gap: 4px;
}
/* 四档并排一行的紧凑卡片（原先挂在风险监控页 .tag-modal-form 作用域里的那一套，现自带） */
.rlf-card {
  padding: 2px 4px;
  min-height: 26px;
  border-radius: 5px;
  justify-content: center;
  text-align: center;
}
.rlf-card .op-rc-title {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
}
/* 已结论条目的「无风险」一档：置灰、不可选 */
.rlf-card-locked {
  cursor: not-allowed;
  color: #c0c4cc;
  background: #f5f5f5;
  border-color: #e5e7eb;
}
.rlf-card-locked .op-rc-title { color: #c0c4cc; }
/* 脚注与红字都顶到控件左沿（标签 72px + 间距 14px） */
.rlf-foot,
.rlf-err {
  margin: -2px 0 0 86px;
  font-size: 11px;
  line-height: 1.4;
}
.rlf-foot { color: #9ca3af; }
.rlf-err { color: #ef4444; }
.rlf-row-note :deep(textarea.ant-input) { font-size: 13px; }
</style>
