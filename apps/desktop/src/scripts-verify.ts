/**
 * Kiểm gói kịch bản do máy chủ ký — BẢN SAO của packages/core/src/desktopScripts.ts (canonicalPackage, verifyPackage,
 * matchesUrl): ứng dụng không phụ thuộc @vala/core. Đổi định dạng bên đó thì đổi cả ở đây; test hai bên dùng chung một
 * chữ ký mẫu (test/scripts-verify.test.ts).
 */
import { createPublicKey, verify } from 'node:crypto';

export interface SignedFields {
  code: string;
  version: number;
  matches: string[];
  css: string;
  script: string;
}

export function canonicalPackage(p: SignedFields): string {
  return JSON.stringify(['vala-desktop-package/1', p.code, p.version, p.matches, p.css, p.script]);
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

const PATTERN = /^(https?):\/\/(\*\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*)(:\d{1,5})?(\/[^\s]*)$/i;

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
