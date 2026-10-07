/**
 * Ghi chú "có gì mới" của mỗi bản Vala Desktop. Nguồn: apps/desktop/CHANGELOG.md — mỗi bản một mục `## <phiên bản>`, trong đó
 * `### vi` và `### en` là các gạch đầu dòng (song ngữ bắt buộc).
 *
 * Lúc build, scripts/release-notes.cjs tách mục của phiên bản trong package.json ra dist/release-notes.json. Tệp này:
 *   - đóng kèm trong gói ⇒ bản đã cài biết mình có gì mới (Cài đặt → Giới thiệu, thông báo "Đã cập nhật lên bản …");
 *   - electron-builder ghi nguyên nội dung vào trường releaseNotes của latest.yml (releaseInfo.releaseNotesFile) ⇒ bản cũ
 *     đọc được điểm mới của bản sắp cài (updater.ts).
 * Không import electron: dùng được cả trong script build và trong test.
 */
export interface ReleaseNotes { version: string; vi: string[]; en: string[] }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Mục của `version` trong CHANGELOG.md; thiếu mục hoặc thiếu một thứ tiếng ⇒ null. */
export function notesFor(changelog: string, version: string): ReleaseNotes | null {
  const lines = changelog.split(/\r?\n/);
  const head = new RegExp(`^##\\s+v?${escape(version)}\\s*$`);
  const start = lines.findIndex((l) => head.test(l));
  if (start < 0) return null;
  const out: Record<'vi' | 'en', string[]> = { vi: [], en: [] };
  let lang: 'vi' | 'en' | null = null;
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;                                   // sang bản khác
    const sub = /^###\s+(vi|en)\s*$/i.exec(line);
    if (sub) { lang = sub[1]!.toLowerCase() as 'vi' | 'en'; continue; }
    if (!lang) continue;
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) out[lang].push(item[1]!.trim());
    else if (/^\s+\S/.test(line) && out[lang].length) out[lang][out[lang].length - 1] += ` ${line.trim()}`;
  }
  return out.vi.length && out.en.length ? { version, ...out } : null;
}

/** Đọc ghi chú từ latest.yml (chuỗi JSON) hoặc tệp đóng kèm; sai dạng ⇒ null (bản phát hành cũ không có ghi chú). */
export function parseNotes(raw: unknown): ReleaseNotes | null {
  let v: unknown = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { return null; } }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const list = (x: unknown) => Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === 'string');
  return typeof o.version === 'string' && list(o.vi) && list(o.en)
    ? { version: o.version, vi: o.vi as string[], en: o.en as string[] } : null;
}
