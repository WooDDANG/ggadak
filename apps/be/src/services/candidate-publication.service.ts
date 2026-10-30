import { randomUUID } from 'node:crypto';
import { DecisionState, type Decision } from '@ggaddak/shared';
import { hash, stableJson } from '../domain/analysis-identity.js';
import type { CandidateDraft } from '../domain/candidate-publication.js';
import type { AnalyzeDiscussionParams, AnalyzeDiscussionResult } from '../domain/analysis.js';
import type { GraphSnapshot } from '../domain/decision-graph.js';
import { CandidatePublicationRepository } from '../repositories/candidate-publication.repository.js';

const normalizeContent = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ');
const matchesContent = (decision: Decision, content: string) =>
  normalizeContent(decision.decisionContent ?? decision.decision) === content ||
  normalizeContent(decision.decision) === content;
const evidenceIds = (json: string): string[] =>
  JSON.parse(json).messages.map((message: { id: string }) => message.id);

/** Candidate equivalence, rejection suppression and graph links are decided here. */
export class CandidatePublicationService {
  constructor(private readonly repository: CandidatePublicationRepository) {}

  publish(
    params: AnalyzeDiscussionParams,
    owner: string,
    result: AnalyzeDiscussionResult,
    drafts: CandidateDraft[],
    graph?: GraphSnapshot,
  ): Promise<AnalyzeDiscussionResult> {
    return this.repository.commit(params.requestId, owner, async store => {
      const decisions = new Map<string, Decision>();
      const graphNodes = new Map(
        graph?.sessions.flatMap(session => session.nodes).map(node => [node.id, node]),
      );
      // Load each channel once, then index shared evidence and newly published candidates.
      const channels = new Map<string, Map<string, Set<string>>>();
      for (const draft of drafts) {
        const graphNode = graphNodes.get(draft.graphNodeId ?? '');
        const content = normalizeContent(draft.decision.decisionContent ?? draft.decision.decision);
        const key = hash({
          guildId: draft.decision.source.guildId,
          evidence: draft.evidenceJson,
          content,
        });
        const identity = await store.identity(key);
        const legacy = identity
          ? []
          : await store.legacyCandidates(
              draft.decision.source.guildId,
              draft.decision.source.channelId,
              [draft.legacyHash, draft.decision.evidenceHash ?? ''],
            );
        const matchingLegacy = legacy.find(
          decision =>
            matchesContent(decision, content) &&
            stableJson(decision.source.rawMessages) ===
              stableJson(JSON.parse(draft.evidenceJson).messages),
        );
        const existing = identity ? await store.decision(identity.decisionId) : matchingLegacy;
        const rejected = legacy.filter(decision => decision.state === DecisionState.Rejected);
        const legacyRejected = !identity && (await store.rejectedEvidence(draft.legacyHash));
        const suppressLegacy =
          legacyRejected &&
          (rejected.length === 0 || rejected.some(decision => matchesContent(decision, content)));
        if (
          !params.isManualOverride &&
          (existing?.state === DecisionState.Rejected || suppressLegacy)
        ) {
          if (graphNode) graphNode.suppressed = true;
          continue;
        }
        const decision =
          existing ??
          (await store.createDecision({
            ...draft.decision,
            version: 1,
            actionItems: draft.decision.actionItems.map(item => ({
              ...item,
              id: item.id ?? randomUUID(),
              state: item.state ?? 'open',
            })),
          }));
        if (!identity) await store.createIdentity(key, decision, draft.evidenceJson, content);

        const { guildId, channelId } = decision.source;
        const scope = stableJson([guildId, channelId]);
        let index = channels.get(scope);
        if (!index) {
          index = new Map();
          for (const item of await store.identities(guildId, channelId))
            for (const messageId of evidenceIds(item.evidenceJson)) {
              const candidates = index.get(messageId) ?? new Set<string>();
              candidates.add(item.decisionId);
              index.set(messageId, candidates);
            }
          channels.set(scope, index);
        }
        const related = new Set<string>();
        for (const messageId of evidenceIds(draft.evidenceJson)) {
          const candidates = index.get(messageId) ?? new Set<string>();
          for (const id of candidates) if (id !== decision.id) related.add(id);
          candidates.add(decision.id);
          index.set(messageId, candidates);
        }
        const prior = await store.previousAnalyses([decision.id, ...related], params.requestId);
        await store.link(
          params.requestId,
          decision.id,
          [...related],
          [...new Set(prior.map(row => row.requestId))],
        );
        decisions.set(decision.id, decision);
        if (graphNode) {
          graphNode.decisionId = decision.id;
          graphNode.decisionVersion = decision.version ?? 1;
        }
      }
      return {
        result: JSON.parse(
          JSON.stringify({
            ...result,
            decisions: [...decisions.values()],
            found: decisions.size > 0,
          }),
        ) as AnalyzeDiscussionResult,
        graph,
      };
    });
  }
}
