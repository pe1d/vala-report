/**
 * Sự đồng ý của người dùng (mô hình dữ liệu cá nhân — phương án, mục 11): Vala dùng tài khoản của chính họ trên hệ thống
 * nguồn để lấy dữ liệu theo lịch họ đặt; nhật ký của hệ thống nguồn sẽ ghi nhận các lần truy cập đó. Lưu thời điểm +
 * phiên bản nội dung (đổi nội dung ⇒ tăng CONSENT_VERSION ⇒ người dùng xác nhận lại). Không chặn việc lấy dữ liệu của
 * kết nối đã có — giao diện nhắc xác nhận.
 */
import { L, Problem, withTenant, withUserContext, type Tx, type UserContext } from '@vala/core';
import type { FastifyRequest } from 'fastify';
import { audit } from './audit.js';
import type { ApiDeps } from './deps.js';

export const CONSENT_VERSION = '2026-10';
const own = (userId: number): UserContext => ({ userId, scope: 'ca_nhan', orgUnitsAllowed: [] });

/** Hệ thống nguồn người dùng đã đồng ý (đúng phiên bản hiện tại) ⇒ thời điểm đồng ý. */
export async function consentsOf(t: Tx, userId: number): Promise<Map<string, string>> {
  const rows = await t.any<{ source_system: string; consented_at: string }>(
    'SELECT source_system, consented_at FROM source_consents WHERE app_user_id = $1 AND version = $2', [userId, CONSENT_VERSION]);
  return new Map(rows.map((r) => [r.source_system, r.consented_at]));
}

export async function giveConsent(deps: ApiDeps, req: FastifyRequest, userId: number, source: string, via: 'portal' | 'extension') {
  if (!deps.sources.get(source)) throw new Problem('not_found', L('Không có hệ thống nguồn này', 'Source system not found'));
  return withUserContext(deps.reader, own(userId), async (t) => {
    const r = await t.one<{ consented_at: string }>(
      `INSERT INTO source_consents (app_user_id, source_system, version, via) VALUES ($1, $2, $3, $4)
       ON CONFLICT (app_user_id, source_system) DO UPDATE SET version = EXCLUDED.version, via = EXCLUDED.via, consented_at = now()
       RETURNING consented_at`, [userId, source, CONSENT_VERSION, via]);
    await audit(t, req, 'grant', { type: 'source_consent', id: source }, { version: CONSENT_VERSION, via });
    return { source_system: source, version: CONSENT_VERSION, consented_at: r.consented_at };
  });
}

export const consentsFor = (deps: ApiDeps, userId: number) => withTenant(deps.writer, (t) => consentsOf(t, userId));
