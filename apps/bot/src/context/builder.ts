export interface RawMessageData {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date;
  referenceMessageId?: string;
  referenceAuthorName?: string;
}

export class DiscussionContextBuilder {
  static buildTranscript(messages: RawMessageData[]): string {
    const sorted = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return sorted
      .map(msg => {
        const timeStr = msg.createdAt.toISOString().replace('T', ' ').substring(0, 19);
        const replyTag = msg.referenceAuthorName ? ` (replying to ${msg.referenceAuthorName})` : '';
        return `[${timeStr}] ${msg.authorName}${replyTag}: ${msg.content.trim()}`;
      })
      .join('\n');
  }

  static extractParticipantHandles(messages: RawMessageData[]): string[] {
    const set = new Set<string>();
    for (const msg of messages) {
      if (msg.authorName) {
        set.add(msg.authorName);
      }
    }
    return Array.from(set);
  }
}
