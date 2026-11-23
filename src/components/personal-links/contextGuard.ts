/** 主会话在租户切换动作前调用；返回 false 则保持原上下文。被动身份失效仍直接清空草稿。 */
const publicEditors = new Set<() => Promise<boolean>>();
export function registerPublicLinksContextGuard(guard: () => Promise<boolean>) {
  publicEditors.add(guard);
  return () => publicEditors.delete(guard);
}
export async function confirmPublicLinksContextChange(): Promise<boolean> {
  for (const guard of publicEditors) if (!await guard()) return false;
  return true;
}
