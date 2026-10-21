<script setup lang="ts">
/**
 * 新建工单 · 「刷机信息」卡（930 教育刷机单 P1 / PRD §2.2 / §2.4）。
 * 8 个字段：设备SN · 学生类型 · 学生姓名 · 学生账号 · 学校名称 · 刷机原因 · 设备SN照片 · MDM信息图片。
 * 学生类型固定两项（毕业生 / 转校生），学校按省市区检索后选择（`FlashSchoolPicker`，10-19 C5），刷机原因为自由文本。
 * 产品取「产品问题」卡的产品分类 + 产品名称（1013 A4），联系手机号取客户信息区，均不在本卡；
 * 结案方式固定「正常流程」，不出控件。
 */
import { ref, watch } from 'vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import type { UploadFile } from 'ant-design-vue';
import { FLASH_FIELD_LABELS as L, FLASH_REASON_PLACEHOLDER, FLASH_STUDENT_TYPE_OPTIONS, type FlashStudentType } from '@/views/tickets/types/flash';
import type { CreateTicketFlashField, CreateTicketFlashForm } from '@/views/tickets/types/createTicket';
import CreateTicketPartCard from './CreateTicketPartCard.vue';
import FormSelect from './FormSelect.vue';
import FlashSchoolPicker from './FlashSchoolPicker.vue';

const info = defineModel<CreateTicketFlashForm>('info', { required: true });
defineProps<{
  errors: Record<CreateTicketFlashField, string>;
  /** 客户信息的省市区（学校检索的默认地区） */
  customerRegion?: string;
}>();

type PhotoKey = 'snPhotos' | 'mdmPhotos';

/** 设备SN照片 / MDM信息图片（各 1 张）：文件只在本卡预览，表单里存文件名（草稿可恢复） */
const photoLists = ref<Record<PhotoKey, UploadFile[]>>({ snPhotos: [], mdmPhotos: [] });

function syncPhotoListFromForm(key: PhotoKey) {
  const names = info.value[key] ?? [];
  const current = photoLists.value[key].map((f) => f.name);
  if (names.join('|') === current.join('|')) return;
  photoLists.value[key] = names.map((name, i) => ({ uid: `${key}-${i}-${name}`, name, status: 'done' }));
}

watch(() => info.value.snPhotos, () => syncPhotoListFromForm('snPhotos'), { immediate: true, deep: true });
watch(() => info.value.mdmPhotos, () => syncPhotoListFromForm('mdmPhotos'), { immediate: true, deep: true });

/** 下拉空值按 undefined 交给 a-select，才会显示「请选择」 */
function setStudentType(v: unknown) {
  info.value.studentType = v == null ? '' : (String(v) as FlashStudentType);
}

function beforePhotoUpload() {
  return false;
}

function onPhotoChange(key: PhotoKey, { fileList }: { fileList: UploadFile[] }) {
  const list = fileList.slice(-1);
  photoLists.value[key] = list;
  info.value[key] = list.map((f) => f.name);
}

const PHOTO_FIELDS: { key: PhotoKey; label: string }[] = [
  { key: 'snPhotos', label: L.snPhotos },
  { key: 'mdmPhotos', label: L.mdmPhotos },
];
</script>

<template>
  <CreateTicketPartCard title="刷机信息" :body-gap="8">
    <div class="fi-grid">
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
        <label class="fi-label"><span class="req">*</span>{{ L.studentType }}</label>
        <div class="fi-control">
          <FormSelect
            :value="info.studentType || undefined"
            @update:value="setStudentType"
            class="fi-input"
            placeholder="请选择"
            :status="errors.studentType ? 'error' : ''"
            :options="FLASH_STUDENT_TYPE_OPTIONS"
          />
          <div v-if="errors.studentType" class="fi-error">{{ errors.studentType }}</div>
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

      <div class="fi-field fi-school">
        <label class="fi-label"><span class="req">*</span>{{ L.schoolName }}</label>
        <div class="fi-control">
          <FlashSchoolPicker
            v-model:school-id="info.schoolId"
            :default-region="customerRegion"
            :status="errors.schoolId ? 'error' : ''"
          />
          <div v-if="errors.schoolId" class="fi-error">{{ errors.schoolId }}</div>
        </div>
      </div>
      <div class="fi-field fi-reason">
        <label class="fi-label"><span class="req">*</span>{{ L.reason }}</label>
        <div class="fi-control">
          <a-textarea
            v-model:value="info.reason"
            class="fi-input fi-textarea"
            :placeholder="FLASH_REASON_PLACEHOLDER"
            :status="errors.reason ? 'error' : ''"
          />
          <div v-if="errors.reason" class="fi-error">{{ errors.reason }}</div>
        </div>
      </div>

      <div v-for="p in PHOTO_FIELDS" :key="p.key" class="fi-field fi-photo">
        <label class="fi-label">{{ p.label }}</label>
        <div class="fi-control">
          <a-upload
            :file-list="photoLists[p.key]"
            list-type="picture-card"
            accept="image/*"
            :max-count="1"
            :before-upload="beforePhotoUpload"
            :show-upload-list="{ showPreviewIcon: false }"
            @change="onPhotoChange(p.key, $event)"
          >
            <div v-if="!photoLists[p.key].length" class="fi-upload-btn">
              <PlusOutlined />
              <span>上传</span>
            </div>
          </a-upload>
        </div>
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
/*
 * 学校名称：地区框与学校框在本卡放不下一行、学校框折到第二行，整格占两行；
 * 刷机原因（多行文本）在右侧同占两行，与学校名称两行对齐。两框行距与卡内行距一致
 */
.fi-school { grid-row: span 2; }
.fi-reason { grid-row: span 2; }
.fi-reason .fi-control { height: 100%; }
.fi-textarea { flex: 1; min-height: 72px; resize: none; }
.fi-school :deep(.school-picker) { row-gap: 8px; }
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
