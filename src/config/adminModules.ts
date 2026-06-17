// 管理后台·租户与组织 组 各模块配置（列/筛选/字段/Mock）。
// 列表页对齐设计规范 §11.2「筛选卡 + 表格卡」；渠道/应用为卡片网格；基本信息为三段表单。

export interface FilterDef {
  key: string;
  label: string;
  type: 'text' | 'select';
  placeholder?: string;
  options?: string[];
}
export interface ColumnDef {
  key: string;
  title: string;
  width?: number;
  /** 渲染类型：text(默认)/link(蓝可点)/tag(单徽章)/tags(多标签)/status(启停徽章) */
  kind?: 'text' | 'link' | 'tag' | 'tags' | 'status';
}
export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'select' | 'multiselect' | 'number' | 'radio';
  required?: boolean;
  options?: string[];
  placeholder?: string;
  tip?: string;
}
export interface ListConfig {
  type: 'list';
  newLabel: string;
  filters: FilterDef[];
  columns: ColumnDef[];
  rowActions: string[];
  formFields: FieldDef[];
  rowKey: string;
  rows: Record<string, unknown>[];
}
export interface CardConfig {
  type: 'cards';
  newLabel: string;
  filters: FilterDef[];
  formFields: FieldDef[];
  rows: Record<string, unknown>[];
}

const STATUS_OPTS = ['全部', '启用', '停用'];

