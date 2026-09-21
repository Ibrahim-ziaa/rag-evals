# Stage 1: build the React app
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# Stage 2: Python API that also serves the built app
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml README.md LICENSE ./
COPY rag_evals ./rag_evals
RUN pip install --no-cache-dir -e .
COPY corpus ./corpus
COPY evals ./evals
COPY --from=web /web/dist ./web/dist
EXPOSE 8102
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8102/api/health')"
CMD ["python", "-m", "rag_evals", "serve", "--host", "0.0.0.0", "--port", "8102"]
