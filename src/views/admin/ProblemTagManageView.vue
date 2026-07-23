<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
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

const router = useRouter();

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
 * 第1行：业务类型 → 产品分类 → [产品名称+处理组] → 是否售后 → 状态
 * 工具条：一级/二级分类（需业务类型+产品分类+产品名称均已选才出现）→ 分类名称搜索 → 查询/重置/批量
 */
const emptyFilter = () => ({
  bizType: undefined as string | undefined,
  prodCat: undefined as string | undefined,
  prodName: undefined as string | undefined,
  tagL1: undefined as string | undefined,
  tagL2: undefined as string | undefined,
  tagKeyword: '',
  team: undefined as string | undefined,
  aftersale: undefined as string | undefined,
  status: undefined as string | undefined,
});
const draftFilter = reactive(emptyFilter());
const appliedFilter = reactive(emptyFilter());

const BIZ_TYPES = ['消费者BG', '金融科技事业部'];
const PROD_CATS = ['录音笔产品线', '翻译机产品线', '智能客服产品线'];
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
  listProductNodes().map((p) => {
    const meta = productMetaByKey(p.key);
    return { value: p.key, label: p.title, bizType: meta.bizType, prodCat: meta.prodCat };
  }),
);
/** 产品名称下拉：按已选业务类型 / 产品分类收敛 */
const prodNameSelectOpts = computed(() =>
  productOptions.value
    .filter((p) => {
      if (draftFilter.bizType && p.bizType !== draftFilter.bizType) return false;
      if (draftFilter.prodCat && p.prodCat !== draftFilter.prodCat) return false;
      return true;
    })
    .map((p) => ({ value: p.label, label: p.label })),
);
const toOpts = (items: string[]) => items.map((v) => ({ value: v, label: v }));

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
    const hit = productOptions.value.find((p) => p.label === name);
    if (!hit) return;
    draftFilter.bizType = hit.bizType;
    draftFilter.prodCat = hit.prodCat;
  },
);

