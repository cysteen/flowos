<script setup lang="ts">
/**
 * 【815】通知管理（业务管理 · 通知管理）
 *
 * 模型：事件目录（代码维护）+ 通知规则（纯配置）。
 * 业务新增消息场景：事件已存在 → 新建规则、零代码；事件不存在 → 只补一行埋点。
 *
 * 竞品依据：ServiceNow 事件注册表+通知记录 / Salesforce 收件人类型枚举 /
 *          Zoho Desk 预置不可删 / Jira 单一发送出口 / Zendesk 规则无顺序依赖。
 */
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { useRouter } from 'vue-router';
import {
  PlusOutlined, DeleteOutlined,
  UserOutlined, ApartmentOutlined, PushpinOutlined,
  CheckCircleFilled, CloseCircleFilled, ArrowRightOutlined, QuestionCircleOutlined,
  DownOutlined, UpOutlined, SearchOutlined, ReloadOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { stdPagination } from '@/config/adminUi';
import { storeToRefs } from 'pinia';
import { useNotifyRuleStore } from '@/stores/notifyRules';
import { useUserStore } from '@/stores/user';
import { sendTestMessage } from '@/api/notifyTestSend';
import {
  NOTIFY_EVENTS, RULE_TEMPLATES, TEST_PRESETS,
  SUPERIOR_CHAIN, EVENT_SOURCE_META, COND_OP_LABEL,
  eventOf, recipientTypeOf, availableRecipients, recipientLabel, condLabel, templateVars, varsIn,
  RECIPIENT_KIND_LABEL, BASE_FIELD_KEYS,
  FIXED_ASSIGN_OPTIONS, filterFixedAssignOption,
  isTemplateChannel, opsForType, optionsForField,
  type NotifyRule, type NotifyChannel, type RuleCondition, type RuleRecipient,
  type CondOp,
} from '@/mock/notifyRules';

const router = useRouter();
const CHANNELS: NotifyChannel[] = ['IM', '短信', '邮件', '站内信'];

// 规则数据放 store：切走再回来，编辑结果仍在。对内与对客规则同一套编辑方式，不分入口
const { rules } = storeToRefs(useNotifyRuleStore());

const tab = ref<'rules' | 'events'>('rules');

/* ---------------- 规则列表 ---------------- */
const fKeyword = ref('');
const fEvent = ref<string | undefined>(undefined);
const fAudience = ref<'all' | 'internal' | 'external'>('all');
const fChannel = ref<'all' | NotifyChannel>('all');

const eventFilterOptions = computed(() => [
  ...NOTIFY_EVENTS.filter((e) => rules.value.some((r) => r.event === e.code))
    .map((e) => ({ value: e.code, label: `${e.name}（${e.code}）` })),
]);
const audienceFilterOptions = [
  { value: 'all', label: '全部' },
  { value: 'internal', label: '对内' },
  { value: 'external', label: '对客' },
];
const channelFilterOptions = [
  { value: 'all' as const, label: '全部' },
  ...CHANNELS.map((c) => ({ value: c, label: c })),
];

const rows = computed(() => {
  const kw = fKeyword.value.trim().toLowerCase();
  return rules.value
    .filter((r) => !fEvent.value || r.event === fEvent.value)
    .filter((r) => fAudience.value === 'all' || r.audience === fAudience.value)
    .filter((r) => fChannel.value === 'all' || r.channels.includes(fChannel.value as NotifyChannel))
    .filter((r) => {
      if (!kw) return true;
      const ev = eventOf(r.event);
      return r.name.toLowerCase().includes(kw)
        || r.event.toLowerCase().includes(kw)
        || (ev?.name ?? '').toLowerCase().includes(kw);
    });
});

const stat = computed(() => ({
  rule: rules.value.length,
  on: rules.value.filter((r) => r.enabled).length,
  event: NOTIFY_EVENTS.length,
  used: new Set(rules.value.map((r) => r.event)).size,
}));

function resetFilter() {
  fKeyword.value = '';
  fEvent.value = undefined;
  fAudience.value = 'all';
  fChannel.value = 'all';
}

/**
 * 分页受控。
 * 注意：不可写成 :pagination="stdPagination()" —— 模板里的函数调用每次渲染都会产出
 * 新对象，a-table 视为 pagination prop 变更并重置内部页码，表现为「点了第 2 页又跳回第 1 页」。
 * 这里把当前页与每页条数提到组件状态里受控，并在筛选变化时回到第 1 页。
 */
const rulePage = reactive({ current: 1, pageSize: 10 });
const rulePagination = computed(() =>
  stdPagination({
    current: rulePage.current,
    pageSize: rulePage.pageSize,
    // 切页与切每页条数都会走 onChange；不再单独接 onShowSizeChange，
    // 否则两个回调都改 current，最终值取决于执行顺序。
    onChange: (p: number, s: number) => { rulePage.current = p; rulePage.pageSize = s; },
  }),
);
watch([fKeyword, fEvent, fAudience, fChannel], () => { rulePage.current = 1; });

/* ---------------- 事件目录 ---------------- */
const ruleCountOf = (code: string) => rules.value.filter((r) => r.event === code).length;
/** 列表只展示事件专属属性数量；完整清单进详情抽屉 */
function ownFieldCount(payload: { key: string }[]) {
  return payload.filter((p) => !BASE_FIELD_KEYS.has(p.key)).length;
}

/* ---------------- 事件详情 ---------------- */
/**
 * 点事件行打开详情：这是运营写模板前的"变量说明书"。
 * 列表里的属性只能挂 tooltip，一次看一个；配模板时要的是逐个字段对照着看
 * ——什么含义、什么类型、有哪些取值、能不能当收件人、真实值长什么样。
 */
const evDetailOpen = ref(false);
const evDetail = ref<typeof NOTIFY_EVENTS[number] | null>(null);
/** 公共属性默认折叠，详情首屏只突出事件专属变量 */
const baseFieldsOpen = ref(false);
function openEventDetail(code: string) {
  evDetail.value = NOTIFY_EVENTS.find((e) => e.code === code) ?? null;
  baseFieldsOpen.value = false;
  evDetailOpen.value = true;
}

/** 公共属性与事件专属属性分开列——运营需要知道哪些是每个事件都有的 */
const detailBaseFields = computed(() =>
  (evDetail.value?.payload ?? []).filter((p) => BASE_FIELD_KEYS.has(p.key)),
);
const detailOwnFields = computed(() =>
  (evDetail.value?.payload ?? []).filter((p) => !BASE_FIELD_KEYS.has(p.key)),
);
/** 示例值取第一组预设数据，让抽象的字段名落到具体的值上 */
const sampleData = computed<Record<string, string>>(() => TEST_PRESETS[0].data);
/** 该事件下已配的规则，直接列出来——"这个事件有没有人在用"是最常问的 */
const detailRules = computed(() =>
  evDetail.value ? rules.value.filter((r) => r.event === evDetail.value!.code) : [],
);
/** 该事件可用的收件人类型：由属性字段决定，详情页顺带说明为什么某些类型选不了 */
const detailRecipients = computed(() =>
  evDetail.value ? availableRecipients(evDetail.value.code) : [],
);

function gotoRuleFromDetail(r: NotifyRule) {
  evDetailOpen.value = false;
  nextTick(() => openEdit(r));
}
/** 从详情直接为该事件建规则——看完变量说明顺手就配，省得回列表再选一次事件 */
function createRuleForEvent() {
  const code = evDetail.value?.code;
  evDetailOpen.value = false;
  nextTick(() => { openCreate(); if (code) { form.event = code; onEventChange(); } });
}

/* ---------------- 规则编辑 ---------------- */
const editOpen = ref(false);
const editingId = ref<string | null>(null);
/** 各通道正文/预览是否展开；默认收起，避免弹窗内容被裁切、首屏过长 */
const chExpanded = reactive<Record<string, boolean>>({});
function resetChannelExpand(channels: NotifyChannel[]) {
  Object.keys(chExpanded).forEach((k) => delete chExpanded[k]);
  channels.forEach((ch) => { chExpanded[ch] = false; });
}
function toggleChannel(ch: NotifyChannel) {
  chExpanded[ch] = !chExpanded[ch];
}
const form = reactive<{
  name: string; event: string; audience: 'internal' | 'external';
  conditions: RuleCondition[]; recipients: RuleRecipient[];
  /** 一条规则可走多个通道；通道与模板一对一 */
  channels: NotifyChannel[];
  /** 模板通道（IM / 短信）→ 模板编码 */
  templates: Record<string, string>;
  /** 编辑器通道（邮件 / 站内信）→ 规则内联正文；邮件另有主题 */
  contents: Record<string, { subject: string; body: string }>;
  enabled: boolean;
}>({
  name: '', event: '', audience: 'internal',
  conditions: [], recipients: [],
  channels: [], templates: {}, contents: {},
  enabled: true,
});

/**
 * 为模板通道挑一个变量对当前事件合法的模板。
 * 新增通道、换事件后都走这里——否则会默认选中一个必然报错的模板，
 * 一进来就是红框，看起来像 bug。挑不到合法的才回落到第一个并如实报错。
 */
function pickLegalTemplate(ch: NotifyChannel) {
  const list = RULE_TEMPLATES[ch] ?? [];
  if (!list.length) { delete form.templates[ch]; return; }
  const keys = new Set((eventOf(form.event)?.payload ?? []).map((p) => p.key));
  const legal = list.find((t) => templateVars(t).every((v) => keys.has(v)));
  form.templates[ch] = (legal ?? list[0]).code;
}

/** 初始化某通道的内容槽：模板通道选模板，编辑器通道备空正文 */
function initChannel(ch: NotifyChannel) {
  if (isTemplateChannel(ch)) pickLegalTemplate(ch);
  else if (!form.contents[ch]) form.contents[ch] = { subject: '', body: '' };
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    name: '', event: NOTIFY_EVENTS[0].code, audience: 'internal',
    conditions: [], recipients: [{ type: 'assignee' }],
    channels: ['IM' as NotifyChannel], templates: {}, contents: {},
    enabled: true,
  });
  initChannel('IM');
  resetChannelExpand(['IM']);
  editOpen.value = true;
}
function openEdit(r: NotifyRule) {
  editingId.value = r.id;
  Object.assign(form, {
    name: r.name, event: r.event, audience: r.audience,
    conditions: r.conditions.map((c) => ({ ...c, value: [...c.value] })),
    recipients: r.recipients.map((x) => ({ ...x })),
    channels: [...r.channels],
    templates: { ...r.templates },
    contents: Object.fromEntries(
      Object.entries(r.contents).map(([ch, c]) => [ch, { subject: c.subject ?? '', body: c.body }]),
    ),
    enabled: r.enabled,
  });
  r.channels.forEach((ch) => initChannel(ch));
  resetChannelExpand(r.channels);
  editOpen.value = true;
}

