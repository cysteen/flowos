<script setup lang="ts">
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  PlusOutlined, ApiOutlined, CheckCircleFilled, CloseCircleFilled, SyncOutlined,
  DeleteOutlined, CopyOutlined, EyeOutlined, EyeInvisibleOutlined, DownloadOutlined,
} from '@ant-design/icons-vue';

// 集成对接·连接器深化（PRD-86）：连接器/事件/Webhook/数据映射/API网关/SDK·密钥。
const activeTab = ref('connectors');

/* 连接器 */
interface Connector { id: string; name: string; type: string; icon: string; status: 'online' | 'error' | 'idle'; lastSync: string; }
const connectors = ref<Connector[]>([
  { id: 'c1', name: '企业微信', type: 'IM', icon: '💬', status: 'online', lastSync: '2026-06-19 10:20' },
  { id: 'c2', name: '飞书', type: 'IM', icon: '🪶', status: 'online', lastSync: '2026-06-19 10:18' },
  { id: 'c3', name: '金蝶 ERP', type: 'ERP', icon: '📦', status: 'error', lastSync: '2026-06-18 22:00' },
  { id: 'c4', name: '销售易 CRM', type: 'CRM', icon: '🤝', status: 'online', lastSync: '2026-06-19 09:55' },
  { id: 'c5', name: '12315 平台', type: '政务', icon: '🏛️', status: 'idle', lastSync: '2026-06-15 14:00' },
  { id: 'c6', name: '短信网关', type: '通讯', icon: '📱', status: 'online', lastSync: '2026-06-19 10:21' },
]);
const ST_MAP: Record<string, { tone: string; label: string; icon: any }> = {
  online: { tone: '#10b981', label: '已连接', icon: CheckCircleFilled },
  error: { tone: '#ef4444', label: '异常', icon: CloseCircleFilled },
  idle: { tone: '#9ca3af', label: '未启用', icon: SyncOutlined },
};
function testConn(c: Connector) { message.loading(`正在测试「${c.name}」连接…`, 1).then(() => message.success(`${c.name} 连接正常`)); }

const syncLogs = [
  { time: '2026-06-19 10:20', conn: '企业微信', action: '消息推送', result: '成功', detail: '12 条' },
  { time: '2026-06-19 10:18', conn: '飞书', action: '工单同步', result: '成功', detail: '3 条' },
  { time: '2026-06-18 22:00', conn: '金蝶 ERP', action: '订单拉取', result: '失败', detail: '超时(30s)' },
  { time: '2026-06-19 09:55', conn: '销售易 CRM', action: '客户同步', result: '成功', detail: '45 条' },
];
const logCols = [
  { title: '时间', dataIndex: 'time', key: 'time', width: 150 },
  { title: '连接器', dataIndex: 'conn', key: 'conn', width: 120 },
  { title: '动作', dataIndex: 'action', key: 'action', width: 120 },
  { title: '结果', dataIndex: 'result', key: 'result', width: 90 },
  { title: '详情', dataIndex: 'detail', key: 'detail' },
];

/* 事件订阅 */
const events = ref([
  { id: 1, event: 'ticket.created', desc: '工单创建', subs: 3, status: true },
  { id: 2, event: 'ticket.escalated', desc: '工单升级', subs: 2, status: true },
  { id: 3, event: 'ticket.closed', desc: '工单结案', subs: 4, status: true },
  { id: 4, event: 'sla.breached', desc: 'SLA 超时', subs: 1, status: false },
]);

