FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY package*.json ./
RUN npm install
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home summ
COPY server ./server
COPY --from=frontend /build/dist ./dist
USER summ
EXPOSE 9000
CMD ["uvicorn","server.app:app","--host","0.0.0.0","--port","9000","--no-access-log"]
