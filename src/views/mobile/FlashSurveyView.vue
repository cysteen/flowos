<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CheckCircleFilled, InfoCircleFilled } from '@ant-design/icons-vue';
import FlashMobileShell from './FlashMobileShell.vue';
import { normalizeFlashNo } from './useFlashProgress';
import { useFlashStore } from '@/stores/flash';
import { FLASH_FIELD_LABELS as L } from '@/views/tickets/types/flash';

/**
 * 用户侧回访评价页（930 教育刷机单 PRD §8 / M86）：调研短信里的评价链接 `/m/flash/survey?no=` 进入。
 * 「是否已解决」「满意度」必填，补充说明选填；提交即记回访结论（已解决 → 已结案；未解决 → 教育刷机处理组池）。
 * 结果态：提交成功 / 已评价过 / 不在调研中 / 查不到单号。
 */
const route = useRoute();
const router = useRouter();
const flash = useFlashStore();

const no = computed(() => (typeof route.query.no === 'string' ? normalizeFlashNo(route.query.no) : ''));

/** 轮询本单版本号：处理页在另一页签改了本单（催补拉回、超时结案），本页随之切换结果态 */
const tick = ref(0);
let lastRev = -1;
let timer: number | undefined;
function poll() {
  const rev = no.value ? flash.revisionOf(no.value) : 0;
  if (rev !== lastRev) {
    lastRev = rev;
    tick.value += 1;
  }
}
onMounted(() => {
  poll();
  timer = window.setInterval(poll, 1000);
});
onBeforeUnmount(() => window.clearInterval(timer));

const gate = computed(() => {
  void tick.value;
  return no.value ? flash.surveyGateOf(no.value) : 'notFound';
});
const ticket = computed(() => {
  void tick.value;
  return no.value ? flash.flashOf(no.value) : undefined;
});
const summary = computed(() => {
  const f = ticket.value;
  if (!f) return [];
  return [
    { label: '单号', value: no.value, mono: true },
    { label: L.productModel, value: f.info.productModel },
    { label: L.sn, value: f.info.sn, mono: true },
    { label: L.reason, value: f.info.reason },
  ];
});
const recorded = computed(() => ticket.value?.state.survey);

const submitted = ref(false);
const form = reactive({ solved: '' as '' | 'yes' | 'no', score: 0, remark: '' });
const errors = reactive<{ solved?: string; score?: string }>({});

watch(() => form.solved, () => { errors.solved = undefined; });
watch(() => form.score, () => { errors.score = undefined; });
watch(no, () => {
  submitted.value = false;
  Object.assign(form, { solved: '', score: 0, remark: '' });
});

function submit() {
  errors.solved = form.solved ? undefined : '请选择是否已解决';
  errors.score = form.score ? undefined : '请选择满意度';
  if (errors.solved || errors.score) return;
  const res = flash.recordSurveyConclusion(no.value, form.solved === 'yes', { score: form.score, remark: form.remark });
  if (res.ok) submitted.value = true;
  tick.value += 1;
}

function openProgress() {
  router.push({ path: '/m/flash/progress', query: { no: no.value } });
}
</script>

