<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, ReloadOutlined, SearchOutlined,
  ImportOutlined, DownloadOutlined, InboxOutlined,
  UnorderedListOutlined, DownOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { stdPagination } from '@/config/adminUi';
import {
  PRODUCT_TREE_DATA, PRODUCT_TREE_DEFAULT_EXPANDED,
  collectProductKeysUnder, filterProductTree, listProductNodes,
  productTitleByKey, productMetaByKey, type ProductTreeNode,
} from '@/mock/productTree';

const KIND_LABEL: Record<ProductTreeNode['kind'], string> = {
  BGBU: 'BGBU', 业务线: '业务线', 产品线: '产品线', 产品分类: '分类', 产品: '产品',
};
const KIND_CLASS: Record<ProductTreeNode['kind'], string> = {
  BGBU: 'kind-bg', 业务线: 'kind-biz', 产品线: 'kind-line', 产品分类: 'kind-cat', 产品: 'kind-prod',
};

interface ProblemTagRow {
  key: string;
  productKey: string;
  productName: string;
  bizType: string;
  prodCat: string;
  tagL1: string;
  tagL2: string;
  tagL3: string;
  team: string;
  aftersale: '是' | '否';
  status: '启用' | '停用';
}

const treeSearch = ref('');
const expandedKeys = ref<string[]>([...PRODUCT_TREE_DEFAULT_EXPANDED]);
const selectedKeys = ref<string[]>([]);
const selectedTreeKey = computed(() => selectedKeys.value[0] ?? null);

/** 各产品下的问题分类条数（按 allRows 实时统计） */
const countByProduct = computed(() => {
  const map: Record<string, number> = {};
  for (const r of allRows.value) map[r.productKey] = (map[r.productKey] ?? 0) + 1;
  return map;
});

/** 递归给树节点附加 cnt（产品取自身数量，父节点汇总子孙） */
function decorateTreeCount(nodes: ProductTreeNode[]): (ProductTreeNode & { cnt: number })[] {
  return nodes.map((n) => {
    const kids = n.children?.length ? decorateTreeCount(n.children) : undefined;
    const cnt = n.kind === '产品'
      ? (countByProduct.value[n.key] ?? 0)
      : (kids?.reduce((s, k) => s + k.cnt, 0) ?? 0);
    return { ...n, cnt, children: kids };
  });
}

const visibleTree = computed(() =>
  decorateTreeCount(filterProductTree(PRODUCT_TREE_DATA, treeSearch.value)),
);

watch(treeSearch, (kw) => {
  if (!kw.trim()) return;
  const keys: string[] = [];
  function walk(nodes: ProductTreeNode[]) {
    for (const n of nodes) {
      keys.push(n.key);
      if (n.children?.length) walk(n.children);
    }
  }
  walk(visibleTree.value);
  expandedKeys.value = keys;
});

/**
 * 筛选项排序（左→右）：
 * 第1行：业务类型 → 产品分类 → [产品名称+处理组]
 * 第2行：是否售后 → 状态 → 分类名称 → 查询/重置
 */
const emptyFilter = () => ({
  bizType: undefined as string | undefined,
  prodCat: undefined as string | undefined,
  prodName: undefined as string | undefined,
  tagKeyword: '',
  team: undefined as string | undefined,
  aftersale: undefined as string | undefined,
  status: undefined as string | undefined,
});
const draftFilter = reactive(emptyFilter());
const appliedFilter = reactive(emptyFilter());

const BIZ_TYPES = ['智能硬件', 'AI服务'];
const PROD_CATS = ['录音笔系列', '翻译机系列', '智能服务'];
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

const productOptions = computed(() =>
  listProductNodes().map((p) => ({ value: p.key, label: p.title })),
);
const prodNameSelectOpts = computed(() =>
  productOptions.value.map((p) => ({ value: p.label, label: p.label })),
);
const toOpts = (items: string[]) => items.map((v) => ({ value: v, label: v }));

