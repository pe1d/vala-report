import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ReportDef } from '../api';
import { useAsync } from '../hooks';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, PageTitle, TextLink } from '../components/ui';
import { GroupChips, GroupSection, NoMatch, SearchBox, groupRows, useTableView } from '../components/TableTools';

/**
 * Màn hình 3 — Danh mục báo cáo, nhóm theo hệ thống nguồn. Thay cho ô chat: người dùng chọn báo cáo có sẵn.
 * Hệ thống chưa kết nối ⇒ nhắc một lần ở đầu nhóm (thay vì gắn nhãn trên từng thẻ).
 */
export function CatalogPage() {
  const list = useAsync(() => api.get<ReportDef[]>('/reports'), []);
  const [src, setSrc] = useState('');
  const srcTen = (r: ReportDef) => r.source_ten ?? r.source_system;
  // Tìm kiếm trên toàn bộ; không cắt trang (danh mục đã chia nhóm).
  const tv = useTableView(list.data, (r) => `${r.ten} ${r.mo_ta ?? ''} ${srcTen(r)}`, 10_000);
  const groups = groupRows([...tv.rows].sort((a, b) => a.ten.localeCompare(b.ten, 'vi')), (r) => r.source_system, srcTen);
  const shown = groups.filter((g) => !src || g.key === src);
  return (
    <>
      <PageTitle title="Báo cáo" subtitle="Chọn một báo cáo để xem, xuất Excel hoặc đặt lịch chạy." />
      {list.loading && <Loading />}
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.data && !list.data.length && <Empty>Chưa có báo cáo nào dành cho bạn.</Empty>}
      {!!list.data?.length && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <SearchBox value={tv.q} onChange={tv.setQ} delay={0} placeholder="Tìm báo cáo…" label="Tìm báo cáo" />
          <GroupChips groups={groups.map((g) => ({ key: g.key, label: g.label, n: g.rows.length }))} value={src} onChange={setSrc} />
        </div>
      )}
      {!!list.data?.length && !tv.total && <NoMatch q={tv.q} onClear={() => tv.setQ('')} />}
      {shown.map((g) => {
        const needGrant = g.rows.some((r) => r.requires_grant);
        return (
          <GroupSection key={g.key} id={`bao-cao-${g.key}`} title={g.label} count={g.rows.length} unit="báo cáo"
            extra={needGrant && <><Badge tone="warn">Chưa kết nối</Badge><TextLink to={`/uy-quyen?ket-noi=${g.key}`}>Kết nối {g.label}</TextLink></>}>
            <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
              {g.rows.map((r) => (
                <Link key={r.code} to={`/bao-cao/${r.code}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 text-inherit no-underline transition-colors hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500">
                  <div className="flex items-start gap-3">
                    <strong className="flex-1">{r.ten}</strong>
                    {r.required_scope !== 'ca_nhan' && <Badge tone="neutral">Cấp đơn vị</Badge>}
                  </div>
                  {r.mo_ta && <p className="mt-2 text-slate-500 dark:text-slate-400">{r.mo_ta}</p>}
                </Link>
              ))}
            </div>
          </GroupSection>
        );
      })}
    </>
  );
}
