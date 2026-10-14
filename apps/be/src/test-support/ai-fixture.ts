import type { IAiAdapter } from '../adapters/ai.adapter.js';
import type { DecisionGraph, GraphNode, GraphEdge } from '../domain/decision-graph.js';

/** Converts existing fixed test records to graph fixtures, never used by production loaders. */
export function fixtureAiAdapter(fixture: {
  analyzeTranscript(
    transcript: string,
  ): Promise<{
    summary: string;
    decisions: Array<{
      topic: string;
      decision: string;
      rationale: string;
      title?: string;
      decisionContent?: string;
      categoryTag?: string;
      alternatives?: Array<{ option: string; reason: string }>;
      actionItems?: Array<{ task: string; assignee?: string; dueDate?: string }>;
    }>;
  }>;
}): IAiAdapter {
  return {
    async extractGraph(transcript) {
      const output = await fixture.analyzeTranscript(transcript);
      const nodes: GraphNode[] = [],
        edges: GraphEdge[] = [];
      const edge = (type: GraphEdge['type'], sourceId: string, targetId: string) =>
        edges.push({ id: 'e' + edges.length, type, sourceId, targetId });
      for (const [index, item] of output.decisions.entries()) {
        const topic = `t${index}`,
          candidate = `c${index}`;
        nodes.push({ id: topic, type: 'Topic', summary: item.topic });
        nodes.push({
          id: candidate,
          type: 'DecisionCandidate',
          summary: item.decisionContent ?? item.decision,
          category: (item.categoryTag ?? '기타') as GraphNode['category'],
          observation: 'agreed',
          rationaleStatus: item.rationale ? 'stated' : 'not_stated',
          history: [{ observation: 'agreed', summary: item.decision, at: null }],
        });
        edge('contains', topic, candidate);
        if (item.rationale) {
          const id = `r${index}`;
          nodes.push({ id, type: 'Rationale', summary: item.rationale });
          edge('supports', id, candidate);
        }
        for (const [i, alternative] of (item.alternatives ?? []).entries()) {
          const id = `a${index}-${i}`;
          nodes.push({ id, type: 'Alternative', summary: alternative.option, observation: null });
          edge('has_alternative', candidate, id);
          if (alternative.reason) {
            const reason = `ar${index}-${i}`;
            nodes.push({ id: reason, type: 'Rationale', summary: alternative.reason });
            edge('opposes', reason, id);
          }
        }
        for (const [i, action] of (item.actionItems ?? []).entries()) {
          const id = `task${index}-${i}`;
          nodes.push({
            id,
            type: 'ActionItem',
            summary: action.task,
            assignee: action.assignee ?? null,
            dueDate: action.dueDate ?? null,
          });
          edge('triggers', candidate, id);
        }
      }
      const value: DecisionGraph = {
        summary: output.summary || 'Fixture result',
        nodes,
        edges,
        discussionProblems: [],
      };
      return { value };
    },
    async verifyGraph() {
      return { value: { valid: true, issues: [] } };
    },
    async repairGraph() {
      throw new Error('Unexpected fixture repair');
    },
  };
}
