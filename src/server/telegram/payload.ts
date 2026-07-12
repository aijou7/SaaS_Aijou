export type TelegramUpdate = {
  update_id?: unknown;
  message?: unknown;
};

export type ExtractedTelegramMessage = {
  updateId: string;
  messageId: string;
  chatId: string;
  chatType: "private";
  text: string;
  senderId: string;
  displayName: string;
  username: string | null;
};

export function extractTelegramInboundMessage(
  update: TelegramUpdate,
): ExtractedTelegramMessage | null {
  const updateId = telegramInteger(update.update_id, false);
  const message = record(update.message);
  if (!updateId || !message) return null;

  const chat = record(message.chat);
  const sender = record(message.from);
  const messageId = telegramInteger(message.message_id, false);
  const chatId = telegramInteger(chat?.id, true);
  const senderId = telegramInteger(sender?.id, true);
  const text = typeof message.text === "string" ? message.text.trim() : "";

  // The beta connector intentionally handles private, human-authored text DMs
  // only. Group activity and bot messages are ignored to prevent reply loops.
  if (
    !chat ||
    chat.type !== "private" ||
    !messageId ||
    !chatId ||
    !sender ||
    sender.is_bot === true ||
    !senderId ||
    !text
  ) {
    return null;
  }

  const firstName = cleanName(sender.first_name);
  const lastName = cleanName(sender.last_name);
  const username = cleanUsername(sender.username);
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    (username ? `@${username}` : `Telegram ${senderId}`);

  return {
    updateId,
    messageId,
    chatId,
    chatType: "private",
    text: text.slice(0, 4_096),
    senderId,
    displayName: displayName.slice(0, 160),
    username,
  };
}

export function compactTelegramUpdate(message: ExtractedTelegramMessage) {
  return {
    channel: "TELEGRAM",
    direction: "INBOUND",
    updateId: message.updateId,
    messageId: message.messageId,
    chatId: message.chatId,
    sender: {
      id: message.senderId,
      displayName: message.displayName,
      username: message.username,
    },
  } as const;
}

export function telegramProviderMessageId(botId: string, updateId: string) {
  return `telegram:${normalizeTelegramChatId(botId)}:update:${normalizeUpdateId(updateId)}`;
}

export function normalizeTelegramChatId(value: string) {
  const trimmed = value.trim();
  return /^-?[1-9]\d{0,19}$/.test(trimmed) ? trimmed : "";
}

function normalizeUpdateId(value: string) {
  const trimmed = value.trim();
  return /^\d{1,20}$/.test(trimmed) ? trimmed : "invalid";
}

function telegramInteger(value: unknown, positiveOnly: boolean) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return "";
  if (positiveOnly ? value <= 0 : value < 0) return "";
  return String(value);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

function cleanUsername(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return /^[A-Za-z0-9_]{5,32}$/.test(cleaned) ? cleaned : null;
}
