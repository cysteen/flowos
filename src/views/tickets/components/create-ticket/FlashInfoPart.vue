<script setup lang="ts">
/**
 * 新建工单 · 「刷机信息」卡（930 教育刷机单 P1 / PRD §2.2 / §2.4）。
 * 9 个字段；选项取后台「刷机配置」启用项（`useFlashConfigStore`）与学校库（`SCHOOL_LIBRARY`）。
 * 联系手机号取客户信息区，不在本卡；结案方式固定「正常流程」，不出控件。
 */
import { computed, ref, watch } from 'vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import type { UploadFile } from 'ant-design-vue';
import { useFlashConfigStore } from '@/stores/flashConfig';
import { SCHOOL_LIBRARY } from '@/mock/schools';
import { FLASH_FIELD_LABELS as L } from '@/views/tickets/types/flash';
import type { CreateTicketFlashField, CreateTicketFlashForm } from '@/views/tickets/types/createTicket';
import CreateTicketPartCard from './CreateTicketPartCard.vue';
import FormSelect from './FormSelect.vue';

const info = defineModel<CreateTicketFlashForm>('info', { required: true });
defineProps<{
  errors: Record<CreateTicketFlashField, string>;
}>();

const config = useFlashConfigStore();

const modelOptions = computed(() => config.enabledModels().map((m) => ({ value: m.model, label: m.model })));
const reasonOptions = computed(() => config.enabledReasons().map((r) => ({ value: r, label: r })));
const schoolOptions = SCHOOL_LIBRARY.map((s) => ({ value: s.id, label: s.name }));

/** 设备SN照片（1 张）：文件只在本卡预览，表单里存文件名（草稿可恢复） */
const photoList = ref<UploadFile[]>([]);

function syncPhotoListFromForm() {
  const names = info.value.snPhotos ?? [];
  const current = photoList.value.map((f) => f.name);
  if (names.join('|') === current.join('|')) return;
  photoList.value = names.map((name, i) => ({ uid: `sn-photo-${i}-${name}`, name, status: 'done' }));
}

watch(() => info.value.snPhotos, syncPhotoListFromForm, { immediate: true, deep: true });

/** 下拉空值按 undefined 交给 a-select，才会显示「请选择」 */
function setSelect(key: 'productModel' | 'schoolId' | 'reason', v: unknown) {
  info.value[key] = v == null ? '' : String(v);
}

function beforePhotoUpload() {
  return false;
}

function onPhotoChange({ fileList }: { fileList: UploadFile[] }) {
  const list = fileList.slice(-1);
  photoList.value = list;
  info.value.snPhotos = list.map((f) => f.name);
}
</script>

<template>
  <CreateTicketPartCard title="刷机信息" :body-gap="8">
    <div class="fi-grid">
      <div class="fi-field">
        <label class="fi-label"><span class="req">*</span>{{ L.productModel }}</label>
        <div class="fi-control">
          <FormSelect
            :value="info.productModel || undefined"
            @update:value="(v) => setSelect('productModel', v)"
            class="fi-input"
            placeholder="请选择"
            :status="errors.productModel ? 'error' : ''"
            :options="modelOptions"
            :dropdown-match-select-width="false"
          />
          <div v-if="errors.productModel" class="fi-error">{{ errors.productModel }}</div>
        </div>
      </div>
      <div class="fi-field">
        <label class="fi-label"><span class="req">*</span>{{ L.sn }}</label>
        <div class="fi-control">
          <a-input
            v-model:value="info.sn"
            class="fi-input"
            placeholder="请输入设备SN"
            :status="errors.sn ? 'error' : ''"
          />
          <div v-if="errors.sn" class="fi-error">{{ errors.sn }}</div>
        </div>
      </div>

      <div class="fi-field">
        <label class="fi-label"><span class="req">*</span>{{ L.studentAccount }}</label>
        <div class="fi-control">
          <a-input
            v-model:value="info.studentAccount"
            class="fi-input"
            placeholder="请输入学生账号"
            :status="errors.studentAccount ? 'error' : ''"
          />
          <div v-if="errors.studentAccount" class="fi-error">{{ errors.studentAccount }}</div>
        </div>
      </div>
      <div class="fi-field">
        <label class="fi-label"><span class="req">*</span>{{ L.studentName }}</label>
        <div class="fi-control">
          <a-input
            v-model:value="info.studentName"
            class="fi-input"
            placeholder="请输入学生姓名"
            :status="errors.studentName ? 'error' : ''"
          />
          <div v-if="errors.studentName" class="fi-error">{{ errors.studentName }}</div>
        </div>
      </div>

      <div class="fi-field">
        <label class="fi-label"><span class="req">*</span>{{ L.schoolName }}</label>
        <div class="fi-control">
          <FormSelect
            :value="info.schoolId || undefined"
            @update:value="(v) => setSelect('schoolId', v)"
            class="fi-input"
            placeholder="请搜索或选择学校"
            :status="errors.schoolId ? 'error' : ''"
            :options="schoolOptions"
          />
          <div v-if="errors.schoolId" class="fi-error">{{ errors.schoolId }}</div>
        </div>
      </div>
      <div class="fi-field">
        <label class="fi-label"><span class="req">*</span>{{ L.reason }}</label>
        <div class="fi-control">
          <FormSelect
            :value="info.reason || undefined"
            @update:value="(v) => setSelect('reason', v)"
            class="fi-input"
            placeholder="请选择"
            :status="errors.reason ? 'error' : ''"
            :options="reasonOptions"
          />
          <div v-if="errors.reason" class="fi-error">{{ errors.reason }}</div>
        </div>
      </div>

      <div class="fi-field">
        <label class="fi-label">{{ L.romVersion }}</label>
        <div class="fi-control">
          <a-input v-model:value="info.romVersion" class="fi-input" placeholder="请输入ROM版本" />
        </div>
      </div>
      <div class="fi-field">
        <label class="fi-label">{{ L.mdmVersion }}</label>
        <div class="fi-control">
          <a-input v-model:value="info.mdmVersion" class="fi-input" placeholder="请输入MDM版本" />
        </div>
      </div>
    </div>

    <div class="fi-field fi-photo">
      <label class="fi-label">{{ L.snPhotos }}</label>
      <div class="fi-control">
        <a-upload
          :file-list="photoList"
          list-type="picture-card"
          accept="image/*"
          :max-count="1"
          :before-upload="beforePhotoUpload"
          :show-upload-list="{ showPreviewIcon: false }"
          @change="onPhotoChange"
        >
          <div v-if="!photoList.length" class="fi-upload-btn">
            <PlusOutlined />
            <span>上传</span>
          </div>
        </a-upload>
      </div>
    </div>
  </CreateTicketPartCard>
</template>

<style scoped>
.fi-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
}
.fi-field {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}
.fi-label {
  flex: none;
  width: 76px;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
  line-height: 32px;
}
.req { color: #f56c6c; margin-right: 1px; }
.fi-control {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.fi-input { width: 100%; }
.fi-input :deep(.ant-select-selector),
.fi-input.ant-input {
  min-height: 32px;
}
.fi-error {
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: #ef4444;
}
.fi-photo :deep(.ant-upload-wrapper .ant-upload.ant-upload-select),
.fi-photo :deep(.ant-upload-list-item-container) {
  width: 88px !important;
  height: 88px !important;
  margin: 0 !important;
}
.fi-upload-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
}

@media (max-width: 768px) {
  .fi-grid { grid-template-columns: 1fr; }
}
</style>
