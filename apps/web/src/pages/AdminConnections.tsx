import { useState } from 'react';
import { openDesktopAdmin, useInDesktop } from '../desktopPrefs';
import { api, fmtDateTime, type AuthMethod, type Connection } from '../api';
import { ConnectionEditor } from '../components/ConnectionEditor';
import { useAsync } from '../hooks';
import { NoMatch, Pager, SearchBox, useTableView } from '../components/TableTools';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Muted, PageTitle, Select, Table, Td, Th, type Tone } from '../components/ui';
import { METHOD_LABEL } from '@vala/admin/labels';
import { messages, tr, useT } from '../i18n';

const M = messages({
  state: { active: 'Đang hoạt động', pending: 'Chờ đăng nhập', expired: 'Phiên hết hạn', failed: 'Lỗi đăng nhập', revoked: 'Đã thu hồi', chua_cau_hinh: 'Chưa cấu hình' },
  method: { password: 'Tài khoản/mật khẩu', cookie: 'Dán cookie', sso: 'Người dùng tự uỷ quyền (SSO)', extension: 'Vala Desktop' },
  title: 'Kết nối dữ liệu',
  subtitle: 'Cấu hình cách hệ thống lấy dữ liệu thay cho từng người dùng. Mật khẩu và cookie chỉ được lưu trong kho bí mật (vault); hệ thống không hiển thị lại.',
  search: 'Tìm người dùng, email, tài khoản nguồn…', system: 'Hệ thống', filterBySystem: 'Lọc theo hệ thống',
  all: (n: number) => `Tất cả (${n})`, editSources: 'Thêm / sửa hệ thống nguồn →', editSourcesHint: 'Thêm / sửa hệ thống nguồn: Vala Desktop → Quản trị → Hệ thống nguồn', noUsers: 'Chưa có người dùng nào.',
  currentFilter: 'bộ lọc hiện tại', user: 'Người dùng', method_: 'Cách lấy dữ liệu', sourceAccount: 'Tài khoản nguồn',
  status: 'Trạng thái', lastSuccess: 'Lấy thành công gần nhất', configure: 'Cấu hình', edit: 'Sửa', unit: 'kết nối',
}, {
  state: { active: 'Active', pending: 'Awaiting sign-in', expired: 'Session expired', failed: 'Sign-in failed', revoked: 'Revoked', chua_cau_hinh: 'Not configured' },
  method: { password: 'Username/password', cookie: 'Pasted cookie', sso: 'User-authorized (SSO)', extension: 'Vala Desktop' },
  title: 'Data connections',
  subtitle: 'Configure how the system fetches data on behalf of each user. Passwords and cookies are stored only in the secrets vault and are never shown again.',
  search: 'Search users, emails, source accounts…', system: 'System', filterBySystem: 'Filter by system',
  all: (n: number) => `All (${n})`, editSources: 'Add / edit source systems →', editSourcesHint: 'Add / edit source systems: Vala Desktop → Administration → Source systems', noUsers: 'No users yet.',
  currentFilter: 'current filter', user: 'User', method_: 'Fetch method', sourceAccount: 'Source account',
  status: 'Status', lastSuccess: 'Last successful fetch', configure: 'Configure', edit: 'Edit', unit: 'connections',
});

/** Bảng tra theo mã, nhãn đọc theo ngôn ngữ ngay lúc truy cập (getter) — màn khác import vẫn dùng như bảng hằng. */
const lazy = <K extends string, V>(keys: readonly K[], get: (k: K) => V): Record<K, V> =>
  Object.defineProperties({} as Record<K, V>, Object.fromEntries(keys.map((k) => [k, { get: () => get(k), enumerable: true }])));
const STATE_TONE: Record<Connection['state'], Tone> = { active: 'ok', pending: 'warn', expired: 'warn', failed: 'err', revoked: 'neutral', chua_cau_hinh: 'neutral' };
export const STATE: Record<Connection['state'], [Tone, string]> =
  lazy(Object.keys(STATE_TONE) as Array<Connection['state']>, (k) => [STATE_TONE[k], tr(M).state[k]]);
