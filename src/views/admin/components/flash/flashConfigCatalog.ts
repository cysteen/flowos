import type { FlashFailL1, FlashFailL2 } from '@/views/tickets/types/flash';
import type { RoleKey } from '@/config/roles';

/**
 * 后台「刷机配置」页用到的常量（930 教育刷机单 PRD §10）。
 *
 * - 产品「是否支持刷机」已移到后台「产品管理」维护（1013 N1），本页不再有机型分节。
 * - 平台回传码：智能硬件平台回传的原因码（只读展示）。
 */

/** 可见 · 可维护的角色：工单运营 + 管理员（PRD §10 重点规则 1） */
export const FLASH_CONFIG_ROLES: RoleKey[] = ['ops-monitor', 'system-admin', 'ops-admin', 'tenant-admin'];

/** 智能硬件平台回传码（只有「接收失败」下的二级原因由平台回传） */
export const FLASH_FAIL_RETURN_CODES: Partial<Record<FlashFailL1, Partial<Record<FlashFailL2, string>>>> = {
  接收失败: { 未开机: 'E1001', 未联网: 'E1002', 版本不符: 'E1003', 其他: 'E1099' },
};

/** 系统判定项：状态不可停用 */
export const FLASH_FAIL_LOCKED_L1: FlashFailL1[] = ['建单校验不通过', '推送异常'];

/** 回传超时时长取值范围（小时） */
export const FLASH_TIMEOUT_MIN_H = 1;
export const FLASH_TIMEOUT_MAX_H = 48;
