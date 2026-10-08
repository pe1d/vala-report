# Ghim Vala Desktop vào thanh tác vụ

Chốt 08/10/2026. Lần đầu mở bản cài (apps/desktop/src/pin.ts):

- **Ubuntu (GNOME):** Vala Desktop tự thêm vào cuối dock (`gsettings org.gnome.shell favorite-apps`), không đổi thứ tự
  người dùng đã sắp. Chỉ làm một lần; người dùng bỏ ghim thì thôi.
- **Windows:** từ Windows 10 (1809) và trên Windows 11, Microsoft **không cho phần mềm tự ghim** vào thanh tác vụ. Vala
  Desktop hiện một thông báo hướng dẫn: chuột phải biểu tượng trên thanh tác vụ ⇒ "Ghim vào thanh tác vụ". Bộ cài vẫn tạo
  lối tắt ở Desktop và Start.

## Quản trị IT ghim hàng loạt (Windows)

Dùng bố cục thanh tác vụ (`LayoutModification.xml`) qua Group Policy hoặc Intune. Bộ cài Vala Desktop cài theo người dùng
nên lối tắt nằm ở `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Vala Desktop.lnk`.

```xml
<?xml version="1.0" encoding="utf-8"?>
<LayoutModificationTemplate
    xmlns="http://schemas.microsoft.com/Start/2014/LayoutModification"
    xmlns:defaultlayout="http://schemas.microsoft.com/Start/2014/FullDefaultLayout"
    xmlns:taskbar="http://schemas.microsoft.com/Start/2014/TaskbarLayout"
    Version="1">
  <CustomTaskbarLayoutCollection PinListPlacement="Append">
    <defaultlayout:TaskbarLayout>
      <taskbar:TaskbarPinList>
        <taskbar:DesktopApp DesktopApplicationLinkPath="%APPDATA%\Microsoft\Windows\Start Menu\Programs\Vala Desktop.lnk" />
      </taskbar:TaskbarPinList>
    </defaultlayout:TaskbarLayout>
  </CustomTaskbarLayoutCollection>
</LayoutModificationTemplate>
```

- `PinListPlacement="Append"`: thêm Vala Desktop vào sau các mục người dùng đang ghim, không xoá của họ.
- **Group Policy:** chép file lên thư mục chia sẻ mọi máy đọc được ⇒ User Configuration ⇒ Administrative Templates ⇒
  Start Menu and Taskbar ⇒ **Start Layout** ⇒ Enabled, "Start Layout File" = đường dẫn file.
- **Intune:** cấu hình thiết bị ⇒ Settings catalog ⇒ Start ⇒ **Start Layout**, dán nội dung XML.
- Áp dụng ở **lần đăng nhập Windows kế tiếp**, máy phải đã cài Vala Desktop (lối tắt tồn tại). Thử trên vài máy trước khi
  áp cả đơn vị.
