# Driftless — a runtime over a mounted checkout, NOT a self-contained artifact.
#
# The usual Node production image (`npm ci --omit=dev`, copy `build/`, run) is
# unusable here, and it is worth being explicit about why: installing an app
# that ships UI rebuilds the front-end on the server. A built tree contains no
# `.tsx` at all — `tsconfig.json` excludes `inertia/**` and `modules/**/ui/**` —
# and omitting devDependencies removes Vite, TypeScript and Tailwind.
#
# So the image carries the toolchain and the *volume* carries the application.
# `npm ci --omit=dev` must never appear here.
FROM node:24-bookworm-slim

# ca-certificates git tini: the base runtime. The rest are the shared libraries
# headless Chromium links against — the MCP `screenshot_page` tool drives Chromium
# (via Playwright) to rasterise a page. The Chromium BINARY itself is NOT baked
# here; it is installed onto the volume by the release step with
#   PLAYWRIGHT_BROWSERS_PATH=/opt/driftless/shared/ms-playwright npx playwright install chromium
# so it survives image upgrades. These libs must be in the image because the
# volume only carries node_modules + the app, not system packages.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates git tini \
      libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
      libdrm2 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 \
      libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
      libx11-6 libxcb1 libxext6 libxi6 libfontconfig1 fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/driftless

# Chromium browsers live on the volume (installed by the release step), not in the
# image or the default per-user cache, so both install and runtime agree on this.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/driftless/shared/ms-playwright

# The checkout, node_modules, releases/ and shared/ all live on the volume, so
# the image itself stays small and every install upgrade is a volume operation.
VOLUME ["/opt/driftless"]

ENV NODE_ENV=production
EXPOSE 3333

# tini reaps the children the release process spawns; without it a rebuild
# leaves zombies behind.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "current/bin/server.js"]
