import type { TicketDetailMeta } from '@/mock/ticketDetail';
import type { CreateTicketPrefill } from './ticket';

export type UnifiedCreateScene = 'general' | 'xiaozhi';
export type CreateWorkAction = 'create' | 'transfer' | 'escalateComplaint' | 'escalateExternal' | 'linkComplaint' | 'reopen' | 'aftersale';
export interface CreateWorkContext {
  action: CreateWorkAction;
  scene: UnifiedCreateScene;
  source?: TicketDetailMeta;
  prefill?: CreateTicketPrefill;
  confirmedUpgradeStatus?: string;
  aftersaleAction?: '关联售后' | '转售后';
}
export interface CreateWorkItem {
  id: string;
  owner: string;
  identity: string;
  context: CreateWorkContext;
  draftId?: string;
  form?: Record<string, unknown>;
  aftersaleForm?: Record<string, unknown>;
  surface?: 'ticket' | 'aftersale';
  modalHost?: 'workspace' | 'unified';
  aftersalePrefill?: Record<string, unknown>;
  aftersaleOpen: boolean;
  aftersaleDismissed?: string;
  savedInput: string;
  status: 'editing' | 'submitting' | 'unknown' | 'complete';
  resultNo?: string;
  error?: string;
}
export const CREATE_WORK_LABELS: Record<CreateWorkAction, string> = {
  create: '统一建单', transfer: '转单', escalateComplaint: '升级投诉', escalateExternal: '升级外投',
  linkComplaint: '关联投诉', reopen: '承接补充', aftersale: '创建售后工单',
};
export function workPath(id: string) { return `/unified-create/${encodeURIComponent(id)}`; }
export function workInput(item: CreateWorkItem) {
  return JSON.stringify({ form: item.form, aftersaleForm: item.aftersaleForm });
}
export function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function workTitle(context: CreateWorkContext) {
  if (context.source) return `${CREATE_WORK_LABELS[context.action]} · ${context.source.no}`;
  return context.action === 'create' && context.scene === 'xiaozhi' ? '新建小智工单' : CREATE_WORK_LABELS[context.action];
}
