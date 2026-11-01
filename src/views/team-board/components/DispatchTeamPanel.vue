<script setup lang="ts">
/**
 * 【1215】班组看板 · 本组派单（PRD 5.4 / 6.5 / 7.5 / 8 / 9.3）。
 *
 * 班组长视角：本组开关、本组形态（正常态 ⇄ 降级态；停派态由管理员控制）、
 * 本组成员（签入状态、在途 / 上限、超限 / 超额指派、熟练度、画像配置、个人开关）及其维护，
 * 本组池待领工单与组内指派。组取当前登录人任班组长的派单组。
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { PoweroffOutlined, SwapOutlined, ControlOutlined } from '@ant-design/icons-vue';
import OpActionModal from '@/views/tickets/components/operation/OpActionModal.vue';
import DispatchAssignModal from './DispatchAssignModal.vue';
import DispatchProfileDrawer from './DispatchProfileDrawer.vue';
import { TICKETS } from '@/mock/tickets';
import { useDispatchStore } from '@/stores/dispatch';
import { useUserStore } from '@/stores/user';
import type { Ticket } from '@/views/tickets/types/ticket';
import { slaUrgencyCompare } from '@/views/tickets/types/ticket';
import type { PoolMode } from '@/views/tickets/types/dispatch';
import {
  DISPATCH_STATUS_ORDER, DISPATCH_STATUS_STYLE, MODE_TAG_STYLE, SIGN_IN_COLOR,
  groupModeDisabledTip, groupSwitchDisabledTip, modeTagOf, personalSwitchDisabledTip, reserveTipOf,
  waitMinutesOf, waitText,
} from '@/views/tickets/composables/dispatchUi';

const router = useRouter();
const dispatch = useDispatchStore();
const user = useUserStore();

const nowMs = ref(Date.now());
const timer = window.setInterval(() => { nowMs.value = Date.now(); }, 30_000);
onBeforeUnmount(() => window.clearInterval(timer));

/* ---------------- 本人任班组长的派单组 ---------------- */

const myGroups = computed(() => dispatch.groups.filter((g) => g.leaders.includes(user.name)));
const groupId = ref<string | null>(null);
watch(myGroups, (gs) => {
  if (!gs.some((g) => g.id === groupId.value)) groupId.value = gs[0]?.id ?? null;
}, { immediate: true });
const group = computed(() => (groupId.value ? dispatch.groupOf(groupId.value) : undefined));

const poolView = computed(() => {
  void nowMs.value;
  void dispatch.ticketStates;
  return dispatch.poolViews().find((p) => p.id === groupId.value);
});
const effectiveTag = computed(() => (groupId.value ? modeTagOf(dispatch.effectiveModeOf(groupId.value)) : null));

const tab = ref<'members' | 'pool'>('members');

/** 外部入口（「去指派」）：切到池内工单 */
function showPool() {
  tab.value = 'pool';
}
defineExpose({ showPool });

/* ---------------- 班组开关（8.2） ---------------- */

const switchTip = computed(() => (groupId.value ? groupSwitchDisabledTip(groupId.value) : ''));
const switchConfirmOpen = ref(false);

function onSwitchChange(on: boolean) {
  const g = group.value;
  if (!g) return;
  if (!on) {
    switchConfirmOpen.value = true;
    return;
  }
  const res = dispatch.setGroupSwitch(g.id, true, user.name);
  if (res.ok) message.success(res.message);
  else if (res.message) message.warning(res.message);
}
function onSwitchOffConfirm() {
  const g = group.value;
  if (!g) return;
  const res = dispatch.setGroupSwitch(g.id, false, user.name);
  switchConfirmOpen.value = false;
  if (res.ok) message.success(res.message);
  else if (res.message) message.warning(res.message);
}

/* ---------------- 本组形态（5.4） ---------------- */

const modeTip = computed(() => (groupId.value ? groupModeDisabledTip(groupId.value) : ''));
const modeOpen = ref(false);
const modeTarget = ref<PoolMode | undefined>(undefined);
const modeReason = ref('');
/** 班组长只出正常态、降级态，不含当前形态 */
const modeOptions = computed(() => (['正常态', '降级态'] as PoolMode[]).filter((m) => m !== group.value?.mode));