const curEvent = computed(() => eventOf(form.event));
/** 事件属性 = 模板可用变量 */
const eventVars = computed(() => curEvent.value?.payload ?? []);
/**
 * 收件人下拉按 PRD §3.4 的三种形态分组：字段引用 / 关系函数 / 固定指派。
 * 分组让运营看得出"处理人"是取事件属性、"上级"是沿组织树算出来的——
 * 两者的失效原因完全不同（前者字段为空、后者组织树断链），排障时要分得清。
 */
const recipientOptions = computed(() => {
  const avail = availableRecipients(form.event);
  return (['field', 'relation', 'fixed'] as const)
    .map((kind) => ({
      label: RECIPIENT_KIND_LABEL[kind],
      options: avail
        .filter((t) => t.kind === kind)
        .map((t) => ({ value: t.code, label: t.name, title: t.desc })),
    }))
    .filter((g) => g.options.length);
});

function onEventChange() {
  // 换事件后：清掉引用了新事件不存在字段的条件与收件人
  const keys = new Set(eventVars.value.map((p) => p.key));
  form.conditions = form.conditions.filter((c) => keys.has(c.field));
  const ok = new Set(availableRecipients(form.event).map((t) => t.code));
  form.recipients = form.recipients.filter((r) => ok.has(r.type));
  if (!form.recipients.length) form.recipients = [{ type: 'assignee' }];
  // 模板通道：模板若引用了新事件没有的变量，换一个合法的；换不到则保留并如实报错。
  // 编辑器通道的正文是人写的，不自动改，只标红提示。
  form.channels.filter(isTemplateChannel).forEach((ch) => {
    const cur = (RULE_TEMPLATES[ch] ?? []).find((t) => t.code === form.templates[ch]);
    if (cur && templateVars(cur).some((v) => !keys.has(v))) pickLegalTemplate(ch);
  });
}

/** 取条件所引用的字段定义 */
function fieldOf(key: string) {
  return eventVars.value.find((p) => p.key === key);
}
/** 该条件可用的运算符（布尔只有等于，数值/时间才有大于小于） */
function opOptions(key: string) {
  return opsForType(fieldOf(key)?.type).map((o) => ({ value: o, label: COND_OP_LABEL[o] }));
}
/** 该条件的取值是否有固定取值域（枚举 / 布尔）→ 给下拉，杜绝手打错别字 */
function valueOptions(key: string) {
  return optionsForField(fieldOf(key))?.map((v) => ({ value: v, label: v })) ?? null;
}
/** 取值是否只允许单值（等于/不等于/大于/小于为单值；属于/不属于为多值） */
const isSingleValue = (op: CondOp) => op !== 'in' && op !== 'nin';
/** 字段类型的中文名，展示在条件行尾便于理解 */
const TYPE_LABEL: Record<string, string> = {
  string: '文本', number: '数值', datetime: '时间', boolean: '是否',
  enum: '枚举', userId: '人员', 'userId[]': '人员多值', phone: '手机号',
};

/** 换字段后：运算符与取值都要按新类型重置，否则会残留非法组合 */
function onCondFieldChange(c: RuleCondition) {
  const ops = opsForType(fieldOf(c.field)?.type);
  if (!ops.includes(c.op)) c.op = ops[0];
  c.value = [];
}
/** 换运算符后：单值 ↔ 多值切换时裁剪取值 */
function onCondOpChange(c: RuleCondition) {
  if (isSingleValue(c.op) && c.value.length > 1) c.value = c.value.slice(0, 1);
}

function addCond() {
  const first = eventVars.value[0];
  if (first) form.conditions.push({ field: first.key, op: 'eq', value: [] });
}
function delCond(i: number) { form.conditions.splice(i, 1); }

/** 收件人多选：选类型；需层级 / 固定指派的再单独配参数 */
function onRecipientTypesChange(value: unknown) {
  const codes = (value as string[]) ?? [];
  const prev = new Map(form.recipients.map((r) => [r.type, r]));
  form.recipients = codes.map((code) => {
    const old = prev.get(code);
    if (old) return old;
    const t = recipientTypeOf(code);
    return {
      type: code,
      level: t?.hasLevel ? 1 : undefined,
      fixedValue: t?.kind === 'fixed' ? '' : undefined,
    };
  });
}
const recipientsNeedingExtra = computed(() =>
  form.recipients.filter((r) => needLevel(r.type) || isFixed(r.type)),
);
const needLevel = (code: string) => !!recipientTypeOf(code)?.hasLevel;
const isFixed = (code: string) => recipientTypeOf(code)?.kind === 'fixed';

/**
 * 换通道后重选模板。
 * 优先挑一个变量对当前事件合法的模板——否则切完通道一进来就是红色报错，
 * 看起来像 bug，实际只是默认选中了不匹配的模板。
 */
/** 勾选/取消通道：新增的通道初始化内容槽，取消的清掉 */
function onChannelChange(next: NotifyChannel[]) {
  next.forEach((ch) => {
    const isNew = !(ch in chExpanded);
    initChannel(ch);
    if (isNew) chExpanded[ch] = false;
  });
  Object.keys(form.templates).forEach((ch) => {
    if (!next.includes(ch as NotifyChannel)) delete form.templates[ch];
  });
  Object.keys(form.contents).forEach((ch) => {
    if (!next.includes(ch as NotifyChannel)) delete form.contents[ch];
  });
  Object.keys(chExpanded).forEach((ch) => {
    if (!next.includes(ch as NotifyChannel)) delete chExpanded[ch];
  });
}
/** 按通道排序，保证内容块顺序稳定 */
const orderedChannels = computed(() => CHANNELS.filter((c) => form.channels.includes(c)));
function tplOptions(ch: NotifyChannel) {
  return (RULE_TEMPLATES[ch] ?? []).map((t) => ({ value: t.code, label: `${t.name}（${t.code}）` }));
}
/** 模板通道的正文（只读预览） */
function tplPreview(ch: NotifyChannel) {
  return (RULE_TEMPLATES[ch] ?? []).find((t) => t.code === form.templates[ch])?.content ?? '';
}
/** 该模板被多少条规则引用——说明为什么不能在规则里改 */
function tplRefCount(ch: NotifyChannel) {
  return rules.value.filter((r) => r.templates[ch] === form.templates[ch]).length;
}
/** 邮件才有独立主题行 */
const hasSubject = (ch: NotifyChannel) => ch === '邮件';
/** 某通道内容里用到、但当前事件属性没有的变量 */
function illegalVarsOf(ch: NotifyChannel): string[] {
  const keys = new Set(eventVars.value.map((p) => p.key));
  const used = isTemplateChannel(ch)
    ? varsIn(tplPreview(ch))
    : varsIn(hasSubject(ch) ? form.contents[ch]?.subject : '', form.contents[ch]?.body);
  return used.filter((v) => !keys.has(v));
}
/** 跳去消息中心改模板 */
function gotoMessageCenter() {
  router.push({ name: 'admin-message-center' })
    .catch(() => message.info('请从左侧「集成对接 · 消息中心」进入'));
}
const allIllegal = computed(() => [...new Set(form.channels.flatMap((ch) => illegalVarsOf(ch)))]);

/* ---- 变量插入：仅编辑器通道，插到该通道当前聚焦输入框的光标处 ---- */
const bodyRefs: Record<string, HTMLTextAreaElement | null> = {};
const subjectRefs: Record<string, HTMLInputElement | null> = {};
/** 每个通道最后聚焦的是主题还是正文 */
const lastFocus = reactive<Record<string, 'subject' | 'body'>>({});
const setBodyRef = (ch: string, el: unknown) => { bodyRefs[ch] = el as HTMLTextAreaElement | null; };
const setSubjectRef = (ch: string, el: unknown) => { subjectRefs[ch] = el as HTMLInputElement | null; };

function insertVar(ch: NotifyChannel, key: string) {
  const token = '${' + key + '}';
  const d = form.contents[ch];
  if (!d) return;
  const toSubject = hasSubject(ch) && lastFocus[ch] === 'subject';
  const el = toSubject ? subjectRefs[ch] : bodyRefs[ch];
  const cur = toSubject ? d.subject : d.body;
  if (!el) {
    if (toSubject) d.subject = cur + token; else d.body = cur + token;
    return;
  }
  const start = el.selectionStart ?? cur.length;
  const end = el.selectionEnd ?? cur.length;
  const next = cur.slice(0, start) + token + cur.slice(end);
  if (toSubject) d.subject = next; else d.body = next;
  nextTick(() => {
    el.focus();
    const pos = start + token.length;
    el.setSelectionRange(pos, pos);
  });
}

function saveRule() {
  if (!form.name.trim()) { message.warning('请填写规则名称'); return; }
  if (!form.recipients.length) { message.warning('请至少配置一个收件人'); return; }
  if (!form.channels.length) { message.warning('请至少选择一个通知通道'); return; }
  if (form.conditions.some((c) => !c.value.length)) { message.warning('触发条件的取值不能为空'); return; }
  for (const ch of form.channels) {
    if (isTemplateChannel(ch)) {
      if (!form.templates[ch]) { message.warning(`「${ch}」通道未选择消息模板`); return; }
    } else {
      const d = form.contents[ch];
      if (hasSubject(ch) && !d?.subject.trim()) { message.warning(`「${ch}」通道的主题不能为空`); return; }
      if (!d?.body.trim()) { message.warning(`「${ch}」通道的正文不能为空`); return; }
    }
  }
  if (allIllegal.value.length) {
    message.error(`内容使用了本事件不存在的变量：${allIllegal.value.join('、')}`);
    return;
  }
  const payload = {
    name: form.name.trim(), event: form.event, audience: form.audience,
    conditions: form.conditions.map((c) => ({ ...c, value: [...c.value] })),
    recipients: form.recipients.map((x) => ({ ...x })),
    channels: [...form.channels],
    templates: Object.fromEntries(
      form.channels.filter(isTemplateChannel).map((ch) => [ch, form.templates[ch]]),
    ),
    contents: Object.fromEntries(
      form.channels.filter((ch) => !isTemplateChannel(ch))
        .map((ch) => [ch, { subject: form.contents[ch].subject, body: form.contents[ch].body }]),
    ),
    enabled: form.enabled,
  };
  if (editingId.value) {
    Object.assign(rules.value.find((r) => r.id === editingId.value)!, payload);
    message.success('规则「' + payload.name + '」已保存');
  } else {
    rules.value.push({ id: 'R' + Date.now().toString().slice(-6), ...payload });
    message.success('规则已新增');
  }
  editOpen.value = false;
}

