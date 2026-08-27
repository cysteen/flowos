// 角色定义
// 真源：《00-基线-工单状态与动作》§3.0 §3.1 §4 + 《08-角色权限与导航模型》§2
// 本文件只管「菜单可见性 + 数据范围开关」，动作级权限见基线 §4。
//
// 【0830 改造】角色清单以《用户角色与权限矩阵 · 前台-0830》为准，**9 个角色**（基线 §3.0）：
//   一线坐席 / 二线专员 / 技术支持 / 二线班组长 / 客诉专员 / 工单运营 / 投诉督导 / 质检 / 管理员
// 相对 0820 的 10 角色口径，三处结构变动：
//   ① `agent-cs` + `agent-as` **合并**成 `agent-l2`，客服 / 售后降为**分岗属性** `post`；
//   ② 原「投诉处理角色」**一分为二**：`complaint-handler`（客诉专员，管控 + 打标，**不审批**）
//      与 `complaint-supervisor`（投诉督导，审批 + 指派 + 看板 + 大盘 + 打标，**不管控**）——
//      判据见基线 §3.0「能拿走别人工单的是客诉专员，能批别人申请的是投诉督导」；
//   ③ `qa`（质检）**转正**：全租户只读 + 查询中心。
// 「管理员」在前台是**一个角色**，代码里仍是三个 key —— platform / tenant / ops 的差异只在
// 管理后台内部生效（基线 §3.0 末行、PRD-08 §2 末注），故 `name` 三者统一为「管理员」，
// 只在演示切换器 / 登录账号表里用 `adminScopeLabel` 区分。
export type RoleKey =
  | 'agent-l1'
  | 'agent-l2'
  | 'tech-support'
  | 'team-leader'
  | 'complaint-handler'
  | 'complaint-supervisor'
  | 'ops-monitor'
  | 'qa'
  | 'system-admin'
  | 'ops-admin'
  | 'tenant-admin';

// platform=平台超管(系统管理员)；tenant=租户管理员(人/权限/安全)；ops=运营管理员(工单流转)
export type AdminScope = 'platform' | 'tenant' | 'ops';

/**
 * 二线专员的**分岗**（基线 §3.0：客服 / 售后 0830 起不再是两个角色，是同一角色的属性）。
 * 分岗是**用户属性**不是角色，故不占 RoleKey；它只决定「售后工作台」菜单出不出
 * （PRD-08 §2 注「售后工作台按分岗（客服 / 售后）出」）。
 */
export type AgentPost = 'cs' | 'as';

