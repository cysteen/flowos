import type { Component } from 'vue';
import {
  HomeOutlined,
  CustomerServiceOutlined,
  ToolOutlined,
  DashboardOutlined,
} from '@ant-design/icons-vue';

// 运行工作区导航（WorkspaceShell），路径不含角色前缀（对齐 §2.3）。
// 图标用 @ant-design/icons-vue，与设计规范 lucide 语义对齐（映射见 §0.3）。
export interface NavItem {
  /** 菜单权限 key，与 route.meta.menu / RoleDef.menus 对齐 */
  key: string;
  label: string;
  /** 路由路径（相对 base /flowos/） */
  path: string;
  icon: Component;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: '首页', path: '/home', icon: HomeOutlined }, // house
  { key: 'tickets', label: '工单工作台', path: '/tickets', icon: CustomerServiceOutlined }, // headset
  { key: 'aftersale', label: '售后工作台', path: '/aftersale', icon: ToolOutlined }, // wrench
  { key: 'team-board', label: '班组看板', path: '/team-board', icon: DashboardOutlined }, // gauge
];

/** 取该角色第一个有权限菜单的路径（守卫 redirect 用） */
export function firstMenuPath(menus: string[]): string {
  const item = NAV_ITEMS.find((n) => menus.includes(n.key));
  return item ? item.path : '/home';
}
