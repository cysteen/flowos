<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { CameraOutlined, CheckCircleFilled, CloseOutlined } from '@ant-design/icons-vue';
import { useFlashStore, type FlashCreateInput, type FlashEvaluationBlocked } from '@/stores/flash';
import { useFlashConfigStore } from '@/stores/flashConfig';
import { MDM_DEVICES } from '@/mock/flash/mdmDevices';
import {
  FLASH_FIELD_LABELS, FLASH_STUDENT_TYPE_OPTIONS, FLASH_USER_REPORT_LABELS, FLASH_USER_TEXT_MAX,
  type FlashStudentType,
} from '@/views/tickets/types/flash';
import FlashMobileShell from './FlashMobileShell.vue';
import FlashProgressSteps from './FlashProgressSteps.vue';
import { useFlashProgress, userStageText } from './useFlashProgress';

/**
 * 用户提报页「刷机申请」与结果页（930 教育刷机单 PRD §2.5 / 页面规格 P2 · P0-1/2/3/5/6/7）。
 * 字段、顺序、占位与校验按小程序接口字段（2026-10-21）：学生姓名 · 学生类型 · 学生账号 · 学校名称 ·
 * 学习证明附件（仅转校生）· 设备信息 · 产品信息 · 设备SN · 设备SN照片 · 恢复原生系统原因；小程序不传 MDM信息图片。
 * 校验顺序：必填 → 同 SN 在途（查询不可用 → 系统繁忙），判定走 `evaluateCreate`，建单走 `createFlashTicket`。
 */

/** 小程序授权手机号 */
const AUTHORIZED_PHONE = '13856011288';

type PhotoKey = 'studyProofPhotos' | 'productPhotos' | 'snPhotos';
type TextKey = 'studentName' | 'studentAccount' | 'schoolName' | 'sn' | 'reason' | 'contactPhone';
type FieldKey = TextKey | 'studentType' | 'productModel' | PhotoKey;

const L = FLASH_FIELD_LABELS;
const U = FLASH_USER_REPORT_LABELS;
/** 提报页字段名：设备信息 / 产品信息 / 恢复原生系统原因为小程序叫法，落单后即产品名称 / 产品信息图片 / 刷机原因 */
const LABEL: Record<FieldKey, string> = {
  studentName: L.studentName,
  studentType: L.studentType,
  studentAccount: L.studentAccount,
  schoolName: L.schoolName,
  studyProofPhotos: L.studyProofPhotos,
  productModel: U.productModel,
  productPhotos: U.productPhotos,
  sn: L.sn,
  snPhotos: L.snPhotos,
  reason: U.reason,
  contactPhone: L.contactPhone,
};
/** 选择类字段提示「请选择」，图片「请上传」，其余「请填写」（P0-3） */
const REQUIRED_TIP: Record<FieldKey, string> = {
  studentName: `请填写${LABEL.studentName}`,
  studentType: `请选择${LABEL.studentType}`,
  studentAccount: `请填写${LABEL.studentAccount}`,
  schoolName: `请填写${LABEL.schoolName}`,
  studyProofPhotos: `请上传${LABEL.studyProofPhotos}`,
  productModel: `请选择${LABEL.productModel}`,
  productPhotos: `请上传${LABEL.productPhotos}`,
  sn: `请填写${LABEL.sn}`,
  snPhotos: `请上传${LABEL.snPhotos}`,
  reason: `请填写${LABEL.reason}`,
  contactPhone: `请填写${LABEL.contactPhone}`,
};
const LABEL_TO_KEY = Object.fromEntries(
  (Object.keys(LABEL) as FieldKey[]).map((k) => [LABEL[k], k]),
) as Record<string, FieldKey>;

const router = useRouter();
const flash = useFlashStore();
const config = useFlashConfigStore();

// 机型清单以小程序为准，工单系统不按问题分类筛（10-19 用户定）
const modelOptions = computed(() => config.models.map((m) => ({ value: m.model, label: m.model })));

