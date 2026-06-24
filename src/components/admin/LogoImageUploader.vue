<script setup lang="ts">
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import type { UploadProps } from 'ant-design-vue';
import { CloudUploadOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import { DEFAULT_BRAND_LOGO_URL } from '@/constants/brand';

const props = withDefaults(defineProps<{
  modelValue: string | null;
  fileName?: string | null;
  maxBytes?: number;
  hint?: string;
}>(), {
  fileName: null,
  maxBytes: 1024 * 1024,
  hint: 'PNG、JPG 或 SVG · 不超过 1MB · 建议 1:1 正方形',
});

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
  'update:fileName': [value: string | null];
  change: [payload: { url: string | null; fileName: string | null }];
}>();

const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);
const LOGO_EXTS = ['.png', '.jpg', '.jpeg', '.svg'];

const loading = ref(false);
const hasCustomLogo = computed(() => !!props.modelValue);
const previewUrl = computed(() => props.modelValue ?? DEFAULT_BRAND_LOGO_URL);

function isLogoFile(file: File) {
  if (LOGO_TYPES.has(file.type)) return true;
  const name = file.name.toLowerCase();
  return LOGO_EXTS.some((ext) => name.endsWith(ext));
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}

function applyLogoFile(file: File) {
  if (!isLogoFile(file)) {
    message.error('仅支持 PNG、JPG 或 SVG 格式');
    return;
  }
  if (file.size > props.maxBytes) {
    message.error(`Logo 文件不能超过 ${formatSize(props.maxBytes)}`);
    return;
  }

  loading.value = true;
  const reader = new FileReader();
  reader.onload = () => {
    const url = reader.result as string;
    emit('update:modelValue', url);
    emit('update:fileName', file.name);
    emit('change', { url, fileName: file.name });
    loading.value = false;
    message.success('Logo 已选择，请点击「保存资料」生效');
  };
  reader.onerror = () => {
    loading.value = false;
    message.error('读取图片失败，请重试');
  };
  reader.readAsDataURL(file);
}

const beforeUpload: UploadProps['beforeUpload'] = (file) => {
  applyLogoFile(file as File);
  return false;
};

function removeLogo(e: MouseEvent) {
  e.stopPropagation();
  emit('update:modelValue', null);
  emit('update:fileName', null);
  emit('change', { url: null, fileName: null });
  message.success('已恢复系统默认 Logo，请点击「保存资料」生效');
}
</script>

<template>
  <a-upload-dragger
    class="logo-upload"
    :class="{ 'has-custom': hasCustomLogo, 'is-loading': loading }"
    :show-upload-list="false"
    :multiple="false"
    :disabled="loading"
    accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
    :before-upload="beforeUpload"
  >
    <div class="logo-uploader">
      <div class="logo-preview" :aria-label="hasCustomLogo ? '更换企业 Logo' : '上传企业 Logo'">
        <a-spin v-if="loading" size="small" />
        <template v-else>
          <img :src="previewUrl" alt="企业 Logo 预览" class="logo-img" />
          <span class="logo-preview-mask">
            <CloudUploadOutlined />
            <span>{{ hasCustomLogo ? '更换' : '上传' }}</span>
          </span>
        </template>
      </div>

      <div class="logo-body">
        <div class="logo-title-row">
          <span class="logo-title">企业 Logo</span>
          <span
            v-if="hasCustomLogo && fileName"
            class="logo-file-tag"
            :title="fileName"
          >{{ fileName }}</span>
        </div>
        <p class="logo-hint">{{ hint }}</p>
        <div class="logo-actions">
          <a-button size="small" type="primary" ghost :loading="loading">
            <template #icon><CloudUploadOutlined /></template>
            {{ hasCustomLogo ? '重新选择' : '更换 Logo' }}
          </a-button>
          <a-button
            v-if="hasCustomLogo"
            size="small"
            danger
            type="text"
            :disabled="loading"
            @click="removeLogo"
          >
            <template #icon><DeleteOutlined /></template>
            恢复默认
          </a-button>
        </div>
      </div>
    </div>
  </a-upload-dragger>
</template>

<style scoped>
.logo-upload {
  max-width: 560px;
}

.logo-upload :deep(.ant-upload) {
  padding: 0;
  border: none;
  background: transparent;
}

.logo-upload :deep(.ant-upload-drag) {
  padding: 0;
  border: 1px dashed #d1d5db;
  border-radius: 12px;
  background: #fafbfc;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.logo-upload :deep(.ant-upload-drag:not(.ant-upload-disabled):hover),
.logo-upload :deep(.ant-upload-drag-hover:not(.ant-upload-disabled)) {
  border-color: #93b4f5;
  background: #f8fbff;
  box-shadow: 0 2px 8px rgba(26, 111, 255, 0.06);
}

.logo-upload.has-custom :deep(.ant-upload-drag) {
  background: #fff;
}

.logo-upload.logo-uploader--dirty :deep(.ant-upload-drag) {
  border-color: #fbbf24;
  background: #fffbeb;
}

.logo-upload.is-loading :deep(.ant-upload-drag) {
  pointer-events: none;
  opacity: 0.92;
}

.logo-uploader {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  text-align: left;
}

.logo-preview {
  position: relative;
  flex: none;
  width: 88px;
  height: 88px;
  border: 1px dashed #d1d5db;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  padding: 8px;
  box-sizing: border-box;
}

.logo-preview-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: rgba(17, 24, 39, 0.55);
  color: #fff;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s;
}

.logo-upload:hover .logo-preview-mask {
  opacity: 1;
}

.logo-body {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}

.logo-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.logo-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  line-height: 1.4;
}

.logo-file-tag {
  flex: 1;
  min-width: 0;
  max-width: 220px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.logo-hint {
  margin: 6px 0 12px;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.5;
}

.logo-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
