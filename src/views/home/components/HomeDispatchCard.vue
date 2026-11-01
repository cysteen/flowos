<script setup lang="ts">
/**
 * 【1215】个人门户 · 我的派单（PRD 6.5 / 7.3）：坐席本人只读查看本人人员画像、熟练度、个人上限，
 * 负载显示「在途 〈N〉 / 上限 〈M〉」，超限标橙、超额指派标红。仅参与派单的坐席显示。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useDispatchStore } from '@/stores/dispatch';
import { useUserStore } from '@/stores/user';
import { profileItems, SIGN_TONE } from '@/views/admin/dispatch/dispatchUi';

const dispatch = useDispatchStore();
const user = useUserStore();

const tick = ref(0);
const timer = window.setInterval(() => { tick.value += 1; }, 30_000);
onBeforeUnmount(() => window.clearInterval(timer));

const view = computed(() => {
  void tick.value;
  void dispatch.ticketStates;
  void dispatch.agents;
  return dispatch.agentView(user.name);
});
const groupText = computed(() => (view.value?.agent.groupIds ?? []).map((id) => dispatch.groupOf(id)?.label ?? id).join('、') || '—');
const capText = computed(() => {
  const v = view.value;
  if (!v) return '';
  return v.agent.capOverride == null ? `按默认值 ${v.defaultCapText}` : `个人值 ${v.agent.capOverride}`;
});
const dims = computed(() => (view.value ? profileItems(view.value.agent.profile) : []));
</script>

<template>
  <section v-if="view" class="overview-section hdc">
    <div class="section-head">
      <div class="section-title">我的派单</div>
      <a-tag :color="SIGN_TONE[view.agent.signIn]" class="hdc-sign">{{ view.agent.signIn }}</a-tag>
    </div>
    <div class="hdc-grid">
      <div class="hdc-kv">
        <span class="hdc-k">负载</span>
        <span class="hdc-v">
          <b class="hdc-num">在途 {{ view.inTransit }} / 上限 {{ view.cap }}</b>
          <span v-if="view.overAssigned" class="hdc-flag red">超额指派</span>
          <span v-else-if="view.overLimit" class="hdc-flag orange">超限</span>
        </span>
      </div>
      <div class="hdc-kv">
        <span class="hdc-k">个人上限</span>
        <span class="hdc-v">{{ capText }}</span>
      </div>
      <div class="hdc-kv">
        <span class="hdc-k">熟练度</span>
        <span class="hdc-v">{{ view.agent.proficiency }}</span>
      </div>
      <div class="hdc-kv">
        <span class="hdc-k">所属组</span>
        <span class="hdc-v">{{ groupText }}</span>
      </div>
    </div>
    <div class="hdc-profile">
      <div class="hdc-sub">
        人员画像
        <span v-if="!view.profileConfigured" class="hdc-flag orange">画像未配置</span>
      </div>
      <div class="hdc-grid">
        <div v-for="d in dims" :key="d.label" class="hdc-kv">
          <span class="hdc-k">{{ d.label }}</span>
          <span class="hdc-v" :title="d.text">{{ d.text }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.overview-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.section-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}
.hdc-sign { margin: 0; }
.hdc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px 24px;
}
.hdc-kv { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.hdc-k { flex: none; width: 56px; font-size: 12px; color: #9ca3af; }
.hdc-v {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hdc-num { font-weight: 600; color: #111827; font-variant-numeric: tabular-nums; }
.hdc-flag { font-size: 11px; line-height: 18px; padding: 0 5px; border-radius: 4px; white-space: nowrap; border: 1px solid transparent; font-weight: 400; }
.hdc-flag.orange { color: #d97706; background: #fffbeb; border-color: #fde68a; }
.hdc-flag.red { color: #dc2626; background: #fef2f2; border-color: #fecaca; }
.hdc-profile { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; border-top: 1px solid #f1f5f9; }
.hdc-sub { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #475569; }
</style>
