import { CleanMessageItem } from './tier1-filter.js';

export interface DisentangledThread<T = CleanMessageItem> {
  threadId: string;
  rootMessageId: string;
  channelId?: string;
  messages: T[];
  participants: string[];
  durationMs: number;
  syntheticReactions?: Record<string, number>;
}

export interface DisentangleOptions {
  channelId?: string;
  syntheticReactions?: Record<string, number>;
}

/**
 * Disentangles interleaved chat messages into distinct causal threads (Directed Forest).
 */
export function disentangleConversations(
  messages: CleanMessageItem[],
  options: DisentangleOptions = {},
): DisentangledThread[] {
  if (!messages || messages.length === 0) return [];

  // Sort chronologically
  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // 1. Merge burst utterances by the same author within 60s
  const burstMerged: CleanMessageItem[] = [];
  for (const m of sorted) {
    if (burstMerged.length === 0) {
      burstMerged.push({ ...m });
      continue;
    }

    const prev = burstMerged[burstMerged.length - 1];
    const prevTime = new Date(prev.createdAt).getTime();
    const currTime = new Date(m.createdAt).getTime();
    const timeDiff = currTime - prevTime;

    const isExplicitReply = Boolean(m.referenceMessageId || m.replyingTo);

    if (prev.author === m.author && timeDiff <= 60000 && !isExplicitReply) {
      // Merge into previous utterance
      prev.content = `${prev.content}\n${m.content}`;
      prev.reactionCount = (prev.reactionCount || 0) + (m.reactionCount || 0);
      if (m.reactions && m.reactions.length > 0) {
        prev.reactions = [...(prev.reactions || []), ...m.reactions];
      }
    } else {
      burstMerged.push({ ...m });
    }
  }

  // 2. Build graph edges (parent -> child)
  const parentOf = new Map<string, string>(); // childId -> parentId
  const hasChildren = new Set<string>(); // parentIds that have explicit children

  // Pass 2A: Identify explicit links (reply-to, same-author burst)
  for (let i = 0; i < burstMerged.length; i++) {
    const m = burstMerged[i];
    const explicitParent = m.referenceMessageId || m.replyingTo;

    if (explicitParent && burstMerged.some(msg => msg.id === explicitParent)) {
      parentOf.set(m.id, explicitParent);
      hasChildren.add(explicitParent);
      continue;
    }

    // Mention heuristic (if @mentioned user spoke in last 5 minutes)
    if (m.content.includes('@')) {
      const mTime = new Date(m.createdAt).getTime();
      for (let j = i - 1; j >= 0; j--) {
        const candidate = burstMerged[j];
        const cTime = new Date(candidate.createdAt).getTime();
        if (mTime - cTime <= 300000 && m.content.includes(`@${candidate.author}`)) {
          parentOf.set(m.id, candidate.id);
          hasChildren.add(candidate.id);
          break;
        }
      }
    }
  }

  // Pass 2B: Connect orphan messages within 2 minutes if they are not roots of other conversations
  for (let i = 1; i < burstMerged.length; i++) {
    const m = burstMerged[i];
    if (parentOf.has(m.id)) continue; // already has parent
    if (hasChildren.has(m.id)) continue; // is a root of an explicit thread, do not collapse into previous

    const prev = burstMerged[i - 1];
    const prevTime = new Date(prev.createdAt).getTime();
    const currTime = new Date(m.createdAt).getTime();

    if (currTime - prevTime <= 120000) {
      // Find the root/parent of prev
      let rootId = prev.id;
      while (parentOf.has(rootId)) {
        rootId = parentOf.get(rootId)!;
      }
      parentOf.set(m.id, rootId);
    }
  }

  // 3. Group by root ancestor (Connected Components)
  const componentMap = new Map<string, CleanMessageItem[]>();

  for (const m of burstMerged) {
    let rootId = m.id;
    while (parentOf.has(rootId)) {
      rootId = parentOf.get(rootId)!;
    }

    if (!componentMap.has(rootId)) {
      componentMap.set(rootId, []);
    }
    componentMap.get(rootId)!.push(m);
  }

  // 4. Construct DisentangledThread objects
  const threads: DisentangledThread[] = [];
  for (const [rootId, threadMsgs] of componentMap.entries()) {
    threadMsgs.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const participants = Array.from(new Set(threadMsgs.map(m => m.author)));
    const startTime = new Date(threadMsgs[0].createdAt).getTime();
    const endTime = new Date(threadMsgs[threadMsgs.length - 1].createdAt).getTime();

    threads.push({
      threadId: `thread-${rootId}`,
      rootMessageId: rootId,
      channelId: options.channelId,
      messages: threadMsgs,
      participants,
      durationMs: endTime - startTime,
      syntheticReactions: options.syntheticReactions,
    });
  }

  // Sort threads by earliest message time
  threads.sort(
    (a, b) =>
      new Date(a.messages[0].createdAt).getTime() - new Date(b.messages[0].createdAt).getTime(),
  );

  return threads;
}
