"""Explicit, backed-up SQLite operations. Check is read-only; upgrade needs --apply."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import shutil
import tempfile

root = Path(__file__).resolve().parents[3]
schema = root / 'apps/be/prisma/schema.prisma'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('operation', choices=['check', 'backup', 'backfill', 'upgrade'])
parser.add_argument('--database')
parser.add_argument('--backup-dir', default=str(root / '.data/backups/storage'))
parser.add_argument('--apply', action='store_true')
parser.add_argument('--batch-size', type=int, default=100)
args = parser.parse_args()
if args.batch_size < 1:
    parser.error('--batch-size must be positive')
url = os.environ.get('DATABASE_URL', '')
if not args.database and not url.startswith('file:'):
    parser.error('Select a SQLite database with --database or DATABASE_URL=file:...')
path = Path(args.database).resolve() if args.database else (schema.parent / url[5:].split('?')[0]).resolve()
if not path.is_file():
    parser.error('Selected database does not exist: ' + str(path))
db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)

def inspect():
    tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    applied = {row[0] for row in db.execute('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')} if '_prisma_migrations' in tables else set()
    migrations = sorted(p.name for p in (schema.parent / 'migrations').iterdir() if p.is_dir())
    missing = []
    for name, body in re.findall(r'model\s+(\w+)\s*\{([^}]+)\}', schema.read_text()):
        columns = {row[1] for row in db.execute('PRAGMA table_info("' + name + '")')}
        if name not in tables:
            missing.append(name)
        else:
            for field, kind in re.findall(r'^\s*(\w+)\s+(String|Int|Float|Boolean|DateTime)\??\s', body, re.M):
                if field not in columns:
                    missing.append(name + '.' + field)
    return {'database': str(path), 'pendingMigrations': [m for m in migrations if m not in applied], 'missingSchema': missing}

report = inspect()
if args.operation == 'check':
    print(json.dumps(report, ensure_ascii=False))
    raise SystemExit(1 if report['pendingMigrations'] or report['missingSchema'] else 0)
if args.operation in ['upgrade', 'backfill'] and not args.apply:
    print(json.dumps({**report, 'applied': False, 'next': 'Repeat upgrade with --apply to back up and migrate the selected DB.'}, ensure_ascii=False))
    raise SystemExit(0)
if args.operation == 'upgrade' and not report['pendingMigrations'] and not report['missingSchema']:
    print(json.dumps({**report, 'applied': False, 'alreadyCurrent': True}, ensure_ascii=False))
    raise SystemExit(0)
directory = Path(args.backup_dir).resolve()
directory.mkdir(parents=True, exist_ok=True, mode=0o700)
backup = directory / (datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.sqlite')
with sqlite3.connect(backup) as destination:
    db.backup(destination)
backup.chmod(0o600)
print(json.dumps({'database': str(path), 'backup': str(backup)}), flush=True)

def backfill():
    columns = {row[1] for row in db.execute('PRAGMA table_info(Decision)')}
    if 'domainJson' not in columns:
        raise RuntimeError('Apply the additive domain migration before backfill')
    if 'decisionSummary' not in columns:
        return {'migrated': 0, 'remaining': 0, 'alreadyContracted': True}
    sql = (schema.parent / 'migrations/202610170003_storage_data/migration.sql').read_text()
    start = sql.index('UPDATE Decision SET domainJson=json_object(')
    statement = sql[start:sql.index(';', start)].replace('WHERE domainJson IS NULL', 'WHERE id=? AND version=? AND updatedAt=? AND domainJson IS NULL')
    writer = sqlite3.connect(path, timeout=10)
    writer.row_factory = sqlite3.Row
    migrated, conflicts = 0, []
    cursor = ''
    while True:
        rows = writer.execute('SELECT * FROM Decision WHERE domainJson IS NULL AND id>? ORDER BY id LIMIT ?', (cursor, args.batch_size)).fetchall()
        if not rows:
            break
        with writer:
            for row in rows:
                changed = writer.execute(statement, (row['id'], row['version'], row['updatedAt'])).rowcount
                if not changed:
                    conflicts.append(row['id'])
                    continue
                value = json.loads(writer.execute('SELECT domainJson FROM Decision WHERE id=?', (row['id'],)).fetchone()[0])
                for key in ['evidenceHash', 'rawTranscript']:
                    if value.get(key) is None:
                        value.pop(key, None)
                if row['sourceJumpUrl']:
                    value['source']['messageUrl'] = row['sourceJumpUrl']
                if not value.get('topic') or not value.get('decision') or value.get('state') not in ['Draft', 'Proposed', 'Discussing', 'Decided', 'Deferred', 'Rejected', 'Superseded']:
                    raise RuntimeError('Cannot migrate Decision without inventing missing values: ' + row['id'])
                writer.execute('UPDATE Decision SET domainJson=? WHERE id=?', (json.dumps(value, ensure_ascii=False), row['id']))
                migrated += 1
        cursor = rows[-1]['id']
    remaining = writer.execute('SELECT count(*) FROM Decision WHERE domainJson IS NULL').fetchone()[0]
    writer.close()
    if conflicts:
        raise RuntimeError('Concurrent changes skipped; rerun backfill: ' + ','.join(conflicts))
    return {'migrated': migrated, 'remaining': remaining}

if args.operation == 'upgrade':
    # Deploy only additive prerequisites first. Keep data/contract gated by backfill validation.
    environment = {**os.environ, 'DATABASE_URL': 'file:' + str(path)}
    with tempfile.TemporaryDirectory(prefix='ggaddak-expand-') as temporary:
        staging = Path(temporary)
        shutil.copy2(schema, staging / 'schema.prisma')
        migrations = staging / 'migrations'
        migrations.mkdir()
        for entry in (schema.parent / 'migrations').iterdir():
            if entry.is_dir() and entry.name <= '202610170002_storage_expand':
                shutil.copytree(entry, migrations / entry.name)
            elif entry.is_file():
                shutil.copy2(entry, migrations / entry.name)
        subprocess.run(['node', 'apps/be/node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', str(staging / 'schema.prisma')], cwd=root, env=environment, check=True)
if args.operation in ['upgrade', 'backfill']:
    print(json.dumps(backfill()), flush=True)
if args.operation == 'upgrade':
    environment = {**os.environ, 'DATABASE_URL': 'file:' + str(path)}
    # Validate the full application contract while old columns still exist.
    subprocess.run(['node', 'apps/be/scripts/validate-storage.mjs', str(path)], cwd=root, env=environment, check=True)
    subprocess.run(['node', 'apps/be/scripts/prisma.mjs', 'migrate', 'deploy'], cwd=root, env=environment, check=True)
    result = inspect()
    print(json.dumps(result))
    if result['pendingMigrations'] or result['missingSchema']:
        raise SystemExit(1)
