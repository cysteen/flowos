import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { riskLevelText, type RiskLevel } from '@/config/risk';
import {
  NO_RISK,
  newestStampOf,
  readDailyRiskCache,
  todayPrefix,
  writeRiskCache,
  type AssessDecision,
  type RiskTagResult,
} from '@/stores/riskShared';

/**
 * **风险结论履历 · 唯一落库口**（《【720】工单处理履历》第八类 `risk` /
 * 《【930】风险报备 · 监控 · 管控》§6.3 / 基线 ※29）。
 *
 * 【它为什么必须是一个 store、而且必须只有这一个】第八类要收**五件**
 * （报备提交 / 打标 / 评估结论 / 协同处理 / 风险等级变更），这五件由**四个不同的动作**
 * 在**两个页面**上产出（风险监控页 与 工单处理页），而工单处理履历（`timeline`）是
 * **按工单现搭的内存态** —— 产出的人与读它的人常常是两次登录，履历里那一条必须
 * 从一份**持久化的记录**投影回来，否则换一次账号就没了。
 *
 * 🔴 **不要在每个产出点各写一份 `pushEntry`**。这一类此前正是这么做的：全仓
 * `category: 'risk'` 的 `pushEntry` 只有协同处理那一处，另外四件一件都没落
 * —— 文档说收五件、代码只收一件。散着写，下一次加一件仍然会漏。
 * 故五件全部收敛到本 store 的 `recordRiskHistory()`：
 *   · **产出点只交事实**（谁、什么角色、什么时刻、结论是什么、备注/理由）；
 *   · **行文在本文件统一生成**（`renderRow`），两个页面同一个动作说出来的话必然一致。
 * 工单页只做一件事：把本单的记录**投影**成第八类履历条目（幂等，按 `id` 认）。
 *
 * 【边界 · 明确不收的三件】
 *   · **条目被领取**：领取是队列内部事件、工单一格没动（《【930】》§6.3 与
 *     《【720】》v0.4「自取不写履历」各自独立写过）。承办人与领取时刻落在池内条目上。
 *   · **撤回报备**：《【720】》§6 采集表「风险结论 ①」原话「撤回报备不写履历」。
 *   · **命中规则自动打标**：《【720】》§4.4「本类只收**人**下的结论」，
 *     规则自动打标留在风险监控台账。
 *
 * 🔴 **本轮不发任何通知**（《【930】》§6.2，2026-09-10 业务拍板）：本 store 只落履历，
 * 一行 `notifyLog.emit` 都没有。履历是履历、通知是通知。
 */

/** 第八类收的五件。`kind` 决定图标与 How 徽章，见 `RISK_HISTORY_META` */
export type RiskHistoryKind = 'report' | 'tag' | 'assess' | 'collab' | 'grade';

/** 落库后的一条记录。`how` / `what` 由 `renderRow` 生成后固化，读的时候不再重算 */
export interface RiskHistoryRecord {
  id: string;
  ticketNo: string;
  kind: RiskHistoryKind;
  /** 谁 */
  by: string;
  /** 什么角色（原样存落款角色名，投影时再映射成履历的角色徽章） */
  byRole: string;
  /** 什么时刻 */
  at: string;
  /** How 徽章文案 */
  how: string;
  /** 正文：结论 + 备注 / 理由 */
  what: string;
}

/**
 * 产出点交上来的**事实**，按 `kind` 分五支。
 * 🔴 **产出点不拼字符串**：拼字符串就是把行文散回五个地方，与本 store 的存在理由相反。
 */
export type RiskHistoryInput =
  | {
    kind: 'report';
    ticketNo: string; by: string; byRole: string; at: string;
    /** 报备原因（四选一） */
    reason: string;
    /** 风险类型：**只在原因＝「风险场景」时有**，其余原因整段省略（《【720】》§4.4 退化规则①） */
    category?: string | null;
  }
  | {
    kind: 'tag';
    ticketNo: string; by: string; byRole: string; at: string;
    result: RiskTagResult;
    /** 改判时的旧值；首次打标没有这一项 */
    prev?: RiskTagResult | null;
    /** 处置备注（打标必填） */
    note?: string;
    /** 修正原因（二次修改必填；PRD 口径词叫「改判理由」，界面词统一「修正原因」） */
    amendReason?: string;
  }
  | {
    kind: 'assess';
    ticketNo: string; by: string; byRole: string; at: string;
    decision: AssessDecision;
    /** 升级说明 / 反馈意见 */
    advice?: string;
    /** 只在判「升级」且**派生了新单**时有（投诉单那一路走工单管控、不派生，见 O20） */
    escalatedToNo?: string;
  }
  | {
    kind: 'collab';
    ticketNo: string; by: string; byRole: string; at: string;
    advices: string[];
    /** 勾了「其他」时的具体建议 */
    otherAdvice?: string;
    /** 评估意见。《【930】》§6.3 明写「正文摘要挂评估意见全文」 */
    opinion: string;
  }
  | {
    kind: 'grade';
    ticketNo: string; by: string; byRole: string; at: string;
    from: RiskLevel | null;
    to: RiskLevel | null;
    /** 来源：核实结论回传 / 坐席在工单侧填写（《【720】》§4.4 ⑤ 的两个上游） */
    source: string;
  };

