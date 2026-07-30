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

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/driftless

# The checkout, node_modules, releases/ and shared/ all live on the volume, so
# the image itself stays small and every install upgrade is a volume operation.
VOLUME ["/opt/driftless"]

ENV NODE_ENV=production
EXPOSE 3333

# tini reaps the children the release process spawns; without it a rebuild
# leaves zombies behind.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "current/bin/server.js"]
