import {
  CategoryTag,
  DecisionSchema,
  DecisionState,
  GraphEdgeType,
  GraphNodeType,
  humanReactionCount,
  includesValue,
  type Decision,
} from '@ggaddak/shared';
import crypto from 'node:crypto';
import type { AnalyzeDiscussionParams } from '../domain/analysis.js';
import type { AnalysisSession } from '../domain/analysis-workflow.js';
import type { CandidateDraft } from '../domain/candidate-publication.js';
import { hash, stableJson } from '../domain/analysis-identity.js';
import { DecisionExtractorCore } from '../engine/extractor-core.js';

export function projectCandidates(
  session: AnalysisSession,
  params: AnalyzeDiscussionParams,
  core: DecisionExtractorCore,
): CandidateDraft[] {
  const graph = session.graph!;
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const evidenceMessages = session.messages.map(m => ({
    id: m.id,
    author: m.author,
    content: m.content,
    ...(m.createdAt ? { createdAt: m.createdAt } : {}),
    ...(m.replyingTo ? { replyingTo: m.replyingTo } : {}),
  }));
  const evidenceJson = stableJson({
    guildId: params.guildId ?? 'discord',
    channelId: params.channelId ?? 'channel',
    messages: evidenceMessages,
  });
  const evidenceHash = hash(JSON.parse(evidenceJson));
  const legacyHash = crypto
    .createHash('sha256')
    .update(session.messages.map(m => m.id).join('|'))
    .digest('hex');
  const participants = [...new Set(session.messages.map(m => m.author))];
  return graph.nodes
    .filter(n => n.type === GraphNodeType.DecisionCandidate)
    .map(node => {
      const related = (type: string) =>
        graph.edges
          .filter(e => e.type === type && e.sourceId === node.id)
          .map(e => byId.get(e.targetId)!);
      const alternatives = related(GraphEdgeType.HasAlternative);
      const targets = new Set([node.id, ...alternatives.map(n => n.id)]);
      const reasons = graph.edges
        .filter(
          e =>
            includesValue([GraphEdgeType.Supports, GraphEdgeType.Opposes], e.type) &&
            targets.has(e.targetId),
        )
        .map(e => byId.get(e.sourceId)!.summary);
      const rationale = [...new Set(reasons)].join('\n');
      const parents = graph.edges
        .filter(e => e.type === GraphEdgeType.Contains && e.targetId === node.id)
        .map(e => byId.get(e.sourceId)!);
      const topic =
        parents.find(n => n.type === GraphNodeType.Topic) ??
        graph.edges
          .filter(e => e.type === GraphEdgeType.Contains && parents.some(p => p.id === e.targetId))
          .map(e => byId.get(e.sourceId)!)
          .find(n => n.type === GraphNodeType.Topic);
      const actionItems = related(GraphEdgeType.Triggers).map(n => ({
        id: n.id,
        task: n.summary,
        ...(n.assignee ? { assignee: n.assignee } : {}),
        ...(n.dueDate ? { dueDate: n.dueDate } : {}),
      }));
      const governance = core.calculateGovernanceScore({
        participantCount: participants.length,
        reactionsCount: session.messages.reduce((n, m) => n + humanReactionCount(m), 0),
        rationale,
        actionItemsCount: actionItems.length,
        hasExternalFeedback: false,
      });
      const decisionId = (session.idMap['decision:' + node.id] ??= 'DEC-' + crypto.randomUUID());
      const decision: Decision = DecisionSchema.parse({
        id: decisionId,
        topic: topic?.summary ?? parents[0]?.summary ?? node.summary,
        title: node.summary,
        decision: node.summary,
        decisionContent: node.summary,
        rationale,
        rationaleStatus: node.rationaleStatus,
        observation: node.observation,
        alternatives: alternatives.map(n => ({
          id: n.id,
          option: n.summary,
          reason: graph.edges
            .filter(e => e.type === GraphEdgeType.Opposes && e.targetId === n.id)
            .map(e => byId.get(e.sourceId)!.summary)
            .join('\n'),
        })),
        actionItems,
        categoryTag: node.category ?? CategoryTag.Other,
        state: DecisionState.Draft,
        supersedesId: null,
        isPivot: false,
        approvedBy: null,
        decisionConfirmedDate: null,
        rawEvidence: session.messages.map(m => m.id),
        evidenceHash,
        rawTranscript: session.transcript,
        source: {
          guildId: params.guildId ?? 'discord',
          channelId: params.channelId ?? 'channel',
          channelName: params.channelName,
          triggerMessageId: params.triggerMessageId ?? session.messages[0].id,
          messageUrl: params.messageUrl,
          participants,
          rawMessages: evidenceMessages,
        },
        createdAt: new Date().toISOString(),
        governanceScore: governance.score,
        governanceReason: governance.reason,
        governancePassed: governance.score >= 3,
      });
      return { decision, evidenceJson, legacyHash, graphNodeId: node.id };
    });
}
