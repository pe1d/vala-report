#!/bin/bash
# Sau khi cài gói .deb Vala Desktop (thay script mặc định của electron-builder: giữ nguyên phần của nó + hồ sơ AppArmor).

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/vala-desktop' -a -e '/usr/bin/vala-desktop' -a "`readlink '/usr/bin/vala-desktop'`" != '/etc/alternatives/vala-desktop' ]; then
        rm -f '/usr/bin/vala-desktop'
    fi
    update-alternatives --install '/usr/bin/vala-desktop' 'vala-desktop' '/opt/Vala Desktop/vala-desktop' 100 || ln -sf '/opt/Vala Desktop/vala-desktop' '/usr/bin/vala-desktop'
else
    ln -sf '/opt/Vala Desktop/vala-desktop' '/usr/bin/vala-desktop'
fi

# Ubuntu 24.04+ (AppArmor 4) chặn user namespace của ứng dụng không có hồ sơ ⇒ lớp cách ly (sandbox) của Chromium không
# chạy được và ứng dụng dừng ngay khi mở. Cấp hồ sơ "chỉ để đặt tên" giống hồ sơ Ubuntu cấp cho chrome / code (vscode).
if [ -f /etc/apparmor.d/abi/4.0 ]; then
    cat > /etc/apparmor.d/vala-desktop <<'PROFILE'
# Vala Desktop: hồ sơ cho phép mọi thứ, chỉ để có tên và được dùng user namespace (sandbox của Chromium) trên Ubuntu 24.04+.
abi <abi/4.0>,
include <tunables/global>

profile vala-desktop "/opt/Vala Desktop/vala-desktop" flags=(unconfined) {
  userns,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/vala-desktop>
}
PROFILE
    if hash apparmor_parser 2>/dev/null; then
        apparmor_parser -r -T -W /etc/apparmor.d/vala-desktop || true
    fi
fi

# Cài bản cập nhật (Vala Desktop gọi qua pkexec — src/updater.ts): script riêng + chính sách polkit có lời nhắn dễ hiểu,
# thay cho hộp xin mật khẩu hiện nguyên câu lệnh "bash -c dpkg -i …". Vẫn cần mật khẩu quản trị như trước.
mkdir -p /usr/lib/vala-desktop
# Ghi file tạm rồi đổi tên: lúc nâng cấp, chính script này đang chạy (dpkg gọi từ trong nó) — không ghi đè tại chỗ.
cat > /usr/lib/vala-desktop/cai-cap-nhat.tmp <<'HELPER'
#!/bin/bash
# Cài bản cập nhật Vala Desktop (chỉ nhận gói .deb của chính Vala Desktop). Chạy qua pkexec.
set -u
f="${1:-}"
case "$f" in *.deb) ;; *) echo "Không phải gói .deb: $f" >&2; exit 2 ;; esac
[ -f "$f" ] || { echo "Không thấy $f" >&2; exit 2; }
[ "$(dpkg-deb -f "$f" Package 2>/dev/null)" = vala-desktop ] || { echo "Không phải gói Vala Desktop: $f" >&2; exit 3; }
export DEBIAN_FRONTEND=noninteractive
dpkg -i "$f" || apt-get install -f -y
HELPER
chmod 755 /usr/lib/vala-desktop/cai-cap-nhat.tmp && mv -f /usr/lib/vala-desktop/cai-cap-nhat.tmp /usr/lib/vala-desktop/cai-cap-nhat
mkdir -p /usr/share/polkit-1/actions
cat > /usr/share/polkit-1/actions/vn.bkav.vala-desktop.update.policy <<'POLICY'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE policyconfig PUBLIC "-//freedesktop//DTD PolicyKit Policy Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/PolicyKit/1/policyconfig.dtd">
<policyconfig>
  <vendor>Bkav</vendor>
  <action id="vn.bkav.vala-desktop.update">
    <description>Cài bản cập nhật Vala Desktop</description>
    <description xml:lang="en">Install a Vala Desktop update</description>
    <message>Vala Desktop cần quyền quản trị để cài bản cập nhật mới.</message>
    <message xml:lang="en">Vala Desktop needs administrator permission to install its new version.</message>
    <icon_name>vala-desktop</icon_name>
    <defaults>
      <allow_any>auth_admin</allow_any>
      <allow_inactive>auth_admin</allow_inactive>
      <allow_active>auth_admin</allow_active>
    </defaults>
    <annotate key="org.freedesktop.policykit.exec.path">/usr/lib/vala-desktop/cai-cap-nhat</annotate>
  </action>
</policyconfig>
POLICY

# Check if user namespaces are supported by the kernel and working with a quick test:
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    # Use SUID chrome-sandbox only on systems without user namespaces:
    chmod 4755 '/opt/Vala Desktop/chrome-sandbox' || true
else
    chmod 0755 '/opt/Vala Desktop/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
