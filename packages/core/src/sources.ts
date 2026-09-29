/**
 * Danh mục hệ thống nguồn (core.source_systems) và CẤU HÌNH ADAPTER của từng hệ thống, giữ trong bộ nhớ.
 * Cấu hình nằm trong CSDL (adapter_yaml hoặc auth_profile), không nằm trong code:
 *   - adapter_yaml: adapter đầy đủ (xác thực, endpoint được phép, cách lấy + chuẩn hoá dữ liệu, bảng đích).
 *   - auth_profile: hệ thống quản trị tạo nhanh — chỉ phần phiên đăng nhập.
 * Lần đầu (cả hai cột NULL) chép adapter mẫu trong repo (adapters/*.yaml) vào CSDL.
 * install() ⇒ mọi nơi gọi loadAllSpecs() trong tiến trình dùng cấu hình này. Gọi reload() sau mỗi lần sửa.
 */
import { AuthProfileSchema, parseSpec, repoSpecFiles, setSpecProvider, specFromProfile, type AdapterSpec, type AuthProfile } from './adapter/index.js';
import { withTenant, type Db } from './db/index.js';
import type { AuthMethod } from './connections.js';

export interface SourceRow {
  code: string;
  ten: string;
  mo_ta: string | null;
  base_url: string;
  enabled: boolean;
  login_hosts: string[];
  auth_profile: AuthProfile | null;
  adapter_yaml: string | null;
  adapter_updated_at: Date | null;
  connection_methods: AuthMethod[];
  updated_at: Date;
}

export class SourceRegistry {
  private rows = new Map<string, SourceRow>();
  private all: AdapterSpec[] = [];
  /** Cấu hình hỏng (sửa tay trong CSDL…) — trang quản trị hiện lỗi, hệ thống bỏ qua cấu hình đó. */
  readonly errors = new Map<string, string>();

  constructor(private readonly db: Db, private readonly opts: { importFromRepo?: boolean } = {}) {}

  async reload(): Promise<void> {
    const q = () => withTenant(this.db, (t) => t.any<SourceRow>(
      `SELECT code, ten, mo_ta, base_url, enabled, login_hosts, auth_profile, adapter_yaml, adapter_updated_at,
              connection_methods, updated_at
         FROM core.source_systems ORDER BY code`));
    let rows = await q();
    if (this.opts.importFromRepo !== false && rows.some((r) => !r.adapter_yaml && !r.auth_profile)) {
      if (await this.importFromRepo(rows)) rows = await q();
    }
    const specs: AdapterSpec[] = [];
    this.errors.clear();
    for (const r of rows) {
      try {
        if (r.adapter_yaml) {
          const s = parseSpec(r.adapter_yaml);
          if (s.source_system !== r.code) throw new Error(`adapter.source_system = '${s.source_system}' nhưng hệ thống là '${r.code}'`);
          specs.push(s);
        } else if (r.auth_profile) {
          specs.push(specFromProfile(r.code, AuthProfileSchema.parse(r.auth_profile)));
        }
      } catch (e) {
        this.errors.set(r.code, (e as Error).message.slice(0, 500));
      }
    }
    this.rows = new Map(rows.map((r) => [r.code, r]));
    this.all = specs;
  }

  /** Chép adapter mẫu trong repo vào CSDL cho hệ thống chưa có cấu hình nào. Chỉ ghi khi cột còn NULL. */
  private async importFromRepo(rows: SourceRow[]): Promise<boolean> {
    let files: ReturnType<typeof repoSpecFiles>;
    try { files = repoSpecFiles(); } catch { return false; }
    let n = 0;
    for (const r of rows) {
      if (r.adapter_yaml || r.auth_profile) continue;
      const f = files.find((x) => x.spec.source_system === r.code);
      if (!f) continue;
      n += await withTenant(this.db, (t) => t.result(
        `UPDATE core.source_systems SET adapter_yaml = $2, adapter_updated_at = now()
          WHERE code = $1 AND adapter_yaml IS NULL AND auth_profile IS NULL`, [r.code, f.text], (x) => x.rowCount));
    }
    return n > 0;
  }

  /** Cho mọi loadAllSpecs() trong tiến trình dùng cấu hình từ CSDL. */
  install(): this {
    setSpecProvider(this.specs);
    return this;
  }

  /** Mọi adapter đang dùng (adapter_yaml + auth_profile). */
  readonly specs = (): AdapterSpec[] => this.all;

  get(code: string): SourceRow | undefined {
    return this.rows.get(code);
  }

  list(): SourceRow[] {
    return [...this.rows.values()];
  }
}
