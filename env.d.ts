/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// 路由 meta 扩展（菜单权限 / 标题）
import 'vue-router';
declare module 'vue-router' {
  interface RouteMeta {
    /** 该路由所需的菜单权限 key（对齐 config/navigation.ts） */
    menu?: string;
    /** 面包屑 / 文档标题 */
    title?: string;
  }
}
