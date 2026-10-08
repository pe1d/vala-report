/** Preload của màn hình đăng nhập: chỉ mở đúng các lệnh trang này cần (tiến trình chính kiểm đúng trang). */
import { contextBridge, ipcRenderer } from 'electron';

type Slot = { x: number; y: number; w: number; h: number };
contextBridge.exposeInMainWorld('valaLogin', {
  state: () => ipcRenderer.invoke('login:state'),
  lookup: (login: string) => ipcRenderer.invoke('login:lookup', login),
  forget: () => ipcRenderer.invoke('login:forget'),
  password: (password: string) => ipcRenderer.invoke('login:password', password),
  changePassword: (next: string) => ipcRenderer.invoke('login:change-password', next),
  sso: (slot: Slot) => ipcRenderer.invoke('login:sso', slot),
  ssoSlot: (slot: Slot) => ipcRenderer.invoke('login:sso-slot', slot),
  ssoCancel: () => ipcRenderer.invoke('login:sso-cancel'),
  onSsoResult: (cb: (r: unknown) => void) => { ipcRenderer.on('login:sso-result', (_e, r) => cb(r)); },
  onChanged: (cb: () => void) => { ipcRenderer.on('login:changed', () => cb()); },
});
