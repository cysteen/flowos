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
   * **原单侧的升级台账**：原单号 → 它派生出的新投诉单号。
   *
   * 【为什么原单也要记一笔】派生此前只往前记了一半 —— 新单挂着 `escalatedFromNo` 指回原单，
   * 原单却什么都没有。于是原单打开来仍是「处理中」、可编辑、没有接管横幅，
   * 而同一页「评估结果」区块白纸黑字写着「原单落『已升级投诉』」，一页之内自相矛盾。
   *
   * 【为什么不直接改 `mock/tickets.ts` 里那个对象】`TICKETS` 是**静态常量数组**，
   * 改它等于把样本数据改脏，且刷新即回滚 —— 派生单在 localStorage 里活着、
   * 原单的状态却回到处理中，同一条升级链两头对不上。台账与派生单同一份缓存、
   * 同一个保质期，两者要么一起在、要么一起没有。
   *
   * 【读口】`views/tickets/composables/useTicketOperation.ts` 的 `loadDetail`：
   * 解析出的工单带上这个 `escalatedToNo` 之后，落「已升级投诉」+ 接管横幅 + 整页只读
   * 全部由 830 的既有链路自己走完，本文件不碰任何状态字段。
   */
  const escalations = ref<Record<string, string>>({});

  /**
   * 保质期与 `stores/riskReports.ts` **必须一致**：每张派生单都是某条报备「升级」的产物。
   * 报备过期回到种子、派生单却留着的话，工单库里会多出一批没有来路的投诉单。
   */
  const STALE_MS = 12 * 60 * 60 * 1000;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as {
        tickets: Ticket[];
        escalations?: Record<string, string>;
        savedAt?: number;
      };
      const fresh = typeof saved?.savedAt === 'number' && Date.now() - saved.savedAt < STALE_MS;
      if (fresh && Array.isArray(saved?.tickets)) {
        tickets.value = saved.tickets;
        // 旧版缓存里没有这一格：升级台账缺了就是缺了，不给兜底值 ——
        // 硬猜一个会让没升级过的原单也挂上接管横幅
        if (saved.escalations && typeof saved.escalations === 'object') {
          escalations.value = { ...saved.escalations };
        }
      } else localStorage.removeItem(LS_KEY);
    }
  } catch {
    /* 坏缓存不至于让工单页打不开，从空开始即可 */
  }
  watch(
    [tickets, escalations],
    () => {
      try {
        localStorage.setItem(
          LS_KEY,
          JSON.stringify({
            tickets: tickets.value,
            escalations: escalations.value,
            savedAt: Date.now(),
          }),
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

  /** 这张原单在本次会话里升级派生出的新投诉单号；没升级过时 undefined */
  function escalatedToNoOf(fromNo: string): string | undefined {
    return escalations.value[fromNo];
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
    // 造出新单的同时把原单那一头记上：两件事必须同进同退，
    // 只记一头就是"新单指得回去、原单指不过来"的半条链（见 escalations 的说明）
    escalations.value = { ...escalations.value, [input.fromNo]: input.no };
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
      // 基线 ※29：「接管」这个词在**评估结论**这条语义上整体作废，结论只叫「升级 / 不升级」。
      // 这两处原写「【风险报备接管】…接管说明：」，与弹窗里的「升级说明」是同一段文字的两个名字。
      // （指"原单被新单接管"的既有表述 —— 接管横幅 —— 不在作废之列，那是另一件事。）
      problemDesc: `${origin.problemDesc ?? origin.title}\n\n【风险升级】由 ${input.assignee} 自 ${input.fromNo} 升级承接。升级说明：${input.reason}`,
    };
    tickets.value.unshift(derived);
    return derived;
  }

  return { tickets, escalations, find, escalatedToNoOf, deriveComplaint };
});
