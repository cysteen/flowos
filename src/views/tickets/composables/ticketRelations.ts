import type { TicketDetailMeta } from '@/mock/ticketDetail';
import { aftersaleDeepLink } from './opActions';
import { isTicketTerminated } from './complaintEscalation';

/**
 * 工单关联关系聚合 —— 把散在 linkedRecords / childTickets / linkedAftersale / followingNo
 * 里的派生关系收成一份**带类型与方向**的清单，供头部芯片、右栏卡片、接管横幅共用。
 *
 * 业界口径（0801 调研）：
 * - **Jira**：链接必须 typed 且有方向（duplicates / is duplicated by），不能笼统"关联"；
 * - **Freshdesk**：父子 / 关联单是右侧「附加信息」面板的常驻可折叠 widget，不藏二级 Tab；
 * - **Zendesk**：被合并取代的单**关闭并冻结字段**、只在评论里留指向新单的链接——
 *   即"被接管的旧单锁死"，而不是靠提示劝阻坐席。本文件的 supersede 判定即据此。
 */

/** 关系类型（决定图标与方向文案） */
export type RelationKind =
  /** 本单升级派生出的新投诉/外投单（本单是来源） */
  | 'escalatedTo'
  /** 本单由某单升级而来（本单是结果） */
  | 'escalatedFrom'
  /**
   * 本单**已转单为**该新单：原单关闭、新单继续跑（基线 ※16），原单落已转咨询 / 已转建议 / 已转商机。
   * 与 `child`（承接子单）是两回事 —— 那个是原单进终态后客户又来补充时建的承接单（※23），
   * 原单本来就已经收口；这个是"业务整体交给新单"，原单**因此**才收口。
   */
  | 'transferredTo'
  /** 关联售后单（平行跑，外部系统） */
  | 'aftersale'
  /** 终态原单被催补时派生的承接子单（关系类型「转单子单」，※23） */
  | 'child'
  /** Reopen 承接单 */
  | 'reopen'
  /** 本单从属跟跑于某主导单 */
  | 'following';

export interface TicketRelation {
  kind: RelationKind;
  /** 方向文案，如「已升级为」「升级自」 */
  label: string;
  /** 方向图标（纯文本，避免额外图标依赖） */
  arrow: string;
  no: string;
  title?: string;
  status?: string;
  /** 外部系统单（售后）→ 走深链，不站内打开 */
  href?: string;
}

const META: Record<RelationKind, { label: string; arrow: string }> = {
  escalatedTo: { label: '已升级为', arrow: '↓' },
  escalatedFrom: { label: '升级自', arrow: '↑' },
  transferredTo: { label: '已转单为', arrow: '↳' },
  aftersale: { label: '关联售后', arrow: '⇄' },
  child: { label: '转单子单', arrow: '⊕' },
  reopen: { label: 'Reopen', arrow: '↻' },
  following: { label: '跟随主导单', arrow: '⇢' },
};

function rel(kind: RelationKind, no: string, extra: Partial<TicketRelation> = {}): TicketRelation {
  return { kind, ...META[kind], no, ...extra };
}

/**
 * 聚合本单的关联关系。
 *
 * **关联位是 1:1**（PRD §4.2.1 门禁④）——一张单最多**一个父单 + 一个子单**：
 * - 父：`escalatedFromNo`（升级自）或 `followingNo`（跟随主导单），取先命中的一个；
 * - 子：升级派生单 / 关联售后单 / 转单子单 / Reopen 承接单，取先命中的一个。
 * 出现多条只可能是脏数据，这里按优先级截断，不把"关联 3"这种不可能的数字露给坐席。
 */
export function buildTicketRelations(detail: TicketDetailMeta): TicketRelation[] {
  const parent = resolveParent(detail);
  const child = resolveChild(detail);
  return [parent, child].filter((r): r is TicketRelation => !!r);
}

/** 父方向：本单从哪来（最多一个） */
function resolveParent(detail: TicketDetailMeta): TicketRelation | null {
  if (detail.escalatedFromNo) return rel('escalatedFrom', detail.escalatedFromNo);
  if (detail.followingNo) return rel('following', detail.followingNo);
  return null;
}

/** 子方向：本单派生出什么（最多一个，升级 > 转单 > 售后 > 承接子单 > Reopen） */
function resolveChild(detail: TicketDetailMeta): TicketRelation | null {
  const escalated = (detail.linkedRecords ?? []).find((r) => r.tag === '升级投诉');
  if (escalated) return rel('escalatedTo', escalated.no, { title: escalated.title });
  // 转单：与升级投诉同属"原单关闭、新单接管"，优先级紧随其后
  const transferred = (detail.linkedRecords ?? []).find((r) => r.tag === '转单');
  if (transferred) return rel('transferredTo', transferred.no, { title: transferred.title });
  if (detail.linkedAftersale) {
    return rel('aftersale', detail.linkedAftersale.no, {
      title: detail.linkedAftersale.serviceType,
      status: detail.linkedAftersale.status,
      href: aftersaleDeepLink(detail.linkedAftersale.no),
    });
  }
  const child = (detail.childTickets ?? [])[0];
  if (child) return rel('child', child.no, { title: child.title, status: child.statusTag });
  const reopen = (detail.linkedRecords ?? []).find((r) => r.tag === 'Reopen');
  if (reopen) return rel('reopen', reopen.no, { title: reopen.title });
  return null;
}

/**
 * 「被接管」判定：本单已因**升级或转单**而关闭，业务已转到新单上。
 *
 * 此时整页**锁为只读**（Zendesk 合并同款）——不是提示坐席别在这儿操作，而是让他操作不了，
 * 否则催单 / 补充 / 再投诉都可能落在这张已经作废的旧单上。
 *
 * 🆕 **转单也算接管**（基线 ※16：转单＝原单关闭、新单跑，原单进真终态「已转咨询 / 已转建议 / 已转商机」）。
 * 之前只认「升级投诉」派生的新单，而转单被实现成"建子单、原单状态不变"、根本走不到这儿；
 * 转单改回基线口径后，两条来路的收口方式完全相同，都是"原单只读 + 前往新单"。
 *
 * 注意与「正常关闭」区分：正常关闭的单没有派生新单，客户再来诉求走
 * 「基于原单建新单承接」（※23 承接子单，同 Zendesk follow-up ticket）。
 */
const SUPERSEDING_KINDS: RelationKind[] = ['escalatedTo', 'transferredTo'];

export function resolveSupersededBy(detail: TicketDetailMeta): TicketRelation | null {
  if (!isTicketTerminated(detail.status)) return null;
  return buildTicketRelations(detail).find((r) => SUPERSEDING_KINDS.includes(r.kind)) ?? null;
}
