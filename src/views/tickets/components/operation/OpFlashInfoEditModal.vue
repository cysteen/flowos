<script setup lang="ts">
/**
 * 刷机单 · 「修改刷机信息并重新推送」与「修改刷机信息」两个弹窗（930 教育刷机单 PRD §5.6 / §5.8，M52 / M53 / M63 / M70 / M78–M80）。
 * 两者字段、「本次修改」列表同源，只差标题、主按钮与提交动作（由处理页经 `submitter` 交给刷机服务）。
 *
 * - 9 个字段按本单当前值预填；产品型号下拉只列启用机型；ROM版本 / MDM版本有 MDM 回填值时只读。
 * - 提交先判必填（字段下方红字），其余拦截与校验结果由刷机服务返回，显示在按钮上方行内红字；
 *   不通过时弹窗不关、已填内容保留。
 */
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons-vue';
import type { UploadFile } from 'ant-design-vue';
import OpActionModal from './OpActionModal.vue';
import FormSelect from '@/views/tickets/components/create-ticket/FormSelect.vue';
import { useFlashConfigStore } from '@/stores/flashConfig';
import type { FlashActionResult, FlashInfoChanges } from '@/stores/flash';
import { SCHOOL_LIBRARY, findSchoolById } from '@/mock/schools';
import { FLASH_FIELD_LABELS as L, type FlashInfo } from '@/views/tickets/types/flash';

const props = defineProps<{
  open: boolean;
  /** repush ＝ 修改刷机信息并重新推送；edit ＝ 修改刷机信息（不推送） */
  mode: 'repush' | 'edit';
  info: FlashInfo;
  /** 提交：交给刷机服务，返回拦截 / 校验结论 */
  submitter: (changes: FlashInfoChanges) => FlashActionResult;
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
    photoList.value = draft.snPhotos.map((name, i) => ({ uid: `sn-${i}-${name}`, name, status: 'done' }));
  },
  { immediate: true },
);

const versionLocked = computed(() => props.info.versionBackfilled);

const modelOptions = computed(() => config.enabledModels().map((m) => ({ value: m.model, label: m.model })));
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

const schoolNameOf = (id: string) => findSchoolById(id)?.name ?? '';
const dash = (s: string) => (s && s.trim() ? s.trim() : '—');

/** 「本次修改」：与打开时相比有变化的字段，〈字段〉：〈原值〉 → 〈新值〉 */
const changeLines = computed<string[]>(() => {
  const o = original.value;
  const rows: [string, string, string][] = [
    [L.productModel, o.productModel, draft.productModel],
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
  { key: 'productModel', label: L.productModel, select: true },
  { key: 'sn', label: L.sn, select: false },
  { key: 'studentAccount', label: L.studentAccount, select: false },
  { key: 'studentName', label: L.studentName, select: false },
  { key: 'schoolId', label: L.schoolName, select: true },
  { key: 'reason', label: L.reason, select: true },
];

function onSubmit() {
  let missing = false;
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
  });
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
    :title="mode === 'repush' ? '修改刷机信息并重新推送' : '修改刷机信息'"
    :icon="mode === 'repush' ? ReloadOutlined : EditOutlined"
    :ok-text="mode === 'repush' ? '重新推送' : '保存修改'"
    :width="760"
    @update:open="emit('update:open', $event)"
    @ok="onSubmit"
  >
    <div class="fe-body">
      <div class="fe-grid">
        <div class="fe-field">
          <label class="fe-label"><span class="req">*</span>{{ L.productModel }}</label>
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
            :show-upload-list="{ showPreviewIcon: false }"
            @change="onPhotoChange"
          >
            <div v-if="!photoList.length" class="fe-upload-btn">
              <PlusOutlined />
              <span>上传</span>
            </div>
          </a-upload>
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
