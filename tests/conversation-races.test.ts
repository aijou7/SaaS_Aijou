import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { buildSnapshotSafeMarkReadMutation } from "../src/server/conversations/read-state";
import {
  isExactWebChatReply,
  webChatProviderMessageId,
} from "../src/server/web/chat-correlation";

describe("conversation race safety", () => {
  test("marks only the unread count visible in the claimed snapshot", () => {
    const previousReadAt = new Date("2026-07-22T01:00:00.000Z");
    const readThroughAt = new Date("2026-07-22T01:05:00.000Z");
    const mutation = buildSnapshotSafeMarkReadMutation({
      ownerLastReadAt: previousReadAt,
      lastMessageAt: readThroughAt,
      unreadCount: 4,
      capturedAt: new Date("2026-07-22T01:06:00.000Z"),
    });

    assert.deepEqual(mutation, {
      where: {
        ownerLastReadAt: previousReadAt,
        unreadCount: { gte: 4 },
      },
      data: {
        ownerLastReadAt: readThroughAt,
        unreadCount: { decrement: 4 },
      },
    });
    assert.equal(6 - mutation.data.unreadCount.decrement, 2);
  });

  test("correlates a pending web turn with only its exact AI reply", () => {
    const expected = webChatProviderMessageId("business-1", "visitor-1", "client-1");
    const unrelated = webChatProviderMessageId("business-1", "visitor-1", "client-2");

    assert.equal(
      isExactWebChatReply("AI", { inReplyToProviderMessageId: expected }, expected),
      true,
    );
    assert.equal(
      isExactWebChatReply("AI", { inReplyToProviderMessageId: unrelated }, expected),
      false,
    );
    assert.equal(
      isExactWebChatReply("USER", { inReplyToProviderMessageId: expected }, expected),
      false,
    );
    assert.notEqual(expected, unrelated);
  });

  test("keeps duplicate processing, lead recovery, and widget polling wired together", async () => {
    const [conversations, route, widget] = await Promise.all([
      readFile("src/server/conversations/conversations.ts", "utf8"),
      readFile("src/app/api/web-chat/route.ts", "utf8"),
      readFile("public/aijou-widget.js", "utf8"),
    ]);
    const duplicateLookup = conversations.slice(
      conversations.indexOf("async function findDuplicateCustomerMessageResult"),
      conversations.indexOf("async function findIdempotentOutgoingMessage"),
    );

    assert.match(duplicateLookup, /path: \["inReplyToProviderMessageId"\]/);
    assert.doesNotMatch(duplicateLookup, /createdAt:\s*\{\s*gte:/);
    assert.match(
      duplicateLookup,
      /processing:\s*duplicateMessage\.processingStatus === ProcessingStatus\.RECEIVED/,
    );
    assert.match(
      duplicateLookup,
      /if \(!result\.processing\) \{[\s\S]*queueLeadRefresh/,
    );
    assert.match(conversations, /data: \{ processingStatus: ProcessingStatus\.PROCESSED \}/);

    assert.match(route, /result\.processing\s*\? null/);
    assert.match(route, /pendingClientMessageId/);
    assert.match(route, /pendingResolved: chronological\.some\(isPendingReply\)/);
    assert.match(widget, /if \(data\.processing\)/);
    assert.match(widget, /if \(data\.pendingResolved\) clearPendingMessage\(\)/);
    assert.doesNotMatch(
      widget,
      /if \(data\.reply\) addBubble\("agent", data\.reply\);\s*delete state\.pendingMessage/,
    );
  });
});
