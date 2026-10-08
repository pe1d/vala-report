/**
 * Ô tìm kiếm của header (Ctrl+K, như Lark): vẽ trên lớp khung nổi (renderer/overlay.ts), tìm trong ứng dụng, thao tác
 * (danh mục ghi trên máy), hội thoại Trợ lý AI và lịch sử trang (local-data.ts) — quy tắc so khớp ở search-model.ts.
 * IPC chỉ nhận từ đúng lớp khung nổi.
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { activate, CHAT, closeOverlay, isOverlayContents, listApps, openPage } from './browser';
import { queueChatAction, queueChatOpen } from './chat-page';
import { catalogActions, chatList, clearHistory, historyList } from './local-data';
import { searchAll } from './search-model';
import { getSettings } from './settings';
import { cachedSources } from './sync';

function search(q: string) {
  const systems = getSettings().deviceToken ? cachedSources() : [];
  const names = new Map(systems.map((s) => [s.code, s.ten]));
  const catalog = catalogActions();
  // Chỉ thao tác của hệ thống còn khai trên cổng.
  const actions = [...names].flatMap(([code, ten]) => (catalog[code] ?? []).map((a) => ({ code, system: ten, name: a.name, mo_ta: a.mo_ta })));
  const chats = chatList().map((c) => ({ id: c.id, title: c.title, text: c.text, at: c.at }));
  return searchAll(q, { apps: listApps(), actions, chats, history: historyList() });
}

export function registerSearch(): void {
  const own = (e: IpcMainInvokeEvent) => { if (!isOverlayContents(e.sender)) throw new Error('forbidden'); };
  ipcMain.handle('overlay:search', (e, q: unknown) => { own(e); return search(typeof q === 'string' ? q.slice(0, 200) : ''); });
  ipcMain.handle('overlay:pick', (e, it: { kind?: unknown; ref?: Record<string, unknown> }) => {
    own(e);
    const ref = it?.ref ?? {};
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    closeOverlay();
    if (it?.kind === 'page' && /^(https?:|vala-ui:)/.test(str(ref.url))) openPage(str(ref.url), str(ref.app));
    else if (it?.kind === 'app') activate(str(ref.key));
    else if (it?.kind === 'action') {
      const code = str(ref.code);
      const a = (catalogActions()[code] ?? []).find((x) => x.name === str(ref.name));
      if (!a) return;
      queueChatAction(code, a);
      activate(CHAT);
    } else if (it?.kind === 'chat') {
      queueChatOpen(str(ref.id));
      activate(CHAT);
    }
  });
  ipcMain.handle('overlay:clear-history', (e) => { own(e); clearHistory(); return search(''); });
}
