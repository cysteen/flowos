import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useUserStore } from '@/stores/user';

export interface PersonalLink {
  id: string;
  title: string;
  url: string;
  sort: number;
  updatedAt: string;
}

const STORAGE_PREFIX = 'flowos_personal_links';
const MAX_LINKS = 30;
/** 书签名称：FAB 浮层约 200px 宽，过长只能省略，限制字数便于扫读 */
export const MAX_TITLE_LEN = 30;
/** 网址：覆盖带查询参数的内链；与常见 BFF / DB 字段长度对齐 */
export const MAX_URL_LEN = 512;
/** 调高此版本可在开发环境一次性刷新演示数据 */
const DEV_SEED_REV = '2026-02-demo-overflow-21';

const LONG_URL_DEMO =
  'https://www.baidu.com/s?wd=%E5%AE%A2%E6%9C%8D%E7%B3%BB%E7%BB%9F&ie=utf-8&tn=demo' +
  '&ref=flowos&tab=report&from=personal-links&filter=open&sort=updated_desc' +
  '&region=cn&dept=400&role=agent&page=1&pageSize=50&extra=' +
  'x'.repeat(180);

/** 原型演示：常见搜索引擎/导航（便于悬停菜单点选验证） */
const DEMO_LINKS: Omit<PersonalLink, 'id'>[] = [
  { title: '百度', url: 'https://www.baidu.com/', sort: 0, updatedAt: '' },
  { title: '必应', url: 'https://www.bing.com/', sort: 1, updatedAt: '' },
  { title: 'Google', url: 'https://www.google.com/', sort: 2, updatedAt: '' },
  { title: '搜狗搜索', url: 'https://www.sogou.com/', sort: 3, updatedAt: '' },
  { title: '360 搜索', url: 'https://www.so.com/', sort: 4, updatedAt: '' },
  { title: 'DuckDuckGo', url: 'https://duckduckgo.com/', sort: 5, updatedAt: '' },
  { title: '知乎', url: 'https://www.zhihu.com/', sort: 6, updatedAt: '' },
  { title: '维基百科', url: 'https://zh.wikipedia.org/', sort: 7, updatedAt: '' },
  { title: 'GitHub', url: 'https://github.com/', sort: 8, updatedAt: '' },
  { title: 'Stack Overflow', url: 'https://stackoverflow.com/', sort: 9, updatedAt: '' },
  { title: '长网址演示', url: LONG_URL_DEMO, sort: 10, updatedAt: '' },
  // 额外 10 条：验证门户书签区滚动 /「展开全部」
  { title: '飞书', url: 'https://www.feishu.cn/', sort: 11, updatedAt: '' },
  { title: '语雀', url: 'https://www.yuque.com/', sort: 12, updatedAt: '' },
  { title: 'Notion', url: 'https://www.notion.so/', sort: 13, updatedAt: '' },
  { title: '讯飞开放平台', url: 'https://www.xfyun.cn/', sort: 14, updatedAt: '' },
  { title: '码云 Gitee', url: 'https://gitee.com/', sort: 15, updatedAt: '' },
  { title: '掘金', url: 'https://juejin.cn/', sort: 16, updatedAt: '' },
  { title: 'CSDN', url: 'https://www.csdn.net/', sort: 17, updatedAt: '' },
  { title: '哔哩哔哩', url: 'https://www.bilibili.com/', sort: 18, updatedAt: '' },
  { title: '阿里云', url: 'https://www.aliyun.com/', sort: 19, updatedAt: '' },
  { title: '腾讯云', url: 'https://cloud.tencent.com/', sort: 20, updatedAt: '' },
];

function storageKey(account: string) {
  return `${STORAGE_PREFIX}:${account || 'default'}`;
}

function buildDemoLinks(): PersonalLink[] {
  const now = new Date().toISOString();
  return DEMO_LINKS.map((row, i) => ({
    ...row,
    id: `pl-demo-${i}`,
    updatedAt: now,
  }));
}

