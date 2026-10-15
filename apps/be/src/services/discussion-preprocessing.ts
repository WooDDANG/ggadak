import { filterTier1Messages, disentangleConversations, humanReactionCount } from '@ggaddak/shared';
import type { AnalyzeDiscussionParams } from '../domain/analysis.js';
import type { AnalysisWorkflow } from '../domain/analysis-workflow.js';
import type { AiSettings } from '../adapters/ai.adapter.js';
import { DecisionExtractorCore } from '../engine/extractor-core.js';

export function prepareAnalysis(
  params: AnalyzeDiscussionParams,
  settings: AiSettings,
  core = new DecisionExtractorCore(),
): AnalysisWorkflow {
  const clean = filterTier1Messages(
    params.rawMessages.map(m => ({
      ...m,
      author: m.author || 'unknown',
      content: m.content,
      createdAt: m.createdAt ?? '1970-01-01T00:00:00.000Z',
      isBot: m.isBot ?? false,
      reactionCount: humanReactionCount(m),
    })),
  );
  const threads = disentangleConversations(clean.cleanMessages, {
    channelId: params.channelId,
    syntheticReactions: clean.syntheticReactions,
  });
  const chunks = threads
    .flatMap(thread => core.sliceSessionWithTopicDrift(thread.messages, 30, 0.35))
    .filter(chunk => chunk.length);
  return {
    version: 1,
    settings: structuredClone(settings),
    skipped: chunks.length === 0,
    sessions: chunks.map((chunk, index) => {
      const originalIds = new Set(
        chunk.flatMap(m => m.originalMessages?.map(original => original.id) ?? [m.id]),
      );
      const messages = params.rawMessages.filter(m => originalIds.has(m.id));
      return {
        id: params.requestId + ':' + index,
        messages,
        transcript: messages
          .map(m =>
            JSON.stringify({
              id: m.id,
              author: m.author,
              content: m.content,
              createdAt: m.createdAt ?? null,
              replyingTo: m.replyingTo ?? null,
            }),
          )
          .join('\n'),
        phase: 'extract',
        feedback: [],
        repairs: 0,
        elapsedMs: 0,
        calls: [],
        attempts: [],
        idMap: {},
      };
    }),
  };
}
