/**
 * 小智工单 · 常量与字段组类型 —— **单一真源**（1130 小智工单 D1–D27 / W1–W8）。
 *
 * 建单弹窗、处理页产研反馈区、后台 SLA、通知规则、查询筛选等模块**只从这里取**枚举与类型，
 * 不在各自文件里另写一份。形制照 `types/flash.ts`（同为「咨询 + 标识」建模的 1130 批次）。
 *
 * 本文件只放**常量、类型与纯函数**，不依赖 Pinia / 工单库，任何模块都可以放心引用。
 */

/** 小智工单的工单类型：小智工单＝咨询单 + 建单时写入的「小智工单」标识（D1） */
export const XIAOZHI_TICKET_TYPE = '咨询' as const;

/** 小智工单标识的展示名（类型徽章旁的标识、查询筛选项、页头徽章） */
export const XIAOZHI_MARK_LABEL = '小智';

/**
 * 是否小智工单 —— **全仓唯一判据**（D1）：读工单上的 `isXiaozhi` 标识。
 * 标识在建单时由小智建单入口写入，此后不随配置变化、不可修改；
 * 不要再用工单类型、单号前缀或标题判断小智工单。
 */
export function isXiaozhiTicket(t: { isXiaozhi?: boolean } | null | undefined): boolean {
  return t?.isXiaozhi === true;
}

/** 业务大类固定「教育」（D4：业务大类属教育，入口与服务团队独立） */
export const XIAOZHI_BUSINESS_TYPE = '教育';

/** 来源渠道统一记 IM（D24：不区分小智 APP / 小智外部端 / 各色外部端） */
export const XIAOZHI_TICKET_SOURCE = 'IM' as const;

/** 分派：一个大组、进池自己领（D21），不按产品 / 优先级细分、不直派到个人 */
export const XIAOZHI_POOL_GROUP_NAME = '小智工单处理组';
export const XIAOZHI_POOL_GROUP_ID = 'xiaozhi';

/* ------------------------------------------------------------------ */
/* 建单要素（W1：业务侧尚未正式产出，以通用咨询单字段为底叠加）              */
/* ------------------------------------------------------------------ */

/**
 * 「问题类别」取值。相对 toC 在线小结，小智只多出「问题类别」与「是否流转研发」两项，
 * 其余小结字段属在线系统、不迁入工单系统（03 二·附）。
 * 这里给的是**现状实例值**，完整值域待业务确认（W1）。
 */
export const XIAOZHI_PROBLEM_CATEGORIES = ['产品问题定位'] as const;
export type XiaozhiProblemCategory = (typeof XIAOZHI_PROBLEM_CATEGORIES)[number] | (string & {});

/**
 * 在线小结上的其余字段（话务性质 / 知识反馈 / 建单要素模版 / 三方售后工单号 / 帐号 / 密码）
 * 属**在线系统**字段，与 toC 在线共用，本轮不迁入工单系统建单表单（D27 复用通用咨询单）。
 * 值域亦未定（W1），故此处只留口径说明，不声明枚举。
 */

/* ------------------------------------------------------------------ */
/* 直通产研（TPD）· 建单要素                                             */
/* ------------------------------------------------------------------ */

/**
 * 产研优先级四档 —— 取**老系统「创建TPD工单」弹窗现状取值**（03 二·附）。
 * ⚠️ 与 TPD 建单接口文档的「4紧急 / 3高 / 2中 / 1低」值域不一致，映射关系并入 W2 对齐；
 * 本轮界面照弹窗现状四档展示，不自行映射。
 */
export const XIAOZHI_RD_PRIORITIES = ['普通', '普通加急', '紧急', '重要'] as const;
export type XiaozhiRdPriority = (typeof XIAOZHI_RD_PRIORITIES)[number];
export const XIAOZHI_RD_PRIORITY_DEFAULT: XiaozhiRdPriority = '普通';

/** 产品模块一条（产研侧字典；接收人由产品模块带出、不可改，W2） */
export interface XiaozhiRdModule {
  /** 产品模块名 */
  name: string;
  /** 接收人（域账号），由产品模块带出 */
  receiver: string;
  /** 所属产品线（拼 TPD 单标题用，W3） */
  productLine: string;
}

/**
 * 「产品模块 ↔ 接收人（域账号）」配置（W2：落哪个后台待确认，暂按「落工单系统后台、挂在产品管理下」）。
 * 取值照老系统现状的精准教学产品线模块划分。
 */
