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
