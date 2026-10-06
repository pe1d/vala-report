import type { Db, Scope, Tx, UserContext } from './db/index.js';
import { withTenant } from './db/index.js';
import { Problem, L } from './errors.js';

export interface OrgMembership {
  id: number;
  ten: string;
  vai_tro: 'thanh_vien' | 'truong_don_vi';
}

export async function loadMemberships(t: Tx, userId: number): Promise<OrgMembership[]> {
  return t.any<OrgMembership>(
    `SELECT o.id, o.ten, uou.vai_tro
       FROM user_org_units uou JOIN org_units o ON o.id = uou.org_unit_id
      WHERE uou.app_user_id = $1
      ORDER BY uou.is_primary DESC, o.id`,
    [userId],
  );
}

export function allowedScopes(memberships: OrgMembership[]): Scope[] {
  return memberships.some((m) => m.vai_tro === 'truong_don_vi') ? ['ca_nhan', 'don_vi'] : ['ca_nhan'];
}

/**
 * Tính ngữ cảnh RLS cho một yêu cầu (mục 07):
 *  - ca_nhan: luôn khả dụng, không đơn vị nào.
 *  - don_vi: chỉ người có vai trò truong_don_vi; danh sách gồm đơn vị đó và mọi cấp dưới,
 *    suy ra từ org_units.path. Không phải trưởng ⇒ scope_denied, KHÔNG âm thầm hạ về ca_nhan.
 */
export async function resolveUserContext(db: Db, userId: number, scope: Scope): Promise<UserContext> {
  if (scope === 'ca_nhan') return { userId, scope, orgUnitsAllowed: [] };
  return withTenant(db, async (t) => {
    const heads = await t.map(
      `SELECT org_unit_id FROM user_org_units WHERE app_user_id = $1 AND vai_tro = 'truong_don_vi'`,
      [userId],
      (r: { org_unit_id: number }) => r.org_unit_id,
    );
    if (heads.length === 0) {
      throw new Problem('scope_denied', L('Không có quyền xem phạm vi đơn vị', 'Not allowed to view unit scope'), L('Chỉ trưởng đơn vị được chọn phạm vi này.', 'Only unit heads can choose this scope.'));
    }
    const ids = await t.map(
      `SELECT id FROM org_units WHERE path && $1::bigint[] ORDER BY id`,
      [heads],
      (r: { id: number }) => r.id,
    );
    return { userId, scope, orgUnitsAllowed: ids };
  });
}
