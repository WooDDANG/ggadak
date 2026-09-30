import React, { useState } from 'react';
import { ExternalFeedback } from '@ggaddak/shared';
import { MessageSquarePlus, UserCheck, Send } from 'lucide-react';
import { Badge } from '../../components/Badge';

interface FeedbackBoardProps {
  feedbacks: ExternalFeedback[];
  onSubmitFeedback: (feedback: ExternalFeedback) => Promise<void>;
  isLoading: boolean;
}

export const FeedbackBoard: React.FC<FeedbackBoardProps> = ({
  feedbacks,
  onSubmitFeedback,
  isLoading,
}) => {
  const [source, setSource] = useState<'교수' | '심사위원' | '팀원' | '인터뷰이'>('교수');
  const [detail, setDetail] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmitFeedback({
        id: `FB-${Date.now().toString().slice(-6)}`,
        source,
        detail: detail.trim() || undefined,
        content: content.trim(),
        channelId: 'global',
        createdAt: new Date().toISOString(),
      });
      setContent('');
      setDetail('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">외부 피드백 허브</h2>
        <p className="text-sm text-slate-400">
          교수님, 심사위원, 인터뷰이의 피드백을 기록해두면, AI가 팀 대화에서 의사결정을 추출할 때 해당 피드백과의 정합성을 자동 대조합니다.
        </p>
      </div>

      {/* Input Card */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 shadow-xl">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center space-x-2">
          <MessageSquarePlus className="w-4 h-4 text-indigo-400" />
          <span>새 외부 피드백 등록</span>
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">출처</label>
              <select
                value={source}
                onChange={e => setSource(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="교수">교수님 피드백</option>
                <option value="심사위원">심사위원 피드백</option>
                <option value="인터뷰이">사용자 / 인터뷰이</option>
                <option value="팀원">팀원 제안</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                세부 메모 (선택)
              </label>
              <input
                type="text"
                placeholder="예: 중간 발표 질의응답 2조"
                value={detail}
                onChange={e => setDetail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">피드백 내용</label>
            <textarea
              rows={3}
              placeholder="예: 학생용 요금제만으로는 B2B 수익성이 부족하니 학원 연계 모델을 검토할 것"
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !content.trim()}
              className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? '저장 중...' : '피드백 주입'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Feedback List */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
          등록된 피드백 목록 ({feedbacks.length}건)
        </h3>

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">피드백을 불러오는 중...</div>
        ) : feedbacks.length === 0 ? (
          <div className="p-8 text-center bg-slate-800/30 rounded-2xl border border-slate-800 text-slate-400 text-sm">
            등록된 외부 피드백이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {feedbacks.map(fb => (
              <div
                key={fb.id}
                className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 space-y-2 hover:border-slate-600 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <UserCheck className="w-4 h-4 text-indigo-400" />
                    <Badge variant="category">{fb.source}</Badge>
                    {fb.detail && <span className="text-xs text-slate-400 font-medium">({fb.detail})</span>}
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    {new Date(fb.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed pt-1">{fb.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
