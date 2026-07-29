<script setup lang="ts">
/**
 * 【815】消息通知 · 对客发送策略
 *
 * 对客消息只有 2 条（建单受理通知、建议单感谢短信），但两条的判定方向相反：
 *   建单受理 = 抑制型（满足任一条件则不发）
 *   建议感谢 = 准入型（同时满足才发）
 * 因此策略支持两种条件类型，后续新增对客场景直接复用，不必各写一套判定。
 *
 * 签名路由（D9）：签名不写进模板正文，按业务线路由到不同短信渠道，由渠道拼接。
 * 调研短信的发送判定不在本页——归「调研回访 · 调研配置」（D15）。
 */
import { ref, reactive, computed } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  SaveOutlined, PlusOutlined, QuestionCircleOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { CREATE_TICKET_TYPES } from '@/views/tickets/types/createTicket';
import { SIGN_ROUTES, type SignRoute } from '@/mock/notifyRules';

/* 枚举取自项目既有字典，与「调研配置」保持同源 */
const TICKET_TYPE_OPTS = [...CREATE_TICKET_TYPES, '表扬'];
const SOURCE_OPTS = ['热线电话', 'IM在线', '内投', '外投', '客户服务小程序', '学习机渠道'];
const BIZ_TYPE_OPTS = ['教育', '听见', '法院', '医疗', '其他', '智能硬件', '无线音乐', '开放平台'];

/** 建单受理通知 · 抑制条件（命中任一即不发） */
const suppress = reactive({
  sources: ['内投', '外投', '客户服务小程序'],
  bizTypes: ['无线音乐'],
  ticketTypes: ['表扬'],
});

/** 建议单感谢 · 准入条件（同时满足才发，均为固定口径） */
const admit = reactive({
  ticketType: '建议',
  isSuggestion: true,
});

const signRoutes = ref<SignRoute[]>(SIGN_ROUTES.map((r) => ({ ...r })));

const suppressCount = computed(
  () => suppress.sources.length + suppress.bizTypes.length + suppress.ticketTypes.length,
);

/* --------- 签名路由 --------- */
const routeOpen = ref(false);
const routeForm = reactive({ bizLine: '', channelName: '', sign: '' });

function openAddRoute() {
  Object.assign(routeForm, { bizLine: '', channelName: '', sign: '' });
  routeOpen.value = true;
}
function saveRoute() {
  if (!routeForm.bizLine.trim() || !routeForm.sign.trim()) {
    message.warning('业务线与签名均需填写');
    return;
  }
  signRoutes.value.push({
    id: Date.now(),
    bizLine: routeForm.bizLine.trim(),
    channelName: routeForm.channelName.trim() || '消息中心 · 客服',
    sign: routeForm.sign.trim(),
    isDefault: false,
  });
  routeOpen.value = false;
  message.success('签名路由已新增');
}
function delRoute(rec: SignRoute) {
  if (rec.isDefault) { message.warning('默认路由不可删除'); return; }
  Modal.confirm({
    title: '删除签名路由',
    content: `确认删除「${rec.bizLine}」的签名路由？删除后该业务线将回落到默认签名。`,
    okType: 'danger',
    onOk: () => { signRoutes.value = signRoutes.value.filter((r) => r.id !== rec.id); },
  });
}

function saveAll() {
  message.success('对客发送策略已保存');
}
</script>

