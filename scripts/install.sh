#!/usr/bin/env bash
#
# Install Driftless on a fresh VPS.
#
#   curl -fsSL https://get.driftless.dev | bash
#
# Deliberately boring and re-runnable: it checks what is there, installs what is
# missing, and refuses rather than guesses. A first-run script that half-works
# is worse than one that stops and says why.
set -euo pipefail

REPO="${DRIFTLESS_REPO:-https://github.com/your-org/driftless.git}"
TARGET="${DRIFTLESS_HOME:-/opt/driftless}"
NODE_MIN=24

say()  { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31mError:\033[0m %s\n' "$1" >&2; exit 1; }

# ── preflight ───────────────────────────────────────────────────────────────
command -v git  >/dev/null || die "git is not installed."
command -v node >/dev/null || die "Node.js $NODE_MIN+ is not installed."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge "$NODE_MIN" ] || die "Node.js $NODE_MIN+ is required (found $NODE_MAJOR)."

# The build needs real memory: two Vite passes plus a full tsc over ~300 chunks.
# Finding this out by being OOM-killed halfway through a release is a bad way to
# learn it.
if [ -r /proc/meminfo ]; then
  MEM_MB=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 ))
  [ "$MEM_MB" -ge 1800 ] || die "At least 2 GB of RAM is required (found ${MEM_MB} MB). The front-end build will be killed on less."
fi

DISK_MB=$(df -Pm "$(dirname "$TARGET")" | awk 'NR==2 {print $4}')
[ "$DISK_MB" -ge 3000 ] || die "At least 3 GB free disk is required (found ${DISK_MB} MB)."

# ── fetch ───────────────────────────────────────────────────────────────────
if [ -d "$TARGET/.git" ]; then
  say "Updating the existing checkout at $TARGET"
  git -C "$TARGET" pull --ff-only
else
  [ -e "$TARGET" ] && die "$TARGET exists and is not a Driftless checkout."
  say "Cloning into $TARGET"
  git clone --depth 1 "$REPO" "$TARGET"
fi

cd "$TARGET"

# ── dependencies ────────────────────────────────────────────────────────────
# `npm ci`, NOT `--omit=dev`. Installing an app that ships UI rebuilds the
# front-end on this machine, and that needs Vite, TypeScript and Tailwind.
say "Installing dependencies (this includes the build toolchain, on purpose)"
npm ci

# ── configuration ───────────────────────────────────────────────────────────
mkdir -p shared
if [ ! -f shared/.env ]; then
  say "Creating shared/.env — edit it before starting"
  cp .env.example shared/.env
  node ace generate:key --show >> /dev/null 2>&1 || true
  printf '\n\033[1;33mEdit shared/.env now:\033[0m DATABASE_URL, APP_URL, APP_KEY\n'
  printf 'Then re-run this script to finish.\n'
  exit 0
fi
ln -sfn shared/.env .env

# ── database + release ──────────────────────────────────────────────────────
say "Running migrations"
node ace migration:run --force

say "Building the first release (several minutes)"
npm run release

# ── supervisor ──────────────────────────────────────────────────────────────
cat <<'NEXT'

Driftless is installed. Start it under a supervisor — it must be able to restart
the process, because installing an app that ships UI finishes by exiting.

  PM2:      npm i -g pm2 && pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
  systemd:  sudo cp deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
            sudo systemctl daemon-reload
            sudo systemctl enable --now driftless driftless-worker driftless-maintenance.timer

Then check http://localhost:3333/health

Docs: docs/SELF_HOSTING.md · docs/DEPLOYMENT.md · docs/RECOVERY.md
NEXT
