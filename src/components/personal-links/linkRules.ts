export const MAX_TITLE_LEN = 30;
export const MAX_URL_LEN = 512;
export interface WebsiteLink {
  id: string;
  title: string;
  url: string;
  sort: number;
  updatedAt: string;
  enabled?: boolean;
}
export type LinkResult = { ok: true; unchanged?: boolean; sameName?: boolean } | { ok: false; message: string };
export function parseWebsiteUrl(raw: string): { url: string } | { error: string } {
  const text = raw.trim();
  if (!text) return { error: '请填写网址' };
  if (text.length > MAX_URL_LEN) return { error: '网址最多 512 字符' };
  const invalid = { error: '请输入有效的 HTTP 或 HTTPS 网页地址，可省略协议' };
  // host:port 可省略协议，mailto: / javascript: 等明确协议不可被补写成网页。
  const explicitScheme = /^[a-z][a-z\d+.-]*:/i.test(text);
  const hostPort = /^(?:localhost|[a-z\d-]+(?:\.[a-z\d-]+)*):\d+(?:[/?#]|$)/i.test(text);
  if (explicitScheme && !/^https?:\/\//i.test(text) && !hostPort) return invalid;
  if (/\s/.test(text) || text.includes('\\')) return invalid;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return invalid;
    if (url.href.length > MAX_URL_LEN) return { error: '网址规范化后超过 512 字符，请缩短网址' };
    return { url: url.href };
  } catch { return invalid; }
}
export function normalizePersonalUrl(raw: string): string | null {
  const parsed = parseWebsiteUrl(raw);
  return 'url' in parsed ? parsed.url : null;
}
export function normalizePersonalTitle(raw: string): string | null {
  const title = raw.trim();
  return title && title.length <= MAX_TITLE_LEN ? title : null;
}
export function validateLink(title: string, url: string, list: WebsiteLink[], id?: string) {
  const name = title.trim();
  if (!name) return { error: '请填写名称' };
  if (name.length > MAX_TITLE_LEN) return { error: '名称最多 30 字' };
  const parsed = parseWebsiteUrl(url);
  if ('error' in parsed) return parsed;
  if (list.some(row => row.id !== id && normalizePersonalUrl(row.url) === parsed.url)) return { error: '该网址已存在，请勿重复添加' };
  return { title: name, url: parsed.url, sameName: list.some(row => row.id !== id && row.title === name) };
}
