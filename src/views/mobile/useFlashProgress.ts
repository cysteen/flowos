import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { TICKETS } from '@/mock/tickets';
import { useFlashStore } from '@/stores/flash';
import type { FlashProgressStage } from '@/views/tickets/types/flash';

/**
 * 用户侧进度（930 教育刷机单 PRD §2.5「进度映射」/ 页面规格 P2 / P0-6）。
 *
 * 步骤条四步：已受理 → 处理中 → 待回访 → 已完成。进度取地基 `flashProgressStage`（已按 PRD §2.5 口径）。
 */
export const FLASH_STEP_LABELS = ['已受理', '处理中', '待回访', '已完成'] as const;

export type FlashUserStage = FlashProgressStage;

/** 当前进度文案：处理中 · 自动刷机中 / 处理中 · 人工处理中 / 待回访 / 已完成 */
export function userStageText(stage: FlashUserStage): string {
  if (stage === '自动刷机中' || stage === '人工处理中') return `处理中 · ${stage}`;
  return stage;
}

/** 步骤条当前步下标（0 已受理 · 1 处理中 · 2 待回访 · 3 已完成） */
export function userStageStep(stage: FlashUserStage): number {
  if (stage === '待回访') return 2;
  if (stage === '已完成') return 3;
  return 1;
}

export function normalizeFlashNo(no: string): string {
  return no.trim().toUpperCase();
}

/** 按单号读用户侧进度；轮询 `revisionOf`，自动刷机中的单停留在页面上能看到进度变化 */
export function useFlashProgress(no: Ref<string>) {
  const flash = useFlashStore();
  const tick = ref(0);
  let lastRev = -1;
  let lastNo = '';
  let timer: number | undefined;

  function poll() {
    const key = no.value;
    const rev = key ? flash.revisionOf(key) : 0;
    if (key !== lastNo || rev !== lastRev) {
      lastNo = key;
      lastRev = rev;
      tick.value += 1;
    }
  }

  onMounted(() => {
    poll();
    timer = window.setInterval(poll, 1000);
  });
  onBeforeUnmount(() => window.clearInterval(timer));

  const snapshot = computed(() => {
    void tick.value;
    const key = no.value;
    if (!key) return null;
    const raw = flash.progressStageOf(key);
    const ticket = TICKETS.find((t) => t.no === key);
    if (!raw || !ticket || ticket.isDraft || ticket.nodeStatus === '草稿') return null;
    const stage = raw;
    return {
      no: key,
      stage,
      text: userStageText(stage),
      step: userStageStep(stage),
      updatedAt: ticket.updatedAt,
    };
  });

  return { snapshot, refresh: poll };
}