const allRows = ref<ProblemTagRow[]>([
  { key: '1', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '智能硬件', prodCat: '录音笔系列', tagL1: '云空间', tagL2: '操作指导', tagL3: '如何领取/升级云空间', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '2', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '智能硬件', prodCat: '录音笔系列', tagL1: '云空间', tagL2: '功能介绍', tagL3: '云空间存储大小咨询', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '3', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '智能硬件', prodCat: '录音笔系列', tagL1: '我的文件', tagL2: '功能介绍', tagL3: '文件名称是否支持添加符号', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '4', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '智能硬件', prodCat: '录音笔系列', tagL1: '我的文件', tagL2: '软件问题', tagL3: '邮件分享失败', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '5', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '智能硬件', prodCat: '录音笔系列', tagL1: '相机', tagL2: '功能介绍', tagL3: '视频是否支持实时字幕', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '6', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '智能硬件', prodCat: '录音笔系列', tagL1: '网络', tagL2: '功能介绍', tagL3: '是否支持修改IP地址', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '7', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '智能硬件', prodCat: '录音笔系列', tagL1: '账号/密码', tagL2: '操作指导', tagL3: '如何退出/切换账号', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '8', productKey: 'p-h2', productName: '讯飞录音笔H2', bizType: '智能硬件', prodCat: '录音笔系列', tagL1: '云空间', tagL2: '操作指导', tagL3: '如何上传/查看/编辑/下载/删除文件', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '9', productKey: 'p-h2', productName: '讯飞录音笔H2', bizType: '智能硬件', prodCat: '录音笔系列', tagL1: '云空间', tagL2: '软件问题', tagL3: '无法领取云空间', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '10', productKey: 'p-h2', productName: '讯飞录音笔H2', bizType: '智能硬件', prodCat: '录音笔系列', tagL1: '我的文件', tagL2: '功能介绍', tagL3: '文件已上传云空间是否支持直接转写', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '11', productKey: 'p-h2', productName: '讯飞录音笔H2', bizType: '智能硬件', prodCat: '录音笔系列', tagL1: '我的文件', tagL2: '软件问题', tagL3: '文件日期/时间显示异常', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '12', productKey: 'p-h2', productName: '讯飞录音笔H2', bizType: '智能硬件', prodCat: '录音笔系列', tagL1: '云空间', tagL2: '功能介绍', tagL3: '导出格式咨询', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '13', productKey: 'p-h2', productName: '讯飞录音笔H2', bizType: '智能硬件', prodCat: '录音笔系列', tagL1: '整机/设备', tagL2: '功能介绍', tagL3: '录音笔IP地址咨询', team: '工单-处理', aftersale: '否', status: '停用' },
  { key: '14', productKey: 'p1', productName: '三防翻译机', bizType: '智能硬件', prodCat: '翻译机系列', tagL1: '语音翻译', tagL2: '操作指导', tagL3: '如何切换男声女声', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '15', productKey: 'p1', productName: '三防翻译机', bizType: '智能硬件', prodCat: '翻译机系列', tagL1: '语音翻译', tagL2: '软件问题', tagL3: '翻译结果没有语音播报', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '16', productKey: 'p1', productName: '三防翻译机', bizType: '智能硬件', prodCat: '翻译机系列', tagL1: '会议/会话翻译', tagL2: '软件问题', tagL3: '翻译延迟/卡顿/反应慢', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '17', productKey: 'p1', productName: '三防翻译机', bizType: '智能硬件', prodCat: '翻译机系列', tagL1: '屏幕', tagL2: '功能异常', tagL3: '显示内容异常(图标/乱码/字体/方向等)', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '18', productKey: 'p1', productName: '三防翻译机', bizType: '智能硬件', prodCat: '翻译机系列', tagL1: '记录导出', tagL2: '操作指导', tagL3: '如何导出翻译记录', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '19', productKey: 'p1', productName: '三防翻译机', bizType: '智能硬件', prodCat: '翻译机系列', tagL1: '售后', tagL2: '服务申请', tagL3: '维修请求', team: '工单-售后', aftersale: '是', status: '启用' },
  { key: '20', productKey: 'p1', productName: '三防翻译机', bizType: '智能硬件', prodCat: '翻译机系列', tagL1: '售后', tagL2: '政策咨询', tagL3: '退换货政策', team: '工单-售后', aftersale: '是', status: '启用' },
  { key: '21', productKey: 'p2', productName: '汉维翻译机', bizType: '智能硬件', prodCat: '翻译机系列', tagL1: '会议/会话翻译', tagL2: '软件问题', tagL3: '翻译失败(服务准备中,请稍等)', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '22', productKey: 'p2', productName: '汉维翻译机', bizType: '智能硬件', prodCat: '翻译机系列', tagL1: '会议/会话翻译', tagL2: '软件问题', tagL3: '无法切换翻译识别模式', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '23', productKey: 'p2', productName: '汉维翻译机', bizType: '智能硬件', prodCat: '翻译机系列', tagL1: '语音翻译', tagL2: '软件问题', tagL3: '翻译结果没有语音播报', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '24', productKey: 'p2', productName: '汉维翻译机', bizType: '智能硬件', prodCat: '翻译机系列', tagL1: '蓝牙', tagL2: '操作指导', tagL3: '如何断开连接', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '25', productKey: 'p2', productName: '汉维翻译机', bizType: '智能硬件', prodCat: '翻译机系列', tagL1: '整机/设备', tagL2: '信息咨询', tagL3: '设备丢失', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '26', productKey: 'p2', productName: '汉维翻译机', bizType: '智能硬件', prodCat: '翻译机系列', tagL1: '售后', tagL2: '问题反馈', tagL3: '设备维修后故障仍存在', team: '工单-售后', aftersale: '是', status: '停用' },
  { key: '27', productKey: 'p3', productName: '讯飞智能质检系统V1.0', bizType: 'AI服务', prodCat: '智能服务', tagL1: '账号/密码', tagL2: '操作指导', tagL3: '如何退出/切换账号', team: '工单-二线', aftersale: '否', status: '启用' },
  { key: '28', productKey: 'p3', productName: '讯飞智能质检系统V1.0', bizType: 'AI服务', prodCat: '智能服务', tagL1: '网络', tagL2: '功能介绍', tagL3: '是否支持修改IP地址', team: '工单-二线', aftersale: '否', status: '启用' },
  { key: '29', productKey: 'p3', productName: '讯飞智能质检系统V1.0', bizType: 'AI服务', prodCat: '智能服务', tagL1: '设置/系统', tagL2: '软件问题', tagL3: '加载失败/打不开/闪退', team: '工单-二线', aftersale: '否', status: '启用' },
]);
let rowSeq = allRows.value.length + 1;

