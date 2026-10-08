/** @type {import('tailwindcss').Config} */
import preset from '@vala/ui/tailwind-preset';

export default {
  presets: [preset],
  // Gồm cả các gói giao diện dùng chung — không thì class trong đó bị loại khỏi CSS.
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}', '../../packages/admin/src/**/*.{ts,tsx}'],
};
