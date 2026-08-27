<script setup lang="ts">
/**
 * 全局搜索（顶栏）
 *
 * 查询中心（方案 A）：侧栏单一入口 + 页内「查工单 / 查客户」双视图。
 *
 * 分流判定与页内搜索条**共用** `queryCenterSearch`（PRD-915 §3.2「顶栏与页内共用同一套」）。
 * 🔴 C1 改向：手机号 / 设备 SN / 客户名**不再分流到查客户**，一律落查工单列表；
 * 只有「工单号精确命中唯一一张」才直跳工单操作页（§3.2 落点列、§8 规则 3）。
 * 原实现会把这三类送进查客户，坐席想看单却落到客户档案页，还得再点一次。
 */
import { queryCenterLocation } from '@/views/query/queryCenterRoute';
import {
  EMPTY_QUERY_TIP,
  normalizeQuery,
  QUERY_PLACEHOLDER,
  queryKindLabel,
  resolveSearchTarget,
  TRUNCATED_TIP,
} from '@/views/query/queryCenterSearch';
import { computed, nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { SearchOutlined, RightOutlined } from '@ant-design/icons-vue';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const user = useUserStore();

const keyword = ref('');
const focused = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

/**
 * 无查询中心权限的角色**整个搜索框不展示**（PRD-915 §3.4：一线坐席「菜单与顶栏搜索框一并
 * 不展示（不是置灰）」）。判据必须是 `query-center` —— 原来读的是 `tickets`，
 * 而一线恰恰有 `tickets` 菜单，于是它反倒拿到了查询中心入口（C4）。
 */
const canSearch = computed(() => user.canAccess('query-center'));

const kindLabel = computed(() => queryKindLabel(keyword.value));

/** 按输入内容推导落点；与页内搜索条同源，避免两处判断不一致 */
const suggestion = computed(() => {
  const { text } = normalizeQuery(keyword.value);
  if (!text) return null;
  const target = resolveSearchTarget(text);
  if (target.to === 'ticket') {
    return {
      to: 'ticket' as const,
      ticketNo: target.ticketNo,
      title: `${target.ticketNo}　${target.title}`,
      hint: '打开工单详情',
    };
  }
  return {
    to: 'list' as const,
    title: `在查工单列表检索「${text}」`,
    hint: target.hint ?? `按${kindLabel.value}检索全租户工单`,
  };
});

function go() {
  const { text, truncated } = normalizeQuery(keyword.value);
  // E1 空输入不发起检索
  if (!text) {
    message.info(EMPTY_QUERY_TIP);
    inputRef.value?.focus();
    return;
  }
  if (truncated) message.warning(TRUNCATED_TIP);

  const target = resolveSearchTarget(text);
  if (target.to === 'ticket') {
    router.push(`/tickets/${target.ticketNo}`);
  } else {
    if (target.hint) message.info(target.hint);
    router.push(queryCenterLocation('tickets', { kw: text }));
  }
  close();
}

function close() {
  keyword.value = '';
  focused.value = false;
  nextTick(() => inputRef.value?.blur());
}
</script>

<template>
  <div v-if="canSearch" class="gs" :class="{ open: focused && !!suggestion }">
    <div class="gs-box">
      <SearchOutlined class="gs-ic" />
      <input
        ref="inputRef"
        v-model="keyword"
        class="gs-input"
        :placeholder="QUERY_PLACEHOLDER"
        @focus="focused = true"
        @blur="focused = false"
        @keyup.enter="go()"
        @keyup.esc="close"
      />
      <span v-if="kindLabel && keyword.trim()" class="gs-kind">{{ kindLabel }}</span>
    </div>

    <!-- mousedown 而非 click：blur 会先触发，click 就丢了 -->
    <div v-if="focused && suggestion" class="gs-panel" @mousedown.prevent>
      <button type="button" class="gs-row" @click="go()">
        <div class="gs-main">{{ suggestion.title }}</div>
        <div class="gs-hint">{{ suggestion.hint }}</div>
        <RightOutlined class="gs-arrow" />
      </button>
      <div class="gs-foot">回车直达 · Esc 关闭</div>
    </div>
  </div>
</template>

<style scoped>
.gs { position: relative; flex: none; width: 260px; }
.gs-box {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid #e5e7eb;
  border-radius: 15px;
  background: #f8fafc;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.gs.open .gs-box,
.gs-box:focus-within {
  border-color: #1a6fff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(26, 111, 255, 0.1);
}
.gs-ic { color: #9ca3af; font-size: 13px; flex: none; }
.gs-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
  color: #111827;
  font-family: inherit;
}
.gs-input::placeholder { color: #b9c0cb; }
.gs-kind {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  color: #1a6fff;
  background: #eff6ff;
  border-radius: 3px;
  padding: 1px 6px;
  white-space: nowrap;
}

.gs-panel {
  position: absolute;
  top: 36px;
  left: 0;
  right: 0;
  min-width: 340px;
  background: #fff;
  border: 1px solid #eef2f7;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(17, 24, 39, 0.14);
  padding: 6px;
  z-index: 60;
}
.gs-group { font-size: 11px; color: #9ca3af; padding: 4px 8px 6px; }
.gs-row {
  position: relative;
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  border-radius: 6px;
  padding: 8px 26px 8px 10px;
  cursor: pointer;
  font-family: inherit;
}
.gs-row:hover { background: #f8fbff; }
.gs-main { font-size: 13px; font-weight: 600; color: #111827; white-space: pre; }
.gs-role {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 500;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 3px;
  padding: 1px 6px;
}
.gs-hint { font-size: 11px; color: #9ca3af; margin-top: 2px; }
.gs-arrow { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: #c3cbd6; font-size: 11px; }
.gs-foot {
  border-top: 1px solid #f3f4f6;
  margin-top: 4px;
  padding: 6px 10px 2px;
  font-size: 10px;
  color: #c3cbd6;
}

@media (max-width: 1200px) {
  .gs { width: 180px; }
}
</style>
