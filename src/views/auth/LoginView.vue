<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import {
  UserOutlined,
  LockOutlined,
  AimOutlined,
  BarChartOutlined,
  TeamOutlined,
} from '@ant-design/icons-vue';
import { useUserStore } from '@/stores/user';
import { firstMenuPath } from '@/config/navigation';
import { DEMO_PASSWORD, LOGIN_ACCOUNTS, findAccount } from '@/mock/loginAccounts';

const router = useRouter();
const route = useRoute();
const user = useUserStore();

const logoUrl = import.meta.env.BASE_URL + 'logo.png';
const loginTab = ref<'account' | 'sms'>('account');
const account = ref('');
const password = ref('');
const remember = ref(false);
const dropdownOpen = ref(false);
const submitting = ref(false);

const filteredAccounts = computed(() => {
  const kw = account.value.trim();
  if (!kw) return LOGIN_ACCOUNTS;
  return LOGIN_ACCOUNTS.filter((a) => a.account.includes(kw) || a.label.includes(kw));
});

function onAccountFocus() {
  dropdownOpen.value = true;
}

function onAccountBlur() {
  window.setTimeout(() => {
    dropdownOpen.value = false;
  }, 150);
}

function selectAccount(acc: string) {
  account.value = acc;
  dropdownOpen.value = false;
}

function onSmsTab() {
  loginTab.value = 'sms';
  message.info('短信登录（占位）');
  loginTab.value = 'account';
}

