"""Verify additive migrations on a SQLite backup; source is opened read-only."""
import pathlib
import sqlite3
import sys
import tempfile

source = pathlib.Path(sys.argv[1]).resolve()
root = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='ggaddak-decision-copy-') as directory:
    target = pathlib.Path(directory) / 'copy.sqlite'
    original = sqlite3.connect(f'file:{source}?mode=ro', uri=True)
    copy = sqlite3.connect(target)
    original.backup(copy)
    tables = [row[0] for row in original.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    snapshots = {}
    for table in tables:
        columns = [row[1] for row in original.execute(f'PRAGMA table_info("{table}")')]
        snapshots[table] = (columns, original.execute(f'SELECT * FROM "{table}" ORDER BY rowid').fetchall())
    original.close()
    columns = [row[1] for row in copy.execute('PRAGMA table_info(Decision)')]
    if 'domainJson' not in columns:
        copy.executescript((root / 'prisma/migrations/202610100002_domain/migration.sql').read_text())
    copy.executescript((root / 'prisma/migrations/202610120003_decision_read/migration.sql').read_text())
    copy.close()
    # Restart, then compare every original column across every original table.
    copy = sqlite3.connect(target)
    for table, (columns, rows) in snapshots.items():
        projection = ','.join('"'+column+'"' for column in columns)
        assert copy.execute(f'SELECT {projection} FROM "{table}" ORDER BY rowid').fetchall() == rows, table
    print(f'Preserved {len(snapshots["Decision"][1])} decisions; all original tables/columns unchanged after restart.')
    print('Lifecycle counts:', copy.execute('SELECT lifecycle, count(*) FROM Decision GROUP BY lifecycle').fetchall())
    copy.close()
