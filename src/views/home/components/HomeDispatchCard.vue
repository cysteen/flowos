<script setup lang="ts">
/**
 * 【1215】个人门户 · 我的派单（PRD 6.5 / 7.3）：只读，仅参与派单的坐席显示。
 * 三层：① 在途 / 上限（负载条）· 今日派给我 · 熟练度；② 个人上限来源；③ 所属组与人员画像。
 * 签入状态只看顶部话务条，本卡不重复展示。
 * 「今日派给我」取派单日志：今日正式派单下引擎派给本人的判定（与分派监控「派出量」同口径）。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useDispatchStore } from '@/stores/dispatch';
import { useUserStore } from '@/stores/user';
import { profileItems } from '@/views/admin/dispatch/dispatchUi';
import { isEngineAssign, parseAt } from '@/views/admin/dispatch/dispatchMetrics';

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

const loadPct = computed(() => {
  const v = view.value;
  if (!v || !v.cap) return 0;
  return Math.min(100, Math.round((v.inTransit / v.cap) * 100));
});
const loadFull = computed(() => !!view.value && view.value.inTransit >= view.value.cap);

const todayAssigned = computed(() => {
  void tick.value;
  const name = user.name;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const from = start.getTime();
  return dispatch.logs.filter((l) => isEngineAssign(l) && l.chosen?.name === name && parseAt(l.at) >= from).length;
});

const capText = computed(() => {
  const v = view.value;
  if (!v) return '';
  return v.agent.capOverride == null ? `按默认值 ${v.defaultCapText}` : `个人值 ${v.agent.capOverride}`;
});

const groups = computed(() => (view.value?.agent.groupIds ?? []).map((id) => dispatch.groupOf(id)?.label ?? id));

const dims = computed(() => (view.value ? profileItems(view.value.agent.profile) : []));
const allAny = computed(() => dims.value.length > 0 && dims.value.every((d) => d.text === '不限'));
</script>

<template>
  <section v-if="view" class="overview-section hdc">
    <div class="section-head">
      <div class="section-title">我的派单</div>
    </div>

    <div class="hdc-stats">
      <div class="hdc-stat">
        <span class="hdc-lb">
          在途 / 上限
          <span v-if="view.overAssigned" class="hdc-mark is-bad">超额指派</span>
          <span v-else-if="view.overLimit" class="hdc-mark is-warn">超限</span>
        </span>
        <span class="hdc-val" :class="{ 'is-warn': loadFull }">{{ view.inTransit }}<i> / {{ view.cap }}</i></span>
        <span class="hdc-bar" :class="{ 'is-warn': loadFull }"><i :style="{ width: `${loadPct}%` }" /></span>
      </div>
      <div class="hdc-stat">
        <span class="hdc-lb">今日派给我</span>
        <span class="hdc-val">{{ todayAssigned }}</span>
      </div>
      <div class="hdc-stat">
        <span class="hdc-lb">熟练度</span>
        <span class="hdc-val hdc-val-text">{{ view.agent.proficiency }}</span>
      </div>
    </div>

    <div class="hdc-cap">个人上限：{{ capText }}</div>

    <div class="hdc-foot">
      <div class="hdc-groups">
        <span v-for="g in groups" :key="g" class="hdc-chip">{{ g }}</span>
      </div>
      <div v-if="!view.profileConfigured" class="hdc-profile is-warn">画像未配置，暂不接自动派单</div>
      <div v-else-if="allAny" class="hdc-profile">人员画像：全部不限</div>
      <div v-else class="hdc-profile hdc-dims">
        <span v-for="d in dims" :key="d.label" class="hdc-dim" :title="`${d.label}：${d.text}`"><em>{{ d.label }}：</em>{{ d.text }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.overview-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 12px;
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  min-width: 0;
  container-type: inline-size;
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

/* ① 关键数 */
.hdc-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
}
.hdc-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 2px 16px;
  border-left: 1px solid #f0f1f3;
}
.hdc-stat:first-child { padding-left: 0; border-left: 0; }
.hdc-lb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}
.hdc-mark { font-size: 12px; }
.hdc-mark.is-warn { color: #d97706; }
.hdc-mark.is-bad { color: #dc2626; }
.hdc-val {
  font-size: 20px;
  line-height: 26px;
  font-weight: 700;
  color: #111827;
  font-variant-numeric: tabular-nums;
}
.hdc-val i { font-style: normal; font-size: 13px; font-weight: 500; color: #9ca3af; }
.hdc-val.is-warn { color: #d97706; }
.hdc-val-text { font-size: 16px; }
.hdc-bar {
  display: block;
  height: 4px;
  max-width: 160px;
  border-radius: 2px;
  background: #f1f2f4;
  overflow: hidden;
}
.hdc-bar i { display: block; height: 100%; border-radius: 2px; background: #9ca3af; }
.hdc-bar.is-warn i { background: #f59e0b; }

/* ② 个人上限来源 */
.hdc-cap { font-size: 12px; color: #9ca3af; line-height: 18px; }

/* ③ 所属组 · 人员画像 */
.hdc-foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid #f1f2f4;
}
.hdc-groups { display: flex; flex-wrap: wrap; gap: 6px; }
.hdc-chip {
  font-size: 12px;
  line-height: 20px;
  padding: 0 8px;
  border-radius: 4px;
  color: #4b5563;
  background: #f5f6f7;
}
.hdc-profile { font-size: 12px; line-height: 20px; color: #4b5563; }
.hdc-profile.is-warn { color: #d97706; }
.hdc-dims {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 16px;
  max-height: 40px;
  overflow: hidden;
}
.hdc-dim {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hdc-dim em { font-style: normal; color: #9ca3af; }

@container (max-width: 420px) {
  .hdc-stats { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .hdc-stat { padding: 0; border-left: 0; }
}
</style>
