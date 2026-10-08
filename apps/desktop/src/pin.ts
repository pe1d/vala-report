/**
 * Ghim Vala Desktop vào thanh tác vụ / dock lần đầu mở bản cài (người dùng chốt 08/10/2026), chỉ một lần:
 *   - Ubuntu (GNOME): tự thêm vala-desktop.desktop vào cuối dock (gsettings org.gnome.shell favorite-apps — pin-model.ts),
 *     không đổi thứ tự người dùng đã sắp.
 *   - Windows: từ Windows 10 1809 / Windows 11, phần mềm KHÔNG được tự ghim (Microsoft chặn) ⇒ một thông báo hướng dẫn
 *     ghim; quản trị IT ghim hàng loạt bằng Group Policy / Intune (docs/desktop-ghim-thanh-tac-vu.md).
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { app } from 'electron';
import { messages } from './i18n';
import { notify } from './notify';
import { withFavorite } from './pin-model';
import { getSettings, setSettings } from './settings';

const M = messages({
  title: 'Ghim Vala Desktop vào thanh tác vụ',
  body: 'Chuột phải biểu tượng Vala Desktop trên thanh tác vụ ⇒ "Ghim vào thanh tác vụ" để lần sau mở bằng một cú bấm.',
}, {
  title: 'Pin Vala Desktop to the taskbar',
  body: 'Right-click the Vala Desktop icon on the taskbar ⇒ "Pin to taskbar" to open it with one click next time.',
});

const DESKTOP_ID = 'vala-desktop.desktop';
const run = (args: string[]) => new Promise<string>((ok, fail) => execFile('gsettings', args, { timeout: 5000 }, (e, out) => (e ? fail(e) : ok(String(out)))));

async function pinGnome(): Promise<void> {
  if (!existsSync(`/usr/share/applications/${DESKTOP_ID}`) || !/gnome|ubuntu/i.test(process.env.XDG_CURRENT_DESKTOP ?? '')) return;
  const next = withFavorite(await run(['get', 'org.gnome.shell', 'favorite-apps']), DESKTOP_ID);
  if (next) await run(['set', 'org.gnome.shell', 'favorite-apps', next]);
}

/** Gọi lúc khởi động (bản cài). */
export function offerPin(): void {
  if (!app.isPackaged || getSettings().pinOffered) return;
  setSettings({ pinOffered: true });
  if (process.platform === 'linux') { void pinGnome().catch(() => { /* không có gsettings / không phải GNOME */ }); return; }
  if (process.platform === 'win32') {
    const t = M[getSettings().lang];
    // Đợi cửa sổ hiện xong (biểu tượng đã nằm trên thanh tác vụ) rồi mới hướng dẫn.
    setTimeout(() => notify(t.title, t.body), 8000);
  }
}
