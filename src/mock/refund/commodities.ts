/**
 * 智学网「获取订单可退套餐」的原型数据（1120 个册退费单 · PRD 附录 A.1）。
 *
 * 金额为**可退金额**：产线按已交付次数计算后返回（一·补 补9），坐席与校园经理都不手填。
 * `plan` 只给原型推算产线结果用：第 N 次提交取 `plan[N-1]`，缺省「退费成功」。
 */
import type { RefundSubject, RefundTaskStatus } from '@/views/tickets/types/refund';

export interface RefundOrder {
  payOrderId: string;
  /** 购买时间 */
  purchasedAt: string;
  commodities: {
    commodityId: string;
    commodityName: string;
    subjects: { subjectCode: string; subjectName: string; amount: number }[];
  }[];
  plan?: RefundTaskStatus[];
  /** 已驳回时产线返回的驳回原因 */
  rejectReason?: string;
  /** 创建退费时产线拒绝受理的原因 */
  createError?: string;
}

const ORDERS_BY_STUDENT: Record<string, RefundOrder[]> = {
  // 合肥一中 · 林子涵
  '47429': [{
    payOrderId: 'PO20260301007701',
    purchasedAt: '2026-03-01 10:12:36',
    commodities: [{
      commodityId: 'CM-26S-G1-01',
      commodityName: '2026春季个性化学习手册（高一）',
      subjects: [
        { subjectCode: '02', subjectName: '数学', amount: 128.0 },
        { subjectCode: '05', subjectName: '物理', amount: 96.0 },
        { subjectCode: '06', subjectName: '化学', amount: 96.0 },
      ],
    }],
  }],
  // 合肥市五十中学 · 周雨桐：首次提交被驳回
  '52016': [{
    payOrderId: 'PO20260305012288',
    purchasedAt: '2026-03-05 19:40:02',
    commodities: [{
      commodityId: 'CM-26S-G2-03',
      commodityName: '2026春季个性化学习手册（高二）',
      subjects: [
        { subjectCode: '03', subjectName: '英语', amount: 112.5 },
        { subjectCode: '02', subjectName: '数学', amount: 112.5 },
      ],
    }],
    plan: ['已驳回', '退费成功'],
    rejectReason: '退费学科与已交付记录不符，请核对后重新提交',
  }, {
    payOrderId: 'PO20260212003310',
    purchasedAt: '2026-02-12 08:05:51',
    commodities: [{
      commodityId: 'CM-26W-G2-01',
      commodityName: '2026寒假个性化学习手册（高二）',
      subjects: [{ subjectCode: '01', subjectName: '语文', amount: 45.0 }],
    }],
  }],
  // 六安一中 · 陈思远：部分完成
  '61873': [{
    payOrderId: 'PO20260308020615',
    purchasedAt: '2026-03-08 21:15:09',
    commodities: [{
      commodityId: 'CM-26S-G3-02',
      commodityName: '2026春季个性化学习手册（高三）',
      subjects: [
        { subjectCode: '02', subjectName: '数学', amount: 150.0 },
        { subjectCode: '07', subjectName: '生物', amount: 88.0 },
      ],
    }],
    plan: ['部分完成'],
  }],
  // 合肥七中 · 何宇航
  '58731': [{
    payOrderId: 'PO20260310021044',
    purchasedAt: '2026-03-10 18:26:40',
    commodities: [{
      commodityId: 'CM-26S-G1-01',
      commodityName: '2026春季个性化学习手册（高一）',
      subjects: [
        { subjectCode: '02', subjectName: '数学', amount: 128.0 },
        { subjectCode: '03', subjectName: '英语', amount: 128.0 },
        { subjectCode: '05', subjectName: '物理', amount: 96.0 },
      ],
    }],
  }],
  // 合肥八中 · 王可欣
  '38820': [{
    payOrderId: 'PO20260302009947',
    purchasedAt: '2026-03-02 12:30:44',
    commodities: [{
      commodityId: 'CM-26S-G1-01',
      commodityName: '2026春季个性化学习手册（高一）',
      subjects: [
        { subjectCode: '02', subjectName: '数学', amount: 128.0 },
        { subjectCode: '03', subjectName: '英语', amount: 128.0 },
      ],
    }],
  }],
  // 芜湖一中 · 赵一鸣
  '70125': [{
    payOrderId: 'PO20260306015530',
    purchasedAt: '2026-03-06 17:22:18',
    commodities: [{
      commodityId: 'CM-26S-G2-03',
      commodityName: '2026春季个性化学习手册（高二）',
      subjects: [{ subjectCode: '05', subjectName: '物理', amount: 104.0 }],
    }],
  }],
  // 蚌埠二中 · 孙嘉怡：创建退费时产线拒绝受理
  '45507': [{
    payOrderId: 'PO20260304011186',
    purchasedAt: '2026-03-04 09:48:27',
    commodities: [{
      commodityId: 'CM-26S-G1-01',
      commodityName: '2026春季个性化学习手册（高一）',
      subjects: [{ subjectCode: '06', subjectName: '化学', amount: 96.0 }],
    }],
    createError: '订单申请总金额超过可退金额（已抵扣金额-已退金额）',
  }],
  // 合肥一六八中学 · 刘若溪
  '56342': [{
    payOrderId: 'PO20260303010452',
    purchasedAt: '2026-03-03 20:01:13',
    commodities: [{
      commodityId: 'CM-26S-G3-02',
      commodityName: '2026春季个性化学习手册（高三）',
      subjects: [
        { subjectCode: '01', subjectName: '语文', amount: 132.0 },
        { subjectCode: '03', subjectName: '英语', amount: 132.0 },
      ],
    }],
  }],
};

/** 查询接口不可用的智学号（原型用于演示查询失败） */
const UNAVAILABLE_CODES = new Set(['99999']);

export type RefundCommodityQuery =
  | { ok: true; orders: RefundOrder[] }
  | { ok: false };

/** 获取可退套餐：学校 ID ＋ 智学号必传，订单号选传 */
export function queryRefundCommodities(_schoolId: string, studentCode: string, payOrderId?: string): RefundCommodityQuery {
  const code = studentCode.trim();
  if (UNAVAILABLE_CODES.has(code)) return { ok: false };
  const orders = ORDERS_BY_STUDENT[code] ?? [];
  return { ok: true, orders: payOrderId ? orders.filter((o) => o.payOrderId === payOrderId.trim()) : orders };
}

/** 按订单号取订单（不限学生，H5 按本单订单号查） */
export function findRefundOrder(payOrderId: string): RefundOrder | undefined {
  const key = payOrderId.trim();
  for (const list of Object.values(ORDERS_BY_STUDENT)) {
    const hit = list.find((o) => o.payOrderId === key);
    if (hit) return hit;
  }
  return undefined;
}

/** 订单 → 逐学科可退行 */
export function orderSubjects(o: RefundOrder): RefundSubject[] {
  return o.commodities.flatMap((c) => c.subjects.map((s) => ({
    commodityId: c.commodityId,
    commodityName: c.commodityName,
    payOrderId: o.payOrderId,
    subjectCode: s.subjectCode,
    subjectName: s.subjectName,
    amount: s.amount,
  })));
}
