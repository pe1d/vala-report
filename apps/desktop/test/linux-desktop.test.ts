import { describe, expect, it } from 'vitest';
import { desktopEntry, execLine } from '../src/linux-desktop';

describe('execLine (dòng Exec của file .desktop)', () => {
  it('đường dẫn có dấu cách được trích dẫn', () => {
    expect(execLine('/opt/Vala Desktop/vala-desktop')).toBe('"/opt/Vala Desktop/vala-desktop"');
  });
  it('thoát các ký tự đặc biệt theo chuẩn Desktop Entry', () => {
    expect(execLine('/opt/a"b$c`d\\e')).toBe('"/opt/a\\"b\\$c\\`d\\\\e"');
  });
  it('kèm tham số', () => {
    expect(execLine('/opt/Vala Desktop/vala-desktop', ['--hidden'])).toBe('"/opt/Vala Desktop/vala-desktop" --hidden');
  });
});

describe('desktopEntry', () => {
  const e = desktopEntry({ exec: '"/opt/Vala Desktop/vala-desktop"', icon: 'vala-desktop' });
  it('đủ trường bắt buộc, song ngữ', () => {
    expect(e).toContain('[Desktop Entry]\n');
    expect(e).toContain('Type=Application\n');
    expect(e).toContain('Name=Vala Desktop\n');
    expect(e).toContain('Exec="/opt/Vala Desktop/vala-desktop"\n');
    expect(e).toContain('Icon=vala-desktop\n');
    expect(e).toMatch(/^Comment=.+$/m);
    expect(e).toMatch(/^Comment\[vi\]=.+$/m);
  });
  it('mục tự khởi động có cờ autostart của GNOME', () => {
    expect(desktopEntry({ exec: 'x', icon: 'i', autostart: true })).toContain('X-GNOME-Autostart-enabled=true\n');
    expect(e).not.toContain('X-GNOME-Autostart');
  });
});
