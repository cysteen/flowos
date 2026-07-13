/** 产品树 mock：BGBU → 业务线 → 产品线 → 产品分类 → 产品（与产品管理页共用） */
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
        key: 'yx-ai', title: 'AI录音笔', kind: '业务线',
        children: [
          { key: 'p-h1', title: '讯飞录音笔H1', kind: '产品' },
          { key: 'p-h2', title: '讯飞录音笔H2', kind: '产品' },
        ],
      },
    ],
  },
  { key: 'bg0', title: '测试 222BG', kind: 'BGBU' },
  {
    key: 'bg1', title: '金融科技事业部', kind: 'BGBU', a: 7, b: 0,
    children: [
      {
        key: 'yx1', title: '测试业务线111', kind: '业务线', a: 1, b: 0,
        children: [{ key: 'px0', title: '文件', kind: '产品线' }],
      },
      {
        key: 'yx2', title: '智慧运营业务部', kind: '业务线', a: 2, b: 1,
        children: [
          {
            key: 'px1', title: '智能客服产品线', kind: '产品线', a: 0, b: 2,
            children: [
              {
                key: 'fl1', title: '翻译机系列', kind: '产品分类', a: 0, b: 2,
                children: [
                  { key: 'p1', title: '三防翻译机', kind: '产品' },
                  { key: 'p2', title: '汉维翻译机', kind: '产品' },
                ],
              },
              {
                key: 'fl2', title: '智能服务', kind: '产品分类', a: 0, b: 1,
                children: [{ key: 'p3', title: '讯飞智能质检系统V1.0', kind: '产品' }],
              },
            ],
          },
          { key: 'px2', title: '智能中台产品线', kind: '产品线' },
        ],
      },
    ],
  },
  { key: 'px9', title: '智慧运营业务部', kind: '产品线', a: 2, b: 0 },
];

export const PRODUCT_TREE_KIND_COLOR: Record<ProductTreeNode['kind'], string> = {
  BGBU: 'blue', 业务线: 'green', 产品线: 'orange', 产品分类: 'red', 产品: 'default',
};

export const PRODUCT_TREE_DEFAULT_EXPANDED = ['bg-consumer', 'yx-ai', 'bg1', 'yx1', 'yx2', 'px1', 'fl1', 'fl2'];

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

/** 产品 key → 业务类型 / 产品分类（mock 映射） */
export function productMetaByKey(key: string): { bizType: string; prodCat: string } {
  const node = findProductTreeNode(key);
  if (!node) return { bizType: '智能硬件', prodCat: '其他' };
  if (key === 'p-h1' || key === 'p-h2') return { bizType: '智能硬件', prodCat: '录音笔系列' };
  if (key === 'p1' || key === 'p2') return { bizType: '智能硬件', prodCat: '翻译机系列' };
  if (key === 'p3') return { bizType: 'AI服务', prodCat: '智能服务' };
  return { bizType: '软件服务', prodCat: node.title };
}
