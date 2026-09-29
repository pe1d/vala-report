import type { FastifyRequest } from 'fastify';
import type { Tx } from '@vala/core';

export type AuditAction = 'view_report' | 'export' | 'grant' | 'revoke' | 'schedule_change' | 'run_now' | 'login' | 'source_change';

/**
 * Ghi audit TRONG cùng transaction với truy vấn dữ liệu, TRƯỚC khi truy vấn chạy (mục 05):
 * audit lỗi ⇒ transaction huỷ ⇒ không có dữ liệu nào được trả.
 */
export async function audit(
  t: Tx, req: FastifyRequest, action: AuditAction, object: { type?: string; id?: string }, detail?: Record<string, unknown>,
  userId: number | null = req.user?.id ?? null,
): Promise<void> {
  await t.none(
    `INSERT INTO audit_log (app_user_id, action, object_type, object_id, detail, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, action, object.type ?? null, object.id ?? null, detail ? JSON.stringify(detail) : null,
     req.ip || null, req.headers['user-agent']?.slice(0, 300) ?? null],
  );
}
