<script setup lang="ts">
import { reactive } from 'vue';
import { message } from 'ant-design-vue';
import {
  ThunderboltOutlined, ToolOutlined, BellOutlined, SaveOutlined, InfoCircleOutlined,
} from '@ant-design/icons-vue';
import { DEFAULT_SYS_SETTINGS } from '@/mock/platformAdmin';

const s = reactive({ ...DEFAULT_SYS_SETTINGS });
function save(name: string) {
  message.success(`${name}已保存`);
}
function saveAll() {
  message.success('全部系统参数已保存并生效');
}
</script>

<template>
  <div class="sys-settings">
    <div class="page-head-row">
      <div class="page-head"><h2>系统参数</h2><p>平台级全局参数配置，影响所有租户</p></div>
      <a-button type="primary" @click="saveAll"><template #icon><SaveOutlined /></template>保存全部</a-button>
    </div>

    <!-- 全局限流 -->
    <div class="card">
      <div class="card-head">
        <div class="ch-left"><span class="ch-ic blue"><ThunderboltOutlined /></span><div><div class="card-title">全局限流设置</div><div class="card-sub">保护平台稳定性，防止突发流量打满后端</div></div></div>
        <a-button size="small" @click="save('限流设置')">保存</a-button>
      </div>
      <a-form layout="vertical" class="card-body">
        <div class="grid2">
          <a-form-item label="API 全局限流（次/秒）"><a-input-number v-model:value="s.globalRateLimit" style="width:100%" :min="0" /></a-form-item>
          <a-form-item label="单租户限流（次/秒）"><a-input-number v-model:value="s.tenantRateLimit" style="width:100%" :min="0" /></a-form-item>
          <a-form-item label="单 IP 限流（次/分钟）"><a-input-number v-model:value="s.ipRateLimit" style="width:100%" :min="0" /></a-form-item>
          <a-form-item label="超限策略">
            <a-select v-model:value="s.rateLimitStrategy" style="width:100%" :options="[
              { value: 'reject', label: '直接拒绝（429）' }, { value: 'queue', label: '排队等待' }, { value: 'degrade', label: '降级处理' }]" />
          </a-form-item>
        </div>
      </a-form>
    </div>

    <!-- 维护窗口 -->
    <div class="card">
      <div class="card-head">
        <div class="ch-left"><span class="ch-ic amber"><ToolOutlined /></span><div><div class="card-title">系统维护窗口</div><div class="card-sub">维护期间向所有租户展示公告并限制访问</div></div></div>
        <a-button size="small" @click="save('维护窗口')">保存</a-button>
      </div>
      <a-form layout="vertical" class="card-body">
        <div class="maint-banner" :class="{ on: s.maintEnabled }">
          <InfoCircleOutlined />
          <span>{{ s.maintEnabled ? '维护模式已启用 — 租户将看到维护公告' : '维护模式未启用 — 平台正常对外服务' }}</span>
          <a-switch v-model:checked="s.maintEnabled" />
        </div>
        <div class="grid2">
          <a-form-item label="维护开始时间"><a-input v-model:value="s.maintStart" type="datetime-local" /></a-form-item>
          <a-form-item label="维护结束时间"><a-input v-model:value="s.maintEnd" type="datetime-local" /></a-form-item>
        </div>
        <a-form-item label="维护公告内容"><a-textarea v-model:value="s.maintMessage" :rows="2" /></a-form-item>
      </a-form>
    </div>

    <!-- 平台通知 -->
    <div class="card">
      <div class="card-head">
        <div class="ch-left"><span class="ch-ic green"><BellOutlined /></span><div><div class="card-title">平台通知设置</div><div class="card-sub">系统级告警与通知的发送通道</div></div></div>
        <a-button size="small" @click="save('通知设置')">保存</a-button>
      </div>
      <a-form layout="vertical" class="card-body">
        <div class="grid2">
          <a-form-item label="SMTP 服务器"><a-input v-model:value="s.smtpHost" /></a-form-item>
          <a-form-item label="SMTP 端口"><a-input-number v-model:value="s.smtpPort" style="width:100%" /></a-form-item>
          <a-form-item label="发件人邮箱"><a-input v-model:value="s.senderEmail" /></a-form-item>
          <a-form-item label="发件人名称"><a-input v-model:value="s.senderName" /></a-form-item>
        </div>
        <div class="toggles">
          <div class="toggle"><div><div class="tg-name">邮件通知</div><div class="tg-sub">通过 SMTP 发送系统邮件</div></div><a-switch v-model:checked="s.emailEnabled" /></div>
          <div class="toggle"><div><div class="tg-name">短信通知</div><div class="tg-sub">关键告警短信触达</div></div><a-switch v-model:checked="s.smsEnabled" /></div>
        </div>
      </a-form>
    </div>
  </div>
</template>

<style scoped>
.sys-settings { display: flex; flex-direction: column; gap: 18px; padding: 20px 24px; max-width: 920px; }
.page-head-row { display: flex; align-items: center; justify-content: space-between; }
.page-head h2 { font-size: 18px; font-weight: 700; color: #111827; }
.page-head p { font-size: 13px; color: #6b7280; margin-top: 2px; }

.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
.card-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #f0f0f0; }
.ch-left { display: flex; align-items: center; gap: 12px; }
.ch-ic { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 17px; }
.ch-ic.blue { background: #E8F1FF; color: #1A6FFF; } .ch-ic.amber { background: #FFFBEB; color: #F59E0B; } .ch-ic.green { background: #ECFDF5; color: #10B981; }
.card-title { font-size: 14px; font-weight: 600; color: #111827; }
.card-sub { font-size: 12px; color: #9ca3af; margin-top: 2px; }
.card-body { padding: 18px 20px 6px; }
.grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 18px; }
.card-body :deep(.ant-form-item) { margin-bottom: 14px; }

.maint-banner { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px; background: #f9fafb; border: 1px solid #eef0f2; font-size: 13px; color: #6b7280; margin-bottom: 16px; }
.maint-banner.on { background: #FFFBEB; border-color: #FDE68A; color: #B45309; }
.maint-banner :deep(.ant-switch) { margin-left: auto; }

.toggles { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 4px; }
.toggle { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border: 1px solid #eef0f2; border-radius: 8px; }
.tg-name { font-size: 13px; font-weight: 600; color: #374151; }
.tg-sub { font-size: 12px; color: #9ca3af; margin-top: 2px; }
</style>
