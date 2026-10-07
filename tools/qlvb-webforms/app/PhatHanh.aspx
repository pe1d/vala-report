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