const form = reactive({
  studentName: '',
  studentType: undefined as FlashStudentType | undefined,
  studentAccount: '',
  /** 学校名称：自由文本（不是省市区级联），工单系统不校验（10-19 C8；毕业生身份按学生账号判定） */
  schoolName: '',
  productModel: undefined as string | undefined,
  sn: '',
  reason: '',
  contactPhone: AUTHORIZED_PHONE,
});
/** 学习证明附件（转校生必传）/ 产品信息（必传）/ 设备SN照片（必传），各 1 张 */
const photos = reactive<Record<PhotoKey, { name: string; url: string } | null>>({
  studyProofPhotos: null, productPhotos: null, snPhotos: null,
});
const fileInputs = reactive<Record<PhotoKey, HTMLInputElement | null>>({
  studyProofPhotos: null, productPhotos: null, snPhotos: null,
});

/** 学习证明附件仅学生类型为转校生时显示 */
const needStudyProof = computed(() => form.studentType === '转校生');

/** 文本输入项：长度上限（学生姓名 / 学生账号 / 学校名称最长 50 字） */
const TEXT_MAX: Partial<Record<TextKey, number>> = {
  studentName: FLASH_USER_TEXT_MAX,
  studentAccount: FLASH_USER_TEXT_MAX,
  schoolName: FLASH_USER_TEXT_MAX,
};

/** 字段次序（小程序接口字段表）：学生信息一张卡，设备信息一张卡 */
type Row =
  | { kind: 'text'; key: TextKey }
  | { kind: 'textarea'; key: 'reason' }
  | { kind: 'select'; key: 'studentType' | 'productModel' }
  | { kind: 'photo'; key: PhotoKey };
const STUDENT_ROWS = computed<Row[]>(() => [
  { kind: 'text', key: 'studentName' },
  { kind: 'select', key: 'studentType' },
  { kind: 'text', key: 'studentAccount' },
  { kind: 'text', key: 'schoolName' },
  ...(needStudyProof.value ? [{ kind: 'photo', key: 'studyProofPhotos' } as Row] : []),
]);
const DEVICE_ROWS: Row[] = [
  { kind: 'select', key: 'productModel' },
  { kind: 'photo', key: 'productPhotos' },
  { kind: 'text', key: 'sn' },
  { kind: 'photo', key: 'snPhotos' },
  { kind: 'textarea', key: 'reason' },
];
/** 占位：文本项与学生类型「请填写」，设备信息「请选择」，恢复原生系统原因不设占位 */
const PLACEHOLDER: Partial<Record<FieldKey, string>> = {
  studentName: '请填写',
  studentType: '请填写',
  studentAccount: '请填写',
  schoolName: '请填写',
  productModel: '请选择',
  sn: '请填写',
};

const errors = reactive<Partial<Record<FieldKey, string>>>({});
const alert = ref<{ text: string; inflightNo?: string } | null>(null);

function clearError(k: FieldKey) {
  delete errors[k];
}

watch(() => form.productModel, () => { clearError('productModel'); alert.value = null; });
watch(() => form.sn, () => { clearError('sn'); alert.value = null; });
watch(() => form.studentType, () => { clearError('studentType'); clearError('studyProofPhotos'); });
watch(() => form.studentAccount, () => clearError('studentAccount'));
watch(() => form.studentName, () => clearError('studentName'));
watch(() => form.schoolName, () => clearError('schoolName'));
watch(() => form.reason, () => clearError('reason'));
watch(() => form.contactPhone, () => clearError('contactPhone'));

function selectOptions(key: 'studentType' | 'productModel') {
  return key === 'studentType' ? FLASH_STUDENT_TYPE_OPTIONS : modelOptions.value;
}

/* ---------------- 图片 · 设备SN照片识别 SN ---------------- */

/** 按 MDM 设备台账识别照片里的 SN；识别不出返回空（P0-7：不填入） */
function recognizeSn(fileName: string): string {
  const name = fileName.toUpperCase();
  const hit = [...MDM_DEVICES]
    .sort((a, b) => b.sn.length - a.sn.length)
    .find((d) => name.includes(d.sn.toUpperCase()));
  return hit?.sn ?? '';
}

