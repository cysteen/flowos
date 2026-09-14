import { isVerifyMonitorSource, type RiskPoolItem } from '@/stores/riskShared';
import type { RiskHit } from '@/mock/opsReport';

/**
 * 风险评估弹窗第一区块（`RiskAssessSheet.vue`）与风险监控页共用的三个纯函数：
 * 命中原话取窗 `excerptWindow`、实时监控来源判断 `isKeywordRow`、报备附件下载 `downloadReportAttachment`。
 * 风险监控页的命中清单 / 打标弹窗 / 同单其它命中与评估弹窗读的是同一份，改一处即全改。
 */

// ---- 命中原文片段：取窗与高亮 ----
// 【为什么要取窗】`excerpt` 存的是**命中字段的全文**——手动筛查那条路径尤其明显，
// 一整段沟通记录原样进来。整段直出有两个后果：表格行被撑爆，且复核的人得在一大段里
// 自己找命中词在哪，而他点开这一行要看的恰恰就是那一句。
//
// 【为什么截在渲染层而不截数据层】数据层留全文，截过的原文是收不回来的：
// 悬停看全文、将来的"展开原文"都要靠它。取窗是纯函数、无副作用，重算的代价远小于丢原文。
//
// 【为什么锚在 matchedWord 而不是 word】`word` 是规则主词，实际命中的可能是它的同义词，
// 主词根本不在原文里（「曝光」命中的是「媒体」）——拿主词去定位一无所获，还会走进兜底分支。
/** 命中词前后各取的字数：两侧合计 80 字上下，够读出一句话的语气，又不至于撑爆表格行 */
const EXCERPT_CONTEXT = 40;
/** 命中词在原文里找不到时的兜底长度：只取开头，不假装知道命中在哪 */
const EXCERPT_FALLBACK = 80;

export interface ExcerptWindow {
  /** 命中词之前的上文 */
  before: string;
  /** 命中词本身。兜底分支为空串，此时整段不高亮 */
  hit: string;
  /** 命中词之后的下文 */
  after: string;
  /**
   * 该侧被截断了没有。**只有被截的一侧才加省略号**——
   * 两侧一律加的话，人会以为一句完整的短句前后还有没显示出来的内容。
   */
  headTruncated: boolean;
  tailTruncated: boolean;
}

/**
 * 取窗结果按「命中词 + 全文」缓存。
 * 模板里 before / hit / after / 两个截断标记各读一次，一行就是五次调用；
 * 缓存让这五次拿到同一个对象，也免得同一份文本被反复切五遍。
 */
const excerptWindowCache = new Map<string, ExcerptWindow>();

/** 以命中词为中心切一段可读的上下文，供命中清单、打标弹窗与评估弹窗共用（一份口径） */
export function excerptWindow(h: Pick<RiskHit, 'excerpt' | 'matchedWord'>): ExcerptWindow {
  const text = h.excerpt ?? '';
  const term = h.matchedWord ?? '';
  const key = `${term}\u0000${text}`;
  const cached = excerptWindowCache.get(key);
  if (cached) return cached;
  // 命中词出现多次时以**第一次**为中心：客户把话说重是从第一次开始的，
  // 后几次是重复，从第一次起读才读得出这句话是怎么起来的。
  const at = term ? text.indexOf(term) : -1;
  let win: ExcerptWindow;
  if (at < 0) {
    // 兜底：matchedWord 与原文对不上（两者不同源，数据可能不一致）。
    // 此时不猜位置、不报错、更不留空白——照直给开头一段，人至少还看得到原文。
    win = {
      before: text.slice(0, EXCERPT_FALLBACK),
      hit: '',
      after: '',
      headTruncated: false,
      tailTruncated: text.length > EXCERPT_FALLBACK,
    };
  } else {
    // 原文不足窗口长度就取到头/尾为止，不补白：省略号只表示"这一侧还有没显示的内容"
    const start = Math.max(0, at - EXCERPT_CONTEXT);
    const end = Math.min(text.length, at + term.length + EXCERPT_CONTEXT);
    win = {
      before: text.slice(start, at),
      hit: text.slice(at, at + term.length),
      after: text.slice(at + term.length, end),
      headTruncated: start > 0,
      tailTruncated: end < text.length,
    };
  }
  excerptWindowCache.set(key, win);
  return win;
}

/**
 * 这一行是不是**预警词命中**捞进来的（来源＝实时监控）。
 * 用处只剩一个：把命中原话摆出来（另两类来源没有原话可摆）。
 * 🔴 **它已经不再决定这一行下一步做什么** —— 三类来源都要打标才进池，见风险监控页 `needsVerify`。
 */
export function isKeywordRow(r: { source: RiskPoolItem['source'] }): boolean {
  return isVerifyMonitorSource(r.source);
}

/** 报备附件的下载：附件名为占位，点击触发浏览器下载一个同名文件 */
export function downloadReportAttachment(name: string): void {
  const blob = new Blob([`${name}\n`], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
