-- Trung tâm thông báo (09/10/2026): thông báo của từng người dùng, gom từ Vala và các ứng dụng tích hợp (kịch bản / máy
-- chủ đẩy vào — POST /ext/notifications). Trạng thái: chưa đọc / đã đọc, chờ xử lý / đã xử lý; "xoá" chỉ ẩn (xoa_luc) để
-- kịch bản quét lại không thêm trùng (khoá nguon_id theo ứng dụng).
CREATE TABLE notifications (
    id           bigserial   PRIMARY KEY,
    app_user_id  bigint      NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    -- Ứng dụng / hệ thống phát sinh: mã ứng dụng trong desktop_apps (vd vala, src_egov) — để hiện biểu tượng, lọc.
    ung_dung     text        NOT NULL CHECK (ung_dung ~ '^[a-z][a-z0-9_]{1,39}$'),
    -- Mã của thông báo bên hệ thống nguồn (vd mã văn bản) — chống trùng khi quét lại.
    nguon_id     text        CHECK (nguon_id IS NULL OR length(nguon_id) <= 200),
    tieu_de      text        NOT NULL CHECK (length(tieu_de) BETWEEN 1 AND 300),
    noi_dung     text        CHECK (noi_dung IS NULL OR length(noi_dung) <= 2000),
    -- Địa chỉ mở chi tiết bên ứng dụng (link callback).
    link         text        CHECK (link IS NULL OR (link ~ '^https?://\S+$' AND length(link) <= 2000)),
    quan_trong   boolean     NOT NULL DEFAULT false,
    da_doc       boolean     NOT NULL DEFAULT false,
    da_xu_ly     boolean     NOT NULL DEFAULT false,
    xoa_luc      timestamptz,
    luc          timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notifications_nguon ON notifications (app_user_id, ung_dung, nguon_id) WHERE nguon_id IS NOT NULL;
CREATE INDEX notifications_user_luc ON notifications (app_user_id, luc DESC) WHERE xoa_luc IS NULL;
GRANT SELECT ON notifications TO app_reader, app_writer;
GRANT INSERT, UPDATE, DELETE ON notifications TO app_writer;
GRANT USAGE, SELECT ON SEQUENCE notifications_id_seq TO app_writer;
