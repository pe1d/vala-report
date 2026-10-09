/** Preload của thanh ứng dụng dọc: chỉ mở đúng các lệnh thanh dọc cần (tiến trình chính kiểm đúng trang). */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('valaTabs', {
  ready: () => ipcRenderer.invoke('tabs:ready'),
  activate: (key: string) => ipcRenderer.invoke('tabs:activate', key),
  close: (key: string) => ipcRenderer.invoke('tabs:close', key),
  vanban: (mode: 'vala' | 'goc') => ipcRenderer.invoke('tabs:vanban', mode),
  xem: (act: 'luu' | 'luu_thanh' | 'mo_ngoai') => ipcRenderer.invoke('tabs:xem', act),
  reorder: (group: 'apps' | 'open', keys: string[]) => ipcRenderer.invoke('tabs:reorder', { group, keys }),
  nav: (cmd: 'back' | 'forward' | 'reload') => ipcRenderer.invoke('tabs:nav', cmd),
  collapse: () => ipcRenderer.invoke('tabs:collapse'),
  peek: (on: boolean) => ipcRenderer.invoke('tabs:peek', on),
  onPeekSlide: (cb: (open: boolean) => void) => { ipcRenderer.on('tabs:peek-slide', (_e, open) => cb(open === true)); },
  overlay: (kind: 'profile' | 'apps' | 'search', r: { x: number; y: number; w: number; h: number }) => ipcRenderer.invoke('tabs:overlay', { kind, ...r }),
  win: (cmd: 'minimize' | 'maximize' | 'close') => ipcRenderer.invoke('tabs:window', cmd),
  onOpenSearch: (cb: () => void) => { ipcRenderer.on('tabs:open-search', () => cb()); },
  onOpenDownloads: (cb: () => void) => { ipcRenderer.on('tabs:open-downloads', () => cb()); },
  resized: () => ipcRenderer.send('tabs:resized'),
  installUpdate: () => ipcRenderer.invoke('tabs:install-update'),
  signIn: () => ipcRenderer.invoke('tabs:sign-in'),
  tabMenu: (key: string, x: number, y: number) => ipcRenderer.invoke('tabs:context', { key, x, y }),
  onState: (cb: (state: unknown) => void) => { ipcRenderer.on('tabs:state', (_e, s) => cb(s)); },
});