export const XIAOZHI_RD_MODULES: XiaozhiRdModule[] = [
  { name: '智批改', receiver: 'zhangdong3', productLine: '精准教学产品线' },
  { name: '智能阅卷', receiver: 'lyu7', productLine: '精准教学产品线' },
  { name: '扫描', receiver: 'wangshuang11', productLine: '精准教学产品线' },
  { name: '组卷与题库', receiver: 'chenwei21', productLine: '精准教学产品线' },
];

/** 按产品模块取接收人域账号（取不到返回空串） */
export function xiaozhiReceiverOf(moduleName: string): string {
  return XIAOZHI_RD_MODULES.find((m) => m.name === moduleName)?.receiver ?? '';
}

/** 按产品模块取产品线（取不到返回空串） */
export function xiaozhiProductLineOf(moduleName: string): string {
  return XIAOZHI_RD_MODULES.find((m) => m.name === moduleName)?.productLine ?? '';
}

/**
 * 推给产研的单标题（W3 暂沿用老规则，形如「Z咨询-J精准教学产品线-S扫描」）。
 * ⚠️ 只用于推产研那一笔，**不是本单在工单系统里的标题** —— 本单标题照通用咨询单生成（D27）。
 */
export function xiaozhiRdTitle(moduleName: string): string {
  const line = xiaozhiProductLineOf(moduleName);
  return `Z${XIAOZHI_TICKET_TYPE}${line ? `-J${line}` : ''}${moduleName ? `-S${moduleName}` : ''}`;
}

/** 产研流转信息（建单时采集，推产研那一笔按它组装） */
export interface XiaozhiRdInfo {
  /** 产品模块 */
  module: string;
  /** 接收人（域账号）：由产品模块带出，只读 */
  receiver: string;
  /** 产研优先级 */
  priority: XiaozhiRdPriority;
  /** 一线人员域账号（选填） */
  frontlineAccount: string;
  /** 附件（文件名，选填） */
  attachments: string[];
}

export function defaultXiaozhiRdInfo(): XiaozhiRdInfo {
  return {
    module: '',
    receiver: '',
    priority: XIAOZHI_RD_PRIORITY_DEFAULT,
    frontlineAccount: '',
    attachments: [],
  };
}

/* ------------------------------------------------------------------ */
/* 产研回传（D7 / D8 / D9）                                             */
/* ------------------------------------------------------------------ */

/**
 * 回传类型。只接「驳回」与「办结」两类驱动本单（D7）；
 * 「处理中」等中间态只写处理履历留痕、**不驱动本单状态**。
 */
export type XiaozhiRdFeedbackKind = '处理中' | '驳回' | '办结';

/**
 * 办结回传的两套字段（W8 暂行口径：问题类与需求类分两组展示、有值才显示）。
 * 问题类 ＝ 解决结果 + 解决时间；需求类 ＝ 评估结果 / 分析方案 / 解决方案 / 开发计划 / 验收 / 完成 / 拒绝原因。
 */
export type XiaozhiSolutionType = '问题' | '需求';

/** 办结回传 · 问题类字段 */
export interface XiaozhiIssueResult {
  /** 解决结果 */
  solution: string;
  /** 解决时间 */
  solvedAt: string;
}

/** 办结回传 · 需求类字段 */
export interface XiaozhiDemandResult {
  /** 评估结果 */
  evaluation?: string;
  /** 分析方案 */
  analysis?: string;
  /** 解决方案 */
  solution?: string;
  /** 开发计划 */
  devPlan?: string;
  /** 验收 */
  acceptance?: string;
  /** 完成 */
  finished?: string;
  /** 拒绝原因 */
  rejectReason?: string;
}

/** 需求类字段展示名与次序（有值才显示，W8） */
export const XIAOZHI_DEMAND_FIELD_LABELS: { key: keyof XiaozhiDemandResult; label: string }[] = [
  { key: 'evaluation', label: '评估结果' },
  { key: 'analysis', label: '分析方案' },
  { key: 'solution', label: '解决方案' },
  { key: 'devPlan', label: '开发计划' },
  { key: 'acceptance', label: '验收' },
  { key: 'finished', label: '完成' },
  { key: 'rejectReason', label: '拒绝原因' },
];

