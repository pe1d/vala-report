import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, auth, type Me } from './api';
import { BASE } from './base';
import { useAsync } from './hooks';
import { ReauthGate } from './components/Reauth';
import { sendDeviceToken, useValaExtension } from './extension';
import { Loading } from './components/States';
import { Shell } from './components/Shell';
import { ForcedPasswordChange } from './components/ChangePassword';
import { LoginPage } from './pages/Login';
import { MyConnectionsPage } from './pages/MyConnections';
import { AdminSpidersPage } from './pages/AdminSpiders';
import { AdminDesktopScriptsPage } from './pages/AdminDesktopScripts';
import { AdminDesktopAppsPage } from './pages/AdminDesktopApps';
import { CatalogPage } from './pages/Catalog';
import { ReportPage } from './pages/Report';
import { DataSchedulesPage } from './pages/DataSchedules';
import { OpsPage } from './pages/Ops';
import { AdminConnectionsPage } from './pages/AdminConnections';
import { AdminSourcesPage } from './pages/AdminSources';
import { AdminReportsPage } from './pages/AdminReports';
import { AdminUsersPage } from './pages/AdminUsers';
import { AdminSettingsPage } from './pages/AdminSettings';
import { DashboardPage } from './pages/Dashboard';
import { DesktopDownloadPage } from './pages/DesktopDownload';

const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext)!;

export function App() {
  const [token, setToken] = useState(auth.get());
  const location = useLocation();
  // API trả 401 (phiên cổng hết hạn) ⇒ về màn hình đăng nhập, màn hình này tự chuyển sang SSO.
  useEffect(() => {
    const onUnauthorized = () => setToken(null);
    window.addEventListener('vala:unauthorized', onUnauthorized);
    return () => window.removeEventListener('vala:unauthorized', onUnauthorized);
  }, []);
  // Trang tải Vala Desktop: công khai, không cần đăng nhập (người cài lần đầu chưa có tài khoản trên máy).
  if (location.pathname === '/desktop' || location.pathname === '/desktop/') return <DesktopDownloadPage />;
  if (location.pathname === '/dang-nhap/xong') return <LoginDone onLogin={(t) => { auth.set(t); setToken(t); }} />;
  if (!token) return <LoginPage onLogin={(t) => { auth.set(t); setToken(t); }} />;
  return <Authed onLogout={() => { auth.set(null); setToken(null); }} />;
}

/** Quay về từ SSO: token cổng nằm trong fragment (#token=…). Lưu rồi xoá khỏi thanh địa chỉ ngay. */
function LoginDone({ onLogin }: { onLogin: (t: string) => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const token = h.get('token');
    const next = h.get('next') ?? '/';
    try { sessionStorage.removeItem('vala.reauth'); } catch { /* bỏ qua */ }
    window.history.replaceState(null, '', `${BASE}/`);
    if (token) onLogin(token);
    navigate(token && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
  }, [navigate, onLogin]);
  return <div className="p-8"><Loading /></div>;
}

function Authed({ onLogout }: { onLogout: () => void }) {
  const me = useAsync(() => api.get<Me>('/me'), []);
  if (me.loading) return <div className="p-8"><Loading /></div>;
  if (!me.data) { onLogout(); return null; }
  // Mật khẩu tạm (quản trị cấp/đặt lại) ⇒ đổi mật khẩu trước khi vào ứng dụng (máy chủ cũng chặn mọi API khác).
  if (me.data.must_change_password) return <ForcedPasswordChange name={me.data.ho_ten} onDone={me.reload} onLogout={onLogout} />;
  return (
    <MeContext.Provider value={me.data}>
      <ReauthGate />
      <DesktopLink me={me.data} />
      <Shell me={me.data} onLogout={onLogout}>
        <Routes>
          <Route path="/" element={<Navigate to="/tong-quan" replace />} />
          <Route path="/tong-quan" element={<DashboardPage />} />
          <Route path="/bao-cao" element={<CatalogPage />} />
          <Route path="/bao-cao/:code" element={<ReportPage />} />
          <Route path="/lich-chay" element={<DataSchedulesPage />} />
          <Route path="/uy-quyen" element={<MyConnectionsPage />} />
          <Route path="/script-crawl" element={me.data.is_ops_admin ? <AdminSpidersPage /> : <Navigate to="/" />} />
          <Route path="/kich-ban-desktop" element={me.data.is_ops_admin ? <AdminDesktopScriptsPage /> : <Navigate to="/" />} />
          <Route path="/ung-dung-desktop" element={me.data.is_ops_admin ? <AdminDesktopAppsPage /> : <Navigate to="/" />} />
          <Route path="/cau-hinh-bao-cao" element={me.data.is_ops_admin ? <AdminReportsPage /> : <Navigate to="/" />} />
          <Route path="/he-thong-nguon" element={me.data.is_ops_admin ? <AdminSourcesPage /> : <Navigate to="/" />} />
          <Route path="/ket-noi" element={me.data.is_ops_admin ? <AdminConnectionsPage /> : <Navigate to="/" />} />
          <Route path="/van-hanh" element={me.data.is_ops_admin ? <OpsPage /> : <Navigate to="/" />} />
        <Route path="/nguoi-dung" element={me.data.is_ops_admin ? <AdminUsersPage /> : <Navigate to="/" />} />
        <Route path="/cau-hinh-chung" element={me.data.is_ops_admin ? <AdminSettingsPage /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Shell>
    </MeContext.Provider>
  );
}

/**
 * Chạy trong Vala Desktop: người dùng vừa đăng nhập cổng (mật khẩu hoặc SSO) mà ứng dụng chưa đăng nhập, hoặc đang đăng
 * nhập người khác ⇒ xin token thiết bị cho chính người này và chuyển cho ứng dụng. Chỉ một lần đăng nhập cho cả hai.
 */
function DesktopLink({ me }: { me: Me }) {
  const ext = useValaExtension(() => {});
  const sent = useRef(false);
  useEffect(() => {
    const i = ext.info;
    if (sent.current || !i?.desktop) return;
    if (i.logged_in && i.email?.toLowerCase() === me.email.toLowerCase()) return;
    sent.current = true;
    api.post<{ token: string; user: { ho_ten: string; email: string } }>('/me/extension-devices', { device_name: i.device })
      .then((r) => sendDeviceToken(r.token, r.user))
      .catch(() => { sent.current = false; });
  }, [ext.info, me.email]);
  return null;
}
