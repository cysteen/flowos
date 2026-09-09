import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { Ticket } from '@/views/tickets/types/ticket';
import { TICKETS } from '@/mock/tickets';

/**
 * 运行时派生出来的工单（《【930】》§5.6「接管」的第一跳派生）。
 *
 * 【为什么单开一个 store】`mock/tickets.ts` 是**静态常量数组**，模块加载时就定死。
 * 接管派生出的新投诉单号是运行时才生成的，往那个数组里 push 会污染样本数据；
 * 不 push 又会让 `loadDetail` 走静默回退——点开新单号看到的是**另一个客户的另一张单**，
 * 而 PRD 写的是「新单全量继承本单信息」。运行时那批单独存一份，解析时兜在静态那批之后。
 *
 * 【继承哪些】客户、产品、渠道、问题描述、SN、业务/产品分类照抄原单，这是"全量继承"的实义；
 * **不抄**的是类型（新单恒为「投诉」）、单号、创建时刻、承办人与 SLA——这些是新单自己的。
 */
const LS_KEY = 'flowos-derived-tickets';

export const useDerivedTicketStore = defineStore('derivedTickets', () => {
  const tickets = ref<Ticket[]>([]);

  /**
   * 保质期与 `stores/riskReports.ts` **必须一致**：每张派生单都是某条报备「接管」的产物。
   * 报备过期回到种子、派生单却留着的话，工单库里会多出一批没有来路的投诉单。
   */
  const STALE_MS = 12 * 60 * 60 * 1000;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { tickets: Ticket[]; savedAt?: number };
      const fresh = typeof saved?.savedAt === 'number' && Date.now() - saved.savedAt < STALE_MS;
      if (fresh && Array.isArray(saved?.tickets)) tickets.value = saved.tickets;
      else localStorage.removeItem(LS_KEY);
    }
  } catch {
    /* 坏缓存不至于让工单页打不开，从空开始即可 */
  }
  watch(
    tickets,
    () => {
      try {
        localStorage.setItem(
          LS_KEY,
          JSON.stringify({ tickets: tickets.value, savedAt: Date.now() }),
        );
      } catch {
        /* 配额超限等忽略 */
      }
    },
    { deep: true },
  );

  function nowStamp() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /** 解析口径：只答运行时这批。静态那批仍由 `TICKETS` 负责，两处不互相覆盖 */
  function find(no: string): Ticket | undefined {
    return tickets.value.find((t) => t.no === no);
  }

  /**
   * 由原单派生一张投诉单并登记。
   * 原单不在静态数据源里（如下钻明细里的示意号）时返回 null——
   * 没有可继承的内容，硬造一张空单比不造更误导。
   */
  function deriveComplaint(input: {
    fromNo: string;
    no: string;
    assignee: string;
    reason: string;
  }): Ticket | null {
    if (find(input.no)) return find(input.no)!;
    const origin = TICKETS.find((t) => t.no === input.fromNo);
    if (!origin) return null;
    const at = nowStamp();
    const derived: Ticket = {
      ...JSON.parse(JSON.stringify(origin)),
      id: `derived-${input.no}`,
      no: input.no,
      // 新单恒为投诉：接管走的就是升级投诉第一跳
      type: '投诉',
      complaintType: '投诉',
      // 升级链：新单指回原单，原单侧的 escalatedToNo 由报备记录承载
      escalatedFromNo: input.fromNo,
      escalatedToNo: undefined,
      assignee: input.assignee,
      tab: 'mine',
      nodeStatus: '处理中',
      nodeStep: 1,
      createdAt: at,
      updatedAt: at,
      responded: false,
      upgradedByMe: false,
      problemDesc: `${origin.problemDesc ?? origin.title}\n\n【风险报备接管】由 ${input.assignee} 自 ${input.fromNo} 升级承接。接管说明：${input.reason}`,
    };
    tickets.value.unshift(derived);
    return derived;
  }

  return { tickets, find, deriveComplaint };
});
