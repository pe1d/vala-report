import { useEffect, useState } from 'react';
import { BASE } from '../base';
import { BrandMark, useBranding } from '../branding';
import { locale, messages, useLang, useT } from '../i18n';
import { AnchorButton, Badge, Card, LangToggle, Muted, ThemeToggle } from '../components/ui';

/**
 * Trang tải Vala Desktop — công khai (không cần đăng nhập), ở {cổng}/desktop. Bản cài do máy chủ phục vụ ở cùng thư mục
 * /desktop/ (deploy/publish-desktop.sh): đọc latest.yml (Windows) / latest-linux.yml (Ubuntu) để hiện phiên bản, dung
 * lượng; nút tải trỏ liên kết cố định (vala-desktop-setup.exe / vala-desktop.deb) luôn là bản mới nhất.
 */
const M = messages({
  title: 'Tải Vala Desktop',
  intro: 'Ứng dụng làm việc của Vala: mở Vala, báo cáo và các hệ thống nguồn (eGov, eTask…) trong một cửa sổ, giữ phiên đăng nhập để Vala lấy dữ liệu thay bạn. Ứng dụng tự cập nhật khi có bản mới.',
  forYou: 'Dành cho máy của bạn',
  version: (v: string) => `Phiên bản ${v}`,
  size: (mb: string) => `${mb} MB`,
  released: (d: string) => `phát hành ${d}`,
  download: (os: string) => `Tải cho ${os}`,
  loading: 'Đang kiểm tra bản mới nhất…',
  none: 'Chưa có bản phát hành cho hệ điều hành này.',
  howTo: 'Cách cài',
  winSteps: [
    'Mở file vala-desktop-setup.exe vừa tải.',
    'Windows có thể báo "Windows protected your PC" (bộ cài chưa ký số) — bấm "More info" rồi "Run anyway".',
    'Cài xong, mở Vala Desktop và đăng nhập tài khoản cổng báo cáo trong cửa sổ Cài đặt.',
  ],
  ubuntuSteps: [
    'Cần quyền quản trị máy (sudo). Mở Terminal tại thư mục vừa tải về rồi chạy:',
    'Mở Vala Desktop từ menu ứng dụng, đăng nhập tài khoản cổng báo cáo trong cửa sổ Cài đặt.',
    'Khi có bản mới, bấm "Cập nhật" trên thanh tab — Ubuntu sẽ hỏi mật khẩu quản trị.',
  ],
  requirements: { win: 'Windows 10 / 11, 64-bit', ubuntu: 'Ubuntu 22.04 / 24.04, 64-bit' },
  autoUpdate: 'Tự cập nhật',
  backToPortal: 'Về cổng báo cáo',
}, {
  title: 'Download Vala Desktop',
  intro: 'The Vala work app: open Vala, reports and your source systems (eGov, eTask…) in one window, and keep your sign-in sessions so Vala can fetch data for you. The app updates itself when a new version is out.',
  forYou: 'For your computer',
  version: (v: string) => `Version ${v}`,
  size: (mb: string) => `${mb} MB`,
  released: (d: string) => `released ${d}`,
  download: (os: string) => `Download for ${os}`,
  loading: 'Checking the latest version…',
  none: 'No release for this operating system yet.',
  howTo: 'How to install',
  winSteps: [
    'Open the downloaded vala-desktop-setup.exe.',
    'Windows may show "Windows protected your PC" (the installer is not signed yet) — click "More info", then "Run anyway".',
    'After installing, open Vala Desktop and sign in with your reporting portal account in the Settings window.',
  ],
  ubuntuSteps: [
    'Requires administrator rights (sudo). Open a Terminal in the download folder and run:',
    'Open Vala Desktop from the application menu and sign in with your reporting portal account in the Settings window.',
    'When a new version is out, click "Update" on the tab bar — Ubuntu will ask for an administrator password.',
  ],
  requirements: { win: 'Windows 10 / 11, 64-bit', ubuntu: 'Ubuntu 22.04 / 24.04, 64-bit' },
  autoUpdate: 'Auto-update',
  backToPortal: 'Back to the reporting portal',
});

type OsKey = 'win' | 'ubuntu';
interface Release { version: string; size: number | null; date: string | null }

