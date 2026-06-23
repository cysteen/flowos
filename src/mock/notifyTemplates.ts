// 工单处理页·联系客户的短信/邮件模板（原型 mock）。
// 占位符与后台「消息中心」(MessageCenterView) 一致：${no} 工单号 / ${name} 客户 / ${product} 产品 / ${agent} 坐席。

export interface SmsTemplate {
  code: string;
  name: string;
  content: string;
}

export interface MailTemplate {
  code: string;
  name: string;
  subject: string;
  body: string;
}

export const SMS_TEMPLATES: SmsTemplate[] = [
  {
    code: 'SMS_WO_PROGRESS',
    name: '处理进展通知',
    content: '尊敬的${name}，您的工单${no}（${product}）正在加紧处理中，我们会尽快为您解决，感谢您的耐心等待。【讯飞客服】',
  },
  {
    code: 'SMS_NEED_INFO',
    name: '请补充信息',
    content: '尊敬的${name}，您的工单${no}需补充相关信息以便继续处理，请留意稍后来电或回复本短信，谢谢。【讯飞客服】',
  },
  {
    code: 'SMS_WO_DONE',
    name: '处理完成通知',
    content: '尊敬的${name}，您的工单${no}已处理完成，如仍有疑问请回拨客服热线，祝您生活愉快。【讯飞客服】',
  },
  {
    code: 'SMS_VISIT',
    name: '满意度回访',
    content: '尊敬的${name}，关于工单${no}的本次服务，诚邀您参与满意度评价，您的反馈是我们改进的动力，感谢支持。【讯飞客服】',
  },
];

export const MAIL_TEMPLATES: MailTemplate[] = [
  {
    code: 'MAIL_WO_SUMMARY',
    name: '工单处理摘要',
    subject: '【工单${no}】处理结果说明',
    body: '尊敬的${name}：\n\n您好！关于您反馈的「${product}」相关问题（工单号 ${no}），我们已完成处理，现将处理结果说明如下：\n\n1. 问题描述：\n2. 处理过程：\n3. 处理结论：\n\n如对处理结果有任何疑问，欢迎随时与我们联系。\n\n此致\n讯飞客服中心 ${agent}',
  },
  {
    code: 'MAIL_WO_PLAN',
    name: '处理方案告知',
    subject: '【工单${no}】处理方案与后续安排',
    body: '尊敬的${name}：\n\n您好！针对您反馈的「${product}」问题（工单号 ${no}），我们制定了如下处理方案：\n\n· 方案概述：\n· 预计时间：\n· 需您配合：\n\n感谢您的理解与配合。\n\n此致\n讯飞客服中心 ${agent}',
  },
  {
    code: 'MAIL_NEED_INFO',
    name: '请补充材料',
    subject: '【工单${no}】请补充相关材料',
    body: '尊敬的${name}：\n\n您好！为尽快处理您的工单（${no}·${product}），还需您补充以下材料：\n\n1. \n2. \n\n请于回信中附上，谢谢配合。\n\n此致\n讯飞客服中心 ${agent}',
  },
];

export interface TemplateContext {
  no: string;
  name: string;
  product: string;
  agent: string;
}

/** 用工单上下文替换模板占位符 */
export function fillTemplate(tpl: string, ctx: TemplateContext): string {
  return tpl
    .replaceAll('${no}', ctx.no)
    .replaceAll('${name}', ctx.name || '客户')
    .replaceAll('${product}', ctx.product || '相关产品')
    .replaceAll('${agent}', ctx.agent || '');
}
