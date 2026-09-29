import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { Problem } from '@vala/core';

const ajv = new Ajv({ allErrors: true, useDefaults: true, coerceTypes: false, strict: false });
addFormats.default(ajv, ['date']);

const cache = new Map<string, ReturnType<typeof ajv.compile>>();

/** Kiểm tham số theo param_schema của báo cáo; lỗi ⇒ 422 invalid_params kèm danh sách lỗi. */
export function validateParams(code: string, schema: object, defaults: object, params: unknown): Record<string, unknown> {
  // Báo cáo cấu hình sửa được trên cổng ⇒ khoá cache theo cả nội dung schema, không chỉ mã báo cáo.
  const key = `${code}:${JSON.stringify(schema)}`;
  let validate = cache.get(key);
  if (!validate) {
    validate = ajv.compile(schema);
    cache.set(key, validate);
  }
  const value = { ...defaults, ...(params && typeof params === 'object' ? params : {}) };
  if (!validate(value)) {
    throw new Problem('invalid_params', 'Tham số không hợp lệ', undefined, {
      errors: (validate.errors ?? []).map((e) => ({ path: e.instancePath || '/', message: e.message })),
    });
  }
  return value;
}

const TZ = 'Asia/Ho_Chi_Minh';
const ymd = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ });

/**
 * "Tháng hiện tại" tự trượt theo ngày chạy: tính tại thời điểm xem, theo giờ Việt Nam.
 * Trả [tu_ngay, den_ngay] dạng YYYY-MM-DD, cả hai đầu tính cả.
 */
export function resolvePeriod(p: Record<string, unknown>, now = new Date()): { tu_ngay: string; den_ngay: string } {
  const today = ymd(now);
  const [y, m] = today.split('-').map(Number) as [number, number];
  const firstOf = (yy: number, mm: number) => ymd(new Date(Date.UTC(yy, mm - 1, 1, 12)));
  const lastOf = (yy: number, mm: number) => ymd(new Date(Date.UTC(yy, mm, 0, 12)));
  switch (p.khoang_thoi_gian ?? 'thang_hien_tai') {
    case 'thang_truoc': {
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      return { tu_ngay: firstOf(py, pm), den_ngay: lastOf(py, pm) };
    }
    case 'quy_hien_tai': {
      const qm = Math.floor((m - 1) / 3) * 3 + 1;
      return { tu_ngay: firstOf(y, qm), den_ngay: lastOf(y, qm + 2) };
    }
    case '30_ngay_qua':
      return { tu_ngay: ymd(new Date(now.getTime() - 29 * 86_400_000)), den_ngay: today };
    case '6_thang_qua':
      return { tu_ngay: ymd(new Date(now.getTime() - 181 * 86_400_000)), den_ngay: today };
    // Khoảng về phía trước — cho trường hạn (vd việc đến hạn 14 ngày tới), hôm nay tính là ngày đầu.
    case '7_ngay_toi':
    case '14_ngay_toi':
    case '30_ngay_toi': {
      const n = Number.parseInt(String(p.khoang_thoi_gian), 10);
      return { tu_ngay: today, den_ngay: ymd(new Date(now.getTime() + (n - 1) * 86_400_000)) };
    }
    case '12_thang_qua':
      return { tu_ngay: firstOf(m === 12 ? y : y - 1, m === 12 ? 1 : m + 1), den_ngay: lastOf(y, m) };
    case 'tat_ca':
      return { tu_ngay: '1900-01-01', den_ngay: '2999-12-31' };
    case 'tuy_chon': {
      const tu = p.tu_ngay as string | undefined;
      const den = p.den_ngay as string | undefined;
      if (!tu || !den) throw new Problem('invalid_params', 'Tham số không hợp lệ', 'Khoảng tuỳ chọn cần cả Từ ngày và Đến ngày');
      if (tu > den) throw new Problem('invalid_params', 'Tham số không hợp lệ', 'Từ ngày phải trước Đến ngày');
      return { tu_ngay: tu, den_ngay: den };
    }
    default:
      return { tu_ngay: firstOf(y, m), den_ngay: lastOf(y, m) };
  }
}
