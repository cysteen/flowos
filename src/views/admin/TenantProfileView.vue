<script setup lang="ts">
import { reactive } from 'vue';
import { message } from 'ant-design-vue';
import { TENANT_INFO } from '@/mock/adminOverview';

// 基本信息（PRD-59a）：三段表单 + 可改/只读边界。
const form = reactive({
  name: TENANT_INFO.name,
  code: 'IFLY-T0001',
  plan: TENANT_INFO.plan,
  expiry: TENANT_INFO.expiry,
  industry: '智能硬件',
  seatScale: `${TENANT_INFO.seatTotal} 席`,
  adminName: '赵管理',
  phone: '139 0000 0000',
  email: 'admin@iflytek.com',
  hotline: '400-100-8000',
  timezone: 'GMT+8 北京',
  lang: '简体中文',
});

const INDUSTRIES = ['智能硬件', '互联网', '金融', '教育', '制造', '其他'];
const TIMEZONES = ['GMT+8 北京', 'GMT+0 伦敦', 'GMT-8 洛杉矶'];
const LANGS = ['简体中文', 'English'];

function onSave() {
  message.success('已保存租户基本信息');
}
function onCancel() {
  message.info('已取消修改');
}
</script>

<template>
  <div class="profile">
    <!-- ① 租户信息 -->
    <div class="card">
      <div class="card-title">租户信息</div>
      <div class="grid">
        <div class="field">
          <label><span class="req">*</span>租户名称</label>
          <a-input v-model:value="form.name" />
        </div>
        <div class="field">
          <label>租户编码</label>
          <a-input :value="form.code" disabled />
          <span class="ro-tip">平台分配 · 只读</span>
        </div>
        <div class="field">
          <label>所属套餐</label>
          <a-input :value="form.plan" disabled />
          <span class="ro-tip">平台管控 · 如需变更请联系平台</span>
        </div>
        <div class="field">
          <label>有效期至</label>
          <a-input :value="form.expiry" disabled />
          <span class="ro-tip">平台管控 · 临期系统预警</span>
        </div>
        <div class="field">
          <label>所属行业</label>
          <a-select v-model:value="form.industry" :options="INDUSTRIES.map((v) => ({ value: v, label: v }))" />
        </div>
        <div class="field">
          <label>坐席规模</label>
          <a-input :value="form.seatScale" disabled />
          <span class="ro-tip">扩容走平台 / 购买</span>
        </div>
      </div>
    </div>

    <!-- ② 管理员与联系方式 -->
    <div class="card">
      <div class="card-title">管理员与联系方式</div>
      <div class="grid">
        <div class="field"><label>管理员姓名</label><a-input v-model:value="form.adminName" /></div>
        <div class="field"><label>联系电话</label><a-input v-model:value="form.phone" /></div>
        <div class="field"><label>联系邮箱</label><a-input v-model:value="form.email" /></div>
        <div class="field"><label>客服热线</label><a-input v-model:value="form.hotline" /></div>
      </div>
    </div>

    <!-- ③ 偏好设置 -->
    <div class="card">
      <div class="card-title">偏好设置</div>
      <div class="grid">
        <div class="field">
          <label>默认时区</label>
          <a-select v-model:value="form.timezone" :options="TIMEZONES.map((v) => ({ value: v, label: v }))" />
        </div>
        <div class="field">
          <label>默认语言</label>
          <a-select v-model:value="form.lang" :options="LANGS.map((v) => ({ value: v, label: v }))" />
        </div>
        <div class="field logo-field">
          <label>企业 Logo</label>
          <div class="logo-row">
            <span class="logo-preview">iF</span>
            <a-button @click="message.info('上传 Logo（占位）')">上传</a-button>
            <span class="ro-tip">png/jpg/svg · ≤1MB · 建议正方形</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部操作条 -->
    <div class="actionbar">
      <a-button @click="onCancel">取消</a-button>
      <a-button type="primary" @click="onSave">保存</a-button>
    </div>
  </div>
</template>

<style scoped>
.profile { display: flex; flex-direction: column; gap: 16px; padding: 20px 24px 80px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; }
.card-title { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f0f0f0; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px 24px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 13px; color: #374151; }
.req { color: #ef4444; margin-right: 2px; }
.ro-tip { font-size: 12px; color: #9ca3af; }
.logo-field { grid-column: span 2; }
.logo-row { display: flex; align-items: center; gap: 12px; }
.logo-preview { width: 56px; height: 56px; border-radius: 10px; background: #1a6fff; color: #fff; font-weight: 800; display: flex; align-items: center; justify-content: center; }

.actionbar {
  position: sticky; bottom: 0; margin: 0 -24px -80px;
  display: flex; justify-content: flex-end; gap: 12px;
  background: #fff; padding: 14px 24px; border-top: 1px solid #e5e7eb;
}
</style>
