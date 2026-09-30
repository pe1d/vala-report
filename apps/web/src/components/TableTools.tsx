/**
 * Tìm kiếm + phân trang dùng chung cho mọi bảng.
 *  - Bảng quản trị (dữ liệu nhỏ, đã tải hết): useTableView lọc và cắt trang ngay trên trình duyệt.
 *  - Bảng báo cáo (dữ liệu lớn): trang báo cáo gửi `q`, `page`, `page_size` lên máy chủ, chỉ dùng SearchBox + Pager.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Input, Select } from './ui';

export const PAGE_SIZES = [10, 20, 50, 100] as const;

/** Bỏ dấu + chữ thường để "cong viec" tìm được "Công việc". */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Ô tìm kiếm; gõ xong 300ms mới gọi onChange (đỡ gọi máy chủ mỗi phím). Esc để xoá. */
export function SearchBox({ value, onChange, placeholder = 'Tìm trong bảng…', label = 'Tìm trong bảng', delay = 300 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; label?: string; delay?: number;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), delay);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative w-full sm:w-72">
      <span aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      </span>
      <Input type="search" aria-label={label} placeholder={placeholder} value={text} className="w-full !min-w-0 pl-8"
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setText(''); onChange(''); } }} />
    </div>
  );
}

/** Thanh phân trang: "1–20 trên 57", trang trước/sau, số dòng mỗi trang. Ẩn nút khi chỉ có một trang. */
export function Pager({ page, pageSize, total, onPage, onPageSize, unit = 'dòng' }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize?: (n: number) => void; unit?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  if (total <= PAGE_SIZES[0]) return <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{total.toLocaleString('vi-VN')} {unit}</p>;
  return (
    <nav aria-label="Phân trang" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
      <span className="tabular-nums">{from.toLocaleString('vi-VN')}–{to.toLocaleString('vi-VN')} trên {total.toLocaleString('vi-VN')} {unit}</span>
      <span className="flex-1" />
      {onPageSize && (
        <label className="flex items-center gap-2">
          <span>Mỗi trang</span>
          <Select aria-label="Số dòng mỗi trang" className="!min-w-0 w-20" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </label>
      )}
      {pages > 1 && (
        <span className="flex items-center gap-1.5">
          <Button disabled={page <= 1} onClick={() => onPage(1)} aria-label="Trang đầu">«</Button>
          <Button disabled={page <= 1} onClick={() => onPage(page - 1)}>Trước</Button>
          <span className="px-1 tabular-nums">Trang {page}/{pages}</span>
          <Button disabled={page >= pages} onClick={() => onPage(page + 1)}>Sau</Button>
          <Button disabled={page >= pages} onClick={() => onPage(pages)} aria-label="Trang cuối">»</Button>
        </span>
      )}
    </nav>
  );
}

/**
 * Lọc + phân trang phía trình duyệt cho bảng đã tải hết dữ liệu. `text(row)` trả chữ để tìm (tên, mã, trạng thái…).
 * Đổi từ khoá / số dòng ⇒ về trang 1; dữ liệu co lại ⇒ không kẹt ở trang rỗng.
 */
export function useTableView<T>(rows: T[] | undefined, text: (row: T) => string, initialPageSize = 20) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const filtered = useMemo(() => {
    const all = rows ?? [];
    const needle = fold(q.trim());
    return needle ? all.filter((r) => fold(text(r)).includes(needle)) : all;
  }, [rows, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  return {
    q, setQ: (v: string) => { setQ(v); setPage(1); },
    page: cur, setPage, pageSize, setPageSize: (n: number) => { setPageSize(n); setPage(1); },
    rows: filtered.slice((cur - 1) * pageSize, cur * pageSize), total: filtered.length, all: rows?.length ?? 0,
  };
}

/** Thanh trên bảng: ô tìm + phần tuỳ chọn khác (bộ lọc, nút) cùng một hàng. */
export function TableToolbar({ q, onQ, placeholder, children }: { q: string; onQ: (v: string) => void; placeholder?: string; children?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <SearchBox value={q} onChange={onQ} placeholder={placeholder} delay={0} />
      {children}
    </div>
  );
}

/** Dòng "không khớp" thay cho bảng rỗng khi đang tìm. */
export function NoMatch({ q, onClear }: { q: string; onClear: () => void }) {
  return (
    <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      Không có dòng nào khớp “{q}”. <button type="button" className="text-blue-700 underline dark:text-blue-400" onClick={onClear}>Xoá tìm kiếm</button>
    </p>
  );
}

// ---- nhóm theo một khoá (vd hệ thống nguồn) -----------------------------------------------------

export interface Group<T> { key: string; label: string; rows: T[] }

/** Chia danh sách thành nhóm theo khoá, nhóm xếp theo tên, giữ nguyên thứ tự dòng trong nhóm. */
export function groupRows<T>(rows: T[], key: (r: T) => string, label: (r: T) => string): Group<T>[] {
  const m = new Map<string, Group<T>>();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k)) m.set(k, { key: k, label: label(r), rows: [] });
    m.get(k)!.rows.push(r);
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

/** Hàng chip chọn nhóm: "Tất cả" + từng nhóm kèm số lượng. */
export function GroupChips({ groups, value, onChange, allLabel = 'Tất cả' }: {
  groups: Array<{ key: string; label: string; n: number }>; value: string; onChange: (k: string) => void; allLabel?: string;
}) {
  if (groups.length < 2) return null;
  const total = groups.reduce((a, g) => a + g.n, 0);
  const chip = (k: string, label: string, n: number) => (
    <button key={k || '_all'} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${value === k
        ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-200'
        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-slate-100'}`}>
      {label}<span className="tabular-nums text-xs opacity-70">{n}</span>
    </button>
  );
  return (
    <div role="group" aria-label="Lọc theo nhóm" className="flex flex-wrap gap-2">
      {chip('', allLabel, total)}
      {groups.map((g) => chip(g.key, g.label, g.n))}
    </div>
  );
}

/** Một nhóm có tiêu đề, bấm để thu gọn / mở; trạng thái thu gọn nhớ theo trình duyệt. */
export function GroupSection({ id, title, count, unit, extra, children }: {
  id: string; title: string; count: number; unit: string; extra?: ReactNode; children: ReactNode;
}) {
  const KEY = `vala.nhom.${id}`;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } });
  const toggle = () => { setOpen(!open); try { localStorage.setItem(KEY, open ? '0' : '1'); } catch { /* bỏ qua */ } };
  return (
    <section className="mb-6" aria-labelledby={`nhom-${id}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" id={`nhom-${id}`} aria-expanded={open} onClick={toggle}
          className="inline-flex items-center gap-2 rounded-md py-1 pr-2 text-base font-semibold text-slate-900 hover:text-blue-700 dark:text-slate-100 dark:hover:text-blue-300">
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            className={`transition-transform ${open ? 'rotate-90' : ''}`}><path d="m9 6 6 6-6 6" /></svg>
          {title}
        </button>
        <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">{count.toLocaleString('vi-VN')} {unit}</span>
        {extra}
      </div>
      {open && children}
    </section>
  );
}

/** Cắt trang trong một nhóm (nhóm dài hơn pageSize mới hiện thanh phân trang). */
export function usePaged<T>(rows: T[], initial = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initial);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pages);
  return { page: cur, setPage, pageSize, setPageSize: (n: number) => { setPageSize(n); setPage(1); }, rows: rows.slice((cur - 1) * pageSize, cur * pageSize), total: rows.length };
}
