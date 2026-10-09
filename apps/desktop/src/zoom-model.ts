/** Cỡ chữ (thu phóng nội dung trang) — phần thuần, có test. */
export const ZOOM_STEPS = [80, 90, 100, 110, 125, 150, 175] as const;

/** Bước kế tiếp (+1 / −1) từ mức hiện tại; mức lạ (vd 105) ⇒ về bước gần nhất theo hướng đó. 0 ⇒ 100%. */
export function stepZoom(cur: number, dir: 1 | -1 | 0): number {
  if (dir === 0) return 100;
  if (dir > 0) return ZOOM_STEPS.find((s) => s > cur) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]!;
  return [...ZOOM_STEPS].reverse().find((s) => s < cur) ?? ZOOM_STEPS[0];
}

/** Giá trị lưu được (50–200, số nguyên); không hợp lệ ⇒ 100. */
export const cleanZoom = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 50 && v <= 200 ? v : 100);
