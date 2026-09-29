import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, auth, type Me } from './api';
import { useAsync } from './hooks';
import { ReauthGate } from './components/Reauth';
import { Loading } from './components/States';
import { Button, ThemeToggle } from './components/ui';
import { LoginPage } from './pages/Login';
import { MyConnectionsPage } from './pages/MyConnections';
import { AdminSpidersPage } from './pages/AdminSpiders';
import { CatalogPage } from './pages/Catalog';
import { ReportPage } from './pages/Report';
import { SubscriptionsPage } from './pages/Subscriptions';
import { OpsPage } from './pages/Ops';
import { AdminConnectionsPage } from './pages/AdminConnections';
import { AdminSourcesPage } from './pages/AdminSources';
import { AdminReportsPage } from './pages/AdminReports';
import { DashboardPage } from './pages/Dashboard';

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
  if (location.pathname === '/dang-nhap/xong') return <LoginDone onLogin={(t) => { auth.set(t); setToken(t); }} />;
  if (!token) return <LoginPage onLogin={(t) => { auth.set(t); setToken(t); }} />;
  return <Authed onLogout={() => { auth.set(null); setToken(null); }} />;
}

/** Quay về từ Bkav SSO: token cổng nằm trong fragment (#token=…). Lưu rồi xoá khỏi thanh địa chỉ ngay. */
function LoginDone({ onLogin }: { onLogin: (t: string) => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const token = h.get('token');
    const next = h.get('next') ?? '/';
    try { sessionStorage.removeItem('vala.reauth'); } catch { /* bỏ qua */ }
    window.history.replaceState(null, '', '/');
    if (token) onLogin(token);
    navigate(token && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
  }, [navigate, onLogin]);
  return <div className="p-8"><Loading /></div>;
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  'rounded-md px-2.5 py-2 no-underline transition-colors ' + (isActive
    ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300'
    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800');

function Authed({ onLogout }: { onLogout: () => void }) {
  const me = useAsync(() => api.get<Me>('/me'), []);
  if (me.loading) return <div className="p-8"><Loading /></div>;
  if (!me.data) { onLogout(); return null; }
  return (
    <MeContext.Provider value={me.data}>
      <ReauthGate />
      <div className="grid min-h-screen md:grid-cols-[220px_1fr]">
        {/* Máy tính: sidebar cao đúng một màn hình, đứng yên khi cuộn trang dài (Tổng quan). Phần cuối (người dùng,
            sáng/tối, đăng xuất) luôn nằm ở đáy; chỉ danh sách menu tự cuộn nếu màn hình thấp. */}
        <nav aria-label="Điều hướng chính"
          className="flex flex-wrap gap-0.5 border-b border-slate-200 bg-white p-3 md:sticky md:top-0 md:h-screen md:flex-col md:flex-nowrap md:self-start md:border-b-0 md:border-r dark:border-slate-800 dark:bg-slate-900">
          <div className="px-2.5 pb-4 pt-1 font-bold">Vala Reporting</div>
          <div className="flex flex-wrap gap-0.5 md:min-h-0 md:flex-1 md:flex-col md:flex-nowrap md:overflow-y-auto">
            <NavLink className={navCls} to="/tong-quan">Tổng quan</NavLink>
            <NavLink className={navCls} to="/bao-cao" end>Báo cáo</NavLink>
            <NavLink className={navCls} to="/lich-chay">Lịch chạy</NavLink>
            <NavLink className={navCls} to="/uy-quyen">Tài khoản nguồn</NavLink>
            {me.data.is_ops_admin && <NavLink className={navCls} to="/he-thong-nguon">Hệ thống nguồn</NavLink>}
            {me.data.is_ops_admin && <NavLink className={navCls} to="/cau-hinh-bao-cao">Cấu hình báo cáo</NavLink>}
            {me.data.is_ops_admin && <NavLink className={navCls} to="/ket-noi">Kết nối dữ liệu</NavLink>}
            {me.data.is_ops_admin && <NavLink className={navCls} to="/script-crawl">Script crawl</NavLink>}
            {me.data.is_ops_admin && <NavLink className={navCls} to="/van-hanh">Vận hành</NavLink>}
          </div>
          <div className="flex flex-col gap-2 p-2.5 text-[13px] md:shrink-0 md:border-t md:border-slate-200 md:pt-3 md:dark:border-slate-800">
            <div>
              <div className="font-semibold">{me.data.ho_ten}</div>
              <div className="text-slate-500 dark:text-slate-400">
                {me.data.org_units.map((o) => o.ten + (o.vai_tro === 'truong_don_vi' ? ' (trưởng)' : '')).join(', ')}
              </div>
            </div>
            <ThemeToggle />
            <Button className="self-start" onClick={onLogout}>Đăng xuất</Button>
          </div>
        </nav>
        <main className="w-full max-w-7xl p-4 md:px-8 md:py-6">
          <Routes>
            <Route path="/" element={<Navigate to="/tong-quan" replace />} />
            <Route path="/tong-quan" element={<DashboardPage />} />
            <Route path="/bao-cao" element={<CatalogPage />} />
            <Route path="/bao-cao/:code" element={<ReportPage />} />
            <Route path="/lich-chay" element={<SubscriptionsPage />} />
            <Route path="/uy-quyen" element={<MyConnectionsPage />} />
            <Route path="/script-crawl" element={me.data.is_ops_admin ? <AdminSpidersPage /> : <Navigate to="/" />} />
            <Route path="/cau-hinh-bao-cao" element={me.data.is_ops_admin ? <AdminReportsPage /> : <Navigate to="/" />} />
            <Route path="/he-thong-nguon" element={me.data.is_ops_admin ? <AdminSourcesPage /> : <Navigate to="/" />} />
            <Route path="/ket-noi" element={me.data.is_ops_admin ? <AdminConnectionsPage /> : <Navigate to="/" />} />
            <Route path="/van-hanh" element={me.data.is_ops_admin ? <OpsPage /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </MeContext.Provider>
  );
}
