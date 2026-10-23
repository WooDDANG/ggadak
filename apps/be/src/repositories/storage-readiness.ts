import { Prisma, type PrismaClient } from '@prisma/client';

/** Read-only schema validation, including tables reached only by background workers. */
export async function assertStorageReady(prisma: PrismaClient): Promise<void> {
  const missing: string[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const name = (model.dbName ?? model.name).replaceAll('"', '""');
    const columns = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `PRAGMA table_info("${name}")`,
    );
    const names = new Set(columns.map(column => column.name));
    if (!columns.length) missing.push(model.name);
    else
      for (const field of model.fields)
        if (field.kind !== 'object' && !names.has(field.dbName ?? field.name))
          missing.push(`${model.name}.${field.name}`);
  }
  if (missing.length)
    throw new Error(
      `Database schema missing: ${missing.join(', ')}. Back up the selected DB, then run npm run db:migrate --workspace=@ggaddak/be`,
    );
}
