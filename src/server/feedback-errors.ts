export const genericFeedbackSubmissionError =
  "Feedback belum tersimpan. Coba lagi sebentar.";

const publicFeedbackErrorMessages = {
  RATE_LIMITED: "Terlalu banyak feedback. Coba lagi nanti.",
  TITLE_TOO_SHORT: "Judul minimal 3 karakter.",
  MESSAGE_TOO_SHORT: "Ceritakan detailnya minimal 10 karakter.",
} as const;

export type FeedbackSubmissionErrorCode = keyof typeof publicFeedbackErrorMessages;

export class FeedbackSubmissionError extends Error {
  constructor(readonly code: FeedbackSubmissionErrorCode) {
    super(publicFeedbackErrorMessages[code]);
    this.name = "FeedbackSubmissionError";
  }
}

export function isSafeFeedbackSubmissionError(
  error: unknown,
): error is FeedbackSubmissionError {
  return (
    error instanceof FeedbackSubmissionError &&
    Object.hasOwn(publicFeedbackErrorMessages, error.code)
  );
}

export function getSafeFeedbackSubmissionMessage(error: unknown) {
  if (!isSafeFeedbackSubmissionError(error)) return genericFeedbackSubmissionError;
  return publicFeedbackErrorMessages[error.code];
}
