import { describe, expect, it } from 'vitest';
import { parseFavorites, withFavorite } from '../src/pin-model';

describe('ghim vào dock GNOME', () => {
  it('đọc danh sách favorite-apps', () => {
    expect(parseFavorites("['org.gnome.Nautilus.desktop', 'code.desktop']")).toEqual(['org.gnome.Nautilus.desktop', 'code.desktop']);
    expect(parseFavorites('@as []')).toEqual([]);
    expect(parseFavorites('rác')).toBeNull();
  });
  it('thêm vào cuối khi chưa có; đã có thì không đụng', () => {
    expect(withFavorite("['code.desktop']", 'vala-desktop.desktop')).toBe("['code.desktop', 'vala-desktop.desktop']");
    expect(withFavorite('@as []', 'vala-desktop.desktop')).toBe("['vala-desktop.desktop']");
    expect(withFavorite("['vala-desktop.desktop', 'code.desktop']", 'vala-desktop.desktop')).toBeNull();
    expect(withFavorite('không đọc được', 'vala-desktop.desktop')).toBeNull();
  });
});
