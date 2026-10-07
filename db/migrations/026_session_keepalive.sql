-- =====================================================================
-- 026 — Giữ phiên ở máy chủ (biên bản họp 10/2026, T10: "đẩy phần duy trì phiên lên backend"). Worker định kỳ gọi
-- session_probe bằng cookie đang lưu của kết nối do Vala Desktop / tiện ích / cookie cấp, để phiên không hết hạn vì để lâu
-- không dùng (kể cả khi máy người dùng tắt). Cột ghi lần giữ phiên gần nhất.
-- =====================================================================
SET search_path = tenant_bkav, core, public;

ALTER TABLE source_grants ADD COLUMN last_keepalive_at timestamptz;
COMMENT ON COLUMN source_grants.last_keepalive_at IS 'Lần worker gọi session_probe để giữ phiên gần nhất (keepAliveSessions).';
