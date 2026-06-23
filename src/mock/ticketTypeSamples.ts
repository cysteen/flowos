// 各工单类型的处理页样例数据（按类型差异化）。
// 投诉沿用 ticketOperationTabs / ticketDetail 的 base 样例（最完整）；
// 咨询 / 商机 / 建议 在此提供各自连贯的 Tab 数据、Tab① 预填与概要覆盖。
// 接入：useOperationTabs / useProcessForm / useTicketOperation 按 detail.type 取用。

import type { OperationTabData } from '@/views/tickets/types/operationTabs';
import type { ProcessFormDraft, InsightStats, AiTicketInsight } from '@/views/tickets/types/operation';

const C = { 投诉: '#EF4444', 建议: '#10B981', 商机: '#F59E0B', 咨询: '#1A6FFF' };
const bg = (hex: string) => `${hex}1F`;

export interface TypeDetailOverride {
  demand?: string;
  insight?: InsightStats;
  aiInsight?: AiTicketInsight;
}

export interface TicketTypeSample {
  detail?: TypeDetailOverride;
  processDraft?: Partial<ProcessFormDraft>;
  tabData?: Partial<OperationTabData>;
}

export const TYPE_SAMPLES: Record<string, TicketTypeSample> = {
  // ===================== 咨询 =====================
  咨询: {
    detail: {
      demand: '咨询学习机 T20 如何连接家庭 WiFi 并登录账号，希望获得操作指引。',
      insight: {
        inboundCount: 2, historyCount: 5, complaintCount: 0, sameTypeCount: 4, recent30Count: 6,
        dunningCount: 0, supplementCount: 1, relatedCount: 2,
      },
      aiInsight: {
        customerBrief: '咨询为主、无投诉，进线频次中等',
        ticketBrief: 'WiFi登录咨询，远程指导中',
        suggestion: '推送指引后快速结案',
      },
    },
    processDraft: {
      problemCause: '客户咨询学习机 T20 连接家庭 WiFi 与账号登录方法，一线初步引导未完成。',
      processResult: '已远程指导完成 WiFi 配置与账号登录，功能正常，客户表示已掌握。',
      processResultAttachments: [],
      qualityIsStandard: true,
    },
    tabData: {
      currentFlowNode: '工单处理',
      techDraft: {
        problemCause: '客户对学习机投屏与账号多端同步存在疑问，转技术支持补充说明。',
        processResult: '已提供图文操作指引并远程演示，客户确认理解。',
        problemCauseAttachments: [],
        processResultAttachments: [],
      },
      flowHistory: [
        { id: 'f1', title: '工单创建', operator: '李一线(客服)', when: '2026-06-17 09:05:10', desc: '客户来电咨询，产品：学习机 T20，问题：如何连接 WiFi 并登录账号' },
        { id: 'f2', title: '自动派单', operator: '系统自动', when: '2026-06-17 09:05:40', desc: '按技能组匹配，自动派发至：在线支持组，处理人：王坐席' },
        { id: 'f3', title: '处理中', operator: '王坐席(在线支持)', when: '2026-06-17 09:20:02', desc: '已检索知识库并远程指导，待客户确认后结案', active: true },
      ],
      relatedTickets: [
        {
          no: 'IFLYKF2026060110030011', title: '学习机 T20 账号登录咨询', status: '已完成',
          statusColor: '#10B981', type: '咨询', typeColor: C.咨询, typeBgColor: bg(C.咨询),
          createdAt: '06-01 10:03', builder: '李一线', demand: '客户咨询多设备登录同一账号是否冲突',
          processRecords: [{ who: '王坐席', when: '06-01 10:20', content: '已说明账号多端登录策略并推送帮助文档' }],
        },
      ],
      supplementRecords: [
        { id: 's1', who: '王坐席', when: '今天 09:18', content: '补充 WiFi 配置截图', attachments: ['配置截图.png'] },
      ],
      dunningRecords: [],
      contactRecords: [
        {
          id: 'c1', kind: 'call', title: '外呼回访', emoji: '📞', operator: '王坐席',
          when: '2026-06-17 09:18:22', summary: '呼叫号码: 139 0000 0002 | 状态: 接通 | 时长: 03:05',
          recording: { progress: '01:20 / 03:05', progressPercent: 43 },
          asr: [
            { speaker: '客户', text: 'WiFi 连上了，但账号登录还是提示验证码错误。' },
            { speaker: '坐席', text: '我帮您重置验证码并指导重新登录。' },
          ],
        },
        {
          id: 'c2', kind: 'sms', title: '短信发送', emoji: '💬', operator: '王坐席',
          when: '2026-06-17 09:10:30', summary: '接收号码: 139 0000 0002 | 状态: 发送成功 | 模板: 操作指引',
          smsContent: '【讯飞客服】您好，学习机 WiFi 与账号登录操作指引已发送，如有疑问可回复或致电 400 热线。',
        },
      ],
      notifyRecords: [
        { id: 'n1', kind: 'transfer', title: '转办通知', receiver: '王坐席(处理人)', when: '2026-06-17 09:05:45', channel: '站内信 + i讯飞', status: '已读', content: '咨询工单已转办至您名下，请及时跟进解答。' },
        { id: 'n2', kind: 'accepted', title: '工单受理', receiver: '李大海(客户)', when: '2026-06-17 09:05:30', channel: '短信 + 邮件', status: '已送达', content: '您咨询的问题已受理，工单号:IFLYKF2026061709050110，我们将尽快为您解答。' },
      ],
      surveyRecords: [
        { id: 'v1', title: '满意度调研', sentAt: '2026-06-17 10:00:25', evaluated: true, linkLabel: '查看问卷', conclusion: '是否解决: 已解决 | 是否满意: 满意' },
      ],
      customerHistory: {
        customerName: '李大海', totalCount: 5, processingCount: 1, closedCount: 4, complaintCount: 0,
        tickets: [
          { id: 'h1', no: 'IFLYKF2026060110030011', title: '学习机 T20 账号登录咨询', status: '已关闭', statusColor: '#10B981', type: '咨询', typeColor: C.咨询, typeBgColor: bg(C.咨询), channel: '400呼入', date: '2026-06-01', summary: '咨询多设备登录策略，已说明并推送文档。', isProcessing: false, isClosed: true, isComplaint: false },
          { id: 'h2', no: 'IFLYKF2026061709050110', title: '设备无法连接 WiFi 咨询', status: '处理中', statusColor: '#1A6FFF', type: '咨询', typeColor: C.咨询, typeBgColor: bg(C.咨询), channel: '电话', date: '2026-06-17', summary: '咨询 WiFi 连接与账号登录，远程指导中。', isProcessing: true, isClosed: false, isComplaint: false },
        ],
      },
    },
  },

  // ===================== 商机 =====================
  商机: {
    detail: {
      demand: '咨询开放平台企业版扩容与商务合作，存在采购意向，需商务跟进报价。',
      insight: {
        inboundCount: 1, historyCount: 3, complaintCount: 0, sameTypeCount: 2, recent30Count: 3,
        dunningCount: 0, supplementCount: 0, relatedCount: 1,
      },
      aiInsight: {
        customerBrief: '企业客户，有套餐咨询史，采购意向明确',
        ticketBrief: '商机单，扩容限流问题，商务跟进中',
        suggestion: '48h内报价并预约演示',
        riskTag: '高意向',
      },
    },
    processDraft: {
      problemCause: '客户咨询开放平台企业版 API 限流(429)与扩容方案，表达采购扩容意向。',
      processResult: '已记录扩容需求与预算区间，转商务团队跟进报价与合同。',
      processResultAttachments: [],
      qualityIsStandard: true,
      leadIntent: 'high',
      leadAmount: '50000',
      leadStage: 'following',
    },
    tabData: {
      currentFlowNode: '工单处理',
      flowHistory: [
        { id: 'f1', title: '工单创建', operator: '李一线(客服)', when: '2026-06-17 11:02:08', desc: '客户来邮咨询开放平台企业版扩容，识别为商机线索，产品：开放平台' },
        { id: 'f2', title: '自动派单', operator: '系统自动', when: '2026-06-17 11:02:40', desc: '商机线索自动派发至：商务支持组，处理人：王坐席' },
        { id: 'f3', title: '跟进中', operator: '王坐席(商务支持)', when: '2026-06-17 15:10:20', desc: '已对接客户采购需求，商务报价跟进中', active: true },
      ],
      relatedTickets: [
        {
          no: 'IFLYKF2026060810050022', title: '开放平台企业版套餐咨询', status: '已完成',
          statusColor: '#10B981', type: '商机', typeColor: C.商机, typeBgColor: bg(C.商机),
          createdAt: '06-08 10:05', builder: '李一线', demand: '客户咨询企业版套餐与并发额度',
          processRecords: [{ who: '王坐席', when: '06-08 11:00', content: '已发送套餐对比与报价单，客户评估中' }],
        },
      ],
      supplementRecords: [],
      dunningRecords: [],
      contactRecords: [
        {
          id: 'c1', kind: 'call', title: '外呼对接', emoji: '📞', operator: '王坐席',
          when: '2026-06-17 15:08:22', summary: '呼叫号码: 137 0000 0004 | 状态: 接通 | 时长: 06:40',
          recording: { progress: '03:10 / 06:40', progressPercent: 47 },
          asr: [
            { speaker: '客户', text: '目前并发不够用，想了解企业版扩容到 10 万 QPS 的价格。' },
            { speaker: '坐席', text: '好的，我整理扩容方案与报价，今天内邮件发您。' },
          ],
        },
        {
          id: 'c2', kind: 'email', title: '邮件发送', emoji: '📧', operator: '王坐席',
          when: '2026-06-17 16:30:30', metaPrefix: '发送人',
          summary: '收件邮箱: zhaomin@example.com | 状态: 发送成功 | 主题: 企业版扩容报价方案',
          emailLines: [
            { text: '赵女士，您好：', bold: true },
            { text: '附上开放平台企业版扩容方案与报价，供您评估。' },
            { text: '套餐：企业版 · 10 万 QPS · 年付' },
            { text: '如需进一步沟通，可回复本邮件或预约商务通话。' },
            { text: '—— 讯飞商务支持', muted: true },
          ],
        },
      ],
      notifyRecords: [
        { id: 'n1', kind: 'transfer', title: '转办通知', receiver: '王坐席(商务)', when: '2026-06-17 11:02:50', channel: '站内信 + i讯飞', status: '已读', content: '商机工单已转办至您名下，请及时商务跟进。' },
        { id: 'n2', kind: 'accepted', title: '工单受理', receiver: '赵敏(客户)', when: '2026-06-17 11:02:30', channel: '邮件', status: '已送达', content: '您的商务咨询已受理，工单号:IFLYKF2026061711020422，商务将尽快与您联系。' },
      ],
      surveyRecords: [
        { id: 'v1', title: '转化跟进调研', sentAt: '2026-06-17 16:40:10', evaluated: false, linkLabel: '查看问卷', conclusion: '采购意向: 高 | 是否转化: 待跟进' },
      ],
      customerHistory: {
        customerName: '赵敏', totalCount: 3, processingCount: 1, closedCount: 2, complaintCount: 0,
        tickets: [
          { id: 'h1', no: 'IFLYKF2026060810050022', title: '开放平台企业版套餐咨询', status: '已关闭', statusColor: '#10B981', type: '商机', typeColor: C.商机, typeBgColor: bg(C.商机), channel: '邮件', date: '2026-06-08', summary: '咨询企业版套餐与并发额度，已发送报价。', isProcessing: false, isClosed: true, isComplaint: false },
          { id: 'h2', no: 'IFLYKF2026061711020422', title: 'API 调用返回 429 限流扩容', status: '处理中', statusColor: '#1A6FFF', type: '商机', typeColor: C.商机, typeBgColor: bg(C.商机), channel: '邮件', date: '2026-06-17', summary: '企业版扩容采购意向，商务报价跟进中。', isProcessing: true, isClosed: false, isComplaint: false },
        ],
      },
    },
  },

  // ===================== 建议 =====================
  建议: {
    detail: {
      demand: '建议智能门锁增加临时密码分享功能，便于访客临时使用。',
      insight: {
        inboundCount: 1, historyCount: 2, complaintCount: 0, sameTypeCount: 1, recent30Count: 2,
        dunningCount: 0, supplementCount: 0, relatedCount: 1,
      },
      aiInsight: {
        customerBrief: '个人用户，建议类反馈少',
        ticketBrief: '门锁临时密码诉求，已转产品评估',
        suggestion: '结案时告知评估进度',
      },
    },
    processDraft: {
      problemCause: '客户建议智能门锁 L1 增加临时密码 / 访客分享功能。',
      processResult: '已记录产品建议并提交产品组评估，纳入需求池跟踪。',
      processResultAttachments: [],
      qualityIsStandard: true,
      suggestCat1: '功能优化',
      suggestCat2: '稳定性',
      suggestAdopt: 'toRequirement',
    },
    tabData: {
      currentFlowNode: '工单处理',
      flowHistory: [
        { id: 'f1', title: '工单创建', operator: '李一线(客服)', when: '2026-06-17 14:20:08', desc: '客户来电提出产品建议，产品：智能门锁 L1，建议：增加临时密码分享' },
        { id: 'f2', title: '自动派单', operator: '系统自动', when: '2026-06-17 14:20:40', desc: '建议工单自动派发至：产品反馈组，处理人：王坐席' },
        { id: 'f3', title: '评估中', operator: '王坐席(产品反馈)', when: '2026-06-17 16:05:20', desc: '已记录建议并转产品组评估，纳入需求池', active: true },
      ],
      relatedTickets: [
        {
          no: 'IFLYKF2026060510080033', title: '智能门锁 App 推送建议', status: '已完成',
          statusColor: '#10B981', type: '建议', typeColor: C.建议, typeBgColor: bg(C.建议),
          createdAt: '06-05 10:08', builder: '李一线', demand: '建议开锁记录支持 App 实时推送',
          processRecords: [{ who: '王坐席', when: '06-06 09:30', content: '已采纳并纳入下个版本迭代计划' }],
        },
      ],
      supplementRecords: [],
      dunningRecords: [],
      contactRecords: [
        {
          id: 'c1', kind: 'sms', title: '短信发送', emoji: '💬', operator: '王坐席',
          when: '2026-06-17 14:25:30', summary: '接收号码: 136 0000 0006 | 状态: 发送成功 | 模板: 建议反馈致谢',
          smsContent: '【讯飞客服】感谢您的宝贵建议，我们已记录并提交产品团队评估，后续进展将及时同步。',
        },
        {
          id: 'c2', kind: 'email', title: '邮件发送', emoji: '📧', operator: '系统',
          when: '2026-06-17 14:22:30', metaPrefix: '发送人',
          summary: '收件邮箱: zhoujie@example.com | 状态: 发送成功 | 主题: 建议受理通知',
          emailLines: [
            { text: '周先生，您好：', bold: true },
            { text: '您提出的关于智能门锁临时密码分享的建议已受理。' },
            { text: '我们已转交产品团队评估，纳入需求池跟踪。' },
            { text: '感谢您对讯飞产品的关注与支持。' },
            { text: '—— 讯飞产品反馈中心', muted: true },
          ],
        },
      ],
      notifyRecords: [
        { id: 'n1', kind: 'transfer', title: '转办通知', receiver: '王坐席(产品反馈)', when: '2026-06-17 14:20:50', channel: '站内信 + i讯飞', status: '已读', content: '建议工单已转办至您名下，请记录并转产品评估。' },
        { id: 'n2', kind: 'accepted', title: '工单受理', receiver: '周杰(客户)', when: '2026-06-17 14:20:30', channel: '短信 + 邮件', status: '已送达', content: '您的建议已受理，工单号:IFLYKF2026061714200522，感谢您的反馈。' },
      ],
      surveyRecords: [
        { id: 'v1', title: '建议采纳调研', sentAt: '2026-06-17 14:30:10', evaluated: true, linkLabel: '查看问卷', conclusion: '是否采纳: 转需求 | 客户满意: 满意' },
      ],
      customerHistory: {
        customerName: '周杰', totalCount: 2, processingCount: 1, closedCount: 1, complaintCount: 0,
        tickets: [
          { id: 'h1', no: 'IFLYKF2026060510080033', title: '智能门锁 App 推送建议', status: '已关闭', statusColor: '#10B981', type: '建议', typeColor: C.建议, typeBgColor: bg(C.建议), channel: '400呼入', date: '2026-06-05', summary: '建议开锁记录支持 App 推送，已采纳进迭代。', isProcessing: false, isClosed: true, isComplaint: false },
          { id: 'h2', no: 'IFLYKF2026061714200522', title: '预约上门安装智能门锁建议', status: '处理中', statusColor: '#1A6FFF', type: '建议', typeColor: C.建议, typeBgColor: bg(C.建议), channel: '电话', date: '2026-06-17', summary: '建议增加临时密码分享功能，转产品评估。', isProcessing: true, isClosed: false, isComplaint: false },
        ],
      },
    },
  },
};
