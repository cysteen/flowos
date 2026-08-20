<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  SyncOutlined, ImportOutlined, DownloadOutlined,
  ReloadOutlined, UnorderedListOutlined, CheckOutlined, LinkOutlined,
  SearchOutlined, DownOutlined, ExclamationCircleOutlined, CloseCircleFilled,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { stdPagination } from '@/config/adminUi';
import {
  PRODUCT_TREE_DATA, PRODUCT_TREE_DEFAULT_EXPANDED, filterProductTree,
  collectProductKeysUnder, productTitleByKey,
  type ProductTreeNode,
} from '@/mock/productTree';
import {
  PRODUCT_RD_MAPPINGS, RD_SYSTEMS, MAPPING_STATUS_META, PENDING_TYPE_LABEL,
  externalProductsForSystem, feishuBusinessOptions,
  rdSystemLabel, EXTERNAL_PRODUCT_SNAPSHOT,
  type ProductRdMappingRow, type RdSystemCode, type MappingStatus, type PendingType,
} from '@/mock/productRdMapping';

const KIND_LABEL: Record<ProductTreeNode['kind'], string> = {
  BGBU: 'BGBU', 业务线: '业务线', 产品线: '产品线', 产品分类: '分类', 产品: '产品',
};
const KIND_CLASS: Record<ProductTreeNode['kind'], string> = {
  BGBU: 'kind-bg', 业务线: 'kind-biz', 产品线: 'kind-line', 产品分类: 'kind-cat', 产品: 'kind-prod',
};

type TreeNodeDecorated = ProductTreeNode;

const treeSearch = ref('');
const expandedKeys = ref<string[]>([...PRODUCT_TREE_DEFAULT_EXPANDED]);
const selectedTreeKeys = ref<string[]>([]);

const rows = ref<ProductRdMappingRow[]>([...PRODUCT_RD_MAPPINGS]);

const mappingByProduct = computed(() => {
  const map: Record<string, ProductRdMappingRow> = {};
  for (const r of rows.value) map[r.productKey] = r;
  return map;
});

const visibleTree = computed(() =>
  filterProductTree(PRODUCT_TREE_DATA, treeSearch.value) as TreeNodeDecorated[],
);

const selectedScopeLabel = computed(() => {
  const key = selectedTreeKeys.value[0];
  return key ? productTitleByKey(key) : '';
});

function productStatusClass(productKey: string): string {
  const st = mappingByProduct.value[productKey]?.mappingStatus;
  if (!st || st === 'UNMAPPED') return '';
  return `node-status--${st.toLowerCase()}`;
}

function productStatusTitle(productKey: string): string {
  const st = mappingByProduct.value[productKey]?.mappingStatus;
  if (!st) return '';
  return MAPPING_STATUS_META[st].label;
}

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

const emptyFilter = () => ({
  targetSystem: undefined as RdSystemCode | undefined,
  mappingStatus: undefined as MappingStatus | undefined,
  name: '',
});
const draftFilter = reactive(emptyFilter());
const appliedFilter = reactive(emptyFilter());

const filteredRows = computed(() => {
  let list = rows.value;
  const treeKey = selectedTreeKeys.value[0] ?? null;
  const keys = collectProductKeysUnder(treeKey);
  if (keys) list = list.filter((r) => keys.has(r.productKey));
  const f = appliedFilter;
  if (f.targetSystem) list = list.filter((r) => r.targetSystem === f.targetSystem);
  if (f.mappingStatus) list = list.filter((r) => r.mappingStatus === f.mappingStatus);
  if (f.name.trim()) {
    const kw = f.name.trim().toLowerCase();
    list = list.filter((r) =>
      r.productName.toLowerCase().includes(kw) || r.spuCode.toLowerCase().includes(kw));
  }
  return list;
});

const coverageStats = computed(() => {
  const total = rows.value.length;
  const valid = rows.value.filter((r) => r.mappingStatus === 'VALID').length;
  const pending = rows.value.filter((r) => r.mappingStatus === 'PENDING').length;
  const unmapped = rows.value.filter((r) => r.mappingStatus === 'UNMAPPED').length;
  const invalid = rows.value.filter((r) => r.mappingStatus === 'INVALID').length;
  const pct = total ? Math.round((valid / total) * 100) : 0;
  return { total, valid, pending, unmapped, invalid, pct };
});

const checkedKeys = ref<string[]>([]);
const batchOpen = ref(false);
const hasRowSelection = computed(() => checkedKeys.value.length > 0);
const rowSelection = computed(() => ({
  selectedRowKeys: checkedKeys.value,
  onChange: (keys: (string | number)[]) => { checkedKeys.value = keys as string[]; },
}));

const pagination = computed(() => stdPagination({ pageSize: 20, total: filteredRows.value.length }));

const pendingRows = computed(() => rows.value.filter((r) => r.mappingStatus === 'PENDING'));

const cols = [
  { title: '产品名称', dataIndex: 'productName', key: 'productName', width: 160, fixed: 'left' as const },
  { title: '产品编码', dataIndex: 'spuCode', key: 'spuCode', width: 96 },
  { title: '业务线', dataIndex: 'bizline', key: 'bizline', width: 120 },
  { title: '关联服务', key: 'targetSystem', width: 100 },
  { title: '建议外部产品', key: 'external', width: 200 },
  { title: '待确认原因', key: 'pendingReason', width: 200 },
  { title: '映射状态', key: 'mappingStatus', width: 96 },
  { title: '置信度', key: 'mappingMethod', width: 80 },
  { title: '操作', key: 'op', width: 200, fixed: 'right' as const },
];

function filterToPending() {
  draftFilter.mappingStatus = 'PENDING';
  draftFilter.targetSystem = undefined;
  Object.assign(appliedFilter, { ...draftFilter });
  message.info(`已筛选 ${pendingRows.value.length} 条待确认映射`);
}

function patchRow(productKey: string, patch: Partial<ProductRdMappingRow>) {
  const idx = rows.value.findIndex((r) => r.productKey === productKey);
  if (idx >= 0) rows.value[idx] = { ...rows.value[idx], ...patch };
}

function confirmMapping(row: ProductRdMappingRow) {
  patchRow(row.productKey, {
    mappingStatus: 'VALID',
    mappingMethod: 'MANUAL',
    matchConfidence: 100,
    pendingReason: undefined,
    pendingType: undefined,
    previousExternalProductId: undefined,
    previousExternalProductName: undefined,
    previousTargetSystem: undefined,
    invalidReason: undefined,
  });
  message.success(`已确认：${row.productName} → ${row.externalProductName}`);
}

