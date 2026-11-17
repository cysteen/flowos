import { useRouter } from 'vue-router';
import { useCreateWorkItemsStore } from '@/stores/createWorkItems';
import { workTitle, workPath, type CreateWorkContext, type UnifiedCreateScene } from '../types/createWork';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';
export type { UnifiedCreateScene } from '../types/createWork';
export const UNIFIED_CREATE_PATH = '/unified-create';

export function useOpenUnifiedCreate() {
  const router = useRouter();
  const works = useCreateWorkItemsStore();
  const tabs = useWorkspaceTabsStore();
  return function openUnifiedCreate(scene: UnifiedCreateScene | CreateWorkContext = 'general', draftId?: string) {
    const context = typeof scene === 'string' ? { action: 'create' as const, scene } : scene;
    const item = works.open(context, draftId);
    if (item.context.action === 'aftersale' || draftId && item.surface === 'aftersale') { item.modalHost = 'workspace'; item.aftersaleOpen = true; return item; }
    const path = workPath(item.id);
    const title = workTitle(item.context);
    tabs.syncFromRoute(path, title);
    void router.push(path);
    return item;
  };
}
