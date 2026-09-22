/**
 * Convert the Markdown-style strong marker commonly produced by editors and
 * AI into WhatsApp's single-asterisk bold marker. Keep the content between
 * the markers intact, including punctuation and line breaks.
 */
export function normalizeWhatsAppFormatting(value: string) {
  return value.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "*$1*");
}
