/**
 * 条码商品信息查询（联网功能，仅打包进「联网版」）。
 *
 * 说明：中国物品编码中心官方接口需要会员 AppKey/Secret 签名，未对外开放匿名调用。
 * 因此这里做成可插拔 provider：
 *  - gs1-cn  ：GS1/中国物品编码中心官方注册库数据（经第三方聚合接口转发），可选填 API Key
 *  - custom  ：自建/自购接口，URL 里用 {code} 占位
 *  - off     ：关闭（默认，保护隐私）
 */

export type BarcodeInfo = {
  code: string;
  name: string | null;
  brand: string | null;
  spec: string | null;
  netContent: string | null;
  manufacturer: string | null;
  origin: string | null;
  category: string | null;
  imageUrl: string | null;
  /** 数据来源描述，展示给用户 */
  source: string;
};

export type LookupProvider = 'off' | 'gs1-cn' | 'custom';

export type LookupConfig = {
  provider: LookupProvider;
  apiKey: string;
  /** 自定义接口地址，需包含 {code} 占位 */
  customUrl: string;
  /** 自定义请求头，形如 X-API-Key: xxxx（可留空） */
  customHeader: string;
  timeoutMs: number;
};

const KEY = 'localscan.barcodeLookup.v1';

export const DEFAULT_LOOKUP_CONFIG: LookupConfig = {
  provider: 'off',
  apiKey: '',
  customUrl: '',
  customHeader: '',
  timeoutMs: 8000,
};

const GS1_ENDPOINT = 'https://v1.apizero.cn/api/barcode-gs1';
/** 兜底数据源：开源商品库，匿名免费（GS1 渠道失败/无结果时自动改查） */
const OFF_ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product';
/** 备用数据源：MXNZP 商品条码库（GS1 失败后优先、开源库最后兜底） */
const MXNZP_ENDPOINT = 'https://www.mxnzp.com/api/barcode/goods/details';
const MXNZP_APP_ID = 'g9bqmfrpfup2ors9';
const MXNZP_APP_SECRET = 'haXbNLXDbL78NiuNdkt8D1GofgmmOnpN';

export function loadLookupConfig(): LookupConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_LOOKUP_CONFIG };
    return { ...DEFAULT_LOOKUP_CONFIG, ...(JSON.parse(raw) as Partial<LookupConfig>) };
  } catch {
    return { ...DEFAULT_LOOKUP_CONFIG };
  }
}

export function saveLookupConfig(cfg: LookupConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* quota */
  }
}

/* ---------------- 字段映射 ---------------- */

const NAME_KEYS = ['name', 'productname', 'goodsname', 'title', '产品名称', '商品名称', '品名'];
const BRAND_KEYS = ['brand', 'brands', 'brandname', 'trademark', '品牌'];
const SPEC_KEYS = ['spec', 'specification', 'quantity', 'standard', '规格', 'modelspec'];
const NET_KEYS = ['netcontent', 'netweight', 'netContent', '净含量', 'content'];
const MFR_KEYS = ['manufacturer', 'firmname', 'companyname', 'enterprise', 'vendor', 'brands', 'manufacturer_name', 'supplier', '厂商名称', '生产企业', '企业名称'];
const ORIGIN_KEYS = ['origin', 'country', 'producingarea', '产地', '生产国'];
const CATEGORY_KEYS = ['category', 'categoryname', 'classname', 'categories', '分类'];
const IMAGE_KEYS = ['image', 'imageurl', 'imagefronturl', 'img', 'picture', 'picurl', '图片', '商品图'];

function normKey(k: string) {
  return k.replace(/[_\-\s]/g, '').toLowerCase();
}

