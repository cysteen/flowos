<script setup lang="ts">
/**
 * 全局搜索（顶栏）
 *
 * 解决的问题：工单列表与客户全景各有一个搜索框，坐席想查东西时得先决定"去哪个页面"。
 * 两个页面**用途不同不该合并**（一个按单、可批量操作；一个按人、只读分析），
 * 但**入口应当只有一个** —— 这里按输入内容自动分流：
 *   工单号  → 工单详情（LCMN-… / AS-… / 4 位以上数字）
 *   手机号  → 客户全景（11 位 1[3-9]xxxxxxxxx）
 *   设备 SN → 客户全景（SN-…）
 *   客户名  → 命中客户则去全景，多个则给候选
 *   其它词  → 工单列表并带上关键词筛选
 */
import { computed, nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import { SearchOutlined, RightOutlined } from '@ant-design/icons-vue';
import { detectQueryKind, searchCustomers, QUERY_KIND_LABEL, type CustomerCandidate } from '@/mock/customerInsight';
import { TICKETS } from '@/mock/tickets';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const user = useUserStore();

const keyword = ref('');
const focused = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

type Target = 'ticket' | 'customer' | 'list' | 'candidates';

interface Suggestion {
  target: Target;
  /** 主行文案 */
  title: string;
  /** 说明这一步会去哪 */
  hint: string;
  ticketNo?: string;
  phone?: string;
  candidates?: CustomerCandidate[];
}

const kindLabel = computed(() => (keyword.value.trim() ? QUERY_KIND_LABEL[detectQueryKind(keyword.value)] : ''));

/** 按输入内容推导落点；推导逻辑与客户全景页同源，避免两处判断不一致 */
const suggestion = computed<Suggestion | null>(() => {
  const q = keyword.value.trim();
  if (!q) return null;
  const kind = detectQueryKind(q);

  if (kind === 'ticket') {
    const key = q.toUpperCase();
    const hit = TICKETS.find((t) => t.no.toUpperCase() === key || t.no.endsWith(key));
    if (hit) {
      return { target: 'ticket', title: `${hit.no}　${hit.title}`, hint: '打开工单详情', ticketNo: hit.no };
    }
    // 工单库里没有这张单：可能是历史单，交给客户全景按单号反查报单客户
    const res = searchCustomers(q);
    if (res.candidates.length === 1) {
      return {
        target: 'customer',
        title: `${res.candidates[0].name}　${res.candidates[0].phone}`,
        hint: `工单 ${q} 的报单客户 · 打开客户全景`,
        phone: res.candidates[0].phone,
      };
    }
    return { target: 'list', title: `在工单列表中搜索「${q}」`, hint: '未在当前工单库中找到该单号' };
  }

  if (kind === 'phone' || kind === 'sn') {
    const res = searchCustomers(q);
    if (res.candidates.length === 1) {
      const c = res.candidates[0];
      return {
        target: 'customer',
        title: `${c.name}　${c.phone}`,
        hint: `${c.role} · 累计 ${c.ticketCount} 单 · 打开客户全景`,
        phone: c.phone,
      };
    }
    if (res.candidates.length > 1) {
      return { target: 'candidates', title: `匹配到 ${res.candidates.length} 位客户`, hint: '选择一位打开全景', candidates: res.candidates };
    }
    return { target: 'list', title: `在工单列表中搜索「${q}」`, hint: '未匹配到客户档案' };
  }

  // 姓名 / 关键词：先看是不是客户名，不是就当关键词交给工单列表
  const res = searchCustomers(q);
  if (res.candidates.length === 1) {
    const c = res.candidates[0];
    return {
      target: 'customer',
      title: `${c.name}　${c.phone}`,
      hint: `${c.role} · 累计 ${c.ticketCount} 单 · 打开客户全景`,
      phone: c.phone,
    };
  }
  if (res.candidates.length > 1) {
    return { target: 'candidates', title: `匹配到 ${res.candidates.length} 位客户`, hint: '选择一位打开全景', candidates: res.candidates };
  }
  return { target: 'list', title: `在工单列表中搜索「${q}」`, hint: '按关键词检索工单标题与内容' };
});

/** 监控岗菜单里没有工单列表，关键词检索对它无意义 */
const canOpenList = computed(() => user.canAccess('tickets'));

function go(s: Suggestion | null = suggestion.value) {
  if (!s) return;
  if (s.target === 'ticket' && s.ticketNo) {
    router.push(`/tickets/${s.ticketNo}`);
  } else if (s.target === 'customer' && s.phone) {
    router.push({ path: '/customer-insight', query: { q: s.phone } });
  } else if (s.target === 'candidates') {
    router.push({ path: '/customer-insight', query: { q: keyword.value.trim() } });
  } else if (canOpenList.value) {
    router.push({ path: '/tickets/list', query: { kw: keyword.value.trim() } });
  } else {
    router.push({ path: '/customer-insight', query: { q: keyword.value.trim() } });
  }
  close();
}

function pick(c: CustomerCandidate) {
  router.push({ path: '/customer-insight', query: { q: c.phone } });
  close();
}

function close() {
  keyword.value = '';
  focused.value = false;
  nextTick(() => inputRef.value?.blur());
}
</script>

<template>
  <div class="gs" :class="{ open: focused && !!suggestion }">
    <div class="gs-box">
      <SearchOutlined class="gs-ic" />
      <input
        ref="inputRef"
        v-model="keyword"
        class="gs-input"
        placeholder="工单号 / 手机号 / 客户名 / 关键词"
        @focus="focused = true"
        @blur="focused = false"
        @keyup.enter="go()"
        @keyup.esc="close"
      />
      <span v-if="kindLabel && keyword.trim()" class="gs-kind">{{ kindLabel }}</span>
    </div>

    <!-- mousedown 而非 click：blur 会先触发，click 就丢了 -->
    <div v-if="focused && suggestion" class="gs-panel" @mousedown.prevent>
      <template v-if="suggestion.target === 'candidates'">
        <div class="gs-group">{{ suggestion.title }}</div>
        <button
          v-for="c in suggestion.candidates"
          :key="c.phone"
          type="button"
          class="gs-row"
          @click="pick(c)"
        >
          <div class="gs-main">{{ c.name }}<span class="gs-role">{{ c.role }}</span></div>
          <div class="gs-hint">{{ c.phone }} · 累计 {{ c.ticketCount }} 单 · 最近 {{ c.lastAt }}</div>
          <RightOutlined class="gs-arrow" />
        </button>
      </template>
      <button v-else type="button" class="gs-row" @click="go()">
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