function applyReject(row: ProductRdMappingRow) {
  if (row.pendingType === 'CONFLICT' && row.previousExternalProductId) {
    patchRow(row.productKey, {
      targetSystem: row.previousTargetSystem,
      externalProductId: row.previousExternalProductId,
      externalProductName: row.previousExternalProductName,
      mappingStatus: 'VALID', mappingMethod: 'MANUAL', matchConfidence: 100,
      pendingReason: undefined, pendingType: undefined,
      previousExternalProductId: undefined, previousExternalProductName: undefined,
      previousTargetSystem: undefined, invalidReason: undefined,
    });
  } else {
    patchRow(row.productKey, {
      targetSystem: undefined, externalProductId: undefined, externalProductName: undefined,
      externalBusinessId: undefined, externalBusinessName: undefined,
      mappingStatus: 'UNMAPPED', mappingMethod: undefined, matchConfidence: undefined,
      pendingReason: undefined, pendingType: undefined, invalidReason: undefined,
    });
  }
}

function rejectPending(row: ProductRdMappingRow) {
  Modal.confirm({
    title: '驳回待确认映射',
    content: row.pendingType === 'CONFLICT' && row.previousExternalProductId
      ? `驳回后将恢复为原有关联：${row.previousExternalProductName} (${row.previousExternalProductId})`
      : `驳回后「${row.productName}」将恢复为未配置，不采用本次自动匹配结果。`,
    okText: '确认驳回',
    okType: 'danger',
    onOk() {
      applyReject(row);
      message.success(row.pendingType === 'CONFLICT' ? '已驳回并恢复原映射' : '已驳回，恢复未配置');
    },
  });
}

function openNextPending(afterKey?: string) {
  const list = pendingRows.value;
  if (!list.length) return;
  const idx = afterKey ? list.findIndex((r) => r.productKey === afterKey) : -1;
  const next = list[idx + 1] ?? list[0];
  if (next) openPendingReview(next);
}
function clearTreeScope() {
  selectedTreeKeys.value = [];
}

function onReset() {
  Object.assign(draftFilter, emptyFilter());
  Object.assign(appliedFilter, emptyFilter());
  clearTreeScope();
}

/** 名称归一化（自动匹配用） */
function normName(s: string): string {
  return s.replace(/\s/g, '').replace(/^讯飞|科大讯飞/i, '').replace(/(App|系统|V[\d.]+)$/i, '').toLowerCase();
}

/** 为工单产品在指定系统下找最佳外部产品（mock 规则：名称精确/包含） */
function suggestExternal(system: RdSystemCode, productName: string) {
  const n = normName(productName);
  const pool = EXTERNAL_PRODUCT_SNAPSHOT.filter((p) => p.systemCode === system);
  const exact = pool.find((p) => normName(p.externalProductName) === n);
  if (exact) return { ext: exact, confidence: 90 };
  const contains = pool.find((p) => normName(p.externalProductName).includes(n) || n.includes(normName(p.externalProductName)));
  if (contains) return { ext: contains, confidence: 75 };
  return null;
}

/** 同步外部产品库并自动匹配；原为空/不一致 → 待确认，已人工确认的不覆盖 */
function runSyncAndMatch(system: RdSystemCode) {
  const label = rdSystemLabel(system);
  let pendingNew = 0;
  let pendingConflict = 0;
  let invalid = 0;
  let skipped = 0;
  const now = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');

  rows.value = rows.value.map((row) => {
    // 已人工确认的有效映射：不自动覆盖
    if (row.mappingMethod === 'MANUAL' && row.mappingStatus === 'VALID') {
      skipped += 1;
      return { ...row, lastSyncedAt: now };
    }

    const suggestion = suggestExternal(system, row.productName);
    const snapshotIds = new Set(
      EXTERNAL_PRODUCT_SNAPSHOT.filter((p) => p.systemCode === system).map((p) => p.externalProductId),
    );

    // 已有映射：校验外部产品是否仍存在
    if (row.targetSystem === system && row.externalProductId && row.mappingStatus === 'VALID') {
      if (!snapshotIds.has(row.externalProductId)) {
        invalid += 1;
        return {
          ...row,
          mappingStatus: 'INVALID' as MappingStatus,
          invalidReason: `${label}侧产品已下架或不可用`,
          lastSyncedAt: now,
        };
      }
      // 自动匹配结果与现映射不一致 → 待确认
      if (suggestion && suggestion.ext.externalProductId !== row.externalProductId) {
        pendingConflict += 1;
        return {
          ...row,
          previousTargetSystem: row.targetSystem,
          previousExternalProductId: row.externalProductId,
          previousExternalProductName: row.externalProductName,
          targetSystem: system,
          externalProductId: suggestion.ext.externalProductId,
          externalProductName: suggestion.ext.externalProductName,
          externalBusinessId: suggestion.ext.externalBusinessId,
          externalBusinessName: suggestion.ext.externalBusinessName,
          mappingStatus: 'PENDING' as MappingStatus,
          mappingMethod: 'AUTO_RULE',
          matchConfidence: suggestion.confidence,
          pendingType: 'CONFLICT' as PendingType,
          pendingReason: `自动匹配与现有关联不一致（原 ${row.externalProductName} → 建议 ${suggestion.ext.externalProductName}）`,
          invalidReason: undefined,
          lastSyncedAt: now,
        };
      }
      skipped += 1;
      return { ...row, lastSyncedAt: now };
    }

    // 原为空（未配置）或已失效：匹配上 → 待确认（不直接生效）
    if ((row.mappingStatus === 'UNMAPPED' || row.mappingStatus === 'INVALID') && suggestion) {
      pendingNew += 1;
      return {
        ...row,
        targetSystem: system,
        externalProductId: suggestion.ext.externalProductId,
        externalProductName: suggestion.ext.externalProductName,
        externalBusinessId: suggestion.ext.externalBusinessId,
        externalBusinessName: suggestion.ext.externalBusinessName,
        mappingStatus: 'PENDING' as MappingStatus,
        mappingMethod: 'AUTO_RULE',
        matchConfidence: suggestion.confidence,
        pendingType: 'NEW_MATCH' as PendingType,
        pendingReason: `原${row.mappingStatus === 'INVALID' ? '已失效' : '未配置'}，同步后自动匹配（置信度 ${suggestion.confidence}%）`,
        invalidReason: undefined,
        lastSyncedAt: now,
      };
    }

    return { ...row, lastSyncedAt: now };
  });

  const lines = [`${label} 产品库已同步并完成自动匹配。`];
  if (pendingNew) lines.push(`· 原未配置、现匹配上：${pendingNew} 条 → 待确认`);
  if (pendingConflict) lines.push(`· 与现有关联不一致：${pendingConflict} 条 → 待确认`);
  if (invalid) lines.push(`· 外部产品已失效：${invalid} 条`);
  if (skipped) lines.push(`· 已确认映射保持不变：${skipped} 条`);
  if (!pendingNew && !pendingConflict && !invalid) lines.push('· 无新增待确认项');

  Modal.confirm({
    title: '同步完成',
    content: lines.join('\n'),
    okText: pendingNew || pendingConflict ? '开始确认' : '知道了',
    cancelText: pendingNew || pendingConflict ? '稍后处理' : undefined,
    onOk() {
      if (pendingNew || pendingConflict) {
        filterToPending();
        const first = rows.value.find((r) => r.mappingStatus === 'PENDING');
        if (first) openPendingReview(first);
      }
    },
  });
}

