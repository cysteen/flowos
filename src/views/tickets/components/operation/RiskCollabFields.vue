<script setup lang="ts">
import type { RiskCollabFieldsCtl } from '@/composables/useRiskCollabFields';

/**
 * **协同处理**那一段字段：评估意见（必填）· 建议事项（多选）·「其他」的具体建议
 * （勾了「其他」时条件必填）。
 *
 * 🔴 **两处共用这一个组件**：工单处理页页头「风险管控」弹窗的投诉支
 * （`OpRiskControlModal.vue`）与风险工单池的协同处理弹窗（`OpRiskCollabModal.vue`）。
 * 字段、顺序、占位文案与红字提示只在这里改；风险监控页「风险管控」弹窗下半的投诉支
 * 随后也接这一份。
 *
 * 取值域与校验全在 `composables/useRiskCollabFields.ts`，本组件只渲染：
 * `ctl` 是那个 composable 的实例 —— 每处**只持一份**。
 *
 * 样式**自带、不依赖外层**（与 `EscalateComplaintFields.vue` 同形）：
 * 借宿主弹窗的类名会让同一段字段在两处长得不一样。
 */
defineProps<{ ctl: RiskCollabFieldsCtl }>();
</script>

<template>
  <!-- 段名恒为「风险处理措施」（六处「风险管控」弹窗③段同名，2026-09-29 追加裁决） -->
  <section class="rcf" aria-label="风险处理措施">
    <h4 class="rcf-title">风险处理措施</h4>

    <div class="rcf-field">
      <label class="rcf-label"><span class="rcf-req">*</span>评估意见</label>
      <a-textarea
        v-model:value="ctl.fields.opinion"
        :rows="4"
        :status="ctl.errors.opinion ? 'error' : undefined"
        placeholder="写清这张单当前的风险判断，以及要处理人怎么调整处理方式…"
      />
      <p v-if="ctl.errors.opinion" class="rcf-err">{{ ctl.errors.opinion }}</p>
    </div>

    <!-- 建议事项：标签与多选项同一行（标签左、复选组右），窄屏放不下才换行 -->
    <div class="rcf-field rcf-field-h">
      <label class="rcf-label">建议事项</label>
      <a-checkbox-group
        v-model:value="ctl.fields.advices"
        :options="ctl.adviceOptions"
        class="rcf-advices"
      />
    </div>

    <div v-if="ctl.needsOther.value" class="rcf-field">
      <label class="rcf-label"><span class="rcf-req">*</span>「其他」的具体建议</label>
      <a-input
        v-model:value="ctl.fields.otherAdvice"
        :status="ctl.errors.otherAdvice ? 'error' : undefined"
        placeholder="一句话说清要处理人做什么"
      />
      <p v-if="ctl.errors.otherAdvice" class="rcf-err">{{ ctl.errors.otherAdvice }}</p>
    </div>
  </section>
</template>

<style scoped>
.rcf {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}
.rcf-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.rcf-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.rcf-label {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
}
.rcf-req {
  margin-right: 2px;
  color: #ef4444;
}
/*
 * 横排字段（标签左、控件右），几何与弹窗通用的 .op-field-h 同口径（行向、gap 10px、标签不压缩）。
 * 复选组给一个 flex-basis 兜底：窄屏放不下时整组落到下一行，标签不会被挤成竖排。
 */
.rcf-field-h {
  flex-direction: row;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.rcf-field-h > .rcf-label { flex: none; }
.rcf-field-h > .rcf-advices { flex: 1 1 260px; min-width: 0; }
.rcf-advices { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; }
.rcf-err {
  margin: 0;
  font-size: 11px;
  color: #ef4444;
  line-height: 1.4;
}
</style>
