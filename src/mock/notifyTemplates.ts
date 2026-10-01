// 工单处理页·联系客户的短信/邮件模板（原型 mock）。
// 占位符与后台「消息中心」(MessageCenterView) 一致：${no} 工单号 / ${name} 客户 / ${product} 产品 / ${agent} 坐席。

/**
 * 短信模板类型：
 * - plain          普通文本
 * - attachSend     附件下发 —— 坐席选文件发给客户，客户点短信里的下载链接取件
 * - attachRequest  附件上传邀请 —— 短信带上传链接（绑本单工单ID），客户上传后回流「附件历史」
 * 附件上传服务由容联云提供，链接生成/有效期/数量与大小上限均在容联云侧。
 * 链接有效期当前为 30 分钟，由容联云侧配置。
 */
export type SmsTemplateKind = 'plain' | 'attachSend' | 'attachRequest';

export const SMS_TEMPLATE_KIND_LABEL: Record<SmsTemplateKind, string> = {
  plain: '普通',
  attachSend: '附件下发',
  attachRequest: '附件上传邀请',
};

export interface SmsTemplate {
  code: string;
  name: string;
  kind: SmsTemplateKind;
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
    kind: 'plain',
    content: '尊敬的${name}，您的工单${no}（${product}）正在加紧处理中，我们会尽快为您解决，感谢您的耐心等待。【科大讯飞】',
  },
  {
    code: 'SMS_NEED_INFO',
    name: '请补充信息',
    kind: 'plain',
    content: '尊敬的${name}，您的工单${no}需补充相关信息以便继续处理，请留意稍后来电或回复本短信，谢谢。【科大讯飞】',
  },
  {
    code: 'SMS_ATTACH_REQUEST',
    name: '请上传材料',
    kind: 'attachRequest',
    content: '【科大讯飞】尊敬的客户您好，为了尽快解决您的问题，您可以通过以下链接：${link} 上传您的问题截图或附件，本链接30分钟内有效。收到后会尽快为您处理，谢谢！',
  },
  {
    code: 'SMS_ATTACH_SEND',
    name: '材料下发',
    kind: 'attachSend',
    content: '尊敬的${name}，关于您的工单${no}（${product}），现将相关材料发送给您，请点击短信内链接查收。【科大讯飞】',
  },
  {
    code: 'SMS_WO_DONE',
    name: '处理完成通知',
    kind: 'plain',
    content: '尊敬的${name}，您的工单${no}已处理完成，如仍有疑问请回拨客服热线，祝您生活愉快。【科大讯飞】',
  },
  {
    code: 'SMS_VISIT',
    name: '满意度回访',
    kind: 'plain',
    content: '尊敬的${name}，关于工单${no}的本次服务，诚邀您参与满意度评价，您的反馈是我们改进的动力，感谢支持。【科大讯飞】',
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

const UPLOAD_SHORT_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * 附件上传链接为容联云生成的短链接（https://kfaichat.iflytek.com/f/{6位短码}），坐席不可编辑。
 * 短码由容联云侧生成、与工单号无关；原型内按工单号派生短码，保证同一工单号每次得到同一链接。
 */
export function uploadLinkOf(no: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < no.length; i += 1) {
    h = ((h ^ no.charCodeAt(i)) * 0x01000193) >>> 0;
  }
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += UPLOAD_SHORT_CODE_CHARS.charAt(h % UPLOAD_SHORT_CODE_CHARS.length);
    h = (Math.floor(h / UPLOAD_SHORT_CODE_CHARS.length) + 0x9e3779b9) >>> 0;
  }
  return `https://kfaichat.iflytek.com/f/${code}`;
}

/** 用工单上下文替换模板占位符 */
export function fillTemplate(tpl: string, ctx: TemplateContext): string {
  return tpl
    .replaceAll('${no}', ctx.no)
    .replaceAll('${name}', ctx.name || '客户')
    .replaceAll('${product}', ctx.product || '相关产品')
    .replaceAll('${agent}', ctx.agent || '')
    .replaceAll('${link}', uploadLinkOf(ctx.no));
}
