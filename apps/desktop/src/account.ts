/** Đăng nhập / đăng xuất thiết bị: token vxt_… qua /ext/login, hiện trên cổng ở mục thiết bị đã kết nối. */
import { api } from './api';
import { messages } from './i18n';
import { getSettings, setSettings } from './settings';
import { resetSync } from './sync';

const M = messages({
  device: (os: string) => `Vala Desktop trên ${os}`,
  computer: 'máy tính',
}, {
  device: (os: string) => `Vala Desktop on ${os}`,
  computer: 'computer',
});

function deviceName(): string {
  const t = M[getSettings().lang];
  const os = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : process.platform === 'linux' ? 'Linux' : t.computer;
  return t.device(os);
}

export async function loginDevice(serverUrl: string, username: string, password: string): Promise<void> {
  const r = await api<{ token: string; user: { ho_ten: string; email: string } }>(
    'POST', '/ext/login', { username, password, device_name: deviceName() },
    { ...getSettings(), serverUrl, deviceToken: null });
  setSettings({ serverUrl, deviceToken: r.token, user: r.user });
}

export async function logoutDevice(): Promise<void> {
  try { await api('POST', '/ext/logout'); } catch { /* máy chủ không tới được: vẫn quên token ở máy này */ }
  setSettings({ deviceToken: null, user: null });
  resetSync();
}