export interface RoleDef {
  key: RoleKey;
  /** 角色显示名（0830 正式名，旧名对照见基线 §3.0） */
  name: string;
  /**
   * 可见导航菜单 key（对齐 config/navigation.ts NAV_ITEMS.key）。
   * 逐格取自《08-角色权限与导航模型》§2 的角色 × 菜单表。
   */
  menus: string[];
  /**
   * 工单工作台中需隐藏的 Tab key。
   * 取值必须是 `TABS`（views/tickets/types/ticket.ts）里实际存在的 Tab：
   * 我的任务 / 已办 / 工单池 / 催补待回 / 待审核。
   * 过滤是 `TABS.filter(t => !hiddenTabs.includes(t.key))` —— 写不存在的 key 等于没写。
   */
  hiddenTabs: string[];
  /** 是否显示「管理后台」入口（头像下拉） */
  hasAdminEntry: boolean;
  /** 管理后台数据范围（仅 hasAdminEntry=true 时有效） */
  adminScope?: AdminScope;
  /** 演示切换器 / 登录账号表里的区分名（仅三类管理员用；前台仍统一显示 `name`） */
  adminScopeLabel?: string;
  /**
   * 该角色的**默认分岗**（仅 `agent-l2` 有意义）。
   * 实际生效的分岗取用户属性（见 stores/user.ts 的 `post`），这里只是缺省值。
   */
  post?: AgentPost;
  /** 工单只读：可查看任何工单，但不出任何流转/编辑操作（工单运营 / 质检） */
  readonlyTickets?: boolean;
  /**
   * 全中心只读，管控后可写（客诉专员）。
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
   * ① 一线坐席：接进线、建单、催单、取消，**不办单**。
   *
   * 它在业务上位于系统外（呼叫中心系统 iframe 嵌入本页），矩阵 §2 那一行九格全 ❌
   * 「不进本系统导航」；此处仍落 RoleKey 并**保留 `tickets` 一项**——交互稿要能真实切到
   * 这个视角做权限核对，菜单全空会让守卫 `firstMenuPath` 无处可去。
   *
   * ⚠️ **不给 `query-center`**（PRD-915 §3.4：一线的查询中心「无」，菜单与顶栏搜索框
   * 一并不展示）。此前「一线能进查工单」是判据写错造成的——`canTicketsTab` / `canOpenList`
   * 读的是 `tickets` 而不是 `query-center`，已按 C4 改判据。
   *
   * 权限范围以基线 §4 ① 列为准：
   * - 头部五枚全给：升级投诉 / 关联售后（限投诉单）/ 新建补充 / 催单 / 取消工单。
   * - 底部流转区（下送/升级/调剂/委派/挂起/关闭/强结/退回）一概不给。
   * - 数据范围「只看自己建的单」：⚠️ 列表项当前没有建单人字段，mock 层配不出来，
   *   故工作台只留「我的」页签、按处理人取数。补上建单人字段后再收紧。
   */
  'agent-l1': {
    key: 'agent-l1',
    name: '一线坐席',
    menus: ['tickets'],
    hiddenTabs: ['done', 'pool', 'poolPending', 'review'],
    hasAdminEntry: false,
    frontline: true,
  },
  /**
   * ② 二线专员（原「客服 · 二线技术顾问」+「售后 · 二线技术顾问」两个角色合并）：处理派到自己头上的单。
   *
   * **客服 / 售后是分岗不是角色**（基线 §3.0）：`post` 决定「售后工作台」出不出，
   * 菜单表里 `aftersale` 照矩阵给上（§2 该行 ✅），由 stores/user.ts 按分岗做二次过滤。
   * 审批中心给菜单但**不给审批资格**——它进去只看自己提的、撤回自己发起的（§2 缺陷注）。
   */
  'agent-l2': {
    key: 'agent-l2',
    name: '二线专员',
    menus: ['home', 'tickets', 'aftersale', 'query-center', 'approval'],
    hiddenTabs: ['review'],
    hasAdminEntry: false,
    post: 'cs',
  },
  /**
   * ③ 技术支持（原「三线技术支持」，0830 改名；正文里"三线""三线组池"等业务措辞保留）：
   * 处理升级来的技术问题，**能独立办单、不结案**，不该自己处理时退回。
   * 按业务分组；升级时选到组不选到人，单子落该组池子由组员自领。
   *
   * 矩阵 §2 给了审批中心 ✅「只看自己提的」——它不参与结案与流转，进去只为看自己提的申请、
   * 撤回自己发起的流转，**不给审批资格**（不进 APPROVAL_ACTION_ROLES）。
   */
  'tech-support': {
    key: 'tech-support',
    name: '技术支持',
    menus: ['home', 'tickets', 'query-center', 'approval'],
    hiddenTabs: ['review'],
    hasAdminEntry: false,
  },
  /** ④ 二线班组长（原「班组长」，0830 改名）：派单、审批、盯时效、调人。管辖多组，一次一组。 */
  'team-leader': {
    key: 'team-leader',
    name: '二线班组长',
    menus: ['home', 'tickets', 'aftersale', 'query-center', 'team-board', 'approval'],
    hiddenTabs: [],
    hasAdminEntry: false,
  },
  /**
   * ⑤ 客诉专员（原「投诉处理角色」的一半）：办投诉单 + 「工单管控」介入。
   * 全中心范围，**未管控只读、管控后可写**。给「风险监控」是为了看风险词命中区（可打标）。
   *
   * ⚠️ **没有审批资格**（基线 §4 ※28：审批一行客诉专员＝不展示；管控与审批互斥，
   * 拿走工单与批准申请不给同一个人）。菜单里的 `approval` 是"看自己提的 / 撤回自己发起的"。
   * ⚠️ **不给班组看板与运营监控大盘**（PRD-08 §2 注：它办单、管控，不做管理视角）。
   */
  'complaint-handler': {
    key: 'complaint-handler',
    name: '客诉专员',
    menus: ['home', 'tickets', 'query-center', 'ops-risk-monitor', 'approval'],
    hiddenTabs: [],
    hasAdminEntry: false,
    writableAfterTakeover: true,
  },
  /**
   * ⑥ 工单运营（原「运营监控岗」，0830 改名 + 职责扩大）：不办单，只调剂 / 指派 + 看板 + 大盘。
   *
   * 矩阵 §2 该行：首页 ❌ 工单工作台 ❌ 售后工作台 ❌ **查询中心 ✅ 班组看板 ✅ 运营监控 ✅**
   * 风险监控 ❌ 审批中心 ❌（仅「审批撤回」）。
   *
   * 🔴 0830 修正两处：
   * ① **补 `query-center` / `team-board`**（PRD-915 §3.4 该行「可用 · 全租户」；§2 班组看板 ✅）；
   * ② **移出风险打标与词表维护** —— 0830「风险监控」该行取值「无」，原「监控岗可打标」写法作废
   *    （基线 §3.1「工单运营不给 —— 它连风险词命中页都看不到」）。`ops-risk-monitor` 菜单随之撤掉。
   *
   * `readonlyTickets` 保留：只读约束的是**工单内容**，它仍可调剂 / 指派（换处理人不动内容）。
   * 矩阵给的「管理后台 ✅ 部分（问题分类 + SLA 管理）」**本轮不开** —— `hasAdminEntry` 是整块
   * 后台的开关、按 `adminScope` 出全量模块，没有"只给两块"的粒度；开了等于越权放出全部后台。
   */
  'ops-monitor': {
    key: 'ops-monitor',
    name: '工单运营',
    menus: ['query-center', 'team-board', 'ops-ticket-monitor'],
    hiddenTabs: ['review'],
    hasAdminEntry: false,
    readonlyTickets: true,
  },
  /**
   * ⑦ 投诉督导（原「投诉处理角色」的另一半，0830 新增）：**审批 + 指派** + 盯班组与全中心投诉态势。
   *
   * 基线 §4 ※28 三行分家：工单管控 **不展示**、审批 **可用**、指派 **可用**。
   * 办单 / 审批＝管辖组；看板与大盘＝全中心（基线 §3.1）。风险打标给（§3.1「风险词打标
   * ＝ 客诉专员 + 投诉督导」）。
   * 管理后台入口 🗣 待定（后台-0830 矩阵没有这一列，基线 §7 R13 E 组），本轮按**不给**落。
   */
  'complaint-supervisor': {
    key: 'complaint-supervisor',
    name: '投诉督导',
    menus: [
      'home', 'tickets', 'query-center', 'team-board',
      'ops-ticket-monitor', 'ops-risk-monitor', 'approval',
    ],
    hiddenTabs: [],
    hasAdminEntry: false,
  },
  /**
   * ⑧ 质检（0830 转正，原「质检员 / 抄送」全表不给、不进表）：纯查看 + 查询中心。
   *
   * 矩阵 §2 该行只有 **查询中心 ✅** 与 **审批中心 ✅ 只读**，其余全 ❌；数据范围全租户**只读**。
   * 基线 §4 末注「质检：全表动作 不展示（纯只读）」，故 `readonlyTickets`——
   * 它也因此能从查询中心点开工单详情（守卫对只读角色放行 ticket-operation，整页只读）。
   */
  'qa': {
    key: 'qa',
    name: '质检',
    menus: ['query-center', 'approval'],
    hiddenTabs: ['review'],
    hasAdminEntry: false,
    readonlyTickets: true,
  },
  /* ⑨ 管理员 —— 前台一个角色，代码三个 key，差异只在 adminScope（基线 §3.0 末行） */
  'system-admin': {
    key: 'system-admin',
    name: '管理员',
    adminScopeLabel: '管理员 · 平台',
    menus: ['home', 'tickets', 'query-center', 'aftersale', 'team-board', 'ops-ticket-monitor', 'ops-risk-monitor', 'approval'],
    hiddenTabs: [],
    hasAdminEntry: true,
    adminScope: 'platform',
  },
  'ops-admin': {
    key: 'ops-admin',
    name: '管理员',
    adminScopeLabel: '管理员 · 运营',
    menus: ['home', 'tickets', 'query-center', 'aftersale', 'team-board', 'ops-ticket-monitor', 'ops-risk-monitor', 'approval'],
    hiddenTabs: [],
    hasAdminEntry: true,
    adminScope: 'ops',
  },
  'tenant-admin': {
    key: 'tenant-admin',
    name: '管理员',
    adminScopeLabel: '管理员 · 租户',
    menus: ['home', 'tickets', 'query-center', 'aftersale', 'team-board', 'ops-ticket-monitor', 'ops-risk-monitor', 'approval'],
    hiddenTabs: [],
    hasAdminEntry: true,
    adminScope: 'tenant',
  },
};

