import 'reflect-metadata';
import { config } from './config/index.js';
import { appLogger } from './loaders/logger.js';
import { createServer } from './server.js';

const server = await createServer();

server.listen(config.port, () => {
  appLogger.info(`
  ################################################
  🛡️  GGADDAK Decision Tracker API: ${config.port} 🛡️
  📦  Database: Prisma SQLite
  🤖  AI Provider: ${config.ai.provider}
  ################################################
  `);
});
