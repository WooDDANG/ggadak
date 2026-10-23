import { QueryPolicy } from './config';
import { ExternalFeedback } from '@ggaddak/shared';
import { Dashboard } from './features/Dashboard';
import { dashboardQueryKey, loadDashboard } from './api/dashboard.api';
import { WhySearch } from './features/WhySearch';
import React, { useState } from 'react';
import { useQuery, useIsFetching, useQueryClient } from '@tanstack/react-query';

import { ChannelSettings } from './features/ChannelSettings';
import { AuthGate } from './features/AuthGate';
import { Header } from './components/Header';
import { ReviewQueuePage } from './features/review-queue/ReviewQueuePage';
import { DecisionBrowser } from './features/decision-timeline/DecisionBrowser';
import { FeedbackBoard } from './features/feedback-board/FeedbackBoard';
import { ManualSync } from './features/ManualSync';

export function App() {
  return <AuthGate>{guildId => <ServerApp key={guildId} guildId={guildId} />}</AuthGate>;
}

function ServerApp({ guildId }: { guildId: string }) {
  const [activeTab, setActiveTab] = useState<
    'review' | 'timeline' | 'feedback' | 'settings' | 'search' | 'sync' | 'dashboard'
  >('dashboard');
  const queryClient = useQueryClient();
  const isRefetching = useIsFetching() > 0;
  const summary = useQuery({
    queryKey: dashboardQueryKey(guildId),
    queryFn: () => loadDashboard(guildId),
    enabled: activeTab === 'review',
    refetchInterval: activeTab === 'review' ? QueryPolicy.reviewPollMs : false,
  });
  const draftCount = summary.data?.counts.inReview ?? 0;

  // 2. Fetch Feedbacks Query
  const { data: feedbacks = [], isLoading: isFeedbacksLoading } = useQuery({
    queryKey: ['feedbacks'],
    queryFn: () => Promise.resolve([] as ExternalFeedback[]),
    enabled: false,
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        draftCount={draftCount}
        onRefresh={() => void queryClient.refetchQueries({ type: 'active' })}
        isRefetching={isRefetching}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'search' && <WhySearch key={guildId} guildId={guildId} />}
        {activeTab === 'settings' && <ChannelSettings key={guildId} guildId={guildId} />}
        {activeTab === 'sync' && <ManualSync key={guildId} guildId={guildId} />}
        {activeTab === 'dashboard' && <Dashboard key={guildId} guildId={guildId} />}
        {activeTab === 'review' && <ReviewQueuePage key={guildId} guildId={guildId} />}

        {activeTab === 'timeline' && <DecisionBrowser guildId={guildId} />}

        {activeTab === 'feedback' && (
          <div>
            <p role="status">서버별 피드백 API 준비 중입니다.</p>
            <FeedbackBoard
              feedbacks={feedbacks}
              onSubmitFeedback={async () => {
                throw new Error('서버별 피드백 API 준비 중입니다.');
              }}
              isLoading={isFeedbacksLoading}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-400">
        GGADDAK Autonomous Decision Tracker & Governance Engine • NASA Architecture
      </footer>
    </div>
  );
}

export default App;
