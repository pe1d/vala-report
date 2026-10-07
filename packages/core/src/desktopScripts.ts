/**
 * Gói kịch bản của Vala Desktop: CSS + JS chạy trong trang hệ thống nguồn (sửa giao diện, thao tác có tên). Quản trị viết
 * trên cổng, lưu CSDL (core.desktop_packages), ứng dụng tải về — đổi kịch bản không cần phát hành bản app mới.
 *
 * Kịch bản chạy ngay trong trang người dùng đang đăng nhập eGov/eTask… nên máy chủ KÝ từng gói (Ed25519) bằng khoá lấy từ
 * biến môi trường, không nằm trong CSDL: ai sửa được CSDL cũng không tự đẩy được mã vào máy người dùng. Ứng dụng chỉ chạy
 * gói đúng chữ ký.
 *
 * apps/desktop/src/scripts-verify.ts có bản sao canonical / matchesUrl / verify (ứng dụng không phụ thuộc @vala/core) —
 * đổi định dạng ở đây thì đổi cả bên đó (test hai bên dùng chung một chữ ký mẫu).
 */
import { createHash, createPrivateKey, createPublicKey, hkdfSync, sign, verify, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface SignedFields {
  code: string;
  version: number;
  matches: string[];
  css: string;
  script: string;
}

/** Chuỗi được ký: mảng JSON cố định thứ tự trường (không phụ thuộc thứ tự khoá của object). */
export function canonicalPackage(p: SignedFields): string {
  return JSON.stringify(['vala-desktop-package/1', p.code, p.version, p.matches, p.css, p.script]);
}

const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');

export interface PackageSigner {
  /** Khoá công khai Ed25519 dạng base64 (32 byte thô) — ứng dụng dùng để kiểm chữ ký. */
  publicKey: string;
  sign(p: SignedFields): string;
}

/**
 * Khoá ký: SCRIPT_SIGNING_KEY (base64, 32 byte hạt giống) nếu có; không thì suy ra từ AUTH_JWT_SECRET bằng HKDF — cả hai
 * đều nằm trong .env của máy chủ, không trong CSDL. Đổi khoá ⇒ ứng dụng nhận khoá mới cùng lần tải gói kế tiếp.
 */
export function packageSigner(o: { signingKey?: string; jwtSecret: string }): PackageSigner {
  let seed: Buffer;
  if (o.signingKey?.trim()) {
    seed = Buffer.from(o.signingKey.trim(), 'base64');
    if (seed.length !== 32) throw new Error('SCRIPT_SIGNING_KEY phải là 32 byte mã hoá base64');
  } else {
    seed = Buffer.from(hkdfSync('sha256', o.jwtSecret, 'vala', 'vala-desktop-package-signing/1', 32));
  }
  const priv = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: 'der', type: 'pkcs8' });
  const pub = createPublicKey(priv);
  return {
    publicKey: rawPublicKey(pub).toString('base64'),
    sign: (p) => sign(null, Buffer.from(canonicalPackage(p)), priv).toString('base64'),
  };
}

function rawPublicKey(k: KeyObject): Buffer {
  const der = k.export({ format: 'der', type: 'spki' });
  return der.subarray(der.length - 32);
}

const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');

export function verifyPackage(p: SignedFields, signature: string, publicKey: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(publicKey, 'base64')]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(canonicalPackage(p)), key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

/** Dấu vân tay ngắn của khoá công khai — hiện cho quản trị đối chiếu. */
export const keyFingerprint = (publicKey: string) =>
  createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('hex').slice(0, 16).replace(/(.{4})(?!$)/g, '$1:');

/**
 * Mẫu địa chỉ trang áp dụng gói: `https://egov.bkav.com/*`, `https://*.bkav.com/qlvb/*`, `http://localhost:8080/*`.
 * Bắt buộc có scheme + host + đường dẫn bắt đầu bằng "/"; `*` ở host chỉ được đứng đầu (`*.miền`) và khớp tên miền con;
 * `*` ở đường dẫn khớp mọi thứ. Không cho `https://egov.bkav.com*` (sẽ khớp cả egov.bkav.com.evil.com).
 */
const PATTERN = /^(https?):\/\/(\*\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*)(:\d{1,5})?(\/[^\s]*)$/i;

export function isValidMatch(pattern: string): boolean {
  return pattern.length <= 300 && PATTERN.test(pattern);
}

export function matchesUrl(patterns: readonly string[], url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  return patterns.some((pat) => {
    const m = PATTERN.exec(pat);
    if (!m) return false;
    const [, scheme, wild, host, port, path] = m;
    if (u.protocol !== `${scheme!.toLowerCase()}:`) return false;
    const h = host!.toLowerCase();
    if (wild ? !(u.hostname === h || u.hostname.endsWith(`.${h}`)) : u.hostname !== h) return false;
    if ((port ? port.slice(1) : '') !== u.port) return false;
    const re = new RegExp(`^${path!.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    return re.test(u.pathname + u.search);
  });
}

let runtimeCache: string | null = null;
/** Bộ hàm `vala` chạy trong trang (packages/core/runtime/vala-runtime.js) — Vala Desktop đóng gói cùng tệp này. */
export function valaRuntimeSource(): string {
  return (runtimeCache ??= readFileSync(fileURLToPath(new URL('../runtime/vala-runtime.js', import.meta.url)), 'utf8'));
}

/**
 * Mã chèn vào một khung: bộ hàm `vala` (cài một lần) + các gói khớp địa chỉ khung; null nếu không gói nào khớp. Kết quả
 * khi chạy: { mã gói: { ok, error? } }. Cùng cách ghép với Vala Desktop (apps/desktop/src/scripts.ts injectionFor): kịch bản
 * là thân hàm, ghép thẳng vào mã — không eval.
 */
export function injectionCode(packages: readonly SignedFields[], url: string, runtime = valaRuntimeSource()): string | null {
  const match = packages.filter((p) => matchesUrl(p.matches, url));
  if (!match.length) return null;
  const loads = match.map((p) =>
    `r[${JSON.stringify(p.code)}] = await window.__vala.load(${JSON.stringify({ code: p.code, version: p.version, css: p.css })}, async function (vala) {\n${p.script}\n});`);
  return `${runtime}\n;(async () => { const r = {};\n${loads.join('\n')}\nreturn r; })()`;
}
