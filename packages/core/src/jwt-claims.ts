/**
 * Đọc claim từ JWT do SSO trả (id_token; userinfo dạng JWT — vd Bkav SSO/WSO2 trả userinfo là JWT chứ không phải JSON).
 *
 * KHÔNG kiểm chữ ký: các JWT này lấy THẲNG từ máy chủ SSO qua HTTPS (token endpoint xác thực bằng client secret, userinfo
 * bằng access token) — OIDC Core 3.1.3.7 cho phép dựa vào TLS thay cho chữ ký trong trường hợp này. Vẫn kiểm iss (đúng
 * SSO), aud (cấp cho đúng client này), exp (còn hạn) để không nhận nhầm token của ứng dụng khác.
 * Không bao giờ dùng cho JWT nhận từ trình duyệt / bên thứ ba.
 */
export type Claims = Record<string, unknown> & { sub?: unknown };

/** Lệch giờ chấp nhận giữa máy chủ Vala và SSO. */
const SKEW_SECONDS = 120;

export function looksLikeJwt(text: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(text.trim());
}

/** Phần nội dung (payload) của JWT, hoặc null nếu không phải JWT hợp lệ. */
export function decodeJwtPayload(jwt: string): Claims | null {
  const t = jwt.trim();
  if (!looksLikeJwt(t)) return null;
  try {
    const payload = JSON.parse(Buffer.from(t.split('.')[1]!, 'base64url').toString('utf8')) as unknown;
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Claims) : null;
  } catch {
    return null;
  }
}

/**
 * Claim dùng được, hoặc null nếu: thiếu sub; iss khác SSO đã cấu hình; aud không gồm client này (bắt buộc có aud khi
 * requireAud — id_token); đã hết hạn (quá SKEW_SECONDS).
 */
export function checkedClaims(
  c: Claims,
  o: { issuer?: string; clientId: string; now?: number; requireAud?: boolean },
): Claims | null {
  if (typeof c.sub !== 'string' || !c.sub) return null;
  const now = o.now ?? Math.floor(Date.now() / 1000);
  if (o.issuer && typeof c.iss === 'string' && c.iss.replace(/\/$/, '') !== o.issuer.replace(/\/$/, '')) return null;
  const aud = typeof c.aud === 'string' ? [c.aud] : Array.isArray(c.aud) ? c.aud.filter((a): a is string => typeof a === 'string') : null;
  if (aud ? !aud.includes(o.clientId) : o.requireAud) return null;
  if (typeof c.exp === 'number' && c.exp + SKEW_SECONDS < now) return null;
  return c;
}
