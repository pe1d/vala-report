/**
 * Tab Bản ghi thao tác (T07 phần 2): hiện bản ghi gần nhất (recorder.ts), lưu ra tệp, sao chép JSON / bản nháp kịch bản.
 * IPC chỉ nhận từ đúng tab này.
 */
import { writeFileSync } from 'node:fs';
import { BrowserWindow, clipboard, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { messages } from './i18n';
import { notify } from './notify';
import { lastRecording, recorderEvents } from './recorder';
import type { Recording } from './recording';
import { draftScript } from './recording-draft';
import { strings } from './recording-strings';
import { getSettings } from './settings';

const M = messages(strings.vi, strings.en);

export interface RecordingPageHooks {
  isRecording: (e: IpcMainInvokeEvent) => boolean;
  /** Báo tab Bản ghi + thanh tab vẽ lại. */
  push: () => void;
  /** Mở tab Bản ghi. */
  open: () => void;
}

function state() {
  const lang = getSettings().lang;
  const rec = lastRecording();
  return { lang, t: M[lang], recording: rec, draft: rec && rec.steps.length ? draftScript(rec, lang) : '' };
}

export function registerRecordingPage(hooks: RecordingPageHooks): void {
  const own = (e: IpcMainInvokeEvent) => { if (!hooks.isRecording(e)) throw new Error('forbidden'); };
  // Bước mới đến dồn dập khi trang tải ⇒ gộp, vẽ lại tối đa 4 lần/giây.
  let timer: ReturnType<typeof setTimeout> | null = null;
  recorderEvents.on('changed', () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; hooks.push(); }, 250);
  });
  // Dừng không do người dùng bấm (tab đóng, đủ 200 bước, DevTools chiếm…) ⇒ báo; bấm ⇒ xem bản ghi.
  recorderEvents.on('stopped', (rec: Recording, reason: string) => {
    const t = M[getSettings().lang];
    const why = reason === 'du_buoc' ? t.truncated : `${t.stopReason}: ${(t as Record<string, string>)[`reasons_${reason}`] ?? t.reasons_khac}`;
    notify(`${t.title} — ${t.stopped}`, `${rec.host} · ${rec.steps.length} ${t.steps}. ${why}`, hooks.open);
  });
  ipcMain.handle('vala:rec-state', (e) => { own(e); return state(); });
  ipcMain.handle('vala:rec-copy', (e, kind: unknown) => {
    own(e);
    const s = state();
    if (!s.recording) return false;
    clipboard.writeText(kind === 'draft' ? s.draft : JSON.stringify(s.recording, null, 2));
    return true;
  });
  ipcMain.handle('vala:rec-save', async (e) => {
    own(e);
    const rec = lastRecording();
    if (!rec) return false;
    const stamp = rec.startedAt.slice(0, 19).replace(/[:T]/g, '-');
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const opts = { defaultPath: `ban-ghi-${rec.host.replace(/[^a-z0-9.-]/gi, '_')}-${stamp}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] };
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return false;
    writeFileSync(r.filePath, JSON.stringify(rec, null, 2), 'utf8');
    return true;
  });
}
