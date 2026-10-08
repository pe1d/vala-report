/** Ghim vào dock GNOME (Ubuntu) — phần thuần, có test: thêm mục vào danh sách `org.gnome.shell favorite-apps`. */

/** Chuỗi GVariant `['a.desktop', 'b.desktop']` / `@as []` ⇒ mảng; dạng lạ ⇒ null (không đụng vào). */
export function parseFavorites(s: string): string[] | null {
  const t = s.trim();
  if (/^@as\s*\[\s*\]$/.test(t)) return [];
  if (!/^\[.*\]$/s.test(t)) return null;
  const items = [...t.slice(1, -1).matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]!.replace(/\\(.)/g, '$1'));
  return items;
}

const quote = (x: string) => `'${x.replace(/[\\']/g, (c) => `\\${c}`)}'`;

/** Thêm `id` vào cuối dock nếu chưa có ⇒ chuỗi GVariant mới; đã có / không đọc được ⇒ null (giữ nguyên thứ tự người dùng sắp). */
export function withFavorite(current: string, id: string): string | null {
  const list = parseFavorites(current);
  if (!list || list.includes(id)) return null;
  return `[${[...list, id].map(quote).join(', ')}]`;
}
