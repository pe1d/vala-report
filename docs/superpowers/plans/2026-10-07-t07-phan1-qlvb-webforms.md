# T07 phần 1 — Hệ thống WebForms giả lập "QLVB Thử nghiệm" — Kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng một hệ thống quản lý văn bản bằng ASP.NET WebForms thật (Mono) có đủ 4 nghiệp vụ và các "bẫy" WebForms, làm
nguồn thử cho T07 phần 2–4.

**Architecture:** Web Site ASP.NET kiểu cũ (không project, không build trước): `.aspx` có mã C# nội tuyến, dùng chung một
master page; dữ liệu trong bộ nhớ ở `App_Code/Store.cs`. Chạy bằng `xsp4` trong ảnh `mono:6.12`, dịch vụ `qlvb-webforms` của
`docker-compose.yml` (cổng 4030). Bộ test vitest gọi HTTP như một trình duyệt tối giản (giữ cookie, gửi lại trường ẩn).

**Tech Stack:** Mono 6.12 + xsp4 (ASP.NET 4.5 WebForms, Forms auth, ScriptManager/UpdatePanel), Docker Compose,
vitest 2 + fetch của Node 18.

Spec: `docs/superpowers/specs/2026-10-07-t07-aspnet-design.md` (phần 1). Đã chạy thử (spike) xác nhận Mono 6.12 có
`__VIEWSTATE` chống sửa, `__EVENTVALIDATION`, UpdatePanel trả phản hồi `độ dài|loại|id|…`, CheckBoxList gửi `tên$i=<giá trị>`.

## Cấu trúc tệp

| Tệp | Trách nhiệm |
|---|---|
| `tools/qlvb-webforms/Dockerfile` | ảnh Mono 6.12 + xsp4 (nguồn apt `archive.debian.org`) |
| `tools/qlvb-webforms/app/Web.config` | Forms auth, phiên 20 phút, machineKey cố định, EventValidation, ViewState MAC |
| `tools/qlvb-webforms/app/Global.asax` | `POST /_dev/reset` |
| `tools/qlvb-webforms/app/App_Code/Store.cs` | mô hình dữ liệu, dữ liệu mẫu, nghiệp vụ (khoá luồng) |
| `tools/qlvb-webforms/app/Site.master` | khung trang, kiểm tra đăng nhập, "Xin chào …", đăng xuất |
| `tools/qlvb-webforms/app/Login.aspx`, `Default.aspx` | đăng nhập; trang gốc chuyển về danh sách |
| `tools/qlvb-webforms/app/VanBan.aspx` | danh sách: tìm, lọc (AutoPostBack), GridView phân trang |
| `tools/qlvb-webforms/app/ChiTiet.aspx` | chi tiết, lịch sử, Kết thúc (LinkButton) |
| `tools/qlvb-webforms/app/DuThao.aspx` | tạo dự thảo (validator, tệp đính kèm) |
| `tools/qlvb-webforms/app/Chuyen.aspx` | chuyển (đơn vị ⇒ người nhận nạp lại) |
| `tools/qlvb-webforms/app/PhatHanh.aspx` | phát hành (UpdatePanel số dự kiến) |
| `tools/qlvb-webforms/package.json` | gói workspace `@vala/qlvb-webforms`, lệnh `test` |
| `tools/qlvb-webforms/test/wf.ts` | khách HTTP tối giản cho test (cookie, trường ẩn, postback, multipart, UpdatePanel) |
| `tools/qlvb-webforms/test/qlvb.test.ts` | test 4 nghiệp vụ + bẫy |
| `tools/qlvb-webforms/README.md` | cách chạy, tài khoản, các trang, các bẫy |
| `docker-compose.yml` | thêm dịch vụ `qlvb-webforms` (profile `dev`, `qlvb`) |

Không có test đơn vị cho C# (Mono không có bộ test sẵn trong ảnh); toàn bộ hành vi được kiểm qua HTTP bằng `qlvb.test.ts`,
đúng như cách phần 2–4 sẽ dùng hệ thống này. Vì vậy thứ tự là: dựng khung + test hạ tầng trước, rồi mỗi trang một task theo
TDD (viết test → chạy thấy hỏng → viết trang → chạy thấy qua).

---

### Task 1: Ảnh Docker, Web.config, Global.asax, Store, dịch vụ compose

**Files:**
- Create: `tools/qlvb-webforms/Dockerfile`, `tools/qlvb-webforms/app/Web.config`, `tools/qlvb-webforms/app/Global.asax`,
  `tools/qlvb-webforms/app/App_Code/Store.cs`, `tools/qlvb-webforms/app/Default.aspx`
- Modify: `docker-compose.yml` (thêm dịch vụ trước khối `volumes:`)

- [ ] **Step 1: Dockerfile**

```dockerfile
# Hệ thống quản lý văn bản ASP.NET WebForms giả lập (T07) — WebForms THẬT trên Mono, không phải bắt chước.
FROM mono:6.12
# Debian buster (nền của mono:6.12) đã hết hỗ trợ: kho gói chuyển sang archive.debian.org; buster-updates không còn.
RUN sed -i -e 's|deb.debian.org|archive.debian.org|g' -e '/buster-updates/d' /etc/apt/sources.list \
 && apt-get update && apt-get install -y --no-install-recommends mono-xsp4 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY app/ /app/
EXPOSE 4030
CMD ["xsp4", "--port", "4030", "--address", "0.0.0.0", "--nonstop", "--root", "/app"]
```

- [ ] **Step 2: Web.config**

```xml
<?xml version="1.0"?>
<!-- QLVB Thử nghiệm: cấu hình giữ đúng các cơ chế của hệ thống WebForms thật (T07). -->
<configuration>
  <system.web>
    <compilation debug="true" targetFramework="4.5" />
    <httpRuntime targetFramework="4.5" maxRequestLength="10240" />
    <globalization requestEncoding="utf-8" responseEncoding="utf-8" culture="vi-VN" uiCulture="vi-VN" />
    <!-- Chống sửa ViewState + kiểm giá trị gửi lên (EventValidation). machineKey cố định để khởi động lại vẫn đọc được trang cũ. -->
    <pages enableEventValidation="true" enableViewStateMac="true" />
    <machineKey validationKey="A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4"
                decryptionKey="0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF" validation="SHA1" decryption="AES" />
    <!-- Hai cookie phiên như hệ thống thật: .ASPXAUTH (Forms auth) + ASP.NET_SessionId (Session). -->
    <authentication mode="Forms">
      <forms name=".ASPXAUTH" loginUrl="Login.aspx" defaultUrl="VanBan.aspx" timeout="20" slidingExpiration="true" />
    </authentication>
    <authorization><deny users="?" /></authorization>
    <sessionState mode="InProc" timeout="20" />
    <customErrors mode="Off" />
  </system.web>
  <location path="Login.aspx"><system.web><authorization><allow users="*" /></authorization></system.web></location>
</configuration>
```

- [ ] **Step 3: App_Code/Store.cs** (mô hình + dữ liệu mẫu + nghiệp vụ)

