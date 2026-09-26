/** Shared fixed field list for edit form order + settings template page. */
export const CORE_FIELDS = [
  { key: 'name', label: '名称', hint: '必填' },
  { key: 'code', label: '条码', hint: '可扫可填' },
  { key: 'category', label: '分类', hint: '可自定义' },
  { key: 'location', label: '位置', hint: '可自定义' },
  { key: 'qty', label: '数量', hint: '' },
  { key: 'unit', label: '单位', hint: '' },
  { key: 'lowStockAt', label: '低库存', hint: '' },
  { key: 'currency', label: '币种', hint: '' },
  { key: 'purchasePrice', label: '购入价', hint: '' },
  { key: 'salePrice', label: '售价', hint: '' },
  { key: 'productionDate', label: '生产日期', hint: '' },
  { key: 'shelfLifeMonths', label: '保质期', hint: '月' },
  { key: 'nearExpiryMonths', label: '临期阈值', hint: '月' },
  { key: 'note', label: '备注', hint: '内置最后' },
] as const;

export const APP_VERSION = '1.4.0';

export type StatusKey =
  | '全部'
  | '在库'
  | '低库存'
  | '零库存'
  | '临期'
  | '过期'
  | '无日期'
  | '有条码'
  | '无条码'
  | '近1天新增'
  | '近1周新增'
  | '近1月新增';

export const ALL_STATUS_KEYS: StatusKey[] = [
  '全部',
  '在库',
  '低库存',
  '零库存',
  '临期',
  '过期',
  '无日期',
  '有条码',
  '无条码',
  '近1天新增',
  '近1周新增',
  '近1月新增',
];

/** Default 4 quick cards on items page */
export const DEFAULT_CARD_STATUSES: StatusKey[] = ['在库', '低库存', '临期', '过期'];

const CARDS_KEY = 'localscan.cardStatuses';

export function loadCardStatuses(): StatusKey[] {
  try {
    const raw = localStorage.getItem(CARDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      const valid = arr.filter((s): s is StatusKey => (ALL_STATUS_KEYS as string[]).includes(s));
      if (valid.length >= 1) return valid.slice(0, 4);
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_CARD_STATUSES];
}

export function saveCardStatuses(list: StatusKey[]) {
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(list.slice(0, 4)));
  } catch {
    /* ignore */
  }
}

const STATUS_KEY = 'localscan.statusFilters';

export function loadEnabledStatuses(): StatusKey[] {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      const valid = arr.filter((s): s is StatusKey => (ALL_STATUS_KEYS as string[]).includes(s));
      if (valid.length) return valid;
    }
  } catch {
    /* ignore */
  }
  return [...ALL_STATUS_KEYS];
}

export function saveEnabledStatuses(list: StatusKey[]) {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Persisted list-page filters */
export type ItemFilters = {
  query: string;
  category: string;
  location: string;
  status: string;
};

const FILTER_KEY = 'localscan.itemFilters';

export function loadItemFilters(): ItemFilters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) {
      return { query: '', category: '全部', location: '全部', status: '全部' };
    }
    return { ...{ query: '', category: '全部', location: '全部', status: '全部' }, ...JSON.parse(raw) };
  } catch {
    return { query: '', category: '全部', location: '全部', status: '全部' };
  }
}

export function saveItemFilters(f: ItemFilters) {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}
