/** Preload của tab Bản ghi thao tác: chỉ mở đúng các lệnh trang này cần (tiến trình chính kiểm đúng tab). */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('valaRec', {
  state: () => ipcRenderer.invoke('vala:rec-state'),
  save: () => ipcRenderer.invoke('vala:rec-save'),
  copy: (kind: 'json' | 'draft') => ipcRenderer.invoke('vala:rec-copy', kind),
  onChanged: (cb: () => void) => { ipcRenderer.on('vala:rec-changed', () => cb()); },
});
