/**
 * Tự cập nhật khi mở trang (không chờ lịch): hỏi máy chủ các nguồn dữ liệu của những báo cáo đang hiện; nguồn nào đã
 * cũ (mặc định > 15 phút) thì máy chủ lấy lại cho đúng người xem. Trong lúc chờ vẫn hiện số liệu cũ + dòng "Đang cập
 * nhật…"; xong thì tự tải lại số liệu. Máy chủ giới hạn theo người × nguồn nên F5 / nhiều tab không chạy thêm.
 */
import { useEffect, useRef, useState } from 'react';
import { api, fmtDateTime } from '../api';

type AutoState = 'bat_dau' | 'dang_cap_nhat' | 'con_moi' | 'tat' | 'can_ket_noi' | 'khong_the';
interface AutoItem { key: string; ten: string; source_ten: string; state: AutoState; last_success_at: string | null; since: string | null }
interface Activity { key: string; status: string; started_at: string; finished_at: string | null; records_changed: number | null; error: string | null }

export interface AutoRefreshState {
  phase: 'idle' | 'running' | 'done' | 'error';
  items: AutoItem[];
  at?: string;
  message?: string;
}

const POLL_MS = 3000;
const GIVE_UP_MS = 3 * 60_000;
/** Quay lại tab sau ít nhất ngần này thì hỏi lại (máy chủ vẫn tự quyết có cần lấy lại không). */
const RECHECK_MS = 15 * 60_000;

export function useAutoRefresh(reports: string[] | undefined, onUpdated: () => void): AutoRefreshState {
  const [st, setSt] = useState<AutoRefreshState>({ phase: 'idle', items: [] });
  const cb = useRef(onUpdated);
  cb.current = onUpdated;
  const lastCheck = useRef(0);
  const key = reports?.length ? [...reports].sort().join(',') : '';

  useEffect(() => {
    if (!key) return;
    const codes = key.split(',');
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck.current < 30_000) return;
      lastCheck.current = Date.now();
      let items: AutoItem[];
      try { items = await api.post<AutoItem[]>('/data-sources/refresh', { reports: codes }); } catch { return; }
      const waiting = items.filter((x) => x.state === 'bat_dau' || x.state === 'dang_cap_nhat');
      if (cancelled || !waiting.length) return;
      setSt({ phase: 'running', items: waiting });
      const since = waiting.map((x) => x.since ?? new Date().toISOString()).sort()[0]!;
      const startedAt = Date.now();
      const poll = async () => {
        if (cancelled) return;
        let runs: Activity[] = [];
        try { runs = await api.get<Activity[]>(`/data-sources/activity?since=${encodeURIComponent(since)}`); } catch { /* thử lại lượt sau */ }
        const mine = runs.filter((r) => waiting.some((w) => w.key === r.key));
        const finished = waiting.every((w) => mine.some((r) => r.key === w.key && r.status !== 'running'));
        if (!finished && Date.now() - startedAt < GIVE_UP_MS) { timer = setTimeout(() => void poll(), POLL_MS); return; }
        const failed = mine.filter((r) => r.status === 'failed');
        if (cancelled) return;
        setSt({
          phase: failed.length || !finished ? 'error' : 'done', items: waiting, at: new Date().toISOString(),
          message: !finished ? 'Chưa thấy kết quả sau 3 phút — số liệu sẽ mới ở lần sau.' : failed[0]?.error ?? undefined,
        });
        if (mine.some((r) => r.status === 'ok')) cb.current();
      };
      timer = setTimeout(() => void poll(), POLL_MS);
    };
    void check();
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > RECHECK_MS) void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [key]);

  // "Vừa cập nhật" chỉ hiện một lúc rồi ẩn; lỗi thì giữ lại để người dùng đọc được.
  useEffect(() => {
    if (st.phase !== 'done') return;
    const t = setTimeout(() => setSt((s) => (s.phase === 'done' ? { ...s, phase: 'idle' } : s)), 10_000);
    return () => clearTimeout(t);
  }, [st.phase]);
  return st;
}

/** Dòng trạng thái nhỏ: đang cập nhật / vừa cập nhật / không cập nhật được. Không có gì để báo thì không hiện. */
export function AutoRefreshBar({ st, className = '' }: { st: AutoRefreshState; className?: string }) {
  if (st.phase === 'idle') return null;
  const names = st.items.map((x) => x.ten).join(', ');
  const oldest = st.items.map((x) => x.last_success_at).filter((x): x is string => !!x).sort()[0];
  if (st.phase === 'running') {
    return (
      <div role="status" className={`flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 ${className}`}>
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent dark:border-blue-400 dark:border-t-transparent" aria-hidden />
        Đang cập nhật dữ liệu mới nhất: {names}…
        {oldest && <span className="text-slate-400 dark:text-slate-500">(đang hiện số liệu lúc {fmtDateTime(oldest)})</span>}
      </div>
    );
  }
  if (st.phase === 'done') {
    return <div role="status" className={`text-sm text-emerald-700 dark:text-emerald-400 ${className}`}>✓ Đã cập nhật {names} lúc {fmtDateTime(st.at)}.</div>;
  }
  return (
    <div role="status" className={`text-sm text-amber-700 dark:text-amber-400 ${className}`}>
      Chưa cập nhật được {names}{st.message ? `: ${st.message}` : '.'} Đang hiện số liệu của lần lấy trước.
    </div>
  );
}
