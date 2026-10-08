export interface RawMessageItem {
  id: string;
  author: string;
  authorId?: string;
  content: string;
  createdAt: Date | string;
  isBot?: boolean;
  replyingTo?: string;
  referenceMessageId?: string;
  attachments?: string[];
  reactionCount?: number;
  reactions?: Array<{ emoji: string; count: number }>;
  isTrigger?: boolean;
}

export interface CleanMessageItem extends RawMessageItem {
  reactionCount: number;
}

export interface Tier1FilterResult {
  cleanMessages: CleanMessageItem[];
  syntheticReactions: Record<string, number>;
  filteredCount: number;
}

export const CONSENSUS_REGEX =
  /(~?합시다|~?합세|~?하자|~?하죠|~?해요|~?결정|~?확정|~?합의|~?채택|~?가시죠|~?가자|~?가요|~?진행할게요|~?완료|픽스|fix|agree|ok|ㅇㅋ|좋아요|찬성)/i;

const COMMAND_PREFIX_REGEX = /^[/!?.~-]/;

const CASUAL_EXCLAMATION_REGEX =
  /^(\s*(?:ㅋ+|ㅎ+|ㅠ+|ㅜ+|아|헐|대박|헐\s*대박|와|오|잉|앗|음|어|오호|아하|ㅠㅠ+|ㅜㅜ+|ㅋㅋ+|ㅎㅎ+)\s*)$/i;

const AGREEMENT_SHORT_REGEX =
  /^(\s*(?:ㅇㅋ|ㅇㅋㅇㅋ|좋아요|좋음|좋습니다|동의|동의합니다|굿|넵|네|찬성|찬성합니다|👍|콜|가시죠|오케이|ok|okay)\s*)$/i;

const URL_GLOBAL_REGEX = /(https?:\/\/[^\s]+)/g;

/**
 * Tier 1 Zero-Cost Rule Filtering & Synthetic Reaction Absorption Engine
 */
export function filterTier1Messages(messages: RawMessageItem[]): Tier1FilterResult {
  if (!messages || messages.length === 0) {
    return { cleanMessages: [], syntheticReactions: {}, filteredCount: 0 };
  }

  const syntheticReactions: Record<string, number> = {};
  const cleanMessages: CleanMessageItem[] = [];
  let filteredCount = 0;

  for (const m of messages) {
    // 1. Drop bot messages
    if (m.isBot) {
      filteredCount++;
      continue;
    }

    const trimmed = (m.content || '').trim();

    // 2. Drop command prefix messages (^[/!?.~-])
    if (COMMAND_PREFIX_REGEX.test(trimmed)) {
      filteredCount++;
      continue;
    }

    // 3. Drop pure casual chatter and empty exclamations
    if (CASUAL_EXCLAMATION_REGEX.test(trimmed)) {
      filteredCount++;
      continue;
    }

    // 4. Agreement short phrases: absorb as synthetic reaction into previous clean message
    if (AGREEMENT_SHORT_REGEX.test(trimmed)) {
      filteredCount++;
      if (cleanMessages.length > 0) {
        const lastMsg = cleanMessages[cleanMessages.length - 1];
        syntheticReactions[lastMsg.id] = (syntheticReactions[lastMsg.id] || 0) + 1;
        lastMsg.reactionCount = (lastMsg.reactionCount || 0) + 1;
      }
      continue;
    }

    // 5. Link & Attachment normalization
    let normalizedContent = trimmed;
    if (URL_GLOBAL_REGEX.test(normalizedContent)) {
      normalizedContent = normalizedContent.replace(URL_GLOBAL_REGEX, '[Link: $1]');
    }
    if (m.attachments && m.attachments.length > 0) {
      const attachTag = `[Attachment: ${m.attachments.join(', ')}]`;
      normalizedContent = normalizedContent ? `${normalizedContent} ${attachTag}` : attachTag;
    }

    // If message is completely empty even without attachments, drop it
    if (!normalizedContent) {
      filteredCount++;
      continue;
    }

    cleanMessages.push({
      ...m,
      content: normalizedContent,
      reactionCount: m.reactionCount || 0,
    });
  }

  return {
    cleanMessages,
    syntheticReactions,
    filteredCount,
  };
}
