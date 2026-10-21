<script setup lang="ts">
/**
 * 刷机单 · 「修改刷机信息」弹窗（1013 A12 / B1 / B8，PRD §5.6 / §5.8，M52 / M53 / M70 / M78–M80）。
 * 所有机型只有这一个入口；底部按钮按弹窗里**所选的产品**取值，改选产品随即切换：
 * 产品在自研机型表（PRD 附录 A.4）为「取消 / 重新推送」，校验通过即推送（唯一的推送入口）；不在表中为「取消 / 保存」，只保存不推送。
 *
 * - 字段按本单当前值预填：产品分类 · 产品名称 · 设备SN · 学生类型 · 学生姓名 · 学生账号 · 学校名称 · 刷机原因 ·
 *   设备SN照片 · MDM信息图片（小程序单另有产品信息图片、学习证明附件，带了才出）；产品名称下拉只列支持刷机的产品。
 * - 学校只有原文的小程序单：学校检索框按原文预填，改选学校库条目即覆盖，不改选保留原文。
 * - 提交先判必填（字段下方红字），其余拦截与校验结果由刷机服务返回，显示在按钮上方行内红字；
 *   不通过时弹窗不关、已填内容保留。
 */
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { EditOutlined, PlusOutlined } from '@ant-design/icons-vue';
import type { UploadFile } from 'ant-design-vue';
import OpActionModal from './OpActionModal.vue';
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import { useFlashConfigStore } from '@/stores/flashConfig';
import type { FlashActionResult, FlashInfoChanges } from '@/stores/flash';
import { findSchoolById } from '@/mock/schools';
import { isSelfDevModel } from '@/mock/flash/models';
import FlashSchoolPicker from '@/views/tickets/components/create-ticket/FlashSchoolPicker.vue';
import {
  FLASH_FIELD_LABELS as L, FLASH_REASON_PLACEHOLDER, FLASH_STUDENT_TYPE_OPTIONS,
  type FlashInfo, type FlashStudentType,
} from '@/views/tickets/types/flash';
import { mdmInfoDataUri, productInfoDataUri, snPlateDataUri, studyProofDataUri } from '@/views/tickets/utils/flashSnPlate';

const props = defineProps<{
  open: boolean;
  info: FlashInfo;
  /** 提交：交给刷机服务，返回拦截 / 校验结论。`push` ＝ 所选产品在自研机型表，走重新推送 */
  submitter: (changes: FlashInfoChanges, push: boolean) => FlashActionResult;
  /** 客户信息的省市区（学校检索的默认地区，10-19 C5） */
  customerRegion?: string;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  done: [result: FlashActionResult];
}>();

const router = useRouter();
const config = useFlashConfigStore();

type PhotoKey = 'snPhotos' | 'mdmPhotos' | 'productPhotos' | 'studyProofPhotos';
type FieldKey = 'productModel' | 'sn' | 'studentType' | 'studentName' | 'studentAccount' | 'schoolId' | 'reason' | PhotoKey;

interface Draft {
  productModel: string;
  sn: string;
  studentType: FlashStudentType | '';
  studentName: string;
  studentAccount: string;
  schoolId: string;
  reason: string;
  snPhotos: string[];
  mdmPhotos: string[];
  productPhotos: string[];
  studyProofPhotos: string[];
}

function fromInfo(i: FlashInfo): Draft {
  return {
    productModel: i.productModel,
    sn: i.sn,
    studentType: i.studentType ?? '',
    studentName: i.studentName,
    studentAccount: i.studentAccount,
    schoolId: i.schoolId,
    reason: i.reason,
    snPhotos: [...i.snPhotos],
    mdmPhotos: [...(i.mdmPhotos ?? [])],
    productPhotos: [...(i.productPhotos ?? [])],
    studyProofPhotos: [...(i.studyProofPhotos ?? [])],
  };
}

const ALL_PHOTO_KEYS: PhotoKey[] = ['snPhotos', 'mdmPhotos', 'productPhotos', 'studyProofPhotos'];