function delRule(r: NotifyRule) {
  Modal.confirm({
    title: '删除通知规则',
    icon: null,
    content: `确认删除「${r.name}」？删除后该事件将不再按此规则发送通知。`,
    okText: '确认删除', okType: 'danger', cancelText: '取消',
    onOk: () => {
      rules.value = rules.value.filter((x) => x.id !== r.id);
      message.success(`规则「${r.name}」已删除`);
    },
  });
}

/* ---------------- 规则测试（Preview + 收件人溯源） ---------------- */
const testOpen = ref(false);
const testRule = ref<NotifyRule | null>(null);
const testPreset = ref(TEST_PRESETS[0].id);
/** 底部：渲染预览 / 试发 */
const testPane = ref<'preview' | 'send'>('preview');
/** 预览与试发共用的当前通道 */
const testChannel = ref<NotifyChannel>('IM');

/**
 * 测试数据：构造出来的一组字段取值，逐字段可改。
 *
 * 不挂真实工单有两个原因（见 mock 里 TEST_PRESETS 的注释）：数据权限，
 * 以及"选真实单只能碰运气碰到想测的组合"。改成可编辑后，
 * 要验证什么组合就填什么，测试才真正闭环。
 */
const testData = reactive<Record<string, string>>({});
function applyPreset(id: string) {
  const p = TEST_PRESETS.find((x) => x.id === id);
  if (!p) return;
  Object.keys(testData).forEach((k) => delete testData[k]);
  Object.assign(testData, p.data);
}
watch(testPreset, (id) => applyPreset(id));

/**
 * 只列这条规则**实际用到**的字段：条件引用的 + 收件人依赖的 + 模板变量引用的。
 * 事件属性有十几个，全列出来运营得在无关字段里翻找自己要改的那一个。
 */
const testFields = computed(() => {
  const r = testRule.value;
  if (!r) return [];
  const ev = eventOf(r.event);
  if (!ev) return [];
  const need = new Set<string>();
  r.conditions.forEach((c) => need.add(c.field));
  r.recipients.forEach((x) => {
    const t = recipientTypeOf(x.type);
    if (t?.kind === 'field' && t.requires) need.add(t.requires);
    // 关系函数从处理人往上溯，所以依赖处理人
    if (t?.kind === 'relation') need.add('assigneeId');
  });
  r.channels.forEach((ch) => {
    const raw = isTemplateChannel(ch)
      ? (RULE_TEMPLATES[ch]?.find((x) => x.code === r.templates[ch])?.content ?? '')
      : `${r.contents[ch]?.subject ?? ''} ${r.contents[ch]?.body ?? ''}`;
    varsIn(raw).forEach((v) => need.add(v));
  });
  // 按事件属性的顺序排，与事件详情页一致
  return ev.payload.filter((p) => need.has(p.key));
});

/* ---------------- 试发 ---------------- */
/**
 * 试发：把渲染好的正文经**消息中心的同一条渠道链路**真实发出去。
 *
 * 为什么必须真发：渲染正确 ≠ 发得出去。真实未送达的高发原因是
 * IM 账号没映射、短信模板未报备、邮件进垃圾箱——这三样只渲染预览一个也测不到。
 *
 * 安全边界（写死在交互里，不给绕过的口子）：
 *   · 只发给**测试人自己填的地址**，绝不使用规则解析出的收件人
 *     ——那可能是真实客户手机号或真实坐席，试发把消息发给他们就是生产事故；
 *   · 因此界面上根本不提供「发给解析结果」这个选项，默认值填当前登录人自己的号码；
 *   · 试发不写入任何工单的通知记录（没有真实工单可写），只进独立的试发流水。
 */
const userStore = useUserStore();
/** 各通道的试发目标地址 */
const sendTo = reactive<Record<string, string>>({});
/** 各通道的试发状态：idle / sending / ok / fail */
const sendState = reactive<Record<string, { status: 'idle' | 'sending' | 'ok' | 'fail'; msg?: string }>>({});
/** 通道对应的地址类型，决定占位文案与校验 */
const ADDR_META: Record<NotifyChannel, { label: string; ph: string }> = {
  IM: { label: 'i讯飞账号', ph: '填写 i讯飞账号（工号 / 手机号）' },
  短信: { label: '手机号', ph: '填写接收短信的手机号' },
  邮件: { label: '邮箱', ph: '填写接收邮件的邮箱地址' },
  站内信: { label: '系统账号', ph: '填写接收站内信的系统账号' },
};
function defaultAddr(ch: NotifyChannel) {
  // 默认发给测试人自己——最安全的默认值
  const acc = userStore.account;
  if (ch === '短信' || ch === 'IM') return acc;
  if (ch === '邮件') return acc ? `${acc}@iflytek.com` : '';
  return acc;
}
function resetSend(r: NotifyRule) {
  Object.keys(sendTo).forEach((k) => delete sendTo[k]);
  Object.keys(sendState).forEach((k) => delete sendState[k]);
  r.channels.forEach((ch) => {
    sendTo[ch] = defaultAddr(ch);
    sendState[ch] = { status: 'idle' };
  });
}
/** 未渲染完全的正文不许发出去——带 ${xxx} 字面量的消息发给谁都是事故 */
function sendBlocked(ch: NotifyChannel) {
  return renderTpl(ch).some((s) => s.miss);
}
async function testSend(ch: NotifyChannel) {
  const addr = (sendTo[ch] ?? '').trim();
  if (!addr) { message.warning(`请先填写${ADDR_META[ch].label}`); return; }
  if (sendBlocked(ch)) { message.error('正文仍有未解析的变量，请先补齐测试数据再试发'); return; }
  sendState[ch] = { status: 'sending' };
  try {
    const res = await sendTestMessage({
      ruleId: testRule.value!.id,
      channel: ch,
      to: addr,
      subject: isTemplateChannel(ch) ? undefined : testRule.value!.contents[ch]?.subject,
      content: renderTpl(ch).map((s) => s.text).join(''),
      templateCode: isTemplateChannel(ch) ? testRule.value!.templates[ch] : undefined,
    });
    sendState[ch] = res.ok
      ? { status: 'ok', msg: `已提交渠道 · 消息号 ${res.messageId}` }
      : { status: 'fail', msg: res.error };
  } catch (e) {
    sendState[ch] = { status: 'fail', msg: (e as Error).message };
  }
}

function openTest(r: NotifyRule) {
  testRule.value = r;
  testPreset.value = TEST_PRESETS[0].id;
  applyPreset(TEST_PRESETS[0].id);
  resetSend(r);
  testPane.value = 'preview';
  testChannel.value = r.channels[0] ?? 'IM';
  testOpen.value = true;
}

function evalCond(c: RuleCondition) {
  const actual = testData[c.field];
  const num = Number(actual);
  const rhs = Number(c.value[0]);
  const numeric = !Number.isNaN(num) && !Number.isNaN(rhs);
  let pass = false;
  if (actual === undefined) pass = false;
  else if (c.op === 'eq') pass = actual === c.value[0];
  else if (c.op === 'ne') pass = actual !== c.value[0];
  else if (c.op === 'in') pass = c.value.includes(actual);
  else if (c.op === 'nin') pass = !c.value.includes(actual);
  else if (c.op === 'gt') pass = numeric ? num > rhs : String(actual) > c.value[0];
  else if (c.op === 'gte') pass = numeric ? num >= rhs : String(actual) >= c.value[0];
  else if (c.op === 'lt') pass = numeric ? num < rhs : String(actual) < c.value[0];
  else if (c.op === 'lte') pass = numeric ? num <= rhs : String(actual) <= c.value[0];
  // 每隔 N：值 > 0 且能被 N 整除。定扫提醒的周期性靠它表达，判断只依赖工单自身状态
  else if (c.op === 'every') pass = numeric && rhs > 0 && num > 0 && num % rhs === 0;
  return { actual: actual ?? '（未填写）', pass };
}
const condResults = computed(() =>
  (testRule.value?.conditions ?? []).map((c) => ({ c, ...evalCond(c) })),
);
const hit = computed(() =>
  !!testRule.value?.enabled && condResults.value.every((r) => r.pass),
);
const passCondCount = computed(() => condResults.value.filter((x) => x.pass).length);

/** 收件人解析，并给出「怎么算出来的」 */
const resolved = computed(() => {
  if (!testRule.value) return [];
  const d = testData;
  return testRule.value.recipients.map((r) => {
    const t = recipientTypeOf(r.type)!;
    if (t.kind === 'fixed') {
      return { label: recipientLabel(r), who: r.fixedValue || '（未指定）', how: '固定指派', ok: !!r.fixedValue };
    }
    if (t.kind === 'relation') {
      const chain = SUPERIOR_CHAIN[d.assigneeId] ?? [];
      const lv = t.hasLevel ? (r.level ?? 1) : 1;
      const who = chain[lv - 1];
      return {
        label: recipientLabel(r),
        who: who ?? '—',
        how: `处理人「${d.assigneeId}」向上 ${lv} 级`,
        ok: !!who,
        err: who ? '' : '超出组织树层级，该收件人解析为空',
      };
    }
    const who = d[t.requires!];
    return {
      label: recipientLabel(r), who: who ?? '—',
      how: `取事件属性 ${t.requires}`,
      ok: !!who,
      err: who ? '' : '该字段未填写，实际运行时若为空则此收件人解析不出人',
    };
  });
});
const okRecipientCount = computed(() => resolved.value.filter((x) => x.ok).length);

