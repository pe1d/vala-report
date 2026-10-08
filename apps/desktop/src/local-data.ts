/**
 * Dữ liệu chỉ nằm trên máy cho ô tìm kiếm của header (search.ts): ứng dụng đã vào, hội thoại Trợ lý AI, danh mục thao
 * tác của các hệ thống. Mỗi loại một tệp JSON trong userData (quyền 0600), giữ trong bộ nhớ, ghi trễ 1 giây để không ghi
 * đĩa mỗi lần chuyển trang. Đăng xuất ⇒ xoá cả ba (main.ts) — trong đó có dữ liệu của các hệ thống nguồn.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { addVisit, type AppVisit } from './search-model';

function store<T>(name: string, empty: () => T) {
  const file = () => join(app.getPath('userData'), name);
  let data: T | null = null;
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
    timer = null;
    try { writeFileSync(file(), JSON.stringify(data), { encoding: 'utf8', mode: 0o600 }); } catch { /* chỉ giữ trong phiên */ }
  };
  app.on('will-quit', () => { if (timer) { clearTimeout(timer); flush(); } });
  return {
    get(): T {
      if (data === null) {
        try { data = existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as T) : empty(); } catch { data = empty(); }
      }
      return data;
    },
    set(v: T) { data = v; if (!timer) timer = setTimeout(flush, 1000); },
    clear() {
      data = empty();
      if (timer) { clearTimeout(timer); timer = null; }
      try { rmSync(file(), { force: true }); } catch { /* không xoá được thì lần sau ghi đè */ }
    },
  };
}

// ---- lịch sử: đã vào ứng dụng nào (KHÔNG lưu địa chỉ / tiêu đề trang) ----
const VISITS_MAX = 200;
const visits = store<AppVisit[]>('app-history.json', () => []);
let legacyDropped = false;
export function appVisits(): AppVisit[] {
  // Bản cũ lưu địa chỉ trang đã xem ở history.json ⇒ xoá hẳn (lần đầu dùng — lúc đó thư mục dữ liệu đã đúng, channel.ts).
  if (!legacyDropped) {
    legacyDropped = true;
    try { rmSync(join(app.getPath('userData'), 'history.json'), { force: true }); } catch { /* chưa có / không xoá được */ }
  }
  return Array.isArray(visits.get()) ? visits.get() : [];
}

/** Người dùng chuyển sang một ứng dụng (trang web / hệ thống nguồn / Báo cáo của danh mục). */
export function recordAppVisit(app: string, label: string): void {
  visits.set(addVisit(appVisits(), { app, label: label.slice(0, 100), at: Date.now(), count: 1 }, VISITS_MAX));
}

export const clearHistory = () => visits.clear();

// ---- hội thoại Trợ lý AI ----
const CHATS_MAX = 50;
/** Một cuộc trò chuyện: tin nhắn lưu đúng như trang Trợ lý dựng (renderer/chat.ts), kể cả bảng kết quả. */
export interface StoredChat { id: string; title: string; at: number; text: string; msgs: unknown[] }
const chats = store<StoredChat[]>('chats.json', () => []);
export const chatList = (): StoredChat[] => (Array.isArray(chats.get()) ? chats.get() : []);
export const getChat = (id: string): StoredChat | null => chatList().find((c) => c.id === id) ?? null;

export function saveChat(c: StoredChat): void {
  chats.set([c, ...chatList().filter((x) => x.id !== c.id)].slice(0, CHATS_MAX));
}

export const clearChats = () => chats.clear();

// ---- danh mục thao tác ----
export interface CatalogAction { name: string; mo_ta: string; params: Record<string, string> | null }
const catalog = store<Record<string, CatalogAction[]>>('actions-catalog.json', () => ({}));

/** Ghi lại danh sách thao tác của một hệ thống (mỗi khi gói kịch bản được nạp / liệt kê). */
export function recordActions(code: string, list: { name: string; mo_ta?: string; params?: unknown }[]): void {
  const cur = catalog.get();
  cur[code] = list.slice(0, 200).map((a) => ({
    name: String(a.name), mo_ta: String(a.mo_ta ?? ''),
    params: a.params && typeof a.params === 'object' && !Array.isArray(a.params) ? (a.params as Record<string, string>) : null,
  }));
  catalog.set(cur);
}

export const catalogActions = (): Record<string, CatalogAction[]> => catalog.get();
export const clearCatalog = () => catalog.clear();

/** Đăng xuất: xoá mọi dữ liệu trên máy của ô tìm kiếm. */
export function clearLocalData(): void {
  clearHistory();
  clearChats();
  clearCatalog();
}
