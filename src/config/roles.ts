// 角色定义
// 真源：《00-基线-工单状态与动作》§3 §4 + 《08-角色权限与导航模型》§2
// 本文件只管「菜单可见性 + 数据范围开关」，动作级权限见基线 §4。
// 一线坐席在系统外（呼叫中心 iframe 嵌入），但**本系统内落 RoleKey**，理由见 'agent-l1' 处；
// 质检员 / 抄送待定。
export type RoleKey =
  | 'agent-l1'
  | 'agent-cs'
  | 'agent-as'
  | 'tech-support'
  | 'team-leader'
  | 'complaint-handler'
  | 'ops-monitor'
  | 'system-admin'
  | 'ops-admin'
  | 'tenant-admin';

// platform=平台超管(系统管理员)；tenant=租户管理员(人/权限/安全)；ops=运营管理员(工单流转)
export type AdminScope = 'platform' | 'tenant' | 'ops';

export interface RoleDef {
  key: RoleKey;
  /** 角色显示名 */
  name: string;
  /** 可见导航菜单 key（对齐 config/navigation.ts NAV_ITEMS.key） */
  menus: string[];
  /** 工单工作台中需隐藏的 Tab key */
  hiddenTabs: string[];
  /** 是否显示「管理后台」入口（头像下拉） */
  hasAdminEntry: boolean;
  /** 管理后台数据范围（仅 hasAdminEntry=true 时有效） */
  adminScope?: AdminScope;
  /** 工单只读：可查看任何工单，但不出任何流转/编辑操作（运营监控岗） */
  readonlyTickets?: boolean;
  /**
   * 全中心只读，管控后可写（投诉处理角色）。
   * 与 readonlyTickets 的区别：那个是永远只读；这个是**未管控只读**——
   * 平时全中心的单只看得到、点不了处理动作，只能点「工单管控」；
   * 管控那一刻工单归它，才解锁全部处理动作。别实现成"全中心可写"。
   */
  writableAfterTakeover?: boolean;
  /**
   * 一线视角：底栏流转动作整条不出、处理表单区不可填，但**头部五枚照常可用**。
   * 与 readonlyTickets 的区别：那个连头部也不出（纯看客）；一线是"能录客户诉求、不办单"。
   *
   * 判据必须挂在角色上。此前挂在工单的 frontlineDemo 字段上，
   * 结果带该标记的单对**所有角色**都走一线分支，把 headerActionsByRole 与
   * hideActionBar 两处门控整个短路（2026-08-19 修正）。
   */
  frontline?: boolean;
}

export const ROLES: Record<RoleKey, RoleDef> = {
  /**
   * 一线坐席（基线角色行序 ①）：接进线、建单、催单、取消，**不办单**。
   *
   * 它在业务上位于系统外（呼叫中心系统 iframe 嵌入本页），此处仍落 RoleKey——
   * 因为交互稿要能真实切到这个视角做权限核对。原先是用工单上的 `frontlineDemo`
   * 假字段模拟的，12 张 mock 单里 11 张带着它，于是「一线视角」对所有角色都为真。
   *
   * 权限范围以《用户角色与权限矩阵 · 运行工作区》① 列为准（36 行）：
   * - 头部五枚全给：升级投诉 / 关联售后（限投诉单）/ 新建补充 / 催单 / 取消工单。
   *   **不含签入**——签入连同外呼、短信、邮件已收口给二线技术顾问。
   * - 底部流转区（下送/升级/调剂/委派/挂起/关闭/强结/退回）一概不给。
   * - 处理表单区不可填、协同信息区 Tab 只读（仅「关联/补充/催单」可写）。
   * - 数据范围「只看自己建的单」：⚠️ 列表项当前没有建单人字段（只有详情页的
   *   builderShort），mock 层配不出来，故工作台只留「我的」页签、按处理人取数。
   *   补上建单人字段后再收紧，别当成已实现。
   */
  'agent-l1': {
    key: 'agent-l1',
    name: '一线坐席',
    menus: ['tickets'],
    hiddenTabs: ['done', 'pool', 'poolPending', 'cc', 'review'],
    hasAdminEntry: false,
    frontline: true,
  },
  'agent-cs': {
    key: 'agent-cs',
    name: '客服·二线技术顾问',
    menus: ['home', 'tickets', 'query-center', 'approval'],
    hiddenTabs: ['review', 'cc'],
    hasAdminEntry: false,
  },
  'agent-as': {
    key: 'agent-as',
    name: '售后·二线技术顾问',
    menus: ['home', 'aftersale', 'query-center', 'approval'],
    hiddenTabs: ['review', 'cc'],
    hasAdminEntry: false,
  },
  /**
   * 三线技术支持：处理升级来的技术问题，不该自己处理时退回。
   * 按业务分组；升级时选到组不选到人，单子落该组池子由组员自领。
   * 不参与结案与流转，故不给审批中心。
   */
  'tech-support': {
    key: 'tech-support',
    name: '三线技术支持',
    menus: ['home', 'tickets', 'query-center'],
    hiddenTabs: ['review', 'cc'],
    hasAdminEntry: false,
  },
  'team-leader': {
    key: 'team-leader',
    name: '班组长',
    menus: ['home', 'tickets', 'query-center', 'team-board', 'approval'],
    hiddenTabs: ['cc'],
    hasAdminEntry: false,
  },
  /**
   * 投诉处理角色（830）：盯投诉风险，有「工单管控」权限——把任意工单拿到自己名下处置。
   * 全中心范围，未管控只读、管控后可写。给「运营监控」是为了看风险词命中区（可打标）。
   * 规则引擎里的通知目标字符串「投诉风险组」指的是同一批人。
   */
  'complaint-handler': {
    key: 'complaint-handler',
    name: '投诉处理角色',
    menus: ['home', 'tickets', 'query-center', 'ops-monitor', 'approval'],
    hiddenTabs: ['cc'],
    hasAdminEntry: false,
    writableAfterTakeover: true,
  },
  /**
   * 运营监控岗（915）：只盯全中心实时态，不办单。
   * 菜单只有「运营监控」——给它工单工作台反而会诱导它去处理工单，与只读定位冲突；
   * 需要看某张单时从大盘下钻进工单详情（只读态）。
   */
  'ops-monitor': {
    key: 'ops-monitor',
    name: '运营监控岗',
    menus: ['ops-monitor'],
    hiddenTabs: ['review', 'cc'],
    hasAdminEntry: false,
    readonlyTickets: true,
  },
  'system-admin': {
    key: 'system-admin',
    name: '系统管理员',
    menus: ['home', 'tickets', 'query-center', 'aftersale', 'team-board', 'ops-monitor', 'approval'],
    hiddenTabs: ['cc'],
    hasAdminEntry: true,
    adminScope: 'platform',
  },
  'ops-admin': {
    key: 'ops-admin',
    name: '运营管理员',
    menus: ['home', 'tickets', 'query-center', 'aftersale', 'team-board', 'ops-monitor', 'approval'],
    hiddenTabs: ['cc'],
    hasAdminEntry: true,
    adminScope: 'ops',
  },
  'tenant-admin': {
    key: 'tenant-admin',
    name: '租户管理员',
    menus: ['home', 'tickets', 'query-center', 'aftersale', 'team-board', 'ops-monitor', 'approval'],
    hiddenTabs: ['cc'],
    hasAdminEntry: true,
    adminScope: 'tenant',
  },
};

