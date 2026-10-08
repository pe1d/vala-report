import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiProblem, DASH, api, fmtDate, fmtDateTime, fmtInt, type Column, type DashboardData, type DashboardTab, type DashboardWidget, type WidgetStatus } from '../api';
import { ChartView } from '../components/Charts';
import { StatTiles } from '../components/StatTiles';
import { GroupSection, groupRows } from '../components/TableTools';
import { ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Card, Muted, PageTitle, ResultDialog, Tabs, type TabItem, type Tone } from '../components/ui';
import { useValaExtension, type ExtensionEvent } from '../extension';
import { useAsync } from '../hooks';
import { AutoRefreshBar, useAutoRefresh } from '../components/AutoRefresh';
import { messages, useT } from '../i18n';

const M = messages({
  status: { ok: 'Có số liệu', trong: 'Không có bản ghi khớp', chua_co_du_lieu: 'Chưa có dữ liệu', can_ket_noi: 'Cần kết nối', het_han: 'Phiên hết hạn', loi: 'Lỗi' } as Record<WidgetStatus, string>,
  state: { active: 'Đang kết nối', expired: 'Phiên hết hạn', failed: 'Lỗi đăng nhập', pending: 'Chờ đăng nhập', revoked: 'Chưa kết nối', chua_cau_hinh: 'Chưa kết nối' } as Record<string, string>,
  fetching: (ten: string) => `Đang lấy dữ liệu ${ten}… Trang tự cập nhật khi có số liệu.`,
  fetchFailed: 'Không lấy được dữ liệu',
  followTab: 'Làm theo hướng dẫn trong tab vừa mở — xong Vala Desktop tự đưa bạn về đây.',
  dotExpired: 'phiên hết hạn', dotNotConnected: 'chưa kết nối',
  yourReports: 'Báo cáo của bạn', unit: (_n: number) => 'báo cáo',
  connectForData: 'Kết nối để có đủ số liệu', connectOnce: 'Kết nối một lần, hệ thống tự lấy dữ liệu theo lịch.',
  connect: (src: string) => `Kết nối ${src}`, reconnect: (src: string) => `Kết nối lại ${src}`,
  noneOnOverview: 'Chưa có báo cáo nào hiện trên Tổng quan.',
  title: 'Tổng quan',
  summary: (withData: number, total: number, need: number) => `${withData}/${total} báo cáo có số liệu${need ? ` · ${need} hệ thống cần kết nối` : ''}`,
  emptySubtitle: 'Toàn bộ báo cáo của bạn trên một trang.',
  tabsLabel: 'Các phần của Tổng quan',
  connected: (ten: string) => `Đã kết nối ${ten}`, connectFailed: (ten: string) => `Chưa kết nối được ${ten}`,
  firstFetch: (ten: string) => `Đang lấy dữ liệu ${ten} lần đầu — số liệu sẽ hiện trên Tổng quan sau ít phút.`,
  updatedAt: (at: string) => `· cập nhật ${at}`,
  updatedAtInline: (at: string) => ` · cập nhật ${at}`,
  sending: 'Đang gửi…', updateNow: 'Cập nhật ngay', fetchNow: 'Lấy dữ liệu ngay',
  waitingFirst: 'Đã kết nối — đang chờ lượt lấy dữ liệu đầu tiên.', connectToStart: 'Kết nối để bắt đầu lấy số liệu tự động.',
  sessionExpired: (src: string) => `Phiên ${src} đã hết hạn.`, reconnectBtn: 'Kết nối lại',
  needConnect: (src: string) => `Cần kết nối ${src}.`, connectBtn: 'Kết nối',
  noData: 'Chưa có dữ liệu.', connectedNoData: 'Đã kết nối, chưa có dữ liệu.',
  blockFailed: 'Không tải được khối này.', reportFailed: 'Không tải được báo cáo này.',
  noMatch: 'Không có bản ghi nào khớp điều kiện của báo cáo trong khoảng thời gian này.',
  stillUpdating: (src: string, at: string) => ` Dữ liệu ${src} vẫn cập nhật bình thường (lần cuối ${at}).`,
  details: 'Xem chi tiết →', rows: 'dòng',
}, {
  status: { ok: 'Has data', trong: 'No matching records', chua_co_du_lieu: 'No data yet', can_ket_noi: 'Needs connection', het_han: 'Session expired', loi: 'Error' },
  state: { active: 'Connected', expired: 'Session expired', failed: 'Sign-in failed', pending: 'Awaiting sign-in', revoked: 'Not connected', chua_cau_hinh: 'Not connected' },
  fetching: (ten: string) => `Fetching ${ten} data… The page updates automatically when data arrives.`,
  fetchFailed: 'Couldn’t fetch data',
  followTab: 'Follow the instructions in the tab that just opened — Vala Desktop will bring you back here when done.',
  dotExpired: 'session expired', dotNotConnected: 'not connected',
  yourReports: 'Your reports', unit: (n: number) => (n === 1 ? 'report' : 'reports'),
  connectForData: 'Connect to get complete data', connectOnce: 'Connect once and the system fetches data on schedule.',
  connect: (src: string) => `Connect ${src}`, reconnect: (src: string) => `Reconnect ${src}`,
  noneOnOverview: 'No reports are shown on Overview yet.',
  title: 'Overview',
  summary: (withData: number, total: number, need: number) =>
    `${withData}/${total} ${total === 1 ? 'report has' : 'reports have'} data${need ? ` · ${need} source ${need === 1 ? 'system needs' : 'systems need'} connecting` : ''}`,
  emptySubtitle: 'All your reports on one page.',
  tabsLabel: 'Overview sections',
  connected: (ten: string) => `Connected to ${ten}`, connectFailed: (ten: string) => `Couldn’t connect to ${ten}`,
  firstFetch: (ten: string) => `Fetching ${ten} data for the first time — it will appear on Overview in a few minutes.`,
  updatedAt: (at: string) => `· updated ${at}`,
  updatedAtInline: (at: string) => ` · updated ${at}`,
  sending: 'Sending…', updateNow: 'Update now', fetchNow: 'Fetch data now',
  waitingFirst: 'Connected — waiting for the first data fetch.', connectToStart: 'Connect to start fetching data automatically.',
  sessionExpired: (src: string) => `Your ${src} session has expired.`, reconnectBtn: 'Reconnect',
  needConnect: (src: string) => `Connect ${src} to continue.`, connectBtn: 'Connect',
  noData: 'No data yet.', connectedNoData: 'Connected, no data yet.',
  blockFailed: 'Couldn’t load this block.', reportFailed: 'Couldn’t load this report.',
  noMatch: 'No records match this report’s criteria in this time range.',
  stillUpdating: (src: string, at: string) => ` ${src} data is still updating normally (last run ${at}).`,
  details: 'View details →', rows: 'rows',
});
type Labels = typeof M.vi;

