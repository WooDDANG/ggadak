import React, { useState } from 'react';
import { DiscordSource } from '@ggaddak/shared';
import { ChevronDown, ChevronUp, MessageSquare, Sparkles, CornerDownRight } from 'lucide-react';

interface DiscordTranscriptViewerProps {
  source?: DiscordSource;
  rawTranscript?: string;
}

export const DiscordTranscriptViewer: React.FC<DiscordTranscriptViewerProps> = ({
  source,
  rawTranscript,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const rawMessages = source?.rawMessages || [];
  const hasMessages = rawMessages.length > 0 || Boolean(rawTranscript);

  if (!hasMessages) {
    return null;
  }

  // Consistent color for author avatar
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-indigo-600 text-indigo-100',
      'bg-emerald-600 text-emerald-100',
      'bg-blue-600 text-blue-100',
      'bg-purple-600 text-purple-100',
      'bg-amber-600 text-amber-100',
      'bg-rose-600 text-rose-100',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="mt-3 border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900/40">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
      >
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          <span>
            Discord 대화 원문 내역{' '}
            {rawMessages.length > 0 ? `(${rawMessages.length}개 메시지)` : ''}
          </span>
          {source?.channelName && (
            <span className="text-slate-400 font-normal">in #{source.channelName}</span>
          )}
        </div>
        <div className="flex items-center space-x-1 text-slate-400">
          <span className="text-[11px]">{isOpen ? '접기' : '상세보기'}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-4 border-t border-slate-700/40 bg-slate-950/70 space-y-3 max-h-96 overflow-y-auto font-sans">
          {rawMessages.length > 0 ? (
            rawMessages.map((msg: any, idx: number) => {
              const timeStr = msg.createdAt
                ? new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';
              const author = msg.author || '익명';
              const avatarLetter = author.charAt(0).toUpperCase();

              return (
                <div
                  key={msg.id || idx}
                  className={`p-2.5 rounded-xl transition ${
                    msg.isTrigger
                      ? 'bg-indigo-950/40 border border-indigo-500/40'
                      : 'hover:bg-slate-900/60 border border-transparent'
                  }`}
                >
                  {/* Replying info */}
                  {msg.replyingTo && (
                    <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 mb-1 ml-9">
                      <CornerDownRight className="w-3 h-3 text-slate-400" />
                      <span>답글 대상: {msg.replyingTo}</span>
                    </div>
                  )}

                  <div className="flex items-start space-x-2.5">
                    {/* Avatar */}
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${getAvatarColor(
                        author,
                      )}`}
                    >
                      {avatarLetter}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-200">{author}</span>
                        <span className="text-[10px] text-slate-400">{timeStr}</span>
                        {msg.isTrigger && (
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>합의 발화</span>
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap break-words leading-relaxed">
                        {msg.content}
                      </p>

                      {/* Emoji Reactions */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="flex items-center space-x-1.5 mt-2 flex-wrap gap-y-1">
                          {msg.reactions.map((rx: any, rIdx: number) => (
                            <span
                              key={rIdx}
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-800 border border-slate-700 text-slate-300"
                            >
                              <span>{rx.emoji}</span>
                              <span className="text-[10px] font-bold text-slate-400">
                                {rx.count}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
              {rawTranscript}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
