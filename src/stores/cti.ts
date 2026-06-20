import { defineStore } from 'pinia';

// 软电话(CTI) 共享状态：坐席签入/状态 + 外呼通话生命周期。
// 外呼由工单操作页（客户/代办人电话 icon）触发 startCall，头部话务条订阅展示。原型为模拟态。

export type Presence = 'idle' | 'break';
export type CallPhase = 'none' | 'dialing' | 'talking';

let dialTimer: ReturnType<typeof setTimeout> | undefined;

export const useCtiStore = defineStore('cti', {
  state: () => ({
    workNo: '001006',
    ext: '8001',
    signedIn: false,
    presence: 'idle' as Presence,
    /** 当前状态起始时间戳（状态时长计算用） */
    statusSince: 0,
    callPhase: 'none' as CallPhase,
    callNumber: '',
    /** 通话对象名（客户 / 代办人 等，可空） */
    callContact: '',
    /** 接通时间戳（通话时长计算用） */
    callSince: 0,
  }),
  getters: {
    inCall: (s): boolean => s.callPhase !== 'none',
  },
  actions: {
    signIn() {
      this.signedIn = true;
      this.presence = 'idle';
      this.statusSince = Date.now();
    },
    signOut(): boolean {
      if (this.inCall) return false;
      this.signedIn = false;
      this.statusSince = 0;
      return true;
    },
    setPresence(p: Presence) {
      if (this.inCall) return;
      this.presence = p;
      this.statusSince = Date.now();
    },
    /** 外呼：从工单操作页电话 icon 触发 */
    startCall(num: string, contact = '') {
      if (!num) return;
      if (!this.signedIn) this.signIn();
      this.callNumber = num;
      this.callContact = contact;
      this.callPhase = 'dialing';
      this.statusSince = Date.now();
      if (dialTimer) clearTimeout(dialTimer);
      dialTimer = setTimeout(() => {
        if (this.callPhase === 'dialing') {
          this.callPhase = 'talking';
          this.callSince = Date.now();
        }
      }, 1800);
    },
    hangup() {
      if (dialTimer) clearTimeout(dialTimer);
      this.callPhase = 'none';
      this.callNumber = '';
      this.callContact = '';
      this.callSince = 0;
      this.presence = 'idle';
      this.statusSince = Date.now();
    },
  },
});
