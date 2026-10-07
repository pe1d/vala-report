/** Preload của tab Cài đặt: chỉ mở đúng các lệnh trang này cần (tiến trình chính kiểm đúng tab Cài đặt). */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('vala', {
  state: () => ipcRenderer.invoke('vala:settings-state'),
  setLang: (lang: string) => ipcRenderer.invoke('vala:set-lang', lang),
  setTheme: (theme: string) => ipcRenderer.invoke('vala:set-theme', theme),
  setAutostart: (on: boolean) => ipcRenderer.invoke('vala:set-autostart', on),
  saveHome: (url: string | null) => ipcRenderer.invoke('vala:save-home', url),
  signIn: () => ipcRenderer.invoke('vala:sign-in'),
  logout: () => ipcRenderer.invoke('vala:logout'),
  openPortal: () => ipcRenderer.invoke('vala:open-portal'),
  checkUpdate: () => ipcRenderer.invoke('vala:check-update'),
  installUpdate: () => ipcRenderer.invoke('vala:install-update'),
  onChanged: (cb: () => void) => { ipcRenderer.on('vala:settings-changed', () => cb()); },
  onSection: (cb: (s: string) => void) => { ipcRenderer.on('vala:settings-section', (_e, s: string) => cb(s)); },
});
