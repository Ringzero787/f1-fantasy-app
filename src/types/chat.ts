export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  text: string;
  imageUrl?: string;
  replyTo?: {
    messageId: string;
    senderName: string;
    text: string; // truncated to 100 chars
  };
  reactions: Record<string, string[]>; // { "👍": ["uid1"], "😂": ["uid2"] }
  isDeleted?: boolean; // soft delete -> show "message deleted"
  editedAt?: Date;
  createdAt: Date;
}

export interface ChatReadReceipt {
  userId: string;
  lastReadAt: Date;
}
