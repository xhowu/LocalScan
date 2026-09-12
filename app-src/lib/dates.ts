import { addMonths, monthsBetween, parseDateInput, toDateInput } from '../types';

export type DateFields = {
  productionDate: string | null;
  shelfLifeMonths: number | null;
  expiryDate: string | null;
};

/**
 * Production date + shelf life (months) → expiry date.
 * Shelf recalculates on every positive integer; dates need 8 valid digits.
 */
export function resolveExpiryFromProdAndShelf(
  prodRaw: string,
  shelfRaw: string,
): DateFields {
  const prodOk = prodRaw.length === 8 && !!parseDateInput(prodRaw);
  const shelfNum = shelfRaw.trim() === '' ? null : Number(shelfRaw);
  const shelfOk = shelfNum != null && Number.isFinite(shelfNum) && shelfNum > 0;

  const prod = prodOk ? toDateInput(parseDateInput(prodRaw)!) : null;
  const shelf = shelfOk ? shelfNum : null;
  let exp: string | null = null;
  if (prod && shelf) {
    exp = toDateInput(addMonths(parseDateInput(prod)!, shelf));
  }
  return { productionDate: prod, shelfLifeMonths: shelf, expiryDate: exp };
}

/** Legacy import path: production + expiry → shelf months */
export function shelfFromProdAndExpiry(prod: string, exp: string): number | null {
  const p = parseDateInput(prod);
  const e = parseDateInput(exp);
  if (!p || !e) return null;
  const m = monthsBetween(p, e);
  return m > 0 ? m : null;
}
