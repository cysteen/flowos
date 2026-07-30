<script setup lang="ts">
/**
 * 【815】消息通知 · 对客发送策略
 *
 * 对客消息本期仅 1 条：建单受理通知（抑制型——命中任一条件则不发）。
 * 抑制维度：工单来源 × 业务分类 × 工单类型。
 *
 * 本页不含（业务已确认去掉，D21）：
 *   · 建议单感谢短信 —— 该场景取消，不再发送；
 *   · 短信签名路由 —— 签名随「消息中心 · 短信渠道」携带，本模块不做业务线 → 渠道映射。
 * 亦不含：调研问卷短信（归「调研回访 · 调研配置」，D15）、坐席手动短信、小程序消息。
 */
import { reactive, computed } from 'vue';
import { message } from 'ant-design-vue';
import { SaveOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { CREATE_TICKET_TYPES } from '@/views/tickets/types/createTicket';

/* 枚举取自项目既有字典，与「调研配置」保持同源 */
const TICKET_TYPE_OPTS = [...CREATE_TICKET_TYPES, '表扬'];
const SOURCE_OPTS = ['热线电话', 'IM在线', '内投渠道', '外投渠道', '客户服务小程序', '学习机渠道'];
const BIZ_TYPE_OPTS = ['教育', '听见', '法院', '医疗', '其他', '智能硬件', '无线音乐', '开放平台'];

/** 建单受理通知 · 抑制条件（命中任一即不发） */
const suppress = reactive({
  sources: ['内投渠道', '外投渠道', '客户服务小程序'],
  bizTypes: ['无线音乐'],
  ticketTypes: ['表扬'],
});

const suppressCount = computed(
  () => suppress.sources.length + suppress.bizTypes.length + suppress.ticketTypes.length,
);

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
          <a-tooltip title="本期仅 2 条对客短信。取消 / 关闭 / 强结 / 升级投诉后关单一律不发，无需在此配置。调研问卷短信归「调研回访 · 调研配置」。">
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

        </div>
      </section>

    </div>

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
</style>
