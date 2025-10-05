# Node.js 20 LTS Alpine
FROM node:20-alpine AS base
WORKDIR /app

# ===== deps (prod) =====
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ===== builder =====
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# pastikan script ini ada, kalau tidak pakai: npm run build
RUN npm run build:prod

# ===== runner =====
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# user non-root
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs -u 1001

# copy artefak dengan ownership langsung (butuh BuildKit)
COPY --from=builder --chown=1001:1001 /app/dist ./dist
COPY --from=deps    --chown=1001:1001 /app/node_modules ./node_modules
COPY --from=builder --chown=1001:1001 /app/package.json ./package.json
# jika kamu memang butuh folder ini di runtime
COPY --from=builder --chown=1001:1001 /app/migrations ./migrations

USER nodejs
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["npm", "start"]