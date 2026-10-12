"""Read-only inspection and explicit export of legacy SQLite records.
Never writes source files. Export destination must not exist; import never overwrites.
"""
import argparse
import json
import sqlite3
from pathlib import Path


def read_database(path):
    db = sqlite3.connect(f'{path.resolve().as_uri()}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    return db


def inspect(paths):
    snapshots = []
    checkpoint_snapshots = []
    for path in paths:
        with read_database(path) as db:
            tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
            table = 'Decision' if 'Decision' in tables else 'decisions' if 'decisions' in tables else None
            rows = {r['id']: dict(r) for r in db.execute(f'SELECT * FROM "{table}"')} if table else {}
            snapshots.append(rows)
            checkpoint_table = 'ChannelCheckpoint' if 'ChannelCheckpoint' in tables else 'channel_checkpoints' if 'channel_checkpoints' in tables else None
            checkpoint_snapshots.append({r['channelId'] if checkpoint_table == 'ChannelCheckpoint' else r['channel_id']: r['lastMessageId'] if checkpoint_table == 'ChannelCheckpoint' else r['last_message_id'] for r in db.execute(f'SELECT * FROM "{checkpoint_table}"')} if checkpoint_table else {})
            print(json.dumps({'path': str(path.resolve()), 'counts': {t: db.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0] for t in tables}}, ensure_ascii=False))
    collisions = set(snapshots[0]) & set(snapshots[1]) if len(snapshots) == 2 else set()
    # Different legacy schemas cannot safely be merged automatically.
    checkpoint_conflicts = [key for key in checkpoint_snapshots[0] if key in checkpoint_snapshots[1] and checkpoint_snapshots[0][key] != checkpoint_snapshots[1][key]] if len(checkpoint_snapshots) == 2 else []
    print(json.dumps({'collidingIdsRequireReview': sorted(collisions), 'conflictingCheckpointChannels': checkpoint_conflicts}))


def export(path, destination):
    if destination.exists():
        raise ValueError('Destination already exists; refusing overwrite')
    with read_database(path) as db:
        tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        records = {t: [dict(r) for r in db.execute(f'SELECT * FROM "{t}"')] for t in tables}
    destination.write_text(json.dumps({'source': str(path.resolve()), 'tables': records}, ensure_ascii=False, indent=2))


def backup(path, destination):
    if destination.exists():
        raise ValueError('Destination already exists; refusing overwrite')
    with read_database(path) as source, sqlite3.connect(destination) as target:
        source.backup(target)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['inspect', 'export', 'backup'])
    parser.add_argument('paths', type=Path, nargs='+')
    args = parser.parse_args()
    if args.operation == 'inspect':
        inspect(args.paths)
    elif len(args.paths) != 2:
        parser.error('export/backup needs source and new destination')
    elif args.operation == 'export':
        export(*args.paths)
    else:
        backup(*args.paths)
