<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import type { SuspendInfo } from '../composables/opActions';
import {
  TRANSFER_TARGETS, SUSPEND_REASONS, REJECT_REASONS, REJECT_NODES,
  ESCALATE_CHANNELS, CLOSE_RESULTS, ROOT_CAUSES, ARCHIVE_REASONS,
  RESUME_REASONS, PUSH_RD_SYSTEMS,
  type OpActionType,
} from '../composables/opActions';

const props = defineProps<{
  open: boolean;
  action: OpActionType | null;
  ticketNo: string;
  suspendInfo: SuspendInfo | null;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  confirm: [payload: Record<string, unknown>];
}>();

const transfer = reactive({ scope: 'same' as 'same' | 'cross', target: TRANSFER_TARGETS[0], reason: '' });
const suspend = reactive({ reason: '', detail: '', resumeAt: '' });
const reject = reactive({ reason: '', targetNode: '受理', detail: '' });
const escalate = reactive({ channel: ESCALATE_CHANNELS[0], detail: '', syncContext: true });
const resolve = reactive({ solution: '', createCallback: true });
const close = reactive({
  target: 'resolved' as 'resolved' | 'closed',
  result: '',
  solution: '',
  satisfaction: '满意',
  rootCause: '',
  sendSms: false,
});
const archive = reactive({ reason: ARCHIVE_REASONS[1], retention: '3y' });
const pushRd = reactive({ system: PUSH_RD_SYSTEMS[0], detail: '' });
const resume = reactive({ reason: '', detail: '' });

const title = computed(() => {
  const map: Partial<Record<OpActionType, string>> = {
    转办: '转办工单', 挂起: '挂起工单', 退回: '退回工单', 升级: '升级工单',
    标记已解决: '标记已解决', 恢复: '恢复工单', 推送产研: '推送产研',
    关闭工单: '关闭工单', 归档工单: '归档工单',
  };
  return props.action ? map[props.action] ?? props.action : '';
});

const okText = computed(() => {
  const map: Partial<Record<OpActionType, string>> = {
    转办: '确认转办', 挂起: '确认挂起', 退回: '确认退回', 升级: '确认升级',
    标记已解决: '确认标记', 恢复: '确认恢复', 推送产研: '确认推送',
    关闭工单: '确认关闭', 归档工单: '确认归档',
  };
  return props.action ? map[props.action] ?? '确认' : '确认';
});

const okType = computed(() => {
  if (props.action === '标记已解决' || props.action === '恢复') return 'primary';
  if (props.action === '归档工单') return 'default';
  return 'primary';
});

const okDanger = computed(() => props.action === '归档工单');

function resetForms() {
  transfer.scope = 'same';
  transfer.target = TRANSFER_TARGETS[0];
  transfer.reason = '';
  suspend.reason = '';
  suspend.detail = '';
  suspend.resumeAt = '';
  reject.reason = '';
  reject.targetNode = '受理';
  reject.detail = '';
  escalate.channel = ESCALATE_CHANNELS[0];
  escalate.detail = '';
  escalate.syncContext = true;
  resolve.solution = '';
  resolve.createCallback = true;
  close.target = 'resolved';
  close.result = '';
  close.solution = '';
  close.satisfaction = '满意';
  close.rootCause = '';
  close.sendSms = false;
  archive.reason = ARCHIVE_REASONS[1];
  archive.retention = '3y';
  pushRd.system = PUSH_RD_SYSTEMS[0];
  pushRd.detail = '';
  resume.reason = '';
  resume.detail = '';
}

watch(() => props.open, (v) => { if (v) resetForms(); });

function closeModal() {
  emit('update:open', false);
}

