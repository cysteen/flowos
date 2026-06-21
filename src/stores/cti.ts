import { defineStore } from 'pinia';

// 软电话(CTI) 共享状态机 —— 对齐设计稿 iFLY-FlowOS-坐席视角.pen · ropW8「坐席CTI状态栏·全状态逻辑」。
// 状态：未签入 → 未准备好 → 示闲中/小休中 →（外呼呼叫中 / 呼入振铃 → 已接通）→ 挂断回示闲。
// 外呼由工单操作页（客户/代办人电话 icon）触发 startCall，头部 AgentStatusBar 订阅展示。原型为模拟态。

export type Presence = 'unready' | 'idle' | 'break'; // 未准备好 / 示闲中 / 小休中
export type CallPhase = 'none' | 'dialing' | 'ringing' | 'connected';

let dialTimer: ReturnType<typeof setTimeout> | undefined;
let clock: ReturnType<typeof setInterval> | undefined;

export const useCtiStore = defineStore('cti', {
  state: () => ({
    workNo: '001006',
    ext: '8788001006',
    signedIn: false,
    presence: 'unready' as Presence,
    statusSince: 0,
    callPhase: 'none' as CallPhase,
    callNumber: '',
    callContact: '',
    dialSince: 0,
    callSince: 0,
    now: 0,
  }),
  getters: {
    inCall: (s): boolean => s.callPhase !== 'none',
  },
  actions: {
    ensureClock() {
      if (clock) return;
      this.now = Date.now();
      clock = setInterval(() => { this.now = Date.now(); }, 1000);
    },
    signIn() {
      this.signedIn = true;
      this.presence = 'unready';
      this.statusSince = Date.now();
      this.ensureClock();
    },
    signOut(): boolean {
      if (this.inCall) return false;
      this.signedIn = false;
      this.presence = 'unready';
      this.statusSince = 0;
      return true;
    },
    setPresence(p: Presence) {
      if (this.inCall) return;
      this.presence = p;
      this.statusSince = Date.now();
    },
    /** 外呼：从工单操作页电话 icon 触发 → 呼叫中(振铃) → 约 2.5s 自动接通 */
    startCall(num: string, contact = '') {
      if (!num) return;
      if (!this.signedIn) this.signIn();
      this.ensureClock();
      this.callNumber = num;
      this.callContact = contact;
      this.callPhase = 'dialing';
      this.dialSince = Date.now();
      this.statusSince = Date.now();
      if (dialTimer) clearTimeout(dialTimer);
      dialTimer = setTimeout(() => {
        if (this.callPhase === 'dialing') {
          this.callPhase = 'connected';
          this.callSince = Date.now();
        }
      }, 2500);
    },
    /** 呼入振铃（原型预留，无外部触发源） */
    ringIncoming(num: string, contact = '') {
      if (!this.signedIn) return;
      this.callNumber = num;
      this.callContact = contact;
      this.callPhase = 'ringing';
      this.statusSince = Date.now();
      this.ensureClock();
    },
    answer() {
      if (this.callPhase !== 'ringing') return;
      this.callPhase = 'connected';
      this.callSince = Date.now();
    },
    cancelDial() { this.endCall(); }, // 取消外呼
    reject() { this.endCall(); },     // 拒接
    hangup() { this.endCall(); },     // 挂断
    endCall() {
      if (dialTimer) clearTimeout(dialTimer);
      this.callPhase = 'none';
      this.callNumber = '';
      this.callContact = '';
      this.dialSince = 0;
      this.callSince = 0;
      this.presence = 'idle';
      this.statusSince = Date.now();
    },
  },
});
