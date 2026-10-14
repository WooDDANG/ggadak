import '../config/index.js';
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { SearchService } from '../services/search.service.js';

// Deliberately require an explicit database selection; this command never migrates it.
if (!process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL to the backed-up database selected for indexing');
const prisma = new PrismaClient();
try {
  const service = new SearchService(new DecisionRepository(prisma));
  const result = await service.backfill(process.argv[2]);
  console.log(`Indexed ${result.indexed} confirmed/historical decisions`);
} finally {
  await prisma.$disconnect();
}
