<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN';

// 全局主题：品牌主色 #1A6FFF，圆角 4（§1.5 / §2.1）
const theme = {
  token: {
    colorPrimary: '#1A6FFF',
    borderRadius: 4,
  },
};
</script>

<template>
  <!-- locale=zhCN：统一所有 ant 组件中文（Modal.confirm 的 取消/确定、分页、空态等） -->
  <a-config-provider :theme="theme" :locale="zhCN">
    <!-- a-app 提供 message/notification 的主题上下文，避免静态调用告警 -->
    <a-app>
      <router-view />
    </a-app>
  </a-config-provider>
</template>
