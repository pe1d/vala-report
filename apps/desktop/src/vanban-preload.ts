/** Preload của giao diện Văn bản chung: chỉ mở đúng các lệnh trang cần (tiến trình chính kiểm đúng trang). */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('valaVanBan', {
  state: () => ipcRenderer.invoke('vanban:state'),
  run: (name: string, args: Record<string, unknown>) => ipcRenderer.invoke('vanban:run', { name, args }),
  goc: (on = true, url?: string) => ipcRenderer.invoke('vanban:goc', { on, url }),
  onPrefs: (cb: (p: unknown) => void) => { ipcRenderer.on('vanban:prefs', (_e, p) => cb(p)); },
  onGocLoaded: (cb: () => void) => { ipcRenderer.on('vanban:goc-loaded', () => cb()); },
});