const original = ref<Draft>(fromInfo(props.info));
const draft = reactive<Draft>(fromInfo(props.info));
const errors = reactive<Partial<Record<FieldKey, string>>>({});
const bottomTip = ref<{ text: string; inflightNo?: string } | null>(null);
const photoLists = ref<Record<PhotoKey, UploadFile[]>>({ snPhotos: [], mdmPhotos: [], productPhotos: [], studyProofPhotos: [] });
/** 每次打开重挂学校选择器：地区与检索框按本单当前值重新预填 */
const openSeq = ref(0);

/** 本单已存图片的缩略图（与处理页「刷机信息」区块同一张图） */
function storedSrc(key: PhotoKey, name: string): string {
  const i = props.info;
  if (key === 'snPhotos') return snPlateDataUri(i.sn || name);
  if (key === 'productPhotos') return productInfoDataUri(i.productModel, i.sn || name);
  if (key === 'studyProofPhotos') return studyProofDataUri(i.studentName, i.schoolName);
  return mdmInfoDataUri(i.sn || name, i.studentAccount);
}

/**
 * 学校只有原文、无学校库 ID（小程序提报）：弹窗按原文预填学校检索框，坐席可改选省市区与学校库条目（选了即覆盖）；
 * 不改选时保留原文，学校名称不判必填。
 */
const textSchool = computed(() => !original.value.schoolId && !!props.info.schoolName?.trim());

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    openSeq.value += 1;
    original.value = fromInfo(props.info);
    Object.assign(draft, fromInfo(props.info));
    (Object.keys(errors) as FieldKey[]).forEach((k) => delete errors[k]);
    bottomTip.value = null;
    ALL_PHOTO_KEYS.forEach((key) => {
      photoLists.value[key] = draft[key].map((name, i) => {
        const src = storedSrc(key, name);
        return { uid: `${key}-${i}-${name}`, name, status: 'done', url: src, thumbUrl: src };
      });
    });
  },
  { immediate: true },
);

/** 产品所属的产品分类（产品字段两级：产品分类 + 产品名称，PRD §5.6） */
const categoryOf = (model: string) => config.modelOf(model)?.category ?? '';
const draftCategory = ref('');
const categoryError = ref('');
watch(
  () => props.open,
  (v) => {
    if (!v) return;
    draftCategory.value = categoryOf(props.info.productModel);
    categoryError.value = '';
  },
  { immediate: true },
);

/** 产品分类下拉：挂了刷机类问题分类的产品所在分类；本单原产品的分类保留 */
const categoryOptions = computed(() => {
  const cats = new Set(config.enabledModels().map((m) => m.category).filter(Boolean));
  const originCat = categoryOf(original.value.productModel);
  if (originCat) cats.add(originCat);
  return [...cats].map((c) => ({ value: c, label: c }));
});
function onCategoryChange(v: unknown) {
  draftCategory.value = v == null ? '' : String(v);
  if (categoryOf(draft.productModel) !== draftCategory.value) draft.productModel = '';
}

/**
 * 产品名称下拉只列所选分类下支持刷机的产品；本单原产品已不支持刷机时显示原值、不可再选（M101 / PRD §5.8）：
 * 不改产品可直接保存，改产品只能选支持刷机的产品。
 */
const modelOptions = computed(() => {
  const opts: { value: string; label: string; disabled?: boolean }[] = config.enabledModels()
    .filter((m) => !draftCategory.value || m.category === draftCategory.value)
    .map((m) => ({ value: m.model, label: m.model }));
  const origin = original.value.productModel;
  if (origin && !config.isSupportedModel(origin) && (!draftCategory.value || categoryOf(origin) === draftCategory.value)) {
    opts.unshift({ value: origin, label: origin, disabled: true });
  }
  return opts;
});
/**
 * 所选产品挂刷机类问题分类且在自研机型表：主按钮「重新推送」；不在表中，或本单产品已不挂刷机类问题分类且未改选：「保存」（PRD §5.6）
 */
