import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers';

// 部署目标：GitHub Pages 仓库 `flowos`（项目在仓库根目录）。
// 服务路径 /flowos/ 与 base 一致，线上 URL = https://<用户名>.github.io/flowos/tickets
export default defineConfig({
  base: '/flowos/',
  plugins: [
    vue(),
    Components({
      // Ant Design Vue 4 为 CSS-in-JS，按需样式自动注入，故 importStyle: false
      resolvers: [AntDesignVueResolver({ importStyle: false })],
      dts: 'src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
  },
});
