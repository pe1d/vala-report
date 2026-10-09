/** Preload của lớp khung nổi (menu hồ sơ, khung ⊞, ô tìm kiếm): chỉ mở đúng các lệnh khung cần (tiến trình chính kiểm đúng trang). */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('valaOverlay', {
  state: () => ipcRenderer.invoke('overlay:state'),
  close: () => ipcRenderer.invoke('overlay:close'),
  command: (cmd: string) => ipcRenderer.invoke('overlay:command', cmd),
  prefs: (p: { lang?: string; theme?: string }) => ipcRenderer.invoke('overlay:prefs', p),
  openApp: (key: string) => ipcRenderer.invoke('overlay:open-app', key),
  pin: (key: string, on: boolean) => ipcRenderer.invoke('overlay:pin', key, on),
  search: (q: string) => ipcRenderer.invoke('overlay:search', q),
  pick: (item: unknown) => ipcRenderer.invoke('overlay:pick', item),
  clearHistory: () => ipcRenderer.invoke('overlay:clear-history'),
  contextRun: (id: string) => ipcRenderer.invoke('overlay:context-run', id),
  changePassword: (current: string, next: string) => ipcRenderer.invoke('overlay:change-password', { current, next }),
  download: (id: string, act: string) => ipcRenderer.invoke('overlay:download', { id, act }),
  downloadSaveAs: (id: string) => ipcRenderer.invoke('overlay:download-save-as', id),
  onOpen: (cb: () => void) => { ipcRenderer.on('overlay:open', () => cb()); },
  onRefresh: (cb: () => void) => { ipcRenderer.on('overlay:refresh', () => cb()); },
});
