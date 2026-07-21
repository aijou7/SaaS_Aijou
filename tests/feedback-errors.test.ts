import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  FeedbackSubmissionError,
  genericFeedbackSubmissionError,
  getSafeFeedbackSubmissionMessage,
  isSafeFeedbackSubmissionError,
} from "../src/server/feedback-errors";

describe("feedback error safety", () => {
  test("allows only explicitly classified validation and rate-limit messages", () => {
    const cases = [
      ["RATE_LIMITED", "Terlalu banyak feedback. Coba lagi nanti."],
      ["TITLE_TOO_SHORT", "Judul minimal 3 karakter."],
      ["MESSAGE_TOO_SHORT", "Ceritakan detailnya minimal 10 karakter."],
    ] as const;

    for (const [code, expected] of cases) {
      const error = new FeedbackSubmissionError(code);
      assert.equal(isSafeFeedbackSubmissionError(error), true);
      assert.equal(getSafeFeedbackSubmissionMessage(error), expected);
    }
  });

  test("does not trust an arbitrary error with a safe-looking message", () => {
    const error = new Error("Judul minimal 3 karakter.");

    assert.equal(isSafeFeedbackSubmissionError(error), false);
    assert.equal(getSafeFeedbackSubmissionMessage(error), genericFeedbackSubmissionError);
  });

  test("redacts Prisma, configuration, and non-Error failures", () => {
    const failures = [
      Object.assign(new Error("Invalid prisma.feedback.create invocation at db.internal:5432"), {
        code: "P1001",
      }),
      new Error("RATE_LIMIT_SECRET or a strong AUTH_SECRET is required."),
      "database password leaked in thrown value",
      null,
    ];

    for (const failure of failures) {
      assert.equal(getSafeFeedbackSubmissionMessage(failure), genericFeedbackSubmissionError);
    }
  });
});
