/**
 * Đặt NGỮ CẢNH ĐƠN VỊ cho mỗi request (multi-tenant — packages/core/src/tenant.ts):
 *   - JWT của cổng mang claim `tnt` (chỉ đọc khi chữ ký đúng; authenticate() vẫn kiểm đầy đủ như cũ);
 *   - token thiết bị dạng `vxt_<mã>.<ngẫu nhiên>`;
 *   - request nội bộ (spider, runner — mang token nội bộ) gửi header `X-Vala-Tenant`.
 * Không có / token đời cũ (không mang mã) ⇒ bkav, để bản cài cũ chạy tiếp. Đơn vị không tồn tại / tạm khoá ⇒ 401.
 * Gắn thẳng vào app gốc (không qua register) để áp cho MỌI route.
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_TENANT, L, Problem, isTenantCode, setRequestTenant, withTenantStore } from '@vala/core';
import { verify } from './tokens.js';

export interface TenantHookOpts {
  jwtSecret: string;
  internalToken: string;
  /** Trạng thái đơn vị (core.tenants, có đệm) — null nếu không có. */
  status: (ma: string) => Promise<string | null>;
}

const DEVICE = /^vxt_([a-z][a-z0-9]{1,19})\./;

export function tenantFromHeaders(h: Record<string, string | string[] | undefined>, o: TenantHookOpts): string {
  const auth = typeof h.authorization === 'string' ? h.authorization : '';
  const bearer = /^Bearer (.+)$/.exec(auth)?.[1];
  if (!bearer) return DEFAULT_TENANT;
  const want = Buffer.from(o.internalToken);
  const got = Buffer.from(bearer);
  if (got.length === want.length && timingSafeEqual(got, want)) {
    const t = h['x-vala-tenant'];
    return isTenantCode(t) ? t : DEFAULT_TENANT;
  }
  const d = DEVICE.exec(bearer);
  if (d) return d[1]!;
  if (bearer.startsWith('vxt_')) return DEFAULT_TENANT;
  const p = verify<{ tnt?: unknown }>(bearer, o.jwtSecret);
  return p && isTenantCode(p.tnt) ? p.tnt : DEFAULT_TENANT;
}

export function installTenantHook(app: FastifyInstance, o: TenantHookOpts): void {
  // Dạng callback: done() được gọi BÊN TRONG kho ngữ cảnh ⇒ các hook sau và handler chạy trong ngữ cảnh của request.
  app.addHook('onRequest', (req, _reply, done) => {
    withTenantStore(() => {
      const ma = tenantFromHeaders(req.headers, o);
      o.status(ma).then((st) => {
        if (st !== 'hoat_dong') {
          done(new Problem('unauthenticated', L('Đơn vị không tồn tại hoặc đang tạm khoá', 'The organization does not exist or is suspended')));
          return;
        }
        setRequestTenant(ma);
        done();
      }, (e: Error) => done(e));
    });
  });
}
