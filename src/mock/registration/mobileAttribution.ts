/** 演示用手机号归属：对齐种子工单号段；正式环境应接运营商号段库或接口。 */
export interface MobileAttribution {
  operator: string;
  province: string;
}

const SEGMENT7: Record<string, MobileAttribution> = {
  '1385798': { operator: '移动', province: '江苏省' },
  '1391234': { operator: '电信', province: '安徽省' },
  '1378888': { operator: '移动', province: '安徽省' },
  '1360000': { operator: '移动', province: '广东省' },
  '1356677': { operator: '移动', province: '陕西省' },
  '1340000': { operator: '电信', province: '安徽省' },
  '1339988': { operator: '联通', province: '江苏省' },
  '1321122': { operator: '移动', province: '浙江省' },
};

const MOBILE_PREFIXES: Record<string, readonly string[]> = {
  移动: ['134', '135', '136', '137', '138', '139', '147', '150', '151', '152', '157', '158', '159', '172', '178', '182', '183', '184', '187', '188', '195', '198'],
  联通: ['130', '131', '132', '155', '156', '166', '171', '175', '176', '185', '186', '196'],
  电信: ['133', '149', '153', '173', '177', '180', '181', '189', '190', '191', '199'],
};

const PROVINCE_FALLBACK = [
  '北京市', '上海市', '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省',
  '河南省', '湖北省', '湖南省', '广东省', '四川省', '陕西省',
] as const;

function detectOperator(digits: string): string {
  const p3 = digits.slice(0, 3);
  const p4 = digits.slice(0, 4);
  for (const [op, list] of Object.entries(MOBILE_PREFIXES)) {
    if (list.some((prefix) => p3 === prefix || p4.startsWith(prefix))) return op;
  }
  return '其他';
}

function detectProvinceFallback(digits: string): string {
  const tail = Number(digits.slice(3, 7)) || 0;
  return PROVINCE_FALLBACK[tail % PROVINCE_FALLBACK.length];
}

/** 11 位大陆手机号；不足或非法返回 null */
export function lookupMobileAttribution(phone: string): MobileAttribution | null {
  const digits = phone.replace(/\D/g, '');
  if (!/^1\d{10}$/.test(digits)) return null;
  const seg7 = digits.slice(0, 7);
  const exact = SEGMENT7[seg7];
  if (exact) return { ...exact };
  return { operator: detectOperator(digits), province: detectProvinceFallback(digits) };
}