const STATUS_TONE: Record<WidgetStatus, Tone> = {
  ok: 'ok', trong: 'neutral', chua_co_du_lieu: 'neutral', can_ket_noi: 'warn', het_han: 'err', loi: 'err',
};

const STATE_TONE: Record<string, Tone> = {
  active: 'ok', expired: 'err', failed: 'err', pending: 'warn', revoked: 'neutral', chua_cau_hinh: 'neutral',
};
const stateBadge = (t: Labels, state: string): [Tone, string] | undefined =>
  STATE_TONE[state] ? [STATE_TONE[state], t.state[state] ?? state] : undefined;
const SPAN = { 1: 'lg:col-span-1', 2: 'lg:col-span-2', 3: 'lg:col-span-3' } as const;

/**
 * Tổng quan — các tab do quản trị cấu hình (Cấu hình báo cáo → Tab Tổng quan), mỗi tab gồm các khối là báo cáo
 * cấu hình (thẻ số liệu, biểu đồ, bảng); báo cáo không thuộc tab nào nằm ở tab "Báo cáo của bạn".
 * Khối nào chưa có dữ liệu thì nói rõ vì sao và có đúng nút để sửa: chưa kết nối ⇒ "Kết nối",
 * hết phiên ⇒ "Kết nối lại", đã kết nối ⇒ "Lấy dữ liệu ngay". Kết nối qua tiện ích xong ⇒ tự lấy dữ liệu và làm mới.
 */