```csharp
// Dữ liệu QLVB Thử nghiệm: giữ trong bộ nhớ, nạp lại dữ liệu mẫu mỗi lần khởi động hoặc POST /_dev/reset.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.Security;

public class DonVi { public int Id; public string Ten; }
public class CanBo { public int Id; public string TenDangNhap; public string HoTen; public int DonViId; public bool LaVanThu; }
public class LoaiVanBan { public int Id; public string Ten; public string KyHieu; }
public class SoVanBan { public int Id; public string Ten; public int SoTiepTheo; }
public class TepDinhKem { public string Ten; public string Loai; public int KichThuoc; }
public class LichSu { public DateTime Luc; public string NguoiXuLy; public string HanhDong; public string NoiDung; }
public class VanBan {
  public int Id; public int LoaiId; public string TrichYeu; public string NoiDung; public string SoKyHieu = "";
  public string TrangThai; public DateTime NgayTao; public DateTime? HanXuLy; public int NguoiTaoId; public int? NguoiXuLyId;
  public List<TepDinhKem> Tep = new List<TepDinhKem>(); public List<LichSu> LichSu = new List<LichSu>();
}

public static class TrangThai {
  public const string DuThao = "Dự thảo", DangXuLy = "Đang xử lý", DaKetThuc = "Đã kết thúc", DaPhatHanh = "Đã phát hành";
  public static readonly string[] TatCa = { DuThao, DangXuLy, DaKetThuc, DaPhatHanh };
}

public static class Store {
  public const string MatKhau = "Qlvb@2026";
  static readonly object L = new object();
  public static List<DonVi> DonVi; public static List<CanBo> CanBo; public static List<LoaiVanBan> Loai;
  public static List<SoVanBan> So; static List<VanBan> vanBan; static int idTiepTheo;

  static Store() { Reset(); }

  public static void Reset() {
    lock (L) {
      DonVi = new List<DonVi> { new DonVi { Id = 1, Ten = "Văn phòng" }, new DonVi { Id = 2, Ten = "Phòng Tài chính" },
                                new DonVi { Id = 3, Ten = "Phòng Nội vụ" } };
      CanBo = new List<CanBo> {
        new CanBo { Id = 1, TenDangNhap = "vanthu", HoTen = "Nguyễn Thị Văn Thư", DonViId = 1, LaVanThu = true },
        new CanBo { Id = 2, TenDangNhap = "chanhvp", HoTen = "Trần Văn Chánh", DonViId = 1 },
        new CanBo { Id = 3, TenDangNhap = "chuyenvien", HoTen = "Lê Thị Chuyên Viên", DonViId = 2 },
        new CanBo { Id = 4, TenDangNhap = "truongtc", HoTen = "Phạm Văn Tài Chính", DonViId = 2 },
        new CanBo { Id = 5, TenDangNhap = "truongnv", HoTen = "Hoàng Thị Nội Vụ", DonViId = 3 },
        new CanBo { Id = 6, TenDangNhap = "canbonv", HoTen = "Đỗ Văn Cán Bộ", DonViId = 3 },
      };
      Loai = new List<LoaiVanBan> { new LoaiVanBan { Id = 1, Ten = "Công văn", KyHieu = "UBND-VP" },
        new LoaiVanBan { Id = 2, Ten = "Quyết định", KyHieu = "QĐ-UBND" }, new LoaiVanBan { Id = 3, Ten = "Tờ trình", KyHieu = "TTr-UBND" },
        new LoaiVanBan { Id = 4, Ten = "Báo cáo", KyHieu = "BC-UBND" } };
      So = new List<SoVanBan> { new SoVanBan { Id = 1, Ten = "Sổ văn bản đi 2026", SoTiepTheo = 101 },
                                new SoVanBan { Id = 2, Ten = "Sổ quyết định 2026", SoTiepTheo = 21 } };
      string[] chuDe = { "triển khai kế hoạch chuyển đổi số", "báo cáo tình hình thu ngân sách", "tuyển dụng công chức",
        "phòng chống thiên tai mùa mưa bão", "kiểm tra công tác văn thư lưu trữ", "điều chỉnh dự toán", "đào tạo kỹ năng số" };
      vanBan = new List<VanBan>();
      for (int i = 1; i <= 35; i++) {
        var v = new VanBan { Id = i, LoaiId = (i % 4) + 1, TrichYeu = "V/v " + chuDe[i % chuDe.Length] + " (số " + i + ")",
          NoiDung = "Nội dung văn bản số " + i, TrangThai = TrangThai.TatCa[i % 4], NgayTao = new DateTime(2026, 9, 1).AddDays(i),
          NguoiTaoId = (i % 6) + 1 };
        v.LichSu.Add(new LichSu { Luc = v.NgayTao, NguoiXuLy = TenCanBo(v.NguoiTaoId), HanhDong = "Tạo dự thảo", NoiDung = "" });
        if (v.TrangThai != TrangThai.DuThao) {
          int nhan = ((i + 2) % 6) + 1;
          v.LichSu.Add(new LichSu { Luc = v.NgayTao.AddHours(2), NguoiXuLy = TenCanBo(v.NguoiTaoId), HanhDong = "Chuyển xử lý",
            NoiDung = "Gửi: " + TenCanBo(nhan) });
          if (v.TrangThai == TrangThai.DangXuLy) v.NguoiXuLyId = nhan;   // đã kết thúc / phát hành thì không còn ai xử lý
        }
        if (v.TrangThai == TrangThai.DaPhatHanh) v.SoKyHieu = i + "/2026/" + Loai.First(l => l.Id == v.LoaiId).KyHieu;
        vanBan.Add(v);
      }
      idTiepTheo = 36;
    }
  }

  public static string TenCanBo(int id) { var c = CanBo.FirstOrDefault(x => x.Id == id); return c == null ? "" : c.HoTen; }
  public static string TenLoai(int id) { var l = Loai.FirstOrDefault(x => x.Id == id); return l == null ? "" : l.Ten; }

  public static CanBo DangNhap(string ten, string matKhau) {
    return matKhau == MatKhau ? CanBo.FirstOrDefault(c => c.TenDangNhap == ten) : null;
  }

  /// Cán bộ đang đăng nhập: cần CẢ cookie Forms auth lẫn phiên (Session) — mất một trong hai là coi như hết phiên.
  public static CanBo HienTai(HttpContext c) {
    if (c.User == null || !c.User.Identity.IsAuthenticated || c.Session == null) return null;
    var ten = c.Session["dang_nhap"] as string;
    return ten == c.User.Identity.Name ? CanBo.FirstOrDefault(x => x.TenDangNhap == ten) : null;
  }

  public static List<VanBan> TimKiem(string tuKhoa, string trangThai) {
    lock (L) {
      return vanBan.Where(v => (string.IsNullOrEmpty(tuKhoa) || v.TrichYeu.IndexOf(tuKhoa, StringComparison.OrdinalIgnoreCase) >= 0
                                || v.SoKyHieu.IndexOf(tuKhoa, StringComparison.OrdinalIgnoreCase) >= 0)
                            && (string.IsNullOrEmpty(trangThai) || v.TrangThai == trangThai))
                   .OrderByDescending(v => v.Id).ToList();
    }
  }

  public static VanBan Lay(int id) { lock (L) { return vanBan.FirstOrDefault(v => v.Id == id); } }

  public static int TaoDuThao(int loaiId, string trichYeu, string noiDung, TepDinhKem tep, CanBo cb) {
    lock (L) {
      var v = new VanBan { Id = idTiepTheo++, LoaiId = loaiId, TrichYeu = trichYeu, NoiDung = noiDung ?? "",
        TrangThai = TrangThai.DuThao, NgayTao = DateTime.Now, NguoiTaoId = cb.Id };
      if (tep != null) v.Tep.Add(tep);
      v.LichSu.Add(new LichSu { Luc = DateTime.Now, NguoiXuLy = cb.HoTen, HanhDong = "Tạo dự thảo", NoiDung = "" });
      vanBan.Add(v);
      return v.Id;
    }
  }

  public static void Chuyen(int id, List<int> nguoiNhan, string yKien, DateTime? han, TepDinhKem tep, CanBo cb) {
    lock (L) {
      var v = vanBan.First(x => x.Id == id);
      if (v.TrangThai != TrangThai.DuThao && v.TrangThai != TrangThai.DangXuLy)
        throw new InvalidOperationException("Văn bản " + v.TrangThai.ToLower() + ", không chuyển được");
      v.TrangThai = TrangThai.DangXuLy; v.NguoiXuLyId = nguoiNhan[0]; v.HanXuLy = han;
      if (tep != null) v.Tep.Add(tep);
      v.LichSu.Add(new LichSu { Luc = DateTime.Now, NguoiXuLy = cb.HoTen, HanhDong = "Chuyển xử lý",
        NoiDung = "Gửi: " + string.Join(", ", nguoiNhan.Select(TenCanBo)) + (string.IsNullOrEmpty(yKien) ? "" : ". Ý kiến: " + yKien) });
    }
  }

  public static void KetThuc(int id, string yKien, CanBo cb) {
    lock (L) {
      var v = vanBan.First(x => x.Id == id);
      if (v.TrangThai != TrangThai.DangXuLy) throw new InvalidOperationException("Chỉ kết thúc được văn bản đang xử lý");
      v.TrangThai = TrangThai.DaKetThuc; v.NguoiXuLyId = null;
      v.LichSu.Add(new LichSu { Luc = DateTime.Now, NguoiXuLy = cb.HoTen, HanhDong = "Kết thúc", NoiDung = yKien ?? "" });
    }
  }

  /// Số ký hiệu sẽ cấp nếu phát hành vào sổ này (hiện trong UpdatePanel trước khi phát hành).
  public static string SoDuKien(int soId, int loaiId) {
    lock (L) {
      var so = So.FirstOrDefault(s => s.Id == soId);
      return so == null ? "" : so.SoTiepTheo + "/2026/" + Loai.First(l => l.Id == loaiId).KyHieu;
    }
  }

  public static string PhatHanh(int id, int soId, List<int> donViNhan, CanBo cb) {
    lock (L) {
      if (!cb.LaVanThu) throw new InvalidOperationException("Chỉ văn thư được phát hành");
      var v = vanBan.First(x => x.Id == id);
      if (v.TrangThai != TrangThai.DuThao && v.TrangThai != TrangThai.DangXuLy)
        throw new InvalidOperationException("Văn bản " + v.TrangThai.ToLower() + ", không phát hành được");
      var so = So.First(s => s.Id == soId);
      v.SoKyHieu = so.SoTiepTheo + "/2026/" + Loai.First(l => l.Id == v.LoaiId).KyHieu;
      so.SoTiepTheo++;
      v.TrangThai = TrangThai.DaPhatHanh; v.NguoiXuLyId = null;
      v.LichSu.Add(new LichSu { Luc = DateTime.Now, NguoiXuLy = cb.HoTen, HanhDong = "Phát hành",
        NoiDung = "Số " + v.SoKyHieu + ". Nơi nhận: " + string.Join(", ", donViNhan.Select(d => DonVi.First(x => x.Id == d).Ten)) });
      return v.SoKyHieu;
    }
  }
}
```

- [ ] **Step 4: Global.asax và Default.aspx**

`tools/qlvb-webforms/app/Global.asax`:

```aspx
<%@ Application Language="C#" %>
<script runat="server">
  // POST /_dev/reset ⇒ dữ liệu mẫu ban đầu (test gọi trước mỗi ca). Chạy trước bước kiểm đăng nhập.
  void Application_BeginRequest(object sender, EventArgs e) {
    var c = HttpContext.Current;
    if (c.Request.Path != "/_dev/reset") return;
    if (c.Request.HttpMethod != "POST") c.Response.StatusCode = 405;
    else { Store.Reset(); c.Response.ContentType = "text/plain"; c.Response.Write("ok"); }
    c.ApplicationInstance.CompleteRequest();
  }
</script>
```

`tools/qlvb-webforms/app/Default.aspx`:

```aspx
<%@ Page Language="C#" %>
<script runat="server">
  protected void Page_Load(object sender, EventArgs e) { Response.Redirect("~/VanBan.aspx"); }
</script>
```

- [ ] **Step 5: Thêm dịch vụ vào `docker-compose.yml`** (ngay trước dòng `volumes:` ở cuối tệp)

