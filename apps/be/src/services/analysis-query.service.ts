import type { AnalysisStatus, AnalysisWorkflow } from '../domain/analysis-workflow.js';
import type { GraphSnapshot } from '../domain/decision-graph.js';
import { AppError, NotFoundError, ConflictError } from '../errors/AppError.js';
import { AuthError } from '../errors/AuthError.js';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { AnalysisRequestRepository } from '../repositories/analysis-request.repository.js';

/** Guild-scoped reads, independent of AI generation and execution leases. */
export class AnalysisQueryService {
  constructor(
    private readonly repo: DecisionRepository,
    private readonly requests = new AnalysisRequestRepository(repo),
  ) {}

  getCandidateHistory(decisionId: string) {
    return this.requests.history(decisionId);
  }

  private async scoped(requestId: string, guildId: string) {
    const row = await this.requests.get(requestId);
    if (!row) throw new NotFoundError('Analysis Request not found');
    if (row.guildId !== guildId) throw new AuthError('Analysis belongs to another guild', 403);
    return row;
  }

  async getStatus(requestId: string, guildId: string): Promise<AnalysisStatus> {
    const row = await this.scoped(requestId, guildId);
    const workflow: AnalysisWorkflow | null = row.workflowJson
      ? JSON.parse(row.workflowJson)
      : null;
    const error = row.errorJson ? JSON.parse(row.errorJson) : null;
    return {
      requestId,
      state: row.state,
      graphAvailable: Boolean(row.graphJson),
      retryable: error?.retryable ?? false,
      error,
      sessions:
        workflow?.sessions.map(s => ({
          sessionId: s.id,
          phase: s.phase,
          repairs: s.repairs,
          elapsedMs: s.elapsedMs,
          waitMs: s.waitMs ?? 0,
          logicalCalls: s.calls.length,
          attempts: s.attempts.length,
          inputTokens: s.attempts.reduce((n, a) => n + (a.inputTokens ?? 0), 0),
          outputTokens: s.attempts.reduce((n, a) => n + (a.outputTokens ?? 0), 0),
        })) ?? [],
    };
  }

  async getGraph(requestId: string, guildId: string): Promise<GraphSnapshot> {
    const row = await this.scoped(requestId, guildId);
    if (row.state === 'terminal') throw new AppError('Analysis failed validation', 422);
    if (row.state !== 'completed') throw new ConflictError('Analysis not completed');
    if (!row.graphJson) throw new NotFoundError('Graph unavailable for this legacy analysis');
    const snapshot: GraphSnapshot = JSON.parse(row.graphJson);
    const nodes = snapshot.sessions.flatMap(session => session.nodes);
    const versions = await this.repo.getDecisionVersions(
      nodes.flatMap(node => (node.decisionId ? [node.decisionId] : [])),
    );
    for (const node of nodes) {
      const version = node.decisionId ? versions.get(node.decisionId) : undefined;
      if (version !== undefined) {
        node.currentDecisionVersion = version;
        node.stale = version !== node.decisionVersion;
      }
    }
    return snapshot;
  }
}