function pickPhoto(key: PhotoKey) {
  fileInputs[key]?.click();
}

function onPhotoChange(key: PhotoKey, e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    photos[key] = { name: file.name, url: String(reader.result ?? '') };
    clearError(key);
    if (key !== 'snPhotos') return;
    const sn = recognizeSn(file.name);
    if (sn) form.sn = sn;
  };
  reader.readAsDataURL(file);
}

function removePhoto(key: PhotoKey) {
  photos[key] = null;
}

/* ---------------- 提交 ---------------- */

const resultNo = ref('');

function buildInput(): FlashCreateInput {
  return {
    productModel: form.productModel ?? '',
    sn: form.sn,
    studentType: form.studentType ?? '',
    studentAccount: form.studentAccount,
    studentName: form.studentName,
    // 小程序学校为文本，无学校库 ID、无省市区
    schoolId: '',
    schoolName: form.schoolName.trim(),
    reason: form.reason.trim(),
    snPhotos: photos.snPhotos ? [photos.snPhotos.name] : [],
    productPhotos: photos.productPhotos ? [photos.productPhotos.name] : [],
    studyProofPhotos: needStudyProof.value && photos.studyProofPhotos ? [photos.studyProofPhotos.name] : [],
    contactPhone: form.contactPhone,
  };
}

/** 文本超长（输入框已限 50 字，粘贴等兜底） */
function overLength(): boolean {
  let over = false;
  (Object.keys(TEXT_MAX) as TextKey[]).forEach((k) => {
    const max = TEXT_MAX[k]!;
    if (form[k].trim().length > max) {
      errors[k] = `${LABEL[k]}最长${max}字`;
      over = true;
    }
  });
  return over;
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
  // 次序：必填 → 长度上限 → 在途
  if (ev.kind === 'blocked' && ev.code === 'required') {
    showBlocked(ev);
    overLength();
    return;
  }
  (Object.keys(errors) as FieldKey[]).forEach(clearError);
  if (overLength()) {
    alert.value = null;
    nextTick(() => {
      document.querySelector('.fa-field.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return;
  }
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

    <section v-for="(rows, ci) in [STUDENT_ROWS, DEVICE_ROWS]" :key="ci" class="fa-card">
      <div v-for="r in rows" :key="r.key" class="fa-field" :class="{ 'has-error': errors[r.key] }">
        <label class="fa-label is-required">{{ LABEL[r.key] }}</label>
        <a-input
          v-if="r.kind === 'text'"
          v-model:value="form[r.key]"
          size="large"
          :placeholder="PLACEHOLDER[r.key]"
          :maxlength="TEXT_MAX[r.key]"
          :allow-clear="r.key === 'sn'"
          :status="errors[r.key] ? 'error' : undefined"
        />
        <a-select
          v-else-if="r.kind === 'select'"
          v-model:value="form[r.key]"
          size="large"
          :placeholder="PLACEHOLDER[r.key]"
          :options="selectOptions(r.key)"
          :status="errors[r.key] ? 'error' : undefined"
        />
        <a-textarea
          v-else-if="r.kind === 'textarea'"
          v-model:value="form[r.key]"
          size="large"
          :rows="3"
          :status="errors[r.key] ? 'error' : undefined"
        />
        <template v-else>
          <input :ref="(el) => { fileInputs[r.key] = el as HTMLInputElement | null; }" class="fa-file" type="file" accept="image/*" @change="(e) => onPhotoChange(r.key, e)">
          <div v-if="photos[r.key]" class="fa-photo">
            <img :src="photos[r.key]!.url" :alt="LABEL[r.key]">
            <button type="button" class="fa-photo__remove" aria-label="删除" @click="removePhoto(r.key)">
              <CloseOutlined />
            </button>
          </div>
          <button v-else type="button" class="fa-upload" :class="{ 'is-error': errors[r.key] }" @click="pickPhoto(r.key)">
            <CameraOutlined class="fa-upload__icon" />
            <span>上传照片</span>
          </button>
        </template>
        <div v-if="errors[r.key]" class="fa-error">{{ errors[r.key] }}</div>
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