/**
 * How 徽章文案。**五件共用 `risk` 色条、徽章各不相同**（《【720】》§5.1）——
 * 质检点开「风险结论」这一格之后，还要分得出哪一条是报备、哪一条是打标。
 */
export const RISK_HISTORY_META: Record<RiskHistoryKind, { how: string }> = {
  report: { how: '风险报备' },
  tag: { how: '风险打标' },
  assess: { how: '风险评估' },
  collab: { how: '协同处理' },
  grade: { how: '风险等级变更' },
};

/** 打标四档的界面词：低 / 中 / 高 说「低危 / 中危 / 高危」，无风险原样 */
function tagResultText(r: RiskTagResult): string {
  return r === NO_RISK ? NO_RISK : riskLevelText(r as RiskLevel);
}

/** 等级的界面词，空值说「未定级」——留白会被读成"忘了填" */
function gradeText(g: RiskLevel | null): string {
  return g ? riskLevelText(g) : '未定级';
}

/** 接自由文本时补一个句号，免得正文里出现「处置备注：已上报法务 修正原因：…」这种粘连句 */
function sentence(t?: string): string {
  const s = (t ?? '').trim();
  if (!s) return '';
  return /[。！？.!?]$/.test(s) ? s : `${s}。`;
}

/**
 * **五件的行文，全仓唯一一处**。口径逐条对齐《【930】》§6.3 的那张表
 * （它是 2026-09-11 v3.1 的现行口径；《【720】》§4.4 ④ 仍写着 915 旧模型的
 * 「核实风险命中 · 成立 / 误报」，那一套已被四选一的打标取代，见本轮汇报）。
 *
 * ⚠️ **模板里的〈谁〉不再写进正文**：PRD 那几条描述的是"一行履历"，而本系统的履历是
 * **卡片**——操作人与角色徽章已经在卡片头上了，正文再写一遍名字就成了「吴投诉 客诉专员
 * 吴投诉 标记风险等级…」。故正文从谓语起写，与既有的协同处理那一条保持一致。
 */
function renderRow(input: RiskHistoryInput): string {
  switch (input.kind) {
    case 'report': {
      // 「〈报备人〉 发起风险报备 · 〈报备原因〉〈风险类型〉」
      const reason = input.category ? `${input.reason} · ${input.category}` : input.reason;
      return `发起风险报备 · ${reason}`;
    }
    case 'tag': {
      // 「〈打标人〉 标记风险等级 · 〈低 / 中 / 高 / 无风险〉」；改判时带「〈旧值〉 → 〈新值〉」
      // 界面词一律「修正」（PRD 的口径词「改判」不上界面，与两个打标弹窗的字段名一致）
      const amend = input.prev && input.prev !== input.result
        ? `（修正：${tagResultText(input.prev)} → ${tagResultText(input.result)}）`
        : '';
      const head = `标记风险等级 · ${tagResultText(input.result)}${amend}`;
      const tail = [
        input.note ? `处置备注：${sentence(input.note)}` : '',
        input.amendReason ? `修正原因：${sentence(input.amendReason)}` : '',
      ].filter(Boolean).join('');
      return tail ? `${head}。${tail}` : head;
    }
    case 'assess': {
      // 「〈评估人〉 完成风险评估 · 〈升级 / 不升级〉」；结论＝升级时另带新投诉单号
      const derived = input.escalatedToNo ? `，派生投诉单 ${input.escalatedToNo}` : '';
      const label = input.decision === '升级' ? '升级说明' : '反馈意见';
      const tail = input.advice ? `${label}：${sentence(input.advice)}` : '';
      const head = `完成风险评估 · ${input.decision}${derived}`;
      return tail ? `${head}。${tail}` : head;
    }
    case 'collab': {
      // 「〈客诉专员〉 提交协同处理 · 〈建议事项，逗号分隔〉」，正文摘要挂评估意见全文
      const advice = input.advices.length
        ? input.advices
          .map((a) => (a === '其他' && input.otherAdvice ? `其他（${input.otherAdvice}）` : a))
          .join('、')
        : '未勾选建议事项';
      return `提交协同处理 · ${advice}。评估意见：${sentence(input.opinion)}`;
    }
    case 'grade':
      // 「风险等级 〈旧值〉 → 〈新值〉 · 〈来源〉」
      return `风险等级 ${gradeText(input.from)} → ${gradeText(input.to)} · ${input.source}`;
  }
}

/**
 * 缓存键与格式版本。机制与另三份风险缓存**完全共用**
 * （`riskShared.readDailyRiskCache`：12 小时保质期 + `seedDay` 隔夜作废）。
 *
 * 🔴 **必须跟着一起隔夜作废**：A / B 两条线的条目隔夜整批重建（时刻重算），
 * 本 store 若留着昨天那批履历记录，它们会**按 `ticketNo` 原样挂回今天重建出来的单上** ——
 * 屏幕上一条一条都在、时刻却是昨天的，不报错、不缺格，只有去核那一条的人才发现不对。
 * 这与 `stores/riskCollab.ts` 是同一处坑，四边写法必须一致。
 */
