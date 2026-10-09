/** Preload của trang Trợ lý AI: chỉ mở đúng các lệnh trang này cần (tiến trình chính kiểm đúng trang). */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('valaChat', {
  state: () => ipcRenderer.invoke('chat:state'),
  actions: (code: string) => ipcRenderer.invoke('chat:actions', code),
  run: (code: string, name: string, form: Record<string, string>) => ipcRenderer.invoke('chat:run', { code, name, form }),
  save: (c: unknown) => ipcRenderer.invoke('chat:save', c),
  take: () => ipcRenderer.invoke('chat:take'),
  onChanged: (cb: () => void) => { ipcRenderer.on('chat:changed', () => cb()); },
  // Cửa sổ Trợ lý AI (cột / nổi — chat.html#panel): đổi chế độ, mở toàn trang, đóng, kéo; bối cảnh đang xem.
  panel: (act: string, kind?: string) => ipcRenderer.invoke('chat:panel-cmd', { act, kind }),
  onPanel: (cb: (p: unknown) => void) => { ipcRenderer.on('chat:panel', (_e, p) => cb(p)); },
});
