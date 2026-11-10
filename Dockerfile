FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SUMM_DATA_DIR=/data
WORKDIR /app
# Pango and HarfBuzz let WeasyPrint shape Persian and Arabic text in PDFs.
RUN apt-get update && apt-get install -y --no-install-recommends libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home summ && mkdir /data && chown summ /data
COPY server ./server
COPY --from=frontend /build/dist ./dist
# The image is read-only at runtime; font and model caches go to the /tmp tmpfs.
ENV XDG_CACHE_HOME=/tmp
USER summ
EXPOSE 9000
CMD ["uvicorn","server.app:app","--host","0.0.0.0","--port","9000","--no-access-log"]
