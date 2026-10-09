import { createElement, useMemo, useState } from 'react';
import { APP_COLORS, COLOR_KEYS, DEFAULT_ICON, ICON_GROUPS, ICONS, ICON_PREFIX, defaultColor, libraryIconName, resolveAppIcon, type AppColor, type AppKind } from '@vala/ui/app-icons';
import { Button, Input } from '@vala/ui/ui';
import { messages, useT } from '@vala/ui/i18n';

/**
 * Ô chọn biểu tượng ứng dụng (Quản trị → Ứng dụng Desktop): bộ biểu tượng chuẩn (Lucide, ô nền màu + biểu tượng trắng —
 * @vala/ui/app-icons) hoặc ảnh riêng (logo chính thức). Xem trước đúng như trên thanh bên / khung Tất cả ứng dụng.
 */
const M = messages({
  tabSet: 'Bộ biểu tượng', tabImage: 'Ảnh riêng',
  search: 'Tìm biểu tượng (vd: lịch, văn bản, tin nhắn…)', none: 'Không tìm thấy biểu tượng.',
  auto: 'Mặc định theo loại', autoHint: 'Chưa chọn ⇒ biểu tượng theo loại ứng dụng (trang web, hệ thống nguồn, báo cáo).',
  color: 'Màu ô', colorAuto: 'Tự động',
  groups: { lien_lac: 'Liên lạc', van_ban: 'Văn bản & tài liệu', cong_viec: 'Công việc', bao_cao: 'Báo cáo & dữ liệu', co_quan: 'Cơ quan & lĩnh vực', tai_chinh: 'Tài chính & đi lại', khac: 'Khác' } as Record<string, string>,
  colors: { xanh_duong: 'Xanh dương', xanh_troi: 'Xanh trời', xanh_ngoc: 'Xanh ngọc', xanh_la: 'Xanh lá', vang: 'Vàng', cam: 'Cam', do: 'Đỏ', hong: 'Hồng', tim: 'Tím', cham: 'Chàm', xam: 'Xám' } as Record<AppColor, string>,
  imageUrl: 'Địa chỉ ảnh', imageUrlPh: 'https://…/logo.png', upload: 'Tải ảnh lên', tooBig: 'Ảnh quá lớn (tối đa 150 KB).',
  imageHint: 'Chỉ dùng khi cần đúng logo chính thức — ảnh riêng không theo chuẩn ô màu như các ứng dụng khác.',
  preview: 'Xem trước',
}, {
  tabSet: 'Icon set', tabImage: 'Own image',
  search: 'Search icons (e.g. calendar, document, message…)', none: 'No icons found.',
  auto: 'Default for the type', autoHint: 'Not chosen ⇒ an icon by app type (web page, source system, reports).',
  color: 'Tile colour', colorAuto: 'Automatic',
  groups: { lien_lac: 'Communication', van_ban: 'Documents', cong_viec: 'Work', bao_cao: 'Reports & data', co_quan: 'Organizations & sectors', tai_chinh: 'Finance & travel', khac: 'Other' } as Record<string, string>,
  colors: { xanh_duong: 'Blue', xanh_troi: 'Sky', xanh_ngoc: 'Teal', xanh_la: 'Green', vang: 'Yellow', cam: 'Orange', do: 'Red', hong: 'Pink', tim: 'Violet', cham: 'Indigo', xam: 'Gray' } as Record<AppColor, string>,
  imageUrl: 'Image address', imageUrlPh: 'https://…/logo.png', upload: 'Upload image', tooBig: 'Image too large (max 150 KB).',
  imageHint: 'Only when you need the exact official logo — an own image does not follow the coloured-tile standard of the other apps.',
  preview: 'Preview',
});