export function DashboardPage() {
  const t = useT(M);
  const dash = useAsync(() => api.get<DashboardData>('/dashboard'), []);
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
      setNote({ tone: 'info', text: t.fetching(ten) });
      let n = 0;
      if (poll.current) clearInterval(poll.current);
      poll.current = setInterval(() => {
        n += 1;
        dash.reload();
        if (n >= 12 && poll.current) { clearInterval(poll.current); poll.current = null; }
      }, 5000);
    } catch (e) {
      setNote({ tone: 'err', text: e instanceof ApiProblem ? `${e.title}${e.detail ? `. ${e.detail}` : ''}` : t.fetchFailed });
    } finally { setBusy(null); }
  }, [dash, t]);

  const onExt = useCallback((e: ExtensionEvent) => {
    if (e.type === 'connected') {
      setResult({ ok: true, ten: e.ten });
      void runNow(e.code, e.ten);          // vừa kết nối ⇒ lấy dữ liệu luôn
    } else if (e.type === 'connect-failed') {
      setResult({ ok: false, ten: e.ten, message: e.message });
    } else if (e.status === 'login_opened' || e.status === 'need_permission') {
      setNote({ tone: 'info', text: e.message ?? t.followTab });
    } else if (e.status === 'unknown_source') {
      // Tiện ích không phục vụ nguồn này (hoặc chưa đăng nhập) ⇒ sang trang cấp tài khoản.
      navigate(`/uy-quyen?ket-noi=${e.code}`);
    }
  }, [navigate, runNow, t]);
  const ext = useValaExtension(onExt);

  const connectSource = (code: string) => {
    setNote(null);
    if (ext.info?.logged_in) ext.connect(code);
    else navigate(`/uy-quyen?ket-noi=${code}`);
  };
  const connect = (w: DashboardWidget) => connectSource(w.source_system);

  const widgets = dash.data?.widgets ?? [];
  // Mở Tổng quan ⇒ nguồn dữ liệu nào cũ hơn 15 phút thì tự lấy lại; xong thì tải lại các khối.
  const auto = useAutoRefresh(dash.data ? widgets.map((w) => w.code) : undefined, dash.reload);
  const tabCfg = dash.data?.tabs ?? [];
  const needConnect = [...new Map(widgets.filter((w) => w.status === 'can_ket_noi' || w.status === 'het_han')
    .map((w) => [w.source_system, w])).values()];
  const withData = widgets.filter((w) => w.status === 'ok').length;

  // ---- tab: mỗi tab cấu hình một tab (ẩn tab không có khối nào người này xem được), cộng "Báo cáo của bạn" ----
  const inTab = (w: DashboardWidget) => w.tab !== null && tabCfg.some((t) => t.id === w.tab);
  const untabbed = widgets.filter((w) => !inTab(w));
  // Hệ thống đã có tab riêng (kèm nút kết nối) ⇒ khung nhắc ở "Báo cáo của bạn" chỉ cho các hệ thống còn lại.
  const tabSources = new Set(tabCfg.map((t) => t.source?.code).filter(Boolean));
  const needConnectOther = needConnect.filter((w) => !tabSources.has(w.source_system));
  const dotOf = (tb: DashboardTab): Pick<TabItem, 'dot' | 'dotLabel'> =>
    !tb.source || tb.source.state === 'active' ? {}
      : tb.source.state === 'expired' || tb.source.state === 'failed' ? { dot: 'err', dotLabel: t.dotExpired } : { dot: 'warn', dotLabel: t.dotNotConnected };
  /** Số trên tab: thẻ số liệu đầu tiên đang ở mức nghiêm trọng (vd "5 việc quá hạn"). */
  const alertOf = (blocks: DashboardWidget[]): TabItem['count'] => {
    const hit = blocks.flatMap((b) => b.tiles ?? []).find((x) => x.tone === 'err' && x.value > 0);
    return hit ? { n: hit.value, tone: 'err', label: hit.label.toLowerCase() } : undefined;
  };
  const tabs: Array<TabItem & { render: () => ReactNode }> = [
    ...tabCfg.map((tb) => ({ tb, blocks: widgets.filter((w) => w.tab === tb.id) })).filter((x) => x.blocks.length).map(({ tb, blocks }) => ({
      id: `tab-${tb.id}`, label: tb.ten, ...dotOf(tb), count: alertOf(blocks),
      render: () => (
        <TabPanel tab={tb} blocks={blocks} busy={busy} onConnect={connectSource}
          onRunNow={(code, ten) => void runNow(code, ten)} />
      ),
    })),
    ...(untabbed.length || !tabCfg.length ? [{
      id: 'bao-cao', label: t.yourReports, count: untabbed.length ? { n: untabbed.length, label: t.unit(untabbed.length) } : undefined, render: () => reports,
    }] : []),
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
              <div className="font-semibold">{t.connectForData}</div>
              <Muted>{t.connectOnce}</Muted>
            </div>
            {needConnectOther.map((w) => (
              <Button key={w.source_system} variant="primary" onClick={() => connect(w)}>
                {w.status === 'het_han' ? t.reconnect(w.source_ten) : t.connect(w.source_ten)}
              </Button>
            ))}
          </div>
        </Card>
      )}
      {groupRows(untabbed, (w) => w.source_system, (w) => w.source_ten).map((g, _, all) => {
        const grid = (
          <div className="grid gap-4 lg:grid-cols-2">
            {g.rows.map((w) => (
              <Widget key={w.code} w={w} busy={busy === w.source_system}
                onConnect={() => connect(w)} onRunNow={() => void runNow(w.source_system, w.source_ten)} />
            ))}
          </div>
        );
        // Chỉ một hệ thống ⇒ không cần tiêu đề nhóm.
        return all.length > 1
          ? <GroupSection key={g.key} id={`tong-quan-${g.key}`} title={g.label} count={g.rows.length} unit={t.unit(g.rows.length)}>{grid}</GroupSection>
          : <div key={g.key}>{grid}</div>;
      })}
      {dash.data && !untabbed.length && <Muted>{t.noneOnOverview}</Muted>}
    </>
  );

  return (
    <>
      <PageTitle title={t.title}
        subtitle={widgets.length ? t.summary(withData, widgets.length, needConnect.length) : t.emptySubtitle} />
      {note && <Banner tone={note.tone} role="status">{note.text}</Banner>}
      <AutoRefreshBar st={auto} className="mb-3" />
      {dash.error ? <ErrorBox error={dash.error} onRetry={dash.reload} /> : null}
      {dash.loading && !dash.data && !dash.error ? <Loading /> : dash.data && (
        <>
          {tabs.length > 1 && <Tabs label={t.tabsLabel} items={tabs} value={active.id} onChange={choose} />}
          <div role="tabpanel" id={`panel-${active.id}`} aria-labelledby={`tab-${active.id}`}>{active.render()}</div>
        </>
      )}

      {result && (
        <ResultDialog ok={result.ok} onClose={() => setResult(null)}
          title={result.ok ? t.connected(result.ten) : t.connectFailed(result.ten)}>
          {result.ok ? t.firstFetch(result.ten) : result.message}
        </ResultDialog>
      )}
    </>
  );
}

