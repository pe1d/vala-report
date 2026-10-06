import { useEffect, useRef, useState } from 'react';
import { api, fmtDateTime } from '../api';
import { BrandMark, applyBranding, brandVars, useBranding, useSetBranding, type Branding } from '../branding';
import { ErrorBox, Loading } from '../components/States';
import { Banner, Button, Card, Field, Input, Muted, PageTitle } from '../components/ui';
import { useAsync } from '../hooks';
import { messages, useT } from '../i18n';

/** Ảnh gốc tối đa ~300 KB (data URL base64 dài hơn ~4/3, máy chủ chặn ở 400 000 ký tự). */
const LOGO_MAX_BYTES = 300 * 1024;
const PRESETS = [
  ['#1d4ed8', 'blue'], ['#0f766e', 'teal'], ['#15803d', 'green'], ['#b91c1c', 'red'],
  ['#c2410c', 'orange'], ['#7e22ce', 'purple'], ['#334155', 'slate'],
] as const;

const M = messages({
  color: { blue: 'Xanh dương', teal: 'Xanh ngọc', green: 'Xanh lá', red: 'Đỏ', orange: 'Cam', purple: 'Tím', slate: 'Xám đậm' },
  badType: 'Chỉ nhận ảnh PNG, JPEG, SVG hoặc WebP.',
  tooBig: (kb: number) => `Ảnh lớn hơn 300 KB (${kb} KB) — hãy thu nhỏ trước.`,
  saved: 'Đã lưu. Mọi người sẽ thấy ngay khi tải lại trang.',
  title: 'Cấu hình chung',
  subtitle: 'Tên, logo và màu của đơn vị triển khai — hiện ở thanh trên cùng, trang đăng nhập, tiêu đề tab trình duyệt.',
  appName: 'Tên ứng dụng', org: 'Tên đơn vị (không bắt buộc)', orgPh: 'vd Sở Thông tin và Truyền thông tỉnh …',
  tagline: 'Dòng mô tả dưới tên (không bắt buộc)', taglinePh: 'Báo cáo tự động từ các hệ thống nguồn',
  logo: 'Logo', pickImage: 'Chọn ảnh…', removeLogo: 'Bỏ logo',
  logoHint: 'PNG/SVG nền trong suốt, vuông, tối đa 300 KB. Không có logo ⇒ dùng chữ cái đầu của tên ứng dụng trên nền màu chủ đạo.',
  primary: 'Màu chủ đạo', pickColor: 'Chọn màu', colorCode: 'Mã màu',
  colorHint: 'Dùng cho nút chính, đường dẫn, mục đang chọn. Đang xem trước trên chính trang này — chưa lưu thì không ai khác thấy.',
  ssoName: 'Tên hiển thị của SSO',
  ssoHint: 'Hiện trên nút "Đăng nhập bằng …" và các thông báo uỷ quyền, vd "SSO tỉnh", "Bkav SSO". Việc bật SSO và địa chỉ SSO vẫn cấu hình ở máy chủ (.env.prod).',
  lastEdited: (d: string) => `Sửa lần cuối ${d}`, discard: 'Huỷ thay đổi', saving: 'Đang lưu…', save: 'Lưu cấu hình',
  preview: 'Xem trước', defaultTagline: 'Báo cáo tự động từ các hệ thống nguồn',
  signIn: 'Đăng nhập', orSso: (sso: string) => `Hoặc đăng nhập bằng ${sso}`,
}, {
  color: { blue: 'Blue', teal: 'Teal', green: 'Green', red: 'Red', orange: 'Orange', purple: 'Purple', slate: 'Dark gray' },
  badType: 'Only PNG, JPEG, SVG or WebP images are accepted.',
  tooBig: (kb: number) => `The image is larger than 300 KB (${kb} KB) — please shrink it first.`,
  saved: 'Saved. Everyone will see it as soon as they reload the page.',
  title: 'General settings',
  subtitle: 'Name, logo and color of the deploying organization — shown in the top bar, on the sign-in page and in the browser tab title.',
  appName: 'App name', org: 'Organization name (optional)', orgPh: 'e.g. Provincial Department of Information and Communications …',
  tagline: 'Tagline under the name (optional)', taglinePh: 'Automated reports from source systems',
  logo: 'Logo', pickImage: 'Choose image…', removeLogo: 'Remove logo',
  logoHint: 'Square PNG/SVG with a transparent background, up to 300 KB. Without a logo, the first letter of the app name is shown on the primary color.',
  primary: 'Primary color', pickColor: 'Pick a color', colorCode: 'Color code',
  colorHint: 'Used for primary buttons, links and selected items. Previewing on this page only — nobody else sees it until you save.',
  ssoName: 'SSO display name',
  ssoHint: 'Shown on the "Sign in with …" button and in authorization messages, e.g. "Provincial SSO", "Bkav SSO". Enabling SSO and its address are still configured on the server (.env.prod).',
  lastEdited: (d: string) => `Last edited ${d}`, discard: 'Discard changes', saving: 'Saving…', save: 'Save settings',
  preview: 'Preview', defaultTagline: 'Automated reports from source systems',
  signIn: 'Sign in', orSso: (sso: string) => `Or sign in with ${sso}`,
});

