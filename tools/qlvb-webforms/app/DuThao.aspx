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
