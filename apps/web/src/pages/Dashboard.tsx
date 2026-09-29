import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiProblem, DASH, api, fmtDate, fmtDateTime, fmtInt, type Column, type DashboardWidget, type WidgetStatus } from '../api';
import { ChartView } from '../components/Charts';
import { DocSection, TaskSection, type OverviewData, type SourceInfo } from '../components/Overview';
import { StatTiles } from '../components/StatTiles';
import { ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Card, Muted, PageTitle, ResultDialog, Tabs, type TabItem, type Tone } from '../components/ui';
import { useValaExtension, type ExtensionEvent } from '../extension';
import { useAsync } from '../hooks';

const STATUS: Record<WidgetStatus, [Tone, string]> = {
  ok: ['ok', 'Có số liệu'], chua_co_du_lieu: ['neutral', 'Chưa có dữ liệu'], can_ket_noi: ['warn', 'Cần kết nối'],
  het_han: ['err', 'Phiên hết hạn'], loi: ['err', 'Lỗi'],
};

/**
 * Tổng quan — mọi báo cáo của người dùng trên một trang. Ô nào chưa có dữ liệu thì nói rõ vì sao và
 * có đúng nút để sửa: chưa kết nối ⇒ "Kết nối", hết phiên ⇒ "Kết nối lại", đã kết nối ⇒ "Lấy dữ liệu ngay".
 * Kết nối qua tiện ích xong ⇒ tự lấy dữ liệu và làm mới ô.
 */