const pushable = computed(() => config.isSupportedModel(draft.productModel) && isSelfDevModel(draft.productModel));

function setSelect(key: 'productModel' | 'schoolId', v: unknown) {
  draft[key] = v == null ? '' : String(v);
  delete errors[key];
}
function setStudentType(v: unknown) {
  draft.studentType = v == null ? '' : (String(v) as FlashStudentType);
  delete errors.studentType;
}
function onInput(key: FieldKey) {
  delete errors[key];
}
function onPhotoChange(key: PhotoKey, { fileList }: { fileList: UploadFile[] }) {
  const list = fileList.slice(-1);
  photoLists.value[key] = list;
  draft[key] = list.map((f) => f.name);
  if (list.length) delete errors[key];
}

/**
 * 图片项：设备SN照片、MDM信息图片恒有（选传）；产品信息图片、学习证明附件只在本单带了时出现（小程序单），
 * 可查看、可更换，出现即必传。
 */
const PHOTO_FIELDS = computed<{ key: PhotoKey; label: string; required: boolean }[]>(() => [
  { key: 'snPhotos', label: L.snPhotos, required: false },
  { key: 'mdmPhotos', label: L.mdmPhotos, required: false },
  ...(original.value.productPhotos.length ? [{ key: 'productPhotos' as const, label: L.productPhotos, required: true }] : []),
  ...(original.value.studyProofPhotos.length ? [{ key: 'studyProofPhotos' as const, label: L.studyProofPhotos, required: true }] : []),
]);

/** 缩略图点开大图：已存图片取本单图，新选的本地图片取读出的预览 */
const photoPreview = reactive({ open: false, src: '' });
async function onPhotoPreview(file: UploadFile) {
  let src = file.url || file.thumbUrl || '';
  if (!src && file.originFileObj) {
    src = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file.originFileObj as Blob);
    });
  }
  if (!src) return;
  photoPreview.src = src;
  photoPreview.open = true;
}

const schoolNameOf = (id: string) => findSchoolById(id)?.name ?? '';

const REQUIRED: { key: FieldKey; label: string; select: boolean }[] = [
  { key: 'productModel', label: L.productName, select: true },
  { key: 'sn', label: L.sn, select: false },
  { key: 'studentType', label: L.studentType, select: true },
  { key: 'studentName', label: L.studentName, select: false },
  { key: 'studentAccount', label: L.studentAccount, select: false },
  { key: 'schoolId', label: L.schoolName, select: true },
  { key: 'reason', label: L.reason, select: false },
];

function onSubmit() {
  let missing = false;
  categoryError.value = draftCategory.value ? '' : `请选择${L.productCategory}`;
  if (categoryError.value) missing = true;
  REQUIRED.forEach(({ key, label, select }) => {
    if (key === 'schoolId' && textSchool.value) {
      delete errors[key];
      return;
    }
    if (!String(draft[key] ?? '').trim()) {
      errors[key] = select ? `请选择${label}` : `请填写${label}`;
      missing = true;
    } else {
      delete errors[key];
    }
  });
  PHOTO_FIELDS.value.forEach(({ key, label, required }) => {
    if (required && !draft[key].length) {
      errors[key] = `请上传${label}`;
      missing = true;
    } else {
      delete errors[key];
    }
  });
  if (missing) {
    bottomTip.value = null;
    return;
  }
  const res = props.submitter({
    productModel: draft.productModel,
    sn: draft.sn.trim().toUpperCase(),
    studentType: draft.studentType as FlashStudentType,
    studentName: draft.studentName.trim(),
    studentAccount: draft.studentAccount.trim(),
    schoolId: draft.schoolId,
    // 选了学校库条目即覆盖；未选（小程序单保留原文）沿用本单学校名称
    schoolName: draft.schoolId ? schoolNameOf(draft.schoolId) : props.info.schoolName,
    reason: draft.reason.trim(),
    snPhotos: [...draft.snPhotos],
    mdmPhotos: [...draft.mdmPhotos],
    productPhotos: [...draft.productPhotos],
    studyProofPhotos: [...draft.studyProofPhotos],
  }, pushable.value);
  if (!res.ok) {
    bottomTip.value = { text: res.message, inflightNo: res.inflightNo };
    return;
  }
  emit('done', res);
  emit('update:open', false);
}

