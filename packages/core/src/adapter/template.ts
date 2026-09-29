/**
 * "{{session.puid}}" → giá trị trong ngữ cảnh. Chuỗi chỉ gồm đúng một biểu thức giữ nguyên
 * kiểu (số vẫn là số); chuỗi có chữ xen kẽ thì nội suy thành chuỗi.
 * Biến không tồn tại là lỗi — thà dừng còn hơn gửi request thiếu định danh.
 */
const WHOLE = /^\{\{\s*([\w.]+)\s*\}\}$/;
const ANY = /\{\{\s*([\w.]+)\s*\}\}/g;

function lookup(ctx: Record<string, unknown>, path: string): unknown {
  let v: unknown = ctx;
  for (const part of path.split('.')) {
    if (v === null || typeof v !== 'object' || !(part in (v as object))) {
      throw new Error(`Template tham chiếu biến không tồn tại: ${path}`);
    }
    v = (v as Record<string, unknown>)[part];
  }
  if (v === undefined || v === null) throw new Error(`Template tham chiếu biến rỗng: ${path}`);
  return v;
}

export function render(value: unknown, ctx: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const whole = WHOLE.exec(value);
    if (whole) return lookup(ctx, whole[1]!);
    return value.replace(ANY, (_m, p: string) => String(lookup(ctx, p)));
  }
  if (Array.isArray(value)) return value.map((v) => render(v, ctx));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, render(v, ctx)]));
  }
  return value;
}
