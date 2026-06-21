import { defineStore } from 'pinia';
import { ref } from 'vue';

// 租户品牌（企业 Logo）——跨页共享 + localStorage 持久化，形成上传→保存→展示→刷新仍在的闭环。
const LS_KEY = 'flowos-tenant-brand';

interface BrandPersist {
  logoUrl: string | null;
  logoFileName: string | null;
}

function readPersist(): BrandPersist {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { logoUrl: null, logoFileName: null };
    const data = JSON.parse(raw) as Partial<BrandPersist>;
    return { logoUrl: data.logoUrl ?? null, logoFileName: data.logoFileName ?? null };
  } catch {
    return { logoUrl: null, logoFileName: null };
  }
}

export const useTenantBrandStore = defineStore('tenantBrand', () => {
  const initial = readPersist();
  const logoUrl = ref<string | null>(initial.logoUrl);
  const logoFileName = ref<string | null>(initial.logoFileName);

  /** 设置并持久化（dataURL 字符串或 null） */
  function setLogo(url: string | null, fileName: string | null = null) {
    logoUrl.value = url;
    logoFileName.value = url ? fileName : null;
    try {
      if (url) {
        localStorage.setItem(LS_KEY, JSON.stringify({ logoUrl: url, logoFileName: logoFileName.value }));
      } else {
        localStorage.removeItem(LS_KEY);
      }
    } catch {
      /* 配额超限等忽略 */
    }
  }

  return { logoUrl, logoFileName, setLogo };
});
