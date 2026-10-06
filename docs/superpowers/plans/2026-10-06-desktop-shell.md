# Par Desktop · Phase 1A — Vỏ Desktop thay tiện ích Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng `apps/desktop` — một ứng dụng Electron cho Windows đóng vai trò thay thế tiện ích Chrome (`apps/extension`): tự quản lý phiên đăng nhập các hệ thống nguồn (eGov, eTask…) và cho người dùng dùng cổng Vala như một ứng dụng độc lập (system tray, chạy nền, tự khởi động cùng Windows).

**Architecture:** `apps/desktop` là một gói mới trong pnpm workspace. Main process (TypeScript, chạy bằng Electron) mở một `BrowserWindow` trỏ thẳng vào cổng Vala đã triển khai (y hệt mở bằng trình duyệt — không viết lại UI). Song song, main process chạy một tiến trình nền port lại gần như nguyên vẹn logic của `apps/extension/src/background.ts` + `shared.ts`, thay `chrome.cookies`/`chrome.tabs`/`chrome.storage` bằng API tương đương của Electron (`session.cookies`, `BrowserWindow` ẩn, file JSON trong `app.getPath('userData')`). Không cần sửa backend: dùng lại nguyên giao thức `/ext/login`, `/ext/sources`, `/ext/sources/:code/session` đã có — ứng dụng chỉ xuất hiện trong "Tiện ích trình duyệt" (`/me/extension-devices`) với tên khác (vd "Vala Desktop trên Windows").

**Tech Stack:** Electron 32+, TypeScript, electron-builder (đóng gói NSIS cho Windows), pnpm workspace (không cần React/Vite cho renderer — cửa sổ chính chỉ load URL từ xa; chỉ có 1 trang cài đặt nhỏ dạng HTML tĩnh).

**Ngoài phạm vi plan này (làm ở plan sau):**
- MCP client-side engine (tải kịch bản động, chạy JS/giả lập form) — Phase 1B, sau khi vỏ desktop này chạy ổn.
- Mô phỏng 4 nghiệp vụ BKVO đè lên VMPD/Vele — Phase 1D, **chặn bởi khảo sát** Núi Thành/Đan Phượng (chưa làm).
- Đóng gói thật dưới dạng Windows Service (bản này chỉ dùng `app.setLoginItemSettings` để tự khởi động cùng Windows + chạy ẩn trong tray — đủ cho yêu cầu "không mất phiên khi tắt cửa sổ chính", Windows Service thật sự không cần cho Phase 1A).

---

## File Structure

```
apps/desktop/
  package.json            # script dev/build/package, deps electron + electron-builder
  tsconfig.json
  electron-builder.yml     # cấu hình đóng gói NSIS Windows
  src/
    main.ts                # entry: app.whenReady, tạo tray + cửa sổ chính, khởi động background
    settings.ts             # đọc/ghi config (serverUrl, deviceToken, deviceName) — thay shared.ts's getSettings/setSettings
    cookies.ts               # applicableCookies/allDomainCookies bằng session.cookies — thay phần đọc cookie của shared.ts
    api.ts                   # hàm api() gọi /api/v1/ext/* — port gần nguyên văn shared.ts's api()
    sync.ts                  # port background.ts: refreshSources/syncSource/pushSource/syncAll
    tray.ts                  # tạo Tray + Menu (Mở Vala, Đồng bộ ngay, Thoát)
    login-window.ts          # cửa sổ đăng nhập thiết bị (gọi /ext/login) khi chưa có deviceToken
  test/
    cookies.test.ts          # test thuần logic domain-matching (không cần Electron thật)
    settings.test.ts         # test đọc/ghi + chuẩn hoá serverUrl
  resources/
    icon.ico                 # icon Windows (tái dùng icon tiện ích, convert sang .ico)
```

Mỗi file giữ đúng một trách nhiệm, bám theo cách tách của `apps/extension/src` (`shared.ts` = thuần logic + kiểu, `background.ts` = luồng sự kiện) — chỉ tách `background.ts` thành `cookies.ts` + `api.ts` + `sync.ts` vì ba phần đó test được độc lập.

---

