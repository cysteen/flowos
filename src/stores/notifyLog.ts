import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { NotifyKind, NotifyRecord } from '@/views/tickets/types/operationTabs';

/**
 * 运行时通知记录（决议 O22）。
 *
 * 【为什么单开一个 store，而不是往 mock 里写】
 * 工单页「通知记录」Tab 的数据源 `mock/ticketOperationTabs.ts` / `ticketTypeSamples.ts`
 * 是**静态常量**：按工单类型预置好、模块加载时就定死。运行时刚发生的动作（报备提交、
 * 分派、评估、撤回）产生的通知**没地方落** —— 往常量数组里 push 既污染样本数据，
 * 又会因为它按「工单类型」组织而落错单（同类型的所有单共用一份样本）。
 * 所以运行时那批单独存一份，按 `ticketNo` 归档，展示时与静态那批合并。
 *
 * 【为什么形状照抄 `NotifyRecord` 而不另造】
 * Tab 组件渲染的就是 `NotifyRecord`。另造一套字段就得在组件里做两套渲染分支，
 * 而"运行时产生的通知"与"预置的通知"在业务上是同一种东西，不该在界面上长得不一样。
 * 这里只多两个字段：`ticketNo`（静态那批靠所在样本归属工单，运行时的必须自己带路由键）
 * 与 `event`（事件码，对齐《【815】》事件目录的 `ticket.*` / `approval.*` 命名）。
 *
 * 【本轮边界】只有风险报备五个事件走这条链路（O22：不改造全系统通知）。
 * 其余通知仍是静态样本。
 *
 * 【持久化】与 `stores/riskReports.ts` 同一套写法落 localStorage。通知的收件人往往
 * **不是发出这条通知的人**（报备人报完，通知落给投诉督导），要看到它就得换个角色登录；
 * 纯内存态下换登录即清空，这条链在演示里永远走不到收件人那一端。
 */

/** 运行时记录 ＝ `NotifyRecord` + 归档键 + 事件码。字段名与静态那批逐一对齐 */
export interface RuntimeNotifyRecord extends NotifyRecord {
  ticketNo: string;
  /** 事件码，如 `risk.report.submitted`。留着是为了日后接《【815】》通知规则时能按事件匹配 */
  event: string;
}

/** 通知时刻取到秒：同一分钟内可能连着发两条（分派完立刻评估），只到分不够区分先后 */
function nowStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export interface EmitNotifyInput {
  ticketNo: string;
  event: string;
  kind: NotifyKind;
  title: string;
  /**
   * 🔴 **按「类型」传，不要自己先拼好一个字符串**（决议 O23）。
   * 每一项是一"类"收件人解析出来的结果，解析不到的传空串 / null。
   * 空的那一类在这里被**逐类剔除**，剩下的照发；全空才整条不发。
   */
  receivers: (string | null | undefined)[];
  content: string;
  channel?: string;
  status?: string;
}

export const useNotifyLogStore = defineStore('notifyLog', () => {
  const records = ref<RuntimeNotifyRecord[]>([]);
  /** 自增序号只用来造 id，不参与任何业务判断 */
  const seq = ref(0);

  const LS_KEY = 'flowos-notify-log';
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { records: RuntimeNotifyRecord[]; seq: number };
      if (Array.isArray(saved?.records)) {
        records.value = saved.records;
        seq.value = typeof saved.seq === 'number' ? saved.seq : saved.records.length;
      }
    }
  } catch {
    /* 解析失败就从空开始，只影响运行时那批，静态样本照常 */
  }
  watch(
    [records, seq],
    () => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({ records: records.value, seq: seq.value }));
      } catch {
        /* 配额超限等忽略 */
      }
    },
    { deep: true },
  );

  /**
   * 发一条通知。返回落下的那条；一条都没发出去时返回 null。
   *
   * 🔴 **收件人为空按「类型级」处理，不按「规则级」**（决议 O23）：
   * 配了多类收件人时，**能解析的照发、解析为空的那一类跳过**，不整条丢弃。
   *
   * 【判据】撤回通知配的是「投诉督导 + 承办人」，而**撤回只在待分派态可做**（§4.8），
   * 那一刻承办人**必然为空**。按规则级（有一类解析不到就整条不发）这条通知会被
   * **静默丢掉** —— 督导那边什么都收不到，而这条队列卡的是**投诉立项**（※8a）。
   * 一个恒为空的收件人类型，不该让另一个解析得到的收件人跟着收不到。
   *
   * 同理，系统自动入队的四类来源（全量投诉 / VIP 等）报备人是「系统」，
   * 「报备人」这一类解析为空 —— 那一类跳过即可，不影响同一条通知的其余收件人。
   */
  function emit(input: EmitNotifyInput): RuntimeNotifyRecord | null {
    const receivers = input.receivers.map((x) => (x ?? '').trim()).filter(Boolean);
    // 全部类型都解析为空：确实没有人可收，这时候才是真的不发
    if (!receivers.length) return null;
    seq.value += 1;
    const rec: RuntimeNotifyRecord = {
      id: `nl-${seq.value}`,
      ticketNo: input.ticketNo,
      event: input.event,
      kind: input.kind,
      title: input.title,
      // 多类收件人合成一行展示，与静态那批「姓名(角色)」的写法保持一致
      receiver: receivers.join('、'),
      when: nowStamp(),
      channel: input.channel ?? '站内信 + i讯飞',
      // 刚发出的内部通知只能是「未读」——写「已读」是替收件人做了没发生的事
      status: input.status ?? '未读',
      content: input.content,
    };
    records.value.push(rec);
    return rec;
  }

  /** 本单的运行时通知记录，**时间倒序**（最新的在最上，与通知列表的一贯读法一致） */
  function recordsOf(ticketNo: string): RuntimeNotifyRecord[] {
    return records.value
      .filter((r) => r.ticketNo === ticketNo)
      .slice()
      .sort((a, b) => b.when.localeCompare(a.when));
  }

  return { records, emit, recordsOf };
});
