import React from 'react';
import { Layers, ShieldCheck, RefreshCw } from 'lucide-react';

interface HeaderProps {
  activeTab: 'review' | 'timeline' | 'feedback';
  setActiveTab: (tab: 'review' | 'timeline' | 'feedback') => void;
  draftCount: number;
  onRefresh: () => void;
  isRefetching: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  draftCount,
  onRefresh,
  isRefetching,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-white tracking-tight">GGADDAK</span>
                <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                  Governance PM
                </span>
              </div>
              <p className="text-xs text-slate-400">Discord AI Decision & Governance Tracker</p>
            </div>
          </div>

          <nav className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('review')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 flex items-center space-x-2 ${
                activeTab === 'review'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>검토 대기 큐</span>
              {draftCount > 0 && (
                <span className="ml-1.5 px-2 py-0.5 text-xs font-bold rounded-full bg-amber-400 text-slate-900 animate-pulse">
                  {draftCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 flex items-center space-x-2 ${
                activeTab === 'timeline'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>의사결정 타임라인</span>
            </button>

            <button
              onClick={() => setActiveTab('feedback')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 flex items-center space-x-2 ${
                activeTab === 'feedback'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>외부 피드백</span>
            </button>
          </nav>

          <div className="flex items-center space-x-3">
            <button
              onClick={onRefresh}
              disabled={isRefetching}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/60 transition"
              title="데이터 새로고침"
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
            <a
              href="http://localhost:3001/api-docs"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-400 hover:text-indigo-300 transition"
            >
              Swagger API ↗
            </a>
          </div>
        </div>
      </div>
    </header>
  );
};
