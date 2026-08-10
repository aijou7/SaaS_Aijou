import { ConversationStatus } from "@/generated/prisma-beta/client";
import {
  emptyInboxLiveState,
  type InboxLiveState,
} from "@/lib/inbox-live";
import { prisma, withDatabaseRawReadRetry } from "@/lib/prisma";
import { activeWorkspaceAccessWhere } from "@/server/workspace-access";

type InboxLiveRow = InboxLiveState;

/**
 * A single indexed aggregate powers inbox polling. It intentionally avoids
 * loading message bodies or contact data; the full RSC page is refreshed only
 * after this cursor changes.
 */
export async function getInboxLiveState(userId: string): Promise<InboxLiveState> {
  const business = await prisma.business.findFirst({
    where: await activeWorkspaceAccessWhere(userId),
    select: { id: true },
  });

  if (!business) {
    return { ...emptyInboxLiveState };
  }

  return getInboxLiveStateForBusiness(business.id);
}

export async function getInboxLiveStateForBusiness(
  businessId: string,
): Promise<InboxLiveState> {
  const rows = await withDatabaseRawReadRetry(() => prisma.$queryRaw<InboxLiveRow[]>`
    SELECT
      COALESCE(MAX(conversation."lastMessageAt")::text, '') AS "version",
      COUNT(conversation.id)::int AS "conversationCount",
      COALESCE(SUM(conversation."unreadCount"), 0)::int AS "unreadCount",
      (COUNT(conversation.id) FILTER (WHERE conversation.status::text = ${ConversationStatus.OPEN}))::int AS "openCount",
      (COUNT(conversation.id) FILTER (WHERE conversation.status::text = ${ConversationStatus.HUMAN_NEEDED}))::int AS "humanNeededCount",
      (COUNT(conversation.id) FILTER (WHERE conversation.status::text = ${ConversationStatus.PENDING_CONFIRMATION}))::int AS "pendingConfirmationCount",
      (COUNT(conversation.id) FILTER (WHERE conversation.status::text = ${ConversationStatus.CLOSED}))::int AS "closedCount"
    FROM whatsapp_conversations AS conversation
    WHERE conversation."businessId" = ${businessId}
  `);

  return rows[0] ?? { ...emptyInboxLiveState };
}
