<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import {
  SwapOutlined, TeamOutlined, StopOutlined, PauseCircleOutlined,
  PlayCircleOutlined, RiseOutlined, SyncOutlined, ToolOutlined,
  CheckCircleOutlined, CloseCircleOutlined, InboxOutlined, RollbackOutlined, CloseOutlined, PlusOutlined,
} from '@ant-design/icons-vue';
import { useUserStore } from '@/stores/user';
import OpActionModal from './operation/OpActionModal.vue';
import AftersaleCreateForm from './operation/AftersaleCreateForm.vue';
import type { SuspendInfo, OpActionType, AftersaleContext } from '../composables/opActions';
import {
  TRANSFER_TARGETS_SAME, TRANSFER_TARGET_GROUPS, CROSS_GROUP_TRANSFER_ROLES,
  DELEGATE_TARGETS, REVIEWERS, FORCE_CLOSE_REASONS, APPROVERS,
  SUSPEND_REASONS, ESCALATE_CHANNELS, ESCALATE_GROUPS, ESCALATE_MEMBERS,
  FEISHU_SPACES, AFTERSALE_SERVICE_TYPES, AFTERSALE_SERVICE_METHODS, CLOSE_REASONS, ARCHIVE_REASONS,
  RESUME_REASONS, RETURN_REASONS, MAX_RETURN_COUNT,
  DELEGATE_GROUPS, FEISHU_ESCALATE_CHANNEL, FEISHU_FEEDBACK_CATEGORIES,
  APPROVAL_GROUPS,
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
  /** 处理表单现值：挂起申请需校验服务类型/服务方式，弹窗内带出并可补齐 */
  serviceType?: string;
  serviceMethod?: string;
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  confirm: [payload: Record<string, unknown>];
}>();

const user = useUserStore();
const transfer = reactive({ scope: 'same' as 'same' | 'cross', target: TRANSFER_TARGETS_SAME[0], reason: '' });

/** 跨组调剂权限：处理人仅同组，班组长/运营及以上可跨组 */
const canCrossGroup = computed(() => CROSS_GROUP_TRANSFER_ROLES.includes(user.roleKey));

const transferToGroup = computed(() => transfer.scope === 'cross');

/** 同组内→选人；跨组→选组（不指定组内的人） */
const transferTargetOptions = computed(() =>
  (transferToGroup.value ? TRANSFER_TARGET_GROUPS : TRANSFER_TARGETS_SAME)
    .map((t) => ({ value: t, label: t })),
);

/** 切换范围后重置为新候选首项，避免残留上一范围的目标 */
watch(() => transfer.scope, (scope) => {
  transfer.target = scope === 'same' ? TRANSFER_TARGETS_SAME[0] : TRANSFER_TARGET_GROUPS[0];
});
let delegateTaskSeq = 0;
function createDelegateTask(name = '', task = '') {
  delegateTaskSeq += 1;
  return { id: `dt-${delegateTaskSeq}`, name, task };
}
const delegate = reactive({
  mode: 'person' as 'person' | 'group',
  /** 委派到人：逐条添加的任务行 */
  tasks: [createDelegateTask()] as { id: string; name: string; task: string }[],
  /** 委派到组：单组 */
  group: DELEGATE_GROUPS[0],
  /** 委派到组：整体任务说明 */
  reason: '',
});
const forceClose = reactive({ reason: '', approver: APPROVERS[0], detail: '' });
const suspend = reactive({ reason: '', detail: '', resumeAt: '', approvalGroup: APPROVAL_GROUPS[0] });

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
  feedbackCategory: FEISHU_FEEDBACK_CATEGORIES[0] as string | undefined,
});
const syncFeishu = reactive({ space: FEISHU_SPACES[0], message: '' });
const aftersale = reactive({ serviceType: AFTERSALE_SERVICE_TYPES[0], serviceMethod: AFTERSALE_SERVICE_METHODS[0], detail: '' });
/** 转售后上下文 & 分流判断 */
const asCtx = computed(() => props.aftersaleContext);
const asIsComplaint = computed(() => !!asCtx.value?.isComplaint);
const aftersaleFormRef = ref<{ getPayload: () => { serviceType: string; serviceMethod: string; detail: string } } | null>(null);
const resolve = reactive({ solution: '', createCallback: true });
const close = reactive({ reason: '', approvalGroup: APPROVAL_GROUPS[0], note: '' });
const archive = reactive({ reason: ARCHIVE_REASONS[1], retention: '3y' });
const resume = reactive({ reason: '', detail: '' });
const returnForm = reactive({ reason: '', note: '' });

