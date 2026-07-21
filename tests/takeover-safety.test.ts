import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import {
  aiDeliverySuppressionReason,
  conversationClosedDeliveryReason,
  humanTakeoverDeliveryReason,
  isAiDeliveryBlocked,
  isHumanTakeoverActive,
  resolveTakeoverSafeAiReply,
  shouldSuppressAiDelivery,
} from "../src/server/conversations/takeover-safety";

describe("human takeover safety", () => {
  test("drops a completed AI reply when takeover became active", () => {
    assert.deepEqual(
      resolveTakeoverSafeAiReply("HUMAN_NEEDED", "OPEN", "stale AI reply"),
      { status: "HUMAN_NEEDED", reply: null, suppressed: true },
    );
    assert.deepEqual(
      resolveTakeoverSafeAiReply("OPEN", "OPEN", "fresh AI reply"),
      { status: "OPEN", reply: "fresh AI reply", suppressed: false },
    );
  });

  test("recognizes conversation states that block AI delivery", () => {
    assert.equal(isHumanTakeoverActive("HUMAN_NEEDED"), true);
    assert.equal(isHumanTakeoverActive("HUMAN_TAKEOVER"), true);
    assert.equal(isHumanTakeoverActive("CLOSED"), false);
    assert.equal(isHumanTakeoverActive("OPEN"), false);
    assert.equal(isAiDeliveryBlocked("HUMAN_NEEDED"), true);
    assert.equal(isAiDeliveryBlocked("CLOSED"), true);
    assert.equal(isAiDeliveryBlocked("OPEN"), false);
    assert.equal(shouldSuppressAiDelivery("AI", "HUMAN_NEEDED"), true);
    assert.equal(shouldSuppressAiDelivery("AI", "CLOSED"), true);
    assert.equal(shouldSuppressAiDelivery("USER", "HUMAN_NEEDED"), false);
    assert.equal(shouldSuppressAiDelivery("USER", "CLOSED"), false);
    assert.equal(shouldSuppressAiDelivery("AI", "OPEN"), false);
    assert.equal(humanTakeoverDeliveryReason, "human_takeover_active");
    assert.equal(conversationClosedDeliveryReason, "conversation_closed");
    assert.equal(aiDeliverySuppressionReason("CLOSED"), conversationClosedDeliveryReason);
    assert.equal(aiDeliverySuppressionReason("HUMAN_NEEDED"), humanTakeoverDeliveryReason);
  });

  test("keeps database race guards on finalization and both deliveries", async () => {
    const [conversations, telegram] = await Promise.all([
      readFile("src/server/conversations/conversations.ts", "utf8"),
      readFile("src/server/telegram/delivery.ts", "utf8"),
    ]);

    assert.match(conversations, /SELECT "status"[\s\S]+FOR UPDATE/);
    assert.match(conversations, /resolveTakeoverSafeAiReply\(/);
    assert.match(conversations, /tx\.whatsAppMessage\.create\(/);
    assert.match(conversations, /deliveryStatus: "SUPPRESSED"/);
    assert.match(
      conversations,
      /notIn: \[ConversationStatus\.HUMAN_NEEDED, ConversationStatus\.CLOSED\]/,
    );
    assert.match(
      conversations,
      /senderType: \{ in: \[SenderType\.AI, SenderType\.SYSTEM\] \}[\s\S]+deliveryStatus: "PENDING"/,
    );
    assert.match(conversations, /deliveryError: conversationClosedDeliveryReason/);
    assert.match(telegram, /deliveryStatus: "SUPPRESSED"/);
    assert.match(
      telegram,
      /notIn: \[ConversationStatus\.HUMAN_NEEDED, ConversationStatus\.CLOSED\]/,
    );
  });
});
