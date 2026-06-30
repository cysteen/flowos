// 管理后台 UI 规范的代码载体（见 docs/admin-ui-spec.md）。
// 统一分页、状态色、操作反馈，供所有后台页面复用。

/** 标准分页配置：数据列表统一使用；短的配置/枚举表显式 :pagination="false"。 */
export function stdPagination(extra: Record<string, unknown> = {}) {
  return {
    pageSize: 10,
    size: 'default' as const,
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50'],
    showTotal: (t: number) => `共 ${t} 条`,
    ...extra,
  };
}

/** 状态文案 → ant tag color 的统一映射（避免各页手写散色）。 */
export const STATUS_TONE: Record<string, string> = {
  // 绿：正向/生效/完成
  正常: 'green', 启用: 'green', 已发布: 'green', 在职: 'green', 活跃: 'green',
  成功: 'green', 已通过: 'green', 已批准: 'green', 已结案: 'green', 已完成: 'green', 在线: 'green',
  // 橙：进行中/待办/过渡
  草稿: 'orange', 待审核: 'orange', 待审批: 'orange', 待回访: 'orange', 试用: 'orange',
  小休: 'orange', 处理中: 'orange', 审批中: 'orange',
  // 蓝：信息/运行
  运行中: 'blue', 已挂起: 'orange',
  // 灰：停用/中性
  停用: 'default', 已停用: 'default', 离线: 'default', 已撤回: 'default', 已终止: 'default',
  // 红：异常/拒绝/锁定
  锁定: 'red', 失败: 'red', 已驳回: 'red', 异常: 'red', 已逾期: 'red',
};
export const toneOf = (status: string): string => STATUS_TONE[status] ?? 'default';

/**
 * SLA 运行态「处理时效」6 态配色规范（全系统统一：列表/工作台/班组看板/操作页复用）。
 * 配色铁律：红只给 P0 与 SLA 超时；临期橙、注意黄、充裕绿、暂停/无约束灰。
 * 详见 docs/admin-ui-spec.md 与《SLA交互改版设计-终版框线图》§4。
 */
export type SlaTimelinessState = 'none' | 'ample' | 'notice' | 'soon' | 'overdue' | 'paused';

export const SLA_TIMELINESS: Record<SlaTimelinessState, { color: string; dot: string; label: string }> = {
  none: { color: '#9ca3af', dot: '—', label: '无约束' },
  ample: { color: '#10b981', dot: '●', label: '充裕' },
  notice: { color: '#f59e0b', dot: '●', label: '注意' },
  soon: { color: '#f97316', dot: '●', label: '临期' },
  overdue: { color: '#ef4444', dot: '●', label: '超时' },
  paused: { color: '#9ca3af', dot: '⏸', label: '已暂停' },
};

/** 按剩余百分比定 6 态之一（overdue/paused 需调用方按运行态另判）。 */
export function slaStateByRemainPct(remainPct: number): SlaTimelinessState {
  if (remainPct <= 0) return 'overdue';
  if (remainPct <= 25) return 'soon';
  if (remainPct <= 50) return 'notice';
  return 'ample';
}

/** 排序权重：已超时最前，剩余越少越前（配合「已超时 > 距超时升序」固定口径）。 */
export const SLA_STATE_SORT: Record<SlaTimelinessState, number> = {
  overdue: 0, soon: 1, notice: 2, ample: 3, paused: 4, none: 5,
};
