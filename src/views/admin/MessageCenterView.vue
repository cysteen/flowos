<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue';

// 消息中心（PRD-30）：短信(渠道/模板/日志) · 邮件(账号/模板/记录) · 站内信(模板/记录) · 通知公告。
const channel = ref('sms');
const smsSub = ref('channel');
const mailSub = ref('account');
const inSub = ref('template');

/* 短信 */
const smsChannels = ref([
  { id: 1, name: '阿里云短信', sign: '【讯飞客服】', daily: '50000', used: 12340, status: true },
  { id: 2, name: '腾讯云短信', sign: '【讯飞售后】', daily: '20000', used: 3201, status: true },
  { id: 3, name: '备用通道', sign: '【讯飞】', daily: '10000', used: 0, status: false },
]);
const smsTpls = ref([
  { id: 1, code: 'SMS_WO_CREATE', name: '工单创建通知', content: '您的工单${no}已创建，我们将尽快处理', status: '已审核' },
  { id: 2, code: 'SMS_WO_DONE', name: '工单结案通知', content: '您的工单${no}已处理完成，感谢您的耐心', status: '已审核' },
  { id: 3, code: 'SMS_SLA_ALERT', name: '超时提醒', content: '工单${no}即将超时，请及时处理', status: '待审核' },
]);
const smsLogs = ref([
  { time: '2026-06-19 10:21', phone: '138****2046', tpl: '工单创建通知', result: '成功' },
  { time: '2026-06-19 10:15', phone: '139****8821', tpl: '工单结案通知', result: '成功' },
  { time: '2026-06-19 09:40', phone: '137****5510', tpl: '超时提醒', result: '失败' },
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

/* 公告 */
const notices = ref([
  { id: 1, title: '6月系统升级通知', scope: '全员', publish: '2026-06-15', status: '已发布', top: true },
  { id: 2, title: '投诉处理规范更新', scope: '一线客服部', publish: '2026-06-10', status: '已发布', top: false },
  { id: 3, title: '端午值班安排', scope: '全员', publish: '2026-06-19', status: '草稿', top: false },
]);

const RESULT_TONE: Record<string, string> = { 成功: 'green', 失败: 'red' };
const AUDIT_TONE: Record<string, string> = { 已审核: 'green', 待审核: 'orange' };
function todo(t: string) { message.info(`「${t}」（演示）`); }
function delRow(arr: any, id: number) { const i = arr.value.findIndex((x: any) => x.id === id); if (i >= 0) arr.value.splice(i, 1); }
</script>

<template>
  <div class="msg-center">
    <a-tabs v-model:activeKey="channel">
      <!-- 短信 -->
      <a-tab-pane key="sms" tab="短信">
        <a-segmented v-model:value="smsSub" :options="[{value:'channel',label:'渠道'},{value:'template',label:'模板'},{value:'log',label:'发送日志'}]" style="margin-bottom: 16px" />
        <template v-if="smsSub === 'channel'">
          <div class="bar"><span class="tip">短信通道与签名配置，含日发送配额</span><a-button type="primary" @click="todo('新增渠道')"><template #icon><PlusOutlined /></template>新增渠道</a-button></div>
          <a-table :columns="[{title:'渠道名称',dataIndex:'name'},{title:'签名',dataIndex:'sign',width:140},{title:'日配额',dataIndex:'daily',width:120},{title:'今日已用',dataIndex:'used',key:'used',width:120},{title:'启用',dataIndex:'status',key:'status',width:80}]" :data-source="smsChannels" row-key="id" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <span v-if="column.key === 'used'"><b>{{ record.used.toLocaleString() }}</b></span>
              <a-switch v-else-if="column.key === 'status'" v-model:checked="record.status" size="small" />
            </template>
          </a-table>
        </template>
        <template v-else-if="smsSub === 'template'">
          <div class="bar"><span class="tip">短信模板需运营商审核后方可发送</span><a-button type="primary" @click="todo('新增模板')"><template #icon><PlusOutlined /></template>新增模板</a-button></div>
          <a-table :columns="[{title:'模板编码',dataIndex:'code',key:'code',width:170},{title:'名称',dataIndex:'name',width:140},{title:'内容',dataIndex:'content'},{title:'状态',dataIndex:'status',key:'status',width:90},{title:'操作',key:'op',width:90}]" :data-source="smsTpls" row-key="id" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <code v-if="column.key === 'code'" class="mono">{{ record.code }}</code>
              <a-tag v-else-if="column.key === 'status'" :color="AUDIT_TONE[record.status]">{{ record.status }}</a-tag>
              <template v-else-if="column.key === 'op'"><EditOutlined class="op-ic" @click="todo('编辑')" /><DeleteOutlined class="op-ic danger" @click="delRow(smsTpls, record.id)" /></template>
            </template>
          </a-table>
        </template>
        <template v-else>
          <a-table :columns="[{title:'时间',dataIndex:'time',width:160},{title:'号码',dataIndex:'phone',width:140},{title:'模板',dataIndex:'tpl'},{title:'结果',dataIndex:'result',key:'result',width:90}]" :data-source="smsLogs" row-key="time" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }"><a-tag v-if="column.key === 'result'" :color="RESULT_TONE[record.result]">{{ record.result }}</a-tag></template>
          </a-table>
        </template>
      </a-tab-pane>

      <!-- 邮件 -->
      <a-tab-pane key="mail" tab="邮件">
        <a-segmented v-model:value="mailSub" :options="[{value:'account',label:'账号'},{value:'template',label:'模板'},{value:'log',label:'发送记录'}]" style="margin-bottom: 16px" />
        <template v-if="mailSub === 'account'">
          <div class="bar"><span class="tip">发件邮箱与 SMTP 配置</span><a-button type="primary" @click="todo('新增账号')"><template #icon><PlusOutlined /></template>新增账号</a-button></div>
          <a-table :columns="[{title:'账号名',dataIndex:'name',width:140},{title:'邮箱地址',dataIndex:'addr'},{title:'SMTP',dataIndex:'smtp',width:220},{title:'启用',dataIndex:'status',key:'status',width:80}]" :data-source="mailAccounts" row-key="id" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }"><a-switch v-if="column.key === 'status'" v-model:checked="record.status" size="small" /></template>
          </a-table>
        </template>
        <template v-else-if="mailSub === 'template'">
          <div class="bar"><span class="tip">支持 HTML 富文本邮件模板</span><a-button type="primary" @click="todo('新增模板')"><template #icon><PlusOutlined /></template>新增模板</a-button></div>
          <a-table :columns="[{title:'模板编码',dataIndex:'code',key:'code',width:200},{title:'名称',dataIndex:'name',width:160},{title:'邮件主题',dataIndex:'subject'},{title:'状态',dataIndex:'status',key:'status',width:90}]" :data-source="mailTpls" row-key="id" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <code v-if="column.key === 'code'" class="mono">{{ record.code }}</code>
              <a-tag v-else-if="column.key === 'status'" :color="AUDIT_TONE[record.status]">{{ record.status }}</a-tag>
            </template>
          </a-table>
        </template>
        <template v-else>
          <a-table :columns="[{title:'时间',dataIndex:'time',width:160},{title:'收件人',dataIndex:'to',width:180},{title:'模板',dataIndex:'tpl'},{title:'结果',dataIndex:'result',key:'result',width:90}]" :data-source="mailLogs" row-key="time" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }"><a-tag v-if="column.key === 'result'" :color="RESULT_TONE[record.result]">{{ record.result }}</a-tag></template>
          </a-table>
        </template>
      </a-tab-pane>

      <!-- 站内信 -->
      <a-tab-pane key="inapp" tab="站内信">
        <a-segmented v-model:value="inSub" :options="[{value:'template',label:'模板'},{value:'log',label:'发送记录'}]" style="margin-bottom: 16px" />
        <template v-if="inSub === 'template'">
          <div class="bar"><span class="tip">系统内通知模板（工单指派、@提及、审批提醒等）</span><a-button type="primary" @click="todo('新增模板')"><template #icon><PlusOutlined /></template>新增模板</a-button></div>
          <a-table :columns="[{title:'模板编码',dataIndex:'code',key:'code',width:170},{title:'名称',dataIndex:'name',width:140},{title:'内容',dataIndex:'content'},{title:'状态',dataIndex:'status',key:'status',width:90}]" :data-source="inTpls" row-key="id" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }">
              <code v-if="column.key === 'code'" class="mono">{{ record.code }}</code>
              <a-tag v-else-if="column.key === 'status'" :color="AUDIT_TONE[record.status]">{{ record.status }}</a-tag>
            </template>
          </a-table>
        </template>
        <template v-else>
          <a-table :columns="[{title:'时间',dataIndex:'time',width:160},{title:'接收人',dataIndex:'to',width:140},{title:'模板',dataIndex:'tpl'},{title:'已读',dataIndex:'read',key:'read',width:90}]" :data-source="inLogs" row-key="time" :pagination="false" size="middle">
            <template #bodyCell="{ column, record }"><a-tag v-if="column.key === 'read'" :color="record.read ? 'green' : 'orange'">{{ record.read ? '已读' : '未读' }}</a-tag></template>
          </a-table>
        </template>
      </a-tab-pane>

      <!-- 通知公告 -->
      <a-tab-pane key="notice" tab="通知公告">
        <div class="bar"><span class="tip">面向坐席/班组发布的运营公告</span><a-button type="primary" @click="todo('发布公告')"><template #icon><PlusOutlined /></template>发布公告</a-button></div>
        <a-table :columns="[{title:'标题',dataIndex:'title',key:'title'},{title:'范围',dataIndex:'scope',width:140},{title:'发布日期',dataIndex:'publish',width:130},{title:'状态',dataIndex:'status',key:'status',width:90},{title:'操作',key:'op',width:120}]" :data-source="notices" row-key="id" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'title'"><a-tag v-if="record.top" color="red">置顶</a-tag>{{ record.title }}</span>
            <a-tag v-else-if="column.key === 'status'" :color="record.status === '已发布' ? 'green' : 'default'">{{ record.status }}</a-tag>
            <template v-else-if="column.key === 'op'">
              <a-button type="link" size="small" @click="todo('编辑')">编辑</a-button>
              <DeleteOutlined class="op-ic danger" @click="delRow(notices, record.id)" />
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<style scoped>
.msg-center { padding: 8px 24px 24px; }
.bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.tip { font-size: 13px; color: #6b7280; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; color: #0550ae; }
.op-ic { color: #6b7280; cursor: pointer; margin-right: 10px; } .op-ic.danger { color: #ef4444; } .op-ic:hover { opacity: 0.7; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
