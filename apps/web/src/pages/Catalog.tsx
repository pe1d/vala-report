import { Link } from 'react-router-dom';
import { api, type ReportDef } from '../api';
import { useAsync } from '../hooks';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, PageTitle } from '../components/ui';

/** Màn hình 3 — Danh mục báo cáo. Thay cho ô chat: người dùng chọn báo cáo có sẵn. */
export function CatalogPage() {
  const list = useAsync(() => api.get<ReportDef[]>('/reports'), []);
  return (
    <>
      <PageTitle title="Báo cáo" subtitle="Chọn một báo cáo để xem, xuất Excel hoặc đặt lịch chạy." />
      {list.loading && <Loading />}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.data && !list.data.length && <Empty>Chưa có báo cáo nào dành cho bạn.</Empty>}
      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        {list.data?.map((r) => (
          <Link key={r.code} to={`/bao-cao/${r.code}`}
            className="block rounded-lg border border-slate-200 bg-white p-4 text-inherit no-underline transition-colors hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500">
            <div className="flex items-start gap-3">
              <strong className="flex-1">{r.ten}</strong>
              {r.required_scope !== 'ca_nhan' && <Badge tone="neutral">Cấp đơn vị</Badge>}
            </div>
            <p className="my-2 text-slate-500 dark:text-slate-400">{r.mo_ta}</p>
            {r.requires_grant && <Badge tone="warn">Cần kết nối {r.source_ten ?? r.source_system}</Badge>}
          </Link>
        ))}
      </div>
    </>
  );
}
