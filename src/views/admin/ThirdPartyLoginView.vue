<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined, DeleteOutlined, SafetyOutlined } from '@ant-design/icons-vue';

// 安全与审计·第三方登录（PRD-44）：身份源/SSO/账号绑定/登录策略 + 登录日志 + 数据生命周期。
const tab = ref('idp');

/* 身份源 */
const idps = ref([
  { id: 1, name: '企业微信', protocol: 'OAuth2', appId: 'ww3a8f...c1', auto: true, status: true },
  { id: 2, name: '钉钉', protocol: 'OAuth2', appId: 'dingab...9z', auto: true, status: true },
  { id: 3, name: '飞书', protocol: 'OAuth2', appId: 'cli_a8...7x', auto: false, status: true },
  { id: 4, name: '企业 LDAP', protocol: 'LDAP', appId: 'ldap://corp.local', auto: false, status: false },
]);
const idpCols = [
  { title: '身份源', dataIndex: 'name', key: 'name', width: 150 },
  { title: '协议', dataIndex: 'protocol', key: 'protocol', width: 100 },
  { title: 'AppID / 地址', dataIndex: 'appId', key: 'appId' },
  { title: '自动建号', dataIndex: 'auto', key: 'auto', width: 100 },
  { title: '启用', dataIndex: 'status', key: 'status', width: 70 },
  { title: '操作', key: 'op', width: 110 },
];

/* SSO */
const sso = ref({ enabled: true, protocol: 'SAML 2.0', entityId: 'https://flowos.iflytek.com/sso', forceSso: false, sessionTtl: 480 });

/* 账号绑定 */
const bindings = ref([
  { user: '王芳', account: 'wangfang', idp: '企业微信', extId: 'wf_88231', boundAt: '2026-01-12' },
  { user: '李强', account: 'liqiang', idp: '钉钉', extId: 'lq_55102', boundAt: '2026-02-08' },
  { user: '陈静', account: 'chenjing', idp: '飞书', extId: 'cj_77445', boundAt: '2026-03-20' },
]);
const bindCols = [
  { title: '用户', dataIndex: 'user', key: 'user', width: 120 },
  { title: '账号', dataIndex: 'account', key: 'account', width: 140 },
  { title: '身份源', dataIndex: 'idp', key: 'idp', width: 130 },
  { title: '外部 ID', dataIndex: 'extId', key: 'extId', width: 160 },
  { title: '绑定时间', dataIndex: 'boundAt', key: 'boundAt', width: 130 },
  { title: '操作', key: 'op', width: 90 },
];

/* 登录策略 */
const policy = ref({
  pwdMinLen: 8, pwdComplexity: true, mfa: false, maxRetry: 5, lockMinutes: 30,
  ipWhitelist: false, sessionTimeout: 30,
});

/* 登录日志 */
const loginLogs = ref([
  { time: '2026-06-19 08:30', user: '王芳', idp: '企业微信', ip: '10.21.3.45', result: '成功', device: 'Chrome/Win' },
  { time: '2026-06-19 09:05', user: '李强', idp: '钉钉', ip: '10.21.3.88', result: '成功', device: 'Edge/Win' },
  { time: '2026-06-19 07:50', user: 'unknown', idp: '密码', ip: '203.0.113.7', result: '失败', device: 'curl' },
  { time: '2026-06-18 22:14', user: '吴婷', idp: '密码', ip: '10.21.4.12', result: '锁定', device: 'Chrome/Mac' },
]);
const loginCols = [
  { title: '时间', dataIndex: 'time', key: 'time', width: 160 },
  { title: '用户', dataIndex: 'user', key: 'user', width: 120 },
  { title: '登录方式', dataIndex: 'idp', key: 'idp', width: 110 },
  { title: 'IP', dataIndex: 'ip', key: 'ip', width: 140 },
  { title: '设备', dataIndex: 'device', key: 'device' },
  { title: '结果', dataIndex: 'result', key: 'result', width: 90 },
];
const LOGIN_TONE: Record<string, string> = { 成功: 'green', 失败: 'red', 锁定: 'orange' };

