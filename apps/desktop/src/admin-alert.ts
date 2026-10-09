/**
 * Báo quản trị đơn vị khi phiên dịch (gói kịch bản) có thể hỏng vì trang gốc đổi (docs/van-ban-chung.md): người đang dùng
 * app là quản trị ⇒ hỏi /ext/desktop/package-health lúc mở và mỗi chu kỳ đồng bộ; gói mới chuyển sang "đang lỗi" / "trang
 * gốc đổi" ⇒ một thông báo hệ điều hành, bấm ⇒ Quản trị → Kịch bản Desktop. Mỗi tình trạng báo một lần cho tới khi quản
 * trị bấm "Đã kiểm" (máy chủ xoá cảnh báo ⇒ lần lỗi sau báo lại).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { api } from './api';
import { canAdmin } from './apps';
import { messages } from './i18n';
import { notify } from './notify';
import { getSettings } from './settings';

const M = messages({
  loi: (ten: string) => `Phiên dịch "${ten}" đang lỗi`,
  doi: (ten: string) => `Trang gốc của "${ten}" vừa đổi`,
  hint: 'Bấm để mở Quản trị → Kịch bản Desktop.',
}, {
  loi: (ten: string) => `Translator "${ten}" is failing`,
  doi: (ten: string) => `The original site of "${ten}" just changed`,
  hint: 'Click to open Administration → Desktop scripts.',
});

interface Goi { code: string; ten: string; muc: 'loi' | 'doi'; thong_bao: string }
const file = () => join(app.getPath('userData'), 'admin-alerts.json');
const loadSeen = (): string[] => { try { return existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) as string[] : []; } catch { return []; } };

/** Gói có tình trạng mới (mã + mức chưa báo) ⇒ cần báo; gói đã hết cảnh báo ⇒ quên để lần sau báo lại. Hàm thuần. */
export function newAlerts(goi: Goi[], seen: string[]): { bao: Goi[]; seen: string[] } {
  const now = goi.map((g) => `${g.code}:${g.muc}`);
  return { bao: goi.filter((g) => !seen.includes(`${g.code}:${g.muc}`)), seen: now };
}

export async function checkAdminAlerts(openScripts: () => void): Promise<void> {
  if (!getSettings().deviceToken || !canAdmin()) return;
  let goi: Goi[];
  try { goi = (await api<{ goi: Goi[] }>('GET', '/ext/desktop/package-health')).goi ?? []; } catch { return; }
  const { bao, seen } = newAlerts(goi, loadSeen());
  try { writeFileSync(file(), JSON.stringify(seen), { mode: 0o600 }); } catch { /* bỏ qua */ }
  const t = M[getSettings().lang];
  for (const g of bao.slice(0, 3)) notify(g.muc === 'loi' ? t.loi(g.ten) : t.doi(g.ten), `${g.thong_bao.slice(0, 160)}\n${t.hint}`, openScripts);
}
