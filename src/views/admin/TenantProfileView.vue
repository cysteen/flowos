<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  LockOutlined, EnvironmentOutlined, UploadOutlined,
} from '@ant-design/icons-vue';
import PlanTag from '@/components/admin/PlanTag.vue';
import { TENANT_INFO } from '@/mock/adminOverview';
import { useTenantBrandStore } from '@/stores/tenantBrand';

const LOGO_MAX_BYTES = 1024 * 1024;
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);
const LOGO_EXTS = ['.png', '.jpg', '.jpeg', '.svg'];

const brand = useTenantBrandStore();

type ProfileState = ReturnType<typeof createProfileState>;

function createProfileState(): {
  name: string; code: string; plan: string; status: string; expiry: string; seatScale: string;
  industry: string; timezone: string; lang: string;
  adminName: string; phone: string; email: string; hotline: string;
  logoUrl: string | null; logoFileName: string | null; logoText: string;
} {
  return {
    name: TENANT_INFO.name,
    code: 'IFLY-T0001',
    plan: TENANT_INFO.plan,
    status: TENANT_INFO.status,
    expiry: TENANT_INFO.expiry,
    seatScale: `${TENANT_INFO.seatTotal} 席`,
    industry: '智能硬件',
    timezone: 'GMT+8 北京',
    lang: '简体中文',
    adminName: '赵管理',
    phone: '139 0000 0000',
    email: 'admin@iflytek.com',
    hotline: '400-100-8000',
    logoUrl: brand.logoUrl,
    logoFileName: brand.logoFileName,
    logoText: 'iF',
  };
}

const profile = reactive(createProfileState());
const savedSnapshot = ref<ProfileState>({ ...createProfileState() });

const fileInputRef = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);

const INDUSTRIES = ['智能硬件', '互联网', '金融', '教育', '制造', '其他'];
const TIMEZONES = ['GMT+8 北京', 'GMT+0 伦敦', 'GMT-8 洛杉矶'];
const LANGS = ['简体中文', 'English'];

const logoDirty = computed(() => profile.logoUrl !== savedSnapshot.value.logoUrl);
const formDirty = computed(() => JSON.stringify(profile) !== JSON.stringify(savedSnapshot.value));

const logoStatusText = computed(() => {
  if (logoDirty.value) {
    if (!profile.logoUrl) return '已移除 Logo，保存后将从数据总览等页面撤下';
    const name = profile.logoFileName ? `「${profile.logoFileName}」` : '新图片';
    return `已选择 ${name}，保存后将在租户资料与数据总览同步展示`;
  }
  if (brand.logoUrl) {
    return brand.logoFileName ? `当前 Logo · ${brand.logoFileName} · 已全局生效` : '企业 Logo 已保存并全局生效';
  }
  return '尚未设置企业 Logo，上传后请点击底部「保存资料」';
});

function isLogoFile(file: File) {
  if (LOGO_TYPES.has(file.type)) return true;
  const name = file.name.toLowerCase();
  return LOGO_EXTS.some((ext) => name.endsWith(ext));
}

function applyLogoFile(file: File) {
  if (!isLogoFile(file)) {
    message.error('仅支持 png / jpg / svg 格式');
    return;
  }
  if (file.size > LOGO_MAX_BYTES) {
    message.error('Logo 文件不能超过 1MB');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    profile.logoUrl = reader.result as string;
    profile.logoFileName = file.name;
    message.success('Logo 已选择，请点击「保存资料」生效');
  };
  reader.onerror = () => message.error('读取图片失败，请重试');
  reader.readAsDataURL(file);
}

function triggerLogoUpload() {
  fileInputRef.value?.click();
}

function onLogoFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (file) applyLogoFile(file);
}

function onLogoDrop(e: DragEvent) {
  dragOver.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) applyLogoFile(file);
}

function removeLogo() {
  profile.logoUrl = null;
  profile.logoFileName = null;
  message.success('已移除 Logo，请点击「保存资料」生效');
}

function onSave() {
  savedSnapshot.value = { ...profile };
  brand.setLogo(profile.logoUrl, profile.logoFileName);
  message.success('已保存租户资料，企业 Logo 已同步至数据总览');
}

