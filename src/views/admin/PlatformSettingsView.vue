<script setup lang="ts">
import { reactive } from 'vue';
import { message } from 'ant-design-vue';
import { DEFAULT_SYS_SETTINGS } from '@/mock/platformAdmin';

const s = reactive({ ...DEFAULT_SYS_SETTINGS });
function save(name: string) {
  message.success(`${name}已保存`);
}
</script>

<template>
  <div class="sys-settings">
    <div class="page-head">
      <h2>系统参数</h2>
      <p>全局系统参数配置</p>
    </div>

    <!-- 全局限流 -->
    <div class="card">
      <div class="card-head"><span class="card-title">全局限流设置</span><a-button type="primary" size="small" @click="save('限流设置')">保存</a-button></div>
      <div class="grid2">
        <div class="field"><label>API 全局限流（次/秒）</label><a-input-number v-model:value="s.globalRateLimit" style="width:100%" /></div>
        <div class="field"><label>单租户限流（次/秒）</label><a-input-number v-model:value="s.tenantRateLimit" style="width:100%" /></div>
        <div class="field"><label>单 IP 限流（次/分钟）</label><a-input-number v-model:value="s.ipRateLimit" style="width:100%" /></div>
        <div class="field"><label>限流策略</label>
          <a-select v-model:value="s.rateLimitStrategy" style="width:100%" :options="[
            { value: 'reject', label: '直接拒绝' }, { value: 'queue', label: '排队等待' }, { value: 'degrade', label: '降级处理' }]" />
        </div>
      </div>
    </div>

    <!-- 维护窗口 -->
    <div class="card">
      <div class="card-head"><span class="card-title">系统维护窗口</span><a-button type="primary" size="small" @click="save('维护窗口')">保存</a-button></div>
      <div class="grid2">
        <div class="field"><label>维护开始时间</label><a-input v-model:value="s.maintStart" type="datetime-local" /></div>
        <div class="field"><label>维护结束时间</label><a-input v-model:value="s.maintEnd" type="datetime-local" /></div>
        <div class="field span2"><label>维护公告内容</label><a-textarea v-model:value="s.maintMessage" :rows="2" /></div>
        <div class="field"><a-checkbox v-model:checked="s.maintEnabled">启用维护模式</a-checkbox></div>
      </div>
    </div>

    <!-- 平台通知 -->
    <div class="card">
      <div class="card-head"><span class="card-title">平台通知设置</span><a-button type="primary" size="small" @click="save('通知设置')">保存</a-button></div>
      <div class="grid2">
        <div class="field"><label>SMTP 服务器</label><a-input v-model:value="s.smtpHost" /></div>
        <div class="field"><label>SMTP 端口</label><a-input-number v-model:value="s.smtpPort" style="width:100%" /></div>
        <div class="field"><label>发件人邮箱</label><a-input v-model:value="s.senderEmail" /></div>
        <div class="field"><label>发件人名称</label><a-input v-model:value="s.senderName" /></div>
        <div class="field"><a-checkbox v-model:checked="s.emailEnabled">启用邮件通知</a-checkbox></div>
        <div class="field"><a-checkbox v-model:checked="s.smsEnabled">启用短信通知</a-checkbox></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sys-settings { display: flex; flex-direction: column; gap: 20px; padding: 20px 24px; }
.page-head h2 { font-size: 18px; font-weight: 700; color: #111827; }
.page-head p { font-size: 13px; color: #6b7280; margin-top: 2px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; }
.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.card-title { font-size: 14px; font-weight: 600; color: #111827; }
.grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field.span2 { grid-column: span 2; }
.field label { font-size: 12px; color: #6b7280; }
</style>
