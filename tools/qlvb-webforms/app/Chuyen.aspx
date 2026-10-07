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
