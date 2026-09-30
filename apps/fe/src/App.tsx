import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ReviewAction, ExternalFeedback } from '@ggaddak/shared';
import { decisionsApi } from './api/decisions.api';
import { feedbacksApi } from './api/feedbacks.api';
import { Header } from './components/Header';
import { ReviewQueue } from './features/review-queue/ReviewQueue';
import { DecisionTimeline } from './features/decision-timeline/DecisionTimeline';
import { FeedbackBoard } from './features/feedback-board/FeedbackBoard';

export function App() {
  const [activeTab, setActiveTab] = useState<'review' | 'timeline' | 'feedback'>('review');
  const queryClient = useQueryClient();

  // 1. Fetch Decisions Query
  const {
    data: decisions = [],
    isLoading: isDecisionsLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['decisions'],
    queryFn: () => decisionsApi.getDecisions(),
    refetchInterval: 5000, // 5초 주기 폴링
  });

  // 2. Fetch Feedbacks Query
  const { data: feedbacks = [], isLoading: isFeedbacksLoading } = useQuery({
    queryKey: ['feedbacks'],
    queryFn: () => feedbacksApi.getFeedbacks(),
  });

  // 3. Review Action Mutation
  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: ReviewAction }) =>
      decisionsApi.reviewDecision(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decisions'] });
    },
  });

  // 4. Create Feedback Mutation
  const feedbackMutation = useMutation({
    mutationFn: (feedback: ExternalFeedback) => feedbacksApi.createFeedback(feedback),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedbacks'] });
    },
  });

  const handleReview = async (id: string, action: ReviewAction) => {
    await reviewMutation.mutateAsync({ id, action });
  };

  const handleCreateFeedback = async (feedback: ExternalFeedback) => {
    await feedbackMutation.mutateAsync(feedback);
  };

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
        {activeTab === 'review' && (
          <ReviewQueue
            decisions={decisions}
            onReview={handleReview}
            isLoading={isDecisionsLoading}
          />
        )}

        {activeTab === 'timeline' && (
          <DecisionTimeline decisions={decisions} isLoading={isDecisionsLoading} />
        )}

        {activeTab === 'feedback' && (
          <FeedbackBoard
            feedbacks={feedbacks}
            onSubmitFeedback={handleCreateFeedback}
            isLoading={isFeedbacksLoading}
          />
        )}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-400">
        GGADDAK Autonomous Decision Tracker & Governance Engine • NASA Architecture
      </footer>
    </div>
  );
}

export default App;