const escalateToTech = computed(() => escalate.channel.includes('技术支持'));
const escalateToFeishu = computed(() => escalate.channel === FEISHU_ESCALATE_CHANNEL);

function filterMemberOption(input: string, option?: { label?: string; value?: string }) {
  const q = input.trim().toLowerCase();
  const text = String(option?.label ?? option?.value ?? '');
  return text.toLowerCase().includes(q);
}

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

const delegateGroupOptions = computed(() =>
  DELEGATE_GROUPS.map((t) => ({ value: t, label: t })),
);

/** 同一人不可被多条任务重复选中 */
function delegatePersonOptionsFor(rowId: string) {
  const taken = new Set(
    delegate.tasks.filter((t) => t.id !== rowId && t.name).map((t) => t.name),
  );
  return DELEGATE_TARGETS.map((t) => ({
    value: t,
    label: t,
    disabled: taken.has(t),
  }));
}

function addDelegateTask() {
  delegate.tasks.push(createDelegateTask());
}

function removeDelegateTask(id: string) {
  if (delegate.tasks.length <= 1) {
    delegate.tasks.splice(0, 1, createDelegateTask());
    return;
  }
  const idx = delegate.tasks.findIndex((t) => t.id === id);
  if (idx >= 0) delegate.tasks.splice(idx, 1);
}

function resetDelegateTasks() {
  delegate.tasks.splice(0, delegate.tasks.length, createDelegateTask());
}

const delegateOkDisabled = computed(() => {
  if (props.action !== '委派') return false;
  if (delegate.mode === 'person') {
    return delegate.tasks.some((t) => !t.name || !t.task.trim());
  }
  return !delegate.group || !delegate.reason.trim();
});