function validate(): boolean {
  switch (props.action) {
    case '挂起':
      if (!suspend.reason) { message.warning('请选择挂起原因'); return false; }
      return true;
    case '退回':
      if (!reject.reason) { message.warning('请选择退回原因'); return false; }
      return true;
    case '标记已解决':
      if (!resolve.solution.trim()) { message.warning('请填写解决方案摘要'); return false; }
      return true;
    case '恢复':
      if (!resume.reason) { message.warning('请选择恢复原因'); return false; }
      return true;
    case '关闭工单':
      if (!close.result) { message.warning('请选择处理结果'); return false; }
      if (!close.solution.trim()) { message.warning('请填写解决方案摘要'); return false; }
      return true;
  }
  return true;
}

function onOk() {
  if (!validate()) return;
  switch (props.action) {
    case '转办':
      emit('confirm', { type: '转办', data: { ...transfer } });
      break;
    case '挂起':
      emit('confirm', { type: '挂起', data: { ...suspend } });
      break;
    case '退回':
      emit('confirm', { type: '退回', data: { ...reject } });
      break;
    case '升级':
      emit('confirm', { type: '升级', data: { ...escalate } });
      break;
    case '标记已解决':
      emit('confirm', { type: '标记已解决', data: { ...resolve } });
      break;
    case '恢复':
      emit('confirm', { type: '恢复', data: { ...resume } });
      break;
    case '推送产研':
      emit('confirm', { type: '推送产研', data: { ...pushRd } });
      break;
    case '关闭工单':
      emit('confirm', { type: '关闭工单', data: { ...close } });
      break;
    case '归档工单':
      emit('confirm', { type: '归档工单', data: { ...archive } });
      break;
  }
  closeModal();
}
</script>

