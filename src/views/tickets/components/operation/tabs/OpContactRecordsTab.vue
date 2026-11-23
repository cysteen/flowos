<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  AudioOutlined,
  DownOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  UpOutlined,
  PhoneOutlined,
  MessageOutlined,
  MailOutlined,
  CommentOutlined,
  ExportOutlined,
} from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import type { ContactRecord } from '@/views/tickets/types/operationTabs';
import { formatCallDuration } from '@/stores/cti';
import {
  useOutboundInteropStore,
  type EnsureOutboundInteropInput,
  type OutboundInteropView,
  type OutboundRecordingStatus,
  type OutboundSyncStatus,
  type OutboundVerificationResult,
  type RecordingAccessScope,
  type RecordingScopedRecord,
} from '@/stores/outboundInterop';
import { useUserStore } from '@/stores/user';
import { formatOpTime } from '@/views/tickets/utils/opTime';
import RecordingPlayer from '../RecordingPlayer.vue';

type ScopedContactRecord = RecordingScopedRecord<ContactRecord>;

const props = defineProps<{ records: ScopedContactRecord[] }>();
const route = useRoute();
const user = useUserStore();
const outboundInterop = useOutboundInteropStore();

const ticketNo = computed(() => String(route.params.ticketNo ?? '当前工单'));
const interopDetailOpen = ref(false);
const selectedInteropKey = ref('');
const selectedInteropInput = ref<EnsureOutboundInteropInput>();
const verificationMode = ref(false);
const verificationResult = ref<OutboundVerificationResult>('unresolved');
const verificationReason = ref('');
const selectedRecordingAccess = ref<RecordingAccessScope>('masked');
const canOperateInterop = computed(() => !user.role.readonlyTickets);
const selectedInterop = computed(() => {
  if (!selectedInteropInput.value) return undefined;
  return outboundInterop.get(
    selectedInteropKey.value,
    selectedInteropInput.value,
    selectedRecordingAccess.value === 'visible',
  );
});

const expandedAsr = reactive<Record<string, boolean>>({});
const expandedNote = reactive<Record<string, boolean>>({});

const SYNC_LABELS: Record<OutboundSyncStatus, string> = {
  'synced': '已同步',
  'pending-review': '待核对',
  'sync-failed': '同步失败',
  'unknown': '结果不明',
};

const RECORDING_LABELS: Record<OutboundRecordingStatus, string> = {
  'pending': '录音待生成',
  'available': '录音可查询',
  'not-generated': '明确未生成',
  'generation-failed': '录音生成失败',
  'unknown': '录音结果不明',
};

const TITLE_ICON = {
  call: PhoneOutlined,
  sms: MessageOutlined,
  email: MailOutlined,
  im: CommentOutlined,
} as const;

function toggleAsr(id: string) {
  expandedAsr[id] = !expandedAsr[id];
}

function toggleNote(id: string) {
  expandedNote[id] = !expandedNote[id];
}

function jumpFirstline() {
  message.info('前往一线工作台查看 IM 记录');
}

/**
 * 卡头右端那一行 ——〔`操作人: 王坐席 | 2026-06-17 15:08:22`〕。
 * 2026-10-07 裁决拿它当全页签时刻展示的**参照样式**，故格式与位置都保持不变；
 * 时刻仍过一道 formatOpTime，让精度不齐的那几条（只到分钟的）也排进同一个宽度。
 */
/** 与短信 / 邮件摘要一致：`字段: 值 | 字段: 值` */
const DETAIL_SEP = ' | ';

function joinDetailLine(...segments: string[]): string {
  return segments.filter(Boolean).join(DETAIL_SEP);
}

function summaryFields(summary: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of summary.split('|')) {
    const m = part.trim().match(/^([^:：]+)[:：]\s*(.+)$/);
    if (m) map.set(m[1].trim(), m[2].trim());
  }
  return map;
}

