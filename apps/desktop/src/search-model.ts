/**
 * Tìm kiếm của header (Ctrl+K) — phần thuần, không phụ thuộc Electron: bỏ dấu, so khớp + xếp hạng, lịch sử theo ỨNG DỤNG
 * (không lưu địa chỉ trang), chia kết quả thành nhóm (Ứng dụng · Thao tác · Hội thoại; ô trống ⇒ Gần đây + Hội thoại gần đây).
 */

/** Một lần vào ứng dụng (lưu ở `userData/app-history.json`) — chỉ ứng dụng nào, không lưu địa chỉ / tiêu đề trang. */
export interface AppVisit {
  /** Khoá ứng dụng trên thanh dọc (`web:<mã>`, `src:<mã nguồn>`, `portal`). */
  app: string;
  label: string;
  at: number;
  count: number;
}

export interface SearchData {
  apps: { key: string; label: string }[];
  actions: { code: string; system: string; name: string; mo_ta: string }[];
  chats: { id: string; title: string; text: string; at: number }[];
  visits: AppVisit[];
}

export type SearchItem =
  | { kind: 'app'; title: string; sub: string; ref: { key: string } }
  | { kind: 'action'; title: string; sub: string; ref: { code: string; name: string } }
  | { kind: 'chat'; title: string; sub: string; ref: { id: string } };

export interface SearchSection { kind: 'recent' | 'chats' | 'apps' | 'actions'; items: SearchItem[] }

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

/** Thêm một lần vào ứng dụng: cùng ứng dụng ⇒ gộp và đưa lên đầu; giữ tối đa `max` mục mới nhất. */
export function addVisit(list: AppVisit[], v: AppVisit, max: number): AppVisit[] {
  const old = list.find((x) => x.app === v.app);
  const merged: AppVisit = { app: v.app, label: v.label || old?.label || '', at: v.at, count: (old?.count ?? 0) + v.count };
  return [merged, ...list.filter((x) => x.app !== v.app)].slice(0, max);
}

const chat = (c: SearchData['chats'][number]): SearchItem => ({ kind: 'chat', title: c.title, sub: '', ref: { id: c.id } });
const appItem = (key: string, label: string): SearchItem => ({ kind: 'app', title: label, sub: '', ref: { key } });

/** Lấy tối đa N mục có điểm > 0, điểm cao trước; bằng điểm thì giữ thứ tự gốc (đã là mới nhất trước). */
function top<T>(list: T[], score: (x: T) => number): T[] {
  return list.map((x, i) => ({ x, i, s: score(x) })).filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i).slice(0, PER_SECTION).map((r) => r.x);
}

export function searchAll(query: string, data: SearchData): SearchSection[] {
  const out: SearchSection[] = [];
  const push = (kind: SearchSection['kind'], items: SearchItem[]) => { if (items.length) out.push({ kind, items }); };
  const chats = [...data.chats].sort((a, b) => b.at - a.at);
  const apps = new Map(data.apps.map((a) => [a.key, a.label]));
  if (!fold(query)) {
    // Gần đây: ứng dụng vừa dùng (bỏ ứng dụng không còn trong danh mục), tên theo danh mục hiện tại.
    push('recent', [...data.visits].sort((a, b) => b.at - a.at).filter((v) => apps.has(v.app)).slice(0, RECENT)
      .map((v) => appItem(v.app, apps.get(v.app)!)));
    push('chats', chats.slice(0, RECENT_CHATS).map(chat));
    return out;
  }
  // Ứng dụng: bằng điểm ⇒ ứng dụng hay dùng trước.
  const used = new Map(data.visits.map((v) => [v.app, v.count]));
  const appsRanked = [...data.apps].sort((a, b) => (used.get(b.key) ?? 0) - (used.get(a.key) ?? 0));
  push('apps', top(appsRanked, (a) => matchScore(query, `${a.label} ${a.key.replace(/^(src|web):/, '')}`)).map((a) => appItem(a.key, a.label)));
  push('actions', top(data.actions, (a) => Math.max(matchScore(query, a.mo_ta), matchScore(query, a.name), matchScore(query, `${a.system} ${a.mo_ta}`)))
    .map((a) => ({ kind: 'action', title: a.mo_ta || a.name, sub: `${a.system} · ${a.name}`, ref: { code: a.code, name: a.name } })));
  push('chats', top(chats, (c) => Math.max(matchScore(query, c.title), matchScore(query, c.text))).map(chat));
  return out;
}
