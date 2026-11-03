/**
 * 【1215】调剂 / 升级三线弹窗的候选项（PRD 9.4 / 9.5）。
 *
 * - 调剂到人：候选为全部坐席（停用除外、不含当前处理人），按组分段；每行「姓名 · 所属组 · 坐席状态 · 在途 N / 上限 M」。
 *   调剂权限沿用现行：无跨组调剂权的角色只可选归属组成员，其余置灰；个册退费单只限本组成员。
 *   选人后再选归属池：此人所在各组的启用池，每项「〈池名称〉 · 〈处理组〉」；无跨组调剂权时只置灰非归属组的池。
 * - 调剂到池：全部启用中的工单池（含当前归属池），每项「〈池名称〉 · 〈派单方式〉」；无跨组调剂权时只可选归属组的池。
 * - 升级三线 · 指定技术支持：技术支持组成员，每行「姓名 · 坐席状态 · 在途 N / 上限 M」。
 */
import { computed } from 'vue';
import { useDispatchStore } from '@/stores/dispatch';
import { useUserStore } from '@/stores/user';
import { isRefundTicket } from '@/views/tickets/types/refund';
import type { DispatchAgent } from '@/views/tickets/types/dispatch';
import { TECH_POOL_ID, ticketRowOf } from './transferDispatch';

export const TRANSFER_REASON_MAX = 200;
export const CROSS_GROUP_TIP = '仅二线班组长 / 客诉专员 / 投诉督导 / 工单运营 / 管理员可跨组调剂';

interface Opt { value: string; label: string; disabled?: boolean; title?: string }

export function useTransferOptions(ticketNo: () => string, canCrossGroup: () => boolean) {
  const store = useDispatchStore();
  const user = useUserStore();

  const row = computed(() => ticketRowOf(ticketNo()));
  /** 当前归属组：工单行归属组为派单组时取它；否则取发起人所在各组 */
  const homeGroupIds = computed<string[]>(() => {
    const g = row.value?.groupId;
    if (g && store.isDispatchGroup(g)) return [g];
    return store.agentOf(user.name)?.groupIds ?? [];
  });
  const refundOnly = computed(() => !!row.value && isRefundTicket(row.value));
  const crossAllowed = computed(() => canCrossGroup() && !refundOnly.value);

  function groupText(a: DispatchAgent): string {
    return a.groupIds.map((id) => store.groupOf(id)?.label).filter(Boolean).join('、');
  }
  function loadText(name: string): string {
    const v = store.agentView(name);
    return v ? `在途 ${v.inTransit} / 上限 ${v.cap}` : '';
  }
  function inHome(a: DispatchAgent): boolean {
    return a.groupIds.some((id) => homeGroupIds.value.includes(id));
  }

  /** 调剂到人：按组分段，一人只出现在其第一个所属组段内 */
  const personOptions = computed(() => {
    const current = row.value?.assignee ?? null;
    const placed = new Set<string>();
    return store.groups
      .map((g) => {
        const options: Opt[] = store.membersOf(g.id)
          .filter((a) => !a.disabled && a.name !== current && !placed.has(a.name))
          .map((a) => {
            placed.add(a.name);
            const allowed = crossAllowed.value || inHome(a);
            return {
              value: a.name,
              label: `${a.name} · ${groupText(a)} · ${a.signIn} · ${loadText(a.name)}`,
              disabled: !allowed,
              title: allowed ? undefined : CROSS_GROUP_TIP,
            };
          });
        return { label: g.label, options };
      })
      .filter((g) => g.options.length);
  });

  /** 工单当前所在池 */
  const currentPoolId = computed(() => (row.value ? store.poolIdOf(row.value) : undefined));

  /**
   * 调剂到人的归属池候选：此人所在各组的启用池，每项「〈池名称〉 · 〈处理组〉」；无跨组调剂权时只置灰非归属组的池。
   * 个册退费单只在本组内调剂、不换池，不出候选。
   */
  function poolChoicesFor(name?: string): Opt[] {
    const a = store.agentOf(name);
    if (!a || refundOnly.value) return [];
    return a.groupIds.flatMap((gid) => store.poolsOfGroup(gid, true).map((p) => {
      const allowed = crossAllowed.value || homeGroupIds.value.includes(gid);
      return {
        value: p.id,
        label: `${p.name} · ${store.groupOf(gid)?.label ?? gid}`,
        disabled: !allowed,
        title: allowed ? undefined : CROSS_GROUP_TIP,
      };
    }));
  }

  const poolOptions = computed<Opt[]>(() => store.enabledPools().map((p) => {
    const allowed = crossAllowed.value || homeGroupIds.value.includes(p.groupId);
    return {
      value: p.id,
      label: `${p.name} · ${store.effectiveModeOf(p.id)}`,
      disabled: !allowed,
      title: allowed ? undefined : CROSS_GROUP_TIP,
    };
  }));

  /** 升级三线 · 指定技术支持：技术支持组成员（不含本单当前处理人） */
  const techOptions = computed<Opt[]>(() => {
    const current = row.value?.primaryOwner ?? row.value?.assignee ?? null;
    return store.membersOf(TECH_POOL_ID)
      .filter((a) => !a.disabled && a.name !== current)
      .map((a) => ({ value: a.name, label: `${a.name} · ${a.signIn} · ${loadText(a.name)}` }));
  });

  /** 指定后将超个人上限时返回「在途 N / 上限 M」，否则 null */
  function overCapOf(name?: string): { inTransit: number; cap: number } | null {
    const v = name ? store.agentView(name) : undefined;
    if (!v) return null;
    return v.inTransit + 1 > v.cap ? { inTransit: v.inTransit, cap: v.cap } : null;
  }

  function poolWaits(poolId: string): boolean {
    return store.effectiveModeOf(poolId) !== '自动派单';
  }

  return { row, personOptions, currentPoolId, poolChoicesFor, poolOptions, techOptions, overCapOf, poolWaits, poolLabel: store.poolLabel };
}
