import { defineStore } from 'pinia';

// 软电话(CTI) —— 对齐 iFLY-FlowOS-坐席视角.pen · ropW8 双层状态模型（workStatus + callSession）。

export type WorkStatus = 'offline' | 'logged_in' | 'ready' | 'break' | 'busy';
/** 就绪子态：坐席当前主工作模式（下拉在「就绪」高亮时展示） */
export type ReadyMode = 'ticket_work' | 'outbound' | 'offline_comm';
export type BreakReason = 'meeting' | 'training' | 'tea' | 'meal';
export type CallStatus = 'dialing' | 'ringing' | 'connected';

export interface CallSession {
  ticketId: string;
  contactLabel: string;
  phone: string;
  outboundNumber: string;
  status: CallStatus;
  startedAt: number;
  connectedAt: number | null;
  /** 坐席麦克风静音（仅影响本端发送，对方仍可说话） */
  muted: boolean;
  /** 保持通话：客户侧听等待音，链路不断（与静音不同） */
  held: boolean;
  /** 当前这次保持开始时刻；接回后置 null */
  holdSince: number | null;
  /** 累计保持时长（毫秒），挂断后可写入联系记录 */
  holdAccumMs: number;
}

export const READY_MODE_LABELS: Record<ReadyMode, string> = {
  ticket_work: '工单处理',
  outbound: '外呼',
  offline_comm: '线下沟通',
};

export const READY_MODE_CAPSULE: Record<ReadyMode, string> = {
  ticket_work: '工单处理中',
  outbound: '外呼中',
  offline_comm: '线下沟通中',
};

export const BREAK_LABELS: Record<BreakReason, string> = {
  meeting: '开会中',
  training: '培训中',
  tea: '茶歇中',
  meal: '用餐中',
};

let phaseTimer: ReturnType<typeof setTimeout> | undefined;
let clock: ReturnType<typeof setInterval> | undefined;

export function maskPhone(num: string): string {
  const n = num.replace(/\s/g, '');
  return n.length >= 7 ? `${n.slice(0, 3)}****${n.slice(-4)}` : n;
}

