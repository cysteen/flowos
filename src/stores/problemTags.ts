import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { POOL_GROUPS } from '@/views/tickets/types/ticket';
import { productTitleByKey } from '@/mock/productTree';
import { FLASH_MODEL_SEED } from '@/mock/flash/models';
import { flashTagKey, useFlashConfigStore } from './flashConfig';
import { refundTagKey, useRefundConfigStore } from './refundConfig';

/**
 * 问题分类（720 §3 / 1120 §1–§3 / 1215 3.4、6.5、14.6）：问题分类的唯一数据源。
 *
 * 一条＝产品 ＋ 一 / 二 / 三级 ＋ 处理组（用户分组 id，空＝未配置）＋ 专属类型 ＋ 状态 ＋ 老系统 ID ＋ 更新人 / 时间。
 * 【写】只有后台「问题分类」页（`views/admin/ProblemTagManageView.vue`）调写方法；
 * 【读】建单级联（`treeForCreate`）、查询筛选（`unionTree`）、派单入池条件 / 画像（`dispatchTree`、`pathsOfGroups`）、
 * 入池规则迁移（`migrationRules`）一律只读引用。
 * 【联动】「专属类型＝刷机 / 个册退费」的行整体写回 `flashConfig` / `refundConfig`（store 建立即同步一次，此后随行变化）。
 * 【持久化】`flowos-problem-tags` 一个键，带版本号 `PROBLEM_TAGS_CACHE_VERSION`；改种子必须升版本号。
 */

const LS_KEY = 'flowos-problem-tags';
/** 种子版本闸：改种子行必须加一 */
export const PROBLEM_TAGS_CACHE_VERSION = 2;

/** 专属类型：一条问题分类至多一种专属用途，「无」＝普通分类 */
export type ProblemExclusive = '无' | '售后' | '小结' | '刷机' | '个册退费';
export type ProblemTagStatus = '启用' | '停用';

export interface ProblemTagRow {
  key: string;
  productKey: string;
  productName: string;
  tagL1: string;
  tagL2: string;
  tagL3: string;
  /** 处理组：用户分组 id；空串＝未配置（以该分类建单时走流程兜底组） */
  team: string;
  /**
   * 专属类型：售后＝只能新建售后工单；小结＝只供容联云小结使用，新建工单不可选；
   * 刷机（1013 N2 / 10-19 C1）＝本产品选本分类建单即识别为刷机单；个册退费（1120）＝本产品选本分类建单即识别为个册退费单
   */
  exclusive: ProblemExclusive;
  status: ProblemTagStatus;
  /** 问题分类一 / 二 / 三级 ID（老系统数字串；同产品同路径前缀共用同一 ID） */
  tagL1Id: string;
  tagL2Id: string;
  tagL3Id: string;
  /** 更新人 / 更新时间：任何写操作后刷新为操作人与操作时刻 */
  maintainer: string;
  maintainedAt: string;
}

/* ------------------------------------------------------------------ */
/* 路径与处理组                                                          */
/* ------------------------------------------------------------------ */

/**
 * 问题分类路径分隔符（派单入池条件、画像取值、日志快照全局统一）：「一级 / 二级 / 三级」。
 * 分类名里本身会出现「/」（如「账号/密码」），故用两侧带空格的「 / 」，存值与显示一致。
 */
export const PROBLEM_PATH_SEP = ' / ';
export function joinProblemPath(segs: readonly (string | undefined | null)[]): string {
  return segs.filter((s): s is string => !!s).join(PROBLEM_PATH_SEP);
}
export function splitProblemPath(path: string): string[] {
  return path.split(PROBLEM_PATH_SEP).filter(Boolean);
}

/** 处理组候选：用户分组（一线客服组不进派单，不作处理组） */
export const PROBLEM_TEAM_OPTIONS = POOL_GROUPS.filter((g) => g.id !== 'line1');
export function problemTeamLabel(id: string): string {
  return POOL_GROUPS.find((g) => g.id === id)?.label ?? id;
}
/** 组名 → 用户分组 id（导入「工单处理组」按组名完全一致匹配） */
export function problemTeamIdByLabel(label: string): string | undefined {
  return PROBLEM_TEAM_OPTIONS.find((g) => g.label === label)?.id;
}

