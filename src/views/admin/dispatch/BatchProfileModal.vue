<script setup lang="ts">
// 批量设置画像（PRD 6.5）：每维另加「不修改」，默认「不修改」；保存后逐人写入并记审计
import { ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { TeamOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import { useDispatchStore } from '@/stores/dispatch';
import { PROFICIENCIES, type Proficiency } from '@/views/tickets/types/dispatch';
import ProfileDimEditor from './ProfileDimEditor.vue';
import { keepDraft, patchFromDraft, type ProfileDraft } from './profileDraft';

const props = defineProps<{ open: boolean; names: string[] }>();
const emit = defineEmits<{ 'update:open': [v: boolean]; done: [] }>();
const store = useDispatchStore();

const draft = ref<ProfileDraft>(keepDraft());
const proficiency = ref<Proficiency | 'keep'>('keep');
watch(() => props.open, (v) => { if (v) { draft.value = keepDraft(); proficiency.value = 'keep'; } });

function submit() {
  const r = store.batchSetProfile(props.names, patchFromDraft(draft.value), proficiency.value === 'keep' ? undefined : proficiency.value);
  if (!r.ok) { message.error(r.message); return; }
  message.success(r.message);
  emit('update:open', false);
  emit('done');
}
</script>

<template>
  <OpActionModal
    :open="open"
    title="批量设置画像"
    :subtitle="`已选 ${names.length} 名坐席`"
    :icon="TeamOutlined"
    ok-text="保存"
    :width="680"
    @update:open="emit('update:open', $event)"
    @ok="submit"
  >
    <div class="op-form">
      <ProfileDimEditor v-model="draft" allow-keep />
      <div class="bp-row">
        <span class="bp-k">熟练度</span>
        <a-radio-group v-model:value="proficiency">
          <a-radio value="keep">不修改</a-radio>
          <a-radio v-for="p in PROFICIENCIES" :key="p" :value="p">{{ p }}</a-radio>
        </a-radio-group>
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.bp-row { display: flex; align-items: center; gap: 10px; }
.bp-k { width: 64px; flex: none; color: #374151; font-size: 13px; }
</style>