const LS_KEY = 'flowos-risk-history';
const LS_VERSION = 1;

/**
 * 缓存"新不新"的判据：取记录时刻里最新的那一个。
 * 本 store 的 `at` 一律来自**真人当场落下的动作**（或由 `backfill` 从种子结论派生，
 * 而那批时刻本身就由 `todayStamp` 生成、必落在今天），故直接取 `at` 即可。
 */
function newestHistoryStamp(saved: { records: RiskHistoryRecord[] }): string {
  return newestStampOf((saved.records ?? []).map((r) => r.at));
}

export const useRiskHistoryStore = defineStore('riskHistory', () => {
  /**
   * 全中心的风险结论记录，**追加不覆盖、时间正序**。
   *
   * 🔴 **改判独立成一条，不覆盖首次那条**（《【915】》§9 规则 28a，《【720】》§6 采集 ④）：
   * 屏幕上写着"由中危改判为高危"，而"中危"那一条却从没出现过，是这一类最容易出的错。
   */
  const records = ref<RiskHistoryRecord[]>([]);

  const cached = readDailyRiskCache<{ records: RiskHistoryRecord[] }>(
    LS_KEY,
    LS_VERSION,
    newestHistoryStamp,
  );
  /** 这批记录属于哪一天。写回时原样带下去、不取写入那一刻（跨零点的演示会把判据写瞎） */
  const seedDay = cached?.seedDay ?? todayPrefix();
  if (cached && Array.isArray(cached.records)) records.value = cached.records;
  watch(
    records,
    () => writeRiskCache(LS_KEY, LS_VERSION, { records: records.value, seedDay }),
    { deep: true },
  );

  /** 本单的风险结论记录，**时间正序**（履历本身按正序存，展示侧再倒序） */
  function recordsOf(ticketNo: string): RiskHistoryRecord[] {
    return records.value
      .filter((r) => r.ticketNo === ticketNo)
      .slice()
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  /** 本单已落几条。工单页的投影监听它 —— 少一条就补一条，多投几次结果一样 */
  function countOf(ticketNo: string): number {
    return records.value.filter((r) => r.ticketNo === ticketNo).length;
  }

  /**
   * 🔴 **第八类的唯一落库口**。五件全部走它，产出点只交事实、不拼行文。
   *
   * `fixedId` 只给**种子回填**用（见 `backfill`）：它让同一条种子结论无论被回填多少次
   * 都只落一条。真人当场做的动作**不传**它 —— 那些是一次次独立发生的事实，
   * 同一个人对同一张单连打两次标就该有两条。
   */
  function recordRiskHistory(input: RiskHistoryInput, fixedId?: string): RiskHistoryRecord | null {
    if (fixedId && records.value.some((r) => r.id === fixedId)) return null;
    const rec: RiskHistoryRecord = {
      id: fixedId ?? `rh-${Date.now()}-${records.value.length + 1}`,
      ticketNo: input.ticketNo,
      kind: input.kind,
      by: input.by,
      byRole: input.byRole,
      at: input.at,
      how: RISK_HISTORY_META[input.kind].how,
      what: renderRow(input),
    };
    records.value.push(rec);
    return rec;
  }

  /**
   * **种子回填**：预置数据里那批已经打过标 / 已经出过结论的条目，从来没走过
   * `recordRiskHistory`（它们是数据源直接给的），故那些单的第八类会是空的 ——
   * 页头明明挂着「风险打标 高危」，履历里一条也没有。
   *
   * 由合并层 `stores/riskPool.ts` 在初始化时调一次，**id 固定**故重复调用是无操作。
   */
  function backfill(input: RiskHistoryInput, fixedId: string) {
    /*
     * 🔴 **第二道去重：同单 + 同件 + 同时刻，一律认作同一件事**。
     *
     * 固定 id 只挡得住"同一条种子被回填两次"，挡不住**回填与真人动作撞车**：
     * 协同处理提交后，条目上的 `coordination` 就变成了刚才那一次协同 ——
     * 下一次回填扫到它，会照着**同一件事**再落一条 `seed-collab-*`，
     * 于是履历里一次协同出现两条。评估那一路同理（`assess` 会写 `r.assessment`）。
     *
     * 真人动作与由它派生的那份条目字段**必然共用同一个 `at`**（都来自同一次提交），
     * 故这三元组是可靠的判据。代价：同一分钟内对同一张单做两次同类动作时，
     * 回填会少补一条 —— 而回填本来就只补种子，真人那两条早已各自落库，不会丢。
     */
    if (records.value.some(
      (r) => r.ticketNo === input.ticketNo && r.kind === input.kind && r.at === input.at,
    )) return null;
    return recordRiskHistory(input, fixedId);
  }

  return { records, recordsOf, countOf, recordRiskHistory, backfill };
});
