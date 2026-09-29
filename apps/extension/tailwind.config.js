/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './src/**/*.{ts,tsx}'],
  // Giống cổng: chế độ tối theo class `dark` trên <html>, do nút sáng/tối điều khiển (src/theme.ts).
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
