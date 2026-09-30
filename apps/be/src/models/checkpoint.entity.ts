export interface CheckpointDbRow {
  channel_id: string;
  last_message_id: string;
  updated_at: string;
}

export interface CheckpointEntity {
  channelId: string;
  lastMessageId: string;
  updatedAt: string;
}
