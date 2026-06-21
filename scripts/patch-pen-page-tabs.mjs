/**
 * 为 iFLY-FlowOS-坐席视角.pen 的 WorkspaceShell 补充动态 PageTabs 层
 * 对齐 flowos-prototype WorkspacePageTabs / AdminPageTabs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PEN = join(__dir, '../../iFLY-FlowOS-坐席视角.pen');

function uid(prefix) {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

function makePageTab(label, active = false) {
  const tabId = uid('pt');
  const textId = uid('tx');
  const closeId = uid('cl');
  const tab = {
    type: 'frame',
    id: tabId,
    name: active ? 'PageTab-active' : 'PageTab-inactive',
    width: 160,
    height: 32,
    cornerRadius: 8,
    gap: 8,
    padding: [0, 10, 0, 12],
    justifyContent: 'space_between',
    alignItems: 'center',
    children: [
      {
        type: 'text',
        id: textId,
        name: 'TabText',
        fill: active ? '#202124' : '#5F6368',
        textGrowth: 'fixed-width',
        width: 'fill_container',
        content: label,
        textAlign: 'left',
        fontFamily: 'Inter',
        fontSize: 13,
        fontWeight: active ? '500' : '400',
      },
      {
        type: 'text',
        id: closeId,
        name: 'CloseIcon',
        fill: '#5F636899',
        content: '×',
        fontFamily: 'Inter',
        fontSize: 14,
        fontWeight: 'normal',
      },
    ],
  };
  if (active) tab.fill = '#D3E3FD';
  return tab;
}

function makeTabsBar(tabs, barId = 'wsTabsBar') {
  return {
    type: 'frame',
    id: barId,
    name: 'PageTabs',
    width: 'fill_container',
    height: 40,
    fill: '#EEF1F6',
    gap: 6,
    padding: [0, 8],
    alignItems: 'center',
    children: tabs.map(({ label, active }) => makePageTab(label, active)),
  };
}

/** 默认：仅当前页一个 Tab */
const DEFAULT_TABS = [{ label: '工单工作台', active: true }];

/** 工单工作台：工作台 + 已打开工单 */
const WORKBENCH_TABS = [
  { label: '工单工作台', active: true },
  { label: '无线音乐播放跳过歌曲异常', active: false },
];

/** 工单处理：工作台 + 当前工单标题激活 */
const TICKET_OP_TABS = [
  { label: '工单工作台', active: false },
  { label: '无线音乐播放跳过歌曲异常', active: true },
  { label: '设备无法开机，指示灯不亮', active: false },
];

function wrapWorkspaceWithTabs(contentSlotNode, tabs = DEFAULT_TABS) {
  return {
    type: 'frame',
    id: contentSlotNode.id?.startsWith('SDSwv') ? 'SDSwv' : uid('ws'),
    name: 'Workspace',
    width: 'fill_container',
    height: 'fill_container',
    fill: '#F9FAFB',
    layout: 'vertical',
    children: [makeTabsBar(tabs), { ...contentSlotNode, name: 'ContentSlot' }],
  };
}

function patchWorkspaceShell(node) {
  if (node.id !== 'KK62J' || node.name !== 'WorkspaceShell') return;
  const body = node.children?.find((c) => c.name === 'Body');
  const workspace = body?.children?.find((c) => c.id === 'SDSwv' || c.name === 'Workspace');
  if (!workspace) return;
  const contentSlot = workspace.children?.find((c) => c.id === 'PYHKc' || c.name === 'ContentSlot');
  if (!contentSlot) return;
  if (workspace.children.some((c) => c.name === 'PageTabs' || c.id === 'wsTabsBar')) return;
  workspace.layout = 'vertical';
  workspace.children = [makeTabsBar([{ label: '[页面标题]', active: true }]), contentSlot];
}

function patchDescendantsSDSwv(descendants, tabs) {
  if (!descendants?.SDSwv) return;
  const s = descendants.SDSwv;
  // 已是 Workspace 容器且含 PageTabs
  if (s.name === 'Workspace' && s.children?.some((c) => c.name === 'PageTabs')) {
    const bar = s.children.find((c) => c.name === 'PageTabs');
    if (bar && tabs) bar.children = tabs.map(({ label, active }) => makePageTab(label, active));
    return;
  }
  // 被整页替换成 ContentSlot 或 children 仅 ContentSlot
  if (s.name === 'ContentSlot' || (s.children?.length === 1 && s.children[0].name === 'ContentSlot')) {
    const slot = s.name === 'ContentSlot' ? s : s.children[0];
    descendants.SDSwv = wrapWorkspaceWithTabs(slot, tabs);
    return;
  }
  if (s.children && !s.children.some((c) => c.name === 'PageTabs')) {
    const slotIdx = s.children.findIndex((c) => c.name === 'ContentSlot');
    const slot = slotIdx >= 0 ? s.children[slotIdx] : null;
    if (slot) {
      s.layout = 'vertical';
      s.name = 'Workspace';
      s.children = [makeTabsBar(tabs), slot];
    }
  }
}

