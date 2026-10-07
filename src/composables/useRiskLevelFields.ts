import { computed, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { useUserStore } from '@/stores/user';
import { NO_RISK_LOCKED_TIP, canTagNoRisk, useRiskQueueStore } from '@/stores/riskQueue';
import { NO_RISK, type RiskTagResult } from '@/stores/riskShared';

/**
 * 「风险管控」弹窗的**风险等级段**：四选一（高 / 中 / 低 / 无风险）+ 风险备注。
 *
 * 🔴 **五处入口同一份**（2026-09-29 裁决「弹窗全站统一」）：工单处理页页头、风险监控页
 * 评估处置工作面、风险监控页条目表、命中明细 / 召回清单、工单工作台风险报备池。
 * 此前只有"标记"那一路的三个入口有这一段，**两个评估入口（评估处置工作面 / 风险报备池）
 * 只有评估决策** —— 同一个弹窗名在五处长出两种内容。本 composable 是补给那两处的那一份。
 *
 * 【落库只有一条路】`riskQueue.recordTagFor(ticketNo, …)` —— 与工单页页头那一段
 * 逐字同一个入口：写工单级风险等级、把条目送进风险工单池、计入左栏「全部有风险」三档
 * 与页头风险标注。**不新写第二条落库路径**（裁决书第 4 条）：报备线定的等级与监控线定的
 * 是同一件事，两条路迟早分叉。
 *
 * 【必填规则】裁决书第 1 条：**本来没有等级 → 必填**（典型：B 线报备条目、尚未标记的单）；
 * **已有等级 → 预置现值、可改**，改了即"改判"，此时不强制再选一次。
 *
 * 【这张单标记不了怎么办】`recordTagFor` 会被 store 挡下（本单不在两类自动识别范围内、
 * 或工单库里查不到）。那种情形**整段不出、也就不必填** —— 否则人会被一个填了也交不上去的
 * 必填项锁死在弹窗里。判据取 `riskQueue.tagBlockReasonOf`，与工单页那一段同一把。
 */
export function useRiskLevelFields() {
  const user = useUserStore();
  const queue = useRiskQueueStore();

  /** 本段挂在哪张单上。宿主每次打开弹窗调一次 `reset(ticketNo)` 置上 */
  const ticketNo = ref('');

  /** 四选一 + 风险备注。与 `useRiskCollabFields` 同形：一个 reactive 对象，宿主只读不重建 */
  const fields = reactive<{ level: RiskTagResult | ''; note: string }>({ level: '', note: '' });
  const tried = ref(false);

  /**
   * 本单的 A 线条目（一张单至多一条在池，《【930】》§3.1）。
   * 取法与工单页「风险标记」块、页头「风险管控」上半逐字同源：优先取带结论那条，没有就取第一条。
   */
  const tagEntry = computed(() => {
    if (!ticketNo.value) return null;
    const list = queue.entriesOf(ticketNo.value);
    return list.find((e) => !!e.tag) ?? list[0] ?? null;
  });
  const tagRecord = computed(() => tagEntry.value?.tag ?? null);

  /** 这张单推不推得出监控来源；推不出来就没得标记（原因由 store 给，与提交兜底那句同源） */
  const blockReason = computed(() => (ticketNo.value ? queue.tagBlockReasonOf(ticketNo.value) : ''));
  /** 整段出不出。推不出来源的单整段不出 —— 见文件头「这张单标记不了怎么办」 */
  const visible = computed(() => !!ticketNo.value && !blockReason.value);

  /** 已有等级 → 这一次是**改判** */
  const isAmend = computed(() => !!tagRecord.value);
  /** 本来没有等级才必填（裁决书第 1 条） */
  const required = computed(() => visible.value && !isAmend.value);

  /**
   * 等级或风险备注动过没有。与页头「风险管控」的 `tagDirty`、风险监控页的 `entryTagDirty`
   * 同一口径 —— 没动过还落一遍，标记记录里就多一条与上一条逐字相同的记录、条数还虚增。
   * 备注那一项判的是"填了东西且与上一条不同"：改判形态下它从空开始，照旧直接比较的话
   * 一打开就成了"动过"。
   */
  const dirty = computed(() => {
    const cur = tagRecord.value;
    if (!cur) return !!fields.level;
    const note = fields.note.trim();
    return fields.level !== cur.result || (!!note && note !== cur.note);
  });
  /** 这一次落不落：首次必落；改判只在真动过时落 */
  const willWrite = computed(
    () => visible.value && !!fields.level && (!isAmend.value || dirty.value),
  );

  const missLevel = computed(() => tried.value && required.value && !fields.level);
  /** 「为什么改」只在**真改判**时问得出口：首次标记那一路不要它 */
  const missNote = computed(
    () => tried.value && willWrite.value && isAmend.value && !fields.note.trim(),
  );
  /**
   * 已出结论的条目「无风险」一档置灰（《【930】》§5A.3 改判规则；store 侧 `recordTag` 同样拒绝）。
   * 判定走 `riskQueue.canTagNoRisk`，与另外三处标记弹窗同源；读条目上的现行状态。
   */
  const noRiskLocked = computed(() => !!tagEntry.value && !canTagNoRisk(tagEntry.value.status));

  /**
   * 打开弹窗时调。把现行**等级**灌回来（改完才知道自己动了哪一项）；
   * 备注**不灌** —— 改判形态下它承载"为什么改"，预填会让那道必填名存实亡。
   */
  function reset(no: string) {
    ticketNo.value = no;
    fields.level = tagRecord.value?.result ?? '';
    fields.note = '';
    tried.value = false;
  }

  /**
   * 校验。返回 false ＝ 有拦截（提示已发），宿主**不要往下写任何东西**。
   * 整段不出时恒真：那张单本来就标记不了，这一段不该拦住评估结论。
   */
  function validate(): boolean {
    tried.value = true;
    if (!visible.value) return true;
    if (required.value && !fields.level) {
      message.warning('请选择风险等级');
      return false;
    }
    if (willWrite.value && isAmend.value && !fields.note.trim()) {
      message.warning('请填写风险备注');
      return false;
    }
    // 读条目上的现行状态：弹窗开着这段时间里别人可能已经给了结论
    if (willWrite.value && fields.level === NO_RISK && noRiskLocked.value) {
      message.warning(NO_RISK_LOCKED_TIP);
      return false;
    }
    return true;
  }

  /**
   * 落库。返回 false ＝ 被 store 挡下（提示已发），宿主**中止本次提交**：
   * 等级都没写进去，再往下落评估结论会得到一条"有结论、没等级"的条目。
   * 没动过（`willWrite` 为假）时什么都不做、返回真。
   */
  function submit(): boolean {
    if (!willWrite.value) return true;
    const res = queue.recordTagFor(ticketNo.value, {
      result: fields.level as RiskTagResult,
      note: fields.note.trim(),
      by: user.name || '当前用户',
      byRole: user.role.name || '客诉专员',
      at: nowStamp(),
    });
    if (!res.ok) {
      // 原因由 store 给：挡住它的可能是"不在两类自动识别范围内"，也可能是"这张单查不到"
      message.warning(res.reason ?? '本单无法标记风险等级');
      return false;
    }
    return true;
  }

  return {
    fields,
    visible,
    isAmend,
    required,
    willWrite,
    missLevel,
    missNote,
    noRiskLocked,
    reset,
    validate,
    submit,
  };
}

/** 各处入口共用的实例类型（本 composable 的实例；满足 `RiskLevelFieldsView`） */
export type RiskLevelFieldsCtl = ReturnType<typeof useRiskLevelFields>;

/** 只读布尔视图：`Ref<boolean>` 与 `ComputedRef<boolean>` 都满足它，适配器可直接透传宿主的 computed */
type BoolView = { readonly value: boolean };
/** 只读档位视图（同上，给可选的 `levels` 用） */
type LevelsView = { readonly value: readonly RiskTagResult[] };

/**
 * `RiskLevelFields.vue` 的**唯一入参形状** —— 它渲染这一段所需要的全部，一个不多。
 *
 * 🔴 **为什么要这个接口**：六处「风险管控」弹窗的风险等级段必须是**同一个组件、同一种呈现**
 * （2026-09-29 裁决）。但只有三处（评估处置工作面 / 风险报备池 / 页头非投诉支）用得上
 * `useRiskLevelFields` 的那条落库路径；另外三处（条目打标、命中那一路、页头投诉支）是对
 * **具体条目**做的事，各有既有状态与落库路径，改成本 composable 就等于改落库。
 * 故组件只认这个接口：真实例满足它，宿主把既有状态包成适配器（`makeRiskLevelFieldsView`）
 * 也满足它 —— 呈现收一份，落库一格不动。
 */
export interface RiskLevelFieldsView {
  fields: { level: RiskTagResult | ''; note: string };
  /** 整段出不出 */
  visible: BoolView;
  /** 这一次是改判（决定「风险备注」的必填与问法） */
  isAmend: BoolView;
  /** 「风险等级」标签带不带必填星 */
  required: BoolView;
  /** 等级缺项红字（宿主靠主按钮 disabled 拦的那一路恒给假） */
  missLevel: BoolView;
  /** 备注缺项红字 */
  missNote: BoolView;
  /** 「无风险」一档置灰 */
  noRiskLocked: BoolView;
  /**
   * **可选**：这一段渲染哪几档。**不给就是全部四档**（`RISK_TAG_RESULTS`）。
   * 🔴 现在**所有接进来的入口都不给** —— 留着这道口子是因为取值域比四档窄的形态确实存在
   * （风险监控页命中那一路的弹窗是三档，`tagLevel` 的类型就是 `RiskLevel`），
   * 但那一处本轮没有接进共享件（它的备注是另一格、判「误报」时等级段整段不出）。
   */
  levels?: LevelsView;
  /**
   * **可选 · 只读回显**。为真时这一段**只摆不收**：四档照常渲染、现行那一档照常高亮，
   * 但点不动；风险备注渲染成一行只读文本（空则「—」）；必填星、缺项红字、
   * 「无风险置灰」那句脚注一律不出 —— 只读态下没有"缺项"也没有"选不了"这回事。
   *
   * 🔴 **只读不是另一种呈现**（2026-10-08 用户拍板「等级段接进来，只读回显」）：
   * 档位、顺序、版式、标签一律与可编辑态逐像素相同，差别只在能不能点。
   * 做成"一行文字摘要"就又长出第七种呈现了，那正是本共享件要收掉的东西。
   *
   * 🔴 **它不替代 `visible`**：整段出不出仍由 `visible` 管（如这张单还没有标记结论，
   * 只读态下也没什么可回显，应当整段不出）。
   *
   * 不给就是可编辑（既有五处一个都不传，行为一格不变）。
   */
  readonly?: BoolView;
}

/** `makeRiskLevelFieldsView` 的入参：宿主既有状态的读写口 + 一组只读判据 */
export interface RiskLevelFieldsViewSource {
  getLevel: () => RiskTagResult | '';
  /**
   * 写等级。🔴 宿主若在"选中"这一步还做别的事（如条目打标那一处的 `pickEntryTagResult`
   * 会先挡置灰档并发提示），**setter 必须走它**，不要直接写 ref —— 否则那一道就被绕过了。
   */
  setLevel: (v: RiskTagResult) => void;
  getNote: () => string;
  setNote: (v: string) => void;
  visible: BoolView;
  isAmend: BoolView;
  required: BoolView;
  missLevel: BoolView;
  missNote: BoolView;
  noRiskLocked: BoolView;
  /** 可选，见 `RiskLevelFieldsView.levels` */
  levels?: LevelsView;
  /**
   * 可选，见 `RiskLevelFieldsView.readonly`。只读态下 `setLevel` / `setNote` 不会被调到，
   * 宿主仍须照给（接口不为只读态分叉），给个空函数即可。
   */
  readonly?: BoolView;
}

/**
 * **薄适配器**：把宿主既有的一组 ref/computed 包成 `RiskLevelFieldsView`，交给同一个
 * `RiskLevelFields.vue` 渲染。
 *
 * 🔴 **它不碰落库**：校验与写库仍由宿主自己那套跑（`saveEntryTag` / `onComplaintOk` …）。
 * 本函数只负责"让那一段长成共用的样子"，state 与落库路径一格不动。
 *
 * `fields` 是一个**带访问器的普通对象**而不是 `reactive`：读走宿主的 ref（渲染副作用照常
 * 收集依赖），写走宿主给的 setter（宿主那一步原有的动作全保留）。
 */
export function makeRiskLevelFieldsView(src: RiskLevelFieldsViewSource): RiskLevelFieldsView {
  return {
    fields: {
      get level() { return src.getLevel(); },
      set level(v: RiskTagResult | '') { if (v) src.setLevel(v); },
      get note() { return src.getNote(); },
      set note(v: string) { src.setNote(v); },
    },
    visible: src.visible,
    isAmend: src.isAmend,
    required: src.required,
    missLevel: src.missLevel,
    missNote: src.missNote,
    noRiskLocked: src.noRiskLocked,
    levels: src.levels,
    readonly: src.readonly,
  };
}

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
