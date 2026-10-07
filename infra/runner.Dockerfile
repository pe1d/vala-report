# Runner — chạy gói kịch bản Vala Desktop trên máy chủ (apps/runner) bằng Chromium không giao diện.
# Image riêng (Chromium nặng ~300 MB) để image api/worker không phình. Chromium lấy từ kho Debian (qua proxy nếu có).
# Build:  docker build -f infra/runner.Dockerfile -t vala-report-runner .
FROM node:18.20.5-bookworm-slim

ENV TZ=Asia/Ho_Chi_Minh
# Chromium + phông có dấu tiếng Việt (trang hiển thị đúng, đọc chữ không lỗi).
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app
RUN npm install -g pnpm@12.5.1 --no-fund --no-audit --loglevel=error
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/runner/package.json apps/runner/
RUN pnpm install --frozen-lockfile --filter @vala/core --filter @vala/runner

COPY packages/core packages/core
COPY apps/runner apps/runner
ENV NODE_ENV=production
USER node
WORKDIR /app/apps/runner
EXPOSE 3100
CMD ["/app/apps/runner/node_modules/.bin/tsx", "src/main.ts"]
