<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { CameraOutlined, CheckCircleFilled, CloseOutlined } from '@ant-design/icons-vue';
import { useFlashStore, type FlashCreateInput, type FlashEvaluationBlocked } from '@/stores/flash';
import { useFlashConfigStore } from '@/stores/flashConfig';
import { MDM_DEVICES } from '@/mock/flash/mdmDevices';
import { SCHOOL_LIBRARY } from '@/mock/schools';
import { FLASH_FIELD_LABELS } from '@/views/tickets/types/flash';
import FlashMobileShell from './FlashMobileShell.vue';
import FlashProgressSteps from './FlashProgressSteps.vue';
import { useFlashProgress, userStageText } from './useFlashProgress';

/**
 * 用户提报页「刷机申请」与结果页（930 教育刷机单 PRD §2.5 / 页面规格 P2 · P0-1/2/3/5/6/7）。
 * 校验顺序：必填 → 机型不支持 → 同 SN 在途（查询不可用 → 系统繁忙），判定走 `evaluateCreate`，建单走 `createFlashTicket`。
 */

/** 小程序授权手机号 */
const AUTHORIZED_PHONE = '13856011288';

type FieldKey = 'productModel' | 'snPhotos' | 'sn' | 'studentAccount' | 'studentName' | 'schoolName' | 'reason' | 'contactPhone';

const L = FLASH_FIELD_LABELS;
/** 选择类字段提示「请选择」，照片「请上传」，其余「请填写」（P0-3） */
const REQUIRED_TIP: Record<FieldKey, string> = {
  productModel: `请选择${L.productModel}`,
  snPhotos: `请上传${L.snPhotos}`,
  sn: `请填写${L.sn}`,
  studentAccount: `请填写${L.studentAccount}`,
  studentName: `请填写${L.studentName}`,
  schoolName: `请选择${L.schoolName}`,
  reason: `请选择${L.reason}`,
  contactPhone: `请填写${L.contactPhone}`,
};
const LABEL_TO_KEY = Object.fromEntries(
  (Object.keys(REQUIRED_TIP) as FieldKey[]).map((k) => [L[k], k]),
) as Record<string, FieldKey>;

const router = useRouter();
const flash = useFlashStore();
const config = useFlashConfigStore();

const modelOptions = computed(() => config.enabledModels().map((m) => ({ value: m.model, label: m.model })));
const reasonOptions = computed(() => config.enabledReasons().map((r) => ({ value: r, label: r })));
const schoolOptions = SCHOOL_LIBRARY.map((s) => ({ value: s.id, label: s.name }));

const form = reactive({
  productModel: undefined as string | undefined,
  sn: '',
  studentAccount: '',
  studentName: '',
  schoolId: undefined as string | undefined,
  reason: undefined as string | undefined,
  romVersion: '',
  mdmVersion: '',
  contactPhone: AUTHORIZED_PHONE,
});
const photo = ref<{ name: string; url: string } | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const errors = reactive<Partial<Record<FieldKey, string>>>({});
const alert = ref<{ text: string; inflightNo?: string } | null>(null);

function clearError(k: FieldKey) {
  delete errors[k];
}

watch(() => form.productModel, () => { clearError('productModel'); alert.value = null; });
watch(() => form.sn, () => { clearError('sn'); alert.value = null; });
watch(() => form.studentAccount, () => clearError('studentAccount'));
watch(() => form.studentName, () => clearError('studentName'));
watch(() => form.schoolId, () => clearError('schoolName'));
watch(() => form.reason, () => clearError('reason'));
watch(() => form.contactPhone, () => clearError('contactPhone'));

function filterSchool(input: string, option: { label?: string }) {
  return (option.label ?? '').includes(input.trim());
}

/* ---------------- 设备SN照片 · 识别 SN ---------------- */

/** 按 MDM 设备台账识别照片里的 SN；识别不出返回空（P0-7：不填入） */
function recognizeSn(fileName: string): string {
  const name = fileName.toUpperCase();
  const hit = [...MDM_DEVICES]
    .sort((a, b) => b.sn.length - a.sn.length)
    .find((d) => name.includes(d.sn.toUpperCase()));
  return hit?.sn ?? '';
}

function pickPhoto() {
  fileInput.value?.click();
}

function onPhotoChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    photo.value = { name: file.name, url: String(reader.result ?? '') };
    clearError('snPhotos');
    const sn = recognizeSn(file.name);
    if (sn) form.sn = sn;
  };
  reader.readAsDataURL(file);
}

function removePhoto() {
  photo.value = null;
}

/* ---------------- 提交 ---------------- */

const resultNo = ref('');

function buildInput(): FlashCreateInput {
  const school = SCHOOL_LIBRARY.find((s) => s.id === form.schoolId);
  return {
    productModel: form.productModel ?? '',
    sn: form.sn,
    studentAccount: form.studentAccount,
    studentName: form.studentName,
    schoolId: form.schoolId ?? '',
    schoolName: school?.name,
    reason: form.reason ?? '',
    romVersion: form.romVersion.trim(),
    mdmVersion: form.mdmVersion.trim(),
    snPhotos: photo.value ? [photo.value.name] : [],
    contactPhone: form.contactPhone,
  };
}

