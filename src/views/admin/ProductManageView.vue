<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTenantStore } from '@/stores/tenant';
import { useFormCatalogsStore, type FormCatalogProduct } from '@/stores/formCatalogs';
import { REGISTRATION_TEMPLATES } from '@/views/tickets/types/businessRegistration';
import { message } from 'ant-design-vue';
import {
  PlusOutlined, EditOutlined, ReloadOutlined, SwapOutlined,
  FullscreenOutlined, UnorderedListOutlined, SettingOutlined,
} from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { stdPagination } from '@/config/adminUi';
import {
  PRODUCT_TREE_DATA, PRODUCT_TREE_DEFAULT_EXPANDED, filterProductTree,
  type ProductTreeNode,
} from '@/mock/productTree';
import { FLASH_MODEL_SEED } from '@/mock/flash/models';

const KIND_LABEL: Record<ProductTreeNode['kind'], string> = {
  BGBU: 'BGBU', 业务线: '业务线', 产品线: '产品线', 产品分类: '分类', 产品: '产品',
};
const KIND_CLASS: Record<ProductTreeNode['kind'], string> = {
  BGBU: 'kind-bg', 业务线: 'kind-biz', 产品线: 'kind-line', 产品分类: 'kind-cat', 产品: 'kind-prod',
};

const router = useRouter();
const route = useRoute();
const props = defineProps<{ templateId?: string; embedded?: boolean }>();
const catalogs = useFormCatalogsStore();
const tenant = useTenantStore();
const catalogTemplateId = ref(props.templateId ?? (typeof route.query.template === 'string' ? route.query.template : ''));
const catalogSeed = computed(() => REGISTRATION_TEMPLATES.find((template) => template.id === catalogTemplateId.value));
const catalogScopeOptions = [{ value: '', label: '平台产品目录' }, ...REGISTRATION_TEMPLATES.map((template) => ({ value: template.id, label: `${template.name} · 表单引用目录` }))];
const catalogKeyword = ref('');
const catalogStatus = ref('');
const catalogRows = computed(() => catalogSeed.value ? catalogs.productRows(catalogSeed.value).filter((product) => (!catalogKeyword.value.trim() || `${product.name} ${product.category} ${product.businessLine ?? ''}`.includes(catalogKeyword.value.trim())) && (!catalogStatus.value || (product.enabled ? 'enabled' : 'disabled') === catalogStatus.value)) : []);
const catalogColumns = [
  { title: '产品名称', key: 'name', dataIndex: 'name', width: 260 },
  { title: '业务线', key: 'businessLine', dataIndex: 'businessLine', width: 220 },
  { title: '产品线', key: 'category', dataIndex: 'category', width: 190 },
  { title: '状态', key: 'enabled', width: 100 },
  { title: '操作', key: 'op', width: 170 },
];
const catalogProductOpen = ref(false);
const catalogProductRevision = ref(0);
const catalogProductForm = reactive({ id: '', name: '', category: '', businessLine: '', enabled: true });
watch([catalogTemplateId, () => tenant.currentTenantId], () => { catalogProductOpen.value = false; });
const catalogBusinessLines = computed(() => catalogSeed.value ? catalogs.optionRows(catalogSeed.value, 'businessLine', true).map((row) => ({ value: row.value, label: row.label })) : []);
const catalogCategories = computed(() => catalogSeed.value ? catalogs.optionRows(catalogSeed.value, 'productCategory', true).filter((row) => row.parentValue === catalogProductForm.businessLine).map((row) => ({ value: row.value, label: row.label })) : []);
function catalogProductReady(product: FormCatalogProduct) {
  return !!catalogSeed.value && !!product.businessLine
    && catalogs.optionRows(catalogSeed.value, 'businessLine', true).some((row) => row.value === product.businessLine)
    && catalogs.optionRows(catalogSeed.value, 'productCategory', true).some((row) => row.value === product.category && row.parentValue === product.businessLine);
}
watch(() => route.query.template, (template) => { if (!props.templateId) catalogTemplateId.value = typeof template === 'string' ? template : ''; });
watch(() => props.templateId, (template) => { if (template) catalogTemplateId.value = template; });
function changeCatalogBusinessLine() { catalogProductForm.category = ''; }
function openCatalogProduct(product?: FormCatalogProduct) {
  if (catalogSeed.value) catalogProductRevision.value = catalogs.catalogOf(catalogSeed.value).revision;
  Object.assign(catalogProductForm, product ? { ...product, businessLine: product.businessLine ?? '' } : { id: '', name: '', category: '', businessLine: '', enabled: true });
  catalogProductOpen.value = true;
}
function saveCatalogProduct() {
  if (!catalogSeed.value) return;
  const result = catalogs.saveProduct(catalogSeed.value, { ...catalogProductForm, id: catalogProductForm.id || undefined, expectedRevision: catalogProductRevision.value });
  if (result.ok) { message.success(result.message); catalogProductOpen.value = false; } else message.warning(result.message);
}
function toggleCatalogProduct(product: FormCatalogProduct) {
  if (!catalogSeed.value) return;
  const result = catalogs.setProductEnabled(catalogSeed.value, product.id, !product.enabled);
  if (result.ok) message.success(result.message); else message.warning(result.message);
}