/** Nhãn cách kết nối dùng chung với trang Quản trị (@vala/admin). */
export { METHOD_LABEL };

/**
 * Màn hình quản trị — Kết nối dữ liệu. Quản trị cấu hình cách hệ thống lấy dữ liệu thay từng người dùng:
 * nhập tài khoản/mật khẩu hệ thống nguồn (hệ thống tự đăng nhập), hoặc dán cookie.
 */
export function AdminConnectionsPage() {
  const t = useT(M);
  const inDesktop = useInDesktop();
  const conns = useAsync(() => api.get<Connection[]>('/admin/connections'), []);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [src, setSrc] = useState('');
  const sources = [...new Map((conns.data ?? []).map((c) => [c.source_system, c.source_ten])).entries()];
  const bySrc = (conns.data ?? []).filter((c) => !src || c.source_system === src);
  const tv = useTableView(bySrc, (c) => `${c.ho_ten} ${c.email} ${c.source_ten} ${c.source_username ?? ''} ${STATE[c.state][1]} ${c.auth_method ? METHOD_LABEL[c.auth_method] : ''}`);

  return (
    <>
      <PageTitle title={t.title}
        subtitle={t.subtitle} />
      {note && <Banner tone="ok">{note}</Banner>}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox value={tv.q} onChange={tv.setQ} delay={0} placeholder={t.search} />
        <label className="flex items-center gap-2 text-sm">{t.system}
          <Select value={src} onChange={(e) => { setSrc(e.target.value); tv.setPage(1); }} aria-label={t.filterBySystem}>
            <option value="">{t.all(sources.length)}</option>
            {sources.map(([code, ten]) => <option key={code} value={code}>{ten}</option>)}
          </Select>
        </label>
        <span className="flex-1" />
        {/* Hệ thống nguồn sửa ở trang Quản trị của Vala Desktop (web phụ thuộc Desktop). */}
        {inDesktop
          ? <button type="button" onClick={() => openDesktopAdmin('he-thong-nguon')} className="text-sm text-blue-700 hover:underline dark:text-blue-400">{t.editSources}</button>
          : <Muted>{t.editSourcesHint}</Muted>}
      </div>
      {conns.loading && <Loading />}
      {conns.error ? <ErrorBox error={conns.error} onRetry={conns.reload} /> : null}
      {conns.data && !conns.data.length && <Empty>{t.noUsers}</Empty>}

      {!!conns.data?.length && !tv.total && <NoMatch q={tv.q || t.currentFilter} onClear={() => { tv.setQ(''); setSrc(''); }} />}
      {!!tv.total && (<>
        <Table>
          <thead><tr>
            <Th>{t.user}</Th><Th>{t.system}</Th><Th>{t.method_}</Th><Th>{t.sourceAccount}</Th>
            <Th>{t.status}</Th><Th num>{t.lastSuccess}</Th><Th /></tr></thead>
          <tbody>
            {tv.rows.map((c) => {
              const [tone, label] = STATE[c.state];
              return (
                <tr key={`${c.app_user_id}-${c.source_system}`}>
                  <Td><div className="font-medium">{c.ho_ten}</div><Muted>{c.email}</Muted></Td>
                  <Td>{c.source_ten}</Td>
                  <Td>{c.auth_method ? METHOD_LABEL[c.auth_method] : '–'}</Td>
                  <Td>{c.source_username ?? '–'}</Td>
                  <Td>
                    <Badge tone={tone}>{label}</Badge>
                    {c.last_error && <div className="mt-1 text-xs text-red-700 dark:text-red-400" title={c.last_error}>{c.last_error}</div>}
                  </Td>
                  <Td num>{fmtDateTime(c.last_success_at)}</Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button onClick={() => { setEditing(c); setNote(null); }}>{c.state === 'chua_cau_hinh' ? t.configure : t.edit}</Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Pager page={tv.page} pageSize={tv.pageSize} total={tv.total} onPage={tv.setPage} onPageSize={tv.setPageSize} unit={t.unit} />
      </>)}

      {editing && (
        <ConnectionEditor conn={editing} onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setNote(msg); conns.reload(); }} />
      )}
    </>
  );
}
