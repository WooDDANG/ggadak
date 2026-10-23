import { PrismaClient } from '@prisma/client';
import { DecisionSchema } from '@ggaddak/shared';

const client = new PrismaClient({ datasources: { db: { url: 'file:' + process.argv[2] } } });
let cursor = '',
  checked = 0;
const invalid = [];
try {
  while (true) {
    const rows = await client.$queryRawUnsafe(
      'SELECT id,domainJson,version FROM Decision WHERE id>? ORDER BY id LIMIT 100',
      cursor,
    );
    if (!rows.length) break;
    for (const row of rows) {
      checked++;
      try {
        const value = JSON.parse(row.domainJson);
        if (
          value.id !== row.id ||
          !DecisionSchema.safeParse({ ...value, version: row.version }).success
        )
          invalid.push(row.id);
      } catch {
        invalid.push(row.id);
      }
    }
    cursor = rows.at(-1).id;
  }
  console.log(JSON.stringify({ checked, invalid }));
  if (invalid.length) process.exitCode = 1;
} finally {
  await client.$disconnect();
}
