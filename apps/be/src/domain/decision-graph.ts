import {
  type CategoryTag,
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
      issues.push(`Invalid endpoints: ${edge.id}`);
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
      if (
        !ObservationSchema.safeParse(node.observation).success ||
        !node.rationaleStatus ||
        !node.category ||
        !node.history?.length
      )
        issues.push(`Incomplete candidate: ${node.id}`);
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
