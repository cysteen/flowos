<script setup lang="ts">
/**
 * 【815】消息通知 · 通知规则
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
  PlusOutlined, EditOutlined, DeleteOutlined, ExperimentOutlined,
  UserOutlined, ApartmentOutlined, PushpinOutlined,
  CheckCircleFilled, CloseCircleFilled, ArrowRightOutlined, QuestionCircleOutlined,
  DownOutlined, UpOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { stdPagination } from '@/config/adminUi';
import {
  NOTIFY_EVENTS, NOTIFY_RULES, RULE_TEMPLATES, SAMPLE_TICKETS,
  SUPERIOR_CHAIN, EVENT_SOURCE_META, COND_OP_LABEL,
  eventOf, recipientTypeOf, availableRecipients, recipientLabel, condLabel, templateVars, varsIn,
  isTemplateChannel, opsForType, optionsForField,
  type NotifyRule, type NotifyChannel, type RuleCondition, type RuleRecipient,
  type CondOp, type EventSource,
} from '@/mock/notifyRules';

const router = useRouter();
const CHANNELS: NotifyChannel[] = ['IM', '短信', '邮件', '站内信'];

const rules = ref<NotifyRule[]>(
  NOTIFY_RULES.map((r) => ({
    ...r,
    conditions: r.conditions.map((c) => ({ ...c, value: [...c.value] })),
    recipients: r.recipients.map((x) => ({ ...x })),
  })),
);

const tab = ref<'rules' | 'events'>('rules');

/* ---------------- 规则列表 ---------------- */
const fEvent = ref<string | undefined>(undefined);
const fAudience = ref<'all' | 'internal' | 'external'>('all');
const fChannel = ref<'all' | NotifyChannel>('all');

const eventFilterOptions = computed(() => [
  ...NOTIFY_EVENTS.filter((e) => rules.value.some((r) => r.event === e.code))
    .map((e) => ({ value: e.code, label: `${e.name}（${e.code}）` })),
]);

const rows = computed(() =>
  rules.value
    .filter((r) => !fEvent.value || r.event === fEvent.value)
    .filter((r) => fAudience.value === 'all' || r.audience === fAudience.value)
    .filter((r) => fChannel.value === 'all' || r.channels.includes(fChannel.value as NotifyChannel)),
);

const stat = computed(() => ({
  rule: rules.value.length,
  on: rules.value.filter((r) => r.enabled).length,
  event: NOTIFY_EVENTS.length,
  used: new Set(rules.value.map((r) => r.event)).size,
}));

function resetFilter() { fEvent.value = undefined; fAudience.value = 'all'; fChannel.value = 'all'; }

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
watch([fEvent, fAudience, fChannel], () => { rulePage.current = 1; });

/* ---------------- 事件目录 ---------------- */
const ruleCountOf = (code: string) => rules.value.filter((r) => r.event === code).length;
const eventGroups = computed(() =>
  (['dispatch', 'non-dispatch', 'approval', 'timer'] as EventSource[]).map((s) => ({
    source: s,
    meta: EVENT_SOURCE_META[s],
    items: NOTIFY_EVENTS.filter((e) => e.source === s),
  })),
);

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
  enabled: boolean; timerRule: string;
}>({
  name: '', event: '', audience: 'internal',
  conditions: [], recipients: [],
  channels: [], templates: {}, contents: {},
  enabled: true, timerRule: '',
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
    enabled: true, timerRule: '',
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
    enabled: r.enabled, timerRule: r.timerRule ?? '',
  });
  r.channels.forEach((ch) => initChannel(ch));
  resetChannelExpand(r.channels);
  editOpen.value = true;
}

