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
  status: CallStatus;
  startedAt: number;
  connectedAt: number | null;
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
    setReady(mode: ReadyMode = this.readyMode) {
      if (this.workButtonsDisabled) return;
      this.readyMode = mode;
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
    setBreak(reason: BreakReason = this.breakReason) {
      if (this.workButtonsDisabled) return;
      this.breakReason = reason;
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
    startCall(payload: { ticketId: string; phone: string; contactLabel: string }) {
      const { ticketId, phone, contactLabel } = payload;
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
        status: 'dialing',
        startedAt,
        connectedAt: null,
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
