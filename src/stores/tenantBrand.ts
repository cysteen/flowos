import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useTenantStore } from '@/stores/tenant';

// 租户品牌（企业 Logo）——按租户隔离持久化，切换租户时自动加载对应 Logo。
function lsKey(tenantId: string) {
  return `flowos-tenant-brand-${tenantId}`;
}

interface BrandPersist {
  logoUrl: string | null;
  logoFileName: string | null;
}

function readPersist(tenantId: string): BrandPersist {
  try {
    const raw = localStorage.getItem(lsKey(tenantId));
    if (!raw) return { logoUrl: null, logoFileName: null };
    const data = JSON.parse(raw) as Partial<BrandPersist>;
    return { logoUrl: data.logoUrl ?? null, logoFileName: data.logoFileName ?? null };
  } catch {
    return { logoUrl: null, logoFileName: null };
  }
}

export const useTenantBrandStore = defineStore('tenantBrand', () => {
  const tenant = useTenantStore();
  const logoUrl = ref<string | null>(null);
  const logoFileName = ref<string | null>(null);

  function loadForTenant(tenantId: string | null) {
    if (!tenantId) {
      logoUrl.value = null;
      logoFileName.value = null;
      return;
    }
    const data = readPersist(tenantId);
    logoUrl.value = data.logoUrl;
    logoFileName.value = data.logoFileName;
  }

  watch(
    () => tenant.currentTenantId,
    (id) => loadForTenant(id),
    { immediate: true },
  );

  /** 设置并持久化到当前租户（dataURL 字符串或 null） */
  function setLogo(url: string | null, fileName: string | null = null) {
    const tenantId = tenant.currentTenantId;
    if (!tenantId) return;
    logoUrl.value = url;
    logoFileName.value = url ? fileName : null;
    try {
      if (url) {
        localStorage.setItem(
          lsKey(tenantId),
          JSON.stringify({ logoUrl: url, logoFileName: logoFileName.value }),
        );
      } else {
        localStorage.removeItem(lsKey(tenantId));
      }
    } catch {
      /* 配额超限等忽略 */
    }
  }

  return { logoUrl, logoFileName, setLogo, loadForTenant };
});
