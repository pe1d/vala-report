import { Fragment, useState } from 'react';
import { api, fmtDateTime } from '@vala/ui/api';
import { useAsync } from '@vala/ui/hooks';
import { Empty, ErrorBox, Loading } from '@vala/ui/States';
import { Badge, Button, Muted, PageTitle, Select, Table, Td, Th, type Tone } from '@vala/ui/ui';
import { messages, useT } from '@vala/ui/i18n';

/**
 * Quản trị hệ thống → Lỗi Desktop: lỗi / crash Vala Desktop tự gửi về (người dùng chốt 08/10/2026 — tự gửi, tắt được trong
 * Cài đặt của app). Lỗi giống nhau gom một dòng, đếm số lần; xem chi tiết, tải minidump của crash, xoá khi đã xử lý.
 */
type Loai = 'crash' | 'loi_chinh' | 'loi_trang' | 'trang_chet' | 'tien_trinh_chet' | 'trang_treo' | 'cap_nhat' | 'kich_ban';
interface Loi {
  id: number; loai: Loai; phien_ban: string; he_dieu_hanh: string; thong_bao: string; so_lan: number;
  lan_dau: string; lan_cuoi: string; tenant: string | null; tenant_ten: string | null; dump_bytes: number | null;
}
interface ChiTiet extends Loi { stack: string | null; ngu_canh: Record<string, string>; nguoi: { ho_ten: string; email: string } | null }

const M = messages({
  title: 'Lỗi Desktop',
  subtitle: 'Lỗi và crash Vala Desktop tự gửi về (người dùng tắt được trong Cài đặt của app). Lỗi giống nhau gom một dòng. Không có nội dung trang, mật khẩu hay cookie.',
  allKinds: 'Mọi loại', allVersions: 'Mọi phiên bản', empty: 'Chưa có lỗi nào được gửi về.',
  thKind: 'Loại', thMessage: 'Lỗi', thVersion: 'Phiên bản', thCount: 'Số lần', thLast: 'Lần cuối', thOrg: 'Đơn vị',
  loai: {
    crash: 'Crash', loi_chinh: 'Lỗi tiến trình chính', loi_trang: 'Lỗi trang của app', trang_chet: 'Trang bị đóng đột ngột',
    tien_trinh_chet: 'Tiến trình con dừng', trang_treo: 'Trang không phản hồi', cap_nhat: 'Lỗi cập nhật', kich_ban: 'Lỗi kịch bản',
  } as Record<Loai, string>,
  back: 'Quay lại danh sách', first: 'Lần đầu', last: 'Lần cuối', os: 'Hệ điều hành', who: 'Người gặp gần nhất',
  stack: 'Stack', context: 'Ngữ cảnh', dump: 'Tải minidump', resolved: 'Đã xử lý (xoá)', resolvedConfirm: 'Xoá lỗi này khỏi danh sách?',
}, {
  title: 'Desktop errors',
  subtitle: 'Errors and crashes Vala Desktop sends automatically (users can turn this off in the app settings). Identical errors are grouped. No page content, passwords or cookies.',
  allKinds: 'All kinds', allVersions: 'All versions', empty: 'No errors have been reported yet.',
  thKind: 'Kind', thMessage: 'Error', thVersion: 'Version', thCount: 'Count', thLast: 'Last seen', thOrg: 'Organization',
  loai: {
    crash: 'Crash', loi_chinh: 'Main process error', loi_trang: 'App page error', trang_chet: 'Page closed unexpectedly',
    tien_trinh_chet: 'Child process stopped', trang_treo: 'Page not responding', cap_nhat: 'Update error', kich_ban: 'Script error',
  } as Record<Loai, string>,
  back: 'Back to the list', first: 'First seen', last: 'Last seen', os: 'Operating system', who: 'Last seen by',
  stack: 'Stack', context: 'Context', dump: 'Download minidump', resolved: 'Resolved (delete)', resolvedConfirm: 'Delete this error from the list?',
});

const TONE: Record<Loai, Tone> = {
  crash: 'err', loi_chinh: 'err', loi_trang: 'warn', trang_chet: 'warn', tien_trinh_chet: 'warn', trang_treo: 'warn', cap_nhat: 'info', kich_ban: 'neutral',
};