async function onSubmit() {
  const acc = account.value.trim();
  if (!acc) {
    message.warning('请输入账号');
    return;
  }
  if (!password.value.trim()) {
    message.warning('请输入密码');
    return;
  }
  if (password.value.trim() !== DEMO_PASSWORD) {
    message.error('密码错误，请重新输入');
    return;
  }

  const found = findAccount(acc);
  if (!found) {
    message.error('账号不存在，请从下拉列表选择演示账号');
    return;
  }

  submitting.value = true;
  try {
    user.login(found.account, found.roleKey, remember.value);
    message.success(`欢迎回来，${user.name}`);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '';
    if (redirect && redirect.startsWith('/') && redirect !== '/login') {
      await router.replace(redirect);
    } else {
      await router.replace(firstMenuPath(user.visibleMenus));
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <!-- 左侧介绍 -->
    <section class="intro">
      <div class="intro-main">
        <div class="logo-area">
          <img class="logo-icon" :src="logoUrl" alt="讯飞工单系统" />
          <span class="logo-slogan">连接每一个服务触点</span>
        </div>

        <div class="hero">
          <h1 class="hero-title">
            <span class="hero-highlight">高效协同 · 智能流转</span>
          </h1>
          <p class="hero-desc">
            基于科大讯飞 AI 技术，打造企业级智能工单管理解决方案。自动化分配、实时追踪、AI 协同处理，让工单闭环效率大幅提升。
          </p>

          <div class="feature-list">
            <div class="feature-item">
              <div class="feature-icon blue"><AimOutlined /></div>
              <div>
                <div class="feature-name">工单自动分配</div>
                <div class="feature-desc">AI 智能匹配最佳处理人，效率提升 5 倍</div>
              </div>
            </div>
            <div class="feature-item">
              <div class="feature-icon orange"><BarChartOutlined /></div>
              <div>
                <div class="feature-name">实时数据看板</div>
                <div class="feature-desc">多维度统计分析，业务一目了然</div>
              </div>
            </div>
            <div class="feature-item">
              <div class="feature-icon cyan"><TeamOutlined /></div>
              <div>
                <div class="feature-name">团队协作</div>
                <div class="feature-desc">跨部门高效协同，无缝衔接</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="footer-info">© 2026 科大讯飞股份有限公司 · iFLYTEK Co., Ltd.</div>
    </section>

    <!-- 右侧登录 -->
    <section class="login-section">
      <div class="login-card">
        <div class="login-header">
          <h2 class="login-title">欢迎回来 👋</h2>
          <p class="login-subtitle">登录您的账号，开启智能工单管理</p>
        </div>

        <div class="tab-group">
          <div class="tab-item" :class="{ active: loginTab === 'account' }" @click="loginTab = 'account'">
            账号登录
          </div>
          <div class="tab-item" :class="{ active: loginTab === 'sms' }" @click="onSmsTab">短信登录</div>
        </div>

        <form @submit.prevent="onSubmit">
          <div class="form-group">
            <label class="form-label">账号</label>
            <div class="input-wrapper">
              <UserOutlined class="input-icon" />
              <input
                v-model="account"
                type="text"
                class="form-input"
                placeholder="请输入手机号/邮箱/用户名"
                autocomplete="off"
                @focus="onAccountFocus"
                @blur="onAccountBlur"
                @input="dropdownOpen = true"
              />
              <div v-show="dropdownOpen && filteredAccounts.length" class="account-dropdown">
                <div
                  v-for="item in filteredAccounts"
                  :key="item.account"
                  class="account-option"
                  @mousedown.prevent="selectAccount(item.account)"
                >
                  <span class="phone">{{ item.account }}</span>
                  <span class="role">{{ item.label }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">密码</label>
            <div class="input-wrapper">
              <LockOutlined class="input-icon" />
              <input
                v-model="password"
                type="password"
                class="form-input"
                placeholder="请输入密码（演示：123）"
              />
            </div>
          </div>

          <div class="form-footer">
            <label class="checkbox-label">
              <input v-model="remember" type="checkbox" />
              <span>记住我</span>
            </label>
            <a class="link" href="#" @click.prevent="message.info('忘记密码（占位）')">忘记密码？</a>
          </div>

          <button type="submit" class="btn-submit" :disabled="submitting">
            {{ submitting ? '登录中…' : '登 录' }}
          </button>

          <div class="register-link">
            还没有账号？
            <a class="link" href="#" @click.prevent="message.info('注册（占位）')">立即注册</a>
          </div>

          <p class="demo-hint">演示账号见下拉列表，统一密码：123</p>
        </form>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  min-height: 100vh;
  background: #f8f9fc;
}

.intro {
  position: relative;
  overflow: hidden;
  padding: 80px 120px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: linear-gradient(135deg, #e8f1ff 0%, #f0f4ff 50%, #ffffff 100%);
}
.intro::before,
.intro::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.intro::before {
  top: -100px;
  right: -100px;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(26, 111, 255, 0.08) 0%, transparent 70%);
}
.intro::after {
  bottom: -150px;
  left: -50px;
  width: 350px;
  height: 350px;
  background: radial-gradient(circle, rgba(77, 144, 255, 0.06) 0%, transparent 70%);
}

.intro-main {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 44px;
  max-width: 560px;
  transform: translateY(-18px);
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 16px;
  transform: translate(-10px, -20px);
}
.logo-icon {
  height: 60px;
  width: auto;
  object-fit: contain;
}
.logo-slogan {
  font-size: 20px;
  font-weight: 700;
  color: #111827;
  letter-spacing: -0.02em;
}

.hero-title {
  font-size: 42px;
  font-weight: 900;
  line-height: 1.15;
  margin-bottom: 16px;
  letter-spacing: -0.03em;
}
.hero-highlight {
  background: linear-gradient(90deg, #1a6fff, #4d90ff);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.hero-desc {
  font-size: 16px;
  color: #6b7280;
  line-height: 1.8;
  max-width: 500px;
  margin-bottom: 40px;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 480px;
}
.feature-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  transition: all 0.3s;
}
.feature-item:hover {
  background: rgba(255, 255, 255, 0.95);
  transform: translateX(4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}
.feature-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex: none;
}
.feature-icon.blue { background: #e8f1ff; color: #1a6fff; }
.feature-icon.orange { background: #fff4e6; color: #fb923c; }
.feature-icon.cyan { background: #e0f2fe; color: #0284c7; }
.feature-name {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 2px;
}
.feature-desc {
  font-size: 12px;
  color: #6b7280;
}

.footer-info {
  position: absolute;
  left: 120px;
  bottom: 40px;
  z-index: 2;
  font-size: 12px;
  color: #9ca3af;
}

.login-section {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.04);
}
.login-card {
  width: 100%;
  max-width: 420px;
}
.login-header {
  margin-bottom: 36px;
}
.login-title {
  font-size: 28px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 8px;
}
.login-subtitle {
  font-size: 14px;
  color: #9ca3af;
}

.tab-group {
  display: flex;
  gap: 0;
  background: #f3f4f6;
  padding: 4px;
  border-radius: 10px;
  margin-bottom: 28px;
}
.tab-item {
  flex: 1;
  padding: 8px;
  text-align: center;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
  border-radius: 8px;
  font-weight: 500;
}
.tab-item.active {
  background: #fff;
  color: #1a6fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  font-weight: 600;
}

.form-group {
  margin-bottom: 20px;
}
.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
}
.input-wrapper {
  position: relative;
}
.input-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  font-size: 16px;
  pointer-events: none;
}
.form-input {
  width: 100%;
  padding: 13px 16px 13px 44px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  background: #fafbfc;
  transition: all 0.2s;
}
.form-input:focus {
  border-color: #1a6fff;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(26, 111, 255, 0.08);
}
.form-input::placeholder {
  color: #d1d5db;
}

.account-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  z-index: 10;
  overflow: hidden;
}
.account-option {
  padding: 12px 16px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}
.account-option:hover {
  background: #f9fafb;
}
.phone {
  color: #111827;
  font-weight: 500;
}
.role {
  color: #9ca3af;
  font-size: 12px;
}

.form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  font-size: 13px;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #6b7280;
  cursor: pointer;
}
.checkbox-label input {
  accent-color: #1a6fff;
}
.link {
  color: #1a6fff;
  text-decoration: none;
  font-weight: 500;
}
.link:hover {
  text-decoration: underline;
}

.btn-submit {
  width: 100%;
  padding: 14px;
  background: linear-gradient(90deg, #1a6fff, #4d90ff);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(26, 111, 255, 0.25);
  transition: all 0.2s;
}
.btn-submit:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(26, 111, 255, 0.35);
  transform: translateY(-1px);
}
.btn-submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.register-link {
  text-align: center;
  margin-top: 32px;
  font-size: 13px;
  color: #9ca3af;
}
.demo-hint {
  margin-top: 16px;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
}

@media (max-width: 1024px) {
  .login-page {
    grid-template-columns: 1fr;
  }
  .intro {
    display: none;
  }
}
</style>
