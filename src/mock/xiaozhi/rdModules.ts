/**
 * 产品模块 ↔ 接收人（域账号）配置（1130 小智工单 一·补 B30，**关闭 W2**）。
 *
 * 【归属】这份字典由**工单系统后台**维护 —— 后台「业务管理 → 产品模块维护」
 * （`views/admin/XiaozhiRdModuleView.vue`）。老实现配在 IM 系统（合力）后台的
 * 「系统配置 → 产品模块配置」，建单迁回工单系统后字典跟着迁。
 * 三个字段与老系统同形：**产品模块编码 / 产品模块名称 / 接收人（域账号）**。
 *
 * 【用处】建单弹窗「小智工单信息」卡与处理页「升级 · 产研」弹窗的「产品模块」下拉都读这里，
 * 接收人由所选模块带出、**只读**（选不出接收人的模块在建单侧就被拦住）。
 *
 * 🔴 **只维护「模块 → 接收人」，不维护「产品 → 模块」**（B30）：模块按业务线而非单一产品分派，
 * 同一产品可以对应多个模块（多人协作 / 不同产线各负责一块），故建单仍是**人工选模块**，
 * 不做「选了产品自动带出模块」。表结构上也就没有产品键 —— 一对一的映射表是做不出来的。
 *
 * 【形制】导出的是一个 `reactive` 数组，后台页增删改直接写它，建单弹窗的下拉是 `computed`，
 * 后台加一条、回建单弹窗即可见（与 `mock/tickets.ts` 的 `TICKETS` 同一套做法）。
 */
import { reactive } from 'vue';

/** 产品模块一条（产研侧字典；接收人由产品模块带出、不可改） */
export interface XiaozhiRdModule {
  /** 产品模块编码（唯一键） */
  code: string;
  /** 产品模块名称 */
  name: string;
  /** 接收人（域账号），推产研时作收件人 */
  receiver: string;
  /**
   * 所属产品线 —— 只用于拼推给产研那一笔的单标题（W3「Z咨询-J精准教学产品线-S扫描」）。
   * **不在后台「产品模块维护」的三字段之内**（B30 只定了编码 / 名称 / 接收人），
   * 故后台新建的模块没有这一项，产研单标题退化为「Z咨询-S〈模块〉」。
   */
  productLine?: string;
}

/**
 * 字典初值 —— 取老系统现状的精准教学产品线模块划分（B30 前写死在 `types/xiaozhi.ts` 的那四条，
 * 原样搬过来，现有种子单的产品模块取值不变）。
 */
const SEED: XiaozhiRdModule[] = [
  { code: 'PM1001', name: '智批改', receiver: 'zhangdong3', productLine: '精准教学产品线' },
  { code: 'PM1002', name: '智能阅卷', receiver: 'lyu7', productLine: '精准教学产品线' },
  { code: 'PM1003', name: '扫描', receiver: 'wangshuang11', productLine: '精准教学产品线' },
  { code: 'PM1004', name: '组卷与题库', receiver: 'chenwei21', productLine: '精准教学产品线' },
  /**
   * 🔴 **故意不配接收人的一条**，`XIAOZHI_TIP.rdReceiverMissing` 那道拦截靠它才验得到。
   *
   * 四个模块全配了 `receiver` 时，「该产品模块未配置产研接收人」这条分支**永远走不到** ——
   * 等于写了也看不出来（与 `PRODUCTS_WITHOUT_AFTERSALE` 给「转售后」留反例同一个道理）。
   * 字典本身是后台配出来的，现实里新模块上线、接收人还没配就是这个样子。
   */
  { code: 'PM1005', name: '学情分析', receiver: '', productLine: '精准教学产品线' },
];

/** 产品模块字典（后台「产品模块维护」的数据源，建单与升级弹窗的下拉取值源） */
export const XIAOZHI_RD_MODULES = reactive<XiaozhiRdModule[]>(
  SEED.map((m) => ({ ...m })),
);

/** 同一产品可对应多个模块，故编码是唯一键 —— 新建 / 改编码时据此查重 */
export function findRdModuleByCode(code: string): XiaozhiRdModule | undefined {
  const key = code.trim();
  return XIAOZHI_RD_MODULES.find((m) => m.code === key);
}

/** 新增一条（编码重复时不写入，返回 false 由调用方出提示） */
export function addRdModule(row: XiaozhiRdModule): boolean {
  if (findRdModuleByCode(row.code)) return false;
  XIAOZHI_RD_MODULES.push({ ...row, code: row.code.trim(), name: row.name.trim(), receiver: row.receiver.trim() });
  return true;
}

/**
 * 按原编码改一条。编码本身可改，改成别条的编码即视为重复、不写入。
 * `productLine` 不在后台三字段之内，故按原值保留、不被编辑覆盖。
 */
export function updateRdModule(originalCode: string, row: XiaozhiRdModule): boolean {
  const idx = XIAOZHI_RD_MODULES.findIndex((m) => m.code === originalCode);
  if (idx < 0) return false;
  const code = row.code.trim();
  if (code !== originalCode && findRdModuleByCode(code)) return false;
  XIAOZHI_RD_MODULES[idx] = {
    ...XIAOZHI_RD_MODULES[idx],
    code,
    name: row.name.trim(),
    receiver: row.receiver.trim(),
  };
  return true;
}

/** 删一条 */
export function removeRdModule(code: string): boolean {
  const idx = XIAOZHI_RD_MODULES.findIndex((m) => m.code === code);
  if (idx < 0) return false;
  XIAOZHI_RD_MODULES.splice(idx, 1);
  return true;
}
