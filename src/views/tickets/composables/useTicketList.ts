import { computed, reactive, ref } from 'vue';
import { TICKETS } from '@/mock/tickets';
import {
  isFirstResponded,
  type SlaState,
  type Ticket,
  type TicketType,
} from '@/views/tickets/types/ticket';

export interface ListFilters {
  keyword: string;
  type?: TicketType;
  status?: string;
  priority?: string;
  slaStatus?: SlaState | 'all';
  channel?: string;
  product: string;
  assignee?: string;
  dateRange: string;
}

function matchFilters(t: Ticket, f: ListFilters): boolean {
  if (f.keyword) {
    const kw = f.keyword.toLowerCase();
    const hay = `${t.no} ${t.title} ${t.customer}`.toLowerCase();
    if (!hay.includes(kw)) return false;
  }
  if (f.type && t.type !== f.type) return false;
  if (f.priority && t.priority !== f.priority) return false;
  if (f.channel && t.channel !== f.channel) return false;
  if (f.product && !t.product.includes(f.product)) return false;
  if (f.assignee === 'pool' && t.assignee !== null) return false;
  if (f.assignee && f.assignee !== 'pool' && t.assignee !== f.assignee) return false;
  if (f.slaStatus && f.slaStatus !== 'all' && t.slaState !== f.slaStatus) return false;
  if (f.status && f.status !== 'all') {
    /** 看板下钻：按业务态筛选（不全是 nodeStatus 枚举） */
    if (f.status === 'delegated') {
      if (!(t.hasDelegateHistory || t.myDelegateAction)) return false;
    } else if (f.status === 'transferred') {
      // 已转出·售后（停表等待）或已挂关联售后单的原单
      if (!String(t.nodeStatus).includes('已转出') && !t.linkedAftersaleNo) return false;
    } else if (f.status === 'returned') {
      if (!t.hasReturnAction) return false;
    } else if (f.status === 'transferIn') {
      if (t.ticketSource !== '售后转入' && t.ticketSource !== '跨组调剂') return false;
    /* ── 班组看板「今日指标」区下钻（2026-08-05）── */
    } else if (f.status === 'escalated') {
      // 今日升级：升级到技术支持 / 飞书
      if (t.nodeStatus !== '已升级·二线' && !t.smartMarks?.includes('升级')) return false;
    } else if (f.status === 'firstResponseOverdue') {
      // 首响超时：首响钟已超时（未首响时 slaState 即首响钟）
      if (isFirstResponded(t) || t.slaState !== 'overdue') return false;
    } else if (f.status === 'resolutionOverdue') {
      // 解决超时：解决钟已超时。已首响后 slaState 即解决钟；未首响时看 resolveSlaState
      const resolveState = isFirstResponded(t) ? t.slaState : t.resolveSlaState;
      if (resolveState !== 'overdue') return false;
    } else if (f.status === 'contactMissed') {
      // 24 小时未联络：进线满 24h 但至今没有过联络动作
      if (isFirstResponded(t)) return false;
    } else if (f.status === 'serviceBad') {
      // 服务不满意：调研中人员服务分 1–3 分（4–5 分为满意，未评价不计）
      if (t.serviceScore == null || t.serviceScore > 3) return false;
    } else {
      const map: Record<string, string[]> = {
        pending: ['待受理'],
        processing: ['处理中·一线', '已升级·二线'],
        held: ['已挂起·待客户'],
        review: ['待审核'],
      };
      const allowed = map[f.status];
      if (allowed && !allowed.includes(t.nodeStatus)) return false;
    }
  }
  return true;
}

/** 列表页默认按更新时间倒序（PRD-05 §9） */
function byUpdatedDesc(a: Ticket, b: Ticket): number {
  const ta = a.updatedAt ?? a.no;
  const tb = b.updatedAt ?? b.no;
  return tb.localeCompare(ta);
}

export function useTicketList() {
  const all = ref<Ticket[]>([...TICKETS]);

  const selectedIds = ref<Set<string>>(new Set());
  const current = ref(1);
  const pageSize = ref(10);

  const filters = reactive<ListFilters>({
    keyword: '',
    type: undefined,
    status: undefined,
    priority: undefined,
    slaStatus: undefined,
    channel: undefined,
    product: '',
    assignee: undefined,
    dateRange: '',
  });

  /** 全量库默认不含已归档；归档态通过后续筛选扩展 */
  const baseRows = computed(() => all.value.filter((t) => !t.archived));

  const filtered = computed(() => baseRows.value.filter((t) => matchFilters(t, filters)));

  const sorted = computed(() => [...filtered.value].sort(byUpdatedDesc));

  const total = computed(() => sorted.value.length);

  const paged = computed(() => {
    const start = (current.value - 1) * pageSize.value;
    return sorted.value.slice(start, start + pageSize.value);
  });

  const selectedCount = computed(() => selectedIds.value.size);
  const allPageSelected = computed(
    () => paged.value.length > 0 && paged.value.every((t) => selectedIds.value.has(t.id)),
  );

  function applyFilters() {
    current.value = 1;
  }

  function resetFilters() {
    filters.keyword = '';
    filters.type = undefined;
    filters.status = undefined;
    filters.priority = undefined;
    filters.slaStatus = undefined;
    filters.channel = undefined;
    filters.product = '';
    filters.assignee = undefined;
    filters.dateRange = '';
    current.value = 1;
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds.value);
    next.has(id) ? next.delete(id) : next.add(id);
    selectedIds.value = next;
  }

  function toggleSelectAllOnPage() {
    const next = new Set(selectedIds.value);
    if (allPageSelected.value) paged.value.forEach((t) => next.delete(t.id));
    else paged.value.forEach((t) => next.add(t.id));
    selectedIds.value = next;
  }

  function clearSelection() {
    selectedIds.value = new Set();
  }

  function setPage(page: number, size: number) {
    current.value = page;
    pageSize.value = size;
  }

  function addTicket(t: Ticket) {
    all.value = [t, ...all.value];
  }

  return {
    all,
    filters,
    selectedIds,
    current,
    pageSize,
    filtered,
    sorted,
    paged,
    total,
    selectedCount,
    allPageSelected,
    applyFilters,
    resetFilters,
    toggleSelect,
    toggleSelectAllOnPage,
    clearSelection,
    setPage,
    addTicket,
  };
}
