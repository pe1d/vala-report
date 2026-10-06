/** Preload của cửa sổ Cài đặt: chỉ mở đúng các lệnh trang này cần. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('vala', {
  state: () => ipcRenderer.invoke('vala:settings-state'),
  setLang: (lang: string) => ipcRenderer.invoke('vala:set-lang', lang),
  login: (server: string, username: string, password: string) => ipcRenderer.invoke('vala:login', { server, username, password }),
  logout: () => ipcRenderer.invoke('vala:logout'),
  openPortal: () => ipcRenderer.invoke('vala:open-portal'),
});
