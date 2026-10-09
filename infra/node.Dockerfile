# Image Node dùng chung cho api, worker và lệnh quản trị (migrate, tạo quản trị).
# Mã TypeScript chạy trực tiếp bằng tsx (như môi trường dev) — không có bước biên dịch riêng.
# Build:  docker build -f infra/node.Dockerfile -t vala-report-node .
FROM node:18.20.5-bookworm-slim

ENV TZ=Asia/Ho_Chi_Minh
WORKDIR /app
# corepack đi kèm Node 18 có khoá ký cũ (lỗi "Cannot find matching keyid") ⇒ cài thẳng đúng bản pnpm của repo.
RUN npm install -g pnpm@12.5.1 --no-fund --no-audit --loglevel=error

# Cài thư viện trước (tận dụng cache khi chỉ đổi mã nguồn).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
# @vala/ui: API dùng bộ biểu tượng ứng dụng (src/app-icons.ts — TypeScript thuần, không React).
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @vala/core --filter @vala/api --filter @vala/worker

COPY . .
# Đặt SAU bước cài: NODE_ENV=production khiến pnpm bỏ devDependencies (tsx cần để chạy).
ENV NODE_ENV=production
USER node
