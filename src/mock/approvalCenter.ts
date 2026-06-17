// 审批中心 Mock（对齐 A8-tenant-admin.html#approval）

export type ApprovalStatus = '待审批' | '已批准' | '已驳回';
export type RiskLevel = '高' | '中' | '低';

export interface ApprovalItem {
  id: number;
  code: string;
  typeName: string;
  applicant: string;
  time: string;
  changeType: string;
  risk: RiskLevel;
  status: ApprovalStatus;
}

export const APPROVAL_FILTERS = ['全部', '待审批', '已批准', '已驳回'] as const;

export const APPROVAL_STATS = {
  approvedThisMonth: 12,
  approvalRate: '83.3%',
  avgDuration: '2.5h',
};

export const APPROVALS: ApprovalItem[] = [
  { id: 1, code: 'APR-2026-001', typeName: '退费工单V2.0发布', applicant: '王运营', time: '2026-04-21 09:30', changeType: '流程变更', risk: '高', status: '待审批' },
  { id: 2, code: 'APR-2026-002', typeName: '咨询工单字段调整', applicant: '李运营', time: '2026-04-20 16:20', changeType: '实体定义变更', risk: '中', status: '待审批' },
  { id: 3, code: 'APR-2026-003', typeName: '投诉工单新增节点', applicant: '赵运营', time: '2026-04-20 14:10', changeType: '流程变更', risk: '中', status: '待审批' },
  { id: 4, code: 'APR-2026-004', typeName: '技术故障工单文案修改', applicant: '李运营', time: '2026-04-19 11:00', changeType: '界面调整', risk: '低', status: '已批准' },
  { id: 5, code: 'APR-2026-005', typeName: '售后工单SLA调整', applicant: '王运营', time: '2026-04-18 15:30', changeType: 'SLA变更', risk: '高', status: '已驳回' },
];
