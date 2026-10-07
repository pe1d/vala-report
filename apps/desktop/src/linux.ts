/**
 * Linux (gói .deb): gói đã tự thêm lối tắt menu (/usr/share/applications); app.setLoginItemSettings không có tác dụng trên
 * Linux ⇒ tự ghi mục tự khởi động cho người dùng hiện tại: ~/.config/autostart/vala-desktop.desktop (chạy nền --hidden).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';
import { desktopEntry, execLine } from './linux-desktop';

export function enableLinuxAutostart(): void {
  if (process.platform !== 'linux' || !app.isPackaged) return;
  try {
    const dir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'autostart');
    mkdirSync(dir, { recursive: true });
    // Icon theo tên: gói .deb cài icon vào /usr/share/icons/hicolor/*/apps/vala-desktop.png.
    writeFileSync(join(dir, 'vala-desktop.desktop'),
      desktopEntry({ exec: execLine(process.execPath, ['--hidden']), icon: 'vala-desktop', autostart: true }));
  } catch (e) {
    console.warn('[vala] autostart', (e as Error).message);
  }
}

/** Tắt chạy cùng hệ điều hành: xoá mục ~/.config/autostart/vala-desktop.desktop. */
export function disableLinuxAutostart(): void {
  if (process.platform !== 'linux' || !app.isPackaged) return;
  const file = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'autostart', 'vala-desktop.desktop');
  try { rmSync(file, { force: true }); } catch (e) { console.warn('[vala] autostart', (e as Error).message); }
}
