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
