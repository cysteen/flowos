import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { useRouter } from 'vue-router';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';

/** 统一建单页路径：不挂在 `/tickets/` 下，避免被 `tickets/:ticketNo` 与页签标题解析当成工单号 */
export const UNIFIED_CREATE_PATH = '/unified-create';

/** 建单入口：小智单只由入口判定，不按问题分类识别 */
export type UnifiedCreateScene = 'general' | 'xiaozhi';

/**
 * 当前页签的入口。不放路由 query：页签按 path 登记、keep-alive 按 fullPath 缓存，
 * 带 query 会让「回到已打开的页签」落到另一个组件实例上。
 */
export const unifiedCreateScene = ref<UnifiedCreateScene>('general');

/** 打开统一建单页签；已打开时回到该页签，已填内容不动 */
export function useOpenUnifiedCreate() {
  const router = useRouter();
  const tabs = useWorkspaceTabsStore();
  return function openUnifiedCreate(scene: UnifiedCreateScene = 'general') {
    const opened = tabs.tabs.some((t) => t.key === UNIFIED_CREATE_PATH);
    if (!opened) unifiedCreateScene.value = scene;
    else if (unifiedCreateScene.value !== scene) {
      message.info('已有打开的统一建单，请先完成或关闭');
    }
    void router.push(UNIFIED_CREATE_PATH);
  };
}