<template>
  <!-- 提交成功 -->
  <FlashMobileShell v-if="submitted" title="服务评价">
    <section class="fs-result">
      <CheckCircleFilled class="fs-result__icon" />
      <h2 class="fs-result__title">感谢您的评价</h2>
      <div class="fs-result__no">单号：<span class="fs-mono">{{ no }}</span></div>
    </section>
  </FlashMobileShell>

  <!-- 单号查不到 -->
  <FlashMobileShell v-else-if="gate === 'notFound'" title="服务评价">
    <section class="fs-empty" role="status">未查询到该单号，请核对后重试</section>
  </FlashMobileShell>

  <!-- 已评价过 -->
  <FlashMobileShell v-else-if="gate === 'evaluated'" title="服务评价">
    <section class="fs-result">
      <CheckCircleFilled class="fs-result__icon" />
      <h2 class="fs-result__title">您已评价过本次服务</h2>
      <div class="fs-result__no">单号：<span class="fs-mono">{{ no }}</span></div>
    </section>
    <section v-if="recorded" class="fs-card">
      <dl class="fs-meta">
        <div class="fs-meta__row">
          <dt>问题是否已解决</dt>
          <dd>{{ recorded.solved ? '已解决' : '未解决' }}</dd>
        </div>
        <div class="fs-meta__row">
          <dt>满意度</dt>
          <dd><a-rate :value="recorded.score" disabled class="fs-rate--sm" /></dd>
        </div>
        <div v-if="recorded.remark" class="fs-meta__row fs-meta__row--block">
          <dt>补充说明</dt>
          <dd>{{ recorded.remark }}</dd>
        </div>
      </dl>
    </section>
  </FlashMobileShell>

  <!-- 不在调研中 -->
  <FlashMobileShell v-else-if="gate === 'unavailable'" title="服务评价">
    <section class="fs-result">
      <InfoCircleFilled class="fs-result__icon fs-result__icon--muted" />
      <h2 class="fs-result__title">该工单当前无需评价</h2>
      <div class="fs-result__no">单号：<span class="fs-mono">{{ no }}</span></div>
    </section>
    <template #footer>
      <a-button type="primary" size="large" block @click="openProgress">查看进度</a-button>
    </template>
  </FlashMobileShell>

  <!-- 评价表单 -->
  <FlashMobileShell v-else title="服务评价">
    <section class="fs-card">
      <dl class="fs-meta">
        <div v-for="row in summary" :key="row.label" class="fs-meta__row">
          <dt>{{ row.label }}</dt>
          <dd :class="{ 'fs-mono': row.mono }">{{ row.value }}</dd>
        </div>
      </dl>
    </section>

    <section class="fs-card">
      <div class="fs-field">
        <label class="fs-label is-required">您的刷机问题是否已解决？</label>
        <div class="fs-choices" role="radiogroup">
          <button
            v-for="opt in [{ key: 'yes', text: '已解决' }, { key: 'no', text: '未解决' }]"
            :key="opt.key"
            type="button"
            role="radio"
            class="fs-choice"
            :class="{ 'is-active': form.solved === opt.key, 'is-error': errors.solved }"
            :aria-checked="form.solved === opt.key"
            @click="form.solved = opt.key as 'yes' | 'no'"
          >
            {{ opt.text }}
          </button>
        </div>
        <div v-if="errors.solved" class="fs-error">{{ errors.solved }}</div>
      </div>

      <div class="fs-field">
        <label class="fs-label is-required">满意度</label>
        <a-rate v-model:value="form.score" :allow-clear="false" class="fs-rate" />
        <div v-if="errors.score" class="fs-error">{{ errors.score }}</div>
      </div>

      <div class="fs-field fs-field--count">
        <label class="fs-label">补充说明</label>
        <a-textarea
          v-model:value="form.remark"
          :auto-size="{ minRows: 3, maxRows: 6 }"
          :maxlength="200"
          show-count
          placeholder="请输入"
        />
      </div>
    </section>

    <template #footer>
      <a-button type="primary" size="large" block @click="submit">提交评价</a-button>
    </template>
  </FlashMobileShell>
</template>

<style scoped>
.fs-card {
  margin-bottom: 12px;
  padding: 4px 16px;
  border-radius: 10px;
  background: #fff;
}
.fs-meta {
  margin: 0;
  padding: 6px 0;
}
.fs-meta__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  font-size: 14px;
}
.fs-meta__row dt {
  flex: none;
  color: #86909c;
  font-weight: 400;
}
.fs-meta__row dd {
  min-width: 0;
  margin: 0;
  color: #1d2129;
  text-align: right;
  word-break: break-all;
}
.fs-meta__row--block {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.fs-meta__row--block dd {
  text-align: left;
}
.fs-field {
  padding: 12px 0;
}
.fs-field--count {
  padding-bottom: 34px;
}
.fs-field + .fs-field {
  border-top: 1px solid #f2f3f5;
}
.fs-label {
  display: block;
  margin-bottom: 10px;
  color: #1d2129;
  font-size: 15px;
  font-weight: 500;
}
.fs-label.is-required::before {
  margin-right: 2px;
  color: #f53f3f;
  content: '*';
}
.fs-choices {
  display: flex;
  gap: 12px;
}
.fs-choice {
  flex: 1;
  height: 42px;
  border: 1px solid #d0d5de;
  border-radius: 8px;
  background: #fff;
  color: #1d2129;
  font-size: 15px;
  cursor: pointer;
}
.fs-choice.is-error {
  border-color: #f53f3f;
}
.fs-choice.is-active {
  border-color: #1a6fff;
  background: #eef4ff;
  color: #1a6fff;
  font-weight: 600;
}
.fs-rate {
  font-size: 30px;
}
.fs-rate--sm {
  font-size: 16px;
}
.fs-error {
  margin-top: 6px;
  color: #f53f3f;
  font-size: 13px;
  line-height: 1.4;
}
.fs-result {
  padding: 32px 16px 24px;
  text-align: center;
}
.fs-result__icon {
  color: #00b42a;
  font-size: 56px;
}
.fs-result__icon--muted {
  color: #86909c;
}
.fs-result__title {
  margin: 14px 0 6px;
  font-size: 20px;
  font-weight: 600;
}
.fs-result__no {
  color: #4e5969;
  font-size: 14px;
}
.fs-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #1d2129;
}
.fs-empty {
  padding: 40px 16px;
  border-radius: 10px;
  background: #fff;
  color: #86909c;
  font-size: 14px;
  text-align: center;
}
</style>
