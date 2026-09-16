import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { TICKET_DETAIL, TIMELINE, productHasAfterSaleService } from '@/mock/ticketDetail';
import type { TicketDetailMeta, ChildTicket, SlaClock } from '@/mock/ticketDetail';
import type { TimelineEntry } from '@/views/tickets/types/ticketDetail';
import type { TicketFlash } from '@/views/tickets/types/flash';
import {
  isFirstResponded, isSlaPaused, isTicketClosed, resolveStoppedClockStatus,
} from '@/views/tickets/types/ticket';
import { useFlashStore } from '@/stores/flash';
import { findSchoolById } from '@/mock/schools';
import type { Ticket, Channel, TicketType, Priority } from '@/views/tickets/types/ticket';
import { TICKETS } from '@/mock/tickets';
import { TYPE_SAMPLES } from '@/mock/ticketTypeSamples';
import { useUserStore } from '@/stores/user';
import { useDerivedTicketStore } from '@/stores/derivedTickets';
import {
  ticketLatestHandlingItems,
  ticketProductIssue,
} from '@/views/tickets/utils/ticketOverview';
import { isSlaVoidStop } from '@/views/tickets/utils/ticketListCells';
import {
  inferComplaintChannelSource,
  normalizeComplaintType,
  resolveTicketSourceForList,
} from '@/views/tickets/types/createTicket';
import {
  applyOpAction, mapUserRole, nowWhen, pushEntry,
  type OpActionPayload, type SuspendInfo, type TicketOpState,
} from './opActions';

// ---- 列表行 SLA 摘要 → 操作页时钟（保证工作台 ↔ 操作页状态一致，PRD §8.1/§8.2）----

/** 解析 'HH:MM:SS' / 'HH:MM' 为秒；解析失败返回 null */
function parseHms(text: string): number | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
}

/** 列表摘要剩余秒（'已超 HH:MM' → 负值；'已暂停'/'—' → null） */
function summaryRemainSec(t: Ticket): number | null {
  if (t.slaText.startsWith('已超')) {
    const s = parseHms(t.slaText.replace('已超', ''));
    return s == null ? null : -s;
  }
  return parseHms(t.slaText);
}

/** 按剩余秒 + 列表状态调校 total/warn，使表盘视觉态（正常/临期/超时）与列表一致 */
function tuneClock(c: SlaClock, rem: number, state: Ticket['slaState']): void {
  c.remainSec = rem;
  if (state === 'soon') {
    c.warnSec = Math.max(rem + 60, 900);
    c.totalSec = Math.max(rem * 3, 3600);
  } else if (state === 'overdue') {
    c.warnSec = 900;
    c.totalSec = Math.max(-rem * 2, 3600);
  } else {
    c.warnSec = Math.max(300, Math.min(1800, Math.floor(rem / 4)));
    c.totalSec = Math.max(rem * 2, 3600);
  }
}

