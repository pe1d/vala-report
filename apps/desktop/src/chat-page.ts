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
  for (const ev of ['login', 'logout'] as const) accountEvents.on(ev, hooks.push);
  prefsEvents.on('changed', hooks.push);
  syncEvents.on('status', hooks.push);

  ipcMain.handle('chat:state', (e) => { own(e); return state(); });
  ipcMain.handle('chat:actions', (e, code: unknown) => {
    own(e);
    if (typeof code !== 'string' || !CODE.test(code)) return { ok: false, error: 'forbidden' };
    return sourceActions(code);
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
