import { WhySearch } from './features/WhySearch';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ReviewAction, ExternalFeedback } from '@ggaddak/shared';
import { decisionsApi } from './api/decisions.api';
import { ChannelSettings } from './features/ChannelSettings';
import { AuthGate } from './features/AuthGate';
import { decisionsQueryKey } from './api/session';
import { Header } from './components/Header';
import { ReviewQueue } from './features/review-queue/ReviewQueue';
import { DecisionBrowser } from './features/decision-timeline/DecisionBrowser';
import { FeedbackBoard } from './features/feedback-board/FeedbackBoard';

export function App() { return <AuthGate>{guildId => <ServerApp key={guildId} guildId={guildId} />}</AuthGate>; }

function ServerApp({ guildId }: { guildId: string }) {
  const [activeTab, setActiveTab] = useState<'review' | 'timeline' | 'feedback' | 'settings' | 'search'>('review');
  const queryClient = useQueryClient();

  // 1. Fetch Decisions Query
  const {
    data: decisions = [],
    isLoading: isDecisionsLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: decisionsQueryKey(guildId),
    queryFn: () => decisionsApi.getDecisions({ guildId }),
    refetchInterval: 5000, // 5초 주기 폴링
  });

  // 2. Fetch Feedbacks Query
  const { data: feedbacks = [], isLoading: isFeedbacksLoading } = useQuery({
    queryKey: ['feedbacks'],
    queryFn: () => Promise.resolve([] as ExternalFeedback[]),
    enabled: false,
  });

  // 3. Review Action Mutation
  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: ReviewAction }) =>
      decisionsApi.reviewDecision(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: decisionsQueryKey(guildId) });
    },
  });

  const handleReview = async (id: string, action: ReviewAction) => { await reviewMutation.mutateAsync({ id, action }); };

  const draftCount = decisions.filter(d => d.state === 'Draft' || d.state === 'Proposed').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        draftCount={draftCount}
        onRefresh={() => refetch()}
        isRefetching={isRefetching}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'search' && <WhySearch key={guildId} guildId={guildId} />}
        {activeTab === 'settings' && <ChannelSettings key={guildId} guildId={guildId} />}
        {activeTab === 'review' && (
          <ReviewQueue
            decisions={decisions}
            onReview={handleReview}
            isLoading={isDecisionsLoading}
          />
        )}

        {activeTab === 'timeline' && (
          <DecisionBrowser guildId={guildId} />
        )}

        {activeTab === 'feedback' && (
          <div><p role="status">서버별 피드백 API 준비 중입니다.</p><FeedbackBoard
            feedbacks={feedbacks}
            onSubmitFeedback={async () => { throw new Error('서버별 피드백 API 준비 중입니다.'); }}
            isLoading={isFeedbacksLoading}
          /></div>
        )}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-400">
        GGADDAK Autonomous Decision Tracker & Governance Engine • NASA Architecture
      </footer>
    </div>
  );
}

export default App;
