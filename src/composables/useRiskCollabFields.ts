import { computed, reactive, watch } from 'vue';
import { message } from 'ant-design-vue';
import { useUserStore } from '@/stores/user';
import { useRiskPoolStore } from '@/stores/riskPool';
import { useRiskQueueStore } from '@/stores/riskQueue';
import { isPooledStatus } from '@/stores/riskShared';
import { RISK_ADVICE_ITEMS, type RiskAdviceItem } from '@/stores/riskCollab';
import { isRiskTicketEnded } from '@/composables/useRiskReportAssess';

/**
 * **协同处理**要填的那一段：处理意见（**不必填**）· 建议事项（多选）·「其他」的具体建议
 * （勾了「其他」时条件必填）。整段全空才拦（`submitTo` 第 ② 道），单个字段一律不强制。
 * 字段、校验、落库与提示文案只此一份。
 *
 * 🔴 **两处共用**：工单处理页页头「风险管控」弹窗的投诉支
 * （`operation/OpRiskControlModal.vue`）与风险工单池的协同处理弹窗
 * （`operation/OpRiskCollabModal.vue`，风险监控页挂载）。风险监控页「风险管控」弹窗
 * 下半的投诉支随后也接这一份，**任何第四处都不要再抄一遍字段定义**。
 *
 * 与 `useEscalateComplaintFields` 同形：状态 + 校验在本 composable、渲染在
 * `RiskCollabFields.vue`，宿主弹窗只管抬头、第一区块与主按钮。
 *
 * 【落库也在这里】`submitTo` 把提交前重查、`riskPool.coordinate`、成功 / 拦截提示
 * 一并收口 —— 两个入口做的是同一件事（基线 ※29 / 《【930】》§5C），
 * 只把字段抽出来、把落库留在各宿主里，两处的提示语与副作用迟早分叉。
 */

export interface RiskCollabFieldsState {
  opinion: string;
  advices: RiskAdviceItem[];
  /** 勾了「其他」时才有值；取消勾选即清空 */
  otherAdvice: string;
}

/**
 * 字段下方的红字提示；空串＝这一项没错。
 *
 * 🔴 **只剩「其他」那一格**（2026-09-30 拍板「风险处理措施非必填」）：
 * 处理意见已不必填，故它那一格再也不会出红字。
 */
export interface RiskCollabFieldErrors {
  otherAdvice: string;
}

function emptyFields(): RiskCollabFieldsState {
  return { opinion: '', advices: [], otherAdvice: '' };
}

function emptyErrors(): RiskCollabFieldErrors {
  return { otherAdvice: '' };
}

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 勾选项展开成一句话：勾了「其他」的展成「其他（…）」，一项都没勾时给出那句占位。
 * 成功提示与履历摘要读的是同一份文案。
 */
export function collabAdviceText(picked: RiskAdviceItem[], otherAdvice: string): string {
  if (!picked.length) return '未勾选建议事项';
  return picked
    .map((a) => (a === '其他' ? `其他（${otherAdvice.trim()}）` : a))
    .join('、');
}