/** 一 → 二 → 三级的级联树 */
export type ProblemTree = Record<string, Record<string, string[]>>;
function treeOf(rows: readonly ProblemTagRow[]): ProblemTree {
  const tree: ProblemTree = {};
  for (const r of rows) {
    const l2 = (tree[r.tagL1] ??= {});
    const l3s = (l2[r.tagL2] ??= []);
    if (!l3s.includes(r.tagL3)) l3s.push(r.tagL3);
  }
  return tree;
}

/* ------------------------------------------------------------------ */
/* 种子                                                                 */
/* ------------------------------------------------------------------ */

/** 产品 key · 一/二/三级 · 处理组（用户分组 id，空＝未配置）· 专属类型 · 状态 · 一/二/三级 ID · 更新人 · 更新时间 */
type SeedTuple = [
  string, string, string, string, string, ProblemExclusive, ProblemTagStatus,
  string, string, string, string, string,
];

/**
 * 问题分类管理原有 44 行（1120）。处理组按用户分组改存 id（11-02 D4）：
 * 工单-处理组 → 二线技术支持组、售后系统组 → 硬件缺陷组、技术支持组 → 技术支持组；平板刷机行 → 教育刷机处理组、个册行 → 教育支持组。
 */
const SEED_ROWS: SeedTuple[] = [
  ['p-h1', '云空间', '操作指导', '如何领取/升级云空间', 'line2', '无', '启用', '110201', '2104011', '31060101', '孙系统', '2026-09-08 10:12:05'],
  ['p-h1', '云空间', '功能介绍', '云空间存储大小咨询', 'line2', '小结', '启用', '110201', '2104012', '31060102', '周运营', '2026-09-26 15:40:31'],
  ['p-h1', '我的文件', '功能介绍', '文件名称是否支持添加符号', 'line2', '无', '启用', '110202', '2104013', '31060103', '孙系统', '2026-09-08 10:12:05'],
  ['p-h1', '我的文件', '软件问题', '邮件分享失败', 'line2', '无', '启用', '110202', '2104014', '31060104', '孙系统', '2026-09-08 10:12:05'],
  ['p-h1', '相机', '功能介绍', '视频是否支持实时字幕', 'line2', '无', '启用', '110203', '2104015', '31060105', '赵管理', '2026-09-15 09:31:47'],
  ['p-h1', '网络', '功能介绍', '是否支持修改IP地址', 'line2', '无', '启用', '110204', '2104016', '31060106', '孙系统', '2026-09-08 10:12:05'],
  ['p-h1', '账号/密码', '操作指导', '如何退出/切换账号', 'line2', '无', '启用', '110205', '2104017', '31060107', '周运营', '2026-10-06 11:05:12'],
  ['p-h2', '云空间', '操作指导', '如何上传/查看/编辑/下载/删除文件', 'line2', '无', '启用', '110211', '2104021', '31060201', '孙系统', '2026-09-09 14:22:38'],
  ['p-h2', '云空间', '软件问题', '无法领取云空间', 'line2', '无', '启用', '110211', '2104022', '31060202', '孙系统', '2026-09-09 14:22:38'],
  ['p-h2', '我的文件', '功能介绍', '文件已上传云空间是否支持直接转写', 'line2', '无', '启用', '110212', '2104024', '31060203', '赵管理', '2026-09-18 16:48:09'],
  ['p-h2', '我的文件', '软件问题', '文件日期/时间显示异常', 'line2', '无', '启用', '110212', '2104025', '31060204', '孙系统', '2026-09-09 14:22:38'],
  ['p-h2', '云空间', '功能介绍', '导出格式咨询', '', '无', '启用', '110211', '2104023', '31060205', '周运营', '2026-09-29 10:03:56'],
  ['p-h2', '整机/设备', '功能介绍', '录音笔IP地址咨询', 'line2', '小结', '停用', '110213', '2104026', '31060206', '周运营', '2026-10-07 17:26:20'],
  ['p1', '语音翻译', '操作指导', '如何切换男声女声', 'line2', '无', '启用', '110221', '2104031', '31060301', '孙系统', '2026-09-10 09:15:44'],
  ['p1', '语音翻译', '软件问题', '翻译结果没有语音播报', 'line2', '无', '启用', '110221', '2104032', '31060302', '孙系统', '2026-09-10 09:15:44'],
  ['p1', '会议/会话翻译', '软件问题', '翻译延迟/卡顿/反应慢', 'line2', '无', '启用', '110222', '2104033', '31060303', '赵管理', '2026-09-22 13:37:02'],
  ['p1', '屏幕', '功能异常', '显示内容异常(图标/乱码/字体/方向等)', 'line2', '无', '启用', '110223', '2104034', '31060304', '孙系统', '2026-09-10 09:15:44'],
  ['p1', '记录导出', '操作指导', '如何导出翻译记录', 'line2', '无', '启用', '110224', '2104035', '31060305', '孙系统', '2026-09-10 09:15:44'],
  ['p1', '售后', '服务申请', '维修请求', 'hardware', '售后', '启用', '110225', '2104036', '31060306', '周运营', '2026-09-30 15:58:27'],
  ['p1', '售后', '政策咨询', '退换货政策', 'hardware', '售后', '启用', '110225', '2104037', '31060307', '周运营', '2026-09-30 15:58:27'],
  ['p2', '会议/会话翻译', '软件问题', '翻译失败(服务准备中,请稍等)', 'line2', '无', '启用', '110231', '2104041', '31060401', '孙系统', '2026-09-11 11:20:13'],
  ['p2', '会议/会话翻译', '软件问题', '无法切换翻译识别模式', 'line2', '无', '启用', '110231', '2104041', '31060402', '孙系统', '2026-09-11 11:20:13'],
  ['p2', '语音翻译', '软件问题', '翻译结果没有语音播报', 'line2', '无', '启用', '110232', '2104042', '31060403', '赵管理', '2026-09-24 10:44:51'],
  ['p2', '蓝牙', '操作指导', '如何断开连接', 'line2', '无', '启用', '110233', '2104043', '31060404', '孙系统', '2026-09-11 11:20:13'],
  ['p2', '整机/设备', '信息咨询', '设备丢失', '', '小结', '启用', '110234', '2104044', '31060405', '周运营', '2026-10-02 09:52:36'],
  ['p2', '售后', '问题反馈', '设备维修后故障仍存在', 'hardware', '售后', '停用', '110235', '2104045', '31060406', '赵管理', '2026-10-05 14:09:18'],
  ['p3', '账号/密码', '操作指导', '如何退出/切换账号', 'tech', '无', '启用', '110241', '2104051', '31060501', '孙系统', '2026-09-12 16:30:40'],
  ['p3', '网络', '功能介绍', '是否支持修改IP地址', 'tech', '无', '启用', '110242', '2104052', '31060502', '孙系统', '2026-09-12 16:30:40'],
  ['p3', '设置/系统', '软件问题', '加载失败/打不开/闪退', 'tech', '无', '启用', '110243', '2104053', '31060503', '赵管理', '2026-09-25 11:18:24'],
  // 智慧课堂学生平板：售后 → 服务申请 → 自助刷机 / 刷原生系统（「专属类型＝刷机」默认开启，1013 N2；实际取值以刷机配置为准）
  ...FLASH_MODEL_SEED.flatMap((m, i): SeedTuple[] => ['自助刷机', '刷原生系统'].map((l3, j): SeedTuple => [
    `p-edu-${m.id}`, '售后', '服务申请', l3, 'edu-flash', '刷机', '启用',
    String(110301 + i), String(2104101 + i), String(31060701 + i * 2 + j), '周运营', '2026-10-13 16:20:00',
  ])),
  // 平板 S10 出厂不挂刷机类分类：同路径下补维修请求（一 / 二级 ID 与本产品刷机行共用）
  ['p-edu-FM-S10', '售后', '服务申请', '维修请求', 'hardware', '售后', '启用', '110307', '2104107', '31060715', '周运营', '2026-11-02 09:00:00'],
  // 个性化学习手册：个册退费 → 退费申请 → 个册退费（「专属类型＝个册退费」默认开启，1120；实际取值以个册退费配置为准）
  ['p-edu-zxw-handbook', '个册退费', '退费申请', '个册退费', 'edu', '个册退费', '启用', '110401', '2104201', '31060801', '周运营', '2026-10-22 10:00:00'],
];

