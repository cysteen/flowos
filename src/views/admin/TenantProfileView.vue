<script setup lang="ts">
import { reactive, ref } from 'vue';
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

// 基本信息（PRD-59a）：上半「平台管控·只读概览」与下半「租户可编辑资料」分离，贴合租户自管场景。
function createProfileState() {
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
    // 初值取自品牌 store（已持久化的 Logo），形成跨页/刷新闭环
    logoUrl: brand.logoUrl as string | null,
    logoText: 'iF',
  };
}

const profile = reactive(createProfileState());
let savedSnapshot = { ...createProfileState() };

const fileInputRef = ref<HTMLInputElement | null>(null);

const INDUSTRIES = ['智能硬件', '互联网', '金融', '教育', '制造', '其他'];
const TIMEZONES = ['GMT+8 北京', 'GMT+0 伦敦', 'GMT-8 洛杉矶'];
const LANGS = ['简体中文', 'English'];

function isLogoFile(file: File) {
  if (LOGO_TYPES.has(file.type)) return true;
  const name = file.name.toLowerCase();
  return LOGO_EXTS.some((ext) => name.endsWith(ext));
}

function triggerLogoUpload() {
  fileInputRef.value?.click();
}

function onLogoFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  if (!isLogoFile(file)) {
    message.error('仅支持 png / jpg / svg 格式');
    return;
  }
  if (file.size > LOGO_MAX_BYTES) {
    message.error('Logo 文件不能超过 1MB');
    return;
  }

  // 读为 dataURL（可持久化到 localStorage，刷新后仍在）
  const reader = new FileReader();
  reader.onload = () => {
    profile.logoUrl = reader.result as string;
    message.success('Logo 已更新，点击底部「保存资料」即生效到全局');
  };
  reader.onerror = () => message.error('读取图片失败，请重试');
  reader.readAsDataURL(file);
}

function removeLogo() {
  profile.logoUrl = null;
  message.success('已移除 Logo，点击底部「保存资料」生效');
}

function onSave() {
  savedSnapshot = { ...profile };
  // 提交到品牌 store → 持久化 + 同步数据总览/头部品牌
  brand.setLogo(profile.logoUrl);
  message.success('已保存租户资料，企业 Logo 已全局生效');
}

function onReset() {
  Object.assign(profile, savedSnapshot);
  message.info('已还原未保存的修改');
}
</script>

<template>
  <div class="profile">
    <!-- ① 平台管控·只读概览 -->
    <div class="overview-card">
      <div class="ov-logo">
        <img v-if="profile.logoUrl" :src="profile.logoUrl" alt="企业 Logo" class="logo-img" />
        <span v-else>{{ profile.logoText }}</span>
      </div>
      <div class="ov-main">
        <div class="ov-name-row">
          <span class="ov-name">{{ profile.name }}</span>
          <PlanTag :plan="profile.plan" />
          <span class="ov-status">● {{ profile.status }}</span>
        </div>
        <div class="ov-grid">
          <div class="ov-cell"><label>租户编码</label><span class="mono">{{ profile.code }}</span></div>
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
            role="button"
            tabindex="0"
            @click="triggerLogoUpload"
            @keydown.enter="triggerLogoUpload"
            @keydown.space.prevent="triggerLogoUpload"
          >
            <input
              ref="fileInputRef"
              type="file"
              class="logo-file-input"
              accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
              @change="onLogoFileChange"
            />

            <div class="logo-thumb" :class="{ filled: !!profile.logoUrl }">
              <img v-if="profile.logoUrl" :src="profile.logoUrl" alt="企业 Logo" class="logo-img" />
              <UploadOutlined v-else class="logo-placeholder-ic" />
            </div>

            <div class="logo-body">
              <div class="logo-title">{{ profile.logoUrl ? '更换企业 Logo' : '上传企业 Logo' }}</div>
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
      <a-button @click="onReset">还原</a-button>
      <a-button type="primary" @click="onSave">保存资料</a-button>
    </div>
  </div>
</template>

<style scoped>
.profile { display: flex; flex-direction: column; gap: 16px; padding: 20px 24px 80px; }

/* 平台管控·只读概览 */
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
.mono { font-family: ui-monospace, monospace; }

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
  max-width: 480px;
  padding: 14px 16px;
  border: 1px dashed #d1d5db;
  border-radius: 10px;
  background: #fafbfc;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.logo-uploader:hover {
  border-color: #93b4f5;
  background: #f8fbff;
  box-shadow: 0 2px 8px rgba(26, 111, 255, 0.06);
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

.logo-thumb.filled {
  border-color: #e0e7ef;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

.logo-placeholder-ic {
  font-size: 22px;
  color: #9ca3af;
}

.logo-uploader:hover .logo-placeholder-ic {
  color: #1a6fff;
}

.logo-body {
  flex: 1;
  min-width: 0;
}

.logo-title {
  font-size: 14px;
  font-weight: 500;
  color: #111827;
  line-height: 1.4;
}

.logo-uploader:hover .logo-title {
  color: #1a6fff;
}

.logo-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.5;
}

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

.logo-remove:hover {
  color: #ef4444;
}

.admin-note { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6b7280; background: #f9fafb; border: 1px solid #eef0f2; border-radius: 8px; padding: 10px 12px; margin-top: 4px; }

.actionbar { position: sticky; bottom: 0; margin: 0 -24px -80px; display: flex; justify-content: flex-end; gap: 12px; background: #fff; padding: 14px 24px; border-top: 1px solid #e5e7eb; }
</style>
