import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  addCategory,
  createItem,
  findByCode,
  getActiveWarehouseId,
  getItem,
  getImageDataUrl,
  listCategories,
  saveImageDataUrl,
  updateItem,
} from '../db';
import { emptyItem, type CustomField, type InventoryItem, type InventoryItemInput } from '../types';
import { navigate } from '../router';
import { fileToDataUrl } from '../lib/files';
import { showToast } from '../lib/ui';
import { decodeFromImage } from '../lib/scan';

export function EditItemPage({ id, initialCode }: { id?: string; initialCode?: string | null }) {
  const wid = getActiveWarehouseId() ?? '';
  const [form, setForm] = useState<InventoryItemInput>(() => {
    const base = emptyItem(wid);
    if (initialCode) return { ...base, code: initialCode, codeType: 'OTHER' };
    return base;
  });
  const [photos, setPhotos] = useState<string[]>([]); // dataUrls
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [catQuery, setCatQuery] = useState('');
  const [showCat, setShowCat] = useState(false);

  const categories = useMemo(() => {
    void catQuery;
    return listCategories();
  }, [catQuery, form.category]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const row = getItem(id);
      if (!row) {
        navigate({ name: 'items' });
        return;
      }
      setForm({
        id: row.id,
        warehouseId: row.warehouseId,
        code: row.code,
        codeType: row.codeType,
        name: row.name,
        category: row.category,
        note: row.note,
        qty: row.qty,
        unit: row.unit,
        purchasePrice: row.purchasePrice,
        salePrice: row.salePrice,
        currency: row.currency,
        lowStockAt: row.lowStockAt,
        customFields: row.customFields,
        imageIds: row.imageIds,
      });
      const urls: string[] = [];
      for (const key of row.imageIds) {
        const u = getImageDataUrl(key);
        if (u) urls.push(u);
      }
      setPhotos(urls);
      setLoading(false);
    })();
  }, [id]);

  function patch<K extends keyof InventoryItemInput>(key: K, value: InventoryItemInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onPhotos(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const dataUrl = await fileToDataUrl(file);
      setPhotos((p) => [...p, dataUrl]);
    }
  }

  async function onCapture(file: File | null) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setPhotos((p) => [...p, dataUrl]);
    // try scan barcode from photo as a convenience
    try {
      const found = await decodeFromImage(file);
      if (found && !form.code) {
        patch('code', found.code);
        showToast('已从照片识别条码', 'success');
      }
    } catch {
      /* ignore */
    }
  }

  async function onScanCode() {
    // Use camera to scan via file input capture as fallback (works on WebView)
    // Prefer navigating to scan page and coming back with code — simpler: open scan in new flow
    navigate({ name: 'scan' });
    showToast('扫码后选择「绑定为新物品」', 'info');
  }

  function addCustomField() {
    patch('customFields', [...(form.customFields ?? []), { key: uidKey(), label: '', value: '' }]);
  }

  function updateCustomField(index: number, patchPart: Partial<CustomField>) {
    const next = [...(form.customFields ?? [])];
    next[index] = { ...next[index], ...patchPart };
    patch('customFields', next);
  }

  function removeCustomField(index: number) {
    const next = [...(form.customFields ?? [])];
    next.splice(index, 1);
    patch('customFields', next);
  }

  function pickCategory(c: string) {
    patch('category', c);
    setCatQuery('');
    setShowCat(false);
  }

  function confirmCategory() {
    const n = catQuery.trim();
    if (!n) return;
    const exists = categories.includes(n);
    if (!exists) addCategory(n);
    patch('category', n);
    setCatQuery('');
    setShowCat(false);
  }

  const matchedExisting = categories.some((c) => c === catQuery.trim());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError('请填写物品名称');
      return;
    }
    if (form.code) {
      const dup = findByCode(form.code, wid);
      if (dup && dup.id !== id) {
        setError(`条码 ${form.code} 已绑定「${dup.name}」`);
        return;
      }
    }

    setSaving(true);
    try {
      // persist photos
      const imageIds: string[] = [];
      for (const dataUrl of photos) {
        imageIds.push(saveImageDataUrl(dataUrl));
      }

      const payload: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'deleted'> = {
        warehouseId: wid,
        code: form.code?.trim() || null,
        codeType: form.code ? (form.codeType ?? 'OTHER') : null,
        name: form.name.trim(),
        category: form.category || '其他',
        note: form.note,
        qty: Number(form.qty) || 0,
        unit: form.unit || '件',
        purchasePrice: form.purchasePrice == null ? null : Number(form.purchasePrice),
        salePrice: form.salePrice == null ? null : Number(form.salePrice),
        currency: form.currency || 'CNY',
        lowStockAt: Number(form.lowStockAt) || 0,
        customFields: (form.customFields ?? []).filter((f) => f.label.trim()),
        imageIds,
      };

      const saved = id ? updateItem(id, payload) : createItem(payload);
      showToast('已保存', 'success');
      navigate({ name: 'detail', id: saved.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p className="empty">加载中…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{id ? '编辑' : '新建'}</p>
          <h1>{id ? '修改物品' : '添加物品'}</h1>
        </div>
        <button type="button" className="btn-ghost" onClick={() => navigate({ name: 'items' })}>
          取消
        </button>
      </header>

      <form className="form" onSubmit={onSubmit}>
        <label className="field">
          <span>名称 *</span>
          <input value={form.name} onChange={(e) => patch('name', e.target.value)} required />
        </label>

        <div className="field">
          <span>条码</span>
          <div className="input-row">
            <input
              value={form.code ?? ''}
              onChange={(e) => patch('code', e.target.value || null)}
              placeholder="手动输入或扫描"
              className="mono"
            />
            <button type="button" className="btn-ghost" onClick={() => void onScanCode()}>
              扫码
            </button>
            <label className="btn-ghost">
              相册
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = '';
                  if (f) void onCapture(f);
                }}
              />
            </label>
          </div>
        </div>

        <div className="field">
          <span>分类</span>
          <button type="button" className="select-like" onClick={() => setShowCat((v) => !v)}>
            {form.category}
            <span className="chev">▾</span>
          </button>
          {showCat && (
            <div className="cat-panel glass">
              <input
                value={catQuery}
                onChange={(e) => setCatQuery(e.target.value)}
                placeholder="搜索或输入新分类"
                autoFocus
              />
              <div className="cat-list">
                {categories
                  .filter((c) => !catQuery || c.includes(catQuery))
                  .map((c) => (
                    <button key={c} type="button" className="cat-opt" onClick={() => pickCategory(c)}>
                      {c}
                      <span className="ok">✓</span>
                    </button>
                  ))}
                {catQuery.trim() && !matchedExisting && (
                  <button type="button" className="cat-opt new" onClick={confirmCategory}>
                    新建「{catQuery.trim()}」
                    <span className="new-tag">新建</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="form-grid">
          <label className="field">
            <span>数量</span>
            <input type="number" min={0} value={form.qty} onChange={(e) => patch('qty', Number(e.target.value))} />
          </label>
          <label className="field">
            <span>单位</span>
            <input value={form.unit} onChange={(e) => patch('unit', e.target.value)} />
          </label>
          <label className="field">
            <span>低库存阈值</span>
            <input
              type="number"
              min={0}
              value={form.lowStockAt}
              onChange={(e) => patch('lowStockAt', Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>币种</span>
            <input value={form.currency} onChange={(e) => patch('currency', e.target.value)} />
          </label>
          <label className="field">
            <span>购入价</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.purchasePrice ?? ''}
              onChange={(e) => patch('purchasePrice', e.target.value === '' ? null : Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>售价</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.salePrice ?? ''}
              onChange={(e) => patch('salePrice', e.target.value === '' ? null : Number(e.target.value))}
            />
          </label>
        </div>

        <label className="field">
          <span>备注</span>
          <textarea rows={3} value={form.note} onChange={(e) => patch('note', e.target.value)} />
        </label>

        <div className="field">
          <div className="field-head">
            <span>自定义条目</span>
            <button type="button" className="btn-ghost sm" onClick={addCustomField}>
              + 添加
            </button>
          </div>
          {(form.customFields ?? []).map((f, i) => (
            <div key={f.key} className="custom-row">
              <input
                placeholder="名称"
                value={f.label}
                onChange={(e) => updateCustomField(i, { label: e.target.value })}
              />
              <input
                placeholder="值"
                value={f.value}
                onChange={(e) => updateCustomField(i, { value: e.target.value })}
              />
              <button type="button" className="btn-ghost sm danger" onClick={() => removeCustomField(i)}>
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="field">
          <span>图片</span>
          <div className="photo-actions">
            <label className="btn-ghost">
              相册选择
              <input type="file" accept="image/*" multiple hidden onChange={(e) => void onPhotos(e.target.files)} />
            </label>
            <label className="btn-primary">
              拍照
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = '';
                  if (f) void onCapture(f);
                }}
              />
            </label>
          </div>
          {photos.length > 0 && (
            <div className="gallery">
              {photos.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  className="gallery-item"
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  title="点击移除"
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary full" disabled={saving}>
          {saving ? '保存中…' : '保存物品'}
        </button>
      </form>
    </div>
  );
}

function uidKey() {
  return `cf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