// a-menu 的 click 事件回调参数里 key 的声明类型是 Key（string | number）；
// 本菜单项的 key 取自 RD_SYSTEMS[].code，取值范围即 RdSystemCode，故可安全收窄。
function onSyncMenu({ key }: { key: string | number }) {
  const system = String(key) as RdSystemCode;
  const label = rdSystemLabel(system);
  message.loading({ content: `正在同步 ${label} 并自动匹配…`, key: 'sync', duration: 0.8 });
  setTimeout(() => {
    message.destroy('sync');
    runSyncAndMatch(system);
  }, 800);
}

function onImport() { message.info('打开 Excel 导入映射'); }
function onExport() { message.success('已导出当前筛选结果'); }

function onQuery() {
  Object.assign(appliedFilter, { ...draftFilter });
  message.success('已按条件查询');
}

function onBatch(action: string) {
  batchOpen.value = false;
  if (action === '批量确认') batchConfirm();
  else if (action === '批量驳回') batchRejectPending();
  else if (action === '批量解除') batchUnlink();
  else if (action === '导出') onExport();
}

function batchConfirm() {
  const pendingSelected = checkedKeys.value.filter((k) =>
    rows.value.find((r) => r.productKey === k && r.mappingStatus === 'PENDING'));
  if (!pendingSelected.length) { message.warning('请勾选待确认状态的映射'); return; }
  rows.value = rows.value.map((r) =>
    pendingSelected.includes(r.productKey)
      ? {
        ...r, mappingStatus: 'VALID' as MappingStatus, mappingMethod: 'MANUAL' as const,
        matchConfidence: 100, pendingReason: undefined, pendingType: undefined,
        previousExternalProductId: undefined, previousExternalProductName: undefined,
        previousTargetSystem: undefined, invalidReason: undefined,
      }
      : r);
  message.success(`已批量确认 ${pendingSelected.length} 条映射`);
  checkedKeys.value = [];
}

function batchRejectPending() {
  const pendingSelected = checkedKeys.value.filter((k) =>
    rows.value.find((r) => r.productKey === k && r.mappingStatus === 'PENDING'));
  if (!pendingSelected.length) { message.warning('请勾选待确认状态的映射'); return; }
  Modal.confirm({
    title: '批量驳回',
    content: `确定驳回已选 ${pendingSelected.length} 条待确认映射？新匹配将恢复未配置，冲突项将恢复原映射。`,
    okText: '确认驳回',
    okType: 'danger',
    onOk() {
      pendingSelected.forEach((key) => {
        const row = rows.value.find((r) => r.productKey === key);
        if (row?.mappingStatus === 'PENDING') applyReject(row);
      });
      message.success(`已驳回 ${pendingSelected.length} 条`);
      checkedKeys.value = [];
    },
  });
}

function batchUnlink() {
  const n = checkedKeys.value.length;
  if (!n) { message.warning('请先勾选'); return; }
  Modal.confirm({
    title: '批量解除关联',
    content: `确定解除已选 ${n} 个产品的产研关联？`,
    onOk() {
      rows.value = rows.value.map((r) =>
        checkedKeys.value.includes(r.productKey)
          ? {
            ...r, targetSystem: undefined, externalProductId: undefined,
            externalProductName: undefined, externalBusinessId: undefined,
            externalBusinessName: undefined, mappingStatus: 'UNMAPPED' as MappingStatus,
            mappingMethod: undefined, matchConfidence: undefined, invalidReason: undefined,
          }
          : r);
      message.success('已解除关联');
      checkedKeys.value = [];
    },
  });
}

/** 关联 / 待确认抽屉 */
const drawerOpen = ref(false);
const drawerMode = ref<'config' | 'pending'>('config');
const editing = ref<ProductRdMappingRow | null>(null);
const form = reactive<{
  targetSystem?: RdSystemCode;
  externalBusinessId?: string;
  externalProductId?: string;
}>({});

const feishuBizOptions = feishuBusinessOptions();

const externalProductOptions = computed(() => {
  if (!form.targetSystem) return [];
  if (form.targetSystem === 'FEISHU') {
    return externalProductsForSystem('FEISHU', form.externalBusinessId);
  }
  return externalProductsForSystem(form.targetSystem);
});

const selectedExternal = computed(() => {
  if (!form.externalProductId || !form.targetSystem) return null;
  return externalProductOptions.value.find((p) => p.externalProductId === form.externalProductId) ?? null;
});

function selectSystem(code: RdSystemCode) {
  if (form.targetSystem !== code) {
    form.targetSystem = code;
    form.externalBusinessId = undefined;
    form.externalProductId = undefined;
  }
}

function openDrawer(row: ProductRdMappingRow) {
  drawerMode.value = 'config';
  editing.value = row;
  form.targetSystem = row.targetSystem;
  form.externalBusinessId = row.externalBusinessId;
  form.externalProductId = row.externalProductId;
  drawerOpen.value = true;
}

function onProductClick(row: ProductRdMappingRow) {
  if (row.mappingStatus === 'PENDING') openPendingReview(row);
  else openDrawer(row);
}

function openPendingReview(row: ProductRdMappingRow) {
  drawerMode.value = 'pending';
  editing.value = row;
  form.targetSystem = row.targetSystem;
  form.externalBusinessId = row.externalBusinessId;
  form.externalProductId = row.externalProductId;
  drawerOpen.value = true;
}

function confirmInDrawer() {
  if (!editing.value) return;
  const key = editing.value.productKey;
  confirmMapping(editing.value);
  drawerOpen.value = false;
  if (pendingRows.value.length) {
    Modal.confirm({
      title: '还有待确认项',
      content: `剩余 ${pendingRows.value.length} 条待确认，是否继续处理下一条？`,
      okText: '继续',
      cancelText: '稍后',
      onOk() { openNextPending(key); },
    });
  }
}

function rejectInDrawer() {
  if (!editing.value) return;
  const row = editing.value;
  const key = row.productKey;
  Modal.confirm({
    title: '驳回待确认映射',
    content: row.pendingType === 'CONFLICT' && row.previousExternalProductId
      ? `驳回后将恢复为原有关联：${row.previousExternalProductName}`
      : `驳回后「${row.productName}」将恢复为未配置。`,
    okText: '确认驳回',
    okType: 'danger',
    onOk() {
      applyReject(row);
      drawerOpen.value = false;
      message.success('已驳回');
      setTimeout(() => { if (pendingRows.value.length) openNextPending(key); }, 200);
    },
  });
}

function adjustInDrawer() {
  drawerMode.value = 'config';
}

function openConfigFromPending(row: ProductRdMappingRow) {
  drawerMode.value = 'config';
  editing.value = row;
  form.targetSystem = row.targetSystem;
  form.externalBusinessId = row.externalBusinessId;
  form.externalProductId = row.externalProductId;
  drawerOpen.value = true;
}