function openMode() {
  if (modeTip.value) return;
  modeTarget.value = modeOptions.value.length === 1 ? modeOptions.value[0] : undefined;
  modeReason.value = '';
  modeOpen.value = true;
}
function onModeOk() {
  const g = group.value;
  if (!g) return;
  if (!modeTarget.value) {
    message.warning('请选择切换后的形态');
    return;
  }
  if (modeTarget.value !== '正常态' && !modeReason.value.trim()) {
    message.warning('请填写切换原因');
    return;
  }
  if (modeReason.value.length > 200) {
    message.warning('切换原因最多 200 字');
    return;
  }
  const res = dispatch.setGroupMode(g.id, modeTarget.value, modeReason.value, user.name);
  if (!res.ok) {
    if (res.message) message.warning(res.message);
    return;
  }
  modeOpen.value = false;
  message.success(res.message);
}

/* ---------------- 本组成员 ---------------- */

const members = computed(() => {
  void dispatch.ticketStates;
  void nowMs.value;
  if (!groupId.value) return [];
  return dispatch.membersOf(groupId.value)
    .map((a) => dispatch.agentView(a.name)!)
    .filter(Boolean);
});

function profileSummary(name: string): string {
  const a = dispatch.agentOf(name);
  if (!a) return '';
  const parts: string[] = [];
  const p = a.profile;
  const label: Record<string, string> = { businessTypes: '业务', ticketTypes: '类型', products: '产品', problems: '问题', customerTypes: '客户' };
  for (const [k, v] of Object.entries(p)) {
    if (v === 'any' || v === null) continue;
    const names = (v as (string | { category: string; name?: string })[]).map((x) => (typeof x === 'string' ? x : x.name ?? x.category));
    parts.push(`${label[k]}：${names.join('、')}`);
  }
  return parts.length ? parts.join('；') : '全部不限';
}

function onPersonalSwitch(name: string, on: boolean) {
  const res = dispatch.setPersonalSwitch(name, on, user.name);
  if (res.ok && res.message) message.success(res.message);
  else if (!res.ok && res.message) message.warning(res.message);
}

/* 画像 */
const profileOpen = ref(false);
const profileName = ref<string | null>(null);
function openProfile(name: string) {
  profileName.value = name;
  profileOpen.value = true;
}

/* 个人上限（7.5） */
const capOpen = ref(false);
const capName = ref<string | null>(null);
const capValue = ref<number | null>(null);
const capView = computed(() => {
  void dispatch.agents;
  return capName.value ? dispatch.agentView(capName.value) : undefined;
});
function openCap(name: string) {
  capName.value = name;
  capValue.value = dispatch.agentOf(name)?.capOverride ?? null;
  capOpen.value = true;
}
function saveCap(force = false) {
  const name = capName.value;
  if (!name) return;
  const v = capValue.value;
  const res = dispatch.setCapOverride(name, v, { force, operator: user.name });
  if (res.needConfirm) {
    Modal.confirm({
      title: '调整个人上限',
      content: res.needConfirm,
      okText: '仍要保存',
      cancelText: '取消',
      onOk: () => saveCap(true),
    });
    return;
  }
  if (!res.ok) {
    if (res.message) message.warning(res.message);
    return;
  }
  capOpen.value = false;
  message.success(res.message);
}

/* ---------------- 本组池待领工单 · 指派（9.3） ---------------- */

const reactiveTickets = reactive(TICKETS) as Ticket[];
const poolTickets = computed(() => {
  void dispatch.ticketStates;
  const gid = groupId.value;
  if (!gid) return [];
  const rankOf = (t: Ticket) => DISPATCH_STATUS_ORDER[dispatch.dispatchStatusOf(t.no) ?? ''] ?? 3;
  return reactiveTickets
    .filter((t) => t.groupId === gid && t.tab === 'pool' && t.assignee === null && !t.archived && !t.isDraft)
    .sort((a, b) => rankOf(a) - rankOf(b) || slaUrgencyCompare(a, b));
});

