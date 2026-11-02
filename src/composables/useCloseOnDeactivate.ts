import { onDeactivated, type Ref } from 'vue';

/**
 * 工作区页签走 keep-alive（layouts/WorkspaceShell.vue）：切走页签时组件只是失活不卸载，
 * 受控打开的浮层（如日期范围选择器的 v-model:open）会留在 body 上盖住下一个页签。
 * 失活时把开关置为关闭；已选的值不动，切回来时浮层保持关闭。
 */
export function useCloseOnDeactivate(open: Ref<boolean>) {
  onDeactivated(() => {
    open.value = false;
  });
}