const PLATFORMS: Array<{ key: OsKey; name: string; yml: string; file: string }> = [
  { key: 'win', name: 'Windows', yml: 'latest.yml', file: 'vala-desktop-setup.exe' },
  { key: 'ubuntu', name: 'Ubuntu', yml: 'latest-linux.yml', file: 'vala-desktop.deb' },
];

/** Đọc vài trường cần hiện từ latest*.yml (YAML phẳng do electron-builder sinh — không cần thư viện YAML). */
function parseLatest(text: string): Release | null {
  const version = /^version:\s*(\S+)/m.exec(text)?.[1];
  if (!version) return null;
  const size = Number(/^\s+size:\s*(\d+)/m.exec(text)?.[1]);
  const date = /^releaseDate:\s*'?([^'\n]+)'?/m.exec(text)?.[1] ?? null;
  return { version, size: Number.isFinite(size) && size > 0 ? size : null, date };
}

function detectOs(): OsKey | null {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'win';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'ubuntu';
  return null;
}

export function DesktopDownloadPage() {
  const t = useT(M);
  const lang = useLang();
  const brand = useBranding();
  const [releases, setReleases] = useState<Partial<Record<OsKey, Release | null>>>({});
  const mine = detectOs();

  useEffect(() => {
    for (const p of PLATFORMS) {
      fetch(`${BASE}/desktop/${p.yml}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.text() : ''))
        .then((text) => setReleases((cur) => ({ ...cur, [p.key]: parseLatest(text) })))
        .catch(() => setReleases((cur) => ({ ...cur, [p.key]: null })));
    }
  }, []);

  // Máy đang dùng lên trước.
  const ordered = [...PLATFORMS].sort((a, b) => Number(b.key === mine) - Number(a.key === mine));
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale(lang)) : '');

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark b={brand} size={44} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">{t.title}</h1>
            {brand.ten_don_vi && <div className="text-sm text-slate-600 dark:text-slate-300">{brand.ten_don_vi}</div>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2"><LangToggle /><ThemeToggle /></div>
      </div>
      <p className="mb-8 text-slate-600 dark:text-slate-300">{t.intro}</p>

      <div className="grid gap-4">
        {ordered.map((p) => {
          const rel = releases[p.key];
          const steps = p.key === 'win' ? t.winSteps : t.ubuntuSteps;
          return (
            <Card key={p.key} className={p.key === mine ? 'ring-2 ring-blue-600 dark:ring-blue-400' : undefined}>
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{p.name}</h2>
                    {p.key === mine && <Badge tone="info">{t.forYou}</Badge>}
                    <Badge tone="ok">{t.autoUpdate}</Badge>
                  </div>
                  <Muted className="mt-1 text-sm">{t.requirements[p.key]}</Muted>
                  <div className="mt-1 text-sm tabular-nums text-slate-600 dark:text-slate-300">
                    {rel === undefined ? t.loading
                      : rel === null ? t.none
                        : [t.version(rel.version), rel.size ? t.size((rel.size / 1048576).toFixed(0)) : '', rel.date ? t.released(fmtDate(rel.date)) : '']
                          .filter(Boolean).join(' · ')}
                  </div>
                </div>
                {rel && (
                  <AnchorButton variant={p.key === mine ? 'primary' : 'default'} href={`${BASE}/desktop/${p.file}`} download className="px-5 py-2.5">
                    {t.download(p.name)}
                  </AnchorButton>
                )}
              </div>
              {rel && (
                <div className="mt-4 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
                  <div className="mb-1 font-medium">{t.howTo}</div>
                  <ol className="list-decimal space-y-1 pl-5 text-slate-600 dark:text-slate-300">
                    {steps.map((s, i) => (
                      <li key={i}>
                        {s}
                        {p.key === 'ubuntu' && i === 0 && (
                          <code className="mt-1 block rounded bg-slate-100 px-2 py-1 font-mono text-[13px] text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                            sudo apt install ./vala-desktop.deb
                          </code>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-8 text-center">
        <a href={`${BASE}/`} className="text-sm text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">{t.backToPortal}</a>
      </div>
    </div>
  );
}
