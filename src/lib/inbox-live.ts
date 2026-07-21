export type InboxLiveState = {
  version: string;
  conversationCount: number;
  unreadCount: number;
  openCount: number;
  humanNeededCount: number;
  pendingConfirmationCount: number;
  closedCount: number;
};

export const emptyInboxLiveState: InboxLiveState = {
  version: "",
  conversationCount: 0,
  unreadCount: 0,
  openCount: 0,
  humanNeededCount: 0,
  pendingConfirmationCount: 0,
  closedCount: 0,
};

const activePollDelaysMs = [4_000, 8_000, 15_000, 30_000] as const;
const failedPollDelaysMs = [5_000, 10_000, 20_000, 40_000, 60_000] as const;

export function inboxLiveStateChanged(
  previous: InboxLiveState,
  next: InboxLiveState,
) {
  return (
    previous.version !== next.version ||
    previous.conversationCount !== next.conversationCount ||
    previous.unreadCount !== next.unreadCount ||
    previous.openCount !== next.openCount ||
    previous.humanNeededCount !== next.humanNeededCount ||
    previous.pendingConfirmationCount !== next.pendingConfirmationCount ||
    previous.closedCount !== next.closedCount
  );
}

export function getInboxPollDelayMs(params: {
  unchangedPolls: number;
  failedPolls: number;
}) {
  const failures = clampCounter(params.failedPolls);
  if (failures > 0) {
    return failedPollDelaysMs[
      Math.min(failures - 1, failedPollDelaysMs.length - 1)
    ];
  }

  const unchanged = clampCounter(params.unchangedPolls);
  return activePollDelaysMs[
    Math.min(unchanged, activePollDelaysMs.length - 1)
  ];
}

export function isInboxLiveState(value: unknown): value is InboxLiveState {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<InboxLiveState>;
  return (
    typeof candidate.version === "string" &&
    candidate.version.length <= 80 &&
    isSafeCount(candidate.conversationCount) &&
    isSafeCount(candidate.unreadCount) &&
    isSafeCount(candidate.openCount) &&
    isSafeCount(candidate.humanNeededCount) &&
    isSafeCount(candidate.pendingConfirmationCount) &&
    isSafeCount(candidate.closedCount)
  );
}

function isSafeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function clampCounter(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}
