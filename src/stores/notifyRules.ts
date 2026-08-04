import { defineStore } from 'pinia';
import { ref } from 'vue';
import { NOTIFY_RULES, type NotifyRule } from '@/mock/notifyRules';

/**
 * 【815】通知规则的运行态共享数据。
 *
 * 规则数据放 store 而不是放在页面里：运营在规则页改完，切到别的菜单再回来，
 * 编辑结果仍在——规则是应用级状态，不随路由销毁。
 *
 * 对客消息（建单受理通知 R02）的抑制条件也在这份数据里，
 * 就是该规则 `工单来源 / 业务分类 / 工单类型` 三条「不属于」条件，
 * 与对内规则同一套编辑方式，不再另设入口（2026-08-01 定，见 PRD 待讨论 23）。
 */

function cloneRule(r: NotifyRule): NotifyRule {
  return {
    ...r,
    conditions: r.conditions.map((c) => ({ ...c, value: [...c.value] })),
    recipients: r.recipients.map((x) => ({ ...x })),
    channels: [...r.channels],
    templates: { ...r.templates },
    contents: Object.fromEntries(Object.entries(r.contents).map(([k, v]) => [k, { ...v }])),
  };
}

export const useNotifyRuleStore = defineStore('notifyRules', () => {
  const rules = ref<NotifyRule[]>(NOTIFY_RULES.map(cloneRule));

  const ruleOf = (id: string) => rules.value.find((r) => r.id === id);

  return { rules, ruleOf };
});