<template>
  <a-modal
    :open="open"
    :title="title"
    :width="action === '关闭工单' || action === '恢复' ? 560 : action === '标记已解决' ? 520 : 480"
    :ok-text="okText"
    cancel-text="取消"
    :ok-type="okDanger ? 'default' : okType"
    :ok-button-props="okDanger ? { danger: true } : action === '标记已解决' || action === '恢复' ? { type: 'primary', style: { background: '#059669', borderColor: '#059669' } } : undefined"
    destroy-on-close
    @update:open="emit('update:open', $event)"
    @ok="onOk"
    @cancel="closeModal"
  >
    <!-- 转办 -->
    <div v-if="action === '转办'" class="dlg-body">
      <div class="field">
        <div class="label">转办范围</div>
        <a-radio-group v-model:value="transfer.scope">
          <a-radio value="same">同组内</a-radio>
          <a-radio value="cross">跨组</a-radio>
        </a-radio-group>
      </div>
      <div class="field">
        <div class="label">目标处理人</div>
        <a-select v-model:value="transfer.target" :options="TRANSFER_TARGETS.map((t) => ({ value: t, label: t }))" style="width:100%" />
      </div>
      <div class="field">
        <div class="label">转办原因</div>
        <a-textarea v-model:value="transfer.reason" :rows="2" placeholder="请输入转办原因..." />
      </div>
      <div class="tip tip-warn">转办后 48 小时内未响应将自动回滚至原处理人</div>
    </div>

    <!-- 挂起 -->
    <div v-else-if="action === '挂起'" class="dlg-body">
      <div class="field">
        <div class="label req">挂起原因</div>
        <a-select v-model:value="suspend.reason" placeholder="请选择..." style="width:100%"
          :options="SUSPEND_REASONS.map((r) => ({ value: r, label: r }))" />
      </div>
      <div class="field">
        <div class="label">详细说明</div>
        <a-textarea v-model:value="suspend.detail" :rows="2" placeholder="请描述挂起原因..." />
      </div>
      <div class="field">
        <div class="label">预计恢复时间</div>
        <a-input v-model:value="suspend.resumeAt" placeholder="如：明日 10:00" />
      </div>
      <div class="tip tip-info">挂起后 SLA 暂停计时 | 本工单已挂起 0 次（最多 2 次）</div>
    </div>

    <!-- 退回 -->
    <div v-else-if="action === '退回'" class="dlg-body">
      <div class="field">
        <div class="label req">退回原因</div>
        <a-select v-model:value="reject.reason" placeholder="请选择..." style="width:100%"
          :options="REJECT_REASONS.map((r) => ({ value: r, label: r }))" />
      </div>
      <div class="field">
        <div class="label">退回目标节点</div>
        <a-select v-model:value="reject.targetNode" style="width:100%"
          :options="REJECT_NODES.map((n) => ({ value: n, label: n }))" />
      </div>
      <div class="field">
        <div class="label">补充说明</div>
        <a-textarea v-model:value="reject.detail" :rows="2" placeholder="请说明退回原因..." />
      </div>
      <div class="tip tip-warn">本工单已退回 0 次（最多 3 次）</div>
    </div>

    <!-- 升级 -->
    <div v-else-if="action === '升级'" class="dlg-body">
      <div class="tip tip-ai">AI 推荐：学习机 + 硬件故障 → 推荐升级通道：售后管理系统</div>
      <div class="field">
        <div class="label req">升级通道</div>
        <a-select v-model:value="escalate.channel" style="width:100%"
          :options="ESCALATE_CHANNELS.map((c) => ({ value: c, label: c }))" />
      </div>
      <div class="field">
        <div class="label">升级说明</div>
        <a-textarea v-model:value="escalate.detail" :rows="2" placeholder="请填写升级说明..." />
      </div>
      <a-checkbox v-model:checked="escalate.syncContext">同步工单上下文至目标系统</a-checkbox>
    </div>

    <!-- 标记已解决 -->
    <div v-else-if="action === '标记已解决'" class="dlg-body">
      <div class="tip tip-ok">标记为 Resolved 后，工单进入「待回访确认」阶段，不等于最终关闭。</div>
      <div class="field">
        <div class="label req">解决方案摘要</div>
        <a-textarea v-model:value="resolve.solution" :rows="3" placeholder="请填写本次处理结果与建议..." />
      </div>
      <a-checkbox v-model:checked="resolve.createCallback">自动创建回访任务并在 24 小时内催收满意度</a-checkbox>
    </div>

    <!-- 恢复 -->
    <div v-else-if="action === '恢复'" class="dlg-body">
      <div v-if="suspendInfo" class="suspend-box">
        <div class="box-title">当前挂起信息</div>
        <div class="kv-row"><span>挂起原因</span><span>{{ suspendInfo.reason }}</span></div>
        <div class="kv-row"><span>挂起时间</span><span>{{ suspendInfo.at }}</span></div>
        <div class="kv-row"><span>预计恢复</span><span>{{ suspendInfo.resumeAt || '—' }}</span></div>
        <div class="kv-row"><span>操作人</span><span>{{ suspendInfo.operator }}</span></div>
      </div>
      <div class="field">
        <div class="label req">恢复原因</div>
        <a-select v-model:value="resume.reason" placeholder="请选择..." style="width:100%"
          :options="RESUME_REASONS.map((r) => ({ value: r, label: r }))" />
      </div>
      <div class="field">
        <div class="label">详细说明</div>
        <a-textarea v-model:value="resume.detail" :rows="2" placeholder="请描述恢复原因和后续处理计划..." />
      </div>
      <div class="tip tip-ok">恢复后 SLA 继续计时</div>
    </div>

    <!-- 推送产研 -->
    <div v-else-if="action === '推送产研'" class="dlg-body">
      <div class="field">
        <div class="label req">目标系统</div>
        <a-select v-model:value="pushRd.system" style="width:100%"
          :options="PUSH_RD_SYSTEMS.map((s) => ({ value: s, label: s }))" />
      </div>
      <div class="field">
        <div class="label">推送说明</div>
        <a-textarea v-model:value="pushRd.detail" :rows="3" placeholder="请描述需产研跟进的问题..." />
      </div>
    </div>

    <!-- 关闭工单 -->
    <div v-else-if="action === '关闭工单'" class="dlg-body">
      <div class="tip tip-info">Resolved → Closed → Archived 三态流转；关闭后 30 天无操作将自动归档。</div>
      <div class="field">
        <div class="label req">状态落点</div>
        <a-radio-group v-model:value="close.target" class="radio-cards">
          <label class="radio-card" :class="{ on: close.target === 'resolved' }">
            <a-radio value="resolved" />
            <div>
              <div class="rc-title">标记为已解决（Resolved）</div>
              <div class="rc-sub">问题已处理完成，仍需回访确认或等待客户回评</div>
            </div>
          </label>
          <label class="radio-card" :class="{ on: close.target === 'closed' }">
            <a-radio value="closed" />
            <div>
              <div class="rc-title">直接关闭（Closed）</div>
              <div class="rc-sub">已完成回访确认，或无需回访的标准结案场景</div>
            </div>
          </label>
        </a-radio-group>
      </div>
      <div class="field">
        <div class="label req">处理结果</div>
        <a-select v-model:value="close.result" placeholder="请选择..." style="width:100%"
          :options="CLOSE_RESULTS.map((r) => ({ value: r, label: r }))" />
      </div>
      <div class="field">
        <div class="label req">解决方案摘要</div>
        <a-textarea v-model:value="close.solution" :rows="3" placeholder="请填写最终解决方案（必填）..." />
      </div>
      <div class="field">
        <div class="label req">客户满意度</div>
        <a-radio-group v-model:value="close.satisfaction">
          <a-radio value="满意">满意</a-radio>
          <a-radio value="一般">一般</a-radio>
          <a-radio value="不满意">不满意</a-radio>
          <a-radio value="未评价">未评价</a-radio>
        </a-radio-group>
      </div>
      <div class="field">
        <div class="label">根因分类</div>
        <a-select v-model:value="close.rootCause" placeholder="请选择..." allow-clear style="width:100%"
          :options="ROOT_CAUSES.map((r) => ({ value: r, label: r }))" />
      </div>
      <a-checkbox v-model:checked="close.sendSms">关闭后自动发送满意度调查短信</a-checkbox>
    </div>

    <!-- 归档 -->
    <div v-else-if="action === '归档工单'" class="dlg-body">
      <div class="tip tip-warn">归档后工单将移至冷存储，仅支持只读查询，不可恢复</div>
      <div class="field">
        <div class="label">归档原因</div>
        <a-select v-model:value="archive.reason" style="width:100%"
          :options="ARCHIVE_REASONS.map((r) => ({ value: r, label: r }))" />
      </div>
      <div class="field">
        <div class="label">数据保留策略</div>
        <a-radio-group v-model:value="archive.retention">
          <a-radio value="3y">保留 3 年</a-radio>
          <a-radio value="5y">保留 5 年</a-radio>
          <a-radio value="forever">永久保留</a-radio>
        </a-radio-group>
      </div>
      <div class="meta-box">
        <div class="kv-row"><span>工单编号</span><span class="mono">{{ ticketNo }}</span></div>
        <div class="kv-row"><span>关联附件</span><span>2 个文件 (256KB)</span></div>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.dlg-body { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.label { font-size: 13px; color: #374151; font-weight: 500; }
.label.req::before { content: '* '; color: #ef4444; }
.tip { font-size: 12px; padding: 10px 12px; border-radius: 8px; line-height: 1.5; }
.tip-warn { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
.tip-info { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.tip-ok { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
.tip-ai { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; font-weight: 500; }
.suspend-box, .meta-box {
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 6px; font-size: 12px;
}
.meta-box { background: #f9fafb; border-color: #e5e7eb; }
.box-title { font-weight: 600; color: #b45309; margin-bottom: 4px; }
.kv-row { display: flex; justify-content: space-between; gap: 12px; color: #6b7280; }
.kv-row span:last-child { color: #374151; font-weight: 500; }
.mono { font-family: ui-monospace, monospace; }
.radio-cards { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.radio-card {
  display: flex; align-items: flex-start; gap: 10px; padding: 12px;
  border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer;
}
.radio-card.on { border-color: #10b981; background: #f0fdf4; }
.rc-title { font-size: 13px; font-weight: 600; color: #111827; }
.rc-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
</style>