/* 数据生命周期 */
const lifecycle = ref([
  { entity: '已结案工单', retain: '3 年', archive: '冷存储', purge: '到期匿名化', status: true },
  { entity: '通话录音', retain: '1 年', archive: 'OSS 归档', purge: '到期删除', status: true },
  { entity: '操作审计日志', retain: '5 年', archive: '只读归档', purge: '不删除', status: true },
  { entity: '登录日志', retain: '180 天', archive: '—', purge: '到期删除', status: true },
  { entity: '客户联系记录', retain: '2 年', archive: '冷存储', purge: '到期匿名化', status: false },
]);
const lcCols = [
  { title: '数据实体', dataIndex: 'entity', key: 'entity', width: 160 },
  { title: '保留期', dataIndex: 'retain', key: 'retain', width: 110 },
  { title: '归档策略', dataIndex: 'archive', key: 'archive', width: 130 },
  { title: '到期处置', dataIndex: 'purge', key: 'purge' },
  { title: '启用', dataIndex: 'status', key: 'status', width: 70 },
];

function todo(t: string) { message.info(`「${t}」（演示）`); }
function delRow(arr: any, idx: number) { arr.value.splice(idx, 1); }
</script>

<template>
  <div class="tpl-login">
    <a-tabs v-model:activeKey="tab">
      <!-- 身份源 -->
      <a-tab-pane key="idp" tab="身份源">
        <div class="bar"><span class="tip">配置第三方身份提供方（OAuth2 / LDAP / SAML）</span><a-button type="primary" @click="todo('新增身份源')"><template #icon><PlusOutlined /></template>新增身份源</a-button></div>
        <a-table :columns="idpCols" :data-source="idps" row-key="id" :pagination="false" size="middle">
          <template #bodyCell="{ column, record, index }">
            <a-tag v-if="column.key === 'protocol'" color="blue">{{ record.protocol }}</a-tag>
            <code v-else-if="column.key === 'appId'" class="mono">{{ record.appId }}</code>
            <a-tag v-else-if="column.key === 'auto'" :color="record.auto ? 'green' : 'default'">{{ record.auto ? '开' : '关' }}</a-tag>
            <a-switch v-else-if="column.key === 'status'" v-model:checked="record.status" size="small" />
            <template v-else-if="column.key === 'op'"><a-button type="link" size="small" @click="todo('配置')">配置</a-button><DeleteOutlined class="op-ic danger" @click="delRow(idps, index)" /></template>
          </template>
        </a-table>
      </a-tab-pane>

      <!-- 单点登录 -->
      <a-tab-pane key="sso" tab="单点登录">
        <div class="card">
          <a-form layout="vertical" style="max-width: 560px">
            <a-form-item label="启用 SSO"><a-switch v-model:checked="sso.enabled" /></a-form-item>
            <a-form-item label="协议"><a-select v-model:value="sso.protocol" :options="['SAML 2.0','OIDC','CAS'].map((v)=>({value:v,label:v}))" /></a-form-item>
            <a-form-item label="Entity ID"><a-input v-model:value="sso.entityId" /></a-form-item>
            <a-form-item label="强制 SSO 登录"><a-switch v-model:checked="sso.forceSso" /><span class="hint">开启后禁用本地密码登录</span></a-form-item>
            <a-form-item label="会话有效期（分钟）"><a-input-number v-model:value="sso.sessionTtl" :min="30" :max="1440" /></a-form-item>
            <a-button type="primary" @click="todo('保存 SSO')">保存配置</a-button>
          </a-form>
        </div>
      </a-tab-pane>

      <!-- 账号绑定 -->
      <a-tab-pane key="binding" tab="账号绑定">
        <div class="bar"><span class="tip">本地账号与第三方身份的绑定关系</span></div>
        <a-table :columns="bindCols" :data-source="bindings" row-key="account" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <a-tag v-if="column.key === 'idp'" color="blue">{{ record.idp }}</a-tag>
            <code v-else-if="column.key === 'extId'" class="mono">{{ record.extId }}</code>
            <a-button v-else-if="column.key === 'op'" type="link" size="small" danger @click="todo('解绑')">解绑</a-button>
          </template>
        </a-table>
      </a-tab-pane>

      <!-- 登录策略 -->
      <a-tab-pane key="policy" tab="登录策略">
        <div class="card">
          <div class="policy-grid">
            <div class="pg-item"><label>密码最小长度</label><a-input-number v-model:value="policy.pwdMinLen" :min="6" :max="32" /></div>
            <div class="pg-item"><label>密码复杂度要求</label><a-switch v-model:checked="policy.pwdComplexity" /></div>
            <div class="pg-item"><label>双因素认证 (MFA)</label><a-switch v-model:checked="policy.mfa" /></div>
            <div class="pg-item"><label>最大失败次数</label><a-input-number v-model:value="policy.maxRetry" :min="3" :max="10" /></div>
            <div class="pg-item"><label>锁定时长（分钟）</label><a-input-number v-model:value="policy.lockMinutes" :min="5" :max="120" /></div>
            <div class="pg-item"><label>IP 白名单</label><a-switch v-model:checked="policy.ipWhitelist" /></div>
            <div class="pg-item"><label>无操作超时（分钟）</label><a-input-number v-model:value="policy.sessionTimeout" :min="5" :max="120" /></div>
          </div>
          <a-button type="primary" style="margin-top: 20px" @click="todo('保存策略')"><template #icon><SafetyOutlined /></template>保存登录策略</a-button>
        </div>
      </a-tab-pane>

      <!-- 登录日志 -->
      <a-tab-pane key="loginlog" tab="登录日志">
        <div class="bar"><span class="tip">登录/登出/失败/锁定记录，区别于操作审计日志</span><a-button @click="todo('导出')">导出 CSV</a-button></div>
        <a-table :columns="loginCols" :data-source="loginLogs" row-key="time" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <code v-if="column.key === 'ip'" class="mono">{{ record.ip }}</code>
            <a-tag v-else-if="column.key === 'result'" :color="LOGIN_TONE[record.result]">{{ record.result }}</a-tag>
          </template>
        </a-table>
      </a-tab-pane>

      <!-- 数据生命周期 -->
      <a-tab-pane key="lifecycle" tab="数据生命周期">
        <div class="bar"><span class="tip">各类数据的保留期、归档与到期处置策略（合规）</span><a-button type="primary" @click="todo('新增策略')"><template #icon><PlusOutlined /></template>新增策略</a-button></div>
        <a-table :columns="lcCols" :data-source="lifecycle" row-key="entity" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <b v-if="column.key === 'entity'">{{ record.entity }}</b>
            <a-tag v-else-if="column.key === 'purge'" :color="record.purge.includes('删除') ? 'red' : record.purge.includes('匿名') ? 'orange' : 'default'">{{ record.purge }}</a-tag>
            <a-switch v-else-if="column.key === 'status'" v-model:checked="record.status" size="small" />
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<style scoped>
.tpl-login { padding: 8px 24px 24px; }
.bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.tip { font-size: 13px; color: #6b7280; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px 24px; }
.hint { font-size: 12px; color: #9ca3af; margin-left: 10px; }
.policy-grid { display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap: 18px 40px; max-width: 720px; }
.pg-item { display: flex; align-items: center; justify-content: space-between; }
.pg-item label { font-size: 13px; color: #374151; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; color: #6b7280; }
.op-ic { color: #ef4444; cursor: pointer; margin-left: 8px; } .op-ic:hover { opacity: 0.7; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
