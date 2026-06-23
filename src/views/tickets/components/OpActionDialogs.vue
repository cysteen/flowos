<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { message } from 'ant-design-vue';
import {
  SwapOutlined, TeamOutlined, StopOutlined, PauseCircleOutlined,
  PlayCircleOutlined, RiseOutlined, SyncOutlined, ToolOutlined,
  CheckCircleOutlined, CloseCircleOutlined, InboxOutlined,
} from '@ant-design/icons-vue';
import OpActionModal from './operation/OpActionModal.vue';
import type { SuspendInfo, OpActionType } from '../composables/opActions';
import {
  TRANSFER_TARGETS, DELEGATE_TARGETS, REVIEWERS, FORCE_CLOSE_REASONS, APPROVERS,
  SUSPEND_REASONS, ESCALATE_CHANNELS, ESCALATE_GROUPS, ESCALATE_MEMBERS,
  FEISHU_SPACES, AFTERSALE_GROUPS, CLOSE_RESULTS, ROOT_CAUSES, ARCHIVE_REASONS,
  RESUME_REASONS,
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
const delegate = reactive({ assistant: DELEGATE_TARGETS[0], reason: '' });
const forceClose = reactive({ reason: '', approver: APPROVERS[0], detail: '' });
const suspend = reactive({ reason: '', detail: '', resumeAt: '' });
const escalate = reactive({ channel: ESCALATE_CHANNELS[0], group: ESCALATE_GROUPS[0], member: ESCALATE_MEMBERS[0], detail: '', syncContext: true });
const syncFeishu = reactive({ space: FEISHU_SPACES[0], message: '' });
const aftersale = reactive({ mode: 'callback' as 'close' | 'callback', group: AFTERSALE_GROUPS[0], detail: '' });
const resolve = reactive({ solution: '', createCallback: true });
const close = reactive({
  target: 'resolved' as 'resolved' | 'closed',
  result: '', solution: '', satisfaction: '满意', rootCause: '', sendSms: false,
});
const archive = reactive({ reason: ARCHIVE_REASONS[1], retention: '3y' });
const resume = reactive({ reason: '', detail: '' });

const escalateToTech = computed(() => escalate.channel.includes('技术支持'));

const ESCALATE_CHANNEL_GROUPS: Record<string, string[]> = {
  '二线技术支持组（推荐）': [...ESCALATE_GROUPS],
  'RDM 产研系统': ['RDM 硬件缺陷组', 'RDM 软件缺陷组'],
  'TPD 技术问题单': ['TPD 受理组', 'TPD 跟进组'],
};

const escalateGroupOptions = computed(() => {
  const groups = ESCALATE_CHANNEL_GROUPS[escalate.channel];
  if (!groups?.length) return [];
  return groups.map((g) => ({ value: g, label: g }));
});

const showEscalateGroup = computed(() => escalateGroupOptions.value.length > 0);

watch(() => escalate.channel, (ch) => {
  const groups = ESCALATE_CHANNEL_GROUPS[ch];
  if (!groups?.length) return;
  if (!groups.includes(escalate.group)) escalate.group = groups[0];
});

/** 每个动作的弹窗外观配置：标题 / 图标 / 徽标色 / 宽度 / 主按钮色 / 主按钮文案 */
interface DlgConfig {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  tone: 'primary' | 'success' | 'warn' | 'danger';
  width: number;
  okTone: 'primary' | 'success' | 'danger';
  okText: string;
}

const DLG_CONFIG: Partial<Record<OpActionType, DlgConfig>> = {
  转办: { title: '转办工单', icon: SwapOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认转办' },
  委派: { title: '委派协办', icon: TeamOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认委派' },
  下送: { title: '下送审核', icon: StopOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认下送' },
  强结: { title: '强制结案（强结）', icon: StopOutlined, tone: 'warn', width: 480, okTone: 'danger', okText: '提交强结审批' },
  挂起: { title: '挂起工单', icon: PauseCircleOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认挂起' },
  升级: { title: '升级工单', icon: RiseOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认升级' },
  同步飞书: { title: '同步飞书协同', icon: SyncOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认同步' },
  转售后: { title: '转售后处理', icon: ToolOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认转售后' },
  标记已解决: { title: '标记已解决', icon: CheckCircleOutlined, tone: 'success', width: 520, okTone: 'success', okText: '确认标记' },
  恢复: { title: '恢复工单', icon: PlayCircleOutlined, tone: 'success', width: 560, okTone: 'success', okText: '确认恢复' },
  关闭工单: { title: '关闭工单', icon: CloseCircleOutlined, tone: 'warn', width: 560, okTone: 'primary', okText: '确认关闭' },
  归档工单: { title: '归档工单', icon: InboxOutlined, tone: 'warn', width: 480, okTone: 'danger', okText: '确认归档' },
};

const cfg = computed<DlgConfig>(
  () => (props.action && DLG_CONFIG[props.action]) || {
    title: props.action ?? '', icon: undefined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认',
  },
);

function resetForms() {
  transfer.scope = 'same'; transfer.target = TRANSFER_TARGETS[0]; transfer.reason = '';
  delegate.assistant = DELEGATE_TARGETS[0]; delegate.reason = '';
  forceClose.reason = ''; forceClose.approver = APPROVERS[0]; forceClose.detail = '';
  suspend.reason = ''; suspend.detail = ''; suspend.resumeAt = '';
  escalate.channel = ESCALATE_CHANNELS[0]; escalate.group = ESCALATE_GROUPS[0];
  escalate.member = ESCALATE_MEMBERS[0]; escalate.detail = ''; escalate.syncContext = true;
  syncFeishu.space = FEISHU_SPACES[0]; syncFeishu.message = '';
  aftersale.mode = 'callback'; aftersale.group = AFTERSALE_GROUPS[0]; aftersale.detail = '';
  resolve.solution = ''; resolve.createCallback = true;
  close.target = 'resolved'; close.result = ''; close.solution = '';
  close.satisfaction = '满意'; close.rootCause = ''; close.sendSms = false;
  archive.reason = ARCHIVE_REASONS[1]; archive.retention = '3y';
  resume.reason = ''; resume.detail = '';
}

watch(() => props.open, (v) => { if (v) resetForms(); });

function closeModal() {
  emit('update:open', false);
}

function validate(): boolean {
  switch (props.action) {
    case '强结':
      if (!forceClose.reason) { message.warning('请选择强结原因'); return false; }
      return true;
    case '挂起':
      if (!suspend.reason) { message.warning('请选择挂起原因'); return false; }
      return true;
    case '同步飞书':
      if (!syncFeishu.message.trim()) { message.warning('请填写同步内容'); return false; }
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
    case '转办': emit('confirm', { type: '转办', data: { ...transfer } }); break;
    case '委派': emit('confirm', { type: '委派', data: { ...delegate } }); break;
    case '强结': emit('confirm', { type: '强结', data: { ...forceClose } }); break;
    case '挂起': emit('confirm', { type: '挂起', data: { ...suspend } }); break;
    case '升级': emit('confirm', { type: '升级', data: { ...escalate } }); break;
    case '同步飞书': emit('confirm', { type: '同步飞书', data: { ...syncFeishu } }); break;
    case '转售后': emit('confirm', { type: '转售后', data: { ...aftersale } }); break;
    case '标记已解决': emit('confirm', { type: '标记已解决', data: { ...resolve } }); break;
    case '恢复': emit('confirm', { type: '恢复', data: { ...resume } }); break;
    case '关闭工单': emit('confirm', { type: '关闭工单', data: { ...close } }); break;
    case '归档工单': emit('confirm', { type: '归档工单', data: { ...archive } }); break;
  }
  closeModal();
}
</script>

<template>
  <OpActionModal
    :open="open"
    :title="cfg.title"
    :icon="cfg.icon"
    :tone="cfg.tone"
    :width="cfg.width"
    :ok-text="cfg.okText"
    :ok-tone="cfg.okTone"
    @update:open="emit('update:open', $event)"
    @ok="onOk"
    @cancel="closeModal"
  >
    <!-- 转办 -->
    <div v-if="action === '转办'" class="op-form">
      <div class="op-field">
        <div class="op-label">转办范围</div>
        <a-radio-group v-model:value="transfer.scope">
          <a-radio value="same">同组内</a-radio>
          <a-radio value="cross">跨组</a-radio>
        </a-radio-group>
      </div>
      <div class="op-field">
        <div class="op-label">目标处理人</div>
        <a-select v-model:value="transfer.target" :options="TRANSFER_TARGETS.map((t) => ({ value: t, label: t }))" style="width:100%" />
      </div>
      <div class="op-field">
        <div class="op-label">转办原因</div>
        <a-textarea v-model:value="transfer.reason" :rows="2" placeholder="请输入转办原因..." />
      </div>
      <div class="op-tip op-tip-info">转办变更当前处理人，工单状态仍为「处理中」；48 小时未响应将自动回滚。</div>
    </div>

    <!-- 委派 -->
    <div v-else-if="action === '委派'" class="op-form">
      <div class="op-field">
        <div class="op-label req">协助办理人</div>
        <a-select v-model:value="delegate.assistant" :options="DELEGATE_TARGETS.map((t) => ({ value: t, label: t }))" style="width:100%" />
      </div>
      <div class="op-field">
        <div class="op-label">委派说明</div>
        <a-textarea v-model:value="delegate.reason" :rows="2" placeholder="请说明需协助的内容..." />
      </div>
      <div class="op-tip op-tip-info">委派 ≠ 转办：主责仍在您名下，协助人配合办理，状态不变。</div>
    </div>

    <!-- 强结 -->
    <div v-else-if="action === '强结'" class="op-form">
      <div class="op-tip op-tip-warn">非正常结案路径：处理中任意阶段可发起，提交后走单级审批，审批通过直接进入「已结案」，绕过满意度回访。</div>
      <div class="op-field">
        <div class="op-label req">强结原因</div>
        <a-select v-model:value="forceClose.reason" placeholder="请选择..." style="width:100%"
          :options="FORCE_CLOSE_REASONS.map((r) => ({ value: r, label: r }))" />
      </div>
      <div class="op-field">
        <div class="op-label req">审批人</div>
        <a-select v-model:value="forceClose.approver" :options="APPROVERS.map((r) => ({ value: r, label: r }))" style="width:100%" />
      </div>
      <div class="op-field">
        <div class="op-label">补充说明</div>
        <a-textarea v-model:value="forceClose.detail" :rows="2" placeholder="请补充强结说明..." />
      </div>
    </div>

    <!-- 挂起 -->
    <div v-else-if="action === '挂起'" class="op-form">
      <div class="op-field">
        <div class="op-label req">挂起原因</div>
        <a-select v-model:value="suspend.reason" placeholder="请选择..." style="width:100%"
          :options="SUSPEND_REASONS.map((r) => ({ value: r, label: r }))" />
      </div>
      <div class="op-field">
        <div class="op-label">详细说明</div>
        <a-textarea v-model:value="suspend.detail" :rows="2" placeholder="请描述挂起原因..." />
      </div>
      <div class="op-field">
        <div class="op-label">预计恢复时间</div>
        <a-input v-model:value="suspend.resumeAt" placeholder="如：明日 10:00" />
      </div>
      <div class="op-tip op-tip-info">挂起后 SLA 暂停计时 | 本工单已挂起 0 次（最多 2 次）</div>
    </div>

    <!-- 升级 -->
    <div v-else-if="action === '升级'" class="op-form">
      <div class="op-field-row">
        <div class="op-field">
          <div class="op-label req">升级通道</div>
          <a-select
            v-model:value="escalate.channel"
            style="width:100%"
            :options="ESCALATE_CHANNELS.map((c) => ({ value: c, label: c }))"
          />
        </div>
        <div v-if="showEscalateGroup" class="op-field">
          <div class="op-label req">目标组别</div>
          <a-select
            v-model:value="escalate.group"
            style="width:100%"
            :options="escalateGroupOptions"
          />
        </div>
      </div>
      <template v-if="escalateToTech">
        <div class="op-field">
          <div class="op-label">目标人员</div>
          <a-select v-model:value="escalate.member" style="width:100%"
            :options="ESCALATE_MEMBERS.map((m) => ({ value: m, label: m }))" />
        </div>
      </template>
      <div class="op-field">
        <div class="op-label">升级说明</div>
        <a-textarea v-model:value="escalate.detail" :rows="2" placeholder="请填写升级说明..." />
      </div>
      <a-checkbox v-model:checked="escalate.syncContext">同步工单上下文至目标系统</a-checkbox>
    </div>

    <!-- 同步飞书 -->
    <div v-else-if="action === '同步飞书'" class="op-form">
      <div class="op-tip op-tip-info">协同动作：仅在时间线记录一次同步，不改变工单状态，SLA 继续计时。</div>
      <div class="op-field">
        <div class="op-label req">协同空间</div>
        <a-select v-model:value="syncFeishu.space" :options="FEISHU_SPACES.map((s) => ({ value: s, label: s }))" style="width:100%" />
      </div>
      <div class="op-field">
        <div class="op-label req">同步内容</div>
        <a-textarea v-model:value="syncFeishu.message" :rows="3" placeholder="请填写需同步给协同团队的信息..." />
      </div>
    </div>

    <!-- 转售后 -->
    <div v-else-if="action === '转售后'" class="op-form">
      <div class="op-field">
        <div class="op-label req">转出模式</div>
        <a-radio-group v-model:value="aftersale.mode" class="op-radio-cards">
          <label class="op-radio-card" :class="{ on: aftersale.mode === 'callback' }">
            <a-radio value="callback" />
            <div>
              <div class="op-rc-title">等回流模式</div>
              <div class="op-rc-sub">售后处理完成后结果回流，客服侧恢复处理继续面向客户闭环</div>
            </div>
          </label>
          <label class="op-radio-card" :class="{ on: aftersale.mode === 'close' }">
            <a-radio value="close" />
            <div>
              <div class="op-rc-title">关闭模式</div>
              <div class="op-rc-sub">客服工单进入终态（已关闭），后续由售后工单独立承接</div>
            </div>
          </label>
        </a-radio-group>
      </div>
      <div class="op-field">
        <div class="op-label req">售后处理组</div>
        <a-select v-model:value="aftersale.group" :options="AFTERSALE_GROUPS.map((g) => ({ value: g, label: g }))" style="width:100%" />
      </div>
      <div class="op-field">
        <div class="op-label">转出说明</div>
        <a-textarea v-model:value="aftersale.detail" :rows="2" placeholder="请填写转售后说明..." />
      </div>
    </div>

    <!-- 标记已解决 -->
    <div v-else-if="action === '标记已解决'" class="op-form">
      <div class="op-tip op-tip-ok">标记为 Resolved 后，工单进入「待回访确认」阶段，不等于最终关闭。</div>
      <div class="op-field">
        <div class="op-label req">解决方案摘要</div>
        <a-textarea v-model:value="resolve.solution" :rows="3" placeholder="请填写本次处理结果与建议..." />
      </div>
      <a-checkbox v-model:checked="resolve.createCallback">自动创建回访任务并在 24 小时内催收满意度</a-checkbox>
    </div>

    <!-- 恢复 -->
    <div v-else-if="action === '恢复'" class="op-form">
      <div v-if="suspendInfo" class="op-box op-box-warn">
        <div class="op-box-title">当前挂起信息</div>
        <div class="op-kv-row"><span>挂起原因</span><span>{{ suspendInfo.reason }}</span></div>
        <div class="op-kv-row"><span>挂起时间</span><span>{{ suspendInfo.at }}</span></div>
        <div class="op-kv-row"><span>预计恢复</span><span>{{ suspendInfo.resumeAt || '—' }}</span></div>
        <div class="op-kv-row"><span>操作人</span><span>{{ suspendInfo.operator }}</span></div>
      </div>
      <div class="op-field">
        <div class="op-label req">恢复原因</div>
        <a-select v-model:value="resume.reason" placeholder="请选择..." style="width:100%"
          :options="RESUME_REASONS.map((r) => ({ value: r, label: r }))" />
      </div>
      <div class="op-field">
        <div class="op-label">详细说明</div>
        <a-textarea v-model:value="resume.detail" :rows="2" placeholder="请描述恢复原因和后续处理计划..." />
      </div>
      <div class="op-tip op-tip-ok">恢复后 SLA 继续计时</div>
    </div>

    <!-- 关闭工单 -->
    <div v-else-if="action === '关闭工单'" class="op-form">
      <div class="op-tip op-tip-info">待回访 → 已关闭 → 已归档 三态流转；关闭后 30 天无操作将自动归档。</div>
      <div class="op-field">
        <div class="op-label req">状态落点</div>
        <a-radio-group v-model:value="close.target" class="op-radio-cards">
          <label class="op-radio-card" :class="{ on: close.target === 'resolved' }">
            <a-radio value="resolved" />
            <div>
              <div class="op-rc-title">标记为已解决（待回访）</div>
              <div class="op-rc-sub">问题已处理完成，仍需回访确认或等待客户回评</div>
            </div>
          </label>
          <label class="op-radio-card" :class="{ on: close.target === 'closed' }">
            <a-radio value="closed" />
            <div>
              <div class="op-rc-title">直接关闭（Closed）</div>
              <div class="op-rc-sub">已完成回访确认，或无需回访的标准结案场景</div>
            </div>
          </label>
        </a-radio-group>
      </div>
      <div class="op-field">
        <div class="op-label req">处理结果</div>
        <a-select v-model:value="close.result" placeholder="请选择..." style="width:100%"
          :options="CLOSE_RESULTS.map((r) => ({ value: r, label: r }))" />
      </div>
      <div class="op-field">
        <div class="op-label req">解决方案摘要</div>
        <a-textarea v-model:value="close.solution" :rows="3" placeholder="请填写最终解决方案（必填）..." />
      </div>
      <div class="op-field">
        <div class="op-label req">客户满意度</div>
        <a-radio-group v-model:value="close.satisfaction">
          <a-radio value="满意">满意</a-radio>
          <a-radio value="一般">一般</a-radio>
          <a-radio value="不满意">不满意</a-radio>
          <a-radio value="未评价">未评价</a-radio>
        </a-radio-group>
      </div>
      <div class="op-field">
        <div class="op-label">根因分类</div>
        <a-select v-model:value="close.rootCause" placeholder="请选择..." allow-clear style="width:100%"
          :options="ROOT_CAUSES.map((r) => ({ value: r, label: r }))" />
      </div>
      <a-checkbox v-model:checked="close.sendSms">关闭后自动发送满意度调查短信</a-checkbox>
    </div>

    <!-- 归档 -->
    <div v-else-if="action === '归档工单'" class="op-form">
      <div class="op-tip op-tip-warn">归档后工单将移至冷存储，仅支持只读查询，不可恢复</div>
      <div class="op-field">
        <div class="op-label">归档原因</div>
        <a-select v-model:value="archive.reason" style="width:100%"
          :options="ARCHIVE_REASONS.map((r) => ({ value: r, label: r }))" />
      </div>
      <div class="op-field">
        <div class="op-label">数据保留策略</div>
        <a-radio-group v-model:value="archive.retention">
          <a-radio value="3y">保留 3 年</a-radio>
          <a-radio value="5y">保留 5 年</a-radio>
          <a-radio value="forever">永久保留</a-radio>
        </a-radio-group>
      </div>
      <div class="op-box">
        <div class="op-kv-row"><span>工单编号</span><span class="op-mono">{{ ticketNo }}</span></div>
        <div class="op-kv-row"><span>关联附件</span><span>2 个文件 (256KB)</span></div>
      </div>
    </div>
  </OpActionModal>
</template>