const treeSearch = ref('');
const visibleTree = computed(() => filterProductTree(PRODUCT_TREE_DATA, treeSearch.value));
const expandedKeys = ref<string[]>([...PRODUCT_TREE_DEFAULT_EXPANDED]);
const selectedKeys = ref<string[]>([]);

/** 右侧筛选 */
const filter = reactive<{ bgbu?: string; bizline?: string; prodline?: string; bizcat?: string; prodcat?: string; name: string }>({
  bgbu: undefined, bizline: undefined, prodline: undefined,
  bizcat: undefined, prodcat: undefined, name: '',
});
function onQuery() { message.success('已按条件查询'); }
function onReset() {
  Object.assign(filter, { bgbu: undefined, bizline: undefined, prodline: undefined, bizcat: undefined, prodcat: undefined, name: '' });
}

/** 产品列表 */
interface Product {
  key: string; name: string; bgbu: string; bizline: string;
  prodline: string; bizcat: string; prodcat: string;
}
const products = ref<Product[]>([
  { key: '1', name: '阿尔法蛋学习耳机B…', bgbu: '安徽淘云科…', bizline: '安徽淘云科…', prodline: '安徽淘云科…', bizcat: '智能硬件', prodcat: '阿尔法蛋耳机系列' },
  { key: '2', name: '讯飞智能耳背式助…', bgbu: '讯飞医疗科…', bizline: '智慧医院业…', prodline: '智能硬件产…', bizcat: '医疗', prodcat: '助听器系列' },
  { key: '3', name: '宝付随心选联合会员', bgbu: '消费者事业群', bizline: '数字娱乐业…', prodline: '互联网酷音…', bizcat: '无线音乐', prodcat: '酷音-互联网投放' },
  { key: '4', name: '讯飞阅读器Cube2(…', bgbu: '消费者事业群', bizline: '合肥讯飞读…', prodline: '合肥讯飞读…', bizcat: '其他', prodcat: '智能办公系列' },
  { key: '5', name: '飞鱼星APE5400', bgbu: '教育事业群', bizline: '大课堂产品线', prodline: '课堂产品线', bizcat: '教育', prodcat: '服务器' },
  { key: '6', name: '智慧黑板显示终端B…', bgbu: '教育事业群', bizline: '大课堂产品线', prodline: '智慧窗产品线', bizcat: '教育', prodcat: '智慧大屏系列' },
  // 智慧课堂学生平板（与产品树「教育事业群 → 智慧课堂业务线 → 学生平板产品线 → 学习硬件」同一批产品）
  ...FLASH_MODEL_SEED.map((m) => ({
    key: `edu-${m.id}`, name: m.model, bgbu: '教育事业群', bizline: '智慧课堂业务线',
    prodline: '学生平板产品线', bizcat: '教育', prodcat: m.category,
  })),
]);