const curEvent = computed(() => eventOf(form.event));
/** 事件负载 = 模板可用变量 */
const eventVars = computed(() => curEvent.value?.payload ?? []);
const recipientOptions = computed(() =>
  availableRecipients(form.event).map((t) => ({
    value: t.code,
    label: t.name,
    title: t.desc,
  })),
);

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
function onRecipientTypesChange(codes: string[]) {
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
/** 某通道内容里用到、但当前事件负载没有的变量 */
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
    enabled: form.enabled, timerRule: form.timerRule || undefined,
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
const testSample = ref(SAMPLE_TICKETS[0].id);
const sample = computed(() => SAMPLE_TICKETS.find((s) => s.id === testSample.value)!);

function openTest(r: NotifyRule) { testRule.value = r; testSample.value = SAMPLE_TICKETS[0].id; testOpen.value = true; }

function evalCond(c: RuleCondition) {
  const actual = sample.value.data[c.field];
  let pass = false;
  if (actual === undefined) pass = false;
  else if (c.op === 'eq') pass = actual === c.value[0];
  else if (c.op === 'ne') pass = actual !== c.value[0];
  else if (c.op === 'in') pass = c.value.includes(actual);
  else pass = !c.value.includes(actual);
  return { actual: actual ?? '（该样例无此字段）', pass };
}
const condResults = computed(() =>
  (testRule.value?.conditions ?? []).map((c) => ({ c, ...evalCond(c) })),
);
const hit = computed(() =>
  !!testRule.value?.enabled && condResults.value.every((r) => r.pass),
);

/** 收件人解析，并给出「怎么算出来的」 */
const resolved = computed(() => {
  if (!testRule.value) return [];
  const d = sample.value.data;
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
      how: `取事件负载字段 ${t.requires}`,
      ok: !!who,
      err: who ? '' : '样例工单无此字段，实际运行时可能解析为空',
    };
  });
});

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
  const d = sample.value.data;
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
        title="通知规则"
        subtitle="配置工单消息：订什么事件、发给谁、走哪条通道"
      >
        <template #actions>
          <a-button v-if="tab === 'rules'" type="primary" @click="openCreate">
            <template #icon><PlusOutlined /></template>新建规则
          </a-button>
        </template>
      </AdminPageHeader>

      <div class="stat-bar">
        <div class="st"><span class="st-n">{{ stat.rule }}</span><span class="st-l">通知规则</span></div>
        <div class="st"><span class="st-n on">{{ stat.on }}</span><span class="st-l">已启用</span></div>
        <div class="st"><span class="st-n">{{ stat.event }}</span><span class="st-l">可订阅事件</span></div>
        <div class="st"><span class="st-n">{{ stat.used }}</span><span class="st-l">已被订阅</span></div>
      </div>

      <div class="bar">
        <a-segmented
          v-model:value="tab"
          :options="[
            { value: 'rules', label: `通知规则（${stat.rule}）` },
            { value: 'events', label: `事件目录（${stat.event}）` },
          ]"
        />
        <a-tooltip v-if="tab === 'events'" title="事件目录由代码维护，新增事件需发版；已有事件加通知只需新建规则。">
          <QuestionCircleOutlined class="bar-help" />
        </a-tooltip>
      </div>

      <!-- ========== 规则列表 ========== -->
      <template v-if="tab === 'rules'">
        <div class="filter-row">
          <a-select
            v-model:value="fEvent"
            style="width: 240px"
            allow-clear
            placeholder="订阅事件"
            :options="eventFilterOptions"
          />
          <a-radio-group v-model:value="fAudience" button-style="solid" size="small">
            <a-radio-button value="all">全部</a-radio-button>
            <a-radio-button value="internal">对内</a-radio-button>
            <a-radio-button value="external">对客</a-radio-button>
          </a-radio-group>
          <a-radio-group v-model:value="fChannel" button-style="solid" size="small">
            <a-radio-button value="all">全通道</a-radio-button>
            <a-radio-button v-for="c in CHANNELS" :key="c" :value="c">{{ c }}</a-radio-button>
          </a-radio-group>
          <a-button type="link" class="fr-reset" @click="resetFilter">重置</a-button>
        </div>

        <a-table
          :columns="[
            { title: '规则', dataIndex: 'name', key: 'name', width: 250 },
            { title: '订阅事件', dataIndex: 'event', key: 'event', width: 220 },
            { title: '收件人', dataIndex: 'recipients', key: 'recipients', width: 210 },
            { title: '通道 / 模板', dataIndex: 'channels', key: 'channels' },
            { title: '启用', dataIndex: 'enabled', key: 'enabled', width: 68 },
            { title: '操作', key: 'op', width: 178 },
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
              <div v-if="record.timerRule" class="r-timer">{{ record.timerRule }}</div>
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
              <a-button type="link" size="small" @click="openEdit(record)"><template #icon><EditOutlined /></template>编辑</a-button>
              <a-button type="link" size="small" @click="openTest(record)"><template #icon><ExperimentOutlined /></template>测试</a-button>
              <a-button type="link" size="small" danger @click="delRule(record)"><template #icon><DeleteOutlined /></template></a-button>
            </template>
          </template>
        </a-table>
      </template>

      <!-- ========== 事件目录 ========== -->
      <template v-else>
        <div v-for="g in eventGroups" :key="g.source" class="ev-group">
          <div class="eg-head">
            <a-tag :color="g.meta.color">{{ g.meta.label }}</a-tag>
            <span class="eg-count">{{ g.items.length }}</span>
          </div>
          <a-table
            :columns="[
              { title: '事件', dataIndex: 'name', key: 'name', width: 240 },
              { title: '动作码', dataIndex: 'actionCode', key: 'actionCode', width: 160 },
              { title: '负载字段', dataIndex: 'payload', key: 'payload' },
              { title: '已挂规则', key: 'used', width: 90 },
            ]"
            :data-source="g.items"
            row-key="code"
            :pagination="false"
            size="middle"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <div class="r-ev">
                  <span>{{ record.name }}</span>
                  <span class="r-code">{{ record.code }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'actionCode'">
                <a-tooltip v-if="record.remark" :title="record.remark">
                  <span v-if="record.actionCode" class="act">{{ record.actionCode }}</span>
                  <span v-else class="no-act">—</span>
                </a-tooltip>
                <template v-else>
                  <span v-if="record.actionCode" class="act">{{ record.actionCode }}</span>
                  <span v-else class="no-act">—</span>
                </template>
              </template>
              <template v-else-if="column.key === 'payload'">
                <a-tooltip
                  v-for="p in record.payload" :key="p.key"
                  :title="`${p.label} · ${TYPE_LABEL[p.type ?? 'string']}`
                    + (p.enumValues ? '：' + p.enumValues.join(' / ') : '')
                    + (p.isRecipient ? ' · 可作收件人来源' : '')"
                >
                  <a-tag class="pl" :class="{ rcp: p.isRecipient, enum: p.type === 'enum' }">
                    {{ p.key }}
                  </a-tag>
                </a-tooltip>
              </template>
              <template v-else-if="column.key === 'used'">
                <span :class="ruleCountOf(record.code) ? 'used-n' : 'muted'">{{ ruleCountOf(record.code) }}</span>
              </template>
            </template>
          </a-table>
        </div>
      </template>
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
            <div v-if="curEvent?.source === 'timer'" class="fm-row fm-row--top">
              <span class="fm-k">执行规则</span>
              <div class="fm-v">
                <a-textarea
                  v-model:value="form.timerRule"
                  :rows="2"
                  placeholder="如：每日 08:00 扫描，提前 24h"
                />
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
              <div v-if="!form.conditions.length" class="blk-empty">事件发生即触发</div>
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
                <a-input
                  v-if="isFixed(r.type)" v-model:value="r.fixedValue"
                  style="flex: 1" placeholder="指定人员或岗位"
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
    <a-modal v-model:open="testOpen" :title="`规则测试 · ${testRule?.name ?? ''}`" :width="720" :footer="null">
      <div v-if="testRule" class="test-body">
        <div class="fm-row">
          <span class="fm-k">样例工单</span>
          <div class="fm-v">
            <a-select v-model:value="testSample" style="width: 100%"
              :options="SAMPLE_TICKETS.map((s) => ({ value: s.id, label: s.label }))" />
          </div>
        </div>

        <div class="verdict" :class="hit ? 'hit' : 'miss'">
          <CheckCircleFilled v-if="hit" /><CloseCircleFilled v-else />
          <span v-if="hit">命中，将向下列收件人发送</span>
          <span v-else-if="!testRule.enabled">不发送 —— 规则已停用</span>
          <span v-else>不发送 —— 触发条件未全部满足</span>
        </div>

        <!-- 条件判定 -->
        <div class="blk">
          <div class="blk-head">条件判定</div>
          <div v-if="!condResults.length" class="blk-empty">无条件，事件发生即触发</div>
          <div v-for="(r, i) in condResults" :key="i" class="cr-row" :class="{ bad: !r.pass }">
            <CheckCircleFilled v-if="r.pass" class="ic ok" /><CloseCircleFilled v-else class="ic no" />
            <span class="cr-txt">{{ condLabel(r.c, testRule.event) }}</span>
            <span class="cr-actual">实际值：{{ r.actual }}</span>
          </div>
        </div>

        <!-- 收件人溯源 -->
        <div class="blk">
          <div class="blk-head">收件人解析<span class="blk-tip">每个收件人是怎么算出来的</span></div>
          <div v-for="(r, i) in resolved" :key="i" class="rs-row" :class="{ bad: !r.ok }">
            <div class="rs-l">
              <a-tag>{{ r.label }}</a-tag>
              <span class="rs-who" :class="{ empty: !r.ok }">{{ r.who }}</span>
            </div>
            <div class="rs-how">{{ r.how }}<span v-if="r.err" class="rs-err"> · {{ r.err }}</span></div>
          </div>
        </div>

        <!-- 正文预览 -->
        <div v-for="ch in testRule.channels" :key="ch" class="tpl-blk">
          <div class="tb-head"><a-tag color="geekblue">{{ ch }}</a-tag>渲染结果</div>
          <pre class="tb-pre"><span v-for="(s, i) in renderTpl(ch)" :key="i" :class="{ miss: s.miss }">{{ s.text }}</span></pre>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
/* 视觉令牌统一走 docs/admin-ui-spec.md §0：
   主 #1a6fff / 成功 #10b981 / 危险 #ef4444 / 警告 #f59e0b
   文本 #111827 · #6b7280 · #9ca3af，边框 #e5e7eb，分隔 #f0f1f3

   字号只用两档（全页统一，不再出现 10/11px 碎档）：
   13px = 主文本 / 分区标题 / 表单 label；12px = 次要说明 / 表头 / 代码；
   例外仅 KPI 数字 20px 与行内 mini 标签 11px。
   字体全页统一继承 body（中英文同源），不使用等宽字体——编码类文本与中文混排时
   等宽字体的基线与字重差异会显得割裂。 */

/* ---- §4 页面框架：灰底 + 单一白面板，面板内首行为 AdminPageHeader ---- */
.notify-rules {
  min-height: 100%;
  padding: 16px 20px 20px;
  background: var(--flowos-content-bg, #f9fafb);
}
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 20px 24px 24px;
}
.panel :deep(.admin-page-header) {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f1f3;
}

/* ---- 概览指标条 ---- */
.stat-bar {
  display: flex; align-items: center; gap: 32px;
  background: #f9fafb; border: 1px solid #f0f1f3; border-radius: 8px;
  padding: 14px 18px; margin-bottom: 16px;
}
.st { display: flex; flex-direction: column; gap: 2px; }
.st-n { font-size: 20px; font-weight: 600; color: #111827; line-height: 1.3; letter-spacing: -0.02em; }
.st-n.on { color: #10b981; }
.st-l { font-size: 12px; color: #9ca3af; }

/* ---- 筛选条 / Tab ---- */
.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.bar-help { color: #9ca3af; font-size: 14px; cursor: help; }
.bar-help:hover { color: #1a6fff; }
.filter-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.fr-reset { margin-left: auto; padding: 0; }

/* ---- §3 表格 ---- */
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; font-weight: 600; }

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
.r-timer { font-size: 12px; color: #f59e0b; margin-top: 2px; }
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
.ev-group { margin-bottom: 20px; }
.ev-group:last-child { margin-bottom: 0; }
.eg-head {
  display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
}
.eg-count { margin-left: auto; font-size: 12px; color: #9ca3af; }
.act { font-size: 12px; color: #1a6fff; }
.no-act { font-size: 12px; color: #9ca3af; }
.pl.enum { border-style: dashed; }
.pl { font-size: 11px; line-height: 18px; padding: 0 6px; margin: 0 4px 4px 0; }
.pl.rcp { background: #eff6ff; border-color: #c7dbff; color: #1a6fff; }
.used-n { font-weight: 600; color: #10b981; }

/* ---- 编辑弹窗：三区块 ---- */
.edit-body, .test-body {
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

/* ---- 规则测试 ---- */
.verdict {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;
}
.verdict.hit { background: #ecfdf5; border: 1px solid #d1fae5; color: #10b981; }
.verdict.miss { background: #fef2f2; border: 1px solid #fecaca; color: #ef4444; }

.cr-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6b7280; line-height: 2; }
.cr-row .ic { font-size: 12px; }
.cr-row .ic.ok { color: #10b981; }
.cr-row .ic.no { color: #ef4444; }
.cr-actual { margin-left: auto; color: #9ca3af; font-size: 12px; }
.cr-row.bad .cr-txt { color: #ef4444; }

.rs-row { padding: 8px 0; border-bottom: 1px solid #f0f1f3; }
.rs-row:last-child { border-bottom: none; }
.rs-l { display: flex; align-items: center; gap: 8px; }
.rs-who { font-size: 13px; color: #111827; font-weight: 600; }
.rs-who.empty { color: #ef4444; font-weight: 400; }
.rs-how { font-size: 12px; color: #9ca3af; margin-top: 3px; }
.rs-err { color: #f59e0b; }
</style>