function applyDevSeed(account: string): PersonalLink[] {
  const seeded = buildDemoLinks();
  save(account, seeded);
  localStorage.setItem(`${STORAGE_PREFIX}:dev_seed_rev:${account}`, DEV_SEED_REV);
  return seeded;
}

function load(account: string): PersonalLink[] {
  try {
    const key = storageKey(account);
    const revKey = `${STORAGE_PREFIX}:dev_seed_rev:${account}`;
    if (import.meta.env.DEV && localStorage.getItem(revKey) !== DEV_SEED_REV) {
      return applyDevSeed(account);
    }
    const raw = localStorage.getItem(key);
    if (!raw) {
      return import.meta.env.DEV ? applyDevSeed(account) : [];
    }
    const list = JSON.parse(raw) as PersonalLink[];
    if (Array.isArray(list) && list.length) {
      return list.sort((a, b) => a.sort - b.sort);
    }
    return import.meta.env.DEV ? applyDevSeed(account) : [];
  } catch {
    return import.meta.env.DEV ? buildDemoLinks() : [];
  }
}

function save(account: string, list: PersonalLink[]) {
  localStorage.setItem(storageKey(account), JSON.stringify(list));
}

export function normalizePersonalUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || s.length > MAX_URL_LEN) return null;
  try {
    const u = new URL(s.includes('://') ? s : `https://${s}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const href = u.href;
    if (href.length > MAX_URL_LEN) return null;
    return href;
  } catch {
    return null;
  }
}

export function normalizePersonalTitle(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > MAX_TITLE_LEN) return null;
  return t;
}

export const usePersonalLinksStore = defineStore('personalLinks', () => {
  const user = useUserStore();
  const links = ref<PersonalLink[]>([]);

  function reload() {
    links.value = load(user.account);
  }

  watch(
    () => user.account,
    () => reload(),
    { immediate: true },
  );

  const sortedLinks = computed(() => [...links.value].sort((a, b) => a.sort - b.sort));

  function persist(next: PersonalLink[]) {
    links.value = [...next].sort((a, b) => a.sort - b.sort);
    save(user.account, links.value);
  }

  function addLink(title: string, url: string) {
    const name = normalizePersonalTitle(title);
    const normalized = normalizePersonalUrl(url);
    if (!normalized || !name) return { ok: false as const, reason: 'invalid' as const };
    if (links.value.length >= MAX_LINKS) return { ok: false as const, reason: 'limit' as const };
    const sort = links.value.length ? Math.max(...links.value.map((l) => l.sort)) + 1 : 0;
    const item: PersonalLink = {
      id: `pl-${Date.now()}`,
      title: name,
      url: normalized,
      sort,
      updatedAt: new Date().toISOString(),
    };
    persist([...links.value, item]);
    return { ok: true as const, item };
  }

  function updateLink(id: string, title: string, url: string) {
    const name = normalizePersonalTitle(title);
    const normalized = normalizePersonalUrl(url);
    if (!normalized || !name) return { ok: false as const, reason: 'invalid' as const };
    const next = links.value.map((l) =>
      l.id === id
        ? { ...l, title: name, url: normalized, updatedAt: new Date().toISOString() }
        : l,
    );
    persist(next);
    return { ok: true as const };
  }

  function removeLink(id: string) {
    persist(links.value.filter((l) => l.id !== id));
  }

  function moveLink(id: string, dir: -1 | 1) {
    const ordered = sortedLinks.value;
    const idx = ordered.findIndex((l) => l.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= ordered.length) return;
    const a = ordered[idx];
    const b = ordered[swap];
    const next = links.value.map((l) => {
      if (l.id === a.id) return { ...l, sort: b.sort };
      if (l.id === b.id) return { ...l, sort: a.sort };
      return l;
    });
    persist(next);
  }

  return {
    links: sortedLinks,
    maxLinks: MAX_LINKS,
    maxTitleLen: MAX_TITLE_LEN,
    maxUrlLen: MAX_URL_LEN,
    reload,
    addLink,
    updateLink,
    removeLink,
    moveLink,
  };
});
