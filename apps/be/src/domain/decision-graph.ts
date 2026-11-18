import {
  CategoryTag,
  CategoryTagSchema,
  DecisionObservation,
  GraphEdgeType,
  GraphNodeType,
  includesValue,
  RationaleStatus,
} from '@ggaddak/shared';
import { GraphPolicy } from '../config/policies.js';

import { z } from 'zod';

export const ObservationSchema = z.nativeEnum(DecisionObservation);
const text = z.string().trim().min(1).max(GraphPolicy.maxTextChars);
// Legacy observations remain readable; candidates still use DecisionObservation.
export const GraphObservation = {
  ...DecisionObservation,
  Adopted: 'adopted',
  Rejected: 'rejected',
} as const;
export type GraphObservation = (typeof GraphObservation)[keyof typeof GraphObservation];
export const GraphNodeSchema = z.object({
  id: z.string().trim().min(1),
  type: z.nativeEnum(GraphNodeType),
  summary: text,
  observation: z.nativeEnum(GraphObservation).nullable().optional(),
  rationaleStatus: z.nativeEnum(RationaleStatus).nullable().optional(),
  category: CategoryTagSchema.nullable().optional(),
  history: z
    .array(
      z.object({
        observation: ObservationSchema,
        summary: text,
        at: z.string().datetime({ offset: true }).nullable(),
      }),
    )
    .nullable()
    .optional(),
  assignee: z.string().trim().min(1).nullable().optional(),
  dueDate: z.string().trim().min(1).nullable().optional(),
});
export const GraphEdgeSchema = z.object({
  id: z.string().trim().min(1),
  type: z.nativeEnum(GraphEdgeType),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});
export const GraphSchema = z.object({
  summary: text,
  nodes: z.array(GraphNodeSchema).max(GraphPolicy.maxNodes),
  edges: z.array(GraphEdgeSchema).max(GraphPolicy.maxEdges),
  discussionProblems: z
    .array(z.object({ summary: text, nodeIds: z.array(z.string()), edgeIds: z.array(z.string()) }))
    .max(GraphPolicy.maxProblems),
});
export const VerificationSchema = z
  .object({
    valid: z.boolean(),
    issues: z
      .array(
        z.object({ message: text, nodeIds: z.array(z.string()), edgeIds: z.array(z.string()) }),
      )
      .max(GraphPolicy.maxVerificationIssues),
  })
  .refine(value => value.valid === (value.issues.length === 0), 'valid must agree with issues');
export interface GraphNode {
  id: string;
  type: GraphNodeType;
  summary: string;
  observation?: GraphObservation | null;
  rationaleStatus?: RationaleStatus | null;
  category?: CategoryTag | null;
  history?:
    | {
        observation: DecisionObservation;
        summary: string;
        at: string | null;
      }[]
    | null;
  assignee?: string | null;
  dueDate?: string | null;
}
export interface GraphEdge {
  id: string;
  type: GraphEdgeType;
  sourceId: string;
  targetId: string;
}
export interface DecisionGraph {
  summary: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  discussionProblems: { summary: string; nodeIds: string[]; edgeIds: string[] }[];
}

/** 추론 없이 관계로부터 계산할 수 있는 속성과 참조만 정리한다. */
export function normalizeGraph(graph: DecisionGraph): DecisionGraph {
  const nodes = new Set(graph.nodes.map(node => node.id));
  const conflicts = new Map<string, string>();
  const aliases = new Map<string, string>();
  const seenEdgeIds = new Set<string>();
  const duplicateEdgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (seenEdgeIds.has(edge.id)) duplicateEdgeIds.add(edge.id);
    seenEdgeIds.add(edge.id);
  }
  const edges = graph.edges.filter(edge => {
    if (edge.type !== GraphEdgeType.ConflictsWith || duplicateEdgeIds.has(edge.id)) return true;
    const key = JSON.stringify([edge.sourceId, edge.targetId].sort());
    const retainedId = conflicts.get(key);
    if (retainedId !== undefined) {
      aliases.set(edge.id, retainedId);
      return false;
    }
    conflicts.set(key, edge.id);
    return true;
  });
  const edgeIds = new Set(edges.map(edge => edge.id));
  return {
    ...graph,
    edges,
    nodes: graph.nodes.map(node => {
      if (node.type !== GraphNodeType.DecisionCandidate) return node;
      const alternatives = new Set(
        edges
          .filter(edge => edge.type === GraphEdgeType.HasAlternative && edge.sourceId === node.id)
          .map(edge => edge.targetId),
      );
      const hasRationale = edges.some(
        edge =>
          includesValue([GraphEdgeType.Supports, GraphEdgeType.Opposes], edge.type) &&
          (edge.targetId === node.id || alternatives.has(edge.targetId)),
      );
      return {
        ...node,
        rationaleStatus: hasRationale ? RationaleStatus.Stated : RationaleStatus.NotStated,
      };
    }),
    discussionProblems: graph.discussionProblems.map(problem => ({
      ...problem,
      nodeIds: problem.nodeIds.filter(id => nodes.has(id)),
      edgeIds: [...new Set(problem.edgeIds.map(id => aliases.get(id) ?? id))].filter(id =>
        edgeIds.has(id),
      ),
    })),
  };
}
export type Verification = z.infer<typeof VerificationSchema>;
export type LinkedGraphNode = GraphNode & {
  decisionId?: string;
  decisionVersion?: number;
  currentDecisionVersion?: number;
  stale?: boolean;
  suppressed?: boolean;
};
export interface GraphSession extends DecisionGraph {
  sessionId: string;
  inputMessageIds: string[];
  nodes: LinkedGraphNode[];
}
export interface GraphSnapshot {
  id: string;
  schemaVersion: 1;
  requestId: string;
  guildId: string;
  sessions: GraphSession[];
}