/**
 * 工单在用的三级分类（原建单问题树独有的 12 个三级，11-02 D1），按产品挂行（D2：建单严格按所选产品取分类）。
 * 处理组：功能异常 → 二线技术支持组、设备故障 → 硬件缺陷组、账号问题 → 未配置（走默认池）。
 */
const COMMON_TAGS: Record<string, { team: string; l2s: Record<string, string[]> }> = {
  功能异常: { team: 'line2', l2s: { 播放问题: ['在线播放', '无法播放'], 触控问题: ['触摸失灵', '误触'] } },
  设备故障: { team: 'hardware', l2s: { 无法开机: ['黑屏', '无响应'], 网络: ['WiFi 连不上', '蓝牙断连'] } },
  账号问题: { team: '', l2s: { 登录: ['验证码失败', '密码错误'], 权益: ['会员失效', '订单未同步'] } },
};
/** 产品 key → 挂的「一级」或「一级 / 二级」 */
const COMMON_TAG_PRODUCTS: [string, string[]][] = [
  ['p-edu-t20', ['功能异常', '设备故障', '账号问题']],
  ['p-edu-x3pro', ['功能异常', '设备故障']],
  ['p-edu-FM-S10', ['功能异常', '设备故障']],
  ['p-hw-x1', ['功能异常', '设备故障']],
  ['p-hw-r2', ['功能异常', '设备故障']],
  ['p-hw-air', ['功能异常', '设备故障']],
  ['p-hw-l1', ['功能异常', '设备故障']],
  ['p-zxw-member', ['功能异常', '设备故障 / 网络', '账号问题']],
  ['p-zxw-tingjian', ['功能异常', '账号问题']],
  ['p-h1', ['功能异常 / 播放问题']],
  ['p1', ['功能异常 / 触控问题']],
  ['p3', ['账号问题 / 登录']],
];
function commonTagTuples(): SeedTuple[] {
  const out: SeedTuple[] = [];
  let id1 = 110501;
  let id2 = 2104301;
  let id3 = 31060901;
  for (const [productKey, picks] of COMMON_TAG_PRODUCTS) {
    const l1Ids = new Map<string, string>();
    const l2Ids = new Map<string, string>();
    for (const pick of picks) {
      const [l1, onlyL2] = splitProblemPath(pick);
      const def = COMMON_TAGS[l1];
      for (const [l2, l3s] of Object.entries(def.l2s)) {
        if (onlyL2 && l2 !== onlyL2) continue;
        if (!l1Ids.has(l1)) l1Ids.set(l1, String(id1++));
        if (!l2Ids.has(`${l1}\u0001${l2}`)) l2Ids.set(`${l1}\u0001${l2}`, String(id2++));
        for (const l3 of l3s) {
          out.push([
            productKey, l1, l2, l3, def.team, '无', '启用',
            l1Ids.get(l1)!, l2Ids.get(`${l1}\u0001${l2}`)!, String(id3++), '孙系统', '2026-11-02 09:00:00',
          ]);
        }
      }
    }
  }
  return out;
}