function Detail({ id, onBack, onDeleted }: { id: number; onBack: () => void; onDeleted: () => void }) {
  const t = useT(M);
  const d = useAsync(() => api.get<ChiTiet>(`/system/desktop-errors/${id}`), [id]);
  const dump = async () => {
    const r = await api.get<{ ten: string; base64: string }>(`/system/desktop-errors/${id}/dump`);
    const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    a.download = r.ten;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  const del = async () => { if (!confirm(t.resolvedConfirm)) return; await api.del(`/system/desktop-errors/${id}`); onDeleted(); };
  if (d.error) return <ErrorBox error={d.error} onRetry={d.reload} />;
  if (!d.data) return <Loading />;
  const e = d.data;
  const row = (label: string, v: string) => (
    <div><div className="text-xs text-slate-500 dark:text-slate-400">{label}</div><div className="text-sm">{v}</div></div>
  );
  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 text-sm text-blue-700 hover:underline dark:text-blue-400">← {t.back}</button>
      <div className="flex flex-wrap items-center gap-2"><Badge tone={TONE[e.loai]}>{t.loai[e.loai]}</Badge><span className="text-sm text-slate-500">×{e.so_lan}</span></div>
      <h2 className="mt-2 text-base font-semibold">{e.thong_bao}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {row(t.thVersion, e.phien_ban)}{row(t.os, e.he_dieu_hanh)}{row(t.thOrg, e.tenant_ten ?? e.tenant ?? '—')}
        {row(t.first, fmtDateTime(e.lan_dau))}{row(t.last, fmtDateTime(e.lan_cuoi))}
        {row(t.who, e.nguoi ? `${e.nguoi.ho_ten} (${e.nguoi.email})` : '—')}
      </div>
      {e.stack && (<><h3 className="mt-5 text-sm font-semibold">{t.stack}</h3>
        <pre className="mt-1 max-h-80 overflow-auto rounded-md bg-slate-50 p-3 text-xs dark:bg-slate-900">{e.stack}</pre></>)}
      {Object.keys(e.ngu_canh).length > 0 && (<><h3 className="mt-5 text-sm font-semibold">{t.context}</h3>
        <dl className="mt-1 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
          {Object.entries(e.ngu_canh).map(([k, v]) => <Fragment key={k}><dt className="font-mono text-slate-500">{k}</dt><dd className="break-all font-mono">{v}</dd></Fragment>)}
        </dl></>)}
      <div className="mt-6 flex gap-2">
        {!!e.dump_bytes && <Button onClick={() => void dump()}>{t.dump} ({Math.ceil(e.dump_bytes / 1024)} KB)</Button>}
        <Button variant="danger" onClick={() => void del()}>{t.resolved}</Button>
      </div>
    </div>
  );
}

export function AdminDesktopErrorsPage() {
  const t = useT(M);
  const [loai, setLoai] = useState('');
  const [phienBan, setPhienBan] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const q = new URLSearchParams({ ...(loai ? { loai } : {}), ...(phienBan ? { phien_ban: phienBan } : {}) }).toString();
  const list = useAsync(() => api.get<{ loi: Loi[]; phien_ban: string[] }>(`/system/desktop-errors${q ? `?${q}` : ''}`), [q]);
  if (open !== null) return <div className="p-1"><Detail id={open} onBack={() => setOpen(null)} onDeleted={() => { setOpen(null); list.reload(); }} /></div>;
  return (
    <div>
      <PageTitle title={t.title} subtitle={t.subtitle} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={loai} onChange={(e) => setLoai(e.target.value)} aria-label={t.thKind}>
          <option value="">{t.allKinds}</option>
          {(Object.keys(t.loai) as Loai[]).map((k) => <option key={k} value={k}>{t.loai[k]}</option>)}
        </Select>
        <Select value={phienBan} onChange={(e) => setPhienBan(e.target.value)} aria-label={t.thVersion}>
          <option value="">{t.allVersions}</option>
          {list.data?.phien_ban.map((v) => <option key={v} value={v}>{v}</option>)}
        </Select>
      </div>
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.loi.length === 0 ? <Empty>{t.empty}</Empty> : (
        <Table>
          <thead><tr><Th>{t.thKind}</Th><Th>{t.thMessage}</Th><Th>{t.thVersion}</Th><Th num>{t.thCount}</Th><Th>{t.thLast}</Th><Th>{t.thOrg}</Th></tr></thead>
          <tbody>
            {list.data.loi.map((e) => (
              <tr key={e.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900" onClick={() => setOpen(e.id)}>
                <Td><Badge tone={TONE[e.loai]}>{t.loai[e.loai]}</Badge></Td>
                <Td><div className="line-clamp-2 max-w-xl text-sm">{e.thong_bao}</div><Muted className="text-xs">{e.he_dieu_hanh}</Muted></Td>
                <Td>{e.phien_ban}</Td><Td num>{e.so_lan}</Td><Td>{fmtDateTime(e.lan_cuoi)}</Td><Td>{e.tenant_ten ?? e.tenant ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
