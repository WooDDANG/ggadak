import { DecisionRepository } from '../repositories/decision.repository.js';
import { appLogger } from './logger.js';

export function initDatabase(dbPath?: string): DecisionRepository {
  const path = dbPath || process.env.DATABASE_PATH || 'decisions.sqlite';
  const repo = new DecisionRepository(path);
  appLogger.info(`✌️ Database repository loaded (${path})`);
  return repo;
}
