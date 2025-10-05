# ===== builder =====
FROM node:20-alpine AS builder
WORKDIR /app

# Lockfile wajib agar build reproducible
COPY package.json package-lock.json ./
RUN npm ci

# Variabel build-time untuk Vite (akan di-embed ke bundle)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL
ARG VITE_MIDTRANS_CLIENT_KEY
ARG VITE_NODE_ENV

# Ekspos ke lingkungan build Vite
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
    VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY} \
    VITE_API_URL=${VITE_API_URL} \
    VITE_MIDTRANS_CLIENT_KEY=${VITE_MIDTRANS_CLIENT_KEY} \
    VITE_NODE_ENV=${VITE_NODE_ENV}

# Salin sisa source dan build
COPY . .
RUN npm run build

# Debug: Show environment variables during build
RUN echo "VITE_SUPABASE_URL: $VITE_SUPABASE_URL" && \
    echo "VITE_API_URL: $VITE_API_URL" && \
    echo "VITE_NODE_ENV: $VITE_NODE_ENV"

# ===== runtime (Nginx) =====
FROM nginx:1.25-alpine AS runner

# Konfigurasi Nginx kustom jika ada (opsional)
# Pastikan file nginx.conf ada di repo (root proyek frontend)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Salin hasil build
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# Healthcheck sederhana cek halaman root
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1