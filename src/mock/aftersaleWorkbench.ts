/** 售后工作台 Mock（对齐 .pen ktlxs / PRD-06） */

export type AftersaleTabKey = 'outlet' | 'tech' | 'quality' | 'service' | 'exception';

export interface AftersaleTab {
  key: AftersaleTabKey;
  label: string;
}

export const AFTERSALE_TABS: AftersaleTab[] = [
  { key: 'outlet', label: '网点工单' },
  { key: 'tech', label: '技术支持' },
  { key: 'quality', label: '品质管理' },
  { key: 'service', label: '服务质量' },
  { key: 'exception', label: '异常工单' },
];

export interface AftersaleKpi {
  key: string;
  label: string;
  value: number;
  delta: string;
  iconColor: string;
  iconBg: string;
}

export const AFTERSALE_KPIS: AftersaleKpi[] = [
  { key: 'pending', label: '待接单', value: 43, delta: '较昨日 +5', iconColor: '#1A6FFF', iconBg: '#1A6FFF1A' },
  { key: 'pickup', label: '待取件', value: 12, delta: '较昨日 +2', iconColor: '#06B6D4', iconBg: '#06B6D41A' },
  { key: 'visit', label: '待上门', value: 18, delta: '较昨日 -3', iconColor: '#10B981', iconBg: '#10B9811A' },
  { key: 'overdue', label: '已超时', value: 3, delta: '较昨日 +1', iconColor: '#EF4444', iconBg: '#EF44441A' },
  { key: 'warn', label: '已预警', value: 8, delta: '较昨日 持平', iconColor: '#F59E0B', iconBg: '#F59E0B1A' },
  { key: 'close', label: '待结单', value: 15, delta: '较昨日 -4', iconColor: '#A855F7', iconBg: '#A855F71A' },
  { key: 'done', label: '今日结单', value: 32, delta: '较昨日 +6', iconColor: '#10B981', iconBg: '#10B9811A' },
];

export interface AftersaleOrder {
  id: string;
  no: string;
  customer: string;
  phone: string;
  serviceType: string;
  product: string;
  address: string;
  status: string;
  statusColor: string;
  statusBg: string;
  createdAt: string;
  tab: AftersaleTabKey;
}

export const AFTERSALE_ORDERS: AftersaleOrder[] = [
  {
    id: '1', no: 'SH2026050011001', customer: '客户1', phone: '138****1001',
    serviceType: '退货', product: '智能空调1号', address: '合肥市蜀山区示例路1号',
    status: '待取件', statusColor: '#F59E0B', statusBg: '#F59E0B22',
    createdAt: '2025-05-01 10:20', tab: 'outlet',
  },
  {
    id: '2', no: 'SH2026050021002', customer: '客户2', phone: '138****1002',
    serviceType: '维修', product: '智能空调2号', address: '合肥市蜀山区示例路2号',
    status: '待上门', statusColor: '#1A6FFF', statusBg: '#1A6FFF22',
    createdAt: '2025-05-02 10:21', tab: 'outlet',
  },
  {
    id: '3', no: 'SH2026050031003', customer: '客户3', phone: '138****1003',
    serviceType: '退货', product: '智能空调3号', address: '合肥市蜀山区示例路3号',
    status: '待结单', statusColor: '#F59E0B', statusBg: '#F59E0B22',
    createdAt: '2025-05-03 10:22', tab: 'outlet',
  },
  {
    id: '4', no: 'SH2026050041004', customer: '客户4', phone: '138****1004',
    serviceType: '维修', product: '智能空调4号', address: '合肥市蜀山区示例路4号',
    status: '已结单', statusColor: '#10B981', statusBg: '#10B98122',
    createdAt: '2025-05-04 10:23', tab: 'outlet',
  },
  {
    id: '5', no: 'SH2026050051005', customer: '客户5', phone: '138****1005',
    serviceType: '退货', product: '智能空调5号', address: '合肥市蜀山区示例路5号',
    status: '待接单', statusColor: '#1A6FFF', statusBg: '#1A6FFF22',
    createdAt: '2025-05-05 10:24', tab: 'outlet',
  },
  {
    id: '6', no: 'SH2026050061006', customer: '客户6', phone: '138****1006',
    serviceType: '维修', product: '智能空调6号', address: '合肥市蜀山区示例路6号',
    status: '待取件', statusColor: '#F59E0B', statusBg: '#F59E0B22',
    createdAt: '2025-05-06 10:25', tab: 'outlet',
  },
  {
    id: '7', no: 'SH2026050071007', customer: '客户7', phone: '138****1007',
    serviceType: '安装', product: '智能门锁 L1', address: '合肥市包河区示例路7号',
    status: '待上门', statusColor: '#1A6FFF', statusBg: '#1A6FFF22',
    createdAt: '2025-05-07 09:10', tab: 'tech',
  },
  {
    id: '8', no: 'SH2026050081008', customer: '客户8', phone: '138****1008',
    serviceType: '维修', product: '扫地机器人 R2', address: '合肥市庐阳区示例路8号',
    status: '已超时', statusColor: '#EF4444', statusBg: '#EF444422',
    createdAt: '2025-05-08 14:30', tab: 'exception',
  },
  {
    id: '9', no: 'SH2026050091009', customer: '客户9', phone: '138****1009',
    serviceType: '换货', product: '智能冰箱 F3', address: '合肥市瑶海区示例路9号',
    status: '待结单', statusColor: '#F59E0B', statusBg: '#F59E0B22',
    createdAt: '2025-05-09 11:00', tab: 'quality',
  },
  {
    id: '10', no: 'SH2026050101010', customer: '客户10', phone: '138****1010',
    serviceType: '维修', product: '智能洗衣机 W5', address: '合肥市经开区示例路10号',
    status: '已结单', statusColor: '#10B981', statusBg: '#10B98122',
    createdAt: '2025-05-10 16:45', tab: 'service',
  },
];
