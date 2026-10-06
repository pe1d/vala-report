/** Preload của cửa sổ Cài đặt: chỉ mở đúng các lệnh trang này cần. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('vala', {
  state: () => ipcRenderer.invoke('vala:settings-state'),
  setLang: (lang: string) => ipcRenderer.invoke('vala:set-lang', lang),
  saveHome: (url: string | null) => ipcRenderer.invoke('vala:save-home', url),
  signIn: () => ipcRenderer.invoke('vala:sign-in'),
  logout: () => ipcRenderer.invoke('vala:logout'),
  openPortal: () => ipcRenderer.invoke('vala:open-portal'),
  onChanged: (cb: () => void) => { ipcRenderer.on('vala:settings-changed', () => cb()); },
});