/** 完整日期支持 ISO Z / 偏移；与系统时间工具一致按本地时区展示，保留来源精度。 */
function contactTimeParts(raw?: string | null): { date: Date; hasSeconds: boolean; fraction?: string } | null {
  const match = raw?.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/i);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction, zone] = match;
  const y = Number(year), m = Number(month), d = Number(day), hh = Number(hour);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m < 1 || m > 12 || d < 1 || d > monthDays[m - 1]
    || hh > 24 || Number(minute) > 59 || Number(second ?? 0) > 59
    || (hh === 24 && (Number(minute) !== 0 || Number(second ?? 0) !== 0 || Number(fraction ?? 0) !== 0))) return null;
  const normalizedZone = zone?.toUpperCase().replace(/([+-]\d{2})(\d{2})$/, '$1:$2') ?? '';
  if (normalizedZone !== '' && normalizedZone !== 'Z'
    && (Number(normalizedZone.slice(1, 3)) > 23 || Number(normalizedZone.slice(4)) > 59)) return null;
  // 先校验日历值，避免 Date 将 2 月 30 日自动归一化；无偏移日期按系统本地时间解析。
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}${second === undefined ? '' : `:${second}`}${fraction ? `.${fraction.padEnd(3, '0')}` : ''}${normalizedZone}`);
  return Number.isFinite(date.getTime()) ? { date, hasSeconds: second !== undefined, fraction } : null;
}

function formatContactTime(raw?: string | null): string {
  const parts = contactTimeParts(raw);
  if (!parts) return '—';
  const { date, hasSeconds, fraction } = parts;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}${hasSeconds ? `:${pad(date.getSeconds())}` : ''}${fraction ? `.${fraction}` : ''}`;
}

function spanRingDuration(startedAt?: string | null, endedAt?: string | null): string {
  const start = contactTimeParts(startedAt);
  const end = contactTimeParts(endedAt);
  if (!start?.hasSeconds || !end?.hasSeconds) return '—';
  const ms = end.date.getTime() - start.date.getTime();
  return Number.isFinite(ms) && ms >= 0 ? formatCallDuration(ms) : '—';
}

function isOutboundCallRecord(r: ScopedContactRecord): boolean {
  return r.kind === 'call' && r.channel !== '热线' && r.channel !== 'IM';
}

function interopInput(r: ScopedContactRecord): EnsureOutboundInteropInput {
  return {
    ticketNo: ticketNo.value,
    contactRecordId: r.id,
    occurredAt: r.when,
    originEntry: r.id.startsWith('call-') ? '工单侧栏 · 外呼' : '工单处理页 · 联系记录',
    connected: !isUnconnected(r),
    hasRecording: r.recordingAccess === 'visible' && !!r.recording,
  };
}

function interopFor(r: ScopedContactRecord): OutboundInteropView {
  return outboundInterop.ensure(interopInput(r), r.recordingAccess === 'visible');
}

function openInteropDetail(r: ScopedContactRecord) {
  const interop = interopFor(r);
  selectedInteropKey.value = interop.key;
  selectedInteropInput.value = interopInput(r);
  selectedRecordingAccess.value = r.recordingAccess;
  verificationMode.value = false;
  interopDetailOpen.value = true;
}

function openVerification(r: ScopedContactRecord) {
  openInteropDetail(r);
  verificationMode.value = true;
  verificationResult.value = 'unresolved';
  verificationReason.value = '';
}

function canRetrySync(status: OutboundSyncStatus): boolean {
  return status === 'sync-failed';
}

function canVerifySync(status: OutboundSyncStatus): boolean {
  return status === 'pending-review' || status === 'unknown';
}

function canRefreshRecording(status: OutboundRecordingStatus): boolean {
  return status === 'pending' || status === 'generation-failed' || status === 'unknown';
}

function recordingLabel(interop: OutboundInteropView): string {
  return interop.recording.masked ? '状态已隐藏' : RECORDING_LABELS[interop.recording.status];
}

function recordingClass(interop: OutboundInteropView): string {
  return interop.recording.masked ? 'recording-masked' : `recording-${interop.recording.status}`;
}

function canRefreshRecordingView(interop: OutboundInteropView): boolean {
  return !interop.recording.masked && canRefreshRecording(interop.recording.status);
}

function recordingActionForView(interop: OutboundInteropView): string {
  return interop.recording.masked ? '' : recordingActionLabel(interop.recording.status);
}

function recordingActionLabel(status: OutboundRecordingStatus): string {
  if (status === 'generation-failed') return '重试生成';
  return status === 'unknown' ? '重新核对' : '刷新录音';
}