const allRows = ref<ProblemTagRow[]>([
  { key: '1', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '消费者BG', prodCat: '录音笔产品线', tagL1: '云空间', tagL2: '操作指导', tagL3: '如何领取/升级云空间', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '2', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '消费者BG', prodCat: '录音笔产品线', tagL1: '云空间', tagL2: '功能介绍', tagL3: '云空间存储大小咨询', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '3', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '消费者BG', prodCat: '录音笔产品线', tagL1: '我的文件', tagL2: '功能介绍', tagL3: '文件名称是否支持添加符号', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '4', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '消费者BG', prodCat: '录音笔产品线', tagL1: '我的文件', tagL2: '软件问题', tagL3: '邮件分享失败', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '5', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '消费者BG', prodCat: '录音笔产品线', tagL1: '相机', tagL2: '功能介绍', tagL3: '视频是否支持实时字幕', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '6', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '消费者BG', prodCat: '录音笔产品线', tagL1: '网络', tagL2: '功能介绍', tagL3: '是否支持修改IP地址', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '7', productKey: 'p-h1', productName: '讯飞录音笔H1', bizType: '消费者BG', prodCat: '录音笔产品线', tagL1: '账号/密码', tagL2: '操作指导', tagL3: '如何退出/切换账号', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '8', productKey: 'p-h2', productName: '讯飞录音笔H2', bizType: '消费者BG', prodCat: '录音笔产品线', tagL1: '云空间', tagL2: '操作指导', tagL3: '如何上传/查看/编辑/下载/删除文件', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '9', productKey: 'p-h2', productName: '讯飞录音笔H2', bizType: '消费者BG', prodCat: '录音笔产品线', tagL1: '云空间', tagL2: '软件问题', tagL3: '无法领取云空间', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '10', productKey: 'p-h2', productName: '讯飞录音笔H2', bizType: '消费者BG', prodCat: '录音笔产品线', tagL1: '我的文件', tagL2: '功能介绍', tagL3: '文件已上传云空间是否支持直接转写', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '11', productKey: 'p-h2', productName: '讯飞录音笔H2', bizType: '消费者BG', prodCat: '录音笔产品线', tagL1: '我的文件', tagL2: '软件问题', tagL3: '文件日期/时间显示异常', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '12', productKey: 'p-h2', productName: '讯飞录音笔H2', bizType: '消费者BG', prodCat: '录音笔产品线', tagL1: '云空间', tagL2: '功能介绍', tagL3: '导出格式咨询', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '13', productKey: 'p-h2', productName: '讯飞录音笔H2', bizType: '消费者BG', prodCat: '录音笔产品线', tagL1: '整机/设备', tagL2: '功能介绍', tagL3: '录音笔IP地址咨询', team: '工单-处理', aftersale: '否', status: '停用' },
  { key: '14', productKey: 'p1', productName: '三防翻译机', bizType: '消费者BG', prodCat: '翻译机产品线', tagL1: '语音翻译', tagL2: '操作指导', tagL3: '如何切换男声女声', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '15', productKey: 'p1', productName: '三防翻译机', bizType: '消费者BG', prodCat: '翻译机产品线', tagL1: '语音翻译', tagL2: '软件问题', tagL3: '翻译结果没有语音播报', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '16', productKey: 'p1', productName: '三防翻译机', bizType: '消费者BG', prodCat: '翻译机产品线', tagL1: '会议/会话翻译', tagL2: '软件问题', tagL3: '翻译延迟/卡顿/反应慢', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '17', productKey: 'p1', productName: '三防翻译机', bizType: '消费者BG', prodCat: '翻译机产品线', tagL1: '屏幕', tagL2: '功能异常', tagL3: '显示内容异常(图标/乱码/字体/方向等)', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '18', productKey: 'p1', productName: '三防翻译机', bizType: '消费者BG', prodCat: '翻译机产品线', tagL1: '记录导出', tagL2: '操作指导', tagL3: '如何导出翻译记录', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '19', productKey: 'p1', productName: '三防翻译机', bizType: '消费者BG', prodCat: '翻译机产品线', tagL1: '售后', tagL2: '服务申请', tagL3: '维修请求', team: '工单-售后', aftersale: '是', status: '启用' },
  { key: '20', productKey: 'p1', productName: '三防翻译机', bizType: '消费者BG', prodCat: '翻译机产品线', tagL1: '售后', tagL2: '政策咨询', tagL3: '退换货政策', team: '工单-售后', aftersale: '是', status: '启用' },
  { key: '21', productKey: 'p2', productName: '汉维翻译机', bizType: '消费者BG', prodCat: '翻译机产品线', tagL1: '会议/会话翻译', tagL2: '软件问题', tagL3: '翻译失败(服务准备中,请稍等)', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '22', productKey: 'p2', productName: '汉维翻译机', bizType: '消费者BG', prodCat: '翻译机产品线', tagL1: '会议/会话翻译', tagL2: '软件问题', tagL3: '无法切换翻译识别模式', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '23', productKey: 'p2', productName: '汉维翻译机', bizType: '消费者BG', prodCat: '翻译机产品线', tagL1: '语音翻译', tagL2: '软件问题', tagL3: '翻译结果没有语音播报', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '24', productKey: 'p2', productName: '汉维翻译机', bizType: '消费者BG', prodCat: '翻译机产品线', tagL1: '蓝牙', tagL2: '操作指导', tagL3: '如何断开连接', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '25', productKey: 'p2', productName: '汉维翻译机', bizType: '消费者BG', prodCat: '翻译机产品线', tagL1: '整机/设备', tagL2: '信息咨询', tagL3: '设备丢失', team: '工单-处理', aftersale: '否', status: '启用' },
  { key: '26', productKey: 'p2', productName: '汉维翻译机', bizType: '消费者BG', prodCat: '翻译机产品线', tagL1: '售后', tagL2: '问题反馈', tagL3: '设备维修后故障仍存在', team: '工单-售后', aftersale: '是', status: '停用' },
  { key: '27', productKey: 'p3', productName: '讯飞智能质检系统V1.0', bizType: '金融科技事业部', prodCat: '智能客服产品线', tagL1: '账号/密码', tagL2: '操作指导', tagL3: '如何退出/切换账号', team: '工单-二线', aftersale: '否', status: '启用' },
  { key: '28', productKey: 'p3', productName: '讯飞智能质检系统V1.0', bizType: '金融科技事业部', prodCat: '智能客服产品线', tagL1: '网络', tagL2: '功能介绍', tagL3: '是否支持修改IP地址', team: '工单-二线', aftersale: '否', status: '启用' },
  { key: '29', productKey: 'p3', productName: '讯飞智能质检系统V1.0', bizType: '金融科技事业部', prodCat: '智能客服产品线', tagL1: '设置/系统', tagL2: '软件问题', tagL3: '加载失败/打不开/闪退', team: '工单-二线', aftersale: '否', status: '启用' },
]);
let rowSeq = allRows.value.length + 1;

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
    if (!matchSelect(appliedFilter.tagL1, r.tagL1)) return false;
    if (!matchSelect(appliedFilter.tagL2, r.tagL2)) return false;
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
const batchTeamOpen = ref(false);
const batchTeamValue = ref<string | undefined>(undefined);

