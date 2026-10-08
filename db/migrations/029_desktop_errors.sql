-- 029 — báo lỗi / crash của Vala Desktop (người dùng chốt 08/10/2026: tự gửi, tắt được trong Cài đặt). Dùng chung mọi
-- đơn vị (quản trị hệ thống xem ở Quản trị → Lỗi Desktop). Lỗi giống nhau gom một dòng theo dấu vân tay (apps/api/src/
-- desktop-errors.ts fingerprint), đếm số lần. Không lưu nội dung trang, mật khẩu, cookie (app + máy chủ đều làm sạch).
CREATE TABLE core.desktop_errors (
    id           bigserial PRIMARY KEY,
    dau_van      text NOT NULL UNIQUE,
    loai         text NOT NULL CHECK (loai IN ('crash', 'loi_chinh', 'loi_trang', 'trang_chet', 'tien_trinh_chet', 'trang_treo', 'cap_nhat', 'kich_ban')),
    phien_ban    text NOT NULL,
    he_dieu_hanh text NOT NULL,
    thong_bao    text NOT NULL,
    stack        text,
    ngu_canh     jsonb NOT NULL DEFAULT '{}',
    tenant       text,
    user_id      bigint,
    device_id    bigint,
    so_lan       integer NOT NULL DEFAULT 1,
    lan_dau      timestamptz NOT NULL DEFAULT now(),
    lan_cuoi     timestamptz NOT NULL DEFAULT now(),
    -- crash: minidump gần nhất (≤ 5 MB)
    dump         bytea,
    dump_bytes   integer
);
CREATE INDEX desktop_errors_lan_cuoi ON core.desktop_errors (lan_cuoi DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON core.desktop_errors TO app_writer;
GRANT USAGE ON SEQUENCE core.desktop_errors_id_seq TO app_writer;
