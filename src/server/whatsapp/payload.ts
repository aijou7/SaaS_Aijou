export type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        messages?: WhatsAppIncomingMessage[];
        statuses?: WhatsAppDeliveryStatus[];
      };
    }>;
  }>;
};

export type WhatsAppDeliveryStatus = {
  id?: string;
  status?: "sent" | "delivered" | "read" | "failed" | string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{
    code?: number;
    title?: string;
    message?: string;
  }>;
};

export type WhatsAppIncomingMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: {
    body?: string;
  };
  image?: {
    id?: string;
    mime_type?: string;
    sha256?: string;
  };
};

export type ExtractedWhatsAppMessage = WhatsAppIncomingMessage & {
  businessIdentifiers: string[];
};

export function extractMessages(payload: WhatsAppWebhookPayload) {
  return (
    payload.entry?.flatMap((entry) =>
      entry.changes?.flatMap((change) => {
        const value = change.value;
        const businessIdentifiers = [
          value?.metadata?.phone_number_id,
          value?.metadata?.display_phone_number,
        ].filter(Boolean) as string[];

        return (
          value?.messages?.map((message) => ({
            ...message,
            businessIdentifiers,
          })) ?? []
        );
      }) ?? [],
    ) ?? []
  );
}

export function extractDeliveryStatuses(payload: WhatsAppWebhookPayload) {
  return (
    payload.entry?.flatMap((entry) =>
      entry.changes?.flatMap((change) => change.value?.statuses ?? []) ?? [],
    ) ?? []
  );
}

export function compactWhatsAppMessagePayload(message: ExtractedWhatsAppMessage) {
  return {
    channel: "WHATSAPP",
    direction: "INBOUND",
    providerMessageId: clean(message.id, 160),
    from: clean(message.from, 40),
    timestamp: clean(message.timestamp, 20),
    type: clean(message.type, 32),
    businessIdentifiers: message.businessIdentifiers
      .slice(0, 4)
      .map((value) => clean(value, 64))
      .filter(Boolean),
    text:
      message.type === "text" && message.text?.body
        ? { body: message.text.body.slice(0, 4_096) }
        : null,
    image:
      message.type === "image" && message.image
        ? {
            id: clean(message.image.id, 160),
            mimeType: clean(message.image.mime_type, 120),
            sha256: clean(message.image.sha256, 128),
          }
        : null,
  };
}

function clean(value: string | undefined, maxLength: number) {
  return value?.trim().slice(0, maxLength) || null;
}
