/**
 * 工单处理页**全部页签**的时间点展示口径：一律 `YYYY-MM-DD HH:mm:ss`，一列靠右。
 *
 * 【只管时间点，不管时长】SLA 的倒计时 / 剩余时长（`slaClock.ts`、`OpSlaBar.vue`、
 * 「解决：超 01:12」）与「已等待 2 小时 13 分钟」这类读数是**时长**，不走本文件。
 *
 * 🔴 **秒位可能是补出来的，不要当真**。本仓的时刻取值精度不齐：
 *   · 联系记录 / 通知记录 / 附件那几路带秒 —— `'2026-06-17 15:08:22'`，原样输出；
 *   · 工单库与部分页签样本只到分钟 —— `'2026-06-10 07:45'`，本函数补 `':00'`。
 * 补秒是为了**让一列的宽度一致**（不补的那几行会短 3 个字符，时刻就排不成一列）。
 * 源数据本来就没有秒，补出来的 `:00` 不代表"整分发生"，别拿它做任何判断。
 *
 * 【为什么还要认「今天 / 昨天」】页签的时刻来自两处：预置样本里写死了
 * `'今天 10:05'`（`mock/ticketDetail.ts`、`mock/ticketOperationTabs.ts` 等），
 * 运行态回写又由 `opActions.nowWhen()` 现生成同一种写法。用户已拍板相对时间
 * 全换绝对时间，而改掉上游两处的代价远大于在展示口这一道认掉它 ——
 * 故本函数把「今天 / 昨天」按**系统当前日期**换算成绝对日期（与原页面同一个「今天」）。
 *
 * ⚠️ 不动排序 / 筛选 / 分组的判据：那些仍拿原始取值去比，本函数只负责**呈现**。
 */

/** 分隔符后缺位的补零 */
function p2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** 空值占位：一列里留出同样的格，不塌行 */
const EMPTY = '—';

/**
 * 认得出的四种写法：
 *   ① `YYYY-MM-DD HH:mm:ss`（含 `T` 分隔）→ 原样
 *   ② `YYYY-MM-DD HH:mm`               → 补 `:00`
 *   ③ `MM-DD HH:mm[:ss]`（样本里省了年）→ 补当前年份 + 缺位的秒
 *   ④ `今天 / 昨天 HH:mm[:ss]`          → 换算成绝对日期 + 缺位的秒
 * 认不出来的（纯日期 `YYYY-MM-DD`、已是占位符 `—` / `-`、自由文案）**原样返回，不臆造**。
 */
export function formatOpTime(raw?: string | null): string {
  const s = raw?.trim();
  if (!s) return EMPTY;

  // ① / ② 带年的完整写法
  const abs = s.match(/^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (abs) return `${abs[1]}-${abs[2]}-${abs[3]} ${abs[4]}:${abs[5]}:${abs[6] ?? '00'}`;

  // ④ 相对日：今天 / 昨天
  const rel = s.match(/^(今天|昨天)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (rel) {
    const d = new Date();
    if (rel[1] === '昨天') d.setDate(d.getDate() - 1);
    return `${ymdOf(d)} ${p2(Number(rel[2]))}:${rel[3]}:${rel[4] ?? '00'}`;
  }

  // ③ 省了年份的写法
  const noYear = s.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (noYear) {
    return `${new Date().getFullYear()}-${noYear[1]}-${noYear[2]} ${noYear[3]}:${noYear[4]}:${noYear[5] ?? '00'}`;
  }

  return s;
}

/** 运行态回写时刻（新建履历 / 标记已知晓等）：与展示口径同一种写法 */
export function opTimeNow(now = new Date()): string {
  return `${ymdOf(now)} ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
}
