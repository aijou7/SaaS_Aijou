import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  emptyInboxLiveState,
  getInboxPollDelayMs,
  inboxLiveStateChanged,
  isInboxLiveState,
} from "../src/lib/inbox-live";

describe("operator inbox live refresh helpers", () => {
  test("backs off quiet and failed polling without exceeding one minute", () => {
    assert.equal(getInboxPollDelayMs({ unchangedPolls: 0, failedPolls: 0 }), 4_000);
    assert.equal(getInboxPollDelayMs({ unchangedPolls: 1, failedPolls: 0 }), 8_000);
    assert.equal(getInboxPollDelayMs({ unchangedPolls: 20, failedPolls: 0 }), 30_000);
    assert.equal(getInboxPollDelayMs({ unchangedPolls: 0, failedPolls: 1 }), 5_000);
    assert.equal(getInboxPollDelayMs({ unchangedPolls: 0, failedPolls: 99 }), 60_000);
  });

  test("detects message, unread, and status changes while accepting only bounded payloads", () => {
    const unchanged = { ...emptyInboxLiveState };
    const newMessage = {
      ...unchanged,
      version: "2026-07-14 10:12:13.123456+00",
      conversationCount: 1,
      unreadCount: 1,
      humanNeededCount: 1,
    };

    assert.equal(inboxLiveStateChanged(unchanged, { ...unchanged }), false);
    assert.equal(inboxLiveStateChanged(unchanged, newMessage), true);
    assert.equal(
      inboxLiveStateChanged(unchanged, { ...unchanged, humanNeededCount: 1 }),
      true,
    );
    assert.equal(isInboxLiveState(newMessage), true);
    assert.equal(isInboxLiveState({ ...newMessage, unreadCount: -1 }), false);
    assert.equal(isInboxLiveState({ ...newMessage, version: "x".repeat(81) }), false);
  });
});