function seedRows(): ProblemTagRow[] {
  const flashConfig = useFlashConfigStore();
  const refundConfig = useRefundConfigStore();
  /** 刷机 / 个册退费以配置为准（配置未开启即为「无」），售后 / 小结取种子值 */
  const seedExclusive = (seed: ProblemExclusive, productName: string, path: [string, string, string]): ProblemExclusive => {
    if (flashConfig.isFlashTag(productName, ...path)) return '刷机';
    if (refundConfig.isRefundTag(productName, ...path)) return '个册退费';
    return seed === '刷机' || seed === '个册退费' ? '无' : seed;
  };
  return [...SEED_ROWS, ...commonTagTuples()].map((t, i) => {
    const [productKey, tagL1, tagL2, tagL3, team, seed, status, tagL1Id, tagL2Id, tagL3Id, maintainer, maintainedAt] = t;
    const productName = productTitleByKey(productKey);
    return {
      key: String(i + 1),
      productKey, productName, tagL1, tagL2, tagL3, team,
      exclusive: seedExclusive(seed, productName, [tagL1, tagL2, tagL3]),
      status, tagL1Id, tagL2Id, tagL3Id, maintainer, maintainedAt,
    };
  });
}

interface Persisted {
  version: number;
  savedAt: number;
  rows: ProblemTagRow[];
}

