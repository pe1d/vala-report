/**
 * Môi trường của các trang Quản trị: người đang đăng nhập, cách chạy thử thao tác kịch bản trong Vala Desktop, liên kết
 * sang trang thuộc Báo cáo. Nơi dùng (trang Quản trị của Vala Desktop; cổng web — dùng tạm) cấp qua AdminEnvProvider.
 */
import { createContext, useContext, type ReactNode } from 'react';

export interface DesktopActionInfo { name: string; pkg: string | null; mo_ta: string; params?: Record<string, string> | null }
export type DesktopActionResult =
  | { ok: true; result?: unknown; actions?: DesktopActionInfo[] }
  | { ok: false; error: string };

export interface AdminEnv {
  me: { id: number; email: string };
  /** Chạy thử thao tác của gói kịch bản bằng Vala Desktop trên máy này; null ⇒ không chạy được (chỉ chạy trên máy chủ). */
  desktop: {
    listActions(source: string): Promise<DesktopActionResult>;
    runAction(source: string, name: string, args: Record<string, unknown>): Promise<DesktopActionResult>;
  } | null;
  /** Liên kết sang trang Script crawl (thuộc Báo cáo); không có ⇒ chỉ hiện chữ. */
  crawlLink?: (children: ReactNode) => ReactNode;
}

const Ctx = createContext<AdminEnv | null>(null);
export const AdminEnvProvider = ({ value, children }: { value: AdminEnv; children: ReactNode }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;
export function useAdminEnv(): AdminEnv {
  const v = useContext(Ctx);
  if (!v) throw new Error('Thiếu AdminEnvProvider');
  return v;
}
