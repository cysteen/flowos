/**
 * MDM 设备台账 —— 建单校验与自动刷机回传的比对底数（930 教育刷机单 D15 / D21 / M10 / M11 / M12 / M43）。
 *
 * 一台设备一行，按 SN 查：
 * - `studentAccount`：MDM 上绑定的学生账号（「SN与学生账号一致」校验）；
 * - `romVersion / mdmVersion`：建单时回填（M4）；
 * - `online`：推送时设备状态，决定回传「接收成功 / 接收失败 · 未开机 / 未联网」；
 * - `onlineAfterContact`：坐席联系用户开机联网后设备上线，**人工重推**时按在线计；
 * - `versionOk`：系统版本是否达标，不达标回传「接收失败 · 版本不符」；
 * - `returnsDetail`：回传是否带细分原因，不带则显示「接收失败 · 原因未返回」（M12）；
 * - `noResponse`：推送后硬件平台始终无回传，到回传超时时长转人工（M11）；
 * - `pushApi`：推送接口状态——`正常` / `报错一次`（自动重试后成功）/ `持续报错`（重试仍失败转人工，M10）；
 * - `verifyApi`：建单校验接口对该设备的响应——`不可用` 时照常建单、不推送、进一线刷机池（M43）。
 */
export type MdmOnlineState = '在线' | '未开机' | '未联网';

export interface MdmDevice {
  sn: string;
  /** 产品型号，与支持刷机产品的产品名称同名 */
  model: string;
  /** MDM 绑定的学生账号 */
  studentAccount: string;
  romVersion: string;
  mdmVersion: string;
  online: MdmOnlineState;
  onlineAfterContact: boolean;
  versionOk: boolean;
  returnsDetail: boolean;
  noResponse: boolean;
  pushApi: '正常' | '报错一次' | '持续报错';
  verifyApi: '正常' | '不可用';
  /** 回传超时转人工之后，硬件平台迟到回传「接收成功」的时长（分钟，自超时判定起算，M11 / M48）；不填＝不迟到回传 */
  lateSuccessAfterMin?: number;
}

const S20 = '讯飞智慧课堂学生平板 S20';
const S30 = '讯飞智慧课堂学生平板 S30';
const X3P = '讯飞智慧课堂学生平板 X3 Pro';
const J606F = '联想 TB-J606F 智慧课堂定制版';
const X6C6F = '联想 TB-X6C6F 智慧课堂定制版';
const S10 = '讯飞智慧课堂学生平板 S10';

/** 缺省：在线、版本达标、回传带细分、接口正常 */
function dev(p: Pick<MdmDevice, 'sn' | 'model' | 'studentAccount' | 'romVersion' | 'mdmVersion'> & Partial<MdmDevice>): MdmDevice {
  return {
    online: '在线',
    onlineAfterContact: false,
    versionOk: true,
    returnsDetail: true,
    noResponse: false,
    pushApi: '正常',
    verifyApi: '正常',
    ...p,
  };
}

