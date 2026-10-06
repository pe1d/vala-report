/**
 * Cấu hình cục bộ của Vala Desktop — thay chrome.storage.local của tiện ích: một file JSON trong thư mục dữ liệu
 * của ứng dụng (Windows: %APPDATA%/Vala Desktop/settings.json).
 * Token thiết bị (vxt_…) chỉ dùng được ở /ext/*, người dùng thu hồi được trên cổng — cùng mức nhạy cảm như tiện ích.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { normLang, type Lang } from './i18n';

export interface Settings {
  serverUrl: string;
  deviceToken: string | null;
  user: { ho_ten: string; email: string } | null;
  lang: Lang;
}

/** Máy chủ gợi ý lần đầu (đặt lúc build: VALA_URL=… pnpm build). Người dùng sửa được ở màn hình đăng nhập. */
export const DEFAULT_SERVER = process.env.VALA_URL ?? 'https://qtttboard-demo.demozone.vn:5443/vala-report';

/**
 * Chuẩn hoá địa chỉ máy chủ — cùng quy tắc với tiện ích (apps/extension/src/shared.ts normalizeServer): chỉ https,
 * trừ localhost cho dev; giữ đường dẫn con; bỏ '/' cuối và đuôi /api, /api/v1. Trả null nếu không hợp lệ.
 */
export function normalizeServer(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, '').replace(/\/api(\/v1)?$/, '')}`;
  } catch {
    return null;
  }
}

const file = () => join(app.getPath('userData'), 'settings.json');
const DEFAULTS: Settings = { serverUrl: '', deviceToken: null, user: null, lang: 'vi' };

export function getSettings(): Settings {
  try {
    if (!existsSync(file())) return { ...DEFAULTS };
    const s = { ...DEFAULTS, ...(JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings>) };
    return { ...s, lang: normLang(s.lang) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  writeFileSync(file(), JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  return next;
}

export const getLang = (): Lang => getSettings().lang;
