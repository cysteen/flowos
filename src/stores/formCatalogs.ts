import { defineStore } from 'pinia';
import { computed, onScopeDispose, ref, watch } from 'vue';
import { canAccessAdminItem } from '@/config/roles';
import { useTenantStore } from '@/stores/tenant';
import { useUserStore } from '@/stores/user';
import type { RegistrationFieldKey, RegistrationProduct, RegistrationTemplate } from '@/views/tickets/types/businessRegistration';

export interface FormCatalogOption {
  id: string;
  field: RegistrationFieldKey;
  value: string;
  label: string;
  parentValue?: string;
  enabled: boolean;
  sort: number;
}
export interface FormCatalogProduct extends RegistrationProduct { id: string; enabled: boolean }
export interface FormCatalog {
  templateId: string;
  revision: number;
  options: FormCatalogOption[];
  products: FormCatalogProduct[];
}
export interface FormCatalogResult { ok: boolean; message: string }
export interface FormCatalogOptionInput {
  id?: string; field: RegistrationFieldKey; value: string; label?: string; parentValue?: string; enabled: boolean; sort?: number; expectedRevision?: number;
}
const VERSION = 1;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const idOf = (scope: string, value: string) => `${scope}:${Array.from(value).map((char) => char.codePointAt(0)!.toString(36)).join('.')}`;

/** These are option dictionaries, not workflow states, roles, or template design controls. */
export function formCatalogFields(seed: RegistrationTemplate) {
  return seed.fields.filter((field) => !!field.options || ['specificSource', 'productCategory', 'problemL1', 'problemL2'].includes(field.key));
}
export function formCatalogParentField(field: RegistrationFieldKey): RegistrationFieldKey | undefined {
  return field === 'specificSource' ? 'feedback' : field === 'problemL2' ? 'problemL1' : undefined;
}
function factory(seed: RegistrationTemplate): FormCatalog {
  const options: FormCatalogOption[] = [];
  const add = (field: RegistrationFieldKey, values: readonly string[], parentValue?: string) => values.forEach((value, index) => options.push({
    id: idOf(`${seed.id}:${field}`, `${parentValue ?? ''}\u0001${value}`), field, value, label: value,
    ...(parentValue ? { parentValue } : {}), enabled: true, sort: index + 1,
  }));
  seed.fields.filter((field) => field.options).forEach((field) => add(field.key, field.options!));
  add('productCategory', [...new Set(seed.products.map((product) => product.category))]);
  add('problemL1', Object.keys(seed.problemOptions));
  Object.entries(seed.problemOptions).forEach(([parent, children]) => add('problemL2', children, parent));
  Object.entries(seed.sourceOptions).forEach(([parent, children]) => add('specificSource', children, parent));
  return {
    templateId: seed.id, revision: 0, options,
    products: seed.products.map((product) => ({ ...product, id: idOf(`${seed.id}:product`, product.name), enabled: true })),
  };
}

