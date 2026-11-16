import type { Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers';

/** 本地 dev：访问 / 时跳到 base，避免误以为白屏（Vite 在 base 子路径下不提供根 index） */
function devBaseEntryRedirect(base: string): Plugin {
  const entry = base.endsWith('/') ? base : `${base}/`;
  return {
    name: 'dev-base-entry-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = (req.url ?? '').split('?')[0];
        if (pathOnly === '/' || pathOnly === '/index.html') {
          res.statusCode = 302;
          res.setHeader('Location', entry);
          res.end();
          return;
        }
        next();
      });
    },
  };
}

// 部署目标：GitHub Pages 仓库 `flowos`（项目在仓库根目录）。
// 服务路径 /flowos/ 与 base 一致，线上 URL = https://<用户名>.github.io/flowos/tickets
const appBase = '/flowos/';
export default defineConfig({
  base: appBase,
  plugins: [
    devBaseEntryRedirect(appBase),
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
    // 绑定 0.0.0.0，避免 Cursor 内置浏览器 / 局域网访问 localhost 偶发连不上
    host: true,
    strictPort: true,
    open: appBase,
  },
  preview: {
    // host: true 绑定 0.0.0.0，局域网同事可通过本机内网 IP 访问
    host: true,
    port: 4173,
  },
});