/**
 * Quản trị → Cấu hình chung: nhận diện của đơn vị triển khai (tên ứng dụng, tên đơn vị, dòng mô tả, logo, màu chủ đạo,
 * tên hiển thị của SSO). Không gắn cứng với Bkav — mỗi nơi triển khai tự đặt. Xem trước ngay trên trang, lưu xong áp
 * cho mọi người (kể cả trang đăng nhập).
 */
export function AdminSettingsPage() {
  const t = useT(M);
  const cur = useAsync(() => api.get<Branding & { updated_at: string }>('/admin/settings'), []);
  const live = useBranding();
  const setBranding = useSetBranding();
  const [f, setF] = useState<Branding | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (cur.data && !f) setF(cur.data); }, [cur.data, f]);
  // Rời trang khi chưa lưu ⇒ trả lại màu/tiêu đề đang dùng (xem trước chỉ là tạm). Đọc qua ref để lấy bản MỚI NHẤT
  // (vừa lưu xong thì là bản đã lưu), không phải bản lúc mở trang.
  const liveRef = useRef(live);
  liveRef.current = live;
  useEffect(() => () => applyBranding(liveRef.current), []);

  if (cur.loading && !f) return <Loading />;
  if (cur.error) return <ErrorBox error={cur.error} onRetry={cur.reload} />;
  if (!f) return null;
  const up = (p: Partial<Branding>) => { const n = { ...f, ...p }; setF(n); setNote(null); if (p.mau_chu_dao) applyBranding(n); };
  const dirty = FIELDS.some((k) => (f[k] ?? null) !== (live[k] ?? null));

  const onLogo = (file: File | undefined) => {
    setErr(null);
    if (!file) return;
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) { setErr(new Error(t.badType)); return; }
    if (file.size > LOGO_MAX_BYTES) { setErr(new Error(t.tooBig(Math.round(file.size / 1024)))); return; }
    const r = new FileReader();
    r.onload = () => up({ logo: String(r.result) });
    r.readAsDataURL(file);
  };
  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const n = await api.put<Branding>('/admin/settings', {
        ten_ung_dung: f.ten_ung_dung, ten_don_vi: f.ten_don_vi, mo_ta: f.mo_ta, logo: f.logo, mau_chu_dao: f.mau_chu_dao, ten_sso: f.ten_sso,
      });
      setBranding(n); setF(n); setNote(t.saved);
    } catch (e) { setErr(e); } finally { setSaving(false); }
  };

  return (
    <>
      <PageTitle title={t.title} subtitle={t.subtitle} />
      {note && <Banner tone="ok">{note}</Banner>}
      {err ? <ErrorBox error={err} /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <div className="grid gap-4">
            <Field label={t.appName}>
              <Input value={f.ten_ung_dung} maxLength={60} onChange={(e) => up({ ten_ung_dung: e.target.value })} placeholder="Vala Reporting" />
            </Field>
            <Field label={t.org}>
              <Input value={f.ten_don_vi ?? ''} maxLength={120} onChange={(e) => up({ ten_don_vi: e.target.value || null })} placeholder={t.orgPh} />
            </Field>
            <Field label={t.tagline}>
              <Input value={f.mo_ta ?? ''} maxLength={160} onChange={(e) => up({ mo_ta: e.target.value || null })} placeholder={t.taglinePh} />
            </Field>

            <div>
              <div className="mb-1 text-sm font-medium">{t.logo}</div>
              <div className="flex flex-wrap items-center gap-3">
                <BrandMark b={f} size={48} />
                <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3.5 py-1.5 font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
                  {t.pickImage}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" onChange={(e) => { onLogo(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {f.logo && <Button variant="danger" onClick={() => up({ logo: null })}>{t.removeLogo}</Button>}
              </div>
              <Muted className="mt-1 text-xs">{t.logoHint}</Muted>
            </div>

            <div>
              <div className="mb-1 text-sm font-medium">{t.primary}</div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="color" aria-label={t.pickColor} value={f.mau_chu_dao} onChange={(e) => up({ mau_chu_dao: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900" />
                <Input aria-label={t.colorCode} className="!min-w-0 w-28 font-mono" value={f.mau_chu_dao}
                  onChange={(e) => { const v = e.target.value.trim(); setF({ ...f, mau_chu_dao: v }); if (/^#[0-9a-f]{6}$/i.test(v)) up({ mau_chu_dao: v }); }} />
                {PRESETS.map(([c, key]) => (
                  <button key={c} type="button" title={t.color[key]} aria-label={t.color[key]} onClick={() => up({ mau_chu_dao: c })}
                    className={`h-7 w-7 rounded-full border-2 ${f.mau_chu_dao.toLowerCase() === c ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
              <Muted className="mt-1 text-xs">{t.colorHint}</Muted>
            </div>

            <Field label={t.ssoName}>
              <Input value={f.ten_sso} maxLength={40} onChange={(e) => up({ ten_sso: e.target.value })} placeholder="SSO" />
            </Field>
            <Muted className="-mt-2 text-xs">{t.ssoHint}</Muted>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            {cur.data?.updated_at && <Muted className="mr-auto text-xs">{t.lastEdited(fmtDateTime(cur.data.updated_at))}</Muted>}
            <Button disabled={saving || !dirty} onClick={() => { setF(live); applyBranding(live); setErr(null); }}>{t.discard}</Button>
            <Button variant="primary" disabled={saving || !dirty || !f.ten_ung_dung.trim() || !f.ten_sso.trim() || !/^#[0-9a-f]{6}$/i.test(f.mau_chu_dao)} onClick={() => void save()}>
              {saving ? t.saving : t.save}
            </Button>
          </div>
        </Card>

        <Preview b={f} />
      </div>
    </>
  );
}

/** Xem trước thanh trên cùng + trang đăng nhập với cấu hình đang sửa. */
function Preview({ b }: { b: Branding }) {
  const t = useT(M);
  const vars = brandVars(b.mau_chu_dao) as React.CSSProperties;
  return (
    <div className="grid content-start gap-3" style={vars}>
      <Muted className="text-xs uppercase tracking-wide">{t.preview}</Muted>
      <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <BrandMark b={b} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-semibold">{b.ten_ung_dung || '—'}</span>
          <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{b.mo_ta ?? b.ten_don_vi ?? t.defaultTagline}</span>
        </span>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2.5">
          <BrandMark b={b} size={36} />
          <div className="min-w-0">
            <div className="truncate text-lg font-bold leading-tight">{b.ten_ung_dung || '—'}</div>
            {b.ten_don_vi && <div className="truncate text-xs text-slate-600 dark:text-slate-300">{b.ten_don_vi}</div>}
          </div>
        </div>
        <div className="mb-2 h-8 rounded-md border border-slate-300 dark:border-slate-700" />
        <div className="mb-3 h-8 rounded-md border border-slate-300 dark:border-slate-700" />
        <div className="rounded-md bg-blue-700 py-1.5 text-center text-sm font-medium text-white dark:bg-blue-400 dark:text-slate-950">{t.signIn}</div>
        <div className="mt-2 text-center text-xs text-blue-700 dark:text-blue-400">{t.orSso(b.ten_sso || 'SSO')}</div>
      </div>
    </div>
  );
}

/** Các trường của form — dùng để biết đã sửa chưa. */
const FIELDS = ['ten_ung_dung', 'ten_don_vi', 'mo_ta', 'logo', 'mau_chu_dao', 'ten_sso'] as const;