function showBlocked(ev: FlashEvaluationBlocked) {
  (Object.keys(errors) as FieldKey[]).forEach(clearError);
  if (ev.code === 'required') {
    alert.value = null;
    (ev.missing ?? []).forEach((label) => {
      const k = LABEL_TO_KEY[label];
      if (k) errors[k] = REQUIRED_TIP[k];
    });
    nextTick(() => {
      document.querySelector('.fa-field.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return;
  }
  if (ev.code === 'A2' && ev.inflightNo) {
    const stage = userStageText(ev.inflightStage ?? '人工处理中');
    alert.value = { text: `该设备已有刷机申请 ${ev.inflightNo}，当前进度：${stage}`, inflightNo: ev.inflightNo };
  } else {
    alert.value = { text: ev.message };
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function submit() {
  const input = buildInput();
  const ev = flash.evaluateCreate(input, '用户提报');
  if (ev.kind === 'blocked') {
    showBlocked(ev);
    return;
  }
  const name = input.studentName.trim();
  const { evaluation, ticket } = flash.createFlashTicket(
    input,
    { customer: name },
    '用户提报',
    { name, role: '客户' },
  );
  if (evaluation.kind === 'blocked' || !ticket) {
    if (evaluation.kind === 'blocked') showBlocked(evaluation);
    return;
  }
  alert.value = null;
  resultNo.value = ticket.no;
  window.scrollTo({ top: 0 });
}

function openProgress(no: string) {
  router.push({ path: '/m/flash/progress', query: { no } });
}

const { snapshot } = useFlashProgress(resultNo);
</script>

<template>
  <!-- 结果页 -->
  <FlashMobileShell v-if="resultNo" title="刷机申请">
    <section class="fa-result">
      <CheckCircleFilled class="fa-result__icon" />
      <h2 class="fa-result__title">提交成功</h2>
      <div class="fa-result__no">单号：<span class="fa-mono">{{ resultNo }}</span></div>
    </section>
    <section v-if="snapshot" class="fa-card fa-card--steps">
      <FlashProgressSteps :stage="snapshot.stage" />
    </section>
    <template #footer>
      <a-button type="primary" size="large" block @click="openProgress(resultNo)">查看进度</a-button>
    </template>
  </FlashMobileShell>

  <!-- 提报页 -->
  <FlashMobileShell v-else title="刷机申请">
    <template v-if="alert" #alert>
      <div class="fa-alert" role="alert">
        <span class="fa-alert__text">{{ alert.text }}</span>
        <a v-if="alert.inflightNo" class="fa-alert__link" @click="openProgress(alert.inflightNo)">查看进度</a>
      </div>
    </template>

    <section class="fa-card">
      <div class="fa-field" :class="{ 'has-error': errors.productModel }">
        <label class="fa-label is-required">{{ L.productModel }}</label>
        <a-select
          v-model:value="form.productModel"
          size="large"
          placeholder="请选择"
          :options="modelOptions"
          :status="errors.productModel ? 'error' : undefined"
        />
        <div v-if="errors.productModel" class="fa-error">{{ errors.productModel }}</div>
      </div>

      <div class="fa-field" :class="{ 'has-error': errors.snPhotos }">
        <label class="fa-label is-required">{{ L.snPhotos }}</label>
        <input ref="fileInput" class="fa-file" type="file" accept="image/*" @change="onPhotoChange">
        <div v-if="photo" class="fa-photo">
          <img :src="photo.url" :alt="L.snPhotos">
          <button type="button" class="fa-photo__remove" aria-label="删除" @click="removePhoto">
            <CloseOutlined />
          </button>
        </div>
        <button v-else type="button" class="fa-upload" :class="{ 'is-error': errors.snPhotos }" @click="pickPhoto">
          <CameraOutlined class="fa-upload__icon" />
          <span>上传照片</span>
        </button>
        <div v-if="errors.snPhotos" class="fa-error">{{ errors.snPhotos }}</div>
      </div>

      <div class="fa-field" :class="{ 'has-error': errors.sn }">
        <label class="fa-label is-required">{{ L.sn }}</label>
        <a-input
          v-model:value="form.sn"
          size="large"
          placeholder="请输入"
          allow-clear
          :status="errors.sn ? 'error' : undefined"
        />
        <div v-if="errors.sn" class="fa-error">{{ errors.sn }}</div>
      </div>

      <div class="fa-field" :class="{ 'has-error': errors.studentAccount }">
        <label class="fa-label is-required">{{ L.studentAccount }}</label>
        <a-input
          v-model:value="form.studentAccount"
          size="large"
          placeholder="请输入"
          :status="errors.studentAccount ? 'error' : undefined"
        />
        <div v-if="errors.studentAccount" class="fa-error">{{ errors.studentAccount }}</div>
      </div>

      <div class="fa-field" :class="{ 'has-error': errors.studentName }">
        <label class="fa-label is-required">{{ L.studentName }}</label>
        <a-input
          v-model:value="form.studentName"
          size="large"
          placeholder="请输入"
          :status="errors.studentName ? 'error' : undefined"
        />
        <div v-if="errors.studentName" class="fa-error">{{ errors.studentName }}</div>
      </div>

      <div class="fa-field" :class="{ 'has-error': errors.schoolName }">
        <label class="fa-label is-required">{{ L.schoolName }}</label>
        <a-select
          v-model:value="form.schoolId"
          size="large"
          placeholder="请选择"
          show-search
          :options="schoolOptions"
          :filter-option="filterSchool"
          :status="errors.schoolName ? 'error' : undefined"
        />
        <div v-if="errors.schoolName" class="fa-error">{{ errors.schoolName }}</div>
      </div>

      <div class="fa-field" :class="{ 'has-error': errors.reason }">
        <label class="fa-label is-required">{{ L.reason }}</label>
        <a-select
          v-model:value="form.reason"
          size="large"
          placeholder="请选择"
          :options="reasonOptions"
          :status="errors.reason ? 'error' : undefined"
        />
        <div v-if="errors.reason" class="fa-error">{{ errors.reason }}</div>
      </div>
    </section>

    <section class="fa-card">
      <div class="fa-field">
        <label class="fa-label">{{ L.romVersion }}</label>
        <a-input v-model:value="form.romVersion" size="large" placeholder="请输入" />
      </div>
      <div class="fa-field">
        <label class="fa-label">{{ L.mdmVersion }}</label>
        <a-input v-model:value="form.mdmVersion" size="large" placeholder="请输入" />
      </div>
    </section>

    <section class="fa-card">
      <div class="fa-field" :class="{ 'has-error': errors.contactPhone }">
        <label class="fa-label is-required">{{ L.contactPhone }}</label>
        <a-input
          v-model:value="form.contactPhone"
          size="large"
          type="tel"
          inputmode="numeric"
          :maxlength="11"
          placeholder="请输入"
          :status="errors.contactPhone ? 'error' : undefined"
        />
        <div v-if="errors.contactPhone" class="fa-error">{{ errors.contactPhone }}</div>
      </div>
    </section>

    <template #footer>
      <a-button type="primary" size="large" block @click="submit">提交申请</a-button>
    </template>
  </FlashMobileShell>
</template>

<style scoped>
.fa-alert {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  padding: 10px 16px;
  background: #fff1f0;
  border-bottom: 1px solid #ffccc7;
  color: #cf1322;
  font-size: 14px;
  line-height: 1.5;
}
.fa-alert__text {
  flex: 1 1 auto;
  min-width: 0;
  word-break: break-all;
}
.fa-alert__link {
  flex: none;
  color: #1a6fff;
  font-weight: 500;
  cursor: pointer;
}
.fa-card {
  margin-bottom: 12px;
  padding: 4px 16px;
  border-radius: 10px;
  background: #fff;
}
.fa-field {
  padding: 12px 0;
}
.fa-field + .fa-field {
  border-top: 1px solid #f2f3f5;
}
.fa-label {
  display: block;
  margin-bottom: 8px;
  color: #1d2129;
  font-size: 15px;
  font-weight: 500;
}
.fa-label.is-required::before {
  margin-right: 2px;
  color: #f53f3f;
  content: '*';
}
.fa-error {
  margin-top: 6px;
  color: #f53f3f;
  font-size: 13px;
  line-height: 1.4;
}
.fa-field :deep(.ant-select) {
  width: 100%;
}
.fa-file {
  display: none;
}
.fa-upload {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 96px;
  height: 96px;
  border: 1px dashed #c9cdd4;
  border-radius: 8px;
  background: #f7f8fa;
  color: #86909c;
  font-size: 13px;
  cursor: pointer;
}
.fa-upload.is-error {
  border-color: #f53f3f;
}
.fa-upload__icon {
  font-size: 24px;
}
.fa-photo {
  position: relative;
  width: 96px;
  height: 96px;
  overflow: hidden;
  border-radius: 8px;
  background: #f2f3f5;
}
.fa-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fa-photo__remove {
  position: absolute;
  top: 0;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-bottom-left-radius: 8px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}
.fa-result {
  padding: 32px 16px 24px;
  text-align: center;
}
.fa-result__icon {
  color: #00b42a;
  font-size: 56px;
}
.fa-result__title {
  margin: 14px 0 6px;
  font-size: 20px;
  font-weight: 600;
}
.fa-result__no {
  color: #4e5969;
  font-size: 14px;
}
.fa-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #1d2129;
}
.fa-card--steps {
  padding: 20px 8px 18px;
}
</style>
