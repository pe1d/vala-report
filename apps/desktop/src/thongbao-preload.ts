/** Preload của trang Trung tâm thông báo: chỉ mở đúng các lệnh trang cần (tiến trình chính kiểm đúng trang). */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('valaThongBao', {
  state: () => ipcRenderer.invoke('thongbao:state'),
  list: (q: { trang_thai: string; ung_dung: string | null }) => ipcRenderer.invoke('thongbao:list', q),
  act: (a: { act: string; ids?: string[] }) => ipcRenderer.invoke('thongbao:act', a),
  onChanged: (cb: () => void) => { ipcRenderer.on('thongbao:changed', () => cb()); },
  onPrefs: (cb: (p: unknown) => void) => { ipcRenderer.on('thongbao:prefs', (_e, p) => cb(p)); },
});
