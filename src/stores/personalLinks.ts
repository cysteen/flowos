import { defineStore } from 'pinia';
import { useUserStore } from '@/stores/user';
import { createLocalLinkCollection } from '@/components/personal-links/linkCollection';
export { normalizePersonalUrl, normalizePersonalTitle, MAX_TITLE_LEN, MAX_URL_LEN } from '@/components/personal-links/linkRules';
export type { WebsiteLink as PersonalLink } from '@/components/personal-links/linkRules';

/** 原型本地配置。保留旧账号存储键和有效数据，不再自动灌入或升级演示种子。 */
export const usePersonalLinksStore = defineStore('personalLinks', () => {
  const user = useUserStore();
  return createLocalLinkCollection({
    scope: () => user.isLoggedIn ? user.account : '',
    storagePrefix: 'flowos_personal_links',
    writable: () => user.isLoggedIn,
    maxLinks: 30,
  });
});