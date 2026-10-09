import { describe, expect, it } from 'vitest';
import { appTileSvg, defaultColor, libraryIconName, resolveAppIcon, ICONS, ICON_GROUPS, COLOR_KEYS } from '@vala/ui/app-icons';

describe('biểu tượng ứng dụng chuẩn (@vala/ui/app-icons)', () => {
  it('bộ có sẵn: mỗi nhóm chỉ chứa biểu tượng có trong bộ', () => {
    for (const names of Object.values(ICON_GROUPS)) for (const n of names) expect(ICONS[n], n).toBeTruthy();
    expect(Object.keys(ICONS).length).toBeGreaterThan(100);
  });
  it('lucide:<tên> hợp lệ / không hợp lệ', () => {
    expect(libraryIconName('lucide:mail')).toBe('mail');
    expect(libraryIconName('lucide:khong-co')).toBeNull();
    expect(libraryIconName('https://x/a.png')).toBeNull();
  });
  it('màu tự gán ổn định theo mã, không ra xám', () => {
    expect(defaultColor('tin_nhan')).toBe(defaultColor('tin_nhan'));
    for (const m of ['vala', 'tin_nhan', 'danh_ba', 'lich_hop', 'bao_cao', 'src_egov']) expect(defaultColor(m)).not.toBe('xam');
    expect(COLOR_KEYS).toContain(defaultColor('x'));
  });
  it('ô SVG: nền màu, nét trắng, thoát ký tự thuộc tính', () => {
    const svg = appTileSvg('mail', 'cam');
    expect(svg).toContain('fill="#ea580c"');
    expect(svg).toContain('stroke="#fff"');
    expect(svg.startsWith('<svg')).toBe(true);
  });
  it('resolveAppIcon: ảnh riêng giữ nguyên; bộ có sẵn / chưa chọn ⇒ ô chuẩn', () => {
    expect(resolveAppIcon({ ma: 'a', kind: 'web', icon: 'https://x/a.png' })).toBe('https://x/a.png');
    expect(resolveAppIcon({ ma: 'a', kind: 'web', icon: 'lucide:mail', mau: 'tim' })).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(resolveAppIcon({ ma: 'a', kind: 'web', icon: 'lucide:mail', mau: 'tim' }))).toContain('#7c3aed');
    // Chưa chọn ⇒ biểu tượng mặc định theo loại (Báo cáo ⇒ biểu đồ cột).
    expect(decodeURIComponent(resolveAppIcon({ ma: 'bao_cao', kind: 'reports', icon: null }))).toContain(ICONS['chart-column']!.n[0]![1].d ?? '');
  });
});
