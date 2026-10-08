<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import dayjs from 'dayjs';
import { useUserStore } from '@/stores/user';
import {
  PlusOutlined, ReloadOutlined, SearchOutlined,
  ImportOutlined, DownloadOutlined, InboxOutlined,
  UnorderedListOutlined, DownOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { stdPagination } from '@/config/adminUi';
import {
  PRODUCT_TREE_DATA, listProductNodes, productAncestors,
  productTitleByKey, type ProductTreeNode,
} from '@/mock/productTree';

const router = useRouter();
const userStore = useUserStore();
/** 删除入口（行删除 / 批量删除）仅管理员展示：三类管理员 scope 均算 */
const isAdmin = computed(() => !!userStore.role.adminScope);

/**
 * 产品的「业务类型」（老系统小结标签口径，导入匹配键之一）。
 * 产品树五级里没有这一维，按产品叶子单独映射；未映射的产品归「其他」。
 */
const PRODUCT_BIZ_TYPE: Record<string, string> = {
  'p-h1': '智能硬件', 'p-h2': '智能硬件', p1: '智能硬件', p2: '智能硬件', p3: '开放平台',
};

/** 产品叶子 → 各级归属（BGBU / 业务线 / 产品线 / 产品分类 / 业务类型），筛选、导入、导出共用 */
interface ProductInfo {
  key: string; name: string;
  bgbu: string; bizLine: string; prodLine: string; prodCat: string; bizType: string;
}
const PRODUCT_INFOS: ProductInfo[] = listProductNodes().map((p) => {
  const anc = productAncestors(p.key);
  const titleOf = (kind: ProductTreeNode['kind']) => anc.find((n) => n.kind === kind)?.title ?? '';
  return {
    key: p.key, name: p.title,
    bgbu: titleOf('BGBU'), bizLine: titleOf('业务线'), prodLine: titleOf('产品线'), prodCat: titleOf('产品分类'),
    bizType: PRODUCT_BIZ_TYPE[p.key] ?? '其他',
  };
});
const PRODUCT_INFO_MAP: Record<string, ProductInfo> = Object.fromEntries(PRODUCT_INFOS.map((p) => [p.key, p]));
function pinfo(productKey: string): ProductInfo {
  return PRODUCT_INFO_MAP[productKey] ?? {
    key: productKey, name: productKey, bgbu: '', bizLine: '', prodLine: '', prodCat: '', bizType: '其他',
  };
}

interface ProblemTagRow {
  key: string;
  productKey: string;
  productName: string;
  tagL1: string;
  tagL2: string;
  tagL3: string;
  /** 处理组；空串＝未配置（走流程兜底组），列表显示「—」 */
  team: string;
  aftersale: '是' | '否';
  /** 是否小结专用：是＝只供容联云小结使用，新建工单不可选 */
  summaryOnly: '是' | '否';
  status: '启用' | '停用';
  /** 问题分类一 / 二 / 三级 ID（老系统数字串；同产品同路径前缀共用同一 ID） */
  tagL1Id: string;
  tagL2Id: string;
  tagL3Id: string;
  /** 维护人 / 维护时间：任何写操作后刷新为操作人与操作时刻 */
  maintainer: string;
  maintainedAt: string;
}

/**
 * 筛选项排序（左→右）：
 * 第1行：维度（产品维度 | 组织维度）→ 级联（产品维度：业务类型/产品分类/产品名称；组织维度：BGBU/业务线/产品线）
 *        | 处理组 → 是否售后 → 是否小结专用 → 状态
 * 工具条：一级/二级分类（产品维度且级联选到产品名称才出现）→ 分类名称搜索 → 查询/重置/批量/导出
 */
type ScopeDim = 'product' | 'org';
const emptyFilter = () => ({
  dim: 'product' as ScopeDim,
  /** 级联已选路径：按产品＝[业务类型, 产品分类, 产品 key]；按组织＝[BGBU, 业务线, 产品线]；可停在任一级 */
  scopePath: [] as string[],
  tagL1: undefined as string | undefined,
  tagL2: undefined as string | undefined,
  tagKeyword: '',
  team: undefined as string | undefined,
  aftersale: undefined as string | undefined,
  summaryOnly: undefined as string | undefined,
  status: undefined as string | undefined,
});
const draftFilter = reactive(emptyFilter());
const appliedFilter = reactive(emptyFilter());

const TAG_L1 = ['云空间', '我的文件', '相机', '网络', '账号/密码', '整机/设备', '语音翻译', '会议/会话翻译', '屏幕', '记录导出', '售后', '蓝牙', '设置/系统'];
const TAG_L2_MAP: Record<string, string[]> = {
  '云空间': ['操作指导', '功能介绍', '软件问题'],
  '我的文件': ['功能介绍', '软件问题'],
  '相机': ['功能介绍'],
  '网络': ['功能介绍'],
  '账号/密码': ['操作指导'],
  '整机/设备': ['功能介绍', '信息咨询'],
  '语音翻译': ['操作指导', '软件问题'],
  '会议/会话翻译': ['软件问题'],
  '屏幕': ['功能异常'],
  '记录导出': ['操作指导'],
  '售后': ['服务申请', '政策咨询', '问题反馈'],
  '蓝牙': ['操作指导'],
  '设置/系统': ['软件问题'],
};
const TAG_L3_MAP: Record<string, string[]> = {
  '操作指导': ['如何领取/升级云空间', '如何退出/切换账号', '如何上传/查看/编辑/下载/删除文件', '如何切换男声女声', '如何导出翻译记录', '如何断开连接'],
  '功能介绍': ['云空间存储大小咨询', '文件名称是否支持添加符号', '视频是否支持实时字幕', '是否支持修改IP地址', '文件已上传云空间是否支持直接转写', '导出格式咨询', '录音笔IP地址咨询'],
  '软件问题': ['邮件分享失败', '无法领取云空间', '文件日期/时间显示异常', '翻译结果没有语音播报', '翻译延迟/卡顿/反应慢', '翻译失败(服务准备中,请稍等)', '无法切换翻译识别模式', '加载失败/打不开/闪退'],
  '功能异常': ['显示内容异常(图标/乱码/字体/方向等)'],
  '服务申请': ['维修请求'],
  '政策咨询': ['退换货政策'],
  '信息咨询': ['设备丢失'],
  '问题反馈': ['设备维修后故障仍存在'],
};
const TEAMS = ['工单-处理', '工单-售后', '工单-二线'];

/** 维度 → 级联三层对应的产品归属字段（按产品末级用产品 key，保证同名产品不串） */
const SCOPE_FIELDS: Record<ScopeDim, [keyof ProductInfo, keyof ProductInfo, keyof ProductInfo]> = {
  product: ['bizType', 'prodCat', 'key'],
  org: ['bgbu', 'bizLine', 'prodLine'],
};
const DIM_OPTIONS = [
  { label: '产品维度', value: 'product' },
  { label: '组织维度', value: 'org' },
];
const SCOPE_PLACEHOLDER: Record<ScopeDim, string> = { product: '请选择产品', org: '请选择组织' };

interface ScopeOption { value: string; label: string; children?: ScopeOption[] }
/** 由产品归属拼三层级联：按产品＝业务类型/产品分类/产品名称；按组织＝BGBU/业务线/产品线 */
function buildScopeOptions(dim: ScopeDim): ScopeOption[] {
  const [f1, f2, f3] = SCOPE_FIELDS[dim];
  const root: ScopeOption[] = [];
  const child = (list: ScopeOption[], value: string, label: string) => {
    let hit = list.find((o) => o.value === value);
    if (!hit) { hit = { value, label }; list.push(hit); }
    return hit;
  };
  for (const p of PRODUCT_INFOS) {
    if (!p[f1] || !p[f2] || !p[f3]) continue;
    const n1 = child(root, p[f1], p[f1]);
    const n2 = child((n1.children ??= []), p[f2], p[f2]);
    child((n2.children ??= []), p[f3], f3 === 'key' ? p.name : p[f3]);
  }
  return root;
}
const SCOPE_OPTIONS: Record<ScopeDim, ScopeOption[]> = {
  product: buildScopeOptions('product'),
  org: buildScopeOptions('org'),
};
/** 级联路径搜索：任一级名称包含关键字即列出整条路径，不区分大小写 */
const scopeShowSearch = {
  filter: (input: string, path: { label?: unknown }[]) => {
    const kw = input.trim().toLowerCase();
    return path.some((o) => String(o.label ?? '').toLowerCase().includes(kw));
  },
};

function onScopeChange(v: unknown) {
  draftFilter.scopePath = Array.isArray(v) ? v.map(String) : [];
}

function scopeMatches(p: ProductInfo, dim: ScopeDim, path: string[]) {
  const fields = SCOPE_FIELDS[dim];
  return path.every((v, i) => p[fields[i]] === v);
}
const toOpts = (items: string[]) => items.map((v) => ({ value: v, label: v }));
/** 下拉输入搜索：按选项文字包含匹配，不区分大小写 */
const filterByLabel = (input: string, option?: { label?: string }) =>
  String(option?.label ?? '').toLowerCase().includes(input.trim().toLowerCase());
const filterByValue = (input: string, option?: { value?: string }) =>
  String(option?.value ?? '').includes(input);

/** 弹窗「所属产品」：五级产品树（仅叶子「产品」可选），支持逐级下钻 + 任意节点搜索 */
interface ProductTreeSelectNode {
  key: string; value: string; title: string; selectable: boolean;
  children?: ProductTreeSelectNode[];
}
function toSelectableTree(nodes: ProductTreeNode[]): ProductTreeSelectNode[] {
  return nodes.map((n) => ({
    key: n.key,
    value: n.key,
    title: n.title,
    selectable: n.kind === '产品',
    children: n.children?.length ? toSelectableTree(n.children) : undefined,
  }));
}
const productTreeSelectData = computed(() => toSelectableTree(PRODUCT_TREE_DATA));

/** 产品 key → 从根到叶的完整路径（事业部/业务线/产品线/产品分类/产品），用于选中后回显前面各级节点 */
const PRODUCT_PATH: Record<string, string[]> = {};
(function buildProductPaths(nodes: ProductTreeNode[], anc: string[]) {
  for (const n of nodes) {
    const cur = [...anc, n.title];
    if (n.kind === '产品') PRODUCT_PATH[n.key] = cur;
    if (n.children?.length) buildProductPaths(n.children, cur);
  }
})(PRODUCT_TREE_DATA, []);
function productPath(key?: string): string[] {
  return key ? (PRODUCT_PATH[key] ?? []) : [];
}

/** 切换维度时清空级联已选值，两套维度不同时生效 */
watch(
  () => draftFilter.dim,
  () => { draftFilter.scopePath = []; },
);

/**
 * 种子行：产品 key · 一/二/三级 · 处理组（空＝未配置）· 是否售后 · 是否小结专用 · 状态
 * · 一/二/三级 ID · 维护人 · 维护时间
 */
type SeedTuple = [
  string, string, string, string, string, '是' | '否', '是' | '否', '启用' | '停用',
  string, string, string, string, string,
];
const SEED_ROWS: SeedTuple[] = [
  ['p-h1', '云空间', '操作指导', '如何领取/升级云空间', '工单-处理', '否', '否', '启用', '110201', '2104011', '31060101', '孙系统', '2026-09-08 10:12:05'],
  ['p-h1', '云空间', '功能介绍', '云空间存储大小咨询', '工单-处理', '否', '是', '启用', '110201', '2104012', '31060102', '周运营', '2026-09-26 15:40:31'],
  ['p-h1', '我的文件', '功能介绍', '文件名称是否支持添加符号', '工单-处理', '否', '否', '启用', '110202', '2104013', '31060103', '孙系统', '2026-09-08 10:12:05'],
  ['p-h1', '我的文件', '软件问题', '邮件分享失败', '工单-处理', '否', '否', '启用', '110202', '2104014', '31060104', '孙系统', '2026-09-08 10:12:05'],
  ['p-h1', '相机', '功能介绍', '视频是否支持实时字幕', '工单-处理', '否', '否', '启用', '110203', '2104015', '31060105', '赵管理', '2026-09-15 09:31:47'],
  ['p-h1', '网络', '功能介绍', '是否支持修改IP地址', '工单-处理', '否', '否', '启用', '110204', '2104016', '31060106', '孙系统', '2026-09-08 10:12:05'],
  ['p-h1', '账号/密码', '操作指导', '如何退出/切换账号', '工单-处理', '否', '否', '启用', '110205', '2104017', '31060107', '周运营', '2026-10-06 11:05:12'],
  ['p-h2', '云空间', '操作指导', '如何上传/查看/编辑/下载/删除文件', '工单-处理', '否', '否', '启用', '110211', '2104021', '31060201', '孙系统', '2026-09-09 14:22:38'],
  ['p-h2', '云空间', '软件问题', '无法领取云空间', '工单-处理', '否', '否', '启用', '110211', '2104022', '31060202', '孙系统', '2026-09-09 14:22:38'],
  ['p-h2', '我的文件', '功能介绍', '文件已上传云空间是否支持直接转写', '工单-处理', '否', '否', '启用', '110212', '2104024', '31060203', '赵管理', '2026-09-18 16:48:09'],
  ['p-h2', '我的文件', '软件问题', '文件日期/时间显示异常', '工单-处理', '否', '否', '启用', '110212', '2104025', '31060204', '孙系统', '2026-09-09 14:22:38'],
  ['p-h2', '云空间', '功能介绍', '导出格式咨询', '', '否', '否', '启用', '110211', '2104023', '31060205', '周运营', '2026-09-29 10:03:56'],
  ['p-h2', '整机/设备', '功能介绍', '录音笔IP地址咨询', '工单-处理', '否', '是', '停用', '110213', '2104026', '31060206', '周运营', '2026-10-07 17:26:20'],
  ['p1', '语音翻译', '操作指导', '如何切换男声女声', '工单-处理', '否', '否', '启用', '110221', '2104031', '31060301', '孙系统', '2026-09-10 09:15:44'],
  ['p1', '语音翻译', '软件问题', '翻译结果没有语音播报', '工单-处理', '否', '否', '启用', '110221', '2104032', '31060302', '孙系统', '2026-09-10 09:15:44'],
  ['p1', '会议/会话翻译', '软件问题', '翻译延迟/卡顿/反应慢', '工单-处理', '否', '否', '启用', '110222', '2104033', '31060303', '赵管理', '2026-09-22 13:37:02'],
  ['p1', '屏幕', '功能异常', '显示内容异常(图标/乱码/字体/方向等)', '工单-处理', '否', '否', '启用', '110223', '2104034', '31060304', '孙系统', '2026-09-10 09:15:44'],
  ['p1', '记录导出', '操作指导', '如何导出翻译记录', '工单-处理', '否', '否', '启用', '110224', '2104035', '31060305', '孙系统', '2026-09-10 09:15:44'],
  ['p1', '售后', '服务申请', '维修请求', '工单-售后', '是', '否', '启用', '110225', '2104036', '31060306', '周运营', '2026-09-30 15:58:27'],
  ['p1', '售后', '政策咨询', '退换货政策', '工单-售后', '是', '否', '启用', '110225', '2104037', '31060307', '周运营', '2026-09-30 15:58:27'],
  ['p2', '会议/会话翻译', '软件问题', '翻译失败(服务准备中,请稍等)', '工单-处理', '否', '否', '启用', '110231', '2104041', '31060401', '孙系统', '2026-09-11 11:20:13'],
  ['p2', '会议/会话翻译', '软件问题', '无法切换翻译识别模式', '工单-处理', '否', '否', '启用', '110231', '2104041', '31060402', '孙系统', '2026-09-11 11:20:13'],
  ['p2', '语音翻译', '软件问题', '翻译结果没有语音播报', '工单-处理', '否', '否', '启用', '110232', '2104042', '31060403', '赵管理', '2026-09-24 10:44:51'],
  ['p2', '蓝牙', '操作指导', '如何断开连接', '工单-处理', '否', '否', '启用', '110233', '2104043', '31060404', '孙系统', '2026-09-11 11:20:13'],
  ['p2', '整机/设备', '信息咨询', '设备丢失', '', '否', '是', '启用', '110234', '2104044', '31060405', '周运营', '2026-10-02 09:52:36'],
  ['p2', '售后', '问题反馈', '设备维修后故障仍存在', '工单-售后', '是', '否', '停用', '110235', '2104045', '31060406', '赵管理', '2026-10-05 14:09:18'],
  ['p3', '账号/密码', '操作指导', '如何退出/切换账号', '工单-二线', '否', '否', '启用', '110241', '2104051', '31060501', '孙系统', '2026-09-12 16:30:40'],
  ['p3', '网络', '功能介绍', '是否支持修改IP地址', '工单-二线', '否', '否', '启用', '110242', '2104052', '31060502', '孙系统', '2026-09-12 16:30:40'],
  ['p3', '设置/系统', '软件问题', '加载失败/打不开/闪退', '工单-二线', '否', '否', '启用', '110243', '2104053', '31060503', '赵管理', '2026-09-25 11:18:24'],
];

const allRows = ref<ProblemTagRow[]>(SEED_ROWS.map((t, i) => {
  const [productKey, tagL1, tagL2, tagL3, team, aftersale, summaryOnly, status, tagL1Id, tagL2Id, tagL3Id, maintainer, maintainedAt] = t;
  return {
    key: String(i + 1),
    productKey,
    productName: productTitleByKey(productKey),
    tagL1, tagL2, tagL3, team, aftersale, summaryOnly, status,
    tagL1Id, tagL2Id, tagL3Id, maintainer, maintainedAt,
  };
}));
let rowSeq = allRows.value.length + 1;

/** 写操作留痕：操作人取当前登录用户，时刻精确到秒 */
function stampNow() {
  return { maintainer: userStore.name, maintainedAt: dayjs().format('YYYY-MM-DD HH:mm:ss') };
}

type TagLevel = 1 | 2 | 3;
const ID_FIELD: Record<TagLevel, 'tagL1Id' | 'tagL2Id' | 'tagL3Id'> = { 1: 'tagL1Id', 2: 'tagL2Id', 3: 'tagL3Id' };

/** 分类节点键：产品 + 路径前缀（一级 ID 归「产品+一级」，二级归「产品+一级+二级」，三级归整条路径） */
function nodeKeyOf(productKey: string, path: string[], level: TagLevel) {
  return [productKey, ...path.slice(0, level)].join('\u0001');
}

/** 某层级下 ID → 节点键（rows 外再叠加 extra，用于导入时文件内已登记的 ID） */
function idOwners(level: TagLevel, rows: ProblemTagRow[]) {
  const map = new Map<string, string>();
  for (const r of rows) {
    const id = r[ID_FIELD[level]];
    if (id) map.set(id, nodeKeyOf(r.productKey, [r.tagL1, r.tagL2, r.tagL3], level));
  }
  return map;
}

/**
 * 给一条路径定一 / 二 / 三级 ID：已存在的节点沿用原 ID；新节点用传入的老系统 ID，未传则取该层最大值 + 1。
 * exceptKey：编辑时排除自身那一行。
 */
function resolveTagIds(
  productKey: string, path: [string, string, string],
  provided: Partial<Record<TagLevel, string>> = {}, exceptKey?: string,
) {
  const rows = allRows.value.filter((r) => r.key !== exceptKey);
  const out = {} as Record<'tagL1Id' | 'tagL2Id' | 'tagL3Id', string>;
  for (const level of [1, 2, 3] as TagLevel[]) {
    const field = ID_FIELD[level];
    const nk = nodeKeyOf(productKey, path, level);
    const hit = level < 3
      ? rows.find((r) => nodeKeyOf(r.productKey, [r.tagL1, r.tagL2, r.tagL3], level) === nk && r[field])
      : undefined;
    if (hit) { out[field] = hit[field]; continue; }
    if (provided[level]) { out[field] = provided[level]!; continue; }
    const max = rows.reduce((m, r) => Math.max(m, Number(r[field]) || 0), 0);
    out[field] = String(max + 1);
  }
  return out;
}

/** 按产品维度且级联选到产品名称时，才展示一级/二级分类筛选 */
const scopedProductKey = computed(() =>
  (draftFilter.dim === 'product' && draftFilter.scopePath.length === 3 ? draftFilter.scopePath[2] : undefined),
);
const showTagLevelFilters = computed(() => !!scopedProductKey.value);

/** 一/二级选项数据源：所选产品下已有分类（与列表同行数据同源） */
const productScopedRows = computed(() => {
  const key = scopedProductKey.value;
  if (!key) return [];
  return allRows.value.filter((r) => r.productKey === key);
});

const filterTagL1Opts = computed(() => {
  const set = new Set(productScopedRows.value.map((r) => r.tagL1).filter(Boolean));
  return [...set].sort().map((v) => ({ value: v, label: v }));
});

const filterTagL2Opts = computed(() => {
  const rows = draftFilter.tagL1
    ? productScopedRows.value.filter((r) => r.tagL1 === draftFilter.tagL1)
    : productScopedRows.value;
  const set = new Set(rows.map((r) => r.tagL2).filter(Boolean));
  return [...set].sort().map((v) => ({ value: v, label: v }));
});

watch(
  () => scopedProductKey.value,
  () => {
    draftFilter.tagL1 = undefined;
    draftFilter.tagL2 = undefined;
  },
);

watch(
  () => draftFilter.tagL1,
  () => { draftFilter.tagL2 = undefined; },
);

function matchSelect(val: string | undefined, field: string) {
  return !val || field === val;
}

function matchTagKeyword(keyword: string, row: ProblemTagRow) {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  const hay = `${row.tagL1} ${row.tagL2} ${row.tagL3} ${row.tagL1}/${row.tagL2}/${row.tagL3}`.toLowerCase();
  return hay.includes(kw);
}

const displayRows = computed(() => allRows.value.filter((r) => {
  if (!scopeMatches(pinfo(r.productKey), appliedFilter.dim, appliedFilter.scopePath)) return false;
  if (!matchSelect(appliedFilter.tagL1, r.tagL1)) return false;
  if (!matchSelect(appliedFilter.tagL2, r.tagL2)) return false;
  if (!matchTagKeyword(appliedFilter.tagKeyword, r)) return false;
  if (!matchSelect(appliedFilter.team, r.team)) return false;
  if (!matchSelect(appliedFilter.aftersale, r.aftersale)) return false;
  if (!matchSelect(appliedFilter.summaryOnly, r.summaryOnly)) return false;
  if (!matchSelect(appliedFilter.status, r.status)) return false;
  return true;
}));

const cols = [
  { title: '产品名称', dataIndex: 'productName', key: 'productName', width: 180 },
  { title: '问题分类一级', dataIndex: 'tagL1', key: 'tagL1', width: 120, ellipsis: true },
  { title: '问题分类二级', dataIndex: 'tagL2', key: 'tagL2', width: 110, ellipsis: true },
  { title: '问题分类三级', dataIndex: 'tagL3', key: 'tagL3', width: 240, ellipsis: true },
  { title: '处理组', dataIndex: 'team', key: 'team', width: 110 },
  { title: '是否售后', dataIndex: 'aftersale', key: 'aftersale', width: 86 },
  { title: '是否小结专用', dataIndex: 'summaryOnly', key: 'summaryOnly', width: 110 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '维护人', dataIndex: 'maintainer', key: 'maintainer', width: 90 },
  { title: '维护时间', dataIndex: 'maintainedAt', key: 'maintainedAt', width: 150 },
  { title: '操作', key: 'op', width: 110, fixed: 'right' as const, align: 'right' as const, className: 'col-op' },
];

const pagination = computed(() => stdPagination({
  pageSize: 20,
  total: displayRows.value.length,
  hideOnSinglePage: false,
  showQuickJumper: true,
}));

const checkedRowKeys = ref<string[]>([]);
function clearSelection() {
  checkedRowKeys.value = [];
}
/** 选择全部筛选结果：勾选当前生效条件下全部行（跨页）；之后手动增减任一行即为普通勾选 */
function selectAllFiltered() {
  checkedRowKeys.value = displayRows.value.map((r) => r.key);
}
const rowSelection = computed(() => ({
  selectedRowKeys: checkedRowKeys.value,
  onChange: (keys: (string | number)[]) => { checkedRowKeys.value = keys as string[]; },
  selections: [
    {
      key: 'page',
      text: '选择当前页',
      onSelect: (pageKeys: (string | number)[]) => { checkedRowKeys.value = [...(pageKeys as string[])]; },
    },
    { key: 'filtered', text: '选择全部筛选结果', onSelect: selectAllFiltered },
    { key: 'none', text: '清空选择', onSelect: clearSelection },
  ],
}));
/** 筛选条件变动即清空选择 */
watch(() => JSON.stringify(draftFilter), clearSelection);
const hasRowSelection = computed(() => checkedRowKeys.value.length > 0);
const batchOpen = ref(false);
const batchTeamOpen = ref(false);
const batchTeamValue = ref<string | undefined>(undefined);

function onBatch(action: string) {
  if (!checkedRowKeys.value.length) return;
  batchOpen.value = false;
  if (action === '处理组') openBatchTeam();
  else if (action === '启用') batchSetStatus('启用');
  else if (action === '停用') batchSetStatus('停用');
  else if (action === '删除' && isAdmin.value) batchDelete();
}

function openBatchTeam() {
  batchTeamValue.value = undefined;
  batchTeamOpen.value = true;
}

function confirmBatchTeam() {
  if (!batchTeamValue.value) {
    message.warning('请选择处理组');
    return;
  }
  const keys = new Set(checkedRowKeys.value);
  const team = batchTeamValue.value;
  const stamp = stampNow();
  let n = 0;
  for (const r of allRows.value) {
    if (keys.has(r.key)) {
      r.team = team;
      Object.assign(r, stamp);
      n += 1;
    }
  }
  batchTeamOpen.value = false;
  clearSelection();
  message.success(`已将 ${n} 条的处理组更新为「${team}」`);
}

function batchSetStatus(status: '启用' | '停用') {
  const keys = [...checkedRowKeys.value];
  const isEnable = status === '启用';
  Modal.confirm({
    title: isEnable ? '批量启用问题分类' : '批量停用问题分类',
    content: isEnable
      ? `确认启用已选 ${keys.length} 条问题分类？启用后新建工单可再次选择。`
      : `确认停用已选 ${keys.length} 条问题分类？停用后新建工单不可再选，历史工单归类保留。`,
    okText: isEnable ? '确认启用' : '确认停用',
    cancelText: '取消',
    onOk: () => {
      const keySet = new Set(keys);
      const stamp = stampNow();
      for (const r of allRows.value) {
        // 已是目标状态的条不写入，维护人 / 维护时间不刷新（仍计入成功条数）
        if (keySet.has(r.key) && r.status !== status) {
          r.status = status;
          Object.assign(r, stamp);
        }
      }
      clearSelection();
      message.success(`已${status} ${keys.length} 条`);
    },
  });
}

function batchDelete() {
  const keys = [...checkedRowKeys.value];
  Modal.confirm({
    title: '批量删除问题分类',
    content: `确认删除已选 ${keys.length} 条问题分类？删除后新建工单不可再选。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      allRows.value = allRows.value.filter((r) => !keys.includes(r.key));
      clearSelection();
      message.success(`已删除 ${keys.length} 条`);
    },
  });
}

function onQuery() {
  Object.assign(appliedFilter, { ...draftFilter, scopePath: [...draftFilter.scopePath] });
  clearSelection();
  message.success(`查询完成，共 ${displayRows.value.length} 条`);
}
function onReset() {
  Object.assign(draftFilter, emptyFilter());
  Object.assign(appliedFilter, emptyFilter());
  clearSelection();
}

const formLabelCol = { flex: '88px' };
const formWrapperCol = { flex: '1' };

function tagPath(row: ProblemTagRow) {
  return `${row.tagL1} / ${row.tagL2} / ${row.tagL3}`;
}

// —— 新增 / 编辑 ——
const formOpen = ref(false);
const editingKey = ref<string | null>(null);

/** 业务类型 / 产品分类 / 产品名称只读引用产品树；搜不到时引导去产品管理新增 */
function goProductManage() {
  formOpen.value = false;
  router.push({ name: 'admin-products' });
}

const tagL1List = ref([...TAG_L1]);
const tagL2Map = ref<Record<string, string[]>>({ ...TAG_L2_MAP });
const tagL3Map = ref<Record<string, string[]>>({ ...TAG_L3_MAP });

const form = reactive({
  productKey: undefined as string | undefined,
  tagL1: '',
  tagL2: '',
  tagL3: '',
  team: undefined as string | undefined,
  aftersale: '否' as '是' | '否',
  summaryOnly: '否' as '是' | '否',
  status: '启用' as '启用' | '停用',
});

function mergeTagOpts(known: string[], fromRows: string[]) {
  return [...new Set([...known, ...fromRows])].map((v) => ({ value: v }));
}

const formTagL1Opts = computed(() => {
  const fromRows = form.productKey
    ? [...new Set(allRows.value.filter((r) => r.productKey === form.productKey).map((r) => r.tagL1))]
    : [];
  return mergeTagOpts(tagL1List.value, fromRows);
});

const formTagL2Opts = computed(() => {
  if (!form.tagL1) return [];
  const fromRows = form.productKey
    ? [...new Set(allRows.value.filter((r) => r.productKey === form.productKey && r.tagL1 === form.tagL1).map((r) => r.tagL2))]
    : [];
  return mergeTagOpts(tagL2Map.value[form.tagL1] ?? [], fromRows);
});

const formTagL3Opts = computed(() => {
  if (!form.tagL2) return [];
  const fromRows = form.productKey
    ? [...new Set(allRows.value.filter((r) =>
      r.productKey === form.productKey && r.tagL1 === form.tagL1 && r.tagL2 === form.tagL2,
    ).map((r) => r.tagL3))]
    : [];
  return mergeTagOpts(tagL3Map.value[form.tagL2] ?? [], fromRows);
});

/** 编辑回填整条路径时不触发「改上级清空下级」 */
let hydratingForm = false;
watch(() => form.tagL1, () => {
  if (hydratingForm) return;
  form.tagL2 = '';
  form.tagL3 = '';
});
watch(() => form.tagL2, () => { if (!hydratingForm) form.tagL3 = ''; });

function ensureTagOption(list: string[], val: string) {
  const v = val.trim();
  if (v && !list.includes(v)) list.push(v);
  return v;
}

function resetForm() {
  Object.assign(form, {
    productKey: undefined,
    tagL1: '', tagL2: '', tagL3: '',
    team: undefined, aftersale: '否', summaryOnly: '否', status: '启用',
  });
}

function openAdd() {
  editingKey.value = null;
  resetForm();
  formOpen.value = true;
}

function openEditRow(row: ProblemTagRow) {
  editingKey.value = row.key;
  hydratingForm = true;
  nextTick(() => { hydratingForm = false; });
  Object.assign(form, {
    productKey: row.productKey,
    tagL1: row.tagL1, tagL2: row.tagL2, tagL3: row.tagL3,
    team: row.team || undefined, aftersale: row.aftersale, summaryOnly: row.summaryOnly, status: row.status,
  });
  formOpen.value = true;
}

function saveForm() {
  const tagL1 = form.tagL1.trim();
  const tagL2 = form.tagL2.trim();
  const tagL3 = form.tagL3.trim();
  if (!form.productKey || !tagL1 || !tagL2 || !tagL3) {
    message.error('请完整填写所属产品与三级分类');
    return;
  }
  ensureTagOption(tagL1List.value, tagL1);
  if (!tagL2Map.value[tagL1]) tagL2Map.value[tagL1] = [];
  ensureTagOption(tagL2Map.value[tagL1], tagL2);
  if (!tagL3Map.value[tagL2]) tagL3Map.value[tagL2] = [];
  ensureTagOption(tagL3Map.value[tagL2], tagL3);

  const payload: ProblemTagRow = {
    key: editingKey.value ?? String(rowSeq++),
    productKey: form.productKey,
    productName: productTitleByKey(form.productKey),
    tagL1, tagL2, tagL3,
    team: form.team ?? '',
    aftersale: form.aftersale,
    summaryOnly: form.summaryOnly,
    status: form.status,
    ...resolveTagIds(form.productKey, [tagL1, tagL2, tagL3], {}, editingKey.value ?? undefined),
    ...stampNow(),
  };
  if (editingKey.value) {
    const prev = allRows.value.find((r) => r.key === editingKey.value);
    if (prev) payload.tagL3Id = prev.tagL3Id;
  }
  if (editingKey.value) {
    const i = allRows.value.findIndex((r) => r.key === editingKey.value);
    if (i >= 0) allRows.value[i] = payload;
    message.success('问题分类已更新');
  } else {
    const dup = allRows.value.some((r) =>
      r.productKey === payload.productKey
      && r.tagL1 === payload.tagL1 && r.tagL2 === payload.tagL2 && r.tagL3 === payload.tagL3,
    );
    if (dup) { message.error('同一产品下该分类路径已存在'); return; }
    allRows.value.unshift(payload);
    message.success('问题分类已新增');
  }
  formOpen.value = false;
}

function onListStatusChange(row: ProblemTagRow, checked: boolean) {
  row.status = checked ? '启用' : '停用';
  Object.assign(row, stampNow());
  message.success(checked ? '已启用' : '已停用');
}

// —— 删除：仅删除三级（叶子）分类；父级被删空时自动级联上收 ——
const delOpen = ref(false);
const delTarget = ref<ProblemTagRow | null>(null);

/**
 * 连带删除的上级：该条删掉后，同产品下二级 / 一级若不再有分类，会一起删掉。
 * 返回会被连带删掉的上级名称列表（依序：二级、一级），供弹窗提醒与成功提示。
 */
const delCascade = computed(() => {
  const row = delTarget.value;
  if (!row) return [];
  const sib = allRows.value.filter((r) => r.productKey === row.productKey);
  const l2Last = sib.filter((r) => r.tagL1 === row.tagL1 && r.tagL2 === row.tagL2).length === 1;
  const l1Last = sib.filter((r) => r.tagL1 === row.tagL1).length === 1;
  const out: string[] = [];
  if (l2Last) out.push(row.tagL2);
  if (l1Last) out.push(row.tagL1);
  return out;
});

function delRow(row: ProblemTagRow) {
  delTarget.value = row;
  delOpen.value = true;
}

function confirmDelete() {
  const row = delTarget.value;
  if (!row) return;
  const cascade = [...delCascade.value];
  const i = allRows.value.findIndex((r) => r.key === row.key);
  if (i >= 0) allRows.value.splice(i, 1);
  checkedRowKeys.value = checkedRowKeys.value.filter((k) => k !== row.key);
  delOpen.value = false;
  const cascadeText = cascade.length
    ? `，父级分类${cascade.map((n) => `「${n}」`).join('和')}已一并删除`
    : '';
  message.success(`已删除「${row.tagL3}」${cascadeText}`);
}

/** 生成 CSV 下载：UTF-8 BOM（Excel 中文不乱码），含逗号 / 引号 / 换行的字段加引号 */
function downloadCsv(filename: string, header: readonly string[], rows: string[][]) {
  const lines = [header, ...rows].map((cells) => cells.map((v) => csvEscape(String(v ?? ''))).join(','));
  const csv = `\uFEFF${lines.join('\r\n')}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v: string) {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** 解析 CSV 文本为二维数组（支持 BOM、引号转义、字段内逗号与换行） */
function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const todayStr = () => dayjs().format('YYYYMMDD');

/** 导入模板列（顺序固定）。失败明细＝模板列 + 末列「失败原因」，可直接改完重传 */
const TEMPLATE_COLS = [
  '业务类型', '产品分类', '产品名称', '问题分类一级', '问题分类二级', '问题分类三级',
  '处理组', '是否售后', '是否小结专用', '问题分类一级 ID', '问题分类二级 ID', '问题分类三级 ID',
] as const;
const FAIL_REASON_COL = '失败原因';
/** 必填列下标（业务类型 ~ 问题分类三级 + 是否售后） */
const REQUIRED_COL_IDX = [0, 1, 2, 3, 4, 5, 7];
/** 一 / 二 / 三级 ID 列下标 */
const ID_COL_IDX: Record<TagLevel, number> = { 1: 9, 2: 10, 3: 11 };
const HEADER_MISMATCH_TEXT = '表头与模板不一致，请下载模板后重新填写';

function rowToTemplateCells(r: ProblemTagRow): string[] {
  const p = pinfo(r.productKey);
  return [
    p.bizType, p.prodCat, r.productName, r.tagL1, r.tagL2, r.tagL3,
    r.team, r.aftersale, r.summaryOnly, r.tagL1Id, r.tagL2Id, r.tagL3Id,
  ];
}

function downloadTemplate() {
  const sample = allRows.value.find((r) => r.status === '启用') ?? allRows.value[0];
  downloadCsv('问题分类导入模板.csv', TEMPLATE_COLS, sample ? [rowToTemplateCells(sample)] : []);
  message.success('已下载导入模板');
}

// —— 导出 ——
const EXPORT_COLS = [
  'BGBU', '业务线', '产品线', '业务类型', '产品分类', '产品名称',
  '问题分类一级', '问题分类二级', '问题分类三级', '处理组', '是否售后', '是否小结专用', '状态',
  '维护人', '维护时间', '问题分类一级 ID', '问题分类二级 ID', '问题分类三级 ID',
] as const;

function rowToExportCells(r: ProblemTagRow): string[] {
  const p = pinfo(r.productKey);
  return [
    p.bgbu, p.bizLine, p.prodLine, p.bizType, p.prodCat, r.productName,
    r.tagL1, r.tagL2, r.tagL3, r.team, r.aftersale, r.summaryOnly, r.status,
    r.maintainer, r.maintainedAt, r.tagL1Id, r.tagL2Id, r.tagL3Id,
  ];
}

const checkedRows = computed(() => {
  const keys = new Set(checkedRowKeys.value);
  return allRows.value.filter((r) => keys.has(r.key));
});

/** 置灰悬停提示 */
const TIP_NEED_CHECK = '请先勾选问题分类';
const TIP_NEED_UPLOAD = '请先上传文件';
const TIP_NOTHING_TO_ADD = '没有可新增的条目';

/** 导出作用于当前已选条目（含「选择全部筛选结果」跨页选中的全部） */
function onExport() {
  const rows = checkedRows.value;
  if (!rows.length) return;
  downloadCsv(`问题分类导出_${todayStr()}.csv`, EXPORT_COLS, rows.map(rowToExportCells));
  message.success(`已导出 ${rows.length} 条`);
}

// —— 导入 ——
const importOpen = ref(false);

/** 每行归类：新增（路径不存在）/ 更新（路径已存在且可变字段有变化或当前停用）/ 已存在 / 失败 */
type ImportKind = '新增' | '更新' | '已存在' | '失败';
interface ImportLine {
  /** 原始 12 列（模板列顺序），失败明细原样回写 */
  cells: string[];
  kind: ImportKind;
  reason: string;
  productKey?: string;
  path?: [string, string, string];
  team: string;
  aftersale: '是' | '否';
  summaryOnly: '是' | '否';
  ids: Partial<Record<TagLevel, string>>;
  /** 更新行命中的存量记录 */
  targetKey?: string;
}
interface ImportResult {
  fileName: string;
  /** 表头与模板不一致：整个文件不逐行归类，不出解析结果卡 */
  headerOk: boolean;
  lines: ImportLine[];
}
const importResult = ref<ImportResult | null>(null);
/** 确认导入后的完成提示（弹窗留在原处，底部只剩「关闭」） */
const importDone = ref<{ added: number; updated: number; failed: number } | null>(null);
const importParsed = computed(() => !!importResult.value?.headerOk);
const countKind = (k: ImportKind) => importResult.value?.lines.filter((l) => l.kind === k).length ?? 0;
const importStats = computed(() => ({
  total: importResult.value?.lines.length ?? 0,
  added: countKind('新增'),
  updated: countKind('更新'),
  existed: countKind('已存在'),
  failed: countKind('失败'),
}));

function openImport() { resetImport(); importOpen.value = true; }
function resetImport() { importResult.value = null; importDone.value = null; }

/** 表头须与模板逐字一致；允许末尾多一列「失败原因」（失败明细直接重传，该列不读取） */
function headerMatchesTemplate(header: string[]) {
  const cells = [...header];
  while (cells.length && !cells[cells.length - 1].trim()) cells.pop();
  const n = TEMPLATE_COLS.length;
  const extraOk = cells.length === n || (cells.length === n + 1 && cells[n] === FAIL_REASON_COL);
  return extraOk && TEMPLATE_COLS.every((c, i) => cells[i] === c);
}

/**
 * 逐行归类。失败原因按固定顺序收集、以「；」连接：
 * 必填列为空 → 产品未找到 → 处理组 → 是否售后 → 是否小结专用 → ID 占用；
 * 文件内重复的行只写重复这一条。
 * 产品、一 / 二 / 三级按原文完全一致匹配（不去空格）；处理组、是否售后、是否小结专用、ID 去首尾空格。
 */
function analyzeImport(fileName: string, text: string): ImportResult {
  const [header = [], ...body] = parseCsv(text);
  if (!headerMatchesTemplate(header)) return { fileName, headerOk: false, lines: [] };
  const teamSet = new Set(TEAMS);
  const leafIndex = new Map(allRows.value.map((r) => [nodeKeyOf(r.productKey, [r.tagL1, r.tagL2, r.tagL3], 3), r]));
  const owners: Record<TagLevel, Map<string, string>> = {
    1: idOwners(1, allRows.value), 2: idOwners(2, allRows.value), 3: idOwners(3, allRows.value),
  };
  /** 同产品同路径（前六列原文）→ 第一次出现的文件行号 */
  const firstRowOf = new Map<string, number>();
  const lines: ImportLine[] = [];

  body.forEach((raw, idx) => {
    if (!raw.some((c) => c.trim() !== '')) return;
    const fileRow = idx + 2;
    const cells = TEMPLATE_COLS.map((_, i) => raw[i] ?? '');
    const fail = (reason: string) => {
      lines.push({ cells, kind: '失败', reason, team: '', aftersale: '否', summaryOnly: '否', ids: {} });
    };

    const dupKey = cells.slice(0, 6).join('\u0001');
    const firstRow = firstRowOf.get(dupKey);
    if (firstRow !== undefined) { fail(`文件内重复：与第 ${firstRow} 行相同`); return; }
    firstRowOf.set(dupKey, fileRow);

    const [bizType, prodCat, prodName, l1, l2, l3, teamRaw, afRaw, soRaw] = cells;
    const reasons: string[] = REQUIRED_COL_IDX
      .filter((i) => !cells[i].trim())
      .map((i) => `${TEMPLATE_COLS[i]}为空`);

    // 产品按 业务类型 + 产品分类 + 产品名称 完全一致匹配；三列有空时只报为空、不做匹配
    const prodColsFilled = [0, 1, 2].every((i) => cells[i].trim());
    const prod = prodColsFilled
      ? PRODUCT_INFOS.find((p) => p.bizType === bizType && p.prodCat === prodCat && p.name === prodName)
      : undefined;
    if (prodColsFilled && !prod) reasons.push('产品未找到：请先在产品管理中新增该产品');

    const team = teamRaw.trim();
    if (team && !teamSet.has(team)) reasons.push(`处理组不在枚举：${team}`);
    const af = afRaw.trim();
    if (af && af !== '是' && af !== '否') reasons.push('是否售后取值非法：只能填是或否');
    const so = soRaw.trim() || '否';
    if (so !== '是' && so !== '否') reasons.push('是否小结专用取值非法：只能填是或否，或留空');

    const path: [string, string, string] = [l1, l2, l3];
    const ids: Record<TagLevel, string> = {
      1: cells[ID_COL_IDX[1]].trim(), 2: cells[ID_COL_IDX[2]].trim(), 3: cells[ID_COL_IDX[3]].trim(),
    };
    const pathFilled = path.every((s) => s.trim());
    if (prod && pathFilled) {
      for (const lv of [1, 2, 3] as TagLevel[]) {
        const owner = ids[lv] ? owners[lv].get(ids[lv]) : undefined;
        if (owner && owner !== nodeKeyOf(prod.key, path, lv)) {
          reasons.push(`${TEMPLATE_COLS[ID_COL_IDX[lv]]} 已被其他分类占用：${ids[lv]}`);
        }
      }
    }
    if (reasons.length || !prod) { fail(reasons.join('；')); return; }

    const base = {
      cells, reason: '', productKey: prod.key, path, team,
      aftersale: af as '是' | '否', summaryOnly: so as '是' | '否', ids,
    };
    const exist = leafIndex.get(nodeKeyOf(prod.key, path, 3));
    if (!exist) {
      for (const lv of [1, 2, 3] as TagLevel[]) {
        if (ids[lv] && !owners[lv].has(ids[lv])) owners[lv].set(ids[lv], nodeKeyOf(prod.key, path, lv));
      }
      lines.push({ ...base, kind: '新增' });
    } else if (exist.team !== team || exist.aftersale !== af || exist.summaryOnly !== so || exist.status !== '启用') {
      lines.push({ ...base, kind: '更新', targetKey: exist.key });
    } else {
      lines.push({ ...base, kind: '已存在', reason: '已存在，无需重复导入' });
    }
  });
  return { fileName, headerOk: true, lines };
}

function readImportFile(f: File) {
  const reader = new FileReader();
  reader.onload = () => {
    importDone.value = null;
    importResult.value = analyzeImport(f.name, String(reader.result ?? ''));
  };
  reader.readAsText(f, 'utf-8');
}

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (f) readImportFile(f);
}

function onImportDrop(e: DragEvent) {
  const f = e.dataTransfer?.files?.[0];
  if (f) readImportFile(f);
}

/** 已选文件时点上传区：回到上传前并清空解析结果 */
function onDropzoneClick(e: MouseEvent) {
  if (!importResult.value) return;
  e.preventDefault();
  resetImport();
}

/** 失败明细：只含失败行，列＝模板列 + 末列「失败原因」 */
function downloadImportFailures() {
  const fails = importResult.value?.lines.filter((l) => l.kind === '失败') ?? [];
  if (!fails.length) return;
  downloadCsv(
    `问题分类导入失败明细_${todayStr()}.csv`,
    [...TEMPLATE_COLS, FAIL_REASON_COL],
    fails.map((l) => [...l.cells, l.reason]),
  );
  message.success(`已下载失败明细 ${fails.length} 条`);
}

/** 确认导入：新增行落库；withUpdate 时更新行改写处理组 / 是否售后 / 是否小结专用并重新启用 */
function doImport(withUpdate: boolean) {
  const res = importResult.value;
  if (!res || !res.headerOk || importDone.value) return;
  const stamp = stampNow();
  let added = 0;
  let updated = 0;
  /** 同一文件多行新增同一层级节点：取第一个非空 ID */
  const firstIdOf = new Map<string, string>();
  for (const ln of res.lines) {
    if (ln.kind !== '新增' || !ln.productKey || !ln.path) continue;
    for (const lv of [1, 2, 3] as TagLevel[]) {
      const nk = nodeKeyOf(ln.productKey, ln.path, lv);
      if (ln.ids[lv] && !firstIdOf.has(nk)) firstIdOf.set(nk, ln.ids[lv]!);
    }
  }
  for (const ln of res.lines) {
    if (ln.kind === '新增' && ln.productKey && ln.path) {
      const [tagL1, tagL2, tagL3] = ln.path;
      const pk = ln.productKey;
      const path = ln.path;
      const provided: Partial<Record<TagLevel, string>> = {};
      for (const lv of [1, 2, 3] as TagLevel[]) {
        const id = firstIdOf.get(nodeKeyOf(pk, path, lv));
        if (id) provided[lv] = id;
      }
      allRows.value.unshift({
        key: String(rowSeq++),
        productKey: pk,
        productName: pinfo(pk).name,
        tagL1, tagL2, tagL3,
        team: ln.team, aftersale: ln.aftersale, summaryOnly: ln.summaryOnly, status: '启用',
        ...resolveTagIds(pk, path, provided),
        ...stamp,
      });
      added += 1;
    } else if (ln.kind === '更新' && withUpdate) {
      const r = allRows.value.find((x) => x.key === ln.targetKey);
      if (!r) continue;
      Object.assign(r, { team: ln.team, aftersale: ln.aftersale, summaryOnly: ln.summaryOnly, status: '启用' }, stamp);
      updated += 1;
    }
  }
  clearSelection();
  importDone.value = { added, updated, failed: res.lines.filter((l) => l.kind === '失败').length };
}
</script>

<template>
  <div class="problem-tag-manage">
    <AdminPageHeader
      title="问题分类"
      subtitle="按产品维护三级问题分类，关联处理组、是否售后与是否小结专用"
    >
      <template #actions>
        <a-button @click="openImport"><template #icon><ImportOutlined /></template>导入</a-button>
        <a-button type="primary" @click="openAdd"><template #icon><PlusOutlined /></template>新增</a-button>
      </template>
    </AdminPageHeader>

    <div class="cols">
    <div class="right body body--list">
      <div class="list-card">
        <div class="list-toolbar">
          <div class="toolbar-row">
            <div class="fi fi-scope">
              <a-segmented v-model:value="draftFilter.dim" class="scope-dim" :options="DIM_OPTIONS" />
              <a-cascader
                :key="draftFilter.dim"
                :value="draftFilter.scopePath"
                class="tb-ctl scope-cascader"
                change-on-select
                allow-clear
                :show-search="scopeShowSearch"
                :options="SCOPE_OPTIONS[draftFilter.dim]"
                :placeholder="SCOPE_PLACEHOLDER[draftFilter.dim]"
                @change="onScopeChange"
              />
            </div>
            <span class="fi-divider" />
            <div class="fi-group-attr">
              <div class="fi">
                <span class="fl">处理组</span>
                <a-select v-model:value="draftFilter.team" class="tb-ctl sel-w" show-search allow-clear placeholder="全部" :filter-option="filterByLabel" :options="toOpts(TEAMS)" />
              </div>
              <div class="fi">
                <span class="fl">是否售后</span>
                <a-select v-model:value="draftFilter.aftersale" class="tb-ctl sel-w-sm" show-search allow-clear placeholder="全部" :filter-option="filterByLabel" :options="toOpts(['是', '否'])" />
              </div>
              <div class="fi">
                <span class="fl">是否小结专用</span>
                <a-select v-model:value="draftFilter.summaryOnly" class="tb-ctl sel-w-sm" show-search allow-clear placeholder="全部" :filter-option="filterByLabel" :options="toOpts(['是', '否'])" />
              </div>
              <div class="fi">
                <span class="fl">状态</span>
                <a-select v-model:value="draftFilter.status" class="tb-ctl sel-w-sm" show-search allow-clear placeholder="全部" :filter-option="filterByLabel" :options="toOpts(['启用', '停用'])" />
              </div>
            </div>
          </div>
        </div>

        <div class="list-controls">
          <div class="wb-toolbar">
            <div class="wb-toolbar__cluster">
              <template v-if="showTagLevelFilters">
                <a-select
                  v-model:value="draftFilter.tagL1"
                  class="wb-toolbar__sel"
                  size="small"
                  allow-clear
                  show-search
                  placeholder="一级分类"
                  :options="filterTagL1Opts"
                  :filter-option="filterByLabel"
                />
                <a-select
                  v-model:value="draftFilter.tagL2"
                  class="wb-toolbar__sel"
                  size="small"
                  allow-clear
                  show-search
                  placeholder="二级分类"
                  :options="filterTagL2Opts"
                  :filter-option="filterByLabel"
                />
              </template>
              <div class="wb-toolbar__search">
                <SearchOutlined :style="{ color: '#9CA3AF', fontSize: '14px' }" />
                <input
                  class="wb-toolbar__search-input"
                  placeholder="搜索分类名称"
                  :value="draftFilter.tagKeyword"
                  @input="draftFilter.tagKeyword = ($event.target as HTMLInputElement).value"
                  @keydown.enter="onQuery"
                />
              </div>
              <div class="wb-toolbar__btn wb-toolbar__btn--primary" @click="onQuery">
                <SearchOutlined :style="{ fontSize: '14px' }" />
                <span>查询</span>
              </div>
              <div class="wb-toolbar__btn" @click="onReset">
                <ReloadOutlined :style="{ color: '#6B7280', fontSize: '14px' }" />
                <span>重置</span>
              </div>
              <a-dropdown v-model:open="batchOpen" trigger="click" placement="bottomRight">
                <div class="wb-toolbar__btn wb-toolbar__btn--batch" :class="{ 'is-active': hasRowSelection }">
                  <UnorderedListOutlined :style="{ fontSize: '14px' }" />
                  <span>批量操作</span>
                  <span v-if="hasRowSelection" class="wb-toolbar__badge">{{ checkedRowKeys.length }}</span>
                  <DownOutlined :style="{ color: '#9CA3AF', fontSize: '12px' }" />
                </div>
                <template #overlay>
                  <a-menu class="batch-menu">
                    <a-menu-item v-for="act in ['处理组', '启用', '停用']" :key="act" :disabled="!hasRowSelection" @click="onBatch(act)">
                      <a-tooltip :title="hasRowSelection ? undefined : TIP_NEED_CHECK" placement="left">
                        <span class="menu-tip">{{ act }}</span>
                      </a-tooltip>
                    </a-menu-item>
                    <template v-if="isAdmin">
                      <a-menu-divider />
                      <a-menu-item key="删除" :disabled="!hasRowSelection" danger @click="onBatch('删除')">
                        <a-tooltip :title="hasRowSelection ? undefined : TIP_NEED_CHECK" placement="left">
                          <span class="menu-tip">删除</span>
                        </a-tooltip>
                      </a-menu-item>
                    </template>
                  </a-menu>
                </template>
              </a-dropdown>
              <a-tooltip :title="checkedRows.length ? undefined : TIP_NEED_CHECK" placement="bottomRight">
                <div
                  class="wb-toolbar__btn wb-toolbar__btn--export"
                  :class="{ 'is-disabled': !checkedRows.length }"
                  @click="onExport"
                >
                  <DownloadOutlined :style="{ fontSize: '14px' }" />
                  <span>{{ checkedRows.length ? `导出（${checkedRows.length} 条）` : '导出' }}</span>
                </div>
              </a-tooltip>
            </div>
          </div>
        </div>

        <div class="table-wrap">
        <a-table
          :columns="cols"
          :data-source="displayRows"
          :row-selection="rowSelection"
          row-key="key"
          :pagination="pagination"
          size="middle"
          :scroll="{ x: 1450, y: 'calc(100vh - 410px)' }"
        >
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'productName'" class="cell-link" @click="openEditRow(record as ProblemTagRow)">
              {{ (record as ProblemTagRow).productName }}
            </span>
            <span v-else-if="column.key === 'tagL3'" class="tag-path" :title="(record as ProblemTagRow).tagL3">
              {{ (record as ProblemTagRow).tagL3 }}
            </span>
            <span v-else-if="column.key === 'team'" :class="{ 'cell-empty': !(record as ProblemTagRow).team }">
              {{ (record as ProblemTagRow).team || '—' }}
            </span>
            <span v-else-if="column.key === 'maintainedAt'" class="cell-time">
              {{ (record as ProblemTagRow).maintainedAt }}
            </span>
            <a-switch
              v-else-if="column.key === 'status'"
              size="small"
              :checked="(record as ProblemTagRow).status === '启用'"
              checked-children="启用"
              un-checked-children="停用"
              @change="(checked) => onListStatusChange(record as ProblemTagRow, !!checked)"
            />
            <div v-else-if="column.key === 'op'" class="row-ops">
              <a-button type="link" size="small" @click="openEditRow(record as ProblemTagRow)">编辑</a-button>
              <a-button v-if="isAdmin" type="link" size="small" danger @click="delRow(record as ProblemTagRow)">删除</a-button>
            </div>
          </template>
        </a-table>
        </div>
      </div>
    </div>
    </div>

    <a-modal
      v-model:open="formOpen"
      :title="editingKey ? '修改问题分类' : '新增问题分类'"
      :width="520"
      ok-text="保存"
      cancel-text="取消"
      destroy-on-close
      @ok="saveForm"
    >
      <a-form
        layout="horizontal"
        class="tag-form"
        :colon="false"
        :label-col="formLabelCol"
        :wrapper-col="formWrapperCol"
      >
        <a-form-item label="所属产品" required class="form-item-product">
          <div class="prod-field">
            <a-tree-select
              v-model:value="form.productKey"
              show-search
              allow-clear
              tree-line
              :tree-data="productTreeSelectData"
              :field-names="{ children: 'children', label: 'title', value: 'key' }"
              tree-node-filter-prop="title"
              :dropdown-style="{ maxHeight: '360px', overflow: 'auto' }"
              :disabled="!!editingKey"
              placeholder="搜索或逐级选择产品"
            >
              <template #notFoundContent>
                <div class="prod-nf">
                  <div>未找到匹配的产品</div>
                  <a class="prod-nf-link" @click.prevent="goProductManage">前往产品管理新增</a>
                </div>
              </template>
            </a-tree-select>
            <div v-if="form.productKey && productPath(form.productKey).length" class="prod-path">
              <span
                v-for="(seg, i) in productPath(form.productKey)"
                :key="i"
                class="prod-path-seg"
              >
                <span v-if="i > 0" class="prod-path-sep">/</span>{{ seg }}
              </span>
            </div>
          </div>
        </a-form-item>

        <a-form-item label="问题分类一级" required>
          <a-auto-complete
            v-model:value="form.tagL1"
            class="cat-input-full"
            placeholder="搜索已有或输入新分类"
            :options="formTagL1Opts"
            :filter-option="filterByValue"
          />
        </a-form-item>
        <a-form-item label="问题分类二级" required>
          <a-auto-complete
            v-model:value="form.tagL2"
            class="cat-input-full"
            placeholder="搜索已有或输入新分类"
            :options="formTagL2Opts"
            :disabled="!form.tagL1.trim()"
            :filter-option="filterByValue"
          />
        </a-form-item>
        <a-form-item label="问题分类三级" required>
          <a-auto-complete
            v-model:value="form.tagL3"
            class="cat-input-full"
            placeholder="搜索已有或输入新分类"
            :options="formTagL3Opts"
            :disabled="!form.tagL2.trim()"
            :filter-option="filterByValue"
          />
        </a-form-item>

        <a-form-item label="处理组">
          <a-select v-model:value="form.team" placeholder="请选择处理组" show-search allow-clear :filter-option="filterByLabel" :options="toOpts(TEAMS)" />
        </a-form-item>
        <a-form-item label="是否售后">
          <a-radio-group v-model:value="form.aftersale" button-style="solid">
            <a-radio-button value="是">是</a-radio-button>
            <a-radio-button value="否">否</a-radio-button>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="是否小结专用">
          <a-radio-group v-model:value="form.summaryOnly" button-style="solid">
            <a-radio-button value="是">是</a-radio-button>
            <a-radio-button value="否">否</a-radio-button>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="batchTeamOpen"
      title="批量修改处理组"
      :width="420"
      ok-text="确认修改"
      cancel-text="取消"
      :ok-button-props="{ disabled: !batchTeamValue }"
      @ok="confirmBatchTeam"
    >
      <p class="batch-team-hint">将更新已选 {{ checkedRowKeys.length }} 条问题分类的处理组</p>
      <a-form layout="vertical">
        <a-form-item label="处理组" required>
          <a-select
            v-model:value="batchTeamValue"
            placeholder="请选择处理组"
            show-search
            :options="toOpts(TEAMS)"
            style="width: 100%"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="delOpen"
      title="删除问题分类"
      :width="480"
      ok-text="确认删除"
      :ok-button-props="{ danger: true }"
      cancel-text="取消"
      @ok="confirmDelete"
    >
      <template v-if="delTarget">
        <div class="del-path">{{ delTarget.productName }} · {{ tagPath(delTarget) }}</div>
        <p class="del-hint">删掉后新建工单选不到这条分类；已归类的历史工单不受影响。</p>
        <div class="del-cascade">
          <span class="del-cascade-tag">注意</span>
          <span class="del-cascade-text">如果父级分类没有子级分类了，父级分类也会一并删除。</span>
        </div>
      </template>
    </a-modal>

    <a-modal
      v-model:open="importOpen"
      title="导入问题分类"
      :width="600"
    >
      <template #footer>
        <a-button v-if="importDone" type="primary" @click="importOpen = false">关闭</a-button>
        <template v-else>
          <a-button @click="importOpen = false">取消</a-button>
          <a-tooltip v-if="!importParsed" :title="importResult ? HEADER_MISMATCH_TEXT : TIP_NEED_UPLOAD">
            <span class="btn-tip-wrap"><a-button type="primary" disabled>确认导入</a-button></span>
          </a-tooltip>
          <template v-else-if="importStats.updated > 0">
            <a-tooltip :title="importStats.added === 0 ? TIP_NOTHING_TO_ADD : undefined">
              <span class="btn-tip-wrap">
                <a-button :disabled="importStats.added === 0" @click="doImport(false)">仅导入新增 {{ importStats.added }} 条</a-button>
              </span>
            </a-tooltip>
            <a-button type="primary" @click="doImport(true)">导入新增并更新（{{ importStats.added }} + {{ importStats.updated }} 条）</a-button>
          </template>
          <a-tooltip v-else :title="importStats.added === 0 ? TIP_NOTHING_TO_ADD : undefined">
            <span class="btn-tip-wrap">
              <a-button type="primary" :disabled="importStats.added === 0" @click="doImport(false)">确认导入 {{ importStats.added }} 条</a-button>
            </span>
          </a-tooltip>
        </template>
      </template>
      <div class="import-panel">
        <label class="dropzone" @click="onDropzoneClick" @dragover.prevent @drop.prevent="onImportDrop">
          <InboxOutlined class="dz-ic" />
          <div class="dz-main">
            <template v-if="importResult">{{ importResult.fileName }}</template>
            <template v-else>点击选择 CSV 文件</template>
          </div>
          <div class="dz-sub">
            <template v-if="importResult">点击可重新选择文件</template>
            <template v-else>
              拖拽或点击上传 ·
              <a class="dz-dl" @click.stop.prevent="downloadTemplate">
                <DownloadOutlined /> 下载模板
              </a>
            </template>
          </div>
          <input type="file" accept=".csv" hidden @change="onImportFile" />
        </label>

        <div v-if="!importResult" class="import-tips">首行须为表头（同模板）</div>
        <div v-else-if="!importResult.headerOk" class="import-error">{{ HEADER_MISMATCH_TEXT }}</div>

        <div v-if="importDone" class="import-done">
          导入完成：新增 {{ importDone.added }} 条、更新 {{ importDone.updated }} 条<template v-if="importDone.failed > 0">，失败 {{ importDone.failed }} 条，可<a class="ir-dl-inline" @click.prevent="downloadImportFailures()">下载失败明细</a></template>
        </div>

        <div v-if="importParsed" class="import-result">
          <div class="ir-head">
            <div class="ir-title">解析完成</div>
            <a
              v-if="importStats.failed > 0"
              class="ir-dl"
              @click.prevent="downloadImportFailures()"
            >
              <DownloadOutlined /> 下载失败明细
            </a>
          </div>
          <div class="ir-grid">
            <div class="ir-cell">
              <span class="ir-num">{{ importStats.total }}</span>
              <span class="ir-label">共解析</span>
            </div>
            <div class="ir-cell">
              <span class="ir-num ok">{{ importStats.added }}</span>
              <span class="ir-label">新增</span>
            </div>
            <div class="ir-cell">
              <span class="ir-num upd">{{ importStats.updated }}</span>
              <span class="ir-label">更新</span>
            </div>
            <div class="ir-cell">
              <span class="ir-num dup">{{ importStats.existed }}</span>
              <span class="ir-label">已存在</span>
            </div>
            <div class="ir-cell">
              <span class="ir-num invalid">{{ importStats.failed }}</span>
              <span class="ir-label">失败</span>
            </div>
          </div>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.problem-tag-manage { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 16px 20px; }
.problem-tag-manage :deep(.admin-page-header) { margin-bottom: 16px; }
.cols { display: flex; gap: 12px; flex: 1; min-height: 0; }

.right { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.body--list { gap: 8px; padding: 0; }
.body--list :deep(.admin-page-header) { margin-bottom: 0; }

.list-card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;
  flex: 1; min-height: 0; display: flex; flex-direction: column;
}
.list-toolbar {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 12px; border-bottom: 1px solid #f0f2f5;
}
.toolbar-row {
  display: flex; align-items: center; gap: 8px 16px; flex-wrap: wrap; width: 100%;
}
/* 维度分段 + 级联：一组，紧挨、等高 */
.fi-scope { gap: 8px; }
.scope-dim { flex: none; padding: 2px; }
.scope-dim :deep(.ant-segmented-item-label) {
  min-height: 26px; line-height: 26px; padding: 0 12px; font-size: 13px;
}
.scope-cascader { width: 300px !important; }
/* 组间细分隔线 */
.fi-divider { flex: none; width: 1px; height: 18px; background: #e5e7eb; }
.fi-group-attr { display: flex; align-items: center; gap: 8px 16px; flex-wrap: wrap; }
/* 筛选控件统一 30px 高，与工具条按钮对齐 */
.toolbar-row :deep(.tb-ctl.ant-select:not(.ant-select-customize-input) .ant-select-selector) {
  height: 30px !important; padding: 0 10px;
}
.toolbar-row :deep(.tb-ctl.ant-select .ant-select-selection-search-input) { height: 28px !important; }
.toolbar-row :deep(.tb-ctl.ant-select .ant-select-selection-item),
.toolbar-row :deep(.tb-ctl.ant-select .ant-select-selection-placeholder) { line-height: 28px !important; }
.toolbar-row :deep(.tb-ctl.ant-select .ant-select-selection-search) { inset-inline-start: 10px; inset-inline-end: 10px; }
.fi-group {
  display: flex; align-items: center; gap: 8px; flex: none;
  padding: 2px 8px; border-radius: 6px; background: #f9fafb;
}
.fi { display: flex; align-items: center; gap: 8px; flex: none; }
.fl { font-size: 13px; color: #6b7280; white-space: nowrap; }
.sel-w { width: 120px !important; }
.sel-w-sm { width: 88px !important; }
.toolbar-row :deep(.tb-ctl.ant-select .ant-select-selector) {
  font-size: 13px; border-radius: 6px; background: #fff;
}
.toolbar-row :deep(.ant-select-selection-placeholder) { color: #9ca3af; }
.toolbar-row :deep(.ant-select-selection-item) { font-weight: 400; }

.list-controls {
  padding: 6px 12px;
  border-bottom: 1px solid #f0f2f5;
}
.wb-toolbar {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 12px; width: 100%; min-width: 0;
}
.wb-toolbar__cluster {
  display: inline-flex; align-items: center; gap: 8px; flex: none; flex-shrink: 0;
}
.wb-toolbar__sel { width: 120px !important; }
.wb-toolbar__sel :deep(.ant-select-selector) {
  height: 30px !important; border-radius: 6px !important;
  font-size: 13px;
}
.wb-toolbar__search {
  display: flex; align-items: center; gap: 8px;
  width: 200px; height: 30px; padding: 0 10px;
  background: #fff; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; flex: none;
}
.wb-toolbar__search:focus-within {
  border-color: #1a6fff; box-shadow: 0 0 0 2px rgb(26 111 255 / 10%);
}
.wb-toolbar__search-input {
  flex: 1; min-width: 0; border: none; outline: none;
  font-size: 13px; color: #374151; background: transparent;
}
.wb-toolbar__search-input::placeholder { color: #9ca3af; }
.wb-toolbar__btn {
  display: inline-flex; align-items: center; gap: 6px; height: 30px;
  padding: 0 12px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 13px; color: #374151; cursor: pointer; user-select: none; white-space: nowrap; flex: none;
}
.wb-toolbar__btn:hover { border-color: #1a6fff; }
.wb-toolbar__btn--primary {
  color: #fff; background: #1a6fff; border-color: #1a6fff;
}
.wb-toolbar__btn--primary:hover { background: #0f4fcc; border-color: #0f4fcc; }
.wb-toolbar__btn--batch { color: #6b7280; }
.wb-toolbar__btn--batch.is-active {
  color: #1a6fff; border-color: #bfdbfe; background: #f8fbff;
}
.wb-toolbar__btn--batch.is-active:hover { border-color: #1a6fff; }
.wb-toolbar__btn--export { color: #374151; }
.wb-toolbar__btn--export.is-disabled {
  color: #bfbfbf; background: #f5f5f5; border-color: #d9d9d9; cursor: not-allowed;
}
.wb-toolbar__btn--export.is-disabled:hover { border-color: #d9d9d9; }
.wb-toolbar__badge {
  min-width: 18px; height: 18px; padding: 0 5px;
  font-size: 11px; font-weight: 600; line-height: 18px; text-align: center;
  color: #fff; background: #1a6fff; border-radius: 9px;
}

.list-card :deep(.ant-table-wrapper) { padding: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.table-wrap {
  flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
}
.table-wrap :deep(.ant-spin-nested-loading),
.table-wrap :deep(.ant-spin-container) {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
}
.table-wrap :deep(.ant-table) { flex: 1; min-height: 0; }
.table-wrap :deep(.ant-table-pagination) {
  flex: none; margin: 0 !important; padding: 10px 16px;
  border-top: 1px solid #f0f2f5; background: #fff;
}
.list-card :deep(.ant-table-thead > tr > th) {
  background: #fff; color: #6b7280; font-size: 12px; font-weight: 600;
  padding: 8px 12px; border-bottom: 1px solid #f0f2f5;
}
.list-card :deep(.ant-table-tbody > tr > td) {
  padding: 8px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #f5f6f8;
}
.list-card :deep(.col-cat-l1) { padding-right: 4px !important; }
.list-card :deep(.col-cat-l2) { padding-left: 4px !important; }
.list-card :deep(.col-op),
.list-card :deep(.ant-table-cell-fix-right) {
  padding-right: 20px !important; text-align: right;
}

.cell-link { color: #1a6fff; cursor: pointer; font-size: 13px; }
.cell-link:hover { text-decoration: underline; }
.tag-path { font-size: 13px; color: #4b5563; }
.cell-empty { color: #9ca3af; }
.cell-time { font-size: 12px; color: #6b7280; font-variant-numeric: tabular-nums; }
.row-ops { display: inline-flex; align-items: center; justify-content: flex-end; flex-wrap: nowrap; white-space: nowrap; }
.row-ops :deep(.ant-btn-link) { padding: 0 6px; height: 22px; line-height: 22px; }
.empty-hint { padding: 24px; color: #9ca3af; }

.tag-form :deep(.ant-form-item) { margin-bottom: 12px; }
.tag-form :deep(.ant-form-item-row) { align-items: center; flex-wrap: nowrap; }
.tag-form :deep(.ant-form-item-label) { text-align: right; padding-right: 8px; }
.tag-form :deep(.ant-form-item-label > label) {
  font-size: 13px; color: #374151; height: 32px;
}
.tag-form :deep(.ant-form-item-control) { min-width: 0; }
.tag-form :deep(.ant-select),
.tag-form :deep(.ant-input),
.tag-form :deep(.ant-input-affix-wrapper) { width: 100%; }
/* 所属产品：控件含路径副文案，标签与选择框顶部对齐，避免垂直居中错位 */
.tag-form :deep(.form-item-product .ant-form-item-row) { align-items: flex-start; }
.tag-form :deep(.form-item-product .ant-form-item-label) { padding-top: 0; }
.tag-form :deep(.form-item-product .ant-form-item-label > label) {
  height: 32px; line-height: 32px;
}
.tag-form :deep(.form-item-product .ant-form-item-control-input) { min-height: 32px; }
.prod-field { width: 100%; min-width: 0; }
.prod-field :deep(.ant-select) { width: 100%; }
.prod-hint {
  margin-top: 6px; font-size: 12px; color: #9ca3af; line-height: 1.4;
}
.prod-hint-link { color: #1a6fff; cursor: pointer; }
.prod-hint-link:hover { text-decoration: underline; }
.prod-nf {
  padding: 8px 4px; text-align: center; font-size: 12px; color: #9ca3af; line-height: 1.6;
}
.prod-nf-link { color: #1a6fff; cursor: pointer; }
.prod-nf-link:hover { text-decoration: underline; }
/* 选中产品后回显完整路径（前面各级节点） */
.prod-path {
  margin-top: 6px; font-size: 12px; color: #64748b; line-height: 1.5;
  display: flex; flex-wrap: wrap; align-items: center;
}
.prod-path-seg { display: inline-flex; align-items: center; }
.prod-path-seg:last-child { color: #1a6fff; font-weight: 600; }
.prod-path-sep { color: #cbd5e1; margin: 0 6px; }
.cat-input-full { width: 100%; }
.batch-team-hint { margin: 0 0 12px; color: #6b7280; font-size: 13px; line-height: 1.5; }
.del-path {
  margin: 0 0 8px; padding: 8px 10px; border-radius: 6px;
  background: #f9fafb; border: 1px solid #eef0f2;
  font-size: 13px; color: #374151; font-weight: 500; line-height: 1.5;
}
.del-hint { margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.6; }
.del-cascade {
  display: flex; align-items: flex-start; gap: 8px;
  margin-top: 12px; padding: 8px 10px; border-radius: 8px;
  background: #fffbeb; border: 1px solid #fde68a;
}
.del-cascade-tag {
  flex: none; padding: 0 6px; height: 20px; border-radius: 4px;
  font-size: 12px; font-weight: 600; line-height: 20px;
  color: #b45309; background: #fef3c7;
}
.del-cascade-text { font-size: 12px; color: #92400e; line-height: 1.6; }
.import-panel { display: flex; flex-direction: column; gap: 10px; }
.import-tips {
  margin: 0; padding: 8px 12px; border-radius: 8px;
  background: #f9fafb; border: 1px solid #eef0f2;
  font-size: 12px; color: #6b7280; line-height: 1.8;
}
.import-error { font-size: 13px; color: #dc2626; line-height: 1.6; }
.import-done {
  padding: 8px 12px; border-radius: 8px;
  background: #f0fdf4; border: 1px solid #bbf7d0;
  font-size: 13px; color: #166534; line-height: 1.6;
}
.ir-dl-inline { color: #1a6fff; cursor: pointer; }
.ir-dl-inline:hover { text-decoration: underline; }
/* 置灰按钮外包一层承接悬停提示（disabled 按钮自身不触发鼠标事件） */
.btn-tip-wrap { display: inline-block; margin-inline-start: 8px; }
.btn-tip-wrap :deep(.ant-btn[disabled]) { pointer-events: none; }
/* 包裹层之后紧跟的按钮不再命中 antd 的 .ant-btn + .ant-btn 间距，补齐 8px */
.btn-tip-wrap + .ant-btn { margin-inline-start: 8px; }
.menu-tip { display: block; }
.dropzone {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 24px; border: 1.5px dashed #d1d5db; border-radius: 10px; cursor: pointer;
}
.dropzone:hover { border-color: #1a6fff; background: #f7faff; }
.dz-ic { font-size: 34px; color: #1a6fff; }
.dz-main { font-size: 14px; font-weight: 600; color: #374151; }
.dz-sub { font-size: 12px; color: #9ca3af; text-align: center; line-height: 1.6; }
.dz-dl {
  display: inline-flex; align-items: center; gap: 4px;
  color: #1a6fff; font-weight: 600; cursor: pointer;
}
.dz-dl:hover { text-decoration: underline; }

.import-result {
  border: 1px solid #eef0f2; border-radius: 10px; padding: 14px 16px;
  display: flex; flex-direction: column; gap: 12px;
}
.ir-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ir-title { font-size: 13px; font-weight: 600; color: #111827; }
.ir-dl {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600; color: #1a6fff; cursor: pointer; white-space: nowrap;
}
.ir-dl:hover { text-decoration: underline; }
.ir-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.ir-cell {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 8px; border-radius: 8px; background: #f9fafb;
}
.ir-num { font-size: 24px; font-weight: 700; color: #374151; line-height: 1; }
.ir-num.dup { color: #d97706; }
.ir-num.invalid { color: #dc2626; }
.ir-num.ok { color: #16a34a; }
.ir-num.upd { color: #1a6fff; }
.ir-label { font-size: 12px; color: #6b7280; }
.ir-hint { font-size: 12px; color: #9ca3af; line-height: 1.6; }
</style>
