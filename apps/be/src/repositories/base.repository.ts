import { Prisma, PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../errors/AppError.js';

export class BaseRepository {
  constructor(public readonly prisma: PrismaClient) {}

  /** Reuse an explicit context; only the outer owner opens or commits a transaction. */
  async withTransaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    tx?: Prisma.TransactionClient,
  ): Promise<T> {
    return this.withPrismaErrors(() => (tx ? work(tx) : this.prisma.$transaction(work)));
  }

  protected async withPrismaErrors<T>(
    work: () => Promise<T>,
    requiresExisting = false,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictError('Record already exists');
        if (error.code === 'P2025' && requiresExisting) throw new NotFoundError();
        if (['P2028', 'P2034', 'P1008'].includes(error.code))
          throw new ConflictError('Concurrent write changed this record; reload before retrying');
      }
      throw error;
    }
  }
}
