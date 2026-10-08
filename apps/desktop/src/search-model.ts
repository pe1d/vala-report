/**
 * Tìm kiếm của header (Ctrl+K) — phần thuần, không phụ thuộc Electron: bỏ dấu, so khớp + xếp hạng, gộp lịch sử trang,
 * chia kết quả thành nhóm (Ứng dụng · Thao tác · Hội thoại · Lịch sử; ô trống ⇒ Gần đây + Hội thoại gần đây).
 */

/** Một trang web đã xem (lưu ở `userData/history.json`). */
export interface HistoryEntry {
  url: string;
  title: string;
  /** Khoá ứng dụng trên thanh dọc (`home`, `portal`, `src:<mã>`, hoặc `''` nếu là tab mở từ liên kết). */
  app: string;
  appLabel: string;
  at: number;
  count: number;
}

export interface SearchData {
  apps: { key: string; label: string }[];
  actions: { code: string; system: string; name: string; mo_ta: string }[];
  chats: { id: string; title: string; text: string; at: number }[];
  history: HistoryEntry[];
}

export type SearchItem =
  | { kind: 'app'; title: string; sub: string; ref: { key: string } }
  | { kind: 'action'; title: string; sub: string; ref: { code: string; name: string } }
  | { kind: 'chat'; title: string; sub: string; ref: { id: string } }
  | { kind: 'page'; title: string; sub: string; ref: { url: string; app: string } };

export interface SearchSection { kind: 'recent' | 'chats' | 'apps' | 'actions' | 'history'; items: SearchItem[] }

const PER_SECTION = 5;
const RECENT = 8;
const RECENT_CHATS = 3;

/** Chữ thường, bỏ dấu tiếng Việt (đ ⇒ d), gộp khoảng trắng. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Điểm khớp của `query` trong `text` (0 = không khớp). Mọi từ của truy vấn phải có mặt; mỗi từ được điểm theo vị trí:
 * đầu chuỗi 3, đầu một từ 2, giữa từ 1. Nối các từ thành từ khoá ở `_` (vd tên thao tác) cũng tính là đầu từ.
 */
export function matchScore(query: string, text: string): number {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return 0;
  const hay = fold(text).replace(/_/g, ' ');
  let score = 0;
  for (const w of words) {
    const i = hay.indexOf(w);
    if (i < 0) return 0;
    if (i === 0) score += 3;
    else if (hay.slice(i - 1, i) === ' ' || hay.includes(` ${w}`)) score += 2;
    else score += 1;
  }
  return score;
}

/** Thêm một lượt xem: trùng địa chỉ ⇒ gộp vào mục cũ và đưa lên đầu; giữ tối đa `max` mục mới nhất. */
export function addHistory(list: HistoryEntry[], entry: HistoryEntry, max: number): HistoryEntry[] {
  const old = list.find((x) => x.url === entry.url);
  const merged: HistoryEntry = old
    ? { ...old, ...entry, title: entry.title || old.title, count: old.count + 1 }
    : entry;
  return [merged, ...list.filter((x) => x.url !== entry.url)].slice(0, max);
}

const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };
const page = (h: HistoryEntry): SearchItem => ({
  kind: 'page', title: h.title || h.url, sub: [h.appLabel, host(h.url)].filter(Boolean).join(' · '), ref: { url: h.url, app: h.app },
});
const chat = (c: SearchData['chats'][number]): SearchItem => ({ kind: 'chat', title: c.title, sub: '', ref: { id: c.id } });

/** Lấy tối đa N mục có điểm > 0, điểm cao trước; bằng điểm thì giữ thứ tự gốc (đã là mới nhất trước). */
function top<T>(list: T[], score: (x: T) => number): T[] {
  return list.map((x, i) => ({ x, i, s: score(x) })).filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i).slice(0, PER_SECTION).map((r) => r.x);
}

export function searchAll(query: string, data: SearchData): SearchSection[] {
  const out: SearchSection[] = [];
  const push = (kind: SearchSection['kind'], items: SearchItem[]) => { if (items.length) out.push({ kind, items }); };
  const chats = [...data.chats].sort((a, b) => b.at - a.at);
  if (!fold(query)) {
    push('recent', [...data.history].sort((a, b) => b.at - a.at).slice(0, RECENT).map(page));
    push('chats', chats.slice(0, RECENT_CHATS).map(chat));
    return out;
  }
  push('apps', top(data.apps, (a) => matchScore(query, `${a.label} ${a.key.replace(/^src:/, '')}`))
    .map((a) => ({ kind: 'app', title: a.label, sub: '', ref: { key: a.key } })));
  push('actions', top(data.actions, (a) => Math.max(matchScore(query, a.mo_ta), matchScore(query, a.name), matchScore(query, `${a.system} ${a.mo_ta}`)))
    .map((a) => ({ kind: 'action', title: a.mo_ta || a.name, sub: `${a.system} · ${a.name}`, ref: { code: a.code, name: a.name } })));
  push('chats', top(chats, (c) => Math.max(matchScore(query, c.title), matchScore(query, c.text))).map(chat));
  push('history', top([...data.history].sort((a, b) => b.at - a.at), (h) => Math.max(matchScore(query, h.title), matchScore(query, h.url) && 1)).map(page));
  return out;
}
