import { ref } from 'vue';
import { message } from 'ant-design-vue';
import {
  getOutboundNumbersForTeam,
  resolveAgentTeamKey,
  type OutboundNumberOption,
} from '@/mock/outboundNumbers';
import { useCtiStore } from '@/stores/cti';
import { useUserStore } from '@/stores/user';

export interface OutboundCallPayload {
  phone: string;
  contactLabel: string;
  ticketId?: string;
}

const pickerOpen = ref(false);
const pickerOptions = ref<OutboundNumberOption[]>([]);
const selectedId = ref('');
let pendingPayload: OutboundCallPayload | null = null;
let pendingOnSuccess: ((outboundNumber: string) => void) | null = null;

function validateCtiState(cti: ReturnType<typeof useCtiStore>): string | null {
  if (cti.workStatus === 'offline') return '请先签入上班';
  if (cti.workStatus === 'break') return '请先切换为就绪';
  if (cti.callSession) return '当前有进行中的外呼';
  return null;
}

function executeCall(payload: OutboundCallPayload, outboundNumber: string): boolean {
  const cti = useCtiStore();
  const ok = cti.startCall({
    ticketId: payload.ticketId ?? '',
    phone: payload.phone,
    contactLabel: payload.contactLabel,
    outboundNumber,
  });
  if (ok) {
    message.success(`正在呼叫 ${payload.phone}（外显 ${outboundNumber}）`);
    pendingOnSuccess?.(outboundNumber);
  } else {
    message.warning('当前状态无法外呼');
  }
  return ok;
}

function resetPicker() {
  pickerOpen.value = false;
  pendingPayload = null;
  pendingOnSuccess = null;
  pickerOptions.value = [];
  selectedId.value = '';
}

/** 外呼前选择外显号码（拨号盘 / 工单侧栏一键呼叫共用） */
export function useOutboundCall() {
  const cti = useCtiStore();
  const user = useUserStore();

  function requestOutboundCall(
    payload: OutboundCallPayload,
    hooks?: {
      onSuccess?: (outboundNumber: string) => void;
      /** 弹出选号层前回调（如关闭拨号盘 Popover，避免遮挡 Modal） */
      onPickerOpen?: () => void;
    },
  ): boolean {
    const err = validateCtiState(cti);
    if (err) {
      message.warning(err);
      return false;
    }
    if (!payload.phone.trim()) return false;

    const options = getOutboundNumbersForTeam(resolveAgentTeamKey(user.roleKey));
    if (!options.length) {
      message.warning('暂无可用外显号码，请联系管理员在「外显号码」中配置');
      return false;
    }

    if (options.length === 1) {
      pendingOnSuccess = hooks?.onSuccess ?? null;
      const ok = executeCall(payload, options[0].number);
      pendingOnSuccess = null;
      return ok;
    }

    pendingPayload = payload;
    pendingOnSuccess = hooks?.onSuccess ?? null;
    pickerOptions.value = options;
    selectedId.value = options[0].id;
    hooks?.onPickerOpen?.();
    pickerOpen.value = true;
    return true;
  }

  function confirmPicker() {
    if (!pendingPayload) return;
    const picked = pickerOptions.value.find((o) => o.id === selectedId.value);
    if (!picked) {
      message.warning('请选择外显号码');
      return;
    }
    executeCall(pendingPayload, picked.number);
    resetPicker();
  }

  function cancelPicker() {
    resetPicker();
  }

  return {
    pickerOpen,
    pickerOptions,
    selectedId,
    requestOutboundCall,
    confirmPicker,
    cancelPicker,
  };
}
