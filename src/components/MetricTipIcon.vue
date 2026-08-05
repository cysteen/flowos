<script setup lang="ts">
/**
 * 指标口径「?」——个人门户 / 班组看板 / 运营监控共用。
 * **只展示一句话**（这个数是什么），完整口径以 PRD 为准。
 */
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import type { KpiTip } from '@/mock/homeOverview';

defineProps<{ tip: KpiTip }>();

/**
 * ⚠️ 外层必须一并放宽：antd 的 .ant-tooltip 默认 max-width 250px，
 * 只设 inner 的 maxWidth 不生效，三行文案会被挤成五六行。
 */
const overlayWrapStyle = { maxWidth: '340px' };
const overlayStyle = {
  maxWidth: '340px',
  color: '#713f12',
  fontSize: '12px',
  lineHeight: '1.6',
  padding: '10px 12px',
};
</script>

<template>
  <a-tooltip
    placement="top"
    :mouse-enter-delay="0.1"
    color="#fffbeb"
    :overlay-style="overlayWrapStyle"
    :overlay-inner-style="overlayStyle"
  >
    <template #title>
      <!-- 一句话：这个数是什么 -->
      <p class="kt-define">{{ tip.define }}</p>
    </template>
    <span class="kpi-tip-wrap" @click.stop>
      <QuestionCircleOutlined class="kpi-tip-ic" />
    </span>
  </a-tooltip>
</template>

<style scoped>
.kt-define {
  margin: 0;
  font-size: 12px;
  color: #713f12;
  line-height: 1.5;
}
.kpi-tip-wrap {
  display: inline-flex;
  flex: none;
  align-items: center;
  line-height: 1;
}
.kpi-tip-ic {
  flex-shrink: 0;
  color: #9ca3af;
  font-size: 12px;
  cursor: help;
  opacity: 0.7;
  transition: opacity 0.15s, color 0.15s;
}
.kpi-tip-ic:hover {
  color: #1a6fff;
  opacity: 1;
}
</style>
