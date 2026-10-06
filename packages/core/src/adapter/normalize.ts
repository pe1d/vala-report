import { createHash } from 'node:crypto';
import { Problem, L } from '../errors.js';
import type { OutputFieldSpec } from './spec.js';

export type Row = Record<string, string | number | null>;

function toDate(v: unknown, format?: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  // ASP.NET MVC: "/Date(1695600000000)/"
  const ms = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(s);
  if (ms) return new Date(Number(ms[1])).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  if (format === 'DD/MM/YYYY') {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (!m) return null;
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return iso ? iso[1]! : null;
}

function convert(v: unknown, f: OutputFieldSpec): string | number | null {
  if (v === null || v === undefined) return null;
  switch (f.type) {
    case 'int': {
      const n = typeof v === 'number' ? v : Number(String(v).trim());
      return Number.isFinite(n) && String(v).trim() !== '' ? Math.trunc(n) : null;
    }
    case 'date':
      return toDate(v, f.format);
    case 'string': {
      const s = typeof v === 'string' ? v.trim() : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return s === '' ? null : s;
    }
  }
}

export function normalizeItem(item: Record<string, unknown>, schema: OutputFieldSpec[]): Row {
  const row: Row = {};
  for (const f of schema) row[f.field] = convert(item[f.source], f);
  return row;
}

/**
 * Lệch schema: một trường trong schema_baseline_fields biến mất khỏi response.
 * Kiểm tra theo KHOÁ có mặt, không theo giá trị — trường có mà null là bình thường.
 */
export function detectDrift(items: unknown[], baseline: string[]): string[] {
  const missing = new Set<string>();
  for (const it of items) {
    if (!it || typeof it !== 'object') {
      missing.add('(bản ghi không phải object)');
      continue;
    }
    for (const f of baseline) if (!(f in it)) missing.add(f);
  }
  return [...missing];
}

export function assertNoDrift(items: unknown[], baseline: string[], where: string): void {
  const missing = detectDrift(items, baseline);
  if (missing.length) {
    throw new Problem('schema_drift', L('Hệ thống nguồn đã đổi cấu trúc dữ liệu', 'Source system has changed its data structure'), L(`${where}: thiếu ${missing.join(', ')}`, `${where}: missing ${missing.join(', ')}`), { missing });
  }
}

/** Băm đúng các trường nghiệp vụ khai báo, theo thứ tự khai báo ⇒ ổn định giữa các lần chạy. */
export function contentHash(row: Row, fields: string[]): Buffer {
  const picked: Record<string, unknown> = {};
  for (const f of fields) picked[f] = row[f] ?? null;
  return createHash('sha256').update(JSON.stringify(picked)).digest();
}