/* Webhook */
const webhooks = ref([
  { id: 1, name: '飞书群通知', url: 'https://open.feishu.cn/webhook/xxx', event: 'ticket.escalated', secret: '已配置', status: true },
  { id: 2, name: 'ERP 回写', url: 'https://erp.internal/api/wo-callback', event: 'ticket.closed', secret: '已配置', status: true },
  { id: 3, name: '风控告警', url: 'https://risk.internal/alert', event: 'sla.breached', secret: '未配置', status: false },
]);
const whCols = [
  { title: '名称', dataIndex: 'name', key: 'name', width: 150 },
  { title: '回调地址', dataIndex: 'url', key: 'url' },
  { title: '触发事件', dataIndex: 'event', key: 'event', width: 160 },
  { title: '签名', dataIndex: 'secret', key: 'secret', width: 90 },
  { title: '启用', dataIndex: 'status', key: 'status', width: 70 },
  { title: '操作', key: 'op', width: 120 },
];

/* 数据映射 */
const mappings = ref([
  { src: 'crm.customer_name', dst: 'ticket.customer.name', transform: '直连' },
  { src: 'crm.vip_level', dst: 'ticket.customer.level', transform: 'VIP→VIP / 1→金牌' },
  { src: 'erp.order_no', dst: 'ticket.ext.orderNo', transform: '直连' },
  { src: 'erp.warranty_end', dst: 'ticket.product.warranty', transform: '日期格式化' },
]);
const mapCols = [
  { title: '来源字段', dataIndex: 'src', key: 'src' },
  { title: '', key: 'arrow', width: 50 },
  { title: '目标字段', dataIndex: 'dst', key: 'dst' },
  { title: '转换规则', dataIndex: 'transform', key: 'transform', width: 200 },
];

/* API 网关 */
const apis = ref([
  { path: '/api/v1/tickets', method: 'POST', auth: 'API Key', rate: '100/min', status: true },
  { path: '/api/v1/tickets/{id}', method: 'GET', auth: 'API Key', rate: '300/min', status: true },
  { path: '/api/v1/customers', method: 'GET', auth: 'OAuth2', rate: '200/min', status: true },
  { path: '/api/v1/webhooks/test', method: 'POST', auth: 'API Key', rate: '10/min', status: false },
]);
const METHOD_TONE: Record<string, string> = { GET: 'green', POST: 'blue', PUT: 'orange', DELETE: 'red' };
const apiCols = [
  { title: '路径', dataIndex: 'path', key: 'path' },
  { title: '方法', dataIndex: 'method', key: 'method', width: 90 },
  { title: '鉴权', dataIndex: 'auth', key: 'auth', width: 110 },
  { title: '限流', dataIndex: 'rate', key: 'rate', width: 110 },
  { title: '启用', dataIndex: 'status', key: 'status', width: 70 },
];

/* SDK & 密钥 */
const keys = ref([
  { id: 'k1', name: '生产环境密钥', key: 'sk_live_8f2a...c91d', created: '2026-01-12', lastUse: '2026-06-19', show: false },
  { id: 'k2', name: '测试环境密钥', key: 'sk_test_3b7e...a04f', created: '2026-03-05', lastUse: '2026-06-18', show: false },
]);
const SDKS = [
  { lang: 'Java', ver: 'v2.3.1', icon: '☕' },
  { lang: 'Python', ver: 'v2.3.0', icon: '🐍' },
  { lang: 'Node.js', ver: 'v2.3.1', icon: '🟢' },
  { lang: 'Go', ver: 'v2.2.4', icon: '🐹' },
];
function copyKey(k: any) { message.success('已复制密钥'); }
function todo(t: string) { message.info(`「${t}」（演示）`); }
</script>