function saveMapping() {
  if (!editing.value) return;
  if (!form.targetSystem) { message.warning('请选择关联服务'); return; }
  if (!form.externalProductId) { message.warning('请选择外部产品'); return; }
  const ext = externalProductOptions.value.find((p) => p.externalProductId === form.externalProductId);
  if (!ext) return;
  const idx = rows.value.findIndex((r) => r.productKey === editing.value!.productKey);
  if (idx < 0) return;
  rows.value[idx] = {
    ...rows.value[idx],
    targetSystem: form.targetSystem,
    externalProductId: ext.externalProductId,
    externalProductName: ext.externalProductName,
    externalBusinessId: ext.externalBusinessId,
    externalBusinessName: ext.externalBusinessName,
    mappingStatus: 'VALID',
    mappingMethod: 'MANUAL',
    matchConfidence: 100,
    pendingReason: undefined,
    pendingType: undefined,
    previousExternalProductId: undefined,
    previousExternalProductName: undefined,
    previousTargetSystem: undefined,
    invalidReason: undefined,
    lastSyncedAt: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
  };
  message.success('关联已保存');
  drawerOpen.value = false;
}

function unlinkInDrawer() {
  if (!editing.value) return;
  Modal.confirm({
    title: '解除关联',
    content: `确定解除「${editing.value.productName}」的产研关联？`,
    onOk() {
      const idx = rows.value.findIndex((r) => r.productKey === editing.value!.productKey);
      if (idx >= 0) {
        rows.value[idx] = {
          ...rows.value[idx],
          targetSystem: undefined, externalProductId: undefined, externalProductName: undefined,
          externalBusinessId: undefined, externalBusinessName: undefined,
          mappingStatus: 'UNMAPPED', mappingMethod: undefined, matchConfidence: undefined,
          invalidReason: undefined,
        };
      }
      message.success('已解除关联');
      drawerOpen.value = false;
    },
  });
}

/**
 * 外部产品下拉的本地过滤：按 label 子串匹配、忽略大小写。
 *
 * 写在这里而不是模板里内联 —— Vue 模板表达式按 JS 解析，**不认 TS 类型注解**，
 * 内联版 `(input: string, opt: { label?: string }) => …` 会让 vue-tsc 报
 * TS1109/TS1005 语法错误，而语法错误一出，全项目的语义检查就整体降级：
 * 那期间 `Record<RoleKey, …>` 缺 key 这类真错都不再报（2026-08-19 查实）。
 */
function filterProductOption(input: string, opt: { label?: string }): boolean {
  return (opt.label ?? '').toLowerCase().includes(input.toLowerCase());
}

</script>

