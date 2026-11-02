<script setup lang="ts">
// 切换派单方式弹窗（PRD 5.4）：全局或某个工单池；「切换为」固定列出三种派单方式，当前派单方式置灰
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { SwapOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import { useDispatchStore } from '@/stores/dispatch';
import { POOL_MODES, type PoolMode } from '@/views/tickets/types/dispatch';
import { MODE_TONE } from './dispatchUi';

const props = defineProps<{ open: boolean; scope: 'global' | string }>();
const emit = defineEmits<{ 'update:open': [v: boolean]; done: [] }>();
const store = useDispatchStore();

const isGlobal = computed(() => props.scope === 'global');
const scopeText = computed(() => (isGlobal.value ? '全局' : store.poolLabel(props.scope)));
const currentShown = computed<PoolMode>(() => (isGlobal.value ? store.globalEffectiveMode() : store.poolModeOf(props.scope)));
/** 与 store 比较的当前值：全局取全局派单方式（开关关闭时为人工派单），工单池取本池派单方式 */
const currentRaw = computed<PoolMode>(() => {
  if (isGlobal.value) return store.config.globalSwitch ? store.config.globalMode : '人工派单';
  return store.poolOf(props.scope)?.mode ?? '自动派单';
});
const choices = computed(() => POOL_MODES.map((m) => ({
  mode: m,
  current: m === currentRaw.value,
  switchOff: m !== currentRaw.value && isGlobal.value && !store.config.globalSwitch && m !== '人工派单',
})));

const target = ref<PoolMode | undefined>(undefined);
const reason = ref('');
watch(() => props.open, (v) => { if (v) { target.value = undefined; reason.value = ''; } });

const reasonRequired = computed(() => !!target.value && target.value !== '自动派单');

function submit() {
  if (!target.value) { message.error('请选择切换后的派单方式'); return; }
  if (reasonRequired.value && !reason.value.trim()) { message.error('请填写切换原因'); return; }
  if (reason.value.length > 200) { message.error('切换原因最多 200 字'); return; }
  const r = isGlobal.value
    ? store.setGlobalMode(target.value, reason.value.trim())
    : store.setPoolMode(props.scope, target.value, reason.value.trim());
  if (!r.ok) { message.error(r.message); return; }
  message.success(r.message);
  emit('update:open', false);
  emit('done');
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="切换派单方式"
    :icon="SwapOutlined"
    tone="warn"
    ok-text="确认切换"
    :width="500"
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="op-form">
      <div class="op-tip op-tip-warn">已派出、已领取的工单不收回</div>
      <div class="op-field op-field-h">
        <span class="op-label">范围</span>
        <span class="pm-val">{{ scopeText }}</span>
      </div>
      <div class="op-field op-field-h">
        <span class="op-label">当前派单方式</span>
        <a-tag :color="MODE_TONE[currentShown]" class="pm-tag">{{ currentShown }}</a-tag>
      </div>
      <div class="op-field op-field-h">
        <span class="op-label req">切换为</span>
        <a-radio-group v-model:value="target">
          <template v-for="c in choices" :key="c.mode">
            <a-tooltip v-if="c.switchOff" title="全局开关已关闭，请先在派单策略开启">
              <a-radio :value="c.mode" disabled>{{ c.mode }}</a-radio>
            </a-tooltip>
            <a-radio v-else :value="c.mode" :disabled="c.current">{{ c.mode }}</a-radio>
          </template>
        </a-radio-group>
      </div>
      <div class="op-field op-field-h op-field-h-top">
        <span class="op-label" :class="{ req: reasonRequired }">切换原因</span>
        <div class="pm-grow"><a-textarea v-model:value="reason" :rows="3" :maxlength="200" show-count placeholder="请填写切换原因" /></div>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.pm-val { font-size: 13px; color: #111827; }
.pm-tag { margin: 0; }
.pm-grow { flex: 1; min-width: 0; }
</style>
