<script setup lang="ts">
import { watchEffect } from 'vue';
import { LeftOutlined } from '@ant-design/icons-vue';

/** 小程序 H5 页面外壳：移动端版式，桌面打开时居中、宽度限 420px，无后台导航 */
const props = defineProps<{ title: string; back?: boolean }>();
const emit = defineEmits<{ back: [] }>();

watchEffect(() => {
  document.title = props.title;
});
</script>

<template>
  <div class="fm-page">
    <div class="fm-frame">
      <header class="fm-nav">
        <button v-if="back" type="button" class="fm-nav__back" aria-label="返回" @click="emit('back')">
          <LeftOutlined />
        </button>
        <h1 class="fm-nav__title">{{ title }}</h1>
      </header>
      <div v-if="$slots.alert" class="fm-alert-slot">
        <slot name="alert" />
      </div>
      <main class="fm-body">
        <slot />
      </main>
      <footer v-if="$slots.footer" class="fm-footer">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>

<style scoped>
.fm-page {
  min-height: 100vh;
  background: #e9ecf1;
}
.fm-frame {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 420px;
  min-height: 100vh;
  margin: 0 auto;
  background: #f4f6f9;
  color: #1d2129;
  font-size: 15px;
}
.fm-nav {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  padding: 0 44px;
  padding-top: env(safe-area-inset-top, 0px);
  background: #fff;
  border-bottom: 1px solid #eef0f3;
}
.fm-nav__back {
  position: absolute;
  left: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 0;
  background: transparent;
  color: #1d2129;
  font-size: 16px;
  cursor: pointer;
}
.fm-nav__title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}
.fm-alert-slot {
  position: sticky;
  top: 48px;
  z-index: 19;
}
.fm-body {
  flex: 1;
  padding: 12px 12px 24px;
}
.fm-footer {
  position: sticky;
  bottom: 0;
  z-index: 20;
  padding: 10px 16px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  background: #fff;
  box-shadow: 0 -1px 0 #eef0f3;
}
</style>
