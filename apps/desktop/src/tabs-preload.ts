/** Preload của thanh tab: chỉ mở đúng các lệnh thanh tab cần. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('valaTabs', {
  ready: () => ipcRenderer.invoke('tabs:ready'),
  activate: (key: string) => ipcRenderer.invoke('tabs:activate', key),
  close: (key: string) => ipcRenderer.invoke('tabs:close', key),
  newTab: () => ipcRenderer.invoke('tabs:new'),
  nav: (action: 'back' | 'forward' | 'reload' | 'stop') => ipcRenderer.invoke('tabs:nav', action),
  go: (address: string) => ipcRenderer.invoke('tabs:go', address),
  menu: (x: number, y: number) => ipcRenderer.invoke('tabs:menu', { x, y }),
  setLang: (lang: string) => ipcRenderer.invoke('tabs:lang', lang),
  onState: (cb: (state: unknown) => void) => { ipcRenderer.on('tabs:state', (_e, s) => cb(s)); },
  onFocusAddress: (cb: () => void) => { ipcRenderer.on('tabs:focus-address', () => cb()); },
});
