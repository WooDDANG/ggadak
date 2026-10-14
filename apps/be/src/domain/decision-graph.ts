import { z } from 'zod';
import { CategoryTagSchema } from '@ggaddak/shared';

export const ObservationSchema = z.enum(['proposed', 'agreed', 'withdrawn', 'unclear']);
const text = z.string().trim().min(1).max(10000);
export const GraphNodeSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['Topic', 'Issue', 'DecisionCandidate', 'Alternative', 'Rationale', 'ActionItem']),
  summary: text,
  observation: z
    .enum(['proposed', 'agreed', 'withdrawn', 'unclear', 'adopted', 'rejected'])
    .nullable()
    .optional(),
  rationaleStatus: z.enum(['stated', 'not_stated']).nullable().optional(),
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
  type: z.enum([
    'contains',
    'has_alternative',
    'supports',
    'opposes',
    'triggers',
    'conflicts_with',
    'depends_on',
  ]),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});
export const GraphSchema = z.object({
  summary: text,
  nodes: z.array(GraphNodeSchema).max(500),
  edges: z.array(GraphEdgeSchema).max(2000),
  discussionProblems: z
    .array(z.object({ summary: text, nodeIds: z.array(z.string()), edgeIds: z.array(z.string()) }))
    .max(500),
});
export const VerificationSchema = z
  .object({
    valid: z.boolean(),
    issues: z
      .array(
        z.object({ message: text, nodeIds: z.array(z.string()), edgeIds: z.array(z.string()) }),
      )
      .max(500),
  })
  .refine(value => value.valid === (value.issues.length === 0), 'valid must agree with issues');
export interface GraphNode {
  id: string;
  type: 'Topic' | 'Issue' | 'DecisionCandidate' | 'Alternative' | 'Rationale' | 'ActionItem';
  summary: string;
  observation?: 'proposed' | 'agreed' | 'withdrawn' | 'unclear' | 'adopted' | 'rejected' | null;
  rationaleStatus?: 'stated' | 'not_stated' | null;
  category?: '타깃' | '문제정의' | '기능' | '기술' | 'BM' | '기타' | null;
  history?:
    | {
        observation: 'proposed' | 'agreed' | 'withdrawn' | 'unclear';
        summary: string;
        at: string | null;
      }[]
    | null;
  assignee?: string | null;
  dueDate?: string | null;
}
export interface GraphEdge {
  id: string;
  type:
    | 'contains'
    | 'has_alternative'
    | 'supports'
    | 'opposes'
    | 'triggers'
    | 'conflicts_with'
    | 'depends_on';
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

const allowed: Record<string, Array<[GraphNode['type'][], GraphNode['type'][]]>> = {
  contains: [
    [['Topic'], ['Issue', 'DecisionCandidate']],
    [['Issue'], ['DecisionCandidate']],
  ],
  has_alternative: [[['DecisionCandidate'], ['Alternative']]],
  supports: [[['Rationale'], ['DecisionCandidate', 'Alternative']]],
  opposes: [[['Rationale'], ['DecisionCandidate', 'Alternative']]],
  triggers: [[['DecisionCandidate'], ['ActionItem']]],
  conflicts_with: [
    [
      ['DecisionCandidate', 'Alternative'],
      ['DecisionCandidate', 'Alternative'],
    ],
  ],
  depends_on: [
    [
      ['DecisionCandidate', 'ActionItem'],
      ['DecisionCandidate', 'ActionItem'],
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
      edge.type === 'conflicts_with'
        ? [edge.sourceId, edge.targetId].sort()
        : [edge.sourceId, edge.targetId];
    const key = [edge.type, ...endpoints].join(':');
    if (identities.has(key)) issues.push(`Duplicate relation: ${edge.id}`);
    identities.add(key);
  }
  for (const node of graph.nodes) {
    if (node.type === 'DecisionCandidate') {
      if (
        !ObservationSchema.safeParse(node.observation).success ||
        !node.rationaleStatus ||
        !node.category ||
        !node.history?.length
      )
        issues.push(`Incomplete candidate: ${node.id}`);
      const alternatives = new Set(
        graph.edges
          .filter(e => e.type === 'has_alternative' && e.sourceId === node.id)
          .map(e => e.targetId),
      );
      const rationale = graph.edges.some(
        e =>
          ['supports', 'opposes'].includes(e.type) &&
          (e.targetId === node.id || alternatives.has(e.targetId)),
      );
      if ((node.rationaleStatus === 'stated') !== rationale)
        issues.push(`Inconsistent rationale status: ${node.id}`);
    }
    if (
      ['Alternative', 'Rationale', 'ActionItem'].includes(node.type) &&
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