<template>
  <div class="notify-policy">
    <AdminPageHeader
      title="对客发送策略"
      subtitle="对客短信发不发、挂哪个签名"
    >
      <template #actions>
        <a-button type="primary" @click="saveAll">
          <template #icon><SaveOutlined /></template>保存
        </a-button>
      </template>
    </AdminPageHeader>

    <div class="pl-body">
      <!-- ① 对客消息判定 -->
      <section class="sec">
        <header class="sec-head">
          对客消息
          <a-tooltip title="本期仅 2 条对客短信。取消 / 关闭 / 强结 / 关联投诉后关单一律不发，无需在此配置。调研问卷短信归「调研回访 · 调研配置」。">
            <QuestionCircleOutlined class="sec-help" />
          </a-tooltip>
        </header>
        <div class="sec-body">
          <!-- 建单受理 · 抑制 -->
          <div class="sub-blk">
            <div class="sub-head">
              <span>建单受理通知</span>
              <a-tag color="red" class="mini">抑制型</a-tag>
              <span class="sub-meta">命中任一不发 · 已选 {{ suppressCount }} 项</span>
            </div>
            <div class="chk-grid">
              <div class="chk-row">
                <span class="chk-label">工单来源</span>
                <a-checkbox-group v-model:value="suppress.sources" :options="SOURCE_OPTS" />
              </div>
              <div class="chk-row">
                <span class="chk-label">业务分类</span>
                <a-checkbox-group v-model:value="suppress.bizTypes" :options="BIZ_TYPE_OPTS" />
              </div>
              <div class="chk-row">
                <span class="chk-label">工单类型</span>
                <a-checkbox-group v-model:value="suppress.ticketTypes" :options="TICKET_TYPE_OPTS" />
              </div>
            </div>
          </div>

          <!-- 建议感谢 · 准入 -->
          <div class="sub-blk">
            <div class="sub-head">
              <span>建议单感谢短信</span>
              <a-tag color="green" class="mini">准入型</a-tag>
              <span class="sub-meta">同时满足才发</span>
            </div>
            <div class="admit-row">
              <span class="admit-k">工单类型</span>
              <span class="admit-op">=</span>
              <a-select
                v-model:value="admit.ticketType"
                style="width: 140px"
                :options="TICKET_TYPE_OPTS.map((t) => ({ value: t, label: t }))"
              />
              <span class="admit-and">且</span>
              <span class="admit-k">是否建议</span>
              <span class="admit-op">=</span>
              <a-switch
                v-model:checked="admit.isSuggestion"
                checked-children="是"
                un-checked-children="否"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- ② 签名路由 -->
      <section class="sec">
        <header class="sec-head">
          短信签名路由
          <a-tooltip title="签名不写进模板正文，由短信渠道下发时拼接。新增前请先在「消息中心 · 短信渠道」建好渠道。">
            <QuestionCircleOutlined class="sec-help" />
          </a-tooltip>
          <a-button type="primary" size="small" class="sec-btn" @click="openAddRoute">
            <template #icon><PlusOutlined /></template>新增路由
          </a-button>
        </header>
        <div class="sec-body sec-body--table">
          <a-table
            :columns="[
              { title: '业务线', dataIndex: 'bizLine', key: 'bizLine', width: 220 },
              { title: '短信渠道', dataIndex: 'channelName', key: 'channelName' },
              { title: '签名', dataIndex: 'sign', key: 'sign', width: 160 },
              { title: '操作', key: 'op', width: 90 },
            ]"
            :data-source="signRoutes"
            row-key="id"
            :pagination="false"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'bizLine'">
                {{ record.bizLine }}
                <a-tag v-if="record.isDefault" color="default" class="mini">默认</a-tag>
              </template>
              <template v-else-if="column.key === 'sign'">
                <code class="sign-code">{{ record.sign }}</code>
              </template>
              <template v-else-if="column.key === 'op'">
                <a-button
                  type="link" size="small" danger
                  :disabled="record.isDefault"
                  @click="delRoute(record)"
                >删除</a-button>
              </template>
            </template>
          </a-table>
        </div>
      </section>

      <!-- ③ 边界：一行收束 -->
      <div class="bound-line">
        <span class="bound-k">不在本页</span>
        <span>调研问卷短信 · 坐席手动短信 · 小程序消息</span>
      </div>
    </div>

    <a-modal v-model:open="routeOpen" title="新增签名路由" width="480px" @ok="saveRoute" ok-text="保存">
      <div class="rt-form">
        <div class="rt-row">
          <span class="rt-k">业务线</span>
          <a-input v-model:value="routeForm.bizLine" placeholder="如：壹师壹生" />
        </div>
        <div class="rt-row">
          <span class="rt-k">短信渠道</span>
          <a-input v-model:value="routeForm.channelName" placeholder="消息中心已配置的渠道名称" />
        </div>
        <div class="rt-row">
          <span class="rt-k">签名</span>
          <a-input v-model:value="routeForm.sign" placeholder="如：【合肥窗启】" />
        </div>
        <div class="rt-tip">签名需与渠道在运营商侧的报备一致，否则下发会被拦截。</div>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