<template>
  <div class="rd-mapping-page">
    <AdminPageHeader
      title="产研产品关联"
      subtitle="维护工单产品与产研服务的外部产品映射；左侧选中产品树节点后筛选右侧列表。"
    >
      <template #actions>
        <a-dropdown>
          <a-button><template #icon><SyncOutlined /></template>同步并匹配</a-button>
          <template #overlay>
            <a-menu @click="onSyncMenu">
              <a-menu-item v-for="s in RD_SYSTEMS" :key="s.code">
                同步{{ s.label }}并自动匹配
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
        <a-button @click="onImport"><template #icon><ImportOutlined /></template>导入</a-button>
        <a-button @click="onExport"><template #icon><DownloadOutlined /></template>导出</a-button>
      </template>
    </AdminPageHeader>

    <div v-if="pendingRows.length" class="pending-banner">
      <ExclamationCircleOutlined class="pending-banner__icon" />
      <span class="pending-banner__text">
        有 <strong>{{ pendingRows.length }}</strong> 条自动匹配结果待确认，确认后方可用于升级产研
      </span>
      <div class="pending-banner__actions">
        <a-button size="small" type="link" @click="filterToPending">查看待确认</a-button>
        <a-button size="small" type="primary" @click="openPendingReview(pendingRows[0])">开始确认</a-button>
      </div>
    </div>

    <div class="kpi-strip">
      <div class="kpi-item kpi-item--hero">
        <span class="kpi-num">{{ coverageStats.pct }}<small>%</small></span>
        <span class="kpi-label">映射覆盖率</span>
      </div>
      <div class="kpi-item">
        <span class="kpi-num kpi-num--ok">{{ coverageStats.valid }}</span>
        <span class="kpi-label">已映射</span>
      </div>
      <div class="kpi-item kpi-item--click" @click="filterToPending">
        <span class="kpi-num kpi-num--warn">{{ coverageStats.pending }}</span>
        <span class="kpi-label">待确认</span>
      </div>
      <div class="kpi-item">
        <span class="kpi-num">{{ coverageStats.unmapped }}</span>
        <span class="kpi-label">未配置</span>
      </div>
      <div class="kpi-item">
        <span class="kpi-num kpi-num--err">{{ coverageStats.invalid }}</span>
        <span class="kpi-label">已失效</span>
      </div>
    </div>

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
          v-model:selected-keys="selectedTreeKeys"
          :tree-data="visibleTree"
          :indent="22"
          block-node
          class="prod-tree"
        >
          <template #title="node">
            <span class="node">
              <span
                v-if="node.kind === '产品' && productStatusClass(node.key)"
                class="node-status"
                :class="productStatusClass(node.key)"
                :title="productStatusTitle(node.key)"
              />
              <span class="node-name" :title="node.title">{{ node.title }}</span>
              <span class="node-meta">
                <span class="node-kind" :class="KIND_CLASS[node.kind as ProductTreeNode['kind']]">{{ KIND_LABEL[node.kind as ProductTreeNode['kind']] }}</span>
              </span>
            </span>
          </template>
        </a-tree>
      </div>

      <div class="right body body--list">
        <div class="list-card">
          <div class="list-card-head">
            <div class="list-card-head__main">
              <span class="list-card-title">映射列表</span>
              <span class="list-card-count">共 {{ filteredRows.length }} 条</span>
              <span v-if="selectedScopeLabel" class="scope-tag">
                {{ selectedScopeLabel }}
                <CloseCircleFilled class="scope-tag__clear" @click.stop="clearTreeScope" />
              </span>
            </div>
          </div>

          <div class="list-toolbar">
            <div class="toolbar-row">
              <div class="fi">
                <span class="fl">关联服务</span>
                <a-select
                  v-model:value="draftFilter.targetSystem"
                  class="tb-ctl sel-w"
                  size="small"
                  allow-clear
                  placeholder="全部"
                >
                  <a-select-option v-for="s in RD_SYSTEMS" :key="s.code" :value="s.code">{{ s.label }}</a-select-option>
                </a-select>
              </div>
              <div class="fi">
                <span class="fl">映射状态</span>
                <a-select
                  v-model:value="draftFilter.mappingStatus"
                  class="tb-ctl sel-w"
                  size="small"
                  allow-clear
                  placeholder="全部"
                >
                  <a-select-option value="VALID">已映射</a-select-option>
                  <a-select-option value="PENDING">待确认</a-select-option>
                  <a-select-option value="UNMAPPED">未配置</a-select-option>
                  <a-select-option value="INVALID">已失效</a-select-option>
                </a-select>
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
                    placeholder="搜索产品名称或编码"
                    :value="draftFilter.name"
                    @input="draftFilter.name = ($event.target as HTMLInputElement).value"
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
                    <span v-if="hasRowSelection" class="wb-toolbar__badge">{{ checkedKeys.length }}</span>
                    <DownOutlined :style="{ color: '#9CA3AF', fontSize: '12px' }" />
                  </div>
                  <template #overlay>
                    <a-menu class="batch-menu">
                      <a-menu-item :disabled="!hasRowSelection" @click="onBatch('批量确认')">批量确认</a-menu-item>
                      <a-menu-item :disabled="!hasRowSelection" @click="onBatch('批量驳回')">批量驳回</a-menu-item>
                      <a-menu-item :disabled="!hasRowSelection" @click="onBatch('批量解除')">批量解除</a-menu-item>
                      <a-menu-divider />
                      <a-menu-item :disabled="!hasRowSelection" @click="onBatch('导出')">导出</a-menu-item>
                    </a-menu>
                  </template>
                </a-dropdown>
              </div>
            </div>
          </div>

          <div class="table-wrap">
            <a-table
              :columns="cols"
              :data-source="filteredRows"
              :row-selection="rowSelection"
              :pagination="pagination"
              size="middle"
              :scroll="{ x: 1200, y: 'calc(100vh - 420px)' }"
              row-key="productKey"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'productName'">
                  <span class="cell-link" @click="onProductClick(record as ProductRdMappingRow)">{{ (record as ProductRdMappingRow).productName }}</span>
                </template>
                <template v-else-if="column.key === 'targetSystem'">
                  <a-tag v-if="(record as ProductRdMappingRow).targetSystem" color="processing">
                    {{ rdSystemLabel((record as ProductRdMappingRow).targetSystem) }}
                  </a-tag>
                  <span v-else class="muted">—</span>
                </template>
                <template v-else-if="column.key === 'external'">
                  <template v-if="(record as ProductRdMappingRow).externalProductId">
                    <span>{{ (record as ProductRdMappingRow).externalProductName }}</span>
                    <span class="ext-id">({{ (record as ProductRdMappingRow).externalProductId }})</span>
                  </template>
                  <span v-else class="muted">—</span>
                </template>
                <template v-else-if="column.key === 'pendingReason'">
                  <template v-if="(record as ProductRdMappingRow).mappingStatus === 'PENDING'">
                    <a-tag v-if="(record as ProductRdMappingRow).pendingType" color="orange" class="pending-type-tag">
                      {{ PENDING_TYPE_LABEL[(record as ProductRdMappingRow).pendingType!] }}
                    </a-tag>
                    <span class="pending-reason">{{ (record as ProductRdMappingRow).pendingReason }}</span>
                  </template>
                  <span v-else class="muted">—</span>
                </template>
                <template v-else-if="column.key === 'mappingStatus'">
                  <a-tag :color="MAPPING_STATUS_META[(record as ProductRdMappingRow).mappingStatus].color">
                    {{ MAPPING_STATUS_META[(record as ProductRdMappingRow).mappingStatus].label }}
                  </a-tag>
                </template>
                <template v-else-if="column.key === 'mappingMethod'">
                  <span v-if="(record as ProductRdMappingRow).matchConfidence != null">
                    {{ (record as ProductRdMappingRow).matchConfidence }}%
                  </span>
                  <span v-else class="muted">—</span>
                </template>
                <template v-else-if="column.key === 'op'">
                  <div class="row-ops">
                    <template v-if="(record as ProductRdMappingRow).mappingStatus === 'PENDING'">
                      <a-button type="link" size="small" @click="openPendingReview(record as ProductRdMappingRow)">确认</a-button>
                      <a-button type="link" size="small" danger @click="rejectPending(record as ProductRdMappingRow)">驳回</a-button>
                      <a-button type="link" size="small" @click="openConfigFromPending(record as ProductRdMappingRow)">调整</a-button>
                    </template>
                    <a-button v-else type="link" size="small" @click="openDrawer(record as ProductRdMappingRow)">
                      <LinkOutlined /> 配置关联
                    </a-button>
                  </div>
                </template>
              </template>
              <template #emptyText>
                <div class="empty-hint">没有符合条件的映射记录，可调整筛选或同步外部产品</div>
              </template>
            </a-table>
          </div>
        </div>
      </div>
    </div>

    <!-- 关联 / 待确认抽屉 -->
    <a-drawer
      v-model:open="drawerOpen"
      width="520"
      class="map-drawer"
      :destroy-on-close="true"
      :body-style="{ padding: 0, display: 'flex', flexDirection: 'column' }"
      :header-style="{ borderBottom: '1px solid #f0f2f5', padding: '14px 20px' }"
      :footer-style="{ borderTop: '1px solid #f0f2f5', padding: '12px 20px' }"
    >
      <template #title>
        <div v-if="editing" class="map-drawer-title">
          <span class="map-drawer-title__text">
            {{ drawerMode === 'pending' ? '待确认映射审核' : '配置产研关联' }}
          </span>
          <a-tag :color="MAPPING_STATUS_META[editing.mappingStatus].color" class="map-drawer-title__tag">
            {{ MAPPING_STATUS_META[editing.mappingStatus].label }}
          </a-tag>
        </div>
      </template>

      <div v-if="editing" class="map-drawer-body">
        <!-- 工单产品摘要 -->
        <div class="prod-hero">
          <div class="prod-hero__icon">产</div>
          <div class="prod-hero__content">
            <div class="prod-hero__name">{{ editing.productName }}</div>
            <div class="prod-hero__meta">
              <code class="prod-hero__code">{{ editing.spuCode }}</code>
              <span class="prod-hero__sep">·</span>
              <span>{{ editing.bizline }} / {{ editing.prodline }}</span>
            </div>
          </div>
        </div>

        <!-- 待确认审核模式 -->
        <template v-if="drawerMode === 'pending'">
          <div class="pending-strip">
            <ExclamationCircleOutlined />
            <div class="pending-strip__text">
              <strong>自动匹配结果需人工确认</strong>
              <p>{{ editing.pendingReason }}</p>
            </div>
          </div>

          <section class="map-sec">
            <header class="map-sec__head">
              <span class="map-sec__title">匹配建议</span>
              <a-tag v-if="editing.pendingType" color="orange">{{ PENDING_TYPE_LABEL[editing.pendingType] }}</a-tag>
            </header>
            <div class="review-card review-card--suggest">
              <div class="review-kv">
                <span class="review-k">关联服务</span>
                <span class="review-v">{{ rdSystemLabel(editing.targetSystem) }}</span>
              </div>
              <div class="review-kv">
                <span class="review-k">外部产品</span>
                <span class="review-v">
                  {{ editing.externalProductName }}
                  <code class="review-id">{{ editing.externalProductId }}</code>
                </span>
              </div>
              <div class="review-kv">
                <span class="review-k">置信度</span>
                <span class="review-v review-v--score">{{ editing.matchConfidence }}%</span>
              </div>
            </div>
          </section>

          <section
            v-if="editing.pendingType === 'CONFLICT' && editing.previousExternalProductId"
            class="map-sec"
          >
            <header class="map-sec__head">
              <span class="map-sec__title">原有关联</span>
              <span class="map-sec__tip">驳回后将恢复</span>
            </header>
            <div class="review-card review-card--prev">
              <div class="review-kv">
                <span class="review-k">关联服务</span>
                <span class="review-v">{{ rdSystemLabel(editing.previousTargetSystem) }}</span>
              </div>
              <div class="review-kv">
                <span class="review-k">外部产品</span>
                <span class="review-v">
                  {{ editing.previousExternalProductName }}
                  <code class="review-id">{{ editing.previousExternalProductId }}</code>
                </span>
              </div>
            </div>
          </section>

          <div class="flow-hint">
            <div class="flow-hint__item"><strong>确认</strong> 映射生效，可用于升级</div>
            <div class="flow-hint__item"><strong>驳回</strong> 不采用建议，恢复未配置或原映射</div>
            <div class="flow-hint__item"><strong>调整</strong> 手动选择其他外部产品</div>
          </div>
        </template>

        <!-- 手动配置模式 -->
        <template v-else>
          <section class="map-sec">
            <header class="map-sec__head">
              <span class="map-sec__title">关联服务</span>
              <span class="map-sec__tip">每个产品仅可关联一个，切换将清空已选外部产品</span>
            </header>
            <div class="sys-grid">
              <button
                v-for="s in RD_SYSTEMS"
                :key="s.code"
                type="button"
                class="sys-card"
                :class="[`sys-card--${s.code.toLowerCase()}`, { 'is-active': form.targetSystem === s.code }]"
                @click="selectSystem(s.code)"
              >
                <span class="sys-card__dot" />
                <span class="sys-card__label">{{ s.label }}</span>
                <CheckOutlined v-if="form.targetSystem === s.code" class="sys-card__check" />
              </button>
            </div>
          </section>

          <section v-if="form.targetSystem" class="map-sec">
            <header class="map-sec__head">
              <span class="map-sec__title">外部产品</span>
              <span class="map-sec__req">必填</span>
            </header>

            <div v-if="form.targetSystem === 'FEISHU'" class="map-field">
              <label class="map-field__label">飞书业务线</label>
              <a-select
                v-model:value="form.externalBusinessId"
                placeholder="请先选择业务线"
                allow-clear
                size="large"
                class="map-field__ctl"
                @change="form.externalProductId = undefined"
              >
                <a-select-option v-for="b in feishuBizOptions" :key="b.id" :value="b.id">{{ b.name }}</a-select-option>
              </a-select>
            </div>

            <div class="map-field">
              <label v-if="form.targetSystem === 'FEISHU'" class="map-field__label">外部产品</label>
              <a-select
                v-model:value="form.externalProductId"
                placeholder="搜索或选择外部产品"
                show-search
                allow-clear
                size="large"
                class="map-field__ctl"
                :filter-option="filterProductOption"
                :disabled="form.targetSystem === 'FEISHU' && !form.externalBusinessId"
              >
                <a-select-option
                  v-for="p in externalProductOptions"
                  :key="p.externalProductId"
                  :value="p.externalProductId"
                  :label="`${p.externalProductName} ${p.externalProductId}`"
                >
                  <div class="ext-opt">
                    <span class="ext-opt__name">{{ p.externalProductName }}</span>
                    <code class="ext-opt__id">{{ p.externalProductId }}</code>
                  </div>
                </a-select-option>
              </a-select>
              <p v-if="form.targetSystem === 'FEISHU' && !form.externalBusinessId" class="map-field__hint map-field__hint--warn">
                请先选择飞书业务线
              </p>
            </div>

            <div v-if="selectedExternal" class="ext-preview">
              <div class="ext-preview__head">已选预览</div>
              <div class="ext-preview__name">{{ selectedExternal.externalProductName }}</div>
              <div class="ext-preview__row">
                <code>{{ selectedExternal.externalProductId }}</code>
                <span v-if="selectedExternal.externalBusinessName" class="ext-preview__biz">{{ selectedExternal.externalBusinessName }}</span>
              </div>
            </div>
          </section>
        </template>
      </div>

      <template #footer>
        <div class="map-drawer-footer">
          <template v-if="drawerMode === 'pending'">
            <a-button danger @click="rejectInDrawer">驳回</a-button>
            <a-space :size="8">
              <a-button @click="adjustInDrawer">手动调整</a-button>
              <a-button type="primary" @click="confirmInDrawer">
                <CheckOutlined /> 确认采用
              </a-button>
            </a-space>
          </template>
          <template v-else>
            <a-button
              v-if="editing && editing.mappingStatus !== 'UNMAPPED'"
              danger
              ghost
              @click="unlinkInDrawer"
            >
              解除关联
            </a-button>
            <a-space :size="8">
              <a-button @click="drawerOpen = false">取消</a-button>
              <a-button type="primary" :disabled="!form.targetSystem || !form.externalProductId" @click="saveMapping">
                保存并确认
              </a-button>
            </a-space>
          </template>
        </div>
      </template>
    </a-drawer>
  </div>