export const MDM_DEVICES: MdmDevice[] = [
  // ---- 工单库在办 / 已办刷机单对应的设备（种子单 ①–⑲，`mock/flash/seedTickets.ts`；单号 IFLYZX-20260915-000NN，NN＝序号） ----
  // ① 自动刷机中：加载后十几秒回传「接收成功」→ 调研中
  dev({ sn: 'XFS20240600131', model: S20, studentAccount: 'hf1z2023s0415', romVersion: 'EDU-S20-3.2.4', mdmVersion: 'MDM 5.8.2' }),
  // ② 自动刷机中 · 回传无响应：加载即判「推送异常 · 回传超时」进一线刷机池
  dev({ sn: 'XFS30240900218', model: S30, studentAccount: 'hf8z2023s0622', romVersion: 'EDU-S30-1.4.2', mdmVersion: 'MDM 5.8.2', noResponse: true }),
  // ③ 一线刷机池 · 建单校验不通过（提报账号与 MDM 绑定账号不一致）
  dev({ sn: 'XFS20240600377', model: S20, studentAccount: 'hf1z2023s0588', romVersion: 'EDU-S20-3.2.4', mdmVersion: 'MDM 5.8.2' }),
  // ④ 一线刷机池 · 非自研机型
  dev({ sn: 'LNJ606F2403A0912', model: J606F, studentAccount: 'ahsdfz2023s0107', romVersion: 'TB-J606F_S250118', mdmVersion: 'MDM 5.6.0' }),
  // ⑤ 一线刷机池 · 接收失败 · 未开机（联系用户开机后重新推送可成功）
  dev({ sn: 'XFX3P240500452', model: X3P, studentAccount: 'hf50z2023s0233', romVersion: 'EDU-X3P-2.1.3', mdmVersion: 'MDM 5.8.1', online: '未开机', onlineAfterContact: true }),
  // ⑥ 一线刷机池 · 首推回传超时；之后硬件平台恢复回传，设备仍未开机 → 重新推送回传「接收失败 · 未开机」
  dev({ sn: 'XFS30240900307', model: S30, studentAccount: 'hf168z2023s1021', romVersion: 'EDU-S30-1.4.2', mdmVersion: 'MDM 5.8.2', online: '未开机' }),
  // ⑦ 一线处理中 · 接收失败 · 原因未返回（指导联网后重新推送可成功）
  dev({ sn: 'XFS20240600512', model: S20, studentAccount: 'bb2z2023s0310', romVersion: 'EDU-S20-3.2.1', mdmVersion: 'MDM 5.8.0', online: '未联网', returnsDetail: false, onlineAfterContact: true }),
  // ⑧ 二线处理中 · 一线升级二线后二线领取（首推未联网）
  dev({ sn: 'XFS30240900433', model: S30, studentAccount: 'la1z2023s0716', romVersion: 'EDU-S30-1.4.1', mdmVersion: 'MDM 5.8.2', online: '未联网', onlineAfterContact: true }),
  // ⑨ 教育刷机处理组池 · 特殊情况（转校）
  dev({ sn: 'XFS20240600645', model: S20, studentAccount: 'hf1z2023s0702', romVersion: 'EDU-S20-3.2.4', mdmVersion: 'MDM 5.8.2' }),
  // ⑩ 教育刷机处理组池 · 一线代建、建单校验不通过（非毕业生身份）
  dev({ sn: 'XFS30240900561', model: S30, studentAccount: 'hf8z2024s0133', romVersion: 'EDU-S30-1.4.2', mdmVersion: 'MDM 5.8.2' }),
  // ⑪ 教育刷机处理组池 · 一线升级（首推接收失败 · 版本不符）
  dev({ sn: 'XFX3P240500518', model: X3P, studentAccount: 'ahsdfz2023s0419', romVersion: 'EDU-X3P-1.9.8', mdmVersion: 'MDM 5.7.4', versionOk: false }),
  // ⑫ 一线处理中 · 重新推送仍接收失败 · 未开机，交回发起人
  dev({ sn: 'XFS20240600789', model: S20, studentAccount: 'hf50z2023s0520', romVersion: 'EDU-S20-3.2.4', mdmVersion: 'MDM 5.8.2', online: '未开机' }),
  // ⑬ 教育刷机处理组池 · 自助成功后回访未解决
  dev({ sn: 'XFS30240900690', model: S30, studentAccount: 'hf168z2023s0908', romVersion: 'EDU-S30-1.4.2', mdmVersion: 'MDM 5.8.2' }),
  // ⑭ 一线处理中 · 非自研机型，处理结果「已线下登记」留在本人名下
  dev({ sn: 'LNX6C62404B0277', model: X6C6F, studentAccount: 'bb2z2023s0625', romVersion: 'TB-X6C6F_S240902', mdmVersion: 'MDM 5.6.0' }),
  // ⑮ 调研中 · 自助刷机成功（无处理人）
  dev({ sn: 'XFS20240600823', model: S20, studentAccount: 'la1z2023s0302', romVersion: 'EDU-S20-3.2.4', mdmVersion: 'MDM 5.8.2' }),
  // ⑯ 已结案 · 自助成功、回访已解决
  dev({ sn: 'XFS30240900745', model: S30, studentAccount: 'hf1z2023s0811', romVersion: 'EDU-S30-1.4.2', mdmVersion: 'MDM 5.8.2' }),
  // ⑰ 已转出 · 版本不符 → 一线升级 → 二线重新推送仍失败 → 转售后
  dev({ sn: 'XFX3P240500634', model: X3P, studentAccount: 'hf8z2023s0907', romVersion: 'EDU-X3P-1.8.6', mdmVersion: 'MDM 5.7.2', versionOk: false }),
  // ⑱ 一线刷机池 · 回传超时转人工后迟到「接收成功」；重新推送时推送接口持续报错（自动重试 1 次仍失败，M69）
  dev({ sn: 'XFS30240900918', model: S30, studentAccount: 'bb2z2023s0418', romVersion: 'EDU-S30-1.4.2', mdmVersion: 'MDM 5.8.2', noResponse: true, pushApi: '持续报错' }),
  // ⑲ 调研中 · 调研超时未评价，加载即自动结案：首推未联网 → 一线指导联网后在修改刷机信息弹窗里重新推送 →
  //    接收成功，系统写入处理结果「已线上刷机成功」并转入回访（1013 B1）
  dev({ sn: 'XFS20240600966', model: S20, studentAccount: 'hf50z2023s0366', romVersion: 'EDU-S20-3.2.4', mdmVersion: 'MDM 5.8.2', online: '未联网', onlineAfterContact: true }),
  // ⑳ 二线池 · 回访未解决（一线介入过）：首推未开机 → 一线联系后重新推送成功 → 回访未解决 → 教育刷机处理组池（10-19 C2 / C3）
  dev({ sn: 'XFS30240901020', model: S30, studentAccount: 'la1z2023s1020', romVersion: 'EDU-S30-1.4.2', mdmVersion: 'MDM 5.8.2', online: '未开机', onlineAfterContact: true }),
  // ㉑ 自动刷机中 · 回传无响应（稳定样本）：到回传超时时长才转人工，不迟到回传
  dev({ sn: 'XFS30240901009', model: S30, studentAccount: 'hf46z2023s1109', romVersion: 'EDU-S30-1.4.2', mdmVersion: 'MDM 5.8.2', noResponse: true }),

  // ---- 待提报设备（建单可走通各条链路） ----
  // 成功：自研、账号一致、毕业生、在线
  dev({ sn: 'XFS20240601001', model: S20, studentAccount: 'hf1z2023s1101', romVersion: 'EDU-S20-3.2.4', mdmVersion: 'MDM 5.8.2' }),
  // SN与学生账号不一致：MDM 绑定 hf8z2023s1102，提报时填了别的账号即不通过
  dev({ sn: 'XFS30240901002', model: S30, studentAccount: 'hf8z2023s1102', romVersion: 'EDU-S30-1.4.2', mdmVersion: 'MDM 5.8.2' }),
  // 非自研机型
  dev({ sn: 'LNJ606F2403A1003', model: J606F, studentAccount: 'ahsdfz2023s1103', romVersion: 'TB-J606F_S250118', mdmVersion: 'MDM 5.6.0' }),
  // 接收失败 · 未开机（联系用户开机后重推可成功）
  dev({ sn: 'XFX3P240501004', model: X3P, studentAccount: 'hf50z2023s1104', romVersion: 'EDU-X3P-2.1.3', mdmVersion: 'MDM 5.8.1', online: '未开机', onlineAfterContact: true }),
  // 回传无响应 → 回传超时转人工；转人工 10 分钟后硬件平台迟到回传「接收成功」（M11 / M48）
  dev({ sn: 'XFS30240901005', model: S30, studentAccount: 'hf168z2023s1105', romVersion: 'EDU-S30-1.4.2', mdmVersion: 'MDM 5.8.2', noResponse: true, lateSuccessAfterMin: 10 }),
  // 建单校验接口不可用 → 进一线刷机池（推送异常 · 接口异常）
  dev({ sn: 'XFS20240601006', model: S20, studentAccount: 'bb2z2023s1106', romVersion: 'EDU-S20-3.2.4', mdmVersion: 'MDM 5.8.2', verifyApi: '不可用' }),
  // 推送接口持续报错 → 自动重试 1 次仍失败 → 转人工（推送异常 · 接口异常）
  dev({ sn: 'XFS30240901007', model: S30, studentAccount: 'la1z2023s1107', romVersion: 'EDU-S30-1.4.2', mdmVersion: 'MDM 5.8.2', pushApi: '持续报错' }),
  // 未挂刷机类问题分类的机型（坐席建单不出现刷机类分类；用户提报不判产品）
  dev({ sn: 'XFS10220900108', model: S10, studentAccount: 'hf1z2022s0108', romVersion: 'EDU-S10-4.8.2', mdmVersion: 'MDM 5.2.0' }),
];

export function findMdmDevice(sn: string): MdmDevice | undefined {
  const key = sn.trim().toUpperCase();
  return MDM_DEVICES.find((d) => d.sn.toUpperCase() === key);
}
