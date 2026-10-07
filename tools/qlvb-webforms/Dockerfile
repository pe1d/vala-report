# Hệ thống quản lý văn bản ASP.NET WebForms giả lập (T07) — WebForms THẬT trên Mono, không phải bắt chước.
FROM mono:6.12
# Debian buster (nền của mono:6.12) đã hết hỗ trợ: kho gói chuyển sang archive.debian.org; buster-updates không còn.
RUN sed -i -e 's|deb.debian.org|archive.debian.org|g' -e '/buster-updates/d' /etc/apt/sources.list \
 && apt-get update && apt-get install -y --no-install-recommends mono-xsp4 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY app/ /app/
EXPOSE 4030
CMD ["xsp4", "--port", "4030", "--address", "0.0.0.0", "--nonstop", "--root", "/app"]
