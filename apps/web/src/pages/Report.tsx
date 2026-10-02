import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, auth, fmtDate, fmtDateTime, ApiProblem, type ReportDef, type ReportResult, type Scope } from '../api';
import { BASE } from '../base';
import { useAsync } from '../hooks';
import { ChartView } from '../components/Charts';
import { StatTiles } from '../components/StatTiles';
import { DataTable } from '../components/DataTable';
import { FreshnessBar } from '../components/Freshness';
import { ParamForm } from '../components/ParamForm';
import { AutoRefreshBar, useAutoRefresh } from '../components/AutoRefresh';
import { DataSourceBar } from '../components/DataSource';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Pager, SearchBox } from '../components/TableTools';
import { Button, Card, Muted, PageTitle, TextLink } from '../components/ui';


/** Màn hình 4 — Xem báo cáo: tham số, phạm vi, bảng, biểu đồ, độ tươi, xuất file, đặt lịch. */
export function ReportPage() {
  const { code = '' } = useParams();
  const catalog = useAsync(() => api.get<ReportDef[]>('/reports'), []);
  const def = catalog.data?.find((r) => r.code === code);
  const unitOnly = def ? def.required_scope !== 'ca_nhan' : false;
  const [params, setParams] = useState<Record<string, unknown> | null>(null);
  const [scope, setScope] = useState<Scope>('ca_nhan');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [q, setQ] = useState('');
  const [result, setResult] = useState<{ data?: ReportResult; error?: unknown; loading: boolean }>({ loading: false });
  const [srcVer, setSrcVer] = useState(0);

  useEffect(() => {
    if (def && params === null) { setParams({ ...def.default_params }); setScope(unitOnly ? 'don_vi' : 'ca_nhan'); }
  }, [def, params, unitOnly]);

  /** Tìm trong bảng và phân trang chạy trên máy chủ ⇒ tìm được trên toàn bộ dữ liệu, không chỉ trang đang xem. */
  const run = (p = page, opts: { q?: string; size?: number } = {}) => {
    if (!params) return;
    setResult((r) => ({ ...r, loading: true, error: undefined }));
    api.post<ReportResult>(`/reports/${code}/preview`, { params, scope, page: p, page_size: opts.size ?? pageSize, q: (opts.q ?? q) || undefined })
      .then((data) => setResult({ data, loading: false }), (error) => setResult({ error, loading: false }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (params) run(1); }, [params === null, scope]);
  // Mở báo cáo ⇒ dữ liệu cũ hơn 15 phút thì tự lấy lại; xong thì chạy lại báo cáo (giữ trang, bộ lọc đang xem).
  const auto = useAutoRefresh(def ? [code] : undefined, () => { run(); setSrcVer((v) => v + 1); });

  const exportXlsx = async () => {
    const res = await fetch(`${BASE}/api/v1/reports/${code}/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.get()}` },
      body: JSON.stringify({ params, scope, format: 'xlsx', q: q || undefined }),
    });
    if (!res.ok) { const p = await res.json(); setResult((r) => ({ ...r, error: new ApiProblem(p.type, res.status, p.title, p.detail) })); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `${code}.xlsx` });
    a.click(); URL.revokeObjectURL(url);
  };

  if (catalog.loading) return <Loading />;
  if (catalog.error) return <ErrorBox error={catalog.error} onRetry={catalog.reload} />;
  if (!def) return <Empty>Không tìm thấy báo cáo. <TextLink to="/bao-cao">Quay lại danh mục</TextLink></Empty>;

  const d = result.data;
  const go = (p: number) => { setPage(p); run(p); };
  const search = (v: string) => { setQ(v); setPage(1); run(1, { q: v }); };
  const resize = (n: number) => { setPageSize(n); setPage(1); run(1, { size: n }); };
  return (
    <>
      <div className="text-slate-500 dark:text-slate-400"><TextLink to="/bao-cao">Báo cáo</TextLink> / {def.ten}</div>
      <PageTitle title={def.ten} subtitle={def.mo_ta} />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          {params && <ParamForm code={def.code} props={def.param_schema.properties} value={params} onChange={setParams} />}
          <Button variant="primary" onClick={() => go(1)}>Xem báo cáo</Button>
          <span className="flex-1" />
          <Button disabled={!d} onClick={() => void exportXlsx()}>Xuất Excel</Button>
        </div>
        {d?.applied?.tu_ngay ? <Muted className="mt-3">Khoảng dữ liệu: {fmtDate(d.applied.tu_ngay)} – {fmtDate(d.applied.den_ngay)}</Muted> : null}
        {d?.applied?.ngay ? <Muted className="mt-3">Ngày: {fmtDate(d.applied.ngay)}</Muted> : null}
        <DataSourceBar reportCode={code} version={srcVer} />
        <AutoRefreshBar st={auto} className="mt-2" />
      </Card>


      {result.error ? <ErrorBox error={result.error} onRetry={() => run()} /> : null}
      {result.loading && !d && <Loading rows={6} />}
      {d && (
        <div className={result.loading ? 'opacity-60' : ''}>
          <FreshnessBar f={d.freshness} />
          {d.tiles?.length ? <StatTiles tiles={d.tiles} /> : null}
          {d.charts?.map((c) => <ChartView key={c.title} chart={c} rows={d.chart_rows ?? d.rows} />)}
          {d.columns.length > 0 && (d.rows.length > 0 || q) && (
            <div className="mb-3 mt-4 flex flex-wrap items-center gap-3">
              <SearchBox value={q} onChange={search} placeholder="Tìm trong bảng (mọi cột)…" />
              {q && <Muted className="text-sm">Đang lọc theo “{q}” — thẻ số liệu và biểu đồ vẫn tính trên toàn bộ.</Muted>}
            </div>
          )}
          {d.rows.length === 0
            ? (q
              ? <Empty>Không có dòng nào khớp “{q}”. <button type="button" className="text-blue-700 underline dark:text-blue-400" onClick={() => search('')}>Xoá tìm kiếm</button></Empty>
              : <Empty>{d.freshness.last_success_at
                ? <>Không có bản ghi nào khớp điều kiện của báo cáo trong khoảng đã chọn. Dữ liệu vẫn cập nhật bình thường (lần cuối {fmtDateTime(d.freshness.last_success_at)}) — thử đổi khoảng thời gian hoặc bộ lọc.</>
                : <>Chưa có dữ liệu — hệ thống chưa lấy được dữ liệu lần nào, xem dòng trạng thái ở trên.</>}</Empty>)
            : <DataTable columns={d.columns} rows={d.rows} />}
          {d.rows.length > 0 && <Pager page={page} pageSize={pageSize} total={d.total_rows} onPage={go} onPageSize={resize} />}
        </div>
      )}
    </>
  );
}
