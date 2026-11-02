<script setup lang="ts">
/**
 * 【1215】编辑人员画像抽屉（PRD 6.5）：与后台「派单设置」共用画像编辑布局；班组看板仅维护画像 + 熟练度。
 */
import { computed, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useDispatchStore } from '@/stores/dispatch';
import { useUserStore } from '@/stores/user';
import { PROFICIENCIES, type Proficiency } from '@/views/tickets/types/dispatch';
import ProfileDimEditor from '@/views/admin/dispatch/ProfileDimEditor.vue';
import { draftFromProfile, profileFromDraft, type ProfileDraft } from '@/views/admin/dispatch/profileDraft';
import '@/views/admin/dispatch/dispatchAgentDrawer.css';

const props = defineProps<{ open: boolean; name: string | null }>();
const emit = defineEmits<{ 'update:open': [v: boolean] }>();

const dispatch = useDispatchStore();
const user = useUserStore();

const agent = computed(() => (props.name ? dispatch.agentOf(props.name) : undefined));
const title = computed(() => (agent.value ? `编辑人员画像 · ${agent.value.name}（${agent.value.staffNo}）` : '编辑人员画像'));

const draft = ref<ProfileDraft>(draftFromProfile({ businessTypes: null, ticketTypes: null, products: null, problems: null, customerTypes: null }));
const proficiency = ref<Proficiency | undefined>(undefined);

const drawerBodyStyle = { padding: '12px 16px 16px', background: '#fff' };

watch(() => [props.open, props.name] as const, ([open]) => {
  const a = agent.value;
  if (!open || !a) return;
  draft.value = draftFromProfile(a.profile);
  proficiency.value = a.proficiency;
}, { immediate: true });

function onSave() {
  const a = agent.value;
  if (!a) return;
  const profile = profileFromDraft(draft.value);
  const err = dispatch.validateProfile(profile);
  if (err) {
    message.warning(err);
    return;
  }
  if (!proficiency.value) {
    message.warning('请设置熟练度');
    return;
  }
  const res = dispatch.setProfile(a.name, profile, proficiency.value, user.name);
  if (!res.ok) {
    if (res.message) message.warning(res.message);
    return;
  }
  message.success(res.message);
  emit('update:open', false);
}
</script>

<template>
  <a-drawer
    :open="open"
    :title="title"
    :width="600"
    destroy-on-close
    :body-style="drawerBodyStyle"
    @update:open="emit('update:open', $event)"
  >
    <div v-if="agent" class="da-shell">
      <section class="da-block">
        <h4 class="da-block-hd">人员画像</h4>
        <ProfileDimEditor v-model="draft" :group-ids="agent.groupIds" />
        <div class="da-subsec">
          <span class="da-subsec-k">熟练度<em class="req">*</em></span>
          <a-radio-group v-model:value="proficiency" class="da-radio-line">
            <a-radio v-for="p in PROFICIENCIES" :key="p" :value="p">{{ p }}</a-radio>
          </a-radio-group>
        </div>
      </section>
    </div>
    <template #footer>
      <div class="da-foot">
        <a-button @click="emit('update:open', false)">取消</a-button>
        <a-button type="primary" @click="onSave">保存</a-button>
      </div>
    </template>
  </a-drawer>
</template>
