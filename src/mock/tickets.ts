import type { Ticket } from '@/views/tickets/types/ticket';
import { resolveTicketGroupNames } from '@/views/tickets/types/ticket';
import { mapChannelToSource } from '@/views/tickets/types/createTicket';
import { todayStamp } from '@/stores/riskShared';
import { FLASH_SEEDS } from './flash/seedTickets';
import {
  applyAftersaleEvent, applyAftersaleResult, migrateAftersaleLink, routeAftersaleEvent, takeOverReturnedTicket,
  type AftersaleEvent, type AftersaleInboundSeed,
} from '@/views/tickets/composables/aftersaleEvents';

/* ================================================================
 * 客服⇄售后互转（1025）售后发起的单：③ 售后升级投诉转入 / ④ 售后转咨询转入，及 ① 投诉单关联售后。
 * 一律经售后回传通道 `routeAftersaleEvent` / `applyAftersaleEvent` / `applyAftersaleResult` 生成，
 * 与运行时同一套函数，不在这里手写状态。
 * ================================================================ */

/** 'YYYY-MM-DD HH:mm' 加若干分钟 */
function plusMinutes(at: string, min: number): string {
  const d = new Date(`${at.replace(' ', 'T')}:00`);
  d.setMinutes(d.getMinutes() + min);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * ③ ④ 转入的新单照通用流转（《【1025】》§4.1 / §4.3）：领取 → 「待响应」→ 首响 → 「处理中」，
 * 三步都留履历。回流单不走这里（直落「处理中」，见 takeOverReturnedTicket）。
 */
function claimSeed(t: Ticket, who: string, at: string): Ticket {
  const respondedAt = plusMinutes(at, 8);
  return {
    ...t,
    assignee: who, nodeStatus: '处理中', tab: 'mine', responded: true, updatedAt: respondedAt,
    eventTimeline: [
      ...(t.eventTimeline ?? []),
      {
        id: `as-${t.no}-claim`, category: 'node', action: 'accept', who, role: '二线专员',
        how: '领取', what: `${who} 从池中领取本单，进入「待响应」。`, when: at,
      },
      {
        id: `as-${t.no}-first`, category: 'sla', action: 'slaClose', who: '系统', role: '系统',
        how: '首响时钟关闭', what: '', when: respondedAt,
        slaClose: { clock: '首响', closedAt: respondedAt },
      },
    ],
  };
}

/** 下送结案（承接链路的原单需先落终态） */
function settleSeed(t: Ticket, at: string): Ticket {
  return {
    ...t,
    nodeStatus: '已结案', tab: 'done', handledByMe: true,
    slaText: '—', slaSub: '已结案', slaState: 'ok', slaMinutes: 9999, updatedAt: at,
    eventTimeline: [...(t.eventTimeline ?? []), {
      id: `as-${t.no}-settled`, category: 'node', action: 'resolved', who: t.assignee ?? '王坐席', role: '二线专员',
      how: '下送', what: '处理完毕，下送结案。', when: at,
    }],
  };
}

function inbound(seed: AftersaleInboundSeed): AftersaleInboundSeed {
  // 现行分派规则落二线硬件缺陷组池（与 TICKET_GROUP_NAMES 里 as-* 的处理组一致）
  return { channel: '电话', priority: 'P2', productCategory: '智能硬件', groupId: 'hardware', ...seed };
}

/** 跑一条售后事件并取出新建的那张单 */
function created(rows: Ticket[], e: AftersaleEvent): { rows: Ticket[]; created: Ticket } {
  const r = routeAftersaleEvent(rows, e);
  if (!r.created) throw new Error(`[mock/tickets] ${e.type} ${e.asNo} 未建出新单`);
  return { rows: r.rows, created: r.created };
}

function buildAftersaleSeeds() {
  const seeds: Ticket[] = [];

  // ① 投诉单已关联售后单，售后单处理中（客服来源位）
  seeds.push(applyAftersaleEvent({
    id: 'as-c1', no: 'IFLYTS-20260930-00031', type: '投诉', channel: '电话',
    title: '扫地机器人维修后再次故障，要求退换', smartMarks: ['情绪'],
    customer: '高婷', vip: false, product: '扫地机器人 R2', complaintType: '投诉',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '05:20:00', slaSub: '充足', slaState: 'ok', slaMinutes: 320,
    assignee: '王坐席', tab: 'mine', groupId: 'line1',
    linkedAftersaleNo: 'AS-20260930-41502', linkedAftersaleServiceType: '维修', linkedAftersaleStatus: '待接单',
    customerPhone: '13700004521', sn: 'SN-R2-41502', productCategory: '智能硬件',
    problemDesc: '扫地机器人上月维修更换主板后再次无法回充，客户对维修质量不满，要求退换新机。',
    createdAt: '2026-09-30 09:12', updatedAt: '2026-09-30 10:40', responded: true,
    eventTimeline: [{
      id: 'as-IFLYTS-20260930-00031-link', category: 'node', action: 'transfer', who: '王坐席', role: '二线专员',
      how: '关联售后', what: '售后单 AS-20260930-41502 · 维修', when: '2026-09-30 10:40',
    }],
  }, {
    type: 'AS_PROGRESS', asNo: 'AS-20260930-41502', at: '2026-10-01 09:30', operator: '吴师傅（售后一组）', status: '处理中',
  }).ticket);

  // ③ 售后升级投诉转入：售后单冻结、尚未回传
  const e1 = created([], {
    type: 'AS_ESCALATE_COMPLAINT', asNo: 'AS-20260926-41288', eventId: 'ase-41288-esc',
    at: '2026-09-26 14:05', operator: '钱师傅（售后二组）',
    escalateReason: '客户对上门维修时效强烈不满，现场要求投诉处理',
    inbound: inbound({
      id: 'as-e1', no: 'IFLYTS-20260926-00032', title: '翻译机寄修超期，客户要求投诉处理',
      customer: '罗佳', product: '讯飞翻译机 T10', customerPhone: '13900004128', sn: 'SN-T10-41288',
      productCategory: '消费电子', priority: 'P1',
      problemDesc: '翻译机寄修已超承诺时效 7 天仍未寄回，客户多次催促无果，要求按投诉处理并给出赔偿方案。',
      asTitle: '讯飞翻译机 T10 屏幕无显示寄修', asServiceType: '维修',
    }),
  }).created;
  seeds.push(claimSeed(e1, '王坐席', '2026-09-26 14:40'));

  // ③ 售后升级投诉转入：已回传过一次（首次回传 · 已解冻）
  const e2 = claimSeed(created([], {
    type: 'AS_ESCALATE_COMPLAINT', asNo: 'AS-20260927-41340', eventId: 'ase-41340-esc',
    at: '2026-09-27 10:20', operator: '孙师傅（售后一组）',
    escalateReason: '二次维修仍未修复，客户要求升级投诉',
    inbound: inbound({
      id: 'as-e2', no: 'IFLYTS-20260927-00033', title: '学习机二次维修未修复，要求升级处理',
      customer: '谢磊', product: '讯飞学习机 T20', customerPhone: '13600004134', sn: 'SN-T20-41340',
      productCategory: '学习硬件', priority: 'P1',
      problemDesc: '学习机触屏失灵，两次寄修后问题依旧，客户要求退机并对维修质量投诉。',
      asTitle: '讯飞学习机 T20 触屏失灵二次寄修', asServiceType: '维修',
    }),
  }).created, '王坐席', '2026-09-27 10:55');
  seeds.push(applyAftersaleResult(e2, {
    conclusion: '部分解决', note: '已与客户达成换新方案，等待售后侧安排寄送新机，赔偿事项另行跟进。',
    who: '王坐席', role: '二线专员', at: '2026-09-28 16:10', unfrozenStatus: '处理中',
  }).ticket);

  // 同一张售后单挂两张客服单：来源位＝已转出的咨询单 t33，派生位＝售后升级投诉转入的投诉单
  const t33Base: Ticket = {
    id: 't33', no: 'IFLYZX-20260722-00002', type: '咨询', channel: '电话',
    title: '录音笔无法充电，需寄修检测', smartMarks: [],
    customer: '孙倩', vip: false, product: '智能录音笔 SR302',
    nodeStatus: '已转出', nodeStep: 4, nodeTotal: 5, priority: 'P2',
    slaText: '04:30:00', slaSub: '充足', slaState: 'ok', slaMinutes: 270,
    assignee: '王坐席', tab: 'mine',
    linkedAftersaleNo: 'AS-20260722-38104', linkedAftersaleServiceType: '寄修检测', linkedAftersaleStatus: '处理中',
    customerPhone: '13977778888', sn: 'SN-SR302-40915', productCategory: '智能硬件',
    createdAt: '2026-07-22 09:40', updatedAt: '2026-07-22 11:15',
    // 830 演示：已转出态下催补两枚都不展示，hover 售后单号出提示去售后系统操作
    responded: true,
  };
  const pair = created([t33Base], {
    type: 'AS_ESCALATE_COMPLAINT', asNo: 'AS-20260722-38104', eventId: 'ase-38104-esc',
    at: '2026-09-28 11:30', operator: '赵师傅（售后三组）',
    escalateReason: '寄修检测超期，客户在售后侧提出投诉',
    inbound: inbound({
      id: 'as-e3', no: 'IFLYTS-20260928-00034', title: '录音笔寄修检测超期，客户投诉',
      customer: '孙倩', product: '智能录音笔 SR302', customerPhone: '13977778888', sn: 'SN-SR302-40915',
      priority: 'P1',
      problemDesc: '录音笔寄修检测超期两个月未有结论，客户在售后侧投诉，要求明确处理时限。',
      asTitle: '智能录音笔 SR302 充电故障寄修检测', asServiceType: '寄修检测',
    }),
  });
  const t33 = pair.rows[0];
  seeds.push(claimSeed(pair.created, '王坐席', '2026-09-28 12:05'));

  // 同位降级：同一售后单先后由售后转咨询、售后升级投诉建出两张客服单（客服派生位）
  const d1 = created([], {
    type: 'AS_RETURNED', asNo: 'AS-20260918-40655', eventId: 'ase-40655-returned-1',
    at: '2026-09-18 15:20', operator: '周师傅（售后二组）', status: '已关闭',
    returnReason: '检测无硬件故障，属使用咨询，转回客服',
    inbound: inbound({
      id: 'as-d1', no: 'IFLYZX-20260918-00035', title: '智能音箱唤醒不灵敏咨询',
      customer: '陶然', product: '智能音箱 X1', customerPhone: '13500004065', sn: 'SN-X1-40655',
      problemDesc: '智能音箱远场唤醒成功率低，售后检测无硬件故障，转回客服指导设置。',
      asTitle: '智能音箱 X1 唤醒异常检测', asServiceType: '维修',
    }),
  });
  const d1Claimed = claimSeed(d1.created, '王坐席', '2026-09-18 16:00');
  const d2 = created([d1Claimed], {
    type: 'AS_ESCALATE_COMPLAINT', asNo: 'AS-20260918-40655', eventId: 'ase-40655-esc',
    at: '2026-09-20 10:15', operator: '周师傅（售后二组）',
    escalateReason: '客户不认可检测结论，在售后侧提出投诉',
    inbound: inbound({
      id: 'as-d2', no: 'IFLYTS-20260920-00036', title: '智能音箱检测结论争议投诉',
      customer: '陶然', product: '智能音箱 X1', customerPhone: '13500004065', sn: 'SN-X1-40655',
      priority: 'P1',
      problemDesc: '客户不认可售后「无硬件故障」的检测结论，要求重新检测并投诉检测人员态度。',
      asTitle: '智能音箱 X1 唤醒异常检测', asServiceType: '维修',
    }),
  });
  seeds.push(d2.rows[0], claimSeed(d2.created, '王坐席', '2026-09-20 10:50'));

  // ④ 售后转咨询转入：关联售后单已关闭，可激活
  seeds.push(claimSeed(created([], {
    type: 'AS_RETURNED', asNo: 'AS-20260929-41420', eventId: 'ase-41420-returned-1',
    at: '2026-09-29 11:00', operator: '冯师傅（售后一组）', status: '已关闭',
    returnReason: '配件已寄出，客户咨询安装方法，转回客服指导',
    inbound: inbound({
      id: 'as-r1', no: 'IFLYZX-20260929-00037', title: '净化器滤芯配件安装咨询',
      customer: '韦琳', product: '空气净化器 P2', customerPhone: '13800004142', sn: 'SN-P2-41420',
      problemDesc: '售后已寄出替换滤芯，客户不清楚安装与复位步骤，需客服指导。',
      asTitle: '空气净化器 P2 滤芯配件寄送', asServiceType: '配件',
    }),
  }).created, '王坐席', '2026-09-29 11:35'));

  // ④ 售后转咨询转入：关联售后单关闭已久，激活会被售后侧拒绝
  seeds.push(claimSeed(created([], {
    type: 'AS_RETURNED', asNo: 'AS-20260515-36120', eventId: 'ase-36120-returned-1',
    at: '2026-05-18 09:40', operator: '郑师傅（售后二组）', status: '已关闭',
    returnReason: '维修完成后客户咨询延保政策，转回客服答复',
    inbound: inbound({
      id: 'as-r2', no: 'IFLYZX-20260518-00038', title: '录音笔维修后延保政策咨询',
      customer: '石岩', product: '智能录音笔 SR302', customerPhone: '13700003612', sn: 'SN-SR302-36120',
      problemDesc: '录音笔维修完成，客户咨询维修部件是否享受单独延保及延保期限。',
      asTitle: '智能录音笔 SR302 按键失灵维修', asServiceType: '维修',
    }),
  }).created, '王坐席', '2026-05-18 10:20'));

  // ④ 激活后售后再次转客服：原单未结案，落原单（第 n 次）
  const r3Base = claimSeed(created([], {
    type: 'AS_RETURNED', asNo: 'AS-20260920-40712', eventId: 'ase-40712-returned-1',
    at: '2026-09-21 09:30', operator: '何师傅（售后一组）', status: '已关闭',
    returnReason: '检测为网络设置问题，转回客服指导',
    inbound: inbound({
      id: 'as-r3', no: 'IFLYZX-20260921-00039', title: '学习机连不上家庭网络咨询',
      customer: '江楠', product: '讯飞学习机 T20', customerPhone: '13600004071', sn: 'SN-T20-40712',
      productCategory: '学习硬件',
      problemDesc: '学习机无法连接家庭 5G 频段 WiFi，售后检测硬件正常，转客服指导网络设置。',
      asTitle: '讯飞学习机 T20 无线模块检测', asServiceType: '维修',
    }),
  }).created, '王坐席', '2026-09-21 10:05');
  let r3 = r3Base;
  for (const [i, step] of [
    { reopenAt: '2026-09-23 14:00', returnAt: '2026-09-26 16:20', reason: '更换无线模块后仍连不上，转回客服排查路由器设置' },
    { reopenAt: '2026-09-29 10:30', returnAt: '2026-10-02 11:15', reason: '复检硬件正常，客户路由器信道设置问题，转回客服指导' },
  ].entries()) {
    r3 = routeAftersaleEvent([r3], {
      type: 'AS_PROGRESS', asNo: 'AS-20260920-40712', at: step.reopenAt, operator: '何师傅（售后一组）', status: '待接单',
    }).rows[0];
    r3 = routeAftersaleEvent([r3], {
      type: 'AS_RETURNED', asNo: 'AS-20260920-40712', eventId: `ase-40712-returned-${i + 2}`,
      at: step.returnAt, operator: '何师傅（售后一组）', status: '已关闭', returnReason: step.reason,
    }).rows[0];
  }
  seeds.push(r3);

  // ④ 激活后售后再次转客服：原单已结案 → 新建咨询单并与原单建「承接」
  const s1Open = claimSeed(created([], {
    type: 'AS_RETURNED', asNo: 'AS-20260910-40388', eventId: 'ase-40388-returned-1',
    at: '2026-09-11 10:10', operator: '林师傅（售后二组）', status: '已关闭',
    returnReason: '耳机配对问题属使用咨询，转回客服指导',
    inbound: inbound({
      id: 'as-s1', no: 'IFLYZX-20260911-00040', title: '蓝牙耳机配对失败咨询',
      customer: '鲁静', product: '蓝牙耳机 Air', customerPhone: '13900004038', sn: 'SN-AIR-40388',
      problemDesc: '蓝牙耳机与手机配对失败，售后检测正常，转客服指导配对与重置。',
      asTitle: '蓝牙耳机 Air 配对异常检测', asServiceType: '维修',
    }),
  }).created, '王坐席', '2026-09-11 10:40');
  const s1Settled = settleSeed(s1Open, '2026-09-15 17:20');
  const s1Reopened = routeAftersaleEvent([s1Settled], {
    type: 'AS_PROGRESS', asNo: 'AS-20260910-40388', at: '2026-09-27 09:00', operator: '林师傅（售后二组）', status: '待接单',
  }).rows[0];
  const s2 = created([s1Reopened], {
    type: 'AS_RETURNED', asNo: 'AS-20260910-40388', eventId: 'ase-40388-returned-2',
    at: '2026-09-30 15:45', operator: '林师傅（售后二组）', status: '已关闭',
    returnReason: '左耳无声为固件问题，升级后客户咨询降噪设置，转回客服',
    inbound: inbound({
      id: 'as-s2', no: 'IFLYZX-20260930-00041', title: '蓝牙耳机固件升级后降噪设置咨询',
      customer: '鲁静', product: '蓝牙耳机 Air', customerPhone: '13900004038', sn: 'SN-AIR-40388',
      problemDesc: '耳机左耳无声经售后升级固件解决，客户咨询升级后降噪模式的设置方法。',
      asTitle: '蓝牙耳机 Air 配对异常检测', asServiceType: '维修',
    }),
  });
  seeds.push(s2.rows[0], s2.created);

  // ④ 咨询单升级投诉（口径定稿 6b / 6d）：客服派生位关联随单迁到投诉新单、保留「转咨询转入」类型，
  // 投诉新单的「关联售后」位为「激活售后单」；原咨询单落「已升级投诉」，只留「关联降级」履历
  const u1 = claimSeed(created([], {
    type: 'AS_RETURNED', asNo: 'AS-20260922-40790', eventId: 'ase-40790-returned-1',
    at: '2026-09-22 14:10', operator: '彭师傅（售后二组）', status: '已关闭',
    returnReason: '耳机更换后客户咨询以旧换新政策，转回客服答复',
    inbound: inbound({
      id: 'as-u1', no: 'IFLYZX-20260922-00042', title: '蓝牙耳机换新后以旧换新政策咨询',
      customer: '蔡宁', product: '蓝牙耳机 Air', customerPhone: '13800004079', sn: 'SN-AIR-40790',
      problemDesc: '耳机售后换新后，客户咨询旧机是否可参与以旧换新及补贴标准。',
      asTitle: '蓝牙耳机 Air 左耳无声换新', asServiceType: '维修',
    }),
  }).created, '王坐席', '2026-09-22 14:45');
  const u2No = 'IFLYTS-20260924-00043';
  const migrated = migrateAftersaleLink(u1, u2No, { who: '王坐席', role: '二线专员', at: '2026-09-24 09:30' });
  seeds.push({
    ...migrated.from,
    escalatedToNo: u2No, tab: 'done', handledByMe: true, myUpgradeAction: true,
    slaText: '—', slaSub: '已升级投诉·停表', slaState: 'ok', slaMinutes: 9999, updatedAt: '2026-09-24 09:30',
  });
  seeds.push({
    id: 'as-u2', no: u2No, type: '投诉', channel: '电话',
    title: '以旧换新补贴口径不一致，客户投诉', smartMarks: ['情绪'],
    customer: '蔡宁', vip: false, product: '蓝牙耳机 Air', complaintType: '投诉',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '06:10:00', slaSub: '充足', slaState: 'ok', slaMinutes: 370,
    assignee: '王坐席', tab: 'mine', responded: true,
    customerPhone: '13800004079', sn: 'SN-AIR-40790', productCategory: '智能硬件',
    problemDesc: '客户称门店与客服告知的以旧换新补贴标准不一致，要求按较高标准执行并投诉服务口径混乱。',
    escalatedFromNo: u1.no,
    createdAt: '2026-09-24 09:30', updatedAt: '2026-09-24 09:30',
    ...migrated.to,
  } as Ticket);

  // 产品无售后服务的投诉单（处理中、无关联）：「关联售后」按 §5.1 第 4 行置灰
  seeds.push({
    id: 'as-n1', no: 'IFLYTS-20261005-00044', type: '投诉', channel: '电话',
    title: '会员自动续费未提醒即扣款，客户投诉', smartMarks: ['情绪'],
    customer: '贺洁', vip: false, product: '会员服务', complaintType: '投诉',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '05:50:00', slaSub: '充足', slaState: 'ok', slaMinutes: 350,
    assignee: '王坐席', tab: 'mine', groupId: 'line1', responded: true,
    customerPhone: '13600004408', productCategory: '会员权益',
    problemDesc: '会员到期前未收到续费提醒即被自动扣款 198 元，客户要求退款并投诉扣费规则不透明。',
    createdAt: '2026-10-05 09:20', updatedAt: '2026-10-05 09:45',
  });

  // 投诉单（处理中、产品有售后服务、无关联）：「关联售后」可点，走售后建单弹窗（§2.2 / §2.3）
  seeds.push({
    id: 'as-l1', no: 'IFLYTS-20261006-00049', type: '投诉', channel: '电话',
    title: '智能音箱频繁断连，客户投诉要求上门检修', smartMarks: ['情绪'],
    customer: '韦岚', vip: false, product: '智能音箱 X1', complaintType: '投诉',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '04:40:00', slaSub: '充足', slaState: 'ok', slaMinutes: 280,
    assignee: '王坐席', tab: 'mine', groupId: 'hardware', responded: true,
    customerPhone: '13900004916', sn: 'SN-X1-49160', productCategory: '智能硬件',
    problemDesc: '智能音箱购买三个月内频繁断开 WiFi，重置后仍反复出现，客户投诉并要求安排上门检修。',
    createdAt: '2026-10-06 10:15', updatedAt: '2026-10-06 10:40',
    eventTimeline: [{
      id: 'as-IFLYTS-20261006-00049-claim', category: 'node', action: 'accept', who: '王坐席', role: '二线专员',
      how: '领取', what: '王坐席 从池中领取本单，进入「待响应」。', when: '2026-10-06 10:40',
    }],
  });

  // ① 投诉单已关联售后单，售后单已完成（客服来源位，AS_CLOSED 只写履历、不改投诉单状态）
  seeds.push(applyAftersaleEvent({
    id: 'as-c2', no: 'IFLYTS-20260925-00045', type: '投诉', channel: '电话',
    title: '智能音箱维修后仍有杂音，客户投诉维修质量', smartMarks: [],
    customer: '岑雨', vip: false, product: '智能音箱 X1', complaintType: '投诉',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '03:30:00', slaSub: '充足', slaState: 'ok', slaMinutes: 210,
    assignee: '王坐席', tab: 'mine', groupId: 'hardware',
    linkedAftersaleNo: 'AS-20260925-41231', linkedAftersaleServiceType: '维修', linkedAftersaleStatus: '待接单',
    customerPhone: '13500004123', sn: 'SN-X1-41231', productCategory: '智能硬件',
    problemDesc: '智能音箱维修后播放仍有明显杂音，客户对维修质量不满，要求重新检测并补偿。',
    createdAt: '2026-09-25 10:05', updatedAt: '2026-09-25 10:30', responded: true,
    eventTimeline: [{
      id: 'as-IFLYTS-20260925-00045-link', category: 'node', action: 'transfer', who: '王坐席', role: '二线专员',
      how: '关联售后', what: '售后单 AS-20260925-41231 · 维修', when: '2026-09-25 10:30',
    }],
  }, {
    type: 'AS_CLOSED', asNo: 'AS-20260925-41231', eventId: 'ase-41231-closed',
    at: '2026-10-03 16:40', operator: '吴师傅（售后一组）', status: '已完成',
    resultSummary: '更换喇叭单元并复检，播放无杂音，客户签收确认。',
  }).ticket);

  // ② 转售后原单在「已转出」期间被人工强结（§3.4）
  const forceClosed = (t: Ticket, at: string): Ticket => ({
    ...t,
    nodeStatus: '已强结', tab: 'done', handledByMe: true, myForceCloseAction: true,
    slaText: '—', slaSub: '已强结·停表', slaState: 'ok', slaMinutes: 9999, updatedAt: at,
    eventTimeline: [...(t.eventTimeline ?? []), {
      id: `as-${t.no}-force`, category: 'node', action: 'resolved', who: '王坐席', role: '二线专员',
      how: '强结', what: '强结申请审批通过，工单强结。', when: at,
    }],
  });
  const transferredOut = (t: Partial<Ticket> & Pick<Ticket, 'id' | 'no' | 'title' | 'customer' | 'product'>, asNo: string, at: string): Ticket => ({
    type: '咨询', channel: '电话', smartMarks: [], vip: false,
    nodeStatus: '已转出', nodeStep: 4, nodeTotal: 5, priority: 'P2',
    slaText: '04:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 240,
    assignee: '王坐席', tab: 'mine', groupId: 'hardware', myTransferAction: true, responded: true,
    linkedAftersaleNo: asNo, linkedAftersaleServiceType: '维修', linkedAftersaleStatus: '待接单',
    productCategory: '智能硬件', updatedAt: at,
    ...t,
    eventTimeline: [{
      id: `as-${t.no}-transfer`, category: 'node', action: 'transfer', who: '王坐席', role: '二线专员',
      how: '转售后', what: `售后单 ${asNo} · 维修 / 上门`, when: at,
    }],
  } as Ticket);

  // #22：强结后收到 AS_RETURNED → 新建咨询单挂派生位，与原单建「承接」（§4.5 支二）
  const k1 = forceClosed(transferredOut({
    id: 'as-k1', no: 'IFLYZX-20260919-00046', title: '扫地机器人主刷不转，咨询上门维修',
    customer: '柯敏', product: '扫地机器人 R2', customerPhone: '13700004188', sn: 'SN-R2-41188',
    problemDesc: '扫地机器人主刷不转动，客户咨询上门维修安排。',
    createdAt: '2026-09-19 09:10',
  }, 'AS-20260919-41188', '2026-09-19 09:40'), '2026-09-26 17:30');
  const k1Succ = created([k1], {
    type: 'AS_RETURNED', asNo: 'AS-20260919-41188', eventId: 'ase-41188-returned-1',
    at: '2026-10-03 10:20', operator: '钱师傅（售后二组）', status: '已关闭',
    returnReason: '主刷电机正常，客户询问保养周期与耗材更换，转回客服答复',
    inbound: inbound({
      id: 'as-k1n', no: 'IFLYZX-20261003-00047', title: '扫地机器人主刷保养与耗材更换咨询',
      customer: '柯敏', product: '扫地机器人 R2', customerPhone: '13700004188', sn: 'SN-R2-41188',
      problemDesc: '售后检测主刷电机正常，客户咨询主刷保养周期与耗材更换方式。',
      asTitle: '扫地机器人 R2 主刷不转上门维修', asServiceType: '维修',
    }),
  });
  seeds.push(k1Succ.rows[0], k1Succ.created);

  // #22a：强结后收到 AS_CLOSED → 只写履历、刷新售后卡片，状态仍「已强结」
  seeds.push(routeAftersaleEvent([forceClosed(transferredOut({
    id: 'as-k2', no: 'IFLYZX-20260917-00048', title: '学习机充电口松动，咨询保修维修',
    customer: '詹琪', product: '讯飞学习机 T20', customerPhone: '13600004166', sn: 'SN-T20-41166',
    productCategory: '学习硬件',
    problemDesc: '学习机充电口松动接触不良，客户咨询保修期内维修。',
    createdAt: '2026-09-17 14:00',
  }, 'AS-20260917-41166', '2026-09-17 14:30'), '2026-09-24 11:00')], {
    type: 'AS_CLOSED', asNo: 'AS-20260917-41166', eventId: 'ase-41166-closed',
    at: '2026-10-02 15:10', operator: '孙师傅（售后一组）', status: '已完成',
    resultSummary: '更换充电接口小板，充电测试正常，已寄回客户。',
  }).rows[0]);

  // t5a：售后转咨询转入（④），售后单已关闭，看板「转入」下钻按来源取到它
  const t5a = claimSeed(created([], {
    type: 'AS_RETURNED', asNo: 'AS-20260731-40217', eventId: 'ase-40217-returned-1',
    at: '2026-08-04 09:20', operator: '陈师傅（售后一组）', status: '已关闭',
    returnReason: '滤芯配件到货，客户咨询续办事项，转回客服',
    inbound: inbound({
      id: 't5a', no: 'IFLYZX-20260804-00003', title: '售后回传·配件到货续办咨询',
      customer: '何敏', product: '空气净化器 P2', customerPhone: '13900008801', sn: 'SN-P2-88001',
      asTitle: '空气净化器 P2 滤芯配件更换（寄修）', asServiceType: '寄修检测',
    }),
  }).created, '王坐席', '2026-08-04 10:05');

  return {
    t33,
    t5a: { ...t5a, slaText: '05:40:00', slaMinutes: 340 } as Ticket,
    seeds,
  };
}

const AS_SEEDS = buildAftersaleSeeds();

// 工单 Mock 数据（对齐 PRD-02 §9 字段与分布；样例文案参考 .pen SJpgc）。
// 分布：我的任务 8 / 已办 6 / 本组工单池 5 / @我的工单 3 / 待审核 3 = 25（活跃）+ 归档。

const BASE_TICKETS: Ticket[] = [
  // ---- 我的工单 (mine) 9 ----
  // 飞书项目集成演示单：消费者BG · 翻译机，用于演示「升级到飞书项目」全链路
  { serviceScore: 5,
    id: 't-feishu', no: 'IFLYZX-20260713-00001', type: '咨询', channel: '在线客服',
    title: '翻译机离线翻译结果异常，疑似模型问题', smartMarks: ['升级'],
    customer: '陈翻译', vip: false, product: '讯飞翻译机 T10',
    productBg: '消费者BG',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P1',
    slaText: '03:20:00', slaSub: '充足', slaState: 'ok', slaMinutes: 200,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13500001234', sn: 'SN-T10-260713', productCategory: '消费电子',
    businessType: '翻译机',
    problemDesc: '用户反馈离线中英互译在长句场景下漏译、语序错乱，在线翻译正常，疑似离线模型缺陷，需产研确认。',
    createdAt: '2026-07-13 09:10', updatedAt: '2026-07-13 10:05',
    responded: true, upgradedByMe: false,
  },
  { serviceScore: 2,
    id: 't1', no: 'IFLYTS-20260610-00002', type: '投诉', channel: '在线客服',
    title: '无线音乐播放跳过歌曲异常', smartMarks: ['升级', '情绪'],
    customer: '张小凡', vip: true, customerTags: ['记者'], product: '智能音箱 X1',
    ticketSource: '外投渠道', complaintType: '投诉',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P0',
    slaText: '00:42:10', slaSub: '距超时', slaState: 'soon', slaMinutes: 42,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13800138000', sn: 'SN-X1-20260301', productCategory: '智能硬件',
    createdAt: '2026-06-10 08:12', updatedAt: '2026-06-10 14:30',
    // 已联系：催补后坐席已回电 → 催补待回**不收**（PRD-915 补充与催单 §10.1）
    responded: true, upgradedByMe: true, hasDunning: true, dunningContacted: true, contactedAfterUrge: true,
  },
  { serviceScore: 5,
    id: 't2', no: 'IFLYZX-20260610-00004', type: '咨询', channel: '电话',
    title: '设备无法开机，指示灯不亮', smartMarks: ['升级'],
    customer: '李大海', vip: false, product: '扫地机器人 R2',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P0',
    slaText: '已超 01:12', slaSub: '已超时', slaState: 'overdue', slaMinutes: -72,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13912345678', sn: 'SN-R2-882910', productCategory: '智能硬件',
    createdAt: '2026-06-10 07:45', updatedAt: '2026-06-10 16:02',
    responded: true, hasDunning: true,
  },
  {
    id: 't3', no: 'IFLYZX-20260610-00005', type: '咨询', channel: '小程序',
    title: '等待客户补充材料', smartMarks: [],
    customer: '李铭', vip: false, product: '企业版',
    nodeStatus: '已挂起', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '已暂停', slaSub: '挂起中', slaState: 'paused', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13600001111', productCategory: '企业服务',
    createdAt: '2026-06-09 15:20', updatedAt: '2026-06-10 10:00',
    responded: true, suspendedByMe: true, hasSupplement: true,
    suspendedAt: '2026-06-10 10:00', suspendResumeAt: '2026-06-12 18:00',
  },
  { serviceScore: 1,
    id: 't4', no: 'IFLYSJ-20260610-00006', type: '商机', channel: '邮件',
    title: 'API 调用返回 429 限流', smartMarks: ['相似', '知识'],
    customer: '赵敏', vip: true, customerTags: ['校长'], product: '开放平台',
    nodeStatus: '已升级技术支持', nodeStep: 4, nodeTotal: 5, priority: 'P1',
    slaText: '01:48:30', slaSub: '距超时', slaState: 'soon', slaMinutes: 108,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13788889999', productCategory: '开放平台',
    createdAt: '2026-06-10 09:00', updatedAt: '2026-06-10 13:15',
    responded: true, upgradedByMe: true, hasDelegateHistory: true, hasReturnAction: true,
  },
  { serviceScore: 5,
    id: 't5', no: 'IFLYTS-20260610-00007', type: '投诉', channel: 'APP',
    title: '收到商品与描述不符，申请退货', smartMarks: ['情绪'],
    customer: '孙莉', vip: false, customerTags: ['自媒体'], product: '蓝牙耳机 Air',
    nodeStatus: '处理中', nodeStep: 1, nodeTotal: 4, priority: 'P2',
    slaText: '06:20:00', slaSub: '充足', slaState: 'ok', slaMinutes: 380,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '15800002222', sn: 'SN-AIR-55102', productCategory: '智能硬件',
    createdAt: '2026-06-10 11:30', updatedAt: '2026-06-10 12:05',
    // 已联系：催补后坐席已回电 → 催补待回**不收**（PRD-915 补充与催单 §10.1）
    responded: true, supplementUnread: true, hasSupplement: true, contactedAfterUrge: true,
  },
  // 班组长看板「转入」下钻：售后回传 / 跨组调剂
  // 售后转咨询转入（④）：售后单转回客服、客服侧新建咨询单占客服派生位，「转售后」位为「激活售后单」。
  // 挂在 WORKBENCH_HANDLER 名下，「我的任务」首屏即可点开；看板「转入」下钻按 ticketSource 过滤，与处理人无关
  AS_SEEDS.t5a,
  { serviceScore: 3,
    id: 't5b', no: 'IFLYTS-20260804-00004', type: '投诉', channel: '在线客服',
    title: '跨组调剂·二组转入待跟进', smartMarks: ['情绪'],
    customer: '冯磊', vip: false, product: '智能音箱 X1',
    ticketSource: '跨组调剂',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 5, priority: 'P1',
    slaText: '03:20:00', slaSub: '充足', slaState: 'ok', slaMinutes: 200,
    resolveSlaText: '08:00:00', resolveSlaState: 'ok',
    assignee: null, tab: 'pool', groupId: 'line1',
    customerPhone: '13900008802', sn: 'SN-X1-88002', productCategory: '智能硬件',
    createdAt: '2026-08-04 10:40', updatedAt: '2026-08-04 10:40',
    responded: false,
  },
  {
    id: 't6', no: 'IFLYJY-20260610-00008', type: '建议', channel: '电话',
    title: '预约上门安装智能门锁', smartMarks: [],
    customer: '周杰', vip: false, product: '智能门锁 L1',
    nodeStatus: '待响应', nodeStep: 1, nodeTotal: 4, priority: 'P2',
    slaText: '04:10:00', slaSub: '充足', slaState: 'ok', slaMinutes: 250,
    resolveSlaText: '08:00:00', resolveSlaState: 'ok',
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13344445555', sn: 'SN-L1-33001', productCategory: '智能硬件',
    createdAt: '2026-06-10 13:00', updatedAt: '2026-06-10 13:00',
    responded: false,
    hasAppointment: true, appointmentText: '02:15:00',
  },
  { serviceScore: 5,
    id: 't7', no: 'IFLYZX-20260610-00009', type: '咨询', channel: '在线客服',
    title: '会员续费优惠如何领取', smartMarks: ['知识'],
    customer: '吴芳', vip: true, customerTags: ['老师'], product: '会员服务',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P3',
    slaText: '12:30:00', slaSub: '充足', slaState: 'ok', slaMinutes: 750,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '18611112222', productCategory: '会员权益',
    createdAt: '2026-06-08 10:00', updatedAt: '2026-06-09 18:40',
    responded: true,
  },
  {
    id: 't8', no: 'IFLYTS-20260610-00010', type: '投诉', channel: '邮件',
    title: '客服响应慢，要求加急处理', smartMarks: ['升级', '情绪'],
    customer: '郑强', vip: false, customerTags: ['记者'], product: '智能音箱 X1',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '00:58:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 58,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13566667777', sn: 'SN-X1-20260188', productCategory: '智能硬件',
    createdAt: '2026-06-10 10:20', updatedAt: '2026-06-10 15:50',
    // 未联系（缺省即未联系）→ 进催补待回
    responded: true, firstRespBreached: true, dunningUnread: true, hasDunning: true,
  },
  // 非诉转售后后的「已转出」等待态：原单不关闭、留在我的任务、SLA 照常走（1025：转出不停钟），
  // 等售后回传终态（AS_CLOSED → 原单正常关闭进已办；AS_RETURNED → 清空处理人重新派单）
  // 该售后单此后被售后升级投诉（③）：本单占客服来源位不动，卡片呈「冻结」，派生位上是新投诉单
  AS_SEEDS.t33,
  // 1025 客服⇄售后互转：① 关联售后 / ③ 售后升级投诉转入 / ④ 售后转咨询转入 / 同位降级 / 承接
  ...AS_SEEDS.seeds,

  // ================================================================
  // 补充与催单（830）演示单 —— 共 9 张。
  // 看一线视角请**切角色**（角色切换器选「一线坐席」），这批单不再带任何标记：
  // 早先它们带 frontlineDemo，而门控直接读那个字段，于是任何角色打开都被判成一线视角。
  // 原则：**同一行为只留一张**。能复用现有单的不新造（已挂起=t3、已转出=t33、
  // 待审核=review 段、未认领=pool 段），只补 mock 里没有的状态与组合。
  // 对应《【915】补充与催单 PRD》附录 A。
  // ================================================================

  // D3 投诉·外投渠道·非服务投诉：选「补充投诉信息」→ 投诉一/二类 + 投诉平台组**全出现**
  //    兼验：双 Tag（已催+已补）· 未读
  { serviceScore: 2,
    id: 'fd-d2', no: 'IFLYTS-20260817-00001', type: '投诉', channel: '在线客服',
    title: '黑猫平台投诉：售后承诺未兑现', smartMarks: ['升级', '情绪'],
    customer: '吴强', vip: true, customerTags: ['自媒体'], product: '智能音箱 X1',
    ticketSource: '外投渠道', complaintType: '投诉',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P0',
    slaText: '00:35:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 35,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13622223333', productCategory: '智能硬件',
    createdAt: '2026-08-17 08:30', updatedAt: '2026-08-17 10:40',
    responded: true,
    hasDunning: true, dunningUnread: true, hasSupplement: true, supplementUnread: true,
  },
  // D3 投诉·服务投诉·IM：选「补充投诉信息」→ 两组条件字段**都不出现**
  //    兼验：已知晓但未联系（dunningUnread=false 仍被拦）
  {
    id: 'fd-d3', no: 'IFLYTS-20260817-00002', type: '投诉', channel: '在线客服',
    title: '坐席态度问题投诉', smartMarks: ['情绪'],
    customer: '郑霞', vip: false, product: '扫地机器人 R2',
    ticketSource: '在线客服', complaintType: '投诉',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '04:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 240,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13633334444', productCategory: '智能硬件',
    createdAt: '2026-08-17 09:20', updatedAt: '2026-08-17 09:55',
    responded: true, hasDunning: true, dunningUnread: false,
  },
  // D4 调研中：提交催补 → **自动撤回本次下送** → 回处理中（代表"拉回"这一类）
  {
    id: 'fd-d4', no: 'IFLYTS-20260817-00003', type: '投诉', channel: '电话',
    title: '翻录内容缺失，已下送调研核实', smartMarks: ['升级'],
    customer: '袁涛', vip: false, product: '智能录音笔 SR302',
    nodeStatus: '调研中', nodeStep: 3, nodeTotal: 5, priority: 'P1',
    slaText: '01:30:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 90,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13688889999', sn: 'SN-SR302-830101', productCategory: '智能硬件',
    createdAt: '2026-08-16 11:00', updatedAt: '2026-08-17 09:30',
    responded: true,
  },
  // D5 已升级技术支持（基线 §1 ※14）：不拉回；通知**三线组员 + 抄送主责二线**。注意处理人已转到三线
  {
    id: 'fd-d5', no: 'IFLYTS-20260817-00004', type: '投诉', channel: '电话',
    title: '学习机批量固件升级失败，已升三线', smartMarks: ['升级'],
    customer: '钟磊', vip: true, customerTags: ['老师'], product: '学习机 T20',
    nodeStatus: '已升级技术支持', nodeStep: 4, nodeTotal: 5, priority: 'P0',
    slaText: '00:20:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 20,
    assignee: '赵三线', tab: 'mine',
    customerPhone: '13711112222', sn: 'SN-T20-830131', productCategory: '智能硬件',
    createdAt: '2026-08-15 09:00', updatedAt: '2026-08-17 08:00',
    responded: true, upgradedByMe: true, hasDunning: true,
  },
  // D6 已升级产研（基线 §1 ※14a）：不拉回；**处理人未转移**，通知仍落二线。与 D5 成对，
  // 依据基线 §1「一跳一态」，两类升级各占一个子状态，不再靠 escalateTarget 字段区分
  {
    id: 'fd-d6', no: 'IFLYZX-20260817-00005', type: '咨询', channel: '在线客服',
    title: '离线翻译漏译，已提飞书项目待产研排查', smartMarks: ['升级'],
    customer: '孟凡', vip: false, product: '讯飞翻译机 T10', productBg: '消费者BG',
    nodeStatus: '已升级产研', nodeStep: 4, nodeTotal: 5, priority: 'P1',
    slaText: '03:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 180,
    assignee: '王坐席', tab: 'mine', groupId: 'line2',
    customerPhone: '13722223333', sn: 'SN-T10-830141', productCategory: '消费电子',
    createdAt: '2026-08-14 15:00', updatedAt: '2026-08-17 09:00',
    // hasSupplement：演示「已升级」chip 的第二种来源 —— 已升级产研（处理人仍是二线，
    // 本组分支就能取到），与 D5（已升级技术支持、靠扩域补进来）成对
    responded: true, upgradedByMe: true, hasSupplement: true,
  },
  // D7 已委派：主责不转移，通知二线、**协办人收不到**
  {
    id: 'fd-d7', no: 'IFLYZX-20260817-00006', type: '咨询', channel: '电话',
    title: '需协办人核对物流签收记录', smartMarks: [],
    customer: '田薇', vip: false, product: '智能音箱 X1',
    nodeStatus: '已委派', nodeStep: 3, nodeTotal: 5, priority: 'P2',
    slaText: '05:15:00', slaSub: '充足', slaState: 'ok', slaMinutes: 315,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13733334444', productCategory: '智能硬件',
    createdAt: '2026-08-16 09:40', updatedAt: '2026-08-17 08:20',
    responded: true, hasDelegateHistory: true,
  },
  // D8 已结案·无子单：点补充 → **新建一张承接子单**；再补一次仍落这张，不建第二张
  {
    id: 'fd-d8', no: 'IFLYZX-20260817-00007', type: '咨询', channel: '电话',
    title: '耳机配对问题已解决待回访', smartMarks: [],
    customer: '尹洁', vip: false, product: '蓝牙耳机 Air',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P3',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine', groupId: 'line2',
    customerPhone: '13766667777', productCategory: '智能硬件',
    createdAt: '2026-08-10 09:00', updatedAt: '2026-08-16 16:00',
    responded: true,
  },
  // 结案后补充·商机：最后处理人与当前坐席同组（二线技术支持组）→ 商机编号 / 结案后备注可编辑，底栏只留「保存」
  {
    id: 'fd-lead-closed', no: 'IFLYSJ-20260818-00003', type: '商机', channel: '邮件',
    title: '企业版扩容采购意向已转销售', smartMarks: [],
    customer: '钱立', vip: false, product: '开放平台',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine', groupId: 'line2',
    customerPhone: '13755550123', productCategory: '开放平台',
    createdAt: '2026-08-12 10:20', updatedAt: '2026-08-18 15:40',
    responded: true,
  },
  // 结案后补充·商机：最后处理人在硬件缺陷组，与当前坐席不同组 → 两个字段只读、无底栏
  {
    id: 'fd-lead-closed-other', no: 'IFLYSJ-20260818-00004', type: '商机', channel: '电话',
    title: '学习机批量采购咨询已转渠道', smartMarks: [],
    customer: '贺敏', vip: false, product: '学习机 T20',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P3',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '陈坐席', tab: 'done', handledByMe: true, groupId: 'hardware',
    customerPhone: '13755550456', productCategory: '智能硬件',
    createdAt: '2026-08-11 14:05', updatedAt: '2026-08-18 11:10',
    responded: true,
  },
  // D9 已升级外投：已有子单 → 点补充**跳子单**；本单整页冻结 + 接管横幅。
  //   本单来源＝外投渠道，走的是升阶**第二跳**（内投→外投），依据基线 §1
  //   直接落子状态「已升级外投」——不再靠字段在运行时拼名。
  {
    id: 'fd-d9', no: 'IFLYTS-20260817-00008', type: '投诉', channel: '电话',
    title: '已升级为外投单，本单被接管', smartMarks: ['升级'],
    customer: '施磊', vip: false, product: '学习机 T20',
    ticketSource: '外投渠道',
    nodeStatus: '已升级外投', nodeStep: 5, nodeTotal: 5, priority: 'P0',
    slaText: '—', slaSub: '已升级外投·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine',
    escalatedToNo: 'IFLYZX-20260817-00010',
    customerPhone: '13777778888', sn: 'SN-T20-830191', productCategory: '智能硬件',
    createdAt: '2026-08-13 09:00', updatedAt: '2026-08-16 11:30',
    responded: true,
  },
  // D10 直接结案：一次性单，催补**两枚都不给**（基线 §1 ※25）。已取消行为相同，不另造单。
  //   结案方式＝**直接结案**（基线 §1「结案方式」小节）：建单即结案、从未进流程，
  //   故动作集极简——不下送、不升级、不挂起、不转派。
  {
    id: 'fd-d10', no: 'IFLYZX-20260817-00009', type: '咨询', channel: '在线客服',
    title: '一次性解答完成，建单即结案', smartMarks: [],
    customer: '范萍', vip: false, product: '企业版',
    nodeStatus: '直接结案', closureMode: '直接结案', nodeStep: 1, nodeTotal: 1, priority: 'P3',
    slaText: '—', slaSub: '直接结案', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine',
    customerPhone: '13788889999', productCategory: '企业服务',
    createdAt: '2026-08-16 10:00', updatedAt: '2026-08-16 10:05',
    responded: true,
  },

  // ---- 已办 (done) 7+ ----
  // updatedAt 需落在「已办」默认 30 天窗内（相对 @/config/prototypeDate PROTOTYPE_TODAY）
  { serviceScore: 2,
    id: 't9', no: 'IFLYZX-20260715-00003', type: '咨询', channel: '电话',
    title: '空气净化器滤芯指示灯常亮', smartMarks: [],
    customer: '冯涛', vip: false, product: '空气净化器 P3',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P2',
    slaText: '03:25:00', slaSub: '充足', slaState: 'ok', slaMinutes: 205,
    assignee: '陈坐席', tab: 'done', handledByMe: true, myTransferAction: true,
    customerPhone: '13700001122', sn: 'SN-P3-44102', productCategory: '智能硬件',
    createdAt: '2026-07-13 14:00', updatedAt: '2026-08-15 09:30',
  },
  {
    id: 't10', no: 'IFLYZX-20260714-00001', type: '咨询', channel: '小程序',
    title: '发票抬头修改流程', smartMarks: [],
    customer: '陈静', vip: false, customerTags: ['老师'], product: '企业版',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 4, priority: 'P3',
    slaText: '08:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 480,
    resolveSlaText: '16:00:00', resolveSlaState: 'ok',
    assignee: '林坐席', tab: 'done', handledByMe: true, myDelegateAction: true,
    customerPhone: '13622223333', productCategory: '企业服务',
    createdAt: '2026-07-12 10:15', updatedAt: '2026-08-14 16:40',
  },
  { serviceScore: 5,
    id: 't11', no: 'IFLYSJ-20260716-00001', type: '商机', channel: '邮件',
    title: 'Webhook 推送偶发丢失', smartMarks: ['相似'],
    customer: '韩雪', vip: true, customerTags: ['自媒体'], product: '开放平台',
    nodeStatus: '已升级技术支持', nodeStep: 4, nodeTotal: 5, priority: 'P1',
    slaText: '00:35:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 35,
    assignee: '陈坐席', tab: 'done', handledByMe: true, myUpgradeAction: true,
    customerPhone: '13588889999', productCategory: '开放平台',
    createdAt: '2026-07-14 11:20', updatedAt: '2026-08-16 12:00',
  },
  {
    id: 't12', no: 'IFLYTS-20260716-00002', type: '投诉', channel: 'APP',
    title: '退款迟迟未到账', smartMarks: ['情绪'],
    customer: '杨光', vip: false, product: '蓝牙耳机 Air',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P0',
    slaText: '已超 00:25', slaSub: '已超时', slaState: 'overdue', slaMinutes: -25,
    assignee: '林坐席', tab: 'done', handledByMe: true, myForceCloseAction: true,
    customerPhone: '15833334444', sn: 'SN-AIR-88201', productCategory: '智能硬件',
    createdAt: '2026-07-15 08:00', updatedAt: '2026-08-16 15:20',
  },
  // ⬇ 以下几张停表单的 slaSub 一律写**基线 §1 的终态子状态名**。取值按该单自带的动作标记反推：
  //   `myCloseAction`（关闭工单审批通过）→ **已关闭**（基线 §1 该行「友好沟通后关闭」）；
  //   `myForceCloseAction` → 已强结；`escalatedToNo` → 已升级投诉 / 已升级外投（看原单是不是外投）；
  //   nodeStatus 本身已是终态的（如已结案）直接取它。
  {
    id: 't27', no: 'IFLYZX-20260710-00002', type: '咨询', channel: '电话',
    title: '路由器固件升级后无法联网', smartMarks: [],
    customer: '钱进', vip: false, product: '路由器 R2',
    nodeStatus: '处理中', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '已关闭·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '陈坐席', tab: 'done', handledByMe: true, myCloseAction: true,
    customerPhone: '13944445555', sn: 'SN-R2-11002', productCategory: '智能硬件',
    createdAt: '2026-07-07 09:30', updatedAt: '2026-08-10 17:00',
  },
  {
    id: 't28', no: 'IFLYTS-20260708-00002', type: '投诉', channel: '在线客服',
    title: '重复扣费问题已协调处理', smartMarks: [],
    customer: '谢婷', vip: true, customerTags: ['老师'], product: '会员服务',
    nodeStatus: '处理中', nodeStep: 5, nodeTotal: 5, priority: 'P1',
    slaText: '—', slaSub: '已关闭·停表', slaState: 'ok', slaMinutes: 9999,
    solveBreached: true,
    assignee: '林坐席', tab: 'done', handledByMe: true,
    myTransferAction: true, myCloseAction: true,
    customerPhone: '18655556666', productCategory: '会员权益',
    createdAt: '2026-07-05 13:00', updatedAt: '2026-08-08 18:30',
  },
  // ── 关闭类终态 · 两种收口原因对照（PRD §5.6.4）────────────────────────────
  // 咨询原单 → 风险报备 rr-006 挂载点；评估「升级」后派生 t40（IFLYTS-20260709-00001）
  {
    id: 't39', no: 'IFLYZX-20260707-00001', type: '咨询', channel: '电话',
    title: '学习机屏幕漏光，客户要求升级', smartMarks: ['升级', '情绪'],
    customer: '周敏', vip: false, product: '学习机 T20',
    nodeStatus: '处理中', nodeStep: 5, nodeTotal: 5, priority: 'P1',
    slaText: '—', slaSub: '已升级投诉·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'done', handledByMe: true, myUpgradeAction: true,
    customerPhone: '13500002222', sn: 'SN-T20-77301', productCategory: '学习硬件',
    problemDesc: '客户连续两日致电反馈屏幕漏光，明确要求"给个说法否则去平台曝光"，并已在社交平台发帖。',
    escalatedToNo: 'IFLYTS-20260709-00001',
    createdAt: '2026-07-07 09:15', updatedAt: '2026-07-09 10:30',
  },
  // ① 正常关闭：**无派生子单**（有父关联：本单是别的单升级来的）。
  //    再来诉求 → 补充/催单走「基于原单建新单承接」（§5.2，同 Zendesk follow-up）。
  { serviceScore: 3,
    id: 't40', no: 'IFLYTS-20260709-00001', type: '投诉', channel: '电话',
    title: '学习机屏幕漏光已现场更换', smartMarks: [],
    customer: '周敏', vip: false, product: '学习机 T20',
    nodeStatus: '处理中', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '已关闭·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'done', handledByMe: true, myCloseAction: true,
    customerPhone: '13500002222', sn: 'SN-T20-77301', productCategory: '学习硬件',
    problemDesc: '屏幕左下角漏光，已现场更换屏幕总成并复检通过，客户确认满意。',
    escalatedFromNo: 'IFLYZX-20260707-00001', // 父关联：由咨询单升级而来
    createdAt: '2026-07-07 10:20', updatedAt: '2026-07-09 16:45',
  },
  // ② 因升级投诉而关闭：**有派生子单**（已升级为外投单）→ 原单落「已升级外投」（第二跳），
  //    处理页整页只读 + 接管横幅，
  //    补充/催单点击后引导前往新单，不再建第三张单。
  {
    id: 't41', no: 'IFLYTS-20260711-00001', type: '投诉', channel: '在线客服',
    title: '维修超期未解决客户要求赔偿', smartMarks: ['升级'],
    customer: '吴强', vip: true, product: '智能音箱 X1',
    ticketSource: '外投渠道',
    nodeStatus: '处理中', nodeStep: 5, nodeTotal: 5, priority: 'P0',
    slaText: '—', slaSub: '已升级外投·停表', slaState: 'ok', slaMinutes: 9999,
    solveBreached: true,
    assignee: '王坐席', tab: 'done', handledByMe: true, myUpgradeAction: true,
    customerPhone: '13700003333', sn: 'SN-X1-55208', productCategory: '智能硬件',
    problemDesc: '维修超期 15 天未解决，客户要求赔偿并已向 12315 投诉。',
    escalatedToNo: 'IFLYTS-20260711-00002', // 已升级为外投单 → 本单被接管
    createdAt: '2026-07-08 09:10', updatedAt: '2026-07-11 14:25',
  },
  // 升级派生出的外投新单（上面 t41 的去向，可从关系芯片/横幅跳到这里）
  { serviceScore: 5,
    id: 't42', no: 'IFLYTS-20260711-00002', type: '投诉', channel: '在线客服',
    title: '外投·维修超期未解决客户要求赔偿', smartMarks: ['升级'],
    customer: '吴强', vip: true, product: '智能音箱 X1',
    ticketSource: '外投渠道',
    nodeStatus: '已升级技术支持', nodeStep: 3, nodeTotal: 5, priority: 'P0',
    slaText: '01:12:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 72,
    assignee: '王坐席', tab: 'mine', responded: true,
    customerPhone: '13700003333', sn: 'SN-X1-55208', productCategory: '智能硬件',
    problemDesc: '【升级投诉·原单 IFLYTS-20260711-00001】投诉 → 外投｜投诉平台：市场监管12315平台（编号 HM20260711008）｜客户要求赔偿并已向监管平台投诉。',
    escalatedFromNo: 'IFLYTS-20260711-00001',
    createdAt: '2026-07-11 14:25', updatedAt: '2026-07-11 15:02',
  },
  // 非诉转售后 → 售后侧关单回传（AS_CLOSED）→ 原单正常关闭，进「已办」，行内可见关联售后单号（可跳转）
  applyAftersaleEvent({
    id: 't32', no: 'IFLYZX-20260716-00003', type: '咨询', channel: '电话',
    title: '扫地机器人滚刷卡死需上门维修', smartMarks: [],
    customer: '雷军', vip: false, product: '扫地机器人 R2',
    nodeStatus: '已转出', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '03:40:00', slaSub: '充足', slaState: 'ok', slaMinutes: 220,
    assignee: '陈坐席', tab: 'mine', handledByMe: true, myTransferAction: true,
    linkedAftersaleNo: 'AS-20260716-38025', linkedAftersaleServiceType: '维修',
    customerPhone: '13100002200', sn: 'SN-R2-77120', productCategory: '智能硬件',
    createdAt: '2026-07-16 10:20', updatedAt: '2026-07-16 11:02', responded: true,
  }, {
    type: 'AS_CLOSED', asNo: 'AS-20260716-38025', eventId: 'ase-38025-closed',
    at: '2026-08-12 15:05', operator: '周师傅', status: '已完成',
    resultSummary: '上门更换滚刷组件并清理主刷仓，试机运行正常，客户签字确认。',
  }).ticket,
  // 非诉转售后 → 售后转回客服（AS_RETURNED）→ 清空处理人、按分派规则落回本组工单池，尚未领取
  applyAftersaleEvent({
    id: 't36', no: 'IFLYZX-20260924-00012', type: '咨询', channel: '电话',
    title: '学习机屏幕间歇性闪烁，咨询保修范围', smartMarks: [],
    customer: '韩雪', vip: false, product: '讯飞学习机 T20',
    nodeStatus: '已转出', nodeStep: 4, nodeTotal: 5, priority: 'P2',
    slaText: '05:10:00', slaSub: '充足', slaState: 'ok', slaMinutes: 310,
    assignee: '王坐席', tab: 'mine', groupId: 'hardware', myTransferAction: true,
    linkedAftersaleNo: 'AS-20260924-41163', linkedAftersaleServiceType: '维修',
    customerPhone: '13800009012', sn: 'SN-T20-90412', productCategory: '智能硬件',
    createdAt: '2026-09-24 09:30', updatedAt: '2026-09-24 10:12', responded: true,
  }, {
    type: 'AS_RETURNED', asNo: 'AS-20260924-41163', eventId: 'ase-41163-returned-1',
    at: '2026-09-25 14:20', operator: '许师傅（售后二组）',
    returnReason: '检测为系统设置问题，非硬件故障，转回客服指导客户调整显示设置。',
  }).ticket,
  // 同上回流后已被领取：直落「处理中」、首响不重计
  ((): Ticket => {
    const returned = applyAftersaleEvent({
      id: 't37', no: 'IFLYZX-20260923-00008', type: '建议', channel: '在线客服',
      title: '翻译机充电底座接触不良，建议改进底座设计', smartMarks: [],
      customer: '邵峰', vip: false, product: '讯飞翻译机 T10',
      nodeStatus: '已转出', nodeStep: 4, nodeTotal: 5, priority: 'P3',
      slaText: '09:20:00', slaSub: '充足', slaState: 'ok', slaMinutes: 560,
      assignee: '林坐席', tab: 'mine', groupId: 'hardware',
      linkedAftersaleNo: 'AS-20260923-40877', linkedAftersaleServiceType: '维修',
      customerPhone: '13600007788', sn: 'SN-T10-23877', productCategory: '消费电子',
      createdAt: '2026-09-23 16:05', updatedAt: '2026-09-23 16:40', responded: true,
    }, {
      type: 'AS_RETURNED', asNo: 'AS-20260923-40877', eventId: 'ase-40877-returned-1',
      at: '2026-09-25 10:05', operator: '马师傅（售后一组）',
      returnReason: '底座更换后客户仍反馈产品设计问题，属产品建议，转回客服登记跟进。',
    }).ticket;
    return takeOverReturnedTicket(returned, {
      assignee: '王坐席', how: '领取', operator: '王坐席', operatorRole: '二线专员', at: '2026-09-25 10:32',
    }) ?? returned;
  })(),
  // 回流单激活售后单后，售后再次转客服：落原单（§4.3 判据第 2 条 / §4.5 支一），履历「售后再次转客服（第 2 次）」
  ((): Ticket => {
    const asNo = 'AS-20260926-41205';
    const returned = routeAftersaleEvent([{
      id: 't38', no: 'IFLYZX-20260926-00013', type: '咨询', channel: '电话',
      title: '扫地机器人边刷异响，咨询保修处理', smartMarks: [],
      customer: '冯悦', vip: false, product: '扫地机器人 R2',
      nodeStatus: '已转出', nodeStep: 4, nodeTotal: 5, priority: 'P2',
      slaText: '06:30:00', slaSub: '充足', slaState: 'ok', slaMinutes: 390,
      assignee: '王坐席', tab: 'mine', groupId: 'hardware', myTransferAction: true,
      linkedAftersaleNo: asNo, linkedAftersaleServiceType: '维修',
      customerPhone: '13700004120', sn: 'SN-R2-41205', productCategory: '智能硬件',
      createdAt: '2026-09-26 09:15', updatedAt: '2026-09-26 09:50', responded: true,
    }], {
      type: 'AS_RETURNED', asNo, eventId: 'ase-41205-returned-1',
      at: '2026-09-27 15:10', operator: '曹师傅（售后一组）',
      returnReason: '检测边刷电机正常，异响为缠绕异物，转回客服指导清理。',
    }).rows[0];
    const claimed = takeOverReturnedTicket(returned, {
      assignee: '王坐席', how: '领取', operator: '王坐席', operatorRole: '二线专员', at: '2026-09-27 15:40',
    }) ?? returned;
    // 客服侧「激活售后单」：售后单重新打开
    const reopened = routeAftersaleEvent([claimed], {
      type: 'AS_PROGRESS', asNo, at: '2026-09-28 10:20', operator: '曹师傅（售后一组）', status: '待接单',
    }).rows[0];
    return routeAftersaleEvent([reopened], {
      type: 'AS_RETURNED', asNo, eventId: 'ase-41205-returned-2',
      at: '2026-10-01 14:30', operator: '曹师傅（售后一组）',
      returnReason: '清理后异响复现，复检硬件正常，转回客服指导更换边刷耗材。',
    }).rows[0];
  })(),

  // ---- 本组工单池 (pool) 5 ----
  {
    id: 't13', no: 'IFLYZX-20260610-00011', type: '咨询', channel: '在线客服',
    title: '智能音箱无法连接 WiFi', smartMarks: [],
    customer: '何苗', vip: false, product: '智能音箱 X1',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 5, priority: 'P2',
    slaText: '02:00:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 120,
    resolveSlaText: '06:00:00', resolveSlaState: 'ok',
    assignee: null, tab: 'pool', groupId: 'line1', hasSupplement: true,
  },
  {
    id: 't14', no: 'IFLYZX-20260610-00012', type: '咨询', channel: '电话',
    title: '扫地机器人充电故障', smartMarks: [],
    customer: '罗成', vip: false, customerTags: ['校长'], product: '扫地机器人 R2',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 5, priority: 'P1',
    slaText: '已超 00:15', slaSub: '已超时', slaState: 'overdue', slaMinutes: -15,
    resolveSlaText: '04:00:00', resolveSlaState: 'ok',
    assignee: null, tab: 'pool', groupId: 'line2', hasDunning: true,
  },
  {
    id: 't15', no: 'IFLYTS-20260610-00013', type: '投诉', channel: '小程序',
    title: '七天无理由退货咨询', smartMarks: [],
    customer: '袁媛', vip: true, customerTags: ['老师'], product: '会员服务',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 4, priority: 'P3',
    slaText: '05:30:00', slaSub: '充足', slaState: 'ok', slaMinutes: 330,
    resolveSlaText: '12:00:00', resolveSlaState: 'ok',
    assignee: null, tab: 'pool', groupId: 'line1',
  },
  {
    id: 't29', no: 'IFLYTS-20260610-00014', type: '投诉', channel: 'APP',
    title: '屏幕花屏需返厂检测', smartMarks: ['情绪'],
    customer: '唐磊', vip: false, product: '学习机 T20',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 5, priority: 'P0',
    slaText: '00:28:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 28,
    resolveSlaText: '02:30:00', resolveSlaState: 'ok',
    assignee: null, tab: 'pool', groupId: 'hardware', hasDunning: true, hasSupplement: true,
  },
  {
    id: 't30', no: 'IFLYZX-20260610-00015', type: '咨询', channel: '电话',
    title: 'API 鉴权失败排查', smartMarks: [],
    customer: '沈悦', vip: true, customerTags: ['自媒体'], product: '开放平台',
    nodeStatus: '未认领', nodeStep: 1, nodeTotal: 5, priority: 'P1',
    slaText: '01:20:00', slaSub: '距超时', slaState: 'ok', slaMinutes: 80,
    resolveSlaText: '06:00:00', resolveSlaState: 'ok',
    assignee: null, tab: 'pool', groupId: 'line2',
  },

  // ---- @我的工单 (cc) 3 ----
  {
    id: 't16', no: 'IFLYSJ-20260609-00004', type: '商机', channel: '邮件',
    title: '批量导入用户报错', smartMarks: ['知识'],
    customer: '邓超', vip: true, customerTags: ['记者'], product: '开放平台',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P2',
    slaText: '07:15:00', slaSub: '充足', slaState: 'ok', slaMinutes: 435,
    // 已联系：催补后坐席已回电 → 催补待回**不收**（PRD-915 补充与催单 §10.1）
    assignee: '陈坐席', tab: 'pool', mentionUnread: true, hasSupplement: true, supplementContacted: true, contactedAfterUrge: true,
  },
  {
    id: 't17', no: 'IFLYTS-20260609-00005', type: '投诉', channel: '在线客服',
    title: '账号被异常登录', smartMarks: ['升级'],
    customer: '曾琳', vip: false, product: '企业版',
    nodeStatus: '已升级技术支持', nodeStep: 4, nodeTotal: 5, priority: 'P0',
    slaText: '01:05:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 65,
    assignee: '林坐席', tab: 'pool', mentionUnread: true, hasDunning: true,
  },
  {
    id: 't31', no: 'IFLYZX-20260609-00006', type: '咨询', channel: '电话',
    title: '@王坐席 请协助确认退款政策', smartMarks: [],
    customer: '白露', vip: false, customerTags: ['老师'], product: '会员服务',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P2',
    slaText: '04:30:00', slaSub: '充足', slaState: 'ok', slaMinutes: 270,
    assignee: '陈坐席', tab: 'pool', mentionUnread: false,
  },

  // ---- 待审核 (review) 3：挂起送审 / 强结送审 / 关单送审 各 1 ----
  {
    id: 't18', no: 'IFLYZX-20260609-00001', type: '咨询', channel: '电话',
    title: '已更换主板，待审核结单', smartMarks: [],
    customer: '田野', vip: false, customerTags: ['校长'], product: '空气净化器 P3',
    nodeStatus: '申请关闭中', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '03:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 180,
    assignee: '王坐席', tab: 'review', reviewReason: '关单送审',
  },
  {
    id: 't19', no: 'IFLYZX-20260609-00002', type: '咨询', channel: '小程序',
    title: '已答复绑定流程，待审核', smartMarks: [],
    customer: '范冰', vip: false, product: '企业版',
    nodeStatus: '申请挂起中', nodeStep: 4, nodeTotal: 4, priority: 'P3',
    slaText: '09:00:00', slaSub: '充足', slaState: 'ok', slaMinutes: 540,
    assignee: '陈坐席', tab: 'review', reviewReason: '挂起送审',
  },
  {
    id: 't20', no: 'IFLYTS-20260609-00003', type: '投诉', channel: 'APP',
    title: '已确认退款金额，待审核', smartMarks: ['情绪'],
    customer: '苏洋', vip: true, customerTags: ['自媒体'], product: '蓝牙耳机 Air',
    nodeStatus: '申请强结中', nodeStep: 4, nodeTotal: 4, priority: 'P1',
    slaText: '00:48:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 48,
    assignee: '王坐席', tab: 'review', reviewReason: '强结送审',
  },

  // ---- 已归档 (archived) 6 ----
  {
    id: 't21', no: 'IFLYZX-20260528-00001', type: '咨询', channel: '在线客服',
    title: '账号注销流程咨询', smartMarks: [],
    customer: '钱伟', vip: false, product: '企业版',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P3',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine', archived: true, updatedAt: '2025-05-28 16:30',
  },
  {
    id: 't22', no: 'IFLYZX-20260527-00001', type: '咨询', channel: '电话',
    title: '路由器已更换并结单', smartMarks: [],
    customer: '孔明', vip: false, product: '路由器 R2',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '陈坐席', tab: 'done', archived: true, updatedAt: '2025-05-27 11:20',
    handledByMe: true, myTransferAction: true,
  },
  {
    id: 't23', no: 'IFLYTS-20260526-00001', type: '投诉', channel: '邮件',
    title: '物流延迟投诉已解决', smartMarks: ['情绪'],
    customer: '吕布', vip: true, customerTags: ['记者'], product: '智能音箱 X1',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P1',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '林坐席', tab: 'done', archived: true, updatedAt: '2025-05-26 09:45',
    handledByMe: true, myCloseAction: true,
  },
  {
    id: 't24', no: 'IFLYTS-20260525-00001', type: '投诉', channel: 'APP',
    title: '退货退款已完成', smartMarks: [],
    customer: '貂蝉', vip: false, product: '蓝牙耳机 Air',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '王坐席', tab: 'mine', archived: true, updatedAt: '2025-05-25 14:10',
  },
  {
    id: 't25', no: 'IFLYJY-20260524-00001', type: '建议', channel: '电话',
    title: '智能门锁安装完成', smartMarks: [],
    customer: '刘备', vip: false, product: '智能门锁 L1',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P2',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '陈坐席', tab: 'done', archived: true, updatedAt: '2025-05-24 17:00',
    handledByMe: true, myDelegateAction: true,
  },
  {
    id: 't26', no: 'IFLYSJ-20260523-00001', type: '商机', channel: '邮件',
    title: 'API 鉴权问题已修复', smartMarks: ['知识'],
    customer: '孙权', vip: true, customerTags: ['自媒体'], product: '开放平台',
    nodeStatus: '已结案', nodeStep: 5, nodeTotal: 5, priority: 'P1',
    slaText: '—', slaSub: '已结案·停表', slaState: 'ok', slaMinutes: 9999,
    assignee: '林坐席', tab: 'mine', archived: true, updatedAt: '2025-05-23 10:30',
  },

  // ================================================================
  // 运营监控大盘的超时样本单 —— 共 6 张。
  //
  // 【为什么必须落在工单数据源里】运营监控是**租户级**视角，风险清单里超时最久的单
  // 天然不在本工作台的数据域内。清单原先自带一份手写单号，工单库里查不到，
  // 点进去只能静默打到默认演示单 —— 每一行打开的都是同一张单。
  //
  // 【为什么不进本工作台的任何 Tab】这批单归属**其他班组**（硬件缺陷组 / 教育支持组 /
  // 技术支持组 / 受理二组），处理人也不是本工作台的当前坐席，本工作台本就看不到它们：
  //   · `tab='done'` + `handledByMe: false` → inDoneScope 排除，Tab 徽章也不计
  //   · 无 groupId → 组池与「催补待回」两个域一律 fail-closed 排除
  //   · 在查询中心（租户级）与运营监控风险清单里可查、可点开
  //
  // 【为什么都是超时态】它们的用途只有一个：给风险清单的「超时 >72h / 24–72h」两桶
  // 提供真单。既有的在办单里没有一张挂着跨天的超时钟（最久的 t2 才超 1 小时多），
  // 拿它们充数会让「已超 96 小时」的行点开后看到一个还剩几小时的钟。
  // ================================================================
  {
    id: 'ops-1', no: 'IFLYTS-20260731-00001', type: '投诉', channel: '电话',
    title: '智能音箱返修超期未回寄', smartMarks: ['情绪'],
    customer: '吴强', vip: true, product: '智能音箱 X1',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P0',
    slaText: '已超 96:12', slaSub: '已超时', slaState: 'overdue', slaMinutes: -5772,
    assignee: '陈坐席', tab: 'done', handledByMe: false,
    customerPhone: '13700003333', sn: 'SN-X1-55208', productCategory: '智能硬件',
    problemDesc: '送修 12 天仍未回寄，客户多次催问未获明确回寄时间。',
    latestHandling: '已催返修仓，等待物流回单，尚未给客户明确回寄时间。',
    createdAt: '2026-07-27 09:15', updatedAt: '2026-07-31 10:40',
    responded: true, solveBreached: true, hasDunning: true,
  },
  {
    id: 'ops-2', no: 'IFLYTS-20260730-00001', type: '投诉', channel: '邮件',
    title: '学习机批量激活失败未解决', smartMarks: ['升级'],
    customer: '赵敏', vip: true, customerTags: ['校长'], product: '智学网校级版',
    nodeStatus: '已升级技术支持', nodeStep: 4, nodeTotal: 5, priority: 'P0',
    slaText: '已超 88:40', slaSub: '已超时', slaState: 'overdue', slaMinutes: -5320,
    assignee: '孙坐席', tab: 'done', handledByMe: false,
    customerPhone: '13788889999', productCategory: '教育服务',
    problemDesc: '校级批量激活 320 台学习机全部失败，开学在即。',
    latestHandling: '已升三线定位授权服务，等待批量重发激活码。',
    createdAt: '2026-07-26 08:30', updatedAt: '2026-07-30 09:20',
    responded: true, solveBreached: true, upgradedByMe: true,
  },
  {
    id: 'ops-3', no: 'IFLYZX-20260731-00002', type: '咨询', channel: '邮件',
    title: '开放平台配额申请无人跟进', smartMarks: ['相似'],
    customer: '韩雪', vip: true, customerTags: ['自媒体'], product: '开放平台',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '已超 79:05', slaSub: '已超时', slaState: 'overdue', slaMinutes: -4745,
    assignee: '周工', tab: 'done', handledByMe: false,
    customerPhone: '13588889999', productCategory: '开放平台',
    problemDesc: '并发配额提升申请提交后三天无回复。',
    latestHandling: '申请单已流转至平台侧，暂无排期反馈。',
    createdAt: '2026-07-28 11:00', updatedAt: '2026-07-31 09:05',
    responded: true, solveBreached: true,
  },
  {
    id: 'ops-4', no: 'IFLYTS-20260802-00001', type: '投诉', channel: '电话',
    title: '扫地机器人主刷电机异响', smartMarks: ['情绪'],
    customer: '李大海', vip: false, product: '扫地机器人 R2',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P1',
    slaText: '已超 52:18', slaSub: '已超时', slaState: 'overdue', slaMinutes: -3138,
    assignee: '陈坐席', tab: 'done', handledByMe: false,
    customerPhone: '13912345678', sn: 'SN-R2-882910', productCategory: '智能硬件',
    problemDesc: '主刷电机运转时持续金属异响，清理滚刷无改善。',
    latestHandling: '已判定需更换电机总成，配件在途未到货。',
    createdAt: '2026-07-31 14:20', updatedAt: '2026-08-02 10:15',
    responded: true, solveBreached: true,
  },
  {
    id: 'ops-5', no: 'IFLYZX-20260802-00002', type: '咨询', channel: '邮件',
    title: 'API 网关 502 间歇性报错', smartMarks: ['相似', '知识'],
    customer: '赵敏', vip: true, customerTags: ['校长'], product: '开放平台',
    nodeStatus: '已升级技术支持', nodeStep: 4, nodeTotal: 5, priority: 'P0',
    slaText: '已超 41:06', slaSub: '已超时', slaState: 'overdue', slaMinutes: -2466,
    assignee: '周工', tab: 'done', handledByMe: false,
    customerPhone: '13788889999', productCategory: '开放平台',
    problemDesc: '网关间歇性返回 502，影响校端成绩同步任务。',
    latestHandling: '已升三线抓包，怀疑上游连接池耗尽，待复现。',
    createdAt: '2026-07-31 16:40', updatedAt: '2026-08-02 08:50',
    responded: true, solveBreached: true, upgradedByMe: true,
  },
  {
    id: 'ops-6', no: 'IFLYZX-20260802-00003', type: '咨询', channel: '小程序',
    title: '发票重开申请未处理', smartMarks: [],
    customer: '陈静', vip: false, customerTags: ['老师'], product: '企业版',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P2',
    slaText: '已超 33:47', slaSub: '已超时', slaState: 'overdue', slaMinutes: -2027,
    assignee: '林坐席', tab: 'done', handledByMe: false,
    productCategory: '企业服务',
    problemDesc: '抬头开错需作废重开，财务侧迟迟未回。',
    latestHandling: '已提交财务作废申请，等待重开。',
    createdAt: '2026-07-31 09:30', updatedAt: '2026-08-02 09:10',
    responded: true, solveBreached: true,
  },

  // ================================================================
  // 风险监控「重点工单」里**非投诉 P0 / P1** 那一支的真单 —— 共 6 张（rk-1 … rk-6）。
  //
  // 【为什么必须补】风险监控页「未标记 · 重点工单」按**工单优先级**分档，而非投诉单进这一路
  // 的判据是「在办 ∧ P0 / P1」。原有工单库里符合这条的**非投诉 P0
  // 只有 t2 一张**，于是那一档的 P0 恒为 1：一个只有一条的档位既排不出队，也看不出
  // "紧急的堆了多少"——而这正是这一路存在的理由。P1 那一档同理，本轮有五张 P1 被打标进池
  // 之后只剩三张，同样过薄。
  //
  // 【为什么不改判据去凑数】把非投诉的 P2 也算进「重点工单」等于改口径：那一支答的是
  // "有多少单本身就急"，放宽之后它答的是"有多少单在办"，这一路就再也指不出该先动哪一批。
  // 故补的是**真单**不是判据。
  //
  // 【为什么沿用 ops-* 那套写法】`tab: 'done'` + `handledByMe: false` + 无 `groupId`：
  // 这批单归属其他班组、处理人也不是本工作台的坐席，故本工作台的六个页签一个都不收它们
  // （见上方 ops-* 的说明），只在查询中心与运营监控里可查、可点开。补数据不该顺带把
  // 别的页面的条数改掉。
  //
  // ---- 当日建单三张：rk-3、rk-8、rk-9 的 `createdAt` 走 `todayStamp` ----
  // 风险监控页头「工单存量」两格下方的「今日新增 N」按 `createdAt` 是否落在自然日今天来数
  // （`RiskMonitorView.ticketStockOf`）。整份工单库的建单时刻都写死在 6~8 月，那两个数于是恒为 0：
  // 一个永远是 0 的指标，读的人分不清是"今天真没进单"还是"这一格根本不走数"。
  //
  // 【为什么挑这三张】①两格各要有数：rk-8 / rk-9 是投诉（投诉工单那格），rk-3 是非投诉 P0
  // （紧急 / 重要那格），两张投诉又都是 P1，故后一格收三张。②三张的 SLA 现状都是"未超时"
  // （rk-3 距首响 35 分、rk-8 距首响 48 分、rk-9 解决剩 01:36），改成当天建单不会撞出
  // "今天刚建、却已超时几十小时"这种自相矛盾的行——rk-1 / rk-6 / rk-7 那几张挂着 `solveBreached`
  // 的就是因此不动。③三张都没被风险种子（`stores/riskQueue.ts`）与运营报表（`mock/opsReport.ts`）
  // 引用，改时刻不会牵动那两处的样本。
  //
  // 🔴 **单号一律不动**。号段里的日期与 `createdAt` 本就不要求相等（rk-1 / rk-6 / rk-7 是
  // `20260806` 配 08-05 建单），而 `IFLYTS-<今天>-` 这一段是派生投诉单的号段
  // （`stores/derivedTickets.ts` 的 `SEED_RISK_ESCALATION` 占 00001，现场升级由
  // `useRiskReportAssess.nextEscalatedNo` 顺序取号）——把样本单改到那一段里去，
  // 等于在演示数据里埋一个会撞号的坑。
  // ================================================================
  {
    id: 'rk-1', no: 'IFLYZX-20260806-00001', type: '咨询', channel: '邮件',
    title: '智学网期末成绩批量导出失败', smartMarks: ['相似'],
    customer: '合肥八中', vip: true, customerTags: ['校长'], product: '智学网校级版',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P0',
    slaText: '已超 12:40', slaSub: '已超时', slaState: 'overdue', slaMinutes: -760,
    // 处理人＝管理员演示账号（18756826666 周运营）：「风险报备」只给本单主责处理人，管理员要有自己在办的单
    assignee: '周运营', tab: 'done', handledByMe: false,
    customerPhone: '13866667777', productCategory: '教育服务',
    problemDesc: '期末成绩批量导出连续三次失败，年级组无法归档成绩单。',
    latestHandling: '已复现导出超时，正在核对班级数据量上限。',
    createdAt: '2026-08-05 16:20', updatedAt: '2026-08-06 09:05',
    responded: true, solveBreached: true,
  },
  {
    id: 'rk-2', no: 'IFLYZX-20260806-00002', type: '咨询', channel: '电话',
    title: '学习机课本同步资源全部丢失', smartMarks: [],
    customer: '周敏', vip: false, product: '学习机 T20',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P0',
    slaText: '02:10:00', slaSub: '充足', slaState: 'ok', slaMinutes: 130,
    assignee: '孙坐席', tab: 'done', handledByMe: false,
    customerPhone: '13755558888', sn: 'SN-T20-660412', productCategory: '学习硬件',
    problemDesc: '升级后本地课本同步资源清空，重新下载提示无权限。',
    latestHandling: '已指导重新绑定教材版本，资源已恢复，客户确认可用。',
    createdAt: '2026-08-06 08:40', updatedAt: '2026-08-06 10:15',
    responded: true,
  },
  {
    id: 'rk-3', no: 'IFLYZX-20260806-00003', type: '咨询', channel: '邮件',
    title: '开放平台鉴权服务批量返回 500', smartMarks: ['相似', '知识'],
    customer: '某科技公司', vip: true, product: '开放平台',
    nodeStatus: '待响应', nodeStep: 1, nodeTotal: 5, priority: 'P0',
    slaText: '00:35:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 35,
    assignee: '周工', tab: 'done', handledByMe: false,
    customerPhone: '13500002222', productCategory: '开放平台',
    problemDesc: '鉴权接口批量返回 500，客户线上业务全量调用失败。',
    latestHandling: '已通知平台侧值班，等待网关侧回滚确认。',
    // 当日建单之一（见上方 rk-1…rk-6 段首「当日建单三张」说明）：非投诉 P0 的那一张。
    // 尚未首响、距首响超时 35 分钟，与 75 分钟前建单对得上。
    createdAt: todayStamp(75), updatedAt: todayStamp(60),
    responded: false,
  },
  {
    id: 'rk-4', no: 'IFLYZX-20260806-00004', type: '咨询', channel: '在线客服',
    title: '翻译机在线服务大面积超时', smartMarks: ['升级'],
    customer: '马涛', vip: false, product: '讯飞翻译机 T10',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P0',
    slaText: '已超 03:05', slaSub: '已超时', slaState: 'overdue', slaMinutes: -185,
    assignee: '李坐席', tab: 'done', handledByMe: false,
    customerPhone: '13633334444', sn: 'SN-T10-771203', productCategory: '消费电子',
    problemDesc: '在线翻译连续超时，离线可用；同一小区多名用户反馈相同现象。',
    latestHandling: '已上报在线服务侧排查区域节点，暂无结论。',
    createdAt: '2026-08-06 06:30', updatedAt: '2026-08-06 09:40',
    responded: true, solveBreached: true,
  },
  {
    id: 'rk-5', no: 'IFLYZX-20260806-00005', type: '咨询', channel: '电话',
    title: '录音笔转写文件批量丢失', smartMarks: [],
    customer: '沈杰', vip: false, product: '智能音箱 X1',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '01:25:00', slaSub: '充足', slaState: 'ok', slaMinutes: 85,
    assignee: '陈坐席', tab: 'done', handledByMe: false,
    customerPhone: '13511112222', sn: 'SN-X1-118820', productCategory: '智能硬件',
    problemDesc: '云端转写记录只剩最近三条，历史文件在 APP 内不可见。',
    latestHandling: '已提交后台找回申请，等待数据侧回捞。',
    createdAt: '2026-08-06 08:05', updatedAt: '2026-08-06 09:30',
    responded: true,
  },
  {
    id: 'rk-6', no: 'IFLYZX-20260806-00006', type: '咨询', channel: '小程序',
    title: '智学网家长端消息推送停止', smartMarks: [],
    customer: '芜湖某校', vip: false, customerTags: ['老师'], product: '智学网校级版',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '已超 06:18', slaSub: '已超时', slaState: 'overdue', slaMinutes: -378,
    // 处理人＝二线班组长演示账号（18500003333 王组长）：「风险报备」只给本单主责处理人，班组长要有自己在办的单
    assignee: '王组长', tab: 'done', handledByMe: false,
    customerPhone: '13899990000', productCategory: '教育服务',
    problemDesc: '家长端两天未收到作业与成绩推送，教师端发送显示成功。',
    latestHandling: '已核对推送通道配置，怀疑第三方通道限流，待确认。',
    createdAt: '2026-08-05 14:10', updatedAt: '2026-08-06 08:50',
    responded: true, solveBreached: true,
  },

  // ================================================================
  // 风险监控「重点工单」里**投诉类**那一支的 P1 语料 —— 共 3 张（rk-7 … rk-9）。
  //
  // 【为什么单独补 P1】那一档按工单优先级分 P0 / P1 / P2 / P3 四格，本轮有三张在办投诉单
  // 被打标进池之后，P1 只剩两张，四格成了 P0 3 / **P1 2** / P2 2 / P3 1 —— **P1 比 P0 还少**。
  // 真实的投诉盘子里「重要」一向明显多于「紧急」，倒挂的分布会让人照着一个假形状去排班：
  // 看上去紧急的比重要的还多，最该先动的那一批反而显得没多少。补完为 P0 3 / P1 5 / P2 2 / P3 1。
  //
  // ⚠️ 现值是 **P0 2 / P1 5 / P2 2 / P3 1**：t12（`IFLYTS-20260716-00002`，P0）之后被
  // `stores/riskQueue.ts` 的种子 `rq-s20` 打标进池，从这一档退了出去。倒挂已经修掉、
  // 四格也都不为 0，故不再补单；改这一档时对着这行现值看，别拿上面那句"补完为"当现状。
  //
  // 【为什么不是把打标过的那几张退回来】那几张是「已标记」那一段的样本（等级 / 打标人 /
  // 三态各自的分档全靠它们），退回去等于拆东墙补西墙。两段各要各的量，就各补各的单。
  //
  // 写法与上面 rk-1 … rk-6 同源（`tab: 'done'` + `handledByMe: false` + 无 `groupId`），
  // 故工单工作台的六个页签一条都不多收，只在查询中心与运营监控里可查、可点开。
  // ================================================================
  {
    id: 'rk-7', no: 'IFLYTS-20260806-00007', type: '投诉', channel: '电话',
    title: '学习机以旧换新补贴未到账', smartMarks: ['情绪'],
    customer: '徐岚', vip: false, product: '学习机 T20',
    nodeStatus: '处理中', nodeStep: 3, nodeTotal: 5, priority: 'P1',
    slaText: '已超 08:24', slaSub: '已超时', slaState: 'overdue', slaMinutes: -504,
    assignee: '孙坐席', tab: 'done', handledByMe: false,
    customerPhone: '13677778888', sn: 'SN-T20-903117', productCategory: '学习硬件',
    problemDesc: '以旧换新补贴承诺 15 个工作日到账，已过 28 天仍未收到。',
    latestHandling: '已向渠道核对补贴批次，暂未拿到明确到账时间。',
    createdAt: '2026-08-05 10:20', updatedAt: '2026-08-06 09:15',
    responded: true, solveBreached: true, hasDunning: true,
  },
  {
    id: 'rk-8', no: 'IFLYTS-20260806-00008', type: '投诉', channel: '在线客服',
    title: '翻译机换新后仍有杂音，要求退货', smartMarks: ['情绪'],
    customer: '马涛', vip: false, product: '讯飞翻译机 T10',
    nodeStatus: '待响应', nodeStep: 1, nodeTotal: 5, priority: 'P1',
    slaText: '00:48:00', slaSub: '距超时', slaState: 'soon', slaMinutes: 48,
    assignee: '李坐席', tab: 'done', handledByMe: false,
    customerPhone: '13633334444', sn: 'SN-T10-771203', productCategory: '消费电子',
    problemDesc: '换新机器录音仍有底噪，客户不再接受换货，要求全额退货。',
    latestHandling: '暂无处理记录。',
    // 当日建单之二：投诉 P1、刚进来还没人碰，建单与更新同一刻。
    createdAt: todayStamp(100), updatedAt: todayStamp(100),
    responded: false,
  },
  {
    id: 'rk-9', no: 'IFLYTS-20260806-00009', type: '投诉', channel: '电话',
    title: '上门安装迟到三次，要求赔偿误工费', smartMarks: ['情绪'],
    customer: '郭欣', vip: false, product: '智能音箱 X1',
    nodeStatus: '处理中', nodeStep: 2, nodeTotal: 5, priority: 'P1',
    slaText: '01:36:00', slaSub: '充足', slaState: 'ok', slaMinutes: 96,
    assignee: '王坐席', tab: 'done', handledByMe: false,
    customerPhone: '13744445555', sn: 'SN-X1-330925', productCategory: '智能硬件',
    problemDesc: '三次预约上门均爽约，客户为此三次请假，要求赔偿误工费。',
    latestHandling: '已致歉并改约本周六上午，赔偿口径待班组长确认。',
    // 当日建单之三：投诉 P1、已首响且解决时限仍充足（剩 01:36），与 3 小时前建单对得上。
    createdAt: todayStamp(180), updatedAt: todayStamp(45),
    responded: true,
  },
];

/** 列表速览：问题描述 + 最新处理结果（按工单 id 合并，便于坐席快速扫读） */
const TICKET_BRIEFS: Record<string, { problemDesc: string; latestHandling: string }> = {
  t1: { problemDesc: '在线音乐频繁自动跳过当前歌曲，重启无效', latestHandling: '已远程升级固件并复测，观察中' },
  t2: { problemDesc: '扫地机器人无法开机、指示灯不亮，重启无效', latestHandling: '已指导强制重启与充电检测，疑似主板供电故障' },
  t3: { problemDesc: '企业版功能咨询，需客户补充账号与场景信息', latestHandling: '已挂起，等待客户补充材料后继续' },
  t4: { problemDesc: 'API 调用频繁返回 429 限流，影响集成', latestHandling: '已升级二线，建议提升配额并优化调用频率' },
  t5: { problemDesc: '收到商品与页面描述不符，要求退货', latestHandling: '已核实订单，引导提交退货申请、待审核' },
  t6: { problemDesc: '希望预约工程师上门安装智能门锁', latestHandling: '未认领，尚未安排' },
  t7: { problemDesc: '咨询会员续费优惠的领取方式', latestHandling: '已发送续费优惠领取指引' },
  t8: { problemDesc: '投诉客服响应慢，要求加急处理', latestHandling: '已致歉并标记加急，安排优先跟进' },
  t9: { problemDesc: '空气净化器滤芯指示灯常亮，更换后仍亮', latestHandling: '已指导复位滤芯计数，待客户反馈' },
  t10: { problemDesc: '咨询如何修改已开具发票的抬头', latestHandling: '未认领，尚未安排' },
  t11: { problemDesc: 'Webhook 推送偶发丢包', latestHandling: '已升级二线，建议开启重试与签名校验' },
  t12: { problemDesc: '投诉退款长时间未到账', latestHandling: '已联系财务核查流水，预计 1 个工作日反馈' },
  t13: { problemDesc: '智能音箱无法连接 WiFi', latestHandling: '未认领，尚未安排' },
  t14: { problemDesc: '扫地机器人无法充电', latestHandling: '未认领，尚未安排' },
  t15: { problemDesc: '咨询七天无理由退货政策与流程', latestHandling: '未认领，尚未安排' },
  t16: { problemDesc: '批量导入用户时报错、无法完成', latestHandling: '已收集报错日志，排查模板字段' },
  t17: { problemDesc: '账号出现异地异常登录，担心被盗', latestHandling: '已升级二线安全组，建议改密并开二次验证' },
  t18: { problemDesc: '设备主板故障，已更换待审核', latestHandling: '已更换主板并复测正常，提交结单审核' },
  t19: { problemDesc: '咨询企业微信账号绑定流程', latestHandling: '已答复绑定流程，提交结单审核' },
  t20: { problemDesc: '退款金额存在争议，已与客户确认', latestHandling: '已确认退款金额，提交审核' },
  t21: { problemDesc: '咨询账号注销的流程与影响', latestHandling: '已发送注销流程说明' },
  t22: { problemDesc: '路由器硬件故障无法使用', latestHandling: '已上门更换路由器，客户验收通过' },
  t23: { problemDesc: '投诉物流长时间未送达', latestHandling: '已协调物流加急，已签收' },
  t24: { problemDesc: '商品质量问题申请退货退款', latestHandling: '已完成退货退款' },
  t25: { problemDesc: '预约上门安装智能门锁', latestHandling: '已上门安装完成，功能正常' },
  t27: { problemDesc: '路由器固件升级后无法联网', latestHandling: '已指导回退固件，待客户验证' },
  t28: { problemDesc: '被重复扣费，要求退还', latestHandling: '已确认重复扣费，已发起退款' },
  t32: { problemDesc: '扫地机器人滚刷卡死、异响，需上门维修', latestHandling: '售后已完成关闭，关联售后单 AS-20260716-38025' },
  t33: { problemDesc: '录音笔充电无反应，指示灯不亮，需寄修检测', latestHandling: '已转售后 AS-20260722-38104 · 售后状态：冻结' },
  t29: { problemDesc: '屏幕出现花屏，需返厂检测', latestHandling: '未认领，尚未安排' },
  t30: { problemDesc: '客户 API 鉴权失败，无法调用', latestHandling: '未认领，尚未安排' },
  t31: { problemDesc: '同事 @ 请求协助确认退款政策', latestHandling: '待确认退款政策口径' },
};

/** 新建工单表单字段（列表可选列展示） */
const TICKET_FORM_FIELDS: Record<
  string,
  {
    businessType: string;
    problemL1: string;
    problemL2: string;
    problemL3: string;
    resolveTimeRemark: string;
  }
> = {
  t1: {
    businessType: '翻录',
    problemL1: '功能异常',
    problemL2: '播放问题',
    problemL3: '在线播放',
    resolveTimeRemark: '希望今日内恢复播放',
  },
  t2: {
    businessType: '学习机',
    problemL1: '设备故障',
    problemL2: '无法开机',
    problemL3: '无响应',
    resolveTimeRemark: '明日 12:00 前上门',
  },
  t5: {
    businessType: '学习机',
    problemL1: '功能异常',
    problemL2: '播放问题',
    problemL3: '无法播放',
    resolveTimeRemark: '3 个工作日内退款',
  },
  t6: {
    businessType: '学习机',
    problemL1: '设备故障',
    problemL2: '网络',
    problemL3: 'WiFi 连不上',
    resolveTimeRemark: '预约周六上午上门',
  },
};

/**
 * 路由分组名称（可多选）。**第一个是这张单的处理组**，其余是它命中的路由分组。
 *
 * 🔴 **每一张单都要有**，一张不落。`resolveTicketGroupNames` 在没有 `groupNames` 时
 * 回退到「业务类型 + 工单类型」拼名，而工单库里**只有四张单填了 `businessType`**
 * （见 `TICKET_FORM_FIELDS`），于是绝大多数单拼不出名字、整批落进「未归组」——
 * 风险监控页「班组」那一行 39 条里有 23 条挂在「未归组」下，就是这么来的。
 * 那不是映射规则漏了分支，是**数据缺字段**：一个占了六成的「未归组」既指不出该找哪个组，
 * 也让"按组盯积压"这件事整个落空。故这里逐条补齐，回退分支保持原样不动。
 *
 * 【为什么第一个统一用五个处理组】`resolveTicketGroupNames(t)[0]` 是风险监控页头
 * 「各处理组」与工单列表「分组名称」列取的那一个值，它要回答的是"**这张单归哪个组办**"。
 * 「翻录投诉」这类是**路由分组**（进单时按业务线 + 类型分流用的），不是班组；
 * 两种名字混在同一列里，读的人分不出哪几行是同一个组的活。故：
 *   · 第一个 ＝ 处理组，取 `listQueryFilters.QUERY_GROUP_OPTIONS` 里那五个班组
 *     （受理一组 / 受理二组 / 硬件缺陷组 / 教育支持组 / 技术支持组），与命中记录
 *     （`mock/opsReport.ts` 的 `groupName`）同一套名字，**不新造组**；
 *   · 原有的路由分组名**一个不删**，只是挪到后面 —— 查询中心按组筛用的是
 *     `names.some(...)`（见 `listQueryFilters.ts`），挪位置不影响它筛得到。
 */
const TICKET_GROUP_NAMES: Record<string, string[]> = {
  // ---- 受理一组：消费类咨询与投诉的主力受理组 ----
  t1: ['受理一组', '翻录投诉', '技术支持'],
  t2: ['受理一组', '翻录咨询'],
  t6: ['受理一组'],
  t7: ['受理一组', '智学网咨询', '翻录咨询'],
  t8: ['受理一组', '翻录投诉', '技术支持'],
  t9: ['受理一组'],
  t12: ['受理一组'],
  t13: ['受理一组', '翻录咨询'],
  t15: ['受理一组'],
  t20: ['受理一组'],
  t23: ['受理一组'],
  t25: ['受理一组'],
  t28: ['受理一组'],
  t31: ['受理一组'],
  'as-n1': ['受理一组'],
  'fd-d2': ['受理一组'],
  'fd-d3': ['受理一组'],
  'fd-d8': ['受理一组'],
  'fd-d9': ['受理一组'],
  'fd-d10': ['受理一组'],
  'rk-5': ['受理一组'],
  'rk-9': ['受理一组'],

  // ---- 受理二组：跨组调剂转入、翻译机与账务类 ----
  't-feishu': ['受理二组'],
  t5b: ['受理二组'],
  t10: ['受理二组'],
  t19: ['受理二组'],
  t21: ['受理二组'],
  t24: ['受理二组'],
  t27: ['受理二组'],
  t14: ['受理二组', '翻录投诉'],
  'fd-d4': ['受理二组'],
  'fd-d6': ['受理二组'],
  'fd-d7': ['受理二组'],
  'ops-6': ['受理二组'],
  'rk-4': ['受理二组'],
  'rk-8': ['受理二组'],

  // ---- 硬件缺陷组：返修、部件更换、硬件故障 ----
  t18: ['硬件缺陷组'],
  t22: ['硬件缺陷组'],
  t29: ['硬件缺陷组'],
  t32: ['硬件缺陷组'],
  t33: ['硬件缺陷组'],
  t36: ['硬件缺陷组'],
  t37: ['硬件缺陷组'],
  t38: ['硬件缺陷组'],
  t41:['硬件缺陷组'],
  t42: ['硬件缺陷组'],
  // 1025 客服⇄售后互转：售后发起与关联售后的单
  'as-c1': ['硬件缺陷组'],
  'as-e1': ['硬件缺陷组'],
  'as-e2': ['硬件缺陷组'],
  'as-e3': ['硬件缺陷组'],
  'as-d1': ['硬件缺陷组'],
  'as-d2': ['硬件缺陷组'],
  'as-r1': ['硬件缺陷组'],
  'as-r2': ['硬件缺陷组'],
  'as-r3': ['硬件缺陷组'],
  'as-s1': ['硬件缺陷组'],
  'as-s2': ['硬件缺陷组'],
  'as-u1': ['硬件缺陷组'],
  'as-u2': ['硬件缺陷组'],
  'as-c2': ['硬件缺陷组'],
  'as-l1': ['硬件缺陷组'],
  'as-k1': ['硬件缺陷组'],
  'as-k1n': ['硬件缺陷组'],
  'as-k2': ['硬件缺陷组'],
  'ops-1': ['硬件缺陷组'],
  'ops-4': ['硬件缺陷组'],

  // ---- 教育支持组：学习机 / 智学网 / 校端 ----
  t5: ['教育支持组', '学习机投诉'],
  t5a: ['教育支持组'],
  t40: ['教育支持组'],
  'fd-d5': ['教育支持组'],
  'ops-2': ['教育支持组'],
  'rk-1': ['教育支持组'],
  'rk-2': ['教育支持组'],
  'rk-6': ['教育支持组'],
  'rk-7': ['教育支持组'],

  // ---- 技术支持组：开放平台 / API / 账号安全 ----
  t3: ['技术支持组'],
  t4: ['技术支持组', '翻录商机', '技术支持'],
  t11: ['技术支持组', '学习机投诉', '技术支持'],
  t16: ['技术支持组'],
  t17: ['技术支持组', '学习机咨询', '技术支持'],
  t26: ['技术支持组'],
  t30: ['技术支持组'],
  'ops-3': ['技术支持组'],
  'ops-5': ['技术支持组'],
  'rk-3': ['技术支持组'],
};

/** 产品五级归属（查询中心 BGBU/业务线/产品线筛选 Mock） */
const TICKET_PRODUCT_HIERARCHY: Record<
  string,
  { businessLine?: string; productLine?: string; productBg?: string }
> = {
  't-feishu': { productBg: '消费者BG', businessLine: '智能硬件业务线', productLine: '翻译机产品线' },
  t1: { productBg: '消费者BG', businessLine: '智能硬件业务线', productLine: '录音笔产品线' },
  t2: { productBg: '消费者BG', businessLine: '智能硬件业务线', productLine: '录音笔产品线' },
  t5: { productBg: '教育事业群', businessLine: '学习机业务线', productLine: '课堂产品线' },
  t6: { productBg: '教育事业群', businessLine: '学习机业务线', productLine: '课堂产品线' },
  t7: { productBg: '教育事业群', businessLine: '智学网业务线', productLine: '课堂产品线' },
};

/** 查询中心列表扩展字段 Mock */
const TICKET_LIST_EXTRAS: Record<
  string,
  Partial<import('@/views/tickets/types/ticket').Ticket>
> = {
  't-feishu': {
    synced: true,
    feishuSync: 'synced',
    lastHandler: '王坐席',
    lastHandlerGroup: '受理一组',
    upgradeCount: 1,
    appointmentAt: '2026-07-14 15:00',
    riskWeight: 62,
    supplementPendingCount: 0,
    supplementDoneCount: 1,
  },
  t1: {
    synced: true,
    feishuSync: 'feedback',
    lastHandler: '王坐席',
    lastHandlerGroup: '受理一组',
    upgradeCount: 2,
    riskWeight: 88,
    supplementPendingCount: 0,
    supplementDoneCount: 0,
  },
  t2: {
    synced: false,
    feishuSync: 'none',
    lastHandler: '李大海',
    lastHandlerGroup: '受理二组',
    upgradeCount: 0,
    riskWeight: 95,
    supplementPendingCount: 1,
    supplementDoneCount: 0,
  },
  t5: {
    synced: false,
    feishuSync: 'failed',
    lastHandler: '王坐席',
    lastHandlerGroup: '教育支持组',
    upgradeCount: 1,
    appointmentAt: '2026-06-12 10:00',
    riskWeight: 74,
    supplementPendingCount: 2,
    supplementDoneCount: 1,
  },
  'fd-d4': {
    prevFlowNode: '技术支持',
  },
  'fd-d5': {
    prevFlowNode: '工单处理',
  },
};

function defaultListExtras(t: Ticket): Partial<Ticket> {
  const upgradeCount = (t.escalatedFromNo || t.upgradedByMe ? 1 : 0) + (t.escalatedToNo ? 1 : 0);
  const supplementPendingCount = t.hasSupplement && !t.supplementContacted ? 1 : 0;
  const supplementDoneCount = t.hasSupplement && t.supplementContacted ? 1 : 0;
  const riskWeight =
    t.priority === 'P0' ? 90 : t.priority === 'P1' ? 70 : t.priority === 'P2' ? 45 : 25;
  return {
    feishuSync: 'none',
    synced: false,
    lastHandler: t.assignee ?? undefined,
    lastHandlerGroup: resolveTicketGroupNames(t)[0],
    upgradeCount,
    supplementPendingCount,
    supplementDoneCount,
    riskWeight,
  };
}

/** 从单号 {类型前缀}-YYYYMMDD-序号 推断建单时间（mock 缺字段时补全） */
function inferCreatedAtFromNo(no: string): string {
  const m = no.match(/^IFLY[A-Z]{2}-(\d{4})(\d{2})(\d{2})-/i);
  if (!m) return '2026-06-10 09:00';
  return `${m[1]}-${m[2]}-${m[3]} 09:00`;
}

function ensureTicketTimestamps(t: Ticket): Pick<Ticket, 'createdAt' | 'updatedAt'> {
  const createdAt = t.createdAt ?? inferCreatedAtFromNo(t.no);
  const updatedAt = t.updatedAt ?? createdAt;
  return { createdAt, updatedAt };
}

// 教育刷机单样本（930）并入同一个工单库：列表 / 处理页 / 查询中心读同一份，刷机服务 `stores/flash.ts` 写回这里
export const TICKETS: Ticket[] = [...BASE_TICKETS, ...FLASH_SEEDS.tickets].map((t) => {
  const row = {
    ...defaultListExtras(t),
    ...t,
    ...(TICKET_BRIEFS[t.id] ?? {}),
    ...(TICKET_FORM_FIELDS[t.id] ?? {}),
    ...(TICKET_GROUP_NAMES[t.id] ? { groupNames: TICKET_GROUP_NAMES[t.id] } : {}),
    ...(TICKET_PRODUCT_HIERARCHY[t.id] ?? {}),
    ...(TICKET_LIST_EXTRAS[t.id] ?? {}),
    // 显式写了来源的（售后转入 / 跨组调剂）保留原值，只有没写的才按渠道推。
    // 之前这里无条件覆盖，把「售后转入」冲成了「热线电话」——看板「转入」下钻筛不出单、
    // 升级投诉门禁①与转售后的激活分支也都判不出来
    ticketSource: t.ticketSource ?? mapChannelToSource(t.channel),
  } as Ticket;
  return { ...row, ...ensureTicketTimestamps(row) };
});
