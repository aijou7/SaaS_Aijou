type ConversationReadSnapshot = {
  ownerLastReadAt: Date | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  capturedAt: Date;
};

/**
 * Claims one inbox snapshot and subtracts only the unread messages that were
 * visible in that snapshot. Matching the previous read cursor also prevents
 * two deferred callbacks for the same snapshot from subtracting twice.
 */
export function buildSnapshotSafeMarkReadMutation(snapshot: ConversationReadSnapshot) {
  return {
    where: {
      ownerLastReadAt: snapshot.ownerLastReadAt,
      unreadCount: { gte: snapshot.unreadCount },
    },
    data: {
      ownerLastReadAt: snapshot.lastMessageAt ?? snapshot.capturedAt,
      unreadCount: { decrement: snapshot.unreadCount },
    },
  };
}