/** 问题类字段展示名 */
export const XIAOZHI_ISSUE_FIELD_LABELS: { key: keyof XiaozhiIssueResult; label: string }[] = [
  { key: 'solution', label: '解决结果' },
  { key: 'solvedAt', label: '解决时间' },
];

/** 两套字段的分组标题（W8） */
export const XIAOZHI_RESULT_GROUP_TITLE: Record<XiaozhiSolutionType, string> = {
  问题: '问题处理结果',
  需求: '需求处理结果',
};

/* ------------------------------------------------------------------ */
/* 字段展示名                                                           */
/* ------------------------------------------------------------------ */

/** 小智单字段展示名（统一口径：建单表单、处理页、履历字段 diff 都用这一份） */
export const XIAOZHI_FIELD_LABELS = {
  problemCategory: '问题类别',
  rdModule: '产品模块',
  rdReceiver: '接收人（域账号）',
  rdPriority: '产研优先级',
  frontlineAccount: '一线人员域账号',
  attachments: '附件',
} as const;

/* ------------------------------------------------------------------ */
/* 产品文案（Toast / 拦截 / 履历 / 通知）                                  */
/* ------------------------------------------------------------------ */

/** 建单必填提示（输入类「请填写」、选择类「请选择」，与通用咨询单同一口径） */
export const XIAOZHI_TIP = {
  problemCategoryRequired: `请选择${XIAOZHI_FIELD_LABELS.problemCategory}`,
  rdModuleRequired: `请选择${XIAOZHI_FIELD_LABELS.rdModule}`,
} as const;

export const XIAOZHI_TOAST = {
  created: (no: string) => `已创建小智工单 ${no}`,
  createdAndEscalated: (no: string) => `已创建小智工单 ${no}，已流转产研`,
  resubmitted: '已二次提交产研',
  closedOnResult: '已收到产研结果，工单已结案并下送调研',
} as const;

/** 处理履历正文 */
export const XIAOZHI_TL = {
  /** `source` ＝ 工单来源（统一 IM，D24） */
  create: (source: string) => `创建小智工单 · ${source}`,
  /** 落池留记录后由系统自动流转推产研（D6） */
  autoEscalate: (channel: string, rdTitle: string) => `系统自动流转至${channel}；产研单标题：${rdTitle}`,
  /** 中间态只写履历、不驱动本单状态（D7） */
  rdProgress: (who: string, note: string) => `产研处理中 · ${who}${note ? `；处理意见：${note}` : ''}`,
  /** 驳回回传（D8） */
  rdRejected: (reason: string) => `产研驳回${reason ? `；驳回原因：${reason}` : ''}，可二次提交产研`,
  /** 二次提交产研（D8） */
  resubmit: (channel: string) => `二次提交${channel}`,
  /** 办结回传 → 自动关单 + 自动下送调研，不论解没解决（D9） */
  rdSettled: (solutionType: XiaozhiSolutionType) => `产研办结回传（${solutionType}类），自动结案并下送调研`,
} as const;

/** 站内通知 / 短信文案 */
export const XIAOZHI_NOTICE = {
  /** 新单进工单池待领取（D21：一个大组、进池自己领） */
  pooled: (no: string) => `${no}已进入${XIAOZHI_POOL_GROUP_NAME}工单池，待领取`,
  rdRejected: (no: string) => `${no}产研已驳回，可二次提交产研`,
  rdSettled: (no: string) => `${no}产研已办结，工单自动结案`,
} as const;

/**
 * 调研短信由**工单系统**发（D14②）；产研的「解决结果通知」短信由 **TPD 自己**发（D14①），
 * 工单系统不重复发送。调研发给提问人本人（D12），回「未解决」不拉回（D13）。
 */
export const XIAOZHI_SURVEY_TO_REPORTER = true;

/* ------------------------------------------------------------------ */
/* 字段组                                                               */
/* ------------------------------------------------------------------ */

/** 工单上挂的小智字段组（仅小智单有值，见 `isXiaozhi`） */
export interface TicketXiaozhi {
  /** 问题类别（建单必填，W1） */
  problemCategory: XiaozhiProblemCategory;
  /** 产研流转信息（走过产研的单才有值） */
  rd?: XiaozhiRdInfo;
  /** 本单已被产研驳回、可二次提交（D8） */
  rdRejected?: boolean;
  /** 已二次提交产研的次数（0 ＝ 未二次提交过） */
  rdResubmitCount?: number;
}