function runSyncAction(r: ScopedContactRecord) {
  const result = outboundInterop.retrySync(interopFor(r).key, canOperateInterop.value);
  result.ok ? message.success(result.message) : message.warning(result.message);
}

function runRecordingRefresh(r: ScopedContactRecord) {
  const result = outboundInterop.refreshRecording(
    interopFor(r).key,
    interopInput(r),
    r.recordingAccess === 'visible' && canOperateInterop.value,
  );
  result.ok ? message.success(result.message) : message.warning(result.message);
}

function submitVerification() {
  const result = outboundInterop.verifySync(
    selectedInteropKey.value,
    verificationResult.value,
    verificationReason.value,
    canOperateInterop.value,
  );
  if (result.ok) {
    message.success(result.message);
    verificationMode.value = false;
  } else message.warning(result.message);
}

function retryPersistence() {
  const result = outboundInterop.retryPersistence();
  result.ok ? message.success(result.message) : message.error(result.message);
}

function canPlayOutboundRecording(r: ScopedContactRecord): boolean {
  const interop = interopFor(r);
  return !interop.recording.masked && interop.recording.status === 'available';
}

function recordingUnavailableText(r: ScopedContactRecord): string {
  if (r.recordingAccess === 'masked') {
    return '当前账号无录音查询权限，录音资源状态已隐藏。';
  }
  return interopFor(r).recording.message;
}

/** 明确未接通的记录不展示矛盾的接通时刻或通话时长。 */
function isUnconnected(r: ScopedContactRecord): boolean {
  return /未接通|未接听|无人接听|忙线|拒接|取消|失败/.test(summaryFields(r.summary).get('状态') ?? '');
}

function outboundRingDuration(r: ScopedContactRecord): string {
  const span = r.callSpan;
  const seg = summaryFields(r.summary);
  const ringEnd = !isUnconnected(r) && span?.connectedAt?.trim() ? span.connectedAt : span?.endedAt;
  return (
    seg.get('振铃时长')
    ?? spanRingDuration(span?.ringingAt || span?.startedAt, ringEnd)
  );
}

function outboundTalkDuration(r: ScopedContactRecord): string {
  if (isUnconnected(r)) return '—';
  const span = r.callSpan;
  const seg = summaryFields(r.summary);
  const fromSummary = seg.get('时长') ?? seg.get('通话时长');
  if (fromSummary) return fromSummary;
  if (span?.connectedAt) return spanRingDuration(span.connectedAt, span.endedAt);
  return '—';
}

/** 外呼第一行：呼叫号码 | 状态 | 振铃时长 | 通话时长 */
function callOutboundLine1(r: ScopedContactRecord): string {
  const seg = summaryFields(r.summary);
  const parts = [
    `呼叫号码: ${seg.get('呼叫号码') ?? '—'}`,
    `状态: ${seg.get('状态') ?? '—'}`,
    `振铃时长: ${outboundRingDuration(r)}`,
    `通话时长: ${outboundTalkDuration(r)}`,
  ];
  const hold = seg.get('保持');
  if (hold) parts.push(`保持: ${hold}`);
  return joinDetailLine(...parts);
}

/** 外呼第二行：呼叫时间 | 振铃时间 | 接通时间 | 挂机时间 */
function callOutboundLine2(r: ScopedContactRecord): string {
  const span = r.callSpan;
  const dialAt = formatContactTime(span?.startedAt);
  const connected = isUnconnected(r) ? '—' : formatContactTime(span?.connectedAt);
  return joinDetailLine(
    `呼叫时间: ${dialAt}`,
    `振铃时间: ${formatContactTime(span?.ringingAt || span?.startedAt)}`,
    `接通时间: ${connected}`,
    `挂机时间: ${formatContactTime(span?.endedAt)}`,
  );
}