```yaml
  # Hệ thống ASP.NET WebForms giả lập cho T07 (tools/qlvb-webforms): http://localhost:4030
  # Cán bộ: vanthu (văn thư), chanhvp, chuyenvien, truongtc, truongnv, canbonv — mật khẩu Qlvb@2026.
  qlvb-webforms:
    profiles: [dev, qlvb]
    build:
      context: ./tools/qlvb-webforms
      args:
        http_proxy: ${HTTP_PROXY:-}
        https_proxy: ${HTTPS_PROXY:-}
    restart: ${RESTART_POLICY:-no}
    ports: ["4030:4030"]
```

- [ ] **Step 6: Build và chạy**

Run: `HTTP_PROXY=http://proxybsh.bkav.com:3128 HTTPS_PROXY=http://proxybsh.bkav.com:3128 docker compose --profile qlvb up -d --build qlvb-webforms && sleep 8 && curl -s -XPOST localhost:4030/_dev/reset && curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' localhost:4030/VanBan.aspx`
Expected: `ok` rồi `302 http://localhost:4030/Login.aspx?ReturnUrl=%2fVanBan.aspx` (chưa có trang VanBan nhưng Forms auth chặn trước).

- [ ] **Step 7: Commit**

```bash
git add tools/qlvb-webforms/Dockerfile tools/qlvb-webforms/app docker-compose.yml
git commit -m "feat(qlvb-webforms): khung hệ thống WebForms giả lập — Mono, Forms auth, dữ liệu mẫu"
```

---

### Task 2: Gói test + khách HTTP tối giản + Site.master + Login

**Files:**
- Create: `tools/qlvb-webforms/package.json`, `tools/qlvb-webforms/test/wf.ts`, `tools/qlvb-webforms/test/qlvb.test.ts`,
  `tools/qlvb-webforms/app/Site.master`, `tools/qlvb-webforms/app/Login.aspx`

- [ ] **Step 1: package.json**

```json
{
  "name": "@vala/qlvb-webforms",
  "private": true,
  "description": "Hệ thống ASP.NET WebForms giả lập cho T07 — chỉ dùng để thử, không triển khai cho người dùng",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.9"
  }
}
```

Run: `pnpm install` (ở gốc repo). Expected: thêm `@vala/qlvb-webforms` vào `pnpm-lock.yaml`, không lỗi.

- [ ] **Step 2: test/wf.ts** — khách HTTP như trình duyệt tối giản

```ts
/**
 * Khách HTTP tối giản cho test hệ thống WebForms giả lập: giữ cookie, đọc trường ẩn, gửi lại form (postback), gửi tệp
 * (multipart), UpdatePanel (MS AJAX). Tự đi theo chuyển hướng như trình duyệt. Không dùng cho mã sản phẩm — phần 3/4 có
 * vala.webform() / WebForm riêng.
 */
export const BASE = process.env.QLVB_URL ?? 'http://localhost:4030';

export interface Page { status: number; url: string; html: string }
export interface Tep { ten: string; loai: string; noiDung: string }

export class Browser {
  cookies = new Map<string, string>();

  private keep(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv!.indexOf('=');
      const name = kv!.slice(0, i).trim();
      const value = kv!.slice(i + 1);
      if (/expires=Thu, 01[- ]Jan[- ]1970/i.test(c) || value === '') this.cookies.delete(name); else this.cookies.set(name, value);
    }
  }

  async open(path: string, init: RequestInit = {}): Promise<Page> {
    let url = new URL(path, BASE).toString();
    let req: RequestInit = init;
    for (let hop = 0; hop < 5; hop++) {
      const headers = new Headers(req.headers);
      if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
      const res = await fetch(url, { ...req, headers, redirect: 'manual' });
      this.keep(res);
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url).toString(); req = {}; continue; }
      return { status: res.status, url, html: await res.text() };
    }
    throw new Error('quá nhiều lần chuyển hướng');
  }

  /** Gửi form của trang `page` (mọi trường ẩn + trường thường đang có) đè thêm `fields`. */
  async post(page: Page, fields: Record<string, string | string[]>, opts: { tep?: Record<string, Tep>; ajax?: string } = {}): Promise<Page> {
    const all: Record<string, string | string[]> = { ...formFields(page.html), ...fields };
    const headers: Record<string, string> = {};
    let body: BodyInit;
    if (opts.ajax) {
      all['ctl00$sm'] = opts.ajax;                 // "<UpdatePanel>|<control gây postback>"
      all.__ASYNCPOST = 'true';
      headers['X-MicrosoftAjax'] = 'Delta=true';
    }
    if (opts.tep) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(all)) for (const x of [v].flat()) fd.append(k, x);
      for (const [k, t] of Object.entries(opts.tep)) fd.append(k, new Blob([t.noiDung], { type: t.loai }), t.ten);
      body = fd;
    } else {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(all)) for (const x of [v].flat()) sp.append(k, x);
      body = sp;
    }
    return this.open(page.url, { method: 'POST', body, headers });
  }

  /** Như __doPostBack(target, arg). */
  postback(page: Page, target: string, arg = '', fields: Record<string, string | string[]> = {}, ajax?: string) {
    return this.post(page, { __EVENTTARGET: target, __EVENTARGUMENT: arg, ...fields }, { ajax });
  }

  async login(user: string, pass = 'Qlvb@2026'): Promise<Page> {
    const p = await this.open('/Login.aspx');
    return this.post(p, { txtTenDangNhap: user, txtMatKhau: pass, btnDangNhap: 'Đăng nhập' });
  }
}

/** Giải thực thể HTML — ASP.NET mã hoá cả dấu tiếng Việt thành thực thể số (vd "B&#225;o c&#225;o"). */
const decode = (s: string) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** Các trường form như trình duyệt sẽ gửi: input ẩn/chữ, ô chọn đang chọn, checkbox đang tích, textarea. Không gồm nút. */
export function formFields(html: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    const name = /\bname="([^"]*)"/.exec(tag)?.[1];
    const type = (/\btype="([^"]*)"/.exec(tag)?.[1] ?? 'text').toLowerCase();
    if (!name || ['submit', 'button', 'image', 'file'].includes(type)) continue;
    if ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/i.test(tag)) continue;
    out[decode(name)] = decode(/\bvalue="([^"]*)"/.exec(tag)?.[1] ?? (type === 'checkbox' ? 'on' : ''));
  }
  for (const m of html.matchAll(/<select\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const sel = /<option\b[^>]*selected[^>]*value="([^"]*)"|<option\b[^>]*value="([^"]*)"[^>]*selected/i.exec(m[2]!);
    const first = /<option\b[^>]*value="([^"]*)"/i.exec(m[2]!);
    out[decode(m[1]!)] = decode(sel?.[1] ?? sel?.[2] ?? first?.[1] ?? '');
  }
  for (const m of html.matchAll(/<textarea\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/textarea>/gi)) out[decode(m[1]!)] = decode(m[2]!.replace(/^\r?\n/, ''));
  return out;
}

/** Các lựa chọn của ô chọn / danh sách checkbox có tên đầy đủ `name`. */
export function options(html: string, name: string): { value: string; text: string }[] {
  const sel = new RegExp(`<select\\b[^>]*name="${name.replace(/\$/g, '\\$')}"[^>]*>([\\s\\S]*?)</select>`, 'i').exec(html);
  if (sel) return [...sel[1]!.matchAll(/<option\b[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/gi)].map((m) => ({ value: decode(m[1]!), text: decode(m[2]!) }));
  const esc = name.replace(/\$/g, '\\$');
  return [...html.matchAll(new RegExp(`<input\\b[^>]*name="(${esc}\\$\\d+)"[^>]*value="([^"]*)"[^>]*/?>\\s*<label[^>]*>([^<]*)</label>`, 'gi'))]
    .map((m) => ({ value: decode(m[2]!), text: decode(m[3]!), field: m[1]! })) as { value: string; text: string; field?: string }[];
}

/** Chữ của phần tử có id (span/label/td…). */
export function text(html: string, id: string): string {
  const m = new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</`, 'i').exec(html);
  return m ? decode(m[1]!.replace(/<[^>]+>/g, '').trim()) : '';
}

/** Các dòng của bảng có id (bỏ dòng tiêu đề và dòng số trang), mỗi dòng là mảng chữ trong các ô. */
export function rows(html: string, id: string): string[][] {
  const t = new RegExp(`<table\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)</table>\\s*(?:</div>)?`, 'i').exec(html);
  if (!t) return [];
  // Dòng số trang của GridView chứa một bảng con (các số trang) ⇒ bỏ.
  return [...t[1]!.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .filter((r) => !/<table\b/i.test(r[1]!))
    .map((r) => [...r[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => decode(c[1]!.replace(/<[^>]+>/g, '').trim())))
    .filter((cells) => cells.length > 2);
}

/** Máy giả lập có đang chạy không (test tự bỏ qua nếu không). */
export async function dangChay(): Promise<boolean> {
  try { return (await fetch(`${BASE}/_dev/reset`, { method: 'POST' })).ok; } catch { return false; }
}
```

- [ ] **Step 3: Viết test đăng nhập (sẽ hỏng vì chưa có Login.aspx)**