/** 深度优先查找第一个匹配候选键的字符串值 */
function deepPick(input: unknown, candidates: string[], depth = 0): string | null {
  if (input == null || depth > 6) return null;
  if (Array.isArray(input)) {
    for (const v of input) {
      const hit = deepPick(v, candidates, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  // 先在同一层精确匹配，命中就返回
  for (const [k, v] of Object.entries(obj)) {
    if (candidates.includes(normKey(k)) && typeof v === 'string' && v.trim()) return v.trim();
  }
  for (const [k, v] of Object.entries(obj)) {
    if (candidates.includes(normKey(k)) && typeof v === 'number') return String(v);
  }
  // 再往下钻
  for (const v of Object.values(obj)) {
    const hit = deepPick(v, candidates, depth + 1);
    if (hit) return hit;
  }
  return null;
}

function mapInfo(code: string, payload: unknown, source: string): BarcodeInfo {
  const data = (payload as { data?: unknown })?.data ?? payload;
  return {
    code,
    name: deepPick(data, NAME_KEYS),
    brand: deepPick(data, BRAND_KEYS),
    spec: deepPick(data, SPEC_KEYS),
    netContent: deepPick(data, NET_KEYS),
    manufacturer: deepPick(data, MFR_KEYS),
    origin: deepPick(data, ORIGIN_KEYS),
    category: deepPick(data, CATEGORY_KEYS),
    imageUrl: deepPick(data, IMAGE_KEYS),
    source,
  };
}

export function hasAnyInfo(info: BarcodeInfo): boolean {
  return Boolean(
    info.name || info.brand || info.spec || info.netContent || info.manufacturer || info.origin,
  );
}

async function fetchJson(url: string, headers: Record<string, string>, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), Math.max(2000, timeoutMs));
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`服务返回 ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    window.clearTimeout(timer);
  }
}

function parseCustomHeader(raw: string): Record<string, string> {
  const idx = raw.indexOf(':');
  if (idx <= 0) return {};
  const k = raw.slice(0, idx).trim();
  const v = raw.slice(idx + 1).trim();
  return k && v ? { [k]: v } : {};
}

/**
 * 查询条码。未启用/未配置/查询失败都返回 null，调用方据此决定是否提示。
 */
export async function lookupBarcode(
  code: string,
  cfg: LookupConfig,
): Promise<BarcodeInfo | null> {
  const barcode = code.trim();
  if (!barcode || !/^\d{8,14}$/.test(barcode)) return null;
  if (cfg.provider === 'off') return null;

  try {
    if (cfg.provider === 'gs1-cn') {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (cfg.apiKey.trim()) headers['X-API-Key'] = cfg.apiKey.trim();
      try {
        const payload = await fetchJson(
          `${GS1_ENDPOINT}?code=${encodeURIComponent(barcode)}`,
          headers,
          cfg.timeoutMs,
        );
        // apizero 的错误也走 200：{code: 4xxx, msg}（4030 = 匿名试用额度用完，需 Key）
        const err = payload as { code?: number; msg?: string };
        if (typeof err?.code === 'number' && err.code >= 4000) {
          throw new Error(err.msg || `错误码 ${err.code}`);
        }
        const info = mapInfo(barcode, payload, '中国物品编码中心（GS1 注册库）');
        if (hasAnyInfo(info)) return info;
      } catch {
        /* GS1 渠道失败（网络 / 额度 / 错误码）→ 落到备用链 */
      }
      // 备用一：MXNZP 商品条码库（国内商品覆盖好）。
      // 免费档 QPS=1：限频响应（msg 含"频率"）延时 1.3s 自动重试一次
      const mxnzpUrl = `${MXNZP_ENDPOINT}?barcode=${encodeURIComponent(barcode)}&app_id=${MXNZP_APP_ID}&app_secret=${MXNZP_APP_SECRET}`;
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (attempt > 0) await new Promise((res) => window.setTimeout(res, 1300));
          const payload = await fetchJson(
            mxnzpUrl,
            { Accept: 'application/json' },
            cfg.timeoutMs,
          );
          const r = payload as { code?: number; msg?: string };
          if (r?.code === 1) {
            const info = mapInfo(barcode, payload, 'MXNZP 商品条码库');
            if (hasAnyInfo(info)) return info;
            break; // 收录但无有效字段（10036 未收录也会落到这里之外）—— 转开源库
          }
          if (!(typeof r?.msg === 'string' && r.msg.includes('频率'))) break; // 非限频错误不再重试
        }
      } catch {
        /* MXNZP 失败 → 落到开源库兜底 */
      }
      // 备用二：Open Food Facts 匿名查询（开源商品库，无需 Key）
      const off = await fetchJson(
        `${OFF_ENDPOINT}/${encodeURIComponent(barcode)}.json`,
        { Accept: 'application/json' },
        cfg.timeoutMs,
      );
      if ((off as { status?: number })?.status === 1) {
        const info = mapInfo(barcode, off, 'Open Food Facts（开源商品库）');
        if (hasAnyInfo(info)) return info;
      }
      return null;
    }

    if (cfg.provider === 'custom') {
      if (!cfg.customUrl.includes('{code}')) return null;
      const url = cfg.customUrl.replace('{code}', encodeURIComponent(barcode));
      const payload = await fetchJson(
        url,
        { Accept: 'application/json', ...parseCustomHeader(cfg.customHeader) },
        cfg.timeoutMs,
      );
      const info = mapInfo(barcode, payload, '自定义接口');
      return hasAnyInfo(info) ? info : null;
    }
  } catch {
    return null;
  }
  return null;
}
