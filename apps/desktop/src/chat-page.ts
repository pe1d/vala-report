/**
 * Trang Trợ lý AI (họp 07/10/2026): mặc định khi mở app, giao diện chat kiểu Claude. Chưa có mô hình AI ⇒ lệnh "/" gọi
 * THẲNG thao tác `vala.action` của gói kịch bản (đúng ý "lệnh đơn giản gọi thẳng MCP, không cần AI"): chọn hệ thống ⇒ thao
 * tác ⇒ điền tham số ⇒ chạy ngầm trong tab của hệ thống (windows.ts runSourceAction) ⇒ kết quả dựng sẵn cách hiển thị
 * (chat-model.ts resultView). Câu hỏi tự do: trả lời cố định — sau này cắm mô hình vào đây. IPC chỉ nhận từ đúng trang.
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { accountEvents } from './account';
import { greeting, parseArgs, resultView } from './chat-model';
import { strings } from './chat-strings';
import { messages } from './i18n';
import { getChat, recordActions, saveChat, type CatalogAction } from './local-data';
import { prefsEvents } from './prefs';
import { getSettings } from './settings';
import { cachedSources, events as syncEvents, statusOf } from './sync';
import { tabStatus } from './tabs-model';
import { runSourceAction, sourceActions } from './windows';

const M = messages(strings.vi, strings.en);
const CODE = /^[a-z0-9_]{1,40}$/;
const NAME = /^[a-z][a-z0-9_]{0,62}$/;

export interface ChatPageHooks {
  isChat: (e: IpcMainInvokeEvent) => boolean;
  /** Báo trang (nếu đang mở) vẽ lại: đổi ngôn ngữ, đăng nhập, trạng thái nguồn. */
  push: () => void;
}

/** Lệnh chờ trang Trợ lý lấy (ô tìm kiếm của header: mở phiếu thao tác / mở lại hội thoại). */
type ChatCommand = { type: 'action'; code: string; action: CatalogAction } | { type: 'open'; id: string; title: string; msgs: unknown[] };
let pending: ChatCommand | null = null;
let pushPage: () => void = () => {};

/** Ô tìm kiếm chọn một thao tác: trang Trợ lý mở sẵn phiếu tham số của nó (main đã chuyển sang trang Trợ lý). */
export function queueChatAction(code: string, action: CatalogAction): void { pending = { type: 'action', code, action }; pushPage(); }
/** Ô tìm kiếm chọn một hội thoại cũ: trang Trợ lý dựng lại nó. */
export function queueChatOpen(id: string): void {
  const c = getChat(id);
  if (!c) return;
  pending = { type: 'open', id: c.id, title: c.title, msgs: c.msgs };
  pushPage();
}

/** Chữ để tìm trong một cuộc trò chuyện: tiêu đề, câu hỏi, lệnh và chữ của kết quả (giới hạn độ dài). */
function chatText(title: string, msgs: unknown[]): string {
  const parts: string[] = [title];
  const walk = (v: unknown) => {
    if (parts.join(' ').length > 4000) return;
    if (typeof v === 'string') parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'kind' && k !== 'role') walk(x);
  };
  walk(msgs);
  return parts.join(' ').slice(0, 4000);
}

function state() {
  const s = getSettings();
  // Tên gọi trong lời chào: tên (chữ cuối của họ tên).
  const name = s.deviceToken ? (s.user?.ho_ten || '').trim().split(/\s+/).pop() ?? '' : '';
  return {
    lang: s.lang, t: M[s.lang], greeting: greeting(new Date().getHours(), name, s.lang),
    systems: s.deviceToken ? cachedSources().map((x) => ({ code: x.code, ten: x.ten, status: tabStatus(statusOf(x.code)?.result, x.state) })) : [],
  };
}

export function registerChatPage(hooks: ChatPageHooks): void {
  const own = (e: IpcMainInvokeEvent) => { if (!hooks.isChat(e)) throw new Error('forbidden'); };
  pushPage = hooks.push;
  for (const ev of ['login', 'logout'] as const) accountEvents.on(ev, hooks.push);
  prefsEvents.on('changed', hooks.push);
  syncEvents.on('status', hooks.push);

  ipcMain.handle('chat:state', (e) => { own(e); return state(); });
  ipcMain.handle('chat:actions', async (e, code: unknown) => {
    own(e);
    if (typeof code !== 'string' || !CODE.test(code)) return { ok: false, error: 'forbidden' };
    const r = await sourceActions(code);
    // Ghi danh mục thao tác ⇒ ô tìm kiếm của header tìm được thao tác mà không phải mở hệ thống.
    if (r.ok && r.actions) recordActions(code, r.actions);
    return r;
  });
  ipcMain.handle('chat:take', (e) => { own(e); const c = pending; pending = null; return c; });
  ipcMain.handle('chat:save', (e, c: { id?: unknown; title?: unknown; msgs?: unknown }) => {
    own(e);
    if (typeof c?.id !== 'string' || !/^[a-z0-9]{4,40}$/.test(c.id) || !Array.isArray(c.msgs)) return;
    const title = typeof c.title === 'string' ? c.title.slice(0, 200) : '';
    // Kết quả quá lớn (bảng hàng nghìn dòng) ⇒ không lưu bảng, chỉ giữ lời hỏi – đáp dạng chữ.
    let msgs = c.msgs.slice(0, 200) as unknown[];
    if (JSON.stringify(msgs).length > 1_500_000) msgs = msgs.map((m) => (m && typeof m === 'object' && 'view' in m ? { role: 'bot', note: M[getSettings().lang].tooBig } : m));
    saveChat({ id: c.id, title, at: Date.now(), text: chatText(title, msgs), msgs });
  });
  ipcMain.handle('chat:run', async (e, a: { code?: unknown; name?: unknown; form?: unknown }) => {
    own(e);
    const form = a?.form && typeof a.form === 'object' ? Object.fromEntries(Object.entries(a.form as Record<string, unknown>)
      .filter(([k, v]) => /^[\w$]{1,64}$/.test(k) && typeof v === 'string').map(([k, v]) => [k, (v as string).slice(0, 10_000)])) : {};
    if (typeof a?.code !== 'string' || !CODE.test(a.code) || typeof a.name !== 'string' || !NAME.test(a.name)) return { ok: false, error: 'forbidden' };
    const lang = getSettings().lang;
    const r = await runSourceAction(a.code, a.name, parseArgs(form)) as { ok: boolean; result?: unknown; error?: string; code?: string };
    return r.ok ? { ok: true, view: resultView(r.result, lang) } : { ok: false, error: r.error ?? M[lang].failed, code: r.code };
  });
}