function readCache(): Persisted | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Persisted;
    return v && v.version === PROBLEM_TAGS_CACHE_VERSION && Array.isArray(v.rows) ? v : null;
  } catch {
    return null;
  }
}

/** 入池规则迁移结果（1215 3.4）：条件＝问题分类路径，归属池＝处理组的池 */
export interface ProblemMigrationRule {
  name: string;
  problems: string[];
  poolId: string;
  enabled: boolean;
}

/* ------------------------------------------------------------------ */
/* Store                                                                */
/* ------------------------------------------------------------------ */

export const useProblemTagsStore = defineStore('problemTags', () => {
  const cached = readCache();
  const rows = ref<ProblemTagRow[]>(cached?.rows ?? seedRows());
  let seq = rows.value.reduce((m, r) => Math.max(m, Number(r.key) || 0), 0) + 1;

  watch(rows, (v) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ version: PROBLEM_TAGS_CACHE_VERSION, savedAt: Date.now(), rows: v }));
    } catch {
      /* 配额超限等忽略 */
    }
  }, { deep: true, immediate: !cached });

  // 「专属类型＝刷机 / 个册退费」整体写回刷机配置、个册退费配置（建单识别读那两份）
  const flashConfig = useFlashConfigStore();
  const refundConfig = useRefundConfigStore();
  watch(rows, (v) => {
    flashConfig.replaceFlashTags(
      v.filter((r) => r.exclusive === '刷机').map((r) => flashTagKey(r.productName, r.tagL1, r.tagL2, r.tagL3)),
    );
    refundConfig.replaceRefundTags(
      v.filter((r) => r.exclusive === '个册退费').map((r) => refundTagKey(r.productName, r.tagL1, r.tagL2, r.tagL3)),
    );
  }, { deep: true, immediate: true });

  /* ---------------- 读 ---------------- */

  const enabledRows = computed(() => rows.value.filter((r) => r.status === '启用'));
  /** 工单可用的分类：启用、且不是「小结」（小结只供容联云小结使用，新建工单不可选） */
  const ticketRows = computed(() => enabledRows.value.filter((r) => r.exclusive !== '小结'));

  /** 建单候选：只取所选产品下的分类（11-02 D2） */
  function treeForCreate(productName: string): ProblemTree {
    const name = (productName ?? '').trim();
    if (!name) return {};
    return treeOf(ticketRows.value.filter((r) => r.productName === name));
  }
  /** 去掉产品后的全量并集树（含停用、小结）：查询筛选要能筛到历史工单 */
  const unionTree = computed(() => treeOf(rows.value));
  /** 派单侧（入池条件、画像）用的并集树：工单可用的分类 */
  const dispatchTree = computed(() => treeOf(ticketRows.value));

  /**
   * 处理组属于所给组的问题分类路径（画像「问题分类 · 指定」的可选范围，1215 6.5 / 11-02 D5）：
   * 多组取并集；某二级 / 一级下的分类全部在范围内时上卷为该二级 / 一级。
   */
  function pathsOfGroups(groupIds: readonly string[]): string[] {
    const gs = new Set(groupIds);
    const inScope = new Set(ticketRows.value
      .filter((r) => r.team && gs.has(r.team))
      .map((r) => joinProblemPath([r.tagL1, r.tagL2, r.tagL3])));
    const out: string[] = [];
    for (const [l1, l2s] of Object.entries(dispatchTree.value)) {
      const l2Out: string[] = [];
      let allL2 = true;
      for (const [l2, l3s] of Object.entries(l2s)) {
        const hit = l3s.filter((l3) => inScope.has(joinProblemPath([l1, l2, l3])));
        if (hit.length === l3s.length) l2Out.push(joinProblemPath([l1, l2]));
        else {
          allL2 = false;
          l2Out.push(...hit.map((l3) => joinProblemPath([l1, l2, l3])));
        }
      }
      if (allL2 && Object.keys(l2s).length) out.push(l1);
      else out.push(...l2Out);
    }
    return out;
  }

  /** 某产品某条分类的处理组（未配置为空串） */
  function teamOf(productName: string, l1: string, l2: string, l3: string): string {
    return rows.value.find((r) => r.productName === productName
      && r.tagL1 === l1 && r.tagL2 === l2 && r.tagL3 === l3)?.team ?? '';
  }

  /**
   * 入池规则迁移（1215 3.4 / 11-02 D7）：每个设了处理组的问题分类节点生成一条规则，只带路径不带产品；
   * 同路径同组（不同产品）合并为一条；一级下的分类全部归同一处理组时上卷为该一级一条。
   * 同一路径分属多个处理组时，按行序第一个组的那条启用、其余置停用待复核。
   * 返回顺序即优先级顺序：三级在前、一级在后（由深到浅）。
   */
  function migrationRules(): ProblemMigrationRule[] {
    const src = ticketRows.value;
    const l1Team = new Map<string, string | null>();
    for (const r of src) {
      const cur = l1Team.get(r.tagL1);
      if (cur === undefined) l1Team.set(r.tagL1, r.team || null);
      else if (cur !== (r.team || null)) l1Team.set(r.tagL1, null);
    }
    const deep: ProblemMigrationRule[] = [];
    const shallow: ProblemMigrationRule[] = [];
    const names = new Set<string>();
    const nameOf = (base: string, poolId: string) => {
      let n = `${base}（迁移）`;
      if (names.has(n)) n = `${base}·${problemTeamLabel(poolId)}（迁移）`;
      names.add(n);
      return n;
    };
    const seenL1 = new Set<string>();
    const seenPath = new Map<string, Set<string>>();
    for (const r of src) {
      if (!r.team) continue;
      const rolled = l1Team.get(r.tagL1);
      if (rolled) {
        if (seenL1.has(r.tagL1)) continue;
        seenL1.add(r.tagL1);
        shallow.push({ name: nameOf(r.tagL1, rolled), problems: [r.tagL1], poolId: rolled, enabled: true });
        continue;
      }
      const path = joinProblemPath([r.tagL1, r.tagL2, r.tagL3]);
      const teams = seenPath.get(path) ?? new Set<string>();
      if (teams.has(r.team)) continue;
      const first = teams.size === 0;
      teams.add(r.team);
      seenPath.set(path, teams);
      deep.push({ name: nameOf(r.tagL3, r.team), problems: [path], poolId: r.team, enabled: first });
    }
    return [...deep, ...shallow];
  }

  /* ---------------- 写（只给问题分类管理页调用） ---------------- */

  function nextKey(): string {
    return String(seq++);
  }
  /** 新增：插到列表最前 */
  function addRows(list: ProblemTagRow[]) {
    rows.value.unshift(...list);
  }
  function updateRow(key: string, next: ProblemTagRow) {
    const i = rows.value.findIndex((r) => r.key === key);
    if (i >= 0) rows.value[i] = next;
  }
  function patchRows(keys: readonly string[], patch: Partial<Omit<ProblemTagRow, 'key'>>) {
    const ks = new Set(keys);
    for (const r of rows.value) if (ks.has(r.key)) Object.assign(r, patch);
  }
  function removeRows(keys: readonly string[]) {
    const ks = new Set(keys);
    rows.value = rows.value.filter((r) => !ks.has(r.key));
  }
  function resetToFactory() {
    rows.value = seedRows();
    seq = rows.value.length + 1;
  }

  return {
    rows, enabledRows,
    treeForCreate, unionTree, dispatchTree, pathsOfGroups, teamOf, migrationRules,
    nextKey, addRows, updateRow, patchRows, removeRows, resetToFactory,
  };
});