`tools/qlvb-webforms/test/qlvb.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { BASE, Browser, dangChay, formFields, options, rows, text } from './wf';

const up = await dangChay();
const reset = () => fetch(`${BASE}/_dev/reset`, { method: 'POST' });

describe.skipIf(!up)('QLVB Thử nghiệm (WebForms giả lập)', () => {
  beforeEach(async () => { await reset(); });

  describe('đăng nhập', () => {
    it('chưa đăng nhập ⇒ chuyển về Login.aspx kèm ReturnUrl', async () => {
      const p = await new Browser().open('/VanBan.aspx');
      expect(p.url).toMatch(/\/Login\.aspx\?ReturnUrl=%2fVanBan\.aspx/i);
    });
    it('sai mật khẩu ⇒ báo lỗi, vẫn ở trang đăng nhập', async () => {
      const p = await new Browser().login('vanthu', 'sai');
      expect(p.url).toMatch(/Login\.aspx/);
      expect(text(p.html, 'lblLoi')).toBe('Sai tên đăng nhập hoặc mật khẩu');
    });
    it('đúng ⇒ có .ASPXAUTH + ASP.NET_SessionId, vào danh sách, thấy tên', async () => {
      const b = new Browser();
      const p = await b.login('vanthu');
      expect([...b.cookies.keys()].sort()).toEqual(['.ASPXAUTH', 'ASP.NET_SessionId']);
      expect(p.url).toMatch(/VanBan\.aspx$/);
      expect(text(p.html, 'ctl00_lblUser')).toBe('Nguyễn Thị Văn Thư (vanthu)');
    });
    it('mất phiên (Session) dù còn cookie đăng nhập ⇒ về trang đăng nhập', async () => {
      const b = new Browser();
      await b.login('vanthu');
      b.cookies.delete('ASP.NET_SessionId');
      expect((await b.open('/VanBan.aspx')).url).toMatch(/Login\.aspx\?ReturnUrl=/);
    });
  });
});
```

- [ ] **Step 4: Chạy test thấy hỏng**

Run: `pnpm --filter @vala/qlvb-webforms test`
Expected: FAIL — `sai mật khẩu` / `đúng` hỏng (Login.aspx chưa có, 404). Ca "chưa đăng nhập" có thể đã qua (Forms auth).

- [ ] **Step 5: Site.master**

```aspx
<%@ Master Language="C#" %>
<script runat="server">
  // Mọi trang (trừ Login) đi qua đây: thiếu Forms auth HOẶC Session ⇒ về trang đăng nhập, như hệ thống thật hết phiên.
  protected void Page_Init(object sender, EventArgs e) {
    if (Store.HienTai(Context) != null) return;
    FormsAuthentication.SignOut();
    Response.Redirect("~/Login.aspx?ReturnUrl=" + HttpUtility.UrlEncode(Request.RawUrl), true);
  }
  protected void Page_Load(object sender, EventArgs e) {
    var cb = Store.HienTai(Context);
    lblUser.Text = cb.HoTen + " (" + cb.TenDangNhap + ")";
  }
  protected void lnkThoat_Click(object sender, EventArgs e) {
    Session.Abandon();
    FormsAuthentication.SignOut();
    Response.Redirect("~/Login.aspx");
  }
</script>
<!DOCTYPE html>
<html>
<head runat="server">
  <meta charset="utf-8" />
  <title>QLVB Thử nghiệm</title>
  <style>
    body { font: 13px Tahoma, Arial, sans-serif; margin: 0; background: #eef2f7; color: #222 }
    .top { background: #1f4e8c; color: #fff; padding: 8px 16px } .top a { color: #fff; margin-left: 16px }
    .user { float: right } .main { background: #fff; margin: 12px; padding: 12px 16px; border: 1px solid #c9d3e0 }
    table.grid { border-collapse: collapse; width: 100% } .grid th, .grid td { border: 1px solid #c9d3e0; padding: 4px 6px }
    .grid th { background: #dfe7f2 } .loi { color: #b00020 } .tb { color: #0a6b2c } label { margin-right: 8px }
    .o { margin: 6px 0 } .o > span.nhan { display: inline-block; width: 120px }
  </style>
</head>
<body>
  <form id="form1" runat="server">
    <asp:ScriptManager ID="sm" runat="server" />
    <div class="top">
      <b>QLVB Thử nghiệm</b>
      <a href="VanBan.aspx">Văn bản</a> <a href="DuThao.aspx">Tạo dự thảo</a>
      <span class="user">Xin chào, <asp:Label ID="lblUser" runat="server" /> ·
        <asp:LinkButton ID="lnkThoat" runat="server" OnClick="lnkThoat_Click" CausesValidation="false">Đăng xuất</asp:LinkButton></span>
    </div>
    <div class="main"><asp:ContentPlaceHolder ID="MainContent" runat="server" /></div>
  </form>
</body>
</html>
```

- [ ] **Step 6: Login.aspx**

```aspx
<%@ Page Language="C#" %>
<script runat="server">
  protected void btnDangNhap_Click(object sender, EventArgs e) {
    var cb = Store.DangNhap(txtTenDangNhap.Text.Trim(), txtMatKhau.Text);
    if (cb == null) { lblLoi.Text = "Sai tên đăng nhập hoặc mật khẩu"; return; }
    Session["dang_nhap"] = cb.TenDangNhap;
    FormsAuthentication.RedirectFromLoginPage(cb.TenDangNhap, false);
  }
</script>
<!DOCTYPE html>
<html>
<head runat="server"><meta charset="utf-8" /><title>Đăng nhập — QLVB Thử nghiệm</title>
  <style>body { font: 13px Tahoma, Arial, sans-serif; background: #eef2f7 } .hop { width: 320px; margin: 80px auto; background: #fff;
    border: 1px solid #c9d3e0; padding: 20px } .o { margin: 8px 0 } input[type=text], input[type=password] { width: 100% } .loi { color: #b00020 }</style>
</head>
<body>
  <form id="form1" runat="server">
    <div class="hop">
      <h3>QLVB Thử nghiệm</h3>
      <div class="o">Tên đăng nhập<br /><asp:TextBox ID="txtTenDangNhap" runat="server" /></div>
      <div class="o">Mật khẩu<br /><asp:TextBox ID="txtMatKhau" runat="server" TextMode="Password" /></div>
      <asp:Button ID="btnDangNhap" runat="server" Text="Đăng nhập" OnClick="btnDangNhap_Click" />
      <div class="o"><asp:Label ID="lblLoi" runat="server" CssClass="loi" /></div>
    </div>
  </form>
</body>
</html>
```

Ghi chú: test gửi `txtTenDangNhap` (tên ngắn) vì Login không dùng master page.

- [ ] **Step 7: Tạo tạm VanBan.aspx tối thiểu để đăng nhập có đích** (Task 3 thay bằng bản đầy đủ)

```aspx
<%@ Page Language="C#" MasterPageFile="~/Site.master" %>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">Danh sách văn bản</asp:Content>
```

- [ ] **Step 8: Build lại, chạy test thấy qua**

Run: `docker compose --profile qlvb up -d --build qlvb-webforms && sleep 8 && pnpm --filter @vala/qlvb-webforms test`
Expected: 4 test `đăng nhập` PASS.

- [ ] **Step 9: Commit**

```bash
git add tools/qlvb-webforms pnpm-lock.yaml
git commit -m "feat(qlvb-webforms): đăng nhập Forms auth + phiên, khung trang, bộ test HTTP"
```

---

### Task 3: Danh sách văn bản (tìm, lọc AutoPostBack, GridView phân trang)

**Files:**
- Modify: `tools/qlvb-webforms/app/VanBan.aspx` (thay bản tạm)
- Modify: `tools/qlvb-webforms/test/qlvb.test.ts` (thêm `describe('danh sách')` trong describe gốc)

- [ ] **Step 1: Viết test**

```ts
  describe('danh sách', () => {
    const G = 'ctl00$MainContent$gvVanBan';
    it('35 văn bản, 10 dòng/trang, trang 4 có 5 dòng (phân trang bằng __doPostBack)', async () => {
      const b = new Browser();
      const p1 = await b.login('vanthu');
      expect(text(p1.html, 'ctl00_MainContent_lblTong')).toBe('Tổng: 35 văn bản');
      expect(rows(p1.html, 'ctl00_MainContent_gvVanBan')).toHaveLength(10);
      expect(p1.html).toContain(`__doPostBack(&#39;${G}&#39;,&#39;Page$4&#39;)`);
      const p4 = await b.postback(p1, G, 'Page$4');
      const r4 = rows(p4.html, 'ctl00_MainContent_gvVanBan');
      expect(r4).toHaveLength(5);
      expect(r4[4]![0]).toBe('1');                     // mã nhỏ nhất ở cuối trang cuối (sắp mới nhất trước)
    });
    it('lọc trạng thái là ô tự gửi lại form (AutoPostBack)', async () => {
      const b = new Browser();
      const p = await b.login('vanthu');
      const f = await b.postback(p, 'ctl00$MainContent$ddlTrangThai', '', { 'ctl00$MainContent$ddlTrangThai': 'Đã phát hành' });
      expect(text(f.html, 'ctl00_MainContent_lblTong')).toBe('Tổng: 9 văn bản');
      expect(rows(f.html, 'ctl00_MainContent_gvVanBan').every((r) => r[4] === 'Đã phát hành')).toBe(true);
    });
    it('tìm theo trích yếu bằng nút Tìm', async () => {
      const b = new Browser();
      const p = await b.login('vanthu');
      const f = await b.post(p, { 'ctl00$MainContent$txtTuKhoa': 'tuyển dụng', 'ctl00$MainContent$btnTim': 'Tìm' });
      expect(text(f.html, 'ctl00_MainContent_lblTong')).toBe('Tổng: 5 văn bản');
    });
  });
