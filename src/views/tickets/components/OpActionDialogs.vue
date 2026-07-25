<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { message } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import {
  SwapOutlined, TeamOutlined, StopOutlined, PauseCircleOutlined,
  PlayCircleOutlined, RiseOutlined, SyncOutlined, ToolOutlined,
  CheckCircleOutlined, CloseCircleOutlined, InboxOutlined, RollbackOutlined,
} from '@ant-design/icons-vue';
import OpActionModal from './operation/OpActionModal.vue';
import type { SuspendInfo, OpActionType, AftersaleContext } from '../composables/opActions';
import {
  TRANSFER_TARGETS, DELEGATE_TARGETS, REVIEWERS, FORCE_CLOSE_REASONS, APPROVERS,
  SUSPEND_REASONS, ESCALATE_CHANNELS, ESCALATE_GROUPS, ESCALATE_MEMBERS,
  FEISHU_SPACES, AFTERSALE_SERVICE_TYPES, AFTERSALE_SERVICE_METHODS, CLOSE_RESULTS, ARCHIVE_REASONS,
  RESUME_REASONS, RETURN_REASONS, RETURN_TARGET_NODES, MAX_RETURN_COUNT,
  DELEGATE_GROUPS, FEISHU_ESCALATE_CHANNEL, FEISHU_FEEDBACK_CATEGORIES,
} from '../composables/opActions';

const RESUME_AT_FORMAT = 'YYYY-MM-DD HH:mm';

const props = defineProps<{
  open: boolean;
  action: OpActionType | null;
  ticketNo: string;
  suspendInfo: SuspendInfo | null;
  returnCount: number;
  /** 消费者BG工单：升级通道开放「飞书项目·产研反馈单」 */
  feishuEligible?: boolean;
  /** 飞书关联进度：closed 时「升级到飞书」置灰不可再转 */
  feishuSync?: string;
  /** 转售后上下文（投诉分流 + 预填 + 已有关联售后单） */
  aftersaleContext?: AftersaleContext;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  confirm: [payload: Record<string, unknown>];
}>();

const transfer = reactive({ scope: 'same' as 'same' | 'cross', target: TRANSFER_TARGETS[0], reason: '' });
const delegate = reactive({ mode: 'person' as 'person' | 'group', target: DELEGATE_TARGETS[0], reason: '' });
const forceClose = reactive({ reason: '', approver: APPROVERS[0], detail: '' });
const suspend = reactive({ reason: '', detail: '', resumeAt: '' });

function resumeAtDayjs(value?: string): Dayjs | undefined {
  if (!value) return undefined;
  const parsed = dayjs(value, RESUME_AT_FORMAT);
  return parsed.isValid() ? parsed : undefined;
}

function onResumeAtChange(v: Dayjs | string | null) {
  if (!v) {
    suspend.resumeAt = '';
    return;
  }
  suspend.resumeAt = dayjs.isDayjs(v) ? v.format(RESUME_AT_FORMAT) : String(v);
}
const escalate = reactive({
  channel: ESCALATE_CHANNELS[0],
  group: ESCALATE_GROUPS[0],
  member: ESCALATE_MEMBERS[0],
  detail: '',
  syncContext: true,
  feedbackCategory: undefined as string | undefined,
});
const syncFeishu = reactive({ space: FEISHU_SPACES[0], message: '' });
const aftersale = reactive({ serviceType: AFTERSALE_SERVICE_TYPES[0], serviceMethod: AFTERSALE_SERVICE_METHODS[0], detail: '' });
/** 转售后上下文 & 分流判断 */
const asCtx = computed(() => props.aftersaleContext);
const asIsComplaint = computed(() => !!asCtx.value?.isComplaint);
const asExisting = computed(() => asCtx.value?.existing);
const resolve = reactive({ solution: '', createCallback: true });
const close = reactive({
  target: 'resolved' as 'resolved' | 'closed',
  result: '',
  solution: '',
});
const archive = reactive({ reason: ARCHIVE_REASONS[1], retention: '3y' });
const resume = reactive({ reason: '', detail: '' });
const returnForm = reactive({ reason: '', targetNode: RETURN_TARGET_NODES[0], note: '' });

const escalateToTech = computed(() => escalate.channel.includes('技术支持'));
const escalateToFeishu = computed(() => escalate.channel === FEISHU_ESCALATE_CHANNEL);

