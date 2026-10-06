/** Dựng file .desktop (mục tự khởi động trên Linux) — hàm thuần, có test. */

/** Thoát một đối số trong dòng Exec theo chuẩn Desktop Entry: bọc "…", thoát " ` $ \. */
const quoteArg = (s: string) => `"${s.replace(/[\\"`$]/g, (c) => `\\${c}`)}"`;

export function execLine(executable: string, args: string[] = []): string {
  return [quoteArg(executable), ...args].join(' ');
}

export function desktopEntry(o: { exec: string; icon: string; autostart?: boolean }): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Vala Desktop',
    'Comment=Work with Vala and your source systems in one app',
    'Comment[vi]=Làm việc với Vala và các hệ thống nguồn trong một ứng dụng',
    `Exec=${o.exec}`,
    `Icon=${o.icon}`,
    'Terminal=false',
    'Categories=Office;Network;',
    ...(o.autostart ? ['X-GNOME-Autostart-enabled=true'] : []),
    '',
  ].join('\n');
}
