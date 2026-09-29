import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, auth, fmtDate, ApiProblem, type ReportDef, type ReportResult, type Scope } from '../api';
import { useMe } from '../App';
import { useAsync } from '../hooks';
import { ChartView } from '../components/Charts';
import { StatTiles } from '../components/StatTiles';
import { DataTable } from '../components/DataTable';
import { FreshnessBar } from '../components/Freshness';
import { ParamForm } from '../components/ParamForm';
import { ScheduleForm } from '../components/ScheduleForm';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Banner, Button, Card, Field, Muted, PageTitle, Select, TextLink } from '../components/ui';

const PAGE_SIZE = 50;

/** Màn hình 4 — Xem báo cáo: tham số, phạm vi, bảng, biểu đồ, độ tươi, xuất file, đặt lịch. */
export function ReportPage() {
  const { code = '' } = useParams();
  const me = useMe();
  const catalog = useAsync(() => api.get<ReportDef[]>('/reports'), []);
  const def = catalog.data?.find((r) => r.code === code);
  const unitOnly = def ? def.required_scope !== 'ca_nhan' : false;
  const [params, setParams] = useState<Record<string, unknown> | null>(null);
  const [scope, setScope] = useState<Scope>('ca_nhan');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ data?: ReportResult; error?: unknown; loading: boolean }>({ loading: false });
  const [scheduling, setScheduling] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (def && params === null) { setParams({ ...def.default_params }); setScope(unitOnly ? 'don_vi' : 'ca_nhan'); }
  }, [def, params, unitOnly]);

  const run = (p = page) => {
    if (!params) return;
    setResult((r) => ({ ...r, loading: true, error: undefined }));
    api.post<ReportResult>(`/reports/${code}/preview`, { params, scope, page: p, page_size: PAGE_SIZE })
      .then((data) => setResult({ data, loading: false }), (error) => setResult({ error, loading: false }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (params) run(1); }, [params === null, scope]);

  const exportXlsx = async () => {
    const res = await fetch(`/api/v1/reports/${code}/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.get()}` },
      body: JSON.stringify({ params, scope, format: 'xlsx' }),
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
  const totalPages = d ? Math.max(1, Math.ceil(d.total_rows / PAGE_SIZE)) : 1;
  const go = (p: number) => { setPage(p); run(p); };
  return (
    <>
      <div className="text-slate-500 dark:text-slate-400"><TextLink to="/bao-cao">Báo cáo</TextLink> / {def.ten}</div>
      <PageTitle title={def.ten} subtitle={def.mo_ta} />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          {params && <ParamForm code={def.code} props={def.param_schema.properties} value={params} onChange={setParams} />}
          {me.scopes.includes('don_vi') && !unitOnly && (
            <Field label="Phạm vi">
              <Select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                <option value="ca_nhan">Của tôi</option>
                <option value="don_vi">Đơn vị tôi phụ trách và cấp dưới</option>
              </Select>
            </Field>
          )}
          <Button variant="primary" onClick={() => go(1)}>Xem báo cáo</Button>
          <span className="flex-1" />
          <Button disabled={!d} onClick={() => void exportXlsx()}>Xuất Excel</Button>
          <Button onClick={() => { setScheduling(true); setSaved(false); }}>Đặt lịch</Button>
        </div>
        {d?.applied?.tu_ngay ? <Muted className="mt-3">Khoảng dữ liệu: {fmtDate(d.applied.tu_ngay)} – {fmtDate(d.applied.den_ngay)}</Muted> : null}
        {d?.applied?.ngay ? <Muted className="mt-3">Ngày: {fmtDate(d.applied.ngay)}</Muted> : null}
      </Card>

      {scheduling && params && <ScheduleForm reportCode={code} params={params} onDone={() => { setScheduling(false); setSaved(true); }} />}
      {saved && <Banner tone="info">Đã lưu lịch. Xem và chỉnh ở <TextLink to="/lich-chay">Lịch chạy</TextLink>.</Banner>}

      {result.error ? <ErrorBox error={result.error} onRetry={() => run()} /> : null}
      {result.loading && !d && <Loading rows={6} />}
      {d && (
        <div className={result.loading ? 'opacity-60' : ''}>
          <FreshnessBar f={d.freshness} />
          {d.tiles?.length ? <StatTiles tiles={d.tiles} /> : null}
          {d.charts?.map((c) => <ChartView key={c.title} chart={c} rows={d.chart_rows ?? d.rows} />)}
          {d.rows.length === 0
            ? <Empty>Không có dữ liệu trong khoảng đã chọn.{d.freshness.status !== 'ok' && ' Dữ liệu có thể chưa được lấy về — xem dòng trạng thái ở trên.'}</Empty>
            : <DataTable columns={d.columns} rows={d.rows} />}
          {d.total_rows > PAGE_SIZE && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button disabled={page <= 1} onClick={() => go(page - 1)}>Trang trước</Button>
              <span className="tabular-nums">Trang {page}/{totalPages} · {d.total_rows.toLocaleString('vi-VN')} dòng</span>
              <Button disabled={page >= totalPages} onClick={() => go(page + 1)}>Trang sau</Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