/** 角色在切换器 / 账号表里的展示名：管理员按 adminScope 区分，其余用正式名 */
export function roleOptionLabel(key: RoleKey): string {
  return ROLES[key].adminScopeLabel ?? ROLES[key].name;
}

/** 顶栏「切换演示角色」分组选项（9 角色，管理员展开成三个 adminScope） */
export const ROLE_OPTION_GROUPS = [
  {
    label: '坐席与班组',
    options: [
      { label: roleOptionLabel('agent-l1'), value: 'agent-l1' as RoleKey },
      { label: roleOptionLabel('agent-l2'), value: 'agent-l2' as RoleKey },
      { label: roleOptionLabel('tech-support'), value: 'tech-support' as RoleKey },
      { label: roleOptionLabel('team-leader'), value: 'team-leader' as RoleKey },
    ],
  },
  {
    label: '投诉与运营',
    options: [
      { label: roleOptionLabel('complaint-handler'), value: 'complaint-handler' as RoleKey },
      { label: roleOptionLabel('complaint-supervisor'), value: 'complaint-supervisor' as RoleKey },
      { label: roleOptionLabel('ops-monitor'), value: 'ops-monitor' as RoleKey },
      { label: roleOptionLabel('qa'), value: 'qa' as RoleKey },
    ],
  },
  {
    label: '管理',
    options: [
      { label: roleOptionLabel('system-admin'), value: 'system-admin' as RoleKey },
      { label: roleOptionLabel('ops-admin'), value: 'ops-admin' as RoleKey },
      { label: roleOptionLabel('tenant-admin'), value: 'tenant-admin' as RoleKey },
    ],
  },
];

