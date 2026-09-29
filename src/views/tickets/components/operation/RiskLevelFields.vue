<script setup lang="ts">
import type { RiskLevelFieldsCtl } from '@/composables/useRiskLevelFields';
import { NO_RISK_LOCKED_TIP } from '@/stores/riskQueue';
import { NO_RISK, RISK_TAG_RESULTS } from '@/stores/riskShared';
import { riskLevelText } from '@/config/risk';

/**
 * **风险等级**那一段字段：四选一（高 / 中 / 低 / 无风险）+ 标记备注。
 *
 * 🔴 **两处共用这一个组件**（2026-09-29「弹窗全站统一」裁决给那两个评估入口补的那一段）：
 * 风险监控页的评估处置工作面与工单工作台的风险报备池。取值域、必填规则与落库全在
 * `composables/useRiskLevelFields.ts`，本组件只渲染：`ctl` 是那个 composable 的实例
 * —— 每处**只持一份**。
 *
 * 四选一而不是"有没有风险 + 等级"两个字段：拆开会立刻长出"无风险却带着等级"
 * "有风险却没等级"两种非法组合，而这两种组合恰恰决定条目进不进池。
 *
 * 样式**自带、不依赖外层**（与 `RiskCollabFields.vue` / `EscalateComplaintFields.vue` 同形）：
 * 借宿主弹窗的类名会让同一段字段在两处长得不一样。
 */
defineProps<{ ctl: RiskLevelFieldsCtl }>();
</script>

<template>
  <section v-if="ctl.visible.value" class="rlf" aria-label="风险等级">
    <h4 class="rlf-title">风险等级</h4>

    <div class="rlf-field">
      <!-- 本来没有等级才标必填：已有等级的那一路是预置可改，不强制再选一次 -->
      <label class="rlf-label"><span v-if="ctl.required.value" class="rlf-req">*</span>风险等级</label>
      <a-radio-group v-model:value="ctl.fields.level" class="rlf-levels">
        <!-- 已结论的条目「无风险」一档置灰（store 侧 recordTag 同样拒绝），见 ctl.noRiskLocked -->
        <a-radio
          v-for="r in RISK_TAG_RESULTS"
          :key="r"
          :value="r"
          :disabled="r === NO_RISK && ctl.noRiskLocked.value"
          :title="r === NO_RISK && ctl.noRiskLocked.value ? NO_RISK_LOCKED_TIP : undefined"
        >{{ r === NO_RISK ? NO_RISK : riskLevelText(r) }}</a-radio>
      </a-radio-group>
      <p v-if="ctl.missLevel.value" class="rlf-err">请选择风险等级</p>
      <p v-else class="rlf-foot">
        <template v-if="ctl.noRiskLocked.value">{{ NO_RISK_LOCKED_TIP }}。</template>
        标为 低 / 中 / 高 即进风险工单池；标为「无风险」不进池。
      </p>
    </div>

    <!--
      标记备注。**改判时必填**（原来那格「修正原因」已并进来，2026-09-29 裁决）：
      两格都在答"这一次是怎么判的、为什么"，改判时人得把同一件事写两遍。
      改判形态下本格从空开始、问法换成"为什么改"。
    -->
    <div class="rlf-field">
      <label class="rlf-label"><span v-if="ctl.isAmend.value" class="rlf-req">*</span>标记备注</label>
      <a-textarea
        v-model:value="ctl.fields.note"
        :rows="2"
        :status="ctl.missNote.value ? 'error' : undefined"
        :placeholder="ctl.isAmend.value
          ? '上一次判的是什么、这次为什么改…（必填）'
          : '判断依据与后续动作（可选）'"
      />
      <p v-if="ctl.missNote.value" class="rlf-err">请填写标记备注</p>
    </div>
  </section>
</template>

<style scoped>
.rlf {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}
.rlf-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.rlf-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.rlf-label {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
}
.rlf-req {
  margin-right: 2px;
  color: #ef4444;
}
/* 四档横排一行；窄屏放不下才换行（与协同段那排复选同一个做法） */
.rlf-levels { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; }
.rlf-foot {
  margin: 0;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.5;
}
.rlf-err {
  margin: 0;
  font-size: 11px;
  color: #ef4444;
  line-height: 1.4;
}
</style>
