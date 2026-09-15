import { message } from 'ant-design-vue';
import { useCtiStore } from '@/stores/cti';

export interface OutboundCallPayload {
  phone: string;
  contactLabel: string;
  ticketId?: string;
}

function validateCtiState(cti: ReturnType<typeof useCtiStore>): string | null {
  if (cti.workStatus === 'offline') return '请先签入';
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
  if (!ok) {
    message.warning('当前状态无法外呼');
  }
  return ok;
}

/** 外呼（拨号盘 / 工单侧栏一键呼叫共用） */
export function useOutboundCall() {
  const cti = useCtiStore();

  function checkCanCall(): string | null {
    return validateCtiState(cti);
  }

  function requestOutboundCall(
    payload: OutboundCallPayload,
    hooks?: {
      onSuccess?: (outboundNumber: string) => void;
      /** 拨号盘等场景已选定外显号（空字符串=不指定） */
      outboundNumber?: string;
    },
  ): boolean {
    const err = validateCtiState(cti);
    if (err) {
      message.warning(err);
      return false;
    }
    if (!payload.phone.trim()) return false;

    if (hooks?.outboundNumber === undefined) {
      message.warning('请选择外显号码');
      return false;
    }

    const ok = executeCall(payload, hooks.outboundNumber.trim());
    if (ok) hooks?.onSuccess?.(hooks.outboundNumber.trim());
    return ok;
  }

  return {
    requestOutboundCall,
    checkCanCall,
  };
}
