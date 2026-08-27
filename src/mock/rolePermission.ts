// 角色与权限 Mock — 对齐参考 A5-permission.html「角色管理」(角色树 + 权限配置矩阵)。

export type DataScope = 'none' | 'self' | 'group' | 'dept' | 'all';
export const DATA_SCOPE_OPTIONS: { value: DataScope; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'self', label: '仅个人' },
  { value: 'group', label: '本组' },
  { value: 'dept', label: '本部门' },
  { value: 'all', label: '全局' },
];

export interface ModulePerm {
  module: string;
  menu: boolean;
  view: boolean;
  create: boolean;
  edit: boolean;
  del: boolean;
  approve: boolean;
  export: boolean;
  scope: DataScope;
}

export interface RoleDetail {
  id: string;
  name: string;
  desc: string;
  category: '系统管理' | '业务角色' | '自定义';
  /** 三权分立约束提示（可空） */
  separation?: string;
  permissions: ModulePerm[];
}

export interface RoleGroup {
  name: string;
  color: string;
  expanded: boolean;
  roles: RoleDetail[];
}

const MODULES = [
  '工单工作台', '工单处理', '客户中心', '产品中心', '知识库',
  '统计报表', '用户管理', '角色权限', 'SLA 管理', '规则引擎',
];

// 按预设档位生成权限矩阵
function perms(level: 'full' | 'agent' | 'leader' | 'readonly'): ModulePerm[] {
  return MODULES.map((module): ModulePerm => {
    if (level === 'full') {
      return { module, menu: true, view: true, create: true, edit: true, del: true, approve: true, export: true, scope: 'all' };
    }
    if (level === 'readonly') {
      return { module, menu: true, view: true, create: false, edit: false, del: false, approve: false, export: ['统计报表'].includes(module), scope: 'dept' };
    }
    const isTicket = ['工单工作台', '工单处理', '客户中心', '知识库'].includes(module);
    const isAdminMod = ['用户管理', '角色权限', 'SLA 管理', '规则引擎'].includes(module);
    if (level === 'leader') {
      return {
        module, menu: !isAdminMod, view: !isAdminMod, create: isTicket, edit: isTicket,
        del: false, approve: isTicket, export: ['统计报表', '工单工作台'].includes(module),
        scope: isTicket ? 'group' : 'self',
      };
    }
    // agent
    return {
      module, menu: isTicket || module === '统计报表', view: isTicket || module === '统计报表',
      create: ['工单工作台', '工单处理'].includes(module), edit: ['工单处理'].includes(module),
      del: false, approve: false, export: false, scope: isTicket ? 'self' : 'none',
    };
  });
}

export const ROLE_GROUPS: RoleGroup[] = [
  {
    name: '系统管理', color: '#EF4444', expanded: true,
    roles: [
      { id: 'r-sysadmin', name: '系统管理员', desc: '平台级最高权限，管理租户与系统参数', category: '系统管理', separation: '系统管理员不可同时拥有审计管理员角色（操作与审计分离）', permissions: perms('full') },
      { id: 'r-secadmin', name: '安全管理员', desc: '负责认证、字段脱敏与敏感操作策略', category: '系统管理', separation: '安全配置与业务操作分离', permissions: perms('readonly') },
      { id: 'r-auditadmin', name: '审计管理员', desc: '只读审计日志，不可执行业务操作', category: '系统管理', separation: '审计与被审计对象分离', permissions: perms('readonly') },
    ],
  },
  {
    name: '业务角色', color: '#1A6FFF', expanded: true,
    roles: [
      { id: 'r-tenant-admin', name: '租户管理员', desc: '本租户人员、角色、权限、安全管理', category: '业务角色', permissions: perms('full') },
      { id: 'r-ops-admin', name: '运营管理员', desc: '工单流转全链路配置（类型/SLA/规则/模板…）', category: '业务角色', permissions: perms('leader') },
      { id: 'r-team-leader', name: '二线班组长', desc: '本班组工单派单、审批与看板', category: '业务角色', permissions: perms('leader') },
      // 0830：客服 / 售后是二线专员的**分岗**，不再是两个角色（基线 §3.0）
      { id: 'r-agent-l2', name: '二线专员', desc: '工单受理与处理（分岗：客服 / 售后）', category: '业务角色', permissions: perms('agent') },
      { id: 'r-tech-support', name: '技术支持', desc: '处理升级来的技术问题，不结案', category: '业务角色', permissions: perms('agent') },
      { id: 'r-complaint-handler', name: '客诉专员', desc: '办投诉单 + 工单管控（未管控只读）', category: '业务角色', permissions: perms('agent') },
      { id: 'r-complaint-supervisor', name: '投诉督导', desc: '审批 + 指派 + 盯班组与全中心投诉态势', category: '业务角色', permissions: perms('leader') },
      { id: 'r-ops-monitor', name: '工单运营', desc: '不办单：调剂 / 指派 + 看板 + 大盘', category: '业务角色', permissions: perms('readonly') },
      { id: 'r-qa-role', name: '质检', desc: '全租户只读 + 查询中心', category: '业务角色', permissions: perms('readonly') },
      { id: 'r-agent-l1', name: '一线坐席', desc: '接进线、建单、催单，不办单', category: '业务角色', permissions: perms('agent') },
    ],
  },
  {
    name: '自定义', color: '#A855F7', expanded: true,
    roles: [
      { id: 'r-revisit', name: '售后回访专员', desc: '满意度回访与记录', category: '自定义', permissions: perms('readonly') },
      { id: 'r-qa', name: '会话质检专员', desc: '会话质检（自定义角色，与内置「质检」不同）', category: '自定义', permissions: perms('readonly') },
    ],
  },
];