```

Số liệu kiểm từ dữ liệu mẫu: trạng thái = `TatCa[i % 4]` ⇒ "Đã phát hành" là i ≡ 3 (mod 4): 3, 7, 11, 15, 19, 23, 27,
31, 35 = **9**. "tuyển dụng" là `chuDe[i % 7]` với chỉ số 2 ⇒ i ≡ 2 (mod 7): 2, 9, 16, 23, 30 = **5**.

- [ ] **Step 2: Chạy test thấy hỏng**

Run: `pnpm --filter @vala/qlvb-webforms test`
Expected: 3 test `danh sách` FAIL (không có `lblTong`).

- [ ] **Step 3: VanBan.aspx**

```aspx
<%@ Page Language="C#" MasterPageFile="~/Site.master" %>
<%@ Import Namespace="System.Linq" %>
<script runat="server">
  protected void Page_Load(object sender, EventArgs e) {
    if (IsPostBack) return;
    ddlTrangThai.Items.Add(new ListItem("— Tất cả —", ""));
    foreach (var t in TrangThai.TatCa) ddlTrangThai.Items.Add(new ListItem(t, t));
    NapLai();
  }
  void NapLai() {
    var ds = Store.TimKiem(txtTuKhoa.Text.Trim(), ddlTrangThai.SelectedValue);
    lblTong.Text = "Tổng: " + ds.Count + " văn bản";
    gvVanBan.DataSource = ds.Select(v => new {
      v.Id, v.SoKyHieu, v.TrichYeu, Loai = Store.TenLoai(v.LoaiId), v.TrangThai, NgayTao = v.NgayTao.ToString("dd/MM/yyyy"),
      NguoiXuLy = v.NguoiXuLyId.HasValue ? Store.TenCanBo(v.NguoiXuLyId.Value) : "" }).ToList();
    gvVanBan.DataBind();
  }
  protected void btnTim_Click(object sender, EventArgs e) { gvVanBan.PageIndex = 0; NapLai(); }
  protected void ddlTrangThai_Changed(object sender, EventArgs e) { gvVanBan.PageIndex = 0; NapLai(); }
  protected void gvVanBan_PageIndexChanging(object sender, GridViewPageEventArgs e) { gvVanBan.PageIndex = e.NewPageIndex; NapLai(); }
</script>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
  <h3>Danh sách văn bản</h3>
  <div class="o">
    <asp:TextBox ID="txtTuKhoa" runat="server" placeholder="Số ký hiệu, trích yếu" Width="260" />
    <asp:Button ID="btnTim" runat="server" Text="Tìm" OnClick="btnTim_Click" />
    Trạng thái: <asp:DropDownList ID="ddlTrangThai" runat="server" AutoPostBack="true" OnSelectedIndexChanged="ddlTrangThai_Changed" />
    <asp:Label ID="lblTong" runat="server" style="margin-left:16px" />
  </div>
  <asp:GridView ID="gvVanBan" runat="server" CssClass="grid" AutoGenerateColumns="false" AllowPaging="true" PageSize="10"
      OnPageIndexChanging="gvVanBan_PageIndexChanging" EmptyDataText="Không có văn bản">
    <Columns>
      <asp:BoundField DataField="Id" HeaderText="Mã" />
      <asp:BoundField DataField="SoKyHieu" HeaderText="Số ký hiệu" />
      <asp:HyperLinkField DataTextField="TrichYeu" DataNavigateUrlFields="Id" DataNavigateUrlFormatString="ChiTiet.aspx?id={0}" HeaderText="Trích yếu" />
      <asp:BoundField DataField="Loai" HeaderText="Loại" />
      <asp:BoundField DataField="TrangThai" HeaderText="Trạng thái" />
      <asp:BoundField DataField="NgayTao" HeaderText="Ngày tạo" />
      <asp:BoundField DataField="NguoiXuLy" HeaderText="Người đang xử lý" />
    </Columns>
    <PagerSettings Mode="Numeric" />
  </asp:GridView>
</asp:Content>
```

- [ ] **Step 4: Build lại, chạy test thấy qua**

Run: `docker compose --profile qlvb up -d --build qlvb-webforms && sleep 8 && pnpm --filter @vala/qlvb-webforms test`
Expected: PASS hết (7 test). Nếu `rows()` đếm cả dòng số trang (`<tr>` chứa bảng con của pager): bộ lọc `cells.length > 2`
đã loại dòng chỉ có 1 ô; nếu vẫn lệch, sửa `rows()` cho bỏ dòng có `<table>` lồng.

- [ ] **Step 5: Commit**

```bash
git add tools/qlvb-webforms
git commit -m "feat(qlvb-webforms): danh sách văn bản — tìm, lọc AutoPostBack, GridView phân trang"
```

---

### Task 4: Chi tiết + Kết thúc (LinkButton `__doPostBack`)

**Files:**
- Create: `tools/qlvb-webforms/app/ChiTiet.aspx`
- Modify: `tools/qlvb-webforms/test/qlvb.test.ts` (thêm `describe('chi tiết, kết thúc')`)

- [ ] **Step 1: Viết test**

```ts
  describe('chi tiết, kết thúc', () => {
    it('xem chi tiết: thông tin + lịch sử', async () => {
      const b = new Browser();
      await b.login('vanthu');
      const p = await b.open('/ChiTiet.aspx?id=6');
      expect(text(p.html, 'ctl00_MainContent_lblTrichYeu')).toContain('(số 6)');
      expect(rows(p.html, 'ctl00_MainContent_gvLichSu').length).toBeGreaterThanOrEqual(1);
    });
    it('Kết thúc là LinkButton: __doPostBack ⇒ trạng thái "Đã kết thúc", thêm lịch sử', async () => {
      const b = new Browser();
      await b.login('chuyenvien');
      const p = await b.open('/ChiTiet.aspx?id=5');          // 5 % 4 = 1 ⇒ "Đang xử lý"
      expect(text(p.html, 'ctl00_MainContent_lblTrangThai')).toBe('Đang xử lý');
      expect(p.html).toContain('ctl00$MainContent$lnkKetThuc');
      const r = await b.postback(p, 'ctl00$MainContent$lnkKetThuc', '', { 'ctl00$MainContent$txtYKienKetThuc': 'Đã xong' });
      expect(text(r.html, 'ctl00_MainContent_lblTrangThai')).toBe('Đã kết thúc');
      expect(text(r.html, 'ctl00_MainContent_lblThongBao')).toBe('Đã kết thúc văn bản');
      expect(rows(r.html, 'ctl00_MainContent_gvLichSu').at(-1)).toEqual(expect.arrayContaining(['Kết thúc', 'Đã xong']));
    });
    it('văn bản đã kết thúc không còn nút Kết thúc', async () => {
      const b = new Browser();
      await b.login('vanthu');
      const p = await b.open('/ChiTiet.aspx?id=2');          // 2 % 4 = 2 ⇒ "Đã kết thúc"
      expect(p.html).not.toContain('lnkKetThuc');
    });
    it('không có văn bản ⇒ báo không tìm thấy', async () => {
      const b = new Browser();
      await b.login('vanthu');
      expect(text((await b.open('/ChiTiet.aspx?id=999')).html, 'ctl00_MainContent_lblLoi')).toBe('Không tìm thấy văn bản');
    });
  });
```

Trạng thái theo `TatCa[i % 4]` = {0: Dự thảo, 1: Đang xử lý, 2: Đã kết thúc, 3: Đã phát hành}.

- [ ] **Step 2: Chạy test thấy hỏng**

Run: `pnpm --filter @vala/qlvb-webforms test`
Expected: 4 test mới FAIL (ChiTiet.aspx 404).

- [ ] **Step 3: ChiTiet.aspx**

```aspx
<%@ Page Language="C#" MasterPageFile="~/Site.master" %>
<%@ Import Namespace="System.Linq" %>
<script runat="server">
  VanBan vb;
  protected void Page_Load(object sender, EventArgs e) {
    int id; int.TryParse(Request.QueryString["id"], out id);
    vb = Store.Lay(id);
    if (vb == null) { lblLoi.Text = "Không tìm thấy văn bản"; pnlVanBan.Visible = false; return; }
    if (Request.QueryString["moi"] == "1" && !IsPostBack) lblThongBao.Text = "Đã lưu dự thảo";
    Hien();
  }
  void Hien() {
    var cb = Store.HienTai(Context);
    lblMa.Text = vb.Id.ToString(); lblSoKyHieu.Text = vb.SoKyHieu; lblTrichYeu.Text = vb.TrichYeu;
    lblLoai.Text = Store.TenLoai(vb.LoaiId); lblTrangThai.Text = vb.TrangThai; lblNoiDung.Text = HttpUtility.HtmlEncode(vb.NoiDung);
    lblHan.Text = vb.HanXuLy.HasValue ? vb.HanXuLy.Value.ToString("dd/MM/yyyy") : "";
    lblTep.Text = string.Join(", ", vb.Tep.Select(t => t.Ten + " (" + t.KichThuoc + " byte)"));
    gvLichSu.DataSource = vb.LichSu.Select(l => new { Luc = l.Luc.ToString("dd/MM/yyyy HH:mm"), l.NguoiXuLy, l.HanhDong, l.NoiDung }).ToList();
    gvLichSu.DataBind();
    bool mo = vb.TrangThai == TrangThai.DuThao || vb.TrangThai == TrangThai.DangXuLy;
    lnkChuyen.Visible = mo; lnkChuyen.NavigateUrl = "Chuyen.aspx?id=" + vb.Id;
    lnkPhatHanh.Visible = mo && cb.LaVanThu; lnkPhatHanh.NavigateUrl = "PhatHanh.aspx?id=" + vb.Id;
    pnlKetThuc.Visible = vb.TrangThai == TrangThai.DangXuLy;
  }
  protected void lnkKetThuc_Click(object sender, EventArgs e) {
    try { Store.KetThuc(vb.Id, txtYKienKetThuc.Text.Trim(), Store.HienTai(Context)); lblThongBao.Text = "Đã kết thúc văn bản"; }
    catch (InvalidOperationException ex) { lblLoi.Text = ex.Message; }
    Hien();
  }