function onBatch(action: string) {
  if (!checkedRowKeys.value.length) return;
  batchOpen.value = false;
  if (action === '处理组') openBatchTeam();
  else if (action === '启用') batchSetStatus('启用');
  else if (action === '停用') batchSetStatus('停用');
  else if (action === '导出') onExport();
  else if (action === '删除') batchDelete();
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
  let n = 0;
  for (const r of allRows.value) {
    if (keys.has(r.key)) {
      r.team = team;
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
      let n = 0;
      for (const r of allRows.value) {
        if (keySet.has(r.key)) {
          r.status = status;
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

/** 选定产品（树叶）→ 派生事业部/产品线，供提交与展示 */
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

// —— 删除：仅删除三级（叶子）分类；父级被删空时自动级联上收 ——
const delOpen = ref(false);
const delTarget = ref<ProblemTagRow | null>(null);

/**
 * 级联上收：该三级删除后，同产品下其二级 / 一级若已无剩余分类，将自动一并删除。
 * 返回将被删空移除的父级分类名单（供弹窗预告与成功提示）。
 */
const delCascade = computed(() => {
  const row = delTarget.value;
  if (!row) return [];
  const sib = allRows.value.filter((r) => r.productKey === row.productKey);
  const l2Left = sib.filter((r) => r.tagL1 === row.tagL1 && r.tagL2 === row.tagL2).length;
  const l1Left = sib.filter((r) => r.tagL1 === row.tagL1).length;
  const out: string[] = [];
  if (l2Left === 1) out.push(`二级分类「${row.tagL1} / ${row.tagL2}」`);
  if (l1Left === 1) out.push(`一级分类「${row.tagL1}」`);
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
  const cascadeText = cascade.length ? `；${cascade.join('、')}已无剩余分类，自动一并删除` : '';
  message.success(`已删除三级分类「${row.tagL3}」${cascadeText}`);
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

interface ImportSkipRow {
  lineNo: number;
  kind: '重复' | '无效';
  reason: string;
  productName: string;
  tagL1: string;
  tagL2: string;
  tagL3: string;
  team: string;
  aftersale: string;
  status: string;
  raw: string;
}

interface ImportResult {
  fileName: string;
  total: number;
  dup: number;
  invalid: number;
  rows: ProblemTagRow[];
  skips: ImportSkipRow[];
}
const importResult = ref<ImportResult | null>(null);
const importCount = computed(() => importResult.value?.rows.length ?? 0);
const importSkipCount = computed(() => importResult.value?.skips.length ?? 0);

function openImport() { importResult.value = null; importOpen.value = true; }

function csvEscape(v: string) {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? '');
    // 保留空行之外的数据行；行号按文件行（含表头）计，数据从第 2 行起
    const rawLines = text.split(/\r?\n/);
    const dataEntries: { lineNo: number; line: string }[] = [];
    for (let i = 1; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (!line?.trim()) continue;
      dataEntries.push({ lineNo: i + 1, line });
    }
    const teamSet = new Set(TEAMS);
    const existing = new Set(allRows.value.map((r) => `${r.productName}|${r.tagL1}|${r.tagL2}|${r.tagL3}`));
    const seen = new Set<string>();
    const rows: ProblemTagRow[] = [];
    const skips: ImportSkipRow[] = [];

    for (const { lineNo, line } of dataEntries) {
      const cols = line.split(',').map((s) => (s ?? '').trim());
      const [productName = '', tagL1 = '', tagL2 = '', tagL3 = '', team = '', aftersale = '', status = ''] = cols;
      const base = { lineNo, productName, tagL1, tagL2, tagL3, team, aftersale, status, raw: line };

      // 严格拦截：逐项校验，记录首个失败原因
      let invalidReason = '';
      if (cols.length < 6) invalidReason = '必填列缺失';
      else if (!productName || !listProductNodes().find((p) => p.title === productName)) invalidReason = '产品名称未匹配产品树';
      else if (!tagL1) invalidReason = '一级分类为空';
      else if (!tagL2) invalidReason = '二级分类为空';
      else if (!tagL3) invalidReason = '三级分类为空';
      else if (!team || !teamSet.has(team)) invalidReason = '处理组不在枚举';
      else if (aftersale !== '是' && aftersale !== '否') invalidReason = '是否售后取值非法';
      else if (status && status !== '启用' && status !== '停用') invalidReason = '状态取值非法';

      if (invalidReason) {
        skips.push({ ...base, kind: '无效', reason: invalidReason });
        continue;
      }

      const prod = listProductNodes().find((p) => p.title === productName)!;
      const sig = `${productName}|${tagL1}|${tagL2}|${tagL3}`;
      if (existing.has(sig)) {
        skips.push({ ...base, kind: '重复', reason: '分类已存在（存量）' });
        continue;
      }
      if (seen.has(sig)) {
        skips.push({ ...base, kind: '重复', reason: '文件内重复' });
        continue;
      }
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

    importResult.value = {
      fileName: f.name,
      total: dataEntries.length,
      dup: skips.filter((s) => s.kind === '重复').length,
      invalid: skips.filter((s) => s.kind === '无效').length,
      rows,
      skips,
    };
    input.value = '';
  };
  reader.readAsText(f, 'utf-8');
}

function downloadImportSkips() {
  const res = importResult.value;
  if (!res?.skips.length) {
    message.warning('没有可下载的导入明细');
    return;
  }
  const header = '行号,归类,不能导入原因,产品名称,一级分类,二级分类,三级分类,处理组,是否售后,状态';
  const lines = res.skips.map((s) =>
    [s.lineNo, s.kind, s.reason, s.productName, s.tagL1, s.tagL2, s.tagL3, s.team, s.aftersale, s.status]
      .map((v) => csvEscape(String(v)))
      .join(','),
  );
  downloadCsv(`问题分类导入明细_${new Date().toISOString().slice(0, 10)}.csv`, header, lines);
  message.success(`已下载导入明细 ${res.skips.length} 条`);
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
        <a-input-search
          v-model:value="treeSearch"
          class="tree-search"
          placeholder="搜索..."
          allow-clear
          size="small"
        />
      </div>
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
              <span class="fl">事业部</span>
              <a-select v-model:value="draftFilter.bizType" class="tb-ctl sel-w" size="small" allow-clear placeholder="全部" :options="toOpts(BIZ_TYPES)" />
            </div>
            <div class="fi">
              <span class="fl">产品线</span>
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
              <template v-if="showTagLevelFilters">
                <a-select
                  v-model:value="draftFilter.tagL1"
                  class="wb-toolbar__sel"
                  size="small"
                  allow-clear
                  show-search
                  placeholder="一级分类"
                  :options="filterTagL1Opts"
                  :filter-option="(input: string, opt: { label?: string }) => (opt?.label ?? '').includes(input)"
                />
                <a-select
                  v-model:value="draftFilter.tagL2"
                  class="wb-toolbar__sel"
                  size="small"
                  allow-clear
                  show-search
                  placeholder="二级分类"
                  :options="filterTagL2Opts"
                  :filter-option="(input: string, opt: { label?: string }) => (opt?.label ?? '').includes(input)"
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
                    <a-menu-divider />
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
        <p class="del-confirm">确定删除三级分类「{{ delTarget.tagL3 }}」？</p>
        <div class="del-path">{{ delTarget.productName }} · {{ tagPath(delTarget) }}</div>
        <p class="del-hint">删除后新建工单不可再选，历史工单归类保留。</p>
        <div v-if="delCascade.length" class="del-cascade">
          <span class="del-cascade-tag">自动上收</span>
          <span class="del-cascade-text">该三级删除后，{{ delCascade.join('、') }} 下将无剩余分类，系统将自动一并删除，不保留空分类。</span>
        </div>
      </template>
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
          <li>产品名称需与产品树一致；校验严格拦截，重复/无效可下载清单</li>
        </ul>

        <div v-else class="import-result">
          <div class="ir-head">
            <div class="ir-title">解析完成</div>
            <a
              v-if="importSkipCount > 0"
              class="ir-dl"
              @click.prevent="downloadImportSkips"
            >
              <DownloadOutlined /> 下载导入明细
            </a>
          </div>
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
          <div class="ir-hint">
            仅导入「可导入」条目；重复与无效已严格拦截。
            <template v-if="importSkipCount > 0">逐行原因见「下载导入明细」（共 {{ importSkipCount }} 条）。</template>
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
.panel-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex: none; }
.p-title { font-size: 14px; font-weight: 600; color: #111827; flex: none; white-space: nowrap; }
.tree-search { flex: 1; min-width: 0; }
.tree-search :deep(.ant-input) { font-size: 12px; }
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
.del-confirm { margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #111827; line-height: 1.5; }
.del-path {
  margin: 0 0 8px; padding: 6px 10px; border-radius: 6px;
  background: #f9fafb; border: 1px solid #eef0f2;
  font-size: 12px; color: #6b7280; line-height: 1.5;
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
