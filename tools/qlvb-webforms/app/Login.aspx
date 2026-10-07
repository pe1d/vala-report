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
