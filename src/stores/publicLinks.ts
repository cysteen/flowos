import { computed } from 'vue';
import { defineStore } from 'pinia';
import { useTenantStore } from '@/stores/tenant';
import { useUserStore } from '@/stores/user';
import { createLocalLinkCollection } from '@/components/personal-links/linkCollection';
/** 仅运营管理员维护本租户；生产授权仍须由服务端复核。 */
export const usePublicLinksStore = defineStore('publicLinks', () => {
  const user = useUserStore();
  const tenant = useTenantStore();
  const collection = createLocalLinkCollection({
    scope: () => user.isLoggedIn && !tenant.isPlatformUser ? tenant.currentTenantId ?? '' : '',
    storagePrefix: 'flowos_public_links',
    maxLinks: 30,
    writable: () => user.roleKey === 'ops-admin',
  });
  return { ...collection, visibleLinks: computed(() => collection.links.value.filter(row => row.enabled !== false)) };
});
