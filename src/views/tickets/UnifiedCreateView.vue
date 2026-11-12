<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';
import { useBusinessRegistrationStore } from '@/stores/businessRegistration';
import { REGISTRATION_TEMPLATES } from './types/businessRegistration';
import { UNIFIED_CREATE_PATH, unifiedCreateScene, unifiedCreateTemplateId } from './composables/unifiedCreateEntry';
import UnifiedCreateForm from './components/unified-create/UnifiedCreateForm.vue';
import BusinessRegistrationEditor from './components/business/BusinessRegistrationEditor.vue';

defineOptions({ name: 'UnifiedCreateView' });

const tabs = useWorkspaceTabsStore();
const route = useRoute();
const router = useRouter();
const registrations = useBusinessRegistrationStore();
const selectedTemplate = computed(() => REGISTRATION_TEMPLATES.find((item) => item.id === unifiedCreateTemplateId.value));
const formOptions = computed(() => [
  { value: 'general', label: '通用工单' },
  ...REGISTRATION_TEMPLATES.map((item) => ({ value: item.id, label: item.name, disabled: !registrations.canCreate(item.id) })),
]);
function selectTemplate(rawValue: unknown) {
  const value = typeof rawValue === 'string' ? rawValue : 'general';
  if (value === unifiedCreateTemplateId.value) return;
  unifiedCreateTemplateId.value = value;
}
// A direct template link is normalized so workspace tab activation retains the same form instance.
watch(() => route.query.template, (value) => {
  if (route.path !== UNIFIED_CREATE_PATH || typeof value !== 'string') return;
  if (REGISTRATION_TEMPLATES.some((item) => item.id === value)) {
    unifiedCreateScene.value = 'general';
    unifiedCreateTemplateId.value = value;
  }
  const query = { ...route.query };
  delete query.template;
  void router.replace({ path: UNIFIED_CREATE_PATH, query });
}, { immediate: true });
/** 页签关掉后 keep-alive 里的实例还在：换 key 重建表单，下次打开是空白页 */
const session = ref(0);
const opened = computed(() => tabs.tabs.some((t) => t.key === UNIFIED_CREATE_PATH));
watch(opened, (now, before) => {
  if (!before || now) return;
  unifiedCreateScene.value = 'general';
  unifiedCreateTemplateId.value = 'general';
  session.value += 1;
});
</script>

<template>
  <div class="unified-create-page">
    <div v-if="unifiedCreateScene === 'general'" class="business-form-selector">
      <label for="business-form-choice">业务表单</label>
      <a-select id="business-form-choice" :value="unifiedCreateTemplateId" :options="formOptions" style="width:260px" @change="selectTemplate" />
      <span v-if="selectedTemplate">{{ selectedTemplate.businessType }} · {{ selectedTemplate.ticketType }} · 建单人自行处理</span>
    </div>
    <KeepAlive :max="4">
      <BusinessRegistrationEditor v-if="selectedTemplate && unifiedCreateScene === 'general'" :key="`${session}-${selectedTemplate.id}`" :template-id="selectedTemplate.id" />
      <UnifiedCreateForm v-else :key="`${session}-${unifiedCreateScene}`" :scene="unifiedCreateScene" />
    </KeepAlive>
  </div>
</template>

<style scoped>
.unified-create-page{height:100%;min-height:0;display:flex;flex-direction:column}.business-form-selector{flex:none;display:flex;align-items:center;gap:12px;padding:10px 17px;background:#fff;border-bottom:1px solid #e7ecf4}.business-form-selector label{font-size:12px;color:#75869f}.business-form-selector span{font-size:11px;color:#9ba7b8}.unified-create-page> :deep(.uc-page){flex:1;min-height:0}
</style>
