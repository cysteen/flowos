import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import {
  newestStampOf,
  readDailyRiskCache,
  todayPrefix,
  writeRiskCache,
} from '@/stores/riskShared';

/**
 * **协同处理记录**（基线 ※29 / 《【930】》§5C）—— 客诉专员对风险工单池里的**投诉单**
 * 给出的历次意见与建议。
 *
 * 【为什么必须是一个 store】提交的人是**客诉专员**，读它的是**当前处理人**
 * （工单页头部的建议标记、「风险报备」Tab 的协同记录块、以及处理履历里那一条）——
 * 两端天然是两次登录。它此前落在 `views/tickets/composables/opActions.ts` 的一个模块级 ref 上，
 * 那是"风险 store 那一路正在改、先不撞车"的临时安置；整块搬到这里之后，
 * 风险侧四个 store 的边界才是齐的：A 线条目 / B 线报备 / 两线合并 / 协同记录。
 *
 * 【边界】本 store **只管记录本身**。协同带来的另外两件事各归各处：
 *   · 池内条目转「已结论」→ 合并层 `stores/riskPool.ts` 的 `coordinate`（它才拿得到条目）；
 *   · 落工单处理履历 → 工单页（履历是按工单现搭的内存态，只有那一页拿得到）。
 *
 * 🔴 **本轮不发通知**（2026-09-10 业务口径变更）：《【930】》§6.2 的 `risk.coordinated`
 * 本轮不做——现有消息体系要先整体重新梳理，期间不往里加新事件。代价是这条意见**没有主动触达**，
 * 当前处理人得自己打开这张单才看得到。这是已知取舍，不是遗漏。
 */

/**
 * 建议事项四选（基线 ※29 / 《【930】》§5C.2）。**多选**，不是单选 ——
 * 「转交专员」与「每日跟进」经常同时成立（要交出去、交出去之前还得盯着）。
 */
export const RISK_ADVICE_ITEMS = ['转交专员', '每日跟进', '法务协同', '其他'] as const;
export type RiskAdviceItem = (typeof RISK_ADVICE_ITEMS)[number];

/** 一次协同处理留下的记录。工单上的「建议标记」就是这些记录里 `advices` 的并集 */
export interface RiskCollabRecord {
  id: string;
  ticketNo: string;
  /** 评估意见（必填多行） */
  opinion: string;
  advices: RiskAdviceItem[];
  /** 勾了「其他」时的具体建议（条件必填） */
  otherAdvice?: string;
  by: string;
  byRole: string;
  at: string;
}

/**
 * 缓存键与格式版本。
 *
 * 🔴 **键沿用搬家前那一个**，版本号则是**新加的一道**：搬家前那份 payload 是
 * `{ records, savedAt }`，压根没有 `v` 字段，故 `readRiskCache` 一读就判版本不符、
 * 直接丢弃回到空表。这正是要的结果 —— 旧格式与新格式的差别不止一个字段，
 * 让它按"版本对不上"整份作废，比逐字段兼容一份过渡态数据干净。
 *
 * 保质期沿用 `RISK_STALE_MS`（`readRiskCache` 内含）：协同记录挂在池内条目上，
 * 条目过了保质期回到种子而记录留着的话，工单上会挂着一批指向已不存在的条目的建议标记。
 *
 * v1 → v2：**隔夜即作废**，判据与 A / B 两条线**共用同一套**
 * （`riskShared.readDailyRiskCache`：`seedDay` + 最新一条落不落在今天），不另造一套。
 *
 * 🔴 **为什么协同记录也必须隔夜作废**：条目那两条线隔夜会整批重建，
 * 而本 store 若留着昨天的记录，它们会**按 `ticketNo` 原样挂回今天重建出来的条目上** ——
 * id 对得上、不报错、界面照常显示建议标记与协同次数，只有人去核那条记录的时刻
 * 才会发现它是昨天的。**这种静默的错比崩溃难查得多**：屏幕上没有任何一处提示不对劲。
 * 12 小时保质期拦不住它（昨晚 22 点协同、今早 9 点再开只过了 11 小时），故要这一道。
 */
const LS_KEY = 'flowos-risk-collab';
const LS_VERSION = 2;

