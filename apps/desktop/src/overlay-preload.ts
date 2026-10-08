/** Preload của lớp khung nổi (menu hồ sơ, khung ⊞): chỉ mở đúng các lệnh khung cần (tiến trình chính kiểm đúng trang). */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('valaOverlay', {
  state: () => ipcRenderer.invoke('overlay:state'),
  close: () => ipcRenderer.invoke('overlay:close'),
  command: (cmd: string) => ipcRenderer.invoke('overlay:command', cmd),
  prefs: (p: { lang?: string; theme?: string }) => ipcRenderer.invoke('overlay:prefs', p),
  openApp: (key: string) => ipcRenderer.invoke('overlay:open-app', key),
  pin: (key: string, on: boolean) => ipcRenderer.invoke('overlay:pin', key, on),
  onOpen: (cb: () => void) => { ipcRenderer.on('overlay:open', () => cb()); },
});
