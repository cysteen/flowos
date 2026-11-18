<script setup lang="ts">
import { computed } from 'vue';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons-vue';
import {
  BUSINESS_LINE_OPTIONS,
  PRODUCT_LINES_BY_BUSINESS_LINE,
  COMPLAINT_TYPE_OPTIONS,
  CUSTOM_PLATFORM_OPTION,
  PRIOR_FEEDBACK_OPTIONS,
  complaintPlatformsBySource,
} from '@/views/tickets/types/createTicket';
import {
  CREATE_COMPLAINT_L1_OPTIONS,
  CREATE_COMPLAINT_L2_MAP,
  SERVICE_COMPLAINT_CATEGORY_OPTIONS,
} from '@/views/tickets/types/complaintCreateCategory';
import type { useCreateTicketForm } from '@/views/tickets/composables/useCreateTicketForm';
import CreateTicketPartCard from '../create-ticket/CreateTicketPartCard.vue';
import FormSelect from '../create-ticket/FormSelect.vue';

const props = defineProps<{ ctx: ReturnType<typeof useCreateTicketForm>; simplifiedExternal?: boolean; standardUpgrade?: boolean }>();

// eslint-disable-next-line vue/no-setup-props-destructure -- ctx 随表单实例创建，生命周期内不换
const { form, errors, typePartSubtitle, showChannelComplaintFields, showServiceComplaintCategory } = props.ctx;

const complaintL2Options = computed(() => CREATE_COMPLAINT_L2_MAP[form.complaintL1] ?? []);
const complaintPlatformOptions = computed(
  () => complaintPlatformsBySource(form.ticketSource).map((v) => ({ value: v, label: v })),
);

function addComplaintPlatform() {
  form.complaintPlatforms.push({ platform: '', complaintNo: '' });
}
function removeComplaintPlatform(i: number) {
  form.complaintPlatforms.splice(i, 1);
  if (!form.complaintPlatforms.length) addComplaintPlatform();
}
</script>

