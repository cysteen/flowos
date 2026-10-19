<script setup lang="ts">
/**
 * 刷机单 · 「修改刷机信息」弹窗（1013 A12 / B1 / B8，PRD §5.6 / §5.8，M52 / M53 / M63 / M70 / M78–M80）。
 * 所有机型只有这一个入口；底部按钮按弹窗里**所选的产品**取值，改选产品随即切换：
 * 自研机型（支持线上自助推送）为「取消 / 重新推送」，提交即推送（唯一的推送入口）；其他机型为「取消 / 保存」，只保存不推送。
 *
 * - 9 个字段按本单当前值预填；产品名称下拉只列支持刷机的产品；ROM版本 / MDM版本有 MDM 回填值时只读。
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
import { SCHOOL_LIBRARY, findSchoolById } from '@/mock/schools';
import { FLASH_FIELD_LABELS as L, type FlashInfo } from '@/views/tickets/types/flash';
import { snPlateDataUri } from '@/views/tickets/utils/flashSnPlate';

const props = defineProps<{
  open: boolean;
  info: FlashInfo;
  /** 提交：交给刷机服务，返回拦截 / 校验结论。`push` ＝ 所选产品为自研机型，走重新推送 */
  submitter: (changes: FlashInfoChanges, push: boolean) => FlashActionResult;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  done: [result: FlashActionResult];
}>();

const router = useRouter();
const config = useFlashConfigStore();

type FieldKey = 'productModel' | 'sn' | 'studentAccount' | 'studentName' | 'schoolId' | 'reason' | 'romVersion' | 'mdmVersion';

interface Draft {
  productModel: string;
  sn: string;
  studentAccount: string;
  studentName: string;
  schoolId: string;
  reason: string;
  romVersion: string;
  mdmVersion: string;
  snPhotos: string[];
}

function fromInfo(i: FlashInfo): Draft {
  return {
    productModel: i.productModel,
    sn: i.sn,
    studentAccount: i.studentAccount,
    studentName: i.studentName,
    schoolId: i.schoolId,
    reason: i.reason,
    romVersion: i.romVersion,
    mdmVersion: i.mdmVersion,
    snPhotos: [...i.snPhotos],
  };
}

const original = ref<Draft>(fromInfo(props.info));
const draft = reactive<Draft>(fromInfo(props.info));
const errors = reactive<Partial<Record<FieldKey, string>>>({});
const bottomTip = ref<{ text: string; inflightNo?: string } | null>(null);
const photoList = ref<UploadFile[]>([]);

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    original.value = fromInfo(props.info);
    Object.assign(draft, fromInfo(props.info));
    (Object.keys(errors) as FieldKey[]).forEach((k) => delete errors[k]);
    bottomTip.value = null;
    // 本单已存照片出缩略图（与处理页「刷机信息」区块同一张铭牌图），点开看大图
    photoList.value = draft.snPhotos.map((name, i) => {
      const src = snPlateDataUri(props.info.sn || name);
      return { uid: `sn-${i}-${name}`, name, status: 'done', url: src, thumbUrl: src };
    });
  },
  { immediate: true },
);

const versionLocked = computed(() => props.info.versionBackfilled);

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
/** 所选产品为自研机型（支持线上自助推送）：主按钮「重新推送」，否则「保存」（B8） */
const pushable = computed(() => config.isSupportedModel(draft.productModel) && config.isSelfDeveloped(draft.productModel));

const reasonOptions = computed(() => config.enabledReasons().map((r) => ({ value: r, label: r })));
const schoolOptions = SCHOOL_LIBRARY.map((s) => ({ value: s.id, label: s.name }));

function setSelect(key: 'productModel' | 'schoolId' | 'reason', v: unknown) {
  draft[key] = v == null ? '' : String(v);
  delete errors[key];
}
function onInput(key: FieldKey) {
  delete errors[key];
}
function onPhotoChange({ fileList }: { fileList: UploadFile[] }) {
  const list = fileList.slice(-1);
  photoList.value = list;
  draft.snPhotos = list.map((f) => f.name);
}

/** 缩略图点开大图：已存照片取铭牌图，新选的本地图片取读出的预览 */
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
const dash = (s: string) => (s && s.trim() ? s.trim() : '—');

/** 「本次修改」：与打开时相比有变化的字段，〈字段〉：〈原值〉 → 〈新值〉 */
const changeLines = computed<string[]>(() => {
  const o = original.value;
  const rows: [string, string, string][] = [
    [L.productName, o.productModel, draft.productModel],
    [L.sn, o.sn, draft.sn.trim().toUpperCase()],
    [L.studentAccount, o.studentAccount, draft.studentAccount.trim()],
    [L.studentName, o.studentName, draft.studentName.trim()],
    [L.schoolName, schoolNameOf(o.schoolId) || '', schoolNameOf(draft.schoolId)],
    [L.reason, o.reason, draft.reason],
    [L.romVersion, o.romVersion, draft.romVersion.trim()],
    [L.mdmVersion, o.mdmVersion, draft.mdmVersion.trim()],
  ];
  const lines = rows
    .filter(([, a, b]) => (a ?? '').trim() !== (b ?? '').trim())
    .map(([label, a, b]) => `${label}：${dash(a)} → ${dash(b)}`);
  if (o.snPhotos.join('|') !== draft.snPhotos.join('|')) lines.push(`${L.snPhotos}：已更换`);
  return lines;
});

