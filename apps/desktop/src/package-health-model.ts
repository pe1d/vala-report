/**
 * Giám sát phiên dịch (gói kịch bản) — phần thuần, có test: từ kết quả __vala.health() của một trang và dấu vân tay phiên
 * bản trang gốc lần trước ⇒ những gì cần báo quản trị (thiếu phụ thuộc, trang gốc đổi phiên bản).
 */
export interface HealthResult { thieu?: string[]; phien_ban?: string | null; bo_qua?: boolean; loi?: string }
export interface HealthReport { goi: string; kieu: 'thieu_phu_thuoc' | 'doi_phien_ban' | 'loi_kiem'; thong_bao: string; ngu_canh: Record<string, string> }

/** `prev`: { "<gói>@<host>": dấu vân tay } ⇒ báo cáo + bản đồ dấu vân tay mới. Lần đầu thấy một gói trên một host thì chỉ ghi nhớ. */
export function healthEvents(r: Record<string, HealthResult>, prev: Record<string, string>, host: string): { reports: HealthReport[]; versions: Record<string, string> } {
  const reports: HealthReport[] = [];
  const versions = { ...prev };
  for (const [goi, h] of Object.entries(r ?? {})) {
    if (!h || h.bo_qua) continue;
    if (h.loi) { reports.push({ goi, kieu: 'loi_kiem', thong_bao: `Gói ${goi}: không kiểm được trang gốc (${h.loi})`, ngu_canh: { trang: host } }); continue; }
    if (h.thieu?.length) {
      reports.push({ goi, kieu: 'thieu_phu_thuoc', thong_bao: `Gói ${goi}: trang gốc thiếu ${h.thieu.slice(0, 10).join(', ')}`, ngu_canh: { trang: host, thieu: h.thieu.slice(0, 30).join(', ') } });
    }
    const key = `${goi}@${host}`;
    if (h.phien_ban) {
      if (prev[key] && prev[key] !== h.phien_ban) {
        reports.push({ goi, kieu: 'doi_phien_ban', thong_bao: `Gói ${goi}: trang gốc ${host} đổi phiên bản`, ngu_canh: { trang: host, cu: prev[key]!.slice(0, 200), moi: h.phien_ban.slice(0, 200) } });
      }
      versions[key] = h.phien_ban;
    }
  }
  return { reports, versions };
}

/** Lỗi thao tác vb_* đáng báo quản trị: không phải hết phiên / lỗi nghiệp vụ (người dùng nhập sai) / trang chưa sẵn sàng. */
export const actionFailureWorthReporting = (code: string | undefined): boolean =>
  !['het_phien', 'nghiep_vu', 'du_lieu_khong_hop_le', 'chua_san_sang'].includes(code ?? '');
