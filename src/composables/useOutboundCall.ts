import { message } from 'ant-design-vue';
import { useCtiStore } from '@/stores/cti';

export interface OutboundCallPayload {
  phone: string;
  contactLabel: string;
  ticketId?: string;
}

function validateCtiState(cti: ReturnType<typeof useCtiStore>): string | null {
  if (cti.workStatus === 'offline') return '请先签入';
  // 外呼只能从「就绪」发起：未就绪、小休都要先切就绪
  if (cti.workStatus === 'break' || cti.workStatus === 'logged_in') return '请先切换为就绪';
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
      /** 已选定的外显号码。空字符串表示当前没有可用号码 */
      outboundNumber?: string;
    },
  ): boolean {
    const err = validateCtiState(cti);
    if (err) {
      message.warning(err);
      return false;
    }
    if (!payload.phone.trim()) return false;

    const outboundNumber = hooks?.outboundNumber?.trim() ?? '';
    if (!outboundNumber) {
      message.warning(
        hooks?.outboundNumber === undefined
          ? '请选择外显号码'
          : '暂无可用外显号码，请联系管理员配置',
      );
      return false;
    }

    const ok = executeCall(payload, outboundNumber);
    if (ok) hooks?.onSuccess?.(outboundNumber);
    return ok;
  }

  return {
    requestOutboundCall,
    checkCanCall,
  };
}