/** 绝对时刻文案（今日 HH:MM / M/D HH:MM） */
function whenAt(ms: number): string {
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? `今日 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/** 由起算时刻 + 总时限推算绝对截止文案（固定承诺截止点） */
function dueByFromStart(startMs: number, totalSec: number): string {
  return whenAt(startMs + totalSec * 1000);
}

/**
 * 由列表行 SLA 字段构建操作页双钟：
 * 已首响 → 摘要即解决钟、首响钟达标停表；未首响 → 摘要即首响钟（最急）、解决钟走独立字段；
 * 挂起 → 解决钟冻结；终态 → 双钟停表。
 */
function buildSlaClocks(t: Ticket): SlaClock[] {
  const responded = isFirstResponded(t);
  const solve: SlaClock = {
    label: '整单解决', kind: 'whole', phase: 'running',
    remainSec: 4 * 3600, totalSec: 8 * 3600, warnSec: 1800, dueBy: '',
  };
  const first: SlaClock = {
    label: '整单首响', kind: 'first', phase: 'running',
    remainSec: 12 * 60, totalSec: 1800, warnSec: 900, dueBy: '',
  };
  const summary = summaryRemainSec(t);

  // 首响终态：达标（绿）或超时后才响的未达标（红）
  const stopFirst = (wholeStart: number) => {
    first.phase = 'stopped';
    first.stopOutcome = t.firstRespBreached ? 'breached' : 'met';
    first.remainSec = t.firstRespBreached ? -300 : 300;
    first.closedAt = whenAt(wholeStart + (first.totalSec - first.remainSec) * 1000);
  };

  if (t.slaText === '—') {
    // 终态：双钟停表，按结果亮色（达标绿 / 未达标红 / 中止深灰）
    // 🔴 中止（升级派生、转出待回传、取消）**不是达标** —— 钟被掐断，本单从未被解决。
    //    判据取列表那一份 `isSlaVoidStop`，否则同一张单会在列表说「已停表」、在本页说「已达标」。
    solve.phase = 'stopped';
    solve.stopOutcome = t.solveBreached ? 'breached' : isSlaVoidStop(t) ? 'void' : 'met';
    if (t.solveBreached) solve.remainSec = -1800;
  } else if (isSlaPaused(t)) {
    // 挂起 / 自动刷机中 / 线下登记待批推（930 D18 / M31）：在走的钟冻结（剩余保留、可恢复续算）
    solve.phase = 'paused';
    solve.remainSec = 2 * 3600;
    solve.totalSec = 8 * 3600;
    if (!responded) {
      first.phase = 'paused'; // 挂起且未首响：首响钟同样冻结
      first.remainSec = 10 * 60;
    }
  } else if (responded) {
    // 已首响：扁平摘要即解决钟
    if (summary != null) tuneClock(solve, summary, t.slaState);
  } else {
    // 未首响：扁平摘要即首响钟（最急钟）；解决钟走独立字段
    if (summary != null) tuneClock(first, summary, t.slaState);
    const rs = t.resolveSlaText ? parseHms(t.resolveSlaText) : null;
    if (rs != null) tuneClock(solve, rs, t.resolveSlaState ?? 'ok');
  }
  const wholeStart = Date.now() - (solve.totalSec - solve.remainSec) * 1000;
  if (responded || t.slaText === '—') stopFirst(wholeStart);
  if (solve.phase === 'stopped') {
    solve.closedAt = whenAt(wholeStart + (solve.totalSec - solve.remainSec) * 1000);
  }
  solve.dueBy = dueByFromStart(wholeStart, solve.totalSec);
  first.dueBy = dueByFromStart(wholeStart, first.totalSec);
  return [solve, first];
}

export function useTicketOperation() {
  const user = useUserStore();
  const route = useRoute();
  const derivedTickets = useDerivedTicketStore();
  const flash = useFlashStore();
  const detail = ref<TicketDetailMeta>(JSON.parse(JSON.stringify(TICKET_DETAIL)));
  const timeline = ref<TimelineEntry[]>([...TIMELINE]);
  const opState = ref<TicketOpState>('processing');
  const suspendInfo = ref<SuspendInfo | null>(null);

  /** 按列表点击的工单号解析对应工单，覆盖样例 detail 的头部与类型，
   *  使处理页（Tab① 表单结构）随工单类型而变。匹配不到则回退样例。 */
  function loadDetail(no: string) {
    const base = JSON.parse(JSON.stringify(TICKET_DETAIL)) as TicketDetailMeta;
    // 静态数据源优先；查不到再问运行时派生的那批（风险评估判「升级」派生出的新投诉单）。
    // 两处不互相覆盖：派生单只补静态那批没有的号。
    const found = TICKETS.find((x) => x.no === no) ?? derivedTickets.find(no);
    /*
     * **本次会话里被升级派生走的原单**：把升级台账那一笔叠回工单对象上。
     *
     * 【为什么要叠】评估判「升级」会造出一张新投诉单，可原单那一头此前一个字都没写回去 ——
     * 打开原单仍是「处理中」、可编辑、没有接管横幅，而同一页「评估结果」区块写着
     * 「原单落『已升级投诉』」。一页之内两种说法，且实际状态是错的那一种。
     *
     * 【为什么叠在这里而不是改 TICKETS】`TICKETS` 是静态样本，改它会把样本改脏且刷新即回滚。
     * 叠成一个**本地副本**之后，下面 `t.escalatedToNo` 那一支（830 的既有链路）
     * 原封不动就把状态、关联位、接管横幅、整页只读全部走完，本函数不必再写一行状态逻辑。
     *
     * 🔴 **同时把 SLA 摘要按停表写**：升级投诉是终态，钟要停（与 `mock/tickets.ts` 里
     * 那张预置的已升级单同一副写法）。只改状态不停钟，页头会出现「已升级投诉 + 剩 3 小时」。
     */
    const runtimeEscalatedNo = found && !found.escalatedToNo
      ? derivedTickets.escalatedToNoOf(found.no)
      : undefined;
    const t: Ticket | undefined = runtimeEscalatedNo && found
      ? {
        ...found,
        escalatedToNo: runtimeEscalatedNo,
        slaText: '—',
        slaSub: '已升级投诉·停表',
        slaState: 'ok',
      }
      : found;
    // 回退样例是**静默的**：页面照常渲染演示单，只有地址栏还留着那个查不到的号，
    // 于是"多行点开是同一张单"这种配错很难被发现。开发态先把它喊出来。
    // 不做用户可见提示：班组看板 / 运营监控 / 客户视图的下钻明细目前也有大量非真实单号，
    // 弹提示会在那些页面刷屏 —— 要报错得先把那几份 mock 一起对齐真单。
    if (!t && import.meta.env.DEV) {
      console.warn(`[useTicketOperation] 工单号 ${no} 不在工单数据源中，已回退演示单`);
    }
    if (t) {
      base.no = t.no;
      base.title = t.title;
      base.type = t.type;
      base.channel = t.channel;
      base.priority = t.priority;
      base.lastHandler = t.assignee;
      base.groupId = t.groupId;
      base.groupNames = t.groupNames;
      base.customer.name = t.customer;
      base.product.name = t.product;
      // 产品有无售后服务 → 「转售后」置灰 + 提示（基线 ※12）。按产品名判，不再恒为 true
      base.product.afterSaleEnabled = productHasAfterSaleService(t.product);
      base.productBg = t.productBg;
      // 非样例工单：不继承 TICKET_DETAIL 的投诉台账/外投标记（否则任意单都会显示 12315 等样例字段）
      if (t.no !== TICKET_DETAIL.no) {
        base.complaint = {
          categories: [],
          complaintType: '',
          platforms: [],
          receivedAt: '',
          priorFeedback: '',
          serviceReview: '',
        };
        base.isExternalAppeal = false;
        if (t.productCategory) base.product.category = t.productCategory;
        if (t.sn) base.product.sn = t.sn;
      }
      // 工单来源：与列表同一解析口径（优先 ticketSource，缺省由接入渠道反推）
      base.source = resolveTicketSourceForList(t);
      base.isExternalAppeal = base.source === '外投渠道';
      // 结案方式随列表行带入：底栏动作集按它收窄（直接结案＝不下送、不升级、不挂起、不转派）
      base.closureMode = t.closureMode;
      // 列表未带来源但已有外投/内投平台台账 → 反推来源，避免补充弹窗缺「平台/编号」区
      const inferredSource = inferComplaintChannelSource(
        base.source,
        base.complaint.platforms,
        base.isExternalAppeal,
      );
      if (inferredSource) {
        base.source = inferredSource;
        if (inferredSource === '外投渠道') base.isExternalAppeal = true;
      }
      if (t.complaintType) base.complaint.complaintType = normalizeComplaintType(t.complaintType);
      // D3 外投演示单：投诉渠道记录 + 分类与 PRD 附录一致，便于验「补充投诉信息」全字段
      if (t.no === 'IFLYTS-20260817-00001') {
        base.complaint.categories = [
          { cat1: '服务与运营问题', cat2: '服务质量' },
        ];
        base.complaint.platforms = [
          {
            platform: '黑猫消费者服务平台',
            complaintNo: 'HM20260817001',
            complaintContent: '客户在黑猫投诉售后承诺未兑现，要求今日内书面回复',
          },
          {
            platform: '市场监管12315平台',
            complaintNo: 'AH12315-20260817088',
            complaintContent: '同步向 12315 提交产品质量投诉，要求书面答复',
          },
          {
            platform: '全国消协智慧315平台',
            complaintNo: '',
            complaintContent: '消协平台已登记，暂未下发编号',
          },
        ];
      }
      base.escalatedFromNo = t.escalatedFromNo; // 升级派生单：回溯「升级自」来源
      // 依据基线 §1：升级目标已进状态（已升级技术支持 / 已升级产研），
      // 「在不在三线手上」（决定「退回」出不出）直接读状态，不再另带 escalateTarget 字段
      /*
       * 关联关系**按列表行重建，不继承样例工单**。
       * 之前直接沿用 TICKET_DETAIL 的 childTickets/linkedRecords，导致随便点开一张单
       * 都显示「关联 3」——而关联位是 1:1，一张单最多一个父单 + 一个子单。
       */
      base.childTickets = [];
      base.linkedRecords = [];
      base.linkedAftersale = undefined;
      /*
       * 停表单（列表 SLA 摘要为「—」）：详情状态要同步成**终态子状态**，
       * 否则处理页仍显示「处理中」，补充/催单的承接分流（§5.2）判不出来。
       *
       * ⚠️ 这里**不能一律写「已关闭」**。「已关闭」在基线 §1 里是一个具体子状态
       * ——关闭工单审批通过，只对做过「关闭工单」的单成立；强结的单是「已强结」、
       * 跑完流程正常收口的是「已结案」。按动作标记反推，见 resolveStoppedClockStatus。
       */
      if (t.slaText === '—' && !t.escalatedToNo) {
        base.status = isTicketClosed(t.nodeStatus)
          ? t.nodeStatus
          : resolveStoppedClockStatus(t);
        opState.value = 'closed';
      }
      // 因升级投诉而关闭：状态置「已升级投诉」+ 只留指向新单的关联 → 处理页整页只读 + 接管横幅
      if (t.escalatedToNo) {
        base.childTickets = [];
        base.linkedRecords = [{
          no: t.escalatedToNo,
          // 前缀按**这一跳落的是哪一态**写，与下面那行状态同一条判据：
          // 第一跳（非投诉 → 投诉）派生的是内投单，硬写「外投·」会让关联卡上出现
          // 「已升级为 … 外投·xxx」而状态栏写着「已升级投诉」，一屏两说
          title: `${t.ticketSource === '外投渠道' ? '外投' : '投诉'}·${t.title}`,
          tag: '升级投诉',
          meta: `${(t.updatedAt ?? '').slice(5, 10)} ${t.assignee ?? ''} 升级`,
        }];
        base.linkedAftersale = undefined;
        // 依据基线 §1「一跳一态」：原单是外投单则是第二跳（已升级外投），否则是第一跳
        base.status = t.ticketSource === '外投渠道' ? '已升级外投' : '已升级投诉';
        opState.value = 'closed';
      }
      base.feishuSync = 'none';
      base.feishuRecords = [];
      base.productIssue = ticketProductIssue(t);
      base.slaClocks = buildSlaClocks(t); // 时钟与列表行 SLA 摘要一致
      if (t.nodeStatus === '自动刷机中') {
        // 刷机单推送后等待回传（930 M9）：冻结语义同「已转出」—— 底栏只留保存、联系客户
        base.status = '自动刷机中';
        opState.value = 'transferred';
      } else if (t.slaState === 'paused') {
        base.status = '已挂起';
        opState.value = 'suspended';
      } else {
        opState.value = 'processing';
      }
      suspendInfo.value = null;
      // 已转出：非诉转售后后原单不关闭，留在「我的任务」等售后终态回传（D11）
      if (t.linkedAftersaleNo && t.tab !== 'done') {
        base.linkedAftersale = {
          no: t.linkedAftersaleNo,
          status: '处理中',
          serviceType: '寄修检测',
          serviceMethod: '寄修',
          createdAt: t.updatedAt ?? t.createdAt ?? '',
          fromComplaint: t.type === '投诉',
        };
        base.status = '已转出';
        opState.value = 'transferred';
      }
      // 售后转入：关联位仍指向来源售后单，但本单正常在跑，不进「已转出」
      if (t.aftersaleOriginNo) {
        base.linkedAftersale = {
          no: t.aftersaleOriginNo,
          title: t.aftersaleOriginTitle,
          status: t.aftersaleOriginStatus ?? '已转回客服',
          serviceType: '寄修检测',
          serviceMethod: '寄修',
          createdAt: t.createdAt ?? '',
          fromComplaint: t.type === '投诉',
        };
      }
      if (t.flash) applyFlashRow(base, t);
      if (t.problemDesc?.trim()) {
        base.demand = t.problemDesc.trim();
      }
      base.latestHandling = ticketLatestHandlingItems(t);
    }
    // 按类型覆盖概要（无工单级文案时回退类型样例）
    const sample = TYPE_SAMPLES[base.type]?.detail;
    if (!t?.problemDesc?.trim() && sample?.demand) base.demand = sample.demand;
    if (sample?.insight) base.insight = sample.insight;
    if (sample?.aiInsight) base.aiInsight = sample.aiInsight;
    if (t?.flash) applyFlashOverview(base, t);
    detail.value = base;
    if (t?.flash) projectFlashTimeline(t.no, true);
  }

  /**
   * 刷机单的页头 / 速览带 / 侧栏取值与刷机种子单自洽（X5 / X7）：建单人取刷机履历的建单操作人，
   * 建单时间取工单行，客户与产品取工单行与刷机信息，「最新处理」取刷机履历，不沿用投诉样例的台账。
   */
  function applyFlashOverview(base: TicketDetailMeta, t: Ticket) {
    const f = t.flash!;
    // 用户提报单页头建单人显示「用户提报」（M85 / X22）；坐席代建显示建单坐席
    const creatorName = f.state.creator === '用户提报' ? '用户提报' : (flash.creatorNameOf(t.no) ?? '—');
    const createdAt = t.createdAt ?? '';
    base.builder = creatorName;
    base.builderShort = creatorName;
    base.createdAt = createdAt;
    base.createdAtFull = createdAt;
    base.issueOccurredAt = createdAt;
    base.expectedResolve = '—';
    base.businessType = t.businessType ?? '教育';
    base.businessLine = '教育业务线';
    base.attachments = [];
    base.product.name = f.info.productModel;
    base.product.sn = f.info.sn;
    base.product.tags = [];
    base.product.issueTags = ['刷机申请', f.info.reason];
    const phone = (t.customerPhone ?? '').replace(/^(\d{3})(\d{4})(\d{4})$/, '$1 $2 $3');
    base.customer = {
      name: t.customer,
      types: ['G个人用户'],
      gender: '—',
      contacts: phone ? [{ type: 'phone', value: phone }] : [],
      region: findSchoolById(f.info.schoolId)?.region ?? '—',
      address: '—',
    };
    base.agent = null;
    // 客户全景下钻：本客户名下只有这一张刷机单
    const selfRow = { cells: [t.no, '刷机', createdAt, t.nodeStatus, t.nodeStatus], ticketNo: t.no };
    base.insightDetails = {
      contact: { ...base.insightDetails.contact, rows: [] },
      history: { ...base.insightDetails.history, rows: [selfRow] },
      complaint: { ...base.insightDetails.complaint, rows: [] },
      recent30: { ...base.insightDetails.recent30, rows: [selfRow] },
    };
    const similar = TICKETS.find((x) => x.type === '刷机' && x.no !== t.no && x.nodeStatus === '已结案');
    base.similarTicket = similar
      ? { no: similar.no, title: similar.title, similarity: '相似 90%·已解决', solution: '方案：自动刷机接收成功，回访确认已解决' }
      : base.similarTicket;
    base.knowledge = ['教育刷机单处理指引', '刷机包接收失败排查（未开机 / 未联网 / 版本不符）'];
    base.aiSummary = `学生${f.info.studentName}（${f.info.schoolName}）申请刷机，刷机原因：${f.info.reason}；设备 ${f.info.productModel}，SN ${f.info.sn}。`;
    base.aiInsight = {
      customerBrief: '教育用户，首次提报刷机申请',
      ticketBrief: f.state.handoffReason
        ? `${f.info.reason}刷机申请，转人工原因：${f.state.handoffReason}`
        : `${f.info.reason}刷机申请，按自动刷机结果跟进`,
      suggestion: '核对刷机信息与失败原因后处理',
    };
    base.latestHandling = flashLatestHandling(t.no);
  }

  /** 「最新处理」：刷机履历里最近的处理事件（不含短信），新在上，最多 3 条 */
  function flashLatestHandling(no: string): TicketDetailMeta['latestHandling'] {
    return flash.timelineOf(no)
      .filter((e) => e.category !== 'comm')
      .slice(-3)
      .reverse()
      .map((e) => ({ who: e.who, role: e.role, action: e.how, when: e.when.slice(5, 16), text: e.what }));
  }

  /**
   * 刷机单：把工单库那一行的状态 / 处理人 / 刷机字段组同步到详情（930 教育刷机单）。
   * 状态直接取子状态；轻量态按冻结语义映射：自动刷机中 / 已转出 → transferred，调研中 → resolved。
   */
  function applyFlashRow(base: TicketDetailMeta, t: Ticket) {
    base.lastHandler = t.assignee;
    base.groupId = t.groupId;
    base.groupNames = t.groupNames;
    base.flash = JSON.parse(JSON.stringify(t.flash)) as TicketFlash;
    // 已升级派生走了的单：终态与只读态由 `t.escalatedToNo` 那一支判定（见上）。
    // 工单行的子状态还停在在办态时**不能拿它覆写回去** —— 那正是「已升级投诉」被写回
    // 「待响应」、底栏跟着放出来的由来；已写到终态的照常同步。
    if (t.escalatedToNo) {
      if (isTicketClosed(t.nodeStatus)) {
        base.status = t.nodeStatus;
        opState.value = 'closed';
      }
      return;
    }
    base.status = t.nodeStatus;
    if (t.nodeStatus === '自动刷机中' || t.nodeStatus === '已转出') opState.value = 'transferred';
    else if (t.nodeStatus === '调研中') opState.value = 'resolved';
    // 审核中三态 / 已挂起（通用动作经刷机服务同步回工单库后，M4b-2）
    else if (['申请挂起中', '申请关闭中', '申请强结中'].includes(t.nodeStatus)) opState.value = 'review';
    else if (t.nodeStatus === '已挂起') opState.value = 'suspended';
    else if (isTicketClosed(t.nodeStatus)) opState.value = 'closed';
    else opState.value = 'processing';
  }

  /**
   * 刷机链路履历投影进本页时间线（记录源 `stores/flash.ts`）。按条目 id 幂等：
   * 首次打开刷机单时以刷机履历为准（不沿用其他类型的样例履历），之后只追加新条目。
   */
  function projectFlashTimeline(no: string, reset = false) {
    // 操作人为「系统」的刷机事件卡片头显示系统头像（PRD §11.2）
    // 用户提报单的建单事件操作人显示「提报用户 · 〈姓名〉」（M85 / X22）；记录源里仍存姓名，建单人判定不受影响
    const byUser = TICKETS.find((x) => x.no === no)?.flash?.state.creator === '用户提报';
    const entries = flash.timelineOf(no).map((e) => {
      if (e.role === '系统') return { ...e, systemActor: true };
      if (byUser && e.action === 'create') return { ...e, who: `提报用户 · ${e.who}` };
      return { ...e };
    });
    if (reset) {
      timeline.value = entries;
      return;
    }
    const seen = new Set(timeline.value.map((e) => e.id));
    entries.forEach((e) => { if (!seen.has(e.id)) timeline.value.push(e); });
  }

  watch(
    () => route.params.ticketNo as string,
    (no) => { if (no) loadDetail(no); },
    { immediate: true },
  );

  // 刷机服务写回工单库后（回传结果、转人工、重推），本页同步状态与履历，不整页重载
  watch(
    () => flash.revisionOf(detail.value.no),
    () => {
      const t = TICKETS.find((x) => x.no === detail.value.no);
      if (!t?.flash) return;
      applyFlashRow(detail.value, t);
      detail.value.slaClocks = buildSlaClocks(t);
      detail.value.latestHandling = flashLatestHandling(t.no);
      projectFlashTimeline(t.no);
    },
  );
  const draftSavedAt = ref<string | null>(null);

  function dispatch(raw: Record<string, unknown>) {
    const payload = raw as OpActionPayload;
    const operator = user.name;
    const role = mapUserRole(user.roleKey);

    if (payload.type === '保存草稿') {
      const now = new Date();
      draftSavedAt.value = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
      // 保存并登记：若已填写处理内容，追加一条「处理登记」进处理履历
      if (payload.process?.summary) {
        pushEntry(timeline.value, {
          category: 'handle', action: 'handle', who: operator, role,
          how: '工单处理', what: payload.process.summary,
          attachment: payload.process.attachment,
          changes: payload.process.changes,
        });
        message.success('已保存并登记处理进展');
      } else {
        message.success('已保存，可稍后继续处理');
      }
      return;
    }

    const result = applyOpAction(
      detail.value, timeline.value, opState.value, suspendInfo.value,
      payload, operator, role,
    );
    opState.value = result.opState;
    suspendInfo.value = result.suspendInfo;
    message.success(result.message);
  }

  function confirmWithdraw() {
    Modal.confirm({
      title: '撤回操作',
      content: '将撤回上一流转操作，工单回到上一处理节点。确定撤回？',
      okText: '确认撤回',
      cancelText: '取消',
      onOk: () => dispatch({ type: '撤回' }),
    });
  }

  function addChildTicket(ticket: Ticket) {
    const operator = user.name;
    const role = mapUserRole(user.roleKey);
    const now = new Date();
    const child: ChildTicket = {
      no: ticket.no,
      title: ticket.title,
      time: `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${operator}`,
      typeTag: '子单',
      statusTag: '未认领',
      typeColor: '#A855F7',
      statusColor: '#1A6FFF',
    };
    detail.value.childTickets.unshift(child);
    pushEntry(timeline.value, {
      category: 'node',
      action: 'create',
      who: operator,
      role,
      how: '创建子单',
      what: `创建子工单 ${ticket.no}「${ticket.title}」，关联主单 ${detail.value.no}。`,
    });
  }

  /**
   * 升级投诉：把升级生成的新投诉单登记为关联单 + 写「关联单」履历（PRD §4.3/§5.1）。
   * 原单的关闭与状态流转走 dispatch({ type: '升级投诉' })。
   */
  function addEscalatedComplaint(ticket: Ticket, target: string, note: string) {
    const operator = user.name;
    const role = mapUserRole(user.roleKey);
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    detail.value.linkedRecords.unshift({
      no: ticket.no,
      title: ticket.title,
      tag: '升级投诉',
      meta: `${month}-${day} ${operator} 升级为${target}`,
    });
    pushEntry(timeline.value, {
      category: 'relate',
      action: 'relate',
      who: operator,
      role,
      how: '升级投诉',
      what: `原单升级为${target}，已生成新投诉单并双向关联。升级原因：${note}`,
      relatedTicket: {
        no: ticket.no,
        title: ticket.title,
        type: '投诉',
        typeColor: '#EF4444',
        status: '未认领',
        statusColor: '#1A6FFF',
        builder: operator,
        createdAt: nowWhen(),
      },
    });
  }

  function addReopenTicket(ticket: Ticket) {
    const operator = user.name;
    const role = mapUserRole(user.roleKey);
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    detail.value.linkedRecords.unshift({
      no: ticket.no,
      title: ticket.title,
      tag: 'Reopen',
      meta: `${month}-${day} ${operator} reopen`,
    });
    pushEntry(timeline.value, {
      category: 'node',
      action: 'create',
      who: operator,
      role,
      how: '重新建单',
      what: `Reopen 创建工单 ${ticket.no}「${ticket.title}」，关联原单 ${detail.value.no}。`,
    });
  }

  return {
    detail, timeline, opState, suspendInfo, draftSavedAt,
    dispatch, confirmWithdraw, addChildTicket, addReopenTicket, addEscalatedComplaint,
  };
}
