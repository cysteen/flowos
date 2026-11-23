import { computed, onScopeDispose, ref, watch } from 'vue';
import { normalizePersonalUrl, validateLink, type WebsiteLink, type LinkResult } from './linkRules';

interface Options { scope: () => string; storagePrefix: string; writable: () => boolean; maxLinks?: number }
/** 仅模拟本地保存和顺序冲突检测，不代替服务端鉴权、跨设备同步或原子版本锁。 */
export function createLocalLinkCollection(options: Options) {
  const rows = ref<WebsiteLink[]>([]);
  const loadError = ref('');
  const conflict = ref(false);
  let editingLocks = 0;
  function holdRefresh() {
    editingLocks += 1;
    let held = true;
    return () => { if (held) { held = false; editingLocks -= 1; } };
  }
  const scopeKey = computed(options.scope);
  const canWrite = computed(() => !!scopeKey.value && options.writable());
  const key = computed(() => `${options.storagePrefix}:${scopeKey.value}`);
  let expectedRaw: string | null = null;
  function reload(): boolean {
    conflict.value = false;
    if (!scopeKey.value) { rows.value = []; loadError.value = ''; expectedRaw = null; return true; }
    try {
      const raw = localStorage.getItem(key.value);
      const data: unknown = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(data) || data.some(row => !row || typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.url !== 'string' || typeof row.sort !== 'number' || !normalizePersonalUrl(row.url))) throw new Error('invalid-list');
      if (new Set(data.map(row => row.id)).size !== data.length) throw new Error('duplicate-id');
      rows.value = [...data].sort((a, b) => a.sort - b.sort);
      expectedRaw = raw;
      loadError.value = '';
      return true;
    } catch { loadError.value = '网址加载失败，请重试'; return false; }
  }
  watch(scopeKey, () => { rows.value = []; reload(); }, { immediate: true, flush: 'sync' });
  function detectExternal() {
    if (!scopeKey.value || loadError.value) return;
    try {
      if (localStorage.getItem(key.value) !== expectedRaw) {
        if (editingLocks) conflict.value = true;
        else reload();
      }
    }
    catch { loadError.value = '更新失败，请重试'; }
  }
  function onStorage(event: StorageEvent) { if (event.key === key.value || event.key === null) detectExternal(); }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', detectExternal);
    onScopeDispose(() => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', detectExternal); });
  }
  function persist(next: WebsiteLink[], failure = '保存失败，请重试'): LinkResult {
    if (!canWrite.value) return { ok: false, message: '当前账号无维护权限，请重新登录或切换到有权限的账号' };
    if (loadError.value) return { ok: false, message: loadError.value };
    try {
      if (conflict.value || localStorage.getItem(key.value) !== expectedRaw) {
        conflict.value = true;
        return { ok: false, message: '网址列表已在其他页面更新，请重新加载后再操作' };
      }
      const ordered = next.map((row, sort) => ({ ...row, sort }));
      const raw = JSON.stringify(ordered);
      localStorage.setItem(key.value, raw);
      expectedRaw = raw;
      rows.value = ordered;
      return { ok: true };
    } catch { return { ok: false, message: failure }; }
  }
  function addLink(title: string, url: string, enabled = true): LinkResult {
    const parsed = validateLink(title, url, rows.value);
    if ('error' in parsed) return { ok: false, message: parsed.error };
    if (options.maxLinks && rows.value.length >= options.maxLinks) return { ok: false, message: `最多保存 ${options.maxLinks} 条网址` };
    const result = persist([...rows.value, { id: `link-${crypto.randomUUID()}`, title: parsed.title, url: parsed.url, sort: rows.value.length, updatedAt: new Date().toISOString(), enabled }]);
    return result.ok ? { ...result, sameName: parsed.sameName } : result;
  }
  function updateLink(id: string, title: string, url: string, enabled?: boolean): LinkResult {
    const row = rows.value.find(item => item.id === id);
    if (!row) return { ok: false, message: '条目已不存在，请重新加载后再操作' };
    const parsed = validateLink(title, url, rows.value, id);
    if ('error' in parsed) return { ok: false, message: parsed.error };
    if (parsed.title === row.title && parsed.url === row.url && (enabled === undefined || enabled === row.enabled)) {
      try { if (localStorage.getItem(key.value) !== expectedRaw) conflict.value = true; }
      catch { loadError.value = '更新失败，请重试'; }
      if (!canWrite.value || loadError.value || conflict.value) return { ok: false, message: loadError.value || '网址列表或权限已变化，请重新加载后再操作' };
      return { ok: true, unchanged: true };
    }
    const result = persist(rows.value.map(item => item.id === id ? { ...item, title: parsed.title, url: parsed.url, ...(enabled === undefined ? {} : { enabled }), updatedAt: new Date().toISOString() } : item));
    return result.ok ? { ...result, sameName: parsed.sameName } : result;
  }
  function removeLink(id: string): LinkResult {
    if (!rows.value.some(row => row.id === id)) return { ok: false, message: '条目已不存在，请重新加载后再操作' };
    return persist(rows.value.filter(row => row.id !== id), '删除失败，请重试');
  }
  function moveLink(id: string, direction: -1 | 1): LinkResult {
    const next = [...rows.value];
    const index = next.findIndex(row => row.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return { ok: true, unchanged: true };
    [next[index], next[target]] = [next[target], next[index]];
    return persist(next, '排序失败，请重试');
  }
  return { links: computed(() => rows.value), scopeKey, canWrite, loadError, conflict, maxLinks: options.maxLinks, holdRefresh, reload, addLink, updateLink, removeLink, moveLink };
}
export interface LinksManagerStore {
  links: WebsiteLink[]; scopeKey: string; canWrite: boolean; loadError: string; conflict: boolean; maxLinks?: number;
  reload: () => boolean;
  holdRefresh: () => () => void;
  addLink: (title: string, url: string, enabled?: boolean) => LinkResult;
  updateLink: (id: string, title: string, url: string, enabled?: boolean) => LinkResult;
  removeLink: (id: string) => LinkResult;
  moveLink: (id: string, direction: -1 | 1) => LinkResult;
}
