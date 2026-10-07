/** Preload của hộp nhập mật khẩu hệ thống nguồn: chỉ mở đúng các lệnh hộp này cần. */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('valaCred', {
  state: () => ipcRenderer.invoke('vala:cred-dialog-state'),
  save: (username: string, password: string) => ipcRenderer.invoke('vala:cred-dialog-save', { username, password }),
  cancel: () => ipcRenderer.invoke('vala:cred-dialog-cancel'),
});
