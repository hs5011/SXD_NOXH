# Multi-stage build cho NOXH app
# Stage 1: build frontend + backend
FROM node:22-alpine AS builder

WORKDIR /app

# Cai dependencies truoc de cache layer
COPY package*.json ./
RUN npm ci

# Copy source va build
COPY . .
RUN npm run build

# ==============================================================================
# Stage 2: production image (chi giu dist + runtime deps)
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

# Chi copy cac file can thiet cho production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Cai chi production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Tao thu muc uploads
RUN mkdir -p uploads

# Chay voi non-root user (bao mat)
RUN addgroup -g 1001 -S nodejs && adduser -S noxh -u 1001
RUN chown -R noxh:nodejs /app
USER noxh

# Port mac dinh (override bang env var PORT)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server.cjs"]