function onReset() {
  Object.assign(profile, savedSnapshot.value);
  message.info('已还原未保存的修改');
}
</script>

<template>
  <div class="profile">
    <!-- ① 平台管控·只读概览（展示已保存的 Logo） -->
    <div class="overview-card">
      <div class="ov-logo">
        <img v-if="brand.logoUrl" :src="brand.logoUrl" alt="企业 Logo" class="logo-img" />
        <span v-else>{{ profile.logoText }}</span>
      </div>
      <div class="ov-main">
        <div class="ov-name-row">
          <span class="ov-name">{{ profile.name }}</span>
          <PlanTag :plan="profile.plan" />
          <span class="ov-status">● {{ profile.status }}</span>
        </div>
        <div class="ov-grid">
          <div class="ov-cell"><label>租户编码</label><span>{{ profile.code }}</span></div>
          <div class="ov-cell"><label>有效期至</label><span>{{ profile.expiry }}</span></div>
          <div class="ov-cell"><label>坐席规模</label><span>{{ profile.seatScale }}</span></div>
        </div>
      </div>
      <div class="ov-lock"><LockOutlined /> 平台管控 · 只读<div class="ov-lock-sub">套餐/有效期/席位扩容请联系平台</div></div>
    </div>

    <!-- ② 企业资料（可编辑） -->
    <div class="card">
      <div class="card-title">企业资料</div>
      <a-form layout="vertical">
        <div class="grid3">
          <a-form-item label="所属行业"><a-select v-model:value="profile.industry" :options="INDUSTRIES.map((v) => ({ value: v, label: v }))" /></a-form-item>
          <a-form-item label="默认时区">
            <a-select v-model:value="profile.timezone" :options="TIMEZONES.map((v) => ({ value: v, label: v }))">
              <template #suffixIcon><EnvironmentOutlined /></template>
            </a-select>
          </a-form-item>
          <a-form-item label="默认语言"><a-select v-model:value="profile.lang" :options="LANGS.map((v) => ({ value: v, label: v }))" /></a-form-item>
        </div>
        <a-form-item label="企业 Logo">
          <div
            class="logo-uploader"
            :class="{ 'is-drag': dragOver, 'has-draft': logoDirty }"
            role="button"
            tabindex="0"
            @click="triggerLogoUpload"
            @keydown.enter="triggerLogoUpload"
            @keydown.space.prevent="triggerLogoUpload"
            @dragenter.prevent="dragOver = true"
            @dragover.prevent="dragOver = true"
            @dragleave.prevent="dragOver = false"
            @drop.prevent="onLogoDrop"
          >
            <input
              ref="fileInputRef"
              type="file"
              class="logo-file-input"
              accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
              @change="onLogoFileChange"
            />

            <div class="logo-thumb" :class="{ filled: !!profile.logoUrl }">
              <img v-if="profile.logoUrl" :src="profile.logoUrl" alt="企业 Logo 预览" class="logo-img" />
              <UploadOutlined v-else class="logo-placeholder-ic" />
            </div>

            <div class="logo-body">
              <div class="logo-title">{{ profile.logoUrl ? '点击或拖拽更换' : '点击或拖拽上传' }}</div>
              <div class="logo-hint">PNG、JPG 或 SVG · 不超过 1MB · 建议 1:1 正方形</div>
            </div>

            <button
              v-if="profile.logoUrl"
              type="button"
              class="logo-remove"
              @click.stop="removeLogo"
            >
              移除
            </button>
          </div>
          <p class="logo-status" :class="{ warn: logoDirty }">{{ logoStatusText }}</p>
        </a-form-item>
      </a-form>
    </div>

    <!-- ③ 管理员与联系方式（可编辑） -->
    <div class="card">
      <div class="card-title">管理员与联系方式</div>
      <a-form layout="vertical">
        <div class="grid2">
          <a-form-item label="管理员姓名"><a-input v-model:value="profile.adminName" /></a-form-item>
          <a-form-item label="联系电话"><a-input v-model:value="profile.phone" /></a-form-item>
          <a-form-item label="联系邮箱"><a-input v-model:value="profile.email" /></a-form-item>
          <a-form-item label="客服热线"><a-input v-model:value="profile.hotline" /></a-form-item>
        </div>
        <div class="admin-note"><LockOutlined /> 「租户管理员」账号的增删与席位（上限 3）由平台在租户开通时分配，此处仅维护对外联系信息。</div>
      </a-form>
    </div>

    <!-- 底部操作条 -->
    <div class="actionbar">
      <span v-if="formDirty" class="dirty-tip">有未保存的修改</span>
      <a-button :disabled="!formDirty" @click="onReset">还原</a-button>
      <a-button type="primary" :disabled="!formDirty" @click="onSave">保存资料</a-button>
    </div>
  </div>
