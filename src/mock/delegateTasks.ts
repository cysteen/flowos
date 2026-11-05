/** 委派子任务种子：到人、到组、已完成各一批。写口见 `stores/delegateTasks.ts` */

export type DelegateTaskStatus = '待处理' | '已完成' | '已撤销';

export interface DelegateTask {
  id: string;
  ticketNo: string;
  /** 同一次委派的子任务同一批次 */
  batchId: string;
  batchAt: string;
  /** 委派人（工单主责） */
  operator: string;
  mode: 'person' | 'group';
  /** 协助办理人；委派到组且未指定时为 null，由组内认领 */
  assignee: string | null;
  groupId?: string;
  groupName?: string;
  task: string;
  status: DelegateTaskStatus;
  result?: string;
  finishedAt?: string;
}

export const DELEGATE_TASK_SEEDS: DelegateTask[] = [
  // 到人：投诉单 · 已委派，两名协办人待处理
  {
    id: 'dt-s1', ticketNo: 'IFLYTS-20260923-00063', batchId: 'batch-s1', batchAt: '2026-09-23 15:20:36', operator: '张三',
    mode: 'person', assignee: '王组长', task: '核对上门维修记录与客户描述是否一致', status: '待处理',
  },
  {
    id: 'dt-s2', ticketNo: 'IFLYTS-20260923-00063', batchId: 'batch-s1', batchAt: '2026-09-23 15:20:36', operator: '张三',
    mode: 'person', assignee: '林坐席', task: '确认备件库存与到货时间', status: '待处理',
  },
  // 到组：咨询单 · 已委派，一条待组内认领，一条已指定组内处理人
  {
    id: 'dt-s3', ticketNo: 'IFLYZX-20260817-00006', batchId: 'batch-s2', batchAt: '2026-08-17 08:20:49', operator: '张三',
    mode: 'group', assignee: null, groupId: 'hardware', groupName: '硬件缺陷组', task: '核对物流签收记录', status: '待处理',
  },
  {
    id: 'dt-s4', ticketNo: 'IFLYZX-20260817-00006', batchId: 'batch-s2', batchAt: '2026-08-17 08:20:49', operator: '张三',
    mode: 'group', assignee: '徐璐', groupId: 'general', groupName: '综合处理组', task: '确认客户收货地址是否变更', status: '待处理',
  },
  // 已完成：已结案的单，协办人可查看委派处理结果
  {
    id: 'dt-s5', ticketNo: 'IFLYZX-20260817-00007', batchId: 'batch-s3', batchAt: '2026-08-12 10:05:18', operator: '张三',
    mode: 'person', assignee: '王组长', task: '协助核实耳机配对步骤', status: '已完成',
    result: '已电话指导客户完成配对，功能正常。', finishedAt: '2026-08-12 16:42:07',
  },
];
