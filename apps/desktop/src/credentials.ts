/**
 * Tài khoản / mật khẩu hệ thống nguồn (eGov, eTask…) lưu TRONG MÁY người dùng — biên bản họp 10/2026, việc T08: "lưu theo
 * đúng chuẩn quản lý mật khẩu của hệ điều hành, không tự nghĩ ra cơ chế riêng".
 *
 *   - Mật khẩu mã hoá bằng Electron safeStorage = khoá do hệ điều hành giữ: Windows DPAPI (theo tài khoản Windows), macOS
 *     Keychain, Linux kho bí mật của phiên đăng nhập (gnome-libsecret / kwallet). Không có kho bí mật thật (Linux
 *     "basic_text") ⇒ KHÔNG lưu.
 *   - Tệp userData/credentials.json chỉ chứa tên đăng nhập + bản mã hoá; không gửi lên máy chủ Vala, không đưa vào trang
 *     nào ngoài form đăng nhập của đúng hệ thống đó (autofill.ts).
 *   - Dùng mật khẩu lần đầu trong mỗi phiên app ⇒ xác nhận người dùng: Windows Hello (vân tay / khuôn mặt / PIN), macOS
 *     Touch ID. Máy không có Windows Hello ⇒ chỉ dựa vào khoá tài khoản Windows (DPAPI).
 */
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage, systemPreferences } from 'electron';
import { messages } from './i18n';
import { getSettings } from './settings';

const M = messages({
  helloReason: 'Vala Desktop cần dùng mật khẩu hệ thống nguồn đã lưu',
  touchReason: 'dùng mật khẩu hệ thống nguồn đã lưu',
}, {
  helloReason: 'Vala Desktop needs to use your saved source-system password',
  touchReason: 'use your saved source-system password',
});

export interface SavedCredential {
  username: string;
  /** Tự đăng nhập lại khi phiên hết hạn (người dùng tắt được trong Cài đặt → Mật khẩu). */
  auto: boolean;
  savedAt: string;
}
interface Stored extends SavedCredential { password: string /* base64 của safeStorage.encryptString */ }
type Store = { sources: Record<string, Stored>; never: string[] };

const file = () => join(app.getPath('userData'), 'credentials.json');

function read(): Store {
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Store>;
    return { sources: s.sources ?? {}, never: s.never ?? [] };
  } catch { return { sources: {}, never: [] }; }
}
/** 'changed' — mật khẩu đã lưu / danh sách "không bao giờ lưu" vừa đổi (menu, tab Cài đặt vẽ lại). */
export const credentialEvents = new EventEmitter();
function write(s: Store) {
  writeFileSync(file(), JSON.stringify(s, null, 1), { encoding: 'utf8', mode: 0o600 });
  credentialEvents.emit('changed');
}

/** Máy có kho bí mật thật của hệ điều hành không (không thì không lưu mật khẩu). */
export function secureStorageAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  if (process.platform === 'linux') {
    const b = safeStorage.getSelectedStorageBackend();
    return b !== 'basic_text' && b !== 'unknown';
  }
  return true;
}

export const savedCredential = (code: string): SavedCredential | null => {
  const c = read().sources[code];
  return c ? { username: c.username, auto: c.auto, savedAt: c.savedAt } : null;
};
export const listCredentials = (): Record<string, SavedCredential> =>
  Object.fromEntries(Object.entries(read().sources).map(([k, c]) => [k, { username: c.username, auto: c.auto, savedAt: c.savedAt }]));

/** Người dùng chọn "Không bao giờ lưu cho hệ thống này". */
export const neverSave = (code: string): boolean => read().never.includes(code);
export const listNeverSave = (): string[] => [...read().never];
export function setNeverSave(code: string, never: boolean) {
  const s = read();
  s.never = never ? [...new Set([...s.never, code])] : s.never.filter((c) => c !== code);
  write(s);
}

export function saveCredential(code: string, username: string, password: string): boolean {
  if (!secureStorageAvailable() || !username || !password) return false;
  const s = read();
  s.sources[code] = {
    username, password: safeStorage.encryptString(password).toString('base64'),
    auto: s.sources[code]?.auto ?? true, savedAt: new Date().toISOString(),
  };
  s.never = s.never.filter((c) => c !== code);
  write(s);
  refused = false;
  return true;
}