/**
 * 顶栏话务条（签入/签出 + 就绪态 + 小休 + 外呼拨号盘）对哪些角色显示。
 *
 * 真源＝基线 §4「**联系客户（签入/外呼、短信、邮件）**」一行（※18 已放开给技术支持）：
 * ① 一线坐席 不展示（在系统外，用呼叫中心自己的话务条）
 * ② 二线专员 可用　③ 技术支持 **可用**（※18 原「三线不联系客户」口径作废）
 * ④ 二线班组长 可用　⑤ 客诉专员 可用　⑥ 工单运营 不展示（不办单）
 * ⑦ 投诉督导 可用　⑧ 质检 不展示（纯只读）　⑨ 管理员 可用
 *
 * ⑤ 客诉专员的规格是「未管控态置灰、管控后可用」——「工单管控」尚未落地，
 * 故这里只管**是否显示**，置灰要等管控态判据补齐再加。
 */
export const CTI_BAR_ROLES: RoleKey[] = [
  'agent-l2', 'tech-support', 'team-leader',
  'complaint-handler', 'complaint-supervisor',
  'ops-admin', 'tenant-admin', 'system-admin',
];

/**
 * 风险词命中区能打标的角色。
 *
 * 0830 改口径：**风险词打标 ＝ 客诉专员 + 投诉督导**（基线 §3.1），管理员兜底。
 * **工单运营移出** —— 该行 0830 取值「无」，「它连风险词命中页都看不到」，
 * 原「监控岗可打标」的写法作废（原实现给了打标权却又不给风险监控菜单，权限与入口对不上）。
 */
