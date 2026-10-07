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
