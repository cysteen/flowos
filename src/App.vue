<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN';

const CONTROL_FONT_SIZE = 12;
// 保留 Ant 默认 22px 文本行高；large 的 16px / 24px 度量由精准 CSS 保留。
// 不改全局 token.fontSize，避免页面正文、按钮及图标一起缩小。
const inputTextTheme = {
  fontSize: CONTROL_FONT_SIZE,
  fontSizeSM: CONTROL_FONT_SIZE,
  lineHeight: 22 / CONTROL_FONT_SIZE,
};

// 全局主题：品牌主色 #1A6FFF，圆角 4（§1.5 / §2.1）
const theme = {
  token: {
    colorPrimary: '#1A6FFF',
    borderRadius: 4,
  },
  // 下拉浮层挂载在 body，无法继承建单页/处理页的局部控件字号。
  // Select 也覆盖 AutoComplete；Input 也覆盖 TextArea、Search 与 Password。
  // Date/TimePicker 保留主题度量，由 global.css 单独统一输入和浮层文本。
  components: {
    Input: inputTextTheme,
    InputNumber: inputTextTheme,
    Mentions: inputTextTheme,
    Select: { fontSize: CONTROL_FONT_SIZE },
    Cascader: { fontSize: CONTROL_FONT_SIZE },
    TreeSelect: { fontSize: CONTROL_FONT_SIZE },
    Dropdown: { fontSize: CONTROL_FONT_SIZE },
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
