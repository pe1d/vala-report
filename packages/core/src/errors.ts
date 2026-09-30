/**
 * Lỗi nghiệp vụ theo RFC 7807. `type` là mã máy đọc được mà frontend rẽ nhánh theo
 * (mục 05): session_expired và grant_required dẫn người dùng đi uỷ quyền lại.
 */
export type ProblemType =
  | 'session_expired'
  | 'grant_required'
  | 'scope_denied'
  | 'schema_drift'
  | 'invalid_params'
  | 'not_found'
  | 'unauthenticated'
  | 'forbidden'
  | 'rate_limited'
  | 'endpoint_not_allowed'
  | 'invalid_credentials'
  | 'otp_required'
  /** Kho bí mật không còn phiên đã lưu (vd máy chủ/kho khởi động lại) — không phải phiên hết hạn trên nguồn. */
  | 'session_missing'
  /** Hệ thống nguồn lỗi (HTTP 5xx) hoặc không phản hồi — không liên quan phiên đăng nhập. */
  | 'source_unavailable'
  /** Nguồn từ chối một request nhưng phiên vẫn còn hiệu lực (thiếu quyền trên chức năng đó…). */
  | 'source_denied'
  /** Đăng nhập bằng mật khẩu tạm (quản trị cấp/đặt lại) ⇒ phải đổi mật khẩu trước khi dùng. */
  | 'password_change_required'
  | 'internal';

const STATUS: Record<ProblemType, number> = {
  session_expired: 409,
  grant_required: 409,
  scope_denied: 403,
  schema_drift: 502,
  invalid_params: 422,
  not_found: 404,
  unauthenticated: 401,
  forbidden: 403,
  rate_limited: 429,
  endpoint_not_allowed: 500,
  invalid_credentials: 422,
  otp_required: 422,
  password_change_required: 403,
  session_missing: 409,
  source_unavailable: 502,
  source_denied: 502,
  internal: 500,
};

export class Problem extends Error {
  readonly status: number;
  constructor(
    readonly type: ProblemType,
    readonly title: string,
    readonly detail?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(detail ? `${title}: ${detail}` : title);
    this.status = STATUS[type];
  }

  toJSON() {
    return { type: this.type, title: this.title, status: this.status, detail: this.detail, ...this.extra };
  }
}
