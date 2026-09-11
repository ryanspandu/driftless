# Recovering a broken Driftless install

Every tool here works **without booting the application**, because the situations they exist
for are the ones where it will not boot. Reaching for Lucid would start the container, the
providers and the very module that is preventing startup.

Work down the list; stop at the first thing that fixes it.

## 1. What state is it actually in?

```bash
node ace modules:list
curl -s localhost:3333/health
```

`modules:list` compares what is on disk against what the database says, and prints the boot
error for anything that quarantined itself. `/health` returns 503 when the database is
unreachable **or** the built assets do not match their manifest — the second is the state
where the app boots, every route answers, and every page is blank.

## 2. One module is breaking it

A module that throws in `boot()` is caught, disabled and recorded automatically — it should
not be able to take the site down. If one is misbehaving in a way that gets past that:

```bash
node ace modules:disable <name>
```

Takes effect within ~10 seconds without a restart, because the enabled map is cached with a
short TTL rather than for the process lifetime.

## 3. It will not start at all

```bash
node ace modules:safe-mode --on
# restart
```

Safe mode boots with **no modules**: no module routes, no boot hooks, no permissions minted,
no reserved URL segments, no nav. Core only — enough to log in, look at the module list, and
remove whatever caused it.

```bash
node ace modules:safe-mode --off   # then restart again
```

The narrower instrument, when you already know the culprit and want the rest of the site up:

```bash
DRIFTLESS_DISABLE_MODULES=broken-app npm start
```

## 4. The last release is bad

```bash
npm run rollback   # points `current` at the previous release
# restart
```

Releases are kept, not overwritten, precisely for this: when a release turns out to be broken
*after* it goes live, the fix has to be one command and a restart — not a rebuild, because
whatever is broken may well break the build too.

## 5. Pages are blank but nothing errors

The asset manifest and the files on disk have drifted apart.

```bash
node scripts/verify-build.mjs current/public/assets
```

It reports both directions: a manifest entry with no file, and a file no manifest references.
Fix by cutting a fresh release (`npm run release`), which cleans before building and refuses
to publish a build that does not verify.

## What you cannot break by accident

- **Customer media and paid downloads** live in `shared/`, outside every release. A build
  cannot reach them, and `build-release.mjs` refuses to remove a directory that still holds
  files rather than risk deleting them.
- **The previous release** stays on disk until pruned (last 3 by default).
- **A failed build** never moves the `current` symlink. The site keeps serving what it was.

## When to restore from backup

The one path with no undo is `module:uninstall`: it drops the module's tables. The folder is
moved aside rather than deleted, but the data is gone. Take a database backup before
uninstalling anything you are not certain about.