// ---------- 用户管理 (PRD-50) ----------
const users: ListConfig = {
  type: 'list',
  newLabel: '新增用户',
  rowKey: 'no',
  filters: [
    { key: 'username', label: '用户名', type: 'text', placeholder: '请输入用户名' },
    { key: 'phone', label: '手机号', type: 'text', placeholder: '请输入手机号' },
    { key: 'status', label: '状态', type: 'select', options: STATUS_OPTS },
  ],
  columns: [
    { key: 'no', title: '用户编号', width: 110 },
    { key: 'username', title: '用户名称', kind: 'link', width: 130 },
    { key: 'nickname', title: '用户昵称', width: 110 },
    { key: 'dept', title: '归属部门', width: 130 },
    { key: 'phone', title: '手机号码', width: 130 },
    { key: 'status', title: '状态', kind: 'status', width: 90 },
    { key: 'createdAt', title: '创建时间', width: 160 },
  ],
  rowActions: ['编辑', '分配角色', '重置密码', '删除'],
  formFields: [
    { key: 'nickname', label: '用户昵称', type: 'text', required: true },
    { key: 'dept', label: '归属部门', type: 'select', options: ['客服一部', '客服二部', '售后部', '技术支持部'] },
    { key: 'phone', label: '手机号码', type: 'text' },
    { key: 'email', label: '邮箱', type: 'text' },
    { key: 'username', label: '用户名称', type: 'text', required: true, tip: '登录账号，编辑时只读' },
    { key: 'password', label: '用户密码', type: 'password', required: true, tip: '编辑留空=不改' },
    { key: 'gender', label: '用户性别', type: 'select', options: ['男', '女', '未知'] },
    { key: 'posts', label: '岗位', type: 'multiselect', options: ['坐席', '班组长', '质检', '管理员'] },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  rows: [
    { no: 'U00001', username: 'zhangsan', nickname: '张三', dept: '客服二部', phone: '138****8000', status: '启用', createdAt: '2026-05-12 09:20' },
    { no: 'U00002', username: 'lisi', nickname: '李四', dept: '售后部', phone: '139****1234', status: '启用', createdAt: '2026-05-13 10:05' },
    { no: 'U00003', username: 'wangwu', nickname: '王坐席', dept: '技术支持部', phone: '137****5678', status: '启用', createdAt: '2026-05-14 14:30' },
    { no: 'U00004', username: 'zhaoliu', nickname: '赵敏', dept: '客服一部', phone: '136****9012', status: '停用', createdAt: '2026-05-15 11:11' },
    { no: 'U00005', username: 'chenqi', nickname: '陈坐席', dept: '客服二部', phone: '135****3456', status: '启用', createdAt: '2026-05-16 16:40' },
    { no: 'U00006', username: 'sunba', nickname: '孙莉', dept: '售后部', phone: '134****7788', status: '启用', createdAt: '2026-05-18 08:50' },
    { no: 'U00007', username: 'linjiu', nickname: '林组长', dept: '客服一部', phone: '133****2211', status: '启用', createdAt: '2026-05-20 13:22' },
    { no: 'U00008', username: 'zhoushi', nickname: '周杰', dept: '技术支持部', phone: '132****6655', status: '停用', createdAt: '2026-05-22 09:00' },
  ],
};

// ---------- 角色管理 (PRD-51) ----------
const roles: ListConfig = {
  type: 'list',
  newLabel: '新增角色',
  rowKey: 'no',
  filters: [
    { key: 'name', label: '角色名称', type: 'text', placeholder: '请输入角色名称' },
    { key: 'roleKey', label: '角色标识', type: 'text', placeholder: '请输入角色标识' },
    { key: 'status', label: '状态', type: 'select', options: STATUS_OPTS },
  ],
  columns: [
    { key: 'no', title: '角色编号', width: 100 },
    { key: 'name', title: '角色名称', kind: 'link', width: 140 },
    { key: 'type', title: '角色类型', kind: 'tag', width: 100 },
    { key: 'roleKey', title: '角色标识', width: 150 },
    { key: 'sort', title: '排序', width: 70 },
    { key: 'status', title: '状态', kind: 'status', width: 90 },
    { key: 'remark', title: '备注', width: 160 },
    { key: 'createdAt', title: '创建时间', width: 160 },
  ],
  rowActions: ['编辑', '分配权限', '分配数据范围', '删除'],
  formFields: [
    { key: 'name', label: '角色名称', type: 'text', required: true },
    { key: 'roleKey', label: '角色标识', type: 'text', required: true, tip: 'roleKey，唯一，英文/下划线' },
    { key: 'sort', label: '显示排序', type: 'number', required: true },
    { key: 'status', label: '状态', type: 'radio', options: ['启用', '停用'] },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  rows: [
    { no: 'R001', name: '租户管理员', type: '内置', roleKey: 'tenant-admin', sort: 1, status: '启用', remark: '本租户最高权限', createdAt: '2026-05-01 00:00' },
    { no: 'R002', name: '客服·二线坐席', type: '内置', roleKey: 'agent-cs', sort: 2, status: '启用', remark: '客服工单处理', createdAt: '2026-05-01 00:00' },
    { no: 'R003', name: '售后·二线坐席', type: '内置', roleKey: 'agent-as', sort: 3, status: '启用', remark: '售后工单处理', createdAt: '2026-05-01 00:00' },
    { no: 'R004', name: '客服班组长', type: '内置', roleKey: 'team-leader-cs', sort: 4, status: '启用', remark: '本组改派/审核', createdAt: '2026-05-01 00:00' },
    { no: 'R005', name: '售后班组长', type: '内置', roleKey: 'team-leader-as', sort: 5, status: '启用', remark: '本组改派/审核', createdAt: '2026-05-01 00:00' },
    { no: 'R006', name: '售后回访专员', type: '自定义', roleKey: 'aftersale-revisit', sort: 6, status: '启用', remark: '满意度回访', createdAt: '2026-05-26 10:30' },
    { no: 'R007', name: '质检专员', type: '自定义', roleKey: 'qa-inspector', sort: 7, status: '停用', remark: '会话/工单质检', createdAt: '2026-05-28 15:00' },
  ],
};

// ---------- 班组管理 (PRD-59b) ----------
const teams: ListConfig = {
  type: 'list',
  newLabel: '新增班组',
  rowKey: 'name',
  filters: [
    { key: 'name', label: '班组名称', type: 'text', placeholder: '请输入班组名称' },
    { key: 'leader', label: '负责人', type: 'text', placeholder: '请输入负责人' },
    { key: 'status', label: '状态', type: 'select', options: STATUS_OPTS },
  ],
  columns: [
    { key: 'name', title: '班组名称', kind: 'link', width: 150 },
    { key: 'leader', title: '负责人', width: 100 },
    { key: 'members', title: '成员数', width: 90 },
    { key: 'skills', title: '技能标签', kind: 'tags' },
    { key: 'status', title: '状态', kind: 'status', width: 90 },
    { key: 'createdAt', title: '创建时间', width: 160 },
  ],
  rowActions: ['编辑', '成员', '删除'],
  formFields: [
    { key: 'name', label: '班组名称', type: 'text', required: true },
    { key: 'leader', label: '负责人', type: 'select', required: true, options: ['王坐席', '陈坐席', '林组长', '孙莉'] },
    { key: 'memberList', label: '成员', type: 'multiselect', options: ['张三', '李四', '王坐席', '陈坐席', '孙莉', '周杰'] },
    { key: 'skillList', label: '技能标签', type: 'multiselect', options: ['售前', '技术·二线', '退换', '上门', 'VIP', '投诉'] },
    { key: 'dept', label: '关联部门', type: 'select', options: ['客服一部', '客服二部', '售后部', '技术支持部'] },
    { key: 'remark', label: '描述', type: 'textarea' },
    { key: 'status', label: '状态', type: 'radio', options: ['启用', '停用'] },
  ],
  rows: [
    { name: '客服一组', leader: '林组长', members: 8, skills: ['售前', '投诉'], status: '启用', createdAt: '2026-05-05 09:00' },
    { name: '客服二组', leader: '王坐席', members: 6, skills: ['咨询', 'VIP'], status: '启用', createdAt: '2026-05-06 09:00' },
    { name: '技术支持组', leader: '陈坐席', members: 5, skills: ['技术·二线'], status: '启用', createdAt: '2026-05-07 09:00' },
    { name: '售后服务组', leader: '孙莉', members: 7, skills: ['退换', '上门'], status: '启用', createdAt: '2026-05-08 09:00' },
    { name: '夜班应急组', leader: '王坐席', members: 3, skills: ['投诉', '技术·二线'], status: '停用', createdAt: '2026-05-10 09:00' },
  ],
};

// ---------- 渠道管理 (PRD-53, 卡片) ----------
const channels: CardConfig = {
  type: 'cards',
  newLabel: '新增渠道',
  filters: [
    { key: 'name', label: '渠道名称', type: 'text', placeholder: '请输入渠道名称' },
    { key: 'channelType', label: '渠道类型', type: 'select', options: ['全部', '在线', '电话', '邮件', '小程序', 'APP'] },
    { key: 'status', label: '状态', type: 'select', options: STATUS_OPTS },
  ],
  formFields: [
    { key: 'name', label: '渠道名称', type: 'text', required: true },
    { key: 'code', label: '渠道编码', type: 'text', required: true },
    { key: 'channelType', label: '渠道类型', type: 'select', required: true, options: ['在线', '电话', '邮件', '小程序', 'APP'] },
    { key: 'status', label: '状态', type: 'select', required: true, options: ['启用', '停用'] },
    { key: 'owner', label: '负责人', type: 'text' },
    { key: 'desc', label: '描述', type: 'textarea' },
    { key: 'color', label: '背景色', type: 'text', tip: '色值，如 #1A6FFF' },
    { key: 'sort', label: '排序', type: 'number' },
  ],
  rows: [
    { name: '官网在线咨询', code: 'web_chat', channelType: '在线', status: '启用', owner: '林组长', color: '#1A6FFF' },
    { name: '客服热线电话', code: 'hotline', channelType: '电话', status: '启用', owner: '王坐席', color: '#10B981' },
    { name: '邮件工单', code: 'email', channelType: '邮件', status: '启用', owner: '陈坐席', color: '#F59E0B' },
    { name: '微信小程序', code: 'mp_wechat', channelType: '小程序', status: '启用', owner: '孙莉', color: '#06B6D4' },
    { name: 'iFLY APP', code: 'app', channelType: 'APP', status: '启用', owner: '李四', color: '#A855F7' },
    { name: '企业微信', code: 'wecom', channelType: '在线', status: '停用', owner: '—', color: '#9CA3AF' },
  ],
};

// ---------- 应用管理 (PRD-54, 卡片) ----------
const apps: CardConfig = {
  type: 'cards',
  newLabel: '新建应用',
  filters: [
    { key: 'name', label: '应用名称', type: 'text', placeholder: '请输入应用名称' },
    { key: 'code', label: '应用编码', type: 'text', placeholder: '请输入应用编码' },
    { key: 'status', label: '状态', type: 'select', options: STATUS_OPTS },
  ],
  formFields: [
    { key: 'name', label: '应用名称', type: 'text', required: true },
    { key: 'appType', label: '应用类型', type: 'select', required: true, options: ['客服', '售后', '开放平台', '企业内部'] },
    { key: 'code', label: '应用编码', type: 'text', required: true },
    { key: 'desc', label: '应用描述', type: 'textarea' },
    { key: 'admin', label: '应用管理员', type: 'select', required: true, options: ['张三', '李四', '王坐席', '孙莉'] },
    { key: 'color', label: '图标颜色', type: 'text', required: true, tip: '色值，如 #1A6FFF' },
    { key: 'members', label: '应用成员', type: 'multiselect', options: ['张三', '李四', '王坐席', '陈坐席', '孙莉'] },
    { key: 'status', label: '状态', type: 'radio', options: ['启用', '停用'] },
  ],
  rows: [
    { name: '客服系统', code: 'cs', appType: '客服', status: '启用', admin: '张三', memberCount: 32, color: '#1A6FFF' },
    { name: '售后系统', code: 'aftersale', appType: '售后', status: '启用', admin: '孙莉', memberCount: 18, color: '#10B981' },
    { name: '开放平台', code: 'openapi', appType: '开放平台', status: '启用', admin: '王坐席', memberCount: 9, color: '#A855F7' },
    { name: '企业版门户', code: 'enterprise', appType: '企业内部', status: '停用', admin: '李四', memberCount: 5, color: '#F59E0B' },
  ],
};

export const ADMIN_MODULES: Record<string, ListConfig | CardConfig> = {
  users, roles, teams, channels, apps,
};