/** 渲染模板：未解析的变量高亮 */
/** 逐通道渲染模板，未解析的变量标红 */
function renderTpl(ch: NotifyChannel) {
  let raw = '';
  if (isTemplateChannel(ch)) {
    raw = RULE_TEMPLATES[ch]?.find((x) => x.code === testRule.value!.templates[ch])?.content ?? '';
  } else {
    const c = testRule.value!.contents[ch];
    raw = c ? `${c.subject ? '主题：' + c.subject + '\n\n' : ''}${c.body}` : '';
  }
  const d = testData;
  return raw.split(/(\$\{[a-zA-Z]+\})/).map((seg) => {
    const m = seg.match(/^\$\{([a-zA-Z]+)\}$/);
    if (!m) return { text: seg, miss: false };
    const v = d[m[1]];
    return { text: v ?? seg, miss: v === undefined };
  });
}

</script>

<template>
  <div class="notify-rules">
    <div class="panel">
      <AdminPageHeader
        title="通知管理"
        subtitle="配置工单消息：订什么事件、发给谁、走哪条通道"
      >
        <template #actions>
          <div class="hdr-stats">
            <span class="hs"><b>{{ stat.rule }}</b>规则</span>
            <span class="hs"><b class="on">{{ stat.on }}</b>启用</span>
            <span class="hs"><b>{{ stat.event }}</b>事件</span>
            <span class="hs"><b>{{ stat.used }}</b>已订阅</span>
          </div>
          <a-button v-if="tab === 'rules'" type="primary" @click="openCreate">
            <template #icon><PlusOutlined /></template>新建规则
          </a-button>
        </template>
      </AdminPageHeader>

      <a-tabs v-model:activeKey="tab" class="np-tabs">
        <!-- ========== 规则列表 ========== -->
        <a-tab-pane key="rules">
          <template #tab>通知规则<span class="tab-n">{{ stat.rule }}</span></template>
          <div class="list-toolbar">
            <div class="fi">
              <span class="fl">面向</span>
              <a-select
                v-model:value="fAudience"
                class="tb-ctl sel-w-sm"
                size="small"
                :options="audienceFilterOptions"
              />
            </div>
            <div class="fi">
              <span class="fl">通道</span>
              <a-select
                v-model:value="fChannel"
                class="tb-ctl sel-w"
                size="small"
                :options="channelFilterOptions"
              />
            </div>
            <div class="fi">
              <span class="fl">事件</span>
              <a-select
                v-model:value="fEvent"
                class="tb-ctl sel-w-lg"
                size="small"
                allow-clear
                show-search
                option-filter-prop="label"
                placeholder="全部"
                :options="eventFilterOptions"
              />
            </div>
            <div class="tb-search">
              <SearchOutlined class="tb-search-ic" />
              <input
                v-model="fKeyword"
                class="tb-search-input"
                placeholder="搜索规则名 / 事件"
              />
            </div>
            <button type="button" class="tb-btn" @click="resetFilter">
              <ReloadOutlined />
              <span>重置</span>
            </button>
          </div>

          <a-table
            :columns="[
              { title: '规则', dataIndex: 'name', key: 'name', width: 250 },
              { title: '订阅事件', dataIndex: 'event', key: 'event', width: 220 },
              { title: '收件人', dataIndex: 'recipients', key: 'recipients', width: 210 },
              { title: '通道 / 模板', dataIndex: 'channels', key: 'channels' },
              { title: '启用', dataIndex: 'enabled', key: 'enabled', width: 68 },
              { title: '操作', key: 'op', width: 148, align: 'right' as const },
            ]"
            :data-source="rows"
            row-key="id"
            :pagination="rulePagination"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <div class="r-name">
                  <a-tag :color="record.audience === 'external' ? 'blue' : 'default'" class="mini">
                    {{ record.audience === 'external' ? '对客' : '对内' }}
                  </a-tag>
                  <span>{{ record.name }}</span>
                </div>
              </template>

              <template v-else-if="column.key === 'event'">
                <div class="r-ev">
                  <span>{{ eventOf(record.event)?.name }}</span>
                  <span class="r-code">{{ record.event }}</span>
                </div>
              </template>

              <template v-else-if="column.key === 'recipients'">
                <a-tag v-for="(r, i) in record.recipients" :key="i" class="rcp">
                  <ApartmentOutlined v-if="recipientTypeOf(r.type)?.kind === 'relation'" />
                  <PushpinOutlined v-else-if="recipientTypeOf(r.type)?.kind === 'fixed'" />
                  <UserOutlined v-else />
                  {{ recipientLabel(r) }}
                </a-tag>
              </template>

              <template v-else-if="column.key === 'channels'">
                <div v-for="ch in record.channels" :key="ch" class="tpl-line">
                  <a-tag color="geekblue" class="mini">{{ ch }}</a-tag>
                  <span v-if="record.templates[ch]" class="tpl-code">{{ record.templates[ch] }}</span>
                  <span v-else class="tpl-inline">规则内正文</span>
                </div>
              </template>

              <template v-else-if="column.key === 'enabled'">
                <a-switch v-model:checked="record.enabled" size="small" />
              </template>

              <template v-else-if="column.key === 'op'">
                <div class="op-btns">
                  <a-button type="link" size="small" @click="openEdit(record as NotifyRule)">编辑</a-button>
                  <a-button type="link" size="small" @click="openTest(record as NotifyRule)">测试</a-button>
                  <a-button type="link" size="small" danger @click="delRule(record as NotifyRule)">删除</a-button>
                </div>
              </template>
            </template>
          </a-table>
        </a-tab-pane>

        <!-- ========== 事件目录 ========== -->
        <a-tab-pane key="events">
          <template #tab>事件目录<span class="tab-n">{{ stat.event }}</span></template>
          <div class="bar">
            <span class="tip">事件由代码维护，新增事件需发版；已有事件加通知只需新建规则。点击任意行查看变量说明。</span>
          </div>
          <a-table
            :columns="[
              { title: '事件', dataIndex: 'name', key: 'name', width: 280 },
              { title: '动作码', dataIndex: 'actionCode', key: 'actionCode', width: 160 },
              { title: '专属属性', dataIndex: 'payload', key: 'payload', width: 120 },
              { title: '已挂规则', key: 'used', width: 90 },
              { title: '', key: 'go', width: 72 },
            ]"
            :data-source="NOTIFY_EVENTS"
            row-key="code"
            :pagination="false"
            size="middle"
            :custom-row="(record) => ({ onClick: () => openEventDetail(record.code), class: 'ev-row' })"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <div class="r-ev">
                  <span class="ev-name">{{ record.name }}</span>
                  <span class="r-code">{{ record.code }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'actionCode'">
                <!-- 无动作码要显式写出来：`—` 看不出这是「需研发确认的埋点缺口」 -->
                <a-tooltip v-if="record.remark" :title="record.remark">
                  <span v-if="record.actionCode" class="act">{{ record.actionCode }}</span>
                  <span v-else class="no-act">无对应动作码</span>
                </a-tooltip>
                <template v-else>
                  <span v-if="record.actionCode" class="act">{{ record.actionCode }}</span>
                  <span v-else class="no-act">无对应动作码</span>
                </template>
              </template>
              <template v-else-if="column.key === 'payload'">
                <span v-if="ownFieldCount(record.payload)" class="pl-count">
                  {{ ownFieldCount(record.payload) }} 个
                </span>
                <span v-else class="muted">仅公共</span>
              </template>
              <template v-else-if="column.key === 'used'">
                <span :class="ruleCountOf(record.code) ? 'used-n' : 'muted'">{{ ruleCountOf(record.code) }}</span>
              </template>
              <template v-else-if="column.key === 'go'">
                <span class="ev-go">详情</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </div>

    <!-- ===================== 规则编辑：基础信息 → 触发与对象 → 发送内容 ===================== -->
    <a-modal
      v-model:open="editOpen"
      :title="editingId ? `编辑通知规则 · ${form.name}` : '新建通知规则'"
      :width="780"
      :ok-text="editingId ? '保存' : '创建'"
      cancel-text="取消"
      :body-style="{ paddingTop: '12px', paddingBottom: '8px' }"
      @ok="saveRule"
    >
      <div class="edit-body">
        <!-- ① 基础信息 -->
        <section class="sec">
          <header class="sec-head">基础信息</header>
          <div class="sec-body">
            <div class="fm-row">
              <span class="fm-k">规则名称</span>
              <div class="fm-v fm-inline">
                <a-input v-model:value="form.name" class="fm-grow" placeholder="如：跨组调剂通知目标组长" />
                <span class="fm-k2">启用</span>
                <a-switch v-model:checked="form.enabled" />
              </div>
            </div>
            <div class="fm-row">
              <span class="fm-k">订阅事件</span>
              <div class="fm-v fm-inline">
                <a-select
                  v-model:value="form.event" class="fm-grow" show-search option-filter-prop="label"
                  placeholder="输入事件名或事件码搜索"
                  :options="NOTIFY_EVENTS.map((e) => ({ value: e.code, label: `${e.name}（${e.code}）` }))"
                  @change="onEventChange"
                />
                <span class="fm-k2">面向</span>
                <a-radio-group v-model:value="form.audience" button-style="solid" size="small">
                  <a-radio-button value="internal">对内</a-radio-button>
                  <a-radio-button value="external">对客</a-radio-button>
                </a-radio-group>
              </div>
            </div>
          </div>
        </section>

        <!-- ② 触发与对象 -->
        <section class="sec">
          <header class="sec-head">
            触发与对象
            <a-tooltip title="条件之间为「且」；不加条件则事件发生即触发。收件人配类型、不配具体人。">
              <QuestionCircleOutlined class="sec-help" />
            </a-tooltip>
          </header>
          <div class="sec-body">
            <div class="sub-blk">
              <div class="sub-head">
                <span>触发条件</span>
                <a-button size="small" type="link" @click="addCond">
                  <template #icon><PlusOutlined /></template>加一条
                </a-button>
              </div>
              <div v-if="!form.conditions.length" class="blk-empty">
                {{ curEvent?.source === 'timer'
                  ? '未加条件 —— 定扫事件每天都会命中该状态下的全部工单，请用条件限定阈值（如 距挂起到期天数 ≤ 3）或周期（如 已挂起天数 每隔 30）'
                  : '事件发生即触发' }}
              </div>
              <div v-for="(c, i) in form.conditions" :key="i" class="cond-row">
                <span v-if="i" class="c-and">且</span><span v-else class="c-and ph" />
                <a-select
                  v-model:value="c.field" style="width: 160px" show-search option-filter-prop="label"
                  :options="eventVars.map((p) => ({ value: p.key, label: p.label }))"
                  @change="onCondFieldChange(c)"
                />
                <a-select
                  v-model:value="c.op" style="width: 90px" :options="opOptions(c.field)"
                  @change="onCondOpChange(c)"
                />
                <!-- 有固定取值域（枚举 / 是否）→ 下拉选，杜绝手打 -->
                <a-select
                  v-if="valueOptions(c.field)"
                  v-model:value="c.value" style="flex: 1"
                  :mode="isSingleValue(c.op) ? undefined : 'multiple'"
                  :options="valueOptions(c.field)!"
                  placeholder="选择取值"
                />
                <!-- 自由文本 / 数值 / 时间 → 输入 -->
                <a-select
                  v-else v-model:value="c.value" mode="tags" style="flex: 1"
                  :placeholder="fieldOf(c.field)?.type === 'datetime' ? '如 2026-07-29 18:00，回车添加' : '输入取值，回车添加'"
                />
                <a-tag class="cond-type">{{ TYPE_LABEL[fieldOf(c.field)?.type ?? 'string'] }}</a-tag>
                <a-button type="link" danger size="small" @click="delCond(i)">
                  <template #icon><DeleteOutlined /></template>
                </a-button>
              </div>
            </div>
            <div class="sub-blk">
              <div class="sub-head"><span>收件人</span></div>
              <a-select
                :value="form.recipients.map((r) => r.type)"
                mode="multiple"
                allow-clear
                style="width: 100%"
                placeholder="选择收件人类型，可多选"
                :options="recipientOptions"
                option-filter-prop="label"
                @change="onRecipientTypesChange"
              />
              <div v-for="r in recipientsNeedingExtra" :key="r.type" class="rcp-extra">
                <span class="rcp-extra-name">{{ recipientTypeOf(r.type)?.name }}</span>
                <a-input-number
                  v-if="needLevel(r.type)" v-model:value="r.level"
                  :min="1" :max="5" style="width: 140px" addon-before="上溯" addon-after="级"
                />
                <a-select
                  v-if="isFixed(r.type)"
                  v-model:value="r.fixedValue"
                  show-search
                  allow-clear
                  :options="FIXED_ASSIGN_OPTIONS"
                  :filter-option="filterFixedAssignOption"
                  option-filter-prop="label"
                  style="flex: 1; min-width: 220px"
                  placeholder="搜索用户或角色"
                />
                <span class="rcp-desc">{{ recipientTypeOf(r.type)?.desc }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- ③ 发送内容 -->
        <section class="sec">
          <header class="sec-head">
            发送内容
            <a-tooltip title="IM / 短信从消息中心选模板；邮件 / 站内信在本规则内撰写。短信签名由渠道拼接，勿写入正文。">
              <QuestionCircleOutlined class="sec-help" />
            </a-tooltip>
          </header>
          <div class="sec-body">
            <div class="fm-row">
              <span class="fm-k">通知通道</span>
              <div class="fm-v">
                <a-checkbox-group v-model:value="form.channels" @change="onChannelChange(form.channels)">
                  <a-checkbox v-for="c in CHANNELS" :key="c" :value="c">{{ c }}</a-checkbox>
                </a-checkbox-group>
              </div>
            </div>

            <div v-if="!form.channels.length" class="tpl-empty">请至少勾选一个通知通道</div>

            <div v-for="ch in orderedChannels" :key="ch" class="ch-card">
              <div class="ch-head" @click="toggleChannel(ch)">
                <a-tag color="geekblue" class="mini">{{ ch }}</a-tag>
                <span class="ch-title">{{ isTemplateChannel(ch) ? '消息模板' : '消息内容' }}</span>
                <a-tag v-if="isTemplateChannel(ch)" color="default" class="mini">只读</a-tag>
                <a-tag v-else color="cyan" class="mini">规则内编辑</a-tag>
                <span class="ch-spacer" />
                <a-button
                  v-if="isTemplateChannel(ch)" type="link" size="small"
                  @click.stop="gotoMessageCenter"
                >
                  消息中心<ArrowRightOutlined />
                </a-button>
                <button type="button" class="ch-toggle" :aria-expanded="!!chExpanded[ch]">
                  <UpOutlined v-if="chExpanded[ch]" /><DownOutlined v-else />
                  {{ chExpanded[ch] ? '收起' : '展开' }}
                </button>
              </div>

              <!-- 模板通道：始终露出选择器；预览可折叠 -->
              <template v-if="isTemplateChannel(ch)">
                <a-select
                  v-model:value="form.templates[ch]" style="width: 100%; margin-top: 10px"
                  :options="tplOptions(ch)"
                />
                <template v-if="chExpanded[ch]">
                  <pre class="tb-pre">{{ tplPreview(ch) || '（该模板无正文）' }}</pre>
                  <div class="tb-hint muted-line">
                    模板在消息中心维护，本页只读；当前被 {{ tplRefCount(ch) }} 条规则引用
                    <template v-if="ch === '短信'">；需运营商报备后方可发送</template>
                  </div>
                </template>
                <div v-else class="ch-summary">
                  {{ tplPreview(ch).replace(/\s+/g, ' ').slice(0, 48)
                     + (tplPreview(ch).length > 48 ? '…' : '') }}
                </div>
              </template>

              <!-- 编辑器通道：展开后编辑 -->
              <template v-else>
                <div v-if="!chExpanded[ch]" class="ch-summary">
                  {{ form.contents[ch]?.body?.trim()
                    ? (form.contents[ch].body.trim().slice(0, 48) + (form.contents[ch].body.length > 48 ? '…' : ''))
                    : '尚未填写正文，点击展开编辑' }}
                </div>
                <template v-else>
                  <div v-if="hasSubject(ch) && form.contents[ch]" class="tb-field">
                    <span class="tb-label">主题</span>
                    <input
                      :ref="(el) => setSubjectRef(ch, el)" v-model="form.contents[ch].subject" class="tb-input"
                      placeholder="邮件主题，可插入变量" @focus="lastFocus[ch] = 'subject'"
                    />
                  </div>
                  <div v-if="form.contents[ch]" class="tb-field">
                    <span class="tb-label">正文</span>
                    <textarea
                      :ref="(el) => setBodyRef(ch, el)" v-model="form.contents[ch].body" class="tb-textarea" rows="4"
                      placeholder="撰写正文，可点下方变量插入" @focus="lastFocus[ch] = 'body'"
                    ></textarea>
                  </div>
                  <div class="tb-insert">
                    <span class="tb-label">变量</span>
                    <div class="tb-vars">
                      <a-tooltip
                        v-for="p in eventVars" :key="p.key"
                        :title="p.label + (p.isRecipient ? '（可作收件人）' : '')"
                      >
                        <button type="button" class="vb-var" :class="{ rcp: p.isRecipient }" @click="insertVar(ch, p.key)">
                          ${{ '{' }}{{ p.key }}{{ '}' }}
                        </button>
                      </a-tooltip>
                    </div>
                  </div>
                </template>
              </template>

              <div v-if="illegalVarsOf(ch).length" class="tb-err">
                使用了本事件不存在的变量：{{ illegalVarsOf(ch).join('、') }}
              </div>
            </div>
          </div>
        </section>
      </div>
    </a-modal>

    <!-- ===================== 规则测试 ===================== -->
    <a-modal
      v-model:open="testOpen"
      :width="920"
      :footer="null"
      class="test-modal"
      :body-style="{ padding: 0 }"
      destroy-on-close
    >
      <template #title>
        <div class="tm-title">
          <span class="tm-title-k">规则测试</span>
          <span class="tm-title-name">{{ testRule?.name }}</span>
        </div>
      </template>

      <div v-if="testRule" class="tm">
        <div class="tm-bar">
          <label class="tm-bar-lab">场景预设</label>
          <a-select
            v-model:value="testPreset"
            size="small"
            class="tm-preset"
            :options="TEST_PRESETS.map((s) => ({ value: s.id, label: s.label }))"
          />
          <span class="tm-bar-tip">构造数据，非真实工单 · 改字段后判定实时重算</span>
        </div>

        <div class="tm-verdict" :class="hit ? 'hit' : 'miss'">
          <div class="tm-verdict-main">
            <CheckCircleFilled v-if="hit" class="tm-verdict-ic" />
            <CloseCircleFilled v-else class="tm-verdict-ic" />
            <div>
              <div class="tm-verdict-t">
                <template v-if="hit">命中 · 将向收件人发送</template>
                <template v-else-if="!testRule.enabled">不发送 · 规则已停用</template>
                <template v-else>不发送 · 触发条件未全部满足</template>
              </div>
              <div class="tm-verdict-s">
                <template v-if="condResults.length">条件 {{ passCondCount }}/{{ condResults.length }} 通过</template>
                <template v-else>无条件 · 事件即触发</template>
                · 收件人 {{ okRecipientCount }}/{{ resolved.length }} 可解析
              </div>
            </div>
          </div>
          <div v-if="hit && okRecipientCount" class="tm-verdict-rcp">
            <span v-for="(r, i) in resolved.filter((x) => x.ok)" :key="i" class="tm-pill">{{ r.who }}</span>
          </div>
        </div>

        <div class="tm-split">
          <section class="tm-pane">
            <header class="tm-ph">
              <span>测试数据</span>
              <span class="tm-ph-tip">{{ testFields.length }} 个字段</span>
            </header>
            <div v-if="!testFields.length" class="tm-empty">本规则未引用事件属性，无需填写。</div>
            <div v-else class="tm-fields">
              <div v-for="f in testFields" :key="f.key" class="tm-field">
                <div class="tm-fk">
                  <span class="tm-fl">{{ f.label }}</span>
                  <code class="tm-fvar">{{ f.key }}</code>
                </div>
                <a-select
                  v-if="f.enumValues"
                  v-model:value="testData[f.key]"
                  size="small"
                  class="tm-fin"
                  allow-clear
                  :options="f.enumValues.map((v) => ({ value: v, label: v }))"
                  :placeholder="`选择${f.label}`"
                />
                <a-input
                  v-else
                  v-model:value="testData[f.key]"
                  size="small"
                  class="tm-fin"
                  :placeholder="`填写${f.label}`"
                />
              </div>
            </div>
          </section>

          <section class="tm-pane">
            <header class="tm-ph">
              <span>条件判定</span>
              <span class="tm-ph-tip" v-if="condResults.length">{{ passCondCount }}/{{ condResults.length }}</span>
            </header>
            <div v-if="!condResults.length" class="tm-empty">无条件，事件发生即触发</div>
            <div v-else class="tm-conds">
              <div v-for="(r, i) in condResults" :key="i" class="tm-cr" :class="{ bad: !r.pass }">
                <CheckCircleFilled v-if="r.pass" class="tm-cr-ic ok" />
                <CloseCircleFilled v-else class="tm-cr-ic no" />
                <div class="tm-cr-body">
                  <div class="tm-cr-txt">{{ condLabel(r.c, testRule.event) }}</div>
                  <div class="tm-cr-act">实际值 · {{ r.actual }}</div>
                </div>
              </div>
            </div>

            <header class="tm-ph tm-ph--sub">
              <span>收件人解析</span>
              <span class="tm-ph-tip">{{ okRecipientCount }}/{{ resolved.length }}</span>
            </header>
            <div v-if="!resolved.length" class="tm-empty">未配置收件人</div>
            <div v-else class="tm-rcps">
              <div v-for="(r, i) in resolved" :key="i" class="tm-rs" :class="{ bad: !r.ok }">
                <div class="tm-rs-top">
                  <span class="tm-rs-lab">{{ r.label }}</span>
                  <span class="tm-rs-who" :class="{ empty: !r.ok }">{{ r.who }}</span>
                </div>
                <div class="tm-rs-how">
                  {{ r.how }}
                  <span v-if="r.err" class="tm-rs-err"> · {{ r.err }}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div class="tm-bottom">
          <div class="tm-btabs">
            <button type="button" class="tm-btab" :class="{ on: testPane === 'preview' }" @click="testPane = 'preview'">
              渲染预览
            </button>
            <button type="button" class="tm-btab" :class="{ on: testPane === 'send' }" @click="testPane = 'send'">
              发送测试
            </button>
            <div class="tm-ch-tabs">
              <button
                v-for="ch in testRule.channels"
                :key="ch"
                type="button"
                class="tm-ch"
                :class="{ on: testChannel === ch }"
                @click="testChannel = ch"
              >{{ ch }}</button>
            </div>
          </div>

          <div v-show="testPane === 'preview'" class="tm-preview">
            <pre class="tm-pre"><span
              v-for="(s, i) in renderTpl(testChannel)"
              :key="i"
              :class="{ miss: s.miss }"
            >{{ s.text }}</span></pre>
            <p v-if="sendBlocked(testChannel)" class="tm-pre-warn">
              正文仍有未解析变量（标红），请先补齐左侧测试数据。
            </p>
          </div>

          <div v-show="testPane === 'send'" class="tm-send">
            <div class="tm-send-warn">
              <UserOutlined />
              <span>只发给下方地址，<b>不会发给客户或工单处理人</b>；试发不写入工单通知记录。</span>
            </div>
            <div class="tm-send-row">
              <span class="tm-send-lab">{{ ADDR_META[testChannel].label }}</span>
              <a-input
                v-model:value="sendTo[testChannel]"
                size="middle"
                class="tm-send-in"
                :placeholder="ADDR_META[testChannel].ph"
                :disabled="sendState[testChannel]?.status === 'sending'"
              />
              <a-button
                type="primary"
                :loading="sendState[testChannel]?.status === 'sending'"
                :disabled="sendBlocked(testChannel)"
                @click="testSend(testChannel)"
              >
                {{ sendState[testChannel]?.status === 'ok' ? '重新试发' : '试发' }}
              </a-button>
            </div>
            <div
              v-if="sendState[testChannel] && sendState[testChannel].status !== 'idle' && sendState[testChannel].status !== 'sending'"
              class="tm-send-res"
              :class="sendState[testChannel].status"
            >
              <CheckCircleFilled v-if="sendState[testChannel].status === 'ok'" />
              <CloseCircleFilled v-else />
              {{ sendState[testChannel].msg }}
            </div>
            <div v-else-if="sendBlocked(testChannel)" class="tm-send-res fail">
              <CloseCircleFilled />正文有未解析变量，补齐测试数据后可试发
            </div>
          </div>
        </div>
      </div>
    </a-modal>

    <!-- ===================== 事件详情（右侧抽屉） ===================== -->
    <a-drawer
      v-model:open="evDetailOpen"
      :width="640"
      placement="right"
      :body-style="{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column' }"
    >
      <template #title>
        <div class="evd-title">
          <div class="evd-title-main">
            <span>{{ evDetail?.name }}</span>
            <a-tag v-if="evDetail" :color="EVENT_SOURCE_META[evDetail.source].color" class="mini">
              {{ EVENT_SOURCE_META[evDetail.source].label }}
            </a-tag>
          </div>
          <code class="evd-code">{{ evDetail?.code }}</code>
        </div>
      </template>

      <div v-if="evDetail" class="evd-body">
        <!-- ① 概要：动作码 / 已挂规则 -->
        <div class="evd-summary">
          <div class="es-item">
            <span class="es-k">动作码</span>
            <span v-if="evDetail.actionCode" class="act">{{ evDetail.actionCode }}</span>
            <span v-else class="no-act">无对应动作码</span>
          </div>
          <div class="es-item">
            <span class="es-k">已挂规则</span>
            <span v-if="detailRules.length" class="es-rules">
              <a v-for="r in detailRules" :key="r.id" class="em-rule" @click="gotoRuleFromDetail(r)">
                {{ r.name }}
                <a-tag :color="r.audience === 'external' ? 'blue' : 'default'" class="mini">
                  {{ r.audience === 'external' ? '对客' : '对内' }}
                </a-tag>
              </a>
            </span>
            <span v-else class="muted">暂无订阅</span>
          </div>
          <p v-if="evDetail.remark" class="es-remark">{{ evDetail.remark }}</p>
        </div>

        <!-- ② 专属属性：写模板时最常看 -->
        <section class="evd-sec">
          <header class="evd-sh">
            <span>事件专属属性</span>
            <span class="evd-tip">{{ detailOwnFields.length }} 个 · 写模板可直接引用</span>
          </header>
          <div v-if="detailOwnFields.length" class="evd-fields">
            <div v-for="p in detailOwnFields" :key="p.key" class="evd-field">
              <div class="ef-top">
                <code class="evd-var">${{ '{' }}{{ p.key }}{{ '}' }}</code>
                <span class="ef-label">{{ p.label }}</span>
                <a-tag class="evd-type" :class="{ enum: p.type === 'enum' }">{{ TYPE_LABEL[p.type ?? 'string'] }}</a-tag>
                <a-tag v-if="p.isRecipient" class="evd-type rcp">可作收件人</a-tag>
              </div>
              <p class="ef-desc">{{ p.desc }}</p>
              <div v-if="p.enumValues" class="evd-enum">
                <span v-for="v in p.enumValues" :key="v" class="ev-val">{{ v }}</span>
              </div>
              <div class="ef-sample">示例 · {{ sampleData[p.key] ?? '—' }}</div>
            </div>
          </div>
          <div v-else class="blk-empty">本事件无专属属性，仅使用公共字段。</div>
        </section>

        <!-- ③ 公共属性：默认折叠 -->
        <section class="evd-sec">
          <header class="evd-sh evd-sh--toggle" @click="baseFieldsOpen = !baseFieldsOpen">
            <span>公共属性</span>
            <span class="evd-tip">{{ detailBaseFields.length }} 个 · 所有事件共有</span>
            <span class="evd-toggle">
              <UpOutlined v-if="baseFieldsOpen" /><DownOutlined v-else />
              {{ baseFieldsOpen ? '收起' : '展开' }}
            </span>
          </header>
          <div v-if="baseFieldsOpen" class="evd-base-list">
            <div v-for="p in detailBaseFields" :key="p.key" class="evd-base-row">
              <code class="evd-var">${{ '{' }}{{ p.key }}{{ '}' }}</code>
              <span class="ef-label">{{ p.label }}</span>
              <a-tag class="evd-type" :class="{ enum: p.type === 'enum' }">{{ TYPE_LABEL[p.type ?? 'string'] }}</a-tag>
              <a-tag v-if="p.isRecipient" class="evd-type rcp">可作收件人</a-tag>
              <span class="ef-sample-inline">{{ sampleData[p.key] ?? '—' }}</span>
            </div>
          </div>
        </section>

        <!-- ④ 可用收件人 -->
        <section class="evd-sec">
          <header class="evd-sh">
            <span>可用收件人</span>
            <span class="evd-tip">由事件属性决定</span>
          </header>
          <div class="evd-rcps">
            <a-tooltip v-for="t in detailRecipients" :key="t.code" :title="t.desc">
              <a-tag class="evd-rcp">{{ t.name }}</a-tag>
            </a-tooltip>
          </div>
        </section>
      </div>

      <div class="evd-foot">
        <span class="evd-foot-tip">新增事件需发版；已有事件加通知只需新建规则。</span>
        <a-button type="primary" size="small" @click="createRuleForEvent">
          <template #icon><PlusOutlined /></template>为本事件建规则
        </a-button>
      </div>
    </a-drawer>
  </div>
</template>

<style scoped>
/* 视觉令牌统一走 docs/admin-ui-spec.md §0：
   主 #1a6fff / 成功 #10b981 / 危险 #ef4444 / 警告 #f59e0b
   文本 #111827 · #6b7280 · #9ca3af，边框 #e5e7eb，分隔 #f0f1f3

   字号只用两档（全页统一，不再出现 10/11px 碎档）：
   13px = 主文本 / 分区标题 / 表单 label；12px = 次要说明 / 表头 / 代码；
   例外仅页头指标数字 15px 与行内 mini 标签 11px。
   字体全页统一继承 body（中英文同源），不使用等宽字体——编码类文本与中文混排时
   等宽字体的基线与字重差异会显得割裂。 */

/* ---- §4 页面框架：灰底 + 单一白面板，面板内首行为 AdminPageHeader ---- */
.notify-rules {
  min-height: 100%;
  padding: 12px 16px 16px;
  background: var(--flowos-content-bg, #f9fafb);
}
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 14px 20px 20px;
}
.panel :deep(.admin-page-header) {
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f1f3;
  align-items: center;
}
.panel :deep(.aph-sub) { margin-top: 2px; }
.hdr-stats {
  display: flex; align-items: center; gap: 14px;
  margin-right: 4px; padding-right: 14px;
  border-right: 1px solid #f0f1f3;
}
.hs { font-size: 12px; color: #9ca3af; white-space: nowrap; }
.hs b { font-size: 15px; font-weight: 600; color: #111827; margin-right: 3px; }
.hs b.on { color: #10b981; }

/* ---- 页内 Tab：与消息中心 / 连接器中心一致用 a-tabs，不用 segmented ---- */
.np-tabs :deep(.ant-tabs-nav) { margin-bottom: 12px; }
.tab-n {
  margin-left: 6px;
  padding: 0 6px;
  font-size: 12px;
  line-height: 18px;
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 9px;
}
:deep(.ant-tabs-tab-active) .tab-n { color: #1a6fff; background: #eff6ff; }

/* ---- 说明条 / 筛选工具栏 ---- */
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.tip { font-size: 12px; color: #9ca3af; line-height: 1.6; }

.list-toolbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-bottom: 12px; padding: 8px 12px;
  background: #f9fafb; border: 1px solid #f0f1f3; border-radius: 6px;
}
.fi { display: flex; align-items: center; gap: 6px; flex: none; }
.fl { font-size: 12px; color: #6b7280; white-space: nowrap; }
.sel-w { width: 100px !important; }
.sel-w-sm { width: 88px !important; }
.sel-w-lg { width: 200px !important; }
.list-toolbar :deep(.tb-ctl.ant-select .ant-select-selector) {
  font-size: 13px; border-radius: 6px; background: #fff;
}
.tb-search {
  display: flex; align-items: center; gap: 6px;
  width: 200px; height: 28px; padding: 0 10px;
  background: #fff; border: 1px solid #d1d5db; border-radius: 6px;
  box-sizing: border-box; flex: none; margin-left: auto;
}
.tb-search:focus-within {
  border-color: #1a6fff; box-shadow: 0 0 0 2px rgb(26 111 255 / 10%);
}
.tb-search-ic { color: #9ca3af; font-size: 13px; flex: none; }
.tb-search-input {
  flex: 1; min-width: 0; border: none; outline: none;
  font-size: 13px; color: #374151; background: transparent; font-family: inherit;
}
.tb-search-input::placeholder { color: #9ca3af; }
.tb-btn {
  display: inline-flex; align-items: center; gap: 4px; height: 28px;
  padding: 0 10px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 13px; color: #374151; cursor: pointer; user-select: none;
  white-space: nowrap; flex: none; font-family: inherit;
}
.tb-btn:hover { border-color: #1a6fff; color: #1a6fff; }

/* ---- §3 表格 ---- */
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }
.op-btns {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: nowrap;
  gap: 0;
}
.op-btns :deep(.ant-btn-link) {
  padding-inline: 6px;
}

.r-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
}
.r-ev {
  display: flex;
  align-items: baseline;
  flex-wrap: nowrap;
  gap: 6px;
  font-size: 13px;
  color: #374151;
  white-space: nowrap;
}
.r-code { font-size: 12px; color: #9ca3af; }
.mini { font-size: 11px; line-height: 18px; padding: 0 6px; margin: 0; }
.r-name .mini { flex-shrink: 0; }
.tpl-line .mini { margin: 0 6px 0 0; }
.cond-n { cursor: help; }

/* 触发条件的悬浮明细 */
.cond-tip { font-size: 12px; line-height: 1.9; }
.cond-and { color: #6ee7b7; font-weight: 600; margin-right: 4px; }
.muted { font-size: 12px; color: #9ca3af; }
.rcp :deep(.anticon) { margin-right: 3px; font-size: 12px; }
.tpl-line { display: flex; align-items: center; font-size: 12px; color: #6b7280; line-height: 1.9; }
.tpl-code { color: #6b7280; letter-spacing: 0.2px; }

/* ---- 事件目录 ---- */
.act { font-size: 12px; color: #1a6fff; }
.no-act { font-size: 12px; color: #9ca3af; }
.pl-count { font-size: 13px; color: #374151; font-weight: 500; }
.ev-go { font-size: 12px; color: #1a6fff; }
.used-n { font-weight: 600; color: #10b981; }

/* ---- 编辑弹窗：三区块 ---- */
.edit-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 0 2px 12px 0;
}
.sec {
  border: 1px solid #e8eaed;
  border-radius: 10px;
  background: #fff;
  overflow: visible;
}
.sec-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  background: #f8fafc;
  border-bottom: 1px solid #eef0f3;
  border-radius: 10px 10px 0 0;
}
.sec-help { color: #9ca3af; font-size: 13px; cursor: help; }
.sec-help:hover { color: #1a6fff; }
.sec-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fm-row { display: flex; gap: 12px; align-items: center; }
.fm-row--top { align-items: flex-start; }
.fm-k {
  width: 72px;
  flex: none;
  font-size: 13px;
  color: #6b7280;
  line-height: 32px;
}
.fm-row--top .fm-k { line-height: 22px; padding-top: 5px; }
.fm-v { flex: 1; min-width: 0; }
.fm-tip { font-size: 12px; color: #9ca3af; margin-top: 5px; line-height: 1.6; }
.fm-inline {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
}
.fm-grow { flex: 1; min-width: 0; }
.fm-k2 { flex: none; font-size: 13px; color: #6b7280; white-space: nowrap; }

.sub-blk + .sub-blk {
  padding-top: 12px;
  border-top: 1px dashed #eef0f3;
}
.sub-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.sub-head .ant-btn { margin-left: auto; }
.blk-empty { font-size: 12px; color: #9ca3af; padding: 2px 0 4px; }

.cond-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.cond-row:last-child { margin-bottom: 0; }
.cond-type { flex: none; font-size: 11px; line-height: 18px; padding: 0 5px; color: #9ca3af; }
.c-and { width: 20px; flex: none; font-size: 12px; color: #10b981; font-weight: 600; }
.c-and.ph { visibility: hidden; }

.rcp-extra {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 6px;
}
.rcp-extra-name { flex: none; font-size: 12px; font-weight: 600; color: #374151; min-width: 72px; }
.rcp-desc { font-size: 12px; color: #9ca3af; flex: 1; min-width: 0; }

.ch-card {
  border: 1px solid #e8eaed;
  border-radius: 8px;
  padding: 12px 14px 14px;
  background: #fafbfc;
}
.ch-head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  min-height: 28px;
}
.ch-title { font-size: 13px; font-weight: 600; color: #111827; }
.ch-spacer { flex: 1; min-width: 8px; }
.ch-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: #6b7280;
  padding: 0 2px;
  font-family: inherit;
  white-space: nowrap;
}
.ch-toggle:hover { color: #1a6fff; }
.ch-summary {
  margin-top: 8px;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.5;
  padding: 0 2px;
}
.muted-line { margin-top: 6px; }

.tb-pre {
  margin: 8px 0 0;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #eef0f3;
  border-radius: 6px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.75;
  white-space: pre-wrap;
  font-family: inherit;
  max-height: 140px;
  overflow-y: auto;
}
.tpl-empty {
  padding: 14px;
  border: 1px dashed #e5e7eb;
  border-radius: 8px;
  font-size: 12px;
  color: #b0b6bf;
  text-align: center;
}
.tb-field { display: flex; gap: 10px; align-items: flex-start; margin-top: 10px; }
.tb-label { width: 40px; flex: none; font-size: 12px; color: #6b7280; padding-top: 7px; }
.tb-input, .tb-textarea {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  font-size: 13px;
  line-height: 1.7;
  color: #111827;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-family: inherit;
  outline: none;
  transition: border-color .2s;
}
.tb-textarea { resize: vertical; min-height: 88px; }
.tb-input:focus, .tb-textarea:focus {
  border-color: #1a6fff;
  box-shadow: 0 0 0 2px rgba(26, 111, 255, .1);
}
.tb-insert {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 10px;
  padding-bottom: 2px;
}
.tb-vars {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 3px;
}
.tb-hint { font-size: 12px; color: #9ca3af; line-height: 1.6; }
.tb-err {
  margin-top: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #ef4444;
  font-size: 12px;
}

/* 测试弹窗沿用旧分区 */
.blk { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
.blk-head {
  display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
  font-size: 13px; font-weight: 600; color: #111827;
  padding-left: 10px; border-left: 3px solid #1a6fff;
}
.blk-tip { font-size: 12px; color: #9ca3af; font-weight: 400; }

.var-blk { background: #f9fafb; border: 1px solid #f0f1f3; border-radius: 8px; padding: 14px 16px; }
.vb-head {
  margin-bottom: 10px; font-size: 13px; font-weight: 600; color: #111827;
  padding-left: 10px; border-left: 3px solid #1a6fff;
}
.vb-list { display: flex; flex-wrap: wrap; gap: 6px; }
.vb-var {
  font-size: 12px; padding: 2px 7px; border-radius: 4px;
  background: #eef2f7; color: #6b7280; border: none; cursor: pointer;
  font-family: inherit; transition: background .15s;
}
.vb-var:hover { background: #dbe3ee; }
.vb-var.rcp { background: #1a6fff; color: #fff; }
.vb-var.rcp:hover { background: #1560e0; }
.vb-tip { font-size: 12px; color: #9ca3af; margin-top: 10px; line-height: 1.6; }

/* ---- 规则测试弹窗 ---- */
.tm-title {
  display: flex; align-items: baseline; gap: 10px; min-width: 0;
}
.tm-title-k { font-size: 15px; font-weight: 600; color: #111827; }
.tm-title-name {
  font-size: 13px; font-weight: 500; color: #6b7280;
  padding-left: 10px; border-left: 1px solid #e5e7eb;
}

.tm {
  display: flex; flex-direction: column; gap: 12px;
  max-height: min(78vh, 720px);
  overflow: auto;
  padding: 0 20px 18px;
}
.tm-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #eef0f3;
  border-radius: 8px;
}
.tm-bar-lab { flex: none; font-size: 12px; color: #6b7280; font-weight: 500; }
.tm-preset { width: 280px; }
.tm-bar-tip { font-size: 12px; color: #9ca3af; margin-left: auto; }

.tm-verdict {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 12px 14px; border-radius: 10px; border: 1px solid transparent;
}
.tm-verdict.hit { background: #ecfdf5; border-color: #a7f3d0; }
.tm-verdict.miss { background: #fef2f2; border-color: #fecaca; }
.tm-verdict-main { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.tm-verdict-ic { font-size: 18px; margin-top: 1px; }
.tm-verdict.hit .tm-verdict-ic { color: #059669; }
.tm-verdict.miss .tm-verdict-ic { color: #dc2626; }
.tm-verdict-t { font-size: 14px; font-weight: 600; line-height: 1.3; }
.tm-verdict.hit .tm-verdict-t { color: #047857; }
.tm-verdict.miss .tm-verdict-t { color: #b91c1c; }
.tm-verdict-s { margin-top: 3px; font-size: 12px; color: #6b7280; }
.tm-verdict-rcp { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.tm-pill {
  font-size: 12px; font-weight: 600; color: #047857;
  background: #fff; border: 1px solid #a7f3d0;
  padding: 2px 8px; border-radius: 999px;
}

.tm-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
}
.tm-pane {
  border: 1px solid #e8eaed;
  border-radius: 10px;
  background: #fff;
  padding: 12px 14px;
  min-height: 220px;
  display: flex; flex-direction: column; gap: 8px;
}
.tm-ph {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: #111827;
}
.tm-ph--sub {
  margin-top: 6px; padding-top: 10px;
  border-top: 1px dashed #eef0f3;
}
.tm-ph-tip { font-size: 12px; font-weight: 400; color: #9ca3af; }
.tm-empty { font-size: 12px; color: #9ca3af; padding: 4px 0; }

.tm-fields { display: flex; flex-direction: column; gap: 10px; }
.tm-field { display: flex; flex-direction: column; gap: 4px; }
.tm-fk { display: flex; align-items: baseline; gap: 8px; }
.tm-fl { font-size: 12px; font-weight: 500; color: #374151; }
.tm-fvar {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px; color: #9ca3af;
}
.tm-fin { width: 100%; }

.tm-conds, .tm-rcps { display: flex; flex-direction: column; gap: 6px; }
.tm-cr {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 8px 10px; border-radius: 8px;
  background: #f8fafc; border: 1px solid #eef0f3;
}
.tm-cr.bad { background: #fef2f2; border-color: #fecaca; }
.tm-cr-ic { font-size: 13px; margin-top: 2px; }
.tm-cr-ic.ok { color: #10b981; }
.tm-cr-ic.no { color: #ef4444; }
.tm-cr-body { min-width: 0; flex: 1; }
.tm-cr-txt { font-size: 12px; color: #374151; line-height: 1.45; }
.tm-cr.bad .tm-cr-txt { color: #b91c1c; }
.tm-cr-act { margin-top: 2px; font-size: 11px; color: #9ca3af; }

.tm-rs {
  padding: 8px 10px; border-radius: 8px;
  background: #f8fafc; border: 1px solid #eef0f3;
}
.tm-rs.bad { background: #fffbeb; border-color: #fde68a; }
.tm-rs-top { display: flex; align-items: center; gap: 8px; }
.tm-rs-lab {
  font-size: 11px; color: #6b7280; background: #fff;
  border: 1px solid #e5e7eb; border-radius: 4px; padding: 0 6px; line-height: 20px;
}
.tm-rs-who { font-size: 13px; font-weight: 600; color: #111827; }
.tm-rs-who.empty { color: #dc2626; font-weight: 500; }
.tm-rs-how { margin-top: 3px; font-size: 11px; color: #9ca3af; line-height: 1.45; }
.tm-rs-err { color: #d97706; }

.tm-bottom {
  border: 1px solid #e8eaed;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}
.tm-btabs {
  display: flex; align-items: center; gap: 2px;
  padding: 8px 10px;
  background: #f8fafc;
  border-bottom: 1px solid #eef0f3;
}
.tm-btab {
  border: none; background: transparent; cursor: pointer;
  font-family: inherit; font-size: 13px; font-weight: 500;
  color: #6b7280; padding: 6px 12px; border-radius: 6px;
}
.tm-btab:hover { color: #1a6fff; background: #eff6ff; }
.tm-btab.on { color: #1a6fff; background: #eff6ff; font-weight: 600; }
.tm-ch-tabs { margin-left: auto; display: flex; gap: 4px; }
.tm-ch {
  border: 1px solid #e5e7eb; background: #fff; cursor: pointer;
  font-family: inherit; font-size: 12px; color: #6b7280;
  padding: 2px 10px; border-radius: 999px; line-height: 22px;
}
.tm-ch:hover { border-color: #1a6fff; color: #1a6fff; }
.tm-ch.on { border-color: #1a6fff; background: #1a6fff; color: #fff; }

.tm-preview { padding: 12px 14px 14px; }
.tm-pre {
  margin: 0; padding: 12px 14px;
  background: #f8fafc; border: 1px solid #eef0f3; border-radius: 8px;
  font-size: 13px; color: #374151; line-height: 1.75;
  white-space: pre-wrap; font-family: inherit;
  min-height: 88px; max-height: 160px; overflow-y: auto;
}
.tm-pre .miss { color: #dc2626; background: #fef2f2; border-radius: 2px; padding: 0 2px; }
.tm-pre-warn { margin: 8px 0 0; font-size: 12px; color: #dc2626; }

.tm-send { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 10px; }
.tm-send-warn {
  display: flex; align-items: flex-start; gap: 8px;
  font-size: 12px; color: #b45309; line-height: 1.5;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
  padding: 8px 12px;
}
.tm-send-row { display: flex; align-items: center; gap: 10px; }
.tm-send-lab { flex: none; width: 72px; font-size: 12px; color: #6b7280; }
.tm-send-in { flex: 1; min-width: 0; }
.tm-send-res {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; padding: 6px 10px; border-radius: 6px;
}
.tm-send-res.ok { color: #047857; background: #ecfdf5; }
.tm-send-res.fail { color: #b91c1c; background: #fef2f2; }

:deep(.test-modal .ant-modal-header) {
  padding: 14px 20px 10px;
  border-bottom: none;
  margin-bottom: 0;
}
:deep(.test-modal .ant-modal-close) { top: 14px; }

/* ---------- 事件详情抽屉 ---------- */
:deep(.ev-row) { cursor: pointer; }
:deep(.ev-row:hover) .ev-name { color: #1a6fff; }
:deep(.ev-row:hover) .ev-go { text-decoration: underline; }
.ev-name { color: #111827; }

.evd-title { display: flex; flex-direction: column; gap: 4px; }
.evd-title-main {
  display: flex; align-items: center; gap: 8px;
  font-size: 15px; font-weight: 600; color: #111827; line-height: 1.3;
}
.evd-code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px; font-weight: 400; color: #9ca3af;
}

.evd-body {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 16px;
  padding-bottom: 12px;
}

.evd-summary {
  background: #f9fafb; border: 1px solid #f0f1f3; border-radius: 8px;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;
}
.es-item { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; line-height: 1.5; }
.es-k { flex: none; width: 58px; color: #9ca3af; padding-top: 1px; }
.es-rules { display: flex; flex-wrap: wrap; gap: 6px 12px; }
.es-remark {
  margin: 0; padding-top: 8px; border-top: 1px dashed #eef0f3;
  font-size: 12px; color: #6b7280; line-height: 1.6;
}
.em-rule {
  color: #1a6fff; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 4px;
}
.em-rule:hover { text-decoration: underline; }

.evd-sec { display: flex; flex-direction: column; gap: 8px; }
.evd-sh {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: #111827;
}
.evd-sh--toggle { cursor: pointer; user-select: none; }
.evd-sh--toggle:hover { color: #1a6fff; }
.evd-tip { font-size: 12px; font-weight: 400; color: #9ca3af; }
.evd-toggle {
  margin-left: auto; display: inline-flex; align-items: center; gap: 3px;
  font-size: 12px; font-weight: 400; color: #6b7280;
}

.evd-fields { display: flex; flex-direction: column; gap: 8px; }
.evd-field {
  padding: 10px 12px; border: 1px solid #eef0f3; border-radius: 8px; background: #fff;
}
.ef-top { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.ef-label { font-size: 13px; font-weight: 500; color: #374151; }
.ef-desc { margin: 6px 0 0; font-size: 12px; color: #6b7280; line-height: 1.55; }
.ef-sample { margin-top: 6px; font-size: 12px; color: #9ca3af; }
.ef-sample-inline {
  margin-left: auto; font-size: 12px; color: #9ca3af;
  max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.evd-base-list {
  border: 1px solid #eef0f3; border-radius: 8px; overflow: hidden;
}
.evd-base-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px;
}
.evd-base-row:last-child { border-bottom: none; }

.evd-var {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px; color: #1a6fff; background: #f0f6ff;
  padding: 1px 5px; border-radius: 4px; flex: none;
}
.evd-type {
  font-size: 11px; line-height: 18px; padding: 0 5px; margin: 0;
  background: #f3f4f6; border-color: #e5e7eb; color: #6b7280;
}
.evd-type.enum { background: #fff7e6; border-color: #ffe0a3; color: #b45309; }
.evd-type.rcp { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
.evd-enum { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
.ev-val {
  display: inline-block; background: #f3f4f6; color: #6b7280;
  border-radius: 3px; padding: 0 5px; font-size: 12px;
}

.evd-rcps { display: flex; flex-wrap: wrap; gap: 6px; }
.evd-rcp {
  font-size: 12px; line-height: 22px; padding: 0 8px; margin: 0;
  background: #f9fafb; border-color: #e5e7eb; color: #374151; cursor: help;
}

.evd-foot {
  flex: none; display: flex; align-items: center; gap: 12px;
  margin: 0 -20px; padding: 12px 20px;
  background: #fff; border-top: 1px solid #f0f1f3;
}
.evd-foot-tip { flex: 1; font-size: 12px; color: #9ca3af; line-height: 1.4; }
</style>
