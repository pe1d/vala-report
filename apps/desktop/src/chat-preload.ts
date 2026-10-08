/** Preload của trang Trợ lý AI: chỉ mở đúng các lệnh trang này cần (tiến trình chính kiểm đúng trang). */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('valaChat', {
  state: () => ipcRenderer.invoke('chat:state'),
  actions: (code: string) => ipcRenderer.invoke('chat:actions', code),
  run: (code: string, name: string, form: Record<string, string>) => ipcRenderer.invoke('chat:run', { code, name, form }),
  save: (c: unknown) => ipcRenderer.invoke('chat:save', c),
  take: () => ipcRenderer.invoke('chat:take'),
  onChanged: (cb: () => void) => { ipcRenderer.on('chat:changed', () => cb()); },
});