function matchSelect(val: string | undefined, field: string) {
  return !val || field === val;
}

function matchTagKeyword(keyword: string, row: ProblemTagRow) {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  const hay = `${row.tagL1} ${row.tagL2} ${row.tagL3} ${row.tagL1}/${row.tagL2}/${row.tagL3}`.toLowerCase();
  return hay.includes(kw);
}

const displayRows = computed(() => {
  const treeProducts = collectProductKeysUnder(selectedTreeKey.value);
  return allRows.value.filter((r) => {
    if (selectedTreeKey.value) {
      if (!treeProducts?.size) return false;
      if (!treeProducts.has(r.productKey)) return false;
    }
    if (!matchSelect(appliedFilter.bizType, r.bizType)) return false;
    if (!matchSelect(appliedFilter.prodCat, r.prodCat)) return false;
    if (!matchSelect(appliedFilter.prodName, r.productName)) return false;
    if (!matchTagKeyword(appliedFilter.tagKeyword, r)) return false;
    if (!matchSelect(appliedFilter.team, r.team)) return false;
    if (!matchSelect(appliedFilter.aftersale, r.aftersale)) return false;
    if (!matchSelect(appliedFilter.status, r.status)) return false;
    return true;
  });
});

const cols = [
  { title: '产品名称', dataIndex: 'productName', key: 'productName', width: 180 },
  { title: '一级分类', dataIndex: 'tagL1', key: 'tagL1', width: 88, className: 'col-cat-l1' },
  { title: '二级分类', dataIndex: 'tagL2', key: 'tagL2', width: 88, className: 'col-cat-l2' },
  { title: '三级分类', dataIndex: 'tagL3', key: 'tagL3', width: 140 },
  { title: '处理组', dataIndex: 'team', key: 'team', width: 120 },
  { title: '是否售后', dataIndex: 'aftersale', key: 'aftersale', width: 90 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
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

function onBatch(action: string) {
  if (!checkedRowKeys.value.length) return;
  batchOpen.value = false;
  if (action === '导出') onExport();
  else if (action === '删除') batchDelete();
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
const tagL1List = ref([...TAG_L1]);
const tagL2Map = ref<Record<string, string[]>>({ ...TAG_L2_MAP });
const tagL3Map = ref<Record<string, string[]>>({ ...TAG_L3_MAP });

const form = reactive({
  bizType: undefined as string | undefined,
  prodCat: undefined as string | undefined,
  productKey: undefined as string | undefined,
  tagL1: '',
  tagL2: '',
  tagL3: '',
  team: undefined as string | undefined,
  aftersale: '否' as '是' | '否',
  status: '启用' as '启用' | '停用',
});

const formProdCatOpts = computed(() => {
  const cats = new Set<string>();
  for (const p of listProductNodes()) {
    const meta = productMetaByKey(p.key);
    if (form.bizType && meta.bizType !== form.bizType) continue;
    cats.add(meta.prodCat);
  }
  return [...cats].map((v) => ({ value: v, label: v }));
});

const formProductOpts = computed(() =>
  listProductNodes()
    .filter((p) => {
      const meta = productMetaByKey(p.key);
      if (form.bizType && meta.bizType !== form.bizType) return false;
      if (form.prodCat && meta.prodCat !== form.prodCat) return false;
      return true;
    })
    .map((p) => ({ value: p.key, label: p.title })),
);

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

watch(() => form.bizType, () => {
  if (editingKey.value) return;
  form.prodCat = undefined;
  form.productKey = undefined;
});
watch(() => form.prodCat, () => {
  if (editingKey.value) return;
  form.productKey = undefined;
});
watch(() => form.productKey, (key) => {
  if (!key || editingKey.value) return;
  const meta = productMetaByKey(key);
  form.bizType = meta.bizType;
  form.prodCat = meta.prodCat;
});
watch(() => form.tagL1, () => {
  form.tagL2 = '';
  form.tagL3 = '';
});
watch(() => form.tagL2, () => { form.tagL3 = ''; });

function ensureTagOption(list: string[], val: string) {
  const v = val.trim();
  if (v && !list.includes(v)) list.push(v);
  return v;
}

function resetForm() {
  Object.assign(form, {
    bizType: undefined, prodCat: undefined, productKey: undefined,
    tagL1: '', tagL2: '', tagL3: '',
    team: '工单-处理', aftersale: '否', status: '启用',
  });
}

function openAdd() {
  editingKey.value = null;
  resetForm();
  const treeProducts = collectProductKeysUnder(selectedTreeKey.value);
  const defaultProduct = treeProducts?.size === 1 ? [...treeProducts][0] : undefined;
  if (defaultProduct) {
    const meta = productMetaByKey(defaultProduct);
    form.bizType = meta.bizType;
    form.prodCat = meta.prodCat;
    form.productKey = defaultProduct;
  }
  formOpen.value = true;
}

function openEditRow(row: ProblemTagRow) {
  editingKey.value = row.key;
  Object.assign(form, {
    bizType: row.bizType,
    prodCat: row.prodCat,
    productKey: row.productKey,
    tagL1: row.tagL1, tagL2: row.tagL2, tagL3: row.tagL3,
    team: row.team, aftersale: row.aftersale, status: row.status,
  });
  formOpen.value = true;
}

function saveForm() {
  const tagL1 = form.tagL1.trim();
  const tagL2 = form.tagL2.trim();
  const tagL3 = form.tagL3.trim();
  if (!form.bizType || !form.prodCat || !form.productKey || !tagL1 || !tagL2 || !tagL3 || !form.team) {
    message.error('请完整填写业务类型、产品、三级分类与处理组');
    return;
  }
  ensureTagOption(tagL1List.value, tagL1);
  if (!tagL2Map.value[tagL1]) tagL2Map.value[tagL1] = [];
  ensureTagOption(tagL2Map.value[tagL1], tagL2);
  if (!tagL3Map.value[tagL2]) tagL3Map.value[tagL2] = [];
  ensureTagOption(tagL3Map.value[tagL2], tagL3);

  const meta = productMetaByKey(form.productKey);
  const payload: ProblemTagRow = {
    key: editingKey.value ?? String(rowSeq++),
    productKey: form.productKey,
    productName: productTitleByKey(form.productKey),
    bizType: meta.bizType,
    prodCat: meta.prodCat,
    tagL1, tagL2, tagL3,
    team: form.team,
    aftersale: form.aftersale,
    status: form.status,
  };
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
  message.success(checked ? '已启用' : '已停用');
}

function delRow(row: ProblemTagRow) {
  Modal.confirm({
    title: '删除问题分类',
    content: `确定删除「${row.productName} · ${tagPath(row)}」？删除后新建工单不可再选。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      const i = allRows.value.findIndex((r) => r.key === row.key);
      if (i >= 0) allRows.value.splice(i, 1);
      checkedRowKeys.value = checkedRowKeys.value.filter((k) => k !== row.key);
      message.success('已删除');
    },
  });
}

function downloadCsv(filename: string, header: string, lines: string[]) {
  const csv = `\uFEFF${header}\n${lines.join('\n')}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadTemplate() {
  downloadCsv(
    '问题分类导入模板.csv',
    '产品名称,一级分类,二级分类,三级分类,处理组,是否售后,状态',
    ['讯飞录音笔H1,云空间,操作指导,如何领取/升级云空间,工单-处理,否,启用'],
  );
  message.success('已下载导入模板');
}

function rowsToCsvLines(rows: ProblemTagRow[]) {
  return rows.map((r) => [r.productName, r.tagL1, r.tagL2, r.tagL3, r.team, r.aftersale, r.status].join(','));
}

function onExport() {
  if (!checkedRowKeys.value.length) {
    message.warning('请先勾选要导出的记录');
    return;
  }
  const rows = displayRows.value.filter((r) => checkedRowKeys.value.includes(r.key));
  if (!rows.length) {
    message.warning('所选记录不在当前列表中，请重新勾选');
    checkedRowKeys.value = [];
    return;
  }
  downloadCsv(
    `问题分类导出_${new Date().toISOString().slice(0, 10)}.csv`,
    '产品名称,一级分类,二级分类,三级分类,处理组,是否售后,状态',
    rowsToCsvLines(rows),
  );
  message.success(`已导出 ${rows.length} 条`);
}

const importOpen = ref(false);
/** 解析结果：仅展示统计数字，不展示逐行预览（量大时预览不可读） */
interface ImportResult { fileName: string; total: number; dup: number; invalid: number; rows: ProblemTagRow[]; }
const importResult = ref<ImportResult | null>(null);
const importCount = computed(() => importResult.value?.rows.length ?? 0);

function openImport() { importResult.value = null; importOpen.value = true; }

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? '');
    const lines = text.split(/\r?\n/).slice(1).filter((l) => l.trim());
    const teamSet = new Set(TEAMS);
    const existing = new Set(allRows.value.map((r) => `${r.productName}|${r.tagL1}|${r.tagL2}|${r.tagL3}`));
    const seen = new Set<string>();
    let dup = 0;
    let invalid = 0;
    const rows: ProblemTagRow[] = [];
    for (const line of lines) {
      const [productName, tagL1, tagL2, tagL3, team, aftersale, status] = line.split(',').map((s) => (s ?? '').trim());
      const prod = listProductNodes().find((p) => p.title === productName);
      const validAfter = aftersale === '是' || aftersale === '否';
      // 无效：产品未匹配 / 三级路径有空 / 处理组不在枚举 / 是否售后取值非法
      if (!prod || !tagL1 || !tagL2 || !tagL3 || !teamSet.has(team) || !validAfter) { invalid++; continue; }
      const sig = `${productName}|${tagL1}|${tagL2}|${tagL3}`;
      // 重复：与存量已有 或 批内已出现
      if (existing.has(sig) || seen.has(sig)) { dup++; continue; }
      seen.add(sig);
      const meta = productMetaByKey(prod.key);
      rows.push({
        key: `import-${rows.length}`,
        productKey: prod.key,
        productName, bizType: meta.bizType, prodCat: meta.prodCat,
        tagL1, tagL2, tagL3, team,
        aftersale: aftersale as '是' | '否',
        status: (status === '停用' ? '停用' : '启用') as '启用' | '停用',
      });
    }
    importResult.value = { fileName: f.name, total: lines.length, dup, invalid, rows };
    input.value = ''; // 允许重新选择同一文件
  };
  reader.readAsText(f, 'utf-8');
}

function doImport() {
  const res = importResult.value;
  if (!res || !res.rows.length) { message.warning('没有可导入的记录'); return; }
  for (const row of res.rows) allRows.value.unshift({ ...row, key: String(rowSeq++) });
  importOpen.value = false;
  message.success(`导入完成：新增 ${res.rows.length} 条，重复跳过 ${res.dup} 条，无效跳过 ${res.invalid} 条`);
}
</script>

<template>
  <div class="problem-tag-manage">
    <AdminPageHeader
      title="问题分类"
      subtitle="按产品维护三级问题分类，关联处理组与是否售后；左侧产品树选中后仅展示该节点下分类。"
    >
      <template #actions>
        <a-button @click="openImport"><template #icon><ImportOutlined /></template>导入</a-button>
        <a-button type="primary" @click="openAdd"><template #icon><PlusOutlined /></template>新增</a-button>
      </template>
    </AdminPageHeader>

    <div class="cols">
    <div class="left">
      <div class="panel-head">
        <span class="p-title">产品树</span>
      </div>
      <a-input-search v-model:value="treeSearch" class="tree-search" placeholder="搜索产品树..." allow-clear size="small" />
      <a-tree
        v-model:expanded-keys="expandedKeys"
        v-model:selected-keys="selectedKeys"
        :tree-data="visibleTree"
        :indent="22"
        block-node
        class="prod-tree"
      >
        <template #title="node">
          <span class="node">
            <span class="node-name" :title="node.title">{{ node.title }}</span>
            <span class="node-meta">
              <span class="node-kind" :class="KIND_CLASS[node.kind as ProductTreeNode['kind']]">{{ KIND_LABEL[node.kind as ProductTreeNode['kind']] }}</span>
              <span v-if="node.cnt > 0" class="node-cnt" title="问题分类数量">{{ node.cnt }}</span>
            </span>
          </span>
        </template>
      </a-tree>
    </div>

    <div class="right body body--list">
      <div class="list-card">
        <div class="list-toolbar">
          <div class="toolbar-row">
            <div class="fi">
              <span class="fl">业务类型</span>
              <a-select v-model:value="draftFilter.bizType" class="tb-ctl sel-w" size="small" allow-clear placeholder="全部" :options="toOpts(BIZ_TYPES)" />
            </div>
            <div class="fi">
              <span class="fl">产品分类</span>
              <a-select v-model:value="draftFilter.prodCat" class="tb-ctl sel-w" size="small" allow-clear placeholder="全部" :options="toOpts(PROD_CATS)" />
            </div>
            <div class="fi-group">
              <div class="fi">
                <span class="fl">产品名称</span>
                <a-select
                  v-model:value="draftFilter.prodName"
                  class="tb-ctl sel-w-lg"
                  size="small"
                  show-search
                  allow-clear
                  placeholder="全部"
                  :filter-option="(input: string, opt: { label?: string }) => (opt?.label ?? '').includes(input)"
                  :options="prodNameSelectOpts"
                />
              </div>
              <div class="fi">
                <span class="fl">处理组</span>
                <a-select v-model:value="draftFilter.team" class="tb-ctl sel-w" size="small" allow-clear placeholder="全部" :options="toOpts(TEAMS)" />
              </div>
            </div>
            <div class="fi">
              <span class="fl">是否售后</span>
              <a-select v-model:value="draftFilter.aftersale" class="tb-ctl sel-w-sm" size="small" allow-clear placeholder="全部" :options="toOpts(['是', '否'])" />
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
                    <a-menu-item :disabled="!hasRowSelection" @click="onBatch('导出')">导出</a-menu-item>
                    <a-menu-item :disabled="!hasRowSelection" danger @click="onBatch('删除')">删除</a-menu-item>
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
          :scroll="{ x: 1000, y: 'calc(100vh - 380px)' }"
        >
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'productName'" class="cell-link" @click="openEditRow(record as ProblemTagRow)">
              {{ (record as ProblemTagRow).productName }}
            </span>
            <span v-else-if="column.key === 'tagL3'" class="tag-path" :title="tagPath(record as ProblemTagRow)">
              {{ (record as ProblemTagRow).tagL3 }}
            </span>
            <a-switch
              v-else-if="column.key === 'status'"
              size="small"
              :checked="(record as ProblemTagRow).status === '启用'"
              checked-children="启用"
              un-checked-children="停用"
              @change="(checked: boolean) => onListStatusChange(record as ProblemTagRow, checked)"
            />
            <div v-else-if="column.key === 'op'" class="row-ops">
              <a-button type="link" size="small" @click="openEditRow(record as ProblemTagRow)">编辑</a-button>
              <a-button type="link" size="small" danger @click="delRow(record as ProblemTagRow)">删除</a-button>
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
      :title="editingKey ? '修改问题分类' : '新增'"
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
        <a-form-item label="业务类型" required>
          <a-select
            v-model:value="form.bizType"
            placeholder="请选择或输入"
            show-search
            allow-clear
            :options="toOpts(BIZ_TYPES)"
            :disabled="!!editingKey"
          />
        </a-form-item>
        <a-form-item label="产品分类" required>
          <a-select
            v-model:value="form.prodCat"
            placeholder="请选择或输入"
            show-search
            allow-clear
            :options="formProdCatOpts"
            :disabled="!form.bizType || !!editingKey"
          />
        </a-form-item>
        <a-form-item label="产品名称" required>
          <a-select
            v-model:value="form.productKey"
            placeholder="请选择或输入"
            show-search
            allow-clear
            :options="formProductOpts"
            :disabled="!form.prodCat || !!editingKey"
          />
        </a-form-item>

        <a-form-item label="一级分类" required>
          <a-auto-complete
            v-model:value="form.tagL1"
            class="cat-input-full"
            placeholder="搜索已有或输入新分类"
            :options="formTagL1Opts"
            :filter-option="(input: string, opt: { value?: string }) => (opt?.value ?? '').includes(input)"
          />
        </a-form-item>
        <a-form-item label="二级分类" required>
          <a-auto-complete
            v-model:value="form.tagL2"
            class="cat-input-full"
            placeholder="搜索已有或输入新分类"
            :options="formTagL2Opts"
            :disabled="!form.tagL1.trim()"
            :filter-option="(input: string, opt: { value?: string }) => (opt?.value ?? '').includes(input)"
          />
        </a-form-item>
        <a-form-item label="三级分类" required>
          <a-auto-complete
            v-model:value="form.tagL3"
            class="cat-input-full"
            placeholder="搜索已有或输入新分类"
            :options="formTagL3Opts"
            :disabled="!form.tagL2.trim()"
            :filter-option="(input: string, opt: { value?: string }) => (opt?.value ?? '').includes(input)"
          />
        </a-form-item>

        <a-form-item label="处理组" required>
          <a-select v-model:value="form.team" placeholder="请选择或输入" show-search :options="toOpts(TEAMS)" />
        </a-form-item>
        <a-form-item label="是否售后">
          <a-radio-group v-model:value="form.aftersale" button-style="solid">
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
      v-model:open="importOpen"
      title="导入问题分类"
      :width="560"
      :ok-text="importResult ? `确认导入 ${importCount} 条` : '开始导入'"
      :ok-button-props="{ disabled: importCount === 0 }"
      cancel-text="取消"
      @ok="doImport"
    >
      <div class="import-panel">
        <label class="dropzone">
          <InboxOutlined class="dz-ic" />
          <div class="dz-main">
            <template v-if="importResult">{{ importResult.fileName }}</template>
            <template v-else>点击选择 Excel / CSV 文件</template>
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
          <input type="file" accept=".xlsx,.xls,.csv" hidden @change="onImportFile" />
        </label>

        <ul v-if="!importResult" class="import-tips">
          <li>支持 xlsx / xls / csv，首行须为表头（同模板）</li>
          <li>产品名称需与产品树一致，重复分类自动跳过</li>
        </ul>

        <div v-else class="import-result">
          <div class="ir-title">解析完成</div>
          <div class="ir-grid">
            <div class="ir-cell">
              <span class="ir-num">{{ importResult.total }}</span>
              <span class="ir-label">共解析</span>
            </div>
            <div class="ir-cell">
              <span class="ir-num dup">{{ importResult.dup }}</span>
              <span class="ir-label">重复跳过</span>
            </div>
            <div class="ir-cell">
              <span class="ir-num invalid">{{ importResult.invalid }}</span>
              <span class="ir-label">无效跳过</span>
            </div>
            <div class="ir-cell">
              <span class="ir-num ok">{{ importCount }}</span>
              <span class="ir-label">可导入</span>
            </div>
          </div>
          <div class="ir-hint">仅导入「可导入」条目；重复（已存在）与无效（产品未匹配 / 字段缺失）自动跳过。</div>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.problem-tag-manage { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 16px 20px; }
.problem-tag-manage :deep(.admin-page-header) { margin-bottom: 16px; }
.cols { display: flex; gap: 12px; flex: 1; min-height: 0; }

.left {
  width: 300px;
  flex: none;
  background: #fff;
  border: 1px solid #eef0f2;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.panel-head { display: flex; align-items: center; justify-content: space-between; }
.p-title { font-size: 14px; font-weight: 600; color: #111827; }
.tree-search { margin: 12px 0 4px; }
.prod-tree { flex: 1; overflow: auto; font-size: 13px; }
.node { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; }
.node-name {
  flex: 1; min-width: 0; font-size: 13px; color: #374151;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.node-meta { flex: none; display: inline-flex; align-items: center; gap: 4px; }
.node-kind {
  flex: none; padding: 0 6px; height: 20px; border-radius: 4px;
  font-size: 12px; line-height: 20px; font-weight: 500; white-space: nowrap;
}
.kind-bg { background: #eff6ff; color: #2563eb; }
.kind-biz { background: #ecfdf5; color: #059669; }
.kind-line { background: #fff7ed; color: #ea580c; }
.kind-cat { background: #fef2f2; color: #dc2626; }
.kind-prod { background: #f5f3ff; color: #7c3aed; }
.node-cnt {
  min-width: 18px; height: 18px; padding: 0 6px; border-radius: 9px;
  font-size: 11px; line-height: 18px; text-align: center; font-weight: 600;
  background: #eef4ff; color: #1a6fff;
}

/* 树对齐（参考产品管理页 / Windows 资源管理器）：缩进单元 = 展开箭头列宽 = 22px */
:deep(.prod-tree .ant-tree-treenode) { align-items: center; padding: 0; }
:deep(.prod-tree .ant-tree-indent-unit) { width: 22px; }
:deep(.prod-tree .ant-tree-switcher) {
  width: 22px; flex: none; align-self: stretch;
  display: inline-flex; align-items: center; justify-content: center;
  margin: 0; color: #8c8c8c;
}
:deep(.prod-tree .ant-tree-node-content-wrapper) {
  flex: 1; min-width: 0; padding: 4px 6px; margin: 1px 0; border-radius: 4px;
}
:deep(.prod-tree .ant-tree-node-content-wrapper:hover) { background: #f3f4f6; }
:deep(.prod-tree .ant-tree-node-content-wrapper.ant-tree-node-selected) { background: #eff6ff !important; }
:deep(.prod-tree .ant-tree-node-content-wrapper.ant-tree-node-selected .node-name) { color: #1a6fff; }

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
  display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; width: 100%;
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
.cat-input-full { width: 100%; }
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

/* 解析结果统计（不展示逐行预览） */
.import-result {
  border: 1px solid #eef0f2; border-radius: 10px; padding: 14px 16px;
  display: flex; flex-direction: column; gap: 12px;
}
.ir-title { font-size: 13px; font-weight: 600; color: #111827; }
.ir-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.ir-cell {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 8px; border-radius: 8px; background: #f9fafb;
}
.ir-num { font-size: 24px; font-weight: 700; color: #374151; line-height: 1; }
.ir-num.dup { color: #d97706; }
.ir-num.invalid { color: #dc2626; }
.ir-num.ok { color: #16a34a; }
.ir-label { font-size: 12px; color: #6b7280; }
.ir-hint { font-size: 12px; color: #9ca3af; line-height: 1.6; }
</style>