</template>

<style scoped>
.profile { display: flex; flex-direction: column; gap: 16px; padding: 20px 24px 80px; }

.overview-card { display: flex; align-items: center; gap: 18px; background: linear-gradient(90deg, #1a6fff, #3b82f6); border-radius: 12px; padding: 20px 24px; color: #fff; }
.ov-logo { width: 52px; height: 52px; flex: none; border-radius: 12px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; overflow: hidden; }
.logo-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ov-main { flex: 1; min-width: 0; }
.ov-name-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.ov-name { font-size: 18px; font-weight: 700; }
.ov-status { font-size: 12px; color: #bbf7d0; }
.ov-grid { display: flex; gap: 36px; }
.ov-cell { display: flex; flex-direction: column; gap: 3px; }
.ov-cell label { font-size: 11px; color: rgba(255,255,255,0.75); }
.ov-cell span { font-size: 14px; font-weight: 600; }
.ov-lock { flex: none; text-align: right; font-size: 12px; color: rgba(255,255,255,0.9); }
.ov-lock-sub { font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 4px; max-width: 160px; }

.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; }
.card-title { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f0f0f0; }
.grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 24px; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 24px; }
.card :deep(.ant-form-item) { margin-bottom: 14px; }

.logo-uploader {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: 520px;
  padding: 14px 16px;
  border: 1px dashed #d1d5db;
  border-radius: 10px;
  background: #fafbfc;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.logo-uploader:hover,
.logo-uploader.is-drag {
  border-color: #93b4f5;
  background: #f8fbff;
  box-shadow: 0 2px 8px rgba(26, 111, 255, 0.06);
}

.logo-uploader.has-draft {
  border-color: #fbbf24;
  background: #fffbeb;
}

.logo-uploader:focus-visible {
  outline: 2px solid #bfdbfe;
  outline-offset: 2px;
}

.logo-file-input { display: none; }

.logo-thumb {
  flex: none;
  width: 64px;
  height: 64px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.logo-thumb.filled { border-color: #e0e7ef; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06); }
.logo-placeholder-ic { font-size: 22px; color: #9ca3af; }
.logo-uploader:hover .logo-placeholder-ic { color: #1a6fff; }

.logo-body { flex: 1; min-width: 0; }
.logo-title { font-size: 14px; font-weight: 500; color: #111827; line-height: 1.4; }
.logo-uploader:hover .logo-title { color: #1a6fff; }
.logo-hint { margin-top: 4px; font-size: 12px; color: #9ca3af; line-height: 1.5; }

.logo-remove {
  flex: none;
  align-self: flex-start;
  margin-top: 2px;
  padding: 0;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  color: #9ca3af;
  cursor: pointer;
  transition: color 0.12s;
}
.logo-remove:hover { color: #ef4444; }

.logo-status {
  margin: 8px 0 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}
.logo-status.warn { color: #d97706; }

.admin-note { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6b7280; background: #f9fafb; border: 1px solid #eef0f2; border-radius: 8px; padding: 10px 12px; margin-top: 4px; }

.actionbar {
  position: sticky;
  bottom: 0;
  margin: 0 -24px -80px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  background: #fff;
  padding: 14px 24px;
  border-top: 1px solid #e5e7eb;
}
.dirty-tip { margin-right: auto; font-size: 13px; color: #d97706; }
</style>