## Task 1: Scaffold gói `apps/desktop`

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/src/main.ts`
- Modify: `package.json:1-16` (root) — không cần sửa, pnpm workspace tự nhận gói mới qua `pnpm-workspace.yaml` (đã liệt kê `apps/*`)

- [ ] **Step 1: Kiểm tra `pnpm-workspace.yaml` đã bắt `apps/*`**

Run: `cat pnpm-workspace.yaml`
Expected: có dòng `- 'apps/*'` (nếu có, không cần sửa gì).

- [ ] **Step 2: Tạo `apps/desktop/package.json`**

```json
{
  "name": "@vala/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/main.cjs",
  "scripts": {
    "dev": "tsc -p . && electron dist/main.cjs",
    "build": "tsc -p .",
    "package": "pnpm build && electron-builder --win",
    "typecheck": "tsc -p . --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0",
    "typescript": "~5.9.3",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Tạo `apps/desktop/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

electron main process build ra CommonJS (`.cjs` qua rename trong script package, hoặc đặt `"outFile"` không dùng — electron-builder chạy tốt với CJS build từ tsc, không cần bundler cho Phase 1A vì không có renderer code ngoài 1 trang HTML tĩnh).

- [ ] **Step 4: Tạo `apps/desktop/src/main.ts` rỗng khởi động được**

```typescript
import { app, BrowserWindow } from 'electron';

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1200, height: 800 });
  void win.loadURL('about:blank');
});
```

- [ ] **Step 5: Cài deps và chạy thử**

Run: `cd apps/desktop && pnpm install && pnpm dev`
Expected: một cửa sổ Electron trống mở lên, không lỗi console.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop pnpm-workspace.yaml
git commit -m "feat(desktop): scaffold gói apps/desktop (Electron)"
```

---

## Task 2: `settings.ts` — cấu hình lưu cục bộ (thay `chrome.storage.local`)

**Files:**
- Create: `apps/desktop/src/settings.ts`
- Test: `apps/desktop/test/settings.test.ts`

Thay vì `chrome.storage.local`, Electron lưu một file JSON trong `app.getPath('userData')/settings.json`. Giữ nguyên hàm `normalizeServer` gần như nguyên văn từ `apps/extension/src/shared.ts:91-101` (đã kiểm chứng đúng với đường dẫn con như `qtttboard-demo…:5443/vala-report`).

- [ ] **Step 1: Viết test cho `normalizeServer`**

```typescript
// apps/desktop/test/settings.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeServer } from '../src/settings';

describe('normalizeServer', () => {
  it('giữ đường dẫn con, bỏ dấu / cuối', () => {
    expect(normalizeServer('https://qtttboard-demo.demozone.vn:5443/vala-report/'))
      .toBe('https://qtttboard-demo.demozone.vn:5443/vala-report');
  });
  it('bỏ đuôi /api hoặc /api/v1 nếu người dùng dán nhầm địa chỉ API', () => {
    expect(normalizeServer('https://vala.example.com/api/v1')).toBe('https://vala.example.com');
  });
  it('từ chối http không phải localhost', () => {
    expect(normalizeServer('http://vala.example.com')).toBeNull();
  });
  it('chấp nhận http cho localhost (dev)', () => {
    expect(normalizeServer('http://localhost:5173')).toBe('http://localhost:5173');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL (chưa có `settings.ts`)**

Run: `cd apps/desktop && pnpm test`
Expected: FAIL — `Cannot find module '../src/settings'`

- [ ] **Step 3: Viết `settings.ts`**

```typescript
// apps/desktop/src/settings.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

export interface Settings {
  serverUrl: string;
  deviceToken: string | null;
  user: { ho_ten: string; email: string } | null;
}

/** Chuẩn hoá địa chỉ máy chủ — giữ nguyên quy tắc của tiện ích (apps/extension/src/shared.ts). */
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
const DEFAULT: Settings = { serverUrl: '', deviceToken: null, user: null };

