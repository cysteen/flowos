import { ref, watch } from 'vue';
import {
  defaultOptionalVisible,
  loadOptionalVisible,
  LS_KEY,
  type MineFilterFieldKey,
} from '@/views/tickets/types/mineQueryFields';

export function useMineQueryFields() {
  // 复用 types 层的 load+merge（避免与 loadOptionalVisible 重复同一段持久化逻辑）
  const optionalVisible = ref<Record<string, boolean>>(loadOptionalVisible());

  watch(
    optionalVisible,
    (v) => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(v));
      } catch {
        /* ignore */
      }
    },
    { deep: true },
  );

  function setOptionalVisible(key: MineFilterFieldKey, visible: boolean) {
    optionalVisible.value = { ...optionalVisible.value, [key]: visible };
  }

  function applyOptionalVisible(next: Record<string, boolean>) {
    optionalVisible.value = { ...defaultOptionalVisible(), ...next };
  }

  function clearOptionalVisible() {
    optionalVisible.value = defaultOptionalVisible();
  }

  return { optionalVisible, setOptionalVisible, applyOptionalVisible, clearOptionalVisible };
}