const REQUIRED: { key: FieldKey; label: string; select: boolean }[] = [
  { key: 'productModel', label: L.productName, select: true },
  { key: 'sn', label: L.sn, select: false },
  { key: 'studentAccount', label: L.studentAccount, select: false },
  { key: 'studentName', label: L.studentName, select: false },
  { key: 'schoolId', label: L.schoolName, select: true },
  { key: 'reason', label: L.reason, select: true },
];

function onSubmit() {
  let missing = false;
  categoryError.value = draftCategory.value ? '' : `请选择${L.productCategory}`;
  if (categoryError.value) missing = true;
  REQUIRED.forEach(({ key, label, select }) => {
    if (!String(draft[key] ?? '').trim()) {
      errors[key] = select ? `请选择${label}` : `请填写${label}`;
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
    studentAccount: draft.studentAccount.trim(),
    studentName: draft.studentName.trim(),
    schoolId: draft.schoolId,
    schoolName: schoolNameOf(draft.schoolId),
    reason: draft.reason,
    romVersion: draft.romVersion.trim(),
    mdmVersion: draft.mdmVersion.trim(),
    snPhotos: [...draft.snPhotos],
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
          <label class="fe-label"><span class="req">*</span>{{ L.studentAccount }}</label>
          <div class="fe-control">
            <a-input v-model:value="draft.studentAccount" class="fe-input" placeholder="请输入学生账号" :status="errors.studentAccount ? 'error' : ''" @input="onInput('studentAccount')" />
            <div v-if="errors.studentAccount" class="fe-error">{{ errors.studentAccount }}</div>
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
          <label class="fe-label"><span class="req">*</span>{{ L.schoolName }}</label>
          <div class="fe-control">
            <FormSelect
              :value="draft.schoolId || undefined"
              class="fe-input"
              placeholder="请搜索或选择学校"
              :status="errors.schoolId ? 'error' : ''"
              :options="schoolOptions"
              @update:value="(v) => setSelect('schoolId', v)"
            />
            <div v-if="errors.schoolId" class="fe-error">{{ errors.schoolId }}</div>
          </div>
        </div>
        <div class="fe-field">
          <label class="fe-label"><span class="req">*</span>{{ L.reason }}</label>
          <div class="fe-control">
            <FormSelect
              :value="draft.reason || undefined"
              class="fe-input"
              placeholder="请选择"
              :status="errors.reason ? 'error' : ''"
              :options="reasonOptions"
              @update:value="(v) => setSelect('reason', v)"
            />
            <div v-if="errors.reason" class="fe-error">{{ errors.reason }}</div>
          </div>
        </div>
        <div class="fe-field">
          <label class="fe-label">{{ L.romVersion }}</label>
          <div class="fe-control fe-inline">
            <a-input v-model:value="draft.romVersion" class="fe-input" placeholder="请输入ROM版本" :disabled="versionLocked" />
            <span v-if="versionLocked && draft.romVersion" class="fe-backfill">MDM 回填</span>
          </div>
        </div>
        <div class="fe-field">
          <label class="fe-label">{{ L.mdmVersion }}</label>
          <div class="fe-control fe-inline">
            <a-input v-model:value="draft.mdmVersion" class="fe-input" placeholder="请输入MDM版本" :disabled="versionLocked" />
            <span v-if="versionLocked && draft.mdmVersion" class="fe-backfill">MDM 回填</span>
          </div>
        </div>
      </div>

      <div class="fe-field fe-photo">
        <label class="fe-label">{{ L.snPhotos }}</label>
        <div class="fe-control">
          <a-upload
            :file-list="photoList"
            list-type="picture-card"
            accept="image/*"
            :max-count="1"
            :before-upload="() => false"
            :show-upload-list="{ showPreviewIcon: true, showRemoveIcon: true }"
            @change="onPhotoChange"
            @preview="onPhotoPreview"
          >
            <div v-if="!photoList.length" class="fe-upload-btn">
              <PlusOutlined />
              <span>上传</span>
            </div>
          </a-upload>
          <div class="fe-photo-preview">
            <a-image
              :src="photoPreview.src"
              :preview="{ visible: photoPreview.open, src: photoPreview.src, onVisibleChange: (v: boolean) => (photoPreview.open = v) }"
            />
          </div>
        </div>
      </div>

      <div v-if="changeLines.length" class="fe-changes">
        <div class="fe-changes-title">本次修改</div>
        <div v-for="line in changeLines" :key="line" class="fe-change">{{ line }}</div>
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
.fe-label { flex: none; width: 76px; font-size: 13px; color: #374151; line-height: 32px; white-space: nowrap; }
.req { color: #ef4444; margin-right: 2px; }
.fe-control { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.fe-inline { flex-direction: row; align-items: center; gap: 6px; }
.fe-input { width: 100%; }
.fe-error { margin-top: 2px; font-size: 12px; line-height: 18px; color: #ef4444; }
.fe-backfill { flex: none; font-size: 12px; color: #9ca3af; white-space: nowrap; }
.fe-photo :deep(.ant-upload-wrapper .ant-upload.ant-upload-select),
.fe-photo :deep(.ant-upload-list-item-container) { width: 88px !important; height: 88px !important; margin: 0 !important; }
.fe-photo :deep(.ant-upload-list-item-thumbnail img) { object-fit: cover; }
.fe-photo-preview { display: none; }
.fe-upload-btn { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; color: #6b7280; }
.fe-changes {
  display: flex; flex-direction: column; gap: 4px; padding: 10px 12px;
  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 12px;
}
.fe-changes-title { font-weight: 600; color: #374151; }
.fe-change { color: #4b5563; line-height: 1.6; }
.fe-tip { font-size: 13px; color: #ef4444; line-height: 1.6; }
.fe-tip a { color: #1a6fff; text-decoration: underline; }
</style>
