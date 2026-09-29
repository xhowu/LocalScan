/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  addCategory,
  addLocation,
  countChildren,
  createItem,
  findSameBatch,
  getActiveWarehouseId,
  getImageDataUrl,
  getItem,
  listByCode,
  listCategories,
  listFieldTemplates,
  listLocations,
  normalizeParentId,
  saveImageDataUrl,
  updateItem,
} from '../db';
import {
  batchLabel,
  emptyItem,
  parseDateInput,
  toDateInput,
  type CustomField,
  type InventoryItem,
  type InventoryItemInput,
} from '../types';
import { navigate } from '../router';
import { resolveExpiryFromProdAndShelf } from '../lib/dates';
import { addMonths } from '../types';
import { fileToDataUrl } from '../lib/files';
import { showToast } from '../lib/ui';
import { decodeFromImage } from '../lib/scan-web';
import {
  draftFromLabel,
  mergeTempFields,
  peekPendingDraft,
  setPendingDraft,
  type ItemDraft,
} from '../lib/draft';
import { parseLabelText } from '../lib/label-parse';
import { isOcrSupported, ocrFromSource } from '../services/ocr';
import { ImageViewer, type ViewerOrigin } from '../lib/ImageViewer';
import { rotateDataUrl } from '../lib/image-ops';

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
      <button type="button" className="select-like pressable" onClick={() => setOpen((v) => !v)}>
        {value || placeholder}
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="cat-panel glass pop-in">
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

/** 编辑页的图片：带 id 才能「原址旋转」——只换像素不换 key，不留孤儿数据 */
type EditablePhoto = { dataUrl: string; id: string | null };

/** 把草稿合并进表单初始值 */
function applyDraft(base: InventoryItemInput, d: ItemDraft | null): InventoryItemInput {
  if (!d) return base;
  const next = { ...base };
  if (d.name) next.name = d.name;
  if (d.code) {
    next.code = d.code;
    next.codeType = next.codeType ?? 'OTHER';
  }
  if (d.category) next.category = d.category;
  if (d.productionDate) next.productionDate = d.productionDate;
  if (d.shelfLifeMonths != null) next.shelfLifeMonths = d.shelfLifeMonths;
  if (d.expiryDate) next.expiryDate = d.expiryDate;
  next.customFields = mergeTempFields(next.customFields ?? [], d.tempFields);
  return next;
}