<template>
  <div class="connector-hub">
    <a-tabs v-model:activeKey="activeTab">
      <!-- 连接器 -->
      <a-tab-pane key="connectors" tab="连接器">
        <div class="bar"><span class="tip">已接入 {{ connectors.length }} 个外部系统</span><a-button type="primary" @click="todo('新增连接器')"><template #icon><PlusOutlined /></template>新增连接器</a-button></div>
        <div class="conn-grid">
          <div v-for="c in connectors" :key="c.id" class="conn-card">
            <div class="cc-head">
              <span class="cc-emoji">{{ c.icon }}</span>
              <div class="cc-meta"><div class="cc-name">{{ c.name }}</div><a-tag>{{ c.type }}</a-tag></div>
              <span class="cc-st" :style="{ color: ST_MAP[c.status].tone }"><component :is="ST_MAP[c.status].icon" /> {{ ST_MAP[c.status].label }}</span>
            </div>
            <div class="cc-sync">最近同步：{{ c.lastSync }}</div>
            <div class="cc-acts">
              <a-button size="small" @click="testConn(c)">测试连接</a-button>
              <a-button size="small" @click="todo('配置')">配置</a-button>
              <a-button size="small" @click="todo('同步日志')">日志</a-button>
            </div>
          </div>
        </div>
        <div class="log-block">
          <div class="lb-title">同步日志</div>
          <a-table :columns="logCols" :data-source="syncLogs" row-key="time" :pagination="false" size="small">
            <template #bodyCell="{ column, record }">
              <a-tag v-if="column.key === 'result'" :color="record.result === '成功' ? 'green' : 'red'">{{ record.result }}</a-tag>
            </template>
          </a-table>
        </div>
      </a-tab-pane>

      <!-- 事件订阅 -->
      <a-tab-pane key="events" tab="事件订阅">
        <div class="bar"><span class="tip">系统事件总线，供 Webhook / 连接器订阅</span><a-button type="primary" @click="todo('新增事件')"><template #icon><PlusOutlined /></template>新增事件</a-button></div>
        <a-table :columns="[{title:'事件标识',dataIndex:'event',key:'event'},{title:'说明',dataIndex:'desc',key:'desc'},{title:'订阅方',dataIndex:'subs',key:'subs',width:100},{title:'启用',dataIndex:'status',key:'status',width:80}]" :data-source="events" row-key="id" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <code v-if="column.key === 'event'" class="mono">{{ record.event }}</code>
            <span v-else-if="column.key === 'subs'"><b>{{ record.subs }}</b> 方</span>
            <a-switch v-else-if="column.key === 'status'" v-model:checked="record.status" size="small" />
          </template>
        </a-table>
      </a-tab-pane>

      <!-- Webhook -->
      <a-tab-pane key="webhook" tab="Webhook">
        <div class="bar"><span class="tip">事件触发时向外部 URL 推送（HMAC 签名）</span><a-button type="primary" @click="todo('新增Webhook')"><template #icon><PlusOutlined /></template>新增 Webhook</a-button></div>
        <a-table :columns="whCols" :data-source="webhooks" row-key="id" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <code v-if="column.key === 'url'" class="mono url">{{ record.url }}</code>
            <code v-else-if="column.key === 'event'" class="mono">{{ record.event }}</code>
            <a-tag v-else-if="column.key === 'secret'" :color="record.secret === '已配置' ? 'green' : 'orange'">{{ record.secret }}</a-tag>
            <a-switch v-else-if="column.key === 'status'" v-model:checked="record.status" size="small" />
            <template v-else-if="column.key === 'op'">
              <a-button type="link" size="small" @click="todo('测试推送')">测试</a-button>
              <DeleteOutlined class="op-ic danger" @click="todo('删除')" />
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <!-- 数据映射 -->
      <a-tab-pane key="mapping" tab="数据映射">
        <div class="bar"><span class="tip">外部系统字段 → 工单实体字段的映射与转换</span><a-button type="primary" @click="todo('新增映射')"><template #icon><PlusOutlined /></template>新增映射</a-button></div>
        <a-table :columns="mapCols" :data-source="mappings" row-key="src" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <code v-if="column.key === 'src'" class="mono src">{{ record.src }}</code>
            <span v-else-if="column.key === 'arrow'" class="arrow">→</span>
            <code v-else-if="column.key === 'dst'" class="mono dst">{{ record.dst }}</code>
            <a-tag v-else-if="column.key === 'transform'" color="purple">{{ record.transform }}</a-tag>
          </template>
        </a-table>
      </a-tab-pane>

      <!-- API 网关 -->
      <a-tab-pane key="gateway" tab="API 网关">
        <div class="bar"><span class="tip">对外开放 API 的鉴权与限流</span></div>
        <a-table :columns="apiCols" :data-source="apis" row-key="path" :pagination="false" size="middle">
          <template #bodyCell="{ column, record }">
            <code v-if="column.key === 'path'" class="mono">{{ record.path }}</code>
            <a-tag v-else-if="column.key === 'method'" :color="METHOD_TONE[record.method]">{{ record.method }}</a-tag>
            <a-switch v-else-if="column.key === 'status'" v-model:checked="record.status" size="small" />
          </template>
        </a-table>
      </a-tab-pane>

      <!-- SDK & 密钥 -->
      <a-tab-pane key="sdk" tab="SDK & 密钥">
        <div class="sec-title">API 密钥<a-button type="primary" size="small" @click="todo('生成密钥')"><template #icon><PlusOutlined /></template>生成密钥</a-button></div>
        <div class="key-list">
          <div v-for="k in keys" :key="k.id" class="key-row">
            <div class="kr-name">{{ k.name }}</div>
            <code class="kr-key">{{ k.show ? 'sk_live_8f2a3b7e9c01d4f5a6b7' : k.key }}</code>
            <a-button type="text" size="small" @click="k.show = !k.show"><component :is="k.show ? EyeInvisibleOutlined : EyeOutlined" /></a-button>
            <a-button type="text" size="small" @click="copyKey(k)"><CopyOutlined /></a-button>
            <span class="kr-meta">创建 {{ k.created }} · 最近使用 {{ k.lastUse }}</span>
            <a-button type="link" size="small" danger @click="todo('吊销')">吊销</a-button>
          </div>
        </div>
        <div class="sec-title" style="margin-top: 24px">SDK 下载</div>
        <div class="sdk-grid">
          <div v-for="s in SDKS" :key="s.lang" class="sdk-card">
            <span class="sdk-emoji">{{ s.icon }}</span>
            <div class="sdk-lang">{{ s.lang }} SDK</div>
            <div class="sdk-ver">{{ s.ver }}</div>
            <a-button size="small" block @click="todo(`下载 ${s.lang} SDK`)"><template #icon><DownloadOutlined /></template>下载</a-button>
          </div>
        </div>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<style scoped>
