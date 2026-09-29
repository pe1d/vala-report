import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDateTime, type AuthMethod, type Connection } from '../api';
import { ConnectionEditor } from '../components/ConnectionEditor';
import { useAsync } from '../hooks';
import { Empty, ErrorBox, Loading } from '../components/States';
import { Badge, Banner, Button, Muted, PageTitle, Select, Table, Td, Th, type Tone } from '../components/ui';

export const STATE: Record<Connection['state'], [Tone, string]> = {
  active: ['ok', 'Đang hoạt động'], pending: ['warn', 'Chờ đăng nhập'], expired: ['warn', 'Phiên hết hạn'],
  failed: ['err', 'Lỗi đăng nhập'], revoked: ['neutral', 'Đã thu hồi'], chua_cau_hinh: ['neutral', 'Chưa cấu hình'],
};
export const METHOD_LABEL: Record<AuthMethod, string> = { password: 'Tài khoản/mật khẩu', cookie: 'Dán cookie', sso: 'Người dùng tự uỷ quyền (SSO)', extension: 'Tiện ích trình duyệt' };

/**
 * Màn hình quản trị — Kết nối dữ liệu. Quản trị cấu hình cách hệ thống lấy dữ liệu thay từng người dùng:
 * nhập tài khoản/mật khẩu hệ thống nguồn (hệ thống tự đăng nhập), hoặc dán cookie.
 */
export function AdminConnectionsPage() {
  const conns = useAsync(() => api.get<Connection[]>('/admin/connections'), []);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [src, setSrc] = useState('');
  const sources = [...new Map((conns.data ?? []).map((c) => [c.source_system, c.source_ten])).entries()];
  const rows = (conns.data ?? []).filter((c) => !src || c.source_system === src);

  return (
    <>
      <PageTitle title="Kết nối dữ liệu"
        subtitle="Cấu hình cách hệ thống lấy dữ liệu thay cho từng người dùng. Mật khẩu và cookie chỉ được lưu trong kho bí mật (vault); hệ thống không hiển thị lại." />
      {note && <Banner tone="ok">{note}</Banner>}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">Hệ thống
          <Select value={src} onChange={(e) => setSrc(e.target.value)} aria-label="Lọc theo hệ thống">
            <option value="">Tất cả ({sources.length})</option>
            {sources.map(([code, ten]) => <option key={code} value={code}>{ten}</option>)}
          </Select>
        </label>
        <span className="flex-1" />
        <Link to="/he-thong-nguon" className="text-sm text-blue-700 no-underline hover:underline dark:text-blue-400">Thêm / sửa hệ thống nguồn →</Link>
      </div>
      {conns.loading && <Loading />}
      {conns.error ? <ErrorBox error={conns.error} onRetry={conns.reload} /> : null}
      {conns.data && !conns.data.length && <Empty>Chưa có người dùng nào.</Empty>}

      {!!conns.data?.length && (
        <Table>
          <thead><tr>
            <Th>Người dùng</Th><Th>Hệ thống</Th><Th>Cách lấy dữ liệu</Th><Th>Tài khoản nguồn</Th>
            <Th>Trạng thái</Th><Th num>Lấy thành công gần nhất</Th><Th /></tr></thead>
          <tbody>
            {rows.map((c) => {
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
                      <Button onClick={() => { setEditing(c); setNote(null); }}>{c.state === 'chua_cau_hinh' ? 'Cấu hình' : 'Sửa'}</Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {editing && (
        <ConnectionEditor conn={editing} onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setNote(msg); conns.reload(); }} />
      )}
    </>
  );
}