/**
 * 刷机单识别只看问题分类「专属类型＝刷机」（10-19 C1）；是否自研机型只看自研机型表（后台维护、不设页面，PRD §9 / 附录 A.4），
 * 产品管理不设刷机相关的列与开关。
 */
const cols = [
  { title: '产品名称', dataIndex: 'name', key: 'name', width: 200 },
  { title: 'BGBU', dataIndex: 'bgbu', key: 'bgbu', width: 130 },
  { title: '业务线', dataIndex: 'bizline', key: 'bizline', width: 130 },
  { title: '产品线', dataIndex: 'prodline', key: 'prodline', width: 130 },
  { title: '业务类型', dataIndex: 'bizcat', key: 'bizcat', width: 110 },
  { title: '产品分类', dataIndex: 'prodcat', key: 'prodcat', width: 150 },
  { title: '操作', key: 'op', width: 80, fixed: 'right' as const },
];

const checkedKeys = ref<string[]>([]);
const rowSelection = computed(() => ({
  selectedRowKeys: checkedKeys.value,
  onChange: (keys: (string | number)[]) => { checkedKeys.value = keys as string[]; },
}));

const pagination = stdPagination({ pageSize: 20, total: 1796 });

/** 编辑产品：本期无可改项，产品主数据只读查看 */
const editOpen = ref(false);
const editing = ref<Product | null>(null);
function onEdit(p: Product) {
  editing.value = p;
  editOpen.value = true;
}
function onCreate() { if (catalogSeed.value) openCatalogProduct(); else message.info('新建产品'); }
function goRdMapping() { router.push('/admin/product-rd-mapping'); }
</script>

