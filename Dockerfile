# ── Stage 1: Install Node dependencies ────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Build the Next.js app ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 3: Production runtime ───────────────────────────────────────────────
# Deviation from ai-tool-hub's Dockerfile: PSD/AI parsing needs Python's
# psd-tools/pypdf and video compression needs ffmpeg (no comparably mature Node
# equivalent for either), so this final stage needs a real Python/ffmpeg
# environment. Using node:20-slim (Debian) instead of node:20-alpine here
# specifically because pip-installing psd-tools on Alpine has known musl/wheel
# friction that Debian-slim avoids — everything else about this stage mirrors
# ai-tool-hub's pattern (non-root user, .next/standalone output).
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security (mirrors ai-tool-hub's addgroup/adduser pattern)
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Python deps for scripts/psd_probe.py and scripts/video_compress.py, in a venv
# (Debian's system Python is externally-managed and refuses bare `pip install`).
COPY scripts/requirements.txt ./scripts/requirements.txt
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir -r scripts/requirements.txt
ENV PATH="/opt/venv/bin:${PATH}"

COPY scripts/ ./scripts/

# Copy only what's needed to run the Next.js app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