/** 顶栏「切换演示角色」分组选项 */
export const ROLE_OPTION_GROUPS = [
  {
    label: '坐席',
    options: [
      { label: ROLES['agent-l1'].name, value: 'agent-l1' as RoleKey },
      { label: ROLES['agent-cs'].name, value: 'agent-cs' as RoleKey },
      { label: ROLES['agent-as'].name, value: 'agent-as' as RoleKey },
      { label: ROLES['tech-support'].name, value: 'tech-support' as RoleKey },
      { label: ROLES['team-leader'].name, value: 'team-leader' as RoleKey },
      { label: ROLES['complaint-handler'].name, value: 'complaint-handler' as RoleKey },
      { label: ROLES['ops-monitor'].name, value: 'ops-monitor' as RoleKey },
    ],
  },
  {
    label: '管理',
    options: [
      { label: ROLES['system-admin'].name, value: 'system-admin' as RoleKey },
      { label: ROLES['ops-admin'].name, value: 'ops-admin' as RoleKey },
      { label: ROLES['tenant-admin'].name, value: 'tenant-admin' as RoleKey },
    ],
  },
];

/**
 * 顶栏话务条（签入/签出 + 就绪态 + 小休 + 外呼拨号盘）对哪些角色显示。
 *
 * 「签入、外呼、发短信、发邮件」是**联系客户类**动作，已收口给二线技术顾问一侧。
 * 不给：① 一线坐席（在系统外，用呼叫中心自己的话务条）、④ 三线技术支持
 * （不接触客户，单在他手上时须抄送主责二线）、⑦ 运营监控岗（不办单）、⑧ 质检/抄送。
 *
 * ⑥ 投诉处理角色的规格是「未管控态置灰、管控后可用」——「工单管控」尚未落地，
 * 故这里只管**是否显示**，置灰要等管控态判据补齐再加。
 */
export const CTI_BAR_ROLES: RoleKey[] = [
  'agent-cs', 'agent-as', 'team-leader', 'complaint-handler',
  'ops-admin', 'tenant-admin', 'system-admin',
];

/**
 * 风险词命中区能打标的角色。
 *
 * 规格见《【915】运营监控大盘 PRD》§6.4「谁能打标」：**运营监控岗 ＋ 投诉处理角色**。
 * 投诉处理角色要在这里，是因为它的职责就是盯投诉风险 —— 见本文件 complaint-handler 的定义；
 * 词表本身的维护权归运营管理员，两者不是一回事（监控岗对词表只读）。
 */
export const RISK_TAG_ROLES: RoleKey[] = ['ops-monitor', 'complaint-handler'];

export const ALL_ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

export function isRoleKey(key: string): key is RoleKey {
  return ALL_ROLE_KEYS.includes(key as RoleKey);
}

/** @deprecated 使用 ROLE_OPTION_GROUPS */
export const ROLE_OPTIONS = ALL_ROLE_KEYS.map((k) => ({
  label: ROLES[k].name,
  value: k,
}));
