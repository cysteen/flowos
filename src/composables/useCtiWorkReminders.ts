import { h, onBeforeUnmount, watch } from 'vue';
import { Button, notification } from 'ant-design-vue';
import { useCtiStore } from '@/stores/cti';
import {
  IDLE_TICKET_WORK_REMIND_MIN, OFFLINE_CONFIRM_REMIND_MIN, useCtiFlowStore,
} from '@/stores/ctiFlow';
import { useUserStore } from '@/stores/user';
import { DEFAULT_WORK_TYPE, workTypeOf } from '@/mock/ctiWorkTypes';

const MIN = 60_000;
const IDLE_KEY = 'cti-remind-idle';
const OFFLINE_KEY = 'cti-remind-offline';

function durationText(ms: number): string {
  const m = Math.floor(ms / MIN);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} 小时 ${m % 60} 分钟` : `${h} 小时`;
}

/**
 * 话务条两条提醒（随话务条挂载，跟随话务条 1 秒时钟判定）：
 * 1. 停在「工单处理」超过 N 分钟没有工单操作 → 提醒切换状态；
 * 2. 处于线下子状态超过 M 分钟 → 提醒确认是否仍在进行（「仍在进行」重新计时）。
 * 每个计时起点只提醒一次；状态切换或有工单操作即换起点。
 */
export function useCtiWorkReminders() {
  const cti = useCtiStore();
  const flow = useCtiFlowStore();
  const user = useUserStore();
  let idleAnchor = 0;
  let offlineAnchor = 0;

  function closeAll() {
    notification.close(IDLE_KEY);
    notification.close(OFFLINE_KEY);
  }

  const stop = watch(
    () => cti.now,
    (now) => {
      if (!now) return;
      if (cti.workStatus !== 'ready') {
        if (idleAnchor || offlineAnchor) closeAll();
        idleAnchor = 0;
        offlineAnchor = 0;
        return;
      }
      const type = workTypeOf(cti.readyMode);
      if (!type) return;
      if (!type.offline) {
        notification.close(OFFLINE_KEY);
        const from = Math.max(cti.workStatusSince, flow.lastOpAt(user.name));
        if (now - from < IDLE_TICKET_WORK_REMIND_MIN * MIN) {
          // 有了工单操作或已切换状态：撤下仍挂着的提醒
          if (idleAnchor && idleAnchor !== from) {
            notification.close(IDLE_KEY);
            idleAnchor = 0;
          }
          return;
        }
        if (idleAnchor === from) return;
        idleAnchor = from;
        notification.warning({
          key: IDLE_KEY,
          message: '请确认当前工作状态',
          description: `已连续 ${durationText(now - from)}未进行工单操作。如正在进行其他工作，请在话务条切换到对应状态。`,
          duration: 0,
          placement: 'topRight',
        });
        return;
      }
      notification.close(IDLE_KEY);
      const from = Math.max(cti.workStatusSince, flow.confirmedAt(user.name));
      if (now - from < OFFLINE_CONFIRM_REMIND_MIN * MIN || offlineAnchor === from) return;
      offlineAnchor = from;
      notification.warning({
        key: OFFLINE_KEY,
        message: '请确认工作是否仍在进行',
        description: `「${type.label}」已持续 ${durationText(now - cti.workStatusSince)}，请确认是否仍在进行。`,
        duration: 0,
        placement: 'topRight',
        btn: () => h('div', { style: 'display:flex;gap:8px' }, [
          h(Button, {
            size: 'small',
            onClick: () => {
              cti.setReadyMode(DEFAULT_WORK_TYPE);
              notification.close(OFFLINE_KEY);
            },
          }, () => '已结束，切回工单处理'),
          h(Button, {
            size: 'small',
            type: 'primary',
            onClick: () => {
              flow.confirmOngoing();
              notification.close(OFFLINE_KEY);
            },
          }, () => '仍在进行'),
        ]),
      });
    },
  );

  onBeforeUnmount(() => {
    stop();
    closeAll();
  });
}