export function useRiskCollabFields() {
  const user = useUserStore();
  const pool = useRiskPoolStore();
  const queue = useRiskQueueStore();

  const fields = reactive<RiskCollabFieldsState>(emptyFields());
  const errors = reactive<RiskCollabFieldErrors>(emptyErrors());

  const adviceOptions = RISK_ADVICE_ITEMS.map((v) => ({ label: v, value: v }));
  const needsOther = computed(() => fields.advices.includes('其他'));

  function clearErrors() {
    Object.assign(errors, emptyErrors());
  }

  function reset() {
    Object.assign(fields, emptyFields());
    clearErrors();
  }

  // 取消勾选「其他」即清掉那一格，避免留着一句再也不会提交的文字
  watch(needsOther, (v) => {
    if (!v) {
      fields.otherAdvice = '';
      errors.otherAdvice = '';
    }
  });

  // 补上值即收起该项的红字，不必再点一次提交才知道自己填对了
  watch(fields, () => {
    if (fields.otherAdvice.trim()) errors.otherAdvice = '';
  });

  /**
   * 这一段动过没有。**全空 ＝ 不处置**，是合法的一种（宿主据此决定这一次要不要走这一段）。
   * 与 `OpRiskControlModal.collabFilled` 同一口径，抽到这里来两处不再各判一遍。
   */
  const filled = computed(
    () => !!fields.opinion.trim() || fields.advices.length > 0 || !!fields.otherAdvice.trim(),
  );

  /**
   * 校验。
   *
   * 🔴 **处理意见已不必填**（2026-09-30 拍板「风险处理措施非必填」）：整段是可选的，
   * 只勾几条建议事项、不写正文也是一种合法的处置。**单个字段一律不强制**，
   * 只剩「其他」那一项的**条件必填** —— 那不是"这一段必须填"，
   * 而是"你既然勾了「其他」，就得说清其他是什么"，勾选本身就是自己选进来的。
   */
  function validate(): boolean {
    clearErrors();
    if (needsOther.value && !fields.otherAdvice.trim()) errors.otherAdvice = '请填写「其他」的具体建议';
    return !Object.values(errors).some(Boolean);
  }

  /** 勾选项按 `RISK_ADVICE_ITEMS` 的顺序归一，界面勾选顺序不进落库 */
  const pickedAdvices = computed(() => RISK_ADVICE_ITEMS.filter((a) => fields.advices.includes(a)));

  /**
   * 提交一次协同处理。返回 true ＝ 已落库（宿主可以关弹窗）。
   *
   * 四道拦截与各处入口同一套：① 原单已进终态（判据 `isRiskTicketEnded`，与三处评估弹窗同源）；
   * ② **整段全空**；③ 校验（只剩「其他」那一项条件必填）；
   * ④ 条目此刻还在不在风险工单池里 —— 弹窗开着期间条目可能被改判无风险撤出池。
   * 「首次协同转已结论」由 `riskPool.coordinate` 判，本函数不复述那条判据。
   *
   * 🔴 **第 ② 道是 2026-09-30「风险处理措施非必填」那次拍板的连带**：单个字段都不强制之后，
   * 这一段就可能被整段空着提交 —— 落进去是一条什么都没说的处置记录，
   * 而首次提交还会把池内条目转「已结论」，等于把一条单从队列里空手摘走。
   * 门放在这里而不是某个字段上：它约束的是"这一次有没有给出东西"，不是"哪一格必须填"。
   * 页头那一路本来就先判 `collabFilled` 再调本函数，不会走到这一句；
   * 风险工单池那个专用弹窗直接调本函数，靠的就是这一道。
   */
  function submitTo(ticketNo: string): boolean {
    if (isRiskTicketEnded(ticketNo)) {
      message.warning('本单已结束，无法协同处理');
      return false;
    }
    if (!filled.value) {
      message.warning('请填写处理意见或勾选建议事项');
      return false;
    }
    if (!validate()) return false;

    const entry = queue.entriesOf(ticketNo).find((e) => isPooledStatus(e.status)) ?? null;
    if (!entry) {
      // 按钮的出现条件就是"本单在风险工单池里"，走到这里只可能是条目在弹窗开着的时候
      // 被人从池里撤了（改判无风险）。说清是哪一条挡住的，别给一句笼统的失败
      message.warning('本单已不在风险工单池中，无法提交协同处理');
      return false;
    }

    const picked = pickedAdvices.value;
    const firstTime = !entry.coordination;
    const ok = pool.coordinate(entry.id, {
      opinion: fields.opinion.trim(),
      advices: [...picked],
      ...(needsOther.value ? { otherAdvice: fields.otherAdvice.trim() } : {}),
      by: user.name || '当前用户',
      byRole: user.role.name || '客诉专员',
      at: nowStamp(),
    });
    if (!ok) {
      message.warning('本单已不在风险工单池中，无法提交协同处理');
      return false;
    }

    /*
     * 这里**没有**通知那一步：本轮不往消息体系里加新事件（2026-09-10 口径变更），
     * 故建议事项只落在工单上、等当前处理人自己打开这张单时读到。
     */
    // 首次协同同时把池内条目结掉，这一步要在提示里说出来——否则客诉专员不知道
    // 自己刚刚把这条从待处理队列里摘走了，还会回池里再找一遍
    const tail = firstTime ? '，本单风险条目已转「已结论」' : '';
    message.success(
      picked.length
        ? `已提交协同处理，建议事项：${collabAdviceText(picked, fields.otherAdvice)}${tail}`
        : `已提交协同处理${tail}`,
    );
    return true;
  }

  return {
    fields,
    errors,
    adviceOptions,
    needsOther,
    filled,
    pickedAdvices,
    reset,
    clearErrors,
    validate,
    submitTo,
  };
}

/** 两处协同入口共用的实例类型（`RiskCollabFields.vue` 的唯一入参） */
export type RiskCollabFieldsCtl = ReturnType<typeof useRiskCollabFields>;