function walk(node, ctx = {}) {
  if (!node || typeof node !== 'object') return;

  patchWorkspaceShell(node);

  if (node.type === 'ref' && node.ref === 'KK62J' && node.descendants) {
    let tabs = DEFAULT_TABS;
    const name = node.name || '';
    if (name.includes('工单处理') || name.includes('P-工单处理')) {
      tabs = TICKET_OP_TABS;
    } else if (name.includes('工单工作台') || node.id === 'SJpgc') {
      tabs = WORKBENCH_TABS;
    } else if (name.includes('首页') || name.includes('工作概览')) {
      tabs = [{ label: '个人门户', active: true }];
    } else if (name.includes('售后工作台')) {
      tabs = [{ label: '售后工作台', active: true }];
    } else if (name.includes('班组看板')) {
      tabs = [{ label: '班组看板', active: true }];
    }
    patchDescendantsSDSwv(node.descendants, tabs);
  }

  for (const key of ['children', 'descendants']) {
    if (Array.isArray(node[key])) node[key].forEach((c) => walk(c, ctx));
    else if (node[key] && typeof node[key] === 'object') {
      Object.values(node[key]).forEach((c) => walk(c, ctx));
    }
  }
}

function patchTexts(root) {
  const updates = {
    SCUfm: '组件库（坐席视角实际引用：WorkspaceShell · PageTabs · DeleteConfirm · Pagination）',
    wZKuA:
      '首页 / 工单工作台 / 售后工作台 / 班组看板 + 工单处理页 · 动态 PageTabs（全可关，工单 Tab 用工单标题）· 新建/删除工单弹窗',
    pbkuv:
      '两层模型：所有角色进同一「运行工作区」；侧栏导航 + 内容区顶部动态 PageTabs（对齐 Admin / main-navigation.html #pageTabs）',
  };
  function findText(n) {
    if (n?.type === 'text' && updates[n.id]) n.content = updates[n.id];
    n?.children?.forEach(findText);
  }
  findText(root);
}

function addPageTabsComponentRef(root) {
  const exists = JSON.stringify(root).includes('PageTabs-组件参考');
  if (exists) return;

  const refFrame = {
    type: 'frame',
    id: uid('PTref'),
    x: 0,
    y: -1180,
    name: 'PageTabs-组件参考',
    width: 1240,
    fill: '#F9FAFB',
    cornerRadius: 8,
    stroke: '#E5E7EB',
    strokeWidth: 1,
    layout: 'vertical',
    gap: 8,
    padding: 16,
    children: [
      {
        type: 'text',
        id: uid('n'),
        name: '参考说明',
        fill: '#6B7280',
        content: 'Page Tabs · #workspacePageTabs · 全动态可关闭 · 工单 Tab=工单标题 · 对齐 AdminPageTabs',
        fontFamily: 'Inter',
        fontSize: 12,
        fontWeight: 'normal',
      },
      makeTabsBar(WORKBENCH_TABS, uid('demo')),
    ],
  };

  const specNote = {
    type: 'note',
    id: uid('spec'),
    x: 0,
    y: -1080,
    width: 1240,
    height: 0,
    content:
      '【动态 PageTabs · 运行工作区】\n● 位置：WorkspaceShell 侧栏右侧、ContentSlot 上方（h40，bg #EEF1F6）\n● 规则：全动态 Tab，均可 × 关闭；侧栏点击已有页激活、否则新开；关完回默认页\n● 标题：菜单页=导航名；工单操作页=工单标题（非工单号）；列表页=「工单列表」\n● 样式：Chrome 胶囊 Tab · 宽 160 · 未选透明底 #5F6368 · 选中 #D3E3FD 底 #202124 字 · 圆角 8px · 右侧 ×\n● 实现：WorkspacePageTabs.vue + workspaceTabs store（与 Admin 一致）',
  };

  root.children.push(refFrame, specNote);
}

const raw = readFileSync(PEN, 'utf8');
const doc = JSON.parse(raw);
walk(doc);
patchTexts(doc);
addPageTabsComponentRef(doc);
writeFileSync(PEN, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
console.log('Patched:', PEN);