<template>
  <div class="product-manage" :class="{ 'product-manage--embedded': embedded }">
    <AdminPageHeader v-if="!embedded" title="产品管理" :subtitle="catalogSeed ? '维护业务表单产品的业务线、产品线归属及启停状态，与实体字典共用数据' : '按 BGBU/业务线/产品线/分类 维护五级产品体系；工单分类、路由与问题分类依此归属'">
      <template #actions>
        <a-button v-if="!catalogSeed" @click="goRdMapping">产研产品关联</a-button>
        <a-button type="primary" @click="onCreate"><template #icon><PlusOutlined /></template>新建产品</a-button>
      </template>
    </AdminPageHeader>

    <div v-if="!embedded" class="catalog-scope"><span>产品目录</span><a-select v-model:value="catalogTemplateId" :options="catalogScopeOptions" style="width:350px" /><span v-if="catalogSeed" class="scope-note">供本业务表单引用，产品名称保持稳定</span></div>
    <div v-if="!catalogSeed" class="cols">
      <!-- 左：产品树 -->
      <div class="left">
      <div class="panel-head">
        <span class="p-title">产品树</span>
        <a-button type="primary" shape="circle" size="small"><template #icon><PlusOutlined /></template></a-button>
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
              <span v-if="node.a != null" class="node-cnt" title="问题分类数量">{{ (node.a ?? 0) + (node.b ?? 0) }}</span>
            </span>
          </span>
        </template>
      </a-tree>
    </div>

    <!-- 右：筛选 + 列表 -->
    <div class="right">
      <div class="filter-card">
        <a-form layout="inline" class="filter-form">
          <a-form-item label="BGBU"><a-select v-model:value="filter.bgbu" placeholder="请选择" class="fw" allow-clear /></a-form-item>
          <a-form-item label="业务线"><a-select v-model:value="filter.bizline" placeholder="请选择" class="fw" allow-clear /></a-form-item>
          <a-form-item label="产品线"><a-select v-model:value="filter.prodline" placeholder="请选择" class="fw" allow-clear /></a-form-item>
          <a-form-item label="业务类型"><a-select v-model:value="filter.bizcat" placeholder="请选择" class="fw" allow-clear /></a-form-item>
          <a-form-item label="产品分类"><a-select v-model:value="filter.prodcat" placeholder="请选择" class="fw" allow-clear /></a-form-item>
          <a-form-item label="产品名称"><a-input v-model:value="filter.name" placeholder="请输入产品名称" class="fw" allow-clear /></a-form-item>
        </a-form>
        <div class="filter-ops">
          <a-button>保存选项</a-button>
          <a-button disabled>启用</a-button>
          <a-button disabled>禁用</a-button>
          <a-button>导出</a-button>
          <a-button type="primary" @click="onQuery">查询</a-button>
          <a-button @click="onReset">重置</a-button>
          <a-button type="link">展开 ▾</a-button>
        </div>
      </div>

      <div class="table-card">
        <div class="table-tools">
          <ReloadOutlined class="t-ic" title="刷新" />
          <SwapOutlined class="t-ic rot" title="排序" />
          <FullscreenOutlined class="t-ic" title="全屏" />
          <UnorderedListOutlined class="t-ic" title="列设置" />
          <SettingOutlined class="t-ic" title="设置" />
        </div>
        <a-table
          :columns="cols"
          :data-source="products"
          :row-selection="rowSelection"
          :pagination="pagination"
          size="middle"
          :scroll="{ x: 1250 }"
          row-key="key"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a class="cell-link">{{ (record as Product).name }}</a>
            </template>
            <template v-else-if="column.key === 'prodcat'">
              <a class="cell-link">{{ (record as Product).prodcat }}</a>
            </template>
            <template v-else-if="column.key === 'op'">
              <a-button type="text" size="small" class="op-edit" @click="onEdit(record as Product)">
                <EditOutlined />
              </a-button>
            </template>
          </template>
        </a-table>
      </div>
    </div>
    </div>

    <div v-if="catalogSeed" class="catalog-products">
      <div class="catalog-toolbar"><a-input v-model:value="catalogKeyword" placeholder="搜索产品、产品线或业务线" allow-clear style="width:260px" /><a-select v-model:value="catalogStatus" :options="[{value:'',label:'全部状态'},{value:'enabled',label:'启用'},{value:'disabled',label:'停用'}]" style="width:120px" /><span>共 {{ catalogRows.length }} 个产品</span><a-button v-if="embedded" type="primary" @click="onCreate">新增产品</a-button></div>
      <a-table :columns="catalogColumns" :data-source="catalogRows" row-key="id" :pagination="{ pageSize: 15, showSizeChanger: false }" size="middle">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'businessLine'" :class="{ 'pending-mapping': !(record as FormCatalogProduct).businessLine }">{{ (record as FormCatalogProduct).businessLine || '待补齐归属' }}</span>
          <a-tag v-else-if="column.key === 'enabled'" :color="!(record as FormCatalogProduct).enabled ? 'default' : catalogProductReady(record as FormCatalogProduct) ? 'green' : 'orange'">{{ !(record as FormCatalogProduct).enabled ? '停用' : catalogProductReady(record as FormCatalogProduct) ? '启用' : '待配置' }}</a-tag>
          <template v-else-if="column.key === 'op'"><a-button type="link" size="small" @click="openCatalogProduct(record as FormCatalogProduct)">编辑归属</a-button><a-button type="link" size="small" @click="toggleCatalogProduct(record as FormCatalogProduct)">{{ (record as FormCatalogProduct).enabled ? '停用' : '启用' }}</a-button></template>
        </template>
      </a-table>
      <div class="catalog-tip">先配置业务线下的产品线，再维护产品归属。未补齐完整归属或已停用的产品不供新建选择；历史工单保留原组合，不随配置调整自动变更。</div>
    </div>
    <a-modal v-model:open="catalogProductOpen" :title="catalogProductForm.id ? '编辑产品归属' : '新增产品'" :width="500" ok-text="保存" cancel-text="取消" @ok="saveCatalogProduct">
      <a-form layout="vertical">
        <a-form-item label="产品名称" required><a-input v-model:value="catalogProductForm.name" :disabled="!!catalogProductForm.id" placeholder="填写产品名称" /></a-form-item>
        <a-form-item label="业务线" required><a-select v-model:value="catalogProductForm.businessLine" :options="catalogBusinessLines" placeholder="选择业务线" @change="changeCatalogBusinessLine" /></a-form-item>
        <a-form-item label="产品线" required><a-select v-model:value="catalogProductForm.category" :options="catalogCategories" :disabled="!catalogProductForm.businessLine" placeholder="选择该业务线下已配置的产品线" /></a-form-item>
        <a-form-item label="状态"><a-radio-group v-model:value="catalogProductForm.enabled"><a-radio-button :value="true">启用</a-radio-button><a-radio-button :value="false">停用</a-radio-button></a-radio-group></a-form-item>
      </a-form>
    </a-modal>
    <a-modal v-model:open="editOpen" title="编辑产品" :width="480">
      <a-form v-if="editing" layout="horizontal" :label-col="{ style: { width: '168px' } }" class="edit-form">
        <a-form-item label="产品名称"><a-input :value="editing.name" disabled /></a-form-item>
        <a-form-item label="产品分类"><a-input :value="editing.prodcat" disabled /></a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="editOpen = false">关闭</a-button>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.product-manage { padding: 20px 24px; }
