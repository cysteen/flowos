# 管理后台前端视觉与交互规范（Admin UI Spec）

> 目的：统一后台各页面的视觉与交互，消除"按钮各种花样、翻页时有时无"的割裂。**新代码必须遵循；存量代码按此重构。**
> 落地载体：`src/config/adminUi.ts`（令牌/工具）、`src/components/admin/AdminPageHeader.vue`（标准页头）。

## 0. 设计令牌（颜色/圆角/间距）
| 令牌 | 值 | 用途 |
|---|---|---|
| 主色 | `#1a6fff` | 主按钮、选中态、链接、强调 |
| 成功/危险/警告 | `#10b981` / `#ef4444` / `#f59e0b` | 状态、危险操作 |
| 文本主/次/弱 | `#111827` / `#6b7280` / `#9ca3af` | 标题/正文/辅助 |
| 边框 | `#e5e7eb`；分隔线 `#f0f0f0` | 卡片/表格边框 |
| 卡片圆角 | `10px`（大卡 `12px`） | 统一圆角 |
| 页面内边距 | `20px 24px` | 页面根容器 |
| 表头底色 | `#f3f4f6`，字号 `12px`、`#6b7280` | 所有 a-table 表头 |

## 1. 页头（Page Header）
- **统一用 `<AdminPageHeader title subtitle>`**，`#actions` 插槽放页级主操作（如「新建」）。
- 标题 18px/700；副标题 13px/`#6b7280`，一句话说明页面职责。
- 禁止各页自定义 `.page-head` / `<h2>` 散装写法。

## 2. 按钮（Button）变体规则
| 场景 | 写法 | 例 |
|---|---|---|
| 页级/表单主操作 | `type="primary"` | 新建、保存、发布、确认 |
| 次操作 | 默认（不写 type） | 编辑、导入、取消、配置 |
| 危险操作 | `danger`（+ 视情 `type="primary"`） | 删除、停用、吊销、终止 |
| 行内轻操作/跳转 | `type="link" size="small"` | 详情、查看、进度 |
| 卡片"进入"类主入口 | `type="primary"`（整块）或 `ghost` | 进入设计器、设计 |
- 同一行内**最多一个** primary；危险操作永远 `danger`。
- 图标按钮统一 `<template #icon>`，不手动塞 `<XxxOutlined/>` 进文字。

## 3. 表格（Table）与分页
- 所有 `a-table` 统一 `size="middle"`、表头底色 `#f3f4f6`。
- **分页策略（解决"时有时无"）**：
  - **数据列表**（行数可增长、需要浏览/检索：客户/用户/工单/日志/审批…）→ **必须分页**，统一 `:pagination="stdPagination()"`（每页 10、`共 N 条`、可切 10/20/50）。
  - **配置/枚举短表**（固定少量行：字典数据、SLA 节点矩阵、套餐特性、流程节点…）→ **显式** `:pagination="false"`，视为有意豁免。
  - 不允许"既不是列表也不是短表"的随意态。
- 状态列统一用 `STATUS_TONE[status]` 取色的 `a-tag`，不手写散色。

## 4. 页面框架 / 卡片 / 筛选条 / 空态
- **页面框架（基准：`PlatformAccessView`/`ConnectorHubView`）**：根容器灰底（`#f9fafb`）+ 外层 `padding:16px 20px`；内容包入**白底面板**（`#fff` + `1px #e5e7eb` + 圆角 8 + 内边距 `20px 24px`），面板内首行为 `AdminPageHeader`（或两栏页的 `panel-head`）。**禁止裸内容直接铺在灰底上。**
- 两栏页（左树/列表 + 右详情）：左右各为独立白面板；面板首行 `panel-head`（标题 + 主操作）。
- 卡片：白底 `#fff` + `1px #e5e7eb` + 圆角 10/12 + 内边距 16–20。
- 筛选条：左筛选（segmented / select / search）+ 右主操作；统一 `gap: 12px`。
- 空态统一 `<a-empty>`；列表无数据给一句引导文案。

## 5. 弹窗（Modal）/ 抽屉（Drawer）
- 详情类用 `a-descriptions`（bordered, size small, 标签底 `#f9fafb`）。
- 分区标题统一"左 3px 蓝条 + 13px/600"样式。
- 底部操作右对齐：取消（default）+ 主操作（primary）/ 危险（danger）。

## 6. 反馈
- 操作结果统一 `message.success/info/warning/error`；演示占位统一文案 `「X」（演示）`。
- 危险操作（删除/停用）统一 `Modal.confirm` 二次确认。

---
变更记录：v1.0（2026-06-21）建立，配套 `adminUi.ts` + `AdminPageHeader.vue`。
