import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  addCategory,
  addLocation,
  createItem,
  findByCode,
  getActiveWarehouseId,
  getItem,
  getImageDataUrl,
  listCategories,
  listFieldTemplates,
  listLocations,
  saveImageDataUrl,
  updateItem,
} from '../db';
import {
  emptyItem,
  parseDateInput,
  toDateInput,
  type CustomField,
  type InventoryItem,
  type InventoryItemInput,
} from '../types';
import { navigate } from '../router';
import { resolveExpiryFromProdAndShelf } from '../lib/dates';
import { fileToDataUrl } from '../lib/files';
import { showToast } from '../lib/ui';
import { decodeFromImage } from '../lib/scan-web';

function Picker({
  label,
  value,
  options,
  placeholder,
  onPick,
  onCreate,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onPick: (v: string) => void;
  onCreate: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const matched = options.includes(q.trim());
  return (
    <div className="field">
      <span>{label}</span>
      <button type="button" className="select-like" onClick={() => setOpen((v) => !v)}>
        {value || placeholder}
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="cat-panel glass">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索或输入新项"
            autoFocus
          />
          <div className="cat-list">
            {options
              .filter((c) => !q || c.includes(q))
              .map((c) => (
                <button
                  key={c}
                  type="button"
                  className={c === value ? 'cat-opt active' : 'cat-opt'}
                  onClick={() => {
                    onPick(c);
                    setQ('');
                    setOpen(false);
                  }}
                >
                  {c}
                  {c === value && <span className="ok">✓</span>}
                </button>
              ))}
            {q.trim() && !matched && (
              <button
                type="button"
                className="cat-opt new"
                onClick={() => {
                  onCreate(q.trim());
                  setQ('');
                  setOpen(false);
                }}
              >
                新建「{q.trim()}」
                <span className="new-tag">新建</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function EditItemPage({
  id,
  initialCode,
  from,
}: {
  id?: string;
  initialCode?: string | null;
  from?: string;
}) {
  const wid = getActiveWarehouseId() ?? '';
  const backTo = from?.startsWith('item/') ? from : id ? `item/${id}` : 'items';
  const [form, setForm] = useState<InventoryItemInput>(() => {
    const base = emptyItem(wid);
    base.customFields = listFieldTemplates().map((t) => ({
      key: t.key,
      label: t.label,
      value: '',
    }));
    if (initialCode) return { ...base, code: initialCode, codeType: 'OTHER' };
    return base;
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  /** raw YYYYMMDD for date inputs */
  const [dateRaw, setDateRaw] = useState<{
    prod: string;
    shelf: string;
    exp: string;
    near?: string;
  }>({ prod: '', shelf: '', exp: '', near: '' });

  const categories = useMemo(() => listCategories(), [form.category]);
  const locations = useMemo(() => listLocations(), [form.location]);
  const templateKeys = useMemo(() => new Set(listFieldTemplates().map((t) => t.key)), []);

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
        location: row.location ?? '',
        note: row.note,
        qty: row.qty,
        unit: row.unit,
        purchasePrice: row.purchasePrice,
        salePrice: row.salePrice,
        currency: row.currency,
        lowStockAt: row.lowStockAt,
        productionDate: row.productionDate,
        shelfLifeMonths: row.shelfLifeMonths,
        expiryDate: row.expiryDate,
        nearExpiryMonths: row.nearExpiryMonths ?? 1,
        customFields: mergeTemplates(row.customFields),
        imageIds: row.imageIds,
      });
      setDateRaw({
        prod: row.productionDate ? toDateInput(parseDateInput(row.productionDate)) : '',
        shelf: row.shelfLifeMonths != null ? String(row.shelfLifeMonths) : '',
        exp: row.expiryDate ? toDateInput(parseDateInput(row.expiryDate)) : '',
        near: row.nearExpiryMonths != null ? String(row.nearExpiryMonths) : '',
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

  function applyDates(
    nextRaw: { prod: string; shelf: string; exp: string; near?: string },
    _edited: 'prod' | 'shelf' | 'exp',
  ) {
    const { productionDate: prod, shelfLifeMonths: shelf, expiryDate: exp } =
      resolveExpiryFromProdAndShelf(nextRaw.prod, nextRaw.shelf);

    patch('productionDate', prod);
    patch('shelfLifeMonths', shelf);
    patch('expiryDate', exp);

    const rawOut = { ...nextRaw };
    if (prod) rawOut.prod = prod;
    if (shelf != null) rawOut.shelf = String(shelf);
    if (exp) rawOut.exp = exp;
    setDateRaw(rawOut);
  }

  function removePhoto(i: number) {
    setPhotos((p) => p.filter((_, j) => j !== i));
  }

  function movePhoto(i: number, dir: -1 | 1) {
    setPhotos((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      const t = next[i];
      next[i] = next[j];
      next[j] = t;
      return next;
    });
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

  function onScanCode() {
    navigate({ name: 'scan' });
    showToast('扫码后选择「绑定为新物品」', 'info');
  }

  function addTempField() {
    patch('customFields', [
      ...(form.customFields ?? []),
      { key: `tmp-${Date.now().toString(36)}`, label: '', value: '' },
    ]);
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
      // persist only NEW photos; keep current order
      const existingIds = new Set(form.imageIds ?? []);
      const imageIds: string[] = [];
      const keptOld: string[] = [];
      for (const dataUrl of photos) {
        let matched: string | null = null;
        for (const id of existingIds) {
          if (getImageDataUrl(id) === dataUrl) {
            matched = id;
            break;
          }
        }
        if (matched) keptOld.push(matched);
        else imageIds.push(saveImageDataUrl(dataUrl));
      }
      const finalImageIds = [...keptOld, ...imageIds];
      const payload: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'deleted'> = {
        warehouseId: wid,
        code: form.code?.trim() || null,
        codeType: form.code ? (form.codeType ?? 'OTHER') : null,
        name: form.name.trim(),
        category: form.category || '其他',
        location: form.location || '',
        note: form.note,
        qty: Number(form.qty) || 0,
        unit: form.unit || '件',
        purchasePrice: form.purchasePrice == null ? null : Number(form.purchasePrice),
        salePrice: form.salePrice == null ? null : Number(form.salePrice),
        currency: form.currency || 'CNY',
        lowStockAt: Number(form.lowStockAt) || 0,
        productionDate: form.productionDate,
        shelfLifeMonths: form.shelfLifeMonths,
        expiryDate: form.expiryDate,
        nearExpiryMonths: form.nearExpiryMonths ?? 1,
        customFields: (form.customFields ?? []).filter((f) => f.label.trim() || f.value.trim()),
        imageIds: finalImageIds,
      };
      const saved = id ? updateItem(id, payload) : createItem(payload);
      showToast('已保存', 'success');
      // replace edit entry so back from detail returns to list/detail parent, not edit
      navigate({ name: 'detail', id: saved.id }, { replace: true });
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

  const customFields = form.customFields ?? [];
  const fixedFields = customFields.filter((f) => templateKeys.has(f.key));
  const tempFields = customFields.filter((f) => f.key.startsWith('tmp-'));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{id ? '编辑' : '新建'}</p>
          <h1>{id ? '修改物品' : '添加物品'}</h1>
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            if (backTo.startsWith('item/')) navigate({ name: 'detail', id: backTo.slice(5) }, { replace: true });
            else if (id) navigate({ name: 'detail', id }, { replace: true });
            else navigate({ name: 'items' }, { replace: true });
          }}
        >
          取消
        </button>
      </header>

      <form className="form" onSubmit={onSubmit}>
        <label className="field">
          <span>
            名称
            <span className="req-star" aria-hidden="true">
              *
            </span>
          </span>
          <input value={form.name} onChange={(e) => patch('name', e.target.value)} required />
        </label>

        <div className="field">
          <span>条码</span>
          <input
            value={form.code ?? ''}
            onChange={(e) => patch('code', e.target.value || null)}
            placeholder="手动输入或扫描"
            className="mono"
          />
          <div className="btn-pair">
            <button type="button" className="btn-ghost" onClick={onScanCode}>
              扫码
            </button>
            <label className="btn-ghost file-btn">
              相册识别
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

        <Picker
          label="分类"
          value={form.category}
          options={categories}
          placeholder="选择分类"
          onPick={(c) => patch('category', c)}
          onCreate={(c) => {
            addCategory(c);
            patch('category', c);
          }}
        />

        <Picker
          label="位置"
          value={form.location}
          options={locations}
          placeholder="选择或新建位置"
          onPick={(c) => patch('location', c)}
          onCreate={(c) => {
            addLocation(c);
            patch('location', c);
          }}
        />

        <div className="eq3">
          <label className="field stacked">
            <span>数量</span>
            <input type="number" min={0} value={form.qty} onChange={(e) => patch('qty', Number(e.target.value))} />
          </label>
          <label className="field stacked">
            <span>单位</span>
            <input value={form.unit} onChange={(e) => patch('unit', e.target.value)} />
          </label>
          <label className="field stacked">
            <span>低库存</span>
            <input
              type="number"
              min={0}
              value={form.lowStockAt}
              onChange={(e) => patch('lowStockAt', Number(e.target.value))}
            />
          </label>
        </div>

        <div className="eq3">
          <label className="field stacked">
            <span>币种</span>
            <input value={form.currency} onChange={(e) => patch('currency', e.target.value)} />
          </label>
          <label className="field stacked">
            <span>购入价</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.purchasePrice ?? ''}
              onChange={(e) =>
                patch('purchasePrice', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </label>
          <label className="field stacked">
            <span>售价</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.salePrice ?? ''}
              onChange={(e) =>
                patch('salePrice', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </label>
        </div>

        <div className="eq3">
          <label className="field stacked">
            <span>生产日期</span>
            <input
              className="mono"
              inputMode="numeric"
              placeholder="20260911"
              value={dateRaw.prod}
              maxLength={8}
              onChange={(e) => {
                const next = { ...dateRaw, prod: e.target.value.replace(/\D/g, '').slice(0, 8) };
                setDateRaw(next);
                applyDates(next, 'prod');
              }}
            />
          </label>
          <label className="field stacked">
            <span>保质期(月)</span>
            <input
              className="mono"
              inputMode="numeric"
              placeholder="24"
              value={dateRaw.shelf}
              maxLength={4}
              onChange={(e) => {
                const next = { ...dateRaw, shelf: e.target.value.replace(/\D/g, '').slice(0, 4) };
                setDateRaw(next);
                applyDates(next, 'shelf');
              }}
            />
          </label>
          <label className="field stacked">
            <span>临期阈值(月)</span>
            <input
              className="mono"
              inputMode="numeric"
              placeholder="1"
              value={dateRaw.near ?? (form.nearExpiryMonths != null ? String(form.nearExpiryMonths) : '')}
              maxLength={3}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 3);
                setDateRaw({ ...dateRaw, near: v });
                patch('nearExpiryMonths', v === '' ? null : Number(v));
              }}
            />
          </label>
        </div>

        <label className="field">
          <span>备注</span>
          <textarea rows={3} value={form.note} onChange={(e) => patch('note', e.target.value)} />
        </label>

        {fixedFields.length > 0 && (
          <div className="field">
            <div className="field-head">
              <span>固定自定义字段</span>
              <span className="field-sub">设置中可排序</span>
            </div>
            {fixedFields.map((f) => (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                <input
                  value={f.value}
                  onChange={(e) =>
                    updateCustomField(customFields.indexOf(f), { value: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
        )}

        <div className="field">
          <div className="field-head">
            <span>临时字段</span>
            <button type="button" className="btn-ghost sm" onClick={addTempField}>
              + 添加
            </button>
          </div>
          {tempFields.map((f) => (
            <div key={f.key} className="custom-row">
              <input
                placeholder="名称"
                value={f.label}
                onChange={(e) =>
                  updateCustomField(customFields.indexOf(f), { label: e.target.value })
                }
              />
              <input
                placeholder="值"
                value={f.value}
                onChange={(e) =>
                  updateCustomField(customFields.indexOf(f), { value: e.target.value })
                }
              />
              <button
                type="button"
                className="icon-btn-sm danger"
                onClick={() => removeCustomField(customFields.indexOf(f))}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="field">
          <span>图片</span>
          <div className="btn-pair">
            <label className="btn-ghost file-btn">
              相册选择
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void onPhotos(e.target.files)}
              />
            </label>
            <label className="btn-primary file-btn">
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
                <div key={`${i}-${src.slice(0, 24)}`} className="gallery-item">
                  <img src={src} alt="" />
                  <button
                    type="button"
                    className="gallery-del"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removePhoto(i);
                    }}
                    aria-label="删除图片"
                  >
                    ×
                  </button>
                  <div className="gallery-tools">
                    <button
                      type="button"
                      className="gallery-tool"
                      disabled={i === 0}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        movePhoto(i, -1);
                      }}
                      aria-label="前移"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="gallery-tool"
                      disabled={i === photos.length - 1}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        movePhoto(i, 1);
                      }}
                      aria-label="后移"
                    >
                      →
                    </button>
                  </div>
                </div>
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

function mergeTemplates(existing: CustomField[] = []) {
  const templates = listFieldTemplates();
  const map = new Map(existing.map((f) => [f.label, f]));
  const out: CustomField[] = [];
  for (const t of templates) {
    out.push(map.get(t.label) ?? { key: t.key, label: t.label, value: '' });
    map.delete(t.label);
  }
  for (const f of map.values()) out.push(f);
  return out;
}
