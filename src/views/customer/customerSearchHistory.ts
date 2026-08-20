const LS_KEY = 'flowos-customer-search-history';
const MAX_ITEMS = 8;

export interface CustomerSearchHistoryItem {
  phone: string;
  name: string;
  role: string;
  /** YYYY-MM-DD HH:mm */
  searchedAt: string;
}

function formatNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function loadCustomerSearchHistory(): CustomerSearchHistoryItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomerSearchHistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items: CustomerSearchHistoryItem[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* ignore */
  }
}

/** 记录一次成功打开的客户全景（同手机号置顶去重） */
export function recordCustomerSearch(entry: Omit<CustomerSearchHistoryItem, 'searchedAt'>) {
  const phone = entry.phone.trim();
  if (!phone) return;
  const next: CustomerSearchHistoryItem = {
    phone,
    name: entry.name,
    role: entry.role,
    searchedAt: formatNow(),
  };
  const rest = loadCustomerSearchHistory().filter((x) => x.phone !== phone);
  save([next, ...rest]);
}

export function clearCustomerSearchHistory() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