/** Một tab cấu hình: dòng tình trạng hệ thống nguồn của tab + lưới khối (mỗi khối rộng 1–3 phần ba hàng). */
function TabPanel({ tab, blocks, busy, onConnect, onRunNow }: {
  tab: DashboardTab; blocks: DashboardWidget[]; busy: string | null;
  onConnect: (code: string) => void; onRunNow: (code: string, ten: string) => void;
}) {
  const t = useT(M);
  const src = tab.source;
  const [tone, label]: [Tone, string] = src ? stateBadge(t, src.state) ?? ['neutral', src.state] : ['neutral', ''];
  const connected = !src || src.state === 'active';
  const needFix = src?.state === 'expired' || src?.state === 'failed';
  // Đã lấy dữ liệu (kể cả khi bộ lọc của khối ra rỗng) ⇒ hiện các khối, không báo "chờ lượt đầu tiên".
  const hasData = blocks.some((b) => b.has_data || b.status === 'trong');
  const updated = blocks.map((b) => b.freshness?.last_success_at).filter((x): x is string => !!x).sort().at(-1);
  return (
    <section className="grid gap-4" aria-label={tab.ten}>
      {src && (
        <div className="flex flex-wrap items-center gap-2">
          <Muted className="text-sm">{src.ten}</Muted>
          <Badge tone={tone}>{label}</Badge>
          {updated && <Muted className="text-xs">{t.updatedAt(fmtDateTime(updated))}</Muted>}
          <span className="flex-1" />
          {(!connected || needFix) && (
            <Button variant="primary" disabled={busy === src.code} onClick={() => onConnect(src.code)}>{needFix ? t.reconnect(src.ten) : t.connect(src.ten)}</Button>
          )}
          {connected && hasData && src.can_run_now && (
            <button type="button" disabled={busy === src.code} onClick={() => onRunNow(src.code, src.ten)}
              className="text-sm text-slate-500 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-100">
              {busy === src.code ? t.sending : t.updateNow}
            </button>
          )}
        </div>
      )}
      {!hasData && src ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <span className="flex-1">{connected ? t.waitingFirst : t.connectToStart}</span>
          {connected && src.can_run_now && (
            <Button disabled={busy === src.code} onClick={() => onRunNow(src.code, src.ten)}>{busy === src.code ? t.sending : t.fetchNow}</Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {blocks.map((b) => (
            <Block key={b.code} w={b} className={SPAN[b.width] ?? SPAN[3]} busy={busy === b.source_system}
              onConnect={() => onConnect(b.source_system)} onRunNow={() => onRunNow(b.source_system, b.source_ten)} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Một khối trong tab: báo cáo chỉ có thẻ số liệu ⇒ hàng thẻ trần (không khung); có biểu đồ ⇒ thẻ có tiêu đề + biểu đồ;
 * danh sách ⇒ vài dòng đầu. Tiêu đề dẫn tới trang báo cáo đầy đủ.
 */
function Block({ w, className, busy, onConnect, onRunNow }: {
  w: DashboardWidget; className: string; busy: boolean; onConnect: () => void; onRunNow: () => void;
}) {
  const t = useT(M);
  const chart = w.charts?.[0];
  const tilesOnly = !!w.tiles?.length && !chart && !(w.columns ?? []).length;
  if (w.has_data && tilesOnly) return <div className={`min-w-0 ${className}`}><StatTiles tiles={w.tiles!} className="" /></div>;
  const title = (
    <figcaption className="min-w-0">
      <Link to={`/bao-cao/${w.code}`} className="font-semibold text-slate-900 no-underline hover:underline dark:text-slate-100">{w.ten}</Link>
      {w.mo_ta && <Muted className="text-xs">{w.mo_ta}</Muted>}
    </figcaption>
  );
  return (
    <Card className={`min-w-0 ${className}`}>
      {/* Cột grid minmax(0,1fr): biểu đồ co theo khung, không đẩy khung nở theo bề rộng lúc vẽ lần đầu. */}
      <figure className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {title}
        {w.status === 'het_han' && <Action text={t.sessionExpired(w.source_ten)} button={t.reconnectBtn} onClick={onConnect} primary />}
        {w.status === 'can_ket_noi' && <Action text={t.needConnect(w.source_ten)} button={t.connectBtn} onClick={onConnect} primary />}
        {w.status === 'chua_co_du_lieu' && (
          <Action text={t.noData} button={busy ? t.sending : t.fetchNow} onClick={onRunNow} disabled={busy || !w.can_run_now} />
        )}
        {w.status === 'trong' && <NoMatch w={w} />}
        {w.status === 'loi' && <p className="text-sm text-red-700 dark:text-red-400">{w.message ?? t.blockFailed}</p>}
        {w.has_data && <Summary w={w} />}
      </figure>
    </Card>
  );
}

/** Dữ liệu vẫn cập nhật bình thường, chỉ là không bản ghi nào khớp điều kiện của báo cáo — nói rõ để không nhầm với lỗi kết nối. */
function NoMatch({ w }: { w: DashboardWidget }) {
  const t = useT(M);
  return (
    <p className="text-sm text-slate-500 dark:text-slate-400">
      {t.noMatch}
      {w.freshness?.last_success_at && t.stillUpdating(w.source_ten, fmtDateTime(w.freshness.last_success_at))}
    </p>
  );
}

function Widget({ w, busy, onConnect, onRunNow }: { w: DashboardWidget; busy: boolean; onConnect: () => void; onRunNow: () => void }) {
  const t = useT(M);
  const tone = STATUS_TONE[w.status];
  const label = t.status[w.status];
  const wide = w.view_template === 'tong_hop' || !!w.tiles?.length;
  return (
    <Card className={wide ? 'lg:col-span-2' : ''}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link to={`/bao-cao/${w.code}`} className="font-semibold text-slate-900 no-underline hover:underline dark:text-slate-100">{w.ten}</Link>
          <Muted className="text-xs">{w.source_ten}
            {w.freshness?.last_success_at ? t.updatedAtInline(fmtDateTime(w.freshness.last_success_at)) : ''}</Muted>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>

      {w.status === 'het_han' && (
        <Action text={t.sessionExpired(w.source_ten)} button={t.reconnectBtn} onClick={onConnect} primary />
      )}
      {w.status === 'can_ket_noi' && (
        <Action text={t.needConnect(w.source_ten)} button={t.connectBtn} onClick={onConnect} primary />
      )}
      {w.status === 'chua_co_du_lieu' && (
        <Action text={t.connectedNoData} button={busy ? t.sending : t.fetchNow} onClick={onRunNow} disabled={busy || !w.can_run_now} />
      )}
      {w.status === 'trong' && <div className="mt-3"><NoMatch w={w} /></div>}
      {w.status === 'loi' && <p className="mt-3 text-sm text-red-700 dark:text-red-400">{w.message ?? t.reportFailed}</p>}

      {w.has_data && <Summary w={w} />}

      <div className="mt-3 flex items-center gap-3 text-sm">
        <Link to={`/bao-cao/${w.code}`} className="text-blue-700 no-underline hover:underline dark:text-blue-400">{t.details}</Link>
        {(w.status === 'ok' || w.status === 'trong') && w.can_run_now && (
          <button type="button" disabled={busy} onClick={onRunNow}
            className="text-slate-500 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-100">
            {busy ? t.sending : t.updateNow}
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
  const t = useT(M);
  const chart = w.charts?.[0];
  const hasChart = !!chart && !!w.chart_rows?.length;
  if (w.tiles?.length || hasChart) {
    return (
      <>
        {!!w.tiles?.length && <StatTiles tiles={w.tiles} />}
        {hasChart && <div className="mt-2"><ChartView chart={chart!} rows={w.chart_rows!} bare /></div>}
      </>
    );
  }
  const cols = w.columns ?? [];
  return (
    <div className="mt-3">
      <div className="text-2xl font-semibold">{fmtInt(w.total_rows ?? 0)} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">{t.rows}</span></div>
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
