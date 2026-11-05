import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { TICKETS } from '@/mock/tickets';
import { DELEGATE_TASK_SEEDS, type DelegateTask } from '@/mock/delegateTasks';
import type { DelegatePayload } from '@/views/tickets/composables/opActions';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';

export type { DelegateTask, DelegateTaskStatus } from '@/mock/delegateTasks';

/**
 * 委派子任务：一次委派一批，每条一个协办对象，各自处理、各自完成。
 * 工单的「已委派」由它推出：有待处理子任务即已委派，全部处理完或被撤销即回处理中。
 * 处理页、工作台两个页签都读这一份，刷新后仍在。
 *
 * 版本号：改种子或数据形状就升。
 * v1：首版，种子三批（到人、到组、已完成）。
 */
const LS_KEY = 'flowos-delegate-tasks';
const CACHE_VERSION = 1;
const STALE_MS = 12 * 60 * 60 * 1000;

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

interface Saved { v: number; savedAt: number; tasks: DelegateTask[]; logs: Record<string, TimelineEntry[]> }

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    if (saved?.v !== CACHE_VERSION || Date.now() - saved.savedAt > STALE_MS || !Array.isArray(saved.tasks)) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

/** 协办对象展示名：到人＝姓名；到组＝组名，组内已有人时带上「组名(姓名)」 */
export function delegateTargetLabel(t: Pick<DelegateTask, 'mode' | 'assignee' | 'groupName'>): string {
  if (t.mode === 'person') return t.assignee ?? '';
  return t.assignee ? `${t.groupName}(${t.assignee})` : (t.groupName ?? '');
}

export const useDelegateTaskStore = defineStore('delegateTasks', () => {
  const saved = readSaved();
  const tasks = ref<DelegateTask[]>(saved?.tasks ?? DELEGATE_TASK_SEEDS.map((t) => ({ ...t })));
  const logs = ref<Record<string, TimelineEntry[]>>(saved?.logs ?? {});
  let seq = tasks.value.length;

  watch([tasks, logs], () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        v: CACHE_VERSION, savedAt: Date.now(), tasks: tasks.value, logs: logs.value,
      }));
    } catch {
      /* 配额超限等忽略 */
    }
  }, { deep: true });

  function tasksOf(no: string): DelegateTask[] {
    return tasks.value.filter((t) => t.ticketNo === no);
  }
  /** 待处理子任务 */
  function pendingOf(no: string): DelegateTask[] {
    return tasksOf(no).filter((t) => t.status === '待处理');
  }
  /** 当前一批（最近一次委派里未被撤销的子任务） */
  function currentBatchOf(no: string): DelegateTask[] {
    const list = tasksOf(no).filter((t) => t.status !== '已撤销');
    const last = list[list.length - 1];
    return last ? list.filter((t) => t.batchId === last.batchId) : [];
  }
  /** 委派给某人的子任务（已撤销的不算） */
  function myTasksOf(no: string, name: string): DelegateTask[] {
    return tasksOf(no).filter((t) => t.assignee === name && t.status !== '已撤销');
  }
  /** 委派任务池：委派给本人的子任务 */
  function poolOf(name: string): DelegateTask[] {
    return tasks.value.filter((t) => t.assignee === name && t.status !== '已撤销');
  }
  /** 本组委派任务：委派到本人所在组、尚未有人认领的子任务 */
  function groupPoolOf(groupIds: string[]): DelegateTask[] {
    return tasks.value.filter((t) => t.mode === 'group' && !t.assignee && t.status === '待处理'
      && !!t.groupId && groupIds.includes(t.groupId));
  }

  /** 工单行状态与子任务对齐（载入与每次变更时跑）：有待处理＝已委派；曾委派、已无待处理的回处理中 */
  function syncRow(no: string) {
    const row = TICKETS.find((x) => x.no === no);
    if (!row) return;
    row.hasDelegateHistory = true;
    if (pendingOf(no).length) row.nodeStatus = '已委派';
    else if (row.nodeStatus === '已委派') row.nodeStatus = '处理中';
  }
  [...new Set(tasks.value.map((t) => t.ticketNo))].forEach(syncRow);

  function createBatch(no: string, data: DelegatePayload, operator: string) {
    const batchId = `batch-${Date.now()}`;
    const batchAt = nowStamp();
    const base = { ticketNo: no, batchId, batchAt, operator, status: '待处理' as const };
    const next = (): string => {
      seq += 1;
      return `dt-${Date.now()}-${seq}`;
    };
    if (data.mode === 'person') {
      (data.assignees ?? []).forEach((a) => {
        tasks.value.push({ ...base, id: next(), mode: 'person', assignee: a.name, task: a.task });
      });
    } else {
      (data.groups ?? []).forEach((g) => {
        tasks.value.push({
          ...base, id: next(), mode: 'group', assignee: g.assignee ?? null, groupId: g.groupId, groupName: g.groupName, task: g.task,
        });
      });
    }
    const row = TICKETS.find((x) => x.no === no);
    if (row) row.myDelegateAction = true;
    syncRow(no);
  }

  /** 撤销委派：待处理的子任务作废，已完成的保留 */
  function revoke(no: string) {
    pendingOf(no).forEach((t) => { t.status = '已撤销'; });
    syncRow(no);
  }

  function complete(taskId: string, result: string, by: string) {
    const t = tasks.value.find((x) => x.id === taskId);
    if (!t || t.status !== '待处理') return null;
    t.status = '已完成';
    t.result = result;
    t.finishedAt = nowStamp();
    t.assignee = t.assignee ?? by;
    syncRow(t.ticketNo);
    return t;
  }

  /** 协办回送：剩余子任务一并完成（刷机单「下送 · 回到委派节点」） */
  function completeAll(no: string, by: string) {
    pendingOf(no).forEach((t) => complete(t.id, '协办完成，已送回主责', by));
  }

  /** 认领：把委派到组的子任务落到本人 */
  function claim(taskId: string, name: string): boolean {
    const t = tasks.value.find((x) => x.id === taskId);
    if (!t || t.assignee || t.status !== '待处理') return false;
    t.assignee = name;
    return true;
  }

  function logsOf(no: string): TimelineEntry[] {
    return logs.value[no] ?? [];
  }
  function appendLogs(no: string, entries: TimelineEntry[]) {
    if (!entries.length) return;
    logs.value = { ...logs.value, [no]: [...logsOf(no), ...entries.map((e) => JSON.parse(JSON.stringify(e)) as TimelineEntry)] };
  }

  const count = computed(() => tasks.value.length);

  return {
    tasks, count, tasksOf, pendingOf, currentBatchOf, myTasksOf, poolOf, groupPoolOf,
    createBatch, revoke, complete, completeAll, claim, logsOf, appendLogs,
  };
});