/** 联系记录卡：摘要 + 时刻（短信 / 邮件仍只用 summary） */
function contactDetailLine(r: ScopedContactRecord): string {
  if (r.kind === 'im' || r.channel === 'IM') {
    return joinDetailLine(
      r.summary,
      `接入时间: ${formatContactTime(r.imSpan?.joinedAt)}`,
      `离线时间: ${formatContactTime(r.imSpan?.offlineAt)}`,
    );
  }
  if (r.kind !== 'call') return r.summary;
  const span = r.callSpan;
  if (r.channel === '热线') {
    return joinDetailLine(
      r.summary,
      `呼入时间: ${formatContactTime(span?.startedAt)}`,
      `挂机时间: ${formatContactTime(span?.endedAt)}`,
    );
  }
  return `${callOutboundLine1(r)}\n${callOutboundLine2(r)}`;
}

function metaLabel(r: ScopedContactRecord) {
  const prefix = r.metaPrefix ?? '操作人';
  let s = `${prefix}: ${r.operator} | ${formatOpTime(r.when)}`;
  if (r.im) s += ` | 会话 ${r.im.sessionDuration} · ${r.im.messageCount} 条`;
  return s;
}
</script>

<template>
  <div class="contact-tab">
    <a-alert
      v-if="outboundInterop.persistenceWarning"
      type="error"
      show-icon
      :message="outboundInterop.persistenceWarning"
    >
      <template #action>
        <a-button size="small" danger @click="retryPersistence">重试保存</a-button>
      </template>
    </a-alert>
    <template v-if="props.records.length">
      <div
        v-for="r in props.records"
        :key="r.id"
        class="record-card"
      >
      <div class="card-head">
        <div class="title-left">
          <component :is="TITLE_ICON[r.kind]" class="kind-icon" />
          <span class="title-text">{{ r.title }}</span>
          <span
            v-if="r.channel"
            class="tag"
            :class="r.channel === '热线' ? 'tag-hotline' : 'tag-im'"
          >{{ r.channel }}</span>
          <span
            class="tag"
            :class="r.source === '一线' ? 'tag-source' : 'tag-source-self'"
          >{{ r.source || '二线' }}</span>
        </div>
        <span class="card-meta">{{ metaLabel(r) }}</span>
      </div>
      <div v-if="r.kind === 'im'" class="summary summary-im">
        <span class="summary-text" :title="contactDetailLine(r)">{{ contactDetailLine(r) }}</span>
        <button class="im-detail" type="button" @click="jumpFirstline">
          查看详情<ExportOutlined />
        </button>
      </div>
      <div
        v-else-if="isOutboundCallRecord(r)"
        class="summary summary-call-metrics"
        :title="contactDetailLine(r)"
      >
        <div class="summary-line summary-oneline">{{ callOutboundLine1(r) }}</div>
        <div class="summary-line summary-oneline">{{ callOutboundLine2(r) }}</div>
      </div>
      <div v-else class="summary summary-oneline" :title="contactDetailLine(r)">
        {{ contactDetailLine(r) }}
      </div>

      <section v-if="isOutboundCallRecord(r)" class="interop-panel" aria-label="外呼记录互通状态">
        <div class="interop-head">
          <div class="interop-title-row">
            <span class="interop-title">外呼记录互通</span>
            <span class="prototype-badge">交互原型 · 正式接口待接入</span>
          </div>
          <button class="text-action" type="button" @click="openInteropDetail(r)">
            <InfoCircleOutlined />核对详情
          </button>
        </div>
        <div class="interop-status-row">
          <span class="status-label">记录</span>
          <span class="status-chip" :class="`sync-${interopFor(r).syncStatus}`">
            {{ SYNC_LABELS[interopFor(r).syncStatus] }}
          </span>
          <span class="status-label recording-label">录音</span>
          <span class="status-chip" :class="recordingClass(interopFor(r))">
            {{ recordingLabel(interopFor(r)) }}
          </span>
          <span class="interop-message">{{ interopFor(r).syncMessage }}</span>
          <div class="interop-actions">
            <button
              v-if="canOperateInterop && canRetrySync(interopFor(r).syncStatus)"
              class="text-action"
              type="button"
              @click="runSyncAction(r)"
            >
              <ReloadOutlined />重试同步
            </button>
            <button
              v-if="canOperateInterop && canVerifySync(interopFor(r).syncStatus)"
              class="text-action"
              type="button"
              @click="openVerification(r)"
            >
              <InfoCircleOutlined />核对状态
            </button>
            <button
              v-if="canOperateInterop && r.recordingAccess === 'visible' && canRefreshRecordingView(interopFor(r))"
              class="text-action"
              type="button"
              @click="runRecordingRefresh(r)"
            >
              <AudioOutlined />{{ recordingActionForView(interopFor(r)) }}
            </button>
          </div>
        </div>
        <div class="interop-meta">
          平台通话标识 {{ interopFor(r).platformCallId }}
          <span>·</span> 发起入口 {{ interopFor(r).originEntry }}
          <span>·</span> 关联工单 {{ interopFor(r).ticketNo }}
        </div>
        <div v-if="!canOperateInterop" class="permission-hint">
          当前账号仅可查看，不能核对或重试互通状态。
        </div>
      </section>

      <!-- 通话：录音 + 转写 -->
      <template v-if="r.kind === 'call' && (r.recordingAccess === 'masked' || r.recording)">
        <div class="media-block">
          <template v-if="r.recordingAccess === 'visible' && r.recording && (!isOutboundCallRecord(r) || canPlayOutboundRecording(r))">
            <div class="sub-label">录音</div>
            <RecordingPlayer
              :progress="r.recording.progress"
              :percent="r.recording.progressPercent"
              :name="r.title"
            />
            <div v-if="r.asr?.length" class="asr-box">
              <div class="asr-head">
                <span class="sub-label">文本转写</span>
                <span class="asr-toggle" @click="toggleAsr(r.id)">
                  {{ expandedAsr[r.id] ? '收起' : '点击展开' }}
                  <component :is="expandedAsr[r.id] ? UpOutlined : DownOutlined" class="asr-chevron" />
                </span>
              </div>
              <div v-if="expandedAsr[r.id]" class="asr-lines">
                <div v-for="(line, i) in r.asr" :key="i" class="asr-line">
                  <span class="speaker">{{ line.speaker }}:</span> {{ line.text }}
                </div>
              </div>
            </div>
          </template>
          <div v-else class="recording-unavailable">
            <AudioOutlined />
            <span>{{ recordingUnavailableText(r) }}</span>
          </div>

          <!-- 一线关联热线：小结（可展开），替代二线的文本转写 -->
          <div v-if="r.note" class="note-box">
            <div class="note-head">
              <span class="sub-label">一线小结</span>
              <span class="note-toggle" @click="toggleNote(r.id)">
                {{ expandedNote[r.id] ? '收起' : '展开' }}
                <component :is="expandedNote[r.id] ? UpOutlined : DownOutlined" class="asr-chevron" />
              </span>
            </div>
            <div class="note-text" :class="{ clamp: !expandedNote[r.id] }">{{ r.note }}</div>
          </div>
        </div>
      </template>

      <!-- 短信 -->
      <template v-else-if="r.kind === 'sms' && r.smsContent">
        <div class="content-block">
          <div class="sub-label">短信内容</div>
          <div class="content-box">{{ r.smsContent }}</div>
        </div>
      </template>

      <!-- 邮件 -->
      <template v-else-if="r.kind === 'email' && r.emailLines?.length">
        <div class="content-block">
          <div class="sub-label">邮件内容</div>
          <div class="content-box email-body">
            <p
              v-for="(line, i) in r.emailLines"
              :key="i"
              class="email-line"
              :class="{ bold: line.bold, muted: line.muted }"
            >
              {{ line.text }}
            </p>
          </div>
        </div>
      </template>
      </div>
    </template>
    <a-empty v-else class="contact-empty" description="暂无联系记录" />

    <a-modal
      v-model:open="interopDetailOpen"
      title="外呼互通核对详情"
      :footer="null"
      :width="560"
      destroy-on-close
    >
      <template v-if="selectedInterop">
        <a-alert
          class="detail-prototype-alert"
          type="warning"
          show-icon
          message="交互原型，正式接口待接入"
          description="页面仅演示工单侧互通状态、核对与原记录更新，不代表已连接容联真实接口。"
        />
        <a-descriptions class="interop-descriptions" :column="1" size="small" bordered>
          <a-descriptions-item label="平台通话标识">{{ selectedInterop.platformCallId }}</a-descriptions-item>
          <a-descriptions-item label="外呼尝试标识">{{ selectedInterop.attemptId }}</a-descriptions-item>
          <a-descriptions-item label="目标联系记录">{{ selectedInterop.contactRecordId }}</a-descriptions-item>
          <a-descriptions-item label="发起入口">{{ selectedInterop.originEntry }}</a-descriptions-item>
          <a-descriptions-item label="关联工单">{{ selectedInterop.ticketNo }}</a-descriptions-item>
          <a-descriptions-item label="记录互通">
            {{ SYNC_LABELS[selectedInterop.syncStatus] }} · {{ selectedInterop.syncMessage }}
          </a-descriptions-item>
          <a-descriptions-item label="录音状态">
            <template v-if="selectedInterop.recording.masked">
              当前账号无录音查询权限，录音资源状态已隐藏。
            </template>
            <template v-else>
              {{ RECORDING_LABELS[selectedInterop.recording.status] }} · {{ selectedInterop.recording.message }}
            </template>
          </a-descriptions-item>
          <a-descriptions-item label="最近核对">{{ selectedInterop.lastCheckedAt }}</a-descriptions-item>
          <a-descriptions-item label="核对依据">{{ selectedInterop.verificationReason || '—' }}</a-descriptions-item>
        </a-descriptions>
        <div class="detail-rule-note">
          失败重试沿用上述外呼尝试和目标联系记录；迟到录音只回填原记录，不新增重复记录。
        </div>
        <div v-if="!canOperateInterop" class="detail-permission-note">
          当前账号仅可查看详情，无互通核对或重试权限。
        </div>
        <div v-if="selectedInterop.recording.masked" class="detail-permission-note">
          当前账号无录音查询权限；页面及本地缓存均不提供录音资源是否存在、是否生成或是否可查询的信息。
        </div>
        <section v-if="verificationMode && canOperateInterop" class="verification-form">
          <div class="verification-title">模拟核对结果</div>
          <div class="verification-tip">请选择本次核对事实。默认保持“仍无法确认”，不会自动判定第三方同步成功。</div>
          <a-radio-group v-model:value="verificationResult" class="verification-options">
            <a-radio value="target-exists">目标记录存在</a-radio>
            <a-radio value="target-missing">目标记录不存在</a-radio>
            <a-radio value="unresolved">仍无法确认</a-radio>
          </a-radio-group>
          <a-textarea
            v-model:value="verificationReason"
            :maxlength="300"
            :rows="3"
            show-count
            placeholder="填写核对依据、返回结果或无法确认的原因"
          />
          <div class="verification-actions">
            <a-button @click="verificationMode = false">取消</a-button>
            <a-button type="primary" @click="submitVerification">提交核对结果</a-button>
          </div>
        </section>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