const allowed: Record<GraphEdgeType, Array<[GraphNode['type'][], GraphNode['type'][]]>> = {
  contains: [
    [[GraphNodeType.Topic], [GraphNodeType.Issue, GraphNodeType.DecisionCandidate]],
    [[GraphNodeType.Issue], [GraphNodeType.DecisionCandidate]],
  ],
  has_alternative: [[[GraphNodeType.DecisionCandidate], [GraphNodeType.Alternative]]],
  supports: [
    [[GraphNodeType.Rationale], [GraphNodeType.DecisionCandidate, GraphNodeType.Alternative]],
  ],
  opposes: [
    [[GraphNodeType.Rationale], [GraphNodeType.DecisionCandidate, GraphNodeType.Alternative]],
  ],
  triggers: [[[GraphNodeType.DecisionCandidate], [GraphNodeType.ActionItem]]],
  conflicts_with: [
    [
      [GraphNodeType.DecisionCandidate, GraphNodeType.Alternative],
      [GraphNodeType.DecisionCandidate, GraphNodeType.Alternative],
    ],
  ],
  depends_on: [
    [
      [GraphNodeType.DecisionCandidate, GraphNodeType.ActionItem],
      [GraphNodeType.DecisionCandidate, GraphNodeType.ActionItem],
    ],
  ],
};

export function graphIssues(graph: DecisionGraph): string[] {
  const issues: string[] = [];
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  if (nodes.size !== graph.nodes.length) issues.push('Duplicate node ID');
  if (new Set(graph.edges.map(edge => edge.id)).size !== graph.edges.length)
    issues.push('Duplicate edge ID');
  const identities = new Set<string>();
  for (const edge of graph.edges) {
    const source = nodes.get(edge.sourceId),
      target = nodes.get(edge.targetId);
    if (
      !source ||
      !target ||
      source === target ||
      !allowed[edge.type].some(([a, b]) => a.includes(source.type) && b.includes(target.type))
    )
      issues.push(
        `Invalid endpoints: ${edge.id}; type=${edge.type}; source=${source?.type ?? 'missing'}; target=${target?.type ?? 'missing'}; allowed=${allowed[edge.type].map(([a, b]) => `${a.join('|')} -> ${b.join('|')}`).join(', ')}`,
      );
    const endpoints =
      edge.type === GraphEdgeType.ConflictsWith
        ? [edge.sourceId, edge.targetId].sort()
        : [edge.sourceId, edge.targetId];
    const key = [edge.type, ...endpoints].join(':');
    if (identities.has(key)) issues.push(`Duplicate relation: ${edge.id}`);
    identities.add(key);
  }
  for (const node of graph.nodes) {
    if (node.type === GraphNodeType.DecisionCandidate) {
      const missing = [];
      if (!ObservationSchema.safeParse(node.observation).success)
        missing.push(`observation=${Object.values(DecisionObservation).join('|')}`);
      if (!node.rationaleStatus)
        missing.push(`rationaleStatus=${Object.values(RationaleStatus).join('|')}`);
      if (!node.category) missing.push(`category=${Object.values(CategoryTag).join('|')}`);
      if (!node.history?.length) missing.push('nonempty history');
      if (missing.length)
        issues.push(`Incomplete candidate: ${node.id}; required ${missing.join(', ')}`);
      const alternatives = new Set(
        graph.edges
          .filter(e => e.type === GraphEdgeType.HasAlternative && e.sourceId === node.id)
          .map(e => e.targetId),
      );
      const rationale = graph.edges.some(
        e =>
          includesValue([GraphEdgeType.Supports, GraphEdgeType.Opposes], e.type) &&
          (e.targetId === node.id || alternatives.has(e.targetId)),
      );
      if ((node.rationaleStatus === RationaleStatus.Stated) !== rationale)
        issues.push(`Inconsistent rationale status: ${node.id}`);
    }
    if (
      includesValue(
        [GraphNodeType.Alternative, GraphNodeType.Rationale, GraphNodeType.ActionItem],
        node.type,
      ) &&
      !graph.edges.some(edge => edge.sourceId === node.id || edge.targetId === node.id)
    )
      issues.push(`Unlinked node: ${node.id}`);
  }
  for (const problem of graph.discussionProblems) {
    if (
      problem.nodeIds.some(id => !nodes.has(id)) ||
      problem.edgeIds.some(id => !graph.edges.some(edge => edge.id === id))
    )
      issues.push('Invalid problem references');
  }
  return issues;
}
