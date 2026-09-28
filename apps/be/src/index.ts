import { createServer } from './server.js';
import { DecisionRepository } from './db.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const DB_PATH = process.env.DATABASE_PATH || './decisions.sqlite';

const repo = new DecisionRepository(DB_PATH);
const server = createServer(repo);

server.listen(PORT, () => {
  console.log(`[BE] Decision Tracker API running on http://localhost:${PORT}`);
});
