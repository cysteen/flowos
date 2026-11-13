import { onBeforeUnmount, type Ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router';
import { Modal } from 'ant-design-vue';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';

/** The editor is cached with the workspace; protect unfinished content when leaving it. */
export function useSelfServiceLeaveGuard(dirty: Ref<boolean>, discard: () => void) {
  const route = useRoute();
  const ownPath = route.path;
  const tabs = useWorkspaceTabsStore();
  const confirmLeave = () => {
    if (!dirty.value) return true;
    return new Promise<boolean>((resolve) => Modal.confirm({
      title: '放弃未保存的修改并离开？',
      content: '已保存的自建单记录会保留。',
      okText: '放弃并离开',
      cancelText: '继续填写',
      onOk: () => { discard(); resolve(true); },
      onCancel: () => { tabs.syncFromRoute(ownPath, String(route.meta.title ?? '')); resolve(false); },
    }));
  };
  onBeforeRouteLeave(confirmLeave);
  onBeforeRouteUpdate((to, from) => to.path === from.path ? true : confirmLeave());
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (route.path !== ownPath || !dirty.value) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', beforeUnload);
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
}
