import { useId, useState } from 'react';
import type { GraphSession } from '../../api/generated/model';

type Props = {
  session: GraphSession;
  relation: string;
  selectedId: string | null;
  problemIndex: number | null;
  onSelect: (id: string) => void;
};
const types = ['Topic', 'Issue', 'Rationale', 'DecisionCandidate', 'Alternative', 'ActionItem'];
const colors: Record<string, string> = {
  Topic: '#38bdf8',
  Issue: '#fbbf24',
  Rationale: '#a78bfa',
  DecisionCandidate: '#34d399',
  Alternative: '#fb923c',
  ActionItem: '#f472b6',
};

export function GraphCanvas({ session, relation, selectedId, problemIndex, onSelect }: Props) {
  const [zoom, setZoom] = useState(1);
  const markerId = `graph-arrow-${useId().replace(/:/g, '')}`;
  const columns = types.filter(type => session.nodes.some(node => node.type === type));
  const positions = new Map<string, { x: number; y: number }>();
  columns.forEach((type, column) => {
    session.nodes
      .filter(node => node.type === type)
      .forEach((node, row) => {
        positions.set(node.id, { x: 40 + column * 300, y: 75 + row * 120 });
      });
  });
  const width = Math.max(640, columns.length * 300 + 40);
  const height = Math.max(300, ...[...positions.values()].map(point => point.y + 120));
  const visibleEdges = session.edges.filter(edge => !relation || edge.type === relation);
  const problem = problemIndex === null ? undefined : session.discussionProblems[problemIndex];
  const emphasizedEdges = new Set(problem?.edgeIds ?? []);
  const emphasizedNodes = new Set(problem?.nodeIds ?? []);
  if (selectedId) emphasizedNodes.add(selectedId);
  for (const edge of visibleEdges) {
    if (
      problem
        ? emphasizedEdges.has(edge.id)
        : edge.sourceId === selectedId || edge.targetId === selectedId
    ) {
      emphasizedEdges.add(edge.id);
      emphasizedNodes.add(edge.sourceId);
      emphasizedNodes.add(edge.targetId);
    }
  }
  const emphasizing = !!selectedId || !!problem;
  return (
    <section aria-label="분석 그래프 캔버스" className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => setZoom(value => Math.max(0.25, value - 0.25))}
          disabled={zoom <= 0.25}
        >
          축소
        </button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom(value => Math.min(3, value + 0.25))}
          disabled={zoom >= 3}
        >
          확대
        </button>
        <button type="button" onClick={() => setZoom(1)}>
          화면 맞춤
        </button>
        <span className="text-slate-400">스크롤로 이동 · 노드 클릭 또는 Tab과 Enter로 선택</span>
      </div>
      <div className="overflow-auto max-h-[65vh] rounded border border-slate-700 bg-slate-950">
        <svg
          aria-label="세션의 노드와 방향 관계"
          role="group"
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: `${zoom * 100}%`, minWidth: `${zoom * 640}px` }}
        >
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>
          {columns.map((type, index) => (
            <text key={type} x={40 + index * 300} y={35} fill={colors[type]} fontSize="15">
              {type}
            </text>
          ))}
          {visibleEdges.map((edge, index) => {
            const start = positions.get(edge.sourceId),
              finish = positions.get(edge.targetId);
            if (!start || !finish) return null;
            const forward = finish.x > start.x;
            const x1 = start.x + (forward ? 220 : 0),
              x2 = finish.x + (forward ? 0 : 220);
            const y1 = start.y + 36,
              y2 = finish.y + 36;
            // Curves keep backward, cyclic and same-column relations visible.
            const bend = 55 + (index % 5) * 14;
            const path =
              start.x === finish.x
                ? `M ${start.x + 220} ${y1} C ${start.x + 220 + bend} ${y1 - 70}, ${finish.x + 220 + bend} ${y2 + 70}, ${finish.x + 220} ${y2 + 8}`
                : `M ${x1} ${y1} C ${x1 + (forward ? bend : -bend)} ${y1}, ${x2 + (forward ? -bend : bend)} ${y2}, ${x2} ${y2}`;
            const active = emphasizedEdges.has(edge.id);
            return (
              <g key={edge.id} opacity={emphasizing && !active ? 0.18 : 1}>
                <title>{`${edge.sourceId} → ${edge.targetId}: ${edge.type}`}</title>
                <path
                  d={path}
                  fill="none"
                  stroke={active ? '#fbbf24' : '#64748b'}
                  strokeWidth={active ? 3 : 1.5}
                  markerEnd={`url(#${markerId})`}
                />
                <text
                  x={start.x === finish.x ? start.x + 230 + bend : (x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 8}
                  fill={active ? '#fde68a' : '#cbd5e1'}
                  fontSize="11"
                  textAnchor="middle"
                >
                  {edge.type}
                </text>
              </g>
            );
          })}
          {session.nodes.map(node => {
            const point = positions.get(node.id)!;
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${node.type}: ${node.summary}`}
                aria-pressed={selectedId === node.id}
                onClick={() => onSelect(node.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(node.id);
                  }
                }}
                className="cursor-pointer outline-none focus:stroke-white"
                opacity={emphasizing && !emphasizedNodes.has(node.id) ? 0.3 : 1}
              >
                <title>{`${node.id}\n${node.summary}`}</title>
                <rect
                  x={point.x}
                  y={point.y}
                  width="220"
                  height="76"
                  rx="8"
                  fill="#1e293b"
                  stroke={
                    selectedId === node.id || emphasizedNodes.has(node.id)
                      ? '#fbbf24'
                      : colors[node.type]
                  }
                  strokeWidth="2"
                />
                <text x={point.x + 10} y={point.y + 22} fill={colors[node.type]} fontSize="12">
                  {node.type}
                  {node.suppressed ? ' · 억제됨' : ''}
                </text>
                <text x={point.x + 10} y={point.y + 49} fill="#f1f5f9" fontSize="13">
                  {node.summary.slice(0, 18)}
                  {node.summary.length > 18 ? '…' : ''}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
