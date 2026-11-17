<script setup lang="ts">
import { computed } from 'vue';
import type { useCreateTicketForm } from '../../composables/useCreateTicketForm';
import { CREATE_COMPLAINT_L1_OPTIONS, CREATE_COMPLAINT_L2_MAP, inferCreateComplaintNatures } from '../../types/complaintCreateCategory';
import { complaintPlatformsBySource, CUSTOM_PLATFORM_OPTION } from '../../types/createTicket';
import CreateTicketPartCard from '../create-ticket/CreateTicketPartCard.vue';
import FormSelect from '../create-ticket/FormSelect.vue';

const props = defineProps<{ ctx: ReturnType<typeof useCreateTicketForm> }>();
const { form, errors } = props.ctx;
if (!form.externalComplaintCategories?.length) form.externalComplaintCategories = [{ cat1: form.complaintL1, cat2: form.complaintL2 }];
const categories = computed(() => form.externalComplaintCategories!);
const natures = computed(() => inferCreateComplaintNatures(categories.value));
const platforms = complaintPlatformsBySource('外投渠道').map((value) => ({ value, label: value }));
</script>
<template>
  <CreateTicketPartCard title="外投投诉信息">
    <p>升级目标来源：外投渠道</p>
    <div v-for="(row, index) in categories" :key="index" class="external-row">
      <label>投诉分类 <span class="req">*</span></label>
      <FormSelect v-model:value="row.cat1" :options="CREATE_COMPLAINT_L1_OPTIONS.map((value) => ({ value, label: value }))" :status="errors.complaintL1 && !row.cat1 ? 'error' : ''" @change="row.cat2 = ''" />
      <FormSelect v-model:value="row.cat2" :options="(CREATE_COMPLAINT_L2_MAP[row.cat1] ?? []).map((value) => ({ value, label: value }))" :status="errors.complaintL2 && !row.cat2 ? 'error' : ''" />
      <a-button :disabled="categories.length === 1" @click="categories.splice(index, 1)">移除</a-button>
    </div>
    <p v-if="errors.complaintL1 || errors.complaintL2" class="external-error">请补齐每组投诉一类、二类</p>
    <a-button @click="categories.push({ cat1: '', cat2: '' })">添加分类</a-button>
    <p>投诉性质：{{ natures.join('、') || '选择投诉分类后自动显示' }}</p>
    <div v-for="(row, index) in form.complaintPlatforms" :key="`p-${index}`" class="external-row">
      <label>投诉平台 / 编号 <span class="req">*</span></label>
      <FormSelect v-model:value="row.platform" :options="platforms" :status="errors.complaintPlatform && (!row.platform || row.platform === CUSTOM_PLATFORM_OPTION && !row.customPlatform?.trim()) ? 'error' : ''" />
      <a-input v-if="row.platform === CUSTOM_PLATFORM_OPTION" v-model:value="row.customPlatform" placeholder="填写平台名称" :status="errors.complaintPlatform && !row.customPlatform?.trim() ? 'error' : ''" />
      <a-input v-model:value="row.complaintNo" placeholder="该平台投诉编号，可留空" />
      <a-button :disabled="form.complaintPlatforms.length === 1" @click="form.complaintPlatforms.splice(index, 1)">移除</a-button>
    </div>
    <p v-if="errors.complaintPlatform" class="external-error">至少填写一组平台；各已添加的平台均须选择，“其他”须填写平台名</p>
    <a-button @click="form.complaintPlatforms.push({ platform: '', complaintNo: '' })">添加平台</a-button>
  </CreateTicketPartCard>
</template>
<style scoped>
.external-row { display:flex;align-items:center;gap:10px;flex-wrap:wrap }
.external-row label { min-width:130px }.external-row :deep(.ant-select),.external-row :deep(.ant-input) { flex:1;min-width:170px }
.external-error,.req { color:#ff4d4f }.external-error { margin:0 }
</style>
