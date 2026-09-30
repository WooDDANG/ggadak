import { IncomingMessage, ServerResponse } from 'node:http';
import { PolicyService } from '../services/policy.service.js';

export class PolicyController {
  constructor(private service: PolicyService) {}

  getPolicy(_req: IncomingMessage, res: ServerResponse): void {
    const policy = this.service.getPolicy();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(policy));
  }
}