</script>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
  <asp:Label ID="lblLoi" runat="server" CssClass="loi" /> <asp:Label ID="lblThongBao" runat="server" CssClass="tb" />
  <asp:Panel ID="pnlVanBan" runat="server">
    <h3>Chi tiết văn bản</h3>
    <div class="o"><span class="nhan">Mã</span><asp:Label ID="lblMa" runat="server" /></div>
    <div class="o"><span class="nhan">Số ký hiệu</span><asp:Label ID="lblSoKyHieu" runat="server" /></div>
    <div class="o"><span class="nhan">Trích yếu</span><asp:Label ID="lblTrichYeu" runat="server" /></div>
    <div class="o"><span class="nhan">Loại</span><asp:Label ID="lblLoai" runat="server" /></div>
    <div class="o"><span class="nhan">Trạng thái</span><asp:Label ID="lblTrangThai" runat="server" /></div>
    <div class="o"><span class="nhan">Hạn xử lý</span><asp:Label ID="lblHan" runat="server" /></div>
    <div class="o"><span class="nhan">Nội dung</span><asp:Label ID="lblNoiDung" runat="server" /></div>
    <div class="o"><span class="nhan">Tệp đính kèm</span><asp:Label ID="lblTep" runat="server" /></div>
    <div class="o">
      <asp:HyperLink ID="lnkChuyen" runat="server" Text="Chuyển xử lý" /> &nbsp;
      <asp:HyperLink ID="lnkPhatHanh" runat="server" Text="Phát hành" />
    </div>
    <asp:Panel ID="pnlKetThuc" runat="server" CssClass="o">
      Ý kiến kết thúc: <asp:TextBox ID="txtYKienKetThuc" runat="server" Width="260" />
      <asp:LinkButton ID="lnkKetThuc" runat="server" OnClick="lnkKetThuc_Click" OnClientClick="return confirm('Kết thúc văn bản này?');">Kết thúc</asp:LinkButton>
    </asp:Panel>
    <h4>Lịch sử xử lý</h4>
    <asp:GridView ID="gvLichSu" runat="server" CssClass="grid" AutoGenerateColumns="false">
      <Columns>
        <asp:BoundField DataField="Luc" HeaderText="Thời gian" /><asp:BoundField DataField="NguoiXuLy" HeaderText="Người xử lý" />
        <asp:BoundField DataField="HanhDong" HeaderText="Hành động" /><asp:BoundField DataField="NoiDung" HeaderText="Nội dung" />
      </Columns>
    </asp:GridView>
  </asp:Panel>
</asp:Content>
```

- [ ] **Step 4: Build lại, chạy test thấy qua**

Run: `docker compose --profile qlvb up -d --build qlvb-webforms && sleep 8 && pnpm --filter @vala/qlvb-webforms test`
Expected: PASS hết (11 test).

- [ ] **Step 5: Commit**

```bash
git add tools/qlvb-webforms
git commit -m "feat(qlvb-webforms): chi tiết văn bản + kết thúc bằng LinkButton"
```

---

### Task 5: Tạo dự thảo (validator, tệp đính kèm multipart)

**Files:**
- Create: `tools/qlvb-webforms/app/DuThao.aspx`
- Modify: `tools/qlvb-webforms/test/qlvb.test.ts` (thêm `describe('tạo dự thảo')`)

- [ ] **Step 1: Viết test**

```ts
  describe('tạo dự thảo', () => {
    const F = 'ctl00$MainContent$';
    it('đủ thông tin + tệp ⇒ chuyển sang chi tiết dự thảo mới (mã 36)', async () => {
      const b = new Browser();
      await b.login('chuyenvien');
      const p = await b.open('/DuThao.aspx');
      expect(options(p.html, `${F}ddlLoai`).map((o) => o.text)).toEqual(['— Chọn loại —', 'Công văn', 'Quyết định', 'Tờ trình', 'Báo cáo']);
      const r = await b.post(p, { [`${F}ddlLoai`]: '3', [`${F}txtTrichYeu`]: 'V/v xin kinh phí', [`${F}txtNoiDung`]: 'Kính gửi…', [`${F}btnLuu`]: 'Lưu dự thảo' },
        { tep: { [`${F}fuDinhKem`]: { ten: 'to-trinh.pdf', loai: 'application/pdf', noiDung: '%PDF-1.4 thu' } } });
      expect(r.url).toMatch(/ChiTiet\.aspx\?id=36&moi=1$/);
      expect(text(r.html, 'ctl00_MainContent_lblThongBao')).toBe('Đã lưu dự thảo');
      expect(text(r.html, 'ctl00_MainContent_lblTrangThai')).toBe('Dự thảo');
      expect(text(r.html, 'ctl00_MainContent_lblTep')).toBe('to-trinh.pdf (12 byte)');
    });
    it('thiếu trích yếu ⇒ validator báo lỗi, không tạo', async () => {
      const b = new Browser();
      await b.login('chuyenvien');
      const p = await b.open('/DuThao.aspx');
      const r = await b.post(p, { [`${F}ddlLoai`]: '1', [`${F}txtTrichYeu`]: '', [`${F}btnLuu`]: 'Lưu dự thảo' });
      expect(r.url).toMatch(/DuThao\.aspx$/);
      expect(r.html).toContain('Nhập trích yếu');
      const ds = await b.open('/VanBan.aspx');
      expect(text(ds.html, 'ctl00_MainContent_lblTong')).toBe('Tổng: 35 văn bản');
    });
  });
```

- [ ] **Step 2: Chạy test thấy hỏng**

Run: `pnpm --filter @vala/qlvb-webforms test`
Expected: 2 test mới FAIL.

- [ ] **Step 3: DuThao.aspx**

```aspx
<%@ Page Language="C#" MasterPageFile="~/Site.master" %>
<script runat="server">
  protected void Page_Load(object sender, EventArgs e) {
    if (IsPostBack) return;
    ddlLoai.Items.Add(new ListItem("— Chọn loại —", ""));
    foreach (var l in Store.Loai) ddlLoai.Items.Add(new ListItem(l.Ten, l.Id.ToString()));
  }
  protected void btnLuu_Click(object sender, EventArgs e) {
    if (!Page.IsValid) return;
    TepDinhKem tep = null;
    if (fuDinhKem.HasFile) tep = new TepDinhKem { Ten = fuDinhKem.FileName, Loai = fuDinhKem.PostedFile.ContentType, KichThuoc = fuDinhKem.PostedFile.ContentLength };
    int id = Store.TaoDuThao(int.Parse(ddlLoai.SelectedValue), txtTrichYeu.Text.Trim(), txtNoiDung.Text, tep, Store.HienTai(Context));
    Response.Redirect("ChiTiet.aspx?id=" + id + "&moi=1");
  }
</script>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
  <h3>Tạo dự thảo</h3>
  <asp:ValidationSummary ID="vsLoi" runat="server" CssClass="loi" />
  <div class="o"><span class="nhan">Loại văn bản</span><asp:DropDownList ID="ddlLoai" runat="server" />
    <asp:RequiredFieldValidator ID="rfvLoai" runat="server" ControlToValidate="ddlLoai" InitialValue="" ErrorMessage="Chọn loại văn bản" Text="*" CssClass="loi" /></div>
  <div class="o"><span class="nhan">Trích yếu</span><asp:TextBox ID="txtTrichYeu" runat="server" Width="420" />
    <asp:RequiredFieldValidator ID="rfvTrichYeu" runat="server" ControlToValidate="txtTrichYeu" ErrorMessage="Nhập trích yếu" Text="*" CssClass="loi" /></div>
  <div class="o"><span class="nhan">Nội dung</span><asp:TextBox ID="txtNoiDung" runat="server" TextMode="MultiLine" Rows="5" Width="420" /></div>
  <div class="o"><span class="nhan">Đính kèm</span><asp:FileUpload ID="fuDinhKem" runat="server" /></div>
  <asp:Button ID="btnLuu" runat="server" Text="Lưu dự thảo" OnClick="btnLuu_Click" />
