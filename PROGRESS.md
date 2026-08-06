# Build Log — Distributed API Uptime & Latency Monitor

This is a running log of what's been built, why, and what tripped us up along the way.
Kept in the repo (not just chat history) so it survives across sessions and doubles as
interview prep material — every decision here has a reason behind it.

## What this project is

A simplified BetterStack/UptimeRobot clone: register URLs, a distributed worker fleet
checks them on a schedule, results land in a time-series store, incidents get detected
and alerted on, and a dashboard + public status page show the results.

Built as a **learning project**: explain every new concept in detail as it's
introduced (Docker, Postgres, message queues, worker processes, TimescaleDB, JWT auth,
etc.) — code is a secondary goal to actually understanding it well enough to discuss
in interviews.

## Target architecture

```
apps/
  backend/    Express + TypeScript API (auth, CRUD, metrics queries, public status API)
  worker/     BullMQ worker + scheduler (health checks, SSL checks, incident detection, alert dispatch)
  frontend/   React + Vite + Tailwind + Recharts SPA
packages/
  db/         Prisma schema + generated client, shared by backend and worker
docker-compose.yml   timescale/timescaledb postgres + redis + backend + worker + frontend
```

Stack decisions locked in: TypeScript, Prisma, Redis + BullMQ (over Kafka/RabbitMQ —
gentler learning curve, still very interview-relevant), PostgreSQL → TimescaleDB (over
Mongo/InfluxDB), Docker Compose for real multi-container local dev, npm workspaces
monorepo.

**Build order principle**: prove the riskiest integration first with the thinnest
possible slice (scheduler → queue → worker → DB, no auth), then layer complexity
(auth, multi-tenancy, incidents, alerting, public pages) on top of something already
known to work. Schema and docker-compose grow one milestone at a time alongside the
code that needs them, instead of being fully specified upfront. Full milestone
breakdown (M0-M8) lives in `~/.claude/plans/fuzzy-percolating-candy.md` on the dev
machine.

## Milestone status

- [x] **M0 — Minimal scaffold** (commit `6bc745d`): npm workspaces, shared
      TypeScript/ESLint/Prettier config, Postgres via Docker (timescaledb image),
      `packages/db` with `Monitor`/`Check` Prisma schema + migration + seed script.
      Verified: tables confirmed via `psql \dt`, seeded row confirmed via direct query.
- [x] **M1 — Walking skeleton**: Redis + BullMQ added, `apps/worker` with a
      `Queue`/`Worker` pair on a `"health-check"` queue, one repeatable job
      (`upsertJobScheduler`) checking the seeded monitor every 30s. Verified: real
      `Check` rows confirmed via direct `psql` query, landing exactly 30s apart,
      driven entirely by scheduler → Redis → worker → Postgres, no backend/auth/
      frontend involved.
- [ ] M2 — Backend API Monitor CRUD, wired to the queue as producer
- [ ] M3 — Auth + multi-tenancy
- [ ] M4 — Incident detection + alerting
- [ ] M5 — Metrics API + TimescaleDB hypertable
- [ ] M6 — Frontend
- [ ] M7 — Public status pages
- [ ] M8 — SSL checks + polish + full docker-compose

## Environment gotchas (read before debugging from scratch)

These cost real time to figure out once — check here before re-diagnosing.

1. **This project lives on a WSL path accessed from Windows tools.** Path:
   `\\wsl.localhost\Ubuntu-24.04\home\aabhinavvvvvvv\personal_projects\project` from
   Windows, or `/home/aabhinavvvvvvv/personal_projects/project` natively inside WSL.
   `git` needed a one-time
   `git config --global --add safe.directory '<the UNC path>'` to trust this location
   (Git's "dubious ownership" protection for unusual paths).

2. **Never run `npm install` (or anything creating symlinks) from the Windows side
   against the `\\wsl.localhost\...` UNC path.** It fails with a corrupted, duplicated
   path segment (`Ubuntu-24.04\Ubuntu-24.04\...`) because Windows' symlink/junction
   handling breaks across that network bridge, and npm workspaces need real symlinks.
   **Always run Node/npm/Docker commands via `wsl.exe -- bash -lc 'cd
   /home/aabhinavvvvvvv/personal_projects/project && <command>'`** — the native Linux
   path — instead.

3. **Port 5432 can collide with a natively-installed `postgresql.service`** on this
   WSL distro (unrelated to this project — likely used by other local projects). If
   Prisma reports `P1000: Authentication failed` against a container you *know* has
   the right credentials (verify with `docker exec <container> psql -U <user> -d
   <db>`, which bypasses host networking entirely), check `ss -tln | grep 5432` for a
   competing listener. We resolved it by running
   `sudo systemctl stop postgresql && sudo systemctl disable postgresql` (run manually
   in a real terminal — this agent can't supply sudo passwords non-interactively).
   After freeing the port, Docker's own port-forwarding can be left in a stale state
   from when it was contending for the port — `docker compose down && docker compose
   up -d` to force it to rebind cleanly.

4. **`"type": "module"` in `package.json` is not inherited across workspaces.** It
   only applies to files under the directory tree of *that specific* `package.json`.
   Since `packages/db` (and every future `apps/*` workspace) has its own
   `package.json`, each one needs `"type": "module"` set independently for its
   TypeScript files to be correctly treated as ESM under our `NodeNext` module
   resolution setting.

5. **NodeNext ESM imports need the `.js` extension even for `.ts` files** — e.g.
   `import { prisma } from "./index.js"` in `packages/db/src/seed.ts`, even though the
   real file is `index.ts`. This is because the import path must match what the file
   will be named *after compilation*, not its current source extension. Looks wrong,
   is correct.

6. **Port 6379 has the exact same collision problem as port 5432 (#3), this time with
   a native `redis-server.service`.** Same symptom shape: a script reports success
   (worse here — Redis has no auth by default, so there's no error at all, it just
   silently writes to the wrong Redis instance) but nothing shows up in
   `docker exec <redis container> redis-cli keys "*"`. Same fix:
   `sudo systemctl stop redis-server && sudo systemctl disable redis-server`, then
   `docker compose down redis && docker compose up -d redis` to force a clean rebind.
   **Lesson: always verify a BullMQ/Redis operation actually landed in the container
   (`redis-cli keys` / `dbsize`) rather than trusting the script's own success
   message** — this class of bug produces no error at all, just silent divergence.

7. **`tsx watch` requires `watch` to be the first argument.** We initially wrote
   `tsx --env-file=.env watch src/index.ts`, which fails with
   `ERR_MODULE_NOT_FOUND: Cannot find module '.../apps/worker/watch'` — because with
   `watch` positioned after a flag, tsx no longer recognizes it as the watch-mode
   trigger and instead treats the literal string `"watch"` as the entry file to run.
   Correct order: `tsx watch --env-file=.env src/index.ts`.

## Design decisions worth remembering

- `Check.monitorId` foreign key uses `ON DELETE RESTRICT` (Prisma's default) — you
  cannot delete a `Monitor` while `Check` rows still reference it. Revisit this when
  we build monitor deletion in M2/M3 (probably want `ON DELETE CASCADE` instead, or an
  explicit "delete all checks first" step).
- Prisma generates UUIDs for `@default(uuid())` fields in JavaScript, client-side —
  not via a Postgres-level `DEFAULT` (e.g. `gen_random_uuid()`). Worth knowing since
  raw SQL inserts (bypassing Prisma) won't get an id for free.
