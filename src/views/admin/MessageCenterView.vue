<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue';
import { stdPagination } from '@/config/adminUi';

// 消息中心（PRD-30）：短信(渠道/模板/日志) · 邮件(账号/模板/记录) · 站内信(模板/记录) · 通知公告。
const channel = ref('sms');
const smsSub = ref('channel');
const mailSub = ref('account');
const inSub = ref('template');
const imSub = ref('app');

/* 短信 */
const smsChannels = ref([
  { id: 1, name: '阿里云短信', sign: '【讯飞客服】', daily: '50000', used: 12340, status: true },
  { id: 2, name: '腾讯云短信', sign: '【讯飞售后】', daily: '20000', used: 3201, status: true },
  { id: 3, name: '备用通道', sign: '【讯飞】', daily: '10000', used: 0, status: false },
]);
const smsTpls = ref([
  { id: 1, channelId: 1, code: 'SMS_WO_CREATE', name: '工单创建通知', content: '您的工单${no}已创建，我们将尽快处理', status: '已审核' },
  { id: 2, channelId: 1, code: 'SMS_WO_DONE', name: '工单结案通知', content: '您的工单${no}已处理完成，感谢您的耐心', status: '已审核' },
  { id: 3, channelId: 2, code: 'SMS_SLA_ALERT', name: '超时提醒', content: '工单${no}即将超时，请及时处理', status: '待审核' },
]);
interface SmsLog { time: string; phone: string; tpl: string; result: string; channel?: string; content?: string; failReason?: string; }
const smsLogs = ref<SmsLog[]>([
  { time: '2026-06-19 10:21', phone: '138****2046', tpl: '工单创建通知', result: '成功', channel: '阿里云短信', content: '【讯飞客服】您的工单WO-001已创建，我们将尽快处理' },
  { time: '2026-06-19 10:15', phone: '139****8821', tpl: '工单结案通知', result: '成功', channel: '阿里云短信', content: '【讯飞客服】您的工单WO-002已处理完成，感谢您的耐心' },
  { time: '2026-06-19 09:40', phone: '137****5510', tpl: '超时提醒', result: '失败', channel: '腾讯云短信', content: '【讯飞售后】工单WO-003即将超时，请及时处理', failReason: '号码停机' },
]);

/* 邮件 */
const mailAccounts = ref([
  { id: 1, name: '客服邮箱', addr: 'service@iflytek.com', smtp: 'smtp.iflytek.com:465', status: true },
  { id: 2, name: '售后邮箱', addr: 'aftersale@iflytek.com', smtp: 'smtp.iflytek.com:465', status: true },
]);
const mailTpls = ref([
  { id: 1, code: 'MAIL_WO_SUMMARY', name: '工单处理摘要', subject: '【工单${no}】处理结果', status: '已审核' },
  { id: 2, code: 'MAIL_SURVEY', name: '满意度调研', subject: '邀您评价本次服务', status: '已审核' },
]);
const mailLogs = ref([
  { time: '2026-06-19 09:30', to: 'zhang@qq.com', tpl: '工单处理摘要', result: '成功' },
  { time: '2026-06-18 16:20', to: 'li@163.com', tpl: '满意度调研', result: '成功' },
]);

/* 站内信 */
const inTpls = ref([
  { id: 1, code: 'IN_ASSIGN', name: '工单指派', content: '您有新工单${no}待处理', status: '已审核' },
  { id: 2, code: 'IN_MENTION', name: '@提及', content: '${user}在工单${no}中@了您', status: '已审核' },
  { id: 3, code: 'IN_APPROVAL', name: '审批提醒', content: '您有审批任务待处理', status: '已审核' },
]);
const inLogs = ref([
  { time: '2026-06-19 10:22', to: '李强', tpl: '工单指派', read: true },
  { time: '2026-06-19 10:05', to: '王芳', tpl: '审批提醒', read: false },
]);

