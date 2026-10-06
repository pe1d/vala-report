import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Options } from './App';
import { readLang } from './i18n';
import './index.css';

// Đọc ngôn ngữ đã chọn trước khi vẽ để không chớp tiếng Việt rồi mới đổi.
void readLang().then(() => createRoot(document.getElementById('root')!).render(<StrictMode><Options /></StrictMode>));
