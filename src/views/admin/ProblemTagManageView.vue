<script setup lang="ts">
import { ref, reactive, computed, watch, h, nextTick } from 'vue';
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
 * 第1行：BGBU → 业务线 → 产品线 → 业务类型 → 产品分类 → 产品名称 → 处理组 → 是否售后 → 是否小结专用 → 状态
 * 工具条：一级/二级分类（需业务类型+产品分类+产品名称均已选才出现）→ 分类名称搜索 → 查询/重置/批量/导出
 */
const emptyFilter = () => ({
  bgbu: undefined as string | undefined,
  bizLine: undefined as string | undefined,
  prodLine: undefined as string | undefined,
  bizType: undefined as string | undefined,
  prodCat: undefined as string | undefined,
  prodName: undefined as string | undefined,
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

/** 产品维度筛选字段（筛选条件键 → 产品归属字段） */
type ProductDim = 'bgbu' | 'bizLine' | 'prodLine' | 'bizType' | 'prodCat' | 'prodName';
const PRODUCT_DIM_FIELD: Record<ProductDim, keyof ProductInfo> = {
  bgbu: 'bgbu', bizLine: 'bizLine', prodLine: 'prodLine', bizType: 'bizType', prodCat: 'prodCat', prodName: 'name',
};
const PRODUCT_DIMS = Object.keys(PRODUCT_DIM_FIELD) as ProductDim[];

function productMatches(p: ProductInfo, f: Record<ProductDim, string | undefined>, skip?: ProductDim) {
  return PRODUCT_DIMS.every((d) => d === skip || !f[d] || p[PRODUCT_DIM_FIELD[d]] === f[d]);
}

/** 产品维度下拉：按其余已选产品维度收敛（各项互相联动） */
function productDimOpts(dim: ProductDim) {
  const set = new Set<string>();
  for (const p of PRODUCT_INFOS) {
    if (productMatches(p, draftFilter, dim)) set.add(p[PRODUCT_DIM_FIELD[dim]]);
  }
  return [...set].filter(Boolean).map((v) => ({ value: v, label: v }));
}
const toOpts = (items: string[]) => items.map((v) => ({ value: v, label: v }));
const filterByLabel = (input: string, option?: { label?: string }) =>
  String(option?.label ?? '').includes(input);
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

/** 选产品名称时回填业务类型 / 产品分类，保证三者与主数据一致 */
watch(
  () => draftFilter.prodName,
  (name) => {
    if (!name) return;
    const hit = PRODUCT_INFOS.find((p) => p.name === name);
    if (!hit) return;
    draftFilter.bizType = hit.bizType;
    draftFilter.prodCat = hit.prodCat;
  },
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
  ['p-h1', '云空间', '操作指导', '如何领取/升级云空间', '工单-处理', '否', '否', '启用', '110201', '2104011', '31060101', '孙系统', '2026-09-08 10:12'],
  ['p-h1', '云空间', '功能介绍', '云空间存储大小咨询', '工单-处理', '否', '是', '启用', '110201', '2104012', '31060102', '周运营', '2026-09-26 15:40'],
  ['p-h1', '我的文件', '功能介绍', '文件名称是否支持添加符号', '工单-处理', '否', '否', '启用', '110202', '2104013', '31060103', '孙系统', '2026-09-08 10:12'],
  ['p-h1', '我的文件', '软件问题', '邮件分享失败', '工单-处理', '否', '否', '启用', '110202', '2104014', '31060104', '孙系统', '2026-09-08 10:12'],
  ['p-h1', '相机', '功能介绍', '视频是否支持实时字幕', '工单-处理', '否', '否', '启用', '110203', '2104015', '31060105', '赵管理', '2026-09-15 09:31'],
  ['p-h1', '网络', '功能介绍', '是否支持修改IP地址', '工单-处理', '否', '否', '启用', '110204', '2104016', '31060106', '孙系统', '2026-09-08 10:12'],
  ['p-h1', '账号/密码', '操作指导', '如何退出/切换账号', '工单-处理', '否', '否', '启用', '110205', '2104017', '31060107', '周运营', '2026-10-06 11:05'],
  ['p-h2', '云空间', '操作指导', '如何上传/查看/编辑/下载/删除文件', '工单-处理', '否', '否', '启用', '110211', '2104021', '31060201', '孙系统', '2026-09-09 14:22'],
  ['p-h2', '云空间', '软件问题', '无法领取云空间', '工单-处理', '否', '否', '启用', '110211', '2104022', '31060202', '孙系统', '2026-09-09 14:22'],
  ['p-h2', '我的文件', '功能介绍', '文件已上传云空间是否支持直接转写', '工单-处理', '否', '否', '启用', '110212', '2104024', '31060203', '赵管理', '2026-09-18 16:48'],
  ['p-h2', '我的文件', '软件问题', '文件日期/时间显示异常', '工单-处理', '否', '否', '启用', '110212', '2104025', '31060204', '孙系统', '2026-09-09 14:22'],
  ['p-h2', '云空间', '功能介绍', '导出格式咨询', '', '否', '否', '启用', '110211', '2104023', '31060205', '周运营', '2026-09-29 10:03'],
  ['p-h2', '整机/设备', '功能介绍', '录音笔IP地址咨询', '工单-处理', '否', '是', '停用', '110213', '2104026', '31060206', '周运营', '2026-10-07 17:26'],
  ['p1', '语音翻译', '操作指导', '如何切换男声女声', '工单-处理', '否', '否', '启用', '110221', '2104031', '31060301', '孙系统', '2026-09-10 09:15'],
  ['p1', '语音翻译', '软件问题', '翻译结果没有语音播报', '工单-处理', '否', '否', '启用', '110221', '2104032', '31060302', '孙系统', '2026-09-10 09:15'],
  ['p1', '会议/会话翻译', '软件问题', '翻译延迟/卡顿/反应慢', '工单-处理', '否', '否', '启用', '110222', '2104033', '31060303', '赵管理', '2026-09-22 13:37'],
  ['p1', '屏幕', '功能异常', '显示内容异常(图标/乱码/字体/方向等)', '工单-处理', '否', '否', '启用', '110223', '2104034', '31060304', '孙系统', '2026-09-10 09:15'],
  ['p1', '记录导出', '操作指导', '如何导出翻译记录', '工单-处理', '否', '否', '启用', '110224', '2104035', '31060305', '孙系统', '2026-09-10 09:15'],
  ['p1', '售后', '服务申请', '维修请求', '工单-售后', '是', '否', '启用', '110225', '2104036', '31060306', '周运营', '2026-09-30 15:58'],
  ['p1', '售后', '政策咨询', '退换货政策', '工单-售后', '是', '否', '启用', '110225', '2104037', '31060307', '周运营', '2026-09-30 15:58'],
  ['p2', '会议/会话翻译', '软件问题', '翻译失败(服务准备中,请稍等)', '工单-处理', '否', '否', '启用', '110231', '2104041', '31060401', '孙系统', '2026-09-11 11:20'],
  ['p2', '会议/会话翻译', '软件问题', '无法切换翻译识别模式', '工单-处理', '否', '否', '启用', '110231', '2104041', '31060402', '孙系统', '2026-09-11 11:20'],
  ['p2', '语音翻译', '软件问题', '翻译结果没有语音播报', '工单-处理', '否', '否', '启用', '110232', '2104042', '31060403', '赵管理', '2026-09-24 10:44'],
  ['p2', '蓝牙', '操作指导', '如何断开连接', '工单-处理', '否', '否', '启用', '110233', '2104043', '31060404', '孙系统', '2026-09-11 11:20'],
  ['p2', '整机/设备', '信息咨询', '设备丢失', '', '否', '是', '启用', '110234', '2104044', '31060405', '周运营', '2026-10-02 09:52'],
  ['p2', '售后', '问题反馈', '设备维修后故障仍存在', '工单-售后', '是', '否', '停用', '110235', '2104045', '31060406', '赵管理', '2026-10-05 14:09'],
  ['p3', '账号/密码', '操作指导', '如何退出/切换账号', '工单-二线', '否', '否', '启用', '110241', '2104051', '31060501', '孙系统', '2026-09-12 16:30'],
  ['p3', '网络', '功能介绍', '是否支持修改IP地址', '工单-二线', '否', '否', '启用', '110242', '2104052', '31060502', '孙系统', '2026-09-12 16:30'],
  ['p3', '设置/系统', '软件问题', '加载失败/打不开/闪退', '工单-二线', '否', '否', '启用', '110243', '2104053', '31060503', '赵管理', '2026-09-25 11:18'],
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

/** 写操作留痕：操作人取当前登录用户，时刻精确到分 */
function stampNow() {
  return { maintainer: userStore.name, maintainedAt: dayjs().format('YYYY-MM-DD HH:mm') };
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

/** 业务类型 + 产品分类 + 产品名称均已选时，才展示一级/二级分类筛选 */
const showTagLevelFilters = computed(() =>
  !!(draftFilter.bizType && draftFilter.prodCat && draftFilter.prodName),
);

/**
 * 一/二级选项数据源：按「产品名称」取该产品下已有分类（与列表同行数据同源）。
 * 显隐仍要求业务类型+产品分类+产品名称齐选；选项以产品名为准，避免三项不一致时下拉为空。
 */
const productScopedRows = computed(() => {
  const name = draftFilter.prodName;
  if (!name) return [];
  return allRows.value.filter((r) => r.productName === name);
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
  () => [draftFilter.bizType, draftFilter.prodCat, draftFilter.prodName] as const,
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
  if (!productMatches(pinfo(r.productKey), appliedFilter)) return false;
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
  { title: '问题分类一级', dataIndex: 'tagL1', key: 'tagL1', width: 120 },
  { title: '问题分类二级', dataIndex: 'tagL2', key: 'tagL2', width: 110 },
  { title: '问题分类三级', dataIndex: 'tagL3', key: 'tagL3', width: 240 },
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
const rowSelection = computed(() => ({
  selectedRowKeys: checkedRowKeys.value,
  onChange: (keys: (string | number)[]) => { checkedRowKeys.value = keys as string[]; },
}));
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
  checkedRowKeys.value = [];
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
      let n = 0;
      for (const r of allRows.value) {
        if (keySet.has(r.key)) {
          r.status = status;
          Object.assign(r, stamp);
          n += 1;
        }
      }
      checkedRowKeys.value = [];
      message.success(`已${status} ${n} 条`);
    },
  });
}

function batchDelete() {
  const keys = [...checkedRowKeys.value];
  Modal.confirm({
    title: '批量删除问题分类',
    content: `确定删除已选 ${keys.length} 条问题分类？删除后新建工单不可再选。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      allRows.value = allRows.value.filter((r) => !keys.includes(r.key));
      checkedRowKeys.value = [];
      message.success(`已删除 ${keys.length} 条`);
    },
  });
}

function onQuery() {
  Object.assign(appliedFilter, { ...draftFilter });
  checkedRowKeys.value = [];
  message.success(`查询完成，共 ${displayRows.value.length} 条`);
}
function onReset() {
  Object.assign(draftFilter, emptyFilter());
  Object.assign(appliedFilter, emptyFilter());
  checkedRowKeys.value = [];
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
    team: '工单-处理', aftersale: '否', summaryOnly: '否', status: '启用',
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

const todayStr = () => dayjs().format('YYYY-MM-DD');

/** 导入模板列（顺序固定；带 * 为必填）。失败明细＝模板列 + 末列「失败原因」，可直接改完重传 */
const TEMPLATE_COLS = [
  '业务类型*', '产品分类*', '产品名称*', '问题分类一级*', '问题分类二级*', '问题分类三级*',
  '处理组', '是否售后*', '是否小结专用', '问题分类一级 ID', '问题分类二级 ID', '问题分类三级 ID',
] as const;
const FAIL_REASON_COL = '失败原因';
/** 必填列下标（业务类型 ~ 问题分类三级 + 是否售后） */
const REQUIRED_COL_IDX = [0, 1, 2, 3, 4, 5, 7];
const plainColName = (c: string) => c.replace(/\*/g, '');

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

const exportOpen = ref(false);
const checkedRows = computed(() => {
  const keys = new Set(checkedRowKeys.value);
  return allRows.value.filter((r) => keys.has(r.key));
});

function onExport(scope: 'checked' | 'filtered') {
  exportOpen.value = false;
  const rows = scope === 'checked' ? checkedRows.value : displayRows.value;
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
  lines: ImportLine[];
}
const importResult = ref<ImportResult | null>(null);
const countKind = (k: ImportKind) => importResult.value?.lines.filter((l) => l.kind === k).length ?? 0;
const importStats = computed(() => ({
  total: importResult.value?.lines.length ?? 0,
  added: countKind('新增'),
  updated: countKind('更新'),
  existed: countKind('已存在'),
  failed: countKind('失败'),
}));

function openImport() { importResult.value = null; importOpen.value = true; }

const normHeader = (h: string) => h.replace(/[\s*＊]/g, '');
/** 表头须与模板一致（忽略必填星号与空格）；允许末尾多一列「失败原因」（失败明细直接重传） */
function headerMatchesTemplate(header: string[]) {
  const cells = header.map(normHeader);
  while (cells.length && !cells[cells.length - 1]) cells.pop();
  const tpl = TEMPLATE_COLS.map(normHeader);
  const extraOk = cells.length === tpl.length
    || (cells.length === tpl.length + 1 && cells[tpl.length] === FAIL_REASON_COL);
  return extraOk && tpl.every((c, i) => cells[i] === c);
}

function analyzeImport(fileName: string, text: string): ImportResult {
  const [header = [], ...body] = parseCsv(text);
  const dataRows = body.filter((r) => r.some((c) => c.trim() !== ''));
  const headerOk = headerMatchesTemplate(header);
  const teamSet = new Set(TEAMS);
  const leafIndex = new Map(allRows.value.map((r) => [nodeKeyOf(r.productKey, [r.tagL1, r.tagL2, r.tagL3], 3), r]));
  const owners: Record<TagLevel, Map<string, string>> = {
    1: idOwners(1, allRows.value), 2: idOwners(2, allRows.value), 3: idOwners(3, allRows.value),
  };
  const seen = new Set<string>();
  const lines: ImportLine[] = [];

  for (const raw of dataRows) {
    const cells = TEMPLATE_COLS.map((_, i) => raw[i] ?? '');
    const fail = (reason: string) => {
      lines.push({ cells, kind: '失败', reason, team: '', aftersale: '否', summaryOnly: '否', ids: {} });
    };
    if (!headerOk) { fail('表头与模板不一致'); continue; }

    const [bizType, prodCat, prodName, l1, l2, l3, teamRaw, afRaw, soRaw, id1, id2, id3] = cells;
    const missing = REQUIRED_COL_IDX.filter((i) => !cells[i].trim()).map((i) => plainColName(TEMPLATE_COLS[i]));
    if (missing.length) { fail(`必填列为空：${missing.join('、')}`); continue; }

    // 产品按 业务类型 + 产品分类 + 产品名称 完全匹配（空格、中英文括号均计入）
    const prod = PRODUCT_INFOS.find((p) => p.bizType === bizType && p.prodCat === prodCat && p.name === prodName);
    if (!prod) { fail('产品未找到：请先在产品管理中新增该产品'); continue; }

    const team = teamRaw.trim();
    if (team && !teamSet.has(team)) { fail('处理组不在枚举'); continue; }
    const af = afRaw.trim();
    if (af !== '是' && af !== '否') { fail('是否售后取值非法'); continue; }
    const so = soRaw.trim() || '否';
    if (so !== '是' && so !== '否') { fail('是否小结专用取值非法'); continue; }

    const path: [string, string, string] = [l1, l2, l3];
    const leafKey = nodeKeyOf(prod.key, path, 3);
    if (seen.has(leafKey)) { fail('文件内重复'); continue; }

    const ids: Record<TagLevel, string> = { 1: id1.trim(), 2: id2.trim(), 3: id3.trim() };
    const idTaken = ([1, 2, 3] as TagLevel[]).some((lv) => {
      const owner = ids[lv] ? owners[lv].get(ids[lv]) : undefined;
      return !!owner && owner !== nodeKeyOf(prod.key, path, lv);
    });
    if (idTaken) { fail('老系统 ID 已被其他分类占用'); continue; }
    seen.add(leafKey);

    const base = { cells, reason: '', productKey: prod.key, path, team, aftersale: af, summaryOnly: so, ids } as const;
    const exist = leafIndex.get(leafKey);
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
  }
  return { fileName, lines };
}

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    importResult.value = analyzeImport(f.name, String(reader.result ?? ''));
    input.value = '';
  };
  reader.readAsText(f, 'utf-8');
}

/** 失败明细：只含失败行，列＝模板列 + 末列「失败原因」 */
function downloadImportFailures(res: ImportResult | null = importResult.value) {
  const fails = res?.lines.filter((l) => l.kind === '失败') ?? [];
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
  if (!res) return;
  const stamp = stampNow();
  let added = 0;
  let updated = 0;
  for (const ln of res.lines) {
    if (ln.kind === '新增' && ln.productKey && ln.path) {
      const [tagL1, tagL2, tagL3] = ln.path;
      allRows.value.unshift({
        key: String(rowSeq++),
        productKey: ln.productKey,
        productName: pinfo(ln.productKey).name,
        tagL1, tagL2, tagL3,
        team: ln.team, aftersale: ln.aftersale, summaryOnly: ln.summaryOnly, status: '启用',
        ...resolveTagIds(ln.productKey, ln.path, ln.ids),
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
  importOpen.value = false;
  checkedRowKeys.value = [];
  const failed = res.lines.filter((l) => l.kind === '失败').length;
  const text = `导入完成：新增 ${added} 条、更新 ${updated} 条`;
  if (!failed) { message.success(text); return; }
  message.success({
    content: () => h('span', [
      `${text}；失败 ${failed} 条，可`,
      h('a', { onClick: () => downloadImportFailures(res) }, '下载失败明细'),
    ]),
    duration: 6,
  });
}
</script>

<template>
  <div class="problem-tag-manage">
    <AdminPageHeader
      title="问题分类"
      subtitle="按产品维护三级问题分类，关联处理组与是否售后。"
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
            <div class="fi">
              <span class="fl">BGBU</span>
              <a-select v-model:value="draftFilter.bgbu" class="tb-ctl sel-w-lg" size="small" allow-clear placeholder="全部" :options="productDimOpts('bgbu')" />
            </div>
            <div class="fi">
              <span class="fl">业务线</span>
              <a-select v-model:value="draftFilter.bizLine" class="tb-ctl sel-w-lg" size="small" allow-clear placeholder="全部" :options="productDimOpts('bizLine')" />
            </div>
            <div class="fi">
              <span class="fl">产品线</span>
              <a-select v-model:value="draftFilter.prodLine" class="tb-ctl sel-w-lg" size="small" allow-clear placeholder="全部" :options="productDimOpts('prodLine')" />
            </div>
            <div class="fi">
              <span class="fl">业务类型</span>
              <a-select v-model:value="draftFilter.bizType" class="tb-ctl sel-w" size="small" allow-clear placeholder="全部" :options="productDimOpts('bizType')" />
            </div>
            <div class="fi">
              <span class="fl">产品分类</span>
              <a-select v-model:value="draftFilter.prodCat" class="tb-ctl sel-w" size="small" allow-clear placeholder="全部" :options="productDimOpts('prodCat')" />
            </div>
            <div class="fi">
              <span class="fl">产品名称</span>
              <a-select
                v-model:value="draftFilter.prodName"
                class="tb-ctl sel-w-lg"
                size="small"
                show-search
                allow-clear
                placeholder="全部"
                :filter-option="filterByLabel"
                :options="productDimOpts('prodName')"
              />
            </div>
            <div class="fi">
              <span class="fl">处理组</span>
              <a-select v-model:value="draftFilter.team" class="tb-ctl sel-w" size="small" allow-clear placeholder="全部" :options="toOpts(TEAMS)" />
            </div>
            <div class="fi">
              <span class="fl">是否售后</span>
              <a-select v-model:value="draftFilter.aftersale" class="tb-ctl sel-w-sm" size="small" allow-clear placeholder="全部" :options="toOpts(['是', '否'])" />
            </div>
            <div class="fi">
              <span class="fl">是否小结专用</span>
              <a-select v-model:value="draftFilter.summaryOnly" class="tb-ctl sel-w-sm" size="small" allow-clear placeholder="全部" :options="toOpts(['是', '否'])" />
            </div>
            <div class="fi">
              <span class="fl">状态</span>
              <a-select v-model:value="draftFilter.status" class="tb-ctl sel-w-sm" size="small" allow-clear placeholder="全部" :options="toOpts(['启用', '停用'])" />
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
                    <a-menu-item :disabled="!hasRowSelection" @click="onBatch('处理组')">处理组</a-menu-item>
                    <a-menu-item :disabled="!hasRowSelection" @click="onBatch('启用')">启用</a-menu-item>
                    <a-menu-item :disabled="!hasRowSelection" @click="onBatch('停用')">停用</a-menu-item>
                    <template v-if="isAdmin">
                      <a-menu-divider />
                      <a-menu-item :disabled="!hasRowSelection" danger @click="onBatch('删除')">删除</a-menu-item>
                    </template>
                  </a-menu>
                </template>
              </a-dropdown>
              <a-dropdown v-model:open="exportOpen" trigger="click" placement="bottomRight">
                <div class="wb-toolbar__btn">
                  <DownloadOutlined :style="{ color: '#6B7280', fontSize: '14px' }" />
                  <span>导出</span>
                  <DownOutlined :style="{ color: '#9CA3AF', fontSize: '12px' }" />
                </div>
                <template #overlay>
                  <a-menu class="batch-menu">
                    <a-menu-item :disabled="!checkedRows.length" @click="onExport('checked')">导出已勾选（{{ checkedRows.length }} 条）</a-menu-item>
                    <a-menu-item :disabled="!displayRows.length" @click="onExport('filtered')">导出全部筛选结果（{{ displayRows.length }} 条）</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
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
            <span v-else-if="column.key === 'tagL3'" class="tag-path" :title="tagPath(record as ProblemTagRow)">
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
          <template #emptyText>
            <div class="empty-hint">没有符合条件的问题分类，可调整筛选或点击「新增」</div>
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
      :ok-text="editingKey ? '确定' : '确定'"
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
              placeholder="搜索或逐级选择产品（可按事业部 / 业务线 / 产品线 / 分类 / 产品名 任意节点搜索）"
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
            <div v-else-if="!editingKey" class="prod-hint">
              找不到产品？请到
              <a class="prod-hint-link" @click.prevent="goProductManage">产品管理</a>
              新增后再回来选择
            </div>
          </div>
        </a-form-item>

        <a-form-item label="一级分类" required>
          <a-auto-complete
            v-model:value="form.tagL1"
            class="cat-input-full"
            placeholder="搜索已有或输入新分类"
            :options="formTagL1Opts"
            :filter-option="filterByValue"
          />
        </a-form-item>
        <a-form-item label="二级分类" required>
          <a-auto-complete
            v-model:value="form.tagL2"
            class="cat-input-full"
            placeholder="搜索已有或输入新分类"
            :options="formTagL2Opts"
            :disabled="!form.tagL1.trim()"
            :filter-option="filterByValue"
          />
        </a-form-item>
        <a-form-item label="三级分类" required>
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
          <a-select v-model:value="form.team" placeholder="请选择" show-search allow-clear :options="toOpts(TEAMS)" />
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
        <a-form-item label="状态">
          <a-radio-group v-model:value="form.status" button-style="solid">
            <a-radio-button value="启用">启用</a-radio-button>
            <a-radio-button value="停用">停用</a-radio-button>
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
      <p class="batch-team-hint">将更新已选 {{ checkedRowKeys.length }} 条问题分类的处理组，三级路径与其它字段不变。</p>
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
        <a-button @click="importOpen = false">取消</a-button>
        <a-button v-if="!importResult" type="primary" disabled>开始导入</a-button>
        <template v-else-if="importStats.updated > 0">
          <a-button :disabled="importStats.added === 0" @click="doImport(false)">仅导入新增 {{ importStats.added }} 条</a-button>
          <a-button type="primary" @click="doImport(true)">导入新增并更新（{{ importStats.added }} + {{ importStats.updated }} 条）</a-button>
        </template>
        <a-button v-else type="primary" :disabled="importStats.added === 0" @click="doImport(false)">确认导入 {{ importStats.added }} 条</a-button>
      </template>
      <div class="import-panel">
        <label class="dropzone">
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

        <ul v-if="!importResult" class="import-tips">
          <li>支持 csv，首行须为表头（同模板）</li>
          <li>业务类型 + 产品分类 + 产品名称需与产品管理完全一致</li>
        </ul>

        <div v-else class="import-result">
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
  padding: 6px 12px; border-bottom: 1px solid #f0f2f5;
}
.toolbar-row {
  display: flex; align-items: center; gap: 6px 14px; flex-wrap: wrap; width: 100%;
}
.fi-group {
  display: flex; align-items: center; gap: 8px; flex: none;
  padding: 2px 8px; border-radius: 6px; background: #f9fafb;
}
.fi { display: flex; align-items: center; gap: 6px; flex: none; }
.fl { font-size: 12px; color: #6b7280; white-space: nowrap; }
.sel-w { width: 108px !important; }
.sel-w-lg { width: 168px !important; }
.sel-w-sm { width: 80px !important; }
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
  margin: 0; padding: 8px 12px 8px 28px; border-radius: 8px;
  background: #f9fafb; border: 1px solid #eef0f2;
  font-size: 12px; color: #6b7280; line-height: 1.8;
}
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
