import { createLogger } from '@ggaddak/shared';
import { createServer } from './server.js';
import { DecisionRepository } from './db.js';

const logger = createLogger('BE');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const DB_PATH = process.env.DATABASE_PATH || './decisions.sqlite';

const repo = new DecisionRepository(DB_PATH);
const server = createServer(repo);

server.listen(PORT, () => {
  logger.info(`Decision Tracker Backend API listening on http://localhost:${PORT}`);
  logger.info(`Database connected at: ${DB_PATH}`);
});
