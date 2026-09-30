import React, { useState } from 'react';
import { Decision } from '@ggaddak/shared';
import { CheckCircle2, AlertCircle, Archive, XCircle, Clock, ExternalLink } from 'lucide-react';
import { Badge } from '../../components/Badge';

interface DecisionTimelineProps {
  decisions: Decision[];
  isLoading: boolean;
}

export const DecisionTimeline: React.FC<DecisionTimelineProps> = ({ decisions, isLoading }) => {
  const [selectedState, setSelectedState] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const filtered = decisions.filter(d => {
    if (selectedState !== 'ALL' && d.state !== selectedState) return false;
    if (selectedCategory !== 'ALL' && d.categoryTag !== selectedCategory) return false;
    return true;
  });

  const getStatusBadge = (state: string) => {
    switch (state) {
      case 'Decided':
        return (
          <Badge variant="decided">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            확정됨
          </Badge>
        );
      case 'Superseded':
        return (
          <Badge variant="superseded">
            <Archive className="w-3 h-3 mr-1" />
            대체됨 (과거)
          </Badge>
        );
      case 'Deferred':
        return (
          <Badge variant="deferred">
            <Clock className="w-3 h-3 mr-1" />
            보류됨
          </Badge>
        );
      case 'Rejected':
        return (
          <Badge variant="rejected">
            <XCircle className="w-3 h-3 mr-1" />
            반려됨
          </Badge>
        );
      default:
        return (
          <Badge variant="draft">
            <AlertCircle className="w-3 h-3 mr-1" />
            검토대기
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm">의사결정 이력을 불러오는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">의사결정 히스토리 & 타임라인</h2>
          <p className="text-sm text-slate-400">
            팀의 모든 확정, 수정, 피벗 및 대체된 의사결정의 변경 이력을 추적합니다.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          <select
            value={selectedState}
            onChange={e => setSelectedState(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">모든 상태</option>
            <option value="Decided">확정됨 (Decided)</option>
            <option value="Draft">대기중 (Draft)</option>
            <option value="Deferred">보류됨 (Deferred)</option>
            <option value="Superseded">대체됨 (Superseded)</option>
            <option value="Rejected">반려됨 (Rejected)</option>
          </select>

          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">모든 카테고리</option>
            <option value="타깃">타깃</option>
            <option value="문제정의">문제정의</option>
            <option value="기능">기능</option>
            <option value="기술">기술</option>
            <option value="BM">BM</option>
            <option value="기타">기타</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          선택한 조건에 맞는 의사결정이 없습니다.
        </div>
      ) : (
        <div className="relative border-l border-slate-700/80 ml-4 md:ml-6 space-y-8 pb-8">
          {filtered.map(dec => (
            <div key={dec.id} className="relative pl-6 md:pl-8 group">
              {/* Timeline dot */}
              <div
                className={`absolute -left-3 top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center bg-slate-900 ${
                  dec.state === 'Decided'
                    ? 'border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/20'
                    : dec.state === 'Superseded'
                      ? 'border-slate-600 text-slate-500'
                      : dec.state === 'Rejected'
                        ? 'border-rose-500 text-rose-400'
                        : 'border-amber-500 text-amber-400'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    dec.state === 'Decided'
                      ? 'bg-emerald-500'
                      : dec.state === 'Superseded'
                        ? 'bg-slate-600'
                        : dec.state === 'Rejected'
                          ? 'bg-rose-500'
                          : 'bg-amber-500'
                  }`}
                />
              </div>

              {/* Card */}
              <div
                className={`rounded-2xl p-5 border transition-all duration-200 ${
                  dec.state === 'Superseded'
                    ? 'bg-slate-900/50 border-slate-800 opacity-60 hover:opacity-100'
                    : 'bg-slate-800/70 border-slate-700/80 shadow-md hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    {getStatusBadge(dec.state)}
                    <Badge variant="category">{dec.categoryTag || '기타'}</Badge>
                    {dec.isPivot && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        피벗
                      </span>
                    )}
                    {dec.supersedesId && (
                      <span className="text-xs text-slate-400">
                        ➔ 대체된 이전 안건: <strong className="text-slate-300">{dec.supersedesId}</strong>
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {new Date(dec.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="text-base font-bold text-white mb-2">{dec.title || dec.topic}</h3>

                <p className="text-sm text-slate-200 mb-3 leading-relaxed">
                  {dec.decisionContent || dec.decision}
                </p>

                <div className="text-xs text-slate-300 bg-slate-900/50 p-3 rounded-xl border border-slate-800 mb-3">
                  <strong className="text-slate-400 block mb-1">근거 및 합의 이유:</strong>
                  {dec.rationale}
                </div>

                {dec.actionItems && dec.actionItems.length > 0 && (
                  <div className="text-xs mb-3">
                    <span className="font-semibold text-slate-400 block mb-1">후속 액션 아이템:</span>
                    <div className="flex flex-wrap gap-2">
                      {dec.actionItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 text-slate-300"
                        >
                          📌 {item.task} {item.assignee && `(@${item.assignee})`}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-700/40">
                  <div className="flex items-center space-x-3">
                    <span>ID: <code className="text-slate-300">{dec.id}</code></span>
                    {dec.approvedBy && <span>승인자: {dec.approvedBy}</span>}
                  </div>
                  {dec.source?.messageUrl && (
                    <a
                      href={dec.source.messageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                    >
                      <span>원문</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