.product-manage--embedded { padding:0; }
.catalog-scope { display:flex; align-items:center; gap:12px; margin:0 0 16px; color:#65758c; font-size:13px; }
.scope-note { color:#94a0b1; font-size:12px; }
.catalog-products { background:#fff; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; }
.catalog-toolbar { display:flex; align-items:center; gap:12px; padding:16px; color:#94a0b1; font-size:12px; }
.catalog-toolbar>span { margin-left:auto; }
.catalog-tip { padding:12px 16px; font-size:12px; color:#7a8ba3; border-top:1px solid #edf1f6; background:#fafbfd; }
.pending-mapping { color:#d59a38; font-size:12px; }
.cols { display: flex; gap: 16px; align-items: flex-start; }

/* 左：产品树（字号/间距对齐 admin-ui-spec §0、§4；树缩进对齐 §4 两栏页 + OrgManageView） */
.left {
  width: 320px; flex: none;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  display: flex; flex-direction: column;
  max-height: calc(100vh - 232px);
}
.panel-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
  font-size: 14px; font-weight: 600; color: #111827;
}
.p-title { font-size: inherit; font-weight: inherit; color: inherit; }
.tree-search { padding: 10px 12px 4px; }
.prod-tree { flex: 1; overflow: auto; padding: 4px 8px 8px; font-size: 13px; }
.node {
  display: flex; align-items: center; gap: 8px;
  width: 100%; min-width: 0;
}
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

/* 树对齐（参考 Windows 资源管理器）：缩进单元宽度 = 展开箭头列宽 = 22px，
   子级箭头恰好落在父级文字起始列；箭头与文字垂直居中、紧贴。 */
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

/* 右 */
.right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.filter-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 20px 8px; }
.filter-form { row-gap: 12px; }
.filter-form :deep(.ant-form-item) { margin-bottom: 12px; margin-right: 20px; }
.fw { width: 200px; }
.filter-ops { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; padding-top: 4px; }
.table-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 16px 16px; }
.table-tools { display: flex; justify-content: flex-end; gap: 14px; padding: 8px 4px 12px; }
.t-ic { font-size: 15px; color: #6b7280; cursor: pointer; }
.t-ic:hover { color: #1a6fff; }
.t-ic.rot { transform: rotate(90deg); }
.cell-link { color: #1a6fff; }
.cell-link:hover { text-decoration: underline; }
.op-edit { color: #1a6fff; }
.cell-empty { color: #9ca3af; }
:deep(.ant-table-thead > tr > th) { background: #f3f4f6; color: #6b7280; font-size: 12px; }
</style>
