import { onBeforeUnmount, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { Modal } from 'ant-design-vue';
import { useWorkspaceTabsStore } from '@/stores/workspaceTabs';

/**
 * 自建单编辑器与工作区 keep-alive 缓存一致：切换页签仅 deactivate，不弹窗。
 * 未保存内容仅在点击页签 × 关闭或刷新/关闭浏览器时确认。
 */
export function useSelfServiceLeaveGuard(dirty: Ref<boolean>, discard: () => void) {
  const route = useRoute();
  const ownPath = route.path;
  const tabs = useWorkspaceTabsStore();

  const confirmCloseTab = () => new Promise<boolean>((resolve) => {
    if (!dirty.value) {
      resolve(true);
      return;
    }
    Modal.confirm({
      title: '放弃未保存的修改并离开？',
      content: '已保存的自建单记录会保留。',
      okText: '放弃并离开',
      cancelText: '继续填写',
      onOk: () => { discard(); resolve(true); },
      onCancel: () => resolve(false),
    });
  });

  tabs.registerCloseGuard(ownPath, confirmCloseTab);

  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!dirty.value) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', beforeUnload);
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', beforeUnload);
    tabs.unregisterCloseGuard(ownPath);
  });
}
