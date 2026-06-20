export type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        messages?: WhatsAppIncomingMessage[];
      };
    }>;
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
