-- =====================================================================
-- 015 — Người dùng tự đặt lịch (giờ tuỳ ý, theo thứ, hàng tháng, nhiều lần trong ngày, một lần).
--
--   * report_subscriptions.schedule: lịch CÓ CẤU TRÚC (packages/core/src/schedule.ts), không phải cron thô.
--   * Việc hẹn giờ chuyển từ Crawlab (mỗi spider × preset một lịch cố định) sang worker của Vala: mỗi phút
--     worker tìm lịch đến hạn rồi chạy spider cho ĐÚNG người đó (--user). Vì vậy schedule_preset thôi được dùng
--     để gom người dùng: lịch cũ đổi sang dạng mới và schedule_preset để NULL (lịch Crawlab theo preset nếu
--     còn chạy sẽ không gom được ai; "Đồng bộ Crawlab" xoá hẳn các lịch đó).
-- =====================================================================
SET search_path = tenant_bkav, core, public;

ALTER TABLE report_subscriptions
    ADD COLUMN schedule jsonb,
    ALTER COLUMN schedule_preset DROP NOT NULL;

UPDATE report_subscriptions SET schedule = CASE schedule_preset
    WHEN 'hang_ngay_07'          THEN '{"kind":"hang_ngay","times":["07:00"]}'
    WHEN 'hang_tuan_t2_08'       THEN '{"kind":"hang_tuan","days":[1],"times":["08:00"]}'
    WHEN 'hang_thang_ngay1_08'   THEN '{"kind":"hang_thang","days_of_month":[1],"times":["08:00"]}'
    WHEN 'moi_2h_gio_hanh_chinh' THEN '{"kind":"lap_lai","every_hours":2,"from":"08:00","to":"18:00","days":[1,2,3,4,5]}'
    ELSE '{"kind":"hang_ngay","times":["07:00"]}'
  END::jsonb;
UPDATE report_subscriptions SET schedule_preset = NULL;

ALTER TABLE report_subscriptions ALTER COLUMN schedule SET NOT NULL;
COMMENT ON COLUMN report_subscriptions.schedule IS
    'Lịch có cấu trúc {kind: hang_ngay|hang_tuan|hang_thang|lap_lai|mot_lan, ...}. Worker tính next_run_at theo giờ Việt Nam.';
COMMENT ON COLUMN report_subscriptions.schedule_preset IS 'Cũ (trước 015) — không còn dùng.';
