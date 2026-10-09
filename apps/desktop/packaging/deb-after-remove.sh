#!/bin/bash
# Sau khi gỡ gói .deb Vala Desktop: phần mặc định của electron-builder + gỡ hồ sơ AppArmor.
# Khi nâng cấp (dpkg gọi postrm "upgrade") thì GIỮ hồ sơ — bản mới cài lại ngay sau đó.

# Delete the link to the binary
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove 'vala-desktop' '/usr/bin/vala-desktop'
else
    rm -f '/usr/bin/vala-desktop'
fi

case "$1" in
    remove|purge)
        if [ -f /etc/apparmor.d/vala-desktop ]; then
            if hash apparmor_parser 2>/dev/null; then
                apparmor_parser -R /etc/apparmor.d/vala-desktop 2>/dev/null || true
            fi
            rm -f /etc/apparmor.d/vala-desktop
        fi
        rm -rf /usr/lib/vala-desktop
        rm -f /usr/share/polkit-1/actions/vn.bkav.vala-desktop.update.policy
        ;;
esac