export function DashboardPage() {
  const dash = useAsync(() => api.get<{ widgets: DashboardWidget[] }>('/dashboard'), []);
  const overview = useAsync(() => api.get<OverviewData>('/dashboard/overview'), []);
  const navigate = useNavigate();
  const [note, setNote] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [result, setResult] = useState<{ ok: boolean; ten: string; message?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  /** Lấy dữ liệu ngay cho một nguồn, rồi làm mới Tổng quan vài lần cho tới khi có số liệu. */
  const runNow = useCallback(async (source: string, ten: string) => {
    setBusy(source);
    try {
      await api.post(`/me/sources/${source}/run-now`);
      setNote({ tone: 'info', text: `Đang lấy dữ liệu ${ten}… Trang tự cập nhật khi có số liệu.` });
      let n = 0;
      if (poll.current) clearInterval(poll.current);
      poll.current = setInterval(() => {
        n += 1;
        dash.reload();
        overview.reload();
        if (n >= 12 && poll.current) { clearInterval(poll.current); poll.current = null; }
      }, 5000);
    } catch (e) {
      setNote({ tone: 'err', text: e instanceof ApiProblem ? `${e.title}${e.detail ? `. ${e.detail}` : ''}` : 'Không lấy được dữ liệu' });
    } finally { setBusy(null); }
  }, [dash, overview]);

  const onExt = useCallback((e: ExtensionEvent) => {
    if (e.type === 'connected') {
      setResult({ ok: true, ten: e.ten });
      void runNow(e.code, e.ten);          // vừa kết nối ⇒ lấy dữ liệu luôn
    } else if (e.type === 'connect-failed') {
      setResult({ ok: false, ten: e.ten, message: e.message });
    } else if (e.status === 'login_opened' || e.status === 'need_permission') {
      setNote({ tone: 'info', text: e.message ?? 'Làm theo hướng dẫn trong tab vừa mở — xong tiện ích tự đưa bạn về đây.' });
    } else if (e.status === 'unknown_source') {
      // Tiện ích không phục vụ nguồn này (hoặc chưa đăng nhập) ⇒ sang trang cấp tài khoản.
      navigate(`/uy-quyen?ket-noi=${e.code}`);
    }
  }, [navigate, runNow]);
  const ext = useValaExtension(onExt);

  const connectSource = (code: string) => {
    setNote(null);
    if (ext.info?.logged_in) ext.connect(code);
    else navigate(`/uy-quyen?ket-noi=${code}`);
  };
  const connect = (w: DashboardWidget) => connectSource(w.source_system);

  const widgets = dash.data?.widgets ?? [];
  const needConnect = [...new Map(widgets.filter((w) => w.status === 'can_ket_noi' || w.status === 'het_han')
    .map((w) => [w.source_system, w])).values()];
  // Hệ thống đã có phần số liệu phía trên (kèm nút kết nối) ⇒ khung nhắc chỉ cho các hệ thống còn lại.
  const inOverview = new Set([...(overview.data?.documents ?? []), ...(overview.data?.tasks ?? [])].map((x) => x.source.code));
  const needConnectOther = needConnect.filter((w) => !inOverview.has(w.source_system));
  const withData = widgets.filter((w) => w.status === 'ok').length;

  // ---- tab: mỗi hệ thống có văn bản / công việc một tab, cộng tab "Báo cáo của bạn" ----
  const ov = overview.data;
  const docs = ov?.documents ?? [];
  const taskSrcs = ov?.tasks ?? [];
  const onConnect = (s: SourceInfo) => connectSource(s.code);
  const srcDot = (s: SourceInfo): Pick<TabItem, 'dot' | 'dotLabel'> =>
    !s.enabled || s.state === 'active' ? {}
      : s.state === 'expired' || s.state === 'failed' ? { dot: 'err', dotLabel: 'phiên hết hạn' } : { dot: 'warn', dotLabel: 'chưa kết nối' };
  const tabs: Array<TabItem & { render: () => ReactNode }> = [
    ...docs.map((d) => ({
      id: `van-ban-${d.source.code}`, label: docs.length > 1 ? `Văn bản · ${d.source.ten}` : 'Văn bản', ...srcDot(d.source),
      render: () => <DocSection d={d} today={ov!.today} onConnect={onConnect} busy={busy === d.source.code} showTitle={false} />,
    })),
    ...taskSrcs.map((t) => ({
      id: `cong-viec-${t.source.code}`, label: taskSrcs.length > 1 ? `Công việc · ${t.source.ten}` : 'Công việc', ...srcDot(t.source),
      count: t.qua_han > 0 ? { n: t.qua_han, tone: 'err' as Tone, label: 'việc quá hạn' } : undefined,
      render: () => <TaskSection t={t} today={ov!.today} onConnect={onConnect} busy={busy === t.source.code} showTitle={false} />,
    })),
    { id: 'bao-cao', label: 'Báo cáo của bạn', count: widgets.length ? { n: widgets.length, label: 'báo cáo' } : undefined, render: () => reports },
  ];
  const [params, setParams] = useSearchParams();
  const TAB_KEY = 'vala.tong-quan.tab';
  const saved = (() => { try { return localStorage.getItem(TAB_KEY); } catch { return null; } })();
  const active = tabs.find((t) => t.id === (params.get('tab') ?? saved)) ?? tabs[0]!;
  const choose = (id: string) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set('tab', id); return n; }, { replace: true });
    try { localStorage.setItem(TAB_KEY, id); } catch { /* bỏ qua */ }
  };

  const reports = (
    <>
      {needConnectOther.length > 0 && (
        <Card className="mb-4 border-amber-300 dark:border-amber-800">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1">
              <div className="font-semibold">Kết nối để có đủ số liệu</div>
              <Muted>Kết nối một lần, hệ thống tự lấy dữ liệu theo lịch.</Muted>
            </div>
            {needConnectOther.map((w) => (
              <Button key={w.source_system} variant="primary" onClick={() => connect(w)}>
                {w.status === 'het_han' ? `Kết nối lại ${w.source_ten}` : `Kết nối ${w.source_ten}`}
              </Button>
            ))}
          </div>
        </Card>
      )}
      {dash.loading && !dash.data && <Loading />}
      {dash.error ? <ErrorBox error={dash.error} onRetry={dash.reload} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {widgets.map((w) => (
          <Widget key={w.code} w={w} busy={busy === w.source_system}
            onConnect={() => connect(w)} onRunNow={() => void runNow(w.source_system, w.source_ten)} />
        ))}
      </div>
      {dash.data && !widgets.length && <Muted>Chưa có báo cáo nào hiện trên Tổng quan.</Muted>}
    </>
  );

  return (
    <>
      <PageTitle title="Tổng quan"
        subtitle={widgets.length ? `${withData}/${widgets.length} báo cáo có số liệu${needConnect.length ? ` · ${needConnect.length} hệ thống cần kết nối` : ''}` : 'Toàn bộ báo cáo của bạn trên một trang.'} />
      {note && <Banner tone={note.tone} role="status">{note.text}</Banner>}
      {overview.error ? <ErrorBox error={overview.error} onRetry={overview.reload} /> : null}
      {overview.loading && !ov && !overview.error ? <Loading /> : (
        <>
          <Tabs label="Các phần của Tổng quan" items={tabs} value={active.id} onChange={choose} />
          <div role="tabpanel" id={`panel-${active.id}`} aria-labelledby={`tab-${active.id}`}>{active.render()}</div>
        </>
      )}

      {result && (
        <ResultDialog ok={result.ok} onClose={() => setResult(null)}
          title={result.ok ? `Đã kết nối ${result.ten}` : `Chưa kết nối được ${result.ten}`}>
          {result.ok ? `Đang lấy dữ liệu ${result.ten} lần đầu — số liệu sẽ hiện trên Tổng quan sau ít phút.` : result.message}
        </ResultDialog>
      )}
    </>
  );
}