/* IM 即时消息（企业 IM 机器人/应用推送：i讯飞 / 企业微信 / 飞书） */
const imApps = ref([
  { id: 1, name: 'i讯飞机器人', imType: 'i讯飞', robot: 'https://im.iflytek.com/robot/wo-notify', status: true },
  { id: 2, name: '企业微信-客服群', imType: '企业微信', robot: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=****', status: true },
  { id: 3, name: '飞书-二线协同', imType: '飞书', robot: 'https://open.feishu.cn/open-apis/bot/v2/hook/****', status: false },
]);
const imTpls = ref([
  { id: 1, code: 'IM_WO_ASSIGN', name: '工单派发提醒', content: '【工单派发】${no} 已分派给你，请及时处理', status: '已审核' },
  { id: 2, code: 'IM_SLA_ALERT', name: 'SLA 临期预警', content: '【SLA 预警】工单${no} 剩余 ${remain}，即将超时', status: '已审核' },
  { id: 3, code: 'IM_ESCALATE', name: '升级通知', content: '【升级】工单${no} 已升级至 ${target}，请关注', status: '待审核' },
]);
interface ImLog { time: string; to: string; tpl: string; result: string; app?: string; content?: string; failReason?: string; }
const imLogs = ref<ImLog[]>([
  { time: '2026-06-19 10:24', to: '李强（二线处理组）', tpl: '工单派发提醒', result: '成功', app: 'i讯飞机器人', content: '【工单派发】WO-001 已分派给你，请及时处理' },
  { time: '2026-06-19 10:02', to: '客服值班群', tpl: 'SLA 临期预警', result: '成功', app: '企业微信-客服群', content: '【SLA 预警】工单WO-002 剩余 15 分钟，即将超时' },
  { time: '2026-06-19 09:35', to: '王芳（技术支持）', tpl: '升级通知', result: '失败', app: '飞书-二线协同', content: '【升级】工单WO-003 已升级至 二线技术支持组，请关注', failReason: '机器人未启用' },
]);

/* 公告 */
const notices = ref([
  { id: 1, title: '6月系统升级通知', scope: '全员', publish: '2026-06-15', status: '已发布', top: true },
  { id: 2, title: '投诉处理规范更新', scope: '一线客服部', publish: '2026-06-10', status: '已发布', top: false },
  { id: 3, title: '端午值班安排', scope: '全员', publish: '2026-06-19', status: '草稿', top: false },
]);

const RESULT_TONE: Record<string, string> = { 成功: 'green', 失败: 'red' };
const AUDIT_TONE: Record<string, string> = { 已审核: 'green', 待审核: 'orange' };

function nowStr() {
  return new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
}

function delRow(arr: { value: { id: number }[] }, id: number) {
  const i = arr.value.findIndex((x) => x.id === id);
  if (i >= 0) arr.value.splice(i, 1);
  message.success('已删除');
}

function confirmDel(title: string, content: string, onOk: () => void) {
  Modal.confirm({ title, content, okText: '删除', okType: 'danger', cancelText: '取消', onOk });
}

function onChannelStatusChange(record: { name: string; status: boolean }) {
  message.success(`渠道「${record.name}」已${record.status ? '启用' : '停用'}`);
}

function delSmsChannel(record: { id: number; name: string }) {
  const refs = smsTpls.value.filter((t) => t.channelId === record.id);
  if (refs.length) {
    Modal.warning({
      title: '无法删除',
      content: `该渠道已被 ${refs.length} 个短信模板引用，请先解绑或删除模板后再删渠道。`,
    });
    return;
  }
  confirmDel('删除短信渠道', `确认删除「${record.name}」？删除后不可恢复。`, () => delRow(smsChannels, record.id));
}

function testSmsChannel(record: { id: number; name: string; status: boolean }) {
  if (!record.status) {
    message.warning('渠道已停用，请先启用后再测试');
    return;
  }
  smsLogs.value.unshift({
    time: nowStr(),
    phone: '管理员手机',
    tpl: '连通性测试',
    result: '成功',
    channel: record.name,
    content: `${record.name} 渠道连通性测试短信`,
  });
  message.success(`测试短信已通过「${record.name}」发送，请查收并在发送日志中核对`);
}

function delSmsTpl(record: { id: number; name: string }) {
  confirmDel('删除短信模板', `确认删除模板「${record.name}」？删除后凡调用该编码的业务将发送失败。`, () => delRow(smsTpls, record.id));
}

function testSmsTpl(record: { name: string; content: string; status: string }) {
  if (record.status !== '已审核') {
    message.warning('模板尚未审核通过，无法发送测试');
    return;
  }
  smsLogs.value.unshift({
    time: nowStr(),
    phone: '管理员手机',
    tpl: record.name,
    result: '成功',
    content: record.content.replace('${no}', 'WO-TEST').replace('${name}', '测试客户'),
  });
  message.success(`测试短信「${record.name}」已发送`);
}

const logDetailOpen = ref(false);
const logDetail = ref<SmsLog | null>(null);
function openSmsLogDetail(record: SmsLog) {
  logDetail.value = record;
  logDetailOpen.value = true;
}

function resendSmsLog(record: SmsLog) {
  Modal.confirm({
    title: '重发短信',
    content: `确认向 ${record.phone} 重发「${record.tpl}」？将生成一条新的发送记录。`,
    okText: '重发',
    cancelText: '取消',
    onOk: () => {
      smsLogs.value.unshift({ ...record, time: nowStr(), result: '成功', failReason: undefined });
      message.success('重发成功，已写入发送日志');
    },
  });
}

function delMailAccount(record: { id: number; name: string }) {
  confirmDel('删除邮件账号', `确认删除「${record.name}」？`, () => delRow(mailAccounts, record.id));
}

function delMailTpl(record: { id: number; name: string }) {
  confirmDel('删除邮件模板', `确认删除「${record.name}」？`, () => delRow(mailTpls, record.id));
}

function delInTpl(record: { id: number; name: string }) {
  confirmDel('删除站内信模板', `确认删除「${record.name}」？`, () => delRow(inTpls, record.id));
}

function delImApp(record: { id: number; name: string }) {
  confirmDel('删除 IM 应用', `确认删除「${record.name}」？删除后走该应用的 IM 通知将无法送达。`, () => delRow(imApps, record.id));
}
function testImApp(record: { name: string; status: boolean }) {
  if (!record.status) { message.warning('应用已停用，请先启用后再测试'); return; }
  imLogs.value.unshift({ time: nowStr(), to: '管理员', tpl: '连通性测试', result: '成功', app: record.name, content: `${record.name} 连通性测试消息` });
  message.success(`测试消息已通过「${record.name}」发送，请在发送记录中核对`);
}
function delImTpl(record: { id: number; name: string }) {
  confirmDel('删除 IM 模板', `确认删除「${record.name}」？删除后凡调用该编码的业务将发送失败。`, () => delRow(imTpls, record.id));
}

// —— 统一的「新增/编辑」弹窗（schema 驱动，覆盖各子页实体）——
interface FieldSpec { k: string; l: string; req?: boolean; type?: 'text' | 'textarea'; }
type EntityKey = 'smsChannel' | 'smsTpl' | 'mailAccount' | 'mailTpl' | 'inTpl' | 'imApp' | 'imTpl' | 'notice';
const SCHEMAS: Record<EntityKey, { title: string; fields: FieldSpec[]; target: any; create: (f: any) => any }> = {
  smsChannel: { title: '短信渠道', fields: [{ k: 'name', l: '渠道名称', req: true }, { k: 'sign', l: '短信签名', req: true }, { k: 'daily', l: '日配额' }], target: smsChannels, create: (f) => ({ id: Date.now(), name: f.name, sign: f.sign, daily: f.daily || '0', used: 0, status: true }) },
  smsTpl: { title: '短信模板', fields: [{ k: 'code', l: '模板编码', req: true }, { k: 'name', l: '模板名称', req: true }, { k: 'content', l: '模板内容', req: true, type: 'textarea' }], target: smsTpls, create: (f) => ({ id: Date.now(), channelId: smsChannels.value.find((c) => c.status)?.id ?? smsChannels.value[0]?.id, code: f.code, name: f.name, content: f.content, status: '待审核' }) },
  mailAccount: { title: '邮件账号', fields: [{ k: 'name', l: '账号名', req: true }, { k: 'addr', l: '邮箱地址', req: true }, { k: 'smtp', l: 'SMTP' }], target: mailAccounts, create: (f) => ({ id: Date.now(), name: f.name, addr: f.addr, smtp: f.smtp || '', status: true }) },
  mailTpl: { title: '邮件模板', fields: [{ k: 'code', l: '模板编码', req: true }, { k: 'name', l: '模板名称', req: true }, { k: 'subject', l: '邮件主题', req: true }], target: mailTpls, create: (f) => ({ id: Date.now(), code: f.code, name: f.name, subject: f.subject, status: '待审核' }) },
  inTpl: { title: '站内信模板', fields: [{ k: 'code', l: '模板编码', req: true }, { k: 'name', l: '模板名称', req: true }, { k: 'content', l: '内容', req: true, type: 'textarea' }], target: inTpls, create: (f) => ({ id: Date.now(), code: f.code, name: f.name, content: f.content, status: '已审核' }) },
  imApp: { title: 'IM 应用', fields: [{ k: 'name', l: '应用名称', req: true }, { k: 'imType', l: 'IM 类型', req: true }, { k: 'robot', l: '机器人 Webhook' }], target: imApps, create: (f) => ({ id: Date.now(), name: f.name, imType: f.imType, robot: f.robot || '', status: true }) },
  imTpl: { title: 'IM 模板', fields: [{ k: 'code', l: '模板编码', req: true }, { k: 'name', l: '模板名称', req: true }, { k: 'content', l: '消息内容', req: true, type: 'textarea' }], target: imTpls, create: (f) => ({ id: Date.now(), code: f.code, name: f.name, content: f.content, status: '待审核' }) },
  notice: { title: '通知公告', fields: [{ k: 'title', l: '公告标题', req: true }, { k: 'scope', l: '发布范围' }], target: notices, create: (f) => ({ id: Date.now(), title: f.title, scope: f.scope || '全员', publish: '2026-06-21', status: '已发布', top: false }) },
};
const modalOpen = ref(false);
const modalType = ref<EntityKey>('smsChannel');
const editingId = ref<number | null>(null);
const ff = reactive<Record<string, any>>({});
const curSchema = computed(() => SCHEMAS[modalType.value]);
const modalTitle = computed(() => (editingId.value ? '编辑' : modalType.value === 'notice' ? '发布' : '新增') + curSchema.value.title);
function resetForm(record?: any) { Object.keys(ff).forEach((k) => delete ff[k]); curSchema.value.fields.forEach((fl) => (ff[fl.k] = record ? record[fl.k] ?? '' : '')); }
function openCreate(type: EntityKey) { modalType.value = type; editingId.value = null; resetForm(); modalOpen.value = true; }
function openEdit(type: EntityKey, record: any) { modalType.value = type; editingId.value = record.id; resetForm(record); modalOpen.value = true; }
function saveModal() {
  const s = curSchema.value;
  for (const fl of s.fields) { if (fl.req && !ff[fl.k]) { message.error('请填写必填项'); return; } }
  if (editingId.value) {
    const arr = s.target.value; const i = arr.findIndex((x: any) => x.id === editingId.value);
    if (i >= 0) arr[i] = { ...arr[i], ...ff };
    message.success('已更新');
  } else {
    s.target.value.unshift(s.create(ff));
    message.success(modalType.value === 'notice' ? '公告已发布' : `${s.title}已新增`);
  }
  modalOpen.value = false;
}
</script>

<template>
  <div class="msg-center">
    <div class="hub-panel">
    <a-tabs v-model:activeKey="channel">
      <!-- 短信 -->
      <a-tab-pane key="sms" tab="短信">
        <a-segmented v-model:value="smsSub" :options="[{value:'channel',label:'渠道'},{value:'template',label:'模板'},{value:'log',label:'发送日志'}]" style="margin-bottom: 16px" />
        <template v-if="smsSub === 'channel'">
          <div class="bar"><span class="tip">短信通道与签名配置，含日发送配额</span><a-button type="primary" @click="openCreate('smsChannel')"><template #icon><PlusOutlined /></template>新增渠道</a-button></div>
          <a-table :columns="[{title:'渠道名称',dataIndex:'name'},{title:'签名',dataIndex:'sign',width:140},{title:'日配额',dataIndex:'daily',width:120},{title:'今日已用',dataIndex:'used',key:'used',width:120},{title:'启用',dataIndex:'status',key:'status',width:80},{title:'操作',key:'op',width:180}]" :data-source="smsChannels" row-key="id" :pagination="stdPagination()" size="middle">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'used'"><b>{{ record.used.toLocaleString() }}</b></span>
              <a-switch v-else-if="column.key === 'status'" v-model:checked="record.status" size="small" @change="() => onChannelStatusChange(record)" />
              <template v-else-if="column.key === 'op'">
                <a-button type="link" size="small" @click="openEdit('smsChannel', record)">编辑</a-button>
                <a-button type="link" size="small" @click="testSmsChannel(record)">测试</a-button>
                <a-button type="link" size="small" danger @click="delSmsChannel(record)">删除</a-button>
              </template>
            </template>
          </a-table>
        </template>
        <template v-else-if="smsSub === 'template'">
          <div class="bar"><span class="tip">短信模板需运营商审核后方可发送</span><a-button type="primary" @click="openCreate('smsTpl')"><template #icon><PlusOutlined /></template>新增模板</a-button></div>
          <a-table :columns="[{title:'模板编码',dataIndex:'code',key:'code',width:170},{title:'名称',dataIndex:'name',width:140},{title:'内容',dataIndex:'content'},{title:'状态',dataIndex:'status',key:'status',width:90},{title:'操作',key:'op',width:160}]" :data-source="smsTpls" row-key="id" :pagination="stdPagination()" size="middle">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'code'">{{ record.code }}</span>
              <a-tag v-else-if="column.key === 'status'" :color="AUDIT_TONE[record.status]">{{ record.status }}</a-tag>
              <template v-else-if="column.key === 'op'">
                <a-button type="link" size="small" @click="openEdit('smsTpl', record)">编辑</a-button>
                <a-button type="link" size="small" @click="testSmsTpl(record)">测试</a-button>
                <a-button type="link" size="small" danger @click="delSmsTpl(record)">删除</a-button>
              </template>
            </template>
          </a-table>
        </template>
        <template v-else>
          <div class="bar"><span class="tip">只读发送流水；失败记录可重发（生成新日志）</span></div>
          <a-table :columns="[{title:'时间',dataIndex:'time',width:160},{title:'号码',dataIndex:'phone',width:140},{title:'模板',dataIndex:'tpl'},{title:'结果',dataIndex:'result',key:'result',width:90},{title:'操作',key:'op',width:120}]" :data-source="smsLogs" row-key="time" :pagination="stdPagination()" size="middle">
            <template #bodyCell="{ column, record }">
              <a-tag v-if="column.key === 'result'" :color="RESULT_TONE[record.result]">{{ record.result }}</a-tag>
              <template v-else-if="column.key === 'op'">
                <a-button type="link" size="small" @click="openSmsLogDetail(record)">详情</a-button>
                <a-button v-if="record.result === '失败'" type="link" size="small" @click="resendSmsLog(record)">重发</a-button>
              </template>
            </template>
          </a-table>
        </template>
      </a-tab-pane>

      <!-- 邮件 -->
      <a-tab-pane key="mail" tab="邮件">
        <a-segmented v-model:value="mailSub" :options="[{value:'account',label:'账号'},{value:'template',label:'模板'},{value:'log',label:'发送记录'}]" style="margin-bottom: 16px" />
        <template v-if="mailSub === 'account'">
          <div class="bar"><span class="tip">发件邮箱与 SMTP 配置</span><a-button type="primary" @click="openCreate('mailAccount')"><template #icon><PlusOutlined /></template>新增账号</a-button></div>
          <a-table :columns="[{title:'账号名',dataIndex:'name',width:140},{title:'邮箱地址',dataIndex:'addr'},{title:'SMTP',dataIndex:'smtp',width:220},{title:'启用',dataIndex:'status',key:'status',width:80},{title:'操作',key:'op',width:120}]" :data-source="mailAccounts" row-key="id" :pagination="stdPagination()" size="middle">
            <template #bodyCell="{ column, record }">
              <a-switch v-if="column.key === 'status'" v-model:checked="record.status" size="small" />
              <template v-else-if="column.key === 'op'">
                <a-button type="link" size="small" @click="openEdit('mailAccount', record)">编辑</a-button>
                <a-button type="link" size="small" danger @click="delMailAccount(record)">删除</a-button>
              </template>
            </template>
          </a-table>
        </template>
        <template v-else-if="mailSub === 'template'">
          <div class="bar"><span class="tip">支持 HTML 富文本邮件模板</span><a-button type="primary" @click="openCreate('mailTpl')"><template #icon><PlusOutlined /></template>新增模板</a-button></div>
          <a-table :columns="[{title:'模板编码',dataIndex:'code',key:'code',width:200},{title:'名称',dataIndex:'name',width:160},{title:'邮件主题',dataIndex:'subject'},{title:'状态',dataIndex:'status',key:'status',width:90},{title:'操作',key:'op',width:120}]" :data-source="mailTpls" row-key="id" :pagination="stdPagination()" size="middle">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'code'">{{ record.code }}</span>
              <a-tag v-else-if="column.key === 'status'" :color="AUDIT_TONE[record.status]">{{ record.status }}</a-tag>
              <template v-else-if="column.key === 'op'">
                <a-button type="link" size="small" @click="openEdit('mailTpl', record)">编辑</a-button>
                <a-button type="link" size="small" danger @click="delMailTpl(record)">删除</a-button>
              </template>
            </template>
          </a-table>
        </template>
        <template v-else>
          <a-table :columns="[{title:'时间',dataIndex:'time',width:160},{title:'收件人',dataIndex:'to',width:180},{title:'模板',dataIndex:'tpl'},{title:'结果',dataIndex:'result',key:'result',width:90}]" :data-source="mailLogs" row-key="time" :pagination="stdPagination()" size="middle">
            <template #bodyCell="{ column, record }"><a-tag v-if="column.key === 'result'" :color="RESULT_TONE[record.result]">{{ record.result }}</a-tag></template>
          </a-table>
        </template>
      </a-tab-pane>

      <!-- 站内信 -->
      <a-tab-pane key="inapp" tab="站内信">
        <a-segmented v-model:value="inSub" :options="[{value:'template',label:'模板'},{value:'log',label:'发送记录'}]" style="margin-bottom: 16px" />
        <template v-if="inSub === 'template'">
          <div class="bar"><span class="tip">系统内通知模板（工单指派、@提及、审批提醒等）</span><a-button type="primary" @click="openCreate('inTpl')"><template #icon><PlusOutlined /></template>新增模板</a-button></div>
          <a-table :columns="[{title:'模板编码',dataIndex:'code',key:'code',width:170},{title:'名称',dataIndex:'name',width:140},{title:'内容',dataIndex:'content'},{title:'状态',dataIndex:'status',key:'status',width:90},{title:'操作',key:'op',width:120}]" :data-source="inTpls" row-key="id" :pagination="stdPagination()" size="middle">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'code'">{{ record.code }}</span>
              <a-tag v-else-if="column.key === 'status'" :color="AUDIT_TONE[record.status]">{{ record.status }}</a-tag>
              <template v-else-if="column.key === 'op'">
                <a-button type="link" size="small" @click="openEdit('inTpl', record)">编辑</a-button>
                <a-button type="link" size="small" danger @click="delInTpl(record)">删除</a-button>
              </template>
            </template>
          </a-table>
        </template>
        <template v-else>
          <a-table :columns="[{title:'时间',dataIndex:'time',width:160},{title:'接收人',dataIndex:'to',width:140},{title:'模板',dataIndex:'tpl'},{title:'已读',dataIndex:'read',key:'read',width:90}]" :data-source="inLogs" row-key="time" :pagination="stdPagination()" size="middle">
            <template #bodyCell="{ column, record }"><a-tag v-if="column.key === 'read'" :color="record.read ? 'green' : 'orange'">{{ record.read ? '已读' : '未读' }}</a-tag></template>
          </a-table>
        </template>
      </a-tab-pane>

      <!-- IM 即时消息 -->
      <a-tab-pane key="im" tab="IM 消息">
        <a-segmented v-model:value="imSub" :options="[{value:'app',label:'应用'},{value:'template',label:'模板'},{value:'log',label:'发送记录'}]" style="margin-bottom: 16px" />
        <template v-if="imSub === 'app'">
          <div class="bar"><span class="tip">企业 IM 机器人/应用（i讯飞 / 企业微信 / 飞书）推送配置</span><a-button type="primary" @click="openCreate('imApp')"><template #icon><PlusOutlined /></template>新增应用</a-button></div>
          <a-table :columns="[{title:'应用名称',dataIndex:'name',width:180},{title:'IM 类型',dataIndex:'imType',key:'imType',width:120},{title:'机器人 Webhook',dataIndex:'robot'},{title:'启用',dataIndex:'status',key:'status',width:80},{title:'操作',key:'op',width:180}]" :data-source="imApps" row-key="id" :pagination="stdPagination()" size="middle">
            <template #bodyCell="{ column, record }">
              <a-tag v-if="column.key === 'imType'" color="blue">{{ record.imType }}</a-tag>
              <a-switch v-else-if="column.key === 'status'" v-model:checked="record.status" size="small" />
              <template v-else-if="column.key === 'op'">
                <a-button type="link" size="small" @click="openEdit('imApp', record)">编辑</a-button>
                <a-button type="link" size="small" @click="testImApp(record)">测试</a-button>
                <a-button type="link" size="small" danger @click="delImApp(record)">删除</a-button>
              </template>
            </template>
          </a-table>
        </template>
        <template v-else-if="imSub === 'template'">
          <div class="bar"><span class="tip">IM 通知模板（工单派发、SLA 预警、升级通知等）</span><a-button type="primary" @click="openCreate('imTpl')"><template #icon><PlusOutlined /></template>新增模板</a-button></div>
          <a-table :columns="[{title:'模板编码',dataIndex:'code',key:'code',width:170},{title:'名称',dataIndex:'name',width:140},{title:'消息内容',dataIndex:'content'},{title:'状态',dataIndex:'status',key:'status',width:90},{title:'操作',key:'op',width:120}]" :data-source="imTpls" row-key="id" :pagination="stdPagination()" size="middle">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'code'">{{ record.code }}</span>
              <a-tag v-else-if="column.key === 'status'" :color="AUDIT_TONE[record.status]">{{ record.status }}</a-tag>
              <template v-else-if="column.key === 'op'">
                <a-button type="link" size="small" @click="openEdit('imTpl', record)">编辑</a-button>
                <a-button type="link" size="small" danger @click="delImTpl(record)">删除</a-button>
              </template>
            </template>
          </a-table>
        </template>
        <template v-else>
          <div class="bar"><span class="tip">只读发送流水；失败记录含失败原因</span></div>
          <a-table :columns="[{title:'时间',dataIndex:'time',width:160},{title:'接收人/群',dataIndex:'to',width:180},{title:'模板',dataIndex:'tpl'},{title:'应用',dataIndex:'app',width:150},{title:'结果',dataIndex:'result',key:'result',width:90}]" :data-source="imLogs" row-key="time" :pagination="stdPagination()" size="middle">
            <template #bodyCell="{ column, record }">
              <a-tag v-if="column.key === 'result'" :color="RESULT_TONE[record.result]">{{ record.result }}</a-tag>
            </template>
          </a-table>
        </template>
      </a-tab-pane>

      <!-- 通知公告 -->
      <a-tab-pane key="notice" tab="通知公告">
        <div class="bar"><span class="tip">面向坐席/班组发布的运营公告</span><a-button type="primary" @click="openCreate('notice')"><template #icon><PlusOutlined /></template>发布公告</a-button></div>
        <a-table :columns="[{title:'标题',dataIndex:'title',key:'title'},{title:'范围',dataIndex:'scope',width:140},{title:'发布日期',dataIndex:'publish',width:130},{title:'状态',dataIndex:'status',key:'status',width:90},{title:'操作',key:'op',width:120}]" :data-source="notices" row-key="id" :pagination="stdPagination()" size="middle">
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'title'"><a-tag v-if="record.top" color="red">置顶</a-tag>{{ record.title }}</span>
            <a-tag v-else-if="column.key === 'status'" :color="record.status === '已发布' ? 'green' : 'default'">{{ record.status }}</a-tag>
            <template v-else-if="column.key === 'op'">
              <a-button type="link" size="small" @click="openEdit('notice', record)">编辑</a-button>
              <DeleteOutlined class="op-ic danger" @click="delRow(notices, record.id)" />
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>
    </div>

    <!-- 统一新增/编辑弹窗 -->
    <a-modal v-model:open="modalOpen" :title="modalTitle" :width="520" :ok-text="editingId ? '保存' : (modalType === 'notice' ? '发布' : '创建')" cancel-text="取消" @ok="saveModal">
      <a-form layout="vertical">
        <a-form-item v-for="fl in curSchema.fields" :key="fl.k" :label="fl.l" :required="fl.req">
          <a-textarea v-if="fl.type === 'textarea'" v-model:value="ff[fl.k]" :rows="3" :placeholder="`请输入${fl.l}`" />
          <a-input v-else v-model:value="ff[fl.k]" :placeholder="`请输入${fl.l}`" :disabled="!!editingId && fl.k === 'code'" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 短信日志详情 -->
    <a-modal v-model:open="logDetailOpen" title="短信发送详情" :width="560" :footer="null">
      <template v-if="logDetail">
        <a-descriptions bordered size="small" :column="1">
          <a-descriptions-item label="发送时间">{{ logDetail.time }}</a-descriptions-item>
          <a-descriptions-item label="接收号码">{{ logDetail.phone }}</a-descriptions-item>
          <a-descriptions-item label="模板">{{ logDetail.tpl }}</a-descriptions-item>
          <a-descriptions-item v-if="logDetail.channel" label="渠道">{{ logDetail.channel }}</a-descriptions-item>
          <a-descriptions-item label="发送状态"><a-tag :color="RESULT_TONE[logDetail.result]">{{ logDetail.result }}</a-tag></a-descriptions-item>
          <a-descriptions-item v-if="logDetail.failReason" label="失败原因">{{ logDetail.failReason }}</a-descriptions-item>
          <a-descriptions-item label="完整内容">{{ logDetail.content || '—' }}</a-descriptions-item>
        </a-descriptions>
        <div v-if="logDetail.result === '失败'" style="margin-top: 16px; text-align: right">
          <a-button type="primary" @click="resendSmsLog(logDetail); logDetailOpen = false">重发</a-button>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.msg-center { padding: 16px 20px 20px; background: var(--flowos-content-bg, #f9fafb); min-height: 100%; }
.hub-panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 24px 24px; }
.bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.tip { font-size: 13px; color: #6b7280; }
.op-ic { color: #6b7280; cursor: pointer; margin-right: 10px; } .op-ic.danger { color: #ef4444; } .op-ic:hover { opacity: 0.7; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
