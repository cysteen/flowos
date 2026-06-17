# iFLY FlowOS · 交互原型（flowos-prototype）

工单系统交互原型框架（Prompt 1 产出）。技术栈与生产一致：**Vue 3.5 + Vite 8 + Ant Design Vue 4 + Pinia + Vue Router 4 + TypeScript**。本期数据全部 Mock，无真实后端。

> 决策真值见 `prototypeV2/prompts/01-交互原型-Prompt指南.md` §0 决策定稿表。

## 一、本期范围（Prompt 1 框架）

- 运行工作区 Shell：顶栏（Logo / 折叠按钮 / 面包屑 / 全局搜索占位 / 通知帮助语言 / 用户区）+ 可折叠侧栏 + 内容区
- Vue Router 功能路由（路径不含角色前缀）+ 角色守卫
- 4 个角色全部配置菜单可见性（默认登录 `agent-cs` 客服·二线坐席），顶栏 Dev 下拉可切换验证
- 4 个导航占位页：首页 / 工单工作台 / 售后工作台 / 班组看板
- 基础组件：PlaceholderPage、AppPagination、DeleteConfirm
- GitHub Pages 部署配置（404.html + index.html SPA 路由恢复）

业务页（工单工作台等）留待 Prompt 2 / 3。

## 二、环境要求

- Node.js **≥ 20.19**
- 包管理器：npm（也可 pnpm / yarn）

## 三、本地开发

```bash
npm install
npm run dev          # http://localhost:3000/flowos/  （自动 redirect 到 /flowos/tickets）
```

可访问的路由：

- `/flowos/home` 首页
- `/flowos/tickets` 工单工作台（默认 landing）
- `/flowos/aftersale` 售后工作台（agent-cs 侧栏隐藏，直链被守卫 redirect）
- `/flowos/team-board` 班组看板（同上）

顶栏右上「Dev 角色」下拉可切换 `agent-cs / agent-as / team-leader / tenant-admin`，观察侧栏菜单裁剪与守卫行为。

## 四、本地预检（部署前，强制）

```bash
npm run build        # 产出 dist/（vite build）
npm run preview      # 以 base /flowos/ 预览，直接访问深链 /flowos/tickets 不应白屏
```

构建验收：

- `dist/index.html` 存在，引用 JS/CSS 路径以 `/flowos/` 为前缀
- `dist/404.html` 存在
- `npm run preview` 下刷新深链不白屏、前进/后退正常

## 五、部署到 GitHub Pages

部署目标仓库名 **`flowos`**，项目位于仓库根目录，故 `vite.config.ts` 中 `base: '/flowos/'`，
线上 URL 形如 `https://<你的用户名>.github.io/flowos/tickets`。

### 5.1 首次：创建仓库并开启 Pages

```bash
# 在项目根目录（flowos-prototype/）
git init
git add -A
git commit -m "chore: flowos prototype scaffold (Prompt 1)"
git branch -M main
git remote add origin https://github.com/<你的用户名>/flowos.git
git push -u origin main
```

GitHub 仓库 → Settings → Pages → Build and deployment → Source 选 **Deploy from a branch**，
Branch 选 **gh-pages** / `/ (root)`（首次 deploy 后该分支才出现，先执行 5.2 再回来设置）。

### 5.2 一键部署

```bash
npm run deploy       # = vite build && gh-pages -d dist
```

`gh-pages` 会把 `dist/` 推到 `gh-pages` 分支。等 1～2 分钟，访问：

- 首页：`https://<你的用户名>.github.io/flowos/`
- 深链：`https://<你的用户名>.github.io/flowos/tickets`（粘贴到新标签页应可直接打开，刷新不白屏）

> 若仓库名不是 `flowos`，需同步修改 `vite.config.ts` 的 `base` 与 `src/router/index.ts` 中 `createWebHistory()` 的参数为 `/<仓库名>/`，并相应调整 `public/404.html` 的 `pathSegmentsToKeep`。

## 六、目录结构

```
flowos-prototype/
├── index.html                 # SPA 路由恢复脚本
├── public/404.html            # GitHub Pages SPA 重定向
├── vite.config.ts             # base:/flowos/、别名 @、按需引入 AntD
├── package.json               # dev/build/preview/deploy 脚本
├── tsconfig.json
└── src/
    ├── main.ts                # 先 Pinia 后 Router
    ├── App.vue                # ConfigProvider 主色 #1A6FFF
    ├── styles/global.css
    ├── layouts/
    │   ├── WorkspaceShell.vue  # a-layout 骨架 + 折叠状态
    │   ├── AppHeader.vue       # 顶栏 + Dev 角色切换
    │   └── WorkspaceSidebar.vue# 左导航（按角色裁剪）
    ├── components/
    │   ├── PlaceholderPage.vue
    │   ├── AppPagination.vue   # 默认 10 条/页
    │   └── DeleteConfirm.vue
    ├── views/
    │   ├── home/HomePlaceholder.vue
    │   ├── tickets/TicketWorkbenchPlaceholder.vue
    │   ├── aftersale/AftersalePlaceholder.vue
    │   └── team-board/TeamBoardPlaceholder.vue
    ├── router/index.ts        # 路由表 + beforeEach 守卫
    ├── stores/user.ts         # 当前用户/角色
    ├── config/
    │   ├── roles.ts           # 4 角色 + 菜单可见性
    │   └── navigation.ts      # 导航项 + 图标映射
    └── mock/users.ts
```

## 七、约束（沿用 Prompt 指南 §2）

- 主色 `#1A6FFF`，通过 AntD `ConfigProvider` token 配置
- UI 优先 Ant Design Vue 组件；禁用 React / Tailwind / Vuex / 真实 API
- 路由表达功能模块，不含角色前缀；权限靠登录态 + 守卫 + 菜单裁剪
- 新增路由不得破坏已有深链；交付前 `npm run build` 须无报错