</asp:Content>
```

- [ ] **Step 4: Build lại, chạy test thấy qua**

Run: `docker compose --profile qlvb up -d --build qlvb-webforms && sleep 8 && pnpm --filter @vala/qlvb-webforms test`
Expected: PASS hết (13 test).

- [ ] **Step 5: Commit**

```bash
git add tools/qlvb-webforms
git commit -m "feat(qlvb-webforms): tạo dự thảo — validator, tệp đính kèm"
```

---

### Task 6: Chuyển văn bản (đơn vị ⇒ người nhận nạp lại) + các bẫy

**Files:**
- Create: `tools/qlvb-webforms/app/Chuyen.aspx`
- Modify: `tools/qlvb-webforms/test/qlvb.test.ts` (thêm `describe('chuyển, bẫy WebForms')`)

- [ ] **Step 1: Viết test**

```ts
  describe('chuyển, bẫy WebForms', () => {
    const F = 'ctl00$MainContent$';
    async function moChuyen(id = 4) {                       // 4 % 4 = 0 ⇒ "Dự thảo"
      const b = new Browser();
      await b.login('chanhvp');
      return { b, p: await b.open(`/Chuyen.aspx?id=${id}`) };
    }
    it('chọn đơn vị ⇒ gửi lại form ⇒ người nhận của đơn vị đó ⇒ Chuyển ⇒ lịch sử + trạng thái', async () => {
      const { b, p } = await moChuyen();
      expect(options(p.html, `${F}cblNguoiNhan`)).toEqual([]);
      const p2 = await b.postback(p, `${F}ddlDonVi`, '', { [`${F}ddlDonVi`]: '2' });
      const nhan = options(p2.html, `${F}cblNguoiNhan`) as { value: string; text: string; field: string }[];
      expect(nhan.map((o) => o.text)).toEqual(['Lê Thị Chuyên Viên', 'Phạm Văn Tài Chính']);
      const r = await b.post(p2, { [nhan[0]!.field]: nhan[0]!.value, [`${F}txtYKien`]: 'Đề nghị xử lý', [`${F}txtHanXuLy`]: '15/10/2026', [`${F}btnChuyen`]: 'Chuyển' });
      expect(r.url).toMatch(/ChiTiet\.aspx\?id=4$/);
      expect(text(r.html, 'ctl00_MainContent_lblTrangThai')).toBe('Đang xử lý');
      expect(text(r.html, 'ctl00_MainContent_lblHan')).toBe('15/10/2026');
      expect(rows(r.html, 'ctl00_MainContent_gvLichSu').at(-1)).toEqual(expect.arrayContaining(['Chuyển xử lý', 'Gửi: Lê Thị Chuyên Viên. Ý kiến: Đề nghị xử lý']));
    });
    it('BẪY: bấm Chuyển mà không gửi lại "chọn đơn vị" trước ⇒ bị từ chối, không chuyển', async () => {
      const { b, p } = await moChuyen();
      const r = await b.post(p, { [`${F}ddlDonVi`]: '2', [`${F}cblNguoiNhan$0`]: '3', [`${F}btnChuyen`]: 'Chuyển' });
      expect(r.url).toMatch(/Chuyen\.aspx\?id=4$/);
      expect(r.status === 500 || r.html.includes('Chọn ít nhất một người nhận')).toBe(true);
      expect(text((await b.open('/ChiTiet.aspx?id=4')).html, 'ctl00_MainContent_lblTrangThai')).toBe('Dự thảo');
    });
    it('BẪY: giá trị không có trong ô chọn ⇒ 500 "Invalid postback or callback argument" (EventValidation)', async () => {
      const { b, p } = await moChuyen();
      const r = await b.postback(p, `${F}ddlDonVi`, '', { [`${F}ddlDonVi`]: '99' });
      expect(r.status).toBe(500);
      expect(r.html).toContain('Invalid postback or callback argument');
    });
    it('BẪY: ViewState bị sửa ⇒ 500', async () => {
      const { b, p } = await moChuyen();
      const vs = formFields(p.html).__VIEWSTATE as string;
      const r = await b.postback(p, `${F}ddlDonVi`, '', { [`${F}ddlDonVi`]: '2', __VIEWSTATE: vs.slice(0, -8) + 'AAAAAAAA' });
      expect(r.status).toBe(500);
    });
    it('văn bản đã kết thúc ⇒ không chuyển được', async () => {
      const { p } = await moChuyen(2);
      expect(text(p.html, 'ctl00_MainContent_lblLoi')).toBe('Văn bản đã kết thúc, không chuyển được');
    });
  });