export function formatCallDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export const useCtiStore = defineStore('cti', {
  state: () => ({
    agentNo: '001006',
    extension: '8788001006',
    workStatus: 'offline' as WorkStatus,
    workStatusSince: 0,
    readyMode: 'ticket_work' as ReadyMode,
    breakReason: 'training' as BreakReason,
    workStatusBeforeCall: null as WorkStatus | null,
    callSession: null as CallSession | null,
    now: 0,
  }),
  getters: {
    isSignedIn: (s): boolean => s.workStatus !== 'offline',
    inCall: (s): boolean => s.callSession !== null,
    workButtonsDisabled: (s): boolean => s.workStatus === 'busy',
    dropdownLabel(state): string {
      if (state.workStatus === 'busy') return '忙碌';
      if (state.workStatus === 'ready') return READY_MODE_CAPSULE[state.readyMode];
      if (state.workStatus === 'break') return BREAK_LABELS[state.breakReason];
      if (state.workStatus === 'logged_in') return '未就绪';
      return '未就绪';
    },
    callTimerMs(state): number {
      const s = state.callSession;
      if (!s) return 0;
      if (s.status === 'connected' && s.connectedAt) return state.now - s.connectedAt;
      return state.now - s.startedAt;
    },
    /** 当前保持段已持续毫秒（仅 held=true 时有意义） */
    holdTimerMs(state): number {
      const s = state.callSession;
      if (!s?.held || !s.holdSince) return 0;
      return state.now - s.holdSince;
    },
  },
  actions: {
    ensureClock() {
      if (clock) return;
      this.now = Date.now();
      clock = setInterval(() => { this.now = Date.now(); }, 1000);
    },
    touchWorkStatus(status: WorkStatus) {
      this.workStatus = status;
      this.workStatusSince = Date.now();
      this.ensureClock();
    },
    signIn() {
      this.touchWorkStatus('logged_in');
    },
    signOut(): boolean {
      if (this.inCall) return false;
      this.workStatus = 'offline';
      this.workStatusSince = 0;
      return true;
    },
    // mode 不写默认值 —— 默认参数里引用 this 会让 TS 推不出 this 类型（TS2683）
    setReady(mode?: ReadyMode) {
      if (this.workButtonsDisabled) return;
      this.readyMode = mode ?? this.readyMode;
      this.touchWorkStatus('ready');
    },
    setReadyMode(mode: ReadyMode) {
      if (this.workButtonsDisabled) return;
      this.readyMode = mode;
      if (this.workStatus !== 'ready') this.touchWorkStatus('ready');
      else this.workStatusSince = Date.now();
    },
    setLoggedIn() {
      if (this.workButtonsDisabled) return;
      this.touchWorkStatus('logged_in');
    },
    // 同上：默认值移到函数体内
    setBreak(reason?: BreakReason) {
      if (this.workButtonsDisabled) return;
      this.breakReason = reason ?? this.breakReason;
      this.touchWorkStatus('break');
    },
    clearPhaseTimer() {
      if (phaseTimer) clearTimeout(phaseTimer);
      phaseTimer = undefined;
    },
    schedulePhaseTransitions() {
      this.clearPhaseTimer();
      phaseTimer = setTimeout(() => {
        if (this.callSession?.status === 'dialing') {
          this.callSession.status = 'ringing';
          this.schedulePhaseTransitions();
        } else if (this.callSession?.status === 'ringing') {
          this.callSession.status = 'connected';
          this.callSession.connectedAt = Date.now();
        }
      }, 2000);
    },
    startCall(payload: { ticketId: string; phone: string; contactLabel: string; outboundNumber: string }) {
      const { ticketId, phone, contactLabel, outboundNumber } = payload;
      if (!phone) return false;
      if (this.workStatus === 'offline') return false;
      if (this.workStatus === 'break') return false;
      if (this.callSession) return false;

      this.workStatusBeforeCall = this.workStatus === 'busy' ? 'ready' : this.workStatus;
      this.workStatus = 'busy';
      this.workStatusSince = Date.now();
      this.ensureClock();

      const startedAt = Date.now();
      this.callSession = {
        ticketId,
        contactLabel,
        phone,
        outboundNumber,
        status: 'dialing',
        startedAt,
        connectedAt: null,
        muted: false,
        held: false,
        holdSince: null,
        holdAccumMs: 0,
      };
      this.schedulePhaseTransitions();
      return true;
    },
    cancelCall() {
      if (this.callSession?.status !== 'dialing') return;
      this.endCall();
    },
    hangup() {
      if (!this.callSession) return;
      if (this.callSession.status === 'dialing') return;
      this.endCall();
    },
    /** 静音/取消静音 —— 仅接通后可用；与 Hold 不同，对方仍可说话 */
    toggleMute() {
      const s = this.callSession;
      if (s?.status !== 'connected') return;
      this.callSession = { ...s, muted: !s.muted };
    },
    /** 保持 / 接回 —— 客户听等待音，通话链路不断 */
    toggleHold() {
      const s = this.callSession;
      if (s?.status !== 'connected') return;
      if (s.held) {
        const extra = s.holdSince ? Date.now() - s.holdSince : 0;
        this.callSession = {
          ...s,
          held: false,
          holdSince: null,
          holdAccumMs: s.holdAccumMs + extra,
        };
        return;
      }
      this.callSession = { ...s, held: true, holdSince: Date.now() };
    },
    endCall() {
      this.clearPhaseTimer();
      this.callSession = null;
      const restore = this.workStatusBeforeCall ?? 'ready';
      this.workStatusBeforeCall = null;
      if (restore !== 'offline') this.touchWorkStatus(restore);
      else this.workStatus = 'offline';
    },
  },
});
