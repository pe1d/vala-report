/** Preload của trang Quản trị đơn vị: chỉ mở đúng các lệnh trang cần (tiến trình chính kiểm đúng trang + đường API). */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('valaAdmin', {
  request: (method: string, path: string, body: unknown, lang: string) => ipcRenderer.invoke('admin:request', { method, path, body, lang }),
  prefs: () => ipcRenderer.invoke('admin:prefs'),
  listActions: (source: string) => ipcRenderer.invoke('admin:list-actions', source),
  runAction: (source: string, name: string, args: Record<string, unknown>) => ipcRenderer.invoke('admin:run-action', { source, name, args }),
  onPrefs: (cb: (p: unknown) => void) => { ipcRenderer.on('admin:prefs-changed', (_e, p) => cb(p)); },
  onNavigate: (cb: (section: string) => void) => { ipcRenderer.on('admin:navigate', (_e, s) => { if (typeof s === 'string') cb(s); }); },
});
