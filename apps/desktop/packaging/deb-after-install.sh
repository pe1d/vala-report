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