/**
 * 缓存"新不新"的判据：取协同时刻里最新的那一个。
 *
 * 【与另两条线的差别】A / B 线要挑"保证落在今天的那一类字段"（`todayStamp` 生成的打标 /
 * 结论时刻），因为它们的进队时刻里有几条是**故意留在昨天**的超时样本。
 * 本 store **没有种子**、每条记录都是真人当场落下的，`at` 一律是写入那一刻，
 * 故直接取 `at` 即可，不必绕。空表返回空串 —— 判不过就丢，而丢一份空缓存是无操作。
 */
function newestCollabStamp(saved: { records: RiskCollabRecord[] }): string {
  return newestStampOf((saved.records ?? []).map((r) => r.at));
}

export const useRiskCollabStore = defineStore('riskCollab', () => {
  /**
   * 全中心的协同记录。**没有种子**：协同是"有人做过"才存在的痕迹，
   * 预置一条等于替某个客诉专员认领了一次他没做过的判断。
   */
  const records = ref<RiskCollabRecord[]>([]);

  const cached = readDailyRiskCache<{ records: RiskCollabRecord[] }>(
    LS_KEY,
    LS_VERSION,
    newestCollabStamp,
  );
  /**
   * 这批记录**属于哪一天**。字段名与另两条线保持一致（那边是种子生成于哪一天，
   * 这边没有种子、指的是本次会话这批记录落在哪一天），判据因此可以完全共用。
   * 🔴 **写回时原样带下去、不取写入那一刻**：一场跨零点的演示会在 00:03 触发一次写入，
   * 那时若按写入时刻记，昨天那批记录就被盖上今天的戳，隔夜判据从此瞎掉
   * —— 与 A / B 两条线同一处坑，三边写法必须一致。
   */
  const seedDay = cached?.seedDay ?? todayPrefix();
  if (cached && Array.isArray(cached.records)) records.value = cached.records;
  watch(
    records,
    () => writeRiskCache(LS_KEY, LS_VERSION, { records: records.value, seedDay }),
    { deep: true },
  );

  /** 本单的协同记录，**时间倒序**（最近一次在最上）。同一张投诉单可多次协同，条数不限 */
  function recordsOf(ticketNo: string): RiskCollabRecord[] {
    return records.value
      .filter((r) => r.ticketNo === ticketNo)
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  /** 本单协同次数（协同弹窗「本单另有」那一段要报的数） */
  function countOf(ticketNo: string): number {
    return records.value.filter((r) => r.ticketNo === ticketNo).length;
  }

  /**
   * 工单上的「建议标记」（《【930】》§3.3）＝ 本单历次协同勾选项的**并集**，去重后按枚举顺序排。
   *
   * 【为什么是并集而不是"最后一次"】标记的语义是"接下来要做的事"，做完了没有回执动作
   * （PRD §6.5 G3），第二次协同只勾了「每日跟进」并不表示第一次的「法务协同」已经不必做了。
   * 取最后一次会让先前的建议在屏幕上凭空消失，而它并没有被谁撤销。
   */
  function marksOf(ticketNo: string): RiskAdviceItem[] {
    const hit = new Set<RiskAdviceItem>();
    for (const r of records.value) {
      if (r.ticketNo !== ticketNo) continue;
      r.advices.forEach((a) => hit.add(a));
    }
    return RISK_ADVICE_ITEMS.filter((a) => hit.has(a));
  }

  /**
   * 落一条协同记录。**只落记录**——转「已结论」与落履历由调用方接，见文件头的边界说明。
   *
   * 🔴 **工单状态与处理人一格不动**（基线 ※29）：本 store 不碰 `TicketDetailMeta`，
   * 这是它与所有类2动作的分界，也是"协同处理进了动作矩阵却不改状态"这句话的落点。
   */
  function record(input: Omit<RiskCollabRecord, 'id'>): RiskCollabRecord {
    const rec: RiskCollabRecord = { id: `rc-${Date.now()}-${records.value.length + 1}`, ...input };
    records.value.push(rec);
    return rec;
  }

  return { records, recordsOf, countOf, marksOf, record };
});
