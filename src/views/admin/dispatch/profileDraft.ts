/**
 * 人员画像编辑稿（PRD 6.5）：每维「不限 / 指定」（批量另加「不修改」），与 store 的 AgentProfile 互转。
 */
import { PROFILE_DIMS, type AgentProfile, type ProfileDimKey } from '@/views/tickets/types/dispatch';
import { productToValue, valueToProduct } from './dispatchUi';

export type DimMode = 'keep' | 'any' | 'pick' | null;
export interface DimDraft { mode: DimMode; values: string[] }
export type ProfileDraft = Record<ProfileDimKey, DimDraft>;

export function draftFromProfile(p: AgentProfile): ProfileDraft {
  const out = {} as ProfileDraft;
  for (const d of PROFILE_DIMS) {
    const v = p[d.key];
    if (v === null) out[d.key] = { mode: null, values: [] };
    else if (v === 'any') out[d.key] = { mode: 'any', values: [] };
    else {
      out[d.key] = {
        mode: 'pick',
        values: d.key === 'products'
          ? (v as { category: string; name?: string }[]).map(productToValue)
          : [...(v as string[])],
      };
    }
  }
  return out;
}

export function keepDraft(): ProfileDraft {
  const out = {} as ProfileDraft;
  for (const d of PROFILE_DIMS) out[d.key] = { mode: 'keep', values: [] };
  return out;
}

function dimValue(key: ProfileDimKey, d: DimDraft) {
  if (d.mode === 'any') return 'any' as const;
  if (d.mode === 'pick') return key === 'products' ? d.values.map(valueToProduct) : [...d.values];
  return null;
}

/** 完整画像（单人保存）：未选「不限 / 指定」的维度保持 null，由 store 校验给出「请设置〈维度名〉」 */
export function profileFromDraft(draft: ProfileDraft): AgentProfile {
  const out = {} as Record<ProfileDimKey, unknown>;
  for (const d of PROFILE_DIMS) out[d.key] = dimValue(d.key, draft[d.key]);
  return out as unknown as AgentProfile;
}

/** 批量：只带出非「不修改」的维度 */
export function patchFromDraft(draft: ProfileDraft): Partial<AgentProfile> {
  const out: Record<string, unknown> = {};
  for (const d of PROFILE_DIMS) {
    if (draft[d.key].mode === 'keep') continue;
    out[d.key] = dimValue(d.key, draft[d.key]);
  }
  return out as Partial<AgentProfile>;
}
