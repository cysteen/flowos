/** 产品树 mock：BGBU → 业务线 → 产品线 → 产品分类 → 产品（五级，与产品管理页共用） */
export interface ProductTreeNode {
  key: string;
  title: string;
  kind: 'BGBU' | '业务线' | '产品线' | '产品分类' | '产品';
  a?: number;
  b?: number;
  children?: ProductTreeNode[];
}

export const PRODUCT_TREE_DATA: ProductTreeNode[] = [
  {
    key: 'bg-consumer', title: '消费者BG', kind: 'BGBU',
    children: [
      {
        key: 'yx-hw', title: '智能硬件业务线', kind: '业务线',
        children: [
          {
            key: 'px-rec', title: '录音笔产品线', kind: '产品线',
            children: [
              {
                key: 'fl-rec', title: '录音笔系列', kind: '产品分类',
                children: [
                  { key: 'p-h1', title: '讯飞录音笔H1', kind: '产品' },
                  { key: 'p-h2', title: '讯飞录音笔H2', kind: '产品' },
                ],
              },
            ],
          },
          {
            key: 'px-trans', title: '翻译机产品线', kind: '产品线',
            children: [
              {
                key: 'fl-trans', title: '翻译机系列', kind: '产品分类',
                children: [
                  { key: 'p1', title: '三防翻译机', kind: '产品' },
                  { key: 'p2', title: '汉维翻译机', kind: '产品' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'bg-fin', title: '金融科技事业部', kind: 'BGBU',
    children: [
      {
        key: 'yx-ops', title: '智慧运营业务线', kind: '业务线',
        children: [
          {
            key: 'px-cs', title: '智能客服产品线', kind: '产品线',
            children: [
              {
                key: 'fl-qc', title: '智能质检系列', kind: '产品分类',
                children: [
                  { key: 'p3', title: '讯飞智能质检系统V1.0', kind: '产品' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

export const PRODUCT_TREE_KIND_COLOR: Record<ProductTreeNode['kind'], string> = {
  BGBU: 'blue', 业务线: 'green', 产品线: 'orange', 产品分类: 'red', 产品: 'default',
};

export const PRODUCT_TREE_DEFAULT_EXPANDED = [
  'bg-consumer', 'yx-hw', 'px-rec', 'fl-rec', 'px-trans', 'fl-trans',
  'bg-fin', 'yx-ops', 'px-cs', 'fl-qc',
];

function walk(nodes: ProductTreeNode[], fn: (n: ProductTreeNode) => void) {
  for (const n of nodes) {
    fn(n);
    if (n.children?.length) walk(n.children, fn);
  }
}

export function findProductTreeNode(key: string): ProductTreeNode | null {
  let found: ProductTreeNode | null = null;
  walk(PRODUCT_TREE_DATA, (n) => { if (n.key === key) found = n; });
  return found;
}

/** 收集节点下所有产品 key（含自身若为产品） */
export function collectProductKeysUnder(nodeKey: string | null): Set<string> | null {
  if (!nodeKey) return null;
  const node = findProductTreeNode(nodeKey);
  if (!node) return new Set();
  const keys = new Set<string>();
  walk([node], (n) => { if (n.kind === '产品') keys.add(n.key); });
  return keys;
}

export function productTitleByKey(key: string): string {
  return findProductTreeNode(key)?.title ?? key;
}

/** 列出产品树中全部产品节点 */
export function listProductNodes(): ProductTreeNode[] {
  const list: ProductTreeNode[] = [];
  walk(PRODUCT_TREE_DATA, (n) => { if (n.kind === '产品') list.push(n); });
  return list;
}

/** 按关键词过滤产品树（保留匹配节点及其祖先链） */
export function filterProductTree(nodes: ProductTreeNode[], keyword: string): ProductTreeNode[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return nodes;
  function recur(items: ProductTreeNode[]): ProductTreeNode[] {
    return items.reduce<ProductTreeNode[]>((acc, n) => {
      const kids = n.children ? recur(n.children) : [];
      if (n.title.toLowerCase().includes(kw) || kids.length) {
        acc.push({ ...n, children: kids.length ? kids : undefined });
      }
      return acc;
    }, []);
  }
  return recur(nodes);
}

/** 产品 key → 从根到叶的祖先链（含自身） */
export function productAncestors(key: string): ProductTreeNode[] {
  const path: ProductTreeNode[] = [];
  function dfs(nodes: ProductTreeNode[], trail: ProductTreeNode[]): boolean {
    for (const n of nodes) {
      const t = [...trail, n];
      if (n.key === key) { path.push(...t); return true; }
      if (n.children?.length && dfs(n.children, t)) return true;
    }
    return false;
  }
  dfs(PRODUCT_TREE_DATA, []);
  return path;
}

/** 产品 key → 事业部（BGBU 层）/ 产品线（产品线层），按树路径派生 */
export function productMetaByKey(key: string): { bizType: string; prodCat: string } {
  const path = productAncestors(key);
  const bg = path.find((n) => n.kind === 'BGBU');
  const line = path.find((n) => n.kind === '产品线');
  return { bizType: bg?.title ?? '消费者BG', prodCat: line?.title ?? '其他' };
}