```

- [ ] **Step 2: Chạy test thấy hỏng**

Run: `pnpm --filter @vala/qlvb-webforms test`
Expected: 5 test mới FAIL.

- [ ] **Step 3: Chuyen.aspx**

```aspx
<%@ Page Language="C#" MasterPageFile="~/Site.master" %>
<%@ Import Namespace="System.Linq" %>
<%@ Import Namespace="System.Globalization" %>
<script runat="server">
  VanBan vb;
  protected void Page_Load(object sender, EventArgs e) {
    int id; int.TryParse(Request.QueryString["id"], out id);
    vb = Store.Lay(id);
    if (vb == null) { lblLoi.Text = "Không tìm thấy văn bản"; pnlForm.Visible = false; return; }
    if (vb.TrangThai != TrangThai.DuThao && vb.TrangThai != TrangThai.DangXuLy) {
      lblLoi.Text = "Văn bản " + vb.TrangThai.ToLower() + ", không chuyển được"; pnlForm.Visible = false; return;
    }
    lblTrichYeu.Text = vb.TrichYeu;
    if (IsPostBack) return;
    ddlDonVi.Items.Add(new ListItem("— Chọn đơn vị —", ""));
    foreach (var d in Store.DonVi) ddlDonVi.Items.Add(new ListItem(d.Ten, d.Id.ToString()));
  }
  // Đổi đơn vị ⇒ nạp lại người nhận (AutoPostBack). Danh sách mới được ghi vào ViewState/EventValidation.
  protected void ddlDonVi_Changed(object sender, EventArgs e) {
    cblNguoiNhan.Items.Clear();
    int dv; if (!int.TryParse(ddlDonVi.SelectedValue, out dv)) return;
    foreach (var c in Store.CanBo.Where(c => c.DonViId == dv)) cblNguoiNhan.Items.Add(new ListItem(c.HoTen, c.Id.ToString()));
  }
  protected void cvNguoiNhan_Validate(object source, ServerValidateEventArgs args) {
    args.IsValid = cblNguoiNhan.Items.Cast<ListItem>().Any(i => i.Selected);
  }
  protected void cvHan_Validate(object source, ServerValidateEventArgs args) {
    DateTime d;
    args.IsValid = txtHanXuLy.Text.Trim() == "" || DateTime.TryParseExact(txtHanXuLy.Text.Trim(), "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out d);
  }
  protected void btnChuyen_Click(object sender, EventArgs e) {
    if (!Page.IsValid) return;
    var nhan = cblNguoiNhan.Items.Cast<ListItem>().Where(i => i.Selected).Select(i => int.Parse(i.Value)).ToList();
    DateTime? han = null;
    if (txtHanXuLy.Text.Trim() != "") han = DateTime.ParseExact(txtHanXuLy.Text.Trim(), "dd/MM/yyyy", CultureInfo.InvariantCulture);
    TepDinhKem tep = null;
    if (fuDinhKem.HasFile) tep = new TepDinhKem { Ten = fuDinhKem.FileName, Loai = fuDinhKem.PostedFile.ContentType, KichThuoc = fuDinhKem.PostedFile.ContentLength };
    try { Store.Chuyen(vb.Id, nhan, txtYKien.Text.Trim(), han, tep, Store.HienTai(Context)); }
    catch (InvalidOperationException ex) { lblLoi.Text = ex.Message; return; }
    Response.Redirect("ChiTiet.aspx?id=" + vb.Id);
  }
</script>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
  <h3>Chuyển xử lý</h3>
  <asp:Label ID="lblLoi" runat="server" CssClass="loi" />
  <asp:Panel ID="pnlForm" runat="server">
    <asp:ValidationSummary ID="vsLoi" runat="server" CssClass="loi" />
    <div class="o"><span class="nhan">Văn bản</span><asp:Label ID="lblTrichYeu" runat="server" /></div>
    <div class="o"><span class="nhan">Đơn vị</span><asp:DropDownList ID="ddlDonVi" runat="server" AutoPostBack="true" OnSelectedIndexChanged="ddlDonVi_Changed" /></div>
    <div class="o"><span class="nhan">Người nhận</span><asp:CheckBoxList ID="cblNguoiNhan" runat="server" RepeatLayout="Flow" RepeatDirection="Horizontal" />
      <asp:CustomValidator ID="cvNguoiNhan" runat="server" OnServerValidate="cvNguoiNhan_Validate" ErrorMessage="Chọn ít nhất một người nhận" Text="*" CssClass="loi" /></div>
    <div class="o"><span class="nhan">Ý kiến</span><asp:TextBox ID="txtYKien" runat="server" TextMode="MultiLine" Rows="3" Width="420" /></div>
    <div class="o"><span class="nhan">Hạn xử lý</span><asp:TextBox ID="txtHanXuLy" runat="server" placeholder="dd/MM/yyyy" Width="100" />
      <asp:CustomValidator ID="cvHan" runat="server" OnServerValidate="cvHan_Validate" ErrorMessage="Hạn xử lý phải có dạng dd/MM/yyyy" Text="*" CssClass="loi" /></div>
    <div class="o"><span class="nhan">Đính kèm</span><asp:FileUpload ID="fuDinhKem" runat="server" /></div>
    <asp:Button ID="btnChuyen" runat="server" Text="Chuyển" OnClick="btnChuyen_Click" />
  </asp:Panel>
</asp:Content>
```

- [ ] **Step 4: Build lại, chạy test thấy qua**

Run: `docker compose --profile qlvb up -d --build qlvb-webforms && sleep 8 && pnpm --filter @vala/qlvb-webforms test`
Expected: PASS hết (18 test). Ca "BẪY: bấm Chuyển mà không gửi lại" chấp nhận một trong hai kết quả (500 hoặc validator); ghi
lại kết quả thật của Mono vào README (Task 8).

- [ ] **Step 5: Commit**

```bash
git add tools/qlvb-webforms
git commit -m "feat(qlvb-webforms): chuyển văn bản — đơn vị nạp lại người nhận; test các bẫy WebForms"
```

---

### Task 7: Phát hành (UpdatePanel)

**Files:**
- Create: `tools/qlvb-webforms/app/PhatHanh.aspx`
- Modify: `tools/qlvb-webforms/test/qlvb.test.ts` (thêm `describe('phát hành')`)

- [ ] **Step 1: Viết test**

```ts
  describe('phát hành', () => {
    const F = 'ctl00$MainContent$';
    it('UpdatePanel: chọn sổ ⇒ phản hồi từng phần có số dự kiến; Phát hành ⇒ cấp số ký hiệu', async () => {
      const b = new Browser();
      await b.login('vanthu');
      const p = await b.open('/PhatHanh.aspx?id=4');        // 4 ⇒ Dự thảo, loại (4 % 4) + 1 = 1 ⇒ Công văn (UBND-VP)
      const d = await b.postback(p, `${F}ddlSo`, '', { [`${F}ddlSo`]: '1' }, `${F}upSo|${F}ddlSo`);
      expect(d.html).toMatch(/^\d+\|updatePanel\|ctl00_MainContent_upSo\|/);
      expect(d.html).toContain('101/2026/UBND-VP');
      // Lấy ViewState mới từ phản hồi từng phần (dạng độ dài|hiddenField|__VIEWSTATE|giá trị|)
      const vs = /\|hiddenField\|__VIEWSTATE\|([^|]*)\|/.exec(d.html)![1]!;
      const ev = /\|hiddenField\|__EVENTVALIDATION\|([^|]*)\|/.exec(d.html)![1]!;
      const r = await b.post(p, { __VIEWSTATE: vs, __EVENTVALIDATION: ev, [`${F}ddlSo`]: '1', [`${F}cblDonViNhan$1`]: '2', [`${F}btnPhatHanh`]: 'Phát hành' });
      expect(r.url).toMatch(/ChiTiet\.aspx\?id=4$/);
      expect(text(r.html, 'ctl00_MainContent_lblSoKyHieu')).toBe('101/2026/UBND-VP');
      expect(text(r.html, 'ctl00_MainContent_lblTrangThai')).toBe('Đã phát hành');
    });
    it('không phải văn thư ⇒ không phát hành được', async () => {
      const b = new Browser();
      await b.login('chuyenvien');
      expect(text((await b.open('/PhatHanh.aspx?id=4')).html, 'ctl00_MainContent_lblLoi')).toBe('Chỉ văn thư được phát hành');
    });
  });
```

- [ ] **Step 2: Chạy test thấy hỏng**

Run: `pnpm --filter @vala/qlvb-webforms test`
Expected: 2 test mới FAIL.

- [ ] **Step 3: PhatHanh.aspx**

```aspx
<%@ Page Language="C#" MasterPageFile="~/Site.master" %>
<%@ Import Namespace="System.Linq" %>
<script runat="server">
  VanBan vb;
  protected void Page_Load(object sender, EventArgs e) {
    if (!Store.HienTai(Context).LaVanThu) { lblLoi.Text = "Chỉ văn thư được phát hành"; pnlForm.Visible = false; return; }
    int id; int.TryParse(Request.QueryString["id"], out id);
    vb = Store.Lay(id);
    if (vb == null) { lblLoi.Text = "Không tìm thấy văn bản"; pnlForm.Visible = false; return; }
    if (vb.TrangThai != TrangThai.DuThao && vb.TrangThai != TrangThai.DangXuLy) {
      lblLoi.Text = "Văn bản " + vb.TrangThai.ToLower() + ", không phát hành được"; pnlForm.Visible = false; return;
    }
    lblTrichYeu.Text = vb.TrichYeu;
    if (IsPostBack) return;
    ddlSo.Items.Add(new ListItem("— Chọn sổ —", ""));
    foreach (var s in Store.So) ddlSo.Items.Add(new ListItem(s.Ten, s.Id.ToString()));
    foreach (var d in Store.DonVi) cblDonViNhan.Items.Add(new ListItem(d.Ten, d.Id.ToString()));
  }
  // Trong UpdatePanel: chỉ phần sổ + số dự kiến được gửi lại và vẽ lại.
  protected void ddlSo_Changed(object sender, EventArgs e) {
    int so; txtSoKyHieu.Text = int.TryParse(ddlSo.SelectedValue, out so) ? Store.SoDuKien(so, vb.LoaiId) : "";
  }
  protected void btnPhatHanh_Click(object sender, EventArgs e) {
    if (!Page.IsValid) return;
    var nhan = cblDonViNhan.Items.Cast<ListItem>().Where(i => i.Selected).Select(i => int.Parse(i.Value)).ToList();
    try { Store.PhatHanh(vb.Id, int.Parse(ddlSo.SelectedValue), nhan, Store.HienTai(Context)); }
    catch (InvalidOperationException ex) { lblLoi.Text = ex.Message; return; }
    Response.Redirect("ChiTiet.aspx?id=" + vb.Id);
  }
</script>
<asp:Content ContentPlaceHolderID="MainContent" runat="server">
  <h3>Phát hành văn bản</h3>
  <asp:Label ID="lblLoi" runat="server" CssClass="loi" />
  <asp:Panel ID="pnlForm" runat="server">
    <asp:ValidationSummary ID="vsLoi" runat="server" CssClass="loi" />
    <div class="o"><span class="nhan">Văn bản</span><asp:Label ID="lblTrichYeu" runat="server" /></div>
    <asp:UpdatePanel ID="upSo" runat="server">
      <ContentTemplate>
        <div class="o"><span class="nhan">Sổ văn bản</span><asp:DropDownList ID="ddlSo" runat="server" AutoPostBack="true" OnSelectedIndexChanged="ddlSo_Changed" />
          <asp:RequiredFieldValidator ID="rfvSo" runat="server" ControlToValidate="ddlSo" InitialValue="" ErrorMessage="Chọn sổ văn bản" Text="*" CssClass="loi" /></div>
        <div class="o"><span class="nhan">Số ký hiệu</span><asp:TextBox ID="txtSoKyHieu" runat="server" ReadOnly="true" Width="200" /></div>
      </ContentTemplate>
    </asp:UpdatePanel>
    <div class="o"><span class="nhan">Nơi nhận</span><asp:CheckBoxList ID="cblDonViNhan" runat="server" RepeatLayout="Flow" RepeatDirection="Horizontal" /></div>
    <asp:Button ID="btnPhatHanh" runat="server" Text="Phát hành" OnClick="btnPhatHanh_Click" />
  </asp:Panel>
</asp:Content>
```

- [ ] **Step 4: Build lại, chạy test thấy qua**

Run: `docker compose --profile qlvb up -d --build qlvb-webforms && sleep 8 && pnpm --filter @vala/qlvb-webforms test`
Expected: PASS hết (20 test).

- [ ] **Step 5: Commit**

```bash
git add tools/qlvb-webforms
git commit -m "feat(qlvb-webforms): phát hành văn bản trong UpdatePanel"
```

---

### Task 8: README + kiểm tra bằng trình duyệt thật + chạy toàn bộ test repo

**Files:**
- Create: `tools/qlvb-webforms/README.md`

- [ ] **Step 1: README.md** — cách chạy, tài khoản, các trang, các bẫy, kết quả thật của ca "bấm Chuyển không gửi lại"

```markdown
# QLVB Thử nghiệm — hệ thống ASP.NET WebForms giả lập (T07)

Hệ thống quản lý văn bản nhỏ viết bằng **ASP.NET WebForms thật** (Mono 6.12 + xsp4), để thử cách Vala đọc và ghi vào một hệ
thống không có API (biên bản họp 10/2026, việc T07). Thiết kế: `docs/superpowers/specs/2026-10-07-t07-aspnet-design.md`.
Chỉ dùng để thử, không triển khai cho người dùng.

## Chạy

    docker compose --profile qlvb up -d --build qlvb-webforms     # http://localhost:4030
    pnpm --filter @vala/qlvb-webforms test                        # tự bỏ qua nếu máy giả lập chưa chạy
    curl -XPOST localhost:4030/_dev/reset                         # về dữ liệu mẫu ban đầu

Máy dev sau proxy: đặt `HTTP_PROXY` / `HTTPS_PROXY` khi build (ảnh cần tải `mono-xsp4`).

## Tài khoản (mật khẩu chung `Qlvb@2026`)

| Tên đăng nhập | Họ tên | Đơn vị | Ghi chú |
|---|---|---|---|
| vanthu | Nguyễn Thị Văn Thư | Văn phòng | được phát hành |
| chanhvp | Trần Văn Chánh | Văn phòng | |
| chuyenvien | Lê Thị Chuyên Viên | Phòng Tài chính | |
| truongtc | Phạm Văn Tài Chính | Phòng Tài chính | |
| truongnv | Hoàng Thị Nội Vụ | Phòng Nội vụ | |
| canbonv | Đỗ Văn Cán Bộ | Phòng Nội vụ | |

Dữ liệu mẫu: 35 văn bản, trạng thái theo mã (mã chia 4 dư 0 Dự thảo, 1 Đang xử lý, 2 Đã kết thúc, 3 Đã phát hành).

## Các trang và điểm WebForms

(bảng các trang như spec phần 1)

## Các bẫy

- ViewState chống sửa (machineKey cố định); EventValidation bật; hai cookie phiên `.ASPXAUTH` + `ASP.NET_SessionId`, mất một
  trong hai là về `Login.aspx?ReturnUrl=…`; tên trường dạng `ctl00$MainContent$…`; CheckBoxList gửi `tên$i=<giá trị>`.
- Bấm "Chuyển" mà không gửi lại "chọn đơn vị" trước: <ghi kết quả thật quan sát được ở Task 6 — 500 hay "Chọn ít nhất một người nhận">.
```

Khi viết, thay dòng `(bảng các trang như spec phần 1)` bằng đúng bảng "Các trang" trong spec, và thay `<ghi kết quả thật…>`
bằng kết quả đã thấy ở Task 6 Step 4.

- [ ] **Step 2: Kiểm tra bằng trình duyệt thật** (UpdatePanel, LinkButton, xác nhận chạy bằng JS của ASP.NET)

Run: dùng playwright-core (đã có trong repo, `node_modules/.pnpm/playwright-core@1.49.1`) với Chrome (`/usr/bin/google-chrome`):
đăng nhập `vanthu`, mở `PhatHanh.aspx?id=8` (8 ⇒ Dự thảo), chọn sổ trong ô chọn ⇒ chờ ô số ký hiệu có giá trị mà trang không
tải lại (kiểm `performance.navigation`/URL không đổi), chụp ảnh màn hình.
Expected: ô "Số ký hiệu" hiện `102/2026/…` hoặc `101/2026/…` (tuỳ đã phát hành ở test hay chưa — gọi `/_dev/reset` trước),
không có lỗi JS trong console.

- [ ] **Step 3: Chạy toàn bộ test repo** (gói mới không làm hỏng `pnpm -r test`)

Run: `pnpm --filter @vala/qlvb-webforms test && pnpm --filter @vala/desktop test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/qlvb-webforms/README.md
git commit -m "docs(qlvb-webforms): cách chạy, tài khoản, các bẫy WebForms"
```
