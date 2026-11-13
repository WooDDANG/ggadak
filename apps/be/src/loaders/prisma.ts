import { PrismaClient } from '@prisma/client';
import { Container, Service } from 'typedi';
import { appLogger } from './logger.js';

export function sqliteConnectionUrl(url: string): string {
  const [file, query] = url.split('?');
  const parameters = new URLSearchParams(query);
  // A second connection waiting for SQLite's writer can starve the open
  // interactive transaction on a single-CPU Prisma runtime. Queue in the pool.
  parameters.set('connection_limit', '1');
  return `${file}?${parameters}`;
}

@Service()
export class PrismaService extends PrismaClient {
  constructor() {
    super(
      process.env.DATABASE_URL
        ? {
            datasources: { db: { url: sqliteConnectionUrl(process.env.DATABASE_URL) } },
          }
        : undefined,
    );
  }

  async connect(): Promise<void> {
    await this.$connect();
    appLogger.info('✌️ Prisma Client connected to database');
  }

  async disconnect(): Promise<void> {
    await this.$disconnect();
  }
}

export function initPrisma(): PrismaService {
  const prismaService = Container.get(PrismaService);
  return prismaService;
}
