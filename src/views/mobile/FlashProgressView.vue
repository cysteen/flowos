<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { SearchOutlined } from '@ant-design/icons-vue';
import FlashMobileShell from './FlashMobileShell.vue';
import FlashProgressSteps from './FlashProgressSteps.vue';
import { normalizeFlashNo, useFlashProgress } from './useFlashProgress';

/**
 * 进度页（930 教育刷机单 PRD §2.5 / 页面规格 P2 · P0-7）：输入单号查询 → 步骤条 + 当前进度文案 + 最近更新时间；
 * 带 `?no=` 进入直接展示；查不到提示「未查询到该单号，请核对后重试」。
 */
const route = useRoute();
const router = useRouter();

const keyword = ref('');
/** 已查询的单号（空 ＝ 未查询） */
const queried = ref('');
const { snapshot } = useFlashProgress(queried);

const notFound = computed(() => !!queried.value && !snapshot.value);

function applyQuery(raw: unknown) {
  const no = typeof raw === 'string' ? normalizeFlashNo(raw) : '';
  keyword.value = no;
  queried.value = no;
}

watch(() => route.query.no, applyQuery, { immediate: true });

function search() {
  const no = normalizeFlashNo(keyword.value);
  if (!no) return;
  if (no === route.query.no) {
    queried.value = no;
    return;
  }
  router.replace({ path: route.path, query: { no } });
}

function goBack() {
  if (window.history.length > 1) router.back();
  else router.replace('/m/flash/apply');
}
</script>

<template>
  <FlashMobileShell title="刷机进度" back @back="goBack">
    <section class="fp-search">
      <a-input
        v-model:value="keyword"
        size="large"
        placeholder="请输入单号"
        allow-clear
        @press-enter="search"
      >
        <template #prefix><SearchOutlined class="fp-search__icon" /></template>
      </a-input>
      <a-button type="primary" size="large" :disabled="!keyword.trim()" @click="search">查询</a-button>
    </section>

    <section v-if="snapshot" class="fp-card">
      <div class="fp-card__head">
        <span class="fp-card__label">单号</span>
        <span class="fp-mono">{{ snapshot.no }}</span>
      </div>
      <div class="fp-card__steps">
        <FlashProgressSteps :stage="snapshot.stage" />
      </div>
      <dl class="fp-meta">
        <div class="fp-meta__row">
          <dt>当前进度</dt>
          <dd class="fp-meta__stage">{{ snapshot.text }}</dd>
        </div>
        <div class="fp-meta__row">
          <dt>最近更新时间</dt>
          <dd>{{ snapshot.updatedAt }}</dd>
        </div>
      </dl>
    </section>

    <section v-else-if="notFound" class="fp-empty" role="status">
      未查询到该单号，请核对后重试
    </section>
  </FlashMobileShell>
</template>

<style scoped>
.fp-search {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 10px;
  background: #fff;
}
.fp-search :deep(.ant-input-affix-wrapper) {
  flex: 1;
  min-width: 0;
}
.fp-search__icon {
  color: #9aa1ad;
}
.fp-card {
  border-radius: 10px;
  background: #fff;
}
.fp-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid #f2f3f5;
  font-size: 15px;
}
.fp-card__label {
  color: #86909c;
}
.fp-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #1d2129;
  word-break: break-all;
}
.fp-card__steps {
  padding: 20px 8px 18px;
  border-bottom: 1px solid #f2f3f5;
}
.fp-meta {
  margin: 0;
  padding: 6px 16px;
}
.fp-meta__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  font-size: 14px;
}
.fp-meta__row dt {
  color: #86909c;
  font-weight: 400;
}
.fp-meta__row dd {
  margin: 0;
  color: #1d2129;
  text-align: right;
}
.fp-meta__stage {
  color: #1a6fff !important;
  font-weight: 600;
}
.fp-empty {
  padding: 40px 16px;
  border-radius: 10px;
  background: #fff;
  color: #86909c;
  font-size: 14px;
  text-align: center;
}
</style>
