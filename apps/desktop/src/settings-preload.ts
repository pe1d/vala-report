/** Preload của cửa sổ Cài đặt: chỉ mở đúng các lệnh trang này cần. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('vala', {
  state: () => ipcRenderer.invoke('vala:settings-state'),
  setLang: (lang: string) => ipcRenderer.invoke('vala:set-lang', lang),
  setTheme: (theme: string) => ipcRenderer.invoke('vala:set-theme', theme),
  saveHome: (url: string | null) => ipcRenderer.invoke('vala:save-home', url),
  signIn: () => ipcRenderer.invoke('vala:sign-in'),
  logout: () => ipcRenderer.invoke('vala:logout'),
  openPortal: () => ipcRenderer.invoke('vala:open-portal'),
  credSave: (code: string, username: string, password: string) => ipcRenderer.invoke('vala:cred-save', { code, username, password }),
  credDelete: (code: string) => ipcRenderer.invoke('vala:cred-delete', code),
  credAuto: (code: string, auto: boolean) => ipcRenderer.invoke('vala:cred-auto', { code, auto }),
  onChanged: (cb: () => void) => { ipcRenderer.on('vala:settings-changed', () => cb()); },
});
