# syntax=docker/dockerfile:1
#
# PropIntel — Next.js 15 + SQLite + Tesseract OCR.
#
#   docker compose up --build      (recommended — see docker-compose.yml)
#
# Stages
#   ocr-data  downloads the OCR language data once, so OCR works offline afterwards
#   deps      full dependency install + Prisma client generated for Linux
#   builder   `next build` (standalone output)
#   tools     deps + source: runs the one-shot database / dataset setup (scripts/docker-init.sh)
#   runner    the slim production image that serves the app
#
# Debian (not Alpine) on purpose: sharp, Prisma's query engine and better-sqlite3 all ship
# prebuilt glibc binaries, so nothing has to be compiled.

ARG NODE_VERSION=22

# ── 1. OCR language data ────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS ocr-data
WORKDIR /w
COPY scripts/download-ocr-data.mjs ./
# needs network at build time; the script exits non-zero (failing the build) if a download fails
RUN node download-ocr-data.mjs eng mar

# ── 2. Dependencies ─────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci
# generated inside the image, so the query engine matches this OS (never the Windows/macOS one)
RUN npx prisma generate

# ── 3. Build ────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    DATABASE_URL=file:/tmp/build.db
RUN npm run build

# ── 4. Setup tools (used by the `init` service) ─────────────────────────────
FROM deps AS tools
# The sample-document generator draws text onto images; a slim Debian image has no fonts at all,
# which silently produces blank pages. Liberation Sans is metric-compatible with Arial.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fontconfig fonts-liberation fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f
COPY . .
COPY --from=ocr-data /w/ocr-data ./ocr-data
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/data/propintel.db
RUN sed -i 's/\r$//' scripts/docker-init.sh \
 && mkdir -p /data/uploads/documents /data/ocr-cache \
 && chown -R node:node /data \
 && ln -s /data/uploads /app/uploads \
 && ln -s /data/ocr-cache /app/.ocr-cache
USER node
CMD ["sh", "scripts/docker-init.sh"]

# ── 5. Runtime ──────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runner
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/propintel.db

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=ocr-data /w/ocr-data ./ocr-data

# Everything that changes at runtime lives on one volume, /data:
#   propintel.db   the SQLite database
#   uploads/       uploaded documents          (app reads/writes ./uploads)
#   ocr-cache/     Tesseract's working cache   (app reads/writes ./.ocr-cache)
RUN mkdir -p /data/uploads/documents /data/ocr-cache /tmp/next-cache \
 && chown -R node:node /data /tmp/next-cache \
 && ln -s /data/uploads /app/uploads \
 && ln -s /data/ocr-cache /app/.ocr-cache \
 && mkdir -p /app/.next && ln -s /tmp/next-cache /app/.next/cache

USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
