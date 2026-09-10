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
 *   · **规则命中本身**：《【720】》§4.4「本类只收**人**下的结论」。命中只做两件事 ——
 *     把单捞进实时监控、给出一个**词表预设等级**（`RiskHit.level`）供打标弹窗预置，
 *     除此之外什么都不产生，命中记录留在风险监控台账。
 *     🔴 **这一条原来写的是「命中规则自动打标」——系统里没有这回事**（930 v3.4 §9 规则 13）：
 *     打标状态机全仓只有 `riskQueue.recordTag` 一个入口，`by` / `byRole` 必填，
 *     全部调用方都是人点出来的保存动作，没有任何定时器 / 监听器 / 规则引擎回调，
 *     `tags.ticketGradeOf` 也根本不吃词表预设等级。故本 store 收到的每一条**本来就**都是
 *     人下的结论，这里不存在"要把机器打的那批挡在门外"的判据。
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
  /** 正文：**只说发生了什么（动词）**，取值本身交给 chip（见 `renderRow` / `renderChips`） */
  what: string;
  /**
   * ---- 以下四格 ＝《【720】》§5.1 要求 `risk` 类挂的**四样 chip**，由 `renderChips` 一处生成 ----
   *
   * 【为什么取值要单独存格、而不是让界面从 `what` 里抠】§5.1 里这四样都是**可交互 / 需着色**的
   * 结构化取值（单号要能点跳、等级要能着色），而正文是一整条字符串 —— 从里面用正则抠值，
   * 等于把"行文长什么样"变成界面的隐性依赖，改一次措辞就断一次。取值本来就是结构化事实，
   * 就该以结构化的样子存下来；正文只留动词。
   *
   * 🔴 **存的是显示值**（低危 / 中危 / 高危 / 无风险，720 v0.6 与 930 v3.3 都已定），
   * 不是 `RiskLevel` 存储值 —— chip 直接渲染，展示侧不再做第二次映射。
   */
  /** 第一样 · 结论：打标＝四选一显示值；评估＝升级 / 不升级。报备 / 协同 / 等级变更三件无 */
  conclusion?: string;
  /**
   * 第三样 · 风险等级「旧 → 新」的旧值，与 `gradeTo` 同生同灭。
   *
   * 🔴 **只有 ⑤ 等级变更一件有**（《【720】》v0.6 §5.1 已把风险等级 chip 的出现范围收成这一件）。
   * 【为什么打标改判不能也挂它】改判会**当场连落两条**：② 打标（结论 chip「高危」）+
   * ⑤ 等级变更（等级 chip「中危 → 高危」）。两条都挂等级 chip 的话，同一秒的两张卡上
   * 摆着同一枚「中危 → 高危」，而打标那张卡还会同时出现两个「高危」（结论一枚、等级一枚）——
   * 一次动作、一个取值，在一屏上说三遍。分工是：**打标卡说"判成了什么"，等级变更卡说"从什么变成了什么"**。
   */
  gradeFrom?: string;
  /** 第三样 · 风险等级「旧 → 新」的新值 */
  gradeTo?: string;
  /** 第二样 · 建议事项：协同处理一件有，**每项一枚 chip**；勾了「其他」的已展开成「其他（…）」 */
  advices?: string[];
  /**
   * 第四样 · 评估判「升级」时派生出的**新投诉单号**。
   * 只有 `kind: 'assess'` 且真的派生了新单时才有；其余四件与判「不升级」时为空。
   */
  derivedNo?: string;
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
    /**
     * 打标备注 / 处置备注（两个页面的字段名不同，是同一格）。
     *
     * 🔴 **它不是必填 —— 本注释原来写着「打标必填」，与三个产出点里的两个不符**。
     * 按 2026-09-11 核实的**校验实际行为**（以校验为准，不以注释为准）：
     *   · 风险监控页 · 单条打标（`RiskMonitorView.saveEntryTag`）：**不校验**，空着能提交，
     *     标签无 `req`、placeholder 写「（可选）」；
     *   · 风险监控页 · 批量打标（`RiskMonitorView.saveBulk`）：**不校验**，同上；
     *   · 工单处理页 · 风险打标（`OpRiskMonitorTab.confirmTag`）：**校验非空**，标签带 `req`。
     * 状态机入口 `riskQueue.recordTag` 自己也不校验它（`RiskTagInput.note` 只要求是字符串，
     * 空串照收）。故本类型上它是可选的，三分之二的入口空着就落库。
     * ⚠️ 三个入口口径不一（工单页严、监控页松）**是一处待拍板的产品差异，不是本注释能定的事**，
     * 改校验必须先有口径；这里只如实描述现状。
     *
     * ⚠️ **不进正文**（《【720】》§4.4 第 3 条）——产出点照旧交上来，
     * 是因为它是这次打标的事实之一；渲不渲染由 `renderRow` 一处说了算。
     */
    note?: string;
    /** 修正原因（二次修改必填；界面词统一「修正原因」）。⚠️ 同上，**不进正文** */
    amendReason?: string;
  }
  | {
    kind: 'assess';
    ticketNo: string; by: string; byRole: string; at: string;
    decision: AssessDecision;
    /** 升级说明 / 反馈意见。⚠️ **不进正文**（《【720】》§4.4 第 3 条），留在评估记录里 */
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

/**
 * 接自由文本时补一个句号。**现在只剩协同处理的评估意见一处在用**
 * —— 另外三段自由文本（处置备注 / 反馈意见 · 升级说明 / 修正原因）按《【720】》§4.4
 * 第 3 条已不进履历，见 `renderRow` 的说明。
 */
function sentence(t?: string): string {
  const s = (t ?? '').trim();
  if (!s) return '';
  return /[。！？.!?]$/.test(s) ? s : `${s}。`;
}

/** 建议事项的显示值：勾了「其他」的展开成「其他（具体建议）」。chip 与正文共用同一份 */
function adviceTexts(input: Extract<RiskHistoryInput, { kind: 'collab' }>): string[] {
  return input.advices.map((a) => (a === '其他' && input.otherAdvice ? `其他（${input.otherAdvice}）` : a));
}

/**
 * **五件的行文，全仓唯一一处**。口径逐条对齐《【930】》§6.3 的那张表
 * （《【720】》§4.4 ④ 已同步到 v0.6 的四选一打标表述，与本实现一致）。
 *
 * ⚠️ **模板里的〈谁〉不再写进正文**：PRD 那几条描述的是"一行履历"，而本系统的履历是
 * **卡片**——操作人与角色徽章已经在卡片头上了，正文再写一遍名字就成了「吴投诉 客诉专员
 * 吴投诉 标记风险等级…」。故正文从谓语起写，与既有的协同处理那一条保持一致。
 *
 * 🔴 **正文只说"发生了什么"，取值本身一律交给 chip**（《【720】》§5.1 的四样富媒体）。
 * 结论、风险等级旧→新、建议事项、派生单号**都不再写进这句话** —— 写了就会出现
 * 「…标记风险等级 · 高危」紧跟一枚写着「高危」的 chip，同一个值在一张卡上说两遍。
 * 与既有的「关联单」那一类同一条口径：正文摆动词，卡片/chip 摆取值。
 *
 * 🔴 **自由文本一律不搬**（《【720】》§4.4 第 3 条 / 验收 T7）：报备的**场景描述**、
 * 评估的**反馈意见 / 升级说明**、打标的**处置备注 / 修正原因**都留在各自的记录里
 * （风险监控页点开原处即可看全）。
 *
 * 【为什么】履历是**时间线**，它答的是"发生了什么、谁做的、什么时候"；一屏要能扫完
 * 十几条不同类别的事件。把三段随手写的多行自由文本全搬进来，第八类会变成一堵文字墙，
 * 混排时反而把"这单被判成什么"这条真正要看的结论淹掉。细节点进原处看，不丢。
 *
 * ⚠️ **唯一的例外是③协同处理的评估意见**：《【720】》§4.4 明写它"本身就是协同处理的结论，
 * 随卡片展示"，且它**没有第二个落点**——不写在这里就哪儿都看不到。故全文保留。
 */
function renderRow(input: RiskHistoryInput): string {
  switch (input.kind) {
    case 'report': {
      // 「〈报备人〉 发起风险报备 · 〈报备原因〉〈风险类型〉」
      // 报备原因不在 §5.1 的四样 chip 之列（它不是结论、也不着色），照旧留在正文
      const reason = input.category ? `${input.reason} · ${input.category}` : input.reason;
      return `发起风险报备 · ${reason}`;
    }
    case 'tag':
      /*
       * 结论（四选一）走**结论 chip**，正文不带。等级的「旧 → 新」也不在这张卡上 ——
       * 它由紧随其后的那条 ⑤「风险等级变更」承载（《【720】》v0.6 §5.1，见 `renderChips`）。
       * 只留一个「（修正）」——它是**这次动作的性质**（首次打标还是回头改判），
       * 不是任何一枚 chip 上的取值，去掉之后两种打标在正文上就一模一样了。
       * 界面词一律「修正」（PRD 的口径词「改判」不上界面，与两个打标弹窗的字段名一致）。
       */
      return input.prev && input.prev !== input.result ? '标记风险等级（修正）' : '标记风险等级';
    case 'assess':
      /*
       * 结论（升级 / 不升级）走**结论 chip**、新投诉单号走**可点跳的单号 chip**，正文都不带。
       * 「已派生新投诉单」留着 —— 它说的是"这一跳还多干了一件事"，而 chip 只摆那串号本身；
       * 少了这半句，判「升级」与判「升级且派生了新单」两种情形在正文上分不出来。
       */
      return input.escalatedToNo ? '完成风险评估，已派生新投诉单' : '完成风险评估';
    case 'collab': {
      /*
       * 建议事项走**每项一枚 chip**，正文不再逐项罗列；评估意见全文照旧留正文（§4.4 唯一例外）。
       * ⚠️ 一项都没勾时补一句「（未勾选建议事项）」：建议事项**不是必填**
       * （弹窗只强制「其他」的具体建议），没勾就一枚 chip 都不出 ——
       * 不说这一句的话，读的人分不清是"没勾"还是"chip 没渲染出来"。
       */
      const none = adviceTexts(input).length ? '' : '（未勾选建议事项）';
      return `提交协同处理${none}。评估意见：${sentence(input.opinion)}`;
    }
    case 'grade':
      // 「旧 → 新」走**风险等级 chip**，正文只留动作 + 这一次变更的**来源**
      //（核实结论回传 / 坐席在工单侧填写）—— 来源不是 §5.1 的四样之一，留在正文
      return `风险等级变更 · ${input.source}`;
  }
}

/**
 * **《【720】》§5.1 要求 `risk` 类挂的四样 chip，全仓唯一一处**。
 * 与 `renderRow` 同吃一份 `input`、同一个 `switch` —— "正文说什么、chip 摆什么"
 * 这条分工只在这两个函数之间成立，分到别处去就必然出现两边都说同一个值。
 *
 * 🔴 **返回显示值，不返回存储值**：`RiskLevel` 的 `'高'` 到了这里已经是 `'高危'`，
 * 展示侧拿到就渲染，不做第二次映射（映射散到展示侧，下一个页面就会渲成「高」）。
 */
function renderChips(input: RiskHistoryInput): Partial<Pick<
  RiskHistoryRecord, 'conclusion' | 'gradeFrom' | 'gradeTo' | 'advices' | 'derivedNo'
>> {
  switch (input.kind) {
    case 'report':
      // 报备一件四样都没有：它只说"有人报了、因为什么"，结论要等评估那一件
      return {};
    case 'tag':
      /*
       * 🔴 **只出结论 chip 一枚，首次打标与改判一样**（《【720】》v0.6 §5.1：
       * 风险等级 chip 的出现范围已收为「仅 ⑤ 等级变更」）。
       *
       * 【为什么改判这里也不给「旧 → 新」】改判走的是 `riskQueue.recordTag` 里那段
       * "两件都落"的正路：② 打标 + ⑤ 等级变更同一秒各落一条。这里再给一枚等级 chip，
       * 屏幕上就是同一秒的两张卡摆着同一枚「中危 → 高危」，且打标那张卡的
       * 结论 chip「高危」与等级 chip 的右端「高危」是同一个值出现两次。
       * `input.prev` 仍然要用 —— 它在 `renderRow` 里决定正文带不带「（修正）」，
       * 那是**动作性质**（首次还是回头改判），不是任何一枚 chip 上的取值。
       */
      return { conclusion: tagResultText(input.result) };
    case 'assess':
      // 单号只在**真派生了新单**那一路有：投诉单那一路的「升级」走工单管控、不派生（O20）
      return {
        conclusion: input.decision,
        ...(input.escalatedToNo ? { derivedNo: input.escalatedToNo } : {}),
      };
    case 'collab': {
      // 一项都没勾时**不给空数组**：展示侧只认"有没有这一格"，空数组会渲出一个空 chip 行
      const advices = adviceTexts(input);
      return advices.length ? { advices } : {};
    }
    case 'grade':
      // 等级变更这一件的全部信息就是这个「旧 → 新」，故两格必然同时有（空值渲「未定级」）
      return { gradeFrom: gradeText(input.from), gradeTo: gradeText(input.to) };
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
/**
 * v2：四样 chip 的取值改为随记录固化（`conclusion` / `gradeFrom` / `gradeTo` / `advices`），
 * 正文同步不再重复这些值。**必须跟着升版** —— v1 存的记录既没有那四格、正文里又还带着旧的
 * 「· 高危」「· 升级」，混着读出来就是"有的卡有 chip、有的卡把值写在正文里"两套呈现并存。
 *
 * v3：打标（②）不再挂风险等级 chip，只挂结论 chip（《【720】》v0.6 §5.1）。
 * **同样必须升版** —— v2 存下来的**改判**记录里那两格 `gradeFrom` / `gradeTo` 已经固化，
 * 不作废的话缓存里那批老卡照旧渲出「中危 → 高危」，而新落的改判不渲，
 * 同一个页面上两种打标卡并存，且看不出哪一种才是现在的口径。
 */
const LS_VERSION = 3;

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
      // 四样 chip 的取值随记录一起固化：投影出去的履历条目直接渲染，不再回头解析正文
      ...renderChips(input),
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
