/**
 * Hồ sơ xác thực của hệ thống nguồn do quản trị tạo trên cổng (core.source_systems.auth_profile).
 * Chỉ mô tả PHIÊN: cookie nào là phiên, kiểm tra phiên ở đâu. Đủ để người dùng kết nối (tiện ích / dán
 * cookie) và để hệ thống kiểm tra phiên — lấy dữ liệu vẫn cần spider + báo cáo riêng.
 */
import { z } from 'zod';
import type { AdapterSpec } from './spec.js';

const CookieName = z.string().regex(/^[A-Za-z0-9_.\-$]{1,100}$/, 'tên cookie không hợp lệ');

export const AuthProfileSchema = z.object({
  cookies_required: z.array(z.union([CookieName, z.array(CookieName).min(1).max(5)])).min(1).max(10),
  cookies_optional: z.array(CookieName).max(10).default([]),
  cookie_domain: z.string().regex(/^[a-z0-9.-]+$/, 'tên miền không hợp lệ').optional(),
  probe: z.object({
    path: z.string().regex(/^\/[^\s?#]*$/, 'đường dẫn phải bắt đầu bằng / và không có ?/#').max(200),
    // Biểu thức chính quy có ĐÚNG một nhóm bắt: định danh tài khoản trên trang (vd egov\.userid\s*=\s*(\d+)).
    pattern: z.string().min(3).max(300).refine((p) => {
      try { return new RegExp(`${p}|`).exec('')!.length - 1 >= 1; } catch { return false; }
    }, 'mẫu phải là biểu thức chính quy hợp lệ và có một nhóm bắt ( … )'),
  }),
});
export type AuthProfile = z.infer<typeof AuthProfileSchema>;

/**
 * Dựng AdapterSpec tối thiểu từ hồ sơ: chỉ phần auth + endpoint duy nhất được phép là trang kiểm tra phiên.
 * Không có capability nào ⇒ không crawl được bằng runtime TypeScript (đúng ý: dữ liệu đi qua spider).
 */
export function specFromProfile(code: string, profile: AuthProfile): AdapterSpec {
  const p = AuthProfileSchema.parse(profile);
  return {
    id: `${code}.portal`,
    version: '0.0.0',
    source_system: code,
    execution: 'server',
    transport: 'http_api',
    auth: {
      type: 'delegated_session',
      vault_ref: `vault://{tenant}/users/{app_user_id}/${code}`,
      cookies_required: p.cookies_required,
      cookies_optional: p.cookies_optional,
      cookie_domain: p.cookie_domain,
      session_probe: {
        request: { method: 'GET', path: p.probe.path },
        extract: { puid: { type: 'regex', pattern: p.probe.pattern, group: 1 } },
      },
    },
    allowed_endpoints: [{ method: 'GET', path: p.probe.path }],
    rate_limit: { max_requests_per_minute: 20, delay_between_calls_ms: 500 },
    capabilities: [],
    scheduling: { selector: 'none' },
    monitoring: { schema_baseline_fields: [] },
  } as unknown as AdapterSpec;
}