/* sFxFw：Tab 内容 padding 16/16/24，卡片 gap 12 */
.contact-tab { display: flex; flex-direction: column; gap: 8px; width: 100%; }

.record-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.record-card:hover {
  border-color: #d1d5db;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.title-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.kind-icon {
  font-size: 14px;
  color: #6b7280;
  flex: none;
}
.title-text {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  line-height: 20px;
  min-width: 0;
}
.summary-call-metrics {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.summary-oneline {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
.card-meta {
  font-size: 11px;
  color: #9ca3af;
  flex: none;
  white-space: nowrap;
  line-height: 20px;
}

.summary { font-size: 12px; color: #6b7280; line-height: 1.5; }

.interop-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px dashed #dbe2ea;
}
.interop-head,
.interop-status-row,
.interop-title-row,
.interop-actions {
  display: flex;
  align-items: center;
}
.interop-head {
  justify-content: space-between;
  gap: 12px;
}
.interop-title-row { gap: 8px; min-width: 0; }
.interop-title { color: #374151; font-size: 12px; font-weight: 600; }
.prototype-badge {
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 10px;
  line-height: 18px;
  white-space: nowrap;
}
.interop-status-row {
  min-height: 24px;
  gap: 6px;
  flex-wrap: wrap;
}
.status-label { color: #9ca3af; font-size: 11px; }
.recording-label { margin-left: 4px; }
.status-chip {
  border-radius: 4px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  white-space: nowrap;
}
.sync-synced,
.recording-available { color: #047857; background: #ecfdf5; }
.sync-pending-review,
.recording-pending { color: #b45309; background: #fffbeb; }
.sync-sync-failed,
.recording-generation-failed { color: #b91c1c; background: #fef2f2; }
.sync-unknown,
.recording-not-generated,
.recording-unknown,
.recording-masked { color: #4b5563; background: #f3f4f6; }
.interop-message {
  min-width: 180px;
  flex: 1;
  color: #6b7280;
  font-size: 11px;
  line-height: 20px;
}
.interop-actions { gap: 10px; margin-left: auto; }
.text-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  border: 0;
  padding: 0;
  background: transparent;
  color: #2563eb;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.text-action:hover { color: #1d4ed8; }
.interop-meta {
  color: #9ca3af;
  font-size: 11px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.interop-meta span { padding: 0 3px; color: #d1d5db; }
.permission-hint,
.detail-permission-note {
  color: #92400e;
  background: #fffbeb;
  font-size: 11px;
  line-height: 20px;
}
.permission-hint { padding: 2px 6px; }
.recording-unavailable {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  color: #6b7280;
  background: #f9fafb;
  padding: 0 8px;
  font-size: 11px;
}
.contact-empty { padding: 28px 0; }
.detail-prototype-alert { margin-bottom: 12px; }
.interop-descriptions { margin-bottom: 10px; }
.detail-rule-note {
  color: #4b5563;
  background: #f9fafb;
  padding: 7px 9px;
  font-size: 12px;
  line-height: 1.6;
}
.detail-permission-note { margin-top: 8px; padding: 6px 9px; }
.verification-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}
.verification-title { color: #111827; font-size: 13px; font-weight: 600; }
.verification-tip { color: #6b7280; font-size: 12px; line-height: 1.5; }
.verification-options { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.verification-actions { display: flex; justify-content: flex-end; gap: 8px; }

.media-block,
.content-block { display: flex; flex-direction: column; gap: 8px; }
.content-block { gap: 6px; }

.sub-label { font-size: 11px; font-weight: 600; color: #9ca3af; }

.asr-box {
  background: #f9fafb;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 6px 8px;
}
.asr-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 20px;
}
.asr-head .sub-label { line-height: 20px; margin: 0; }
.asr-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #9ca3af;
  cursor: pointer;
  flex: none;
  line-height: 20px;
}
.asr-chevron { font-size: 12px; line-height: 0; }
.asr-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}
.asr-line { font-size: 12px; color: #374151; line-height: 1.5; }
.speaker { font-weight: 600; color: #6b7280; }

/* 一线关联标签：渠道 + 来源 */
.tag {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 4px;
}
.tag-hotline { color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; }
.tag-im { color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; }
.tag-source { color: #6b7280; background: #f3f4f6; border: 1px solid #e5e7eb; }
.tag-source-self { color: #2563eb; background: #eff6ff; border: 1px solid #bfdbfe; }

/* 一线小结（关联热线卡片） */
.note-box {
  background: #f9fafb;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 6px 8px;
}
.note-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 20px;
}
.note-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #9ca3af;
  cursor: pointer;
  flex: none;
  line-height: 20px;
}
.note-text { font-size: 12px; color: #374151; line-height: 1.5; margin-top: 6px; }
.note-text.clamp {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* IM 记录：摘要（首条消息）右侧「查看详情」入口 */
.summary-im {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.summary-text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.im-detail {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: #7c3aed;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  padding: 0;
}
.im-detail:hover { color: #6d28d9; }
.im-detail :deep(.anticon) { font-size: 11px; }

.content-box {
  background: #f9fafb;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.6;
}
.email-body { display: flex; flex-direction: column; gap: 6px; }
.email-line { margin: 0; }
.email-line.bold { font-weight: 600; color: #374151; }
.email-line.muted { font-size: 11px; color: #9ca3af; }

@media (max-width: 900px) {
  .card-head,
  .interop-head { align-items: flex-start; }
  .card-meta { max-width: 44%; overflow: hidden; text-overflow: ellipsis; }
  .interop-status-row { align-items: flex-start; }
  .interop-message { flex-basis: 100%; order: 5; }
  .interop-actions { margin-left: 0; }
  .interop-meta { white-space: normal; }
}
</style>