const assignOpen = ref(false);
const assignTicket = ref<Ticket | null>(null);
function openAssign(t: Ticket) {
  assignTicket.value = t;
  assignOpen.value = true;
}

function slaText(t: Ticket): string {
  if (t.responded || !t.slaMinutes || t.slaMinutes >= 9000) return '—';
  if (t.slaMinutes < 0) return `超时 ${Math.abs(t.slaMinutes)} 分钟`;
  return `剩余 ${t.slaMinutes} 分钟`;
}

const memberCols = 'minmax(132px, 1.2fr) 84px minmax(150px, 1.2fr) 72px minmax(180px, 2fr) 84px 148px';
const poolCols = 'minmax(190px, 1.4fr) minmax(160px, 2fr) 60px 120px 104px 120px 76px';
</script>

<template>
  <div v-if="group" class="card dtp">
    <div class="card-hd">
      <div class="hd-main">
        <h3 class="hd-title">本组派单</h3>
        <div class="dtp-groups" role="tablist">
          <button
            v-for="g in myGroups"
            :key="g.id"
            type="button"
            class="dtp-group"
            :class="{ on: g.id === groupId }"
            @click="groupId = g.id"
          >
            {{ dispatch.poolLabel(g.id) }}
            <span
              v-if="modeTagOf(dispatch.effectiveModeOf(g.id))"
              class="dtp-tag"
              :style="{
                color: MODE_TAG_STYLE[modeTagOf(dispatch.effectiveModeOf(g.id))!].color,
                background: MODE_TAG_STYLE[modeTagOf(dispatch.effectiveModeOf(g.id))!].bg,
                borderColor: MODE_TAG_STYLE[modeTagOf(dispatch.effectiveModeOf(g.id))!].border,
              }"
            >{{ modeTagOf(dispatch.effectiveModeOf(g.id)) }}</span>
          </button>
        </div>
      </div>
      <div class="hd-actions">
        <div class="dtp-ctl">
          <span class="dtp-ctl-label">本组开关</span>
          <a-tooltip :title="switchTip || undefined">
            <a-switch
              :checked="group.switchOn"
              :disabled="!!switchTip"
              size="small"
              @update:checked="(v: unknown) => onSwitchChange(v === true)"
            />
          </a-tooltip>
        </div>
        <div class="dtp-ctl">
          <span class="dtp-ctl-label">本组形态</span>
          <span class="dtp-mode">{{ group.mode }}</span>
          <a-tooltip :title="modeTip || undefined">
            <button type="button" class="btn-ghost" :disabled="!!modeTip" @click="openMode">
              <SwapOutlined /> 切换形态
            </button>
          </a-tooltip>
        </div>
        <div class="tabs">
          <div class="tab" :class="{ on: tab === 'members' }" @click="tab = 'members'">成员</div>
          <div class="tab" :class="{ on: tab === 'pool' }" @click="tab = 'pool'">池内工单 {{ poolTickets.length }}</div>
        </div>
      </div>
    </div>

    <div v-if="poolView" class="dtp-stats">
      <span>池形态 <b>{{ poolView.effectiveMode }}</b>
        <span
          v-if="effectiveTag"
          class="dtp-tag"
          :style="{ color: MODE_TAG_STYLE[effectiveTag].color, background: MODE_TAG_STYLE[effectiveTag].bg, borderColor: MODE_TAG_STYLE[effectiveTag].border }"
        >{{ effectiveTag }}</span>
      </span>
      <span>等原处理人 <b>{{ poolView.waitingOriginal }}</b></span>
      <span>排队中 <b>{{ poolView.queued }}</b></span>
      <span>派单失败回池 <b :class="{ danger: poolView.failed > 0 }">{{ poolView.failed }}</b></span>
      <span>最长等待 <b>{{ waitText(poolView.maxWaitMin) }}</b></span>
      <span>已配置画像 <b>{{ poolView.configuredCount }} / {{ poolView.memberCount }}</b></span>
    </div>

    <!-- 成员 -->
    <div v-if="tab === 'members'" class="tbl">
      <div class="thead grid" :style="{ gridTemplateColumns: memberCols }">
        <div class="th">成员</div>
        <div class="th">签入状态</div>
        <div class="th">在途 / 上限</div>
        <div class="th">熟练度</div>
        <div class="th">人员画像</div>
        <div class="th">个人开关</div>
        <div class="th">操作</div>
      </div>
      <div v-for="m in members" :key="m.agent.name" class="trow grid" :style="{ gridTemplateColumns: memberCols }">
        <div class="td">
          <span class="m-name">{{ m.agent.name }}</span>
          <span class="m-no">{{ m.agent.staffNo }}</span>
        </div>
        <div class="td">
          <span class="dot" :style="{ background: SIGN_IN_COLOR[m.agent.signIn] }" />{{ m.agent.signIn }}
        </div>
        <div class="td">
          <span class="num">{{ m.inTransit }} / {{ m.cap }}</span>
          <span v-if="m.overAssigned" class="flag red">超额指派</span>
          <span v-else-if="m.overLimit" class="flag orange">超限</span>
        </div>
        <div class="td">{{ m.agent.proficiency }}</div>
        <div class="td">
          <span v-if="!m.profileConfigured" class="flag orange">画像未配置</span>
          <span v-else class="pf" :title="profileSummary(m.agent.name)">{{ profileSummary(m.agent.name) }}</span>
        </div>
        <div class="td">
          <a-tooltip :title="personalSwitchDisabledTip(m.agent) || undefined">
            <a-switch
              :checked="m.agent.personalSwitch"
              :disabled="!!personalSwitchDisabledTip(m.agent)"
              size="small"
              @update:checked="(v: unknown) => onPersonalSwitch(m.agent.name, v === true)"
            />
          </a-tooltip>
        </div>
        <div class="td acts">
          <span class="link" @click="openProfile(m.agent.name)">编辑画像</span>
          <span class="link" @click="openCap(m.agent.name)">个人上限</span>
        </div>
      </div>
      <div v-if="!members.length" class="empty">本组暂无成员</div>
    </div>

    <!-- 池内工单 -->
    <div v-else class="tbl">
      <div class="thead grid" :style="{ gridTemplateColumns: poolCols }">
        <div class="th">工单号</div>
        <div class="th">标题</div>
        <div class="th">优先级</div>
        <div class="th">派单状态</div>
        <div class="th">等待时长</div>
        <div class="th">首响 SLA</div>
        <div class="th">操作</div>
      </div>
      <div v-for="t in poolTickets" :key="t.no" class="trow grid" :style="{ gridTemplateColumns: poolCols }">
        <div class="td"><span class="link mono" @click="router.push(`/tickets/${t.no}`)">{{ t.no }}</span></div>
        <div class="td"><span class="ellipsis" :title="t.title">{{ t.type }} · {{ t.title }}</span></div>
        <div class="td">{{ t.priority }}</div>
        <div class="td">
          <span
            v-if="dispatch.dispatchStatusOf(t.no)"
            class="dtp-tag"
            :style="{
              color: DISPATCH_STATUS_STYLE[dispatch.dispatchStatusOf(t.no)!].color,
              background: DISPATCH_STATUS_STYLE[dispatch.dispatchStatusOf(t.no)!].bg,
              borderColor: DISPATCH_STATUS_STYLE[dispatch.dispatchStatusOf(t.no)!].border,
            }"
            :title="dispatch.dispatchStatusOf(t.no) === '等原处理人' ? reserveTipOf(t.no) : undefined"
          >{{ dispatch.dispatchStatusOf(t.no) }}</span>
          <span v-else class="muted">—</span>
        </div>
        <div class="td">{{ waitText(waitMinutesOf(t, nowMs)) }}</div>
        <div class="td" :class="{ danger: t.slaMinutes < 0 && !t.responded }">{{ slaText(t) }}</div>
        <div class="td"><span class="link" @click="openAssign(t)">指派</span></div>
      </div>
      <div v-if="!poolTickets.length" class="empty">本组池暂无待领工单</div>
    </div>

    <!-- 关闭班组开关 · 二次确认（8.2） -->
    <OpActionModal
      v-model:open="switchConfirmOpen"
      title="关闭本组开关"
      :icon="PoweroffOutlined"
      tone="warn"
      ok-tone="danger"
      :width="440"
      ok-text="确定关闭"
      cancel-text="取消"
      @ok="onSwitchOffConfirm"
    >
      <div class="op-form">
        <div class="dtp-confirm">关闭后{{ group.label }}池转为降级态，本组成员不再接本组池的自动派单。确定关闭？</div>
      </div>
    </OpActionModal>

    <!-- 切换池形态（5.4） -->
    <OpActionModal
      v-model:open="modeOpen"
      title="切换池形态"
      :icon="ControlOutlined"
      tone="primary"
      ok-tone="primary"
      :width="480"
      ok-text="确认切换"
      cancel-text="取消"
      @ok="onModeOk"
    >
      <div class="op-form dtp-form">
        <div class="dtp-frow">
          <div class="op-label">范围</div>
          <div class="dtp-ro">{{ dispatch.poolLabel(group.id) }}</div>
        </div>
        <div class="dtp-frow">
          <div class="op-label">当前形态</div>
          <div class="dtp-ro">{{ group.mode }}</div>
        </div>
        <div class="dtp-frow">
          <div class="op-label req">切换为</div>
          <a-radio-group v-model:value="modeTarget">
            <a-radio v-for="m in modeOptions" :key="m" :value="m">{{ m }}</a-radio>
          </a-radio-group>
        </div>
        <div class="dtp-frow top">
          <div class="op-label" :class="{ req: modeTarget && modeTarget !== '正常态' }">切换原因</div>
          <a-textarea v-model:value="modeReason" :maxlength="200" show-count :rows="3" placeholder="请填写切换原因" />
        </div>
        <div class="dtp-frow">
          <div class="op-label">影响</div>
          <div class="dtp-ro">已派出、已领取的工单不收回</div>
        </div>
      </div>
    </OpActionModal>

    <!-- 调整个人上限（7.5） -->
    <OpActionModal
      v-model:open="capOpen"
      title="个人上限"
      :subtitle="capView ? `${capView.agent.name}（${capView.agent.staffNo}）` : ''"
      :icon="ControlOutlined"
      tone="primary"
      ok-tone="primary"
      :width="440"
      ok-text="保存"
      cancel-text="取消"
      @ok="saveCap(false)"
    >
      <div v-if="capView" class="op-form dtp-form">
        <div class="dtp-frow">
          <div class="op-label">默认值</div>
          <div class="dtp-ro">{{ capView.defaultCapText }}</div>
        </div>
        <div class="dtp-frow">
          <div class="op-label">个人值</div>
          <a-input-number
            :value="capValue ?? undefined"
            class="dtp-num"
            @update:value="(v: unknown) => { capValue = typeof v === 'number' ? v : null; }" :min="1" :max="50" :precision="0" :placeholder="`按默认值 ${capView.defaultCap}`" />
        </div>
        <div class="dtp-frow">
          <div class="op-label">当前在途</div>
          <div class="dtp-ro">在途 {{ capView.inTransit }}</div>
        </div>
      </div>
    </OpActionModal>

    <DispatchProfileDrawer v-model:open="profileOpen" :name="profileName" />
    <DispatchAssignModal v-model:open="assignOpen" :ticket="assignTicket" :group-id="groupId" />
  </div>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
  border: 0.8px solid #e5e6eb;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.card-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #eef2f7;
  flex-wrap: wrap;
}
.hd-main { display: flex; align-items: center; gap: 14px; min-width: 0; flex-wrap: wrap; }
.hd-title { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.3; }
.hd-actions { display: flex; align-items: center; gap: 16px; flex: none; flex-wrap: wrap; }
.dtp-groups { display: flex; gap: 6px; flex-wrap: wrap; }
.dtp-group {
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 10px; font-size: 12px; color: #475569;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; white-space: nowrap;
}
.dtp-group:hover { background: #f9fafb; }
.dtp-group.on { color: #1a6fff; background: #eff6ff; border-color: #bfdbfe; font-weight: 600; }
.dtp-tag {
  display: inline-flex; align-items: center; height: 18px; padding: 0 5px;
  font-size: 11px; font-weight: 500; border: 1px solid transparent; border-radius: 4px; white-space: nowrap;
}
.dtp-ctl { display: flex; align-items: center; gap: 8px; }
.dtp-ctl-label { font-size: 12px; color: #64748b; }
.dtp-mode { font-size: 12px; font-weight: 600; color: #0f172a; }
.btn-ghost {
  display: flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px;
  font-size: 12px; font-weight: 500; color: #475569; background: #fff;
  border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer;
}
.btn-ghost:hover:not(:disabled) { border-color: #1a6fff; color: #1a6fff; }
.btn-ghost:disabled { color: #cbd5e1; cursor: not-allowed; }
.tabs { display: flex; background: #f1f5f9; border-radius: 7px; padding: 2px; gap: 2px; }
.tab { display: inline-flex; align-items: center; gap: 4px; padding: 5px 12px; font-size: 12px; color: #64748b; border-radius: 5px; cursor: pointer; white-space: nowrap; }
.tab.on { background: #fff; color: #1a6fff; font-weight: 600; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06); }
.dtp-stats {
  display: flex; flex-wrap: wrap; align-items: center; gap: 20px;
  padding: 10px 16px; font-size: 12px; color: #64748b; border-bottom: 1px solid #eef2f7; background: #fbfcfe;
}
.dtp-stats b { margin-left: 4px; color: #0f172a; font-variant-numeric: tabular-nums; }
.dtp-stats b.danger { color: #ef4444; }
.dtp-stats .dtp-tag { margin-left: 6px; }
.tbl { overflow: auto; max-height: 420px; }
.grid { display: grid; }
.thead { position: sticky; top: 0; z-index: 1; background: #f8fafc; }
.th { display: flex; align-items: center; padding: 10px 12px; font-size: 12px; font-weight: 600; color: #64748b; white-space: nowrap; }
.trow { border-bottom: 1px solid #f1f5f9; }
.trow:hover { background: #f9fafb; }
.td { display: flex; align-items: center; gap: 6px; padding: 11px 12px; font-size: 12px; color: #334155; min-width: 0; }
.td.danger { color: #ef4444; font-weight: 600; }
.td.acts { gap: 12px; }
.m-name { font-weight: 600; color: #0f172a; }
.m-no { color: #94a3b8; font-variant-numeric: tabular-nums; }
.dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.num { font-variant-numeric: tabular-nums; }
.flag { font-size: 11px; line-height: 18px; padding: 0 5px; border-radius: 4px; white-space: nowrap; border: 1px solid transparent; }
.flag.orange { color: #d97706; background: #fffbeb; border-color: #fde68a; }
.flag.red { color: #dc2626; background: #fef2f2; border-color: #fecaca; }
.pf, .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.link { color: #1a6fff; cursor: pointer; white-space: nowrap; }
.link:hover { text-decoration: underline; }
.mono { font-variant-numeric: tabular-nums; }
.muted { color: #9ca3af; }
.empty { padding: 28px 16px; text-align: center; font-size: 12px; color: #94a3b8; }
.dtp-confirm { font-size: 14px; line-height: 22px; color: #111827; }
.dtp-form { display: flex; flex-direction: column; gap: 14px; }
.dtp-frow { display: grid; grid-template-columns: 64px minmax(0, 1fr); column-gap: 10px; align-items: center; }
.dtp-frow.top { align-items: start; }
.dtp-frow.top > .op-label { line-height: 32px; }
.dtp-frow > .op-label { white-space: nowrap; }
.dtp-ro { font-size: 14px; line-height: 32px; color: #111827; }
.dtp-num { width: 160px; }
</style>