function Widget({ w, busy, onConnect, onRunNow }: { w: DashboardWidget; busy: boolean; onConnect: () => void; onRunNow: () => void }) {
  const [tone, label] = STATUS[w.status];
  const wide = w.view_template === 'tong_hop' || !!w.tiles?.length;
  return (
    <Card className={wide ? 'lg:col-span-2' : ''}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link to={`/bao-cao/${w.code}`} className="font-semibold text-slate-900 no-underline hover:underline dark:text-slate-100">{w.ten}</Link>
          <Muted className="text-xs">{w.source_ten}{w.scope === 'don_vi' ? ' · cấp đơn vị' : ''}
            {w.freshness?.last_success_at ? ` · cập nhật ${fmtDateTime(w.freshness.last_success_at)}` : ''}</Muted>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>

      {w.status === 'het_han' && (
        <Action text={`Phiên ${w.source_ten} đã hết hạn.`} button={`Kết nối lại`} onClick={onConnect} primary />
      )}
      {w.status === 'can_ket_noi' && (
        <Action text={`Cần kết nối ${w.source_ten}.`} button="Kết nối" onClick={onConnect} primary />
      )}
      {w.status === 'chua_co_du_lieu' && (
        <Action text="Đã kết nối, chưa có dữ liệu." button={busy ? 'Đang gửi…' : 'Lấy dữ liệu ngay'} onClick={onRunNow} disabled={busy || !w.can_run_now} />
      )}
      {w.status === 'loi' && <p className="mt-3 text-sm text-red-700 dark:text-red-400">{w.message ?? 'Không tải được báo cáo này.'}</p>}

      {w.has_data && <Summary w={w} />}

      <div className="mt-3 flex items-center gap-3 text-sm">
        <Link to={`/bao-cao/${w.code}`} className="text-blue-700 no-underline hover:underline dark:text-blue-400">Xem chi tiết →</Link>
        {w.status === 'ok' && w.can_run_now && (
          <button type="button" disabled={busy} onClick={onRunNow}
            className="text-slate-500 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-100">
            {busy ? 'Đang gửi…' : 'Cập nhật ngay'}
          </button>
        )}
      </div>
    </Card>
  );
}

function Action({ text, button, onClick, primary, disabled }: { text: string; button: string; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-slate-300 p-3 dark:border-slate-700">
      <p className="flex-1 text-sm text-slate-600 dark:text-slate-300">{text}</p>
      <Button variant={primary ? 'primary' : 'default'} disabled={disabled} onClick={onClick}>{button}</Button>
    </div>
  );
}

/** Tóm tắt trong ô: thẻ số liệu, hoặc biểu đồ đầu tiên, hoặc vài dòng đầu của bảng. */
function Summary({ w }: { w: DashboardWidget }) {
  const chart = w.charts?.[0];
  const hasChart = !!chart && !!w.chart_rows?.length;
  if (w.tiles?.length || hasChart) {
    return (
      <>
        {!!w.tiles?.length && <StatTiles tiles={w.tiles} />}
        {hasChart && <ChartView chart={chart!} rows={w.chart_rows!} />}
      </>
    );
  }
  const cols = w.columns ?? [];
  return (
    <div className="mt-3">
      <div className="text-2xl font-semibold">{fmtInt(w.total_rows ?? 0)} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">dòng</span></div>
      <table className="mt-2 w-full table-fixed text-sm">
        <thead><tr>{cols.map((c) => <th key={c.field} className="truncate border-b border-slate-200 py-1 pr-2 text-left font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">{c.label}</th>)}</tr></thead>
        <tbody>
          {(w.rows ?? []).map((r, i) => (
            <tr key={i}>{cols.map((c) => <td key={c.field} className="truncate border-b border-slate-100 py-1 pr-2 dark:border-slate-800/60" title={String(r[c.field] ?? '')}>{cell(c, r[c.field])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cell(c: Column, v: unknown): string {
  if (v === null || v === undefined || v === '') return DASH;
  if (c.type === 'date') return fmtDate(v);
  if (c.type === 'int' || c.type === 'money') return fmtInt(v);
  return String(v);
}
