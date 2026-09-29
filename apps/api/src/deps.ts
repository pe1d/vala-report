import type { Queue } from 'bullmq';
import type { ConnectionSessions, CrawlJob, CrawlabClient, Db, SecretStore, SessionManager, SourceInfo, SourceRegistry, SsoClient } from '@vala/core';

export interface ApiConfig {
  /** Đăng nhập cổng: 'password' (mặc định) và/hoặc 'sso'. */
  loginMethods: Array<'password' | 'sso'>;
  jwtSecret: string;
  internalToken: string;
  publicWebUrl: string;
  publicApiUrl: string;
  tenant: string;
  /** Địa chỉ API mà spider trong Crawlab gọi tới (đặt vào biến môi trường của Crawlab khi đồng bộ). */
  spiderApiUrl: string;
  /** Link giao diện Crawlab cho quản trị (chỉ kỹ sư vận hành). */
  crawlabWebUrl?: string;
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
  sources: SourceRegistry;
  sourceInfo: (source: string) => Promise<SourceInfo>;
  /** Có ⇒ lịch chạy và "chạy ngay" đi qua Crawlab; không có ⇒ worker nội bộ. */
  crawlab?: CrawlabClient;
  queue: Pick<Queue<CrawlJob>, 'addBulk'>;
  limiter: RateLimiter;
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