/** A small shared data layer consumed by the existing dictionary/product pages and form resolver. */
export const useFormCatalogsStore = defineStore('formCatalogs', () => {
  const tenant = useTenantStore();
  const user = useUserStore();
  const catalogs = ref<Record<string, FormCatalog>>({});
  const revision = ref(0);
  const cacheKey = computed(() => `flowos-form-catalogs-v${VERSION}:${tenant.currentTenantId ?? 'default'}`);
  const canManageOptions = computed(() => canAccessAdminItem(user.role, 'dicts'));
  const canManageProducts = computed(() => canAccessAdminItem(user.role, 'products'));
  function readCache(): Record<string, FormCatalog> {
    const data = JSON.parse(localStorage.getItem(cacheKey.value) ?? 'null') as { version?: number; catalogs?: Record<string, FormCatalog> } | null;
    return data?.version === VERSION && data.catalogs && typeof data.catalogs === 'object' ? data.catalogs : {};
  }
  function hydrate() {
    try { catalogs.value = readCache(); } catch { catalogs.value = {}; }
    revision.value += 1;
  }
  function catalogOf(seed: RegistrationTemplate): FormCatalog { return catalogs.value[seed.id] ?? factory(seed); }
  function optionRows(seed: RegistrationTemplate, field: RegistrationFieldKey, enabledOnly = false): FormCatalogOption[] {
    return catalogOf(seed).options.filter((row) => row.field === field && (!enabledOnly || row.enabled)).sort((a, b) => a.sort - b.sort);
  }
  function productRows(seed: RegistrationTemplate): FormCatalogProduct[] { return catalogOf(seed).products; }
  function activeValues(catalog: FormCatalog, field: RegistrationFieldKey): string[] {
    return catalog.options.filter((row) => row.field === field && row.enabled).sort((a, b) => a.sort - b.sort).map((row) => row.value);
  }
  function resolve(seed: RegistrationTemplate): RegistrationTemplate {
    const catalog = catalogOf(seed);
    const feedback = activeValues(catalog, 'feedback');
    const lines = activeValues(catalog, 'businessLine');
    const categories = activeValues(catalog, 'productCategory');
    const problemOptions: Record<string, string[]> = {};
    activeValues(catalog, 'problemL1').forEach((parent) => {
      problemOptions[parent] = catalog.options.filter((row) => row.field === 'problemL2' && row.parentValue === parent && row.enabled).sort((a, b) => a.sort - b.sort).map((row) => row.value);
    });
    const sourceOptions: Record<string, string[]> = {};
    // Retain parent keys for historical source visibility; only enabled children are selectable.
    new Set(catalog.options.filter((row) => row.field === 'specificSource' && row.parentValue).map((row) => row.parentValue!)).forEach((parent) => {
      sourceOptions[parent] = feedback.includes(parent) ? catalog.options.filter((row) => row.field === 'specificSource' && row.parentValue === parent && row.enabled).sort((a, b) => a.sort - b.sort).map((row) => row.value) : [];
    });
    return {
      ...seed,
      optionLabels: Object.fromEntries(catalog.options.map((row) => [[row.field, row.parentValue ?? '', row.value].join('\u0001'), row.label])),
      fields: seed.fields.map((field) => formCatalogFields(seed).some((managed) => managed.key === field.key)
        ? { ...field, options: activeValues(catalog, field.key) }
        : field),
      products: catalog.products.filter((product) => product.enabled && categories.includes(product.category) && (!product.businessLine || lines.includes(product.businessLine))).map(({ id: _id, enabled: _enabled, ...product }) => product),
      problemOptions, sourceOptions,
    };
  }
  function commit(seed: RegistrationTemplate, next: FormCatalog): FormCatalogResult {
    let persisted: Record<string, FormCatalog>;
    try { persisted = readCache(); } catch { return { ok: false, message: '配置读取失败，请刷新后重试' }; }
    if ((persisted[seed.id]?.revision ?? 0) !== catalogOf(seed).revision) {
      hydrate(); return { ok: false, message: '配置已由其他页面更新，请核对最新内容后重试' };
    }
    next.revision = catalogOf(seed).revision + 1;
    const all = { ...persisted, [seed.id]: next };
    try { localStorage.setItem(cacheKey.value, JSON.stringify({ version: VERSION, catalogs: all })); }
    catch { return { ok: false, message: '配置保存失败，请检查浏览器存储空间' }; }
    catalogs.value = all; revision.value += 1;
    return { ok: true, message: '配置已保存，业务表单同步生效' };
  }
  function saveOption(seed: RegistrationTemplate, input: FormCatalogOptionInput): FormCatalogResult {
    if (!canManageOptions.value) return { ok: false, message: '当前账号无字典维护权限' };
    if (input.expectedRevision !== undefined && input.expectedRevision !== catalogOf(seed).revision) return { ok: false, message: '配置已更新，请关闭弹窗并重新编辑' };
    const next = clone(catalogOf(seed));
    if (!formCatalogFields(seed).some((field) => field.key === input.field)) return { ok: false, message: '该字段不属于业务选项字典' };
    const value = input.value.trim(), label = (input.label ?? input.value).trim();
    if (!value || !label) return { ok: false, message: '请填写字典标签与键值' };
    const parentField = formCatalogParentField(input.field);
    const parentValue = input.parentValue?.trim() || undefined;
    const existing = input.id ? next.options.find((row) => row.id === input.id) : undefined;
    if (input.id && !existing) return { ok: false, message: '字典项已不存在，请刷新后重试' };
    if (existing && (existing.field !== input.field || existing.value !== value || existing.label !== label || existing.parentValue !== parentValue)) return { ok: false, message: '已有字典键值、名称和上级保持稳定，请通过新增选项调整' };
    if (!existing && parentField && (!parentValue || !next.options.some((row) => row.field === parentField && row.value === parentValue && row.enabled))) return { ok: false, message: '请选择启用中的上级选项' };
    if (next.options.some((row) => row.id !== existing?.id && row.field === input.field && row.value === value && row.parentValue === parentValue)) return { ok: false, message: '同一上级下的字典键值已存在' };
    const row: FormCatalogOption = { id: existing?.id ?? idOf(`${seed.id}:${input.field}`, `${parentValue ?? ''}\u0001${value}`), field: input.field, value, label, parentValue, enabled: input.enabled, sort: Math.max(0, input.sort ?? existing?.sort ?? next.options.length + 1) };
    if (existing) next.options.splice(next.options.findIndex((item) => item.id === existing.id), 1, row);
    else next.options.push(row);
    return commit(seed, next);
  }
  function setOptionEnabled(seed: RegistrationTemplate, id: string, enabled: boolean): FormCatalogResult {
    const row = catalogOf(seed).options.find((item) => item.id === id);
    if (!row) return { ok: false, message: '字典项不存在' };
    return saveOption(seed, { ...row, enabled });
  }
  function saveProduct(seed: RegistrationTemplate, input: { id?: string; name: string; category: string; businessLine: string; enabled: boolean; expectedRevision?: number }): FormCatalogResult {
    if (!canManageProducts.value) return { ok: false, message: '当前账号无产品维护权限' };
    if (input.expectedRevision !== undefined && input.expectedRevision !== catalogOf(seed).revision) return { ok: false, message: '配置已更新，请关闭弹窗并重新编辑' };
    const next = clone(catalogOf(seed));
    const existing = input.id ? next.products.find((product) => product.id === input.id) : undefined;
    const name = input.name.trim(), category = input.category.trim(), businessLine = input.businessLine.trim();
    if (!name || !category || !businessLine) return { ok: false, message: '请填写产品名称、产品分类和业务线归属' };
    if (input.id && !existing) return { ok: false, message: '产品已不存在，请刷新后重试' };
    if (existing && existing.name !== name) return { ok: false, message: '已有产品名称保持稳定，请新增产品' };
    if (next.products.some((product) => product.id !== existing?.id && product.name === name)) return { ok: false, message: '产品名称已存在' };
    if (!next.options.some((row) => row.field === 'businessLine' && row.value === businessLine && row.enabled)) return { ok: false, message: '请选择启用中的业务线' };
    const categoryOption = next.options.find((row) => row.field === 'productCategory' && row.value === category);
    if (categoryOption && !categoryOption.enabled) return { ok: false, message: '该产品分类已停用，请先在字典管理启用' };
    if (!categoryOption) next.options.push({ id: idOf(`${seed.id}:productCategory`, `\u0001${category}`), field: 'productCategory', value: category, label: category, enabled: true, sort: next.options.length + 1 });
    const product: FormCatalogProduct = { id: existing?.id ?? idOf(`${seed.id}:product`, name), name, category, businessLine, enabled: input.enabled };
    if (existing) next.products.splice(next.products.findIndex((item) => item.id === existing.id), 1, product);
    else next.products.push(product);
    return commit(seed, next);
  }
  function setProductEnabled(seed: RegistrationTemplate, id: string, enabled: boolean): FormCatalogResult {
    if (!canManageProducts.value) return { ok: false, message: '当前账号无产品维护权限' };
    const next = clone(catalogOf(seed)), row = next.products.find((product) => product.id === id);
    if (!row) return { ok: false, message: '产品不存在' };
    row.enabled = enabled;
    return commit(seed, next);
  }
  hydrate();
  watch(() => tenant.currentTenantId, hydrate);
  if (typeof window !== 'undefined') {
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === cacheKey.value) hydrate(); };
    window.addEventListener('storage', onStorage);
    onScopeDispose(() => window.removeEventListener('storage', onStorage));
  }
  return { catalogs, revision, canManageOptions, canManageProducts, catalogOf, optionRows, productRows, resolve, saveOption, setOptionEnabled, saveProduct, setProductEnabled, hydrate };
});