.connector-hub { padding: 8px 24px 24px; }
.bar { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 16px; }
.tip { font-size: 13px; color: #6b7280; }
.conn-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.conn-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }
.cc-head { display: flex; align-items: center; gap: 12px; }
.cc-emoji { font-size: 28px; }
.cc-meta { flex: 1; } .cc-name { font-size: 14px; font-weight: 600; color: #111827; }
.cc-st { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 4px; }
.cc-sync { font-size: 12px; color: #9ca3af; margin: 12px 0; }
.cc-acts { display: flex; gap: 8px; }
.log-block { margin-top: 24px; }
.lb-title { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 12px; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.url { color: #6b7280; } .src { color: #b45309; } .dst { color: #0550ae; }
.arrow { color: #1a6fff; font-weight: 700; }
.op-ic { color: #ef4444; cursor: pointer; margin-left: 8px; } .op-ic:hover { opacity: 0.7; }
.sec-title { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; }
.key-list { display: flex; flex-direction: column; gap: 10px; }
.key-row { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; }
.kr-name { font-size: 13px; font-weight: 600; color: #374151; width: 110px; }
.kr-key { font-family: ui-monospace, monospace; font-size: 13px; color: #111827; background: #f6f8fa; padding: 4px 10px; border-radius: 5px; }
.kr-meta { font-size: 12px; color: #9ca3af; margin-left: auto; }
.sdk-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.sdk-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px; text-align: center; }
.sdk-emoji { font-size: 30px; }
.sdk-lang { font-size: 14px; font-weight: 600; color: #111827; margin-top: 8px; }
.sdk-ver { font-size: 12px; color: #9ca3af; margin: 4px 0 12px; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
