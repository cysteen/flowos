<script setup lang="ts">
import { computed } from 'vue';
import { CheckOutlined } from '@ant-design/icons-vue';
import { FLASH_STEP_LABELS, type FlashUserStage, userStageStep } from './useFlashProgress';

/** 用户侧四步进度条：已受理 → 处理中 → 待回访 → 已完成（PRD §2.5） */
const props = defineProps<{ stage: FlashUserStage }>();

const current = computed(() => userStageStep(props.stage));

const steps = computed(() => FLASH_STEP_LABELS.map((label, i) => {
  // 已完成是终点：到达即整条完成
  const done = i < current.value || (props.stage === '已完成' && i === current.value);
  const active = i === current.value && !done;
  const desc = i === 1 && current.value === 1 ? props.stage : '';
  return { label, done, active, desc };
}));
</script>

<template>
  <ol class="fp-steps">
    <li
      v-for="(s, i) in steps"
      :key="s.label"
      class="fp-step"
      :class="{ 'is-done': s.done, 'is-active': s.active }"
    >
      <div class="fp-step__rail">
        <span class="fp-step__line fp-step__line--left" :class="{ 'is-hidden': i === 0, 'is-lit': s.done || s.active }" />
        <span class="fp-step__dot">
          <CheckOutlined v-if="s.done" />
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span class="fp-step__line fp-step__line--right" :class="{ 'is-hidden': i === steps.length - 1, 'is-lit': s.done }" />
      </div>
      <div class="fp-step__label">{{ s.label }}</div>
      <div v-if="s.desc" class="fp-step__desc">{{ s.desc }}</div>
    </li>
  </ol>
</template>

<style scoped>
.fp-steps {
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;
}
.fp-step {
  flex: 1;
  min-width: 0;
  text-align: center;
}
.fp-step__rail {
  display: flex;
  align-items: center;
}
.fp-step__line {
  flex: 1;
  height: 2px;
  background: #e5e8ef;
}
.fp-step__line.is-lit {
  background: #1a6fff;
}
.fp-step__line.is-hidden {
  visibility: hidden;
}
.fp-step__dot {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 2px solid #d0d5de;
  border-radius: 50%;
  background: #fff;
  color: #9aa1ad;
  font-size: 12px;
  font-weight: 600;
}
.is-done .fp-step__dot {
  border-color: #1a6fff;
  background: #1a6fff;
  color: #fff;
}
.is-active .fp-step__dot {
  border-color: #1a6fff;
  color: #1a6fff;
  box-shadow: 0 0 0 4px rgba(26, 111, 255, 0.14);
}
.fp-step__label {
  margin-top: 8px;
  color: #9aa1ad;
  font-size: 13px;
}
.is-done .fp-step__label {
  color: #4e5969;
}
.is-active .fp-step__label {
  color: #1a6fff;
  font-weight: 600;
}
.fp-step__desc {
  margin-top: 2px;
  color: #1a6fff;
  font-size: 12px;
}
</style>
