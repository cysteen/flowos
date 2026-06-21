import { defineStore } from 'pinia';
import { ref } from 'vue';

// 租户品牌（企业 Logo）——跨页共享 + localStorage 持久化，形成上传→保存→展示→刷新仍在的闭环。
const LS_KEY = 'flowos-tenant-brand';

export const useTenantBrandStore = defineStore('tenantBrand', () => {
  const logoUrl = ref<string | null>(null);

  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) logoUrl.value = (JSON.parse(raw)?.logoUrl as string | null) ?? null;
  } catch {
    /* ignore */
  }

  /** 设置并持久化（dataURL 字符串或 null） */
  function setLogo(url: string | null) {
    logoUrl.value = url;
    try {
      if (url) localStorage.setItem(LS_KEY, JSON.stringify({ logoUrl: url }));
      else localStorage.removeItem(LS_KEY);
    } catch {
      /* 配额超限等忽略 */
    }
  }

  return { logoUrl, setLogo };
});
