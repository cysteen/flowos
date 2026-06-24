import { onBeforeUnmount, ref } from 'vue';
import type { TicketLiveEventType, TicketLiveToast } from '@/views/tickets/types/ticketLiveNotify';

const AUTO_DISMISS_MS = 5000;

function buildTitle(type: TicketLiveEventType) {
  return type === 'urge' ? '新增催单信息' : '新增补充信息';
}

export function useTicketLiveNotify() {
  const toasts = ref<TicketLiveToast[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function dismiss(id: string) {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);
    toasts.value = toasts.value.filter((item) => item.id !== id);
  }

  function dismissAll() {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    toasts.value = [];
  }

  function push(
    type: TicketLiveEventType,
    content: string,
    who: string,
    when: string,
    supplementType?: string,
  ) {
    const item: TicketLiveToast = {
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      title: buildTitle(type),
      who,
      when,
      content: content.trim(),
      supplementType: type === 'supplement' ? supplementType : undefined,
    };
    toasts.value = [item, ...toasts.value].slice(0, 4);
    timers.set(item.id, setTimeout(() => dismiss(item.id), AUTO_DISMISS_MS));
    return item;
  }

  onBeforeUnmount(() => {
    dismissAll();
  });

  return { toasts, push, dismiss, dismissAll };
}
