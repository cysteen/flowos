import { shallowRef } from 'vue';
import type { CreateWorkItem } from '../types/createWork';

export const closeRequest = shallowRef<{ item: CreateWorkItem; resolve: (ok: boolean) => void } | null>(null);
export function confirmWorkClose(item: CreateWorkItem): Promise<boolean> {
  if (closeRequest.value) return Promise.resolve(false);
  return new Promise((resolve) => { closeRequest.value = { item, resolve }; });
}
export function resolveWorkClose(ok: boolean) {
  const request = closeRequest.value;
  closeRequest.value = null;
  request?.resolve(ok);
}
