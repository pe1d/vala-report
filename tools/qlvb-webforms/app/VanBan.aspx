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