export function setAutoLogin(code: string, auto: boolean) {
  const s = read();
  if (!s.sources[code]) return;
  s.sources[code]!.auto = auto;
  write(s);
}

export function deleteCredential(code: string) {
  const s = read();
  delete s.sources[code];
  write(s);
}

/** Mật khẩu kiểm (so khi người dùng gõ lại cùng mật khẩu thì không hỏi lưu nữa). Không xác nhận Windows Hello. */
export function sameAsSaved(code: string, username: string, password: string): boolean {
  const c = read().sources[code];
  if (!c || c.username !== username) return false;
  try { return safeStorage.decryptString(Buffer.from(c.password, 'base64')) === password; } catch { return false; }
}

// ---- xác nhận người dùng: một lần mỗi phiên app ----
let unlocked = false;
let pending: Promise<boolean> | null = null;
/** Người dùng đã từ chối xác nhận trong phiên này ⇒ không hỏi lại liên tục (mở lại app / lưu mật khẩu mới để thử lại). */
let refused = false;

/** Lấy mật khẩu đã lưu (sau khi người dùng xác nhận, một lần mỗi phiên app). null ⇒ không có / người dùng từ chối. */
export async function useCredential(code: string): Promise<{ username: string; password: string } | null> {
  const c = read().sources[code];
  if (!c) return null;
  if (!(await unlock())) return null;
  try {
    return { username: c.username, password: safeStorage.decryptString(Buffer.from(c.password, 'base64')) };
  } catch {
    return null;   // khoá của hệ điều hành đổi (vd đặt lại mật khẩu Windows) ⇒ bản mã hoá không giải được
  }
}

export function unlock(): Promise<boolean> {
  if (unlocked) return Promise.resolve(true);
  if (refused) return Promise.resolve(false);
  pending ??= verifyUser().then((ok) => { unlocked = ok; refused = !ok; pending = null; return ok; });
  return pending;
}

async function verifyUser(): Promise<boolean> {
  const t = M[getSettings().lang];
  if (process.platform === 'win32') {
    const r = await windowsHello(t.helloReason);
    // Máy không có Windows Hello / không gọi được (PowerShell bị chặn…) ⇒ dựa vào khoá tài khoản Windows (DPAPI).
    // Người dùng bấm Huỷ / xác nhận sai ⇒ không dùng mật khẩu trong phiên này.
    if (r === 'error') console.warn('[mat-khau] không gọi được Windows Hello — dùng khoá tài khoản Windows (DPAPI)');
    return r === 'Verified' || r === 'unavailable' || r === 'error';
  }
  if (process.platform === 'darwin' && systemPreferences.canPromptTouchID()) {
    try { await systemPreferences.promptTouchID(t.touchReason); return true; } catch { return false; }
  }
  return true;   // Linux: kho bí mật mở theo phiên đăng nhập của hệ điều hành
}

/**
 * Windows Hello qua WinRT UserConsentVerifier, gọi bằng Windows PowerShell 5.1 (có sẵn trên Windows 10/11, không cần module
 * gốc). Trả 'Verified' | 'Canceled' | … | 'unavailable' (máy chưa cài Windows Hello) | 'error'.
 */
function windowsHello(reason: string): Promise<string> {
  const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime] | Out-Null
$a = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])
if ($a -ne 'Available') { 'unavailable'; exit }
$r = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync($env:VALA_HELLO_REASON)) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])
$r.ToString()`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true, timeout: 120_000, env: { ...process.env, VALA_HELLO_REASON: reason } },
      (err, stdout) => resolve(err ? 'error' : stdout.trim().split(/\r?\n/).pop() ?? 'error'));
  });
}

/** Đăng xuất ứng dụng ⇒ khoá lại (lần dùng sau phải xác nhận lại). Mật khẩu đã lưu vẫn giữ (thuộc máy, không thuộc phiên cổng). */
export function lockCredentials() { unlocked = false; refused = false; }