watch(() => delegate.mode, (mode) => {
  if (mode === 'person') {
    resetDelegateTasks();
    delegate.reason = '';
  } else if (!delegate.group) {
    delegate.group = DELEGATE_GROUPS[0];
  }
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
  委派: { title: '委派工单', icon: TeamOutlined, tone: 'primary', width: 560, okTone: 'primary', okText: '确认委派' },
  下送: { title: '下送审核', icon: StopOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认下送' },
  强结: { title: '强结', icon: StopOutlined, tone: 'warn', width: 480, okTone: 'danger', okText: '提交强结审批' },
  挂起: { title: '挂起工单', icon: PauseCircleOutlined, tone: 'warn', width: 520, okTone: 'primary', okText: '提交挂起申请' },
  升级: { title: '升级工单', icon: RiseOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认升级' },
  同步飞书: { title: '同步飞书协同', icon: SyncOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认同步' },
  转售后: { title: '转售后处理', icon: ToolOutlined, tone: 'primary', width: 640, okTone: 'primary', okText: '确认转售后' },
  标记已解决: { title: '标记已解决', icon: CheckCircleOutlined, tone: 'success', width: 520, okTone: 'success', okText: '确认标记' },
  恢复: { title: '解除挂起', icon: PlayCircleOutlined, tone: 'success', width: 560, okTone: 'success', okText: '确认解除' },
  退回: { title: '退回工单', icon: RollbackOutlined, tone: 'primary', width: 480, okTone: 'primary', okText: '确认退回' },
  关闭工单: { title: '关闭工单', icon: CloseCircleOutlined, tone: 'warn', width: 520, okTone: 'primary', okText: '提交关闭审核' },
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
  transfer.scope = 'same'; transfer.target = TRANSFER_TARGETS_SAME[0]; transfer.reason = '';
  delegate.mode = 'person';
  resetDelegateTasks();
  delegate.group = DELEGATE_GROUPS[0];
  delegate.reason = '';
  forceClose.reason = ''; forceClose.approver = APPROVERS[0]; forceClose.detail = '';
  suspend.reason = ''; suspend.detail = ''; suspend.resumeAt = '';
  suspend.approvalGroup = APPROVAL_GROUPS[0];
  // 飞书已结案：不可再选飞书通道，默认落到其他升级通道
  const canFeishuEscalate = props.feishuEligible && props.feishuSync !== 'closed';
  escalate.channel = canFeishuEscalate ? FEISHU_ESCALATE_CHANNEL : ESCALATE_CHANNELS[0];
  escalate.group = ESCALATE_GROUPS[0];
  escalate.member = ESCALATE_MEMBERS[0];
  escalate.detail = '';
  escalate.feedbackCategory = FEISHU_FEEDBACK_CATEGORIES[0];
  syncFeishu.space = FEISHU_SPACES[0]; syncFeishu.message = '';
  aftersale.serviceType = AFTERSALE_SERVICE_TYPES[0]; aftersale.serviceMethod = AFTERSALE_SERVICE_METHODS[0]; aftersale.detail = '';
  resolve.solution = ''; resolve.createCallback = true;
  close.reason = ''; close.approvalGroup = APPROVAL_GROUPS[0]; close.note = '';
  archive.reason = ARCHIVE_REASONS[1]; archive.retention = '3y';
  resume.reason = ''; resume.detail = '';
  returnForm.reason = ''; returnForm.note = '';
}

watch(() => props.open, (v) => { if (v) resetForms(); });

function closeModal() {
  emit('update:open', false);
}

function validate(): boolean {
  switch (props.action) {
    case '调剂':
      if (transfer.scope === 'cross' && !canCrossGroup.value) {
        message.warning('仅班组长 / 运营管理员可跨组调剂');
        return false;
      }
      if (!transfer.target) {
        message.warning(transferToGroup.value ? '请选择目标处理组' : '请选择目标处理人');
        return false;
      }
      return true;
    case '强结':
      if (!forceClose.reason) { message.warning('请选择强结原因'); return false; }
      return true;
    case '委派':
      if (delegate.mode === 'person') {
        if (delegate.tasks.some((t) => !t.name)) { message.warning('请为每条委派任务选择协助办理人'); return false; }
        if (delegate.tasks.some((t) => !t.task.trim())) {
          message.warning('请为每条委派任务填写任务说明');
          return false;
        }
      } else {
        if (!delegate.group) { message.warning('请选择协助办理组'); return false; }
        if (!delegate.reason.trim()) { message.warning('请填写任务说明'); return false; }
      }
      return true;
    case '挂起':
      if (!suspend.reason) { message.warning('请选择挂起原因'); return false; }
      if (!suspend.approvalGroup) { message.warning('请选择审批组'); return false; }
      // 校验处理表单的服务类型/服务方式：挂起停表、恢复后按「服务方式×优先级」矩阵续算，缺值则算不出续走时长
      if (!props.serviceType) { message.warning('请先在处理表单填写「服务类型」后再申请挂起'); return false; }
      if (!props.serviceMethod) { message.warning('请先在处理表单填写「服务方式」后再申请挂起'); return false; }
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
      if (!resume.reason) { message.warning('请选择解除原因'); return false; }
      return true;
    case '退回':
      if (props.returnCount >= MAX_RETURN_COUNT) {
        message.warning(`本工单已退回 ${MAX_RETURN_COUNT} 次，已达上限`);
        return false;
      }
      if (!returnForm.reason) { message.warning('请选择退回原因'); return false; }
      return true;
    case '关闭工单':
      if (!close.reason) { message.warning('请选择关闭原因'); return false; }
      if (!close.approvalGroup) { message.warning('请选择审核组'); return false; }
      return true;
  }
  return true;
}

function onOk() {
  if (!validate()) return;
  switch (props.action) {
    case '调剂': emit('confirm', { type: '调剂', data: { ...transfer } }); break;
    case '委派': {
      const data = delegate.mode === 'person'
        ? {
            mode: 'person' as const,
            target: delegate.tasks.map((t) => t.name).join('、'),
            reason: '',
            assignees: delegate.tasks.map((t) => ({ name: t.name, task: t.task.trim() })),
          }
        : {
            mode: 'group' as const,
            target: delegate.group,
            reason: delegate.reason.trim(),
          };
      emit('confirm', { type: '委派', data });
      break;
    }
    case '强结': emit('confirm', { type: '强结', data: { ...forceClose } }); break;
    // 服务类型/方式取处理表单现值（弹窗不重复放字段，仅在提交时校验其非空）
    case '挂起': emit('confirm', {
      type: '挂起',
      data: { ...suspend, serviceType: props.serviceType ?? '', serviceMethod: props.serviceMethod ?? '' },
    }); break;
    case '升级': emit('confirm', { type: '升级', data: { ...escalate } }); break;
    case '同步飞书': emit('confirm', { type: '同步飞书', data: { ...syncFeishu } }); break;
    case '转售后': {
      // 只有新建分支：已有 1:1 关联时入口已置灰（D2 改写，激活分支取消）
      const data = aftersaleFormRef.value?.getPayload() ?? { ...aftersale };
      emit('confirm', { type: '转售后', data });
      break;
    }
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
    :ok-disabled="delegateOkDisabled"
    @update:open="emit('update:open', $event)"
    @ok="onOk"
    @cancel="closeModal"
  >
    <!-- 调剂 -->
    <div v-if="action === '调剂'" class="op-form">
      <div class="op-field">
        <div class="op-label req">调剂范围</div>
        <a-radio-group v-model:value="transfer.scope">
          <a-radio value="same">同组内（调剂到人）</a-radio>
          <a-radio
            value="cross"
            :disabled="!canCrossGroup"
            :title="canCrossGroup ? undefined : '仅班组长 / 运营管理员可跨组调剂'"
          >跨组（调剂到组）</a-radio>
        </a-radio-group>
        <div v-if="!canCrossGroup" class="op-hint">仅班组长 / 运营管理员可跨组调剂</div>
      </div>
      <div class="op-field">
        <div class="op-label req">{{ transferToGroup ? '目标处理组' : '目标处理人' }}</div>
        <a-select
          v-model:value="transfer.target"
          show-search
          :filter-option="filterMemberOption"
          :placeholder="transferToGroup ? '请选择目标处理组' : '请选择目标处理人'"
          style="width:100%"
          :options="transferTargetOptions"
        />
        <div v-if="transferToGroup" class="op-hint">
          跨组调剂到组，不指定组内具体处理人；工单转入该组工单池，由组内领取。
        </div>
      </div>
      <div class="op-field">
        <div class="op-label">调剂原因</div>
        <a-textarea v-model:value="transfer.reason" :rows="2" placeholder="请输入调剂原因..." />
      </div>
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

      <template v-if="delegate.mode === 'person'">
        <div class="op-field">
          <div class="op-delegate-head">
            <div class="op-label req">委派任务（每人一条，任务说明独立填写）</div>
            <button type="button" class="op-delegate-add" @click="addDelegateTask">
              <PlusOutlined /> 添加委派任务
            </button>
          </div>
          <div class="op-delegate-list">
            <div
              v-for="(item, idx) in delegate.tasks"
              :key="item.id"
              class="op-delegate-card"
            >
              <div class="op-delegate-row">
                <span class="op-delegate-idx">{{ idx + 1 }}</span>
                <a-select
                  v-model:value="item.name"
                  :show-search="true"
                  option-filter-prop="label"
                  :filter-option="filterMemberOption"
                  placeholder="选择协助办理人"
                  class="op-delegate-person"
                  :options="delegatePersonOptionsFor(item.id)"
                  allow-clear
                />
                <a-textarea
                  v-model:value="item.task"
                  class="op-delegate-task"
                  :auto-size="{ minRows: 1, maxRows: 3 }"
                  placeholder="该人的任务说明…"
                />
                <button
                  v-if="delegate.tasks.length > 1"
                  type="button"
                  class="op-delegate-remove"
                  title="移除该条"
                  @click="removeDelegateTask(item.id)"
                >
                  <CloseOutlined />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="op-field">
          <div class="op-label req">协助办理组</div>
          <a-select
            v-model:value="delegate.group"
            :show-search="true"
            option-filter-prop="label"
            :filter-option="filterMemberOption"
            style="width:100%"
            :options="delegateGroupOptions"
          />
        </div>
        <div class="op-field">
          <div class="op-label req">任务说明</div>
          <a-textarea v-model:value="delegate.reason" :rows="2" placeholder="请说明需协助的内容..." />
        </div>
      </template>
    </div>

    <!-- 强结 -->
    <div v-else-if="action === '强结'" class="op-form">
      <div class="op-field">
        <div class="op-label req">强结原因</div>
        <a-select v-model:value="forceClose.reason" placeholder="请选择..." style="width:100%"
          :options="FORCE_CLOSE_REASONS.map((r) => ({ value: r, label: r }))" />
      </div>
      <div class="op-field">
        <div class="op-label req">审批人</div>
        <a-select
          v-model:value="forceClose.approver"
          :show-search="true"
          option-filter-prop="label"
          :filter-option="filterMemberOption"
          style="width:100%"
          :options="APPROVERS.map((r) => ({ value: r, label: r }))"
        />
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
      <div class="op-field-row">
        <div class="op-field">
          <div class="op-label req">审批组</div>
          <a-select
            v-model:value="suspend.approvalGroup"
            :show-search="true"
            option-filter-prop="label"
            :filter-option="filterMemberOption"
            style="width:100%"
            :options="APPROVAL_GROUPS.map((g) => ({ value: g, label: g }))"
          />
        </div>
        <div class="op-field">
          <div class="op-label">预计恢复时间</div>
          <a-date-picker
            :value="resumeAtDayjs(suspend.resumeAt)"
            :show-time="{ format: 'HH:mm' }"
            :format="RESUME_AT_FORMAT"
            placeholder="请选择预计恢复时间"
            style="width: 100%"
            @update:value="onResumeAtChange"
          />
        </div>
      </div>
      <div class="op-field">
        <div class="op-label">详细说明</div>
        <a-textarea v-model:value="suspend.detail" :rows="2" placeholder="请补充说明..." />
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
            :show-search="true"
            option-filter-prop="label"
            :filter-option="filterMemberOption"
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
            <a-select
              v-model:value="escalate.member"
              show-search
              :filter-option="filterMemberOption"
              style="width:100%"
              :options="ESCALATE_MEMBERS.map((m) => ({ value: m, label: m }))"
            />
          </div>
        </template>
        <div class="op-field">
          <div class="op-label">升级说明</div>
          <a-textarea v-model:value="escalate.detail" :rows="2" placeholder="请填写升级说明..." />
        </div>
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
      <!-- 已有 1:1 关联时按钮已置灰、走不到本弹窗，故只保留新建形态（内嵌售后建单页复刻，预填） -->
      <AftersaleCreateForm ref="aftersaleFormRef" :context="aftersaleContext" />
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
        <div class="op-label req">解除原因</div>
        <a-select v-model:value="resume.reason" placeholder="请选择..." style="width:100%"
          :options="RESUME_REASONS.map((r) => ({ value: r, label: r }))" />
      </div>
      <div class="op-field">
        <div class="op-label">详细说明</div>
        <a-textarea v-model:value="resume.detail" :rows="2" placeholder="请描述解除原因和后续处理计划..." />
      </div>
      <div class="op-tip op-tip-ok">解除挂起后 SLA 按剩余续走</div>
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
        <div class="op-label req">关闭原因</div>
        <a-select
          v-model:value="close.reason"
          placeholder="请选择关闭原因"
          style="width:100%"
          :options="CLOSE_REASONS.map((r) => ({ value: r, label: r }))"
        />
      </div>
      <div class="op-field">
        <div class="op-label req">审核组</div>
        <a-select
          v-model:value="close.approvalGroup"
          style="width:100%"
          :options="APPROVAL_GROUPS.map((g) => ({ value: g, label: g }))"
        />
      </div>
      <div class="op-field">
        <div class="op-label">备注</div>
        <a-textarea v-model:value="close.note" :rows="3" placeholder="请补充关闭说明，供审核人判断..." />
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