/** 行内提示里的在途单号：拆成「前 · 单号 · 后」三段，单号做成新页签链接 */
const tipParts = computed(() => {
  const t = bottomTip.value;
  if (!t) return null;
  if (!t.inflightNo || !t.text.includes(t.inflightNo)) return { before: t.text, no: '', after: '' };
  const i = t.text.indexOf(t.inflightNo);
  return { before: t.text.slice(0, i), no: t.inflightNo, after: t.text.slice(i + t.inflightNo.length) };
});
const inflightHref = computed(() => (tipParts.value?.no ? router.resolve(`/tickets/${tipParts.value.no}`).href : ''));
</script>

<template>
  <OpActionModal
    :open="open"
    title="修改刷机信息"
    :icon="EditOutlined"
    :ok-text="pushable ? '重新推送' : '保存'"
    :width="760"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
  >
    <div class="fe-body">
      <div class="fe-grid">
        <div class="fe-field">
          <label class="fe-label"><span class="req">*</span>{{ L.productCategory }}</label>
          <div class="fe-control">
            <FormSelect
              :value="draftCategory || undefined"
              class="fe-input"
              placeholder="请选择"
              :status="categoryError ? 'error' : ''"
              :options="categoryOptions"
              @update:value="(v) => { onCategoryChange(v); categoryError = ''; }"
            />
            <div v-if="categoryError" class="fe-error">{{ categoryError }}</div>
          </div>
        </div>
        <div class="fe-field">
          <label class="fe-label"><span class="req">*</span>{{ L.productName }}</label>
          <div class="fe-control">
            <FormSelect
              :value="draft.productModel || undefined"
              class="fe-input"
              placeholder="请选择"
              :status="errors.productModel ? 'error' : ''"
              :options="modelOptions"
              :dropdown-match-select-width="false"
              @update:value="(v) => setSelect('productModel', v)"
            />
            <div v-if="errors.productModel" class="fe-error">{{ errors.productModel }}</div>
          </div>
        </div>
        <div class="fe-field">
          <label class="fe-label"><span class="req">*</span>{{ L.sn }}</label>
          <div class="fe-control">
            <a-input v-model:value="draft.sn" class="fe-input" placeholder="请输入设备SN" :status="errors.sn ? 'error' : ''" @input="onInput('sn')" />
            <div v-if="errors.sn" class="fe-error">{{ errors.sn }}</div>
          </div>
        </div>
        <div class="fe-field">
          <label class="fe-label"><span class="req">*</span>{{ L.studentType }}</label>
          <div class="fe-control">
            <FormSelect
              :value="draft.studentType || undefined"
              class="fe-input"
              placeholder="请选择"
              :status="errors.studentType ? 'error' : ''"
              :options="FLASH_STUDENT_TYPE_OPTIONS"
              @update:value="setStudentType"
            />
            <div v-if="errors.studentType" class="fe-error">{{ errors.studentType }}</div>
          </div>
        </div>
        <div class="fe-field">
          <label class="fe-label"><span class="req">*</span>{{ L.studentName }}</label>
          <div class="fe-control">
            <a-input v-model:value="draft.studentName" class="fe-input" placeholder="请输入学生姓名" :status="errors.studentName ? 'error' : ''" @input="onInput('studentName')" />
            <div v-if="errors.studentName" class="fe-error">{{ errors.studentName }}</div>
          </div>
        </div>
        <div class="fe-field">
          <label class="fe-label"><span class="req">*</span>{{ L.studentAccount }}</label>
          <div class="fe-control">
            <a-input v-model:value="draft.studentAccount" class="fe-input" placeholder="请输入学生账号" :status="errors.studentAccount ? 'error' : ''" @input="onInput('studentAccount')" />
            <div v-if="errors.studentAccount" class="fe-error">{{ errors.studentAccount }}</div>
          </div>
        </div>
        <!-- 学校名称占整行：省市区与学校名称完整可见（D7） -->
        <div class="fe-field fe-wide">
          <label class="fe-label"><span class="req">*</span>{{ L.schoolName }}</label>
          <div class="fe-control">
            <FlashSchoolPicker
              :key="openSeq"
              :school-id="draft.schoolId"
              :default-region="customerRegion"
              :search-hint="original.schoolId ? '' : info.schoolName"
              :status="errors.schoolId ? 'error' : ''"
              @update:school-id="(v: string) => setSelect('schoolId', v)"
            />
            <div v-if="errors.schoolId" class="fe-error">{{ errors.schoolId }}</div>
          </div>
        </div>
        <div class="fe-field fe-wide">
          <label class="fe-label"><span class="req">*</span>{{ L.reason }}</label>
          <div class="fe-control">
            <a-textarea
              v-model:value="draft.reason"
              class="fe-input fe-textarea"
              :rows="3"
              :placeholder="FLASH_REASON_PLACEHOLDER"
              :status="errors.reason ? 'error' : ''"
              @input="onInput('reason')"
            />
            <div v-if="errors.reason" class="fe-error">{{ errors.reason }}</div>
          </div>
        </div>

        <div v-for="p in PHOTO_FIELDS" :key="p.key" class="fe-field fe-photo">
          <label class="fe-label"><span v-if="p.required" class="req">*</span>{{ p.label }}</label>
          <div class="fe-control">
            <a-upload
              :file-list="photoLists[p.key]"
              list-type="picture-card"
              accept="image/*"
              :max-count="1"
              :before-upload="() => false"
              :show-upload-list="{ showPreviewIcon: true, showRemoveIcon: true }"
              @change="onPhotoChange(p.key, $event)"
              @preview="onPhotoPreview"
            >
              <div v-if="!photoLists[p.key].length" class="fe-upload-btn">
                <PlusOutlined />
                <span>上传</span>
              </div>
            </a-upload>
            <div v-if="errors[p.key]" class="fe-error">{{ errors[p.key] }}</div>
          </div>
        </div>
      </div>
      <div class="fe-photo-preview">
        <a-image
          :src="photoPreview.src"
          :preview="{ visible: photoPreview.open, src: photoPreview.src, onVisibleChange: (v: boolean) => (photoPreview.open = v) }"
        />
      </div>

      <div v-if="tipParts" class="fe-tip">
        {{ tipParts.before }}<a v-if="tipParts.no" :href="inflightHref" target="_blank" rel="noopener">{{ tipParts.no }}</a>{{ tipParts.after }}
      </div>
    </div>
  </OpActionModal>
</template>

<style scoped>
.fe-body { display: flex; flex-direction: column; gap: 12px; }
.fe-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; }
.fe-field { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
.fe-wide { grid-column: 1 / -1; }
.fe-label { flex: none; width: 84px; font-size: 13px; color: #374151; line-height: 32px; white-space: nowrap; }
.req { color: #ef4444; margin-right: 2px; }
.fe-control { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.fe-input { width: 100%; }
.fe-textarea { resize: none; }
.fe-error { margin-top: 2px; font-size: 12px; line-height: 18px; color: #ef4444; }
.fe-photo :deep(.ant-upload-wrapper .ant-upload.ant-upload-select),
.fe-photo :deep(.ant-upload-list-item-container) { width: 88px !important; height: 88px !important; margin: 0 !important; }
.fe-photo :deep(.ant-upload-list-item-thumbnail img) { object-fit: cover; }
.fe-photo-preview { display: none; }
.fe-upload-btn { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; color: #6b7280; }
.fe-tip { font-size: 13px; color: #ef4444; line-height: 1.6; }
.fe-tip a { color: #1a6fff; text-decoration: underline; }
</style>