<template>
  <CreateTicketPartCard :subtitle="typePartSubtitle" :body-gap="10">
    <template v-if="showChannelComplaintFields">
      <div class="cp-group">
        <div v-for="(row, i) in form.complaintPlatforms" :key="`cp-${i}`" class="cp-row">
          <label v-if="i === 0" class="inline-label xl">投诉平台/编号</label>
          <span v-else class="inline-label xl cp-label-spacer" aria-hidden="true" />
          <FormSelect
            v-model:value="row.platform"
            class="field-control cp-cell"
            :options="complaintPlatformOptions"
            placeholder="投诉平台"
          />
          <a-input
            v-if="row.platform === CUSTOM_PLATFORM_OPTION"
            v-model:value="row.customPlatform"
            class="field-control cp-cell"
            placeholder="填写平台名称"
          />
          <a-input
            v-model:value="row.complaintNo"
            class="field-control cp-cell"
            placeholder="投诉编号，可留空"
          />
          <a-textarea v-model:value="row.complaintContent" class="field-control cp-cell" placeholder="该平台投诉内容" :auto-size="{ minRows: 1, maxRows: 4 }" :status="errors.complaintPlatform ? 'error' : ''" />
          <button
            type="button"
            class="cp-del"
            title="移除该组"
            :disabled="form.complaintPlatforms.length === 1 && !row.platform"
            @click="removeComplaintPlatform(i)"
          >
            <CloseOutlined />
          </button>
          <button v-if="i === 0" type="button" class="cp-add" @click="addComplaintPlatform">
            <PlusOutlined />添加平台
          </button>
          <span v-else class="cp-add-spacer" aria-hidden="true" />
        </div>
      </div>
      <div v-if="errors.complaintPlatform" style="color:#ef4444">请逐组选择平台、填写投诉内容；“其他”须填写平台名称，编号可留空。</div>

      <div v-if="!simplifiedExternal" class="row-3">
        <div class="inline-field">
          <label class="inline-label xl">投诉类型</label>
          <FormSelect
            v-model:value="form.complaintType"
            class="inline-control field-control"
            :status="errors.complaintType ? 'error' : ''"
            :options="COMPLAINT_TYPE_OPTIONS.map((v) => ({ value: v, label: v }))"
          />
        </div>
        <div class="inline-field">
          <label class="inline-label xl"><span class="req">*</span>归属业务线</label>
          <FormSelect
            v-model:value="form.businessLine"
            class="inline-control field-control"
            :status="errors.businessLine ? 'error' : ''"
            :options="BUSINESS_LINE_OPTIONS.map((v) => ({ value: v, label: v }))"
          />
        </div>
        <div class="inline-field">
          <label class="inline-label xl"><span class="req">*</span>前期是否反馈</label>
          <FormSelect
            v-model:value="form.priorFeedback"
            class="inline-control field-control"
            :status="errors.priorFeedback ? 'error' : ''"
            :options="PRIOR_FEEDBACK_OPTIONS.map((v) => ({ value: v, label: v }))"
          />
        </div>
      </div>
      <div v-if="standardUpgrade" class="inline-field">
        <label class="inline-label xl"><span class="req">*</span>归属产品线</label>
        <FormSelect v-model:value="form.productLine" class="inline-control field-control" :status="errors.productLine ? 'error' : ''" :options="(PRODUCT_LINES_BY_BUSINESS_LINE[form.businessLine] || []).map((v) => ({ value:v, label:v }))" />
      </div>
    </template>

    <div class="row-3">
      <div class="inline-field">
        <label class="inline-label xl"><span class="req">*</span>投诉一类</label>
        <FormSelect
          v-model:value="form.complaintL1"
          class="inline-control field-control"
          :status="errors.complaintL1 ? 'error' : ''"
          :options="CREATE_COMPLAINT_L1_OPTIONS.map((v) => ({ value: v, label: v }))"
        />
      </div>
      <div class="inline-field">
        <label class="inline-label xl"><span class="req">*</span>投诉二类</label>
        <FormSelect
          v-model:value="form.complaintL2"
          class="inline-control field-control"
          :status="errors.complaintL2 ? 'error' : ''"
          :options="complaintL2Options.map((v) => ({ value: v, label: v }))"
        />
      </div>
      <div class="inline-field occurred-time-field">
        <label class="inline-label xl"><span class="req">*</span>问题发生时间</label>
        <div class="occurred-time-control">
          <a-date-picker v-model:value="form.problemTime" class="field-control" show-time value-format="YYYY-MM-DD HH:mm" format="YYYY-MM-DD HH:mm" :status="errors.problemTime ? 'error' : ''" placeholder="请选择问题发生时间" />
          <span v-if="errors.problemTime" class="occurred-time-error" role="alert">请选择问题发生时间</span>
        </div>
      </div>
      <div v-if="showServiceComplaintCategory" class="inline-field">
        <label class="inline-label xl"><span class="req">*</span>服务投诉分类</label>
        <FormSelect
          v-model:value="form.serviceComplaintCategory"
          class="inline-control field-control"
          :status="errors.serviceComplaintCategory ? 'error' : ''"
          :options="SERVICE_COMPLAINT_CATEGORY_OPTIONS.map((v) => ({ value: v, label: v }))"
        />
      </div>
      <div v-if="showChannelComplaintFields && !simplifiedExternal" class="inline-field">
        <label class="inline-label xl">投诉接收时间</label>
        <a-date-picker
          v-model:value="form.complaintReceiveTime"
          class="inline-control field-control"
          :show-time="{ format: 'HH:mm' }"
          format="YYYY-MM-DD HH:mm"
          value-format="YYYY-MM-DD HH:mm"
          placeholder="请选择接收时间"
        />
      </div>
    </div>

    <div v-if="showChannelComplaintFields && !simplifiedExternal" class="inline-field review-field">
      <label class="inline-label xl">服务回溯</label>
      <a-textarea
        v-model:value="form.serviceReview"
        placeholder="手动填写回溯说明"
        class="inline-control field-control"
        :auto-size="{ minRows: 2, maxRows: 6 }"
        :maxlength="Math.max(2000, form.serviceReview.length)"
        :show-count="{ formatter: () => `${form.serviceReview.length}/2000` }"
        :status="form.serviceReview.length > 2000 ? 'error' : ''"
      />
    </div>
  </CreateTicketPartCard>
</template>

<style scoped>
.uc-page .occurred-time-field { align-items: flex-start; }
.occurred-time-control { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.occurred-time-control > .field-control { width: 100%; min-width: 0; max-width: 100%; }
.occurred-time-error { color: #ef4444; font-size: 12px; line-height: 1.5; white-space: normal; overflow-wrap: anywhere; }
</style>
