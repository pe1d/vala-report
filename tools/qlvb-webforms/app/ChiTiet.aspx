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
