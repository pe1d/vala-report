# Web (cổng Vala): build tĩnh bằng Vite rồi phục vụ bằng nginx; nginx chuyển /api → dịch vụ api.
# HTTPS: đặt fullchain.pem + privkey.pem vào deploy/certs (mount vào /etc/nginx/certs) — có thì tự bật 443.
FROM node:18.20.5-bookworm-slim AS build
WORKDIR /app
# corepack đi kèm Node 18 có khoá ký cũ (lỗi "Cannot find matching keyid") ⇒ cài thẳng đúng bản pnpm của repo.
RUN npm install -g pnpm@12.5.1 --no-fund --no-audit --loglevel=error
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @vala/web
COPY apps/web apps/web
RUN pnpm --filter @vala/web build

FROM nginx:1.27-alpine
COPY infra/web/nginx-http.conf infra/web/nginx-https.conf /etc/nginx/vala/
COPY infra/web/entrypoint.sh /docker-entrypoint.d/40-vala.sh
RUN chmod 755 /docker-entrypoint.d/40-vala.sh && rm -f /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