export function EditItemPage({
  id,
  initialCode,
  from,
  parentId,
}: {
  id?: string;
  initialCode?: string | null;
  from?: string;
  parentId?: string;
}) {
  const wid = getActiveWarehouseId() ?? '';
  const backTo = from?.startsWith('item/') ? from : id ? `item/${id}` : 'items';

  // peek 是幂等的：StrictMode 双渲染也不会把草稿吃掉，挂载后再清空
  const draftRef = useRef<ItemDraft | null>(peekPendingDraft());
  const draft = draftRef.current;

  const [form, setForm] = useState<InventoryItemInput>(() => {
    const base = emptyItem(wid);
    base.customFields = listFieldTemplates().map((t) => ({
      key: t.key,
      label: t.label,
      value: '',
    }));
    // 子项不能再挂子项：传进来的 parentId 若指向子项，自动上溯到根
    if (parentId) base.parentId = normalizeParentId(parentId);
    if (initialCode) {
      base.code = initialCode;
      base.codeType = 'OTHER';
    }
    return applyDraft(base, draft);
  });
  const [photos, setPhotos] = useState<EditablePhoto[]>(() =>
    (draft?.imageDataUrls ?? []).map((dataUrl) => ({ dataUrl, id: null })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrNotice, setOcrNotice] = useState<{ title: string; items: Array<[string, string]> } | null>(
    draft && (draft.sourceLabel || draft.tempFields.length)
      ? {
          title: `已从${draft.sourceLabel || '外部数据'}填入`,
          items: [
            ...(draft.name ? ([['名称', draft.name]] as Array<[string, string]>) : []),
            ...(draft.productionDate ? ([['生产日期', draft.productionDate]] as Array<[string, string]>) : []),
            ...(draft.shelfLifeMonths != null
              ? ([['保质期', `${draft.shelfLifeMonths} 个月`]] as Array<[string, string]>)
              : []),
            ...draft.tempFields.map((f) => [f.label, f.value] as [string, string]),
          ],
        }
      : null,
  );
  const [loading, setLoading] = useState(!!id);
  const [viewer, setViewer] = useState<{ index: number; origin: ViewerOrigin | null } | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const rotatingRef = useRef(false);
  /** raw YYYYMMDD for date inputs */
  const [dateRaw, setDateRaw] = useState<{
    prod: string;
    shelf: string;
    exp: string;
    near?: string;
  }>(() => ({
    prod: draft?.productionDate ? toDateInput(parseDateInput(draft.productionDate)) : '',
    shelf: draft?.shelfLifeMonths != null ? String(draft.shelfLifeMonths) : '',
    exp: draft?.expiryDate ? toDateInput(parseDateInput(draft.expiryDate)) : '',
    near: '',
  }));

  useEffect(() => {
    // 草稿是一次性的，进页面即消费掉
    setPendingDraft(null);
  }, []);

  /* 日期输入的即时校验（v1.9.1 规则）：
     年 4 位（0000–9999）· 月 01–12 · 日按当月天数（含闰年）；
     无效分"月份不存在 / 天数不存在 / 日期不存在"三档红字；
     晚于今天提示"超前生产"；有效则绿字回显推算的截止日期 */
  const dateHints = useMemo(() => {
    const hints: Array<{ text: string; tone: 'err' | 'ok' }> = [];
    const raw = dateRaw.prod;
    if (raw.length === 0) return hints;
    if (raw.length < 8) {
      hints.push({
        tone: 'err',
        text: `生产日期还差 ${8 - raw.length} 位，凑满 8 位自动推算截止日期`,
      });
      return hints;
    }
    const y = Number(raw.slice(0, 4));
    const mo = Number(raw.slice(4, 6));
    const d = Number(raw.slice(6, 8));
    const monthInvalid = mo < 1 || mo > 12;
    // 当月天数（闰年已含在内）；月份非法时按 31 天上限判断"日"
    const daysInMonth = monthInvalid ? 31 : new Date(y, mo, 0).getDate();
    const dayInvalid = d < 1 || d > daysInMonth;
    if (monthInvalid && dayInvalid) {
      hints.push({
        tone: 'err',
        text: `生产日期无效，${mo}月${d}日日期不存在，不参与保存`,
      });
    } else if (monthInvalid) {
      hints.push({ tone: 'err', text: `生产日期无效，${mo}月月份不存在，不参与保存` });
    } else if (dayInvalid) {
      const mo2 = String(mo).padStart(2, '0');
      const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      if (mo === 2 && d === 29 && !isLeap) {
        hints.push({ tone: 'err', text: '生产日期无效，非闰年02月无29日，不参与保存' });
      } else {
        hints.push({ tone: 'err', text: `生产日期无效，${mo2}月无${d}日，不参与保存` });
      }
    } else {
      const dt = new Date(y, mo - 1, d, 12, 0, 0);
      const p = (n: number) => String(n).padStart(2, '0');
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      if (dt.getTime() > today.getTime()) {
        /*
         * 超前量按"今天 → 输入日期"的年月日间隔显示（借位换算）：
         * 如今天 2026-09-24、输入 2026-09-30 → 超前 0000年00月06日
         */
        let iy = y - today.getFullYear();
        let im = mo - (today.getMonth() + 1);
        let id = d - today.getDate();
        if (id < 0) {
          im -= 1;
          id += new Date(y, mo - 1, 0).getDate(); // 借输入日期上一个整月的天数
        }
        if (im < 0) {
          iy -= 1;
          im += 12;
        }
        hints.push({
          tone: 'err',
          text: `晚于今天，超前生产${String(Math.max(0, iy)).padStart(4, '0')}年${String(
            Math.max(0, im),
          ).padStart(2, '0')}月${String(Math.max(0, id)).padStart(2, '0')}日，请核对`,
        });
      } else {
        const shelf = Number(dateRaw.shelf);
        if (shelf > 0) {
          const exp = addMonths(dt, shelf);
          hints.push({
            tone: 'ok',
            text: `截止日期 ${exp.getFullYear()}年${p(exp.getMonth() + 1)}月${p(exp.getDate())}日`,
          });
        } else {
          hints.push({ tone: 'ok', text: `生产日期 ${y}年${p(mo)}月${p(d)}日 有效` });
        }
      }
    }
    if (dateRaw.shelf && !(Number(dateRaw.shelf) > 0)) {
      hints.push({ tone: 'err', text: '保质期需为正整数月，留空表示无保质期' });
    }
    return hints;
  }, [dateRaw.prod, dateRaw.shelf]);

  const categories = useMemo(() => listCategories(), [form.category]);
  const locations = useMemo(() => listLocations(), [form.location]);
  const templateKeys = useMemo(() => new Set(listFieldTemplates().map((t) => t.key)), []);

  /** 同条码的其它物品（排除自己） */
  const codeMatches = useMemo(
    () => (form.code ? listByCode(form.code, wid).filter((i) => i.id !== id) : []),
    [form.code, wid, id, loading],
  );
  const rootCandidate = useMemo(() => {
    // 优先找真正的父项（无 parentId）；一条都没有时不要退化成「挂在某个子项下」，
    // 而是把命中的那条上溯到它的根，上溯不到就返回 null（成为独立物品）。
    const root = codeMatches.find((i) => !i.parentId);
    if (root) return root;
    const first = codeMatches[0];
    if (!first) return null;
    const rid = normalizeParentId(first.id);
    return rid ? (codeMatches.find((i) => i.id === rid) ?? null) : null;
  }, [codeMatches]);
  const dupBatch = useMemo(
    () =>
      form.code
        ? findSameBatch(form.code, form.productionDate, form.expiryDate, wid, id)
        : null,
    [form.code, form.productionDate, form.expiryDate, wid, id],
  );

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
        parentId: row.parentId ?? null,
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
      const loaded: EditablePhoto[] = [];
      for (const key of row.imageIds) {
        const u = getImageDataUrl(key);
        if (u) loaded.push({ dataUrl: u, id: key });
      }
      setPhotos(loaded);
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

  function openViewer(i: number) {
    const el = galleryRef.current?.querySelectorAll('img')[i];
    const rect = el?.getBoundingClientRect();
    setViewer({
      index: i,
      origin: rect ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height } : null,
    });
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
      setPhotos((p) => [...p, { dataUrl, id: null }]);
    }
  }

  async function onCapture(file: File | null) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setPhotos((p) => [...p, { dataUrl, id: null }]);
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

  /**
   * 编辑页的旋转是「编辑旋转」：把结果烘焙进图片本身。
   * 已有 key 的原址覆盖，所以物品详情页立刻就是旋转后的图。
   */
  async function rotatePhoto(index: number) {
    if (rotatingRef.current) return;
    const photo = photos[index];
    if (!photo) return;
    rotatingRef.current = true;
    try {
      const next = await rotateDataUrl(photo.dataUrl, 90);
      if (photo.id) saveImageDataUrl(next, photo.id);
      setPhotos((p) => p.map((v, i) => (i === index ? { ...v, dataUrl: next } : v)));
      showToast('已旋转并写回图片', 'success');
    } catch {
      showToast('旋转失败', 'error');
    } finally {
      rotatingRef.current = false;
    }
  }

  /** 拍照/选图 → ML Kit 文字识别 → 填入核心字段与临时字段 */
  async function runOcr(source: 'camera' | 'photos') {
    if (ocrBusy) return;
    if (!isOcrSupported()) {
      showToast('文字识别需要在 App 内使用', 'error');
      return;
    }
    setOcrBusy(true);
    showToast('正在识别图片文字…', 'info');
    try {
      const out = await ocrFromSource(source);
      const parsed = parseLabelText(out.lines);
      const d = draftFromLabel(parsed, '图片文字识别');

      const applied: Array<[string, string]> = [];
      setForm((f) => {
        const next = { ...f };
        if (d.name && !f.name.trim()) {
          next.name = d.name;
          applied.push(['名称', d.name]);
        }
        if (d.code && !f.code) {
          next.code = d.code;
          next.codeType = 'OTHER';
          applied.push(['条码', d.code]);
        }
        if (d.productionDate) {
          next.productionDate = d.productionDate;
          applied.push(['生产日期', d.productionDate]);
        }
        if (d.shelfLifeMonths != null) {
          next.shelfLifeMonths = d.shelfLifeMonths;
          applied.push(['保质期', `${d.shelfLifeMonths} 个月`]);
        }
        if (d.expiryDate) {
          next.expiryDate = d.expiryDate;
          applied.push(['截止日期', d.expiryDate]);
        }
        next.customFields = mergeTempFields(next.customFields ?? [], d.tempFields);
        for (const tf of d.tempFields) applied.push([tf.label, tf.value]);
        if (!applied.length) applied.push(['原始文本', out.lines.slice(0, 3).join(' / ') || '（未识别到文字）']);
        return next;
      });

      // 同步日期输入框
      setDateRaw((r) => ({
        ...r,
        prod: d.productionDate ? toDateInput(parseDateInput(d.productionDate)) : r.prod,
        shelf: d.shelfLifeMonths != null ? String(d.shelfLifeMonths) : r.shelf,
        exp: d.expiryDate ? toDateInput(parseDateInput(d.expiryDate)) : r.exp,
      }));

      if (out.imageDataUrl) {
        const shot = out.imageDataUrl;
        setPhotos((p) => [...p, { dataUrl: shot, id: null }]);
      }
      setOcrNotice({ title: '已从图片文字识别填入', items: applied });
      showToast('识别完成，请核对后保存', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|canceled|取消/i.test(msg)) return;
      showToast(`识别失败：${msg}`, 'error');
    } finally {
      setOcrBusy(false);
    }
  }

  function onScanCode() {
    navigate({ name: 'scan' });
    showToast('扫码后选择「新建子项」或「绑定新物品」', 'info');
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

    setSaving(true);
    try {
      // 已有 key 的图片沿用原 key（旋转是原址覆盖），只有新图片才落盘
      const finalImageIds = photos.map((p) => p.id ?? saveImageDataUrl(p.dataUrl));
      const payload: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'deleted'> = {
        warehouseId: wid,
        // 归一，保证永远只有两层（父项 + 子项）
        parentId: normalizeParentId(form.parentId),
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
  const tempFields = customFields.filter((f) => !templateKeys.has(f.key));
  const childCount = id ? countChildren(id) : 0;
  const parent = form.parentId ? getItem(form.parentId) : null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{id ? '编辑' : form.parentId ? '新建子项' : '新建'}</p>
          <h1>{id ? '修改物品' : form.parentId ? '添加子项批次' : '添加物品'}</h1>
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            if (backTo.startsWith('item/'))
              navigate({ name: 'detail', id: backTo.slice(5) }, { replace: true });
            else if (id) navigate({ name: 'detail', id }, { replace: true });
            else navigate({ name: 'items' }, { replace: true });
          }}
        >
          取消
        </button>
      </header>

      <form className="form" ref={formRef} onSubmit={onSubmit}>
        {ocrNotice && (
          <div className="ocr-notice glass-in pop-in">
            <div className="ocr-notice-head">
              <p className="ocr-notice-title">{ocrNotice.title}</p>
              <button
                type="button"
                className="icon-btn-sm"
                onClick={() => setOcrNotice(null)}
                aria-label="关闭提示"
              >
                ×
              </button>
            </div>
            <dl className="ocr-notice-list">
              {ocrNotice.items.slice(0, 10).map(([k, v], i) => (
                <div key={`${k}-${i}`}>
                  <dt>{k}</dt>
                  <dd className="ellipsis">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="ocr-notice-tip">核心参数已填入上方对应字段，其余信息已放入临时字段。</p>
            <div className="ocr-notice-actions">
              <button
                type="button"
                className="btn-ghost sm pressable"
                onClick={() => formRef.current?.requestSubmit()}
              >
                直接保存
              </button>
            </div>
          </div>
        )}

        <div className="ocr-bar">
          <button
            type="button"
            className="btn-primary pressable"
            disabled={ocrBusy}
            onClick={() => void runOcr('camera')}
          >
            {ocrBusy ? '识别中…' : '拍照识别信息'}
          </button>
          <button
            type="button"
            className="btn-ghost pressable"
            disabled={ocrBusy}
            onClick={() => void runOcr('photos')}
          >
            相册识别信息
          </button>
        </div>
        <p className="ocr-bar-hint">
          拍下包装正面，自动识别产品名称 / 规格 / 净含量 / 保质期 / 生产日期等并填入。
        </p>

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
            <button type="button" className="btn-ghost pressable" onClick={onScanCode}>
              扫码
            </button>
            <label className="btn-ghost file-btn pressable">
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

        {codeMatches.length > 0 && !id && (
          <div className="batch-notice glass-in pop-in">
            <p className="batch-notice-title">
              条码 {form.code} 在本仓库已有 {codeMatches.length} 个物品
            </p>
            <p className="batch-notice-desc">
              同一商品的不同日期或批次，建议作为子项归入；也可以独立新建一条记录。
            </p>
            <div className="chip-row">
              {rootCandidate && (
                <button
                  type="button"
                  className={form.parentId ? 'chip active' : 'chip'}
                  onClick={() => patch('parentId', rootCandidate.id)}
                >
                  作为子项归入「{rootCandidate.name}」
                </button>
              )}
              <button
                type="button"
                className={form.parentId ? 'chip' : 'chip active'}
                onClick={() => patch('parentId', null)}
              >
                独立新建
              </button>
            </div>
            {rootCandidate && !form.parentId && (
              <button
                type="button"
                className="batch-pick pressable"
                onClick={() => patch('parentId', rootCandidate.id)}
              >
                归入 · {rootCandidate.name}（{batchLabel(rootCandidate)}）
              </button>
            )}
            {dupBatch && (
              <p className="batch-dup-warn">
                已有相同日期批次的「{dupBatch.name}」（{batchLabel(dupBatch)}），请确认是否重复。
              </p>
            )}
          </div>
        )}

        {id && form.parentId && parent && (
          <div className="batch-notice glass-in">
            <p className="batch-notice-title">该物品是「{parent.name}」的子项</p>
            <p className="batch-notice-desc">
              子项用于记录同一商品条码下不同日期 / 批次的库存。
            </p>
            <div className="chip-row">
              <button
                type="button"
                className="chip"
                onClick={() => navigate({ name: 'detail', id: parent.id })}
              >
                查看父项
              </button>
              <button type="button" className="chip" onClick={() => patch('parentId', null)}>
                取消子项归属
              </button>
            </div>
          </div>
        )}

        {id && childCount > 0 && (
          <div className="batch-notice glass-in">
            <p className="batch-notice-title">该项下有 {childCount} 个子项批次</p>
            <p className="batch-notice-desc">删除本项时会连同子项一起删除。</p>
            <div className="chip-row">
              <button
                type="button"
                className="chip"
                onClick={() => navigate({ name: 'detail', id })}
              >
                查看子项
              </button>
              <button
                type="button"
                className="chip"
                onClick={() =>
                  navigate({
                    name: 'edit',
                    code: form.code,
                    parent: id,
                    from: `item/${id}`,
                  })
                }
              >
                + 新增子项
              </button>
            </div>
          </div>
        )}

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
            <input
              type="number"
              min={0}
              value={form.qty}
              onChange={(e) => patch('qty', Number(e.target.value))}
            />
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
              value={
                dateRaw.near ?? (form.nearExpiryMonths != null ? String(form.nearExpiryMonths) : '')
              }
              maxLength={3}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 3);
                setDateRaw({ ...dateRaw, near: v });
                patch('nearExpiryMonths', v === '' ? null : Number(v));
              }}
            />
          </label>
        </div>

        {dateHints.length > 0 && (
          <div className="field-hints" role="status">
            {dateHints.map((h) => (
              <p key={h.text} className={`field-hint ${h.tone === 'ok' ? 'ok' : ''}`}>
                {h.text}
              </p>
            ))}
          </div>
        )}

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
            <button type="button" className="btn-ghost sm pressable" onClick={addTempField}>
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
            <label className="btn-ghost file-btn pressable">
              相册选择
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void onPhotos(e.target.files)}
              />
            </label>
            <label className="btn-primary file-btn pressable">
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
            <div className="gallery" ref={galleryRef}>
              {photos.map((photo, i) => (
                <div key={`${i}-${photo.dataUrl.slice(0, 24)}`} className="gallery-item">
                  <button
                    type="button"
                    className="gallery-tap"
                    onClick={() => openViewer(i)}
                    aria-label={`查看第 ${i + 1} 张图片`}
                  >
                    <img src={photo.dataUrl} alt="" />
                  </button>
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

        <button type="submit" className="btn-primary full pressable" disabled={saving}>
          {saving ? '保存中…' : '保存物品'}
        </button>
      </form>

      {viewer && (
        <ImageViewer
          images={photos.map((p) => p.dataUrl)}
          startIndex={viewer.index}
          origin={viewer.origin}
          onClose={() => setViewer(null)}
          onRotateRequest={(i) => void rotatePhoto(i)}
        />
      )}
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
