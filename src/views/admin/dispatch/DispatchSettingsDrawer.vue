<script setup lang="ts">
// 用户管理 · 坐席行「派单设置」抽屉（PRD 14.7）：所属组只读、人员画像五维、熟练度、个人上限（7.5）、个人开关
import { computed, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { useDispatchStore } from '@/stores/dispatch';
import { PROFICIENCIES, type DispatchRole, type Proficiency } from '@/views/tickets/types/dispatch';
import ProfileDimEditor from './ProfileDimEditor.vue';
import { draftFromProfile, profileFromDraft, type ProfileDraft } from './profileDraft';

const props = defineProps<{ open: boolean; name: string | null }>();
const emit = defineEmits<{ 'update:open': [v: boolean]; saved: [] }>();
const store = useDispatchStore();

const agent = computed(() => store.agentOf(props.name));
const draft = ref<ProfileDraft>(draftFromProfile({ businessTypes: null, ticketTypes: null, products: null, problems: null, customerTypes: null }));
const proficiency = ref<Proficiency>('熟练');
const capValue = ref<number | undefined>(undefined);
const personal = ref(true);

watch(() => [props.open, props.name] as const, ([open]) => {
  const a = agent.value;
  if (!open || !a) return;
  draft.value = draftFromProfile(a.profile);
  proficiency.value = a.proficiency;
  capValue.value = a.capOverride ?? undefined;
  personal.value = a.personalSwitch;
}, { immediate: true });

const title = computed(() => (agent.value ? `派单设置 · ${agent.value.name}（${agent.value.staffNo}）` : '派单设置'));
const groupsText = computed(() => (agent.value?.groupIds ?? []).map((g) => store.groupOf(g)?.label ?? g).join('、') || '—');
const view = computed(() => (agent.value ? store.agentView(agent.value.name) : undefined));

/** 默认值随所选熟练度实时换算：「N（角色基准 B × 熟练度 系数）」 */
const defaultCapText = computed(() => {
  const a = agent.value;
  if (!a) return '—';
  const base = store.config.roleBase;
  const role = a.roles.reduce<DispatchRole>((best, r) => (base[r] > base[best] ? r : best), a.roles[0] ?? '二线专员');
  const coef = store.config.proficiencyCoef[proficiency.value];
  return `${Math.round(base[role] * coef)}（${role}基准 ${base[role]} × ${proficiency.value} ${coef}）`;
});
const personalTip = computed(() => {
  const a = agent.value;
  if (!a || !a.groupIds.length) return undefined;
  return a.groupIds.every((g) => store.groupOf(g)?.switchOn === false) ? '所在组均已退出自动派单，个人开关暂不生效' : undefined;
});

function close() { emit('update:open', false); }

function save() {
  const a = agent.value;
  if (!a) return;
  const profile = profileFromDraft(draft.value);
  const err = store.validateProfile(profile);
  if (err) { message.error(err); return; }
  const capNext = capValue.value ?? null;
  if (capNext !== null && (!Number.isInteger(capNext) || capNext < 1 || capNext > 50)) {
    message.error('请输入 1–50 的整数');
    return;
  }
  const capChanged = capNext !== a.capOverride;
  const commit = (force: boolean) => {
    const msgs: string[] = [];
    if (capChanged) {
      const r = store.setCapOverride(a.name, capNext, { force });
      if (r.needConfirm) {
        Modal.confirm({
          title: '调整个人上限',
          content: r.needConfirm,
          okText: '仍要保存',
          cancelText: '取消',
          onOk: () => commit(true),
        });
        return;
      }
      if (!r.ok) { message.error(r.message); return; }
      msgs.push(r.message);
    }
    if (JSON.stringify(profile) !== JSON.stringify(a.profile)) {
      const r = store.setProfile(a.name, profile, proficiency.value);
      if (!r.ok) { message.error(r.message); return; }
      msgs.push(r.message);
    } else if (proficiency.value !== a.proficiency) {
      const r = store.setProficiency(a.name, proficiency.value);
      if (r.message) msgs.push(r.message);
    }
    if (personal.value !== a.personalSwitch) {
      const r = store.setPersonalSwitch(a.name, personal.value);
      if (r.message) msgs.push(r.message);
    }
    [...new Set(msgs)].filter(Boolean).forEach((m) => message.success(m));
    emit('saved');
    close();
  };
  commit(false);
}
</script>

<template>
  <a-drawer :open="open" :title="title" :width="640" placement="right" @update:open="emit('update:open', $event)">
    <template v-if="agent">
      <div class="ds-sec">所属组</div>
      <div class="ds-ro">{{ groupsText }}</div>

      <div class="ds-sec">人员画像</div>
      <ProfileDimEditor v-model="draft" />

      <div class="ds-sec">熟练度</div>
      <a-radio-group v-model:value="proficiency">
        <a-radio v-for="p in PROFICIENCIES" :key="p" :value="p">{{ p }}</a-radio>
      </a-radio-group>

      <div class="ds-sec">个人上限</div>
      <div class="ds-kvs">
        <div class="ds-kv"><span>默认值</span><b>{{ defaultCapText }}</b></div>
        <div class="ds-kv">
          <span>个人值</span>
          <a-input-number v-model:value="capValue" :precision="0" placeholder="按默认值" style="width: 140px" />
        </div>
        <div class="ds-kv"><span>当前在途</span><b>在途 {{ view?.inTransit ?? 0 }}</b></div>
      </div>

      <div class="ds-sec">个人开关</div>
      <a-tooltip :title="personalTip">
        <a-switch v-model:checked="personal" :disabled="!!personalTip" />
      </a-tooltip>
    </template>
    <template #footer>
      <div class="ds-foot"><a-button @click="close">取消</a-button><a-button type="primary" @click="save">保存</a-button></div>
    </template>
  </a-drawer>
</template>

<style scoped>
.ds-sec { font-size: 13px; font-weight: 600; color: #111827; padding-left: 10px; border-left: 3px solid #1a6fff; margin: 20px 0 10px; }
.ds-sec:first-child { margin-top: 0; }
.ds-ro { font-size: 13px; color: #374151; }
.ds-kvs { display: flex; flex-direction: column; gap: 8px; max-width: 420px; }
.ds-kv { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; }
.ds-kv span { color: #6b7280; }
.ds-kv b { color: #374151; font-weight: 500; }
.ds-foot { display: flex; justify-content: flex-end; gap: 10px; }
</style>