/** Biểu tượng nét (24×24) vẽ bằng React từ dữ liệu Lucide. */
export function Glyph({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  const icon = ICONS[name];
  if (!icon) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icon.n.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

/** Ảnh biểu tượng cuối cùng của ứng dụng (đúng như Vala Desktop hiện). */
export function AppTile({ a, size = 'h-6 w-6' }: { a: { ma: string; kind: AppKind; icon: string | null; mau?: string | null }; size?: string }) {
  const [bad, setBad] = useState(false);
  const src = resolveAppIcon({ ...a, icon: bad ? null : a.icon });
  return <img src={src} alt="" className={`${size} shrink-0 rounded-[22%] object-contain`} onError={() => setBad(true)} />;
}

export interface IconValue { icon: string | null; mau: string | null }

export function AppIconPicker({ ma, kind, ten, value, onChange, onError }: {
  ma: string; kind: AppKind; ten: string; value: IconValue; onChange: (v: IconValue) => void; onError: (msg: string) => void;
}) {
  const t = useT(M);
  const custom = !!value.icon && !value.icon.startsWith(ICON_PREFIX);
  const [tab, setTab] = useState<'set' | 'image'>(custom ? 'image' : 'set');
  const [q, setQ] = useState('');
  const chosen = libraryIconName(value.icon);
  const color = (value.mau && value.mau in APP_COLORS ? value.mau : defaultColor(ma || ten || 'x')) as AppColor;

  // Tìm theo từ khoá tiếng Việt / tiếng Anh (bỏ dấu để gõ không dấu vẫn ra).
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
  const groups = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    return Object.entries(ICON_GROUPS).map(([g, names]) => [g, names.filter((n) => words.every((w) => fold(ICONS[n]!.k).includes(w)))] as const)
      .filter(([, names]) => names.length);
  }, [q]);

  const upload = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 150_000) { onError(t.tooBig); return; }
    const r = new FileReader();
    r.onload = () => onChange({ icon: String(r.result), mau: value.mau });
    r.readAsDataURL(f);
  };
  const tabBtn = (k: 'set' | 'image', label: string) => (
    <button type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
      className={`rounded-md px-3 py-1 text-sm ${tab === k ? 'bg-white font-medium text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'}`}>{label}</button>
  );

  return (
    <div className="grid gap-3">
      {/* Xem trước: như trên thanh bên (nhỏ) và khung Tất cả ứng dụng (lớn). */}
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
        <AppTile a={{ ma: ma || 'x', kind, ...value }} size="h-12 w-12" />
        <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 shadow-sm dark:bg-slate-800">
          <AppTile a={{ ma: ma || 'x', kind, ...value }} size="h-5 w-5" />
          <span className="text-[13px]">{ten || '—'}</span>
        </div>
        <span className="text-xs text-slate-500">{t.preview}</span>
      </div>

      <div className="flex w-fit gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="group">
        {tabBtn('set', t.tabSet)}{tabBtn('image', t.tabImage)}
      </div>

      {tab === 'set' ? (
        <>
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500">{t.color}</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => onChange({ icon: custom ? null : value.icon, mau: null })} aria-pressed={!value.mau}
                className={`rounded-full border px-2.5 py-1 text-xs ${!value.mau ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}>{t.colorAuto}</button>
              {COLOR_KEYS.map((c) => (
                <button key={c} type="button" title={t.colors[c]} aria-label={t.colors[c]} aria-pressed={value.mau === c}
                  onClick={() => onChange({ icon: custom ? null : value.icon, mau: c })}
                  className={`h-6 w-6 rounded-full ring-offset-2 dark:ring-offset-slate-900 ${value.mau === c ? 'ring-2 ring-slate-900 dark:ring-white' : ''}`}
                  style={{ background: APP_COLORS[c] }} />
              ))}
            </div>
          </div>
          <Input value={q} placeholder={t.search} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
            {!q && (
              <button type="button" onClick={() => onChange({ icon: null, mau: value.mau })} aria-pressed={!value.icon}
                className={`mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${!value.icon ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-300 dark:bg-slate-800 dark:text-blue-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: APP_COLORS[color] }}><Glyph name={DEFAULT_ICON[kind]} className="h-4 w-4" /></span>
                <span><span className="font-medium">{t.auto}</span><span className="block text-xs text-slate-500">{t.autoHint}</span></span>
              </button>
            )}
            {!groups.length && <div className="p-3 text-sm text-slate-500">{t.none}</div>}
            {groups.map(([g, names]) => (
              <div key={g} className="mb-2">
                <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.groups[g] ?? g}</div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(36px,1fr))] gap-1">
                  {names.map((n) => (
                    <button key={n} type="button" title={ICONS[n]!.k.split(' ').slice(0, 3).join(' ')} aria-label={n} aria-pressed={chosen === n}
                      onClick={() => onChange({ icon: `${ICON_PREFIX}${n}`, mau: value.mau })}
                      className={`flex h-9 items-center justify-center rounded-lg ${chosen === n ? 'text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                      style={chosen === n ? { background: APP_COLORS[color] } : undefined}>
                      <Glyph name={n} className="h-[18px] w-[18px]" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Input className="min-w-0 flex-1" value={custom && !value.icon!.startsWith('data:') ? value.icon! : ''} placeholder={custom && value.icon!.startsWith('data:') ? '✓' : t.imageUrlPh}
              aria-label={t.imageUrl} onChange={(e) => onChange({ icon: e.target.value || null, mau: value.mau })} />
            <label className="cursor-pointer whitespace-nowrap rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              {t.upload}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon" hidden onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            {custom && <Button onClick={() => onChange({ icon: null, mau: value.mau })}>✕</Button>}
          </div>
          <span className="text-xs text-slate-500">{t.imageHint}</span>
        </div>
      )}
    </div>
  );
}