</template>

<style scoped>
.rd-mapping-page {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  padding: 16px 20px 12px; box-sizing: border-box;
}
.rd-mapping-page :deep(.admin-page-header) { margin-bottom: 12px; flex: none; }

/* 待确认横幅 */
.pending-banner {
  display: flex; align-items: center; gap: 10px; flex: none;
  margin-bottom: 12px; padding: 10px 14px;
  background: linear-gradient(90deg, #fffbeb 0%, #fff 100%);
  border: 1px solid #fde68a; border-radius: 8px;
}
.pending-banner__icon { flex: none; font-size: 16px; color: #d97706; }
.pending-banner__text { flex: 1; min-width: 0; font-size: 13px; color: #92400e; line-height: 1.5; }
.pending-banner__text strong { color: #b45309; font-weight: 600; }
.pending-banner__actions { flex: none; display: inline-flex; align-items: center; gap: 4px; }

/* KPI 概览条 */
.kpi-strip {
  display: flex; align-items: stretch; flex: none;
  margin-bottom: 12px; padding: 0;
  background: #fff; border: 1px solid #eef0f2; border-radius: 8px; overflow: hidden;
}
.kpi-item {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; padding: 12px 8px; min-width: 0;
  border-right: 1px solid #f0f2f5;
}
.kpi-item:last-child { border-right: none; }
.kpi-item--hero {
  flex: 1.2; background: linear-gradient(180deg, #f8fbff 0%, #fff 100%);
}
.kpi-item--click { cursor: pointer; transition: background 0.15s; }
.kpi-item--click:hover { background: #fffbeb; }
.kpi-num {
  font-size: 20px; font-weight: 700; color: #111827; line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.kpi-num small { font-size: 13px; font-weight: 600; color: #6b7280; margin-left: 1px; }
.kpi-num--ok { color: #059669; }
.kpi-num--warn { color: #d97706; }
.kpi-num--err { color: #dc2626; }
.kpi-label { font-size: 12px; color: #9ca3af; white-space: nowrap; }

.cols { display: flex; gap: 12px; flex: 1; min-height: 0; }

.left {
  width: 280px; flex: none; background: #fff; border: 1px solid #eef0f2;
  border-radius: 8px; padding: 12px; display: flex; flex-direction: column; min-height: 0;
}
.panel-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex: none; }
.p-title { font-size: 13px; font-weight: 600; color: #374151; flex: none; white-space: nowrap; }
.tree-search { flex: 1; min-width: 0; }
.tree-search :deep(.ant-input) { font-size: 12px; }
.prod-tree { flex: 1; overflow: auto; font-size: 13px; margin: 0 -4px; padding: 0 4px; }
.node { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; }
.node-status {
  flex: none; width: 6px; height: 6px; border-radius: 50%; margin-left: 2px;
}
.node-status--valid { background: #10b981; box-shadow: 0 0 0 2px rgb(16 185 129 / 20%); }
.node-status--pending { background: #f59e0b; box-shadow: 0 0 0 2px rgb(245 158 11 / 20%); }
.node-status--invalid { background: #ef4444; box-shadow: 0 0 0 2px rgb(239 68 68 / 20%); }
.node-name {
  flex: 1; min-width: 0; font-size: 13px; color: #374151;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.node-meta { flex: none; display: inline-flex; align-items: center; gap: 4px; }
.node-kind {
  flex: none; padding: 0 5px; height: 18px; border-radius: 4px;
  font-size: 11px; line-height: 18px; font-weight: 500; white-space: nowrap;
}
.kind-bg { background: #eff6ff; color: #2563eb; }
.kind-biz { background: #ecfdf5; color: #059669; }
.kind-line { background: #fff7ed; color: #ea580c; }
.kind-cat { background: #fef2f2; color: #dc2626; }
.kind-prod { background: #f5f3ff; color: #7c3aed; }

:deep(.prod-tree .ant-tree-treenode) { align-items: center; padding: 0; }
:deep(.prod-tree .ant-tree-indent-unit) { width: 22px; }
:deep(.prod-tree .ant-tree-switcher) {
  width: 22px; flex: none; align-self: stretch;
  display: inline-flex; align-items: center; justify-content: center;
  margin: 0; color: #8c8c8c;
}
:deep(.prod-tree .ant-tree-node-content-wrapper) {
  flex: 1; min-width: 0; padding: 3px 6px; margin: 1px 0; border-radius: 4px;
}
:deep(.prod-tree .ant-tree-node-content-wrapper:hover) { background: #f3f4f6; }
:deep(.prod-tree .ant-tree-node-content-wrapper.ant-tree-node-selected) { background: #eff6ff !important; }
:deep(.prod-tree .ant-tree-node-content-wrapper.ant-tree-node-selected .node-name) { color: #1a6fff; font-weight: 500; }

.right { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.body--list { gap: 0; padding: 0; }

.list-card {
  background: #fff; border: 1px solid #eef0f2; border-radius: 8px; overflow: hidden;
  flex: 1; min-height: 0; display: flex; flex-direction: column;
}
.list-card-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid #f0f2f5; flex: none;
  background: #fafbfc;
}
.list-card-head__main { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
.list-card-title { font-size: 14px; font-weight: 600; color: #111827; }
.list-card-count { font-size: 12px; color: #9ca3af; }
.scope-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px 2px 10px; border-radius: 999px;
  font-size: 12px; color: #1a6fff; background: #eff6ff; border: 1px solid #bfdbfe;
  max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.scope-tag__clear {
  flex: none; font-size: 12px; color: #93c5fd; cursor: pointer; transition: color 0.15s;
}
.scope-tag__clear:hover { color: #1a6fff; }

.list-toolbar {
  display: flex; flex-direction: column; gap: 0;
  padding: 8px 12px; border-bottom: 1px solid #f0f2f5; flex: none;
}
.toolbar-row {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap; width: 100%;
}
.fi { display: flex; align-items: center; gap: 6px; flex: none; }
.fl { font-size: 12px; color: #6b7280; white-space: nowrap; }
.sel-w { width: 120px !important; }
.toolbar-row :deep(.tb-ctl.ant-select .ant-select-selector) {
  font-size: 13px; border-radius: 6px; background: #fff;
}
.toolbar-row :deep(.ant-select-selection-placeholder) { color: #9ca3af; }

.list-controls { padding: 8px 12px; border-bottom: 1px solid #f0f2f5; flex: none; }
.wb-toolbar {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 12px; width: 100%; min-width: 0;
}
.wb-toolbar__cluster {
  display: inline-flex; align-items: center; gap: 8px; flex: none; flex-shrink: 0;
}
.wb-toolbar__search {
  display: flex; align-items: center; gap: 8px;
  width: 240px; height: 32px; padding: 0 10px;
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
  display: inline-flex; align-items: center; gap: 6px; height: 32px;
  padding: 0 12px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 13px; color: #374151; cursor: pointer; user-select: none; white-space: nowrap; flex: none;
}
.wb-toolbar__btn:hover { border-color: #1a6fff; color: #1a6fff; }
.wb-toolbar__btn--primary { color: #fff; background: #1a6fff; border-color: #1a6fff; }
.wb-toolbar__btn--primary:hover { background: #0f4fcc; border-color: #0f4fcc; color: #fff; }
.wb-toolbar__btn--batch { color: #6b7280; }
.wb-toolbar__btn--batch.is-active { color: #1a6fff; border-color: #bfdbfe; background: #f8fbff; }
.wb-toolbar__btn--batch.is-active:hover { border-color: #1a6fff; }
.wb-toolbar__badge {
  min-width: 18px; height: 18px; padding: 0 5px;
  font-size: 11px; font-weight: 600; line-height: 18px; text-align: center;
  color: #fff; background: #1a6fff; border-radius: 9px;
}

.list-card :deep(.ant-table-wrapper) { padding: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.table-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.table-wrap :deep(.ant-spin-nested-loading),
.table-wrap :deep(.ant-spin-container) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.table-wrap :deep(.ant-table) { flex: 1; min-height: 0; }
.table-wrap :deep(.ant-table-pagination) {
  flex: none; margin: 0 !important; padding: 10px 16px;
  border-top: 1px solid #f0f2f5; background: #fafbfc;
}
.list-card :deep(.ant-table-thead > tr > th) {
  background: #fafbfc; color: #6b7280; font-size: 12px; font-weight: 600;
  padding: 10px 12px; border-bottom: 1px solid #f0f2f5;
}
.list-card :deep(.ant-table-tbody > tr > td) {
  padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #f5f6f8;
}
.list-card :deep(.ant-table-tbody > tr:hover > td) { background: #f9fafb; }
.list-card :deep(.ant-table-cell-fix-right) { padding-right: 16px !important; text-align: right; }

.cell-link { color: #1a6fff; cursor: pointer; font-size: 13px; }
.cell-link:hover { text-decoration: underline; }
.row-ops { display: inline-flex; align-items: center; justify-content: flex-end; flex-wrap: nowrap; white-space: nowrap; }
.row-ops :deep(.ant-btn-link) { padding: 0 6px; height: 22px; line-height: 22px; }
.empty-hint { padding: 32px 24px; color: #9ca3af; text-align: center; }
.muted { color: #9ca3af; }
.ext-id { color: #9ca3af; font-size: 12px; margin-left: 4px; }
.pending-type-tag { margin-right: 6px; vertical-align: middle; }
.pending-reason { font-size: 12px; color: #6b7280; line-height: 1.4; }

/* ========== 配置抽屉 ========== */
.map-drawer :deep(.ant-drawer-title) { flex: 1; min-width: 0; }
.map-drawer-title {
  display: flex; align-items: center; gap: 8px; min-width: 0;
}
.map-drawer-title__text {
  font-size: 16px; font-weight: 600; color: #111827;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.map-drawer-title__tag { flex: none; margin: 0; font-size: 12px; line-height: 20px; }

.map-drawer-body {
  flex: 1; min-height: 0; overflow: auto; padding: 16px 0;
}

.prod-hero {
  display: flex; align-items: flex-start; gap: 12px;
  margin: 0 20px 16px; padding: 14px 16px;
  background: linear-gradient(135deg, #f8fbff 0%, #fff 100%);
  border: 1px solid #e8eef8; border-radius: 10px;
}
.prod-hero__icon {
  flex: none; width: 40px; height: 40px; border-radius: 10px;
  background: #1a6fff; color: #fff; font-size: 16px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.prod-hero__content { flex: 1; min-width: 0; }
.prod-hero__name {
  font-size: 16px; font-weight: 600; color: #111827; line-height: 1.35;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.prod-hero__meta {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  margin-top: 6px; font-size: 12px; color: #6b7280; line-height: 1.4;
}
.prod-hero__code {
  padding: 1px 6px; border-radius: 4px; background: #f3f4f6;
  font-size: 11px; color: #4b5563;
}
.prod-hero__sep { color: #d1d5db; }

.map-sec { padding: 0 20px 20px; }
.map-sec--muted { padding-bottom: 12px; }
.map-sec__head {
  display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
}
.map-sec__title { font-size: 13px; font-weight: 600; color: #374151; }
.map-sec__tip { font-size: 12px; color: #9ca3af; margin-left: auto; }
.map-sec__req {
  font-size: 11px; color: #ef4444; padding: 0 6px; height: 18px; line-height: 18px;
  border-radius: 4px; background: #fef2f2;
}

/* 服务卡片 2×2 */
.sys-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
.sys-card {
  position: relative; display: flex; align-items: center; gap: 8px;
  padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 8px;
  background: #fff; cursor: pointer; text-align: left;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.sys-card:hover { border-color: #93c5fd; background: #f8fbff; }
.sys-card.is-active {
  border-color: #1a6fff; background: #f0f7ff;
  box-shadow: 0 0 0 2px rgb(26 111 255 / 12%);
}
.sys-card__dot {
  flex: none; width: 8px; height: 8px; border-radius: 50%;
}
.sys-card--feishu .sys-card__dot { background: #3b82f6; }
.sys-card--tpd .sys-card__dot { background: #8b5cf6; }
.sys-card--rdm .sys-card__dot { background: #f59e0b; }
.sys-card--panshi .sys-card__dot { background: #06b6d4; }
.sys-card__label { flex: 1; font-size: 13px; font-weight: 500; color: #374151; }
.sys-card__check { flex: none; font-size: 14px; color: #1a6fff; }

.map-field { margin-bottom: 14px; }
.map-field:last-child { margin-bottom: 0; }
.map-field__label {
  display: block; margin-bottom: 6px; font-size: 12px; color: #6b7280;
}
.map-field__ctl { width: 100%; }
.map-field__hint { margin: 6px 0 0; font-size: 12px; color: #9ca3af; }
.map-field__hint--warn { color: #d97706; }

.ext-opt {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.ext-opt__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ext-opt__id {
  flex: none; font-size: 11px; color: #9ca3af; background: #f3f4f6;
  padding: 1px 6px; border-radius: 4px;
}

.ext-preview {
  margin-top: 14px; padding: 12px 14px;
  background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px;
}
.ext-preview__head { font-size: 11px; color: #9ca3af; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.02em; }
.ext-preview__name { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 6px; }
.ext-preview__row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.ext-preview__row code {
  font-size: 12px; color: #4b5563; background: #fff;
  padding: 2px 8px; border-radius: 4px; border: 1px solid #e5e7eb;
}
.ext-preview__biz { font-size: 12px; color: #6b7280; }

/* 待确认抽屉 */
.pending-strip {
  display: flex; gap: 10px; align-items: flex-start;
  margin: 0 20px 16px; padding: 12px 14px;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
  font-size: 14px; color: #d97706;
}
.pending-strip__text { flex: 1; min-width: 0; }
.pending-strip__text strong { display: block; font-size: 13px; color: #92400e; margin-bottom: 4px; }
.pending-strip__text p { margin: 0; font-size: 12px; color: #b45309; line-height: 1.5; }

.review-card {
  padding: 14px 16px; border-radius: 8px; border: 1px solid #e5e7eb;
  background: #fff;
}
.review-card--suggest { border-color: #bfdbfe; background: #f8fbff; }
.review-card--prev { border-color: #fecaca; background: #fef2f2; }
.review-kv {
  display: flex; gap: 12px; padding: 6px 0; font-size: 13px; line-height: 1.5;
}
.review-kv:first-child { padding-top: 0; }
.review-kv:last-child { padding-bottom: 0; }
.review-k { flex: none; width: 72px; color: #9ca3af; }
.review-v { flex: 1; min-width: 0; color: #374151; word-break: break-all; }
.review-v--score { font-weight: 600; color: #1a6fff; }
.review-id {
  display: inline-block; margin-left: 6px; font-size: 11px; color: #6b7280;
  background: rgb(255 255 255 / 80%); padding: 1px 6px; border-radius: 4px;
}

.flow-hint {
  margin: 0 20px; padding: 12px 14px; border-radius: 8px;
  background: #f9fafb; border: 1px solid #f0f2f5;
}
.flow-hint__item {
  font-size: 12px; color: #6b7280; line-height: 1.7;
}
.flow-hint__item strong { color: #374151; font-weight: 600; margin-right: 4px; }

.map-drawer-footer {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
}
</style>