export const RISK_TAG_ROLES: RoleKey[] = [
  'complaint-handler', 'complaint-supervisor',
  'system-admin', 'ops-admin', 'tenant-admin',
];

/**
 * 风险预警词表维护（新建 / 编辑 / 启停）。
 *
 * 原先给的是工单运营，但 0830 起它连风险监控页都进不去（基线 §3.1），判据整个失效。
 * 词表维护是**管理动作**不是打标动作：按基线 §3.1 的两个打标角色分工——
 * 客诉专员**只打标**（它是办单侧），**投诉督导 + 管理员**维护词表（督导才是盯态势的管理视角）。
 */
export const RISK_WORD_MAINTAIN_ROLES: RoleKey[] = [
  'complaint-supervisor',
  'system-admin', 'ops-admin', 'tenant-admin',
];

/**
 * 有**审批资格**的角色 —— 审批中心里「审批批准 / 审批驳回 / 批量通过 / 批量驳回」四枚只对它们渲染。
 *
 * 真源：基线 §4「**审批（在审批中心）**」一行 + ※28。0830 起取值为
 * **二线班组长 / 投诉督导 / 管理员**三类，其余六个角色一律「不展示」。
 *
 * 🔴 **客诉专员已移出**（原实现把它放在这里是越权）：※28 明确「能批别人申请的只有投诉督导」，
 * 管控与审批互斥；原「投诉处理角色仅批自己管控的单」一条作废。
 *
 * ⚠️ **与菜单可见性是两件事，别互相反推**：二线专员 / 技术支持 / 客诉专员 有 `approval` 菜单是对的 ——
 * 它们进审批中心是去看**自己提交的**申请、撤回自己发起的流转（矩阵 #88「审批撤回」条件可用），
 * 但**不能批**；质检进去是**只读**。用 `menus.includes('approval')` 当审批资格判据会直接放出越权。
 */
export const APPROVAL_ACTION_ROLES: RoleKey[] = [
  'team-leader', 'complaint-supervisor',
  'system-admin', 'ops-admin', 'tenant-admin',
];

/**
 * 查询中心 · 工具条「**新建工单**」对哪些角色渲染。
 *
 * 真源：《【915】查询中心 · 查工单 PRD》§3.4「页面内动作权限」——
 * **一线坐席 / 工单运营 / 质检 不展示**，其余六个角色可用。
 * 判据是"这个动作本身授权（类0 创建）"，与"能不能进本页"无关：
 * 工单运营与质检进得来、看得全，但**不办单**，给了建单入口等于给了写权。
 *
 * ⚠️ **与工作台的「新建工单」是两个入口、两个权限点**（PRD 原话「须分开建码」），
 * 别把这个常量拿去门控工作台那一枚 —— 一线坐席在工作台上是要建单的。
 *
 * 「列设置」「保存筛选器」不在这里：它们是**用户偏好**，随本页权限走 ——
 * 进得来的角色（含工单运营与质检）**全给**，故无需白名单。
 */
export const QUERY_CENTER_CREATE_ROLES: RoleKey[] = [
  'agent-l2', 'tech-support', 'team-leader',
  'complaint-handler', 'complaint-supervisor',
  'system-admin', 'ops-admin', 'tenant-admin',
];

export const ALL_ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

export function isRoleKey(key: string): key is RoleKey {
  return ALL_ROLE_KEYS.includes(key as RoleKey);
}

/** @deprecated 使用 ROLE_OPTION_GROUPS */
export const ROLE_OPTIONS = ALL_ROLE_KEYS.map((k) => ({
  label: roleOptionLabel(k),
  value: k,
}));