/* 正文统一 13px / 继承字体；仅页头标题由 AdminPageHeader 保持更大字号 */
.notify-policy {
  padding: 16px 20px;
  font-size: 13px;
  line-height: 1.6;
  color: #374151;
  font-family: inherit;
}
.notify-policy :deep(.ant-checkbox-wrapper),
.notify-policy :deep(.ant-checkbox + span),
.notify-policy :deep(.ant-select),
.notify-policy :deep(.ant-select-selection-item),
.notify-policy :deep(.ant-btn),
.notify-policy :deep(.ant-tag),
.notify-policy :deep(.ant-table),
.notify-policy :deep(.ant-table-thead > tr > th),
.notify-policy :deep(.ant-table-tbody > tr > td),
.notify-policy :deep(.ant-input),
.notify-policy :deep(.ant-switch) {
  font-size: 13px;
  font-family: inherit;
}

.pl-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 960px;
}

.sec {
  border: 1px solid #e8eaed;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}
.sec-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  background: #f8fafc;
  border-bottom: 1px solid #eef0f3;
}
.sec-help { color: #9ca3af; font-size: 13px; cursor: help; }
.sec-help:hover { color: #1a6fff; }
.sec-btn { margin-left: auto; }
.sec-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sec-body--table { padding: 0; }
.sec-body--table :deep(.ant-table) { border-radius: 0; }
.sec-body--table :deep(.ant-table-thead > tr > th) {
  background: #fafbfc;
  color: #6b7280;
  font-weight: 600;
}

.sub-blk + .sub-blk {
  padding-top: 14px;
  border-top: 1px dashed #eef0f3;
}
.sub-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}
.sub-meta {
  margin-left: auto;
  font-size: 13px;
  font-weight: 400;
  color: #9ca3af;
}
.mini {
  font-size: 13px;
  line-height: 20px;
  padding: 0 6px;
  margin: 0;
}

.chk-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: #fafbfc;
  border: 1px solid #eef0f3;
  border-radius: 8px;
}
.chk-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.chk-label {
  width: 60px;
  flex: none;
  font-size: 13px;
  color: #6b7280;
  padding-top: 4px;
}
.chk-row :deep(.ant-checkbox-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.admit-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  padding: 12px 14px;
  background: #fafbfc;
  border: 1px solid #eef0f3;
  border-radius: 8px;
}
.admit-k { font-size: 13px; color: #374151; }
.admit-op { font-size: 13px; color: #9ca3af; }
.admit-and {
  margin: 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: #16a34a;
}

.sign-code {
  font-family: inherit;
  font-size: 13px;
  color: #1a6fff;
}

.bound-line {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  font-size: 13px;
  color: #9ca3af;
}
.bound-k {
  flex: none;
  color: #6b7280;
  font-weight: 500;
}

.rt-form { display: flex; flex-direction: column; gap: 12px; font-size: 13px; }
.rt-row { display: flex; align-items: center; gap: 12px; }
.rt-k { width: 66px; flex: none; font-size: 13px; color: #374151; }
.rt-tip { font-size: 13px; color: #9ca3af; line-height: 1.6; }
</style>
