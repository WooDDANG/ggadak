Database authority and legacy migration
======================================

Use an explicit absolute `DATABASE_URL=file:/absolute/path/decisions.sqlite` for deployment. Prisma resolves the existing `file:./decisions.sqlite` relative to this schema directory, so the currently configured active file is `apps/be/prisma/decisions.sqlite`.

Read-only inspection on 2026-10-10 found 305 Decision rows and 5 ChannelCheckpoint rows in that active Prisma database; 7 decisions and 5 channel_checkpoints in `apps/be/decisions.sqlite`. Feedback/rejection tables in the active file were empty. No decision IDs collided. All 5 shared channel checkpoint boundaries differ and must be reviewed explicitly during import. No live files were changed.

Commands from the package directory:

```sh
npm run db:generate
DATABASE_URL=file:/absolute/new-or-migrated.sqlite npm run db:migrate
npm run db:inspect
```

For an existing Prisma-schema database created before migrations were checked in:

1. Back up to a NEW destination: `python3 scripts/legacy-database.py backup prisma/decisions.sqlite /absolute/backup.sqlite`.
2. Work on a backup copy first. Set `DATABASE_URL` to its absolute path.
3. `npm run db:baseline` marks the matching original schema migration applied; it does not run CREATE TABLE over existing tables.
4. `npm run db:migrate` adds nullable complete-domain JSON and review version fields, leaving legacy records intact.
5. Run restart/recovery checks on the copy before any separately authorized live migration.

For the older lowercase SQLite file:

```sh
python3 scripts/legacy-database.py export decisions.sqlite /absolute/new-export.json
DATABASE_URL=file:/absolute/new-target.sqlite npm run db:migrate
npm run build
node scripts/import-legacy.mjs /absolute/new-export.json file:/absolute/new-target.sqlite
```

Import is atomic, rejects colliding IDs and different existing checkpoint boundaries, and never replaces records. Inspect and resolve conflicts before retrying. Import a fresh isolated target first. Source paths are opened read-only. Backups/exports refuse existing destinations. The importer preserves original source, timestamps, tasks and transcript; completion remains unknown, and missing evidence/approval dates are not invented. Older Prisma rows lack tasks/source messages; these remain empty. Existing JSON records retain the full shared Decision model; relational columns support lookup and future transaction policies.
