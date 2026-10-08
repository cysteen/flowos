import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { RiskLevel } from '@/config/risk';

/**
 * 工单侧「风险等级」的**更新记录** · 跨页共享（《【930】》回传路径）。
 *
 * 【记的是哪一件事】**只记回传造成的更新** —— 风险处理人（客诉专员 / 投诉督导）在
 * 「风险管控」弹窗里定级 / 改判之后，工单侧「风险等级」字段被按最新结论改写的那一下。
 * 🔴 **处理人在「风险标记」面板里自己改不进本记录**：那一路是处理人自述，
 * 它的留痕归《【720】》第八类 ⑤「坐席在工单侧填写」（`riskHistory`），
 * 两条上游混进一张列表之后就再也读不出"这一格是谁改的"。
 *
 * 【为什么要有它】新口径把三道门（空才可写 / 只覆盖自己写的那个值 / 不回退棘轮）全拆了，
 * 回传**覆盖处理人自填、可升可降、取空即清空**。降级不再被挡住，就必须留下
 * "从哪一档降到哪一档、谁降的、什么时候降的" —— 否则一张单的等级会悄悄变轻，
 * 处理人看到的只是一个变了的值，无从追问。
 *
 * 【局限】与别的风险 store 同样是**前端内存态**：原型没有后端，整页刷新即归零。
 * 工作区内切页签、跳工单不受影响（SPA 不重载）。
 */

/** 一条更新。空值有两种读法，故原样存空，不在落库时就渲染成文案 */
export interface RiskLevelUpdate {
  ticketNo: string;
  /** 更新前的工单侧取值。`''` ＝ 本来没有定级（界面写「未定级」） */
  from: RiskLevel | '';
  /** 更新后的工单侧取值。`''` ＝ 被清空（界面写「已清空」） */
  to: RiskLevel | '';
  /** 操作人 ＝ 下这个结论的风险处理人，不是当前在看工单页的人 */
  by: string;
  byRole: string;
  /** 带秒的全格式 `YYYY-MM-DD HH:mm:ss`（由调用方用 `utils/opTime.opTimeNow` 生成） */
  at: string;
}

export const useRiskLevelUpdateStore = defineStore('riskLevelUpdates', () => {
  /** key ＝ 工单号，值按发生次序正序（最新在末位），与「标记记录」同一个顺序口径 */
  const updates = ref<Record<string, RiskLevelUpdate[]>>({});

  function updatesOf(ticketNo: string): RiskLevelUpdate[] {
    return updates.value[ticketNo] ?? [];
  }

  function countOf(ticketNo: string): number {
    return updatesOf(ticketNo).length;
  }

  /**
   * 追加一条。**累积不覆盖** —— 每次更新各占一条，两条并排才读得出那条升降。
   *
   * 两道门：
   *   ① **值没变不落**（等值是空转）；
   *   ② **与本单上一条逐字相同的不落** —— 这是一道**重放门**，不是业务门。
   *      工单页的表单在切单时会按工单库重建，于是"回传把 高 改成 中"这一下会在每次
   *      重新进入这张单时被原样跑一遍。真实的连续两次更新不可能同进同出
   *      （第一次之后旧值就变成了上一次的新值），故"from 与 to 都与上一条相同"
   *      只会是同一次更新被跑了第二遍。
   */
  function record(input: RiskLevelUpdate): RiskLevelUpdate | null {
    if (input.from === input.to) return null;
    const list = updates.value[input.ticketNo] ?? [];
    const last = list[list.length - 1];
    if (last && last.from === input.from && last.to === input.to) return null;
    updates.value = { ...updates.value, [input.ticketNo]: [...list, { ...input }] };
    return input;
  }

  return { updates, updatesOf, countOf, record };
});
