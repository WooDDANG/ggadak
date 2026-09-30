import React from 'react';
import { Decision, ReviewAction } from '@ggaddak/shared';
import { Check, Clock, X, MessageSquare, AlertTriangle, ExternalLink } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { DiscordTranscriptViewer } from '../../components/DiscordTranscriptViewer';

interface ReviewQueueProps {
  decisions: Decision[];
  onReview: (id: string, action: ReviewAction) => Promise<void>;
  isLoading: boolean;
}

export const ReviewQueue: React.FC<ReviewQueueProps> = ({ decisions, onReview, isLoading }) => {
  const draftDecisions = decisions.filter(d => d.state === 'Draft' || d.state === 'Proposed');

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm">검토 대기 중인 안건을 불러오는 중입니다...</p>
      </div>
    );
  }

  if (draftDecisions.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-12 text-center max-w-2xl mx-auto my-12 backdrop-blur">
        <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
          <Check className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">검토 대기 중인 의사결정이 없습니다</h3>
        <p className="text-sm text-slate-400 mb-6">
          Discord 채널에서 📌 이모지를 달거나 합의 키워드(~합시다, 결정 등)가 나오면 AI가 자동으로 후보를 추출합니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-2">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">PM 검토 대기 큐</h2>
          <p className="text-sm text-slate-400">
            AI가 Discord 대화에서 추출한 결정 후보입니다. 검토 후 확정(Confirm), 보류(Defer), 또는 반려(Reject)하세요.
          </p>
        </div>
        <Badge variant="draft">{draftDecisions.length}건 대기 중</Badge>
      </div>

      <div className="grid grid-cols-1 gap-5">
        {draftDecisions.map(dec => (
          <div
            key={dec.id}
            className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl hover:border-slate-600 transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                  <Badge variant="category">{dec.categoryTag || '기타'}</Badge>
                  <Badge variant="draft">대기중</Badge>
                  {dec.isPivot && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      🚨 방향 전환 (Pivot)
                    </span>
                  )}
                  {dec.supersedesId && (
                    <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      대체 대상: {dec.supersedesId}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight pt-1">
                  {dec.title || dec.topic}
                </h3>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onReview(dec.id, { action: 'confirm' })}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition duration-150"
                  title="의사결정 확정"
                >
                  <Check className="w-4 h-4" />
                  <span>승인 (Confirm)</span>
                </button>
                <button
                  onClick={() => onReview(dec.id, { action: 'defer' })}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition duration-150"
                  title="추가 논의를 위해 보류"
                >
                  <Clock className="w-4 h-4" />
                  <span>보류 (Defer)</span>
                </button>
                <button
                  onClick={() => onReview(dec.id, { action: 'reject' })}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded-xl text-xs font-semibold transition duration-150"
                  title="결정 후보 반려 (동일 근거 재추출 방지)"
                >
                  <X className="w-4 h-4" />
                  <span>반려 (Reject)</span>
                </button>
              </div>
            </div>

            {/* Decision Content & Rationale */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  결정 내용
                </span>
                <p className="text-sm text-slate-200 leading-relaxed font-medium">
                  {dec.decisionContent || dec.decision}
                </p>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  결정 근거 및 배경
                </span>
                <p className="text-sm text-slate-300 leading-relaxed">{dec.rationale}</p>
              </div>
            </div>

            {/* Alternatives & Action items */}
            {dec.alternatives && dec.alternatives.length > 0 && (
              <div className="mb-3 text-xs">
                <span className="font-semibold text-slate-400 block mb-1">검토된 대안:</span>
                <ul className="list-disc list-inside space-y-0.5 text-slate-300 pl-1">
                  {dec.alternatives.map((alt, idx) => (
                    <li key={idx}>
                      <strong className="text-slate-200">{alt.option}:</strong> {alt.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Governance Evaluation Card */}
            {dec.governanceReason && (
              <div
                className={`mt-4 p-3 rounded-xl border text-xs flex items-start space-x-2.5 ${
                  dec.governancePassed
                    ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                    : 'bg-amber-950/30 border-amber-800/40 text-amber-300'
                }`}
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-bold">
                    거버넌스 합의 평가 (점수: {typeof dec.governanceScore === 'number' ? dec.governanceScore.toFixed(1) : 'N/A'}/4.0) —{' '}
                    {dec.governancePassed ? '합의 통과' : '주의/검토 필요'}:
                  </span>{' '}
                  {dec.governanceReason}
                </div>
              </div>
            )}

            {/* Discord Conversation Transcript */}
            <DiscordTranscriptViewer source={dec.source} rawTranscript={dec.rawTranscript} />

            {/* Footer Metadata */}
            <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center space-x-4">
                <span>추출 시각: {new Date(dec.createdAt).toLocaleString()}</span>
                {dec.source?.channelName && (
                  <span>채널: #{dec.source.channelName}</span>
                )}
              </div>
              {dec.source?.messageUrl && (
                <a
                  href={dec.source.messageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-1 text-indigo-400 hover:text-indigo-300 transition"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Discord 원본 보기</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