/** 升级通道选项：消费者BG工单把「飞书项目」置顶；飞书已结案时该通道禁用 */
const escalateChannelOptions = computed(() => {
  const base = [...ESCALATE_CHANNELS];
  const list = props.feishuEligible ? [FEISHU_ESCALATE_CHANNEL, ...base] : base;
  const feishuClosed = props.feishuSync === 'closed';
  return list.map((c) => ({
    value: c,
    label: c,
    disabled: c === FEISHU_ESCALATE_CHANNEL && feishuClosed,
  }));
});

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

// 飞书项目通道无子组别，隐藏组别/人员选择
const showEscalateGroup = computed(() => !escalateToFeishu.value && escalateGroupOptions.value.length > 0);

const delegateTargetOptions = computed(() => {
  const list = delegate.mode === 'person' ? DELEGATE_TARGETS : DELEGATE_GROUPS;
  return list.map((t) => ({ value: t, label: t }));
});

watch(() => delegate.mode, (mode) => {
  delegate.target = mode === 'person' ? DELEGATE_TARGETS[0] : DELEGATE_GROUPS[0];
});

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
  调剂: { title: '调剂工单', icon: SwapOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认调剂' },
  委派: { title: '委派工单', icon: TeamOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认委派' },
  下送: { title: '下送审核', icon: StopOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认下送' },
  强结: { title: '强制结案（强结）', icon: StopOutlined, tone: 'warn', width: 480, okTone: 'danger', okText: '提交强结审批' },
  挂起: { title: '挂起工单', icon: PauseCircleOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认挂起' },
  升级: { title: '升级工单', icon: RiseOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认升级' },
  同步飞书: { title: '同步飞书协同', icon: SyncOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认同步' },
  转售后: { title: '转售后处理', icon: ToolOutlined, tone: 'primary', width: 520, okTone: 'primary', okText: '确认转售后' },
  标记已解决: { title: '标记已解决', icon: CheckCircleOutlined, tone: 'success', width: 520, okTone: 'success', okText: '确认标记' },
  恢复: { title: '恢复工单', icon: PlayCircleOutlined, tone: 'success', width: 560, okTone: 'success', okText: '确认恢复' },
  退回: { title: '退回工单', icon: RollbackOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认退回' },
  关闭工单: { title: '关闭工单', icon: CloseCircleOutlined, tone: 'warn', width: 560, okTone: 'primary', okText: '确认关闭' },
  归档工单: { title: '归档工单', icon: InboxOutlined, tone: 'warn', width: 480, okTone: 'danger', okText: '确认归档' },
};

const cfg = computed<DlgConfig>(() => {
  const base = (props.action && DLG_CONFIG[props.action]) || {
    title: props.action ?? '', icon: undefined, tone: 'primary' as const, width: 480, okTone: 'primary' as const, okText: '确认',
  };
  // 升级 + 飞书项目通道：标题与主按钮切换为「升级到飞书项目」语义
  if (props.action === '升级' && escalateToFeishu.value) {
    return { ...base, title: '升级到飞书项目', okText: '确认升级飞书项目' };
  }
  return base;
});

function resetForms() {
  transfer.scope = 'same'; transfer.target = TRANSFER_TARGETS[0]; transfer.reason = '';
  delegate.mode = 'person'; delegate.target = DELEGATE_TARGETS[0]; delegate.reason = '';
  forceClose.reason = ''; forceClose.approver = APPROVERS[0]; forceClose.detail = '';
  suspend.reason = ''; suspend.detail = ''; suspend.resumeAt = '';
  // 飞书已结案：不可再选飞书通道，默认落到其他升级通道
  const canFeishuEscalate = props.feishuEligible && props.feishuSync !== 'closed';
  escalate.channel = canFeishuEscalate ? FEISHU_ESCALATE_CHANNEL : ESCALATE_CHANNELS[0];
  escalate.group = ESCALATE_GROUPS[0];
  escalate.member = ESCALATE_MEMBERS[0];
  escalate.detail = '';
  escalate.syncContext = true;
  escalate.feedbackCategory = undefined;
  syncFeishu.space = FEISHU_SPACES[0]; syncFeishu.message = '';
  aftersale.serviceType = AFTERSALE_SERVICE_TYPES[0]; aftersale.serviceMethod = AFTERSALE_SERVICE_METHODS[0]; aftersale.detail = '';
  resolve.solution = ''; resolve.createCallback = true;
  close.target = 'resolved'; close.result = ''; close.solution = '';
  archive.reason = ARCHIVE_REASONS[1]; archive.retention = '3y';
  resume.reason = ''; resume.detail = '';
  returnForm.reason = ''; returnForm.targetNode = RETURN_TARGET_NODES[0]; returnForm.note = '';
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
    case '委派':
      if (!delegate.target) { message.warning(delegate.mode === 'person' ? '请选择协助办理人' : '请选择协助办理组'); return false; }
      return true;
    case '挂起':
      if (!suspend.reason) { message.warning('请选择挂起原因'); return false; }
      return true;
    case '升级':
      if (escalateToFeishu.value && !escalate.feedbackCategory) {
        message.warning('请选择问题反馈分类');
        return false;
      }
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
    case '退回':
      if (props.returnCount >= MAX_RETURN_COUNT) {
        message.warning(`本工单已退回 ${MAX_RETURN_COUNT} 次，已达上限`);
        return false;
      }
      if (!returnForm.reason) { message.warning('请选择退回原因'); return false; }
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
    case '调剂': emit('confirm', { type: '调剂', data: { ...transfer } }); break;
    case '委派': emit('confirm', { type: '委派', data: { ...delegate } }); break;
    case '强结': emit('confirm', { type: '强结', data: { ...forceClose } }); break;
    case '挂起': emit('confirm', { type: '挂起', data: { ...suspend } }); break;
    case '升级': emit('confirm', { type: '升级', data: { ...escalate } }); break;
    case '同步飞书': emit('confirm', { type: '同步飞书', data: { ...syncFeishu } }); break;
    case '转售后': emit('confirm', { type: '转售后', data: { ...aftersale } }); break;
    case '标记已解决': emit('confirm', { type: '标记已解决', data: { ...resolve } }); break;
    case '恢复': emit('confirm', { type: '恢复', data: { ...resume } }); break;
    case '退回': emit('confirm', { type: '退回', data: { ...returnForm } }); break;
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
    <!-- 调剂 -->
    <div v-if="action === '调剂'" class="op-form">
      <div class="op-field">
        <div class="op-label">调剂范围</div>
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
        <div class="op-label">调剂原因</div>
        <a-textarea v-model:value="transfer.reason" :rows="2" placeholder="请输入调剂原因..." />
      </div>
      <div class="op-tip op-tip-info">调剂变更当前处理人，工单状态仍为「处理中」；48 小时未响应将自动回滚。</div>
    </div>

    <!-- 委派 -->
    <div v-else-if="action === '委派'" class="op-form">
      <div class="op-field">
        <div class="op-label req">委派方式</div>
        <a-radio-group v-model:value="delegate.mode">
          <a-radio value="person">委派到人</a-radio>
          <a-radio value="group">委派到组</a-radio>
        </a-radio-group>
      </div>
      <div class="op-field">
        <div class="op-label req">{{ delegate.mode === 'person' ? '协助办理人' : '协助办理组' }}</div>
        <a-select v-model:value="delegate.target" :options="delegateTargetOptions" style="width:100%" />
      </div>
      <div class="op-field">
        <div class="op-label">委派说明</div>
        <a-textarea v-model:value="delegate.reason" :rows="2" placeholder="请说明需协助的内容..." />
      </div>
      <div class="op-tip op-tip-info">委派 ≠ 调剂：主责仍在您名下；协办人/组处理完成后，工单回到您处继续处理。</div>
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
        <a-textarea v-model:value="suspend.detail" :rows="2" placeholder="请补充说明..." />
      </div>
      <div class="op-field">
        <div class="op-label">预计恢复时间</div>
        <a-date-picker
          :value="resumeAtDayjs(suspend.resumeAt)"
          show-time
          :show-time="{ format: 'HH:mm' }"
          :format="RESUME_AT_FORMAT"
          placeholder="请选择预计恢复时间"
          style="width: 100%"
          @update:value="onResumeAtChange"
        />
      </div>
    </div>

    <!-- 升级 -->
    <div v-else-if="action === '升级'" class="op-form">
      <div class="op-field-row">
        <div class="op-field">
          <div class="op-label req">升级通道</div>
          <a-select
            v-model:value="escalate.channel"
            style="width:100%"
            :options="escalateChannelOptions"
          />
        </div>
        <div v-if="escalateToFeishu" class="op-field">
          <div class="op-label req">问题反馈分类</div>
          <a-select
            v-model:value="escalate.feedbackCategory"
            placeholder="请选择问题反馈分类"
            style="width:100%"
            :options="FEISHU_FEEDBACK_CATEGORIES.map((c) => ({ value: c, label: c }))"
          />
        </div>
        <div v-else-if="showEscalateGroup" class="op-field">
          <div class="op-label req">目标组别</div>
          <a-select
            v-model:value="escalate.group"
            style="width:100%"
            :options="escalateGroupOptions"
          />
        </div>
      </div>

      <!-- 飞书项目通道：一句说明 + 升级说明；其余建单要素后台自动带入 -->
      <template v-if="escalateToFeishu">
        <div class="op-tip op-tip-info">确认后将在飞书项目创建「客户反馈单」，并自动带入本单标题、产品、优先级等。</div>
        <div class="op-field">
          <div class="op-label">升级说明</div>
          <a-textarea v-model:value="escalate.detail" :rows="2" placeholder="补充给产研的说明，如复现步骤、影响范围…" />
        </div>
      </template>

      <!-- 其他通道：保持原升级表单 -->
      <template v-else>
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
      </template>
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
      <!-- 分流提示：投诉=建关联单独立跑 / 非诉=转出即关 -->
      <div class="op-tip" :class="asIsComplaint ? 'op-tip-warn' : 'op-tip-ok'">
        <template v-if="asIsComplaint">
          <b>投诉工单</b>：建关联售后单，<b>投诉单独立继续跟进</b>（不关闭），售后结果回传参考。
        </template>
        <template v-else>
          <b>非投诉工单</b>：转出后原客服单标记「已转售后」<b>并关闭</b>，进「已办」。
        </template>
      </div>

      <!-- 已有关联售后单 → 激活；无 → 建单预填 -->
      <div v-if="asExisting" class="op-box op-box-warn">
        <div class="op-box-title">已有关联售后单</div>
        <div class="op-box-line">单号 {{ asExisting.no }} · {{ asExisting.serviceType }}——确认后将<b>激活</b>该售后单至待接单，不重复建单。</div>
      </div>
      <template v-else>
        <div class="op-box">
          <div class="op-box-title">将带入售后建单页（预填，只读）</div>
          <div class="op-prefill">
            <div><span>客户</span>{{ asCtx?.customerName }} · {{ asCtx?.customerPhone || '—' }}</div>
            <div><span>地址</span>{{ asCtx?.region }} {{ asCtx?.address }}</div>
            <div><span>产品</span>{{ asCtx?.productCategory }} / {{ asCtx?.productName }}<template v-if="asCtx?.sn"> · SN {{ asCtx?.sn }}</template></div>
          </div>
          <div class="op-prefill-note">地址 / SN 带不出时售后页可留空补填（转单放宽必填）。</div>
        </div>
        <div class="op-field-row">
          <div class="op-field">
            <div class="op-label req">售后服务类型</div>
            <a-select v-model:value="aftersale.serviceType" :options="AFTERSALE_SERVICE_TYPES.map((v) => ({ value: v, label: v }))" style="width:100%" />
          </div>
          <div class="op-field">
            <div class="op-label req">售后服务方式</div>
            <a-select v-model:value="aftersale.serviceMethod" :options="AFTERSALE_SERVICE_METHODS.map((v) => ({ value: v, label: v }))" style="width:100%" />
          </div>
        </div>
      </template>
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

    <!-- 退回 -->
    <div v-else-if="action === '退回'" class="op-form">
      <div class="op-field">
        <div class="op-label req">退回原因</div>
        <a-select v-model:value="returnForm.reason" placeholder="请选择..." style="width:100%"
          :options="RETURN_REASONS.map((r) => ({ value: r, label: r }))" />
      </div>
      <div class="op-field">
        <div class="op-label">补充说明</div>
        <a-textarea v-model:value="returnForm.note" :rows="2" placeholder="请说明退回原因..." />
      </div>
    </div>

    <!-- 关闭工单 -->
    <div v-else-if="action === '关闭工单'" class="op-form">
      <div class="op-field">
        <div class="op-label req">状态落点</div>
        <a-radio-group v-model:value="close.target" class="op-radio-cards op-radio-cards--row">
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
