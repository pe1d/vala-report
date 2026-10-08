# Vala Desktop — thanh ứng dụng dọc + Trợ lý AI — Kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** thay thanh tab ngang bằng thanh dọc bên trái (Trợ lý AI / Ứng dụng / Đang mở / hồ sơ), trang web chiếm toàn bộ
bên phải, trang Trợ lý AI mặc định với lệnh "/" chạy thao tác trực tiếp.

**Architecture:** cửa sổ giữ trang cục bộ của nó (`resources/tabs.html`) nhưng giờ là thanh dọc; các `WebContentsView` đặt
ở `x = độ rộng thanh`. Mục cố định mới `chat` (trang cục bộ như `settings`). Khung nổi (menu hồ sơ, khung ⊞) là một
`WebContentsView` trong suốt trên cùng (`resources/overlay.html`). Quy tắc thuần ở `tabs-model.ts` / `chat-model.ts` (có test).

Spec: `docs/superpowers/specs/2026-10-08-desktop-sidebar-chat-design.md`.

## Task

1. **Mô hình thuần (TDD)** — `tabs-model.ts`: `pinnedApps(saved, available)` (mặc định ghim tất cả; bỏ mục không còn; giữ
   thứ tự đã lưu, mục mới thêm cuối), `sidebarSections(...)` (Trợ lý AI / Ứng dụng / Đang mở). `chat-model.ts`:
   `parseCommand(text)`, `resultView(value)` (bảng / thông tin / chữ). Test trước.
2. **Cài đặt** — `settings.ts`: `sidebarCollapsed?: boolean`, `pinnedApps?: string[] | null`.
3. **browser.ts** — bố cục mới (thanh dọc 248/56px, trang web `x = w, y = 0`); mục `chat` mặc định; danh sách ứng dụng
   (home, portal, `src:<mã>` cho mọi nguồn) + ghim; mở ứng dụng chưa mở (nguồn ⇒ `showSourceTab`); IPC mới: điều hướng
   (back/forward/reload), thu gọn, mở khung nổi, ghim/bỏ ghim, mở ứng dụng; trạng thái gửi thanh dọc gồm 2 nhóm + nút điều
   hướng dùng được không.
4. **Thanh dọc** — viết lại `resources/tabs.html` + `src/renderer/tabs.ts` + `src/tabs-preload.ts`.
5. **Khung nổi** — `resources/overlay.html` + `src/renderer/overlay.ts` + `src/overlay-preload.ts`: menu hồ sơ, khung ⊞;
   lệnh về tiến trình chính (Cài đặt, ngôn ngữ, giao diện, mật khẩu, đồng bộ, cập nhật, đăng xuất, thoát, mở/ghim ứng dụng).
6. **Trang Trợ lý AI** — `resources/chat.html` + `src/renderer/chat.ts` + `src/chat-preload.ts` + `src/chat-page.ts`
   (IPC: trạng thái + chữ, hệ thống, thao tác của hệ thống — `sourceActions`, chạy — `runSourceAction`); chữ vi/en.
7. **Đóng gói, dọn** — `electron-builder.yml` thêm các trang mới; bỏ hook menu ⋯ / menu hồ sơ native khỏi thanh tab (khay hệ
   thống giữ nguyên); typecheck, test, build.
8. **Chạy thật** — Playwright `_electron`: chụp sáng/tối, mở rộng/thu gọn, menu hồ sơ, khung ⊞; chat `/` → QLVB Thử nghiệm
   → `lay_danh_sach_van_ban` ⇒ bảng 10 văn bản (hồ sơ dev đã đăng nhập Vala; hệ thống giả lập đang chạy).
