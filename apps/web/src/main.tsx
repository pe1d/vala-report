import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { BASE } from './base';
import { BrandingProvider } from './branding';
// Trong Vala Desktop: ngôn ngữ + sáng/tối đồng bộ với ứng dụng.
import './desktopPrefs';
import './index.css';
import { setReauthButton } from '@vala/ui/States';
import { ReauthButton } from './components/Reauth';

// Lỗi phiên hệ thống nguồn ⇒ nút "kết nối lại" của cổng (gói giao diện dùng chung không biết cách kết nối lại).
setReauthButton((p) => <ReauthButton source={p.source} />);

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrandingProvider><BrowserRouter basename={BASE || undefined}><App /></BrowserRouter></BrandingProvider></StrictMode>,
);
