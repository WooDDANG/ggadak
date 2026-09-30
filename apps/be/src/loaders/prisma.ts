import { PrismaClient } from '@prisma/client';
import { Container, Service } from 'typedi';
import { appLogger } from './logger.js';

@Service()
export class PrismaService extends PrismaClient {
  constructor() {
    super();
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
