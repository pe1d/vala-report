import type { Queue } from 'bullmq';
import type { ConnectionSessions, CrawlJob, CrawlabClient, Db, PackageSigner, SecretStore, SessionManager, SourceInfo, SourceRegistries, SsoClient } from '@vala/core';

export interface ApiConfig {
  /** Đăng nhập cổng: 'password' (mặc định) và/hoặc 'sso'. */
  loginMethods: Array<'password' | 'sso'>;
  jwtSecret: string;
  internalToken: string;
  publicWebUrl: string;
  publicApiUrl: string;
  /** Địa chỉ API mà spider trong Crawlab gọi tới (đặt vào biến môi trường của Crawlab khi đồng bộ). */
  spiderApiUrl: string;
  /** Link giao diện Crawlab cho quản trị (chỉ kỹ sư vận hành). */
  crawlabWebUrl?: string;
  /** Runner chạy gói kịch bản Vala Desktop trên máy chủ (apps/runner). Không có ⇒ chỉ chạy được trong Vala Desktop. */
  runnerUrl?: string;
  /** Trang đổi mật khẩu SSO của Bkav (SSO_PASSWORD_URL, vd trang tài khoản của WSO2) — Vala Desktop mở cho người dùng SSO. */
  ssoPasswordUrl?: string;
}

export interface RateLimiter {
  /** true nếu được phép; false nếu đã dùng trong cửa sổ. */
  take(key: string, windowSeconds: number): Promise<boolean>;
}

export interface ApiDeps {
  reader: Db;
  writer: Db;
  secrets: SecretStore;
  sso: SsoClient;
  sessions: SessionManager;
  connections: ConnectionSessions;
  /** Danh mục hệ thống nguồn trong bộ nhớ (gồm hệ thống do quản trị tạo); reload() sau khi sửa. */
  sources: SourceRegistries;
  sourceInfo: (source: string) => Promise<SourceInfo>;
  /** Có ⇒ lịch chạy và "chạy ngay" đi qua Crawlab; không có ⇒ worker nội bộ. */
  crawlab?: CrawlabClient;
  queue: Pick<Queue<CrawlJob>, 'addBulk'>;
  /** Hàng đợi bảo trì của worker — báo dựng đơn vị ngay (Quản trị hệ thống → Đơn vị). Không có ⇒ worker tự quét mỗi phút. */
  maintenance?: Pick<Queue, 'add'>;
  limiter: RateLimiter;
  /** Ký gói kịch bản Vala Desktop (khoá từ .env, không trong CSDL). */
  packageSigner: PackageSigner;
  config: ApiConfig;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly until = new Map<string, number>();
  async take(key: string, windowSeconds: number) {
    const now = Date.now();
    if ((this.until.get(key) ?? 0) > now) return false;
    this.until.set(key, now + windowSeconds * 1000);
    return true;
  }
}
