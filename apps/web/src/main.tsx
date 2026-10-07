import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { BASE } from './base';
import { BrandingProvider } from './branding';
// Trong Vala Desktop: ngôn ngữ + sáng/tối đồng bộ với ứng dụng.
import './desktopPrefs';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrandingProvider><BrowserRouter basename={BASE || undefined}><App /></BrowserRouter></BrandingProvider></StrictMode>,
);