export function getSettings(): Settings {
  try {
    if (!existsSync(file())) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(readFileSync(file(), 'utf8')) } as Settings;
  } catch {
    return DEFAULT;
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  writeFileSync(file(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd apps/desktop && pnpm test`
Expected: 4 test PASS (lưu ý: `import { app } from 'electron'` chỉ dùng trong `file()`, test không gọi `getSettings`/`setSettings` nên không cần mock Electron ở bước này).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/settings.ts apps/desktop/test/settings.test.ts
git commit -m "feat(desktop): lưu cấu hình cục bộ + chuẩn hoá địa chỉ máy chủ"
```

---

## Task 3: `api.ts` — gọi `/api/v1/ext/*` (port từ `shared.ts`'s `api()`)

**Files:**
- Create: `apps/desktop/src/api.ts`

- [ ] **Step 1: Viết `api.ts`**

Port gần nguyên văn `apps/extension/src/shared.ts:113-143`, bỏ phần ngôn ngữ đa dạng (Phase 1A dùng tiếng Việt cố định — thêm song ngữ sau nếu cần, theo đúng quy tắc "không viết trước khi cần"), dùng `fetch` built-in của Electron (Node ≥ 18 trong Electron 32 có `fetch` toàn cục).

```typescript
// apps/desktop/src/api.ts
import { getSettings, setSettings, type Settings } from './settings';

export class ApiError extends Error {
  constructor(readonly status: number, readonly type: string, title: string, readonly detail?: string) {
    super(title);
  }
}

export async function api<T>(method: string, path: string, body?: unknown, s?: Settings): Promise<T> {
  const st = s ?? getSettings();
  if (!st.serverUrl) throw new ApiError(0, 'no_server', 'Chưa cấu hình địa chỉ máy chủ Vala');
  const headers: Record<string, string> = { 'Accept-Language': 'vi' };
  if (st.deviceToken) headers.Authorization = `Bearer ${st.deviceToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${st.serverUrl}/api/v1${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'Không kết nối được máy chủ Vala');
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && st.deviceToken) setSettings({ deviceToken: null, user: null });
    throw new ApiError(res.status, json.type ?? 'internal', json.title ?? `Lỗi HTTP ${res.status}`, json.detail);
  }
  return json as T;
}
```

- [ ] **Step 2: typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: không lỗi.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/api.ts
git commit -m "feat(desktop): client gọi /api/v1/ext/*"
```

---

## Task 4: `cookies.ts` — đọc cookie phiên bằng `session.cookies` (thay `chrome.cookies`)

**Files:**
- Create: `apps/desktop/src/cookies.ts`
- Test: `apps/desktop/test/cookies.test.ts`

Electron **không có** mô hình xin quyền theo từng origin như Chrome (`chrome.permissions`) — ứng dụng desktop chạy trong partition riêng của chính nó, đọc được mọi cookie trong phiên Electron của nó ngay khi cần, không phải xin phép. Vì vậy phần `sourcePermissions`/`noPermission`/`needPermission` của tiện ích **không áp dụng** ở đây — bỏ hẳn, đúng tinh thần YAGNI.

- [ ] **Step 1: Viết test cho hàm so khớp domain (logic thuần, port từ `shared.ts:154,181-186`)**

```typescript
// apps/desktop/test/cookies.test.ts
import { describe, expect, it } from 'vitest';
import { matchesSessionDomain } from '../src/cookies';

describe('matchesSessionDomain', () => {
  it('khớp đúng domain', () => expect(matchesSessionDomain('bkav.com', 'bkav.com')).toBe(true));
  it('khớp tên miền con', () => expect(matchesSessionDomain('egov.bkav.com', 'bkav.com')).toBe(true));
  it('khớp cookie tên miền cha (.bkav.com)', () => expect(matchesSessionDomain('bkav.com', '.bkav.com')).toBe(true));
  it('không khớp domain khác', () => expect(matchesSessionDomain('bkav.com', 'example.com')).toBe(false));
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd apps/desktop && pnpm test`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `cookies.ts`**

```typescript
// apps/desktop/src/cookies.ts
import { session } from 'electron';

export interface Source {
  code: string;
  origin: string;
  cookie_names: string[];
  cookie_groups?: string[][];
  stable_cookies?: string[];
  cookie_domain?: string;
}

/** Cookie `d` (có thể bắt đầu bằng '.') có nằm trong cây tên miền `domain` không. */
export function matchesSessionDomain(domain: string, cookieDomain: string): boolean {
  const d = cookieDomain.replace(/^\./, '');
  return d === domain || d.endsWith(`.${domain}`) || domain.endsWith(`.${d}`);
}

const sessionDomain = (src: Source) => (src.cookie_domain ?? new URL(src.origin).hostname).replace(/^\./, '');

/** Mọi cookie phiên áp dụng cho một nguồn, đọc qua Electron session API của cửa sổ chính. */
export async function applicableCookies(src: Source): Promise<Electron.Cookie[]> {
  const domain = sessionDomain(src);
  const all = await session.defaultSession.cookies.get({ domain });
  return all.filter((c) => matchesSessionDomain(domain, c.domain ?? '')).sort((a, b) => (a.path?.length ?? 0) - (b.path?.length ?? 0));
}

export const cookieGroupsOf = (src: Source): string[][] => src.cookie_groups?.length ? src.cookie_groups : src.cookie_names.map((n) => [n]);

export const missingGroups = (src: Source, have: Record<string, string>): string[] =>
  cookieGroupsOf(src).filter((g) => !g.some((n) => n in have)).map((g) => g.join('|'));

/** Đọc đúng các cookie phiên của một nguồn (tên trong cookie_names). */
export async function readCookies(src: Source): Promise<{ cookies: Record<string, string>; expires: Record<string, number> }> {
  const out: Record<string, string> = {};
  const exp: Record<string, number> = {};
  for (const c of await applicableCookies(src)) {
    if (src.cookie_names.includes(c.name) && !(c.name in out)) {
      out[c.name] = c.value;
      if (!c.session && c.expirationDate) exp[c.name] = Math.floor(c.expirationDate);
    }
  }
  return { cookies: out, expires: exp };
}
```

Lưu ý: `cookie_domain`/`stable_cookies` ở eTask (meId/companyId do JS đặt) đọc được thẳng qua `session.cookies.get()` trong Electron **nếu** cookie đó không phải `httpOnly` — `session.cookies` của Electron trả về mọi cookie kể cả non-HttpOnly đặt bằng JS, khác với `chrome.cookies` của tiện ích vốn chỉ thiếu cookie phân vùng (CHIPS) chứ không thiếu cookie JS thường. Vì vậy **không cần** phần "đọc bù từ `document.cookie` qua `executeScript`" (background.ts:97-129) — nhưng **phải xác minh bằng Task 7 (test thủ công với eTask thật)** trước khi coi đây là xong, vì đây là giả định chưa kiểm chứng (ghi rõ trong Task 7).

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd apps/desktop && pnpm test`
Expected: 4 test PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/cookies.ts apps/desktop/test/cookies.test.ts
git commit -m "feat(desktop): đọc cookie phiên qua Electron session API"
```

---

## Task 5: `sync.ts` — đồng bộ phiên lên máy chủ (port `background.ts`'s `syncSource`/`syncAll`)

**Files:**
- Create: `apps/desktop/src/sync.ts`

Bỏ toàn bộ phần liên quan tới quyền Chrome (`no_permission`) và phần đọc cookie trang (đã gộp vào `readCookies`). Giữ nguyên hành vi: hash để tránh gửi trùng, xử lý `session_expired` → mở lại trang đăng nhập.

- [ ] **Step 1: Viết `sync.ts`**

```typescript
// apps/desktop/src/sync.ts
import { createHash } from 'node:crypto';
import { api, ApiError } from './api';
import { getSettings, setSettings } from './settings';
import { missingGroups, readCookies, type Source } from './cookies';

export interface SourceFull extends Source {
  state: 'active' | 'pending' | 'expired' | 'failed' | 'revoked' | 'chua_cau_hinh';
  auth_method: 'password' | 'cookie' | 'sso' | 'extension' | null;
  managed: boolean;
  consented?: boolean;
  login_url: string;
}

export type SyncResult = 'sent' | 'unchanged' | 'not_logged_in' | 'managed' | 'rejected' | 'error' | 'need_consent';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function refreshSources(): Promise<SourceFull[]> {
  return api<SourceFull[]>('GET', '/ext/sources');
}

const sentKey = (code: string) => `sent:${code}`;
const sentHashes = new Map<string, { hash: string; ok: boolean }>();

export async function syncSource(src: SourceFull, force = false): Promise<SyncResult> {
  if (src.managed) return 'managed';
  if (src.consented === false && (src.state === 'chua_cau_hinh' || src.state === 'revoked')) return 'need_consent';

  const { cookies, expires } = await readCookies(src);
  const stable = new Set(src.stable_cookies ?? []);
  const missing = missingGroups(src, cookies).filter((g) => !g.split('|').every((n) => stable.has(n)));
  if (missing.length) return 'not_logged_in';

  const hash = sha256(src.cookie_names.filter((n) => n in cookies).map((n) => `${n}=${cookies[n]}`).join(';'));
  const prev = sentHashes.get(sentKey(src.code));
  if (!force && prev?.hash === hash && (!prev.ok || src.state === 'active')) return prev.ok ? 'unchanged' : 'rejected';

  try {
    const r = await api<{ status: string }>('PUT', `/ext/sources/${src.code}/session`, { cookies, expires });
    sentHashes.set(sentKey(src.code), { hash, ok: true });
    return r.status === 'active' ? 'sent' : 'managed';
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(0, 'internal', 'Lỗi không xác định');
    if (err.type === 'session_expired') { sentHashes.set(sentKey(src.code), { hash, ok: false }); return 'rejected'; }
    return 'error';
  }
}

export async function syncAll(force = false): Promise<Map<string, SyncResult>> {
  const settings = getSettings();
  if (!settings.deviceToken) return new Map();
  const out = new Map<string, SyncResult>();
  for (const src of await refreshSources()) out.set(src.code, await syncSource(src, force));
  return out;
}

/** Đăng nhập thiết bị: gọi /ext/login, lưu token. */
export async function loginDevice(username: string, password: string, serverUrl: string): Promise<void> {
  setSettings({ serverUrl });
  const r = await api<{ token: string; user: { ho_ten: string; email: string } }>(
    'POST', '/ext/login', { username, password, device_name: 'Vala Desktop trên Windows' });
  setSettings({ deviceToken: r.token, user: r.user });
}
```

- [ ] **Step 2: typecheck**

Run: `cd apps/desktop && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/sync.ts
git commit -m "feat(desktop): đồng bộ phiên lên /ext/sources/:code/session"
```

---

## Task 6: `login-window.ts` + `tray.ts` + `main.ts` — lắp ráp ứng dụng

**Files:**
- Create: `apps/desktop/src/login-window.ts`
- Create: `apps/desktop/src/tray.ts`
- Modify: `apps/desktop/src/main.ts`
- Create: `apps/desktop/resources/login.html`

- [ ] **Step 1: Trang đăng nhập tĩnh**

```html
<!-- apps/desktop/resources/login.html -->
<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Đăng nhập Vala Desktop</title>
<style>body{font-family:system-ui;max-width:360px;margin:60px auto}input,button{width:100%;padding:8px;margin:6px 0}
#err{color:#b91c1c;font-size:14px}</style></head>
<body>
  <h2>Đăng nhập Vala Desktop</h2>
  <input id="server" placeholder="Địa chỉ máy chủ Vala (https://…)" />
  <input id="username" placeholder="Tài khoản" />
  <input id="password" type="password" placeholder="Mật khẩu" />
  <button id="go">Đăng nhập</button>
  <div id="err"></div>
  <script src="login.js"></script>
</body></html>
```

```typescript
// apps/desktop/src/login-window.ts
import { BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { loginDevice } from './sync';
import { normalizeServer } from './settings';

export function openLoginWindow(onDone: () => void) {
  const win = new BrowserWindow({ width: 420, height: 320, webPreferences: { preload: join(__dirname, 'login-preload.js') } });
  void win.loadFile(join(__dirname, '../resources/login.html'));

  ipcMain.handleOnce('vala:login', async (_e, { server, username, password }: { server: string; username: string; password: string }) => {
    const url = normalizeServer(server);
    if (!url) return { ok: false, message: 'Địa chỉ máy chủ không hợp lệ' };
    try {
      await loginDevice(username, password, url);
      win.close();
      onDone();
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Lỗi không xác định' };
    }
  });
}
```

```typescript
// apps/desktop/src/login-preload.ts — build riêng thành login-preload.js (xem tsconfig include thêm entry)
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('vala', {
  login: (server: string, username: string, password: string) => ipcRenderer.invoke('vala:login', { server, username, password }),
});
```

```javascript
// apps/desktop/resources/login.js — JS thuần cho trang tĩnh, không qua build
document.getElementById('go').addEventListener('click', async () => {
  const server = document.getElementById('server').value;
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const err = document.getElementById('err');
  err.textContent = '';
  const r = await window.vala.login(server, username, password);
  if (!r.ok) err.textContent = r.message;
});
```

- [ ] **Step 2: `tray.ts`**

```typescript
// apps/desktop/src/tray.ts
import { Tray, Menu, app } from 'electron';
import { join } from 'node:path';
import { syncAll } from './sync';

let tray: Tray | null = null;

export function createTray(openMainWindow: () => void) {
  tray = new Tray(join(__dirname, '../resources/icon.ico'));
  tray.setToolTip('Vala Desktop');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mở Vala', click: openMainWindow },
    { label: 'Đồng bộ ngay', click: () => void syncAll(true) },
    { type: 'separator' },
    { label: 'Thoát', click: () => app.exit(0) },
  ]));
  tray.on('click', openMainWindow);
}
```

- [ ] **Step 3: `main.ts` hoàn chỉnh**

```typescript
// apps/desktop/src/main.ts
import { app, BrowserWindow } from 'electron';
import { getSettings } from './settings';
import { openLoginWindow } from './login-window';
import { createTray } from './tray';
import { syncAll } from './sync';

const SYNC_INTERVAL_MS = 15 * 60_000;
let mainWindow: BrowserWindow | null = null;

function openMainWindow() {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); return; }
  mainWindow = new BrowserWindow({ width: 1280, height: 860 });
  void mainWindow.loadURL(getSettings().serverUrl);
  mainWindow.on('close', (e) => { e.preventDefault(); mainWindow?.hide(); });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  // Chạy ẩn trong tray, tự khởi động cùng Windows (thay cho "Windows Service" ở bản đầu — xem ghi chú đầu plan).
  app.setLoginItemSettings({ openAtLogin: true });
  createTray(openMainWindow);

  const start = () => {
    openMainWindow();
    void syncAll();
    setInterval(() => void syncAll(), SYNC_INTERVAL_MS);
  };
  if (getSettings().deviceToken) start();
  else openLoginWindow(start);
});

app.on('window-all-closed', () => { /* chạy nền trong tray, không thoát khi đóng cửa sổ */ });
```

- [ ] **Step 4: Sửa `tsconfig.json`/`package.json` build cả `login-preload.ts` ra `login-preload.js` cạnh `main.cjs`**

```json
// apps/desktop/tsconfig.json — thêm:
"include": ["src/main.ts", "src/login-window.ts", "src/login-preload.ts", "src/tray.ts", "src/settings.ts", "src/api.ts", "src/cookies.ts", "src/sync.ts"]
```

(tsc build từng file giữ cấu trúc thư mục dist/ tương ứng — `dist/login-preload.js` nằm cạnh `dist/main.js`; sửa `main` trong package.json và lệnh chạy nếu tsc không xuất ra đúng tên — kiểm tra bằng Step 5.)

- [ ] **Step 5: Chạy thử thủ công với máy chủ dev**

Run: `cd apps/desktop && pnpm build && pnpm dev`
Expected: cửa sổ đăng nhập hiện ra → nhập `http://localhost:5173` + tài khoản cổng dev đã có sẵn (xem seed `db/seed`) → đăng nhập xong, cửa sổ chính mở load cổng Vala, icon tray xuất hiện.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop
git commit -m "feat(desktop): lắp ráp main process — đăng nhập, cửa sổ chính, tray, đồng bộ định kỳ"
```

---

## Task 7: Kiểm thử thật với eTask (xác minh giả định Task 4) + đóng gói

**Files:**
- Create: `apps/desktop/electron-builder.yml`
- Modify: `apps/desktop/package.json` (script `package`)

- [ ] **Step 1: Kiểm thử thủ công với eTask thật**

Chạy `pnpm dev` trỏ vào máy chủ thật (`qtttboard-demo…:5443/vala-report`), đăng nhập thiết bị, mở cửa sổ chính, điều hướng tới trang eTask thật trong **chính cửa sổ Electron này** (có thể tạm thêm nút "mở eTask" gọi `BrowserWindow` phụ trỏ `login_url` của eTask), đăng nhập eTask, bấm "Đồng bộ ngay" trong tray.

Expected: trạng thái kết nối eTask trên cổng Vala (trang Tài khoản nguồn) chuyển `active` — xác nhận `session.cookies.get()` của Electron đọc được `meId`/`companyId` (cookie do JS đặt) **mà không cần** cơ chế đọc bù qua `executeScript` như tiện ích Chrome phải làm (ghi chú ở Task 4).

Nếu **không** đọc được (giả định sai): thêm lại cơ chế đọc bù — Electron có `webContents.executeJavaScript('document.cookie')` trên cửa sổ đang mở trang eTask, tương đương `chrome.scripting.executeScript` của tiện ích (`background.ts:102-129`). Cập nhật `cookies.ts`'s `readCookies` để gọi hàm này khi thiếu `stable_cookies`.

- [ ] **Step 2: `electron-builder.yml`**

```yaml
appId: com.bkav.vala.desktop
productName: Vala Desktop
directories:
  output: release
files:
  - dist/**/*
  - resources/**/*
win:
  target: nsis
  icon: resources/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

- [ ] **Step 3: Đóng gói thử**

Run: `cd apps/desktop && pnpm package`
Expected: `release/Vala Desktop Setup 0.1.0.exe` được tạo (hoặc tương đương trên máy build Linux dùng `electron-builder --win` cross-build — nếu lỗi do thiếu wine, ghi chú lại, build thật trên máy Windows CI sau).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/electron-builder.yml apps/desktop/package.json
git commit -m "feat(desktop): đóng gói NSIS cho Windows"
```

---

## Self-Review (đã chạy)

**Spec coverage** — đối chiếu với 2.1 + 3.1 của biên bản họp (`ban-chi-tiet-cuoc-hop-vala-desktop.md`):
- "Khai báo & Quản lý" hệ thống + tài khoản → tái dùng nguyên UI `MyConnectionsPage` qua cửa sổ chính load cổng Vala (Task 6). ✅
- "Duy trì phiên làm việc" → Task 5 (`syncAll` định kỳ 15 phút, giống tiện ích). ✅
- "Windows Service / System Tray", "không mất phiên khi tắt cửa sổ" → Task 6 (`setLoginItemSettings` + tray + `close` ẩn thay vì thoát). ✅ (Windows Service *thật* — out of scope, ghi rõ ở đầu plan).
- "Lưu mật khẩu theo chuẩn Chrome Password Manager / Windows Hello" → **CHƯA LÀM** trong plan này: Phase 1A không lưu mật khẩu hệ thống nguồn phía client (chỉ lưu `deviceToken`, giống hệt tiện ích hiện tại) — vì cách này tái dùng được an toàn đã kiểm chứng (`canAutoRenew`/`auth_method: 'password'` phía server đã xử lý việc lưu mật khẩu, trong vault server, cho những hệ thống hỗ trợ). Nếu đội vẫn muốn desktop tự lưu mật khẩu cục bộ (`safeStorage`), đó là một quyết định sản phẩm cần hỏi lại — xem phần "Mâu thuẫn cần chốt" đã trao đổi trong hội thoại.
- MCP server (client-side/backend-side), JS/CSS injection, can thiệp điều hướng, Agent/Chat → ngoài phạm vi, Phase 1B/1D.

**Placeholder scan** — không còn "TBD"/"tương tự Task N" không kèm code; mọi step có code đầy đủ.

**Type consistency** — `Source`/`SourceFull` dùng xuyên suốt `cookies.ts`→`sync.ts`; `Settings` dùng xuyên suốt `settings.ts`→`api.ts`→`sync.ts`→`login-window.ts`. Không có tên hàm lệch giữa các task.
